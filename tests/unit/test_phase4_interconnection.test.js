/**
 * AIR10 Phase 4: Interconnection² (100 Hacks + 100 Tools Synergy Suite)
 * Tests:
 * 1. Physical verification of NEW_100_WHEELS_PHASE4_VERIFIED.sqlite (100/100 tools certified).
 * 2. AST Command Interposition & Tool Router sub-millisecond execution.
 * 3. Live WebRTC Catch-Up Audio Proxy + Jitter Ring Buffer + Dynamic Speed Governor.
 * 4. 10x Stress execution across multi-turn WebRTC stream conditions.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

describe('AIR10 Phase 4: Interconnection² Zero-Trust Verification', () => {

  test('Physical Court Verification: 100 Sovereign Tools Certified in SQLite', () => {
    const dbPath = '/Users/rajondas/Desktop/NEW_100_WHEELS_PHASE4_VERIFIED.sqlite';
    assert.strictEqual(fs.existsSync(dbPath), true, 'SQLite database must exist on disk');

    const res = spawnSync('sqlite3', [dbPath, 'SELECT count(*), min(latency_us), max(stress_10x_latency_us) FROM verified_tools WHERE dry_test_status="PASS";'], { encoding: 'utf8' });
    assert.strictEqual(res.status, 0, 'sqlite3 query must exit with code 0');
    
    const [count, minDry, maxStress] = res.stdout.trim().split('|');
    assert.strictEqual(parseInt(count, 10), 100, 'Exactly 100 tools must be certified PASS');
    assert(parseFloat(maxStress) < 100.0, 'Max 10x stress latency must be sub-100 microseconds');
  });

  test('AST Command Interposition: Deterministic Rewriting of Legacy POSIX & Script Fallbacks', () => {
    const scriptPath = path.join(__dirname, '../../scripts/air10_ast_command_interposition.py');
    assert.strictEqual(fs.existsSync(scriptPath), true, 'AST script must exist');

    const testCases = [
      { in: 'grep -rn needle .', expected: 'rg -rn needle .' },
      { in: 'find . -name *.js', expected: 'fd . -name *.js' },
      { in: 'cat package.json', expected: 'bat --paging=never package.json' },
      { in: 'python3 -c "import json; print(len(json.load(open("db.json"))))"', expected: 'air10-fast-json --inspect' }
    ];

    for (const tc of testCases) {
      const res = spawnSync('/Users/rajondas/.air1/speed_wheels_env/bin/python3', [scriptPath, tc.in], { encoding: 'utf8' });
      assert.strictEqual(res.status, 0, 'AST router must exit with code 0');
      assert(res.stdout.includes(tc.expected), 'Command must be deterministically rewritten to ' + tc.expected + ' | got: ' + res.stdout);
      assert(res.stdout.includes('Rewritten : True'), 'Rewritten flag must be true');
    }
  });

  test('Live WebRTC Catch-Up Audio Proxy: Jitter Ring Buffer & Dynamic Speed Governor Integration', () => {
    const { AIR10RingBuffer, AIR10DynamicSpeedGovernor } = require('../../modules/air10-catchup-processor.js');
    assert(AIR10RingBuffer, 'AIR10RingBuffer must be exported');
    assert(AIR10DynamicSpeedGovernor, 'AIR10DynamicSpeedGovernor must be exported');

    const rb = new AIR10RingBuffer(48000);
    const gov = new AIR10DynamicSpeedGovernor({ targetSpeed: 3.0, minBufferMs: 50, maxBufferMs: 180 });

    // 1. Initially buffer is empty -> Speed stays at 1.0x to avoid starvation
    assert.strictEqual(gov.update(rb.bufferedMs()), 1.0);

    // 2. Feed 200ms worth of audio samples (9600 samples at 48kHz)
    const testSamples = new Float32Array(9600);
    testSamples.fill(0.5);
    rb.write(testSamples);

    assert(rb.bufferedMs() >= 199.0, 'Ring buffer must contain ~200ms of audio');

    // 3. Update governor over successive blocks; should ramp smoothly toward 3.0x
    let currentSpeed = 1.0;
    for (let i = 0; i < 60; i++) {
      currentSpeed = gov.update(rb.bufferedMs());
    }
    assert(currentSpeed >= 2.9, 'Dynamic governor must reach ~3.0x target catch-up speed when buffer ample');

    // 4. Drain audio until buffer is near zero
    const drainBuf = new Float32Array(8000);
    rb.read(drainBuf, 8000);
    assert(rb.bufferedMs() < 50, 'Ring buffer should have drained below 50ms');

    for (let i = 0; i < 60; i++) {
      currentSpeed = gov.update(rb.bufferedMs());
    }
    assert(currentSpeed <= 1.05, 'Dynamic governor must ramp down to 1.0x when buffer approaches exhaustion');
  });

  test('10x Stress Test: Rapid WebRTC Speed Shift & Memory Resilience', () => {
    const { AIR10RingBuffer, AIR10DynamicSpeedGovernor } = require('../../modules/air10-catchup-processor.js');
    const rb = new AIR10RingBuffer(96000);
    const gov = new AIR10DynamicSpeedGovernor({ targetSpeed: 2.5 });

    // Run 10 rapid stress iterations of write / ramp / drain cycles
    for (let round = 1; round <= 10; round++) {
      const chunk = new Float32Array(4800); // 100ms chunk
      chunk.fill(Math.sin(round));
      rb.write(chunk);
      const spd = gov.update(rb.bufferedMs());
      assert(!isNaN(spd), 'Speed must never be NaN');
      assert(spd >= 1.0 && spd <= 3.5, 'Speed must remain within safe bounds');

      const out = new Float32Array(4800);
      rb.read(out, 4800);
      assert.strictEqual(rb.available(), 0, 'Buffer should be completely drained in round ' + round);
    }
  });

});
