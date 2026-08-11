#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function inside(root, relative, label) {
  if (typeof relative !== "string" || relative.includes("\\") || path.posix.isAbsolute(relative)) throw new Error(`${label} cwd is invalid`);
  const normalized = path.posix.normalize(relative || ".");
  if (normalized === ".." || normalized.startsWith("../")) throw new Error(`${label} cwd escapes workspace`);
  const resolved = path.resolve(root, ...normalized.split("/"));
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (resolved !== root && !resolved.startsWith(prefix)) throw new Error(`${label} cwd escapes workspace`);
  return resolved;
}

function copySnapshot(inputDir, workspaceDir) {
  fs.mkdirSync(workspaceDir, { recursive: true });
  for (const entry of fs.readdirSync(inputDir)) {
    fs.cpSync(path.join(inputDir, entry), path.join(workspaceDir, entry), { recursive: true, force: true, dereference: false });
  }
}

function runSpec(spec, workspace, env, label) {
  const result = spawnSync(spec.command, spec.args || [], {
    cwd: inside(workspace, spec.cwd || ".", label),
    env,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    timeout: spec.timeout_ms,
    maxBuffer: 8 * 1024 * 1024
  });
  if (result.error) {
    if (result.error.code === "ETIMEDOUT") throw new Error(`${label} timed out`);
    throw new Error(`${label} could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderr = String(result.stderr || "").trim().slice(-4000);
    throw new Error(`${label} failed with exit code ${result.status}${stderr ? `: ${stderr}` : ""}`);
  }
}

function main() {
  const [planFile, inputDir, outputFile] = process.argv.slice(2);
  if (!planFile || !inputDir || !outputFile) throw new Error("sandbox runner requires PLAN INPUT OUTPUT arguments");
  const plan = JSON.parse(fs.readFileSync(planFile, "utf8"));
  if (!plan || !Array.isArray(plan.setup_commands) || !plan.evaluate) throw new Error("sandbox execution plan is invalid");
  const workspace = "/work/project";
  fs.rmSync(workspace, { recursive: true, force: true });
  copySnapshot(inputDir, workspace);
  fs.mkdirSync("/tmp/home", { recursive: true });
  const env = {
    PATH: process.env.PATH || "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    HOME: "/tmp/home",
    TMPDIR: "/tmp",
    TMP: "/tmp",
    TEMP: "/tmp",
    CI: "1",
    CALIBRATION_GITHUB_SANDBOX: "1",
    CALIBRATION_OBSERVATIONS_FILE: outputFile,
    ...plan.environment
  };
  plan.setup_commands.forEach((spec, index) => runSpec(spec, workspace, env, `sandbox setup ${index + 1}`));
  runSpec(plan.evaluate, workspace, env, "sandbox evaluator");
  if (!fs.existsSync(outputFile)) throw new Error("sandbox evaluator did not write CALIBRATION_OBSERVATIONS_FILE");
  const observations = JSON.parse(fs.readFileSync(outputFile, "utf8"));
  if (!observations || !Array.isArray(observations.observations)) throw new Error("sandbox evaluator output is not a Calibration Studio observation set");
}

try { main(); }
catch (error) {
  console.error(`Calibration sandbox error: ${error.message}`);
  process.exitCode = 1;
}
