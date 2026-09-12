const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('100 Battle-Tested Wheels: Interconnection Verification Suite', async (t) => {
  // 1. Test SoundTouchJS Web Audio DSP time-stretching
  await t.test('Wheel 1: SoundTouchJS pitch-preserving time-stretch calculation', () => {
    const soundtouch = require('soundtouchjs');
    assert.ok(soundtouch, 'SoundTouchJS must be loaded');
    assert.ok(soundtouch.SoundTouch, 'SoundTouch constructor must exist');

    const st = new soundtouch.SoundTouch(44100);
    st.tempo = 3.0; // 3.0x speed
    st.rate = 1.0;
    assert.strictEqual(st.tempo, 3.0, 'Tempo must be scaled to 3.0x');
    assert.strictEqual(st.virtualPitch, 1.0, 'Pitch must be preserved at 1.0');
  });

  // 2. Test Pitchfinder audio frequency analysis
  await t.test('Wheel 2: Pitchfinder YIN and AMDF algorithms', () => {
    const pitchfinder = require('pitchfinder');
    assert.ok(pitchfinder, 'Pitchfinder must be loaded');
    const detectPitch = pitchfinder.YIN({ sampleRate: 44100 });
    assert.strictEqual(typeof detectPitch, 'function', 'YIN detector must be a callable function');

    // Synthetic 440Hz sine wave buffer
    const sampleRate = 44100;
    const freq = 440;
    const float32Data = new Float32Array(1024);
    for (let i = 0; i < float32Data.length; i++) {
      float32Data[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate);
    }

    const detected = detectPitch(float32Data);
    assert.ok(detected !== null, 'Pitch must be detected from sine wave');
    assert.ok(Math.abs(detected - 440) < 15, `Detected pitch (${detected}Hz) must be near 440Hz`);
  });

  // 3. Test Deep Shadow DOM Query Selector
  await t.test('Wheel 3: query-selector-shadow-dom deep DOM piercing bundle', () => {
    const qsdPath = path.resolve(__dirname, '../../node_modules/query-selector-shadow-dom/dist/querySelectorShadowDom.js');
    assert.ok(fs.existsSync(qsdPath), 'querySelectorShadowDom bundle must exist on disk');
    const code = fs.readFileSync(qsdPath, 'utf8');
    const sandbox = { document: { head: { attachShadow: () => {} } }, Node: { DOCUMENT_FRAGMENT_NODE: 11, DOCUMENT_NODE: 9 } };
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    assert.ok(sandbox.querySelectorShadowDom, 'querySelectorShadowDom global must be created');
    assert.strictEqual(typeof sandbox.querySelectorShadowDom.querySelectorDeep, 'function');
    assert.strictEqual(typeof sandbox.querySelectorShadowDom.querySelectorAllDeep, 'function');
  });

  // 4. Test Cheerio & Node HTML Parser for scraping & overlay templates
  await t.test('Wheel 4: Cheerio & node-html-parser overlay parsing', () => {
    const cheerio = require('cheerio');
    const $ = cheerio.load('<div class="cdk-overlay-container"><div class="mat-mdc-menu-panel"><button>2.0x</button></div></div>');
    assert.strictEqual($('.mat-mdc-menu-panel button').text(), '2.0x');

    // Clone and inject 2.5x and 3.0x
    $('.mat-mdc-menu-panel').append('<button class="air10-speed-opt">2.5x</button>');
    $('.mat-mdc-menu-panel').append('<button class="air10-speed-opt">3.0x</button>');

    assert.strictEqual($('.mat-mdc-menu-panel button').length, 3, 'Must contain 3 buttons after injection');
    assert.strictEqual($('.mat-mdc-menu-panel .air10-speed-opt').last().text(), '3.0x');
  });

  // 5. Test Fast Deep Equal & Nanoid for State Fingerprinting
  await t.test('Wheel 5: Fast Deep Equal & Nanoid action telemetry', () => {
    const equal = require('fast-deep-equal');
    const { nanoid } = require('nanoid');

    const stateA = { speed: 3.0, preservesPitch: true, target: 'notebooklm' };
    const stateB = { speed: 3.0, preservesPitch: true, target: 'notebooklm' };
    const stateC = { speed: 2.0, preservesPitch: true, target: 'notebooklm' };

    assert.strictEqual(equal(stateA, stateB), true, 'Identical states must equal');
    assert.strictEqual(equal(stateA, stateC), false, 'Different speed states must not equal');

    const actionId = nanoid();
    assert.ok(typeof actionId === 'string' && actionId.length > 5, 'Nanoid must generate valid string ID');
  });

  // 6. Test Web Audio Utilities & AudioBuffer
  await t.test('Wheel 6: AudioBuffer and Web Audio utilities', () => {
    const ab = require('audio-buffer');
    const AudioBufferClass = ab.default || ab;
    assert.ok(AudioBufferClass, 'AudioBuffer class must be available');
    const buf = new AudioBufferClass({ length: 1024, numberOfChannels: 2, sampleRate: 44100 });
    assert.strictEqual(buf.length, 1024);
    assert.strictEqual(buf.numberOfChannels, 2);
  });
});
