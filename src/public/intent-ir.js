"use strict";

const crypto = require("node:crypto");

const INTENT_PROTOCOL = "ddc-intent/0.1";
const INTENT_SCHEMA = "altru-intent-contract/0.1";
const INTENT_DELTA_SCHEMA = "altru-intent-delta/0.1";
const INTENT_VERIFICATION_SCHEMA = "altru-intent-verification/0.1";

const CLAUSE_KINDS = Object.freeze([
  "goal",
  "invariant",
  "preference",
  "prohibition",
  "assumption",
  "acceptance"
]);

const OPERATORS = Object.freeze([
  "eq",
  "neq",
  "gte",
  "lte",
  "contains",
  "not_contains",
  "exists",
  "not_exists",
  "preserve"
]);

const EDGE_RELATIONS = Object.freeze([
  "affects",
  "requires",
  "constrains",
  "protects",
  "derived_from",
  "conflicts_with"
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

function asString(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

function numeric01(value, fallback, name) {
  const n = value == null ? fallback : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1) throw new Error(`${name} must be between 0 and 1`);
  return Number(n.toFixed(6));
}

function normalizeProvenance(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return Object.freeze({
    type: String(source.type || "human"),
    ref: source.ref == null ? null : String(source.ref),
    statement: source.statement == null ? null : String(source.statement)
  });
}

function normalizeClause(input = {}) {
  const kind = String(input.kind || "");
  if (!CLAUSE_KINDS.includes(kind)) throw new Error(`unsupported intent clause kind: ${kind || "missing"}`);
  const operator = String(input.operator || "");
  if (!OPERATORS.includes(operator)) throw new Error(`unsupported intent operator: ${operator || "missing"}`);
  if (["gte", "lte"].includes(operator) && !Number.isFinite(Number(input.value))) {
    throw new Error(`${operator} clause '${input.id || "unknown"}' requires a numeric value`);
  }
  if (["exists", "not_exists", "preserve"].includes(operator) && Object.prototype.hasOwnProperty.call(input, "value")) {
    throw new Error(`${operator} clause '${input.id || "unknown"}' must not declare value`);
  }
  return Object.freeze({
    id: asString(input.id, "intent clause id"),
    kind,
    target: asString(input.target, "intent clause target"),
    operator,
    ...(Object.prototype.hasOwnProperty.call(input, "value") ? {value: stable(input.value)} : {}),
    severity: input.severity === "soft" ? "soft" : "hard",
    priority: numeric01(input.priority, kind === "preference" ? 0.5 : 1, "intent clause priority"),
    confidence: numeric01(input.confidence, 1, "intent clause confidence"),
    scope: String(input.scope || "local"),
    overrides: Array.isArray(input.overrides) ? Object.freeze(input.overrides.map(String).sort()) : Object.freeze([]),
    provenance: normalizeProvenance(input.provenance)
  });
}

function normalizeEdge(input = {}) {
  const relation = String(input.relation || "");
  if (!EDGE_RELATIONS.includes(relation)) throw new Error(`unsupported intent edge relation: ${relation || "missing"}`);
  return Object.freeze({
    from: asString(input.from, "intent edge from"),
    to: asString(input.to, "intent edge to"),
    relation
  });
}

function normalizeIntent(input = {}) {
  if (input.protocol && input.protocol !== INTENT_PROTOCOL) throw new Error(`intent protocol must be ${INTENT_PROTOCOL}`);
  const clauses = (input.clauses || []).map(normalizeClause).sort((a, b) => a.id.localeCompare(b.id));
  const ids = new Set();
  for (const clause of clauses) {
    if (ids.has(clause.id)) throw new Error(`duplicate intent clause id: ${clause.id}`);
    ids.add(clause.id);
  }
  const edges = (input.edges || []).map(normalizeEdge).sort((a, b) => `${a.from}:${a.to}:${a.relation}`.localeCompare(`${b.from}:${b.to}:${b.relation}`));
  for (const edge of edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) throw new Error(`intent edge references unknown clause: ${edge.from} -> ${edge.to}`);
  }
  const scope = input.scope && typeof input.scope === "object" ? input.scope : {};
  return Object.freeze({
    protocol: INTENT_PROTOCOL,
    intent_id: asString(input.intent_id || input.id, "intent_id"),
    version: Number.isInteger(input.version) && input.version > 0 ? input.version : 1,
    label: input.label == null ? null : String(input.label),
    scope: Object.freeze({
      id: String(scope.id || "root"),
      parents: Object.freeze((Array.isArray(scope.parents) ? scope.parents : []).map(String).sort())
    }),
    clauses: Object.freeze(clauses),
    edges: Object.freeze(edges),
    metadata: Object.freeze(stable(input.metadata && typeof input.metadata === "object" ? input.metadata : {}))
  });
}

function constraintConflict(a, b) {
  if (a.target !== b.target) return null;
  if (a.operator === "eq" && b.operator === "eq" && JSON.stringify(stable(a.value)) !== JSON.stringify(stable(b.value))) return "different required values";
  if (a.operator === "eq" && b.operator === "neq" && JSON.stringify(stable(a.value)) === JSON.stringify(stable(b.value))) return "required value is forbidden";
  if (a.operator === "neq" && b.operator === "eq") return constraintConflict(b, a);
  if (a.operator === "exists" && b.operator === "not_exists") return "existence is both required and forbidden";
  if (a.operator === "not_exists" && b.operator === "exists") return "existence is both required and forbidden";
  if (a.operator === "gte" && b.operator === "lte" && Number(a.value) > Number(b.value)) return "numeric bounds do not overlap";
  if (a.operator === "lte" && b.operator === "gte" && Number(b.value) > Number(a.value)) return "numeric bounds do not overlap";
  return null;
}

function detectConflicts(intentInput) {
  const intent = normalizeIntent(intentInput);
  const conflicts = [];
  for (let i = 0; i < intent.clauses.length; i += 1) {
    for (let j = i + 1; j < intent.clauses.length; j += 1) {
      const a = intent.clauses[i], b = intent.clauses[j];
      const reason = constraintConflict(a, b);
      if (!reason) continue;
      conflicts.push(Object.freeze({
        a: a.id,
        b: b.id,
        target: a.target,
        reason,
        severity: a.severity === "hard" && b.severity === "hard" ? "hard" : "soft"
      }));
    }
  }
  for (const edge of intent.edges.filter((item) => item.relation === "conflicts_with")) {
    const a = intent.clauses.find((item) => item.id === edge.from);
    const b = intent.clauses.find((item) => item.id === edge.to);
    const key = [a.id, b.id].sort().join(":");
    if (conflicts.some((item) => [item.a, item.b].sort().join(":") === key)) continue;
    conflicts.push(Object.freeze({a: a.id, b: b.id, target: a.target === b.target ? a.target : null, reason: "explicit semantic conflict", severity: a.severity === "hard" && b.severity === "hard" ? "hard" : "soft"}));
  }
  return Object.freeze(conflicts.sort((a, b) => `${a.a}:${a.b}`.localeCompare(`${b.a}:${b.b}`)));
}

function assertConflictFree(intentInput) {
  const conflicts = detectConflicts(intentInput);
  const hard = conflicts.filter((item) => item.severity === "hard");
  if (hard.length) throw new Error(`hard intent conflict: ${hard.map((item) => `${item.a}<->${item.b}`).join(", ")}`);
  return conflicts;
}

function resolveInheritance({intent, parents = []} = {}) {
  const child = normalizeIntent(intent);
  const normalizedParents = parents.map(normalizeIntent);
  const declaredParents = new Set(child.scope.parents);
  for (const parent of normalizedParents) {
    if (declaredParents.size && !declaredParents.has(parent.intent_id)) throw new Error(`undeclared parent intent: ${parent.intent_id}`);
  }
  const inherited = new Map();
  const edges = [];
  for (const parent of normalizedParents) {
    for (const clause of parent.clauses) inherited.set(clause.id, Object.freeze({...clause, scope: `inherited:${parent.intent_id}`}));
    edges.push(...parent.edges);
  }
  for (const clause of child.clauses) {
    for (const overriddenId of clause.overrides) {
      const prior = inherited.get(overriddenId);
      if (!prior) throw new Error(`override references unknown inherited clause: ${overriddenId}`);
      if (prior.severity === "hard") throw new Error(`hard inherited clause cannot be overridden in ${INTENT_PROTOCOL}: ${overriddenId}`);
      inherited.delete(overriddenId);
    }
    if (inherited.has(clause.id)) throw new Error(`child clause collides with inherited clause id: ${clause.id}`);
    inherited.set(clause.id, clause);
  }
  const clauseIds = new Set(inherited.keys());
  for (const edge of child.edges) edges.push(edge);
  const resolvedEdges = edges.filter((edge) => clauseIds.has(edge.from) && clauseIds.has(edge.to));
  const resolved = normalizeIntent({
    ...child,
    clauses: [...inherited.values()],
    edges: resolvedEdges,
    metadata: {...child.metadata, resolved_parents: normalizedParents.map((item) => item.intent_id).sort()}
  });
  assertConflictFree(resolved);
  return resolved;
}

function clauseMap(intent) {
  return new Map(intent.clauses.map((clause) => [clause.id, clause]));
}

function affectedFrom(intent, changedIds) {
  const adjacency = new Map();
  for (const edge of intent.edges) {
    if (!["affects", "requires", "constrains", "protects", "derived_from"].includes(edge.relation)) continue;
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, new Set());
    adjacency.get(edge.from).add(edge.to);
  }
  const affected = new Set(changedIds);
  const queue = [...changedIds];
  while (queue.length) {
    const current = queue.shift();
    for (const next of adjacency.get(current) || []) {
      if (affected.has(next)) continue;
      affected.add(next);
      queue.push(next);
    }
  }
  return [...affected].sort();
}

function diffIntent(beforeInput, afterInput) {
  const before = normalizeIntent(beforeInput), after = normalizeIntent(afterInput);
  if (before.intent_id !== after.intent_id) throw new Error("intent delta requires the same intent_id");
  const a = clauseMap(before), b = clauseMap(after);
  const added = [...b.keys()].filter((id) => !a.has(id)).sort();
  const removed = [...a.keys()].filter((id) => !b.has(id)).sort();
  const changed = [...a.keys()].filter((id) => b.has(id) && JSON.stringify(stable(a.get(id))) !== JSON.stringify(stable(b.get(id)))).sort();
  const changedIds = [...new Set([...added, ...removed, ...changed])].sort();
  const core = {
    schema: INTENT_DELTA_SCHEMA,
    protocol: INTENT_PROTOCOL,
    intent_id: after.intent_id,
    from_version: before.version,
    to_version: after.version,
    added,
    removed,
    changed,
    affected: affectedFrom(after, changedIds),
    conflicts: detectConflicts(after)
  };
  const fingerprint = digest(core);
  return Object.freeze({...core, id: `IDELTA-${fingerprint.slice(0, 12).toUpperCase()}`, fingerprint});
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function evaluateClause(clause, facts) {
  const present = hasOwn(facts, clause.target);
  const actual = facts[clause.target];
  switch (clause.operator) {
    case "exists": return {status: present ? "pass" : "fail", actual: present ? actual : null};
    case "not_exists": return {status: present ? "fail" : "pass", actual: present ? actual : null};
    case "preserve": return {status: "unknown", actual: present ? actual : null};
    default: if (!present) return {status: "unknown", actual: null};
  }
  let pass = false;
  switch (clause.operator) {
    case "eq": pass = JSON.stringify(stable(actual)) === JSON.stringify(stable(clause.value)); break;
    case "neq": pass = JSON.stringify(stable(actual)) !== JSON.stringify(stable(clause.value)); break;
    case "gte": pass = Number.isFinite(Number(actual)) && Number(actual) >= Number(clause.value); break;
    case "lte": pass = Number.isFinite(Number(actual)) && Number(actual) <= Number(clause.value); break;
    case "contains": pass = Array.isArray(actual) ? actual.some((item) => JSON.stringify(stable(item)) === JSON.stringify(stable(clause.value))) : typeof actual === "string" && actual.includes(String(clause.value)); break;
    case "not_contains": pass = Array.isArray(actual) ? !actual.some((item) => JSON.stringify(stable(item)) === JSON.stringify(stable(clause.value))) : typeof actual === "string" && !actual.includes(String(clause.value)); break;
    default: return {status: "unknown", actual};
  }
  return {status: pass ? "pass" : "fail", actual};
}

function verifyIntent(intentInput, facts = {}) {
  const intent = normalizeIntent(intentInput);
  const conflicts = detectConflicts(intent);
  const results = intent.clauses.map((clause) => Object.freeze({
    id: clause.id,
    kind: clause.kind,
    target: clause.target,
    severity: clause.severity,
    priority: clause.priority,
    expected: clause.operator === "preserve" ? "preserve" : {operator: clause.operator, ...(hasOwn(clause, "value") ? {value: clause.value} : {})},
    ...evaluateClause(clause, facts)
  }));
  const evaluated = results.filter((item) => item.status !== "unknown");
  const weightedTotal = evaluated.reduce((sum, item) => sum + item.priority, 0);
  const weightedPass = evaluated.filter((item) => item.status === "pass").reduce((sum, item) => sum + item.priority, 0);
  const hardFailures = results.filter((item) => item.severity === "hard" && item.status === "fail");
  const hardConflicts = conflicts.filter((item) => item.severity === "hard");
  const status = hardFailures.length || hardConflicts.length ? "fail" : results.some((item) => item.status === "unknown") ? "incomplete" : "pass";
  const core = {
    schema: INTENT_VERIFICATION_SCHEMA,
    protocol: INTENT_PROTOCOL,
    intent_id: intent.intent_id,
    intent_version: intent.version,
    status,
    score: weightedTotal ? Number(((weightedPass / weightedTotal) * 100).toFixed(2)) : null,
    hard_failure_count: hardFailures.length,
    unknown_count: results.filter((item) => item.status === "unknown").length,
    conflicts,
    results
  };
  const fingerprint = digest(core);
  return Object.freeze({...core, id: `IVER-${fingerprint.slice(0, 12).toUpperCase()}`, fingerprint});
}

function createIntentArtifact(intentInput) {
  const intent = normalizeIntent(intentInput);
  const conflicts = detectConflicts(intent);
  const core = {
    schema: INTENT_SCHEMA,
    ...intent,
    summary: {
      clause_count: intent.clauses.length,
      hard_count: intent.clauses.filter((item) => item.severity === "hard").length,
      soft_count: intent.clauses.filter((item) => item.severity === "soft").length,
      conflict_count: conflicts.length,
      hard_conflict_count: conflicts.filter((item) => item.severity === "hard").length,
      by_kind: Object.fromEntries(CLAUSE_KINDS.map((kind) => [kind, intent.clauses.filter((item) => item.kind === kind).length]))
    },
    conflicts
  };
  const fingerprint = digest(core);
  return Object.freeze({...core, id: `INT-${fingerprint.slice(0, 12).toUpperCase()}`, fingerprint});
}

module.exports = {
  CLAUSE_KINDS,
  EDGE_RELATIONS,
  INTENT_DELTA_SCHEMA,
  INTENT_PROTOCOL,
  INTENT_SCHEMA,
  INTENT_VERIFICATION_SCHEMA,
  OPERATORS,
  assertConflictFree,
  createIntentArtifact,
  detectConflicts,
  diffIntent,
  digest,
  normalizeIntent,
  resolveInheritance,
  stable,
  verifyIntent
};
