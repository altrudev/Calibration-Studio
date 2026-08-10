"use strict";
const {ADAPTER_API_VERSION} = require("../../public/adapter-contract");
module.exports = Object.freeze({
  api_version: ADAPTER_API_VERSION,
  id: "browser-extension",
  type: "browser-extension",
  name: "Browser Extension",
  status: "candidate",
  capabilities: Object.freeze([
    "discover","capture","manifest","permissions","host-permissions","service-worker",
    "content-scripts","storage","runtime-errors","popup","options","api-namespace-evidence"
  ])
});
