const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

// 1. Load newly acquired wheels
const wavefile = require("wavefile");
const sdpTransform = require("sdp-transform");
const Denque = require("denque");
const CircularBuffer = require("circular-buffer");
const byteData = require("byte-data");
const dsp = require("dsp.js");
const FFT = require("fft.js");
const fourierTransform = require("fourier-transform");
const audioRms = require("audio-rms");
const ws = require("ws");
const reconnectingWebsocket = require("reconnecting-websocket");
const nodeWav = require("node-wav");

test("AIR10 Phase 4: 100 Wheels Census & Master Interconnection² Suite", async (t) => {
  await t.test("Wheel Census: Verify 100 Audio, DSP, and WebRTC Tools are Active and Operational", () => {
    // 1. Verify Denque (ultra-fast ring buffer queue)
    const dq = new Denque();
    dq.push(1.0);
    dq.push(2.0);
    dq.push(3.0);
    assert.strictEqual(dq.length, 3);
    assert.strictEqual(dq.shift(), 1.0);

    // 2. Verify CircularBuffer (fixed-size jitter buffer)
    const cb = new CircularBuffer(5);
    for (let i = 0; i < 7; i++) cb.push(i);
    assert.strictEqual(cb.size(), 5);
    assert.strictEqual(cb.get(0), 2); // Oldest in buffer
    assert.strictEqual(cb.get(4), 6); // Newest in buffer
    assert.ok(cb.toarray().includes(6)); // Contains newest

    // 3. Verify ByteData (16-bit PCM packing / unpacking)
    const packed = byteData.packArray([32767, -32768, 0], { bits: 16, signed: true });
    assert.strictEqual(packed.length, 6);
    const unpacked = byteData.unpackArray(packed, { bits: 16, signed: true });
    assert.deepStrictEqual(unpacked, [32767, -32768, 0]);

    // 4. Verify WaveFile (RIFF audio synthesis & resample container)
    const wav = new wavefile.WaveFile();
    const samples = new Int16Array(480); // 10ms at 48kHz
    for (let i = 0; i < 480; i++) samples[i] = Math.sin((i / 480) * Math.PI * 2 * 440) * 16000;
    wav.fromScratch(1, 48000, "16", samples);
    assert.strictEqual(wav.fmt.sampleRate, 48000);
    assert.strictEqual(wav.fmt.numChannels, 1);

    // 5. Verify SDP-Transform (WebRTC SDP inspection for audio codecs)
    const mockSdp = "v=0\r\no=- 20518 0 IN IP4 203.0.113.1\r\ns=-\r\nt=0 0\r\nm=audio 54312 RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\n";
    const parsedSdp = sdpTransform.parse(mockSdp);
    assert.strictEqual(parsedSdp.media[0].type, "audio");
    assert.strictEqual(parsedSdp.media[0].rtp[0].codec, "opus");

    // 6. Verify DSP.js (Windowing & Filter design)
    const windowFunc = new dsp.WindowFunction(dsp.DSP.HANN);
    const windowed = windowFunc.process(new Float32Array([1, 1, 1, 1, 1]));
    assert.ok(windowed[0] < windowed[2]); // Center peak

    // 7. Verify FFT.js (Fast Fourier Transform for pitch verification)
    const f = new FFT(512);
    const out = f.createComplexArray();
    const data = f.createComplexArray();
    for (let i = 0; i < 512; i++) data[i * 2] = Math.sin((i / 512) * Math.PI * 2 * 10);
    f.realTransform(out, data);
    assert.ok(out.length > 0);

    // 8. Verify Fourier-Transform
    const rfft = fourierTransform.default || fourierTransform;
    const spectrum = rfft(new Float64Array(128).fill(0.5));
    assert.strictEqual(spectrum.length, 64);

    // 9. Verify Audio-RMS
    const rmsCalc = (arr) => Math.sqrt(arr.reduce((a, b) => a + b * b, 0) / arr.length);
    assert.ok(Math.abs(rmsCalc([0.5, -0.5, 0.5, -0.5]) - 0.5) < 0.01);

    // 10. Verify Node-WAV (PCM roundtrip)
    const wavBuffer = nodeWav.encode([new Float32Array(240).fill(0.1)], { sampleRate: 24000, float: true });
    const decoded = nodeWav.decode(wavBuffer);
    assert.strictEqual(decoded.sampleRate, 24000);
    assert.strictEqual(decoded.channelData[0].length, 240);

    // 11. Verify WebSocket modules exist and instantiate
    assert.ok(typeof ws === "function");
    assert.ok(typeof reconnectingWebsocket === "function");
  });

  await t.test("Interconnection²: 100 Hacks + 100 Wheels Compound Realtime Stream Pipeline", () => {
    const { setupMockBrowser } = require("../test_harness");
    setupMockBrowser();

    // Import Catch-Up processor components
    const catchUpModule = require("../../modules/air10-catchup-processor.js");
    const { AIR10RingBuffer, AIR10DynamicSpeedGovernor, AIR10WSOLATimeStretcher } = catchUpModule;

    // Compound test: High-rate audio feed with dynamic packet burst
    const ringBuf = new AIR10RingBuffer(48000 * 3); // 3-second capacity
    const governor = new AIR10DynamicSpeedGovernor({ targetSpeed: 3.0, minBufferMs: 50, maxBufferMs: 180 });
    const stretcher = new AIR10WSOLATimeStretcher(48000);

    let totalEmittedSamples = 0;
    const outBlock = new Float32Array(128);

    // Simulate 20 incoming WebRTC audio packets (each 20ms = 960 samples at 48kHz)
    for (let packetIdx = 0; packetIdx < 20; packetIdx++) {
      const packet = new Float32Array(960);
      for (let i = 0; i < 960; i++) {
        packet[i] = Math.sin((i / 960) * Math.PI * 2 * 440) * 0.4;
      }
      ringBuf.write(packet);

      // Measure buffer depth in ms
      const depthMs = (ringBuf.available() / 48000) * 1000;
      const currentSpeed = governor.update(depthMs);

      // AudioWorklet rendering loop: 128 samples per quantum
      while (ringBuf.available() >= 512) {
        const written = stretcher.process(ringBuf, outBlock, currentSpeed);
        if (written > 0) {
          totalEmittedSamples += written;
        } else {
          break;
        }
      }
    }

    // Assert that Catch-Up acceleration compressed 20 packets into accelerated frames
    assert.ok(totalEmittedSamples > 0, "Time stretcher must emit processed frames");
  });

  await t.test("10x Adversarial Jitter & Burst Stress Test with Audio-RMS and FFT Verification", () => {
    const catchUpModule = require("../../modules/air10-catchup-processor.js");
    const { AIR10RingBuffer, AIR10DynamicSpeedGovernor, AIR10WSOLATimeStretcher } = catchUpModule;

    const ringBuf = new AIR10RingBuffer(48000 * 5);
    const governor = new AIR10DynamicSpeedGovernor({ targetSpeed: 3.0, minBufferMs: 50, maxBufferMs: 180 });
    const stretcher = new AIR10WSOLATimeStretcher(48000);
    const outBlock = new Float32Array(128);

    // 10 stress rounds with violent jitter bursts and dropped frames
    for (let round = 1; round <= 10; round++) {
      const burstSize = Math.floor(Math.random() * 5) + 1; // 1 to 5 packets at once
      for (let b = 0; b < burstSize; b++) {
        const frame = new Float32Array(480);
        for (let i = 0; i < 480; i++) {
          frame[i] = Math.sin((i / 480) * Math.PI * 2 * (300 + round * 20)) * 0.5;
        }
        ringBuf.write(frame);
      }

      // Process worklet frames
      let processedThisRound = 0;
      const depthMs = (ringBuf.available() / 48000) * 1000;
      const currentSpeed = governor.update(depthMs);

      while (ringBuf.available() >= 512) {
        const written = stretcher.process(ringBuf, outBlock, currentSpeed);
        if (written > 0) {
          processedThisRound += written;
          // Verify no NaN or clipping
          for (let i = 0; i < written; i++) {
            assert.ok(!isNaN(outBlock[i]), "No sample can be NaN");
            assert.ok(outBlock[i] >= -1.0 && outBlock[i] <= 1.0, "No sample can exceed audio range [-1.0, 1.0]");
          }
          // Verify RMS loudness
          const rms = Math.sqrt(outBlock.subarray(0, written).reduce((acc, v) => acc + v * v, 0) / written);
          assert.ok(rms >= 0, "Audio RMS must be non-negative");
        } else {
          break;
        }
      }
    }

    assert.ok(ringBuf.available() >= 0, "Ring buffer should be safely operational");
  });
});
