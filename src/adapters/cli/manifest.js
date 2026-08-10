"use strict";
const {ADAPTER_API_VERSION}=require("../../public/adapter-contract");
module.exports=Object.freeze({api_version:ADAPTER_API_VERSION,id:"cli",type:"cli",name:"CLI",status:"candidate",capabilities:Object.freeze(["discover","capture","process","arguments","exit-code","stdout-metadata","stderr-metadata","filesystem-watch","timing","isolated-home","workspace-copy","no-shell","tty","service-orchestration","container-sandbox"])});
