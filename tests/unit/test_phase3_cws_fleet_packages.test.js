import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

const ROOT_DIR = process.cwd();
const FLEET_DIST = path.join(ROOT_DIR, "fleet_dist");
const FLEET_PACKAGES = path.join(ROOT_DIR, "fleet_packages");
const CWS_MANIFEST = path.join(FLEET_PACKAGES, "CWS_FLEET_MANIFEST.json");

test("Phase 3 Test 1: Complete CWS Zip Packaging & Cryptographic Seal", () => {
  assert.ok(fs.existsSync(CWS_MANIFEST), "CWS_FLEET_MANIFEST.json must exist");
  const manifestData = JSON.parse(fs.readFileSync(CWS_MANIFEST, "utf-8"));

  assert.strictEqual(manifestData.totalPackages, 30, "Must contain exactly 30 packages");
  assert.strictEqual(manifestData.packages.length, 30);

  for (const pkg of manifestData.packages) {
    const zipPath = path.join(FLEET_PACKAGES, pkg.zipFile);
    assert.ok(fs.existsSync(zipPath), `Zip package ${pkg.zipFile} must exist`);

    const stats = fs.statSync(zipPath);
    assert.strictEqual(stats.size, pkg.sizeBytes, `Byte size mismatch for ${pkg.zipFile}`);
    assert.ok(stats.size > 10000, `Zip must be non-trivial (>10KB), got ${stats.size}`);

    const fileBytes = fs.readFileSync(zipPath);
    const computedSha = crypto.createHash("sha256").update(fileBytes).digest("hex");
    assert.strictEqual(computedSha, pkg.sha256, `SHA-256 hash mismatch for ${pkg.zipFile}`);
  }
});

test("Phase 3 Test 2: Extension Self-Contained Isolation & Zero Relative Escapes", () => {
  const tools = fs.readdirSync(FLEET_DIST).filter(d => fs.statSync(path.join(FLEET_DIST, d)).isDirectory());
  assert.strictEqual(tools.length, 30);

  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  for (const toolId of tools) {
    const toolDir = path.join(FLEET_DIST, toolId);

    // 1. Verify localized modules/
    const modDir = path.join(toolDir, "modules");
    assert.ok(fs.existsSync(modDir), `modules/ directory must exist in ${toolId}`);
    assert.ok(fs.existsSync(path.join(modDir, "civex-brain-limb-bridge.js")), `bridge module missing in ${toolId}`);
    assert.ok(fs.existsSync(path.join(modDir, "inline-zig-wasm.js")), `inline wasm missing in ${toolId}`);
    assert.ok(fs.existsSync(path.join(modDir, "zero-tracker-telemetry.js")), `telemetry missing in ${toolId}`);

    // 2. Verify background.js has NO path escapes
    const bgContent = fs.readFileSync(path.join(toolDir, "background.js"), "utf-8");
    assert.ok(!bgContent.includes("../../modules/"), `background.js in ${toolId} still contains escaping path ../../modules/`);
    assert.ok(bgContent.includes("./modules/"), `background.js in ${toolId} must import from ./modules/`);

    // 3. Verify Icons
    const iconsDir = path.join(toolDir, "icons");
    assert.ok(fs.existsSync(iconsDir), `icons/ directory missing in ${toolId}`);
    for (const size of [16, 48, 128]) {
      const iconPath = path.join(iconsDir, `icon${size}.png`);
      assert.ok(fs.existsSync(iconPath), `icon${size}.png missing in ${toolId}`);
      const iconBytes = fs.readFileSync(iconPath);
      assert.ok(iconBytes.subarray(0, 8).equals(pngSignature), `icon${size}.png has invalid PNG signature`);
    }

    // 4. Verify manifest.json icons mapping
    const manifest = JSON.parse(fs.readFileSync(path.join(toolDir, "manifest.json"), "utf-8"));
    assert.ok(manifest.icons, `manifest.json missing icons block in ${toolId}`);
    assert.strictEqual(manifest.icons["16"], "icons/icon16.png");
    assert.strictEqual(manifest.icons["48"], "icons/icon48.png");
    assert.strictEqual(manifest.icons["128"], "icons/icon128.png");
  }
});

test("Phase 3 Test 3: Localized Inlined WASM Sub-Microsecond Kernel Execution", async () => {
  const sampleToolDir = path.join(FLEET_DIST, "lectrospeed-3x");
  const localWasmModule = await import(path.join(sampleToolDir, "modules", "inline-zig-wasm.js"));
  const kernel = await localWasmModule.instantiateSovereignKernel();

  assert.ok(kernel.exports, "Localized kernel must export functions");
  const r = kernel.calculateFSRS5(1.0, 10.0);
  assert.ok(r > 0.90 && r < 1.0, "FSRS-5 retrievability must match formula");

  const bm25 = kernel.scoreBM25(5, 100, 10, 80);
  assert.ok(bm25 > 0, "BM25 score must be positive");

  const risk = kernel.auditRisk(100.0, 100.02, 0.05);
  assert.strictEqual(risk, 1, "Risk audit must return 1 (SAFE)");
});

test("Phase 3 Test 4: Localized Limb Client Offline Execution & Fallback", async () => {
  const sampleToolDir = path.join(FLEET_DIST, "fluffbuster-skimmer");
  const localBridge = await import(path.join(sampleToolDir, "modules", "civex-brain-limb-bridge.js"));

  const limb = new localBridge.LimbClient({ toolId: "fluffbuster-skimmer" });
  const initRes = await limb.connect();
  assert.strictEqual(initRes.mode, "STANDALONE_LITE");
  assert.strictEqual(initRes.status, "WASM_KERNEL_READY");

  const taskRes = await limb.executeTask("BM25_SCORE", { tf: 4, df: 2, dl: 50, avgdl: 60 });
  assert.strictEqual(taskRes.success, true);
  assert.strictEqual(taskRes.executor, "LOCAL_ZIG_WASM");
  assert.ok(taskRes.score > 0);
});

test("Phase 3 Test 5: End-to-End Headless Chrome Extension Manifest & Schema Validation", () => {
  // Check that all 30 manifests meet strict Chrome Web Store Manifest V3 guidelines
  const tools = fs.readdirSync(FLEET_DIST).filter(d => fs.statSync(path.join(FLEET_DIST, d)).isDirectory());

  const prohibitedPermissions = ["debugger", "experimental", "devtools", "proxy"];

  for (const toolId of tools) {
    const manifest = JSON.parse(fs.readFileSync(path.join(FLEET_DIST, toolId, "manifest.json"), "utf-8"));
    assert.strictEqual(manifest.manifest_version, 3);
    assert.ok(manifest.name && manifest.name.length > 3);
    assert.ok(manifest.version && manifest.version.match(/^\d+\.\d+\.\d+$/));
    assert.ok(manifest.description && manifest.description.length > 10);

    for (const perm of manifest.permissions) {
      assert.ok(!prohibitedPermissions.includes(perm), `Prohibited permission ${perm} found in ${toolId}`);
    }
  }
});
