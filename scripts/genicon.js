// アプリアイコン生成 (依存ライブラリなし)
// assets/icon.png (256), assets/icon.ico (16-256), assets/tray.png (32) を出力する
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ---------------------------------------------------------------- PNG エンコーダ
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- SDF 描画
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const cov = (d) => clamp(0.5 - d, 0, 1); // 距離 → カバレッジ (1px AA)

function sdRoundRect(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - (hw - r);
  const qy = Math.abs(y - cy) - (hh - r);
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
}

function sdSegment(x, y, ax, ay, bx, by) {
  const pax = x - ax, pay = y - ay, bax = bx - ax, bay = by - ay;
  const t = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay), 0, 1);
  return Math.hypot(pax - bax * t, pay - bay * t);
}

function render(S) {
  const img = Buffer.alloc(S * S * 4);
  const c = S / 2;
  const half = S * 0.47;             // 角丸四角の半径
  const rad = S * 0.235;             // 角丸
  const ringR = S * 0.27;            // 時計リング半径
  const ringW = Math.max(1.2, S * 0.055);
  const handW = Math.max(1.0, S * 0.048);

  // 針: 10時10分 (見栄えの良い定番角度)
  const a1 = (-150 * Math.PI) / 180; // 時針 (10時方向)
  const a2 = (-30 * Math.PI) / 180;  // 分針 (2時方向)
  const h1 = { x: c + Math.cos(a1) * ringR * 0.52, y: c + Math.sin(a1) * ringR * 0.52 };
  const h2 = { x: c + Math.cos(a2) * ringR * 0.72, y: c + Math.sin(a2) * ringR * 0.72 };

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const px = x + 0.5, py = y + 0.5;

      const dBg = sdRoundRect(px, py, c, c, half, half, rad);
      const aBg = cov(dBg);
      if (aBg <= 0) continue;

      // 対角グラデーション #6366f1 → #22d3ee
      const t = clamp((px + py) / (2 * S), 0, 1);
      let r = 99 + (34 - 99) * t;
      let g = 102 + (211 - 102) * t;
      let b = 241 + (238 - 241) * t;
      // 左上をほんのり明るく
      const hl = clamp(1 - Math.hypot(px - S * 0.3, py - S * 0.25) / (S * 0.75), 0, 1);
      r += 26 * hl; g += 26 * hl; b += 30 * hl;

      // 白い時計マーク
      const dRing = Math.abs(Math.hypot(px - c, py - c) - ringR) - ringW / 2;
      const dH1 = sdSegment(px, py, c, c, h1.x, h1.y) - handW / 2;
      const dH2 = sdSegment(px, py, c, c, h2.x, h2.y) - handW / 2;
      const dDot = Math.hypot(px - c, py - c) - handW * 0.9;
      const aw = Math.max(cov(dRing), cov(dH1), cov(dH2), cov(dDot));

      r = r + (255 - r) * aw;
      g = g + (255 - g) * aw;
      b = b + (255 - b) * aw;

      img[i] = Math.round(clamp(r, 0, 255));
      img[i + 1] = Math.round(clamp(g, 0, 255));
      img[i + 2] = Math.round(clamp(b, 0, 255));
      img[i + 3] = Math.round(255 * aBg);
    }
  }
  return img;
}

// ---------------------------------------------------------------- ICO パッカ
function packICO(pngs) {
  const count = pngs.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  const entries = [];
  let offset = 6 + 16 * count;
  for (const { size, buf } of pngs) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;
    e[1] = size >= 256 ? 0 : size;
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(buf.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += buf.length;
  }
  return Buffer.concat([header, ...entries, ...pngs.map(p => p.buf)]);
}

// ---------------------------------------------------------------- 出力
const outDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(outDir, { recursive: true });

const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = sizes.map(s => ({ size: s, buf: encodePNG(s, s, render(s)) }));

fs.writeFileSync(path.join(outDir, 'icon.ico'), packICO(pngs));
fs.writeFileSync(path.join(outDir, 'icon.png'), pngs.find(p => p.size === 256).buf);
fs.writeFileSync(path.join(outDir, 'tray.png'), pngs.find(p => p.size === 32).buf);
console.log('generated: icon.ico, icon.png, tray.png ->', outDir);
