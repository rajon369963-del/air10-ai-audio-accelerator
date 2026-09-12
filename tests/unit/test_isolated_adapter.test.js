const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { setupMockBrowser } = require('../test_harness');

test('Isolated World Adapter: Human Click & Event Preservation', () => {
  const html = fs.readFileSync(path.join(__dirname, '../fixtures/mcq_question.html'), 'utf-8');
  setupMockBrowser(html);

  // Setup chrome runtime mock
  const sentMessages = [];
  global.chrome = {
    runtime: {
      sendMessage: (msg, cb) => {
        sentMessages.push(msg);
        if (cb) cb({ ack: true });
      }
    }
  };

  delete require.cache[require.resolve('../../modules/gemini_students_adapter.js')];
  require('../../modules/gemini_students_adapter.js');

  // Find option A
  const optA = document.querySelector('[data-option-label="A"]');
  assert.ok(optA, 'Option A element must exist');

  // Dispatch genuine human click (isTrusted = true)
  const clickEvt = {
    type: 'click',
    target: optA,
    isTrusted: true,
    preventDefault: () => {},
    stopPropagation: () => {}
  };
  document.dispatchEvent(clickEvt);

  const ev = sentMessages.find(m => m.data && m.data.event_type === 'OPTION_CLICKED_BY_HUMAN');
  assert.ok(ev, 'OPTION_CLICKED_BY_HUMAN event must be captured');
  assert.strictEqual(ev.type, 'AIR10_EVENT');
  assert.strictEqual(ev.data.payload.option, 'A');
  assert.strictEqual(ev.data.payload.human_authentic, true);
  assert.strictEqual(ev.data.payload.trusted_event, true);
  assert.ok(ev.data.event_id.startsWith('ev_'));
});
