# Calibration Studio status

Updated: 2026-08-11

Canonical repository: `altrudev/Calibration-Studio`  
Current source line: `v0.11.0-alpha.1`  
Distribution/runtime direction: Codespaces-hosted Core + private tunnel + visual browser Studio.

## Active product surface

- no platform-specific standalone runtime binaries;
- no local repository clone required for normal use;
- tiny Windows/Linux/macOS Codespaces launchers;
- lowest-core Codespace creation, start/restart and automatic one-retry recovery;
- 15-minute idle timeout and 7-day retention defaults;
- private local port tunnel to visual Studio;
- monthly Codespaces core-hour counter with Free/Pro quota awareness and explicit fallback behavior;
- loopback/Host/Origin/session-capability Studio trust boundary;
- allow-listed command bridge with `shell:false` and sanitized Core subprocess environment;
- Web/PWA, Browser Extension, API/Backend, CLI and Game adapters;
- baseline/regression/history/trace/gate/repair lifecycle;
- Intent IR, privacy bundles and artifact viewer;
- GitHub App + isolated worker;
- Perun production-security/vulnerability gate.

`v0.11.0-alpha.0` remains historical extraction/cutover evidence only.

GitHub Actions remain optional and manual-only; no Codespaces prebuild or binary-build workflow is part of the active architecture.
