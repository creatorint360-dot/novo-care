'use strict';
// Draws the Novo Care app icons (PNG) with plain code, no image tools needed.
// Run once:  node scripts/make-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const C1 = [255, 122, 89];    // coral
const C2 = [124, 92, 252];    // violet

// Letter N as three white shapes, in a 0..1 square (centre at 0.5, 0.5).
function letterN(k) {
  const t = 0.105;                       // stroke thickness
  const L = 0.5 - 0.20 * k, R = 0.5 + 0.20 * k, T = 0.5 - 0.23 * k, B = 0.5 + 0.23 * k, w = t * k;
  return [
    [[L, T], [L + w, T], [L + w, B], [L, B]],                       // left bar
    [[R - w, T], [R, T], [R, B], [R - w, B]],                       // right bar
    [[L, T], [L + w * 1.25, T], [R, B], [R - w * 1.25, B]],         // diagonal
  ];
}

function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inRoundedSquare(x, y, r) {
  if (r <= 0) return true;
  const cx = Math.min(Math.max(x, r), 1 - r), cy = Math.min(Math.max(y, r), 1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function render(size, radius, letterScale) {
  const shapes = letterN(letterScale);
  const SS = 3;                                  // 3x3 samples per pixel = smooth edges
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;                // PNG filter type: none
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const x = (px + (sx + 0.5) / SS) / size, y = (py + (sy + 0.5) / SS) / size;
        if (!inRoundedSquare(x, y, radius)) continue;
        const white = shapes.some((s) => inPoly(x, y, s));
        const m = (x + y) / 2;
        const c = white ? [255, 255, 255] : C1.map((v, i) => v + (C2[i] - v) * m);
        r += c[0]; g += c[1]; b += c[2]; a += 255;
      }
      const n = SS * SS, o = py * (size * 4 + 1) + 1 + px * 4;
      const cov = a / 255;
      raw[o] = cov ? Math.round(r / cov) : 0;
      raw[o + 1] = cov ? Math.round(g / cov) : 0;
      raw[o + 2] = cov ? Math.round(b / cov) : 0;
      raw[o + 3] = Math.round(a / n);
    }
  }
  return encodePng(size, raw);
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;                      // 8 bits per channel, RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(out, { recursive: true });
const jobs = [
  ['icon-192.png', 192, 0.25, 1],
  ['icon-512.png', 512, 0.25, 1],
  ['maskable-512.png', 512, 0, 0.72],          // full square, letter kept in the safe middle
  ['apple-touch-icon.png', 180, 0, 0.9],
];
for (const [name, size, radius, scale] of jobs) {
  fs.writeFileSync(path.join(out, name), render(size, radius, scale));
  console.log('made public/icons/' + name);
}
