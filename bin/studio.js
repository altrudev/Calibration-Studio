#!/usr/bin/env node
"use strict";

const http = require("node:http");
const { spawn } = require("node:child_process");
const {
  DEFAULT_HOST,
  DEFAULT_PORT,
  createStudioServer,
  listen
} = require("../src/studio/server");

function parse(argv) {
  const out = { port: DEFAULT_PORT, open: true };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--no-open") out.open = false;
    else if (arg === "--port") {
      const value = Number(argv[++i]);
      if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error("--port must be an integer from 1 to 65535");
      out.port = value;
    } else throw new Error(`Unknown option: ${arg}`);
  }
  return out;
}

function openBrowser(url) {
  let command;
  let args;
  if (process.platform === "win32") {
    command = process.env.ComSpec || "cmd.exe";
    args = ["/d", "/s", "/c", "start", "", url];
  } else if (process.platform === "darwin") {
    command = "open";
    args = [url];
  } else {
    command = "xdg-open";
    args = [url];
  }
  try {
    const child = spawn(command, args, { detached: true, stdio: "ignore", shell: false, windowsHide: true });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

function probeExisting(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: DEFAULT_HOST, port, path: "/api/health", timeout: 700 }, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        try {
          const value = JSON.parse(body);
          resolve(res.statusCode === 200 && value.product === "Calibration Studio");
        } catch { resolve(false); }
      });
    });
    req.on("timeout", () => { req.destroy(); resolve(false); });
    req.on("error", () => resolve(false));
  });
}

async function main() {
  const options = parse(process.argv);
  const url = `http://${DEFAULT_HOST}:${options.port}`;
  if (await probeExisting(options.port)) {
    console.log(`Calibration Studio is already running at ${url}`);
    if (options.open) openBrowser(url);
    return;
  }

  const server = createStudioServer({ host: DEFAULT_HOST, port: options.port });
  try {
    await listen(server, { host: DEFAULT_HOST, port: options.port });
  } catch (error) {
    if (error.code === "EADDRINUSE") throw new Error(`Port ${options.port} is already in use. Start with --port PORT to choose another local port.`);
    throw error;
  }

  console.log(`Calibration Studio ready: ${url}`);
  console.log("Close this window or press Ctrl+C to stop the local Studio service.");
  if (options.open) {
    setTimeout(() => {
      if (!openBrowser(url)) console.log(`Open ${url} in your browser.`);
    }, 150);
  }

  const stop = () => server.close(() => process.exit(0));
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Calibration Studio startup error: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { main, openBrowser, parse, probeExisting };
