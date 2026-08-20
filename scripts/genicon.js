// アプリアイコン生成 (依存ライブラリなし)
// assets/icon.png (256), assets/icon.ico (16-256), assets/tray.png (32) を出力する
//
// 図案は AeroWidget の AW モノグラム。三角の A と逆三角の W を並べたもので、
// 三角形そのものが翼 (aero) にも読めるようにしてある。512 座標系で定義し、
// 各サイズへ縮小して描く。
//
// 小さいサイズでは線幅を素直に縮小すると消えてしまうので、サイズごとに
// 太らせている (16px で 1px を切らないこと)。ここを自動でやりたいがために
// 画像を読み込まず 1 ピクセルずつ描いている。
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

// ---------------------------------------------------------------- 図案 (512 座標系)
// A: 三角形 / W: 上辺のある W。どちらも閉じた折れ線
const MARK_A = [[104, 344], [176, 176], [248, 344]];
const MARK_W = [[272, 176], [408, 176], [368, 344], [340, 254], [312, 344]];

// 512 空間での線幅。小さいほど太らせないと線が飛ぶ
function strokeFor(S) {
  if (S <= 16) return 58;
  if (S <= 24) return 48;
  if (S <= 32) return 42;
  if (S <= 48) return 38;
  return 34;
}

// 閉じた折れ線までの距離 (最短)。丸い継ぎ目は距離場の性質で自然に出る
function sdPolyline(x, y, pts, k) {
  let d = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    d = Math.min(d, sdSegment(x, y, a[0] * k, a[1] * k, b[0] * k, b[1] * k));
  }
  return d;
}

// SVG の linearGradient は既定で「そのパスのバウンディングボックス」基準。
// キャンバス全体を基準にすると中間色しか拾えず、色がくすむ。
function bbox(pts) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

// x1,y1=0,0 -> x2,y2=1,1 の対角グラデーションでの位置 (0..1)
function gradT(px, py, box, k) {
  const u = (px - box.x * k) / (box.w * k);
  const v = (py - box.y * k) / (box.h * k);
  return clamp((u + v) / 2, 0, 1);
}

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const A_FROM = [49, 192, 122], A_TO = [47, 136, 224];    // #31c07a -> #2f88e0
const W_FROM = [49, 192, 122], W_TO = [255, 154, 60];    // #31c07a -> #ff9a3c
const BOX_A = bbox(MARK_A), BOX_W = bbox(MARK_W);

function render(S) {
  const img = Buffer.alloc(S * S * 4);
  const c = S / 2;
  const half = S * 0.5;              // 角丸四角は全面 (余白は図案側で確保済み)
  const rad = S * 0.1875;            // 角丸 (512 空間で 96)
  const k = S / 512;                 // 512 座標系 -> 実サイズ
  const sw = (strokeFor(S) * k) / 2; // 線の半幅

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const px = x + 0.5, py = y + 0.5;

      const aBg = cov(sdRoundRect(px, py, c, c, half, half, rad));
      if (aBg <= 0) continue;

      // 白地。ほんのり上を明るくして、真っ白のべた面に見えないようにする
      const tv = clamp(py / S, 0, 1);
      let col = [255, 255, 255];
      col = mix(col, [244, 245, 247], tv * 0.55);

      const aA = cov(sdPolyline(px, py, MARK_A, k) - sw);
      const aW = cov(sdPolyline(px, py, MARK_W, k) - sw);

      if (aA > 0) col = mix(col, mix(A_FROM, A_TO, gradT(px, py, BOX_A, k)), aA);
      if (aW > 0) col = mix(col, mix(W_FROM, W_TO, gradT(px, py, BOX_W, k)), aW);

      img[i] = Math.round(clamp(col[0], 0, 255));
      img[i + 1] = Math.round(clamp(col[1], 0, 255));
      img[i + 2] = Math.round(clamp(col[2], 0, 255));
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
