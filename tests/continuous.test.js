"use strict";
const assert=require("node:assert/strict");
const test=require("node:test");
const {normalizeSettings}=require("../src/public/settings");
const {calibrate}=require("../src/engine/calibration-engine");
const {createBaseline,compareBaseline}=require("../src/public/lifecycle");
const {normalizeContinuousPlan,runContinuousGate,assertGateIntegrity}=require("../src/public/continuous");

const commits=["a".repeat(40),"b".repeat(40),"c".repeat(40)];
const settings=normalizeSettings({profile:"release",edition:"pro",driftTolerancePercent:10});
const contract={checks:[
  {id:"save",title:"Save",domain:"state",expected:true,severity:"high"},
  {id:"startup",title:"Startup",domain:"timing",expected:1000,allowDrift:true,required:false}
]};
function observations({save=true,startup=1000,runtime="fixture",extra=false}={}){const now="2026-08-09T09:00:00Z";const list=[{id:"save",value:save,evidence:[],environment:{runtime}},{id:"startup",value:startup,evidence:[],environment:{runtime}}];if(extra)list.push({id:"new-signal",value:true,evidence:[],environment:{runtime}});return{schema:"calibration-observation-set/0.2",started_at:now,completed_at:now,observations:list};}
function project(commit){return{name:"Continuous Demo",githubUrl:"https://github.com/example/continuous",githubSource:"git-origin",repositoryUrl:"https://github.com/example/continuous",gitBranch:"main",gitCommit:commit};}
function baselineFixture(){const obs=observations();const p=project(commits[0]);const report=calibrate({contract,observations:obs,settings,project:p});return createBaseline({contract,observations:obs,report,project:p,settings,label:"known-good"});}
function fakeDriver(states){return{root(){return"/virtual/repo";},resolve(_repo,ref){if(ref==="HEAD")return commits.at(-1);return ref;},chain(){return commits;},meta(_repo,commit){return{git_commit:commit,committed_at:`2026-08-09T09:00:0${commits.indexOf(commit)}Z`,subject:`commit ${commits.indexOf(commit)}`};},prune(){},evaluate({commit,baseline,scopeIds=null,scopeMode=null}){return compareBaseline({baseline,observations:states.get(commit),project:project(commit),scopeIds,scopeMode});}};}
const basePlan={schema:"calibration-continuous-plan/0.8",evaluate:{command:"node",args:["fixture.js"]}};

test("continuous plan is conservative by default",()=>{const plan=normalizeContinuousPlan(basePlan);assert.equal(plan.current_ref,"HEAD");assert.equal(plan.trace_on_regression,false);assert.equal(plan.gate.fail_on_environment_change,false);assert.equal(plan.gate.fail_on_untracked_observations,false);assert.equal(plan.history_plan.strategy,"exact");});

test("continuous plan rejects malformed booleans and unknown policy knobs",()=>{assert.throws(()=>normalizeContinuousPlan({...basePlan,trace_on_regression:"yes"}),/must be boolean/);assert.throws(()=>normalizeContinuousPlan({...basePlan,gate:{fail_on_environment_change:"true"}}),/must be boolean/);assert.throws(()=>normalizeContinuousPlan({...basePlan,gate:{mystery_mode:true}}),/unknown option/);assert.throws(()=>normalizeContinuousPlan({...basePlan,unexpected:true}),/unknown option/);});

test("stable behavior passes while environment and untracked changes are advisory by default",()=>{const baseline=baselineFixture();const states=new Map([[commits[0],observations()],[commits[1],observations()],[commits[2],observations({runtime:"different",extra:true})]]);const gate=runContinuousGate({baseline,repoDir:"/virtual/repo",plan:basePlan,confirmExecution:true,driver:fakeDriver(states)});assertGateIntegrity(gate);assert.equal(gate.decision.status,"pass");assert.equal(gate.decision.exit_code,0);assert.deepEqual(gate.decision.failure_codes,[]);assert.deepEqual(gate.decision.advisory_codes.map(x=>x.code),["CAL-GATE-002","CAL-GATE-003"]);});

test("policy can promote environment and untracked changes into gate failures",()=>{const baseline=baselineFixture();const states=new Map([[commits[0],observations()],[commits[1],observations()],[commits[2],observations({runtime:"different",extra:true})]]);const gate=runContinuousGate({baseline,repoDir:"/virtual/repo",plan:{...basePlan,gate:{fail_on_environment_change:true,fail_on_untracked_observations:true}},confirmExecution:true,driver:fakeDriver(states)});assert.equal(gate.decision.status,"fail");assert.equal(gate.decision.exit_code,2);assert.deepEqual(gate.decision.failure_codes.map(x=>x.code),["CAL-GATE-002","CAL-GATE-003"]);});

test("regression fails the gate and can attach exact first-bad tracing",()=>{const baseline=baselineFixture();const states=new Map([[commits[0],observations()],[commits[1],observations({save:false})],[commits[2],observations({save:false})]]);const gate=runContinuousGate({baseline,repoDir:"/virtual/repo",plan:{...basePlan,trace_on_regression:true},confirmExecution:true,driver:fakeDriver(states)});assertGateIntegrity(gate);assert.equal(gate.decision.status,"fail");assert.equal(gate.decision.exit_code,2);assert.equal(gate.decision.failure_codes[0].code,"CAL-GATE-001");assert.equal(gate.trace.trace.guarantee,"first-parent-exact");assert.equal(gate.trace.first_bad.git_commit,commits[1]);assert.equal(gate.current.git_commit,commits[2]);});

test("continuous calibration requires explicit execution confirmation",()=>{const baseline=baselineFixture();const states=new Map(commits.map(commit=>[commit,observations()]));assert.throws(()=>runContinuousGate({baseline,repoDir:"/virtual/repo",plan:basePlan,driver:fakeDriver(states)}),/explicit execution confirmation/);});

test("gate integrity rejects tampered nested regression and trace linkage",()=>{const baseline=baselineFixture();const states=new Map([[commits[0],observations()],[commits[1],observations({save:false})],[commits[2],observations({save:false})]]);const gate=runContinuousGate({baseline,repoDir:"/virtual/repo",plan:{...basePlan,trace_on_regression:true},confirmExecution:true,driver:fakeDriver(states)});const brokenRegression=JSON.parse(JSON.stringify(gate));brokenRegression.regression.regression.status="stable";assert.throws(()=>assertGateIntegrity(brokenRegression),/fingerprint mismatch/);const brokenTrace=JSON.parse(JSON.stringify(gate));brokenTrace.trace.range.bad_commit=commits[1];assert.throws(()=>assertGateIntegrity(brokenTrace),/fingerprint mismatch/);});
