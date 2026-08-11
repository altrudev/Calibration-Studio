"use strict";

const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { verifyWebhookSignature } = require("./signature");
const { createAppJwt } = require("./auth");
const { createGitHubClient } = require("./client");
const { createDockerSandboxExecutor } = require("./docker-sandbox");
const { runGithubCalibrationJob } = require("./worker");
const { FileWorkerQueue } = require("./worker-queue");
const { DEFAULT_POLICY_PATH } = require("./worker-policy");

function readPrivateKeyFromEnv(env) {
  let privateKeyPem = env.CALIBRATION_GITHUB_PRIVATE_KEY || null;
  if (!privateKeyPem && env.CALIBRATION_GITHUB_PRIVATE_KEY_FILE) privateKeyPem = fs.readFileSync(env.CALIBRATION_GITHUB_PRIVATE_KEY_FILE, "utf8");
  if (privateKeyPem?.includes("\\n")) privateKeyPem = privateKeyPem.replace(/\\n/g, "\n");
  return privateKeyPem;
}

function loadGithubWorkerConfigFromEnv(env = process.env) {
  const appId = env.CALIBRATION_GITHUB_APP_ID;
  const privateKeyPem = readPrivateKeyFromEnv(env);
  const workerSecret = env.CALIBRATION_GITHUB_WORKER_SECRET;
  const sandboxImage = env.CALIBRATION_GITHUB_SANDBOX_IMAGE;
  if (!appId || !privateKeyPem || !workerSecret || !sandboxImage) throw new Error("GitHub worker requires CALIBRATION_GITHUB_APP_ID, a GitHub App private key, CALIBRATION_GITHUB_WORKER_SECRET, and CALIBRATION_GITHUB_SANDBOX_IMAGE");
  if (workerSecret.length < 32) throw new Error("CALIBRATION_GITHUB_WORKER_SECRET must be at least 32 characters");
  return {
    appId,
    privateKeyPem,
    workerSecret,
    sandboxImage,
    host: env.CALIBRATION_GITHUB_WORKER_HOST || "127.0.0.1",
    port: Number(env.CALIBRATION_GITHUB_WORKER_PORT || 8788),
    queueDir: path.resolve(env.CALIBRATION_GITHUB_WORKER_QUEUE_DIR || path.join(os.tmpdir(), "calibration-studio-github-worker-queue")),
    concurrency: Number(env.CALIBRATION_GITHUB_WORKER_CONCURRENCY || 1),
    policyPath: env.CALIBRATION_GITHUB_POLICY_PATH || DEFAULT_POLICY_PATH,
    dockerCommand: env.CALIBRATION_GITHUB_DOCKER_COMMAND || "docker",
    memoryMb: Number(env.CALIBRATION_GITHUB_SANDBOX_MEMORY_MB || 2048),
    cpus: Number(env.CALIBRATION_GITHUB_SANDBOX_CPUS || 2),
    pidsLimit: Number(env.CALIBRATION_GITHUB_SANDBOX_PIDS || 256),
    timeoutMs: Number(env.CALIBRATION_GITHUB_SANDBOX_TIMEOUT_MS || 15 * 60 * 1000),
    maxRequestBytes: Number(env.CALIBRATION_GITHUB_WORKER_MAX_REQUEST_BYTES || 1024 * 1024)
  };
}

function readBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", chunk => {
      size += chunk.length;
      if (size > maxBytes) { reject(new Error("Worker request too large")); request.destroy(); return; }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function outputFor(result) {
  const output = {
    title: String(result?.title || "Calibration Studio result").slice(0, 255),
    summary: String(result?.summary || "Calibration Studio worker completed.").slice(0, 65535)
  };
  if (result?.text) output.text = String(result.text).slice(0, 65535);
  return output;
}

function conclusionFor(value) {
  return new Set(["action_required", "cancelled", "failure", "neutral", "skipped", "success", "timed_out"]).has(value) ? value : "failure";
}

function validateDispatch(payload) {
  if (!payload || payload.schema !== "altru-calibration-github-dispatch/0.1") throw new Error("Unsupported GitHub worker dispatch schema");
  if (typeof payload.dispatch_id !== "string" || !payload.dispatch_id) throw new Error("Worker dispatch_id is required");
  if (!Number.isInteger(Number(payload.check_run_id)) || Number(payload.check_run_id) <= 0) throw new Error("Worker check_run_id is invalid");
  if (!payload.job || payload.job.schema !== "altru-calibration-github-job/0.1") throw new Error("Worker GitHub job is invalid");
  return payload;
}

function createGithubWorkerHandler({ appId, privateKeyPem, sandboxExecutor, policyPath = DEFAULT_POLICY_PATH, fetchImpl = globalThis.fetch } = {}) {
  if (!appId || !privateKeyPem || typeof sandboxExecutor !== "function") throw new Error("GitHub worker handler configuration is incomplete");
  const client = createGitHubClient({ fetchImpl });
  return async dispatch => {
    validateDispatch(dispatch);
    const job = dispatch.job;
    const appJwt = createAppJwt({ appId, privateKeyPem });
    const installation = await client.createInstallationToken({ appJwt, installationId: job.installation_id });
    if (!installation?.token) throw new Error("GitHub did not return an installation token to the worker");
    const token = installation.token;
    let result;
    try {
      result = await runGithubCalibrationJob({ job, client, token, sandboxExecutor, policyPath });
    } catch (error) {
      result = {
        conclusion: "failure",
        title: "Calibration worker failed",
        summary: "The isolated Calibration Studio worker could not complete this pull request.",
        text: String(error?.message || "Unknown worker failure").slice(0, 12000)
      };
    }
    await client.updateCheckRun({
      token,
      owner: job.repository.owner,
      repo: job.repository.repo,
      checkRunId: dispatch.check_run_id,
      conclusion: conclusionFor(result.conclusion),
      output: outputFor(result)
    });
    return { check_run_id: Number(dispatch.check_run_id), conclusion: conclusionFor(result.conclusion) };
  };
}

function createGithubWorkerServer({ workerSecret, queue, maxRequestBytes = 1024 * 1024 } = {}) {
  if (typeof workerSecret !== "string" || workerSecret.length < 32) throw new Error("Worker secret is required");
  if (!queue || typeof queue.enqueue !== "function") throw new Error("Worker queue is required");
  return http.createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/healthz") {
      response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify({ status: "ok", service: "calibration-studio-github-worker" }));
      return;
    }
    if (request.method !== "POST" || request.url !== "/jobs") {
      response.writeHead(404, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify({ error: "not_found" }));
      return;
    }
    try {
      const rawBody = await readBody(request, maxRequestBytes);
      const signature = request.headers["x-calibration-worker-signature"];
      if (!verifyWebhookSignature({ secret: workerSecret, rawBody, signature })) {
        response.writeHead(401, { "content-type": "application/json", "cache-control": "no-store" });
        response.end(JSON.stringify({ error: "invalid_worker_signature" }));
        return;
      }
      const payload = validateDispatch(JSON.parse(rawBody.toString("utf8")));
      const queued = queue.enqueue(payload);
      response.writeHead(202, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify({ status: queued.duplicate ? "duplicate" : "queued", dispatch_id: payload.dispatch_id, queue_state: queued.state }));
    } catch (error) {
      response.writeHead(400, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify({ error: String(error?.message || "bad_request").slice(0, 1000) }));
    }
  });
}

function startGithubWorker(config = {}) {
  const sandboxExecutor = config.sandboxExecutor || createDockerSandboxExecutor({
    dockerCommand: config.dockerCommand,
    image: config.sandboxImage,
    memoryMb: config.memoryMb,
    cpus: config.cpus,
    pidsLimit: config.pidsLimit,
    timeoutMs: config.timeoutMs
  });
  const queue = config.queue || new FileWorkerQueue({ directory: config.queueDir, concurrency: config.concurrency });
  const handler = createGithubWorkerHandler({ appId: config.appId, privateKeyPem: config.privateKeyPem, sandboxExecutor, policyPath: config.policyPath, fetchImpl: config.fetchImpl });
  queue.start(handler);
  const server = createGithubWorkerServer({ workerSecret: config.workerSecret, queue, maxRequestBytes: config.maxRequestBytes });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port || 8788, config.host || "127.0.0.1", () => resolve({ server, queue }));
  });
}

module.exports = {
  createGithubWorkerServer,
  createGithubWorkerHandler,
  startGithubWorker,
  loadGithubWorkerConfigFromEnv,
  validateDispatch,
  readPrivateKeyFromEnv,
  outputFor,
  conclusionFor
};
