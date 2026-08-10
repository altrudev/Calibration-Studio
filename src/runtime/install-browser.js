#!/usr/bin/env node
"use strict";
const path=require("node:path");
const {spawnSync}=require("node:child_process");
const {EXPECTED_PLAYWRIGHT_VERSION,browserRuntimeInfo}=require("./browser-runtime");
const packageRoot=path.dirname(require.resolve("playwright/package.json"));
const cli=path.join(packageRoot,"cli.js");
const env={...process.env,PLAYWRIGHT_BROWSERS_PATH:"0"};
console.error(`Installing Calibration Studio Chromium runtime for Playwright ${EXPECTED_PLAYWRIGHT_VERSION}...`);
const result=spawnSync(process.execPath,[cli,"install","chromium"],{stdio:"inherit",env,shell:false});
if(result.error)throw result.error;
if(result.status!==0)process.exit(result.status||1);
process.env.PLAYWRIGHT_BROWSERS_PATH="0";
const info=browserRuntimeInfo();
if(!info.chromium_installed)throw new Error("Chromium installation completed but the pinned executable was not found.");
console.log(JSON.stringify({installed:true,playwright_version:info.playwright_version},null,2));
