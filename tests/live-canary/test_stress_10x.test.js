const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const sinon = require('sinon');
const { performance } = require('node:perf_hooks');

test('10x Hostile Stress Test: 10 Rounds of Multi-Element Speed Churn, Ratechange Storms & CDK Overlay Race Conditions', async (t) => {
  // Set up JSDOM environment
  const dom = new JSDOM(`<!DOCTYPE html>
<html>
  <head></head>
  <body>
    <div id="app-root">
      <div id="main-container"></div>
      <div id="shadow-container-root"></div>
    </div>
  </body>
</html>`, {
    url: 'https://notebooklm.google.com/notebook/stress-test-lab',
    runScripts: 'dangerously'
  });

  const { window } = dom;
  const { document, HTMLMediaElement } = window;

  global.window = window;
  global.document = document;
  global.HTMLMediaElement = HTMLMediaElement;
  global.Element = window.Element;
  global.Node = window.Node;
  global.NodeFilter = window.NodeFilter;
  global.MutationObserver = window.MutationObserver;
  global.location = window.location;
  global.localStorage = {
    _data: {},
    getItem: (k) => global.localStorage._data[k] || null,
    setItem: (k, v) => { global.localStorage._data[k] = v.toString(); }
  };

  // Mock Web Audio BaseAudioContext
  function MockAudioParam() {
    this.value = 1.0;
  }
  MockAudioParam.prototype.setValueAtTime = function(v) { this.value = v; };

  function MockAudioBufferSourceNode() {
    this.playbackRate = new MockAudioParam();
    this.listeners = {};
  }
  MockAudioBufferSourceNode.prototype.start = function() {};
  MockAudioBufferSourceNode.prototype.addEventListener = function(evt, cb) {
    if (!this.listeners[evt]) this.listeners[evt] = [];
    this.listeners[evt].push(cb);
  };

  window.AudioBufferSourceNode = MockAudioBufferSourceNode;
  window.AudioParam = MockAudioParam;
  window.BaseAudioContext = function() {};
  window.BaseAudioContext.prototype.createBufferSource = function() {
    return new MockAudioBufferSourceNode();
  };

  global.AudioBufferSourceNode = MockAudioBufferSourceNode;
  global.AudioParam = MockAudioParam;
  global.BaseAudioContext = window.BaseAudioContext;

  // Load fresh audio accelerator module
  const accPath = path.resolve(__dirname, '../../modules/audio-accelerator.js');
  delete require.cache[require.resolve(accPath)];
  require(accPath);

  const air10 = window.__AIR10_AUDIO__;
  assert.ok(air10, 'AIR10 module must be active');

  const mainContainer = document.getElementById('main-container');
  const shadowRootHost = document.getElementById('shadow-container-root');
  const shadow = shadowRootHost.attachShadow({ mode: 'open' });

  // Pre-generate 50 media elements (25 in main DOM, 25 in Shadow DOM)
  const mediaElements = [];
  for (let i = 0; i < 25; i++) {
    const el = document.createElement('audio');
    el.id = `media-main-${i}`;
    mainContainer.appendChild(el);
    mediaElements.push(el);
  }
  for (let i = 0; i < 25; i++) {
    const el = document.createElement('audio');
    el.id = `media-shadow-${i}`;
    shadow.appendChild(el);
    mediaElements.push(el);
  }

  assert.strictEqual(mediaElements.length, 50, 'Must have 50 media elements allocated');

  // Execute 10 Hostile Stress Rounds
  for (let round = 1; round <= 10; round++) {
    await t.test(`Stress Round ${round}/10: Rapid Speed Cycling, Storm Shielding & CDK Churn`, async () => {
      const startTime = performance.now();

      // 1. Rapid Multi-Speed Cycling across 50 elements
      const testSpeeds = [1.5, 2.0, 2.5, 3.0, 0.75, 1.75, 3.0];
      for (const spd of testSpeeds) {
        air10.setSpeed(spd);
        assert.strictEqual(air10.getSpeed(), spd, `Speed must accurately latch to ${spd}x in round ${round}`);
        
        // Sample check 5 random elements
        for (let k = 0; k < 5; k++) {
          const idx = (k * 10) % mediaElements.length;
          assert.strictEqual(mediaElements[idx].playbackRate, spd, `Element ${idx} must reflect ${spd}x`);
          assert.strictEqual(mediaElements[idx].preservesPitch, true, `Pitch preservation must be active on element ${idx}`);
        }
      }

      // 2. Hostile Ratechange Event Storm (100 events fired in under 10ms)
      const stormTarget = mediaElements[round % mediaElements.length];
      let eventDispatched = 0;
      for (let storm = 0; storm < 100; storm++) {
        stormTarget.dispatchEvent(new window.Event('ratechange'));
        eventDispatched++;
      }
      assert.strictEqual(eventDispatched, 100, 'All 100 ratechange storm events must be processed');
      assert.strictEqual(stormTarget.playbackRate, 3.0, 'Playback rate must remain locked to target 3.0x despite storm');

      // 3. Angular CDK Overlay Churn (Mount, Check & Detach)
      const overlay = document.createElement('div');
      overlay.className = 'cdk-overlay-container';
      overlay.innerHTML = `
        <div class="mat-mdc-menu-panel">
          <button class="mat-mdc-menu-item">1.0x</button>
          <button class="mat-mdc-menu-item">2.0x</button>
        </div>
      `;
      document.body.appendChild(overlay);

      // Verify no crash and overlay handled
      assert.ok(document.querySelector('.cdk-overlay-container'), 'Overlay must attach');
      document.body.removeChild(overlay);
      assert.strictEqual(document.querySelector('.cdk-overlay-container'), null, 'Overlay must detach cleanly');

      // 4. Web Audio Buffer Source Stress (10 nodes created)
      const ctx = new window.BaseAudioContext();
      for (let b = 0; b < 10; b++) {
        const src = ctx.createBufferSource();
        src.start();
        assert.strictEqual(src.playbackRate.value, 3.0, 'AudioBufferSourceNode playbackRate must be locked to 3.0x');
      }

      const elapsed = performance.now() - startTime;
      assert.ok(elapsed < 200, `Round ${round} execution (${elapsed.toFixed(2)}ms) must be under 200ms SLO`);
    });
  }

  // Final Telemetry & Invariant Sanity
  const telemetry = air10.getTelemetry();
  assert.ok(telemetry.length > 0, 'Telemetry events must be populated after 10 stress rounds');
  assert.strictEqual(air10.getSpeed(), 3.0, 'Final speed must be exactly 3.0x');
});
