const test = require("node:test");
const assert = require("node:assert/strict");
const { setupMockBrowser } = require("../test_harness");

function setupEnvironment() {
  const browser = setupMockBrowser();

  // Create Mock AudioBuffer
  class MockAudioBuffer {
    constructor(duration = 1.0) {
      this.duration = duration;
      this.length = Math.round(duration * 24000);
      this.sampleRate = 24000;
    }
  }

  // Create Mock AudioContext with currentTime
  class MockAudioContext {
    constructor() {
      this.currentTime = 10.0;
    }
    createBufferSource() {
      const source = new MockAudioBufferSourceNode();
      source.context = this;
      return source;
    }
  }

  class MockAudioBufferSourceNode {
    constructor() {
      this.playbackRate = { value: 1.0 };
      this.buffer = null;
      this.context = null;
      this.startedAt = null;
    }
    start(when = 0, offset = 0, duration) {
      this.startedAt = when;
    }
    addEventListener(evt, cb) {}
  }

  browser.AudioBuffer = MockAudioBuffer;
  browser.AudioContext = MockAudioContext;
  browser.BaseAudioContext = MockAudioContext;
  browser.AudioBufferSourceNode = MockAudioBufferSourceNode;

  global.AudioBuffer = MockAudioBuffer;
  global.AudioContext = MockAudioContext;
  global.BaseAudioContext = MockAudioContext;
  global.AudioBufferSourceNode = MockAudioBufferSourceNode;

  window.location.hostname = "gemini.google.com";

  delete require.cache[require.resolve("../../modules/audio-accelerator.js")];
  require("../../modules/audio-accelerator.js");

  return { browser, MockAudioContext, MockAudioBuffer };
}

test("Sequential Buffer Scheduling: 2.0x Contiguous Chunks Compression (Zero Dead Gap)", () => {
  const { MockAudioContext, MockAudioBuffer } = setupEnvironment();
  window.__AIR10_AUDIO__.setSpeed(2.0);

  const ctx = new MockAudioContext();
  ctx.currentTime = 10.0;

  // Chunk 0 (1.0 second duration)
  const source0 = ctx.createBufferSource();
  source0.buffer = new MockAudioBuffer(1.0);
  source0.start(10.0);
  assert.equal(source0.startedAt, 10.0, "Chunk 0 starts at initial time 10.0s");

  // Advance clock slightly (0.1s later)
  ctx.currentTime = 10.1;

  // Chunk 1 (1.0s buffer). Google's player calculates nextStartTime = 10.0 + 1.0 = 11.0s
  const source1 = ctx.createBufferSource();
  source1.buffer = new MockAudioBuffer(1.0);
  source1.start(11.0);

  // At 2.0x, Chunk 0 finished in 0.5s (at 10.5s).
  // The accelerator must compress Chunk 1's start from 11.0s to 10.5s!
  assert.equal(
    source1.startedAt,
    10.5,
    "Chunk 1 must start at 10.5s (compressed by 2.0x) to eliminate the 0.5s dead silence gap"
  );

  // Advance clock to 10.3s
  ctx.currentTime = 10.3;

  // Chunk 2 (1.0s buffer). Google's player calculates nextStartTime = 11.0 + 1.0 = 12.0s
  const source2 = ctx.createBufferSource();
  source2.buffer = new MockAudioBuffer(1.0);
  source2.start(12.0);

  // Chunk 2 must start at 11.0s
  assert.equal(
    source2.startedAt,
    11.0,
    "Chunk 2 must start at 11.0s (seamless chaining with zero gaps)"
  );
});

test("Sequential Buffer Scheduling: 3.0x Contiguous Chunks Compression", () => {
  const { MockAudioContext, MockAudioBuffer } = setupEnvironment();
  window.__AIR10_AUDIO__.setSpeed(3.0);

  const ctx = new MockAudioContext();
  ctx.currentTime = 5.0;

  // Chunk 0 (0.6s duration) -> at 3x takes 0.2s
  const source0 = ctx.createBufferSource();
  source0.buffer = new MockAudioBuffer(0.6);
  source0.start(5.0);
  assert.equal(source0.startedAt, 5.0);

  ctx.currentTime = 5.05;

  // Chunk 1 (0.6s duration) -> uncompressed schedule: 5.0 + 0.6 = 5.6s
  const source1 = ctx.createBufferSource();
  source1.buffer = new MockAudioBuffer(0.6);
  source1.start(5.6);

  // Compressed start should be 5.0 + 0.2 = 5.2s!
  assert.ok(
    Math.abs(source1.startedAt - 5.2) < 0.001,
    `Chunk 1 should start at 5.2s at 3.0x, got ${source1.startedAt}`
  );
});

test("Sequential Buffer Scheduling: Intentional Long Pause is Preserved", () => {
  const { MockAudioContext, MockAudioBuffer } = setupEnvironment();
  window.__AIR10_AUDIO__.setSpeed(2.0);

  const ctx = new MockAudioContext();
  ctx.currentTime = 1.0;

  const s0 = ctx.createBufferSource();
  s0.buffer = new MockAudioBuffer(1.0);
  s0.start(1.0);

  // Intentional conversational pause of 3.5 seconds
  ctx.currentTime = 4.5;
  const s1 = ctx.createBufferSource();
  s1.buffer = new MockAudioBuffer(1.0);
  s1.start(4.5);

  // Pause should NOT be artificially compressed backwards
  assert.equal(s1.startedAt, 4.5, "Intentional pause must not be collapsed");
});
