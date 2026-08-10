# Local validation

Calibration Studio does **not** use GitHub Actions. Validation and packaging are run locally or on operator-controlled machines.

Install the exact dependency graph first:

```bash
npm ci --ignore-scripts --no-audit --no-fund
```

Normal source/test gate:

```bash
node scripts/validate-local.js
```

Optional runtime and packaging gates:

```bash
npm run runtime:install-browser
node scripts/validate-local.js --runtime
node scripts/validate-local.js --standalone
node scripts/validate-local.js --all
```

The existing product commands remain available directly:

```bash
npm run check
npm test
npm run runtime:verify-browser
npm run standalone:stage
npm run adapters
npm run version:product
```

Four-platform release packages are now produced deliberately on the target platform or another operator-controlled build machine instead of GitHub-hosted runners. The published `v0.11.0-alpha.0` release remains the validated migration baseline.

Historical Actions definitions are retained by Git history only; active `.github/workflows` is intentionally absent.
