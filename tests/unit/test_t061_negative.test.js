const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { SoundTouchLineageCourt } = require('../../modules/audio/soundtouch_lineage_court.js');

test('T061: SoundTouch Upstream Lineage & License Court - Hostile Negative Test & Mutant Kills', async (t) => {
  const repoRoot = path.resolve(__dirname, '../../');
  const knownBadPath = path.join(repoRoot, 'tests', 'fixtures', 'known_bad_t061.json');
  assert.strictEqual(fs.existsSync(knownBadPath), true, 'known_bad_t061.json fixture must exist');

  const knownBadData = JSON.parse(fs.readFileSync(knownBadPath, 'utf-8'));
  const badResult = SoundTouchLineageCourt.evaluateLineage(knownBadData);

  assert.strictEqual(badResult.valid, false, 'Known bad fixture MUST be rejected');
  assert.ok(badResult.errors.length >= 3, `Expected at least 3 errors, got: ${badResult.errors.length}`);

  // Base valid manifest to mutate
  const validManifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'LEGAL_LINEAGE.json'), 'utf-8'));

  // Mutant 1: Tampered C++ Author
  const mutant1 = JSON.parse(JSON.stringify(validManifest));
  mutant1.upstream_lineage.soundtouch_cpp.author = 'Anonymous Impostor';
  const m1Result = SoundTouchLineageCourt.evaluateLineage(mutant1);
  assert.strictEqual(m1Result.valid, false, 'Mutant 1 (spoofed C++ author) must be rejected');
  assert.ok(m1Result.errors.some(e => e.includes('Invalid soundtouch_cpp author')));

  // Mutant 2: Tampered License / SPDX (e.g. claiming proprietary or MIT for upstream LGPL library)
  const mutant2 = JSON.parse(JSON.stringify(validManifest));
  mutant2.upstream_lineage.soundtouch_cpp.spdx_id = 'MIT';
  const m2Result = SoundTouchLineageCourt.evaluateLineage(mutant2);
  assert.strictEqual(m2Result.valid, false, 'Mutant 2 (falsified SPDX id) must be rejected');
  assert.ok(m2Result.errors.some(e => e.includes('Invalid soundtouch_cpp SPDX license')));

  // Mutant 3: Missing or Altered WSOLA Algorithm Declaration
  const mutant3 = JSON.parse(JSON.stringify(validManifest));
  mutant3.upstream_lineage.soundtouch_cpp.algorithm = 'Simple Resampling (No WSOLA)';
  const m3Result = SoundTouchLineageCourt.evaluateLineage(mutant3);
  assert.strictEqual(m3Result.valid, false, 'Mutant 3 (non-WSOLA algorithm) must be rejected');

  // Mutant 4: Stripped LGPL Source Offer
  const mutant4 = JSON.parse(JSON.stringify(validManifest));
  mutant4.dsp_redistribution_contract.lgpl_source_offer = '';
  const m4Result = SoundTouchLineageCourt.evaluateLineage(mutant4);
  assert.strictEqual(m4Result.valid, false, 'Mutant 4 (empty source offer) must be rejected');

  // Mutant 5: Mutated SoundTouchJS porter
  const mutant5 = JSON.parse(JSON.stringify(validManifest));
  mutant5.upstream_lineage.soundtouchjs.porter = 'Unverified Porter';
  const m5Result = SoundTouchLineageCourt.evaluateLineage(mutant5);
  assert.strictEqual(m5Result.valid, false, 'Mutant 5 (unverified porter) must be rejected');

  // Mutant 6: Corrupted NOTICE evaluation
  const tmpNotice = path.join(repoRoot, 'tests', 'fixtures', 'corrupted_notice.tmp');
  try {
    fs.writeFileSync(tmpNotice, 'Corrupted notice without authors or licenses');
    const noticeResult = SoundTouchLineageCourt.evaluateNoticeFile(tmpNotice);
    assert.strictEqual(noticeResult.valid, false, 'Corrupted notice file must be rejected');
    assert.ok(noticeResult.errors.length >= 3, 'Corrupted notice must have multiple failures');
  } finally {
    if (fs.existsSync(tmpNotice)) fs.unlinkSync(tmpNotice);
  }
});
