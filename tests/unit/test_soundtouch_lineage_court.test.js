const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { SoundTouchLineageCourt } = require('../../modules/audio/soundtouch_lineage_court.js');

test('T061: SoundTouch and SoundTouchJS Upstream Lineage & License Court - Positive Verification', (t) => {
  const repoRoot = path.resolve(__dirname, '../../');
  const result = SoundTouchLineageCourt.runFullCourt(repoRoot);

  assert.strictEqual(result.pass, true, `Expected court to pass, errors: ${JSON.stringify(result)}`);
  assert.strictEqual(result.lineage.valid, true);
  assert.strictEqual(result.notice.valid, true);
  assert.strictEqual(result.lineage.errors.length, 0);
  assert.strictEqual(result.notice.errors.length, 0);

  // Directly verify parsed manifest content
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'LEGAL_LINEAGE.json'), 'utf-8'));
  assert.strictEqual(manifest.upstream_lineage.soundtouch_cpp.author, 'Olli Parviainen');
  assert.strictEqual(manifest.upstream_lineage.soundtouch_cpp.spdx_id, 'LGPL-2.1-only');
  assert.strictEqual(manifest.upstream_lineage.soundtouchjs.porter, 'Jakub Fiala');
  assert.strictEqual(manifest.upstream_lineage.soundtouchjs.spdx_id, 'LGPL-2.1-only');
  assert.strictEqual(manifest.dsp_redistribution_contract.dynamic_linking_compliance, true);
});
