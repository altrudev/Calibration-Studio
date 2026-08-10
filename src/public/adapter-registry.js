"use strict";
const {ADAPTER_API_VERSION,validateAdapterManifest}=require("./adapter-contract");
const manifests=Object.freeze([
  {api_version:ADAPTER_API_VERSION,id:"web-pwa",type:"web-pwa",name:"Web / PWA",status:"candidate",capabilities:["discover","capture","offline-probe","storage","service-worker","network","console","timing","pinned-local-chromium"]},
  {api_version:ADAPTER_API_VERSION,id:"browser-extension",type:"browser-extension",name:"Browser Extension",status:"candidate",capabilities:["discover","capture","manifest","permissions","host-permissions","service-worker","content-scripts","storage","runtime-errors","popup","options","api-namespace-evidence","pinned-local-chromium"]},
  {api_version:ADAPTER_API_VERSION,id:"api",type:"api",name:"API / Backend",status:"candidate",capabilities:["discover","capture","http","openapi-json","openapi-yaml","authorization-evidence","status","content-type","response-shape","timing","effectful-guard","postcondition-verification"]},
  {api_version:ADAPTER_API_VERSION,id:"cli",type:"cli",name:"CLI",status:"candidate",capabilities:["discover","capture","process","arguments","exit-code","stdout-metadata","stderr-metadata","filesystem-watch","timing","isolated-home","workspace-copy","no-shell","tty","service-orchestration","container-sandbox"]},
  {api_version:ADAPTER_API_VERSION,id:"game",type:"game",name:"Game",status:"candidate",capabilities:["capture","developer-plan","browser-bridge","isolated-context","scenario-replay","save-state","economy","inventory","progression","story-state","timing","history","long-run-drift","pinned-local-chromium"]},
  {api_version:ADAPTER_API_VERSION,id:"desktop",type:"desktop",name:"Desktop",status:"planned",capabilities:["process","filesystem","persistence","ipc","updates"]},
  {api_version:ADAPTER_API_VERSION,id:"android",type:"android",name:"Android",status:"planned",capabilities:["adb","lifecycle","permissions","storage","network","background-work"]},
  {api_version:ADAPTER_API_VERSION,id:"service",type:"service",name:"Service / Distributed System",status:"planned",capabilities:["traces","queues","databases","retries","consistency","deployment-drift"]},
  {api_version:ADAPTER_API_VERSION,id:"custom",type:"custom",name:"Custom Adapter SDK",status:"planned",capabilities:["observe","act","snapshot","measure","reset","environment"]}
]);
for(const manifest of manifests)validateAdapterManifest(manifest);
function listAdapters(){return manifests.map((item)=>({...item,capabilities:[...item.capabilities]}));}
function getAdapter(id){return listAdapters().find((item)=>item.id===id)||null;}
module.exports={getAdapter,listAdapters};
