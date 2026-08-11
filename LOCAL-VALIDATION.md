# Local / Codespace validation

Calibration Studio validation is operator-controlled. GitHub Actions are not required and do not run on push, pull request or schedule.

Normal source gate:

```bash
npm run gate
```

Production-security gate:

```bash
npm run perun
```

Perun includes source parsing, full regression/adversarial tests, dependency graph integrity, security-boundary static checks, dependency vulnerability audit and npm registry signature/attestation verification. Network access is therefore required for the complete Perun result.

For intentionally offline development only:

```bash
npm run perun:offline
```

That mode skips registry vulnerability/signature checks and is not equivalent to a full security pass.

The Codespace first-run setup installs the exact dependency graph with automatic root lifecycle scripts disabled, installs/verifies pinned Chromium, runs the normal gate and then runs full Perun.

## Optional GitHub workflow

The repository retains one `workflow_dispatch` validation workflow as an optional operator tool. It has no automatic trigger. Third-party Actions are pinned to immutable full commit SHAs. There is no hosted binary-build workflow and no Codespaces prebuild workflow.
