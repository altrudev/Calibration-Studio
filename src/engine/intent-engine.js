"use strict";
const {
  assertConflictFree,
  createIntentArtifact,
  diffIntent,
  digest,
  normalizeIntent,
  resolveInheritance,
  stable,
  verifyIntent
}=require("../public/intent-ir");

const PROPAGATING_RELATIONS=new Set(["affects","requires","constrains","protects","derived_from"]);

function canonicalizeInput(input={}){
  return {
    ...input,
    clauses:(Array.isArray(input.clauses)?input.clauses:[]).map(clause=>{
      if(!clause||typeof clause!=="object")return clause;
      if(!["gte","lte"].includes(clause.operator))return {...clause};
      const value=Number(clause.value);
      if(!Number.isFinite(value))return {...clause};
      return {...clause,value};
    })
  };
}

function same(a,b){return JSON.stringify(stable(a))===JSON.stringify(stable(b));}
function sortedIds(values){return [...values].map(String).sort();}
function assertExactParentSet(child,parents){
  const declared=sortedIds(child.scope.parents||[]);
  const supplied=sortedIds(parents.map(parent=>parent.intent_id));
  if(new Set(supplied).size!==supplied.length)throw new Error("duplicate parent intent supplied");
  if(!same(declared,supplied))throw new Error(`intent parent set mismatch: declared [${declared.join(", ")}] supplied [${supplied.join(", ")}]`);
  const inherited=new Map();
  for(const parent of parents){
    const parentDeclared=sortedIds(parent.scope.parents||[]);
    const parentResolved=sortedIds(parent.metadata?.resolved_parents||[]);
    if(parentDeclared.length&&!same(parentDeclared,parentResolved))throw new Error(`parent intent is not fully resolved: ${parent.intent_id}`);
    for(const clause of parent.clauses){
      const prior=inherited.get(clause.id);
      if(prior){
        if(same(prior.clause,clause))continue;
        throw new Error(`duplicate inherited clause id '${clause.id}' differs between parents ${prior.owner} and ${parent.intent_id}`);
      }
      inherited.set(clause.id,{owner:parent.intent_id,clause});
    }
  }
}

function compileIntent({intent,parents=[]}={}){
  const child=normalizeIntent(canonicalizeInput(intent));
  const normalizedParents=parents.map(parent=>normalizeIntent(canonicalizeInput(parent)));
  assertExactParentSet(child,normalizedParents);
  const resolved=normalizedParents.length?resolveInheritance({intent:child,parents:normalizedParents}):child;
  assertConflictFree(resolved);
  return createIntentArtifact(resolved);
}

function assertFactTypes(intent,facts){
  for(const clause of intent.clauses){
    if(!Object.prototype.hasOwnProperty.call(facts,clause.target))continue;
    const actual=facts[clause.target];
    if(["gte","lte"].includes(clause.operator)&&!(typeof actual==="number"&&Number.isFinite(actual)))throw new Error(`semantic type error for '${clause.target}': ${clause.operator} requires a finite numeric fact`);
    if(["contains","not_contains"].includes(clause.operator)){
      const validContainer=typeof actual==="string"||Array.isArray(actual);
      if(!validContainer)throw new Error(`semantic type error for '${clause.target}': ${clause.operator} requires a string or array fact`);
      if(typeof actual==="string"&&typeof clause.value!=="string")throw new Error(`semantic type error for '${clause.id}': string containment requires a string clause value`);
    }
  }
}

function verifyCompiledIntent({intent,facts={}}={}){
  const normalized=normalizeIntent(canonicalizeInput(intent));
  assertFactTypes(normalized,facts);
  return verifyIntent(normalized,facts);
}

function edgeKey(edge){return JSON.stringify(stable(edge));}
function edgeDifference(left,right){
  const rightKeys=new Set(right.map(edgeKey));
  return left.filter(edge=>!rightKeys.has(edgeKey(edge)));
}
function affectedFromGraphs(before,after,seeds){
  const adjacency=new Map();
  for(const intent of [before,after]){
    for(const edge of intent.edges){
      if(!PROPAGATING_RELATIONS.has(edge.relation))continue;
      if(!adjacency.has(edge.from))adjacency.set(edge.from,new Set());
      adjacency.get(edge.from).add(edge.to);
    }
  }
  const affected=new Set(seeds),queue=[...seeds];
  while(queue.length){
    const current=queue.shift();
    for(const next of adjacency.get(current)||[]){
      if(affected.has(next))continue;
      affected.add(next);queue.push(next);
    }
  }
  return [...affected].sort();
}

function diffCompiledIntent({before,after}={}){
  const a=normalizeIntent(canonicalizeInput(before)),b=normalizeIntent(canonicalizeInput(after));
  if(b.version<=a.version)throw new Error(`intent version must advance: ${a.version} -> ${b.version}`);
  assertConflictFree(b);
  const base=diffIntent(a,b);
  const edgesAdded=edgeDifference(b.edges,a.edges);
  const edgesRemoved=edgeDifference(a.edges,b.edges);
  const scopeChanged=!same(a.scope,b.scope);
  const edgeSeeds=[...edgesAdded,...edgesRemoved].flatMap(edge=>[edge.from,edge.to]);
  const seeds=[...new Set([...base.added,...base.removed,...base.changed,...edgeSeeds])];
  const affected=scopeChanged?[...new Set([...seeds,...a.clauses.map(clause=>clause.id),...b.clauses.map(clause=>clause.id)])].sort():affectedFromGraphs(a,b,seeds);
  const core={...base};delete core.id;delete core.fingerprint;
  core.edges_added=edgesAdded;
  core.edges_removed=edgesRemoved;
  core.scope_changed=scopeChanged;
  core.affected=affected;
  const fingerprint=digest(core);
  return Object.freeze({...core,id:`IDELTA-${fingerprint.slice(0,12).toUpperCase()}`,fingerprint});
}

module.exports={assertFactTypes,canonicalizeInput,compileIntent,verifyCompiledIntent,diffCompiledIntent};
