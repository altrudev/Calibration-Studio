"use strict";

const operation = document.getElementById("operation");
const type = document.getElementById("type");
const form = document.getElementById("studio-form");
const runButton = document.getElementById("run-button");
const resultTitle = document.getElementById("result-title");
const resultBadge = document.getElementById("result-badge");
const resultExit = document.getElementById("result-exit");
const resultDuration = document.getElementById("result-duration");
const liveResult = document.getElementById("live-result");
const downloadResult = document.getElementById("download-result");
const viewResult = document.getElementById("view-result");
let latestResult = null;
let sessionToken = null;

const operationFields = Object.freeze({
  inspect: ["project"],
  discover: ["type", "project", "product"],
  capture: ["type", "project", "url", "targetUrl", "plan", "boundaries"],
  run: ["project", "contract", "observations", "settings"],
  baseline: ["project", "contract", "observations", "settings", "label"],
  compare: ["project", "baseline", "observations", "scope"],
  gate: ["project", "baseline", "plan", "boundaries"],
  trace: ["project", "baseline", "plan", "boundaries"],
  "repair-scope": ["baseline", "before", "mode"],
  repair: ["before", "after"],
  "repair-run": ["project", "baseline", "before", "scope", "plan", "boundaries"],
  runtime: [],
  adapters: [],
  version: []
});

function setChip(id, label, state) {
  const node = document.getElementById(id);
  node.textContent = label;
  node.className = `chip ${state || ""}`.trim();
}

async function ensureSession(force = false) {
  if (sessionToken && !force) return sessionToken;
  const response = await fetch("/api/session", { cache: "no-store" });
  const value = await response.json();
  if (!response.ok || typeof value.token !== "string") throw new Error(value.error || "Studio session initialization failed");
  sessionToken = value.token;
  return sessionToken;
}

async function authenticatedFetch(path, options = {}, retry = true) {
  await ensureSession();
  const headers = new Headers(options.headers || {});
  headers.set("x-calibration-session", sessionToken);
  const response = await fetch(path, { ...options, headers });
  if (response.status === 403 && retry) {
    await ensureSession(true);
    return authenticatedFetch(path, options, false);
  }
  return response;
}

function presentUsage(usage) {
  const value = document.getElementById("core-hours-value");
  const meta = document.getElementById("core-hours-meta");
  const meter = document.getElementById("core-hours-progress");
  const refresh = document.getElementById("usage-refresh");

  refresh.disabled = false;
  meter.hidden = true;
  meter.removeAttribute("value");

  if (usage?.available) {
    const used = Number(usage.used_core_hours || 0);
    const quota = Number.isFinite(usage.included_core_hours) ? Number(usage.included_core_hours) : null;
    value.textContent = quota === null ? `${used.toFixed(1)} used` : `${used.toFixed(1)} / ${quota}`;
    const machine = usage.current_codespace?.machine_cores ? `${usage.current_codespace.machine_cores}-core Codespace` : "Codespace";
    if (quota !== null) {
      meter.max = quota;
      meter.value = Math.min(quota, used);
      meter.hidden = false;
      meta.textContent = `${Number(usage.remaining_core_hours || 0).toFixed(1)} remaining · ${usage.plan || "personal"} plan · ${machine} · billing may lag about 1 hour`;
    } else {
      meta.textContent = `${usage.plan || "account"} · ${machine} · GitHub billing data`;
    }
    return;
  }

  if (Number.isFinite(usage?.current_session_core_hours)) {
    value.textContent = `${Number(usage.current_session_core_hours).toFixed(2)} session`;
    meta.textContent = "Monthly billing counter unavailable with this token; session core-hours are shown instead.";
  } else {
    value.textContent = "Unavailable";
    meta.textContent = "GitHub billing access requires Plan user permission: read.";
  }
}

async function refreshUsage() {
  const refresh = document.getElementById("usage-refresh");
  refresh.disabled = true;
  document.getElementById("core-hours-meta").textContent = "Reading GitHub Codespaces billing usage…";
  try {
    const response = await authenticatedFetch("/api/codespaces/usage", { cache: "no-store" });
    const usage = await response.json();
    if (!response.ok) throw new Error(usage.error || "Codespaces usage request failed");
    presentUsage(usage);
  } catch (error) {
    presentUsage({ available: false });
    document.getElementById("core-hours-meta").textContent = error.message;
  }
}

async function refreshStatus() {
  setChip("core-chip", "Core · connecting", "pending");
  try {
    const response = await fetch("/api/status", { cache: "no-store" });
    const status = await response.json();
    if (!response.ok) throw new Error(status.error || "Status request failed");
    setChip("core-chip", "Core · connected", "good");
    setChip("browser-chip", status.browser?.installed ? "Browser · ready" : "Browser · unavailable", status.browser?.installed ? "good" : "warn");
    setChip("version-chip", `v${status.version}`, "");
    setChip("codespace-chip", status.codespace?.active ? "Codespace · connected" : "Codespace · local mode", status.codespace?.active ? "good" : "");
    await refreshUsage();
  } catch (error) {
    setChip("core-chip", "Core · disconnected", "bad");
    setChip("browser-chip", "Browser · unknown", "warn");
    setChip("codespace-chip", "Codespace · unknown", "warn");
    console.error(error);
  }
}

function showTab(name) {
  document.querySelectorAll(".tab").forEach((button) => button.classList.toggle("active", button.dataset.tab === name));
  document.getElementById("run-view").hidden = name !== "run";
  document.getElementById("artifact-view").hidden = name !== "artifact";
}

document.querySelectorAll(".tab").forEach((button) => button.addEventListener("click", () => showTab(button.dataset.tab)));
document.getElementById("refresh-status").addEventListener("click", refreshStatus);
document.getElementById("usage-refresh").addEventListener("click", refreshUsage);

function updateFields() {
  const fields = new Set(operationFields[operation.value] || []);
  document.querySelectorAll(".conditional").forEach((node) => { node.hidden = !fields.has(node.dataset.field); });
  if (operation.value === "capture") {
    const adapter = type.value;
    const visible = new Set(fields);
    if (adapter === "web-pwa") { visible.delete("project"); visible.delete("targetUrl"); visible.delete("plan"); }
    else if (adapter === "browser-extension") { visible.delete("url"); visible.delete("plan"); }
    else if (adapter === "api" || adapter === "cli") { visible.delete("url"); visible.delete("targetUrl"); }
    else if (adapter === "game") visible.delete("targetUrl");
    document.querySelectorAll(".conditional").forEach((node) => {
      if (["project", "url", "targetUrl", "plan"].includes(node.dataset.field)) node.hidden = !visible.has(node.dataset.field);
    });
  }
}

operation.addEventListener("change", updateFields);
type.addEventListener("change", updateFields);

function value(id) {
  const node = document.getElementById(id);
  return node && !node.closest("[hidden]") ? node.value.trim() : "";
}
function checked(id) { return document.getElementById(id)?.checked === true; }
function payload() {
  return {
    operation: operation.value, type: value("type"), project: value("project"), url: value("url"), targetUrl: value("targetUrl"),
    product: value("product"), plan: value("plan"), contract: value("contract"), observations: value("observations"),
    baseline: value("baseline"), before: value("before"), after: value("after"), scope: value("scope"), settings: value("settings"),
    label: value("label"), mode: value("mode"), confirmExecution: checked("confirmExecution"), headed: checked("headed"),
    offlineProbe: checked("offlineProbe"), allowEffectful: checked("allowEffectful"), allowRemoteTarget: checked("allowRemoteTarget"),
    allowPersistentState: checked("allowPersistentState"), allowInheritEnv: checked("allowInheritEnv")
  };
}
function setRunning(running) { runButton.disabled = running; runButton.textContent = running ? "Running…" : "Run operation"; }
function present(output) {
  latestResult = output?.result ?? null;
  const success = output?.success === true;
  resultTitle.textContent = output?.operation ? output.operation.replace(/-/g, " ") : "Result";
  resultBadge.textContent = success ? "Passed" : (output?.exit_code === 2 ? "Gate failed" : "Needs attention");
  resultBadge.className = `result-badge ${success ? "good" : "bad"}`;
  resultExit.textContent = output?.exit_code ?? "—";
  resultDuration.textContent = Number.isFinite(output?.duration_ms) ? `${output.duration_ms} ms` : "—";
  const display = output?.result ?? output;
  liveResult.textContent = JSON.stringify(display, null, 2);
  if (output?.stderr) liveResult.textContent += `\n\n--- diagnostic output ---\n${output.stderr}`;
  downloadResult.disabled = !latestResult;
  const schema = latestResult?.schema;
  viewResult.disabled = !schema || typeof window.render !== "function" || typeof window.verifyIntegrity !== "function";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault(); setRunning(true); resultBadge.textContent = "Running"; resultBadge.className = "result-badge neutral";
  liveResult.textContent = "Calibration Core is running the selected operation inside the Codespace…";
  try {
    const response = await authenticatedFetch("/api/command", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload())
    });
    const output = await response.json();
    if (!response.ok && !output.result) throw new Error(output.error || "Studio operation failed");
    present(output);
    refreshUsage().catch(() => {});
  } catch (error) {
    latestResult = null; resultTitle.textContent = "Operation error"; resultBadge.textContent = "Error"; resultBadge.className = "result-badge bad";
    resultExit.textContent = "—"; resultDuration.textContent = "—"; liveResult.textContent = error.message; downloadResult.disabled = true; viewResult.disabled = true;
  } finally { setRunning(false); }
});

downloadResult.addEventListener("click", () => {
  if (!latestResult) return;
  const blob = new Blob([`${JSON.stringify(latestResult, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url;
  anchor.download = `calibration-${operation.value}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
});

viewResult.addEventListener("click", async () => {
  if (!latestResult || typeof window.render !== "function" || typeof window.verifyIntegrity !== "function") return;
  try { await window.verifyIntegrity(latestResult); window.render(latestResult); showTab("artifact"); }
  catch (error) { alert(`Could not open result in viewer: ${error.message}`); }
});

updateFields();
refreshStatus();
