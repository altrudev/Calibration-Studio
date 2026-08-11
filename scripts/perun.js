"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const ignoredDirs = new Set([".git", "node_modules", "build", "dist", "runtime", ".playwright", "out", "stage"]);
const findings = [];

function rel(file) {
  return path.relative(repoRoot, file).split(path.sep).join("/");
}

function walk(relative = ".") {
  const root = path.join(repoRoot, relative);
  if (!fs.existsSync(root)) return [];
  const out = [];
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory() && ignoredDirs.has(entry.name)) continue;
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) visit(next);
      else if (entry.isFile()) out.push(next);
    }
  }
  visit(root);
  return out;
}

function text(file) {
  try { return fs.readFileSync(file, "utf8"); }
  catch { return ""; }
}

function fail(code, message) {
  findings.push(`${code}: ${message}`);
}

function assert(condition, code, message) {
  if (!condition) fail(code, message);
}

function run(command, args, label, { env = process.env } = {}) {
  process.stdout.write(`\n== PERUN · ${label} ==\n`);
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env,
    stdio: "inherit",
    shell: false,
    windowsHide: true
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    fail("PERUN-RUN", `${label} exited with status ${result.status ?? 1}`);
    return false;
  }
  return true;
}

function staticBoundaryAudit() {
  process.stdout.write("\n== PERUN · static security boundary ==\n");
  const all = walk(".");
  const forbiddenNames = all.filter((file) => {
    const base = path.basename(file);
    return /\.(?:pem|key|p12|pfx)$/i.test(base) || base === ".env";
  });
  for (const file of forbiddenNames) fail("PERUN-SECRET-FILE", rel(file));

  const productionRoots = ["src", "bin", "ui", "launch", ".github", ".devcontainer"];
  const credentialPatterns = [
    /-----BEGIN [A-Z][A-Z ]* PRIVATE KEY-----/,
    /\bghp_[A-Za-z0-9_]{20,}\b/,
    /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bsk-[A-Za-z0-9]{20,}\b/
  ];
  for (const root of productionRoots) {
    for (const file of walk(root)) {
      if (rel(file) === "src/public/redaction.js") continue;
      const value = text(file);
      if (credentialPatterns.some((pattern) => pattern.test(value))) {
        fail("PERUN-CREDENTIAL", `potential credential material in ${rel(file)}`);
      }
    }
  }

  const jsFiles = [...walk("src"), ...walk("bin")].filter((file) => /\.(?:js|mjs|cjs)$/.test(file));
  const forbiddenExecution = [
    [/\beval\s*\(/, "eval"],
    [/\bnew\s+Function\s*\(/, "new Function"],
    [/\bexec(?:Sync|File|FileSync)?\s*\(/, "exec family"],
    [/\bshell\s*:\s*true\b/, "shell:true"]
  ];
  for (const file of jsFiles) {
    const value = text(file);
    for (const [pattern, label] of forbiddenExecution) {
      if (pattern.test(value)) fail("PERUN-EXEC", `${label} in ${rel(file)}`);
    }
  }

  for (const file of walk("ui") {
    if (!/\.(?:html?|js|css)$/i.test(file)) continue;
    if (/<(?:script|link)\b[^>]+https?:\/\//i.test(text(file))) {
      fail("PERUN-REMOTE-UI", `remote runtime asset in ${rel(file)}`);
    }
  }

  for (const file of walk("launch")) {
    const value = text(file);
    assert(value.includes("15m"), "PERUN-LAUNCHER-IDLE", `${rel(file)} must retain the 15-minute Codespace idle timeout`);
    assert(value.includes("168h"), "PERUN-LAUNCHER-RETENTION", `${rel(file)} must retain the 7-day Codespace retention period`);
    const dangerousBootstrap = [
      /curl[^\n|]|*\p\s*(?:sh|bash)\b/i,
      /wget[^\n|]*\|\s*(?:sh|bash)\b/i,
      /\bInvoke-Expression\b/i,
      /\biex\s*\(/i,
      /-EncodedCommand\b/i
    ];
    if (dangerousBootstrap.some((pattern) => pattern.test(value))) {
      fail("PERUN-LAUNCHER-RCE", `remote or encoded execution primitive in ${rel(file)}`);
    }
  }

  const serverFile = path.join(repoRoot, "src/studio/server.js");
  const server = text(serverFile);
  assert(server.includes("loopback Host headers only"), "PERUN-STUDIO-HOST", "Studio Host-header defense is missing");
  assert(server.includes("Cross-origin Studio commands are not allowed"), "PERUN-STUDIO-ORIGIN", "Studio Origin defense is missing");
  assert(server.includes("Studio session token required"), "PERUN-STUDIO-TOKEN", "Studio session capability check is missing");
  assert(!server.includes('host = "0.0.0.0"'), "PERUN-STUDIO-BIND", "Studio must not default-bind to 0.0.0.0");

  const devcontainerFile = path.join(repoRoot, ".devcontainer/devcontainer.json");
  if (fs.existsSync(devcontainerFile)) {
    const config = JSON.parse(text(devcontainerFile));
    assert(!Object.prototype.hasOwnProperty.call(config, "image"), "PERUN-CODESPACE-IMAGE", "Codespace config should retain GitHub's default base image");
    assert(Array.isArray(config.forwardPorts) && config.forwardPorts.includes(4317), "PERUN-CODESPACE-PORT", "Codespace must forward Studio port 4317");
    const portConfig = config.portsAttributes?.["4317"] || {};
    assert(String(portConfig.visibility || "private").toLowerCase() !== "public", "PERUN-CODESPACE-PUBLIC", "Studio Codespace port must never be public by configuration");
    assert(Number(config.hostRequirements?.cpus) === 2, "PERUN-CODESPACE-CORES", "Codespace host requirement must remain at the minimum 2 cores");
  } else {
    fail("PERUN-CODESPACE-CONFIG", ".devcontainer/devcontainer.json is missing");
  }

  const workflows = walk(".github/workflows").filter((file) => /\.ya?ml$/i.test(file));
  for (const file of workflows) {
    const value = text(file);
    assert(/\bworkflow_dispatch\s*:/.test(value), "PERUN-ACTIONS-TRIGGER", `${rel(file)} is not manual-only`);
    assert(!/^\s*(?:push|pull_request|schedule)\s*:/m.test(value), "PERUN-ACTIONS-AUTO", `${rel(file)} contains an automatic trigger`);
    const actionUses = [...value.matchAll(/uses:\s*([^\s#]+)/g)].map((match) => match[1]);
    for (const use of actionUses) {
      const at = use.lastIndexOf("@");
      const ref = at >= 0 ? use.slice(at + 1) : "";
      assert(/^[0-9a-f]{40}$/i.test(ref), "PERUN-ACTIONS-PIN", `${rel(file)} action is not pinned to a full commit SHA: ${use}`);
    }
  }

  const nodeMajor = Number(process.versions.node.split(".")[0]);
  assert(nodeMajor >= 24, "PERUN-NODE-RUNTIME", `Perun requires Node.js 24+, found ${process.version}`);
  const nvmrc = text(path.join(repoRoot, ".nvmrc")).trim();
  assert(nvmrc === "24.19.0", "PERUN-NODE-PIN", `.nvmrc must pin 24.19.0, found ${nvmrc || "missing"}`);

  const pkg = JSON.parse(text(path.join(repoRoot, "package.json")));
  const lock = JSON.parse(text(path.join(repoRoot, "package-lock.json")));
  assert(pkg.private === true, "PERUN-PACKAGE-PRIVATE", "package.json must remain private");
  assert(!pkg.scripts?.preinstall && !pkg.scripts?.install && !pkg.scripts?.postinstall, "PERUN-INSTALL-HOOK", "root package must not define automatic install lifecycle scripts");
  for (const [name, expected] of Object.entries({ playwright: "1.62.1", yaml: "2.9.0", "node-pty": "1.1.0" })) {
    const current = pkg.dependencies?.[name] ?? pkg.optionalDependencies?.[name];
    assert(current === expected, "PERUN-DEPENDENCY-PIN", `${name} must be exactly ${expected}, found ${current || "missing"}`);
  }
  for (const [name, entry] of Object.entries(lock.packages || {})) {
    if (!name || !name.startsWith("node_modules/")) continue;
    assert(typeof entry.integrity === "string" && /^sha512-/.test(entry.integrity), "PERUN-INTEGRITY", `${name} lacks SHA-512 lock integrity`);
    if (entry.resolved) assert(/^https:\/\/registry\.npmjs\.org\//.test(entry.resolved), "PERUN-REGISTRY", `${name} resolves outside registry.npmjs.org`);
  }

  if (findings.length === 0) process.stdout.write("Static security boundary passed.\n");
}

function main() {
  const offline = process.argv.includes("--offline");
  staticBoundaryAudit();

  run(process.execPath, ["scripts/check-source.js"], "source syntax / schema parse");
  run(npm, ["test"], "regression and adversarial tests");
  run(npm, ["ls", "--all"], "dependency graph integrity");

  if (!offline) {
    run(npm, ["audit", "--omit=dev", "--audit-level=low"], "dependency vulnerability audit (all severities)");
    run(npm, ["audit", "signatures"], "registry signatures / attestations");
  } else {
    process.stdout.write("\nPERUN offline mode: network vulnerability/signature checks intentionally skipped.\n");
  }

  if (findings.length) {
    process.stderr.write("\nPERUN FAILED\n");
    for (const finding of [...new Set(findings)].sort()) process.stderr.write(` - ${finding}\n`);
    process.exit(1);
  }
  process.stdout.write("\nPERUN PASSED · no blocking findings in requested scope.\n");
}

try { main(); }
catch (error) {
  process.stderr.write(`PERUN ERROR: ${error.message}\n`);
  process.exit(1);
}
