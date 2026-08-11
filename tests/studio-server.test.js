"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const {
  buildCommandArgs,
  coreEnvironment,
  createStudioServer,
  listen
} = require("../src/studio/server");

async function session(port) {
  const response = await fetch(`http://127.0.0.1:${port}/api/session`);
  assert.equal(response.status, 200);
  return (await response.json()).token;
}

test("Studio command builder exposes only allow-listed Calibration operations", () => {
  assert.deepEqual(buildCommandArgs({ operation: "inspect", project: "/tmp/project" }), ["inspect", "--project", "/tmp/project"]);
  assert.deepEqual(buildCommandArgs({ operation: "discover", type: "web-pwa", project: "/tmp/project" }), ["discover", "--project", "/tmp/project", "--type", "web-pwa"]);
  assert.deepEqual(buildCommandArgs({ operation: "repair-scope", baseline: "base.json", before: "before.json", mode: "full" }), ["repair-scope", "--baseline", "base.json", "--before", "before.json", "--mode", "full"]);
  assert.throws(() => buildCommandArgs({ operation: "arbitrary-shell" }), /Unsupported Studio operation/);
  assert.throws(() => buildCommandArgs({ operation: "capture", type: "unknown" }), /Unsupported adapter type/);
  assert.throws(() => buildCommandArgs({ operation: "repair-scope", mode: "everything" }), /Unsupported repair scope mode/);
});


test("Studio Core subprocess environment excludes host credentials", () => {
  const env = coreEnvironment({
    PATH: "/usr/bin",
    HOME: "/home/codespace",
    GITHUB_TOKEN: "secret",
    GH_TOKEN: "secret",
    SSH_AUTH_SOCK: "/tmp/agent",
    NODE_OPTIONS: "--require attacker.js",
    CUSTOM_SECRET: "secret"
  });
  assert.equal(env.PATH, "/usr/bin");
  assert.equal(env.HOME, "/home/codespace");
  assert.equal(env.GITHUB_TOKEN, undefined);
  assert.equal(env.GH_TOKEN, undefined);
  assert.equal(env.SSH_AUTH_SOCK, undefined);
  assert.equal(env.NODE_OPTIONS, undefined);
  assert.equal(env.CUSTOM_SECRET, undefined);
});

test("Studio server stays loopback-only", () => {
  assert.throws(() => createStudioServer({ host: "0.0.0.0" }), /loopback/);
});

test("Studio health, status, usage and command API are connected", async (t) => {
  const calls = [];
  const server = createStudioServer({
    host: "127.0.0.1",
    port: 0,
    runner: async (input) => {
      calls.push(input);
      return { operation: input.operation, success: true, exit_code: 0, signal: null, stderr: "", result: { schema: "test/result", ok: true } };
    },
    usageCollector: async () => ({ available: true, used_core_hours: 12, included_core_hours: 120, percent_used: 10 })
  });
  await listen(server, { host: "127.0.0.1", port: 0 });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;

  const health = await fetch(`http://127.0.0.1:${port}/api/health`).then((r) => r.json());
  assert.equal(health.status, "ready");
  assert.equal(health.product, "Calibration Studio");

  const statusResponse = await fetch(`http://127.0.0.1:${port}/api/status`);
  const status = await statusResponse.json();
  assert.equal(status.service.loopback_only, true);
  assert.equal(status.service.port, port);

  const token = await session(port);
  const usageResponse = await fetch(`http://127.0.0.1:${port}/api/codespaces/usage`, {
    headers: { "x-calibration-session": token }
  });
  assert.equal(usageResponse.status, 200);
  assert.equal((await usageResponse.json()).used_core_hours, 12);

  const commandResponse = await fetch(`http://127.0.0.1:${port}/api/command`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-calibration-session": token,
      "origin": `http://127.0.0.1:${port}`
    },
    body: JSON.stringify({ operation: "inspect", project: "/tmp/product" })
  });
  const command = await commandResponse.json();
  assert.equal(command.success, true);
  assert.equal(command.result.ok, true);
  assert.deepEqual(calls, [{ operation: "inspect", project: "/tmp/product" }]);
});

test("Studio command API rejects missing token and cross-origin requests", async (t) => {
  const server = createStudioServer({ host: "127.0.0.1", port: 0, runner: async () => ({ success: true }) });
  await listen(server, { host: "127.0.0.1", port: 0 });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;
  const token = await session(port);

  const missingToken = await fetch(`http://127.0.0.1:${port}/api/command`, {
    method: "POST",
    headers: { "content-type": "application/json", "origin": `http://127.0.0.1:${port}` },
    body: "{}"
  });
  assert.equal(missingToken.status, 403);

  const crossOrigin = await fetch(`http://127.0.0.1:${port}/api/command`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-calibration-session": token,
      "origin": "https://example.invalid"
    },
    body: "{}"
  });
  assert.equal(crossOrigin.status, 403);
});

test("Studio server rejects hostile Host headers, non-JSON commands and unknown static paths", async (t) => {
  const server = createStudioServer({ host: "127.0.0.1", port: 0, runner: async () => ({}) });
  await listen(server, { host: "127.0.0.1", port: 0 });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;
  const token = await session(port);

  const badHostStatus = await new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: "/api/health", headers: { Host: `attacker.invalid:${port}` } }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode));
    });
    req.on("error", reject);
    req.end();
  });
  assert.equal(badHostStatus, 421);

  const badCommand = await fetch(`http://127.0.0.1:${port}/api/command`, {
    method: "POST",
    headers: { "x-calibration-session": token, "origin": `http://127.0.0.1:${port}` },
    body: "{}"
  });
  assert.equal(badCommand.status, 415);

  const missing = await fetch(`http://127.0.0.1:${port}/../../package.json`);
  assert.equal(missing.status, 404);
});
