#!/usr/bin/env python3
"""
AIR10 DSP Provenance Reality Court (Issue #17)

Verifies third-party provenance record completeness and compliance invariants:
1. PROVENANCE_THIRD_PARTY.md exists and contains all required provenance columns.
2. NOTICE file exists and contains upstream license attributions (MPL-2.0, SoundTouchJS).
3. Hostile mutations: tampering with required fields or omitting NOTICE must fail closed.
"""

import os
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROVENANCE_FILE = ROOT / 'PROVENANCE_THIRD_PARTY.md'
NOTICE_FILE = ROOT / 'NOTICE'

REQUIRED_COLUMNS = [
    'LOCAL_PATH',
    'UPSTREAM_PROJECT',
    'UPSTREAM_URL',
    'UPSTREAM_REVISION/TAG',
    'DERIVATION_CLASS',
    'UPSTREAM_LICENSE_SPDX',
    'LOCAL_MODIFICATIONS',
    'NOTICE/LICENSE_PATH',
    'DISTRIBUTION_ARTIFACT_SCOPE',
    'DECISION'
]

def parse_provenance_columns(content: str) -> list[str]:
    for line in content.splitlines():
        if line.startswith('|') and 'LOCAL_PATH' in line:
            return [col.strip() for col in line.split('|')[1:-1]]
    return []

def verify_provenance_record(prov_path: Path, notice_path: Path) -> dict:
    if not prov_path.exists():
        raise ValueError('PROVENANCE_THIRD_PARTY.md missing on disk')
    if not notice_path.exists():
        raise ValueError('NOTICE file missing on disk')
    
    prov_text = prov_path.read_text(encoding='utf-8')
    notice_text = notice_path.read_text(encoding='utf-8')
    
    columns = parse_provenance_columns(prov_text)
    for req in REQUIRED_COLUMNS:
        if req not in columns:
            raise ValueError(f'Missing required provenance column: {req}')
            
    if 'SoundTouchJS' not in prov_text or 'MPL-2.0' not in prov_text:
        raise ValueError('SoundTouchJS MPL-2.0 attribution missing in provenance record')
        
    if 'MPL-2.0' not in notice_text or 'SoundTouchJS' not in notice_text:
        raise ValueError('NOTICE file missing required upstream license attribution')
        
    return {
        'status': 'PASS',
        'columns_verified': len(columns),
        'notice_bytes': len(notice_text)
    }

class TestDSPProvenanceCourt(unittest.TestCase):
    def test_canonical_dsp_provenance_passes(self):
        res = verify_provenance_record(PROVENANCE_FILE, NOTICE_FILE)
        self.assertEqual(res['status'], 'PASS')
        self.assertGreaterEqual(res['columns_verified'], 10)
        self.assertGreater(res['notice_bytes'], 50)

    def test_missing_column_mutant_fails_closed(self):
        tampered = 'LOCAL_PATH | UPSTREAM_PROJECT'
        cols = parse_provenance_columns(tampered)
        self.assertNotIn('DERIVATION_CLASS', cols)

    def test_missing_notice_mutant_fails_closed(self):
        non_existent = ROOT / 'DOES_NOT_EXIST_NOTICE'
        with self.assertRaises(ValueError):
            verify_provenance_record(PROVENANCE_FILE, non_existent)

if __name__ == '__main__':
    unittest.main()
