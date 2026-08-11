"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");

const pkg = require("../../package.json");
const { collectCodespacesUsage } = require("../codespaces/usage");
const repoRoot = path.resolve(__dirname, "../..");
const uiRoot = path.join(repoRoot, "ui");
const entryFile = path.join(repoRoot, "bin", "calibrate-entry.js");
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4317;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_COMMAND_OUTPUT_BYTES = 8 * 1024 * 1024;
const ALLOWED_OPERATIONS = new Set([
  "version", "adapters", "runtime", "inspect", "discover", "contract", "capture",
  "run", "baseline", "compare", "trace", "gate", "repair-scope", "repair", "repair-run"
]);
const ALLOWED_TYPES = new Set(["web-pwa", "browser-extension", "api", "cli", "game"]);
const ALLOWED_MODES = new Set(["minimal", "domain-neighborhood", "full"]);

function text(value, name, { required = false, max = 4096 } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw new Error(`${name} is required`);
    return null;
  }
  if (typeof value !== "string") throw new Error(`${name} must be a string`);
  if (value.length > max || value.includes("\0")) throw new Error(`${name} is invalid`);
  return value;
}

function flag(args, enabled, name) {
  if (enabled === true) args.push(name);
}

function buildCommandArgs(input = {}) {
  const operation = text(input.operation, "operation", { required: true, max: 64 });
  if (!ALLOWED_OPERATIONS.has(operation)) throw new Error(`Unsupported Studio operation: ${operation}`);
  const args = [operation];
  const project = text(input.project, "project");
  const type = text(input.type, "type", { max: 64 });
  if (type && !ALLOWED_TYPES.has(type)) throw new Error(`Unsupported adapter type: ${type}`);
  const add = (name, value) => { if (value) args.push(name, value); };

  if (["inspect", "discover", "capture", "run", "baseline", "compare", "trace", "gate", "repair-run"].includes(operation)) {
    add("--project", project);
  }
  if (["discover", "contract", "capture"].includes(operation)) add("--type", type);
  if (["discover", "contract"].includes(operation)) add("--product", text(input.product, "product", { max: 256 }));
  if (operation === "capture") {
    add("--url", text(input.url, "url"));
    add("--target-url", text(input.targetUrl, "targetUrl"));
    add("--extension-id", text(input.extensionId, "extensionId", { max: 256 }));
    add("--plan", text(input.plan, "plan"));
    add("--timeout-ms", Number.isFinite(input.timeoutMs) ? String(Math.max(1000, Math.min(600000, Math.trunc(input.timeoutMs)))) : null);
    flag(args, input.offlineProbe, "--offline-probe");
    flag(args, input.headed, "--headed");
    flag(args, input.allowEffectful, "--allow-effectful");
    flag(args, input.allowRemoteTarget, "--allow-remote-target");
    flag(args, input.allowPersistentState, "--allow-persistent-state");
    flag(args, input.confirmExecution, "--confirm-execution");
    flag(args, input.allowInheritEnv, "--allow-inherit-env");
  }
  if (operation === "contract") add("--plan", text(input.plan, "plan"));
  if (["run", "baseline"].includes(operation)) {
    add("--contract", text(input.contract, "contract"));
    add("--observations", text(input.observations, "observations"));
    add("--settings", text(input.settings, "settings"));
  }
  if (operation === "baseline") add("--label", text(input.label, "label", { max: 256 }));
  if (operation === "compare") {
    add("--baseline", text(input.baseline, "baseline"));
    add("--observations", text(input.observations, "observations"));
    add("--scope", text(input.scope, "scope"));
  }
  if (["trace", "gate"].includes(operation)) {
    add("--baseline", text(input.baseline, "baseline"));
    add("--plan", text(input.plan, "plan"));
    flag(args, input.confirmExecution, "--confirm-execution");
  }
  if (operation === "repair-scope") {
    add("--baseline", text(input.baseline, "baseline"));
    add("--before", text(input.before, "before"));
    const mode = text(input.mode, "mode", { max: 64 });
    if (mode && !ALLOWED_MODES.has(mode)) throw new Error(`Unsupported repair scope mode: ${mode}`);
    add("--mode", mode);
  }
  if (operation === "repair") {
    add("--before", text(input.before, "before"));
    add("--after", text(input.after, "after"));
  }
  if (operation === "repair-run") {
    add("--baseline", text(input.baseline, "baseline"));
    add("--before", text(input.before, "before"));
    add("--scope", text(input.scope, "scope"));
    add("--plan", text(input.plan, "plan"));
    flag(args, input.confirmExecution, "--confirm-execution");
  }
  return args;
}


function coreEnvironment(env = process.env) {
  const allowed = new Set([
    "PATH", "HOME", "USERPROFILE", "TMPDIR", "TMP", "TEMP",
    "SystemRoot", "SYSTEMROOT", "SystemDrive", "SYSTEMDRIVE", "ComSpec", "COMSPEC",
    "PATHEXT", "LANG", "LC_ALL", "TERM", "PLAYWRIGHT_BROWSERS_PATH"
  ]);
  const out = {};
  for (const [key, value] of Object.entries(env || {})) {
    if (allowed.has(key) && typeof value === "string") out[key] = value;
  }
  return out;
}

function runCalibration(input, { timeoutMs = 10 * 60 * 1000 } = {}) {
  const args = buildCommandArgs(input);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entryFile, ...args], {
      cwd: repoRoot,
      shell: false,
      windowsHide: true,
      env: coreEnvironment(process.env)
    });
    let stdout = "";
    let stderr = "";
    let tooLarge = false;
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on("data", (chunk) => {
      if (stdout.length + chunk.length > MAX_COMMAND_OUTPUT_BYTES) {
        tooLarge = true;
        child.kill();
        return;
      }
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length + chunk.length <= MAX_COMMAND_OUTPUT_BYTES) stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (tooLarge) return reject(new Error("Calibration command output exceeded the Studio safety limit"));
      let result = null;
      const trimmed = stdout.trim();
      if (trimmed) {
        try { result = JSON.parse(trimmed); }
        catch { result = { text: trimmed }; }
      }
      resolve({
        operation: args[0],
        success: code === 0,
        exit_code: code ?? 1,
        signal: signal || null,
        stderr: stderr.trim(),
        result
      });
    });
  });
}

function statusPayload(host, port) {
  let browser = { installed: false, playwright_version: null, error: null };
  try {
    const { browserRuntimeInfo } = require("../runtime/browser-runtime");
    const info = browserRuntimeInfo();
    browser = {
      installed: info.chromium_installed === true,
      playwright_version: info.playwright_version,
      error: null
    };
  } catch (error) {
    browser.error = error.message;
  }
  return {
    product: "Calibration Studio",
    version: pkg.version,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    service: { status: "ready", host, port, loopback_only: true },
    codespace: {
      active: Boolean(process.env.CODESPACES || process.env.CODESPACE_NAME),
      name: process.env.CODESPACE_NAME || null,
      repository: process.env.GITHUB_REPOSITORY || null
    },
    browser
  };
}

function sendJson(res, statusCode, value) {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  res.end(body);
}

function securityHeaders(res) {
  res.setHeader("content-security-policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("cross-origin-resource-policy", "same-origin");
  res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body is too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { reject(new Error("Request body must be valid JSON")); }
    });
    req.on("error", reject);
  });
}

const STATIC_FILES = Object.freeze({
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/intent-renderer.js": ["intent-renderer.js", "text/javascript; charset=utf-8"],
  "/studio.js": ["studio.js", "text/javascript; charset=utf-8"]
});

function serveStatic(reqPath, res) {
  const entry = STATIC_FILES[reqPath];
  if (!entry) return false;
  const [name, contentType] = entry;
  const file = path.join(uiRoot, name);
  if (!fs.existsSync(file)) {
    sendJson(res, 500, { error: `Studio UI file missing: ${name}` });
    return true;
  }
  const body = fs.readFileSync(file);
  res.writeHead(200, {
    "content-type": contentType,
    "content-length": body.length,
    "cache-control": "no-store"
  });
  res.end(body);
  return true;
}

function requestPort(server, configuredPort) {
  return Number(server.address()?.port) || configuredPort;
}

function allowedHost(req, port) {
  const host = String(req.headers.host || "").toLowerCase();
  return new Set([
    `127.0.0.1:${port}`,
    `localhost:${port}`,
    `[::1]:${port}`
  ]).has(host);
}

function allowedOrigin(req, port) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const value = String(origin).toLowerCase();
  return new Set([
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    `http://[::1]:${port}`
  ]).has(value);
}

function secureTokenEqual(actual, expected) {
  if (typeof actual !== "string" || typeof expected !== "string") return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function createStudioServer({
  host = DEFAULT_HOST,
  port = DEFAULT_PORT,
  runner = runCalibration,
  usageCollector = collectCodespacesUsage,
  sessionStartedAt = new Date()
} = {}) {
  if (host !== "127.0.0.1" && host !== "::1" && host !== "localhost") {
    throw new Error("Calibration Studio may only bind to a loopback interface");
  }
  const sessionToken = crypto.randomBytes(32).toString("base64url");
  const server = http.createServer(async (req, res) => {
    securityHeaders(res);
    const activePort = requestPort(server, port);
    if (!allowedHost(req, activePort)) {
      return sendJson(res, 421, { error: "Calibration Studio accepts loopback Host headers only" });
    }

    let url;
    try { url = new URL(req.url || "/", `http://${host}:${activePort}`); }
    catch { return sendJson(res, 400, { error: "Invalid request URL" }); }

    if (req.method === "GET" && url.pathname === "/api/health") {
      return sendJson(res, 200, { status: "ready", product: "Calibration Studio", version: pkg.version });
    }
    if (req.method === "GET" && url.pathname === "/api/status") {
      return sendJson(res, 200, statusPayload(host, activePort));
    }
    if (req.method === "GET" && url.pathname === "/api/session") {
      return sendJson(res, 200, { token: sessionToken });
    }
    if (req.method === "GET" && url.pathname === "/api/codespaces/usage") {
      if (!secureTokenEqual(req.headers["x-calibration-session"], sessionToken)) {
        return sendJson(res, 403, { error: "Studio session token required" });
      }
      const usage = await usageCollector({ sessionStartedAt });
      return sendJson(res, 200, usage);
    }
    if (req.method === "POST" && url.pathname === "/api/command") {
      if (!allowedOrigin(req, activePort)) {
        return sendJson(res, 403, { error: "Cross-origin Studio commands are not allowed" });
      }
      if (!secureTokenEqual(req.headers["x-calibration-session"], sessionToken)) {
        return sendJson(res, 403, { error: "Studio session token required" });
      }
      if (!String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
        return sendJson(res, 415, { error: "Studio commands require application/json" });
      }
      try {
        const input = await readJsonBody(req);
        const started = Date.now();
        const output = await runner(input);
        return sendJson(res, 200, { ...output, duration_ms: Date.now() - started });
      } catch (error) {
        return sendJson(res, 400, { success: false, error: error.message });
      }
    }
    if (req.method === "GET" && serveStatic(url.pathname, res)) return;
    return sendJson(res, 404, { error: "Not found" });
  });
  return server;
}

function listen(server, { host = DEFAULT_HOST, port = DEFAULT_PORT } = {}) {
  return new Promise((resolve, reject) => {
    const onError = (error) => { server.off("listening", onListening); reject(error); };
    const onListening = () => { server.off("error", onError); resolve(server.address()); };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

module.exports = {
  DEFAULT_HOST,
  DEFAULT_PORT,
  ALLOWED_OPERATIONS,
  allowedHost,
  allowedOrigin,
  buildCommandArgs,
  coreEnvironment,
  createStudioServer,
  listen,
  runCalibration,
  secureTokenEqual,
  statusPayload
};
