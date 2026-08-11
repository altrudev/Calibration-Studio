# Calibration Studio architecture

Calibration Studio is a software-assurance product with a Codespaces-hosted normal runtime and a browser-based control plane.

## User-facing runtime

```text
Windows / Linux / macOS launcher
        ↓
GitHub CLI
        ↓
Calibration Studio Codespace
        ↓
Calibration Core
        ↓
loopback Studio HTTP service :4317
        ↓
authenticated private `gh codespace ports forward`
        ↓
local browser dashboard
```

The local computer does not need a Calibration Studio clone or a Node runtime. The tiny launcher controls Codespace lifecycle and the tunnel only.

## Codespace lifecycle

The launcher reuses an existing repository-scoped Codespace when possible, requests the lowest-core available machine on creation, uses a 15-minute idle timeout and a 7-day retention period, and can force or automatically attempt a restart. The repository intentionally has no Codespaces prebuild configuration.

The devcontainer uses GitHub's default container image rather than introducing a product-owned runtime image. `postCreateCommand` installs the exact locked dependency graph and pinned Chromium runtime and runs validation; `postStartCommand` starts the Studio service.

## Studio trust boundary

The Studio service binds only to loopback. Requests must carry a loopback Host header. Mutation requests additionally require an allowed same-origin Origin when present and a random per-process session capability kept only in browser memory. No CORS trust is granted.

The browser API maps structured fields to a fixed allow-list of Calibration commands. It does not accept shell text. Core subprocesses run with `shell:false` and receive a minimal allow-listed environment so Codespace/GitHub credentials are not inherited by tested software even when downstream test plans opt into environment inheritance.

## Calibration lifecycle

```text
Developer-owned intent / contract
        ↓
Adapter discovery or plan
        ↓
Normalized observations
        ↓
Calibration report
        ↓
Immutable baseline
        ↓
Comparison / continuous gate
        ↓
First-bad lineage
        ↓
Repair scope
        ↓
Repair verification
```

Candidate adapters: Web/PWA, Browser Extension, API/Backend, CLI and Game.

## DDC boundary

Calibration Studio does not contain private DDC implementation source. The optional local DDC provider remains a versioned, allow-listed integration. DDC can separately invoke canonical Calibration Studio for self-calibration without creating a source-level circular dependency.

## Billing telemetry boundary

Calibration Studio has no product telemetry. The core-hour card reads the authenticated user's GitHub billing summary through GitHub CLI when the credential is authorized. The browser never receives a GitHub token. Only aggregate Codespaces usage and current Codespace machine metadata are returned to the local Studio UI.
