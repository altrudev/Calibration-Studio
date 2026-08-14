"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

test("Calibration Studio validation remains local/manual with no GitHub Actions workflows", () => {
  const workflowsDir = path.join(repoRoot, ".github", "workflows");
  if (!fs.existsSync(workflowsDir)) return;
  const workflows = fs.readdirSync(workflowsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(workflows, [], `GitHub Actions workflows are not part of the Calibration Studio validation architecture: ${workflows.join(", ")}`);
});
