# Local / Codespace validation

Calibration Studio validation is operator-controlled and local/manual by architecture. GitHub Actions are not part of the validation path.

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

## CI policy

No `.github/workflows/*.yml` or `.yaml` validation workflow is retained. Pushes and pull requests do not trigger GitHub-hosted validation. The repository test suite includes a regression guard that fails if a GitHub Actions workflow is reintroduced.

Validation evidence must come from the local/Codespace gates above or another explicitly controlled execution environment, not from an implicit hosted CI path.
