#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# AIR10 Release Integrity Court & CI-Gated Pipeline (v2.5.3+)
# Invariant Equation: tested commit = packaged bytes = tag = release asset = checksum = provenance
# ==============================================================================

echo "=== [1/8] Verifying Branch & Version Orbit Alignment ==="

# 1. Assert current branch is strictly 'main'
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "${CURRENT_BRANCH}" != "main" ]; then
  echo "Error: Release must be initiated strictly from 'main' branch (currently on '${CURRENT_BRANCH}')!"
  exit 1
fi
echo "Branch Invariant: Verified on branch 'main'"

# 2. Hard-equal version assertions across source files
PKG_VERSION=$(node -p "require('./package.json').version")
MANIFEST_VERSION=$(node -p "require('./manifest.json').version")

if [ "${PKG_VERSION}" != "${MANIFEST_VERSION}" ]; then
  echo "Error: Version mismatch between package.json (${PKG_VERSION}) and manifest.json (${MANIFEST_VERSION})!"
  exit 1
fi

CLI_ARG_VERSION="${1:-}"
if [ -n "${CLI_ARG_VERSION}" ]; then
  # Strip leading 'v' if present
  REQ_VERSION="${CLI_ARG_VERSION#v}"
  if [ "${REQ_VERSION}" != "${PKG_VERSION}" ]; then
    echo "Error: CLI VERSION argument (${REQ_VERSION}) does not match source files version (${PKG_VERSION})!"
    exit 1
  fi
fi
VERSION="${PKG_VERSION}"
TAG_NAME="v${VERSION}"
echo "Version Invariant: Hard-matched VERSION=${VERSION} across package.json and manifest.json"

echo "=== [2/8] Running Local Preflight Test Suite & Production Deps Audit ==="
npm test
node --test tests/unit/test_version_consistency.test.js

# Assert production dependencies are strictly zero
PROD_DEPS_COUNT=$(node -p "Object.keys(require('./package.json').dependencies || {}).length")
if [ "${PROD_DEPS_COUNT}" -ne 0 ]; then
  echo "Error: Production dependencies count is ${PROD_DEPS_COUNT}; must be 0 (dependencies: {})!"
  exit 1
fi

# Run npm audit omitting dev to assert 0 client-facing vulnerabilities
npm audit --omit=dev
echo "Dependencies Invariant: 0 production dependencies (dependencies: {}) verified"

echo "=== [3/8] Verifying Clean Working Tree & Remote Main Synchronization ==="
if [ -n "$(git status --porcelain)" ]; then
  echo "Error: Working tree is dirty. Please commit or stash all changes before releasing!"
  git status --short
  exit 1
fi

git push origin main
LOCAL_SHA=$(git rev-parse HEAD)
REMOTE_SHA=$(git rev-parse origin/main)
if [ "${LOCAL_SHA}" != "${REMOTE_SHA}" ]; then
  echo "Error: Local HEAD (${LOCAL_SHA}) does not match remote origin/main (${REMOTE_SHA})!"
  exit 1
fi
echo "Remote Synchronization: Local HEAD (${LOCAL_SHA}) matches origin/main"

echo "=== [4/8] Waiting for Exact CI Workflow on Commit ${LOCAL_SHA} ==="
echo "Polling for 'ci.yml' workflow run on main branch for commit ${LOCAL_SHA}..."
sleep 3

RUN_ID=""
for i in {1..20}; do
  RUN_ID=$(gh run list --workflow ci.yml --branch main --commit "${LOCAL_SHA}" --limit 1 --json databaseId -q ".[0].databaseId" 2>/dev/null || true)
  if [ -n "${RUN_ID}" ] && [ "${RUN_ID}" != "null" ]; then
    break
  fi
  echo "Waiting for CI run to appear in queue (attempt $i/20)..."
  sleep 3
done

if [ -z "${RUN_ID}" ] || [ "${RUN_ID}" == "null" ]; then
  echo "Error: No GitHub Actions CI run found for workflow 'ci.yml' on commit ${LOCAL_SHA}!"
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

echo "=== [5/8] Deterministic Packaging from Immutable Git Tree (Zero TOCTOU Gap) ==="
ZIP_NAME="AIR10_AI_Audio_Accelerator_v${VERSION}.zip"
CHECKSUM_FILE="${ZIP_NAME}.sha256"
SBOM_FILE="sbom.spdx.json"

# Clean stale archives to eliminate contamination
rm -f "${ZIP_NAME}" "${CHECKSUM_FILE}" "${SBOM_FILE}"

# Package directly from the immutable tested commit tree (git archive)
git archive --format=zip -o "${ZIP_NAME}" "${LOCAL_SHA}" manifest.json injector.js background.js modules icons
echo "Packaging Invariant: Created ${ZIP_NAME} directly from immutable Git tree at ${LOCAL_SHA}"

# Safe single-quote awk checksum calculation (no shell expansion bug)
SHA256=$(shasum -a 256 "${ZIP_NAME}" | awk '{print $1}')
echo "${SHA256}  ${ZIP_NAME}" > "${CHECKSUM_FILE}"
echo "Asset: ${ZIP_NAME} | SHA-256: ${SHA256}"

# Generate SPDX 2.3 SBOM manifest
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
  fs.writeFileSync('${SBOM_FILE}', JSON.stringify(sbom, null, 2));
"

echo "=== [6/8] Mandatory Truth Guard Assertion (Fail-Closed) ==="
if ! command -v air10-truth-guard >/dev/null 2>&1; then
  echo "Error: Mandatory 'air10-truth-guard' executable not found! Failing closed to preserve provenance invariant."
  exit 1
fi
air10-truth-guard "${ZIP_NAME}"
echo "Truth Guard Invariant: Physical asset verified and confirmed on disk."

echo "=== [7/8] Tagging and Publishing CI-Gated GitHub Release ==="
# Verify or create tag
if git rev-parse "${TAG_NAME}" >/dev/null 2>&1; then
  EXISTING_TAG_SHA=$(git rev-parse "${TAG_NAME}^{commit}" 2>/dev/null || git rev-parse "${TAG_NAME}")
  if [ "${EXISTING_TAG_SHA}" != "${LOCAL_SHA}" ]; then
    echo "Warning: Local tag ${TAG_NAME} points to ${EXISTING_TAG_SHA}, updating to current commit ${LOCAL_SHA}..."
    git tag -a -f "${TAG_NAME}" -m "Release ${TAG_NAME}: CI-gated on commit ${LOCAL_SHA} (Run ${RUN_ID})"
    git push origin "${TAG_NAME}" --force
  fi
else
  git tag -a "${TAG_NAME}" -m "Release ${TAG_NAME}: CI-gated on commit ${LOCAL_SHA} (Run ${RUN_ID})"
  git push origin "${TAG_NAME}"
fi

if gh release view "${TAG_NAME}" >/dev/null 2>&1; then
  echo "Release ${TAG_NAME} already exists; updating assets with clobber..."
  gh release upload "${TAG_NAME}" "${ZIP_NAME}" "${CHECKSUM_FILE}" "${SBOM_FILE}" --clobber
  gh release edit "${TAG_NAME}" --notes "CI-Gated Release: All matrix jobs verified green on GitHub Actions (Run ${RUN_ID}) before release creation. Immutable Git tree packaging SHA-256: ${SHA256}"
else
  gh release create "${TAG_NAME}" "${ZIP_NAME}" "${CHECKSUM_FILE}" "${SBOM_FILE}" \
    --title "${TAG_NAME}: AIR10 AI Audio Accelerator (CI-Gated & Verified)" \
    --notes "CI-Gated Release: All matrix jobs verified green on GitHub Actions (Run ${RUN_ID}) before release creation. Immutable Git tree packaging SHA-256: ${SHA256}"
fi

echo "=== [8/8] Post-Release Cryptographic Readback Verification ==="
# 1. Assert remote tag points to LOCAL_SHA
echo "Reading back remote tag commit..."
REMOTE_TAG_SHA=$(git ls-remote --tags origin "refs/tags/${TAG_NAME}^{}" | awk '{print $1}')
if [ -z "${REMOTE_TAG_SHA}" ]; then
  REMOTE_TAG_SHA=$(git ls-remote --tags origin "refs/tags/${TAG_NAME}" | awk '{print $1}')
fi

echo "Remote Tag Commit : ${REMOTE_TAG_SHA}"
echo "Local Tested SHA  : ${LOCAL_SHA}"
if [ "${REMOTE_TAG_SHA}" != "${LOCAL_SHA}" ]; then
  echo "Error: Remote tag ${TAG_NAME} points to ${REMOTE_TAG_SHA}, expected ${LOCAL_SHA}!"
  exit 1
fi
echo "Verified: Remote tag ${TAG_NAME} cryptographically points to tested commit ${LOCAL_SHA}!"

# 2. Assert remote asset download matches local SHA-256
echo "Downloading and computing remote asset digest..."
REMOTE_DIGEST=$(curl -sL "https://github.com/rajon369963-del/air10-ai-audio-accelerator/releases/download/${TAG_NAME}/${ZIP_NAME}" | shasum -a 256 | awk '{print $1}')
echo "Remote Asset SHA-256 : ${REMOTE_DIGEST}"
echo "Local Package SHA-256: ${SHA256}"
if [ "${REMOTE_DIGEST}" != "${SHA256}" ]; then
  echo "Error: Remote asset digest mismatch! Remote: ${REMOTE_DIGEST}, Local: ${SHA256}"
  exit 1
fi
echo "Verified: Remote asset digest cryptographically matches local package SHA-256 (${REMOTE_DIGEST})!"

echo ""
echo "========================================================================"
echo "🎉 SUCCESS: Release ${TAG_NAME} fully verified via Release Integrity Court!"
echo "Equation Proven: tested commit (${LOCAL_SHA}) = packaged bytes = tag (${TAG_NAME}) = release asset = checksum (${SHA256}) = provenance"
echo "========================================================================"
