# Local validation

Calibration Studio is **local-first**. Validation runs locally or on operator-controlled machines by default. GitHub Actions are not required and never run automatically on push, pull request or schedule.

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
npm run gate:all
```

`gate:supply-chain` requires registry/network access. Browser runtime installation is explicit; calibration itself does not silently download browser executables.

## Optional GitHub workflow

One GitHub workflow is retained only as a **manual operator tool** using `workflow_dispatch`:

- `Optional - Calibration validation` mirrors a selected local gate on a GitHub-hosted Linux runner.

There is no binary build workflow and no automatic `push`, `pull_request`, `schedule` or other trigger.

## Distribution direction

Large platform-specific standalone binaries are retired. The active direction is a terminal-installed Calibration Core plus a locally served browser Studio. The CLI remains available for automation and advanced workflows, while ordinary use should happen through the visual local web interface.
