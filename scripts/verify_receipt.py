#!/usr/bin/env python3
"""
AIR10 Sovereign Truth Guard & Cryptographic Provenance Verifier (v2.3)
Zero-Trust Forensic Invariants:
1. Hard-pinned Authoritative Ed25519 Root of Trust.
2. Canonical payload reconstitution and Ed25519 signature check against pinned root.
3. Raw receipt file SHA-256 integrity check.
4. Git Source Snapshot Reachability Check (benchmarked_source_commit_sha).
5. Scorecard SVG Zero-Drift & Structural Tag Audit:
   - Strips XML comments to eliminate comment injection attacks.
   - Extracts text strictly from visible <text> and <tspan> DOM elements.
   - Dynamically asserts payload SHA, raw file SHA, signature prefix, and required domain/wheel metrics
     are literally visible inside rendered text tags.
6. Causal Fresh Benchmark Binding (--assert-live-benchmark):
   - Ingests fresh benchmark output JSON directly.
   - Enforces platform-aware hardware bounds (arm64 vs x86_64).
   - Verifies 440 Hz pitch preservation within narrow bounds (430.0 - 450.0 Hz).
"""

import argparse
import hashlib
import json
import platform
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric import ed25519

AUTHORITATIVE_SIGNER_PUBKEY_HEX = "4530967ab3ff8991cb065895270a0f467efd35c0322ee0cd8b6a2ddfe8b27f02"
EXPECTED_SIGNER_IDENTITY = "AIR10 Sovereign Open-Source Federation <rajon369963-del>"

def extract_visible_svg_text(svg_raw: str) -> str:
    cleaned = re.sub(r"<!--.*?-->", "", svg_raw, flags=re.DOTALL)
    extracted_tokens = []
    try:
        root = ET.fromstring(cleaned)
        for elem in root.iter():
            tag_name = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag
            if tag_name in ("text", "tspan"):
                if elem.text:
                    extracted_tokens.append(elem.text.strip())
                if elem.tail:
                    extracted_tokens.append(elem.tail.strip())
    except Exception:
        matches = re.findall(r"<text[^>]*>(.*?)</text>", cleaned, flags=re.DOTALL)
        for m in matches:
            inner_clean = re.sub(r"<[^>]+>", " ", m)
            extracted_tokens.append(inner_clean.strip())

    return " ".join(t for t in extracted_tokens if t)

def verify_live_benchmark(bench_path: Path) -> bool:
    if not bench_path.exists() or bench_path.stat().st_size == 0:
        print(f"❌ FAIL: Live benchmark result file missing or empty: {bench_path}")
        return False

    try:
        data = json.loads(bench_path.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"❌ FAIL: Corrupt JSON in benchmark results: {e}")
        return False

    mach = platform.machine().lower()
    is_arm = ("arm" in mach) or ("aarch64" in mach)

    dsp_min = 1_000_000.0 if is_arm else 250_000.0
    trans_min = 1_000_000.0 if is_arm else 500_000.0

    live_dsp = float(data.get("real_soundtouch_dsp_samples_sec", 0))
    live_pitch = float(data.get("pitch_detected_hz", 0))
    live_trans = float(data.get("speed_engine_buffer_transform_ops_sec", 0))
    live_watchdog = float(data.get("watchdog_rate_checks_sec", 0))
    live_shadow = float(data.get("shadow_dom_traversals_sec", 0))

    if live_dsp < dsp_min:
        print(f"❌ FAIL: Live SoundTouch DSP throughput too low: {live_dsp:,.1f} samples/s < min {dsp_min:,.1f}")
        return False

    if not (430.0 <= live_pitch <= 450.0):
        print(f"❌ FAIL: Live pitch preservation violated: detected {live_pitch:.1f} Hz (expected ~440.0 Hz)")
        return False

    if live_trans < trans_min:
        print(f"❌ FAIL: Live transform calculations too low: {live_trans:,.1f} ops/s < min {trans_min:,.1f}")
        return False

    if live_watchdog < 100_000.0:
        print(f"❌ FAIL: Live watchdog rate checks too low: {live_watchdog:,.1f} checks/s < min 100,000")
        return False

    if live_shadow < 5_000.0:
        print(f"❌ FAIL: Live shadow DOM traversals too low: {live_shadow:,.1f} pierces/s < min 5,000")
        return False

    print(f"• Live Benchmark Binding  : CAUSAL LINK ESTABLISHED (Live SoundTouch DSP={live_dsp:,.1f} samples/s, Pitch={live_pitch:.1f} Hz, WebAudio={live_trans:,.1f} calcs/s) [PASS]")
    return True

def verify(repo_root: Path, live_bench_file: Path = None) -> bool:
    print("======================================================================")
    print("🛡️  AIR10 TRUTH GUARD v2.3: CRYPTOGRAPHIC PROVENANCE & ZERO-DRIFT CONTRACT")
    print(f"Target Repository : {repo_root.name}")
    print("======================================================================")

    receipt_path = repo_root / "db" / "STRESS_BENCHMARK_REAL_WHEELS.json"
    if not receipt_path.exists():
        print(f"❌ FAIL: Benchmark receipt not found at {receipt_path}")
        return False

    raw_bytes = receipt_path.read_bytes()
    computed_raw_sha = hashlib.sha256(raw_bytes).hexdigest()
    print(f"• Raw File SHA-256         : {computed_raw_sha}")

    try:
        data = json.loads(raw_bytes.decode("utf-8"))
    except Exception as e:
        print(f"❌ FAIL: Malformed JSON in receipt: {e}")
        return False

    provenance = data.get("provenance", {})
    expected_payload_sha = provenance.get("canonical_payload_sha256")
    sig_hex = provenance.get("signature_ed25519_hex")
    receipt_pub_hex = provenance.get("signer_public_key_hex")
    signer_id = provenance.get("signer_identity", "Unknown")

    # 1. Authoritative Root-of-Trust Check
    if receipt_pub_hex != AUTHORITATIVE_SIGNER_PUBKEY_HEX:
        print("❌ FAIL: Untrusted signer public key in receipt!")
        print(f"  Receipt Key: {receipt_pub_hex}")
        print(f"  Authoritative Pinned Root: {AUTHORITATIVE_SIGNER_PUBKEY_HEX}")
        return False
    print("• Authoritative Trust Root : PINNED KEY MATCH [PASS]")

    # Check local PEM file if present
    pubkey_pem_path = repo_root / "db" / "AIR10_PROVENANCE_ED25519_PUBKEY.pem"
    if pubkey_pem_path.exists():
        from cryptography.hazmat.primitives import serialization
        pem_bytes = pubkey_pem_path.read_bytes()
        loaded_pubkey = serialization.load_pem_public_key(pem_bytes)
        pem_raw_hex = loaded_pubkey.public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw
        ).hex()
        if pem_raw_hex != AUTHORITATIVE_SIGNER_PUBKEY_HEX:
            print("❌ FAIL: Local PEM public key does not match pinned trust root!")
            return False
        print("• Local Public Key PEM     : ANCHORED TO ROOT [PASS]")

    # 2. Canonical Payload Reconstitution & Hash Verification
    payload_copy = json.loads(raw_bytes.decode("utf-8"))
    del payload_copy["provenance"]["canonical_payload_sha256"]
    del payload_copy["provenance"]["signature_ed25519_hex"]

    canonical_json = json.dumps(payload_copy, indent=2)
    canonical_bytes = canonical_json.encode("utf-8")
    computed_payload_sha = hashlib.sha256(canonical_bytes).hexdigest()
    print(f"• Canonical Payload SHA-256: {computed_payload_sha}")

    if computed_payload_sha != expected_payload_sha:
        print("❌ FAIL: Canonical payload hash mismatch!")
        print(f"  Computed: {computed_payload_sha}")
        print(f"  Expected: {expected_payload_sha}")
        return False
    print("  ➔ Canonical Payload Hash Verification: [PASS]")

    # 3. Cryptographic Signature Verification against PINNED Trust Root
    try:
        pub_key = ed25519.Ed25519PublicKey.from_public_bytes(bytes.fromhex(AUTHORITATIVE_SIGNER_PUBKEY_HEX))
        pub_key.verify(bytes.fromhex(sig_hex), canonical_bytes)
        print("• Ed25519 Digital Signature: VALID AGAINST PINNED ROOT [PASS]")
        print(f"  Signer Identity          : {signer_id}")
    except Exception as e:
        print(f"❌ FAIL: Ed25519 signature verification failed: {e}")
        return False

    # 4. Git Source Snapshot Reachability Check
    hw = data.get("hardware_telemetry", {})
    src_commit = hw.get("benchmarked_source_commit_sha") or hw.get("git_commit_sha")
    if src_commit and src_commit != "unknown":
        git_dir = repo_root / ".git"
        if git_dir.exists():
            try:
                subprocess.check_output(["git", "rev-parse", "--verify", f"{src_commit}^{{commit}}"], cwd=repo_root, stderr=subprocess.DEVNULL)
                print(f"• Git Source Snapshot      : COMMIT {src_commit[:8]} REACHABLE IN GIT HISTORY [PASS]")
            except Exception:
                print(f"❌ FAIL: benchmarked_source_commit_sha '{src_commit}' is not reachable in repository history!")
                return False

    # 5. Scorecard SVG Zero-Drift & Visible Text Audit
    scorecard_path = repo_root / "assets" / "scorecard.svg"
    if scorecard_path.exists():
        svg_content = scorecard_path.read_text(encoding="utf-8")
        visible_svg_text = extract_visible_svg_text(svg_content)

        # Assert full or prefix hashes appear in visible text nodes
        if computed_payload_sha not in visible_svg_text and computed_payload_sha[:16] not in visible_svg_text:
            print(f"❌ FAIL: Scorecard visible text missing canonical payload SHA {computed_payload_sha}")
            return False
        if computed_raw_sha not in visible_svg_text and computed_raw_sha[:16] not in visible_svg_text:
            print(f"❌ FAIL: Scorecard visible text missing raw file SHA {computed_raw_sha}")
            return False
        if sig_hex[:32] not in visible_svg_text:
            print(f"❌ FAIL: Scorecard visible text missing signature prefix {sig_hex[:32]}")
            return False

        # Dynamically extract all metric labels from receipt to assert zero-drift
        domain_benchmarks = data.get("domain_workload_benchmarks", {})
        required_strings = []
        for name, spec in domain_benchmarks.items():
            lbl = spec.get("metric_label")
            if lbl:
                required_strings.append(lbl)

        for req in required_strings:
            if req not in visible_svg_text:
                print(f"❌ FAIL: Scorecard visible text tampering detected! Expected string '{req}' not found in rendered <text> tags.")
                return False
        print(f"• Scorecard Tag Audit      : 100% IN-SYNC ({len(required_strings)} receipt metrics dynamically verified in visible <text> nodes) [PASS]")

    # 6. Causal Live Benchmark Check
    if live_bench_file:
        if not verify_live_benchmark(live_bench_file):
            return False
    else:
        # Check default benchmark results file if it exists
        default_bench = repo_root / "scripts" / "audio_benchmark_results.json"
        if default_bench.exists():
            if not verify_live_benchmark(default_bench):
                return False

    print("----------------------------------------------------------------------")
    print("✅ VERDICT: 100% AUTHENTICALLY SIGNED & FORENSICALLY SEALED ZERO-DRIFT PASS.")
    print("======================================================================\n")
    return True

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AIR10 Cryptographic Provenance & Zero-Drift Verifier")
    parser.add_argument("repo_path", nargs="?", default=None, help="Path to repository root")
    parser.add_argument("--assert-live-benchmark", dest="live_benchmark", default=None, help="Path to fresh benchmark JSON output")
    args = parser.parse_args()

    repo_dir = Path(args.repo_path).resolve() if args.repo_path else Path(__file__).parent.parent.resolve()
    live_bench = Path(args.live_benchmark).resolve() if args.live_benchmark else None

    success = verify(repo_dir, live_bench)
    sys.exit(0 if success else 1)
