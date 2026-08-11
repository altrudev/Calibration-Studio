"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildCommandArgs,
  createStudioServer,
  listen
} = require("../src/studio/server");

test("Studio command builder exposes only allow-listed Calibration operations", () => {
  assert.deepEqual(buildCommandArgs({ operation: "inspect", project: "/tmp/project" }), ["inspect", "--project", "/tmp/project"]);
  assert.deepEqual(buildCommandArgs({ operation: "discover", type: "web-pwa", project: "/tmp/project" }), ["discover", "--project", "/tmp/project", "--type", "web-pwa"]);
  assert.deepEqual(buildCommandArgs({ operation: "repair-scope", baseline: "base.json", before: "before.json", mode: "full" }), ["repair-scope", "--baseline", "base.json", "--before", "before.json", "--mode", "full"]);
  assert.throws(() => buildCommandArgs({ operation: "arbitrary-shell" }), /Unsupported Studio operation/);
  assert.throws(() => buildCommandArgs({ operation: "capture", type: "unknown" }), /Unsupported adapter type/);
  assert.throws(() => buildCommandArgs({ operation: "repair-scope", mode: "everything" }), /Unsupported repair scope mode/);
});

test("Studio server stays loopback-only", () => {
  assert.throws(() => createStudioServer({ host: "0.0.0.0" }), /loopback/);
});

test("Studio health, status and command API are connected", async (t) => {
  const calls = [];
  const server = createStudioServer({
    host: "127.0.0.1",
    port: 0,
    runner: async (input) => {
      calls.push(input);
      return { operation: input.operation, success: true, exit_code: 0, signal: null, stderr: "", result: { schema: "test/result", ok: true } };
    }
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

  const commandResponse = await fetch(`http://127.0.0.1:${port}/api/command`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ operation: "inspect", project: "/tmp/product" })
  });
  const command = await commandResponse.json();
  assert.equal(command.success, true);
  assert.equal(command.result.ok, true);
  assert.deepEqual(calls, [{ operation: "inspect", project: "/tmp/product" }]);
});

test("Studio server rejects non-JSON command requests and unknown static paths", async (t) => {
  const server = createStudioServer({ host: "127.0.0.1", port: 0, runner: async () => ({}) });
  await listen(server, { host: "127.0.0.1", port: 0 });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;

  const badCommand = await fetch(`http://127.0.0.1:${port}/api/command`, { method: "POST", body: "{}" });
  assert.equal(badCommand.status, 415);

  const missing = await fetch(`http://127.0.0.1:${port}/../../package.json`);
  assert.equal(missing.status, 404);
});
