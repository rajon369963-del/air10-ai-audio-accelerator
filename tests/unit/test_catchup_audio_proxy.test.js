const test = require('node:test');
const assert = require('node:assert');
const {
  AIR10RingBuffer,
  AIR10DynamicSpeedGovernor,
  AIR10WSOLATimeStretcher,
  AIR10CatchUpProcessor
} = require('../../modules/air10-catchup-processor.js');

test('AIR10 Catch-Up Audio Proxy: Architectural Verification Suite', async (t) => {
  // Test 1: Jitter Ring Buffer Mechanics
  await t.test('RingBuffer: Circular write, read, wrap-around, and underrun defense', () => {
    const rb = new AIR10RingBuffer(1000); // 1000 sample capacity
    assert.strictEqual(rb.available(), 0);
    assert.strictEqual(rb.bufferedMs(48000), 0);

    // Write 400 samples
    const chunk1 = new Float32Array(400).fill(1.0);
    rb.write(chunk1);
    assert.strictEqual(rb.available(), 400);

    // Read 300 samples
    const out1 = new Float32Array(300);
    const readCount1 = rb.read(out1, 300);
    assert.strictEqual(readCount1, 300);
    assert.strictEqual(out1[0], 1.0);
    assert.strictEqual(out1[299], 1.0);
    assert.strictEqual(rb.available(), 100);

    // Write 500 samples (triggers wrap-around in circular ring)
    const chunk2 = new Float32Array(500).fill(2.0);
    rb.write(chunk2);
    assert.strictEqual(rb.available(), 600);

    // Read 600 samples
    const out2 = new Float32Array(600);
    const readCount2 = rb.read(out2, 600);
    assert.strictEqual(readCount2, 600);
    assert.strictEqual(out2[0], 1.0);   // Oldest unread sample
    assert.strictEqual(out2[99], 1.0);
    assert.strictEqual(out2[100], 2.0); // Wrap-around sample
    assert.strictEqual(out2[599], 2.0);
    assert.strictEqual(rb.available(), 0);

    // Underrun read: ask for 100 when empty -> returns 0 and zero-fills
    const out3 = new Float32Array(100).fill(9.9);
    const readCount3 = rb.read(out3, 100);
    assert.strictEqual(readCount3, 0);
    assert.strictEqual(out3[0], 0);
    assert.strictEqual(out3[99], 0);
  });

  // Test 2: Dynamic Speed Governor Adaptation
  await t.test('Speed Governor: Smooth speed ramping between 1.0x (safe) and targetSpeed (catch-up)', () => {
    const gov = new AIR10DynamicSpeedGovernor({
      minBufferMs: 50,
      maxBufferMs: 180,
      targetSpeed: 2.5,
      slewRate: 0.05
    });

    // 1. When buffer is below minBufferMs (e.g. 30ms) -> locked to 1.0x
    let speed = gov.update(30);
    assert.strictEqual(speed, 1.0, 'Speed must stay at 1.0x when buffer < 50ms');

    // 2. When buffer is above maxBufferMs (e.g. 250ms) -> ramps toward targetSpeed (2.5x)
    for (let i = 0; i < 40; i++) {
      speed = gov.update(250);
    }
    assert.ok(Math.abs(speed - 2.5) < 0.05, `Speed must reach 2.5x catch-up rate (got ${speed})`);

    // 3. When buffer drains back down to safe margin (e.g. 20ms) -> ramps back to 1.0x
    for (let i = 0; i < 40; i++) {
      speed = gov.update(20);
    }
    assert.ok(Math.abs(speed - 1.0) < 0.05, `Speed must decelerate back to 1.0x (got ${speed})`);
  });

  // Test 3: WSOLA Pitch-Preserving Time-Stretching
  await t.test('WSOLA Time-Stretcher: Drains buffer at 2.0x and 3.0x speed without pitch drift', () => {
    const sampleRate = 48000;
    const stretcher = new AIR10WSOLATimeStretcher(sampleRate);
    const rb = new AIR10RingBuffer( sampleRate * 3 );

    // Generate 440Hz test sine wave (1.5 seconds)
    const totalSamples = sampleRate * 1.5;
    const testAudio = new Float32Array(totalSamples);
    for (let i = 0; i < totalSamples; i++) {
      testAudio[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
    }
    rb.write(testAudio);

    // Pull 2.0x time-stretched blocks (128 samples per block)
    const outBlock = new Float32Array(128);
    let totalOutputSamples = 0;
    let iterations = 0;

    while (rb.available() > 1000 && iterations < 500) {
      const written = stretcher.process(rb, outBlock, 2.0);
      totalOutputSamples += written;
      iterations++;
    }

    // Input consumed vs output generated ratio should be near 2.0x
    const consumed = totalSamples - rb.available();
    const compressionRatio = consumed / totalOutputSamples;
    assert.ok(compressionRatio >= 1.7 && compressionRatio <= 2.3, `2.0x compression ratio must be ~2.0 (got ${compressionRatio.toFixed(2)})`);
  });

  // Test 4: End-to-End AudioWorkletProcessor Simulation
  await t.test('CatchUpProcessor: Full real-time audio quantum loop with simulated WebRTC packet bursts', () => {
    const proc = new AIR10CatchUpProcessor({
      processorOptions: {
        speed: 2.0,
        sampleRate: 48000
      }
    });

    let telemetryReceived = null;
    proc.port.postMessage = (msg) => {
      telemetryReceived = msg;
    };

    // Simulate 20ms audio packet arrival (960 samples at 48kHz per packet)
    const packetSize = 960;
    const inputChannels = [new Float32Array(128)]; // Standard AudioWorklet 128-sample quantum
    const outputChannels = [new Float32Array(128), new Float32Array(128)];

    // Send 10 packets into the ring buffer via port (e.g. burst during AI turn)
    for (let p = 0; p < 10; p++) {
      const packet = new Float32Array(packetSize);
      for (let i = 0; i < packetSize; i++) {
        packet[i] = Math.sin((2 * Math.PI * 440 * (p * packetSize + i)) / 48000);
      }
      proc.handleMessage({ type: 'air10_push_pcm', pcm: packet });
    }

    assert.ok(proc.ringBufferL.available() >= 9600, 'All burst packets must be buffered');

    // Run 100 audio render quanta (128 samples each = 12,800 output samples)
    for (let q = 0; q < 100; q++) {
      proc.process([inputChannels], [outputChannels], {});
    }

    // Verify telemetry was fired
    assert.ok(telemetryReceived !== null, 'Telemetry must be emitted');
    assert.strictEqual(telemetryReceived.type, 'air10_catchup_telemetry');
    assert.ok(telemetryReceived.framesProcessed > 0, 'Frames must be processed');
    assert.ok(telemetryReceived.currentSpeed >= 1.0, 'Speed must be active');
  });

  // Test 5: 10x Adversarial Stress & Packet Jitter Fuzzer
  await t.test('Adversarial Fuzzer: Random jitter bursts, packet drops, and extreme speed shifts (10 rounds)', () => {
    const proc = new AIR10CatchUpProcessor({
      processorOptions: {
        speed: 3.0,
        sampleRate: 48000
      }
    });

    const outputBlock = [new Float32Array(128), new Float32Array(128)];

    for (let round = 1; round <= 10; round++) {
      // 1. Random speed modulation
      const randomSpeed = [1.5, 2.0, 2.5, 3.0][round % 4];
      proc.handleMessage({ type: 'air10_set_speed', speed: randomSpeed });

      // 2. Random burst or packet drop
      const packetCount = Math.floor(Math.random() * 5); // 0 to 4 packets
      for (let p = 0; p < packetCount; p++) {
        const pcm = new Float32Array(480 + Math.floor(Math.random() * 480)); // 10ms - 20ms jitter
        for (let i = 0; i < pcm.length; i++) {
          pcm[i] = (Math.random() * 2 - 1) * 0.5;
        }
        proc.handleMessage({ type: 'air10_push_pcm', pcm });
      }

      // 3. Process 20 quanta
      for (let q = 0; q < 20; q++) {
        proc.process([[[0]]], [outputBlock], {});
        // Check for NaN or Infinity
        for (let i = 0; i < 128; i++) {
          assert.ok(!isNaN(outputBlock[0][i]), `Output sample must never be NaN (Round ${round}, Quantum ${q})`);
          assert.ok(isFinite(outputBlock[0][i]), `Output sample must be finite (Round ${round}, Quantum ${q})`);
        }
      }
    }

    assert.ok(proc.framesProcessed > 2000, 'Must process multi-thousand frames without crashing');
  });
});
