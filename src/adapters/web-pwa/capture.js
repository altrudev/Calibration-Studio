"use strict";
const {createObservation,normalizeObservationSet}=require("../../public/adapter-contract");
const {sanitizeEvidence}=require("../../public/redaction");
function evidence(type,source,summary,value=null){return {type,source,summary,value};}
async function captureWebPwa({url,driver,options={}}){
  if(!url||typeof url!=="string")throw new Error("capture requires a URL");
  if(!driver||typeof driver.capture!=="function")throw new Error("capture requires a compatible browser driver");
  const startedAt=new Date().toISOString();const raw=await driver.capture({url,options});const env=raw.environment||{};const observations=[];
  const manifest=sanitizeEvidence(raw.manifest||null);const manifestUrl=sanitizeEvidence(raw.manifestUrl||null);const serviceWorkers=sanitizeEvidence(raw.serviceWorkers||[]);const consoleErrors=sanitizeEvidence(raw.consoleErrors||[]);const failedRequests=sanitizeEvidence(raw.failedRequests||[]);const offline=sanitizeEvidence(raw.offline||null);
  observations.push(createObservation({id:"web-navigation-status",adapter:"web-pwa",kind:"behavior",source:"browser",value:Number(raw.status||0),evidence:[evidence("http","navigation",`Navigation returned HTTP ${raw.status}`,Number(raw.status||0))],environment:env}));
  observations.push(createObservation({id:"page-loads",adapter:"web-pwa",kind:"behavior",source:"browser",value:raw.status>=200&&raw.status<400,evidence:[evidence("http","navigation",`Navigation returned HTTP ${raw.status}`,raw.status)],environment:env}));
  observations.push(createObservation({id:"mobile-viewport",adapter:"web-pwa",kind:"environment",source:"dom",value:Boolean(raw.viewportMeta),evidence:[evidence("dom","meta[name=viewport]",raw.viewportMeta?"Viewport metadata found":"Viewport metadata not found",sanitizeEvidence(raw.viewportMeta||null))],environment:env}));
  observations.push(createObservation({id:"manifest-present",adapter:"web-pwa",kind:"behavior",source:"browser",value:Boolean(manifest),evidence:[evidence("manifest",manifestUrl||"document",manifest?"Manifest loaded":"Manifest not loaded",manifest)],environment:env}));
  observations.push(createObservation({id:"service-worker-active",adapter:"web-pwa",kind:"state",source:"service-worker",value:serviceWorkers.length>0,evidence:[evidence("service-worker","navigator.serviceWorker",`${serviceWorkers.length} registration(s) observed`,serviceWorkers)],environment:env}));
  observations.push(createObservation({id:"console-errors",adapter:"web-pwa",kind:"behavior",source:"console",value:consoleErrors.length,evidence:consoleErrors.map(message=>evidence("console","page",String(message))),environment:env}));
  observations.push(createObservation({id:"failed-requests",adapter:"web-pwa",kind:"resources",source:"network",value:failedRequests.length,evidence:failedRequests.map(item=>evidence("network",item.url||"request",item.error||"Request failed",item)),environment:env}));
  const localStorageKeys=Object.keys(raw.localStorage||{}).sort();observations.push(createObservation({id:"local-storage-keys",adapter:"web-pwa",kind:"state",source:"storage",value:localStorageKeys,evidence:[evidence("storage","localStorage","Captured localStorage keys",localStorageKeys)],environment:env}));
  const dbNames=(raw.indexedDb||[]).map(db=>db.name).filter(Boolean).sort();observations.push(createObservation({id:"indexeddb-databases",adapter:"web-pwa",kind:"state",source:"storage",value:dbNames,evidence:[evidence("storage","indexedDB","Captured IndexedDB database names",sanitizeEvidence(raw.indexedDb||[]))],environment:env}));
  observations.push(createObservation({id:"load-duration-ms",adapter:"web-pwa",kind:"timing",source:"performance",value:Number(raw.loadDurationMs||0),evidence:[evidence("timing","performance",`Load duration ${Number(raw.loadDurationMs||0)} ms`,Number(raw.loadDurationMs||0))],environment:env}));
  if(offline)observations.push(createObservation({id:"offline-reload",adapter:"web-pwa",kind:"behavior",source:"browser-offline",value:Boolean(offline.loaded),evidence:[evidence("offline","browser",offline.loaded?"Offline reload completed":"Offline reload failed",offline)],environment:env}));
  return normalizeObservationSet({adapter:"web-pwa",started_at:startedAt,completed_at:new Date().toISOString(),observations});
}
module.exports={captureWebPwa};
