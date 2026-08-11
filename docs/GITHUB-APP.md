# Calibration Studio GitHub App and isolated worker

Calibration Studio integrates with GitHub through signed webhooks and the GitHub REST API directly. GitHub Actions are not required.

## Architecture

```text
GitHub pull request
  -> X-Hub-Signature-256 webhook
  -> Calibration Studio GitHub App service
       - validates webhook
       - authenticates installation
       - creates in-progress Check Run
       - HMAC-signs worker dispatch
       - returns 2xx quickly
  -> persistent worker queue
  -> Calibration Studio GitHub worker
       - authenticates installation independently
       - loads policy/baseline/plan from PR base commit
       - materializes bounded base/head snapshots through Git API
       - evaluates snapshots in isolated Docker containers
       - compares both against immutable baseline
       - verifies repairs when base is already regressed
  -> GitHub Check Run completion
```

The webhook process never executes pull-request code. Candidate code only enters the Docker sandbox. GitHub App credentials, installation tokens, webhook secrets and worker-dispatch secrets are not mounted into the sandbox.

## GitHub App permissions

Repository permissions:

- **Metadata: Read-only**
- **Pull requests: Read-only**
- **Contents: Read-only**
- **Checks: Read and write**

Subscribe only to:

- **Pull request**

The worker needs Contents read because it reads the trusted policy/baseline and reconstructs source snapshots from Git commit/tree/blob endpoints. It does not require Contents write, Actions, Workflows, Issues, Administration, Members, Secrets or repository write access.

If an existing GitHub App installation was created before Contents read was added, update the App permission and approve the changed permission for the installation before enabling the worker.

## Webhook configuration

- content type: `application/json`
- active: enabled
- secret: high-entropy random value stored outside the repository
- endpoint: `https://YOUR_HOST/github/webhook`

Install the App only on repositories that should be calibrated. Selected-repository installation is preferred during preview.

## Service credentials

The webhook service requires:

```text
CALIBRATION_GITHUB_APP_ID=<numeric app id>
CALIBRATION_GITHUB_WEBHOOK_SECRET=<GitHub webhook secret>
CALIBRATION_GITHUB_PRIVATE_KEY_FILE=/secure/path/github-app.private-key.pem
```

`CALIBRATION_GITHUB_PRIVATE_KEY` may contain the PEM directly instead of using a file. Do not commit either form.

Optional webhook listener settings:

```text
CALIBRATION_GITHUB_HOST=127.0.0.1
CALIBRATION_GITHUB_PORT=8787
CALIBRATION_GITHUB_MAX_WEBHOOK_BYTES=2097152
```

## Worker dispatch

Configure the webhook service to dispatch long-running work:

```text
CALIBRATION_GITHUB_WORKER_URL=http://127.0.0.1:8788/jobs
CALIBRATION_GITHUB_WORKER_SECRET=<at-least-32-character-random-secret>
```

Remote worker URLs must use HTTPS. Plain HTTP is accepted only for loopback addresses.

The worker dispatch payload contains the normalized GitHub job and Check Run ID. It does **not** contain the installation access token or private key. Every dispatch is authenticated with HMAC-SHA256.

Start the webhook service:

```bash
npm run github-app
```

Health endpoint:

```text
GET /healthz
```

Webhook endpoint:

```text
POST /github/webhook
```

## Worker runtime

The worker needs the GitHub App identity, worker-dispatch secret and a pre-provisioned container image:

```text
CALIBRATION_GITHUB_APP_ID=<same app id>
CALIBRATION_GITHUB_PRIVATE_KEY_FILE=/secure/path/github-app.private-key.pem
CALIBRATION_GITHUB_WORKER_SECRET=<same worker secret>
CALIBRATION_GITHUB_SANDBOX_IMAGE=<local image containing Node 24 and required evaluator tooling>
```

Worker settings:

```text
CALIBRATION_GITHUB_WORKER_HOST=127.0.0.1
CALIBRATION_GITHUB_WORKER_PORT=8788
CALIBRATION_GITHUB_WORKER_QUEUE_DIR=/var/lib/calibration-studio/github-worker
CALIBRATION_GITHUB_WORKER_CONCURRENCY=1
CALIBRATION_GITHUB_POLICY_PATH=.calibration/github-policy.json
CALIBRATION_GITHUB_DOCKER_COMMAND=docker
CALIBRATION_GITHUB_SANDBOX_MEMORY_MB=2048
CALIBRATION_GITHUB_SANDBOX_CPUS=2
CALIBRATION_GITHUB_SANDBOX_PIDS=256
CALIBRATION_GITHUB_SANDBOX_TIMEOUT_MS=900000
```

Start the worker:

```bash
npm run github-worker
```

Worker health endpoint:

```text
GET /healthz
```

Worker dispatch endpoint:

```text
POST /jobs
```

The file-backed queue recovers jobs left in the running state after a worker restart. Completed dispatch IDs are retained for idempotency; a failed dispatch can be retried by an explicit redelivery.

## Sandbox boundary

The built-in worker uses Docker with hard security defaults:

- no network (`--network none`);
- read-only container root filesystem;
- all Linux capabilities dropped;
- `no-new-privileges` enabled;
- numeric non-root user;
- explicit PID, memory and CPU limits;
- source snapshot mounted read-only;
- disposable tmpfs workspace and `/tmp`;
- only a dedicated observation-output directory is writable to the host;
- no Docker socket mount;
- no GitHub token, App key, webhook secret or worker secret in the container;
- no inherited host environment variables.

The sandbox image is **not pulled automatically**. Provision and inspect it separately. It must provide Node.js 24 because the sandbox runner is Node-based, plus any evaluator/runtime tooling required by the base-owned calibration plan.

Network access is intentionally unsupported in the GitHub worker v0.1 sandbox. Use pre-provisioned dependencies and local targets. Remote-target calibration belongs behind a separately reviewed executor policy rather than being silently enabled for PR code.

## Trusted repository policy

The worker reads the policy from the PR **base commit**, not the head commit. Default path:

```text
.calibration/github-policy.json
```

Example:

```json
{
  "schema": "altru-calibration-github-policy/0.1",
  "enabled": true,
  "baseline_path": ".calibration/baseline.json",
  "plan_path": ".calibration/github-plan.json",
  "repair_verification": true,
  "limits": {
    "max_files": 5000,
    "max_bytes": 104857600,
    "max_blob_bytes": 20971520,
    "max_observation_bytes": 10485760
  }
}
```

See `samples/github-app/github-policy.json` and `schemas/github-policy-0.1.schema.json`.

The policy may not point into `.git`, use path traversal or introduce unknown fields. Repository snapshots reject symlinks and submodules and fail closed if GitHub reports a truncated recursive tree.

## Evaluation plan

The default policy points to:

```text
.calibration/github-plan.json
```

This file is a normal `calibration-continuous-plan/0.8` plan, also loaded from the base commit. Example:

```json
{
  "schema": "calibration-continuous-plan/0.8",
  "trace_on_regression": false,
  "gate": {
    "fail_on_environment_change": false,
    "fail_on_untracked_observations": false
  },
  "setup_commands": [],
  "evaluate": {
    "command": "node",
    "args": ["scripts/calibration-observe.js"],
    "cwd": ".",
    "timeout_ms": 120000
  },
  "pass_environment": [],
  "environment": {}
}
```

`pass_environment` must remain empty for GitHub-worker execution. Host secrets are never inherited. `trace_on_regression` must currently be `false`; exact first-bad historical tracing remains a local/operator-controlled capability and is not executed from PR webhooks in worker v0.1.

The evaluator must write a Calibration Studio observation set to the path provided by `CALIBRATION_OBSERVATIONS_FILE`.

## Baseline and PR semantics

The baseline is an integrity-verified `altru-calibration-baseline/0.1` artifact loaded from the base commit.

For each pull request the worker evaluates both endpoints with the same trusted plan:

```text
baseline vs PR base -> BEFORE regression
baseline vs PR head -> AFTER regression
```

The resulting Check semantics are:

```text
base stable      + head stable      -> success
base stable      + head regressed   -> failure
base regressed   + head stable      -> success + repair verified
base regressed   + head regressed   -> failure / unresolved repair
```

This turns the GitHub Check into a real Calibration Studio regression gate rather than a generic CI pass/fail wrapper.

## Source acquisition limits

The worker uses installation-scoped GitHub API access to read commit/tree/blob objects. Before fetching blob contents it checks policy limits and rejects:

- excessive file counts;
- excessive declared or actual bytes;
- oversized individual blobs;
- symlinks;
- submodules;
- `.git` paths;
- path traversal/non-canonical paths;
- truncated recursive Git trees.

This acquisition stage does not execute source files.

## Webhook timing and idempotency

The webhook process creates the Check Run and queues the job before returning. Long-running calibration is never performed inline with GitHub's webhook request.

`X-GitHub-Delivery` remains the webhook idempotency key. The internal worker dispatch combines that delivery ID with the Check Run ID and stores it in the persistent queue.

## Local validation

Run the normal repository gate:

```bash
npm run check
npm test
```

Focused GitHub tests cover:

- GitHub HMAC webhook verification;
- App JWT construction;
- base/head SHA pinning;
- asynchronous worker dispatch;
- HMAC worker authentication;
- persistent dispatch deduplication;
- symlink/submodule refusal;
- source-size/path limits;
- regression failure semantics;
- base-regression to head-stable repair verification.

No GitHub-hosted workflow is required for this validation.
