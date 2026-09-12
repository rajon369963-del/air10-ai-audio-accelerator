const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

test('Version Consistency Across All 5 Production Surfaces', async () => {
  const rootDir = path.resolve(__dirname, '../../');

  // 1. manifest.json
  const manifestPath = path.join(rootDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const targetVersion = manifest.version;
  assert.strictEqual(targetVersion, '2.5.3', 'manifest.json must be version 2.5.3');

  // 2. package.json
  const pkgPath = path.join(rootDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  assert.strictEqual(pkg.version, targetVersion, 'package.json version must match manifest.json');

  // 3. package-lock.json
  const pkgLockPath = path.join(rootDir, 'package-lock.json');
  const pkgLock = JSON.parse(fs.readFileSync(pkgLockPath, 'utf8'));
  assert.strictEqual(pkgLock.version, targetVersion, 'package-lock.json top-level version must match');
  if (pkgLock.packages && pkgLock.packages['']) {
    assert.strictEqual(pkgLock.packages[''].version, targetVersion, 'package-lock.json root package version must match');
  }

  // 4. injector.js
  const injectorPath = path.join(rootDir, 'injector.js');
  const injectorContent = fs.readFileSync(injectorPath, 'utf8');
  assert.ok(
    injectorContent.includes(`v${targetVersion}`),
    `injector.js must contain console banner with v${targetVersion}`
  );

  // 5. background.js
  const bgPath = path.join(rootDir, 'background.js');
  const bgContent = fs.readFileSync(bgPath, 'utf8');
  assert.ok(
    bgContent.includes(`version: '${targetVersion}'`) || bgContent.includes(`version: "${targetVersion}"`),
    `background.js must contain heartbeat with version '${targetVersion}'`
  );
});
