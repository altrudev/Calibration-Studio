"use strict";

const { verifyWebhookSignature } = require("./signature");
const { createAppJwt } = require("./auth");
const { createGitHubClient } = require("./client");
const { normalizeGitHubEvent } = require("./events");

class WebhookError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = "WebhookError";
    this.statusCode = statusCode;
  }
}

class MemoryDeliveryStore {
  constructor({ maxEntries = 5000 } = {}) { this.maxEntries = maxEntries; this.entries = new Map(); }
  begin(id) { if (this.entries.has(id)) return false; this.entries.set(id, "processing"); while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value); return true; }
  complete(id) { this.entries.set(id, "complete"); }
  release(id) { this.entries.delete(id); }
}

function headerValue(headers, name) {
  if (headers && typeof headers.get === "function") return headers.get(name);
  const value = headers?.[name.toLowerCase()] ?? headers?.[name] ?? null;
  return Array.isArray(value) ? value[0] : value;
}

function checkOutput(result) {
  const title = String(result?.title || "Calibration Studio result").slice(0, 255);
  const summary = String(result?.summary || "Calibration Studio completed without a summary.").slice(0, 65535);
  const output = { title, summary };
  if (result?.text) output.text = String(result.text).slice(0, 65535);
  return output;
}

function normalizeConclusion(value) {
  const allowed = new Set(["action_required", "cancelled", "failure", "neutral", "skipped", "success", "timed_out"]);
  return allowed.has(value) ? value : "neutral";
}

async function defaultRunner(job, { client, token }) {
  const files = await client.listPullRequestFiles({ token, owner: job.repository.owner, repo: job.repository.repo, pullNumber: job.pull_request.number });
  const preview = files.slice(0, 20).map(file => `- ${file.status}: ${file.filename}`).join("\n");
  const suffix = files.length > 20 ? `\n- …and ${files.length - 20} more` : "";
  return {
    conclusion: "neutral",
    title: "GitHub intake verified",
    summary: `Calibration Studio authenticated the installation and indexed ${files.length} changed file${files.length === 1 ? "" : "s"}. Deep calibration is not executed by the webhook process itself.`,
    text: `${preview || "No changed files reported by GitHub."}${suffix}\n\nConfigure the isolated GitHub worker to turn this intake check into a behavioral calibration gate.`
  };
}

function createGitHubWebhookProcessor({ appId, privateKeyPem, webhookSecret, fetchImpl = globalThis.fetch, runner = defaultRunner, dispatcher = null, deliveryStore = new MemoryDeliveryStore(), checkName = "Calibration Studio" }) {
  if (!appId) throw new Error("GitHub App ID is required");
  if (!privateKeyPem) throw new Error("GitHub App private key is required");
  if (!webhookSecret) throw new Error("GitHub webhook secret is required");
  if (dispatcher !== null && typeof dispatcher !== "function") throw new Error("GitHub worker dispatcher must be a function");
  if (!dispatcher && typeof runner !== "function") throw new Error("GitHub calibration runner must be a function");
  const client = createGitHubClient({ fetchImpl });

  return async function processWebhook({ headers, rawBody }) {
    const signature = headerValue(headers, "x-hub-signature-256");
    if (!verifyWebhookSignature({ secret: webhookSecret, rawBody, signature })) throw new WebhookError("Invalid GitHub webhook signature", 401);
    const deliveryId = headerValue(headers, "x-github-delivery");
    const eventName = headerValue(headers, "x-github-event");
    if (!deliveryId || !eventName) throw new WebhookError("Missing GitHub webhook delivery headers", 400);
    if (!deliveryStore.begin(deliveryId)) return { status: "duplicate", delivery_id: deliveryId };
    try {
      let payload;
      try { payload = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : rawBody); }
      catch { throw new WebhookError("Webhook body is not valid JSON", 400); }
      const job = normalizeGitHubEvent({ eventName, payload });
      if (!job) { deliveryStore.complete(deliveryId); return { status: "ignored", delivery_id: deliveryId, event: eventName }; }
      const appJwt = createAppJwt({ appId, privateKeyPem });
      const installation = await client.createInstallationToken({ appJwt, installationId: job.installation_id });
      if (!installation?.token) throw new Error("GitHub did not return an installation access token");
      const token = installation.token;
      const check = await client.createCheckRun({
        token,
        owner: job.repository.owner,
        repo: job.repository.repo,
        name: checkName,
        headSha: job.head_sha,
        output: { title: dispatcher ? "Calibration queued" : "Calibration intake accepted", summary: dispatcher ? `Queuing isolated calibration for pull request #${job.pull_request.number}.` : `Processing pull request #${job.pull_request.number}.` }
      });
      if (!check?.id) throw new Error("GitHub did not return a check-run ID");

      if (dispatcher) {
        try {
          await dispatcher({ job, checkRunId: check.id, deliveryId });
          deliveryStore.complete(deliveryId);
          return { status: "accepted", delivery_id: deliveryId, check_run_id: check.id };
        } catch (error) {
          await client.updateCheckRun({
            token,
            owner: job.repository.owner,
            repo: job.repository.repo,
            checkRunId: check.id,
            conclusion: "failure",
            output: { title: "Calibration worker unavailable", summary: String(error?.message || "Calibration worker dispatch failed").slice(0, 65535) }
          });
          deliveryStore.complete(deliveryId);
          return { status: "failed", delivery_id: deliveryId, check_run_id: check.id };
        }
      }

      let result;
      try { result = await runner(job, { client, token, checkRunId: check.id }); }
      catch (error) {
        await client.updateCheckRun({ token, owner: job.repository.owner, repo: job.repository.repo, checkRunId: check.id, conclusion: "failure", output: { title: "Calibration worker failed", summary: String(error?.message || "Calibration worker failed").slice(0, 65535) } });
        deliveryStore.complete(deliveryId);
        return { status: "failed", delivery_id: deliveryId, check_run_id: check.id };
      }
      const conclusion = normalizeConclusion(result?.conclusion);
      await client.updateCheckRun({ token, owner: job.repository.owner, repo: job.repository.repo, checkRunId: check.id, conclusion, output: checkOutput(result) });
      deliveryStore.complete(deliveryId);
      return { status: "processed", delivery_id: deliveryId, check_run_id: check.id, conclusion };
    } catch (error) {
      deliveryStore.release(deliveryId);
      throw error;
    }
  };
}

module.exports = { createGitHubWebhookProcessor, defaultRunner, MemoryDeliveryStore, WebhookError, checkOutput, normalizeConclusion };
