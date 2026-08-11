"use strict";

const fs = require("node:fs");
const http = require("node:http");
const { createGitHubWebhookProcessor, WebhookError } = require("./processor");

function readRequestBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new WebhookError("Webhook body exceeds configured size limit", 413));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function loadGithubAppConfigFromEnv(env = process.env) {
  const appId = env.CALIBRATION_GITHUB_APP_ID;
  const webhookSecret = env.CALIBRATION_GITHUB_WEBHOOK_SECRET;
  let privateKeyPem = env.CALIBRATION_GITHUB_PRIVATE_KEY || null;
  if (!privateKeyPem && env.CALIBRATION_GITHUB_PRIVATE_KEY_FILE) {
    privateKeyPem = fs.readFileSync(env.CALIBRATION_GITHUB_PRIVATE_KEY_FILE, "utf8");
  }
  if (privateKeyPem?.includes("\\n")) privateKeyPem = privateKeyPem.replace(/\\n/g, "\n");
  if (!appId || !webhookSecret || !privateKeyPem) {
    throw new Error("CALIBRATION_GITHUB_APP_ID, CALIBRATION_GITHUB_WEBHOOK_SECRET, and a GitHub App private key are required");
  }
  return {
    appId,
    webhookSecret,
    privateKeyPem,
    host: env.CALIBRATION_GITHUB_HOST || "127.0.0.1",
    port: Number(env.PORT || env.CALIBRATION_GITHUB_PORT || 8787),
    maxWebhookBytes: Number(env.CALIBRATION_GITHUB_MAX_WEBHOOK_BYTES || 2 * 1024 * 1024)
  };
}

function createGithubAppServer({ processor, maxWebhookBytes = 2 * 1024 * 1024 }) {
  if (typeof processor !== "function") throw new Error("GitHub webhook processor is required");
  return http.createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/healthz") {
      response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify({ status: "ok", service: "calibration-studio-github-app" }));
      return;
    }
    if (request.method !== "POST" || request.url !== "/github/webhook") {
      response.writeHead(404, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify({ error: "not_found" }));
      return;
    }

    try {
      const rawBody = await readRequestBody(request, maxWebhookBytes);
      const result = await processor({ headers: request.headers, rawBody });
      response.writeHead(202, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify(result));
    } catch (error) {
      const statusCode = error instanceof WebhookError ? error.statusCode : 500;
      if (statusCode >= 500) console.error(`[Calibration GitHub App] ${error?.message || "request failed"}`);
      response.writeHead(statusCode, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify({ error: statusCode >= 500 ? "internal_error" : error.message }));
    }
  });
}

function startGithubAppServer({ appId, privateKeyPem, webhookSecret, host = "127.0.0.1", port = 8787, maxWebhookBytes, fetchImpl, runner } = {}) {
  const processor = createGitHubWebhookProcessor({ appId, privateKeyPem, webhookSecret, fetchImpl, runner });
  const server = createGithubAppServer({ processor, maxWebhookBytes });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve(server));
  });
}

module.exports = { createGithubAppServer, startGithubAppServer, loadGithubAppConfigFromEnv, readRequestBody };
