"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const roots = ["src", "scripts", "tests"];
const files = [];

function walk(relative) {
  if (!fs.existsSync(relative)) return;
  for (const entry of fs.readdirSync(relative, { withFileTypes: true })) {
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) walk(next);
    else if (/\.(?:js|mjs|cjs)$/.test(entry.name)) files.push(next);
  }
}

for (const root of roots) walk(root);
files.sort();
if (!files.length) throw new Error("no JavaScript source files found");

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    stdio: "inherit",
    shell: false,
    windowsHide: true
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

for (const schema of [
  "schemas/ddc-provider-0.1.schema.json",
  "schemas/ddc-provider-result-0.1.schema.json"
]) JSON.parse(fs.readFileSync(schema, "utf8"));

console.log(`Checked ${files.length} JavaScript files and provider schemas.`);
