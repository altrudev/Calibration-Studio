# Calibration Studio

**Behavioral diagnostics and software-assurance tooling.**

**Built with DDC**  
**Developed by Altru.dev**  
**© 2026 Altru.dev. All rights reserved.**

This is the **canonical standalone repository for Calibration Studio**.

> Current line: **v0.11 preview/candidate**. Canonical preview `v0.11.0-alpha.0` is published from this repository for Linux x64, Windows x64, macOS Intel x64 and macOS Apple Silicon arm64. Historical v0.10.1 was released from the private DDC repository before the product was externalized.

## Architecture

Calibration Studio is separated from DDC at the repository boundary:

```text
Calibration Studio
  ├── product-owned calibration engine
  ├── adapters
  ├── calibration lifecycle
  ├── release / integrity tooling
  ├── Intent IR
  ├── UI / CLI
  └── optional provider contracts
            │
            ▼
      local DDC provider
      (optional/private)

DDC / Crystalline remains private and separate.
```

Calibration Studio works without access to the private DDC source repository. DDC may perform additional local analysis through the versioned optional provider protocol, but private DDC topology, transaction-closure, constraint-island and successor-state internals are not part of this repository or public Calibration Studio artifacts.

See [`docs/DDC-INTEGRATION.md`](docs/DDC-INTEGRATION.md) and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Current capabilities

- Web/PWA, Browser Extension, API/Backend, CLI and Game candidate adapters;
- normalized observations and developer-owned calibration contracts;
- immutable baselines and regression comparison;
- longitudinal history and exact first-parent first-bad tracing;
- continuous calibration gates;
- minimal, domain-neighborhood and full repair scopes;
- scoped repair verification;
- privacy-profiled, integrity-verified evidence bundles;
- deterministic Intent IR compile/verify/gate/diff;
- deterministic release manifests and detached Ed25519 verification;
- pinned Playwright/Chromium runtime boundary;
- self-contained four-platform staging/release pipeline;
- local zero-remote-runtime artifact viewer.

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
```

Calibration Studio supplies observation and verification capabilities; DDC remains the authority over its own declared expectations and approved baseline. DDC CI pins an exact canonical Calibration Studio revision rather than importing this repository as source.

## Development checks

Requires Node.js 24 or newer.

```bash
npm ci --ignore-scripts
npm run check
npm test
```

Install the pinned browser runtime explicitly when browser adapters are needed:

```bash
npm run runtime:install-browser
npm run runtime:verify-browser
```

Calibration itself does not download browser executables.

## Release status

Canonical preview release: **`v0.11.0-alpha.0`**.

The preview is intentionally not called 1.0. Windows publisher signing and macOS notarization remain future production-distribution work.

The completed extraction record is preserved in [`MIGRATION.md`](MIGRATION.md).

## Canonical ecosystem ownership

- Calibration Studio product: `altrudev/Calibration-Studio`
- DDC / Crystalline private runtime and research: `altrudev/ddc`
- Human Translation Protocol and Human Translator: `altrudev/HTP`

These repositories integrate through explicit versioned contracts rather than source-level circular imports.
