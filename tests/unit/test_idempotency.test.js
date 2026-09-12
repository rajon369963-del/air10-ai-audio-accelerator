const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { setupMockBrowser, loadModules } = require('../test_harness');

test('Action Idempotency and Stale Fingerprint Protection', async () => {
  const html = fs.readFileSync(path.join(__dirname, '../fixtures/mcq_question.html'), 'utf-8');
  setupMockBrowser(html);
  loadModules();

  const q = await window.__AIR10_STUDY_TOOLS__.study_get_question();
  const qFp = q.question_fingerprint;
  const actionId = 'act_test_idem_001';

  // 1. Initial selection
  const res1 = await window.__AIR10_STUDY_TOOLS__.study_select_option({
    option: 'A',
    action_id: actionId,
    question_fingerprint: qFp
  });
  assert.strictEqual(res1.status, 'SELECTED');
  assert.strictEqual(res1.verified, true);
  assert.strictEqual(res1.option, 'A');

  // 2. Duplicate action_id MUST return NOOP_IDEMPOTENT
  const res2 = await window.__AIR10_STUDY_TOOLS__.study_select_option({
    option: 'A',
    action_id: actionId,
    question_fingerprint: qFp
  });
  assert.strictEqual(res2.status, 'NOOP_IDEMPOTENT');
  assert.strictEqual(res2.action_id, actionId);

  // 3. Stale question fingerprint MUST be rejected
  const res3 = await window.__AIR10_STUDY_TOOLS__.study_select_option({
    option: 'B',
    action_id: 'act_test_stale_002',
    question_fingerprint: 'q_stale_fingerprint_xyz'
  });
  assert.strictEqual(res3.status, 'STALE_QUESTION_REJECTED');

  // 4. Stale before_hash MUST be rejected
  const res4 = await window.__AIR10_STUDY_TOOLS__.study_select_option({
    option: 'B',
    action_id: 'act_test_stale_hash_003',
    question_fingerprint: qFp,
    before_hash: 'hash_stale_00000'
  });
  assert.strictEqual(res4.status, 'STALE_STATE_REJECTED');

  // 5. Correct before_hash succeeds
  const state = await window.__AIR10_STUDY_TOOLS__.study_get_state();
  const stateCopy = { ...state };
  delete stateCopy.timestamp;
  const currentHash = window.__AIR10_PARSER__.fastHash(JSON.stringify(stateCopy));
  const res5 = await window.__AIR10_STUDY_TOOLS__.study_select_option({
    option: 'B',
    action_id: 'act_test_valid_hash_004',
    question_fingerprint: qFp,
    before_hash: currentHash
  });
  assert.strictEqual(res5.status, 'SELECTED');
  assert.strictEqual(res5.before_hash, currentHash);

  // 6. study_next stale fingerprint MUST be rejected
  const nextStale = await window.__AIR10_STUDY_TOOLS__.study_next({
    action_id: 'act_next_stale_005',
    question_fingerprint: 'q_stale_nonexistent'
  });
  assert.strictEqual(nextStale.status, 'STALE_QUESTION_REJECTED');

  // 7. study_next disabled button check
  const nextDisabled = await window.__AIR10_STUDY_TOOLS__.study_next({
    action_id: 'act_next_disabled_006',
    question_fingerprint: qFp
  });
  assert.strictEqual(nextDisabled.status, 'DISABLED');
});
