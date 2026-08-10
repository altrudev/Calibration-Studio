"use strict";
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");

const MANIFEST_NAME="calibration-release-manifest.json";
const SIGNATURE_NAME="calibration-release-signature.json";
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==="object")return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));return value;}
function canonical(value){return JSON.stringify(stable(value));}
function sha256(value){return crypto.createHash("sha256").update(Buffer.isBuffer(value)?value:typeof value==="string"?value:canonical(value)).digest("hex");}
function relative(root,full){return path.relative(root,full).split(path.sep).join("/");}
function excluded(rel){return rel===".git"||rel.startsWith(".git/")||rel===MANIFEST_NAME||rel===SIGNATURE_NAME;}
function assertSafeRelativePath(value,label="release file"){
  if(typeof value!=="string"||!value)throw new Error(`${label} path must be a non-empty relative path`);
  if(value.includes("\\")||path.posix.isAbsolute(value)||path.win32.isAbsolute(value))throw new Error(`${label} path must be a canonical relative POSIX path`);
  const parts=value.split("/");if(parts.some(part=>!part||part==="."||part===".."))throw new Error(`${label} path contains unsafe traversal or empty segments`);
  if(path.posix.normalize(value)!==value)throw new Error(`${label} path is not canonical`);
  return value;
}
function assertFileRecords(files){
  if(!Array.isArray(files)||!files.length)throw new Error("release manifest must contain at least one file");const seen=new Set();
  for(const item of files){if(!item||typeof item!=="object")throw new Error("release manifest file record is invalid");const rel=assertSafeRelativePath(item.path);if(seen.has(rel))throw new Error(`release manifest contains duplicate path '${rel}'`);seen.add(rel);if(!Number.isInteger(item.size)||item.size<0)throw new Error(`release file '${rel}' has invalid size`);if(typeof item.sha256!=="string"||!/^[a-f0-9]{64}$/i.test(item.sha256))throw new Error(`release file '${rel}' has invalid sha256`);}
}
function walk(root,dir=root){
  const files=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
    const full=path.join(dir,entry.name),rel=relative(root,full);if(excluded(rel))continue;
    const stat=fs.lstatSync(full);if(stat.isSymbolicLink())throw new Error(`Release tree contains forbidden symlink '${rel}'`);
    if(stat.isDirectory())files.push(...walk(root,full));else if(stat.isFile())files.push(rel);else throw new Error(`Release tree contains unsupported filesystem entry '${rel}'`);
  }
  return files;
}
function fileRecord(root,rel){assertSafeRelativePath(rel);const data=fs.readFileSync(path.join(root,...rel.split("/")));return{path:rel,size:data.length,sha256:sha256(data)};}
function fingerprintCore(manifest){const core={...manifest};delete core.id;delete core.fingerprint;if(manifest.schema==="altru-calibration-release-manifest/0.2")delete core.created_at;return core;}
function addIntegrity(core){const fingerprint=sha256(fingerprintCore(core));return{...core,id:`RELEASE-${fingerprint.slice(0,12).toUpperCase()}`,fingerprint};}
function assertReleaseManifest(manifest){
  if(!manifest||!["altru-calibration-release-manifest/0.1","altru-calibration-release-manifest/0.2"].includes(manifest.schema))throw new Error("Expected altru-calibration-release-manifest/0.1 or /0.2");
  assertFileRecords(manifest.files);if(manifest.schema==="altru-calibration-release-manifest/0.2"&&typeof manifest.created_at!=="string")throw new Error("Release manifest v0.2 requires created_at metadata");
  const fingerprint=sha256(fingerprintCore(manifest));if(manifest.fingerprint!==fingerprint)throw new Error("Release manifest fingerprint mismatch");if(manifest.id!==`RELEASE-${fingerprint.slice(0,12).toUpperCase()}`)throw new Error("Release manifest id mismatch");return manifest;
}
function createReleaseManifest({rootDir,version,platform=process.platform,arch=process.arch,runtime=null,createdAt=new Date().toISOString(),schema="altru-calibration-release-manifest/0.2"}){
  const root=path.resolve(rootDir);if(!fs.existsSync(root)||!fs.statSync(root).isDirectory())throw new Error("release root must be a directory");if(typeof version!=="string"||!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version))throw new Error("release version must be a semantic version string");
  if(runtime?.browser&&runtime.browser.chromium_installed!==true)throw new Error("release manifest requires the pinned Chromium runtime to be installed");if(!["altru-calibration-release-manifest/0.1","altru-calibration-release-manifest/0.2"].includes(schema))throw new Error("unsupported release manifest schema");
  const files=walk(root).map(rel=>fileRecord(root,rel));if(!files.length)throw new Error("release root contains no package files");
  return addIntegrity({schema,created_at:createdAt,product:"Calibration Studio",version,platform,arch,runtime:runtime||null,files});
}
function writeReleaseManifest({rootDir,version,platform,arch,runtime,outputFile=null,createdAt,schema}){const root=path.resolve(rootDir);const target=path.resolve(outputFile||path.join(root,MANIFEST_NAME));const rel=path.relative(root,target);const inside=rel===""||(!rel.startsWith(`..${path.sep}`)&&rel!==".."&&!path.isAbsolute(rel));if(inside&&path.basename(target)!==MANIFEST_NAME)throw new Error(`release manifest inside the staged tree must be named ${MANIFEST_NAME}`);const manifest=createReleaseManifest({rootDir:root,version,platform,arch,runtime,createdAt,schema});fs.writeFileSync(target,`${JSON.stringify(manifest,null,2)}\n`,"utf8");return manifest;}
function verifyReleaseTree({rootDir,manifest}){
  assertReleaseManifest(manifest);const root=path.resolve(rootDir);const actual=walk(root);const declared=manifest.files.map(item=>item.path).sort();if(JSON.stringify(actual.sort())!==JSON.stringify(declared))throw new Error("Release tree contains missing or unlisted files");
  for(const item of manifest.files){const current=fileRecord(root,item.path);if(current.size!==item.size||current.sha256!==item.sha256)throw new Error(`Release file integrity mismatch: ${item.path}`);}return{schema:"altru-calibration-release-verification/0.1",status:"verified",release_id:manifest.id,fingerprint:manifest.fingerprint,version:manifest.version,file_count:manifest.files.length};
}
function keyObject(pem,type){const key=type==="private"?crypto.createPrivateKey(pem):crypto.createPublicKey(pem);if(key.asymmetricKeyType!=="ed25519")throw new Error("Calibration Studio release signing requires an Ed25519 key");return key;}
function signReleaseManifest({manifest,privateKeyPem}){assertReleaseManifest(manifest);const privateKey=keyObject(privateKeyPem,"private");const signature=crypto.sign(null,Buffer.from(manifest.fingerprint,"utf8"),privateKey).toString("base64");return{schema:"altru-calibration-release-signature/0.1",algorithm:"Ed25519",release_id:manifest.id,manifest_fingerprint:manifest.fingerprint,signature};}
function verifyReleaseSignature({manifest,signature,publicKeyPem}){
  assertReleaseManifest(manifest);if(!signature||signature.schema!=="altru-calibration-release-signature/0.1"||signature.algorithm!=="Ed25519")throw new Error("Invalid Calibration Studio release signature envelope");if(signature.release_id!==manifest.id||signature.manifest_fingerprint!==manifest.fingerprint)throw new Error("Release signature does not match manifest");const publicKey=keyObject(publicKeyPem,"public");const ok=crypto.verify(null,Buffer.from(manifest.fingerprint,"utf8"),publicKey,Buffer.from(signature.signature,"base64"));if(!ok)throw new Error("Release signature verification failed");return{schema:"altru-calibration-release-signature-verification/0.1",status:"verified",release_id:manifest.id,fingerprint:manifest.fingerprint,algorithm:"Ed25519"};
}
module.exports={MANIFEST_NAME,SIGNATURE_NAME,createReleaseManifest,writeReleaseManifest,assertReleaseManifest,verifyReleaseTree,signReleaseManifest,verifyReleaseSignature,assertSafeRelativePath,sha256,fingerprintCore};
