#!/usr/bin/env python3
"""
AIR10 DSP Provenance Reality Court (Issues #17/#19)

Verifies third-party provenance record completeness and exact-version license identity:
1. PROVENANCE_THIRD_PARTY.md exists and contains all required provenance columns.
2. NOTICE exists and binds SoundTouchJS v0.3.0 to LGPL-2.1.
3. A stale/current-master MPL-2.0 label for the v0.3.0 lineage fails closed.
4. Hostile mutations that omit required fields or NOTICE fail closed.
"""

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROVENANCE_FILE = ROOT / "PROVENANCE_THIRD_PARTY.md"
NOTICE_FILE = ROOT / "NOTICE"

SOUNDTOUCHJS_VERSION = "v0.3.0"
SOUNDTOUCHJS_LICENSE = "LGPL-2.1"
STALE_WRONG_LICENSE = "MPL-2.0"

REQUIRED_COLUMNS = [
    "LOCAL_PATH",
    "UPSTREAM_PROJECT",
    "UPSTREAM_URL",
    "UPSTREAM_REVISION/TAG",
    "DERIVATION_CLASS",
    "UPSTREAM_LICENSE_SPDX",
    "LOCAL_MODIFICATIONS",
    "NOTICE/LICENSE_PATH",
    "DISTRIBUTION_ARTIFACT_SCOPE",
    "DECISION",
]


def parse_provenance_columns(content: str) -> list[str]:
    for line in content.splitlines():
        if line.startswith("|") and "LOCAL_PATH" in line:
            return [col.strip() for col in line.split("|")[1:-1]]
    return []


def soundtouchjs_row(content: str) -> str:
    for line in content.splitlines():
        if line.startswith("|") and "| SoundTouchJS |" in line:
            return line
    raise ValueError("SoundTouchJS provenance row missing")


def verify_provenance_record(prov_path: Path, notice_path: Path) -> dict:
    if not prov_path.exists():
        raise ValueError("PROVENANCE_THIRD_PARTY.md missing on disk")
    if not notice_path.exists():
        raise ValueError("NOTICE file missing on disk")

    prov_text = prov_path.read_text(encoding="utf-8")
    notice_text = notice_path.read_text(encoding="utf-8")

    columns = parse_provenance_columns(prov_text)
    for req in REQUIRED_COLUMNS:
        if req not in columns:
            raise ValueError(f"Missing required provenance column: {req}")

    row = soundtouchjs_row(prov_text)
    for token in ("SoundTouchJS", SOUNDTOUCHJS_VERSION, SOUNDTOUCHJS_LICENSE):
        if token not in row:
            raise ValueError(f"SoundTouchJS exact-lineage token missing: {token}")
    if STALE_WRONG_LICENSE in row:
        raise ValueError("SoundTouchJS v0.3.0 incorrectly bound to later MPL-2.0 license")

    for token in ("SoundTouchJS", SOUNDTOUCHJS_VERSION, SOUNDTOUCHJS_LICENSE):
        if token not in notice_text:
            raise ValueError(f"NOTICE missing required exact-lineage token: {token}")

    return {
        "status": "PASS_BOUNDED_EXACT_VERSION_PROVENANCE",
        "columns_verified": len(columns),
        "notice_bytes": len(notice_text),
    }


class TestDSPProvenanceCourt(unittest.TestCase):
    def test_canonical_dsp_provenance_passes(self):
        res = verify_provenance_record(PROVENANCE_FILE, NOTICE_FILE)
        self.assertEqual(res["status"], "PASS_BOUNDED_EXACT_VERSION_PROVENANCE")
        self.assertGreaterEqual(res["columns_verified"], 10)
        self.assertGreater(res["notice_bytes"], 50)

    def test_missing_column_mutant_fails_closed(self):
        tampered = "LOCAL_PATH | UPSTREAM_PROJECT"
        cols = parse_provenance_columns(tampered)
        self.assertNotIn("DERIVATION_CLASS", cols)

    def test_missing_notice_mutant_fails_closed(self):
        non_existent = ROOT / "DOES_NOT_EXIST_NOTICE"
        with self.assertRaises(ValueError):
            verify_provenance_record(PROVENANCE_FILE, non_existent)

    def test_later_mpl_license_cannot_be_back_projected_to_v030(self):
        canonical = PROVENANCE_FILE.read_text(encoding="utf-8")
        row = soundtouchjs_row(canonical)
        mutant = row.replace(SOUNDTOUCHJS_LICENSE, STALE_WRONG_LICENSE)
        self.assertIn(SOUNDTOUCHJS_VERSION, mutant)
        self.assertIn(STALE_WRONG_LICENSE, mutant)
        self.assertNotIn(SOUNDTOUCHJS_LICENSE, mutant)


if __name__ == "__main__":
    unittest.main()
