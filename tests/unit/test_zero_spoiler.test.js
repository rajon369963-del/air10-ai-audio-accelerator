const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { setupMockBrowser, loadModules } = require('../test_harness');

test('Zero-Spoiler Invariant: Question Schema Never Exposes Answer', async () => {
  const html = fs.readFileSync(path.join(__dirname, '../fixtures/mcq_question.html'), 'utf-8');
  setupMockBrowser(html);
  loadModules();

  const question = await window.__AIR10_STUDY_TOOLS__.study_get_question();
  assert.strictEqual(question.question_visible, true);
  
  // Verify strictly that no spoiler keys exist
  assert.strictEqual(question.answer, undefined, 'Must not contain answer field');
  assert.strictEqual(question.is_correct, undefined, 'Must not contain is_correct field');
  assert.strictEqual(question.correct_option, undefined, 'Must not contain correct_option field');
  assert.strictEqual(question.solution, undefined, 'Must not contain solution field');

  // Check each option object
  for (const opt of question.options) {
    assert.strictEqual(opt.is_correct, undefined, 'Option must not indicate correctness');
    assert.strictEqual(opt.correct, undefined, 'Option must not indicate correctness');
  }
});
