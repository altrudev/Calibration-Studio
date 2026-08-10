"use strict";
const {ADAPTER_API_VERSION}=require("../../public/adapter-contract");
module.exports=Object.freeze({api_version:ADAPTER_API_VERSION,id:"api",type:"api",name:"API / Backend",status:"candidate",capabilities:Object.freeze(["discover","capture","http","openapi-json","openapi-yaml","authorization-evidence","status","content-type","response-shape","timing","effectful-guard","postcondition-verification"])});
