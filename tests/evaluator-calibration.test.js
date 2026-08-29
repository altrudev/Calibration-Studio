"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {scoreEvaluator}=require("../src/public/evaluator-calibration");

function cases(mode="blinded"){return{protocol:"calibration-evaluator-cases/0.1",id:"test-corpus",cases:[
{id:"P1",mode,domain:"control",payload:{x:1}},{id:"F1",mode,domain:"control",payload:{x:2}}]};}
function truth(independent=true,kind="mechanical"){return{protocol:"calibration-evaluator-truth/0.1",corpus_id:"test-corpus",cases:[
{case_id:"P1",decision:"pass",severity:"none",reason_codes:["OK"],provenance:{kind,independent_of_evaluator:independent,reference:"fixture"}},
{case_id:"F1",decision:"fail",severity:"high",reason_codes:["BLOCK"],provenance:{kind,independent_of_evaluator:independent,reference:"fixture"}}]};}
function predictions(falseNegative=false,unstable=false){const runs=[];for(const id of["P1","F1"]){for(let i=1;i<=3;i++){let d=id==="P1"?"pass":"fail",s=id==="P1"?"none":"high",r=id==="P1"?"OK":"BLOCK";if(falseNegative&&id==="F1"){d="pass";s="none";r="OK";}if(unstable&&id==="F1"&&i===3){d="inconclusive";s="medium";r="UNSTABLE";}runs.push({case_id:id,run_id:`${id}-${i}`,decision:d,severity:s,reason_codes:[r]});}}return{protocol:"calibration-evaluator-predictions/0.1",corpus_id:"test-corpus",evaluator:{id:"fixture",revision:"1"},runs};}
function policy(){return{protocol:"calibration-evaluator-policy/0.1",id:"test",qualifying_truth_kinds:["mechanical","external"],require_blinded:true,min_qualifying_cases:2,min_qualifying_adverse:1,min_runs_per_case:3,adverse_truth_decisions:["fail"],unsafe_predictions:["pass","pass_with_limitations"],abstain_predictions:["inconclusive","not_assessed"],thresholds:{decision_accuracy_min:1,macro_f1_min:1,unsafe_false_negative_rate_max:0,repeatability_min:1,abstention_rate_max:0,severity_mae_max:0}};}

test("perfect blinded independent corpus calibrates",()=>{const r=scoreEvaluator({cases:cases(),truth:truth(),predictions:predictions(),policy:policy()});assert.equal(r.decision.status,"CALIBRATED_FOR_DEFINED_CORPUS");assert.equal(r.metrics.qualifying.decision_accuracy,1);});
test("unsafe false negative blocks calibration",()=>{const r=scoreEvaluator({cases:cases(),truth:truth(),predictions:predictions(true),policy:policy()});assert.equal(r.decision.status,"NOT_CALIBRATED");assert.equal(r.metrics.qualifying.unsafe_false_negative_rate,1);});
test("self-derived specification cases cannot qualify",()=>{const r=scoreEvaluator({cases:cases("retrospective"),truth:truth(false,"specification"),predictions:predictions(),policy:policy()});assert.equal(r.evidence.qualifying_cases,0);assert.equal(r.decision.status,"INSUFFICIENT_EVIDENCE");});
test("instability reduces repeatability",()=>{const r=scoreEvaluator({cases:cases(),truth:truth(),predictions:predictions(false,true),policy:policy()});assert.equal(r.decision.status,"NOT_CALIBRATED");assert.ok(r.metrics.qualifying.repeatability<1);});
test("corpus binding is mandatory",()=>{const t=truth();t.corpus_id="other";assert.throws(()=>scoreEvaluator({cases:cases(),truth:t,predictions:predictions(),policy:policy()}),/corpus_id mismatch/);});
