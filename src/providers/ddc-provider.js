"use strict";

const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");

const REQUEST_PROTOCOL = "altru-calibration-ddc-provider/0.1";
const RESULT_PROTOCOL = "altru-calibration-ddc-provider-result/0.1";
const OPERATIONS = new Set(["analyze", "intent-verify", "repair-scope"]);
const STATUSES = new Set(["ok", "review", "rejected", "error"]);

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
}

function createProviderRequest({ operation, project, payload = {}, requestId } = {}) {
  if (!OPERATIONS.has(operation)) throw new Error(`unsupported DDC provider operation: ${operation}`);
  assertPlainObject(project, "project");
  assertPlainObject(payload, "payload");
  if (!project.id || typeof project.id !== "string") throw new Error("project.id is required");
  return Object.freeze({
    protocol: REQUEST_PROTOCOL,
    request_id: requestId || `DDCP-${crypto.randomBytes(8).toString("hex")}`,
    operation,
    project: {
      id: project.id,
      commit: project.commit == null ? null : String(project.commit)
    },
    payload
  });
}

function validateProviderResult(result, requestId) {
  assertPlainObject(result, "provider result");
  if (result.protocol !== RESULT_PROTOCOL) throw new Error(`unsupported DDC provider result protocol: ${result.protocol}`);
  if (result.request_id !== requestId) throw new Error("DDC provider request/result id mismatch");
  if (!STATUSES.has(result.status)) throw new Error(`unsupported DDC provider status: ${result.status}`);
  if (!Array.isArray(result.evidence)) throw new Error("DDC provider result evidence must be an array");
  for (const item of result.evidence) {
    assertPlainObject(item, "provider evidence item");
    if (!item.type || typeof item.type !== "string") throw new Error("provider evidence type is required");
    if (typeof item.summary !== "string") throw new Error("provider evidence summary must be a string");
    const allowed = new Set(["type", "summary", "fingerprint"]);
    for (const key of Object.keys(item)) if (!allowed.has(key)) throw new Error(`provider evidence contains unsupported field: ${key}`);
  }
  return Object.freeze({
    protocol: result.protocol,
    request_id: result.request_id,
    status: result.status,
    reason_codes: Array.isArray(result.reason_codes) ? [...new Set(result.reason_codes.map(String))].sort() : [],
    evidence: result.evidence.map((item) => Object.freeze({
      type: item.type,
      summary: item.summary,
      fingerprint: item.fingerprint == null ? null : String(item.fingerprint)
    }))
  });
}

function invokeProvider({ executable, args = [], request, cwd = process.cwd(), timeoutMs = 30000, maxOutputBytes = 262144 } = {}) {
  if (!executable || typeof executable !== "string") throw new Error("DDC provider executable is required");
  if (!Array.isArray(args) || !args.every((item) => typeof item === "string")) throw new Error("DDC provider args must be strings");
  assertPlainObject(request, "provider request");
  const input = `${JSON.stringify(request)}\n`;
  const result = spawnSync(executable, args, {
    cwd,
    input,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    timeout: timeoutMs,
    maxBuffer: maxOutputBytes,
    env: {}
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`DDC provider exited with status ${result.status}`);
  const output = String(result.stdout || "").trim();
  if (!output) throw new Error("DDC provider returned no result");
  let parsed;
  try { parsed = JSON.parse(output); } catch { throw new Error("DDC provider returned invalid JSON"); }
  return validateProviderResult(parsed, request.request_id);
}

function createDDCProvider(config = {}) {
  return Object.freeze({
    observeCheck(context) {
      // Per-check provider invocation is intentionally not automatic. The core
      // calibration engine remains deterministic and local; callers explicitly
      // invoke provider operations at defined lifecycle boundaries instead.
      void context;
    },
    request(input) {
      const request = createProviderRequest(input);
      return invokeProvider({ ...config, request });
    }
  });
}

module.exports = {
  REQUEST_PROTOCOL,
  RESULT_PROTOCOL,
  createDDCProvider,
  createProviderRequest,
  invokeProvider,
  validateProviderResult
};
