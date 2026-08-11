# Calibration Studio security boundary

Calibration Studio executes developer-selected software, so execution authority, credential isolation and evidence minimization are explicit boundaries.

## Codespaces control plane

- normal users do not clone the product locally;
- the launcher uses GitHub CLI directly and never pipes downloaded text into a shell;
- the dedicated Codespace requests the lowest-core available machine, 15-minute idle timeout and 7-day retention;
- no Codespaces prebuild is configured;
- Studio port 4317 is not configured public; the normal connection is an authenticated private GitHub CLI port-forward;
- forced restart and one automatic recovery restart are lifecycle operations only, not arbitrary remote execution interfaces.

## Studio HTTP/API boundary

- binds only to `127.0.0.1`/loopback;
- rejects non-loopback Host headers to resist DNS-rebinding style access;
- command requests reject disallowed Origin values;
- command and billing endpoints require a random per-process capability token acquired by the same-origin UI and kept only in memory;
- no CORS trust is granted;
- CSP, frame denial, no-referrer, MIME sniffing denial and restrictive Permissions-Policy headers are applied;
- command bodies and command output are bounded;
- the API maps structured input onto an allow-listed Calibration operation set and never accepts a shell command string;
- subprocesses use explicit argv and `shell:false`;
- the Core command subprocess receives a minimal allow-listed environment, excluding GitHub tokens, SSH agent sockets, Node injection variables and arbitrary host secrets.

## Execution authority

CLI and Game execution, historical tracing and continuous evaluation retain explicit operator confirmation. Effectful API calls, remote Game targets, persistent Game state and CLI parent-environment inheritance require the existing dual plan/operator authority. Workspace-copy isolation is not represented as an OS sandbox; container mode remains the stronger boundary where configured.

## Evidence privacy

Recognized secrets are redacted from exported evidence and bundles. Browser observations expose storage key topology rather than local-storage values. Evidence URLs should remove URL credentials and query values. Output/capture surfaces are bounded.

## Dependency / supply-chain boundary

- exact lock graph and exact direct dependency versions;
- package remains private;
- root install lifecycle hooks are absent;
- lockfile registry packages require SHA-512 integrity metadata;
- Perun runs `npm audit` plus registry signature/attestation verification when online;
- the retained optional GitHub Actions validation workflow is manual-only and every third-party action reference is pinned to an immutable full commit SHA.

## Codespaces usage data

The core-hour counter queries GitHub billing through `gh api`; the browser never receives the GitHub credential. The user billing summary endpoint can require Plan user read permission. If it is unavailable, the UI reports that limitation and uses only an explicitly labeled current-session estimate when possible.

## Perun

`npm run perun` is the production-security gate. It checks secret material, dangerous execution primitives, remote runtime UI assets, launcher bootstrap/RCE patterns, Studio trust controls, Codespace/public-port policy, Actions trigger/action pinning, dependency pins/lock integrity, source syntax, regression/adversarial tests, dependency graph integrity, vulnerability audit and registry signatures/attestations.

`npm run perun:offline` deliberately skips registry-backed vulnerability/signature checks and must not be described as a full supply-chain vulnerability pass.
