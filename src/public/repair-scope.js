"use strict";
const crypto=require("node:crypto");
const {assertBaselineIntegrity,assertRegressionIntegrity,assertRepairIntegrity,verifyRepair}=require("./lifecycle");
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==="object")return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));return value;}
function sha256(value){return crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");}
function addIntegrity(prefix,core){const fingerprint=sha256(core);return{...core,id:`${prefix}-${fingerprint.slice(0,12).toUpperCase()}`,fingerprint};}
function assertArtifact(value,schema,prefix){if(!value||value.schema!==schema)throw new Error(`Expected ${schema}`);const core={...value};delete core.id;delete core.fingerprint;const fingerprint=sha256(core);if(value.fingerprint!==fingerprint)throw new Error(`${schema} fingerprint mismatch`);if(value.id!==`${prefix}-${fingerprint.slice(0,12).toUpperCase()}`)throw new Error(`${schema} id mismatch`);return value;}
function createRepairScope({baseline,before,mode="domain-neighborhood"}){
  assertBaselineIntegrity(baseline);assertRegressionIntegrity(before);if(before.baseline.fingerprint!==baseline.fingerprint)throw new Error("repair scope baseline does not match regression baseline");if(!["minimal","domain-neighborhood","full"].includes(mode))throw new Error("repair scope mode must be minimal, domain-neighborhood, or full");
  const affected=before.changes.filter(change=>["drifted","missing"].includes(change.status)).map(change=>change.id);if(!affected.length)throw new Error("repair scope requires an active regression");const affectedSet=new Set(affected);const affectedDomains=new Set(before.changes.filter(change=>affectedSet.has(change.id)).map(change=>change.domain));
  let selected;if(mode==="minimal")selected=[...affectedSet];else if(mode==="full")selected=baseline.checks.map(check=>check.id);else selected=baseline.checks.filter(check=>affectedSet.has(check.id)||affectedDomains.has(check.domain)).map(check=>check.id);
  selected=[...new Set(selected)].sort();const neighbors=selected.filter(id=>!affectedSet.has(id));
  const core={schema:"altru-calibration-repair-scope/0.1",created_at:new Date().toISOString(),baseline:{id:baseline.id,fingerprint:baseline.fingerprint},source_regression:{id:before.id,fingerprint:before.fingerprint,git_commit:before.current?.project?.git_commit||null},mode,scope:{affected_ids:[...affectedSet].sort(),neighbor_ids:neighbors,check_ids:selected,domains:[...new Set(baseline.checks.filter(check=>selected.includes(check.id)).map(check=>check.domain))].sort(),check_count:selected.length}};
  return addIntegrity("SCOPE",core);
}
function assertRepairScopeIntegrity(scope){return assertArtifact(scope,"altru-calibration-repair-scope/0.1","SCOPE");}
function createRepairRun({scope,after,verification}){
  assertRepairScopeIntegrity(scope);assertRegressionIntegrity(after);assertRepairIntegrity(verification);
  if(after.baseline.fingerprint!==scope.baseline.fingerprint)throw new Error("repair run regression does not match scope baseline");
  if(verification.baseline?.fingerprint!==scope.baseline.fingerprint)throw new Error("repair verification does not match repair scope baseline");
  if(verification.after?.regression_id!==after.id)throw new Error("repair verification does not describe the supplied after regression");
  const core={schema:"altru-calibration-repair-run/0.1",created_at:after.current?.run?.completed_at||new Date().toISOString(),scope:{id:scope.id,fingerprint:scope.fingerprint,mode:scope.mode,check_count:scope.scope.check_count},current:{git_commit:after.current?.project?.git_commit||null,regression_id:after.id,regression_fingerprint:after.fingerprint},verification};return addIntegrity("RRUN",core);
}
function assertRepairRunIntegrity(run){assertArtifact(run,"altru-calibration-repair-run/0.1","RRUN");assertRepairIntegrity(run.verification);if(run.verification.after?.regression_id!==run.current?.regression_id)throw new Error("repair-run nested verification does not match current regression");return run;}
function verifyScopedRepair({scope,before,after}){assertRepairScopeIntegrity(scope);assertRegressionIntegrity(before);assertRegressionIntegrity(after);if(scope.baseline.fingerprint!==before.baseline.fingerprint||scope.baseline.fingerprint!==after.baseline.fingerprint)throw new Error("repair scope and regressions must share one baseline");return verifyRepair({before,after,scopeMode:scope.mode});}
module.exports={createRepairScope,assertRepairScopeIntegrity,createRepairRun,assertRepairRunIntegrity,verifyScopedRepair};
