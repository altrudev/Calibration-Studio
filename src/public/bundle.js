"use strict";
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const {redact,profile}=require("./redaction");
const {assertBaselineIntegrity,assertRegressionIntegrity,assertHistoryIntegrity,assertRepairIntegrity}=require("./lifecycle");
const {assertTraceIntegrity}=require("./historical-tracing");
const {assertRepairScopeIntegrity,assertRepairRunIntegrity}=require("./repair-scope");
const {assertGateIntegrity}=require("./continuous");

function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==="object")return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));return value;}
function canonical(value){return JSON.stringify(stable(value));}
function sha256(value){return crypto.createHash("sha256").update(Buffer.isBuffer(value)?value:typeof value==="string"?value:canonical(value)).digest("hex");}
function safeName(value){return String(value||"artifact").replace(/[^A-Za-z0-9._-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,96)||"artifact";}
function json(value){return `${JSON.stringify(value,null,2)}\n`;}
function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[ch]);}
function assertSafeBundlePath(value){
  if(typeof value!=="string"||!value)throw new Error("bundle file path must be a non-empty relative path");
  if(value.includes("\\")||path.posix.isAbsolute(value)||path.win32.isAbsolute(value))throw new Error("bundle file path must be a canonical relative POSIX path");
  const parts=value.split("/");if(parts.some(part=>!part||part==="."||part===".."))throw new Error("bundle file path contains unsafe traversal or empty segments");
  if(path.posix.normalize(value)!==value)throw new Error("bundle file path is not canonical");return value;
}
function assertBundleFileRecords(files){
  if(!Array.isArray(files)||!files.length)throw new Error("bundle manifest must contain at least one file");const seen=new Set();
  for(const item of files){if(!item||typeof item!=="object")throw new Error("bundle manifest file record is invalid");const rel=assertSafeBundlePath(item.path);if(seen.has(rel))throw new Error(`bundle manifest contains duplicate path '${rel}'`);seen.add(rel);if(!Number.isInteger(item.size)||item.size<0)throw new Error(`bundle file '${rel}' has invalid size`);if(typeof item.sha256!=="string"||!/^[a-f0-9]{64}$/i.test(item.sha256))throw new Error(`bundle file '${rel}' has invalid sha256`);}
}

function verifyArtifact(value){
  switch(value?.schema){
    case"altru-calibration-report/0.1":if(!Array.isArray(value.findings)||!value.calibration)throw new Error("Invalid calibration report");return value;
    case"altru-calibration-baseline/0.1":return assertBaselineIntegrity(value);
    case"altru-calibration-regression/0.1":case"altru-calibration-regression/0.2":return assertRegressionIntegrity(value);
    case"altru-calibration-history/0.1":return assertHistoryIntegrity(value);
    case"altru-calibration-repair/0.1":case"altru-calibration-repair/0.2":return assertRepairIntegrity(value);
    case"altru-calibration-trace/0.1":return assertTraceIntegrity(value);
    case"altru-calibration-repair-scope/0.1":return assertRepairScopeIntegrity(value);
    case"altru-calibration-repair-run/0.1":return assertRepairRunIntegrity(value);
    case"altru-calibration-gate/0.1":return assertGateIntegrity(value);
    default:throw new Error(`Unsupported Calibration Studio artifact schema '${value?.schema||"unknown"}'`);
  }
}

function artifactSummary(value){
  const project=value.project?.name||value.current?.project?.name||value.regression?.current?.project?.name||null;
  const status=value.calibration?.status||value.regression?.status||value.history?.status||value.repair?.status||value.trace?.status||value.decision?.status||null;
  return{schema:value.schema,id:value.id||value.run?.id||null,fingerprint:value.fingerprint||null,project,status};
}

function summaryHtml(privacyProfile,sources){
  const rows=sources.map(item=>`<tr><td>${escapeHtml(item.schema)}</td><td>${escapeHtml(item.id||"—")}</td><td>${escapeHtml(item.project||"—")}</td><td>${escapeHtml(item.status||"—")}</td></tr>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Calibration Studio Bundle</title><style>body{font:16px system-ui,sans-serif;max-width:980px;margin:40px auto;padding:0 20px;color:#171717}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:8px;text-align:left}.meta{color:#555}</style></head><body><h1>Calibration Studio Bundle</h1><p class="meta">Privacy profile: ${escapeHtml(privacyProfile)} · artifacts: ${sources.length}</p><table><thead><tr><th>Schema</th><th>Source ID</th><th>Project</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table><p>The authoritative bundle ID and fingerprint are stored in <code>manifest.json</code>. Verify the bundle before relying on its contents.</p><footer><p><strong>Built with DDC</strong> · Developed by Altru.dev · © 2026 Altru.dev. All rights reserved.</p></footer></body></html>\n`;
}

function listFiles(root,relative=""){
  const dir=path.join(root,relative);const out=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
    const rel=path.posix.join(relative.replaceAll(path.sep,"/"),entry.name);
    const full=path.join(root,...rel.split("/"));
    const stat=fs.lstatSync(full);if(stat.isSymbolicLink())throw new Error(`Bundle contains forbidden symlink '${rel}'`);
    if(stat.isDirectory())out.push(...listFiles(root,rel));else if(stat.isFile())out.push(rel);else throw new Error(`Bundle contains unsupported filesystem entry '${rel}'`);
  }
  return out;
}

function fileRecord(root,rel){assertSafeBundlePath(rel);const data=fs.readFileSync(path.join(root,...rel.split("/")));return{path:rel,size:data.length,sha256:sha256(data)};}
function addIntegrity(core){const fingerprint=sha256(core);return{...core,id:`BUNDLE-${fingerprint.slice(0,12).toUpperCase()}`,fingerprint};}
function assertBundleManifest(manifest){if(!manifest||manifest.schema!=="altru-calibration-bundle/0.1")throw new Error("Expected altru-calibration-bundle/0.1");assertBundleFileRecords(manifest.files);if(!Array.isArray(manifest.source_artifacts))throw new Error("Calibration bundle source_artifacts must be an array");const core={...manifest};delete core.id;delete core.fingerprint;const fingerprint=sha256(core);if(manifest.fingerprint!==fingerprint)throw new Error("Calibration bundle manifest fingerprint mismatch");if(manifest.id!==`BUNDLE-${fingerprint.slice(0,12).toUpperCase()}`)throw new Error("Calibration bundle manifest id mismatch");return manifest;}

function createBundle({artifactFiles,outputDir,privacyProfile="sanitized"}){
  if(!Array.isArray(artifactFiles)||!artifactFiles.length)throw new Error("bundle requires at least one artifact file");profile(privacyProfile);
  const root=path.resolve(outputDir);if(fs.existsSync(root)&&fs.readdirSync(root).length)throw new Error("bundle output directory must not already contain files");fs.mkdirSync(path.join(root,"artifacts"),{recursive:true});
  const sources=[];
  artifactFiles.forEach((file,index)=>{
    const value=JSON.parse(fs.readFileSync(path.resolve(file),"utf8"));verifyArtifact(value);const source=artifactSummary(value);sources.push(source);
    const payload=redact(value,privacyProfile);const wrapper={schema:"altru-calibration-bundle-artifact/0.1",source,privacy_profile:privacyProfile,payload_fingerprint:sha256(payload),payload};
    const name=`${String(index+1).padStart(2,"0")}-${safeName(source.id||source.schema)}.json`;fs.writeFileSync(path.join(root,"artifacts",name),json(wrapper),"utf8");
  });
  fs.writeFileSync(path.join(root,"README.txt"),`Calibration Studio Bundle\nPrivacy profile: ${privacyProfile}\nArtifacts: ${sources.length}\nVerify with: calibrate verify-bundle --bundle ${root}\n\nBuilt with DDC\nDeveloped by Altru.dev\n© 2026 Altru.dev. All rights reserved.\n`,"utf8");
  fs.writeFileSync(path.join(root,"summary.html"),summaryHtml(privacyProfile,sources),"utf8");
  const files=listFiles(root).filter(rel=>rel!=="manifest.json").map(rel=>fileRecord(root,rel));
  const manifest=addIntegrity({schema:"altru-calibration-bundle/0.1",created_at:new Date().toISOString(),privacy_profile:privacyProfile,source_artifacts:sources,files});
  fs.writeFileSync(path.join(root,"manifest.json"),json(manifest),"utf8");return manifest;
}

function verifyBundle(bundleDir){
  const root=path.resolve(bundleDir);const manifestPath=path.join(root,"manifest.json");if(!fs.existsSync(manifestPath))throw new Error("Calibration bundle is missing manifest.json");const manifest=assertBundleManifest(JSON.parse(fs.readFileSync(manifestPath,"utf8")));
  const actual=listFiles(root).filter(rel=>rel!=="manifest.json");const declared=manifest.files.map(item=>item.path).sort();if(JSON.stringify(actual.sort())!==JSON.stringify(declared))throw new Error("Calibration bundle contains missing or unlisted files");
  for(const item of manifest.files){const current=fileRecord(root,item.path);if(current.size!==item.size||current.sha256!==item.sha256)throw new Error(`Calibration bundle file integrity mismatch: ${item.path}`);}
  for(const rel of actual.filter(item=>item.startsWith("artifacts/")&&item.endsWith(".json"))){const wrapper=JSON.parse(fs.readFileSync(path.join(root,...rel.split("/")),"utf8"));if(wrapper.schema!=="altru-calibration-bundle-artifact/0.1")throw new Error(`Invalid bundled artifact wrapper: ${rel}`);if(wrapper.payload_fingerprint!==sha256(wrapper.payload))throw new Error(`Bundled artifact payload fingerprint mismatch: ${rel}`);}
  return{schema:"altru-calibration-bundle-verification/0.1",status:"verified",bundle_id:manifest.id,fingerprint:manifest.fingerprint,privacy_profile:manifest.privacy_profile,file_count:manifest.files.length,artifact_count:manifest.source_artifacts.length};
}

module.exports={createBundle,verifyBundle,verifyArtifact,assertBundleManifest,assertSafeBundlePath,sha256};
