"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function positiveNumber(value, fallback, min, max, label) {
  const number = Number(value ?? fallback);
  if (!Number.isFinite(number) || number < min || number > max) throw new Error(`${label} must be between ${min} and ${max}`);
  return number;
}

function safeImage(value) {
  if (typeof value !== "string" || !value.trim() || /[\s\0]/.test(value)) throw new Error("CALIBRATION_GITHUB_SANDBOX_IMAGE must name a pre-provisioned container image");
  return value.trim();
}

function createDockerSandboxExecutor({ dockerCommand = "docker", image, memoryMb = 2048, cpus = 2, pidsLimit = 256, timeoutMs = 15 * 60 * 1000, runnerPath = path.join(__dirname, "sandbox-runner.js"), spawnImpl = spawnSync } = {}) {
  image = safeImage(image);
  memoryMb = Math.trunc(positiveNumber(memoryMb, 2048, 128, 16384, "sandbox memory MB"));
  cpus = positiveNumber(cpus, 2, 0.25, 16, "sandbox CPUs");
  pidsLimit = Math.trunc(positiveNumber(pidsLimit, 256, 32, 2048, "sandbox PID limit"));
  timeoutMs = Math.trunc(positiveNumber(timeoutMs, 15 * 60 * 1000, 1000, 60 * 60 * 1000, "sandbox timeout"));
  if (!fs.existsSync(runnerPath)) throw new Error("Calibration sandbox runner is missing");

  return async function evaluate({ snapshotDir, executionPlan, maxObservationBytes }) {
    const session = fs.mkdtempSync(path.join(os.tmpdir(), "calibration-github-sandbox-"));
    const controlDir = path.join(session, "control");
    const outputDir = path.join(session, "output");
    fs.mkdirSync(controlDir, { mode: 0o755 });
    fs.mkdirSync(outputDir, { mode: 0o777 });
    fs.chmodSync(outputDir, 0o777);
    const planFile = path.join(controlDir, "plan.json");
    const runnerFile = path.join(controlDir, "sandbox-runner.js");
    fs.writeFileSync(planFile, `${JSON.stringify(executionPlan)}\n`, { mode: 0o644 });
    fs.copyFileSync(runnerPath, runnerFile);
    fs.chmodSync(runnerFile, 0o644);
    const outputFile = path.join(outputDir, "observations.json");
    const mount = (source, target, readonly = false) => `type=bind,src=${source},dst=${target}${readonly ? ",readonly" : ""}`;
    const args = [
      "run", "--rm",
      "--pull", "never",
      "--network", "none",
      "--read-only",
      "--cap-drop", "ALL",
      "--security-opt", "no-new-privileges",
      "--pids-limit", String(pidsLimit),
      "--memory", `${memoryMb}m`,
      "--cpus", String(cpus),
      "--user", "65532:65532",
      "--mount", mount(path.resolve(snapshotDir), "/input", true),
      "--mount", mount(controlDir, "/control", true),
      "--mount", mount(outputDir, "/output", false),
      "--tmpfs", "/work:rw,nosuid,nodev,size=1073741824,mode=1777",
      "--tmpfs", "/tmp:rw,nosuid,nodev,size=536870912,mode=1777",
      "--workdir", "/work",
      "--entrypoint", "node",
      image,
      "/control/sandbox-runner.js", "/control/plan.json", "/input", "/output/observations.json"
    ];
    try {
      const result = spawnImpl(dockerCommand, args, { encoding: "utf8", shell: false, windowsHide: true, timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 });
      if (result.error) {
        if (result.error.code === "ETIMEDOUT") throw new Error("Calibration sandbox exceeded its overall timeout");
        throw new Error(`Calibration sandbox could not start: ${result.error.message}`);
      }
      if (result.status !== 0) {
        const stderr = String(result.stderr || "").trim().slice(-6000);
        throw new Error(`Calibration sandbox failed with exit code ${result.status}${stderr ? `: ${stderr}` : ""}`);
      }
      if (!fs.existsSync(outputFile)) throw new Error("Calibration sandbox did not produce observations");
      const stat = fs.statSync(outputFile);
      if (stat.size > maxObservationBytes) throw new Error(`Calibration observations exceed ${maxObservationBytes} bytes`);
      const observations = JSON.parse(fs.readFileSync(outputFile, "utf8"));
      if (!observations || !Array.isArray(observations.observations)) throw new Error("Calibration sandbox output is not a valid observation set");
      return observations;
    } finally {
      fs.rmSync(session, { recursive: true, force: true });
    }
  };
}

module.exports = { createDockerSandboxExecutor, safeImage };
