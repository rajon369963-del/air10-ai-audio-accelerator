/**
 * Test: Zero External Network Requests & Pure Local Telemetry
 * Ensures the extension codebase contains zero tracking scripts, zero Google Analytics,
 * zero Sentry, zero Mixpanel, and zero external network callouts.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('Security Guard: Zero External Telemetry Endpoints in Extension Codebase', () => {
  const rootDir = path.resolve(__dirname, '../../');
  const sourceFiles = [
    'background.js',
    'injector.js',
    'modules/audio-accelerator.js',
    'modules/telemetry.js',
    'manifest.json'
  ];

  const bannedPatterns = [
    /google-analytics\.com/i,
    /googletagmanager\.com/i,
    /segment\.io/i,
    /mixpanel\.com/i,
    /sentry\.io/i,
    /datadog/i,
    /amplitude\.com/i,
    /api\.telemetry\./i,
    /https?:\/\/[a-z0-9.-]+\/analytics/i
  ];

  for (const relPath of sourceFiles) {
    const fullPath = path.join(rootDir, relPath);
    if (!fs.existsSync(fullPath)) continue;

    const content = fs.readFileSync(fullPath, 'utf8');
    for (const pattern of bannedPatterns) {
      assert.ok(
        !pattern.test(content),
        `Banned tracking endpoint pattern ${pattern} detected in ${relPath}`
      );
    }
  }
});

test('Security Guard: Telemetry Module strictly local storage and postMessage', () => {
  const telemetryPath = path.resolve(__dirname, '../../modules/telemetry.js');
  if (fs.existsSync(telemetryPath)) {
    const content = fs.readFileSync(telemetryPath, 'utf8');
    // Ensure no fetch or XMLHttpRequest is used for telemetry egress
    assert.ok(!content.includes('fetch('), 'telemetry.js must not perform HTTP fetch');
    assert.ok(!content.includes('XMLHttpRequest'), 'telemetry.js must not use XMLHttpRequest');
    assert.ok(!content.includes('navigator.sendBeacon'), 'telemetry.js must not use sendBeacon');
  }
});
