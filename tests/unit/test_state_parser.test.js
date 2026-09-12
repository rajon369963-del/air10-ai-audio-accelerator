const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { setupMockBrowser } = require('../test_harness');

test('Semantic Parser - MCQ Question Fixture', async () => {
  const fixturePath = path.join(__dirname, '../fixtures/mcq_question.html');
  const html = fs.readFileSync(fixturePath, 'utf-8');
  setupMockBrowser(html);

  // Clear module cache and reload
  delete require.cache[require.resolve('../../modules/gemini-state-parser.js')];
  require('../../modules/gemini-state-parser.js');

  const parser = window.__AIR10_PARSER__;
  assert.ok(parser, 'Parser must be loaded');

  const activityKind = parser.detectActivityKind(document);
  assert.strictEqual(activityKind, 'QUIZ');

  const q = parser.extractQuestion(document);
  assert.ok(q, 'Question must be extracted');
  assert.ok(q.text.includes('Buchholz relay'));
  assert.strictEqual(q.options.length, 4);
  assert.strictEqual(q.options[0].label, 'A');
  assert.ok(q.options[0].text.includes('gas accumulation'));
  assert.strictEqual(q.options[1].label, 'B');
  assert.strictEqual(q.selected, null);

  const state = parser.getStudyState(document);
  assert.strictEqual(state.activity_kind, 'QUIZ');
  assert.strictEqual(state.question_visible, true);
  assert.strictEqual(state.feedback_visible, false);
  assert.strictEqual(state.progress.current, 1);
  assert.strictEqual(state.progress.total, 11);
});

test('Semantic Parser - Feedback Visible Fixture', async () => {
  const fixturePath = path.join(__dirname, '../fixtures/feedback_visible.html');
  const html = fs.readFileSync(fixturePath, 'utf-8');
  setupMockBrowser(html);

  delete require.cache[require.resolve('../../modules/gemini-state-parser.js')];
  require('../../modules/gemini-state-parser.js');

  const parser = window.__AIR10_PARSER__;
  const fb = parser.extractFeedback(document);
  assert.strictEqual(fb.feedback_visible, true);
  assert.strictEqual(fb.is_correct, true);
  assert.ok(fb.explanation.includes('conservator tank'));

  const q = parser.extractQuestion(document);
  assert.strictEqual(q.selected, 'A');
  assert.strictEqual(q.feedback_state, 'VISIBLE');
  assert.strictEqual(q.submit_state, 'SUBMITTED');
});

test('Semantic Parser - Diagnostic, Lesson, and Results Fixtures', async () => {
  // Results
  const resHtml = fs.readFileSync(path.join(__dirname, '../fixtures/quiz_results.html'), 'utf-8');
  setupMockBrowser(resHtml);
  delete require.cache[require.resolve('../../modules/gemini-state-parser.js')];
  require('../../modules/gemini-state-parser.js');
  assert.strictEqual(window.__AIR10_PARSER__.detectActivityKind(document), 'RESULT');

  // Diagnostic
  const diagHtml = fs.readFileSync(path.join(__dirname, '../fixtures/diagnostic_quiz.html'), 'utf-8');
  setupMockBrowser(diagHtml);
  delete require.cache[require.resolve('../../modules/gemini-state-parser.js')];
  require('../../modules/gemini-state-parser.js');
  assert.strictEqual(window.__AIR10_PARSER__.detectActivityKind(document), 'DIAGNOSTIC');

  // Lesson
  const lessonHtml = fs.readFileSync(path.join(__dirname, '../fixtures/lesson_view.html'), 'utf-8');
  setupMockBrowser(lessonHtml);
  delete require.cache[require.resolve('../../modules/gemini-state-parser.js')];
  require('../../modules/gemini-state-parser.js');
  assert.strictEqual(window.__AIR10_PARSER__.detectActivityKind(document), 'LESSON');
});
