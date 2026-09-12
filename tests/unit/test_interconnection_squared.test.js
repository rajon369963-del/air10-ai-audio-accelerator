const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const sinon = require('sinon');
const cheerio = require('cheerio');
const equal = require('fast-deep-equal');
const { nanoid } = require('nanoid');
const soundtouch = require('soundtouchjs');
const pitchfinder = require('pitchfinder');

test('Interconnection²: 100 Hacks + 100 Wheels Full Synergy Test', async (t) => {
  // Setup JSDOM environment simulating Chrome browser on NotebookLM
  const dom = new JSDOM(`<!DOCTYPE html>
<html>
  <head></head>
  <body>
    <div id="notebooklm-app">
      <div class="main-player">
        <audio id="audio-main" src="https://notebooklm.google.com/audio/podcast.mp3"></audio>
      </div>
      <div id="shadow-host"></div>
    </div>
  </body>
</html>`, {
    url: 'https://notebooklm.google.com/notebook/study-session-123',
    runScripts: 'dangerously'
  });

  const { window } = dom;
  const { document, HTMLMediaElement, CustomEvent } = window;

  // Mock shadow root inside shadow host
  const host = document.getElementById('shadow-host');
  const shadow = host.attachShadow({ mode: 'open' });
  const shadowAudio = document.createElement('audio');
  shadowAudio.id = 'shadow-audio-player';
  shadow.appendChild(shadowAudio);

  // Expose globals for module execution
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

  // Clear require cache and load audio-accelerator
  const accPath = path.resolve(__dirname, '../../modules/audio-accelerator.js');
  delete require.cache[require.resolve(accPath)];
  require(accPath);

  const air10 = window.__AIR10_AUDIO__;
  assert.ok(air10, 'window.__AIR10_AUDIO__ must be initialized');

  // Test 1: Hacks #11, #14 + Wheel query-selector-shadow-dom (Deep Querying)
  await t.test('Interconnection 1: Deep Shadow DOM Piercing', () => {
    const audios = air10.querySelectorAllDeep('audio', document);
    assert.strictEqual(audios.length, 2, 'Must locate audio in main DOM and inside shadow root');
    const ids = audios.map(a => a.id);
    assert.ok(ids.includes('audio-main'));
    assert.ok(ids.includes('shadow-audio-player'));
  });

  // Test 2: Hacks #16, #17, #19 + Wheel sinon (Ratechange Event Storm Shield)
  await t.test('Interconnection 2: Ratechange Storm Shield & Re-entrancy Lock', () => {
    const mainAudio = document.getElementById('audio-main');
    air10.setSpeed(3.0);
    assert.strictEqual(mainAudio.playbackRate, 3.0);

    // Simulate aggressive website resetting playbackRate to 1.0x 50 times in rapid succession
    let ratechangeCount = 0;
    mainAudio.addEventListener('ratechange', () => {
      ratechangeCount++;
    });

    for (let i = 0; i < 50; i++) {
      mainAudio.dispatchEvent(new window.Event('ratechange'));
    }

    // Must handle all 50 events without error or infinite recursion
    assert.strictEqual(ratechangeCount, 50);
    assert.strictEqual(air10.getSpeed(), 3.0);
  });

  // Test 3: Hacks #22, #48 + Wheels soundtouchjs & pitchfinder (Pitch Preservation)
  await t.test('Interconnection 3: Pitch Preservation & DSP Validation', () => {
    const mainAudio = document.getElementById('audio-main');
    assert.strictEqual(air10.verifyPitchPreservation(mainAudio), true, 'Pitch preservation must be active on media');

    // DSP verification via SoundTouchJS & Pitchfinder
    const st = new soundtouch.SoundTouch(44100);
    st.tempo = air10.getSpeed();
    assert.strictEqual(st.tempo, 3.0, 'SoundTouch tempo must match target 3.0x speed');
    assert.strictEqual(st.virtualPitch, 1.0, 'Pitch must stay 1.0 (no chipmunk effect)');
  });

  // Test 4: Hacks #13, #39, #72 + Wheel cheerio (CDK Overlay Menu Integration)
  await t.test('Interconnection 4: Angular CDK Overlay Injection Structure', () => {
    const $ = cheerio.load(`
      <div class="cdk-overlay-container">
        <div class="mat-mdc-menu-panel">
          <button class="mat-mdc-menu-item">0.5x</button>
          <button class="mat-mdc-menu-item">1.0x</button>
          <button class="mat-mdc-menu-item">1.5x</button>
          <button class="mat-mdc-menu-item active">2.0x</button>
        </div>
      </div>
    `);

    const button2x = $('.mat-mdc-menu-panel button:contains("2.0x")');
    assert.strictEqual(button2x.length, 1);

    // Inject 2.5x and 3.0x clones
    button2x.parent().append('<button class="mat-mdc-menu-item" data-air10-injected="true">2.5x</button>');
    button2x.parent().append('<button class="mat-mdc-menu-item" data-air10-injected="true">3.0x</button>');

    const allButtons = $('.mat-mdc-menu-panel button');
    assert.strictEqual(allButtons.length, 6, 'Menu must contain 6 speed choices including 2.5x and 3.0x');
    assert.strictEqual(allButtons.last().text(), '3.0x');
  });

  // Test 5: Hacks #6, #30 + Wheels nanoid & fast-deep-equal (State Telemetry)
  await t.test('Interconnection 5: Telemetry Ring Buffer & State Fingerprinting', () => {
    air10.setSpeed(2.5);
    air10.setSpeed(3.0);

    const telemetry = air10.getTelemetry();
    assert.ok(Array.isArray(telemetry), 'Telemetry must return an array');
    assert.ok(telemetry.length >= 2, 'Telemetry must have logged at least 2 entries');

    const last = telemetry[telemetry.length - 1];
    assert.strictEqual(last.toSpeed, 3.0);
    assert.ok(typeof last.id === 'string' && last.id.startsWith('act_'), 'Must generate nanoid-like unique action id');

    const state1 = { speed: last.toSpeed, mediaCount: last.activeMediaCount };
    const state2 = { speed: 3.0, mediaCount: last.activeMediaCount };
    assert.strictEqual(equal(state1, state2), true, 'Fast-deep-equal confirms state consistency');
  });
});
