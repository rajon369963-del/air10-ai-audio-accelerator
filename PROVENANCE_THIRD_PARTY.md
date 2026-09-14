# Third-Party DSP & Speech Engine Provenance Record

This repository documents the exact upstream source, revision, licensing obligations, and local derivation class for all audio digital signal processing (DSP) components prior to distribution and release.

## Provenance Ledger

| LOCAL_PATH | UPSTREAM_PROJECT | UPSTREAM_URL | UPSTREAM_REVISION/TAG | DERIVATION_CLASS | UPSTREAM_LICENSE_SPDX | LOCAL_MODIFICATIONS | NOTICE/LICENSE_PATH | DISTRIBUTION_ARTIFACT_SCOPE | DECISION |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| modules/air10-catchup-processor.js | SoundTouchJS | https://github.com/cutterbl/SoundTouchJS | v0.3.0 (npm: soundtouchjs@0.3.0) | adapted | MPL-2.0 | Converted to self-contained AudioWorkletProcessor (AIR10CatchUpProcessor) with lock-free ring buffers (AIR10RingBuffer), dynamic speech parameters (Sequence 40ms, SeekWindow 15ms, Overlap 8ms), energy-normalized cross-correlation, and phase-locked mono-to-stereo mirror. | NOTICE | Chrome Extension Bundle & Web Audio Worklet | PROCEED_WITH_ATTRIBUTION: Maintain clear third-party notice and attribution in NOTICE file; distribution artifact includes full notice. |
| modules/air10-catchup-processor.js | SoundTouch Core | https://gitlab.com/soundtouch/soundtouch | v2.4.0 | inspired | LGPL-2.1-only | Algorithmic parameter presets (40ms sequence / 15ms seek / 8ms overlap) and energy-normalized TDStretch cross-correlation mathematics implemented natively in pure JavaScript/WebAudio without binary linkage. | NOTICE | Chrome Extension Bundle & Web Audio Worklet | PROCEED_WITH_ATTRIBUTION: Documented as inspired algorithm design; no binary or C++ source code embedded. |

## Invariants & Compliance Rules

1. ATTRIBUTION_NAME != EXACT_UPSTREAM_PROVENANCE: Mere author name mentions do not substitute for exact upstream revision and license classification.
2. ZIP_SHA256 != LICENSE/NOTICE COMPLIANCE: Checksums verify bitstream integrity but cannot certify distribution rights or provenance compliance.
3. Every distributable ZIP or bundle artifact must include the canonical NOTICE file.
4. Independent reality courts verify that any deletion or tampering of the provenance ledger causes an immediate fail-closed gate rejection.
