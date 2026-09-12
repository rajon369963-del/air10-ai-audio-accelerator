#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# AIR10 CI-Gated Release Pipeline
# Invariant: commit -> push -> wait for CI green -> verify -> only then tag/release
# ==============================================================================

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
  echo "Usage: ./scripts/ci-gated-release.sh <version> (e.g. 2.5.3)"
  exit 1
fi

echo "=== [1/6] Running Local Preflight Test Suite ==="
npm test
node --test tests/unit/test_version_consistency.test.js

echo "=== [2/6] Verifying Clean Git Working Tree ==="
if [ -n "$(git status --porcelain)" ]; then
  echo "Error: Working tree is dirty. Please commit or stash changes first."
  git status --short
  exit 1
fi

CURRENT_SHA=$(git rev-parse HEAD)
echo "Current HEAD commit: ${CURRENT_SHA}"

echo "=== [3/6] Verifying Remote Branch Synchronization ==="
git push origin main

echo "=== [4/6] Waiting for GitHub Actions CI to Trigger & Pass ==="
echo "Polling for run associated with commit ${CURRENT_SHA}..."
sleep 5

RUN_ID=""
for i in {1..15}; do
  RUN_ID=$(gh run list --commit "${CURRENT_SHA}" --limit 1 --json databaseId -q ".[0].databaseId" 2>/dev/null || true)
  if [ -n "${RUN_ID}" ] && [ "${RUN_ID}" != "null" ]; then
    break
  fi
  echo "Waiting for run to appear in GitHub Actions queue (attempt $i/15)..."
  sleep 3
done

if [ -z "${RUN_ID}" ] || [ "${RUN_ID}" == "null" ]; then
  echo "Error: No GitHub Actions CI run found for commit ${CURRENT_SHA}!"
  exit 1
fi

echo "Found CI Run ID: ${RUN_ID}. Watching execution to ensure 100% green status..."
gh run watch "${RUN_ID}" --exit-status

NODE22_STATUS=$(gh run view "${RUN_ID}" --json jobs -q ".jobs[] | select(.name | contains(\"Node 22\")) | .conclusion")
NODE24_STATUS=$(gh run view "${RUN_ID}" --json jobs -q ".jobs[] | select(.name | contains(\"Node 24\")) | .conclusion")

if [ "${NODE22_STATUS}" != "success" ] || [ "${NODE24_STATUS}" != "success" ]; then
  echo "Error: CI did not pass cleanly! Node 22: ${NODE22_STATUS}, Node 24: ${NODE24_STATUS}"
  exit 1
fi
echo "Verified: Both Node 22 and Node 24 matrix jobs passed with conclusion success!"

echo "=== [5/6] Packaging Release Zip, Checksum, SBOM & Running Truth Guard ==="
ZIP_NAME="AIR10_AI_Audio_Accelerator_v${VERSION}.zip"
zip -r "${ZIP_NAME}" manifest.json injector.js background.js modules icons
SHA256=$(shasum -a 256 "${ZIP_NAME}" | awk '{print $1}')
echo "${SHA256}  ${ZIP_NAME}" > "${ZIP_NAME}.sha256"
echo "Asset: ${ZIP_NAME} | SHA-256: ${SHA256}"

node -e "
  const fs = require('fs');
  const pkg = require('./package.json');
  const sbom = {
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: pkg.name,
    documentNamespace: 'https://github.com/rajon369963-del/air10-ai-audio-accelerator/sbom/' + pkg.version,
    creationInfo: {
      created: new Date().toISOString(),
      creators: ['Tool: AIR10-SBOM-Generator-v2.5.3']
    },
    packages: [
      {
        name: pkg.name,
        SPDXID: 'SPDXRef-Package-AIR10',
        versionInfo: pkg.version,
        declaredLicense: 'MIT',
        productionDependenciesCount: 0
      }
    ]
  };
  fs.writeFileSync('sbom.spdx.json', JSON.stringify(sbom, null, 2));
"

if command -v air10-truth-guard >/dev/null 2>&1; then
  air10-truth-guard "${ZIP_NAME}"
fi

echo "=== [6/6] Tagging and Publishing CI-Gated GitHub Release ==="
TAG_NAME="v${VERSION}"
git tag -a "${TAG_NAME}" -m "Release ${TAG_NAME}: CI-gated on commit ${CURRENT_SHA} (Run ${RUN_ID})"
git push origin "${TAG_NAME}"

gh release create "${TAG_NAME}" "${ZIP_NAME}" "${ZIP_NAME}.sha256" "sbom.spdx.json" \
  --title "${TAG_NAME}: AIR10 AI Audio Accelerator (CI-Gated & Verified)" \
  --notes "CI-Gated Release: All matrix jobs verified green on GitHub Actions (Run ${RUN_ID}) before release creation. Asset SHA-256: ${SHA256}"

echo "=== SUCCESS: ${TAG_NAME} released and published after verified green CI! ==="
