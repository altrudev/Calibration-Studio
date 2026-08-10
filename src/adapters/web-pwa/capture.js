"use strict";
const {createObservation, normalizeObservationSet} = require("../../public/adapter-contract");

function evidence(type, source, summary, value = null) { return {type, source, summary, value}; }

async function captureWebPwa({url, driver, options = {}}) {
  if (!url || typeof url !== "string") throw new Error("capture requires a URL");
  if (!driver || typeof driver.capture !== "function") throw new Error("capture requires a compatible browser driver");
  const startedAt = new Date().toISOString();
  const raw = await driver.capture({url, options});
  const env = raw.environment || {};
  const observations = [];

  observations.push(createObservation({id:"web-navigation-status",adapter:"web-pwa",kind:"behavior",source:"browser",value:Number(raw.status||0),evidence:[evidence("http","navigation",`Navigation returned HTTP ${raw.status}`,Number(raw.status||0))],environment:env}));
  observations.push(createObservation({id:"page-loads",adapter:"web-pwa",kind:"behavior",source:"browser",value:raw.status >= 200 && raw.status < 400,evidence:[evidence("http","navigation",`Navigation returned HTTP ${raw.status}`,raw.status)],environment:env}));
  observations.push(createObservation({id:"mobile-viewport",adapter:"web-pwa",kind:"environment",source:"dom",value:Boolean(raw.viewportMeta),evidence:[evidence("dom","meta[name=viewport]",raw.viewportMeta ? "Viewport metadata found" : "Viewport metadata not found",raw.viewportMeta || null)],environment:env}));
  observations.push(createObservation({id:"manifest-present",adapter:"web-pwa",kind:"behavior",source:"browser",value:Boolean(raw.manifest),evidence:[evidence("manifest",raw.manifestUrl || "document",raw.manifest ? "Manifest loaded" : "Manifest not loaded",raw.manifest || null)],environment:env}));
  observations.push(createObservation({id:"service-worker-active",adapter:"web-pwa",kind:"state",source:"service-worker",value:Array.isArray(raw.serviceWorkers) && raw.serviceWorkers.length > 0,evidence:[evidence("service-worker","navigator.serviceWorker",`${(raw.serviceWorkers || []).length} registration(s) observed`,raw.serviceWorkers || [])],environment:env}));
  observations.push(createObservation({id:"console-errors",adapter:"web-pwa",kind:"behavior",source:"console",value:(raw.consoleErrors || []).length,evidence:(raw.consoleErrors || []).map((message) => evidence("console","page",message)),environment:env}));
  observations.push(createObservation({id:"failed-requests",adapter:"web-pwa",kind:"resources",source:"network",value:(raw.failedRequests || []).length,evidence:(raw.failedRequests || []).map((item) => evidence("network",item.url || "request",item.error || "Request failed",item)),environment:env}));
  observations.push(createObservation({id:"local-storage-keys",adapter:"web-pwa",kind:"state",source:"storage",value:Object.keys(raw.localStorage || {}).sort(),evidence:[evidence("storage","localStorage","Captured localStorage keys",Object.keys(raw.localStorage || {}).sort())],environment:env}));
  observations.push(createObservation({id:"indexeddb-databases",adapter:"web-pwa",kind:"state",source:"storage",value:(raw.indexedDb || []).map((db) => db.name).filter(Boolean).sort(),evidence:[evidence("storage","indexedDB","Captured IndexedDB database names",raw.indexedDb || [])],environment:env}));
  observations.push(createObservation({id:"load-duration-ms",adapter:"web-pwa",kind:"timing",source:"performance",value:Number(raw.loadDurationMs || 0),evidence:[evidence("timing","performance",`Load duration ${Number(raw.loadDurationMs || 0)} ms`,Number(raw.loadDurationMs || 0))],environment:env}));

  if (raw.offline) {
    observations.push(createObservation({id:"offline-reload",adapter:"web-pwa",kind:"behavior",source:"browser-offline",value:Boolean(raw.offline.loaded),evidence:[evidence("offline","browser",raw.offline.loaded ? "Offline reload completed" : "Offline reload failed",raw.offline)],environment:env}));
  }

  return normalizeObservationSet({adapter:"web-pwa",started_at:startedAt,completed_at:new Date().toISOString(),observations});
}

module.exports = {captureWebPwa};
