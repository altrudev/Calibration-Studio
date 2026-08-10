"use strict";
const fs=require("node:fs");const path=require("node:path");
function safeJson(file){try{return JSON.parse(fs.readFileSync(file,"utf8"));}catch{return null;}}
function regularFiles(dir){try{return fs.readdirSync(dir,{withFileTypes:true}).filter((e)=>e.isFile()).map((e)=>e.name).sort();}catch{return [];}}
function discoverCliProject(projectDir){
  const root=path.resolve(projectDir||process.cwd());const packagePath=path.join(root,"package.json");const pkg=fs.existsSync(packagePath)?safeJson(packagePath):null;
  const bins=[];
  if(typeof pkg?.bin==="string")bins.push({name:pkg.name||"cli",path:pkg.bin});
  else if(pkg?.bin&&typeof pkg.bin==="object")for(const [name,value] of Object.entries(pkg.bin))if(typeof value==="string")bins.push({name,path:value});
  for(const name of regularFiles(path.join(root,"bin")))if(!bins.some((item)=>item.path===`bin/${name}`))bins.push({name,path:`bin/${name}`});
  const candidates=["cli.js","cli.mjs","cli.cjs","src/cli.js","src/cli.mjs"].filter((relative)=>fs.existsSync(path.join(root,relative)));
  const scripts=Object.entries(pkg?.scripts||{}).filter(([name])=>/cli|command|tool|start/i.test(name)).map(([name,command])=>({name,command:String(command)}));
  const entrypoints=[...bins.map((item)=>item.path),...candidates].filter((value,index,array)=>array.indexOf(value)===index).sort();
  return {protocol:"calibration-discovery/0.4",adapter:"cli",root,files:{package_json:pkg?"package.json":null,bin_directory:fs.existsSync(path.join(root,"bin"))?"bin":null},signals:{package_bin_count:bins.length,candidate_entrypoint_count:entrypoints.length,script_count:scripts.length},cli:{package_name:pkg?.name||null,package_version:pkg?.version||null,bins,entrypoints,scripts},inferred_expectations:[...(entrypoints.length?[{id:"cli-entrypoints-present",domain:"behavior",title:"CLI entrypoints remain discoverable",expected:true,confidence:"high"}]:[]),...(bins.length?[{id:"cli-bin-count",domain:"behavior",title:"Published CLI command count remains stable",expected:bins.length,confidence:"high"}]:[])],review_required:true,note:"CLI discovery never executes project code. Review inferred expectations before treating them as authoritative."};
}
module.exports={discoverCliProject};
