# Calibration Studio security boundary

Calibration Studio is a developer-run diagnostic and assurance product. Some adapters execute developer-selected software, so execution authority and evidence minimization are explicit design boundaries.

## Default principles

- local-first operation;
- no telemetry requirement;
- no remote runtime JavaScript/CSS in the viewer;
- no remote code acquisition during calibration;
- exact dependency lock graph;
- pinned browser driver/runtime;
- explicit execution confirmation for CLI, Game, historical tracing and continuous evaluation paths that execute code;
- dual consent for effectful API requests, remote Game targets, persistent Game state and CLI parent-environment inheritance;
- bounded output/capture surfaces;
- recognized secret redaction;
- immutable approved baselines;
- deterministic integrity identities for lifecycle/release artifacts.

## CLI boundary

CLI execution uses `child_process.spawn` with `shell:false`.

By default:

- the project is copied to an isolated temporary workspace;
- HOME/TMP are temporary;
- the parent environment is not inherited;
- watched filesystem evidence is restricted to developer-declared project paths;
- output is bounded;
- output preview is disabled unless explicitly requested.

Workspace-copy isolation is compatibility isolation, **not an OS sandbox**.

Container mode is an explicit stronger boundary. Calibration Studio never silently downgrades a requested container run to host execution.

## API boundary

- URL userinfo is rejected;
- credential-bearing query values are redacted from public evidence;
- request/response bodies are not exported;
- credential header values are not exported;
- redirects use `redirect: manual` so caller credentials are not automatically forwarded to a different target;
- effectful methods require plan permission plus operator permission;
- downstream postcondition verifiers are restricted to GET/HEAD/OPTIONS.

## Browser/Game boundary

The packaged browser runtime is installed during controlled setup/build, not during calibration.

Game bridges must be realpath-contained beneath the plan directory, including symlink containment. Each scenario runs in its own browser context. Public observations are selected scalar metrics rather than raw game state.

## Historical tracing

Historical tracing uses detached temporary Git worktrees. Evaluators receive an isolated HOME/TMP and a minimal environment by default. Parent environment variables are not silently inherited.

## DDC boundary

Private DDC implementation is not part of this repository.

The optional provider protocol serializes only public allow-listed evidence. Product CI scans executable/product surfaces for private DDC implementation vocabulary.

## Release integrity

Release manifests reject:

- absolute paths;
- traversal paths;
- non-canonical paths;
- duplicate declared paths;
- symlinks;
- missing/unlisted files;
- modified file content.

Detached release signatures are Ed25519 only. A release cannot establish its own authenticity by bundling a public key beside its own signature; verification requires an independently supplied trusted public key.

## Residual boundary

Host-mode developer code is still developer code running on the host. API targets are developer-selected. Release-signing strength depends on production key protection. Browser/runtime freshness must be reviewed before each release line.
