"use strict";

const crypto = require("node:crypto");
const { reasonFor } = require("../public/reason-codes");
const { createPublicReport } = require("../public/report");

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function equal(a, b) {
  return JSON.stringify(stable(a)) === JSON.stringify(stable(b));
}

function severityFor(check, settings, missing) {
  if (check.severity && ["low", "medium", "high", "critical"].includes(check.severity)) return check.severity;
  if (missing && check.required !== false) return settings.risk === "critical" ? "critical" : "high";
  if (check.domain === "security" || check.domain === "permissions") return settings.risk === "relaxed" ? "medium" : "high";
  if (check.required === false) return "low";
  if (settings.risk === "critical") return "critical";
  if (settings.risk === "strict") return "high";
  return "medium";
}

function confidenceFor(observation, settings) {
  const evidenceCount = Array.isArray(observation?.evidence) ? observation.evidence.length : 0;
  const repetitionConfidence = Math.min(1, Math.log10(Math.max(1, settings.repetitions) + 1) / 2);
  return Number((0.55 + 0.25 * repetitionConfidence + 0.20 * Math.min(1, evidenceCount / 3)).toFixed(2));
}

function driftPercent(expected, observed) {
  if (!Number.isFinite(Number(expected)) || !Number.isFinite(Number(observed)) || Number(expected) === 0) return null;
  return Number((((Number(observed) - Number(expected)) / Math.abs(Number(expected))) * 100).toFixed(2));
}

function validateProvider(provider) {
  if (provider == null) return null;
  if (typeof provider !== "object" || typeof provider.observeCheck !== "function") {
    throw new Error("Calibration provider must expose observeCheck(context)");
  }
  return provider;
}

function calibrate({ contract, observations, settings, project, provider = null }) {
  const extension = validateProvider(provider);
  const byId = new Map((observations.observations || []).map((item) => [item.id, item]));
  const findings = [];

  for (const check of contract.checks || []) {
    if (!settings.domains.includes(check.domain)) continue;
    const observation = byId.get(check.id);

    // Optional providers may perform additional local/private analysis, but the
    // core engine deliberately ignores provider-internal state. Providers may
    // return documented public evidence only; they never replace developer-owned
    // expectations or silently change pass/fail semantics.
    if (extension) {
      extension.observeCheck(Object.freeze({ check, observation, project, settings }));
    }

    const missing = !observation;
    const exactMismatch = missing || !equal(check.expected, observation?.value);
    const drift = observation ? driftPercent(check.expected, observation.value) : null;
    const toleranceApplicable = check.allowDrift === true && drift !== null;
    const driftMismatch = toleranceApplicable && Math.abs(drift) > settings.driftTolerancePercent;
    const mismatch = missing || (toleranceApplicable ? driftMismatch : exactMismatch);
    if (!mismatch) continue;

    const reason = reasonFor(driftMismatch ? "drift" : check.domain);
    const hash = crypto.createHash("sha256").update(`${check.id}:${reason.code}`).digest("hex").slice(0, 8).toUpperCase();
    findings.push({
      id: `${reason.code}-${hash}`,
      checkId: check.id,
      code: reason.code,
      title: check.title || reason.title,
      domain: check.domain,
      severity: severityFor(check, settings, missing),
      summary: missing
        ? `No observation was captured for required check '${check.id}'.`
        : `Observed behavior did not match the declared expectation for '${check.id}'.`,
      expected: check.expected,
      observed: missing ? null : observation.value,
      evidence: observation?.evidence || [],
      reproduction: observation?.reproduction || `${settings.repetitions} configured repetition(s)`,
      likelyOrigin: check.origin || null,
      recommendedInvestigation: check.investigate || `Inspect the ${check.domain} transition and its evidence before changing the expectation.`,
      repairStatus: "not_verified",
      confidence: confidenceFor(observation, settings),
      ...(driftMismatch ? { driftPercent: drift } : {})
    });
  }

  const now = new Date().toISOString();
  return createPublicReport({
    project,
    settings,
    findings,
    run: {
      id: `CAL-${crypto.randomBytes(6).toString("hex").toUpperCase()}`,
      startedAt: observations.started_at || now,
      completedAt: now
    }
  });
}

module.exports = { calibrate, driftPercent, equal, stable };
