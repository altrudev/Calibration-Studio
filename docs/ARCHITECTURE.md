# Calibration Studio architecture

Calibration Studio v0.11 is a standalone software-assurance product. It no longer imports private DDC implementation source.

## Public product flow

```text
Developer-owned intent / contract
        ↓
Adapter discovery or developer plan
        ↓
Normalized public observations
        ↓
Calibration engine
        ↓
Report
        ↓
Immutable baseline
        ↓
Continuous gate / comparison
        ↓
Historical first-bad trace
        ↓
Affected repair scope
        ↓
Repair verification
        ↓
Privacy-profiled bundle / release evidence
```

## Candidate adapters

- Web / PWA
- Browser Extension
- API / Backend
- CLI
- Game

Desktop, Android, Service and Custom Adapter SDK remain reserved product directions rather than implicit runtime claims.

## Authority model

Discovery is evidence, not authority. Inferred checks are always `reviewed:false` until a developer confirms or replaces them.

Developer-owned plans and immutable approved baselines remain authoritative. Calibration Studio does not silently rewrite an approved baseline to make a regression pass.

## Optional DDC provider

Calibration Studio may call a local private DDC provider through:

- `altru-calibration-ddc-provider/0.1`
- `altru-calibration-ddc-provider-result/0.1`

Provider output is allow-listed to public reason/evidence fields. Private DDC topology, DTC, constraint-island and successor-state machinery are outside the product contract.

The product remains fully functional without a DDC provider.

## DDC reverse integration

DDC treats Calibration Studio as an external tool. DDC owns its plans and approved baselines; Calibration Studio supplies observation, lifecycle comparison, continuous gating, historical tracing and repair verification.

This avoids a source-level circular dependency:

```text
DDC private runtime  ──optional provider──▶ Calibration Studio
       │
       └──── invokes external Calibration Studio for self-calibration ────┘
```

## Runtime boundary

Browser adapters use exact Playwright `1.62.1` and its locally installed/persisted Chromium runtime. Browser executables are acquired during controlled setup/packaging, never implicitly during calibration.

CLI execution uses explicit argv with `shell:false`. It defaults to a copied workspace and temporary HOME. Full parent-environment inheritance requires both plan intent and operator authority.

Historical tracing uses detached temporary Git worktrees and a minimal environment by default.

## Artifact integrity

Lifecycle, trace, repair, Intent, bundle and release artifacts use deterministic SHA-256 fingerprints and stable public IDs. The local viewer independently verifies supported artifact fingerprints before rendering them as valid evidence.
