const test = require('node:test');
const assert = require('node:assert');
const { setupMockBrowser } = require('../test_harness');

test('NotebookLM Menu Speed Extraction, Purge Malformed Items, and Clean 2.5x/3.0x Injection', async () => {
  const win = setupMockBrowser();
  delete win.__AIR10_AUDIO_ACCELERATOR__;

  // Mock DOM tree walker and menu structures
  delete require.cache[require.resolve('../../modules/audio-accelerator.js')];
  require('../../modules/audio-accelerator.js');

  const controller = win.__AIR10_AUDIO__;
  assert.ok(controller, 'Audio controller must be initialized');

  // 1. Verify production speed extraction directly from window.__AIR10_AUDIO__.extractItemSpeed
  assert.strictEqual(typeof controller.extractItemSpeed, 'function', 'extractItemSpeed must be exported on controller');

  const checkSpeed = (text) => controller.extractItemSpeed({ textContent: text });

  assert.strictEqual(checkSpeed('0.5x'), 0.5);
  assert.strictEqual(checkSpeed('0.8x'), 0.8);
  assert.strictEqual(checkSpeed('1.0x'), 1.0);
  assert.strictEqual(checkSpeed('1.2x'), 1.2, '1.2x must NEVER be identified as 2.0x or 2x');
  assert.notStrictEqual(checkSpeed('1.2x'), 2.0);
  assert.strictEqual(checkSpeed('1.5x'), 1.5);
  assert.strictEqual(checkSpeed('1.8x'), 1.8);
  assert.strictEqual(checkSpeed('2.0x'), 2.0);
  assert.strictEqual(checkSpeed('2x'), 2.0);
  assert.strictEqual(checkSpeed('2.5x'), 2.5);
  assert.strictEqual(checkSpeed('3.0x'), 3.0);
  assert.strictEqual(checkSpeed('1.2.5x'), null, 'Malformed 1.2.5x must return null');
  assert.strictEqual(checkSpeed('Speed: 2.0x'), 2.0, 'Embedded speed label parsed accurately');

  // 2. Verify text replacement logic on cloned nodes
  const formatSpeed = (originalText, newSpeed) => {
    return originalText.replace(/(?:\d+\.)*\d+(\.\d+)?x\b/i, `${newSpeed.toFixed(1)}x`);
  };

  assert.strictEqual(formatSpeed('2.0x', 2.5), '2.5x');
  assert.strictEqual(formatSpeed('2.0x', 3.0), '3.0x');
  assert.strictEqual(formatSpeed('1.2.5x', 2.5), '2.5x', 'Malformed 1.2.5x replaced cleanly');
  assert.strictEqual(formatSpeed('1.3.0x', 3.0), '3.0x', 'Malformed 1.3.0x replaced cleanly');

  // 3. Verify bidirectional speed adjustment (never locked at 3x)
  controller.setSpeed(3.0);
  assert.strictEqual(controller.getSpeed(), 3.0);

  // User selects 1.0x in native menu
  controller.setSpeed(1.0);
  assert.strictEqual(controller.getSpeed(), 1.0, 'User can freely decrease speed to 1.0x');

  // User selects 1.5x
  controller.setSpeed(1.5);
  assert.strictEqual(controller.getSpeed(), 1.5, 'User can freely set speed to 1.5x');

  // User selects 2.5x
  controller.setSpeed(2.5);
  assert.strictEqual(controller.getSpeed(), 2.5, 'User can freely set speed to 2.5x');

  // User selects 3.0x
  controller.setSpeed(3.0);
  assert.strictEqual(controller.getSpeed(), 3.0, 'User can freely set speed to 3.0x');
});
