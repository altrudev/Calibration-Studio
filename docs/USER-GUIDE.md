# Calibration Studio v0.11 user guide

## Normal start: no clone

Install GitHub CLI (`gh`) on your computer, then download **one** small launcher from the repository `launch/` directory for Windows, Ubuntu/Linux, or macOS. Do not clone Calibration Studio just to run it.

Run the launcher. It will:

1. verify/sign in to GitHub CLI;
2. find the existing Calibration Studio Codespace, or create one on the lowest-core available machine;
3. start it if stopped;
4. run the Codespace setup and Calibration Studio service;
5. open an authenticated private port tunnel from Codespace port 4317 to local `127.0.0.1:4317`;
6. open the visual Studio in the default browser.

To force a restart, invoke the launcher with `restart`. Normal startup also performs one automatic restart if the Codespace/Studio tunnel does not become healthy.

## Core-hour counter

The top-right Studio status shows Codespaces compute usage for the current billing month. When GitHub exposes the user billing summary to the current credential, the UI shows used core-hours, the personal Free/Pro included quota where applicable, remaining core-hours and a meter. GitHub billing reporting is not instantaneous.

If billing-plan access is unavailable, Calibration Studio labels the counter unavailable and can show the current Codespace session estimate when the machine core count is available. It never substitutes the estimate for the official monthly total.

## Running Calibration

Use the **Run** tab. Choose an operation, product type and required input paths/URLs. Paths refer to files available in the Codespace. Execution-authority checkboxes remain explicit for effectful API calls, CLI/Game execution, remote Game targets, persistent Game state and environment inheritance.

The visual Studio exposes Inspect, Discover, Capture, Calibrate, Baseline, Compare, Gate, Trace, Repair Scope, Verify Repair, Repair Rerun, Runtime, Adapters and Version through a fixed allow-list. It does not expose a general shell endpoint.

## Evidence

The result panel shows live output and can download result JSON. Supported artifacts can be opened in the Artifact Viewer, which independently verifies deterministic fingerprints before presenting supported evidence as valid.

## Codespace lifecycle

The default launcher requests a 15-minute idle timeout and 7-day retention. A stopped Codespace does not consume compute time but can continue to consume storage until deleted. The launcher reuses the most recently used Calibration Studio Codespace for this repository rather than creating a new one each run.

## Developer validation

Inside the repository/Codespace:

```bash
npm run gate
npm run perun
```

Perun performs the production-security/vulnerability gate, including registry-backed vulnerability and signature checks. `npm run perun:offline` is available only for explicitly offline static/regression validation and does not claim dependency-vulnerability coverage.
