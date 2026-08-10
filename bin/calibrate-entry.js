#!/usr/bin/env node
"use strict";
const {BRANDING}=require("../src/public/branding");
const pkg=require("../package.json");
const {EXPECTED_PLAYWRIGHT_VERSION,browserRuntimeInfo}=require("../src/runtime/browser-runtime");
const argv=process.argv.slice(2);let allowInheritEnv=false;const filtered=[];
for(const arg of argv){if(arg==="--allow-inherit-env"){allowInheritEnv=true;continue;}filtered.push(arg);}
if(allowInheritEnv)process.env.CALIBRATION_ALLOW_INHERIT_ENV="1";
if(filtered[0]==="version"||filtered[0]==="--version"){
  let browser={playwright_version:EXPECTED_PLAYWRIGHT_VERSION,chromium_installed:false};
  try{const info=browserRuntimeInfo();browser={playwright_version:info.playwright_version,chromium_installed:info.chromium_installed};}catch{}
  process.stdout.write(`${JSON.stringify({schema:"altru-calibration-product-version/0.11",product:BRANDING.product,version:pkg.version,node:process.version,platform:process.platform,arch:process.arch,browser},null,2)}\n`);
}else{
  process.argv=[process.argv[0],require.resolve("./calibrate.js"),...filtered];
  require("./calibrate.js");
}
