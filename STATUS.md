# Calibration Studio extraction status

Updated: 2026-08-10

Canonical target repository: `altrudev/Calibration-Studio`
Source/provenance baseline: DDC Calibration Studio v0.10.1 at `b67ffbaef360b9ccb680196653dcbabcb7fbd5bb`.

## Extracted and active on the migration branch

- standalone product-owned calibration engine;
- public adapter contract / registry / reason codes / settings / report model;
- immutable baseline, regression, history and repair lifecycle;
- exact first-parent historical tracing with detached worktrees;
- Continuous Calibration release gates;
- minimal / domain-neighborhood / full repair scopes and scoped repair-run verification;
- privacy redaction profiles and integrity-verified Calibration Bundles;
- Intent IR `ddc-intent/0.1` compilation, verification, inheritance, conflict checks and deltas;
- Intent artifacts in privacy-profiled bundles;
- Web/PWA adapter;
- Browser Extension adapter;
- API/Backend adapter;
- CLI adapter;
- Game adapter;
- pinned Playwright 1.62.1 browser runtime boundary;
- local zero-remote-runtime artifact viewer;
- standalone `calibrate` and `ddc-intent` CLIs;
- deterministic release-manifest v0.2 and detached Ed25519 verification;
- standalone staging adapted to the dedicated-repository layout with no embedded private DDC source;
- exact dependency lock graph from audited v0.10.1;
- real pinned-Chromium Web/PWA + MV3 runtime smoke workflow;
- exact Node 24.18.1 standalone staging gate;
- four-platform migration matrix: Linux x64, Windows x64, macOS x64 and macOS arm64;
- cross-repository DDC self-calibration integration is tracked separately in DDC PR #26.

## Boundary now enforced

Calibration Studio must operate without access to the private DDC source tree.

The optional DDC extension surface is the versioned local provider protocol:

- `altru-calibration-ddc-provider/0.1`
- `altru-calibration-ddc-provider-result/0.1`

Provider output is allow-listed and cannot export private DDC topology, DTC, constraint-island or successor-state machinery.

DDC remains authoritative over DDC-owned expectations, plans and approved baselines. Calibration Studio supplies external observation, gating, regression localization and repair verification.

## Remaining cutover gates

The repository move is not considered destructive/canonical until all of these are complete:

- [ ] current migration branch CI is green after the product CLI/UI/release extraction;
- [ ] real pinned-browser runtime smoke is green;
- [ ] Linux standalone staging is green under exact Node 24.18.1;
- [ ] four-platform standalone matrix is green;
- [ ] v0.10.1 public schema compatibility set is either migrated or explicitly retired/versioned;
- [ ] v0.10.1 security/adversarial checks are reproduced in this repository;
- [ ] cross-repository DDC self-calibration is green;
- [ ] DDC self-calibration pins an exact validated Calibration Studio tag/commit rather than the moving migration branch;
- [ ] dedicated-repository preview release is cut as v0.11.x;
- [ ] only then may DDC remove/freeze its embedded Calibration Studio fallback.

## HTP ownership

HTP is intentionally not part of this repository and not a child of Calibration Studio.

Canonical HTP repository: `altrudev/HTP`.

DDC now verifies the external HTP 0.2 schemas/tests in its own CI. Duplicate DDC-hosted HTP code remains only until the separate external-parity removal gate is satisfied.
