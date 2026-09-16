#!/usr/bin/env python3
"""Artifact-level provenance court for the distributable release ZIP (Issue #19)."""

import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

REQUIRED_MEMBERS = {"NOTICE", "PROVENANCE_THIRD_PARTY.md"}


def verify_release_zip(zip_path: Path) -> dict:
    if not zip_path.exists():
        raise ValueError(f"release ZIP missing: {zip_path}")
    with zipfile.ZipFile(zip_path, "r") as archive:
        members = set(archive.namelist())
        missing = REQUIRED_MEMBERS - members
        if missing:
            raise ValueError(f"release ZIP missing required provenance members: {sorted(missing)}")
        notice = archive.read("NOTICE").decode("utf-8")
        provenance = archive.read("PROVENANCE_THIRD_PARTY.md").decode("utf-8")
    if "SoundTouchJS" not in notice or "MPL-2.0" not in notice:
        raise ValueError("NOTICE does not contain expected SoundTouchJS/MPL-2.0 attribution")
    if "SoundTouchJS" not in provenance or "MPL-2.0" not in provenance:
        raise ValueError("PROVENANCE_THIRD_PARTY.md does not contain expected SoundTouchJS/MPL-2.0 lineage")
    return {"status": "PASS", "members": sorted(members)}


class TestReleaseArtifactProvenance(unittest.TestCase):
    def _build_zip(self, include_notice=True, include_provenance=True, wrong_lineage=False):
        tmp = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
        tmp.close()
        path = Path(tmp.name)
        with zipfile.ZipFile(path, "w") as archive:
            archive.writestr("manifest.json", "{}")
            if include_notice:
                archive.writestr("NOTICE", "SoundTouchJS MPL-2.0" if not wrong_lineage else "OtherProject MIT")
            if include_provenance:
                archive.writestr("PROVENANCE_THIRD_PARTY.md", "SoundTouchJS | MPL-2.0" if not wrong_lineage else "OtherProject | MIT")
        self.addCleanup(path.unlink, missing_ok=True)
        return path

    def test_complete_artifact_passes(self):
        self.assertEqual(verify_release_zip(self._build_zip())["status"], "PASS")

    def test_missing_notice_mutant_fails_closed(self):
        with self.assertRaises(ValueError):
            verify_release_zip(self._build_zip(include_notice=False))

    def test_missing_provenance_mutant_fails_closed(self):
        with self.assertRaises(ValueError):
            verify_release_zip(self._build_zip(include_provenance=False))

    def test_wrong_lineage_mutant_fails_closed(self):
        with self.assertRaises(ValueError):
            verify_release_zip(self._build_zip(wrong_lineage=True))


if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1].lower().endswith(".zip"):
        result = verify_release_zip(Path(sys.argv[1]))
        print(f"ARTIFACT_PROVENANCE_{result['status']} members={len(result['members'])}")
    else:
        unittest.main()
