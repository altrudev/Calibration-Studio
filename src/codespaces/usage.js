"use strict";

const { spawn } = require("node:child_process");
const os = require("node:os");

const API_VERSION = "2026-03-10";
const FREE_CORE_HOURS = 120;
const PRO_CORE_HOURS = 180;
const MAX_STDOUT = 1024 * 1024;
const MAX_STDERR = 256 * 1024;

function runGh(args, { timeoutMs = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("gh", args, { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(value);
    };
    const timer = setTimeout(() => { try { child.kill(); } catch {} finish(new Error("GitHub CLI request timed out")); }, timeoutMs);
    child.stdout.on("data", (chunk) => { if (stdout.length < MAX_STDOUT) stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { if (stderr.length < MAX_STDERR) stderr += chunk.toString("utf8"); });
    child.once("error", (error) => finish(error));
    child.once("close", (code) => {
      if (code !== 0) return finish(new Error(stderr.trim() || `GitHub CLI exited with code ${code}`));
      finish(null, stdout.trim());
    });
  });
}

async function jsonGh(args, options) {
  const output = await runGh(args, options);
  return output ? JSON.parse(output) : {};
}

function quantityToHours(quantity, unitType) {
  const value = Number(quantity) || 0;
  const unit = String(unitType || "hours").toLowerCase();
  if (unit.includes("second")) return value / 3600;
  if (unit.includes("minute")) return value / 60;
  return value;
}

function parseCodespacesUsage(summary = {}) {
  const items = Array.isArray(summary.usageItems) ? summary.usageItems : [];
  let coreHours = 0;
  let machineHours = 0;
  let grossAmount = 0;
  const compute = [];
  const storage = [];

  for (const item of items) {
    const product = String(item.product || "").toLowerCase();
    const sku = String(item.sku || "").toLowerCase();
    if (product !== "codespaces" && !sku.startsWith("codespaces_")) continue;
    grossAmount += Number(item.grossAmount ?? 0) || 0;
    const quantity = Number(item.grossQuantity ?? item.quantity ?? 0) || 0;
    const match = sku.match(/^codespaces_compute_d(2|4|8|16|32)$/);
    if (match) {
      const cores = Number(match[1]);
      const hours = quantityToHours(quantity, item.unitType);
      const unit = String(item.unitType || "hours").toLowerCase();
      const itemCoreHours = unit.includes("core") ? hours : hours * cores;
      const itemMachineHours = unit.includes("core") ? hours / cores : hours;
      machineHours += itemMachineHours;
      coreHours += itemCoreHours;
      compute.push({ sku, cores, machine_hours: Number(itemMachineHours.toFixed(3)), core_hours: Number(itemCoreHours.toFixed(3)) });
      continue;
    }
    if (sku === "codespaces_storage" || sku === "codespaces_prebuild_storage") {
      storage.push({ sku, quantity: Number(quantity.toFixed(3)), unit_type: item.unitType || null });
    }
  }
  return { core_hours: Number(coreHours.toFixed(3)), machine_hours: Number(machineHours.toFixed(3)), gross_amount: Number(grossAmount.toFixed(4)), compute, storage };
}

function includedCoreHours(planName) {
  const plan = String(planName || "").toLowerCase();
  if (plan === "free") return FREE_CORE_HOURS;
  if (plan === "pro") return PRO_CORE_HOURS;
  return null;
}

function safeError(error) {
  return String(error?.message || error || "unknown error")
    .replace(/ghp_[A-Za-z0-9_]+/g, "[REDACTED]")
    .replace(/github_pat_[A-Za-z0-9_]+/g, "[REDACTED]")
    .slice(0, 500);
}

async function currentCodespaceInfo() {
  const name = process.env.CODESPACE_NAME || null;
  if (!name) return null;
  try {
    const data = await jsonGh(["api", "-H", `X-GitHub-Api-Version: ${API_VERSION}`, `user/codespaces/${encodeURIComponent(name)}`]);
    return {
      name: data.name || name,
      state: data.state || null,
      machine_name: data.machine?.name || null,
      machine_cores: Number(data.machine?.cpus) || null,
      billable_owner: data.billable_owner?.login || null,
      idle_timeout_minutes: Number(data.idle_timeout_minutes) || null
    };
  } catch (error) {
    const localCores = typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length;
    return { name, machine_cores: Number(localCores) || null, source: "local-runtime", error: safeError(error) };
  }
}

async function collectCodespacesUsage({ now = new Date(), sessionStartedAt = null } = {}) {
  const base = {
    available: false,
    source: "github-billing-api",
    measured_at: now.toISOString(),
    reporting_note: "GitHub reports Codespaces compute usage to billing hourly.",
    required_permission: "Plan user permission: read",
    current_codespace: await currentCodespaceInfo()
  };
  if (base.current_codespace?.machine_cores && sessionStartedAt) {
    const elapsedHours = Math.max(0, now.getTime() - new Date(sessionStartedAt).getTime()) / 3600000;
    base.current_session_core_hours = Number((elapsedHours * base.current_codespace.machine_cores).toFixed(3));
  } else base.current_session_core_hours = null;

  try {
    const user = await jsonGh(["api", "-H", `X-GitHub-Api-Version: ${API_VERSION}`, "user"]);
    const login = user.login;
    if (!login) throw new Error("GitHub CLI did not return an authenticated user");
    const planName = String(user.plan?.name || "").toLowerCase() || null;
    const personalBillable = !base.current_codespace?.billable_owner || base.current_codespace.billable_owner === login;
    const quota = personalBillable ? includedCoreHours(planName) : null;
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const summary = await jsonGh(["api", "-H", `X-GitHub-Api-Version: ${API_VERSION}`, `users/${encodeURIComponent(login)}/settings/billing/usage/summary?year=${year}&month=${month}&product=codespaces`], { timeoutMs: 15000 });
    const usage = parseCodespacesUsage(summary);
    const remaining = quota === null ? null : Math.max(0, quota - usage.core_hours);
    return {
      ...base, available: true, user: login, plan: planName, period: { year, month }, used_core_hours: usage.core_hours,
      included_core_hours: quota, remaining_core_hours: remaining === null ? null : Number(remaining.toFixed(3)),
      percent_used: quota ? Number(Math.min(100, (usage.core_hours / quota) * 100).toFixed(1)) : null,
      machine_hours: usage.machine_hours, gross_amount: usage.gross_amount, compute: usage.compute, storage: usage.storage
    };
  } catch (error) {
    return { ...base, error: safeError(error) };
  }
}

module.exports = { API_VERSION, FREE_CORE_HOURS, PRO_CORE_HOURS, collectCodespacesUsage, includedCoreHours, parseCodespacesUsage, quantityToHours, runGh };
