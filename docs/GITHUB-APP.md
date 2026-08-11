# Calibration Studio GitHub App

Calibration Studio includes a GitHub App integration preview that uses GitHub webhooks and the GitHub REST API directly. It does **not** use GitHub Actions.

## Purpose

The GitHub App is the narrow repository-facing boundary for Calibration Studio:

```text
GitHub pull request
  -> signed webhook
  -> Calibration Studio GitHub App
  -> installation-scoped GitHub API token
  -> changed-file intake
  -> isolated calibration worker boundary
  -> GitHub Check Run
```

The webhook process deliberately does not execute pull-request code. Its default runner authenticates the GitHub App installation, indexes the pull request's changed-file metadata, and publishes a neutral Check Run proving the integration path is healthy. A production behavioral-calibration runner must be attached as a separate isolated execution boundary.

## Recommended GitHub App settings

Repository permissions:

- **Metadata: Read-only** (GitHub requires this for all GitHub Apps)
- **Pull requests: Read-only**
- **Checks: Read and write**

Subscribe only to:

- **Pull request**

Webhook configuration:

- content type: `application/json`
- active: enabled
- secret: a high-entropy secret stored outside the repository
- endpoint: `https://YOUR_HOST/github/webhook`

Install the app only on repositories that should be calibrated. Prefer selected-repository installation while the integration is in preview.

The current preview does not require Contents, Issues, Administration, Members, Secrets, Actions, or Workflow permissions.

## Runtime configuration

Required environment variables:

```text
CALIBRATION_GITHUB_APP_ID=<numeric app id>
CALIBRATION_GITHUB_WEBHOOK_SECRET=<webhook secret>
CALIBRATION_GITHUB_PRIVATE_KEY_FILE=/secure/path/github-app.private-key.pem
```

Alternatively, `CALIBRATION_GITHUB_PRIVATE_KEY` may contain the PEM directly. Do not commit the private key or webhook secret.

Optional settings:

```text
CALIBRATION_GITHUB_HOST=127.0.0.1
CALIBRATION_GITHUB_PORT=8787
CALIBRATION_GITHUB_MAX_WEBHOOK_BYTES=2097152
```

Start the preview server:

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

A public GitHub App deployment must terminate HTTPS at a trusted public endpoint and forward the original request body unchanged so `X-Hub-Signature-256` validation remains valid.

## Authentication and API use

The adapter:

1. verifies `X-Hub-Signature-256` with HMAC-SHA256 and constant-time comparison;
2. creates a short-lived RS256 GitHub App JWT;
3. exchanges that JWT for an installation access token;
4. reads pull-request changed-file metadata through the REST API;
5. creates and completes a GitHub Check Run on the PR head SHA.

Installation tokens and private keys are never written to calibration artifacts or check output.

## Execution boundary

A GitHub webhook is untrusted external input. In particular, a pull request may be authored by someone who should never gain execution inside Altru.dev infrastructure.

Therefore the webhook server must not directly execute repository-defined CLI/Game/API plans or arbitrary checked-out PR code. Deep Calibration Studio execution belongs in an isolated worker with explicit resource, network, secret, persistence and effect authority. The GitHub layer passes only a normalized `altru-calibration-github-job/0.1` envelope into that boundary.

The default runner intentionally returns a neutral Check Run until such a worker is attached.

## Delivery idempotency

The development server uses an in-memory delivery store keyed by `X-GitHub-Delivery`. Production deployment should inject a durable store before horizontally scaling the service so webhook retries cannot produce duplicate work.

## Local validation

The focused adapter tests cover:

- GitHub's documented HMAC-SHA256 webhook test vector;
- webhook tamper rejection before API access;
- RS256 App JWT construction and bounded lifetime;
- pull-request event normalization;
- installation-token exchange;
- Checks API create/update flow.

Run:

```bash
npm run check
npm test
```

No GitHub-hosted workflow is required for validation.
