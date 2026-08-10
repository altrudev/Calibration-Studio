# Calibration Studio extraction from DDC — completed

Source repository: `altrudev/ddc`  
Source product: `apps/calibration-studio/`  
Historical source release: `v0.10.1`  
Source DDC commit: `b67ffbaef360b9ccb680196653dcbabcb7fbd5bb`  
Canonical dedicated-repository preview: `v0.11.0-alpha.0`  
Canonical release target commit: `121b8bad20f8face80b0594073e1b85ac38210d2`

## Result

The migration completed on 2026-08-10. `altrudev/Calibration-Studio` is the canonical active product repository.

The extraction preserved the Calibration Studio product boundary while keeping proprietary DDC/Crystalline internals private. Product-owned functionality was moved here; private DDC closure/topology/constraint-island/successor-state implementation was not copied.

## Completed parity gates

- [x] Web/PWA adapter
- [x] Browser Extension adapter
- [x] API/Backend adapter
- [x] CLI adapter
- [x] Game adapter
- [x] Calibration lifecycle
- [x] historical first-bad tracing
- [x] scoped repair verification
- [x] continuous calibration gates
- [x] privacy-profiled bundles
- [x] release manifests and detached Ed25519 verification
- [x] Intent IR public contract and deterministic validation
- [x] standalone Windows x64 packaging
- [x] standalone Linux x64 packaging
- [x] standalone macOS x64 packaging
- [x] standalone macOS arm64 packaging
- [x] pinned runtime verification
- [x] security/adversarial suite
- [x] public/private boundary guard
- [x] active public schema catalog
- [x] canonical GitHub prerelease publication
- [x] cross-repository DDC self-calibration

## DDC relationship after cutover

DDC no longer carries an active duplicate Calibration Studio product tree.

DDC keeps only its side of the integration boundary:

1. DDC-owned calibration plans, compatibility pins and approved baselines;
2. exact pinned canonical Calibration Studio revision for self-calibration CI;
3. any optional private DDC provider implementation, kept exclusively in DDC;
4. private Crystalline/DDC runtime and research.

Calibration Studio remains an external observer/assurance tool. DDC remains authoritative over DDC-owned expectations and baselines.

## Provenance

Historical v0.10.1 source remains recoverable through DDC Git history. It was intentionally not copied into a second active archive tree after the canonical external repository was validated.

Repository migration did not promote the product to 1.0. The v0.11 line remains preview/candidate while production distribution work such as Windows publisher signing and macOS notarization is still outstanding.
