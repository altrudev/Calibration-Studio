"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
function loadPlaywright() {
  try { return require("playwright"); }
  catch (error) {
    const wrapped = new Error("Live Browser Extension capture requires the bundled Playwright Chromium runtime. Production packaging must ship a pinned local Playwright/Chromium build.");
    wrapped.cause = error;
    throw wrapped;
  }
}
function errorRecord(source, error) { return {source,message:error?.message || String(error)}; }
function createPlaywrightExtensionDriver(playwright = null) {
  const runtime = playwright || loadPlaywright();
  return {
    id:"playwright-chromium-extension",
    async capture({extensionPath,options={}}) {
      const root = path.resolve(extensionPath);
      const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(),"calibration-extension-"));
      const errors = [];
      let context;
      try {
        context = await runtime.chromium.launchPersistentContext(userDataDir, {
          channel:"chromium",
          headless:options.headless !== false,
          args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`],
          viewport:options.viewport || {width:1280,height:800},
          ignoreHTTPSErrors:Boolean(options.ignoreHTTPSErrors)
        });
        context.on("weberror", (webError) => errors.push(errorRecord("browser-context", webError.error ? webError.error() : webError)));
        for (const page of context.pages()) page.on("pageerror", (error) => errors.push(errorRecord(page.url() || "extension-page",error)));
        let serviceWorker = context.serviceWorkers().find((worker)=>worker.url().startsWith("chrome-extension://")) || null;
        if (!serviceWorker && options.waitForServiceWorker !== false) {
          try { serviceWorker = await context.waitForEvent("serviceworker", {timeout:options.timeoutMs || 10000}); } catch { serviceWorker = null; }
        }
        if (serviceWorker?.on) serviceWorker.on("console", (message) => { if (message.type?.() === "error") errors.push({source:"extension-service-worker",message:message.text?.() || String(message)}); });
        const extensionId = serviceWorker?.url()?.split("/")[2] || options.extensionId || null;
        let runtimeSnapshot = {manifest:null,grantedPermissions:{permissions:[],origins:[]},storageKeys:{local:[],sync:[],session:[]},dynamicContentScripts:[]};
        if (serviceWorker) {
          try {
            runtimeSnapshot = await serviceWorker.evaluate(async () => {
              const manifest = chrome.runtime.getManifest();
              let grantedPermissions = {permissions:[],origins:[]};
              try { grantedPermissions = await chrome.permissions.getAll(); } catch {}
              const storageKeys = {local:[],sync:[],session:[]};
              for (const area of ["local","sync","session"]) {
                try { const values = await chrome.storage?.[area]?.get(null); storageKeys[area] = Object.keys(values || {}).sort(); } catch {}
              }
              let dynamicContentScripts = [];
              try { dynamicContentScripts = await chrome.scripting?.getRegisteredContentScripts?.() || []; } catch {}
              return {manifest,grantedPermissions,storageKeys,dynamicContentScripts};
            });
          } catch (error) { errors.push(errorRecord("extension-service-worker-evaluate",error)); }
        }
        const manifest = runtimeSnapshot.manifest || null;
        async function loadExtensionPage(relative) {
          if (!relative || !extensionId) return null;
          const page = await context.newPage();
          page.on("pageerror", (error)=>errors.push(errorRecord(relative,error)));
          try {
            const response = await page.goto(`chrome-extension://${extensionId}/${String(relative).replace(/^\//,"")}`, {waitUntil:"domcontentloaded",timeout:options.timeoutMs||10000});
            return {loaded:true,status:response?.status() || null,url:page.url()};
          } catch (error) { errors.push(errorRecord(relative,error)); return {loaded:false,error:error.message}; }
          finally { await page.close().catch(()=>{}); }
        }
        const popupPath = manifest?.action?.default_popup || manifest?.browser_action?.default_popup || manifest?.page_action?.default_popup || null;
        const optionsPath = manifest?.options_ui?.page || manifest?.options_page || null;
        const popup = await loadExtensionPage(popupPath);
        const optionsPage = await loadExtensionPage(optionsPath);
        let targetPage = null;
        if (options.targetUrl) {
          const page = await context.newPage();
          page.on("pageerror", (error)=>errors.push(errorRecord(options.targetUrl,error)));
          try { const response = await page.goto(options.targetUrl,{waitUntil:"domcontentloaded",timeout:options.timeoutMs||15000}); targetPage={loaded:true,status:response?.status()||null,url:page.url()}; }
          catch (error) { errors.push(errorRecord(options.targetUrl,error)); targetPage={loaded:false,url:options.targetUrl,error:error.message}; }
          finally { await page.close().catch(()=>{}); }
        }
        return {
          loaded:Boolean(extensionId || serviceWorker),
          extensionId,
          manifest,
          serviceWorkers:context.serviceWorkers().filter((worker)=>worker.url().startsWith("chrome-extension://")).map((worker)=>({url:worker.url()})),
          grantedPermissions:runtimeSnapshot.grantedPermissions || {permissions:[],origins:[]},
          storageKeys:runtimeSnapshot.storageKeys || {local:[],sync:[],session:[]},
          dynamicContentScripts:runtimeSnapshot.dynamicContentScripts || [],
          errors,
          popup,
          options:optionsPage,
          targetPage,
          environment:{browser:"chromium",driver:"playwright",extension_mode:"unpacked",headless:options.headless !== false}
        };
      } finally {
        if (context) await context.close().catch(()=>{});
        fs.rmSync(userDataDir,{recursive:true,force:true});
      }
    }
  };
}
module.exports = {createPlaywrightExtensionDriver, loadPlaywright};
