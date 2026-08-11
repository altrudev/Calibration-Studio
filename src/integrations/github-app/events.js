"use strict";

const SUPPORTED_PULL_REQUEST_ACTIONS = new Set(["opened", "reopened", "synchronize", "ready_for_review"]);

function splitRepository(fullName) {
  if (typeof fullName !== "string") throw new Error("Webhook repository.full_name is required");
  const slash = fullName.indexOf("/");
  if (slash <= 0 || slash === fullName.length - 1 || fullName.indexOf("/", slash + 1) !== -1) throw new Error("Webhook repository.full_name is invalid");
  return { owner: fullName.slice(0, slash), repo: fullName.slice(slash + 1) };
}

function validSha(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/i.test(value)) throw new Error(`${label} is invalid`);
  return value.toLowerCase();
}

function normalizeGitHubEvent({ eventName, payload }) {
  if (eventName !== "pull_request") return null;
  if (!payload || !SUPPORTED_PULL_REQUEST_ACTIONS.has(payload.action)) return null;
  if (payload.pull_request?.draft && payload.action !== "ready_for_review") return null;
  const installationId = Number(payload.installation?.id);
  const pullNumber = Number(payload.pull_request?.number || payload.number);
  const headSha = validSha(payload.pull_request?.head?.sha, "Webhook pull request head SHA");
  const baseSha = validSha(payload.pull_request?.base?.sha, "Webhook pull request base SHA");
  const fullName = payload.repository?.full_name;
  if (!Number.isInteger(installationId) || installationId <= 0) throw new Error("Webhook installation.id is required");
  if (!Number.isInteger(pullNumber) || pullNumber <= 0) throw new Error("Webhook pull request number is required");
  const { owner, repo } = splitRepository(fullName);
  return {
    schema: "altru-calibration-github-job/0.1",
    kind: "pull_request",
    action: payload.action,
    installation_id: installationId,
    repository: { owner, repo, full_name: fullName, id: payload.repository?.id || null },
    pull_request: { number: pullNumber, draft: Boolean(payload.pull_request?.draft) },
    base_sha: baseSha,
    head_sha: headSha,
    sender: payload.sender?.login || null
  };
}

module.exports = { normalizeGitHubEvent, SUPPORTED_PULL_REQUEST_ACTIONS };
