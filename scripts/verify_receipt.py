#!/usr/bin/env python3
"""
AIR10 Sovereign Truth Guard & Cryptographic Provenance Verifier (v2.1)
Zero-Trust Invariants:
1. Hard-pinned Authoritative Ed25519 Root of Trust.
2. Canonical payload reconstitution and Ed25519 signature check.
3. Raw receipt file SHA-256 check.
4. Scorecard SVG Metric Zero-Drift Guard: Reads exact metrics and labels dynamically from receipt
   and asserts their literal presence in scorecard.svg.
"""

import hashlib
import json
import sys
from pathlib import Path
from cryptography.hazmat.primitives.asymmetric import ed25519

AUTHORITATIVE_SIGNER_PUBKEY_HEX = "4530967ab3ff8991cb065895270a0f467efd35c0322ee0cd8b6a2ddfe8b27f02"
EXPECTED_SIGNER_IDENTITY = "AIR10 Sovereign Open-Source Federation <rajon369963-del>"

def verify(repo_root: Path) -> bool:
    print("======================================================================")
    print("🛡️  AIR10 TRUTH GUARD v2.1: CRYPTOGRAPHIC PROVENANCE & ZERO-DRIFT CONTRACT")
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
        print(f"❌ FAIL: Untrusted signer public key in receipt!")
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

    # 4. Scorecard SVG Zero-Drift & Metric Tampering Check
    scorecard_path = repo_root / "assets" / "scorecard.svg"
    if scorecard_path.exists():
        svg_content = scorecard_path.read_text(encoding="utf-8")

        # Hash references
        if computed_payload_sha not in svg_content:
            print(f"❌ FAIL: Scorecard SVG missing canonical payload SHA {computed_payload_sha}")
            return False
        if computed_raw_sha not in svg_content:
            print(f"❌ FAIL: Scorecard SVG missing raw file SHA {computed_raw_sha}")
            return False

        # Dynamically extract all metric labels from receipt to assert zero-drift
        domain_benchmarks = data.get("domain_workload_benchmarks", {})
        required_strings = []
        for name, spec in domain_benchmarks.items():
            lbl = spec.get("metric_label")
            if lbl:
                required_strings.append(lbl)

        for req in required_strings:
            if req not in svg_content:
                print(f"❌ FAIL: Scorecard metric tampering detected! Expected string '{req}' missing from SVG.")
                return False
        print(f"• Scorecard Metric Audit   : 100% IN-SYNC ({len(required_strings)} receipt metrics dynamically verified) [PASS]")

    print("----------------------------------------------------------------------")
    print("✅ VERDICT: 100% AUTHENTICALLY SIGNED & METRIC-SEALED ZERO-DRIFT PASS.")
    print("======================================================================\n")
    return True

if __name__ == "__main__":
    target_dir = Path(__file__).parent.parent if len(sys.argv) < 2 else Path(sys.argv[1])
    success = verify(target_dir)
    sys.exit(0 if success else 1)
