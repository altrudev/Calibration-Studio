"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createBaseline } = require("../src/public/lifecycle");
const { normalizeGitHubEvent } = require("../src/integrations/github-app/events");
const { materializeRepositorySnapshot } = require("../src/integrations/github-app/repository-snapshot");
const { runGithubCalibrationJob } = require("../src/integrations/github-app/worker");
const { createHttpWorkerDispatcher } = require("../src/integrations/github-app/dispatch");
const { FileWorkerQueue } = require("../src/integrations/github-app/worker-queue");
const { normalizeGithubContinuousPlan } = require("../src/integrations/github-app/worker-policy");
const { createDockerSandboxExecutor } = require("../src/integrations/github-app/docker-sandbox");

function webhookPayload() {
  return {
    action: "synchronize",
    installation: { id: 42 },
    repository: { id: 7, full_name: "altrudev/example" },
    pull_request: { number: 12, draft: false, base: { sha: "b".repeat(40) }, head: { sha: "a".repeat(40) } },
    sender: { login: "octocat" }
  };
}

function makeBaseline() {
  const observations = { started_at: "2026-08-11T00:00:00.000Z", completed_at: "2026-08-11T00:00:01.000Z", observations: [{ id: "behavior.x", value: "ok", environment: {} }] };
  const report = { schema: "altru-calibration-report/0.1", calibration: { status: "calibrated" }, run: { id: "RUN-X", started_at: observations.started_at, completed_at: observations.completed_at, profile: "balanced", edition: "community" }, project: { name: "example", git_commit: "1".repeat(40) } };
  const contract = { checks: [{ id: "behavior.x", title: "Behavior X", domain: "behavior", expected: "ok" }] };
  const settings = { domains: ["behavior"], driftTolerancePercent: 0, profile: "balanced", edition: "community" };
  return createBaseline({ contract, observations, report, project: report.project, settings });
}

function fakeSourceClient(baseline) {
  const policy = { schema: "altru-calibration-github-policy/0.1", baseline_path: ".calibration/baseline.json", plan_path: ".calibration/github-plan.json", repair_verification: true, limits: { max_files: 10, max_bytes: 2048, max_blob_bytes: 1024, max_observation_bytes: 2048 } };
  const plan = { schema: "calibration-continuous-plan/0.8", trace_on_regression: false, gate: {}, setup_commands: [], evaluate: { command: "node", args: ["observe.js"], cwd: ".", timeout_ms: 1000 }, pass_environment: [], environment: {} };
  return {
    getJsonFile: async ({ path: requested }) => requested.endsWith("github-policy.json") ? policy : requested.endsWith("baseline.json") ? baseline : plan,
    getGitCommit: async () => ({ tree: { sha: "c".repeat(40) } }),
    getGitTree: async () => ({ truncated: false, tree: [{ path: "observe.js", mode: "100644", type: "blob", sha: "d".repeat(40), size: 1 }] }),
    getGitBlob: async () => ({ encoding: "base64", content: Buffer.from("x").toString("base64") })
  };
}

function observation(value) {
  return { started_at: "2026-08-11T00:01:00.000Z", completed_at: "2026-08-11T00:01:01.000Z", observations: [{ id: "behavior.x", value, environment: {} }] };
}

test("GitHub job pins both trusted base and candidate head commits", () => {
  const job = normalizeGitHubEvent({ eventName: "pull_request", payload: webhookPayload() });
  assert.equal(job.base_sha, "b".repeat(40));
  assert.equal(job.head_sha, "a".repeat(40));
});

test("repository snapshot refuses symlinks before fetching their blobs", async () => {
  let blobs = 0;
  const client = { getGitCommit: async () => ({ tree: { sha: "c".repeat(40) } }), getGitTree: async () => ({ truncated: false, tree: [{ path: "escape", mode: "120000", type: "blob", sha: "d".repeat(40), size: 3 }] }), getGitBlob: async () => { blobs++; } };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "calibration-snapshot-test-"));
  try {
    await assert.rejects(() => materializeRepositorySnapshot({ client, token: "t", owner: "o", repo: "r", commitSha: "a".repeat(40), targetDir: dir, limits: { max_files: 10, max_bytes: 2048, max_blob_bytes: 1024 } }), /unsupported symlink\/submodule/);
    assert.equal(blobs, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("worker verifies a repair when base regresses and PR head returns to baseline", async () => {
  const baseline = makeBaseline();
  const job = normalizeGitHubEvent({ eventName: "pull_request", payload: webhookPayload() });
  const result = await runGithubCalibrationJob({ job, client: fakeSourceClient(baseline), token: "installation-token", sandboxExecutor: async ({ role }) => role === "base" ? observation("bad") : observation("ok") });
  assert.equal(result.conclusion, "success");
  assert.equal(result.title, "Repair verified");
  assert.match(result.summary, /verified/);
});

test("worker fails a PR that introduces a baseline regression", async () => {
  const baseline = makeBaseline();
  const job = normalizeGitHubEvent({ eventName: "pull_request", payload: webhookPayload() });
  const result = await runGithubCalibrationJob({ job, client: fakeSourceClient(baseline), token: "installation-token", sandboxExecutor: async ({ role }) => role === "base" ? observation("ok") : observation("bad") });
  assert.equal(result.conclusion, "failure");
  assert.equal(result.title, "Calibration regression detected");
});

test("worker dispatcher signs payloads and refuses remote plaintext HTTP", async () => {
  let seen;
  const dispatch = createHttpWorkerDispatcher({ url: "http://127.0.0.1:8788/jobs", secret: "x".repeat(32), fetchImpl: async (url, init) => { seen = { url: String(url), init }; return new Response(JSON.stringify({ status: "queued" }), { status: 202, headers: { "content-type": "application/json" } }); } });
  await dispatch({ job: normalizeGitHubEvent({ eventName: "pull_request", payload: webhookPayload() }), checkRunId: 99, deliveryId: "delivery" });
  assert.match(seen.init.headers["x-calibration-worker-signature"], /^sha256=/);
  assert.throws(() => createHttpWorkerDispatcher({ url: "http://worker.example.test/jobs", secret: "x".repeat(32) }), /must use HTTPS/);
});

test("file worker queue persists pending jobs and deduplicates active dispatches", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "calibration-worker-queue-test-"));
  try {
    const queue = new FileWorkerQueue({ directory: dir });
    const payload = { dispatch_id: "delivery:99", schema: "altru-calibration-github-dispatch/0.1" };
    assert.equal(queue.enqueue(payload).accepted, true);
    const duplicate = queue.enqueue(payload);
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.state, "pending");
    queue.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("GitHub worker plans cannot inherit host environment variables", () => {
  assert.throws(() => normalizeGithubContinuousPlan({
    schema: "calibration-continuous-plan/0.8",
    trace_on_regression: false,
    setup_commands: [],
    evaluate: { command: "node", args: ["observe.js"], cwd: ".", timeout_ms: 1000 },
    pass_environment: ["SECRET_TOKEN"],
    environment: {}
  }, "a".repeat(40)), /may not inherit host environment/);
});

test("Docker executor applies the mandatory isolation flags", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "calibration-docker-test-"));
  const snapshot = path.join(root, "snapshot");
  const runner = path.join(root, "runner.js");
  fs.mkdirSync(snapshot);
  fs.writeFileSync(path.join(snapshot, "x.txt"), "x");
  fs.writeFileSync(runner, "// runner");
  let argsSeen;
  const executor = createDockerSandboxExecutor({
    image: "calibration-sandbox:test",
    runnerPath: runner,
    spawnImpl: (_command, args) => {
      argsSeen = args;
      const mountArg = args.find(value => typeof value === "string" && value.includes("dst=/output"));
      const source = mountArg.match(/src=([^,]+),dst=\/output/)[1];
      fs.writeFileSync(path.join(source, "observations.json"), JSON.stringify({ observations: [] }));
      return { status: 0, stdout: "", stderr: "", error: null };
    }
  });
  try {
    await executor({ snapshotDir: snapshot, executionPlan: { setup_commands: [], evaluate: { command: "node", args: [], cwd: ".", timeout_ms: 1000 }, environment: {} }, maxObservationBytes: 2048 });
    const joined = argsSeen.join(" ");
    assert.match(joined, /--network none/);
    assert.match(joined, /--read-only/);
    assert.match(joined, /--cap-drop ALL/);
    assert.match(joined, /no-new-privileges/);
    assert.match(joined, /--pids-limit/);
    assert.doesNotMatch(joined, /docker\.sock/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
