#!/usr/bin/env node
"use strict";
const {browserRuntimeInfo}=require("./browser-runtime");
const info=browserRuntimeInfo();
if(!info.chromium_installed){console.error("Pinned Chromium runtime is missing.");process.exit(1);}
console.log(JSON.stringify({playwright_version:info.playwright_version,chromium_installed:true},null,2));
