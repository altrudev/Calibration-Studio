"use strict";
const test=require("node:test");const assert=require("node:assert/strict");const fs=require("node:fs");const os=require("node:os");const path=require("node:path");
const {redact,sanitizeString}=require("../src/public/redaction");
const {assertSafeBundlePath}=require("../src/public/bundle");
const {assertSafeRelativePath}=require("../src/release/manifest");
const {normalizeApiPlan}=require("../src/adapters/api/plan");
const {createHttpDriver}=require("../src/adapters/api/http-driver");
const {captureCli}=require("../src/adapters/cli/capture");
const {validateProviderResult}=require("../src/providers/ddc-provider");

test("free-form secret assignments are redacted",()=>{const text="token=abc api_key: xyz password='hello world' authorization: Bearer SECRET";const out=sanitizeString(text,{redactSecrets:true,redactHome:false});for(const secret of ["abc","xyz","hello world","SECRET"])assert.equal(out.includes(secret),false);assert.equal(JSON.stringify(redact({note:text},"full")).includes("abc"),false);});

test("bundle and release paths reject absolute traversal noncanonical and duplicate-danger shapes",()=>{for(const value of ["../x","a/../x","/tmp/x","C:\\temp\\x","a//b","./x","a\\b"])assert.throws(()=>assertSafeBundlePath(value));for(const value of ["../x","a/../x","/tmp/x","C:\\temp\\x","a//b","./x","a\\b"])assert.throws(()=>assertSafeRelativePath(value));});

test("API plans reject credential-bearing URL userinfo",()=>{assert.throws(()=>normalizeApiPlan({protocol:"calibration-api-plan/0.5",requests:[{id:"x",method:"GET",url:"https://user:pass@example.test/x"}]}),/userinfo/);});

test("HTTP driver forces manual redirects so caller credentials are never automatically forwarded",async()=>{let calls=0;const fakeFetch=async(_url,init)=>{calls++;assert.equal(init.redirect,"manual");return new Response("",{status:302,headers:{location:"https://other.example.test/next"}});};const driver=createHttpDriver(fakeFetch);const result=await driver.request({request:{method:"GET",url:"https://example.test/start",headers:{authorization:"Bearer secret"},timeout_ms:1000,max_response_bytes:4096}});assert.equal(calls,1);assert.equal(result.redirected,false);assert.equal(result.redirectLocation,"https://other.example.test/next");assert.equal(JSON.stringify(result).includes("Bearer secret"),false);});

test("CLI parent environment inheritance requires separate operator authority",async()=>{const plan={protocol:"calibration-cli-plan/0.5",id:"env",command:process.execPath,args:["--version"],inherit_env:true};await assert.rejects(()=>captureCli({plan,projectDir:process.cwd(),driver:{run:async()=>({completed:true,environment:{}})},options:{confirmExecution:true}}),/operator must also pass --allow-inherit-env/);});

test("DDC provider public result rejects undeclared evidence fields",()=>{assert.throws(()=>validateProviderResult({protocol:"altru-calibration-ddc-provider-result/0.1",request_id:"R",status:"ok",reason_codes:[],evidence:[{type:"summary",summary:"ok",private_topology:{x:1}}]},"R"),/unsupported field/);});

test("source tree contains no committed private-key or dotenv material",()=>{const root=path.resolve(__dirname,"..");const bad=[];function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(entry.name===".git"||entry.name==="node_modules")continue;const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else if(/(?:\.pem|\.key|\.p12|\.pfx)$/.test(entry.name)||entry.name===".env")bad.push(path.relative(root,full));}}walk(root);assert.deepEqual(bad,[]);});
