"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {compileIntent,verifyCompiledIntent,diffCompiledIntent}=require("../src/engine/intent-engine");

function intent(version=1){return{intent_id:"trust.demo",version,scope:{id:"trust.demo",parents:[]},clauses:[{id:"privacy",kind:"invariant",target:"privacy.telemetry",operator:"eq",value:false,severity:"hard"},{id:"ux",kind:"preference",target:"ui.navigation_depth",operator:"lte",value:3,severity:"soft",priority:.7}],edges:[{from:"privacy",to:"ux",relation:"constrains"}]};}

test("compiled intent is public-safe and deterministic",()=>{const artifact=compileIntent({intent:intent()});assert.equal(JSON.stringify(artifact).includes("_private"),false);assert.equal(artifact.schema,"altru-intent-contract/0.1");assert.match(artifact.id,/^INT-/);});

test("direct hard conflicts fail closed during compilation",()=>{const value=intent();value.clauses.push({id:"telemetry-on",kind:"goal",target:"privacy.telemetry",operator:"eq",value:true,severity:"hard"});assert.throws(()=>compileIntent({intent:value}),/hard intent conflict/);});

test("declared parent set must be resolved exactly",()=>{const child=intent();child.scope.parents=["altru.trust"];assert.throws(()=>compileIntent({intent:child}),/intent parent set mismatch/);});

test("differing inherited clause ids from different parents fail closed",()=>{const child=intent();child.scope.parents=["parent.a","parent.b"];const parentA={intent_id:"parent.a",clauses:[{id:"shared",kind:"invariant",target:"security.mode",operator:"eq",value:"strict",severity:"hard"}]};const parentB={intent_id:"parent.b",clauses:[{id:"shared",kind:"invariant",target:"privacy.mode",operator:"eq",value:"local",severity:"hard"}]};assert.throws(()=>compileIntent({intent:child,parents:[parentA,parentB]}),/duplicate inherited clause id/);});

test("identical inherited clauses are safe across diamond parents",()=>{const child=intent();child.scope.parents=["parent.a","parent.b"];const shared={id:"shared",kind:"invariant",target:"security.mode",operator:"eq",value:"strict",severity:"hard"};const artifact=compileIntent({intent:child,parents:[{intent_id:"parent.a",clauses:[shared]},{intent_id:"parent.b",clauses:[shared]}]});assert.equal(artifact.clauses.filter(c=>c.id==="shared").length,1);});

test("numeric bounds are canonicalized before compilation",()=>{const value=intent();value.clauses=value.clauses.map(c=>c.id==="ux"?{...c,value:"3"}:c);const artifact=compileIntent({intent:value});assert.equal(artifact.clauses.find(c=>c.id==="ux").value,3);});

test("intent verification remains public-safe",()=>{const result=verifyCompiledIntent({intent:intent(),facts:{"privacy.telemetry":false,"ui.navigation_depth":2}});assert.equal(result.status,"pass");assert.equal(JSON.stringify(result).includes("_private"),false);});

test("numeric verification rejects JavaScript coercion",()=>{assert.throws(()=>verifyCompiledIntent({intent:intent(),facts:{"privacy.telemetry":false,"ui.navigation_depth":"2"}}),/semantic type error/);});

test("intent delta exposes only affected public clause ids",()=>{const before=intent(1);const after=intent(2);after.clauses=after.clauses.map(c=>c.id==="privacy"?{...c,confidence:.9}:c);const delta=diffCompiledIntent({before,after});assert.deepEqual(delta.changed,["privacy"]);assert.deepEqual(delta.affected,["privacy","ux"]);assert.equal(JSON.stringify(delta).includes("_private"),false);});

test("intent delta requires forward version movement",()=>{assert.throws(()=>diffCompiledIntent({before:intent(2),after:intent(2)}),/intent version must advance/);});

test("edge-only intent changes participate in affected-region propagation",()=>{const before=intent(1);const after=intent(2);after.edges=[{from:"ux",to:"privacy",relation:"affects"}];const delta=diffCompiledIntent({before,after});assert.equal(delta.edges_added.length,1);assert.equal(delta.edges_removed.length,1);assert.deepEqual(delta.affected,["privacy","ux"]);});

test("scope changes force reevaluation of the full intent",()=>{const before=intent(1);const after=intent(2);after.scope.id="trust.demo.feature";const delta=diffCompiledIntent({before,after});assert.equal(delta.scope_changed,true);assert.deepEqual(delta.affected,["privacy","ux"]);});
