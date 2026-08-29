"use strict";

const DECISIONS = Object.freeze([
  "pass",
  "pass_with_limitations",
  "fail",
  "inconclusive",
  "not_assessed"
]);

const SEVERITIES = Object.freeze([
  "none",
  "info",
  "low",
  "medium",
  "high",
  "critical"
]);

const DEFAULT_POLICY = Object.freeze({
  protocol: "calibration-evaluator-policy/0.1",
  id: "default-evaluator-policy",
  qualifying_truth_kinds: ["mechanical", "external"],
  require_blinded: true,
  min_qualifying_cases: 30,
  min_qualifying_adverse: 10,
  min_qualifying_pass: 0,
  min_runs_per_case: 3,
  adverse_truth_decisions: ["fail"],
  unsafe_predictions: ["pass", "pass_with_limitations"],
  abstain_predictions: ["inconclusive", "not_assessed"],
  thresholds: {
    decision_accuracy_min: 0.90,
    macro_f1_min: 0.85,
    unsafe_false_negative_rate_max: 0.05,
    repeatability_min: 0.95,
    abstention_rate_max: 0.25,
    severity_mae_max: 0.75
  }
});

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertProtocol(value, expected, label) {
  assertObject(value, label);
  if (value.protocol !== expected) {
    throw new Error(`${label} protocol must be ${expected}`);
  }
}

function assertEnum(value, allowed, label) {
  if (!allowed.includes(value)) {
    throw new Error(`${label} must be one of: ${allowed.join(", ")}`);
  }
}

function uniqueStrings(value, label) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.length > 0)) {
    throw new Error(`${label} must be an array of non-empty strings`);
  }
  return [...new Set(value)].sort();
}

function normalizePolicy(input) {
  if (input == null) return structuredClone(DEFAULT_POLICY);
  assertProtocol(input, "calibration-evaluator-policy/0.1", "policy");
  const merged = {
    ...DEFAULT_POLICY,
    ...input,
    thresholds: { ...DEFAULT_POLICY.thresholds, ...(input.thresholds || {}) }
  };
  merged.qualifying_truth_kinds = uniqueStrings(merged.qualifying_truth_kinds, "policy.qualifying_truth_kinds");
  merged.adverse_truth_decisions = uniqueStrings(merged.adverse_truth_decisions, "policy.adverse_truth_decisions");
  merged.unsafe_predictions = uniqueStrings(merged.unsafe_predictions, "policy.unsafe_predictions");
  merged.abstain_predictions = uniqueStrings(merged.abstain_predictions, "policy.abstain_predictions");
  return merged;
}

function validateCases(input) {
  assertProtocol(input, "calibration-evaluator-cases/0.1", "cases");
  if (!input.id || typeof input.id !== "string") throw new Error("cases.id is required");
  if (!Array.isArray(input.cases) || input.cases.length === 0) throw new Error("cases.cases must be non-empty");
  const ids = new Set();
  return {
    id: input.id,
    cases: input.cases.map((item, index) => {
      assertObject(item, `cases.cases[${index}]`);
      if (!item.id || typeof item.id !== "string") throw new Error(`cases.cases[${index}].id is required`);
      if (ids.has(item.id)) throw new Error(`duplicate case id: ${item.id}`);
      ids.add(item.id);
      if (!["blinded", "retrospective"].includes(item.mode)) throw new Error(`case ${item.id}: invalid mode`);
      assertObject(item.payload, `case ${item.id}.payload`);
      return {
        id: item.id,
        title: String(item.title || item.id),
        domain: String(item.domain || "unspecified"),
        mode: item.mode,
        payload: item.payload
      };
    })
  };
}

function validateTruth(input, corpusId) {
  assertProtocol(input, "calibration-evaluator-truth/0.1", "truth");
  if (input.corpus_id !== corpusId) throw new Error("truth corpus_id mismatch");
  if (!Array.isArray(input.cases)) throw new Error("truth.cases must be an array");
  const map = new Map();
  for (const item of input.cases) {
    assertObject(item, "truth case");
    if (!item.case_id || typeof item.case_id !== "string") throw new Error("truth case_id is required");
    if (map.has(item.case_id)) throw new Error(`duplicate truth case: ${item.case_id}`);
    assertEnum(item.decision, DECISIONS, `truth ${item.case_id}.decision`);
    assertEnum(item.severity, SEVERITIES, `truth ${item.case_id}.severity`);
    assertObject(item.provenance, `truth ${item.case_id}.provenance`);
    if (!["mechanical", "external", "specification", "retrospective"].includes(item.provenance.kind)) {
      throw new Error(`truth ${item.case_id}: unsupported provenance kind`);
    }
    if (typeof item.provenance.independent_of_evaluator !== "boolean") {
      throw new Error(`truth ${item.case_id}: provenance.independent_of_evaluator must be boolean`);
    }
    map.set(item.case_id, {
      decision: item.decision,
      severity: item.severity,
      reason_codes: uniqueStrings(item.reason_codes || [], `truth ${item.case_id}.reason_codes`),
      provenance: {
        kind: item.provenance.kind,
        reference: String(item.provenance.reference || ""),
        independent_of_evaluator: item.provenance.independent_of_evaluator
      }
    });
  }
  return map;
}

function validatePredictions(input, corpusId) {
  assertProtocol(input, "calibration-evaluator-predictions/0.1", "predictions");
  if (input.corpus_id !== corpusId) throw new Error("predictions corpus_id mismatch");
  assertObject(input.evaluator, "predictions.evaluator");
  if (!input.evaluator.id || !input.evaluator.revision) throw new Error("predictions evaluator id/revision required");
  if (!Array.isArray(input.runs) || input.runs.length === 0) throw new Error("predictions.runs must be non-empty");
  return {
    evaluator: { id: String(input.evaluator.id), revision: String(input.evaluator.revision) },
    runs: input.runs.map((item) => {
      assertObject(item, "prediction run");
      if (!item.case_id || !item.run_id) throw new Error("prediction case_id/run_id required");
      assertEnum(item.decision, DECISIONS, `prediction ${item.case_id}.decision`);
      assertEnum(item.severity, SEVERITIES, `prediction ${item.case_id}.severity`);
      return {
        case_id: String(item.case_id),
        run_id: String(item.run_id),
        decision: item.decision,
        severity: item.severity,
        reason_codes: uniqueStrings(item.reason_codes || [], `prediction ${item.case_id}.reason_codes`)
      };
    })
  };
}

function mode(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  if (ranked.length === 0) return { value: null, stable: false, unanimous: false };
  const tied = ranked.length > 1 && ranked[0][1] === ranked[1][1];
  return { value: tied ? null : ranked[0][0], stable: !tied, unanimous: ranked[0][1] === values.length };
}

function representativeForRuns(runs) {
  const dm = mode(runs.map((run) => run.decision));
  const sm = mode(runs.map((run) => run.severity));
  const universe = new Set(runs.flatMap((run) => run.reason_codes));
  const reasonCodes = [...universe].filter((code) =>
    runs.filter((run) => run.reason_codes.includes(code)).length > runs.length / 2
  ).sort();
  return {
    prediction: {
      decision: dm.value || "inconclusive",
      severity: sm.value || "critical",
      reason_codes: reasonCodes
    },
    decision_stable: dm.stable,
    decision_unanimous: dm.unanimous,
    severity_unanimous: sm.unanimous
  };
}

function jaccard(a, b) {
  const left = new Set(a), right = new Set(b), union = new Set([...left, ...right]);
  if (union.size === 0) return 1;
  let common = 0;
  for (const value of left) if (right.has(value)) common += 1;
  return common / union.size;
}

function ratio(a, b) { return b === 0 ? null : a / b; }
function rounded(v) { return v == null ? null : Number(v.toFixed(6)); }
function severityRank(v) { return SEVERITIES.indexOf(v); }

function wilsonOneSided(successes, trials, z = 1.6448536269514722) {
  if (!Number.isInteger(successes) || !Number.isInteger(trials) || trials < 0 || successes < 0 || successes > trials) {
    throw new Error("invalid Wilson interval counts");
  }
  if (trials === 0) return { lower: null, upper: null };
  const p = successes / trials;
  const z2 = z * z;
  const denominator = 1 + z2 / trials;
  const center = (p + z2 / (2 * trials)) / denominator;
  const margin = z * Math.sqrt((p * (1 - p) / trials) + (z2 / (4 * trials * trials))) / denominator;
  return {
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin)
  };
}

function computeMetrics(records, policy) {
  let correct = 0, adverse = 0, unsafeFn = 0, abstain = 0, passTruth = 0, falsePositive = 0;
  let severityAbs = 0, severityExact = 0, reasonAgreement = 0;
  let repeatable = 0, repeatEligible = 0, runCoverage = 0;

  const perClass = {};
  for (const klass of DECISIONS) perClass[klass] = { tp: 0, fp: 0, fn: 0 };

  for (const record of records) {
    const pred = record.prediction;
    if (record.decision_stable && pred.decision === record.truth.decision) correct += 1;

    if (policy.adverse_truth_decisions.includes(record.truth.decision)) {
      adverse += 1;
      if (record.decision_stable && policy.unsafe_predictions.includes(pred.decision)) unsafeFn += 1;
    }

    if (record.truth.decision === "pass") {
      passTruth += 1;
      if (record.decision_stable && pred.decision === "fail") falsePositive += 1;
    }

    if (!record.decision_stable || policy.abstain_predictions.includes(pred.decision)) abstain += 1;

    severityAbs += Math.abs(severityRank(pred.severity) - severityRank(record.truth.severity));
    if (pred.severity === record.truth.severity) severityExact += 1;
    reasonAgreement += jaccard(pred.reason_codes, record.truth.reason_codes);

    if (record.runs.length >= 2) {
      repeatEligible += 1;
      if (record.decision_unanimous && record.severity_unanimous) repeatable += 1;
    }
    if (record.runs.length >= policy.min_runs_per_case) runCoverage += 1;

    for (const klass of DECISIONS) {
      const truthIs = record.truth.decision === klass;
      const predIs = record.decision_stable && pred.decision === klass;
      if (truthIs && predIs) perClass[klass].tp += 1;
      if (!truthIs && predIs) perClass[klass].fp += 1;
      if (truthIs && !predIs) perClass[klass].fn += 1;
    }
  }

  const f1Values = [];
  for (const klass of DECISIONS) {
    const s = perClass[klass];
    const precision = ratio(s.tp, s.tp + s.fp);
    const recall = ratio(s.tp, s.tp + s.fn);
    const f1 = precision == null || recall == null || precision + recall === 0 ? null : (2 * precision * recall) / (precision + recall);
    perClass[klass] = { ...s, precision: rounded(precision), recall: rounded(recall), f1: rounded(f1) };
    if (f1 != null) f1Values.push(f1);
  }

  const accuracyWilson = wilsonOneSided(correct, records.length);
  const unsafeWilson = wilsonOneSided(unsafeFn, adverse);
  const falsePositiveWilson = wilsonOneSided(falsePositive, passTruth);
  const repeatabilityWilson = wilsonOneSided(repeatable, repeatEligible);

  return {
    cases: records.length,
    adverse_cases: adverse,
    pass_cases: passTruth,
    decision_correct: correct,
    unsafe_false_negative_count: unsafeFn,
    false_positive_count: falsePositive,
    repeatable_count: repeatable,
    decision_accuracy: rounded(ratio(correct, records.length)),
    decision_accuracy_wilson_lower_95: rounded(accuracyWilson.lower),
    macro_f1: rounded(ratio(f1Values.reduce((a, b) => a + b, 0), f1Values.length)),
    unsafe_false_negative_rate: rounded(ratio(unsafeFn, adverse)),
    unsafe_false_negative_wilson_upper_95: rounded(unsafeWilson.upper),
    false_positive_rate: rounded(ratio(falsePositive, passTruth)),
    false_positive_wilson_upper_95: rounded(falsePositiveWilson.upper),
    abstention_rate: rounded(ratio(abstain, records.length)),
    repeatability: rounded(ratio(repeatable, repeatEligible)),
    repeatability_wilson_lower_95: rounded(repeatabilityWilson.lower),
    repeatability_eligible_cases: repeatEligible,
    run_coverage_rate: rounded(ratio(runCoverage, records.length)),
    severity_exact_agreement: rounded(ratio(severityExact, records.length)),
    severity_mae: rounded(ratio(severityAbs, records.length)),
    reason_code_jaccard: rounded(ratio(reasonAgreement, records.length)),
    confidence_method: "Wilson score one-sided 95% (z=1.6448536269514722)",
    per_class: perClass
  };
}

function isQualifying(caseItem, truthItem, policy) {
  if (!truthItem.provenance.independent_of_evaluator) return false;
  if (!policy.qualifying_truth_kinds.includes(truthItem.provenance.kind)) return false;
  if (policy.require_blinded && caseItem.mode !== "blinded") return false;
  return true;
}

function evaluatePolicy(metrics, policy) {
  const reasons = [];
  if (metrics.cases < policy.min_qualifying_cases) reasons.push(`qualifying cases ${metrics.cases} < ${policy.min_qualifying_cases}`);
  if (metrics.adverse_cases < policy.min_qualifying_adverse) reasons.push(`qualifying adverse cases ${metrics.adverse_cases} < ${policy.min_qualifying_adverse}`);
  if (metrics.pass_cases < (policy.min_qualifying_pass || 0)) reasons.push(`qualifying pass cases ${metrics.pass_cases} < ${policy.min_qualifying_pass || 0}`);
  if (metrics.run_coverage_rate !== 1) reasons.push(`not every qualifying case has at least ${policy.min_runs_per_case} runs`);
  if (reasons.length) return { status: "INSUFFICIENT_EVIDENCE", reasons };

  const t = policy.thresholds;
  const checks = [];

  if (t.decision_accuracy_wilson_lower_95_min != null) {
    checks.push(["decision_accuracy_wilson_lower_95", metrics.decision_accuracy_wilson_lower_95, ">=", t.decision_accuracy_wilson_lower_95_min]);
  } else if (t.decision_accuracy_min != null) {
    checks.push(["decision_accuracy", metrics.decision_accuracy, ">=", t.decision_accuracy_min]);
  }

  checks.push(["macro_f1", metrics.macro_f1, ">=", t.macro_f1_min]);

  if (t.unsafe_false_negative_wilson_upper_95_max != null) {
    checks.push(["unsafe_false_negative_wilson_upper_95", metrics.unsafe_false_negative_wilson_upper_95, "<=", t.unsafe_false_negative_wilson_upper_95_max]);
  } else if (t.unsafe_false_negative_rate_max != null) {
    checks.push(["unsafe_false_negative_rate", metrics.unsafe_false_negative_rate, "<=", t.unsafe_false_negative_rate_max]);
  }

  if (t.false_positive_wilson_upper_95_max != null) {
    checks.push(["false_positive_wilson_upper_95", metrics.false_positive_wilson_upper_95, "<=", t.false_positive_wilson_upper_95_max]);
  }

  if (t.repeatability_wilson_lower_95_min != null) {
    checks.push(["repeatability_wilson_lower_95", metrics.repeatability_wilson_lower_95, ">=", t.repeatability_wilson_lower_95_min]);
  } else if (t.repeatability_min != null) {
    checks.push(["repeatability", metrics.repeatability, ">=", t.repeatability_min]);
  }

  checks.push(["abstention_rate", metrics.abstention_rate, "<=", t.abstention_rate_max]);
  checks.push(["severity_mae", metrics.severity_mae, "<=", t.severity_mae_max]);

  for (const [name, actual, op, expected] of checks) {
    if (expected == null) continue;
    if (actual == null) { reasons.push(`${name} unavailable`); continue; }
    const ok = op === ">=" ? actual >= expected : actual <= expected;
    if (!ok) reasons.push(`${name} threshold failed: ${actual} ${op} ${expected}`);
  }
  return { status: reasons.length ? "NOT_CALIBRATED" : "CALIBRATED_FOR_DEFINED_CORPUS", reasons };
}

function scoreEvaluator({ cases, truth, predictions, policy: policyInput } = {}) {
  const caseSet = validateCases(cases);
  const truthMap = validateTruth(truth, caseSet.id);
  const predictionSet = validatePredictions(predictions, caseSet.id);
  const policy = normalizePolicy(policyInput);
  const caseIds = new Set(caseSet.cases.map((item) => item.id));

  if (truthMap.size !== caseIds.size || [...caseIds].some((id) => !truthMap.has(id))) {
    throw new Error("truth must contain exactly one entry for every case");
  }

  const runsByCase = new Map();
  for (const run of predictionSet.runs) {
    if (!caseIds.has(run.case_id)) throw new Error(`prediction references unknown case: ${run.case_id}`);
    const list = runsByCase.get(run.case_id) || [];
    if (list.some((x) => x.run_id === run.run_id)) throw new Error(`duplicate run_id '${run.run_id}' for '${run.case_id}'`);
    list.push(run);
    runsByCase.set(run.case_id, list);
  }

  const records = caseSet.cases.map((caseItem) => {
    const runs = runsByCase.get(caseItem.id) || [];
    if (!runs.length) throw new Error(`no predictions for case: ${caseItem.id}`);
    const truthItem = truthMap.get(caseItem.id);
    const rep = representativeForRuns(runs);
    return {
      case: caseItem,
      truth: truthItem,
      runs,
      prediction: rep.prediction,
      decision_stable: rep.decision_stable,
      decision_unanimous: rep.decision_unanimous,
      severity_unanimous: rep.severity_unanimous,
      qualifying: isQualifying(caseItem, truthItem, policy)
    };
  });

  const qualifying = records.filter((record) => record.qualifying);
  const allMetrics = computeMetrics(records, policy);
  const qualifyingMetrics = computeMetrics(qualifying, policy);

  return Object.freeze({
    protocol: "calibration-evaluator-result/0.1",
    corpus_id: caseSet.id,
    evaluator: predictionSet.evaluator,
    policy: {
      id: policy.id,
      qualifying_truth_kinds: policy.qualifying_truth_kinds,
      require_blinded: policy.require_blinded,
      min_qualifying_cases: policy.min_qualifying_cases,
      min_qualifying_adverse: policy.min_qualifying_adverse,
      min_qualifying_pass: policy.min_qualifying_pass || 0,
      min_runs_per_case: policy.min_runs_per_case,
      thresholds: policy.thresholds
    },
    evidence: {
      total_cases: records.length,
      qualifying_cases: qualifying.length,
      excluded_cases: records.length - qualifying.length
    },
    metrics: { all: allMetrics, qualifying: qualifyingMetrics },
    decision: evaluatePolicy(qualifyingMetrics, policy),
    limitations: [
      "Calibration is bounded to the defined corpus, evaluator revision, policy, and ground-truth provenance.",
      "Self-derived specification cases can test conformance but cannot independently validate the evaluator.",
      "Calibration evidence does not create accreditation, certification, publication authority, or authority to generalize beyond the corpus."
    ]
  });
}

module.exports = { DECISIONS, SEVERITIES, DEFAULT_POLICY, normalizePolicy, scoreEvaluator };
