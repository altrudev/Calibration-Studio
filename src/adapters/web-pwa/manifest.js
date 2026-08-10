"use strict";
const {ADAPTER_API_VERSION} = require("../../public/adapter-contract");
module.exports = Object.freeze({
  api_version: ADAPTER_API_VERSION,
  id: "web-pwa",
  type: "web-pwa",
  name: "Web / PWA",
  status: "candidate",
  capabilities: Object.freeze(["discover","capture","offline-probe","storage","service-worker","network","console","timing"])
});
