# Calibration Studio v0.11 user guide

## Install for source development

Requirements:

- Node.js 24 or newer
- exact dependency graph from `package-lock.json`

```bash
npm ci --ignore-scripts
npm rebuild node-pty --foreground-scripts   # only needed for PTY support
npm run runtime:install-browser
npm run runtime:verify-browser
npm test
```

Browser acquisition is a setup/packaging action. Calibration commands do not download browser executables.

## Discover supported software

```bash
calibrate adapters
calibrate discover --type web-pwa --project /path/to/project
calibrate discover --type browser-extension --project /path/to/extension
calibrate discover --type api --project /path/to/api
calibrate discover --type cli --project /path/to/cli
```

Discovery-generated expectations are candidates only. Review them before treating them as product authority.

## Capture observations

Web/PWA:

```bash
calibrate capture --type web-pwa --url http://127.0.0.1:8080 --output observations.json
```

Browser Extension:

```bash
calibrate capture --type browser-extension --project ./extension --output observations.json
```

API:

```bash
calibrate capture --type api --plan api-plan.json --output observations.json
```

Effectful API requests require `allow_effectful:true` in the developer plan **and** `--allow-effectful` from the operator.

CLI:

```bash
calibrate capture --type cli --plan cli-plan.json --project . --confirm-execution --output observations.json
```

A CLI plan that requests `inherit_env:true` additionally requires `--allow-inherit-env`.

Game:

```bash
calibrate capture --type game --plan game-plan.json --url http://127.0.0.1:8080 --confirm-execution --output observations.json
```

Remote Game targets and persistent-state Game runs each require explicit plan intent plus a separate operator flag.

## Calibrate and establish a baseline

```bash
calibrate run --contract contract.json --observations observations.json --project . --output report.json
calibrate baseline --contract contract.json --observations observations.json --project . --label known-good --output baseline.json
```

A baseline can be created only from a fully calibrated run.

## Compare later behavior

```bash
calibrate compare --baseline baseline.json --observations current-observations.json --project . --output regression.json
```

Results distinguish:

- stable;
- within approved tolerance;
- drifted;
- missing.

Environment changes and untracked observations remain separate evidence rather than being silently converted into baseline failures.

## Continuous calibration gate

```bash
calibrate gate \
  --baseline baseline.json \
  --plan continuous-plan.json \
  --project . \
  --confirm-execution \
  --output gate.json
```

Exit semantics:

- `0` — gate passed;
- `2` — software/policy gate failed;
- `1` — configuration or execution error.

If configured, a failed gate can attach an exact first-parent historical trace.

## Historical first-bad tracing

```bash
calibrate trace \
  --baseline baseline.json \
  --plan history-plan.json \
  --project . \
  --confirm-execution \
  --output trace.json
```

Exact tracing evaluates first-parent history rather than assuming a monotonic regression. Binary mode remains optional and explicitly carries its monotonicity assumption.

## Repair scope and verification

```bash
calibrate repair-scope \
  --baseline baseline.json \
  --before regression.json \
  --mode domain-neighborhood \
  --output scope.json

calibrate repair-run \
  --baseline baseline.json \
  --before regression.json \
  --scope scope.json \
  --plan history-plan.json \
  --project . \
  --confirm-execution \
  --output repair-run.json
```

Scopes:

- `minimal`
- `domain-neighborhood`
- `full`

Scoped verification is never represented as full-baseline proof.

## Intent IR

```bash
ddc-intent compile --intent intent.json --output intent-contract.json
ddc-intent verify --intent intent.json --facts facts.json --output intent-verification.json
ddc-intent gate --intent intent.json --facts facts.json
ddc-intent diff --before intent-v1.json --after intent-v2.json --output intent-delta.json
```

Intent compilation is deterministic. An AI may propose candidate Intent IR outside this boundary, but it is not authoritative; validation, conflicts, inheritance and gate results are deterministic product behavior.

## Privacy bundles

```bash
calibrate bundle --artifact report.json --artifact gate.json --bundle ./bundle --privacy sanitized
calibrate verify-bundle --bundle ./bundle
```

Privacy profiles:

- `full`
- `developer`
- `sanitized`
- `shareable`

Recognized secrets are redacted in every profile. Shareable Intent artifacts retain provenance type/reference while removing raw human provenance statements.

## Local viewer

Open `ui/index.html` locally and choose an artifact JSON file. The viewer has no remote JavaScript/CSS runtime and independently verifies supported artifact fingerprints before rendering them as valid evidence.
