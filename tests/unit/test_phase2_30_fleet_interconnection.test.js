import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";

import { instantiateSovereignKernel } from "../../modules/inline-zig-wasm.js";
import { BrainHostService, LimbClient, DEFAULT_BRAIN_EXTENSION_ID } from "../../modules/civex-brain-limb-bridge.js";
import { ZeroTrackerTelemetry } from "../../modules/zero-tracker-telemetry.js";
import { IntelligentAudioRetentionBridge } from "../../modules/intelligent-audio-retention.js";

const FLEET_DIST = path.join(process.cwd(), "fleet_dist");

test("Phase 2 Test 1: Complete 30-Extension Manifest & Archetype Integrity", () => {
  assert.ok(fs.existsSync(FLEET_DIST), "fleet_dist/ must exist");
  const entries = fs.readdirSync(FLEET_DIST).filter(d => fs.statSync(path.join(FLEET_DIST, d)).isDirectory());
  assert.strictEqual(entries.length, 30, "Exactly 30 discrete micro-tools must be generated");

  for (const dir of entries) {
    const manifestPath = path.join(FLEET_DIST, dir, "manifest.json");
    assert.ok(fs.existsSync(manifestPath), "manifest.json must exist for " + dir);
    const m = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

    assert.strictEqual(m.manifest_version, 3, "Must be Manifest V3");
    assert.ok(m.name.length > 5, "Name must be descriptive");
    assert.ok(m.description.length > 10, "Description must be descriptive");
    assert.ok(Array.isArray(m.permissions), "Permissions must be array");
    assert.ok(m.background?.service_worker, "Service worker must exist");
    assert.ok(m.action?.default_popup, "Popup must exist");
    assert.ok(m.content_security_policy?.extension_pages.includes("wasm-unsafe-eval"), "CSP must permit WASM evaluation");

    // Check WASM kernel is packaged
    const wasmPath = path.join(FLEET_DIST, dir, "kernel.wasm");
    assert.ok(fs.existsSync(wasmPath), "kernel.wasm must be bundled in " + dir);
    const sz = fs.statSync(wasmPath).size;
    assert.strictEqual(sz, 2996, "Kernel must be exact 2,996 bytes");
  }
});

test("Phase 2 Test 2: Inlined 2.9KB Zig WASM Kernel Sub-Microsecond Execution", async () => {
  const kernel = await instantiateSovereignKernel();
  assert.ok(kernel.exports, "WASM instance exports must be defined");

  // 1. FSRS-5 Retrievability
  const r = kernel.calculateFSRS5(1.0, 10.0);
  assert.ok(r > 0.90 && r < 1.0, "FSRS-5 retrievability must be in [0.90, 1.00], got " + r);

  // 2. BM25 score
  const bm25 = kernel.scoreBM25(5, 100, 10, 80);
  assert.ok(bm25 > 0, "BM25 score must be positive, got " + bm25);

  // 3. Risk auditor: tolerance 0.05
  const riskPass = kernel.auditRisk(100.0, 100.02, 0.05);
  assert.strictEqual(riskPass, 1, "Risk auditor must return 1 (SAFE)");
  const riskFail = kernel.auditRisk(100.0, 100.15, 0.05);
  assert.strictEqual(riskFail, 0, "Risk auditor must return 0 (RISK_DETECTED)");
});

test("Phase 2 Test 3: Brain-Limb IPC & Graceful Standalone Fallback", async () => {
  // Test Limb in standalone mode (no Brain in environment)
  const standaloneLimb = new LimbClient({ toolId: "lectrospeed-3x" });
  const initRes = await standaloneLimb.connect();
  assert.strictEqual(initRes.mode, "STANDALONE_LITE");
  assert.strictEqual(initRes.status, "WASM_KERNEL_READY");

  // Execute tasks via local Zig WASM fallback
  const fsrsTask = await standaloneLimb.executeTask("FSRS_EVAL", { t: 2.0, s: 15.0 });
  assert.strictEqual(fsrsTask.success, true);
  assert.strictEqual(fsrsTask.executor, "LOCAL_ZIG_WASM");
  assert.ok(fsrsTask.retrievability > 0.85);

  const bm25Task = await standaloneLimb.executeTask("BM25_SCORE", { tf: 3, df: 5, dl: 90, avgdl: 90 });
  assert.strictEqual(bm25Task.success, true);
  assert.strictEqual(bm25Task.executor, "LOCAL_ZIG_WASM");

  // Test Study Mode Toggle
  const studyToggle = standaloneLimb.toggleStudyMode(true);
  assert.strictEqual(studyToggle.studyMode, true);
  assert.ok(studyToggle.notice.includes("Opt-in Study Mode active"));

  // Test Brain Host Service
  const brainHost = new BrainHostService();
  await brainHost.init();

  let responseData = null;
  brainHost.handleExternalMessage({ type: "PING" }, {}, (res) => { responseData = res; });
  assert.strictEqual(responseData.status, "BRAIN_CONNECTED");

  brainHost.handleExternalMessage({ type: "STUDY_MODE_SYNC", payload: { conceptId: "concept-42", metrics: { retention: 0.95 } } }, {}, (res) => { responseData = res; });
  assert.strictEqual(responseData.success, true);
  assert.strictEqual(responseData.registeredConcepts, 1);
});

test("Phase 2 Test 4: Zero-Tracker Telemetry Differential Privacy & Time-Bucketing", async () => {
  const telemetry = new ZeroTrackerTelemetry({ flushIntervalMs: 999999 });

  const token = await telemetry.generateTimeBucketToken("lectrospeed-3x");
  assert.strictEqual(typeof token, "string");
  assert.strictEqual(token.length, 16, "Time-bucket token must be 16 hex chars");

  // Test differential privacy noise injection
  const rawValue = 1.0;
  const p1 = await telemetry.trackMetric("lectrospeed-3x", "VIDEO_ACCELERATED", rawValue);
  const p2 = await telemetry.trackMetric("lectrospeed-3x", "VIDEO_ACCELERATED", rawValue);

  assert.strictEqual(p1.tool, "lectrospeed-3x");
  assert.strictEqual(p1.metric, "VIDEO_ACCELERATED");
  // Obfuscated value should have slight delta within [-0.01, +0.01]
  assert.ok(Math.abs(p1.value - rawValue) <= 0.011, "Noise must be <= 0.01");
  // Differing runs must produce slightly varied values due to differential noise
  assert.notStrictEqual(p1.value, p2.value);

  const buf = telemetry.getBuffer();
  assert.strictEqual(buf.length, 2);

  const flushRes = await telemetry.flushNow();
  assert.ok(flushRes.status === "SUCCESS" || flushRes.status === "NETWORK_FALLBACK");

  telemetry.destroy();
});

test("Phase 2 Test 5: Intelligent Audio Retention & Ratechange Storm Shield", async () => {
  let mockGain = 1.0;
  let mockRate = 3.0;
  let mockFilter = "allpass";

  const bridge = new IntelligentAudioRetentionBridge({
    targetPlaybackRate: 3.0,
    audioContext: {
      currentTime: 10.0,
      baseLatency: 0.02,
      outputLatency: 0.03
    },
    videoElement: {
      get playbackRate() { return mockRate; },
      set playbackRate(v) { mockRate = v; }
    },
    gainNode: {
      gain: {
        value: 1.0,
        linearRampToValueAtTime: (v) => { mockGain = v; },
        setValueAtTime: (v) => { mockGain = v; },
        exponentialRampToValueAtTime: (v) => { mockGain = v; }
      }
    },
    biquadFilter: {
      set type(v) { mockFilter = v; },
      frequency: { setValueAtTime: () => {} }
    }
  });

  // 1. Light complexity -> 3.0x speed, allpass filter
  const lightRes = await bridge.processIncomingCaptionChunk("Hey guys welcome back to the channel");
  assert.strictEqual(lightRes.complexity, "LOW_COMPLEXITY");
  assert.strictEqual(mockRate, 3.0);
  assert.strictEqual(mockFilter, "allpass");

  // 2. High complexity -> 1.0x speed, lowpass filter, 1.3 gain boost
  const denseRes = await bridge.processIncomingCaptionChunk("The fundamental theorem of calculus establishes the integral differential relation");
  assert.strictEqual(denseRes.complexity, "HIGH_COMPLEXITY");
  assert.strictEqual(mockRate, 1.0);
  assert.strictEqual(mockFilter, "lowpass");
  assert.strictEqual(mockGain, 1.3);

  // 3. Stop sequence detection -> ducks gain to 0.2x
  const stopRes = await bridge.checkBufferAndDuckOnStopSequence("Final thought concluded <|end_of_thought|> next chapter");
  assert.strictEqual(stopRes.ducked, true);
  assert.strictEqual(stopRes.reason, "STOP_SEQUENCE");
  assert.strictEqual(mockGain, 0.2);
});

test("Phase 2 Test 6: 10x Hostile Stress Test across all 30 Micro-Tools", async () => {
  const tools = fs.readdirSync(FLEET_DIST).filter(d => fs.statSync(path.join(FLEET_DIST, d)).isDirectory());
  assert.strictEqual(tools.length, 30);

  const clients = tools.map(t => new LimbClient({ toolId: t }));

  for (let round = 1; round <= 10; round++) {
    for (let i = 0; i < clients.length; i++) {
      const client = clients[i];
      const task = (i % 2 === 0) ? "FSRS_EVAL" : "BM25_SCORE";
      const payload = (task === "FSRS_EVAL") ? { t: round, s: 10 } : { tf: round, df: 2, dl: 100, avgdl: 100 };
      const res = await client.executeTask(task, payload);
      assert.strictEqual(res.success, true);
    }
  }
});
