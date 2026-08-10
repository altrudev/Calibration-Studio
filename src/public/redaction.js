"use strict";

const SECRET_KEY=/(?:^|[_-])(password|passwd|secret|token|api[_-]?key|authorization|cookie|session|credential|private[_-]?key)(?:$|[_-])/i;
const PRIVATE_KEY=/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
const BEARER=/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi;
const BASIC=/\bBasic\s+[A-Za-z0-9+/=]+/gi;
const URL_CREDENTIALS=/(https?:\/\/)([^\s/@:]+):([^\s/@]+)@/gi;
const SECRET_ASSIGNMENT=/\b(password|passwd|secret|token|api[_-]?key|authorization|cookie|session|credential|private[_-]?key)\b(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi;
const HOME_PATH=/(?:\/home\/|\/Users\/)([^/\s]+)(?=\/)/g;
const WINDOWS_HOME=/\b[A-Za-z]:\\Users\\([^\\\s]+)(?=\\)/g;

const PROFILES=Object.freeze({
  full:Object.freeze({redactSecrets:true,redactHome:false,dropEvidence:false,dropReproduction:false}),
  developer:Object.freeze({redactSecrets:true,redactHome:true,dropEvidence:false,dropReproduction:false}),
  sanitized:Object.freeze({redactSecrets:true,redactHome:true,dropEvidence:false,dropReproduction:true}),
  shareable:Object.freeze({redactSecrets:true,redactHome:true,dropEvidence:true,dropReproduction:true})
});

function profile(name="sanitized"){
  const value=PROFILES[name];
  if(!value)throw new Error(`Unknown privacy profile '${name}'`);
  return value;
}

function sanitizeString(value,rules){
  let out=String(value);
  if(rules.redactSecrets)out=out.replace(PRIVATE_KEY,"[REDACTED PRIVATE KEY]").replace(BEARER,"Bearer [REDACTED]").replace(BASIC,"Basic [REDACTED]").replace(URL_CREDENTIALS,"$1[REDACTED]@").replace(SECRET_ASSIGNMENT,"$1$2[REDACTED]");
  if(rules.redactHome)out=out.replace(HOME_PATH,"/home/[REDACTED]").replace(WINDOWS_HOME,match=>`${match.slice(0,3)}[REDACTED]`);
  return out;
}

function redact(value,profileName="sanitized",seen=new WeakSet()){
  const rules=typeof profileName==="string"?profile(profileName):profileName;
  if(value===null||value===undefined||typeof value==="number"||typeof value==="boolean")return value;
  if(typeof value==="string")return sanitizeString(value,rules);
  if(Array.isArray(value))return value.map(item=>redact(item,rules,seen));
  if(typeof value!=="object")return sanitizeString(value,rules);
  if(seen.has(value))throw new Error("Cannot redact cyclic object");
  seen.add(value);
  const out={};
  for(const [key,item] of Object.entries(value)){
    if(rules.redactSecrets&&SECRET_KEY.test(`_${key}_`)){out[key]="[REDACTED]";continue;}
    if(rules.dropEvidence&&key==="evidence"){out[key]=[];continue;}
    if(rules.dropEvidence&&key==="provenance"&&item&&typeof item==="object"&&!Array.isArray(item)){
      const provenance=redact(item,rules,seen);provenance.statement=null;out[key]=provenance;continue;
    }
    if(rules.dropReproduction&&/^(reproduction|reproduce)$/i.test(key)){out[key]=null;continue;}
    out[key]=redact(item,rules,seen);
  }
  seen.delete(value);
  return out;
}

module.exports={PROFILES,profile,redact,sanitizeString};
