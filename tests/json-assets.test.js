"use strict";
const test=require("node:test");const assert=require("node:assert/strict");const fs=require("node:fs");const path=require("node:path");
const root=path.resolve(__dirname,"..");
function jsonFiles(dir){const out=[];if(!fs.existsSync(dir))return out;for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())out.push(...jsonFiles(full));else if(entry.isFile()&&entry.name.endsWith(".json"))out.push(full);}return out;}
test("all shipped schemas and JSON samples parse",()=>{const files=[...jsonFiles(path.join(root,"schemas")),...jsonFiles(path.join(root,"samples"))];assert.ok(files.length>=5);for(const file of files)assert.doesNotThrow(()=>JSON.parse(fs.readFileSync(file,"utf8")),path.relative(root,file));});
test("shipped JSON assets do not point at private DDC source paths",()=>{for(const file of [...jsonFiles(path.join(root,"schemas")),...jsonFiles(path.join(root,"samples"))]){const text=fs.readFileSync(file,"utf8");assert.equal(text.includes("apps/calibration-studio/private"),false,path.relative(root,file));assert.equal(text.includes("native/src/"),false,path.relative(root,file));}});
