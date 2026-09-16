#!/usr/bin/env python3
"""Release ZIP third-party provenance court for Issue #19.

This court separates repository-level attribution from distribution-artifact
attribution. It verifies both the canonical archive recipe and the bytes inside
an exact generated ZIP, and includes known-bad mutants that must fail closed.
"""

from __future__ import annotations

import argparse
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github" / "workflows" / "release-gate.yml"
REQUIRED_MEMBERS = {"NOTICE", "PROVENANCE_THIRD_PARTY.md"}
CANONICAL_MEMBERS = [
    "manifest.json",
    "injector.js",
    "background.js",
    "modules",
    "icons",
    "NOTICE",
    "PROVENANCE_THIRD_PARTY.md",
]


def verify_release_zip(zip_path: Path) -> dict:
    if not zip_path.is_file():
        raise ValueError(f"release ZIP missing: {zip_path}")

    with zipfile.ZipFile(zip_path, "r") as archive:
        members = set(archive.namelist())
        missing = sorted(REQUIRED_MEMBERS - members)
        if missing:
            raise ValueError(f"release ZIP missing required attribution members: {missing}")

        notice = archive.read("NOTICE").decode("utf-8")
        provenance = archive.read("PROVENANCE_THIRD_PARTY.md").decode("utf-8")

    for token in ("SoundTouchJS", "MPL-2.0"):
        if token not in notice:
            raise ValueError(f"NOTICE missing required lineage token: {token}")
        if token not in provenance:
            raise ValueError(f"provenance missing required lineage token: {token}")

    return {
        "status": "PASS_BOUNDED_RELEASE_ZIP_PROVENANCE",
        "member_count": len(members),
        "notice_present": True,
        "provenance_present": True,
    }


def build_git_archive(zip_path: Path, members: list[str]) -> None:
    subprocess.run(
        ["git", "archive", "--format=zip", "-o", str(zip_path), "HEAD", *members],
        cwd=ROOT,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )


class TestReleaseZipProvenanceCourt(unittest.TestCase):
    def test_workflow_recipe_names_required_members(self):
        workflow = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("git archive --format=zip", workflow)
        self.assertIn("NOTICE", workflow)
        self.assertIn("PROVENANCE_THIRD_PARTY.md", workflow)
        self.assertIn("tests/test_release_zip_provenance_court.py --archive", workflow)

    def test_exact_head_archive_contains_bound_attribution(self):
        with tempfile.TemporaryDirectory() as td:
            artifact = Path(td) / "release.zip"
            build_git_archive(artifact, CANONICAL_MEMBERS)
            result = verify_release_zip(artifact)
            self.assertEqual(result["status"], "PASS_BOUNDED_RELEASE_ZIP_PROVENANCE")

    def test_remove_notice_mutant_fails_closed(self):
        with tempfile.TemporaryDirectory() as td:
            artifact = Path(td) / "missing-notice.zip"
            build_git_archive(artifact, [m for m in CANONICAL_MEMBERS if m != "NOTICE"])
            with self.assertRaisesRegex(ValueError, "missing required attribution"):
                verify_release_zip(artifact)

    def test_wrong_lineage_mutant_fails_closed(self):
        with tempfile.TemporaryDirectory() as td:
            good = Path(td) / "good.zip"
            mutant = Path(td) / "wrong-lineage.zip"
            build_git_archive(good, CANONICAL_MEMBERS)

            with zipfile.ZipFile(good, "r") as source, zipfile.ZipFile(mutant, "w") as target:
                for info in source.infolist():
                    data = source.read(info.filename)
                    if info.filename == "PROVENANCE_THIRD_PARTY.md":
                        text = data.decode("utf-8").replace("SoundTouchJS", "UNRELATED_UPSTREAM")
                        data = text.encode("utf-8")
                    target.writestr(info, data)

            with self.assertRaisesRegex(ValueError, "provenance missing required lineage"):
                verify_release_zip(mutant)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", type=Path)
    args, remaining = parser.parse_known_args()
    if args.archive:
        print(verify_release_zip(args.archive))
    else:
        unittest.main(argv=[__file__, *remaining])
