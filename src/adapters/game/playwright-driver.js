"use strict";
const fs=require("node:fs");
const path=require("node:path");
const {requirePinnedChromium}=require("../../runtime/browser-runtime");

function contained(root,candidate){
  const rel=path.relative(root,candidate);
  return rel===""||(!rel.startsWith("..")&&!path.isAbsolute(rel));
}

function safeBridgePath(planDir,relative){
  let root;
  try{root=fs.realpathSync(path.resolve(planDir||process.cwd()));}
  catch{throw new Error("game plan directory does not exist");}
  const lexical=path.resolve(root,relative);
  if(!contained(root,lexical))throw new Error("game bridge script must stay inside the plan directory");
  let candidate,stat;
  try{candidate=fs.realpathSync(lexical);stat=fs.statSync(candidate);}
  catch{throw new Error(`game bridge script not found: ${lexical}`);}
  if(!contained(root,candidate))throw new Error("game bridge script symlink must stay inside the plan directory");
  if(!stat.isFile())throw new Error(`game bridge script not found: ${candidate}`);
  return candidate;
}

function validateBridge(bridge,plan){
  if(!bridge.ready)throw new Error(`game bridge '${plan.bridge.global}' did not expose protocol '${plan.bridge.protocol}'`);
  if(plan.bridge.require_ephemeral&&bridge.ephemeral!==true)throw new Error("game bridge refused: ephemeral state boundary is required");
  if(!plan.bridge.require_ephemeral&&bridge.ephemeral!==false)throw new Error("game bridge refused: persistent state was requested but the bridge still reports ephemeral state");
}

function timeoutPromise(ms,id){
  let handle;
  const promise=new Promise((_,reject)=>{handle=setTimeout(()=>reject(new Error(`scenario '${id}' exceeded ${ms} ms`)),ms);});
  return {promise,cancel:()=>clearTimeout(handle)};
}

function createPlaywrightGameDriver(runtimeOverride=null){
  const runtime=runtimeOverride||requirePinnedChromium();
  return {
    id:"playwright-game-chromium",
    async capture({url,plan,options={}}){
      const bridgePath=safeBridgePath(options.planDir,plan.bridge.script);
      const bridgeSource=fs.readFileSync(bridgePath,"utf8");
      const browser=await runtime.chromium.launch({headless:options.headless!==false});
      const consoleErrors=[];
      const scenarios=[];
      let firstBridge=null;
      try{
        for(const scenario of plan.scenarios){
          const context=await browser.newContext({
            viewport:options.viewport||{width:1280,height:800},
            ignoreHTTPSErrors:Boolean(options.ignoreHTTPSErrors)
          });
          const page=await context.newPage();
          page.on("console",message=>{if(message.type()==="error")consoleErrors.push(`[${scenario.id}] ${message.text()}`);});
          page.on("pageerror",error=>consoleErrors.push(`[${scenario.id}] ${error.message}`));
          const started=Date.now();
          try{
            await page.goto(url,{waitUntil:"networkidle",timeout:options.timeoutMs||30000});
            await page.addScriptTag({content:bridgeSource});
            const bridge=await page.evaluate(({globalName,protocol,requireEphemeral})=>{
              const value=globalThis[globalName];
              return {
                ready:Boolean(value&&typeof value.runScenario==="function"&&value.protocol===protocol),
                protocol:value?.protocol||null,
                product:value?.product||null,
                version:value?.version||null,
                ephemeral:value?.ephemeral===true,
                ephemeral_required:requireEphemeral
              };
            },{globalName:plan.bridge.global,protocol:plan.bridge.protocol,requireEphemeral:plan.bridge.require_ephemeral});
            validateBridge(bridge,plan);
            if(!firstBridge)firstBridge=bridge;
            else if(firstBridge.protocol!==bridge.protocol||firstBridge.ephemeral!==bridge.ephemeral)throw new Error(`game bridge boundary changed between scenarios at '${scenario.id}'`);
            const timer=timeoutPromise(scenario.timeout_ms,scenario.id);
            try{
              const execution=page.evaluate(async({globalName,scenario})=>{
                const bridge=globalThis[globalName];
                return await Promise.resolve(bridge.runScenario({id:scenario.id,title:scenario.title,seed:scenario.seed,repetitions:scenario.repetitions,timeout_ms:scenario.timeout_ms}));
              },{globalName:plan.bridge.global,scenario});
              const result=await Promise.race([execution,timer.promise]);
              scenarios.push({id:scenario.id,completed:true,duration_ms:Date.now()-started,result});
            }catch(error){
              scenarios.push({id:scenario.id,completed:false,duration_ms:Date.now()-started,error:error.message,result:null});
            }finally{timer.cancel();}
          }finally{
            await context.close().catch(()=>{});
          }
        }
        return {
          bridge:firstBridge||{ready:false,protocol:null,product:null,version:null,ephemeral:false,ephemeral_required:plan.bridge.require_ephemeral},
          scenarios,
          consoleErrors,
          environment:{
            browser:"chromium",
            driver:"playwright-game",
            runtime:"pinned-local",
            isolated_context:true,
            scenario_context_isolation:true,
            viewport:options.viewport||{width:1280,height:800}
          }
        };
      }finally{
        await browser.close();
      }
    }
  };
}

module.exports={createPlaywrightGameDriver,safeBridgePath,validateBridge,timeoutPromise};
