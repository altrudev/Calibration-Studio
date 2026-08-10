# Calibration Studio extraction from DDC

Source repository: `altrudev/ddc`  
Source product: `apps/calibration-studio/`  
Source release: `v0.10.1`  
Source canonical DDC commit: `b67ffbaef360b9ccb680196653dcbabcb7fbd5bb`

## Goal

Make this repository the canonical home of Calibration Studio while preserving v0.10.1 behavior and keeping proprietary DDC/Crystalline internals private.

## Migration gates

The embedded DDC copy MUST NOT be removed until this repository reproduces the source release gates.

Required parity:

- Web/PWA adapter
- Browser Extension adapter
- API/Backend adapter
- CLI adapter
- Game adapter
- Calibration lifecycle
- historical first-bad tracing
- scoped repair verification
- continuous calibration gates
- privacy-profiled bundles
- release manifests and detached signature verification
- Intent IR public contract and deterministic validation
- standalone Windows x64 packaging
- standalone Linux x64 packaging
- standalone macOS x64 packaging
- standalone macOS arm64 packaging
- pinned runtime verification
- security audit/adversarial suite
- public/private boundary guard

## Extraction rule

Copy product-owned code, tests, schemas, samples, UI, documentation and release machinery.

Do NOT copy private DDC implementation details from the DDC-side private boundary. Where current product code imports an internal DDC helper, replace that dependency with the versioned provider boundary documented in `docs/DDC-INTEGRATION.md` or with a product-owned transparent implementation when the behavior is part of Calibration Studio itself.

## Versioning

`v0.10.1` remains the historical release built from DDC.

The first canonical release from this repository should be `v0.11.0` (preview/candidate) after parity and migration gates pass. Do not call it 1.0 solely because of the repository move.

## DDC cleanup after parity

Once `v0.11.0` is validated from this repository:

1. freeze the old DDC `apps/calibration-studio/` tree as provenance or remove it from active source;
2. keep only `integrations/calibration-studio/` in DDC;
3. pin the supported Calibration Studio protocol/release identity;
4. run Calibration Studio against DDC in DDC CI;
5. retain DDC's private provider implementation, if used, exclusively in DDC.
