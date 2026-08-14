"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { CONTAINER_LIMITS, containerCommand } = require("../src/adapters/cli/process-driver");
const { normalizeCliPlan } = require("../src/adapters/cli/plan");

const PINNED_IMAGE = `node@sha256:${"a".repeat(64)}`;

function optionValue(args, option) {
  const index = args.indexOf(option);
  assert.notEqual(index, -1, `${option} must be present`);
  return args[index + 1];
}

test("CLI container sandbox enforces no-pull, immutable image, least privilege and resource ceilings", () => {
  const root = path.resolve("/tmp/calibration-cli-container-test");
  const plan = normalizeCliPlan({
    protocol: "calibration-cli-plan/0.5",
    command: "node",
    args: ["app.js"],
    sandbox: { mode: "container", runtime: "docker", image: PINNED_IMAGE, network: "none" }
  });
  const wrapped = containerCommand(plan, root, "/tmp/home", "docker");

  assert.equal(plan.sandbox.image, PINNED_IMAGE);
  assert.equal(optionValue(wrapped.args, "--pull"), "never");
  assert.equal(optionValue(wrapped.args, "--network"), "none");
  assert.equal(optionValue(wrapped.args, "--cap-drop"), "ALL");
  assert.equal(optionValue(wrapped.args, "--security-opt"), "no-new-privileges");
  assert.equal(optionValue(wrapped.args, "--pids-limit"), String(CONTAINER_LIMITS.pids));
  assert.equal(optionValue(wrapped.args, "--memory"), `${CONTAINER_LIMITS.memoryMb}m`);
  assert.equal(optionValue(wrapped.args, "--cpus"), String(CONTAINER_LIMITS.cpus));
  assert.ok(wrapped.args.includes("--read-only"));
  assert.ok(wrapped.args.some((value) => value.startsWith("/tmp:rw,nosuid,nodev,size=")));
  assert.ok(wrapped.args.some((value) => value.startsWith("/home/calibration:rw,nosuid,nodev,size=")));
  assert.deepEqual(wrapped.limits, CONTAINER_LIMITS);
});

test("CLI container refuses mutable image tags", () => {
  assert.throws(() => normalizeCliPlan({
    protocol: "calibration-cli-plan/0.5",
    command: "node",
    sandbox: { mode: "container", runtime: "docker", image: "node:24-bookworm-slim", network: "none" }
  }), /must be pinned by immutable sha256 digest/);
});

test("CLI container bridge networking remains explicit rather than silently enabled", () => {
  const root = path.resolve("/tmp/calibration-cli-container-test");
  const plan = normalizeCliPlan({
    protocol: "calibration-cli-plan/0.5",
    command: "node",
    sandbox: { mode: "container", runtime: "docker", image: PINNED_IMAGE, network: "bridge" }
  });
  const wrapped = containerCommand(plan, root, "/tmp/home", "docker");
  assert.equal(optionValue(wrapped.args, "--network"), "bridge");
  assert.equal(optionValue(wrapped.args, "--pull"), "never");
});
