"use strict";
const {createObservation,normalizeObservationSet}=require("../../public/adapter-contract");
const {sanitizeEvidence}=require("../../public/redaction");
const {discoverBrowserExtensionProject,sortedUnique}=require("./discover");
function evidence(type,source,summary,value=null){return {type,source,summary,value};}

async function captureBrowserExtension({projectDir,driver,options={}}){
  if(!projectDir||typeof projectDir!=="string")throw new Error("capture requires an extension project directory");
  if(!driver||typeof driver.capture!=="function")throw new Error("capture requires a compatible extension driver");
  const discovery=discoverBrowserExtensionProject(projectDir);const startedAt=new Date().toISOString();
  const raw=await driver.capture({extensionPath:discovery.extension_root,options});
  const env={...(raw.environment||{}),manifest_version:discovery.manifest.manifest_version};const observations=[];
  const add=input=>observations.push(createObservation({adapter:"browser-extension",environment:env,...input}));
  add({id:"extension-loads",kind:"behavior",source:"browser-extension-runtime",value:Boolean(raw.loaded),evidence:[evidence("extension-runtime","chromium",raw.loaded?"Extension loaded":"Extension did not load",{extension_id:raw.extensionId||null})]});
  add({id:"manifest-version",kind:"history",source:"manifest",value:discovery.manifest.manifest_version,evidence:[evidence("manifest",discovery.files.manifest,"Manifest version",discovery.manifest.manifest_version)]});
  add({id:"declared-permissions",kind:"permissions",source:"manifest",value:discovery.permissions.declared,evidence:[evidence("manifest-permissions",discovery.files.manifest,"Declared API permissions",discovery.permissions.declared)]});
  add({id:"declared-host-permissions",kind:"permissions",source:"manifest",value:discovery.permissions.host,evidence:[evidence("manifest-host-permissions",discovery.files.manifest,"Declared host permissions",discovery.permissions.host)]});
  add({id:"declared-files-present",kind:"resources",source:"package",value:discovery.files.missing.length===0,evidence:[evidence("package-files",discovery.files.manifest,`${discovery.files.missing.length} manifest-declared file(s) missing`,discovery.files.missing)]});
  add({id:"remote-code-references",kind:"security",source:"static-scan",value:discovery.source_scan.remote_executable_references,evidence:[evidence("source-scan",discovery.extension_root,"Remote executable-code reference scan",discovery.source_scan.remote_executable_references)]});
  add({id:"api-namespaces-observed",kind:"permissions",source:"static-scan",value:discovery.source_scan.api_namespaces,evidence:[evidence("api-namespace-scan",discovery.extension_root,"Observed chrome/browser API namespaces. This is evidence only, not a permission-necessity verdict.",discovery.source_scan.api_namespaces)]});
  add({id:"dynamic-code-patterns",kind:"security",source:"static-scan",value:discovery.source_scan.dynamic_code_patterns,evidence:[evidence("source-scan",discovery.extension_root,"Potential dynamic-code patterns for developer review",discovery.source_scan.dynamic_code_patterns)]});
  if(discovery.manifest.service_worker)add({id:"extension-service-worker-active",kind:"state",source:"extension-service-worker",value:Array.isArray(raw.serviceWorkers)&&raw.serviceWorkers.length>0,evidence:[evidence("service-worker","browser-context",`${(raw.serviceWorkers||[]).length} extension service worker(s) observed`,sanitizeEvidence(raw.serviceWorkers||[]))]});
  add({id:"runtime-granted-permissions",kind:"permissions",source:"chrome.permissions",value:sortedUnique(raw.grantedPermissions?.permissions),evidence:[evidence("runtime-permissions","chrome.permissions.getAll","Runtime-granted API permissions",sortedUnique(raw.grantedPermissions?.permissions))]});
  add({id:"runtime-granted-origins",kind:"permissions",source:"chrome.permissions",value:sortedUnique(raw.grantedPermissions?.origins),evidence:[evidence("runtime-origins","chrome.permissions.getAll","Runtime-granted host origins",sortedUnique(raw.grantedPermissions?.origins))]});
  const safeErrors=sanitizeEvidence(raw.errors||[]);
  add({id:"extension-errors",kind:"behavior",source:"browser-runtime",value:safeErrors.length,evidence:safeErrors.map(item=>evidence("runtime-error",item.source||"extension",item.message||String(item),item))});
  for(const area of ["local","sync","session"]){const keys=sortedUnique(raw.storageKeys?.[area]);add({id:`storage-${area}-keys`,kind:"state",source:`chrome.storage.${area}`,value:keys,evidence:[evidence("storage-keys",`chrome.storage.${area}`,`Captured ${area} storage key topology without values`,keys)]});}
  if(discovery.manifest.popup)add({id:"popup-loads",kind:"behavior",source:"extension-page",value:Boolean(raw.popup?.loaded),evidence:[evidence("extension-page",discovery.manifest.popup,raw.popup?.loaded?"Popup loaded":"Popup failed to load",sanitizeEvidence(raw.popup||null))]});
  if(discovery.manifest.options)add({id:"options-loads",kind:"behavior",source:"extension-page",value:Boolean(raw.options?.loaded),evidence:[evidence("extension-page",discovery.manifest.options,raw.options?.loaded?"Options page loaded":"Options page failed to load",sanitizeEvidence(raw.options||null))]});
  const safeScripts=sanitizeEvidence(raw.dynamicContentScripts||[]);
  add({id:"dynamic-content-scripts",kind:"state",source:"chrome.scripting",value:safeScripts.map(x=>({id:x.id||null,matches:sortedUnique(x.matches),world:x.world||null})),evidence:[evidence("content-scripts","chrome.scripting.getRegisteredContentScripts","Dynamically registered content scripts",safeScripts)]});
  if(raw.targetPage){const safeTarget=sanitizeEvidence(raw.targetPage);add({id:"target-page-loads",kind:"environment",source:"browser",value:Boolean(safeTarget.loaded),evidence:[evidence("target-page",safeTarget.url||"target",safeTarget.loaded?"Target page loaded":"Target page failed to load",safeTarget)]});}
  return normalizeObservationSet({adapter:"browser-extension",started_at:startedAt,completed_at:new Date().toISOString(),observations});
}
module.exports={captureBrowserExtension};
