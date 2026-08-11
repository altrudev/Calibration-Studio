#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const requiredPlaywright = "1.62.1";

function run(command, args, label, env = process.env) {
  console.log(`\n${label}`);
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false,
    windowsHide: true,
    env
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}`);
}

function nodeMajor() {
  return Number(process.versions.node.split(".")[0]);
}

function dependencyGraphReady() {
  const file = path.join(repoRoot, "node_modules", "playwright", "package.json");
  if (!fs.existsSync(file)) return false;
  try { return JSON.parse(fs.readFileSync(file, "utf8")).version === requiredPlaywright; }
  catch { return false; }
}

function browserReady() {
  const result = spawnSync(process.execPath, [path.join(repoRoot, "src", "runtime", "verify-browser.js")], {
    cwd: repoRoot,
    stdio: "ignore",
    shell: false,
    windowsHide: true,
    env: { ...process.env }
  });
  return !result.error && result.status === 0;
}

function bootstrap() {
  if (nodeMajor() < 24) throw new Error(`Calibration Studio requires Node.js 24 or newer. Current runtime: ${process.version}`);

  if (!dependencyGraphReady()) {
    run(
      npm,
      ["ci", "--ignore-scripts", "--no-audit", "--no-fund"],
      "Preparing Calibration Studio dependencies…",
      { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1" }
    );
  }

  if (!browserReady()) {
    run(process.execPath, [path.join(repoRoot, "src", "runtime", "install-browser.js")], "Installing the pinned local browser runtime…");
    if (!browserReady()) throw new Error("Pinned browser runtime installation did not verify successfully");
  }
}

async function main() {
  bootstrap();
  process.argv = [process.argv[0], path.join(repoRoot, "bin", "studio.js"), ...process.argv.slice(2)];
  await require("./studio.js").main();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`\nCalibration Studio launcher error: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { bootstrap, browserReady, dependencyGraphReady, nodeMajor };
