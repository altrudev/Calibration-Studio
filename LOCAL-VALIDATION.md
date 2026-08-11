# Local validation

Calibration Studio is **local-first**. Validation and packaging run locally or on operator-controlled machines by default. GitHub Actions are not required and never run automatically on push, pull request or schedule.

Install the exact dependency graph first:

```bash
npm ci --ignore-scripts --no-audit --no-fund
```

Run the normal local gate:

```bash
npm run gate
```

The default gate runs source syntax checks, regression tests, secret/key detection, hard-coded credential checks, execution-primitive checks, remote-runtime UI checks and the private-DDC implementation boundary guard.

Additional local gates are explicit:

```bash
npm run gate:security
npm run gate:supply-chain
npm run runtime:install-browser
npm run gate:runtime
npm run gate:standalone
npm run gate:all
```

`gate:supply-chain` requires registry/network access. Browser runtime installation is also explicit; calibration itself does not silently download browser executables.

## Optional GitHub workflows

Two GitHub workflows are retained only as **manual operator tools** using `workflow_dispatch`:

- `Optional - Calibration validation` mirrors a selected local gate on a GitHub-hosted Linux runner.
- `Optional - Four-platform preview build` builds Linux x64, Windows x64, macOS x64 and macOS arm64 packages, with one-day artifact retention. Publishing release assets requires an explicit `publish=true` choice.

Neither workflow has a `push`, `pull_request`, `schedule` or other automatic trigger. They consume GitHub Actions quota only when deliberately started by an operator.

The published `v0.11.0-alpha.0` release remains the validated migration baseline.
