# Calibration Studio status

Updated: 2026-08-11

Canonical repository: `altrudev/Calibration-Studio`  
Current preview line: `v0.11`  
Historical packaged preview: `v0.11.0-alpha.0`

## Active product direction

Calibration Studio now uses a **terminal-installed Core + locally served visual Studio** model. Large platform-specific standalone binaries and their build pipeline are retired.

The active repository now includes:

- `npm start` / `npm run studio` local Studio launch;
- automatic first-run locked dependency and pinned Chromium setup when required;
- loopback-only Studio service at `127.0.0.1:4317`;
- Windows `.cmd`, Linux `.sh` and macOS `.command` launchers;
- a visual Run interface connected to the Calibration Core;
- live runtime/Core status, visual results and JSON download;
- the local integrity-verifying Artifact Viewer;
- allow-listed Studio operations rather than an arbitrary shell bridge.

## Core capability

The repository remains authoritative for the Calibration engine, adapters, lifecycle, baselines, regression comparison, continuous gates, first-bad tracing, repair scopes, repair verification, Intent IR, privacy bundles, GitHub App integration and isolated GitHub worker.

## Boundary

Calibration Studio operates without private DDC implementation source. The optional DDC extension surface remains the versioned local provider protocol. DDC remains authoritative over DDC-owned expectations, plans and approved baselines.

## Automation policy

Local validation remains authoritative. GitHub Actions are optional manual validation only; there are no automatic push/PR/scheduled workflows and no hosted binary-build workflow.

## Ecosystem ownership

- Calibration Studio: `altrudev/Calibration-Studio`
- DDC / Crystalline: `altrudev/ddc`
- Human Translation Protocol + Human Translator: `altrudev/HTP`
