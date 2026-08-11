"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { verifyWebhookSignature } = require("../src/integrations/github-app/signature");
const { createAppJwt } = require("../src/integrations/github-app/auth");
const { normalizeGitHubEvent } = require("../src/integrations/github-app/events");
const { createGitHubWebhookProcessor } = require("../src/integrations/github-app/processor");

const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" });

function signature(secret, body) {
  return `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
}

function payload() {
  return {
    action: "synchronize",
    installation: { id: 42 },
    repository: { id: 7, full_name: "altrudev/example" },
    pull_request: { number: 12, draft: false, head: { sha: "a".repeat(40) } },
    sender: { login: "octocat" }
  };
}

test("webhook signature validation matches GitHub HMAC-SHA256", () => {
  const secret = "It's a Secret to Everybody";
  const body = "Hello, World!";
  assert.equal(verifyWebhookSignature({ secret, rawBody: body, signature: "sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17" }), true);
  assert.equal(verifyWebhookSignature({ secret, rawBody: `${body}!`, signature: "sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17" }), false);
});

test("GitHub App JWT uses RS256 and a bounded lifetime", () => {
  const jwt = createAppJwt({ appId: 123, privateKeyPem, nowMs: 1_700_000_000_000 });
  const [headerPart, payloadPart] = jwt.split(".");
  const header = JSON.parse(Buffer.from(headerPart, "base64url").toString("utf8"));
  const claims = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
  assert.equal(header.alg, "RS256");
  assert.equal(claims.iss, "123");
  assert.equal(claims.exp - claims.iat, 600);
});

test("pull_request events normalize to a minimal calibration job", () => {
  const job = normalizeGitHubEvent({ eventName: "pull_request", payload: payload() });
  assert.equal(job.repository.full_name, "altrudev/example");
  assert.equal(job.pull_request.number, 12);
  assert.equal(job.head_sha, "a".repeat(40));
  assert.equal(normalizeGitHubEvent({ eventName: "issues", payload: {} }), null);
});

test("processor authenticates installation and publishes a completed check", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    const pathname = new URL(url).pathname;
    if (pathname === "/app/installations/42/access_tokens") {
      return new Response(JSON.stringify({ token: "installation-token" }), { status: 201, headers: { "content-type": "application/json" } });
    }
    if (pathname === "/repos/altrudev/example/check-runs" && init.method === "POST") {
      return new Response(JSON.stringify({ id: 99 }), { status: 201, headers: { "content-type": "application/json" } });
    }
    if (pathname === "/repos/altrudev/example/check-runs/99" && init.method === "PATCH") {
      return new Response(JSON.stringify({ id: 99, conclusion: "success" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`Unexpected request ${init.method} ${url}`);
  };
  const processor = createGitHubWebhookProcessor({
    appId: "123",
    privateKeyPem,
    webhookSecret: "secret",
    fetchImpl,
    runner: async job => ({ conclusion: "success", title: "Calibrated", summary: `PR #${job.pull_request.number} passed.` })
  });
  const rawBody = Buffer.from(JSON.stringify(payload()), "utf8");
  const result = await processor({
    headers: {
      "x-hub-signature-256": signature("secret", rawBody),
      "x-github-delivery": "delivery-1",
      "x-github-event": "pull_request"
    },
    rawBody
  });
  assert.deepEqual(result, { status: "processed", delivery_id: "delivery-1", check_run_id: 99, conclusion: "success" });
  assert.equal(calls.length, 3);
  assert.match(calls[0].init.headers.authorization, /^Bearer eyJ/);
  assert.equal(calls[1].init.headers.authorization, "Bearer installation-token");
  assert.equal(JSON.parse(calls[2].init.body).conclusion, "success");
});

test("processor rejects tampered webhooks before any GitHub API call", async () => {
  let calls = 0;
  const processor = createGitHubWebhookProcessor({
    appId: "123",
    privateKeyPem,
    webhookSecret: "secret",
    fetchImpl: async () => { calls++; throw new Error("must not run"); },
    runner: async () => ({ conclusion: "success", title: "x", summary: "x" })
  });
  const rawBody = Buffer.from(JSON.stringify(payload()), "utf8");
  await assert.rejects(() => processor({
    headers: {
      "x-hub-signature-256": signature("wrong-secret", rawBody),
      "x-github-delivery": "delivery-2",
      "x-github-event": "pull_request"
    },
    rawBody
  }), /Invalid GitHub webhook signature/);
  assert.equal(calls, 0);
});
