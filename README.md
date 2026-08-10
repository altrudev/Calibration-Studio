# Calibration Studio

**Behavioral diagnostics and software-assurance tooling.**

**Built with DDC**  
**Developed by Altru.dev**  
**© 2026 Altru.dev. All rights reserved.**

This repository is becoming the canonical standalone home of Calibration Studio, extracted from the private `altrudev/ddc` repository.

> Status: **v0.11.0-alpha extraction**. Historical v0.10.1 was released from DDC. The embedded DDC copy remains the migration fallback until this repository reproduces all v0.10.1 gates.

## Architecture

Calibration Studio is now separated from DDC at the repository boundary:

```text
Calibration Studio
  ├── public product engine
  ├── adapters
  ├── calibration lifecycle
  ├── release / integrity tooling
  ├── UI / CLI
  └── optional provider contracts
            │
            ▼
      local DDC provider
      (optional/private)

DDC / Crystalline remains private and separate.
```

The public product must work without access to the private DDC source repository. DDC may perform additional local analysis through the versioned provider protocol, but private DDC topology, transaction-closure, constraint-island and successor-state internals are not part of this repository or public Calibration Studio artifacts.

See [`docs/DDC-INTEGRATION.md`](docs/DDC-INTEGRATION.md).

## DDC self-calibration

The relationship is intentionally bidirectional. DDC consumes Calibration Studio as an external assurance tool using DDC-owned plans and baselines:

```text
DDC commit
  -> capture / calibrate
  -> approved baseline
  -> continuous gate
  -> regression trace
  -> repair scope
  -> repair verification
  -> evidence bundle
```

Calibration Studio supplies the diagnostic and verification capabilities; DDC remains the authority over its own declared expectations and approved baseline.

## Extraction status

Already extracted into this repository:

- public adapter contract and adapter registry;
- public reason codes and settings model;
- public report and branding model;
- project metadata detection;
- standalone calibration engine independent of private DDC source;
- optional local DDC provider request/result protocol;
- provider leakage restrictions;
- automatic JavaScript syntax checking;
- extraction/boundary tests;
- public/private CI guard.

Still to migrate before v0.11.0 can replace v0.10.1:

- Web/PWA adapter runtime;
- Browser Extension adapter runtime;
- API adapter runtime;
- CLI adapter runtime;
- Game adapter runtime;
- lifecycle/baseline/history/repair modules;
- continuous calibration gates;
- bundle/release-integrity modules;
- Intent IR product surface;
- UI;
- complete schemas/samples/tests/docs;
- standalone four-platform packaging and release pipeline;
- v0.10.1 parity/security suite.

See [`MIGRATION.md`](MIGRATION.md) for the hard migration gate.

## Current extraction checks

Requires Node.js 24 or newer.

```bash
npm run check
npm test
```

## Canonical ecosystem ownership

- Calibration Studio product: `altrudev/Calibration-Studio`
- DDC / Crystalline private runtime and research: `altrudev/ddc`
- Human Translation Protocol: `altrudev/HTP`

These repositories integrate through explicit versioned contracts rather than source-level circular imports.
