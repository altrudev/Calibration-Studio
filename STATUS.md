# Calibration Studio status

Updated: 2026-08-11

Canonical repository: `altrudev/Calibration-Studio`  
Current preview: `v0.11.0-alpha.0`  
Pinned release target commit: `121b8bad20f8face80b0594073e1b85ac38210d2`  
Historical source/provenance baseline: DDC Calibration Studio v0.10.1 at `b67ffbaef360b9ccb680196653dcbabcb7fbd5bb`.

## Canonical standalone product

The DDC extraction is complete. This repository owns the active Calibration Studio implementation:

- standalone product-owned calibration engine;
- public adapter contract, registry, reason codes, settings and report model;
- immutable baseline, regression, history and repair lifecycle;
- exact first-parent historical tracing with detached worktrees;
- Continuous Calibration release gates;
- minimal / domain-neighborhood / full repair scopes and scoped repair-run verification;
- privacy redaction profiles and integrity-verified Calibration Bundles;
- Intent IR `ddc-intent/0.1` compilation, verification, inheritance, conflict checks and deltas;
- Web/PWA, Browser Extension, API/Backend, CLI and Game candidate adapters;
- GitHub App with signed webhook intake, installation authentication and Checks API output without requiring GitHub Actions;
- isolated GitHub calibration worker with signed internal dispatch, persistent queueing, Git-tree/blob source acquisition and bounded Docker execution;
- trusted-base policy/baseline loading, base/head regression comparison and automatic repair verification;
- pinned Playwright 1.62.1 browser runtime boundary;
- local zero-remote-runtime artifact viewer;
- standalone `calibrate` and `ddc-intent` CLIs;
- deterministic release-manifest v0.2 and detached Ed25519 verification;
- exact dependency lock graph;
- active public protocol schema catalog;
- security/adversarial, dependency-provenance and private-DDC leakage gates;
- exact Node 24.18.1 standalone staging;
- Linux x64, Windows x64, macOS x64 and macOS arm64 packaging/release pipeline.

The GitHub integration now has a real deep-calibration execution boundary. The webhook process never executes pull-request code. Long-running work is HMAC-dispatched to a separate worker and queued before execution. The worker does not trust policy from the PR head: policy, baseline and evaluator plan are loaded from the PR base commit. Candidate source executes only inside a configured Docker sandbox with network disabled, read-only root, dropped capabilities, no host-environment inheritance and explicit resource limits. Live deployment still requires a pre-provisioned sandbox image, GitHub App credentials, worker secret and repository-owned `.calibration` policy/baseline artifacts.

## Boundary

Calibration Studio operates without private DDC implementation source.

The optional DDC extension surface is the versioned local provider protocol:

- `altru-calibration-ddc-provider/0.1`
- `altru-calibration-ddc-provider-result/0.1`

Provider output is allow-listed and cannot export private DDC topology, DTC, constraint-island or successor-state machinery.

DDC remains authoritative over DDC-owned expectations, plans and approved baselines. Calibration Studio supplies external observation, gating, regression localization and repair verification.

## Cutover evidence

Completed before DDC removed its embedded product copy:

- [x] extraction/boundary tests green;
- [x] security/adversarial gate green;
- [x] dependency provenance/signature gate green;
- [x] real pinned-browser runtime smoke green;
- [x] Linux standalone staging green under exact Node 24.18.1;
- [x] four-platform standalone matrix green;
- [x] active public schema catalog migrated and validated;
- [x] canonical `v0.11.0-alpha.0` prerelease published with four platform packages;
- [x] DDC self-calibration green using an exact canonical Calibration Studio commit;
- [x] DDC baseline immediately reproduced as stable;
- [x] embedded Calibration Studio source/workflows removed from active DDC source after parity.

## Ecosystem ownership

- Calibration Studio: `altrudev/Calibration-Studio`
- DDC / Crystalline: `altrudev/ddc`
- Human Translation Protocol + Human Translator: `altrudev/HTP`

HTP is independent of Calibration Studio. DDC verifies external HTP compatibility separately.
