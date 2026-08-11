"use strict";
const test=require("node:test");const assert=require("node:assert/strict");
const {sanitizeEvidenceUrl,sanitizeString,PROFILES}=require("../src/public/redaction");
test("evidence URL sanitizer removes credentials and query values",()=>{const value=sanitizeEvidenceUrl("https://user:pass@example.com/path?token=abc&x=123#frag");assert.equal(value.includes("user"),false);assert.equal(value.includes("pass"),false);assert.equal(value.includes("abc"),false);assert.equal(value.includes("123"),false);assert.match(value,/token=\[REDACTED\]/);});
test("evidence string sanitizer redacts bearer and secret assignments",()=>{const value=sanitizeString("Authorization: Bearer abc.def token=supersecret",PROFILES.full);assert.equal(value.includes("abc.def"),false);assert.equal(value.includes("supersecret"),false);});
