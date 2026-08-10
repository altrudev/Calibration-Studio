"use strict";
const crypto=require("node:crypto");
const {assertBaselineIntegrity,assertRegressionIntegrity}=require("./lifecycle");
const {normalizeTracePlan,evaluateRevision,traceHistory,assertTraceIntegrity}=require("./historical-tracing");

const GATE_REASONS=Object.freeze({
  regression:Object.freeze({code:"CAL-GATE-001",title:"Baseline regression"}),
  environment:Object.freeze({code:"CAL-GATE-002",title:"Environment changed"}),
  untracked:Object.freeze({code:"CAL-GATE-003",title:"Untracked observations"})
});
const PLAN_KEYS=new Set(["schema","current_ref","trace_on_regression","gate","trace","setup_commands","evaluate","pass_environment","environment"]);
const GATE_KEYS=new Set(["fail_on_environment_change","fail_on_untracked_observations"]);
const TRACE_KEYS=new Set(["strategy","max_commits","good_ref"]);

function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==="object")return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));return value;}
function sha256(value){return crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");}
function addIntegrity(prefix,core){const fingerprint=sha256(core);return{...core,id:`${prefix}-${fingerprint.slice(0,12).toUpperCase()}`,fingerprint};}
function assertArtifact(value,schema,prefix){if(!value||value.schema!==schema)throw new Error(`Expected ${schema}`);const core={...value};delete core.id;delete core.fingerprint;const fingerprint=sha256(core);if(value.fingerprint!==fingerprint)throw new Error(`${schema} fingerprint mismatch`);if(value.id!==`${prefix}-${fingerprint.slice(0,12).toUpperCase()}`)throw new Error(`${schema} id mismatch`);return value;}
function assertKeys(value,allowed,label){for(const key of Object.keys(value))if(!allowed.has(key))throw new Error(`${label} contains unknown option '${key}'`);}
function bool(value,fallback,label){if(value===undefined)return fallback;if(typeof value!=="boolean")throw new Error(`${label} must be boolean`);return value;}

function normalizeContinuousPlan(input={}){
  if(!input||typeof input!=="object"||Array.isArray(input))throw new Error("continuous calibration plan must be an object");assertKeys(input,PLAN_KEYS,"continuous calibration plan");
  if(input.schema&&input.schema!=="calibration-continuous-plan/0.8")throw new Error("unsupported continuous calibration plan schema");
  const currentRef=input.current_ref??"HEAD";if(typeof currentRef!=="string"||!currentRef.trim())throw new Error("current_ref must be a non-empty Git ref");
  const gate=input.gate??{};if(!gate||typeof gate!=="object"||Array.isArray(gate))throw new Error("gate must be an object");assertKeys(gate,GATE_KEYS,"gate");
  const trace=input.trace??{};if(!trace||typeof trace!=="object"||Array.isArray(trace))throw new Error("trace must be an object");assertKeys(trace,TRACE_KEYS,"trace");
  const historyPlan=normalizeTracePlan({
    schema:"calibration-history-trace-plan/0.7",
    strategy:trace.strategy??"exact",
    max_commits:trace.max_commits??200,
    good_ref:trace.good_ref??null,
    bad_ref:currentRef,
    setup_commands:input.setup_commands??[],
    evaluate:input.evaluate,
    pass_environment:input.pass_environment??[],
    environment:input.environment??{}
  });
  return{
    schema:"calibration-continuous-plan/0.8",
    current_ref:currentRef,
    trace_on_regression:bool(input.trace_on_regression,false,"trace_on_regression"),
    gate:{
      fail_on_environment_change:bool(gate.fail_on_environment_change,false,"gate.fail_on_environment_change"),
      fail_on_untracked_observations:bool(gate.fail_on_untracked_observations,false,"gate.fail_on_untracked_observations")
    },
    history_plan:historyPlan
  };
}

function reason(code){return{code:code.code,title:code.title};}
function decisionFor(regression,policy){
  const failures=[],advisories=[];
  if(regression.regression.status==="regressed")failures.push(reason(GATE_REASONS.regression));
  if(regression.regression.environment_changed_count>0){const item=reason(GATE_REASONS.environment);(policy.fail_on_environment_change?failures:advisories).push(item);}
  if(regression.regression.untracked_observation_count>0){const item=reason(GATE_REASONS.untracked);(policy.fail_on_untracked_observations?failures:advisories).push(item);}
  return{status:failures.length?"fail":"pass",exit_code:failures.length?2:0,failure_codes:failures,advisory_codes:advisories};
}

function createGateArtifact({baseline,regression,plan,trace=null}){
  assertBaselineIntegrity(baseline);assertRegressionIntegrity(regression);if(regression.baseline.fingerprint!==baseline.fingerprint)throw new Error("continuous gate regression does not match baseline");
  if(!plan||plan.schema!=="calibration-continuous-plan/0.8"||!plan.history_plan||!plan.gate)throw new Error("continuous gate requires a normalized v0.8 plan");
  if(trace){assertTraceIntegrity(trace);if(trace.baseline.fingerprint!==baseline.fingerprint)throw new Error("continuous gate trace does not match baseline");if(trace.range.bad_commit!==regression.current.project.git_commit)throw new Error("continuous gate trace does not end at the evaluated commit");}
  const decision=decisionFor(regression,plan.gate);
  if(trace&&regression.regression.status!=="regressed")throw new Error("continuous gate trace is only valid for an active regression");
  const core={
    schema:"altru-calibration-gate/0.1",
    created_at:regression.current?.run?.completed_at||new Date().toISOString(),
    baseline:{id:baseline.id,fingerprint:baseline.fingerprint,git_commit:baseline.project?.git_commit||null},
    current:{git_commit:regression.current?.project?.git_commit||null,regression_id:regression.id,regression_fingerprint:regression.fingerprint},
    policy:{...plan.gate,trace_on_regression:plan.trace_on_regression,trace_strategy:plan.history_plan.strategy,max_commits:plan.history_plan.max_commits},
    decision,
    summary:{checked_count:regression.regression.checked_count,stable_count:regression.regression.stable_count,within_tolerance_count:regression.regression.within_tolerance_count,drifted_count:regression.regression.drifted_count,missing_count:regression.regression.missing_count,environment_changed_count:regression.regression.environment_changed_count,untracked_observation_count:regression.regression.untracked_observation_count},
    regression,
    trace:trace||null
  };
  return addIntegrity("GATE",core);
}

function assertGateIntegrity(gate){
  assertArtifact(gate,"altru-calibration-gate/0.1","GATE");assertRegressionIntegrity(gate.regression);
  if(gate.regression.fingerprint!==gate.current.regression_fingerprint||gate.regression.id!==gate.current.regression_id)throw new Error("continuous gate regression linkage mismatch");
  if(gate.regression.baseline.fingerprint!==gate.baseline.fingerprint)throw new Error("continuous gate baseline linkage mismatch");
  if(gate.regression.current.project.git_commit!==gate.current.git_commit)throw new Error("continuous gate current commit linkage mismatch");
  if(gate.trace){assertTraceIntegrity(gate.trace);if(gate.trace.baseline.fingerprint!==gate.baseline.fingerprint||gate.trace.range.bad_commit!==gate.current.git_commit)throw new Error("continuous gate trace linkage mismatch");}
  return gate;
}

function runContinuousGate({baseline,repoDir,plan:rawPlan,confirmExecution=false,driver}){
  assertBaselineIntegrity(baseline);if(confirmExecution!==true)throw new Error("continuous calibration requires explicit execution confirmation");
  const plan=normalizeContinuousPlan(rawPlan);
  const regression=evaluateRevision({baseline,repoDir,plan:plan.history_plan,commitRef:plan.current_ref,confirmExecution:true,...(driver?{driver}:{})});
  let trace=null;
  if(regression.regression.status==="regressed"&&plan.trace_on_regression){trace=traceHistory({baseline,repoDir,plan:plan.history_plan,confirmExecution:true,...(driver?{driver}:{})});}
  return createGateArtifact({baseline,regression,plan,trace});
}

module.exports={GATE_REASONS,normalizeContinuousPlan,decisionFor,createGateArtifact,assertGateIntegrity,runContinuousGate};
