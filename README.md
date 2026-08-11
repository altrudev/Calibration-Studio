# Calibration Studio

**Behavioral diagnostics and software-assurance tooling.**

**Built with DDC**  
**Developed by Altru.dev**  
**© 2026 Altru.dev. All rights reserved.**

This is the canonical repository for Calibration Studio.

> Current line: **v0.11 preview/candidate**. Large standalone binary distribution is retired. The active product model is a terminal-installed Calibration Core with a locally served visual Studio.

## Quick start: visual Studio

Requirements: Node.js 24 or newer and Git.

Clone once:

```bash
git clone https://github.com/altrudev/Calibration-Studio.git
cd Calibration-Studio
```

Then launch visually:

- Windows: double-click `launch/Calibration-Studio.cmd`
- Ubuntu/Linux: run `./launch/calibration-studio.sh`
- macOS: double-click `launch/Calibration-Studio.command`

The launcher checks the local dependency graph, installs the exact locked dependencies when missing, installs/verifies the pinned Chromium test runtime when needed, starts Calibration Studio on loopback only, and opens the default browser automatically.

The same flow is available from a terminal:

```bash
npm start
```

Default Studio URL: `http://127.0.0.1:4317`.

No Calibration commands need to be typed for normal use. The CLI remains available for automation and advanced workflows.

## Product flow

```text
launcher / npm start
        ↓
local bootstrap
        ↓
Calibration Core
        ↓
127.0.0.1:4317
        ↓
visual Studio
        ↓
Declared → Observed → Fracture → Lineage → Repair → Re-observe
```

The Studio UI connects to an allow-listed local command bridge. It does not expose an arbitrary shell. The HTTP service binds to loopback only and serves local UI assets with a restrictive Content Security Policy.

## Architecture

Calibration Studio is separated from DDC at the repository boundary:

```text
Calibration Studio
  ├── product-owned calibration engine
  ├── adapters
  ├── calibration lifecycle
  ├── Intent IR
  ├── local Studio server + browser UI
  ├── CLI automation surface
  └── optional provider contracts
            │
            ▼
      local DDC provider
      (optional/private)

DDC / Crystalline remains private and separate.
```

Calibration Studio works without access to the private DDC source repository. Private DDC implementation internals are not part of this repository or public Calibration Studio artifacts.

See [`docs/DDC-INTEGRATION.md`](docs/DDC-INTEGRATION.md) and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Current capabilities

- locally served visual Studio with automatic browser launch;
- Windows, Linux and macOS text launchers sharing one implementation;
- loopback-only local HTTP/API bridge with allow-listed Calibration operations;
- live Core/runtime connection status and visual execution results;
- Web/PWA, Browser Extension, API/Backend, CLI and Game candidate adapters;
- normalized observations and developer-owned calibration contracts;
- immutable baselines and regression comparison;
- longitudinal history and exact first-parent first-bad tracing;
- continuous calibration gates;
- minimal, domain-neighborhood and full repair scopes;
- scoped repair verification;
- privacy-profiled, integrity-verified evidence bundles;
- deterministic Intent IR compile/verify/gate/diff;
- pinned Playwright/Chromium runtime boundary;
- local artifact viewer with integrity verification;
- local-first security, regression and runtime gates;
- optional manually dispatched GitHub-hosted validation mirror;
- GitHub App integration and isolated worker without requiring GitHub Actions.

## Automation policy

The authoritative default is local validation:

```bash
npm run gate
```

GitHub Actions are optional only. There are no automatic push, pull-request or scheduled Actions triggers, and there is no hosted binary-build workflow.

See [`LOCAL-VALIDATION.md`](LOCAL-VALIDATION.md).

## GitHub App + isolated worker

Start the worker and webhook services separately:

```bash
npm run github-worker
npm run github-app
```

Recommended permissions are deliberately narrow: **Metadata read, Pull requests read, Contents read and Checks write**. See [`docs/GITHUB-APP.md`](docs/GITHUB-APP.md).

## Development checks

Requires Node.js 24 or newer.

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run gate
```

Supply-chain and browser runtime validation remain explicit:

```bash
npm run gate:supply-chain
npm run runtime:install-browser
npm run gate:runtime
```

The interactive launcher may install the pinned browser during explicit first-run setup. Calibration operations themselves do not silently download browser executables.

## Release status

`v0.11.0-alpha.0` remains historical extraction/cutover evidence. Platform-specific standalone binaries are no longer the active distribution model.

The completed extraction record is preserved in [`MIGRATION.md`](MIGRATION.md).

## Canonical ecosystem ownership

- Calibration Studio product: `altrudev/Calibration-Studio`
- DDC / Crystalline private runtime and research: `altrudev/ddc`
- Human Translation Protocol and Human Translator: `altrudev/HTP`
