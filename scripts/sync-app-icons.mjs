/**
 * Single source of truth: src/renderer/assets/logo-icon.png → resources/icon.png + resources/icon.ico
 * (Electron window icon + electron-builder Windows exe/installer branding).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const logoSrc = path.join(root, 'src/renderer/assets/logo-icon.png');
const outPng = path.join(root, 'resources/icon.png');
const outIco = path.join(root, 'resources/icon.ico');

if (!fs.existsSync(logoSrc)) {
  console.error('[sync-app-icons] Missing branding file:', logoSrc);
  process.exit(1);
}

fs.mkdirSync(path.dirname(outPng), { recursive: true });
fs.copyFileSync(logoSrc, outPng);

const pngBuf = fs.readFileSync(logoSrc);
const pngToIco = (await import('png-to-ico')).default;
const icoBuf = await pngToIco(pngBuf);
fs.writeFileSync(outIco, icoBuf);
console.log('[sync-app-icons] Wrote resources/icon.png and resources/icon.ico');
