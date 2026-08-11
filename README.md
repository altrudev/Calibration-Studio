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
- local zero-remote-runtime artifact viewer;
- local-first security, regression, runtime and packaging gates;
- optional manually dispatched GitHub-hosted validation and preview-build mirrors;
- GitHub App integration using signed webhooks, installation-scoped REST API access and GitHub Checks without requiring GitHub Actions;
- isolated GitHub calibration worker with HMAC dispatch, persistent local queue, bounded Git source snapshots and Docker execution with network disabled, read-only root, dropped Linux capabilities and explicit CPU/memory/PID limits;
- base-vs-head regression gating and automatic repair verification against a base-commit-owned Calibration Studio policy and immutable baseline.

## Automation policy

The authoritative default is local validation:

```bash
npm run gate
```

GitHub Actions are **optional only**. The repository contains manual `workflow_dispatch` workflows for an operator who deliberately wants a hosted validation run or four-platform preview build. There are no automatic push, pull-request or scheduled Actions triggers.

See [`LOCAL-VALIDATION.md`](LOCAL-VALIDATION.md) for the complete local gate and optional-workflow policy.

## GitHub App + isolated worker

Calibration Studio has a dedicated GitHub App boundary for pull-request intake. The webhook service verifies GitHub signatures, authenticates the installation, creates a Check Run and dispatches the long-running job to the worker rather than executing pull-request code in the webhook process.

The worker independently authenticates as the GitHub App, loads its policy, baseline and evaluator plan from the **base commit**, materializes bounded base/head source snapshots through the GitHub API and evaluates each snapshot only inside the configured Docker sandbox. GitHub credentials and worker secrets are never mounted into that sandbox.

Recommended permissions are deliberately narrow: **Metadata read, Pull requests read, Contents read and Checks write**. See [`docs/GITHUB-APP.md`](docs/GITHUB-APP.md).

Start the worker and webhook services separately:

```bash
npm run github-worker
npm run github-app
```

The configured target repository supplies `.calibration/github-policy.json`, an immutable Calibration Studio baseline and a base-owned evaluation plan. The worker then turns pull requests into real pass/fail regression Checks and, when the base is already regressed, reports whether the pull request verifies the repair.

This integration uses GitHub webhooks and REST APIs directly. GitHub Actions are not required.

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

Calibration Studio supplies observation and verification capabilities; DDC remains the authority over its own declared expectations and approved baseline. DDC validation pins an exact canonical Calibration Studio revision rather than importing this repository as source.

## Development checks

Requires Node.js 24 or newer.

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run gate
```

Supply-chain, runtime and package validation remain explicit:

```bash
npm run gate:supply-chain
npm run runtime:install-browser
npm run gate:runtime
npm run gate:standalone
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
