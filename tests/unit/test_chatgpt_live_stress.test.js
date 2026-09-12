const test = require("node:test");
const assert = require("node:assert/strict");
const { setupMockBrowser } = require("../test_harness");

/**
 * AIR10 ChatGPT Live Audio: Dry Test & 10x Hostile Stress Test
 * 
 * Verifies:
 * 1. ChatGPT Read Aloud HTMLMediaElement acceleration up to 3.0x with pitch preservation
 * 2. ChatGPT Live Voice Web Audio / PCM AudioWorklet streaming acceleration
 * 3. Ratechange watchdog defense against ChatGPT resetting playbackRate
 * 4. 10 Rounds of Rapid Churn Stress Testing across live speech turns
 */

function setupChatGPTEnvironment() {
  const browser = setupMockBrowser();

  // Configure Mock Event
  class MockEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.bubbles = !!init.bubbles;
      this.cancelable = !!init.cancelable;
    }
  }
  browser.Event = MockEvent;
  global.Event = MockEvent;
  
  // Configure Mock HTMLMediaElement & Audio
  if (!browser.HTMLMediaElement) {
    browser.HTMLMediaElement = class MockHTMLMediaElement {};
  }
  browser.HTMLMediaElement.prototype.play = function() {
    this.paused = false;
    return Promise.resolve();
  };
  browser.HTMLMediaElement.prototype.pause = function() {
    this.paused = true;
  };

  // Set ChatGPT location
  window.location.hostname = "chatgpt.com";
  window.location.href = "https://chatgpt.com/c/live-voice-session";

  // Reload audio accelerator module
  delete require.cache[require.resolve("../../modules/audio-accelerator.js")];
  require("../../modules/audio-accelerator.js");

  return browser;
}

test("ChatGPT Live Dry Test: Initial State & Speed Ladder Initialization", () => {
  setupChatGPTEnvironment();

  assert.ok(window.__AIR10_AUDIO__, "Audio controller must be initialized on chatgpt.com");
  assert.equal(window.__AIR10_AUDIO__.getSpeed(), 2.0, "Default speed on ChatGPT must be 2.0x");

  // Cycle speed across ladder
  window.__AIR10_AUDIO__.cycleSpeed();
  assert.equal(window.__AIR10_AUDIO__.getSpeed(), 2.5, "Speed should cycle to 2.5x");

  window.__AIR10_AUDIO__.cycleSpeed();
  assert.equal(window.__AIR10_AUDIO__.getSpeed(), 3.0, "Speed should cycle to 3.0x");

  window.__AIR10_AUDIO__.setSpeed(2.0);
  assert.equal(window.__AIR10_AUDIO__.getSpeed(), 2.0);
});

test("ChatGPT Live Dry Test: Read Aloud HTMLMediaElement Playback & Watchdog Defense", async () => {
  setupChatGPTEnvironment();
  window.__AIR10_AUDIO__.setSpeed(3.0);

  // ChatGPT Read Aloud creates an audio element
  const audio = document.createElement("audio");
  audio.src = "blob:https://chatgpt.com/audio-read-aloud-uuid-1234";
  audio.play = function() { return Promise.resolve(); };
  document.body.appendChild(audio);

  // Trigger play
  audio.play();

  assert.equal(audio.playbackRate, 3.0, "Audio element must immediately be locked to 3.0x");
  assert.equal(audio.preservesPitch, true, "Pitch preservation must be active on ChatGPT");
  assert.ok(window.__AIR10_AUDIO__.getTrackedCount() >= 1, "Audio element must be tracked");

  // Host reset attack: ChatGPT attempts to reset playbackRate back to 1.0x
  audio.playbackRate = 1.0;
  const ratechangeEvent = new window.Event("ratechange", { bubbles: true });
  ratechangeEvent.target = audio;
  document.dispatchEvent(ratechangeEvent);

  // Allow microtask to execute rate reassertion
  await new Promise(resolve => setImmediate(resolve));

  // Watchdog restores it to 3.0x
  assert.equal(audio.playbackRate, 3.0, "Ratechange watchdog must restore speed back to 3.0x on ChatGPT");
});

test("ChatGPT Live Dry Test: 24kHz Raw PCM Live Stream Resampling", () => {
  setupChatGPTEnvironment();
  window.__AIR10_AUDIO__.setSpeed(2.0);

  const chunkSize = 480;
  const chunk = new Float32Array(chunkSize);
  for (let i = 0; i < chunkSize; i++) {
    chunk[i] = Math.sin(2 * Math.PI * 440 * (i / 24000));
  }

  const state = { carryOver: 0, lastSample: 0 };
  const resampled = window.__AIR10_AUDIO__.resampleFloat32PCM(chunk, 2.0, state);

  assert.equal(resampled.length, 240, "480 sample chunk at 2.0x must produce exactly 240 samples");
  assert.ok(!isNaN(resampled[0]), "First sample must be a valid number");
  assert.ok(!isNaN(resampled[239]), "Last sample must be a valid number");
});

test("ChatGPT Live 10x Stress Test: 10 Rounds of Multi-Turn Live Voice Churn & Host Attacks", async () => {
  setupChatGPTEnvironment();

  const speeds = [1.5, 2.0, 2.5, 3.0, 2.0, 3.0, 2.5, 2.0, 1.5, 3.0];
  const sampleRate = 24000;
  const chunkSize = 480;
  const chunksPerTurn = 10; // 4800 samples = 200ms per turn

  for (let round = 0; round < 10; round++) {
    const targetSpd = speeds[round];
    window.__AIR10_AUDIO__.setSpeed(targetSpd);

    // 1. Simulate ChatGPT Audio Element churn
    const audio = document.createElement("audio");
    audio.src = `blob:https://chatgpt.com/turn-${round}`;
    audio.play = function() { return Promise.resolve(); };
    document.body.appendChild(audio);
    audio.play();

    assert.equal(audio.playbackRate, targetSpd, `Round ${round + 1}: Element must be locked to ${targetSpd}x`);
    assert.equal(audio.preservesPitch, true, `Round ${round + 1}: Pitch preservation required`);

    // Hostile ratechange injection
    audio.playbackRate = 1.0;
    const evt = new window.Event("ratechange", { bubbles: true });
    evt.target = audio;
    document.dispatchEvent(evt);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(audio.playbackRate, targetSpd, `Round ${round + 1}: Watchdog must defend against host reset`);

    // 2. Simulate ChatGPT Live PCM Stream
    const state = { carryOver: 0, lastSample: 0 };
    let totalOutSamples = 0;

    for (let c = 0; c < chunksPerTurn; c++) {
      const pcmChunk = new Float32Array(chunkSize);
      for (let s = 0; s < chunkSize; s++) {
        pcmChunk[s] = Math.sin((c * chunkSize + s) * 0.1) * 0.5;
      }
      const outChunk = window.__AIR10_AUDIO__.resampleFloat32PCM(pcmChunk, targetSpd, state);
      totalOutSamples += outChunk.length;

      // Assert no NaN and bounded signal
      for (let k = 0; k < outChunk.length; k++) {
        assert.ok(!isNaN(outChunk[k]), `Round ${round + 1} sample must not be NaN`);
        assert.ok(outChunk[k] >= -1.0 && outChunk[k] <= 1.0, `Round ${round + 1} sample out of range`);
      }
    }

    const expectedTotal = Math.round((chunkSize * chunksPerTurn) / targetSpd);
    assert.ok(
      Math.abs(totalOutSamples - expectedTotal) <= 2,
      `Round ${round + 1} (${targetSpd}x): Total out samples ${totalOutSamples} should match expected ${expectedTotal}`
    );

    // Cleanup element to simulate garbage collection between turns
    document.body.removeChild(audio);
  }
});
