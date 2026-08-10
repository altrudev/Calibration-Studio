"use strict";
const fs = require("node:fs");
const path = require("node:path");

const HTML_CANDIDATES = ["index.html", "public/index.html", "dist/index.html", "build/index.html", "www/index.html"];
const MANIFEST_CANDIDATES = ["manifest.webmanifest", "manifest.json", "public/manifest.webmanifest", "public/manifest.json"];
const SW_CANDIDATES = ["sw.js", "service-worker.js", "public/sw.js", "public/service-worker.js"];

function exists(root, relative) { return fs.existsSync(path.join(root, relative)); }
function firstExisting(root, candidates) { return candidates.find((relative) => exists(root, relative)) || null; }
function read(root, relative) { return fs.readFileSync(path.join(root, relative), "utf8"); }
function safeJson(root, relative) { try { return JSON.parse(read(root, relative)); } catch { return null; } }

function extractManifestHref(html) {
  const match = html.match(/<link\b[^>]*rel=["'][^"']*manifest[^"']*["'][^>]*href=["']([^"']+)["']/i)
    || html.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["'][^"']*manifest[^"']*["']/i);
  return match ? match[1] : null;
}

function discoverWebPwaProject(projectDir) {
  const root = path.resolve(projectDir || process.cwd());
  const htmlPath = firstExisting(root, HTML_CANDIDATES);
  const html = htmlPath ? read(root, htmlPath) : "";
  const linkedManifest = extractManifestHref(html);
  const linkedLocalManifest = linkedManifest && !/^[a-z]+:/i.test(linkedManifest)
    ? linkedManifest.replace(/^\//, "")
    : null;
  const manifestPath = linkedLocalManifest && exists(root, linkedLocalManifest)
    ? linkedLocalManifest
    : firstExisting(root, MANIFEST_CANDIDATES);
  const manifest = manifestPath ? safeJson(root, manifestPath) : null;
  const swPath = firstExisting(root, SW_CANDIDATES);
  const serviceWorkerReferenced = /serviceWorker\s*\.\s*register\s*\(/.test(html)
    || (swPath !== null);
  const viewport = /<meta\b[^>]*name=["']viewport["']/i.test(html);
  const hasIcons = Array.isArray(manifest?.icons) && manifest.icons.length > 0;
  const hasStartUrl = typeof manifest?.start_url === "string" && manifest.start_url.length > 0;
  const display = typeof manifest?.display === "string" ? manifest.display : null;
  const pwaSignals = [Boolean(manifest), serviceWorkerReferenced, viewport].filter(Boolean).length;
  return {
    protocol: "calibration-discovery/0.2",
    adapter: "web-pwa",
    project_type: pwaSignals >= 2 ? "pwa" : "web",
    root,
    files: {html:htmlPath, manifest:manifestPath, service_worker:swPath},
    signals: {
      html_entry: Boolean(htmlPath),
      manifest: Boolean(manifest),
      service_worker: serviceWorkerReferenced,
      viewport,
      manifest_icons: hasIcons,
      manifest_start_url: hasStartUrl,
      manifest_display: display
    },
    inferred_expectations: [
      ...(manifest ? [{id:"manifest-present",domain:"behavior",title:"Web app manifest remains available",expected:true,confidence:"high"}] : []),
      ...(serviceWorkerReferenced ? [{id:"service-worker-active",domain:"state",title:"Service worker is available at runtime",expected:true,confidence:"medium"}] : []),
      ...(viewport ? [{id:"mobile-viewport",domain:"environment",title:"Mobile viewport metadata remains present",expected:true,confidence:"high"}] : []),
      ...(hasStartUrl ? [{id:"start-url-loads",domain:"behavior",title:"Manifest start URL loads successfully",expected:true,confidence:"medium"}] : []),
      ...(hasIcons ? [{id:"manifest-icons",domain:"resources",title:"Manifest icons remain discoverable",expected:true,confidence:"medium"}] : [])
    ],
    review_required: true,
    note: "Inferred expectations are candidates only. Confirm or edit them before treating them as the product contract."
  };
}

module.exports = {discoverWebPwaProject, extractManifestHref};
