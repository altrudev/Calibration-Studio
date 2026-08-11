# Calibration Studio release model

## Migration history

Historical release `v0.10.1` was produced from the DDC repository and remains provenance evidence for the extraction. The dedicated repository began its independent line at `v0.11.0-alpha.0`.

The four platform-specific standalone archives produced for that preview were migration/cutover evidence. They are no longer the active distribution model.

## Current distribution model

Calibration Studio is moving to:

```text
terminal install/update
        ↓
Calibration Core
        ↓
local service/API
        ↓
served browser Studio
```

Large self-contained Windows/Linux/macOS binaries are retired. Node/Chromium should not be duplicated into separate platform application bundles merely to display the UI.

The CLI remains available for automation, scripting, CI-like local gates and advanced use. Normal interactive use should be through the local web Studio.

## Release identity

`altru-calibration-release-manifest/0.2` remains available for deterministic artifact identity and detached Ed25519 verification where release artifacts require it. Release integrity is independent of whether distribution is a binary bundle, package, source artifact or other signed payload.

## Validation

The authoritative validation path is local-first:

```bash
npm run gate
```

Extended checks include:

```bash
npm run gate:supply-chain
npm run runtime:install-browser
npm run gate:runtime
npm run gate:all
```

The optional GitHub-hosted validation workflow is manual `workflow_dispatch` only. There is no GitHub-hosted binary-build workflow and no automatic Actions trigger.

## Signing

Release-manifest signing is detached Ed25519. Production private keys must remain external to the repository and ordinary validation source tree. Verification requires an independently supplied trusted public key.

## Promotion policy

Future product-facing releases should prioritize the terminal-installed Core and locally served Studio. A future 1.0 should define installation/update compatibility, local-service security, browser/UI compatibility, migration guarantees and reproducible release provenance.
