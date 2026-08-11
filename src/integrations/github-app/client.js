"use strict";

const DEFAULT_API_BASE = "https://api.github.com";
const DEFAULT_API_VERSION = "2026-03-10";
const DEFAULT_USER_AGENT = "Calibration-Studio-GitHub-App";

class GitHubApiError extends Error {
  constructor(message, { status = 0, requestId = null } = {}) {
    super(message);
    this.name = "GitHubApiError";
    this.status = status;
    this.requestId = requestId;
  }
}

function sanitizePath(pathname) {
  if (typeof pathname !== "string" || !pathname.startsWith("/")) throw new Error("GitHub API path must start with '/'");
  return pathname;
}

function encodeRepositoryPath(value) {
  if (typeof value !== "string" || !value) throw new Error("GitHub repository path is required");
  return value.split("/").map(encodeURIComponent).join("/");
}

function createGitHubClient({ fetchImpl = globalThis.fetch, apiBase = DEFAULT_API_BASE, apiVersion = DEFAULT_API_VERSION, userAgent = DEFAULT_USER_AGENT } = {}) {
  if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required");

  async function request(pathname, { method = "GET", token, body = null } = {}) {
    if (typeof token !== "string" || !token) throw new Error("GitHub API token is required");
    const url = new URL(sanitizePath(pathname), apiBase);
    const headers = {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "user-agent": userAgent,
      "x-github-api-version": apiVersion
    };
    const init = { method, headers, redirect: "error" };
    if (body !== null) {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    const response = await fetchImpl(url, init);
    const requestId = response.headers.get("x-github-request-id");
    if (!response.ok) {
      let detail = "";
      try {
        const parsed = await response.json();
        if (parsed && typeof parsed.message === "string") detail = `: ${parsed.message}`;
      } catch {}
      throw new GitHubApiError(`GitHub API request failed (${response.status})${detail}`, { status: response.status, requestId });
    }
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async function createInstallationToken({ appJwt, installationId }) {
    if (!Number.isInteger(Number(installationId)) || Number(installationId) <= 0) throw new Error("Valid GitHub App installation ID is required");
    return request(`/app/installations/${Number(installationId)}/access_tokens`, { method: "POST", token: appJwt, body: {} });
  }

  async function createCheckRun({ token, owner, repo, name, headSha, detailsUrl = null, output = null }) {
    const body = { name, head_sha: headSha, status: "in_progress", started_at: new Date().toISOString() };
    if (detailsUrl) body.details_url = detailsUrl;
    if (output) body.output = output;
    return request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/check-runs`, { method: "POST", token, body });
  }

  async function updateCheckRun({ token, owner, repo, checkRunId, conclusion, output }) {
    return request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/check-runs/${Number(checkRunId)}`, {
      method: "PATCH",
      token,
      body: { status: "completed", conclusion, completed_at: new Date().toISOString(), output }
    });
  }

  async function listPullRequestFiles({ token, owner, repo, pullNumber, maxPages = 30 }) {
    const files = [];
    for (let page = 1; page <= maxPages; page++) {
      const batch = await request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${Number(pullNumber)}/files?per_page=100&page=${page}`, { token });
      if (!Array.isArray(batch)) throw new Error("Unexpected GitHub pull-request files response");
      for (const file of batch) files.push({ filename: file.filename, status: file.status, additions: file.additions, deletions: file.deletions, changes: file.changes, previous_filename: file.previous_filename || null });
      if (batch.length < 100) return files;
    }
    throw new Error(`Pull request file list exceeded ${maxPages * 100} files`);
  }

  async function getJsonFile({ token, owner, repo, path, ref, maxBytes = 1024 * 1024 }) {
    const encodedPath = encodeRepositoryPath(path);
    const suffix = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    const value = await request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}${suffix}`, { token });
    if (!value || Array.isArray(value) || value.type !== "file" || value.encoding !== "base64" || typeof value.content !== "string") throw new Error(`GitHub file '${path}' is not an inline base64 file`);
    const bytes = Buffer.from(value.content.replace(/\s/g, ""), "base64");
    if (bytes.length > maxBytes) throw new Error(`GitHub file '${path}' exceeds ${maxBytes} bytes`);
    try { return JSON.parse(bytes.toString("utf8")); }
    catch { throw new Error(`GitHub file '${path}' is not valid JSON`); }
  }

  async function getGitCommit({ token, owner, repo, commitSha }) {
    return request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/commits/${encodeURIComponent(commitSha)}`, { token });
  }

  async function getGitTree({ token, owner, repo, treeSha, recursive = true }) {
    return request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(treeSha)}${recursive ? "?recursive=1" : ""}`, { token });
  }

  async function getGitBlob({ token, owner, repo, blobSha }) {
    return request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs/${encodeURIComponent(blobSha)}`, { token });
  }

  return { request, createInstallationToken, createCheckRun, updateCheckRun, listPullRequestFiles, getJsonFile, getGitCommit, getGitTree, getGitBlob };
}

module.exports = { createGitHubClient, GitHubApiError, DEFAULT_API_VERSION, encodeRepositoryPath };
