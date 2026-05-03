#!/usr/bin/env node
/**
 * Launch Router Studio from the shell (npm global install or npx).
 * Requires a production build in ./out (run `npm run verify` from the repo).
 *
 * Uses the local `electron` package when present (repo install / devDependencies).
 * Otherwise runs `npx --package=electron@<range> electron …` so global installs work.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mainJs = path.join(appRoot, 'out', 'main', 'main.js');

if (!fs.existsSync(mainJs)) {
  console.error(
    [
      'Router Studio has no production build in ./out yet.',
      '',
      'From the package directory run:',
      '  npm run verify',
      '',
      'Then run router-studio (or router) again.',
    ].join('\n'),
  );
  process.exit(1);
}

function readElectronSemverRange() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
    const v = pkg.devDependencies?.electron ?? pkg.dependencies?.electron ?? '31';
    return typeof v === 'string' ? v : '31';
  } catch {
    return '31';
  }
}

/** @param {import('node:child_process').ChildProcess } child */
function attachExit(child) {
  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

const forwarded = process.argv.slice(2);

let electronExe;
try {
  electronExe = require('electron');
} catch {
  electronExe = null;
}

if (electronExe) {
  attachExit(
    spawn(electronExe, [appRoot, ...forwarded], {
      stdio: 'inherit',
      windowsHide: false,
    }),
  );
} else {
  const range = readElectronSemverRange();
  const isWin = process.platform === 'win32';
  attachExit(
    spawn(
      isWin ? 'npx.cmd' : 'npx',
      ['--yes', `--package=electron@${range}`, 'electron', appRoot, ...forwarded],
      {
        stdio: 'inherit',
        windowsHide: false,
        shell: isWin,
      },
    ),
  );
}
