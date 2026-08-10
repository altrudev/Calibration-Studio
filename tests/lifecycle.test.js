"use strict";
const assert=require("node:assert/strict");
const test=require("node:test");
const {normalizeSettings}=require("../src/public/settings");
const {calibrate}=require("../src/engine/calibration-engine");
const {createBaseline,assertBaselineIntegrity,compareBaseline,assertRegressionIntegrity,createHistory,assertHistoryIntegrity,verifyRepair,assertRepairIntegrity}=require("../src/public/lifecycle");

const settings=normalizeSettings({profile:"release",edition:"pro",driftTolerancePercent:10});
const contract={checks:[
  {id:"save",title:"Save commits",domain:"state",expected:true,severity:"high"},
  {id:"startup",title:"Startup time",domain:"timing",expected:1000,allowDrift:true,required:false},
  {id:"mode",title:"Mode marker",domain:"behavior",expected:"known-good-mode"}
]};
function project(commit){return{name:"Lifecycle Demo",githubUrl:"https://github.com/example/lifecycle",githubSource:"git-origin",repositoryUrl:"https://github.com/example/lifecycle",gitBranch:"main",gitCommit:commit};}
function observations({save=true,startup=1000,mode="known-good-mode",started="2026-08-09T07:00:00Z",completed="2026-08-09T07:00:01Z"}={}){return{schema:"calibration-observation-set/0.2",started_at:started,completed_at:completed,observations:[
  {id:"save",value:save,evidence:[{type:"state",summary:"save result"}],environment:{runtime:"fixture"}},
  {id:"startup",value:startup,evidence:[{type:"timing",summary:"startup duration"}],environment:{runtime:"fixture"}},
  {id:"mode",value:mode,evidence:[{type:"behavior",summary:"mode observed"}],environment:{runtime:"fixture"}}
]};}
function baselineFixture(){const obs=observations();const p=project("base123");const report=calibrate({contract,observations:obs,settings,project:p});return createBaseline({contract,observations:obs,report,project:p,settings,label:"release-1"});}

test("baseline is immutable, integrity checked, and does not export raw string values",()=>{const baseline=baselineFixture();assert.equal(baseline.schema,"altru-calibration-baseline/0.1");assert.match(baseline.id,/^BASE-/);assert.equal(assertBaselineIntegrity(baseline),baseline);assert.equal(JSON.stringify(baseline).includes("known-good-mode"),false);const mode=baseline.checks.find(check=>check.id==="mode");assert.equal(mode.observed.type,"string");assert.equal(typeof mode.observed.hash,"string");assert.equal(mode.observed.length,15);});

test("baseline creation rejects a fractured run instead of normalizing failure",()=>{const obs=observations({save:false});const p=project("broken-base");const report=calibrate({contract,observations:obs,settings,project:p});assert.equal(report.calibration.status,"fractured");assert.throws(()=>createBaseline({contract,observations:obs,report,project:p,settings}),/requires a calibrated run/);});

test("regression comparison separates tolerated drift from real divergence",()=>{const baseline=baselineFixture();const current=observations({save:false,startup:1080,mode:"changed-mode",started:"2026-08-09T08:00:00Z",completed:"2026-08-09T08:00:01Z"});const regression=compareBaseline({baseline,observations:current,project:project("regressed456")});assertRegressionIntegrity(regression);assert.equal(regression.regression.status,"regressed");assert.equal(regression.regression.drifted_count,2);assert.equal(regression.regression.within_tolerance_count,1);assert.equal(regression.changes.find(change=>change.id==="startup").status,"within_tolerance");assert.equal(regression.findings.some(finding=>finding.checkId==="save"&&finding.code==="CAL-DRIFT-001"),true);assert.equal(JSON.stringify(regression).includes("changed-mode"),false);});

test("history finds the first divergence and recognizes recovery",()=>{const baseline=baselineFixture();const first=compareBaseline({baseline,observations:observations({save:false,started:"2026-08-09T08:00:00Z",completed:"2026-08-09T08:00:01Z"}),project:project("bad111")});const second=compareBaseline({baseline,observations:observations({save:true,started:"2026-08-09T09:00:00Z",completed:"2026-08-09T09:00:01Z"}),project:project("fix222")});const history=createHistory([second,first]);assertHistoryIntegrity(history);assert.equal(history.history.status,"recovered");const save=history.signals.find(item=>item.id==="save");assert.equal(save.first_divergence.git_commit,"bad111");assert.equal(save.first_recovery.git_commit,"fix222");assert.equal(save.latest_status,"stable");});

test("repair verification requires the same baseline and rejects new regressions",()=>{const baseline=baselineFixture();const before=compareBaseline({baseline,observations:observations({save:false,started:"2026-08-09T08:00:00Z",completed:"2026-08-09T08:00:01Z"}),project:project("bad111")});const repaired=compareBaseline({baseline,observations:observations({save:true,started:"2026-08-09T09:00:00Z",completed:"2026-08-09T09:00:01Z"}),project:project("fix222")});const verified=verifyRepair({before,after:repaired});assertRepairIntegrity(verified);assert.equal(verified.repair.status,"verified");assert.equal(verified.repair.verified_count,1);const brokenNeighbor=compareBaseline({baseline,observations:observations({save:true,mode:"neighbor-regressed",started:"2026-08-09T10:00:00Z",completed:"2026-08-09T10:00:01Z"}),project:project("bad-neighbor")});const failed=verifyRepair({before,after:brokenNeighbor});assert.equal(failed.repair.status,"failed");assert.equal(failed.repair.new_regression_count,1);});

test("tampered lifecycle artifacts fail closed",()=>{const baseline=baselineFixture();const tampered=JSON.parse(JSON.stringify(baseline));tampered.checks[0].observed.hash="0".repeat(64);assert.throws(()=>assertBaselineIntegrity(tampered),/fingerprint mismatch/);const regression=compareBaseline({baseline,observations:observations({save:false}),project:project("bad")});const tamperedRegression=JSON.parse(JSON.stringify(regression));tamperedRegression.regression.status="stable";assert.throws(()=>assertRegressionIntegrity(tamperedRegression),/fingerprint mismatch/);});
