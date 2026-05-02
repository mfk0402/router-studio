/**
 * Decode branding images (JPEG mislabeled as .png is supported), flood-fill light
 * outer background from edges to transparent, write valid PNG with alpha.
 */
import fs from 'fs';
import path from 'path';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const CHROMA_MAX = 32;
const LIGHT_MIN = 155;

function isBackgroundRgb(r, g, b) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  return mx - mn <= CHROMA_MAX && mx >= LIGHT_MIN;
}

function loadRgba(absPath) {
  const buf = fs.readFileSync(absPath);
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;

  if (isJpeg) {
    const dec = jpeg.decode(buf, { useTArray: false });
    const { width, height, data } = dec;
    const pixels = width * height;
    const bpp = data.length / pixels;
    if (bpp === 4) {
      return { width, height, data: Buffer.from(data) };
    }
    if (bpp !== 3) {
      throw new Error(`Unexpected JPEG depth bpp=${bpp}: ${absPath}`);
    }
    const rgba = Buffer.alloc(pixels * 4);
    let si = 0;
    for (let i = 0; i < pixels; i++) {
      rgba[i * 4] = data[si++];
      rgba[i * 4 + 1] = data[si++];
      rgba[i * 4 + 2] = data[si++];
      rgba[i * 4 + 3] = 255;
    }
    return { width, height, data: rgba };
  }

  const png = PNG.sync.read(buf);
  return { width: png.width, height: png.height, data: Buffer.from(png.data) };
}

function floodTransparentBackground(width, height, data) {
  const w = width;
  const h = height;
  const visited = new Uint8Array(w * h);
  const queue = [];

  const at = (x, y) => (y * w + x) * 4;

  function enqueue(x, y) {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const i = y * w + x;
    if (visited[i]) return;
    const o = at(x, y);
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    if (!isBackgroundRgb(r, g, b)) return;
    visited[i] = 1;
    queue.push(x, y);
  }

  for (let x = 0; x < w; x++) {
    enqueue(x, 0);
    enqueue(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    enqueue(0, y);
    enqueue(w - 1, y);
  }

  while (queue.length) {
    const y = queue.pop();
    const x = queue.pop();
    const o = at(x, y);
    data[o + 3] = 0;
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }
}

function savePng(width, height, data, absOut) {
  const png = new PNG({ width, height });
  data.copy(png.data);
  fs.writeFileSync(absOut, PNG.sync.write(png));
}

const targets = [
  'src/renderer/assets/logo-full.png',
  'src/renderer/assets/logo-icon.png',
  'resources/icon.png',
  'src/renderer/public/favicon.png',
];

for (const rel of targets) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    console.warn('skip (missing):', rel);
    continue;
  }
  const tmp = abs + '.tmp.png';
  const { width, height, data } = loadRgba(abs);
  floodTransparentBackground(width, height, data);
  savePng(width, height, data, tmp);
  fs.renameSync(tmp, abs);
  console.log('ok:', rel);
}
