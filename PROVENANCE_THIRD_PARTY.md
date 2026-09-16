# Third-Party DSP & Speech Engine Provenance Record

This repository documents the exact upstream source, revision, licensing obligations, and local derivation class for all audio digital signal processing (DSP) components prior to distribution and release.

## Provenance Ledger

| LOCAL_PATH | UPSTREAM_PROJECT | UPSTREAM_URL | UPSTREAM_REVISION/TAG | DERIVATION_CLASS | UPSTREAM_LICENSE_SPDX | LOCAL_MODIFICATIONS | NOTICE/LICENSE_PATH | DISTRIBUTION_ARTIFACT_SCOPE | DECISION |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| modules/air10-catchup-processor.js | SoundTouchJS | https://github.com/cutterbl/SoundTouchJS | v0.3.0 (npm: soundtouchjs@0.3.0) | adapted | LGPL-2.1 | Converted to self-contained AudioWorkletProcessor (AIR10CatchUpProcessor) with lock-free ring buffers (AIR10RingBuffer), dynamic speech parameters (Sequence 40ms, SeekWindow 15ms, Overlap 8ms), energy-normalized cross-correlation, and phase-locked mono-to-stereo mirror. | NOTICE | Chrome Extension Bundle & Web Audio Worklet | HOLD_PENDING_DERIVATION_REVIEW: Upstream v0.3.0 package metadata declares LGPL-2.1. Keep exact attribution in the release artifact and independently review the adapted-source/redistribution obligations before promoting release readiness. |
| modules/air10-catchup-processor.js | SoundTouch Core | https://gitlab.com/soundtouch/soundtouch | v2.4.0 | inspired | LGPL-2.1-only | Algorithmic parameter presets (40ms sequence / 15ms seek / 8ms overlap) and energy-normalized TDStretch cross-correlation mathematics implemented natively in pure JavaScript/WebAudio without binary linkage. | NOTICE | Chrome Extension Bundle & Web Audio Worklet | PROCEED_WITH_ATTRIBUTION: Documented as inspired algorithm design; no binary or C++ source code embedded. |

## Upstream authority note

For the exact SoundTouchJS lineage used here, `cutterbl/SoundTouchJS@v0.3.0/package.json` declares `license: LGPL-2.1`. The upstream project documents MPL-2.0 as a licensing change associated with the later v0.4 rewrite. Current-master licensing must therefore not be back-projected onto v0.3.0.

## Invariants & Compliance Rules

1. ATTRIBUTION_NAME != EXACT_UPSTREAM_PROVENANCE: Mere author name mentions do not substitute for exact upstream revision and license classification.
2. CURRENT_UPSTREAM_LICENSE != HISTORICAL_VERSION_LICENSE: License identity is bound to the exact upstream revision/tag used by the local derivation.
3. ZIP_SHA256 != LICENSE/NOTICE COMPLIANCE: Checksums verify bitstream integrity but cannot certify distribution rights or provenance compliance.
4. Every distributable ZIP or bundle artifact must include the canonical NOTICE file.
5. Independent reality courts verify that deletion, tampering, or version/license mismatch in the provenance ledger causes an immediate fail-closed gate rejection.
