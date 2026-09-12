const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { setupMockBrowser, loadModules } = require('../test_harness');

test('AIR10 Study Tools Schema Verification', async () => {
  setupMockBrowser();
  loadModules();
  
  // Load modules into sandbox
  assert.ok(window.__AIR10_STUDY_TOOLS__, 'window.__AIR10_STUDY_TOOLS__ must be defined');

  const toolNames = Object.keys(window.__AIR10_STUDY_TOOLS__);
  const expectedTools = [
    'study_verify_native_origin',
    'study_get_state',
    'study_get_question',
    'study_get_options',
    'study_get_feedback',
    'study_select_option',
    'study_next',
    'study_get_progress',
    'study_open_notebook',
    'study_health'
  ];

  for (const name of expectedTools) {
    assert.ok(toolNames.includes(name), `Tool ${name} must be registered`);
    assert.strictEqual(typeof window.__AIR10_STUDY_TOOLS__[name], 'function');
  }

  // Verify study_health returns healthy
  const health = await window.__AIR10_STUDY_TOOLS__.study_health();
  assert.strictEqual(health.status, 'HEALTHY');
  assert.strictEqual(health.bridge_version, '2.1.0');
});
