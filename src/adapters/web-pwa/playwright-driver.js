"use strict";
const {requirePinnedChromium}=require("../../runtime/browser-runtime");

function loadPlaywright(){
  return requirePinnedChromium();
}

function createPlaywrightDriver(runtimeOverride=null){
  const runtime=runtimeOverride||loadPlaywright();
  return {
    id:"playwright-chromium",
    async capture({url,options={}}){
      const browser=await runtime.chromium.launch({headless:options.headless!==false});
      const context=await browser.newContext({
        viewport:options.viewport||{width:1280,height:800},
        ignoreHTTPSErrors:Boolean(options.ignoreHTTPSErrors)
      });
      const page=await context.newPage();
      const consoleErrors=[];
      const failedRequests=[];
      page.on("console",(message)=>{if(message.type()==="error")consoleErrors.push(message.text());});
      page.on("pageerror",(error)=>consoleErrors.push(error.message));
      page.on("requestfailed",(request)=>failedRequests.push({url:request.url(),error:request.failure()?.errorText||"request failed"}));

      const start=Date.now();
      const response=await page.goto(url,{waitUntil:"networkidle",timeout:options.timeoutMs||30000});
      const loadDurationMs=Date.now()-start;
      const snapshot=await page.evaluate(async()=>{
        const manifestLink=document.querySelector('link[rel~="manifest"]');
        let manifest=null;
        let manifestUrl=null;
        if(manifestLink?.href){
          manifestUrl=manifestLink.href;
          try{manifest=await fetch(manifestUrl).then((r)=>r.ok?r.json():null);}catch{manifest=null;}
        }
        let serviceWorkers=[];
        if("serviceWorker" in navigator){
          try{
            serviceWorkers=(await navigator.serviceWorker.getRegistrations()).map((registration)=>({
              scope:registration.scope,
              active:registration.active?.scriptURL||null,
              waiting:registration.waiting?.scriptURL||null,
              installing:registration.installing?.scriptURL||null
            }));
          }catch{serviceWorkers=[];}
        }
        const localStorageValues={};
        for(let i=0;i<localStorage.length;i++){
          const key=localStorage.key(i);
          localStorageValues[key]=localStorage.getItem(key);
        }
        let indexedDb=[];
        if(indexedDB.databases){try{indexedDb=await indexedDB.databases();}catch{indexedDb=[];}}
        return {
          viewportMeta:document.querySelector('meta[name="viewport"]')?.getAttribute("content")||null,
          manifest,
          manifestUrl,
          serviceWorkers,
          localStorage:localStorageValues,
          indexedDb
        };
      });

      let offline=null;
      if(options.offlineProbe){
        try{
          await context.setOffline(true);
          const offlineResponse=await page.reload({waitUntil:"domcontentloaded",timeout:options.offlineTimeoutMs||10000});
          offline={loaded:true,status:offlineResponse?.status()||null,url:page.url()};
        }catch(error){
          offline={loaded:false,error:error.message};
        }finally{
          await context.setOffline(false).catch(()=>{});
        }
      }

      const result={
        status:response?.status()||0,
        loadDurationMs,
        consoleErrors,
        failedRequests,
        offline,
        environment:{
          browser:"chromium",
          driver:"playwright",
          runtime:"pinned-local",
          viewport:options.viewport||{width:1280,height:800}
        },
        ...snapshot
      };
      await browser.close();
      return result;
    }
  };
}

module.exports={createPlaywrightDriver,loadPlaywright};
