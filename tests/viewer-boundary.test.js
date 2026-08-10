"use strict";
const test=require("node:test");const assert=require("node:assert/strict");const fs=require("node:fs");const path=require("node:path");
const root=path.resolve(__dirname,"..");
test("local viewer has no remote runtime assets",()=>{for(const name of ["index.html","app.js","intent-renderer.js","styles.css"]){const text=fs.readFileSync(path.join(root,"ui",name),"utf8");assert.equal(/<(?:script|link)\b[^>]+https?:\/\//i.test(text),false,`${name} contains remote runtime asset`);}});
test("viewer branding and local file input remain present",()=>{const html=fs.readFileSync(path.join(root,"ui","index.html"),"utf8");assert.ok(html.includes("Built with DDC"));assert.ok(html.includes("Developed by Altru.dev"));assert.ok(html.includes('type="file"'));assert.ok(html.includes("intent-renderer.js"));assert.ok(html.includes("app.js"));});
