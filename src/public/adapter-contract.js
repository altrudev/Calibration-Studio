"use strict";
const crypto = require("node:crypto");

const ADAPTER_API_VERSION = "calibration-adapter/0.2";
const OBSERVATION_VERSION = "calibration-observation/0.2";
const ADAPTER_TYPES = Object.freeze([
  "web-pwa",
  "browser-extension",
  "api",
  "cli",
  "desktop",
  "android",
  "game",
  "service",
  "custom"
]);
const OBSERVATION_KINDS = Object.freeze([
  "behavior",
  "permissions",
  "state",
  "resources",
  "security",
  "environment",
  "timing",
  "history"
]);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function normalizeEvidence(evidence = []) {
  if (!Array.isArray(evidence)) return [];
  return evidence
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      type: String(item.type || "note"),
      source: item.source == null ? null : String(item.source),
      summary: String(item.summary || ""),
      value: item.value === undefined ? null : item.value
    }));
}

function createObservation(input = {}) {
  if (!input.id || typeof input.id !== "string") throw new Error("observation id is required");
  if (!OBSERVATION_KINDS.includes(input.kind)) throw new Error(`unsupported observation kind: ${input.kind}`);
  const timestamp = input.timestamp || new Date().toISOString();
  const base = {
    protocol: OBSERVATION_VERSION,
    id: input.id,
    adapter: String(input.adapter || "unknown"),
    kind: input.kind,
    source: String(input.source || "adapter"),
    timestamp,
    value: input.value === undefined ? null : input.value,
    evidence: normalizeEvidence(input.evidence),
    reproduction: input.reproduction == null ? null : String(input.reproduction),
    environment: input.environment && typeof input.environment === "object" ? stable(input.environment) : {},
    predecessor: input.predecessor == null ? null : String(input.predecessor)
  };
  return Object.freeze({...base, fingerprint: digest(base)});
}

function validateAdapterManifest(manifest = {}) {
  if (manifest.api_version !== ADAPTER_API_VERSION) throw new Error(`adapter api_version must be ${ADAPTER_API_VERSION}`);
  if (!manifest.id || typeof manifest.id !== "string") throw new Error("adapter id is required");
  if (!ADAPTER_TYPES.includes(manifest.type)) throw new Error(`unsupported adapter type: ${manifest.type}`);
  if (!manifest.name || typeof manifest.name !== "string") throw new Error("adapter name is required");
  if (!Array.isArray(manifest.capabilities)) throw new Error("adapter capabilities must be an array");
  return true;
}

function normalizeObservationSet(input = {}) {
  const observations = (input.observations || []).map((item) => createObservation(item));
  const startedAt = input.started_at || input.startedAt || new Date().toISOString();
  return Object.freeze({
    protocol: "calibration-observation-set/0.2",
    adapter: String(input.adapter || "unknown"),
    started_at: startedAt,
    completed_at: input.completed_at || input.completedAt || new Date().toISOString(),
    observations
  });
}

module.exports = {
  ADAPTER_API_VERSION,
  ADAPTER_TYPES,
  OBSERVATION_KINDS,
  OBSERVATION_VERSION,
  createObservation,
  digest,
  normalizeObservationSet,
  validateAdapterManifest
};
