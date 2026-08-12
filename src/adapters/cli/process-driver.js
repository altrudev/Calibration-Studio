"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const net = require("node:net");
const { spawn, spawnSync } = require("node:child_process");
const { resolveWithin } = require("./plan");

const CONTAINER_LIMITS = Object.freeze({
  cpus: 2,
  memoryMb: 2048,
  pids: 256,
  tmpBytes: 536870912,
  homeBytes: 268435456
});

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function sanitizePreview(text) {
  return String(text || "")
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s"'\\]+/ig, "$1[REDACTED]")
    .replace(/((?:api[-_]?key|token|secret|password|passwd|credential)\s*[:=]\s*)[^\s"'\\]+/ig, "$1[REDACTED]");
}

function outputSummary(buffer, includeOutput, maxBytes) {
  const clipped = buffer.subarray(0, maxBytes);
  const text = clipped.toString("utf8");
  return {
    bytes: buffer.length,
    lines: text.length ? text.split(/\r?\n/).length : 0,
    sha256: sha256(buffer),
    truncated: buffer.length > maxBytes,
    preview: includeOutput ? sanitizePreview(text) : null
  };
}

function snapshotPath(projectRoot, relative) {
  const target = resolveWithin(projectRoot, relative);
  try {
    const stat = fs.lstatSync(target);
    if (stat.isFile()) {
      const data = stat.size <= 5 * 1024 * 1024 ? fs.readFileSync(target) : null;
      return { exists: true, type: "file", size: stat.size, mtime_ms: Math.trunc(stat.mtimeMs), sha256: data ? sha256(data) : null };
    }
    if (stat.isDirectory()) {
      const names = fs.readdirSync(target).sort();
      return { exists: true, type: "directory", entry_count: names.length, names_sha256: sha256(Buffer.from(JSON.stringify(names))) };
    }
    return { exists: true, type: "other", size: stat.size, mtime_ms: Math.trunc(stat.mtimeMs) };
  } catch (error) {
    if (error?.code === "ENOENT") return { exists: false };
    return { exists: null, error: String(error?.message || error) };
  }
}

function changed(before, after) {
  return JSON.stringify(before) !== JSON.stringify(after);
}

function buildEnvironment(plan, tempHome, extraEnv = {}) {
  if (plan.inherit_env) return { ...process.env, ...plan.env, ...extraEnv };
  const env = {
    PATH: process.env.PATH || "",
    HOME: tempHome,
    USERPROFILE: tempHome,
    TMPDIR: tempHome,
    TMP: tempHome,
    TEMP: tempHome,
    ...plan.env,
    ...extraEnv
  };
  if (process.platform === "win32" && process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot;
  return env;
}

function prepareWorkspace(projectRoot, workspaceCopy) {
  if (!workspaceCopy) return { root: projectRoot, tempRoot: null };
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "calibration-cli-workspace-"));
  const root = path.join(tempRoot, "project");
  fs.cpSync(projectRoot, root, { recursive: true, dereference: false, errorOnExist: false });
  return { root, tempRoot };
}

function commandAvailable(command) {
  const result = spawnSync(command, ["--version"], { stdio: "ignore", shell: false, windowsHide: true });
  return !result.error && result.status === 0;
}

function selectContainerRuntime(requested) {
  if (requested && requested !== "auto") {
    if (!commandAvailable(requested)) throw new Error(`required container runtime '${requested}' is not available`);
    return requested;
  }
  for (const candidate of ["docker", "podman"]) if (commandAvailable(candidate)) return candidate;
  throw new Error("container sandbox mode requires Docker or Podman, but neither runtime is available");
}

function containerCommand(plan, executionRoot, tempHome, runtimeOverride = null) {
  const runtime = runtimeOverride || selectContainerRuntime(plan.sandbox.runtime);
  const cwdRelative = path.relative(executionRoot, resolveWithin(executionRoot, plan.cwd || ".")).split(path.sep).join("/");
  const args = [
    "run", "--rm",
    "--pull", "never",
    "--network", plan.sandbox.network,
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges",
    "--pids-limit", String(CONTAINER_LIMITS.pids),
    "--memory", `${CONTAINER_LIMITS.memoryMb}m`,
    "--cpus", String(CONTAINER_LIMITS.cpus)
  ];
  if (plan.sandbox.read_only_root) {
    args.push(
      "--read-only",
      "--tmpfs", `/tmp:rw,nosuid,nodev,size=${CONTAINER_LIMITS.tmpBytes},mode=1777`,
      "--tmpfs", `/home/calibration:rw,nosuid,nodev,size=${CONTAINER_LIMITS.homeBytes},mode=700`
    );
  }
  args.push(
    "-v", `${executionRoot}:/workspace:rw`,
    "-w", cwdRelative ? `/workspace/${cwdRelative}` : "/workspace"
  );
  for (const [key, value] of Object.entries(plan.env)) args.push("-e", `${key}=${value}`);
  args.push(
    "-e", "HOME=/home/calibration",
    "-e", "USERPROFILE=/home/calibration",
    plan.sandbox.image,
    plan.command,
    ...plan.args
  );
  return {
    runtime,
    command: runtime,
    args,
    cwd: executionRoot,
    env: { ...process.env },
    securityBoundary: "container",
    limits: { ...CONTAINER_LIMITS }
  };
}

function loadNodePty() {
  try { return require("node-pty"); }
  catch (error) {
    const wrapped = new Error("TTY mode requires the pinned optional node-pty 1.1.0 runtime. Install the production dependencies before using tty:true.");
    wrapped.cause = error;
    throw wrapped;
  }
}

function terminateChild(child, signal = "SIGTERM") {
  if (!child || child.killed || child.exitCode !== null) return;
  try {
    if (process.platform !== "win32" && child.pid) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch {
    try { child.kill(signal); } catch {}
  }
}

async function terminateChildAndWait(child, timeoutMs = 2000) {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    child.once("close", done);
    terminateChild(child, "SIGTERM");
    const timer = setTimeout(() => {
      terminateChild(child, "SIGKILL");
      setTimeout(done, 250).unref();
    }, timeoutMs);
    timer.unref?.();
  });
}

function removeTempTree(target) {
  if (!target) return;
  fs.rmSync(target, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
}

function waitTcp(host, port, timeoutMs) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    function attempt() {
      const socket = net.createConnection({ host, port });
      let done = false;
      const finish = (error) => {
        if (done) return;
        done = true;
        socket.destroy();
        if (!error) return resolve(true);
        if (Date.now() - started >= timeoutMs) return reject(new Error(`TCP readiness timed out for ${host}:${port}`));
        setTimeout(attempt, 100);
      };
      socket.setTimeout(500);
      socket.on("connect", () => finish(null));
      socket.on("timeout", () => finish(new Error("timeout")));
      socket.on("error", finish);
    }
    attempt();
  });
}

async function waitHttp(url, expectedStatus, timeoutMs) {
  const started = Date.now();
  while (true) {
    try {
      const response = await fetch(url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(Math.min(1000, timeoutMs)) });
      if (expectedStatus.includes(response.status)) {
        await response.body?.cancel().catch(() => {});
        return true;
      }
      await response.body?.cancel().catch(() => {});
    } catch {}
    if (Date.now() - started >= timeoutMs) throw new Error(`HTTP readiness timed out for ${url}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function waitReady(ready) {
  if (ready.type === "delay") {
    await new Promise((resolve) => setTimeout(resolve, Math.min(ready.delay_ms, ready.timeout_ms)));
    return true;
  }
  if (ready.type === "tcp") return waitTcp(ready.host, ready.port, ready.timeout_ms);
  return waitHttp(ready.url, ready.expected_status, ready.timeout_ms);
}

async function startServices(plan, executionRoot, tempHome) {
  const services = [];
  for (const service of plan.services) {
    const cwd = resolveWithin(executionRoot, service.cwd || ".");
    const child = spawn(service.command, service.args, {
      cwd,
      env: buildEnvironment({ ...plan, ...service, env: { ...plan.env, ...service.env }, inherit_env: service.inherit_env }, tempHome),
      shell: false,
      stdio: ["ignore", "ignore", "ignore"],
      windowsHide: true,
      detached: process.platform !== "win32"
    });
    let processError = null;
    child.once("error", (error) => { processError = String(error?.message || error); });
    try {
      await waitReady(service.ready);
      if (processError) throw new Error(processError);
      services.push({ id: service.id, child, ready: true });
    } catch (error) {
      await terminateChildAndWait(child);
      for (const item of services.reverse()) await terminateChildAndWait(item.child);
      throw new Error(`service '${service.id}' failed readiness: ${error.message}`);
    }
  }
  return services;
}

function serviceEvidence(services) {
  return services.map((item) => ({ id: item.id, ready: Boolean(item.ready), pid_present: Boolean(item.child?.pid) }));
}

async function runSpawnProcess({ command, args, cwd, env, timeoutMs, maxOutputBytes, includeOutput, stdin }) {
  let stdout = [];
  let stderr = [];
  let outputBytes = 0;
  let outputLimitReached = false;
  let exitCode = null;
  let signal = null;
  let processError = null;
  let timedOut = false;
  await new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env, shell: false, stdio: ["pipe", "pipe", "pipe"], windowsHide: true, detached: process.platform !== "win32" });
    const timer = setTimeout(() => {
      timedOut = true;
      terminateChild(child);
      setTimeout(() => terminateChild(child, "SIGKILL"), 500).unref();
    }, timeoutMs);
    function collect(target, chunk) {
      if (outputLimitReached) return;
      const buf = Buffer.from(chunk);
      const remaining = Math.max(0, maxOutputBytes - outputBytes);
      if (buf.length > remaining) {
        if (remaining) target.push(buf.subarray(0, remaining));
        outputBytes += remaining;
        outputLimitReached = true;
        return;
      }
      target.push(buf);
      outputBytes += buf.length;
    }
    child.stdout.on("data", (chunk) => collect(stdout, chunk));
    child.stderr.on("data", (chunk) => collect(stderr, chunk));
    child.on("error", (error) => { processError = String(error?.message || error); });
    child.on("close", (code, signalName) => {
      clearTimeout(timer);
      exitCode = code;
      signal = signalName;
      resolve();
    });
    if (stdin !== null) {
      child.stdin.write(stdin);
      child.stdin.end();
    } else child.stdin.end();
  });
  return {
    completed: processError === null && !timedOut,
    exitCode,
    signal,
    timedOut,
    error: processError,
    stdout: outputSummary(Buffer.concat(stdout), includeOutput, maxOutputBytes),
    stderr: outputSummary(Buffer.concat(stderr), includeOutput, maxOutputBytes),
    outputLimitReached,
    tty: false
  };
}

async function runPtyProcess({ command, args, cwd, env, timeoutMs, maxOutputBytes, includeOutput, stdin, terminal }) {
  const pty = loadNodePty();
  let chunks = [];
  let total = 0;
  let truncated = false;
  let exitCode = null;
  let signal = null;
  let timedOut = false;
  const term = pty.spawn(command, args, { name: "xterm-color", cols: terminal.cols, rows: terminal.rows, cwd, env });
  const started = Date.now();
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      timedOut = true;
      try { term.kill(); } catch {}
      resolve();
    }, timeoutMs);
    term.onData((data) => {
      if (truncated) return;
      const buf = Buffer.from(String(data));
      const remaining = Math.max(0, maxOutputBytes - total);
      if (buf.length > remaining) {
        if (remaining) chunks.push(buf.subarray(0, remaining));
        total += remaining;
        truncated = true;
        return;
      }
      chunks.push(buf);
      total += buf.length;
    });
    term.onExit((event) => {
      clearTimeout(timer);
      exitCode = event.exitCode;
      signal = event.signal;
      resolve();
    });
    if (stdin !== null) term.write(stdin);
  });
  const buffer = Buffer.concat(chunks);
  const summary = outputSummary(buffer, includeOutput, maxOutputBytes);
  summary.truncated = summary.truncated || truncated;
  return {
    completed: !timedOut,
    exitCode,
    signal,
    timedOut,
    error: null,
    stdout: summary,
    stderr: { bytes: 0, lines: 0, sha256: sha256(Buffer.alloc(0)), truncated: false, preview: null, unavailable_in_tty: true },
    outputLimitReached: truncated,
    tty: true,
    durationOverrideMs: Date.now() - started
  };
}

function createProcessDriver() {
  return {
    id: "node-child-process",
    async run({ plan, projectDir }) {
      const projectRoot = path.resolve(projectDir || process.cwd());
      const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "calibration-cli-home-"));
      const workspace = prepareWorkspace(projectRoot, plan.workspace_copy);
      const executionRoot = workspace.root;
      const before = Object.fromEntries(plan.watch.map((relative) => [relative, snapshotPath(executionRoot, relative)]));
      const started = Date.now();
      let services = [];
      try {
        let command = plan.command;
        let args = plan.args;
        let cwd = resolveWithin(executionRoot, plan.cwd || ".");
        let env = buildEnvironment(plan, tempHome);
        let securityBoundary = plan.workspace_copy ? "workspace-copy" : "host-process";
        let containerRuntime = null;
        let containerLimits = null;
        if (plan.sandbox.mode === "container") {
          const wrapped = containerCommand(plan, executionRoot, tempHome);
          command = wrapped.command;
          args = wrapped.args;
          cwd = wrapped.cwd;
          env = wrapped.env;
          securityBoundary = wrapped.securityBoundary;
          containerRuntime = wrapped.runtime;
          containerLimits = wrapped.limits;
        } else services = await startServices(plan, executionRoot, tempHome);
        const runner = plan.tty ? runPtyProcess : runSpawnProcess;
        const result = await runner({
          command,
          args,
          cwd,
          env,
          timeoutMs: plan.timeout_ms,
          maxOutputBytes: plan.max_output_bytes,
          includeOutput: plan.include_output,
          stdin: plan.stdin,
          terminal: plan.terminal
        });
        const durationMs = result.durationOverrideMs || Date.now() - started;
        const after = Object.fromEntries(plan.watch.map((relative) => [relative, snapshotPath(executionRoot, relative)]));
        const changedPaths = plan.watch.filter((relative) => changed(before[relative], after[relative])).sort();
        return {
          ...result,
          durationMs,
          watched: { before, after, changed_paths: changedPaths },
          services: serviceEvidence(services),
          environment: {
            driver: plan.tty ? "node-pty" : "node-child-process",
            shell: false,
            isolated_home: !plan.inherit_env,
            workspace_copy: Boolean(plan.workspace_copy),
            security_boundary: securityBoundary,
            container_runtime: containerRuntime,
            container_network: plan.sandbox.mode === "container" ? plan.sandbox.network : null,
            container_limits: containerLimits,
            platform: process.platform,
            arch: process.arch,
            env_keys: Object.keys(plan.env).sort(),
            tty: Boolean(plan.tty),
            service_count: services.length
          }
        };
      } finally {
        for (const service of services.reverse()) await terminateChildAndWait(service.child);
        removeTempTree(tempHome);
        removeTempTree(workspace.tempRoot);
      }
    }
  };
}

module.exports = {
  CONTAINER_LIMITS,
  buildEnvironment,
  commandAvailable,
  containerCommand,
  createProcessDriver,
  loadNodePty,
  outputSummary,
  prepareWorkspace,
  removeTempTree,
  sanitizePreview,
  selectContainerRuntime,
  snapshotPath,
  terminateChildAndWait,
  waitReady
};
