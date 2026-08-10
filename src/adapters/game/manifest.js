"use strict";
const {ADAPTER_API_VERSION}=require("../../public/adapter-contract");
module.exports=Object.freeze({
  api_version:ADAPTER_API_VERSION,
  id:"game",
  type:"game",
  name:"Game",
  status:"candidate",
  capabilities:Object.freeze([
    "capture","developer-plan","browser-bridge","isolated-context","scenario-replay",
    "save-state","economy","inventory","progression","story-state","timing","history","long-run-drift"
  ])
});
