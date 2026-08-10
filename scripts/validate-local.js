'use strict';

const { spawnSync } = require('node:child_process');

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(args) {
  const result = spawnSync(npm, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function core() {
  run(['run', 'check']);
  run(['test']);
}

function runtime() {
  run(['run', 'runtime:verify-browser']);
}

function standalone() {
  run(['run', 'standalone:stage']);
}

const args = new Set(process.argv.slice(2));
if (args.size === 0 || args.has('--core')) core();
if (args.has('--runtime')) runtime();
if (args.has('--standalone')) standalone();
if (args.has('--all')) {
  if (!args.has('--core')) core();
  runtime();
  standalone();
}

if ([...args].some((x) => !['--core', '--runtime', '--standalone', '--all'].includes(x))) {
  console.error('Usage: node scripts/validate-local.js [--core] [--runtime] [--standalone] [--all]');
  process.exit(2);
}
