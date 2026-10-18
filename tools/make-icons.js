// PWA アイコンを textures.js の TNT と土から生成する（npm run icons）

import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { makeTexture, TEX } from '../js/textures.js';

const tnt = makeTexture('X');
const dirt = makeTexture('D');

function render(size, tntScale, dirtScale) {
  const out = Buffer.alloc(size * size * 4);
  const tw = TEX * tntScale, off = Math.floor((size - tw) / 2), sh = tntScale;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tx = x - off, ty = y - off;
      let src, i, k;
      if (tx >= 0 && ty >= 0 && tx < tw && ty < tw) {
        src = tnt;
        i = (Math.floor(ty / tntScale) * TEX + Math.floor(tx / tntScale)) * 4;
        k = 1;
      } else {
        src = dirt;
        i = ((Math.floor(y / dirtScale) % TEX) * TEX + (Math.floor(x / dirtScale) % TEX)) * 4;
        const inShadow = tx >= sh && ty >= sh && tx < tw + sh && ty < tw + sh;
        k = inShadow ? 0.3 : 0.6;
      }
      const o = (y * size + x) * 4;
      out[o] = src.data[i] * k;
      out[o + 1] = src.data[i + 1] * k;
      out[o + 2] = src.data[i + 2] * k;
      out[o + 3] = 255;
    }
  }
  return out;
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // ビット深度
  ihdr[9] = 6;   // RGBA
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const dir = new URL('../icons/', import.meta.url);
mkdirSync(dir, { recursive: true });
const icons = [
  ['icon-192.png', 192, 8, 4],
  ['icon-512.png', 512, 20, 8],
  ['icon-maskable-512.png', 512, 16, 8],
  ['apple-touch-icon.png', 180, 7, 4],
];
for (const [name, size, tntScale, dirtScale] of icons) {
  writeFileSync(new URL(name, dir), png(size, render(size, tntScale, dirtScale)));
  console.log('wrote', name);
}
