"use strict";
const fs = require("node:fs");
const path = require("node:path");

const MANIFEST_CANDIDATES = ["manifest.json","dist/manifest.json","build/manifest.json","extension/manifest.json","public/manifest.json"];
const SOURCE_EXTENSIONS = new Set([".js",".mjs",".cjs",".html",".htm"]);
const IGNORED_DIRS = new Set([".git","node_modules"]);
const MAX_SCAN_FILES = 2000;
const MAX_SCAN_BYTES = 2 * 1024 * 1024;

function sortedUnique(value) { return [...new Set(Array.isArray(value) ? value.filter((x) => typeof x === "string") : [])].sort(); }
function firstExisting(root, candidates) { return candidates.find((relative) => fs.existsSync(path.join(root, relative))) || null; }
function safeJson(file) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; } }
function relativeTo(root, file) { return path.relative(root, file).split(path.sep).join("/"); }

function collectSourceFiles(root) {
  const files = [];
  function walk(dir) {
    if (files.length >= MAX_SCAN_FILES) return;
    for (const entry of fs.readdirSync(dir, {withFileTypes:true})) {
      if (files.length >= MAX_SCAN_FILES) break;
      if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        try { if (fs.statSync(absolute).size <= MAX_SCAN_BYTES) files.push(absolute); } catch { /* ignore unreadable files */ }
      }
    }
  }
  walk(root);
  return files;
}

function scanSources(root) {
  const namespaces = new Set();
  const remoteExecutableReferences = [];
  const dynamicCodePatterns = [];
  const files = collectSourceFiles(root);
  const namespacePattern = /\b(?:chrome|browser)\.([A-Za-z][A-Za-z0-9_]*)\b/g;
  const remotePatterns = [
    {kind:"remote-script", re:/<script\b[^>]*\bsrc\s*=\s*["']https?:\/\//ig},
    {kind:"remote-module-import", re:/\b(?:import\s*\(|from\s+)["']https?:\/\//ig},
    {kind:"remote-worker", re:/\b(?:new\s+Worker|importScripts)\s*\(\s*["']https?:\/\//ig}
  ];
  const dynamicPatterns = [
    {kind:"eval", re:/\beval\s*\(/g},
    {kind:"new-function", re:/\bnew\s+Function\s*\(/g}
  ];
  for (const file of files) {
    let text;
    try { text = fs.readFileSync(file, "utf8"); } catch { continue; }
    for (const match of text.matchAll(namespacePattern)) namespaces.add(match[1]);
    for (const pattern of remotePatterns) { pattern.re.lastIndex = 0; if (pattern.re.test(text)) remoteExecutableReferences.push({file:relativeTo(root,file),kind:pattern.kind}); }
    for (const pattern of dynamicPatterns) { pattern.re.lastIndex = 0; if (pattern.re.test(text)) dynamicCodePatterns.push({file:relativeTo(root,file),kind:pattern.kind}); }
  }
  return {
    scanned_files: files.length,
    truncated: files.length >= MAX_SCAN_FILES,
    api_namespaces: [...namespaces].sort(),
    remote_executable_references: remoteExecutableReferences,
    dynamic_code_patterns: dynamicCodePatterns
  };
}

function declaredFileSet(manifest = {}) {
  const files = [];
  if (typeof manifest.background?.service_worker === "string") files.push({role:"service-worker",file:manifest.background.service_worker});
  for (const file of manifest.background?.scripts || []) if (typeof file === "string") files.push({role:"background-script",file});
  const popup = manifest.action?.default_popup || manifest.browser_action?.default_popup || manifest.page_action?.default_popup;
  if (typeof popup === "string") files.push({role:"popup",file:popup});
  const options = manifest.options_ui?.page || manifest.options_page;
  if (typeof options === "string") files.push({role:"options",file:options});
  if (typeof manifest.side_panel?.default_path === "string") files.push({role:"side-panel",file:manifest.side_panel.default_path});
  for (const script of manifest.content_scripts || []) {
    for (const file of script.js || []) if (typeof file === "string") files.push({role:"content-script",file});
    for (const file of script.css || []) if (typeof file === "string") files.push({role:"content-style",file});
  }
  return files;
}

function discoverBrowserExtensionProject(projectDir) {
  const root = path.resolve(projectDir || process.cwd());
  const manifestRelative = firstExisting(root, MANIFEST_CANDIDATES);
  if (!manifestRelative) throw new Error("Browser Extension discovery requires a manifest.json");
  const manifestRoot = path.dirname(path.join(root, manifestRelative));
  const manifest = safeJson(path.join(root, manifestRelative));
  if (!manifest || typeof manifest !== "object") throw new Error(`Unable to parse ${manifestRelative}`);
  const declaredFiles = declaredFileSet(manifest).map((entry) => ({...entry,exists:fs.existsSync(path.join(manifestRoot,entry.file))}));
  const missingFiles = declaredFiles.filter((entry) => !entry.exists);
  const contentScripts = Array.isArray(manifest.content_scripts) ? manifest.content_scripts : [];
  const scan = scanSources(manifestRoot);
  const permissions = sortedUnique(manifest.permissions);
  const optionalPermissions = sortedUnique(manifest.optional_permissions);
  const hostPermissions = sortedUnique(manifest.host_permissions);
  const optionalHostPermissions = sortedUnique(manifest.optional_host_permissions);
  const broadHostPermissions = [...hostPermissions, ...optionalHostPermissions].filter((value) => ["<all_urls>","*://*/*","http://*/*","https://*/*"].includes(value));
  const serviceWorker = typeof manifest.background?.service_worker === "string" ? manifest.background.service_worker : null;
  const popup = manifest.action?.default_popup || manifest.browser_action?.default_popup || manifest.page_action?.default_popup || null;
  const options = manifest.options_ui?.page || manifest.options_page || null;
  const contentScriptWorlds = contentScripts.map((item) => item.world || "ISOLATED");
  const mainWorldContentScripts = contentScripts.filter((item) => item.world === "MAIN").length;
  const inferred = [
    {id:"extension-loads",domain:"behavior",title:"Extension loads successfully",expected:true,confidence:"high"},
    {id:"manifest-version",domain:"history",title:"Manifest version remains stable",expected:Number(manifest.manifest_version || 0),confidence:"high"},
    {id:"declared-permissions",domain:"permissions",title:"Declared API permission footprint remains stable",expected:permissions,confidence:"high"},
    {id:"declared-host-permissions",domain:"permissions",title:"Declared host permission footprint remains stable",expected:hostPermissions,confidence:"high"},
    {id:"declared-files-present",domain:"resources",title:"All manifest-declared local files are present",expected:true,confidence:"high"},
    {id:"extension-errors",domain:"behavior",title:"Extension runtime reports no unhandled errors",expected:0,confidence:"medium"},
    ...(serviceWorker ? [{id:"extension-service-worker-active",domain:"state",title:"Manifest-declared extension service worker is available",expected:true,confidence:"high"}] : []),
    ...(popup ? [{id:"popup-loads",domain:"behavior",title:"Declared extension popup loads",expected:true,confidence:"medium"}] : []),
    ...(options ? [{id:"options-loads",domain:"behavior",title:"Declared options page loads",expected:true,confidence:"medium"}] : []),
    ...(Number(manifest.manifest_version) === 3 ? [{id:"remote-code-references",domain:"security",title:"Manifest V3 bundle contains no remote executable-code references",expected:[],confidence:"high"}] : [])
  ];
  return {
    protocol:"calibration-discovery/0.3",
    adapter:"browser-extension",
    project_type:"browser-extension",
    root,
    extension_root: manifestRoot,
    files:{manifest:manifestRelative,declared:declaredFiles,missing:missingFiles},
    manifest:{
      name:manifest.name || null,
      version:manifest.version || null,
      manifest_version:Number(manifest.manifest_version || 0),
      minimum_chrome_version:manifest.minimum_chrome_version || null,
      service_worker:serviceWorker,
      service_worker_type:manifest.background?.type || null,
      popup,
      options,
      side_panel:manifest.side_panel?.default_path || null
    },
    permissions:{declared:permissions,optional:optionalPermissions,host:hostPermissions,optional_host:optionalHostPermissions,broad_host:broadHostPermissions},
    content_scripts:{count:contentScripts.length,worlds:contentScriptWorlds,main_world_count:mainWorldContentScripts,matches:contentScripts.flatMap((item)=>item.matches || []).filter((x)=>typeof x === "string").sort()},
    exposure:{externally_connectable:Boolean(manifest.externally_connectable),web_accessible_resource_groups:Array.isArray(manifest.web_accessible_resources)?manifest.web_accessible_resources.length:0},
    source_scan:scan,
    inferred_expectations:inferred,
    review_required:true,
    note:"Inferred expectations are candidates only. API namespace usage is evidence, not proof that a permission is necessary or unnecessary. Confirm the contract before calibration."
  };
}

module.exports = {collectSourceFiles, declaredFileSet, discoverBrowserExtensionProject, scanSources, sortedUnique};
