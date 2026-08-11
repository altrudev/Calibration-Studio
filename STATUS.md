# Calibration Studio status

Updated: 2026-08-11

Canonical repository: `altrudev/Calibration-Studio`  
Current code line: `v0.11` preview/candidate  
Historical binary preview: `v0.11.0-alpha.0`  
Historical source/provenance baseline: DDC Calibration Studio v0.10.1 at `b67ffbaef360b9ccb680196653dcbabcb7fbd5bb`.

## Active product direction

Calibration Studio is now a **Core + served local Studio** product rather than a set of giant platform binaries.

The active repository owns:

- product-owned calibration engine;
- public adapter contract, registry, reason codes, settings and report model;
- immutable baseline, regression, history and repair lifecycle;
- exact first-parent historical tracing;
- Continuous Calibration gates;
- minimal / domain-neighborhood / full repair scopes and scoped repair verification;
- privacy redaction profiles and integrity-verified Calibration Bundles;
- deterministic Intent IR compilation, verification, inheritance, conflict checks and deltas;
- Web/PWA, Browser Extension, API/Backend, CLI and Game candidate adapters;
- GitHub App with signed webhook intake and Checks API output without requiring GitHub Actions;
- isolated GitHub calibration worker with signed internal dispatch, persistent queueing, Git-tree/blob source acquisition and bounded Docker execution;
- trusted-base policy/baseline loading, base/head regression comparison and repair verification;
- pinned Playwright browser runtime boundary;
- local zero-remote-runtime viewer;
- `calibrate` and `ddc-intent` CLI surfaces;
- deterministic release integrity primitives;
- local-first security, dependency and runtime gates.

## Binary retirement

Platform-specific standalone staging and the four-platform binary build workflow have been removed from the active repository. The old `v0.11.0-alpha.0` binary release remains historical migration evidence until its uploaded assets are removed from the GitHub release UI/API.

The next user-facing delivery target is:

```text
terminal install/update
        ↓
Calibration Core starts local service
        ↓
visual Studio opens in browser
```

## Boundary

Calibration Studio operates without private DDC implementation source. The optional DDC extension surface remains the versioned local provider protocol:

- `altru-calibration-ddc-provider/0.1`
- `altru-calibration-ddc-provider-result/0.1`

DDC remains authoritative over DDC-owned expectations, plans and approved baselines. Calibration Studio supplies external observation, gating, regression localization and repair verification.

## Historical cutover evidence

The original extraction proved source/boundary tests, security/adversarial gates, dependency provenance, pinned-browser runtime capture, four-platform staging, schema migration, DDC self-calibration and baseline reproduction before the embedded copy was removed from active DDC source. Those facts remain history; the platform-binary distribution strategy has now been retired.

## Ecosystem ownership

- Calibration Studio: `altrudev/Calibration-Studio`
- DDC / Crystalline: `altrudev/ddc`
- Human Translation Protocol + Human Translator: `altrudev/HTP`
