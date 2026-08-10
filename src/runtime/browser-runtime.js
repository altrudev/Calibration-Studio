"use strict";
const fs=require("node:fs");
const path=require("node:path");
const EXPECTED_PLAYWRIGHT_VERSION="1.62.1";
function localBrowsersPath(){return path.join(path.dirname(require.resolve("playwright-core/package.json")),".local-browsers");}
function loadPinnedPlaywright(injected=null){
  if(injected)return injected;
  if(!process.env.PLAYWRIGHT_BROWSERS_PATH)process.env.PLAYWRIGHT_BROWSERS_PATH="0";
  let runtime;
  try{runtime=require("playwright");}catch(error){const wrapped=new Error(`Calibration Studio requires pinned Playwright ${EXPECTED_PLAYWRIGHT_VERSION}. Run 'npm install' during product setup.`);wrapped.cause=error;throw wrapped;}
  const actual=require("playwright/package.json").version;
  if(actual!==EXPECTED_PLAYWRIGHT_VERSION)throw new Error(`Unsupported Playwright version ${actual}; Calibration Studio requires exactly ${EXPECTED_PLAYWRIGHT_VERSION}.`);
  return runtime;
}
function browserRuntimeInfo(runtime=null){
  const playwright=runtime||loadPinnedPlaywright();
  const executable=playwright.chromium.executablePath();
  return {playwright_version:runtime?"injected":require("playwright/package.json").version,chromium_executable:executable,chromium_installed:Boolean(executable&&fs.existsSync(executable)),browser_store:localBrowsersPath()};
}
function requirePinnedChromium(runtime=null){const playwright=runtime||loadPinnedPlaywright();const info=browserRuntimeInfo(playwright);if(!info.chromium_installed)throw new Error("Pinned Chromium runtime is not installed. Run 'npm run runtime:install-browser' during product installation or packaging; Calibration Studio never downloads browser executables during calibration.");return playwright;}
module.exports={EXPECTED_PLAYWRIGHT_VERSION,browserRuntimeInfo,loadPinnedPlaywright,localBrowsersPath,requirePinnedChromium};
