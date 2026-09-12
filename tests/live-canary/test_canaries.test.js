const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { setupMockBrowser } = require('../test_harness');

test('Live Canary: Chrome DevTools MCP devtoolstooldiscovery Flow', async () => {
  const html = fs.readFileSync(path.join(__dirname, '../fixtures/mcq_question.html'), 'utf-8');
  setupMockBrowser(html);

  [
    '../../modules/telemetry.js',
    '../../modules/gemini-route-observer.js',
    '../../modules/gemini-state-parser.js',
    '../../modules/gemini-study-tools.js'
  ].forEach(mod => {
    delete require.cache[require.resolve(mod)];
    require(mod);
  });

  // Simulate how Chrome DevTools MCP discovers third-party page tools
  // (matches McpPage.js getToolGroups)
  let discoveredGroups = [];
  const event = new CustomEvent('devtoolstooldiscovery');
  event.respondWith = (group) => {
    discoveredGroups.push(group);
    if (!window.__dtmcp) window.__dtmcp = {};
    window.__dtmcp.toolGroups = discoveredGroups;
    window.__dtmcp.executeTool = async (name, args) => {
      for (const g of window.__dtmcp.toolGroups) {
        const tool = g.tools.find(t => t.name === name);
        if (tool) return await tool.execute(args);
      }
      throw new Error(`Tool ${name} not found`);
    };
  };

  window.dispatchEvent(event);

  assert.strictEqual(discoveredGroups.length, 1, 'Exactly one tool group discovered');
  assert.strictEqual(discoveredGroups[0].name, 'AIR10 Gemini Student Bridge');
  assert.strictEqual(discoveredGroups[0].tools.length, 10, 'Exactly 10 tools registered');

  // Test execution via DevTools MCP handler
  const state = await window.__dtmcp.executeTool('study_get_state', {});
  assert.strictEqual(state.activity_kind, 'QUIZ');
  assert.strictEqual(state.question_visible, true);

  const question = await window.__dtmcp.executeTool('study_get_question', {});
  assert.ok(question.text.includes('Buchholz relay'));
  assert.strictEqual(question.options.length, 4);

  // Select option A via DevTools MCP
  const selectRes = await window.__dtmcp.executeTool('study_select_option', {
    option: 'A',
    action_id: 'canary_act_001'
  });
  assert.strictEqual(selectRes.status, 'SELECTED');
  assert.strictEqual(selectRes.verified, true);
});

test('Live Canary: Full 10-Step Learner Flow (Q1 -> Click -> Readback -> Next -> Q2)', async () => {
  const html = fs.readFileSync(path.join(__dirname, '../fixtures/mcq_question.html'), 'utf-8');
  setupMockBrowser(html);

  [
    '../../modules/telemetry.js',
    '../../modules/gemini-route-observer.js',
    '../../modules/gemini-state-parser.js',
    '../../modules/gemini-study-tools.js'
  ].forEach(mod => {
    delete require.cache[require.resolve(mod)];
    require(mod);
  });

  const tools = window.__AIR10_STUDY_TOOLS__;

  // Step 1: Health check
  const h = await tools.study_health();
  assert.strictEqual(h.status, 'HEALTHY');

  // Step 2: Get initial state
  const s1 = await tools.study_get_state();
  assert.strictEqual(s1.activity_kind, 'QUIZ');
  assert.strictEqual(s1.question_visible, true);

  // Step 3: Get Q1 without spoilers
  const q1 = await tools.study_get_question();
  assert.ok(q1.text.includes('Buchholz relay'));
  assert.strictEqual(q1.selected, null);

  // Step 4: Verify Next button is disabled while question is unresolved
  const earlyNext = await tools.study_next({ action_id: 'flow_early_next' });
  assert.strictEqual(earlyNext.status, 'DISABLED', 'Next must be disabled before question is resolved');

  // Step 5: Rajon chooses answer A
  const selRes = await tools.study_select_option({
    option: 'A',
    action_id: 'flow_step_4',
    question_fingerprint: q1.question_fingerprint
  });
  assert.strictEqual(selRes.status, 'SELECTED');
  assert.strictEqual(selRes.verified, true);
  assert.strictEqual(selRes.option, 'A');

  // Step 6: Readback confirms option A selected
  const s2 = await tools.study_get_state();
  assert.strictEqual(s2.selected_option, 'A');

  // Step 7: Resolve question - enable Next button and attach Q2 transition handler
  const nextBtn = document.querySelector('[data-test-id="next-button"]');
  nextBtn.removeAttribute('disabled');
  nextBtn.setAttribute('aria-disabled', 'false');

  // Simulate Gemini SPA question transition when Next is clicked
  nextBtn.addEventListener('click', () => {
    const qEl = document.querySelector('[data-test-id="question-text"]');
    if (qEl) {
      qEl.innerText = 'What happens to the rotor current in a 3-phase induction motor during locked-rotor standstill condition?';
    }
    const progEl = document.querySelector('[role="progressbar"]');
    if (progEl) {
      progEl.setAttribute('aria-valuenow', '2');
      const span = progEl.querySelector('span');
      if (span) span.innerText = 'Question 2 of 11';
    }
    // Deselect all options for new question
    document.querySelectorAll('[role="radio"]').forEach(el => {
      el.setAttribute('aria-checked', 'false');
      el.classList.remove('selected');
    });
  });

  // Step 8: Advance to next question
  const nextRes = await tools.study_next({
    action_id: 'flow_step_6',
    question_fingerprint: q1.question_fingerprint
  });
  assert.strictEqual(nextRes.status, 'ADVANCED', 'Must advance to next question');
  assert.strictEqual(nextRes.verified, true, 'Transition must be verified');
  assert.notStrictEqual(nextRes.after_fingerprint, q1.question_fingerprint);

  // Step 9: Verify Q2 visible and unselected (Zero Spoiler)
  const q2 = await tools.study_get_question();
  assert.strictEqual(q2.question_fingerprint, nextRes.after_fingerprint);
  assert.ok(q2.text.includes('induction motor'));
  assert.strictEqual(q2.selected, null);

  // Step 10: Progress check shows Question 2
  const prog = await tools.study_get_progress();
  assert.strictEqual(prog.current, 2);
  assert.strictEqual(prog.total, 11);
});
