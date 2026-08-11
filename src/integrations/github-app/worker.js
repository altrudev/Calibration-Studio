"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { assertBaselineIntegrity, compareBaseline, verifyRepair } = require("../../public/lifecycle");
const { createGateArtifact } = require("../../public/continuous");
const { DEFAULT_POLICY_PATH, normalizeWorkerPolicy, normalizeGithubContinuousPlan } = require("./worker-policy");
const { materializeRepositorySnapshot } = require("./repository-snapshot");

function projectFor(job, baseline, commitSha) {
  return {
    ...(baseline.project || {}),
    name: baseline.project?.name || job.repository.repo,
    github_url: `https://github.com/${job.repository.full_name}`,
    repository_url: `https://github.com/${job.repository.full_name}`,
    git_branch: null,
    git_commit: commitSha
  };
}

function executionPlan(plan) {
  return {
    setup_commands: plan.history_plan.setup_commands,
    evaluate: plan.history_plan.evaluate,
    environment: {
      ...plan.history_plan.environment,
      CALIBRATION_GITHUB_JOB: "1"
    }
  };
}

function repairStatusLabel(repair) {
  if (!repair) return null;
  return repair.repair?.status || null;
}

function workerCheckResult({ gate, before, repair, baseSnapshot, headSnapshot, policyPath }) {
  const regression = gate.regression.regression;
  const passed = gate.decision.status === "pass";
  const repairStatus = repairStatusLabel(repair);
  const title = repairStatus === "verified" || repairStatus === "verified_scoped"
    ? "Repair verified"
    : passed ? "Calibration passed" : "Calibration regression detected";
  const lines = [
    `Baseline: ${gate.baseline.id}`,
    `Head: ${gate.current.git_commit}`,
    `Checked: ${regression.checked_count}`,
    `Stable: ${regression.stable_count}`,
    `Within tolerance: ${regression.within_tolerance_count}`,
    `Drifted: ${regression.drifted_count}`,
    `Missing: ${regression.missing_count}`,
    `Environment changed: ${regression.environment_changed_count}`,
    `Untracked observations: ${regression.untracked_observation_count}`
  ];
  if (before) lines.push(`Base state: ${before.regression.status}`);
  if (repair) lines.push(`Repair verification: ${repairStatus}`);
  lines.push(`Base snapshot: ${baseSnapshot.file_count} files / ${baseSnapshot.byte_count} bytes`);
  lines.push(`Head snapshot: ${headSnapshot.file_count} files / ${headSnapshot.byte_count} bytes`);
  lines.push(`Trusted policy: ${policyPath} from base commit`);
  const findings = gate.regression.findings || [];
  if (findings.length) {
    lines.push("", "Findings:");
    for (const finding of findings.slice(0, 50)) lines.push(`- [${finding.severity}] ${finding.id}: ${finding.summary}`);
    if (findings.length > 50) lines.push(`- …and ${findings.length - 50} more`);
  }
  const summary = repair
    ? `${passed ? "Current head satisfies the baseline." : "Current head still violates the baseline."} Repair status: ${repairStatus}.`
    : `${passed ? "No blocking baseline regression was detected." : "One or more calibrated checks regressed."}`;
  return { conclusion: passed ? "success" : "failure", title, summary, text: lines.join("\n") };
}

async function runGithubCalibrationJob({ job, client, token, sandboxExecutor, policyPath = DEFAULT_POLICY_PATH }) {
  if (!job || job.schema !== "altru-calibration-github-job/0.1") throw new Error("GitHub calibration worker received an invalid job");
  if (typeof sandboxExecutor !== "function") throw new Error("GitHub calibration worker requires an isolated sandbox executor");
  const { owner, repo } = job.repository;
  const rawPolicy = await client.getJsonFile({ token, owner, repo, path: policyPath, ref: job.base_sha, maxBytes: 256 * 1024 });
  const policy = normalizeWorkerPolicy(rawPolicy);
  if (!policy.enabled) return { conclusion: "skipped", title: "Calibration disabled", summary: `Trusted base policy '${policyPath}' disables GitHub calibration.`, text: `Policy was read from base commit ${job.base_sha}.` };
  const baseline = await client.getJsonFile({ token, owner, repo, path: policy.baseline_path, ref: job.base_sha, maxBytes: 10 * 1024 * 1024 });
  assertBaselineIntegrity(baseline);
  const rawPlan = await client.getJsonFile({ token, owner, repo, path: policy.plan_path, ref: job.base_sha, maxBytes: 512 * 1024 });
  const plan = normalizeGithubContinuousPlan(rawPlan, job.head_sha);
  const sandboxPlan = executionPlan(plan);
  const session = fs.mkdtempSync(path.join(os.tmpdir(), "calibration-github-worker-"));
  const baseDir = path.join(session, "base");
  const headDir = path.join(session, "head");
  try {
    const baseSnapshot = await materializeRepositorySnapshot({ client, token, owner, repo, commitSha: job.base_sha, targetDir: baseDir, limits: policy.limits });
    const headSnapshot = job.head_sha === job.base_sha
      ? baseSnapshot
      : await materializeRepositorySnapshot({ client, token, owner, repo, commitSha: job.head_sha, targetDir: headDir, limits: policy.limits });
    const baseObservations = policy.repair_verification
      ? await sandboxExecutor({ snapshotDir: baseDir, executionPlan: sandboxPlan, maxObservationBytes: policy.limits.max_observation_bytes, role: "base", commitSha: job.base_sha })
      : null;
    const headObservations = await sandboxExecutor({ snapshotDir: job.head_sha === job.base_sha ? baseDir : headDir, executionPlan: sandboxPlan, maxObservationBytes: policy.limits.max_observation_bytes, role: "head", commitSha: job.head_sha });
    const after = compareBaseline({ baseline, observations: headObservations, project: projectFor(job, baseline, job.head_sha) });
    const gate = createGateArtifact({ baseline, regression: after, plan, trace: null });
    let before = null;
    let repair = null;
    if (baseObservations) {
      before = compareBaseline({ baseline, observations: baseObservations, project: projectFor(job, baseline, job.base_sha) });
      if (before.regression.status === "regressed") repair = verifyRepair({ before, after });
    }
    return workerCheckResult({ gate, before, repair, baseSnapshot, headSnapshot, policyPath });
  } finally {
    fs.rmSync(session, { recursive: true, force: true });
  }
}

module.exports = { runGithubCalibrationJob, workerCheckResult, executionPlan, projectFor };
