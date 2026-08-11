# Calibration Studio release model

## Migration line

Historical release `v0.10.1` was produced from the DDC repository and remains provenance evidence for the extraction.

The dedicated repository begins the independent line as `0.11.0-alpha.0`. Repository migration alone is not a reason to call the product 1.0.

## Release identity

New releases use `altru-calibration-release-manifest/0.2`.

The manifest covers:

- product version;
- platform;
- architecture;
- packaged runtime identity;
- every staged payload file path;
- file size;
- SHA-256 content hash.

`created_at` remains visible metadata but is excluded from the v0.2 payload fingerprint. Therefore byte-identical staged payloads have the same `RELEASE-*` identity regardless of build time.

## Standalone boundary

The standalone package includes:

- Calibration Studio source/runtime payload under `app/`;
- exact locked dependencies;
- bundled Node.js runtime;
- pinned Playwright/Chromium runtime;
- `calibrate` launcher;
- `ddc-intent` launcher;
- local docs/schemas/samples/viewer;
- release metadata and deterministic manifest.

Private DDC implementation source is not part of the staged payload.

Browser executables are acquired during controlled build/setup, never during calibration.

## Release gates

Release validation is local-first and can be run on the target platform or another operator-controlled build machine. The core entry point is:

```bash
npm run gate
```

The extended gates cover:

- exact dependency install with arbitrary lifecycle scripts disabled;
- source/test/private-DDC leakage boundary;
- dependency vulnerability audit;
- registry signatures/attestations;
- real pinned Chromium Web/PWA capture;
- real pinned Chromium MV3 Extension capture;
- exact Node 24.18.1 standalone staging;
- staged launcher execution;
- Intent launcher execution;
- deterministic release identity;
- four-platform staged packages: Linux x64, Windows x64, macOS x64, macOS arm64.

GitHub-hosted workflows are retained only as manually dispatched operator tools. They never run on push, pull request or schedule. Remote preview-build artifacts use short retention and are not automatically publisher-trusted public releases.

## Signing

Release manifest signing is detached Ed25519.

Validation environments may test signing with an ephemeral key to prove the mechanism. Production release private keys must remain external to the repository and ordinary validation source tree.

Verification requires an independently supplied trusted public key.

## Promotion policy

A dedicated-repository preview release may be published only after the required functional, security and package gates have been reproduced locally or on an explicitly selected operator-controlled environment.

A future 1.0 promotion should additionally define and satisfy the final production distribution contract, including platform-native publisher signing/notarization policy and upgrade compatibility guarantees.
