# Calibration Studio

**Behavioral diagnostics and software-assurance tooling.**  
**Built with DDC · Developed by Altru.dev · © 2026 Altru.dev.**

Calibration Studio now uses **GitHub Codespaces as its normal runtime**. There is no platform runtime archive and normal users do not clone the repository locally.

## Start Calibration Studio

Local requirement: [GitHub CLI (`gh`)](https://cli.github.com/) and a GitHub account with Codespaces access.

Download only the launcher for your OS from `launch/`:

- Windows: `Calibration-Studio.cmd`
- Ubuntu/Linux: `calibration-studio.sh`
- macOS: `Calibration-Studio.command`

Run it. On first use it authenticates GitHub CLI if necessary, finds or creates a dedicated Codespace for `altrudev/Calibration-Studio`, chooses the lowest-core machine available, starts the Codespace, starts Calibration Core, opens a private port tunnel, and opens the Studio dashboard at `http://127.0.0.1:4317`.

No repository clone, local Node installation, or Calibration CLI commands are required for normal use.

Run the launcher with `restart` to force a Codespace stop/start. A failed startup also performs one automatic restart before reporting failure.

## Cost controls

The launcher creates the Codespace with a 15-minute idle timeout and 7-day retention period. No Codespaces prebuild is configured, so this runtime path does not introduce an Actions-backed prebuild.

The dashboard shows **Codespaces core-hours used this month**. For GitHub Free and Pro personal plans it also shows the included allowance, remaining core-hours, and a usage meter. GitHub billing data can lag; if the current token cannot read user billing-plan data, the dashboard explicitly falls back to current-session core-hours rather than inventing a monthly value.

## Runtime architecture

```text
small OS launcher
    ↓
GitHub CLI authentication
    ↓
start / restart dedicated Codespace
    ↓
Calibration Core + Studio server
    ↓
private gh port-forward 4317 → localhost:4317
    ↓
visual browser Studio
    ↓
Declared → Observed → Fracture → Lineage → Repair → Re-observe
```

The Studio service itself binds to loopback only inside the Codespace. The local browser reaches it through an authenticated GitHub Codespaces tunnel. Studio mutations require an in-memory per-process capability token and same-origin checks; the command bridge exposes allow-listed Calibration operations only and uses `shell:false`.

## Current capabilities

- Codespaces-hosted visual Studio with automatic create/start/restart/tunnel flow;
- monthly Codespaces core-hour counter with Free/Pro quota awareness;
- Web/PWA, Browser Extension, API/Backend, CLI and Game adapters;
- normalized observations and developer-owned calibration contracts;
- immutable baselines and regression comparison;
- longitudinal history and exact first-parent first-bad tracing;
- continuous calibration gates;
- repair scopes and repair verification;
- privacy-profiled evidence bundles and Intent IR;
- pinned Playwright/Chromium runtime boundary;
- GitHub App + isolated calibration worker;
- local-first validation and Perun production-security gate.

## Security / validation

The authoritative validation remains operator-controlled and does not require GitHub Actions:

```bash
npm run gate
npm run perun
```

`npm run perun` runs source checks, regression/adversarial tests, dependency graph integrity, vulnerability audit, registry signature/attestation checks, launcher/workflow/runtime-boundary checks and secret/execution-surface checks. The Codespace first-run setup runs the full gate before it is considered ready.

The one retained GitHub Actions workflow is manual-only (`workflow_dispatch`) and its third-party actions are pinned to immutable commit SHAs. There are no push, pull-request, schedule, binary-build or Codespaces-prebuild workflows.

See `docs/SECURITY.md`, `docs/ARCHITECTURE.md`, `docs/USER-GUIDE.md`, and `LOCAL-VALIDATION.md`.

## Development fallback

Repository contributors may still work from a normal checkout with Node.js 24+; that is a development surface, not the normal product installation path.

## Ecosystem ownership

- Calibration Studio: `altrudev/Calibration-Studio`
- DDC / Crystalline: `altrudev/ddc`
- Human Translation Protocol + Human Translator: `altrudev/HTP`
