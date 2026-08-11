"use strict";

const path = require("node:path");
const { normalizeContinuousPlan } = require("../../public/continuous");

const POLICY_SCHEMA = "altru-calibration-github-policy/0.1";
const DEFAULT_POLICY_PATH = ".calibration/github-policy.json";
const POLICY_KEYS = new Set(["schema", "enabled", "baseline_path", "plan_path", "repair_verification", "limits"]);
const LIMIT_KEYS = new Set(["max_files", "max_bytes", "max_blob_bytes", "max_observation_bytes"]);

function assertKnownKeys(value, allowed, label) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${label} contains unknown field '${key}'`);
}

function safeRepositoryPath(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty repository-relative path`);
  if (value.includes("\\") || value.includes("\0") || path.posix.isAbsolute(value)) throw new Error(`${label} must use a safe repository-relative path`);
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized === "." || normalized === ".." || normalized.startsWith("../")) throw new Error(`${label} is not canonical`);
  if (normalized === ".git" || normalized.startsWith(".git/")) throw new Error(`${label} may not reference .git`);
  return normalized;
}

function boundedInteger(value, fallback, min, max, label) {
  const number = Number(value ?? fallback);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(`${label} must be an integer between ${min} and ${max}`);
  return number;
}

function normalizeWorkerPolicy(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("GitHub worker policy must be an object");
  assertKnownKeys(input, POLICY_KEYS, "GitHub worker policy");
  if (input.schema !== POLICY_SCHEMA) throw new Error(`GitHub worker policy must use ${POLICY_SCHEMA}`);
  if (input.enabled !== undefined && typeof input.enabled !== "boolean") throw new Error("GitHub worker policy enabled must be boolean");
  if (input.repair_verification !== undefined && typeof input.repair_verification !== "boolean") throw new Error("repair_verification must be boolean");
  const limits = input.limits ?? {};
  if (!limits || typeof limits !== "object" || Array.isArray(limits)) throw new Error("GitHub worker policy limits must be an object");
  assertKnownKeys(limits, LIMIT_KEYS, "GitHub worker policy limits");
  return {
    schema: POLICY_SCHEMA,
    enabled: input.enabled !== false,
    baseline_path: safeRepositoryPath(input.baseline_path ?? ".calibration/baseline.json", "baseline_path"),
    plan_path: safeRepositoryPath(input.plan_path ?? ".calibration/github-plan.json", "plan_path"),
    repair_verification: input.repair_verification !== false,
    limits: {
      max_files: boundedInteger(limits.max_files, 5000, 1, 20000, "limits.max_files"),
      max_bytes: boundedInteger(limits.max_bytes, 100 * 1024 * 1024, 1024, 500 * 1024 * 1024, "limits.max_bytes"),
      max_blob_bytes: boundedInteger(limits.max_blob_bytes, 20 * 1024 * 1024, 1, 100 * 1024 * 1024, "limits.max_blob_bytes"),
      max_observation_bytes: boundedInteger(limits.max_observation_bytes, 10 * 1024 * 1024, 1024, 50 * 1024 * 1024, "limits.max_observation_bytes")
    }
  };
}

function normalizeGithubContinuousPlan(input, headSha) {
  const plan = normalizeContinuousPlan({ ...input, current_ref: headSha });
  if (plan.trace_on_regression) throw new Error("GitHub worker v0.1 requires trace_on_regression=false; first-bad tracing is not executed from PR webhooks");
  if (plan.history_plan.pass_environment.length) throw new Error("GitHub worker plans may not inherit host environment variables");
  return plan;
}

module.exports = {
  POLICY_SCHEMA,
  DEFAULT_POLICY_PATH,
  normalizeWorkerPolicy,
  normalizeGithubContinuousPlan,
  safeRepositoryPath
};
