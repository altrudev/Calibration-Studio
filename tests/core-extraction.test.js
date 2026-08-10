"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { listAdapters } = require("../src/public/adapter-registry");
const { normalizeSettings } = require("../src/public/settings");
const { calibrate } = require("../src/engine/calibration-engine");
const { createProviderRequest, validateProviderResult } = require("../src/providers/ddc-provider");

test("adapter registry preserves current candidate/planned surface", () => {
  const adapters = listAdapters();
  for (const id of ["web-pwa", "browser-extension", "api", "cli", "game"]) {
    assert.equal(adapters.find((item) => item.id === id)?.status, "candidate");
  }
  for (const id of ["desktop", "android", "service", "custom"]) {
    assert.equal(adapters.find((item) => item.id === id)?.status, "planned");
  }
});

test("standalone engine calibrates without private DDC implementation", () => {
  const settings = normalizeSettings({ profile: "strict" });
  const report = calibrate({
    contract: {
      checks: [
        { id: "state.ok", domain: "state", expected: true, required: true }
      ]
    },
    observations: {
      started_at: "2026-08-10T00:00:00.000Z",
      observations: [
        { id: "state.ok", value: true, evidence: [] }
      ]
    },
    settings,
    project: {
      name: "fixture",
      githubUrl: null,
      githubSource: "none",
      repositoryUrl: null,
      gitBranch: null,
      gitCommit: null
    }
  });
  assert.equal(report.calibration.status, "calibrated");
  assert.equal(report.findings.length, 0);
});

test("provider exchange is versioned and allow-listed", () => {
  const request = createProviderRequest({
    operation: "analyze",
    project: { id: "ddc", commit: "abc123" },
    payload: { artifact_id: "CAL-1" },
    requestId: "REQ-1"
  });
  const result = validateProviderResult({
    protocol: "altru-calibration-ddc-provider-result/0.1",
    request_id: "REQ-1",
    status: "review",
    reason_codes: ["DDC-REVIEW-1"],
    evidence: [{ type: "summary", summary: "Private analysis completed.", fingerprint: "abc" }]
  }, request.request_id);
  assert.equal(result.status, "review");
  assert.deepEqual(Object.keys(result.evidence[0]).sort(), ["fingerprint", "summary", "type"]);
});

test("provider cannot smuggle private fields into public evidence", () => {
  assert.throws(() => validateProviderResult({
    protocol: "altru-calibration-ddc-provider-result/0.1",
    request_id: "REQ-1",
    status: "ok",
    evidence: [{ type: "summary", summary: "x", dimension: "security" }]
  }, "REQ-1"), /unsupported field/);
});
