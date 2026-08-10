"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const test=require("node:test");
const {createBundle,verifyBundle}=require("../src/public/bundle");
const {redact}=require("../src/public/redaction");

function temp(){return fs.mkdtempSync(path.join(os.tmpdir(),"calibration-bundle-"));}
function report(){return{schema:"altru-calibration-report/0.1",run:{id:"RUN-DEMO",completed_at:"2026-08-09T16:30:00Z"},project:{name:"Bundle Demo",github_url:"https://github.com/example/demo"},calibration:{status:"fractured",score:80,finding_count:1},findings:[{id:"F-1",code:"CAL-STATE-014",title:"Save mismatch",domain:"state",severity:"high",summary:"Mismatch",expected:true,observed:false,evidence:[{source:"/home/alice/project/log.txt",authorization:"Bearer top-secret-token"}],reproduction:"Run with api_token=super-secret"}]};}
function writeReport(root){const file=path.join(root,"report.json");fs.writeFileSync(file,JSON.stringify(report()),"utf8");return file;}

test("redaction removes secret fields credentials and home usernames",()=>{const value=redact({api_token:"abc",authorization:"Bearer xyz",url:"https://user:pass@example.com/x",path:"/home/alice/private"},"developer");assert.equal(value.api_token,"[REDACTED]");assert.equal(value.authorization,"[REDACTED]");assert.equal(value.url,"https://[REDACTED]@example.com/x");assert.equal(value.path,"/home/[REDACTED]/private");});

test("shareable bundle preserves source provenance while dropping evidence and reproduction",()=>{const root=temp(),artifact=writeReport(root),bundleDir=path.join(root,"bundle");const manifest=createBundle({artifactFiles:[artifact],outputDir:bundleDir,privacyProfile:"shareable"});assert.match(manifest.id,/^BUNDLE-[A-F0-9]{12}$/);const verification=verifyBundle(bundleDir);assert.equal(verification.status,"verified");const artifactName=fs.readdirSync(path.join(bundleDir,"artifacts"))[0];const wrapper=JSON.parse(fs.readFileSync(path.join(bundleDir,"artifacts",artifactName),"utf8"));assert.equal(wrapper.source.schema,"altru-calibration-report/0.1");assert.deepEqual(wrapper.payload.findings[0].evidence,[]);assert.equal(wrapper.payload.findings[0].reproduction,null);assert.ok(!JSON.stringify(wrapper).includes("top-secret-token"));assert.ok(!JSON.stringify(wrapper).includes("/home/alice"));});

test("bundle verification rejects modified and unlisted files",()=>{const root=temp(),artifact=writeReport(root);const tamperDir=path.join(root,"tamper");createBundle({artifactFiles:[artifact],outputDir:tamperDir});fs.appendFileSync(path.join(tamperDir,"summary.html"),"tampered");assert.throws(()=>verifyBundle(tamperDir),/file integrity mismatch/);const extraDir=path.join(root,"extra");createBundle({artifactFiles:[artifact],outputDir:extraDir});fs.writeFileSync(path.join(extraDir,"extra.txt"),"unlisted");assert.throws(()=>verifyBundle(extraDir),/missing or unlisted files/);});

test("bundle creation refuses non-empty output directories",()=>{const root=temp(),artifact=writeReport(root),out=path.join(root,"occupied");fs.mkdirSync(out);fs.writeFileSync(path.join(out,"keep.txt"),"keep");assert.throws(()=>createBundle({artifactFiles:[artifact],outputDir:out}),/must not already contain files/);});
