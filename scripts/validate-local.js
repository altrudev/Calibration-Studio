'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const ignoredDirs = new Set(['.git', 'node_modules', 'build', 'dist', '.playwright']);

function run(args, label) {
  console.log(`\n== ${label} ==`);
  const result = spawnSync(npm, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: false,
    windowsHide: true
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function collectFiles(relative = '.') {
  const absolute = path.join(repoRoot, relative);
  if (!fs.existsSync(absolute)) return [];
  const out = [];
  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory() && ignoredDirs.has(entry.name)) continue;
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) walk(next);
      else if (entry.isFile()) out.push(next);
    }
  }
  walk(absolute);
  return out;
}

function relative(file) {
  return path.relative(repoRoot, file).split(path.sep).join('/');
}

function fail(title, findings) {
  console.error(`\n${title}`);
  for (const finding of findings) console.error(` - ${finding}`);
  process.exit(1);
}

function core() {
  run(['run', 'check'], 'Source syntax');
  run(['test'], 'Regression tests');
}

function security() {
  console.log('\n== Local security / boundary guard ==');
  const findings = [];
  const allFiles = collectFiles('.');

  for (const file of allFiles) {
    const rel = relative(file);
    const base = path.basename(file);
    if (/\.(?:pem|key|p12|pfx)$/i.test(base) || base === '.env') findings.push(`secret/key file committed: ${rel}`);
  }

  const credentialPatterns = [
    /-----BEGIN [A-Z][A-Z ]* PRIVATE KEY-----/,
    /sk-[A-Za-z0-9]{20,}/,
    /AKIA[0-9A-Z]{16}/
  ];
  for (const file of allFiles) {
    if (path.basename(file) === 'redaction.js') continue;
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    if (credentialPatterns.some((pattern) => pattern.test(text))) findings.push(`potential hard-coded credential material: ${relative(file)}`);
  }

  const executionPattern = /\bexec(?:Sync|File|FileSync)?\s*\(|\beval\s*\(|\bnew\s+Function\s*\(/;
  for (const root of ['src', 'bin']) {
    for (const file of collectFiles(root)) {
      if (!/\.(?:js|mjs|cjs)$/.test(file)) continue;
      const text = fs.readFileSync(file, 'utf8');
      if (executionPattern.test(text)) findings.push(`forbidden execution primitive: ${relative(file)}`);
    }
  }

  const remoteAssetPattern = /<(?:script|link)\b[^>]+https?:\/\//i;
  for (const file of collectFiles('ui')) {
    if (!/\.(?:html?|js|css)$/i.test(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (remoteAssetPattern.test(text)) findings.push(`remote UI runtime asset: ${relative(file)}`);
  }

  const privateMarkers = [
    ['derive', '_closure'].join(''),
    ['constraint', '[-_ ]', 'island'].join(''),
    ['lattice', ' propagation'].join(''),
    ['successor-state', ' machinery'].join(''),
    ['private dimensional', ' signals'].join(''),
    ['Participant', 'LockManager'].join(''),
    ['File', 'HeadStore'].join(''),
    ['Crystalline', 'Engine'].join(''),
    ['Native', 'Crystal'].join(''),
    ['Native', 'Prepared'].join('')
  ].map((source) => new RegExp(source, 'i'));
  for (const root of ['src', 'bin', 'tests', 'schemas', 'ui']) {
    for (const file of collectFiles(root)) {
      let text;
      try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
      if (privateMarkers.some((pattern) => pattern.test(text))) findings.push(`private DDC implementation boundary marker: ${relative(file)}`);
    }
  }

  if (findings.length) fail('Local security gate failed:', [...new Set(findings)].sort());
  console.log('Local security / boundary guard passed.');
}

function supplyChain() {
  run(['audit', '--omit=dev', '--audit-level=high'], 'Dependency vulnerability audit');
  run(['audit', 'signatures'], 'Registry signatures / attestations');
}

function runtime() {
  run(['run', 'runtime:verify-browser'], 'Pinned browser runtime');
}

const args = new Set(process.argv.slice(2));
const allowed = new Set(['--core', '--security', '--supply-chain', '--runtime', '--all']);
const unknown = [...args].filter((arg) => !allowed.has(arg));
if (unknown.length) {
  console.error(`Unknown option(s): ${unknown.join(', ')}`);
  console.error('Usage: node scripts/validate-local.js [--core] [--security] [--supply-chain] [--runtime] [--all]');
  process.exit(2);
}

if (args.size === 0) {
  core();
  security();
} else if (args.has('--all')) {
  core();
  security();
  supplyChain();
  runtime();
} else {
  if (args.has('--core')) core();
  if (args.has('--security')) security();
  if (args.has('--supply-chain')) supplyChain();
  if (args.has('--runtime')) runtime();
}
