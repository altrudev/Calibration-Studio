"use strict";
const manifest=require("./manifest");
const {discoverBrowserExtensionProject}=require("./discover");
const {contractFromDiscovery}=require("./contract");
const {captureBrowserExtension}=require("./capture");
const {createPlaywrightExtensionDriver:createBaseExtensionDriver}=require("./playwright-driver");
const {requirePinnedChromium}=require("../../runtime/browser-runtime");
function createPlaywrightExtensionDriver(){const base=createBaseExtensionDriver(requirePinnedChromium());return {id:base.id,async capture(input){const raw=await base.capture(input);return {...raw,environment:{...(raw.environment||{}),runtime:"pinned-local"}};}};}
module.exports={manifest,discoverBrowserExtensionProject,contractFromDiscovery,captureBrowserExtension,createPlaywrightExtensionDriver};
