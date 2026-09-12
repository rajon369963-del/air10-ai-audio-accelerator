const test = require('node:test');
const assert = require('node:assert');
const { setupMockBrowser } = require('../test_harness');

test('Audio Accelerator 2.0x Preservation and Speed Ladder', () => {
  setupMockBrowser();
  
  delete require.cache[require.resolve('../../modules/audio-accelerator.js')];
  require('../../modules/audio-accelerator.js');

  assert.ok(window.__AIR10_AUDIO__, 'Audio controller must be initialized');
  assert.strictEqual(window.__AIR10_AUDIO__.getSpeed(), 2.0, 'Default speed must be 2.0x');

  // Change speed
  window.__AIR10_AUDIO__.setSpeed(2.5);
  assert.strictEqual(window.__AIR10_AUDIO__.getSpeed(), 2.5);
  assert.strictEqual(window.localStorage.getItem('air10_ai_speed'), '2.5');

  // Cycle speed
  window.__AIR10_AUDIO__.cycleSpeed();
  assert.strictEqual(window.__AIR10_AUDIO__.getSpeed(), 3.0);

  // Global Shortcut: Option+S
  window.dispatchEvent({
    type: 'keydown',
    altKey: true,
    code: 'KeyS',
    key: 's',
    preventDefault: () => {},
    stopPropagation: () => {}
  });
  // Next in ladder: 3.0 -> 1.5
  assert.strictEqual(window.__AIR10_AUDIO__.getSpeed(), 1.5, 'Option+S must cycle to 1.5x');

  // Typing protection: When activeElement is an INPUT, Option+S must NOT cycle speed
  const inputEl = { tagName: 'INPUT', isContentEditable: false };
  window.document.activeElement = inputEl;
  window.dispatchEvent({
    type: 'keydown',
    altKey: true,
    code: 'KeyS',
    key: 's',
    preventDefault: () => {},
    stopPropagation: () => {}
  });
  assert.strictEqual(window.__AIR10_AUDIO__.getSpeed(), 1.5, 'Typing protection must prevent speed cycling in input elements');
  window.document.activeElement = null;
});
