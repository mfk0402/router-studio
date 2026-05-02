/**
 * Ensure native optional binaries match **this** Node process (not necessarily PATH npm).
 * npm often installs optional deps for whichever npm.exe architecture ran `npm install`.
 */
import { execFileSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, rmSync } from 'node:fs';
import { cp, rm } from 'node:fs/promises';
import { get } from 'node:https';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { arch, platform } from 'node:process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** @returns {string | null} */
function rollupBindingPackage() {
  if (platform === 'win32') {
    if (arch === 'ia32') return '@rollup/rollup-win32-ia32-msvc';
    return '@rollup/rollup-win32-x64-msvc';
  }
  if (platform === 'darwin') return arch === 'arm64' ? '@rollup/rollup-darwin-arm64' : '@rollup/rollup-darwin-x64';
  if (platform === 'linux') return arch === 'arm64' ? '@rollup/rollup-linux-arm64-gnu' : '@rollup/rollup-linux-x64-gnu';
  return null;
}

/** @returns {string | null} */
function esbuildBindingPackage() {
  if (platform === 'win32') {
    if (arch === 'ia32') return '@esbuild/win32-ia32';
    if (arch === 'arm64') return '@esbuild/win32-arm64';
    return '@esbuild/win32-x64';
  }
  if (platform === 'darwin') return arch === 'arm64' ? '@esbuild/darwin-arm64' : '@esbuild/darwin-x64';
  if (platform === 'linux') {
    if (arch === 'arm64') return '@esbuild/linux-arm64';
    return '@esbuild/linux-x64';
  }
  return null;
}

/** @param {string} pkg */
function bindingInstalled(pkg) {
  try {
    require.resolve(`${pkg}/package.json`);
    return true;
  } catch {
    return false;
  }
}

/** @param {string[]} args */
function runNpmInstall(args) {
  if (platform === 'win32') {
    const beside = join(dirname(process.execPath), 'npm.cmd');
    if (existsSync(beside)) {
      execFileSync(beside, args, { stdio: 'inherit', windowsHide: true });
      return;
    }
    execFileSync('npm.cmd', args, { stdio: 'inherit', windowsHide: true, shell: true });
    return;
  }
  const beside = join(dirname(process.execPath), 'npm');
  if (existsSync(beside)) {
    execFileSync(beside, args, { stdio: 'inherit' });
    return;
  }
  execFileSync('npm', args, { stdio: 'inherit' });
}

/** @param {string} pkg @param {string} ver */
function tarballUrl(pkg, ver) {
  const short = pkg.includes('/') ? pkg.split('/')[1] : pkg;
  const enc = pkg.replace('/', '%2f');
  return `https://registry.npmjs.org/${enc}/-/${short}-${ver}.tgz`;
}

/** @param {string} url @param {string} dest */
async function download(url, dest) {
  await new Promise((resolve, reject) => {
    const req = get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const loc = res.headers.location;
        if (!loc) {
          reject(new Error('Redirect without location'));
          return;
        }
        void download(loc, dest).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`GET ${url} -> ${res.statusCode}`));
        return;
      }
      const out = createWriteStream(dest);
      void pipeline(res, out).then(resolve).catch(reject);
    });
    req.on('error', reject);
    req.end();
  });
}

/** @param {string} pkg @param {string} ver */
async function installFromRegistryTarball(pkg, ver) {
  const url = tarballUrl(pkg, ver);
  const tmp = join(tmpdir(), `native-bind-${pkg.replace(/[@/]/g, '-')}-${ver}-${Date.now()}`);
  const tgz = join(tmp, 'pkg.tgz');
  mkdirSync(tmp, { recursive: true });
  try {
    await download(url, tgz);
    execFileSync('tar', ['-xzf', tgz, '-C', tmp], { stdio: 'inherit' });
    const extracted = join(tmp, 'package');
    const destDir = join(root, 'node_modules', ...pkg.split('/'));
    mkdirSync(dirname(destDir), { recursive: true });
    if (existsSync(destDir)) await rm(destDir, { recursive: true, force: true });
    await cp(extracted, destDir, { recursive: true });
  } finally {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

/** @param {string} pkg @param {string} ver @param {string} label */
async function ensureNative(pkg, ver, label) {
  if (!pkg || bindingInstalled(pkg)) return;

  try {
    runNpmInstall(['install', `${pkg}@${ver}`, '--no-save']);
  } catch {
    /* tarball below */
  }

  if (!bindingInstalled(pkg)) {
    console.warn(`[postinstall] Extracting ${label} ${pkg}@${ver} from registry…`);
    await installFromRegistryTarball(pkg, ver);
    if (!bindingInstalled(pkg)) {
      console.warn(`[postinstall] Missing ${pkg} after tarball step`);
    }
  }
}

function pruneWrongRollupOnWindows() {
  if (platform !== 'win32') return;
  const wrong =
    arch === 'x64' ? ['rollup-win32-ia32-msvc'] : arch === 'ia32' ? ['rollup-win32-x64-msvc'] : [];
  for (const w of wrong) {
    try {
      rmSync(join(root, 'node_modules/@rollup', w), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

function pruneWrongEsbuildOnWindows() {
  if (platform !== 'win32') return;
  const wrong =
    arch === 'x64'
      ? ['win32-ia32', 'win32-arm64']
      : arch === 'arm64'
        ? ['win32-ia32', 'win32-x64']
        : ['win32-x64', 'win32-arm64'];
  for (const w of wrong) {
    try {
      rmSync(join(root, 'node_modules/@esbuild', w), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

async function main() {
  pruneWrongRollupOnWindows();
  pruneWrongEsbuildOnWindows();

  const rollupPkg = rollupBindingPackage();
  let rollupVer;
  try {
    rollupVer = require('rollup/package.json').version;
  } catch {
    rollupVer = null;
  }
  if (rollupPkg && rollupVer) await ensureNative(rollupPkg, rollupVer, 'rollup');

  const esPkg = esbuildBindingPackage();
  let esVer;
  try {
    esVer = require('esbuild/package.json').version;
  } catch {
    esVer = null;
  }
  if (esPkg && esVer) await ensureNative(esPkg, esVer, 'esbuild');

  pruneWrongRollupOnWindows();
  pruneWrongEsbuildOnWindows();
}

main().catch((e) => {
  console.warn('[postinstall]', e);
});
