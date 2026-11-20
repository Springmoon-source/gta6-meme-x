// make-meme.mjs — renders this entry's meme picture, meme.png, from scratch.
//
// Everything is drawn with code: a small software rasteriser (supersampled
// 2x, then box-downsampled) and a hand-authored 5x7 pixel font. No image
// assets, no fonts, no network — Node's standard library only, and the same
// bytes come out on every run.
//
// The meme: a Leonida-sunset checklist, "THINGS WE GOT BEFORE GTA VI".
// Four boxes are already ticked (a whole pandemic, AI agents got jobs,
// space tourists, I became my dad); make.fun's ghost — white body, thick
// black outline, sparkle eyes, magenta star coin in one hand — leans in
// with a marker to tick the last box at last: GTA VI, out 19 Nov 2026.

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------- PNG encoder (deterministic) ----------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng(width, height, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- Canvas (drawn at SS x, downsampled at the end) ----------

const W = 1440;
const H = 1080;
const SS = 2;
const DW = W * SS;
const DH = H * SS;
const buf = new Uint8Array(DW * DH * 3);

function hexRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

// Blend colour (with alpha 0..1) into one device pixel.
function put(px, py, [r, g, b], a) {
  if (px < 0 || py < 0 || px >= DW || py >= DH || a <= 0) return;
  const i = (py * DW + px) * 3;
  if (a >= 1) {
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b;
  } else {
    buf[i] = Math.round(buf[i] * (1 - a) + r * a);
    buf[i + 1] = Math.round(buf[i + 1] * (1 - a) + g * a);
    buf[i + 2] = Math.round(buf[i + 2] * (1 - a) + b * a);
  }
}

// Fill every device pixel whose centre satisfies test(x, y) in final-px space.
function fillWhere(x0, y0, x1, y1, test, rgb, a = 1) {
  const dx0 = Math.max(0, Math.floor(x0 * SS));
  const dy0 = Math.max(0, Math.floor(y0 * SS));
  const dx1 = Math.min(DW - 1, Math.ceil(x1 * SS));
  const dy1 = Math.min(DH - 1, Math.ceil(y1 * SS));
  for (let py = dy0; py <= dy1; py++) {
    const fy = (py + 0.5) / SS;
    for (let px = dx0; px <= dx1; px++) {
      if (test((px + 0.5) / SS, fy)) put(px, py, rgb, a);
    }
  }
}

function fillRect(x, y, w, h, rgb, a = 1) {
  fillWhere(x, y, x + w, y + h, (fx, fy) => fx >= x && fx < x + w && fy >= y && fy < y + h, rgb, a);
}

function fillRoundRect(x, y, w, h, r, rgb, a = 1) {
  fillWhere(x, y, x + w, y + h, (fx, fy) => {
    const cx = Math.max(x + r, Math.min(fx, x + w - r));
    const cy = Math.max(y + r, Math.min(fy, y + h - r));
    return (fx - cx) ** 2 + (fy - cy) ** 2 <= r * r;
  }, rgb, a);
}

function fillCircle(cx, cy, r, rgb, a = 1) {
  fillWhere(cx - r, cy - r, cx + r, cy + r, (fx, fy) => (fx - cx) ** 2 + (fy - cy) ** 2 <= r * r, rgb, a);
}

function fillEllipse(cx, cy, rx, ry, rgb, a = 1) {
  fillWhere(cx - rx, cy - ry, cx + rx, cy + ry, (fx, fy) => ((fx - cx) / rx) ** 2 + ((fy - cy) / ry) ** 2 <= 1, rgb, a);
}

function fillPoly(points, rgb, a = 1) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  fillWhere(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), (fx, fy) => {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i];
      const [xj, yj] = points[j];
      if (yi > fy !== yj > fy && fx < ((xj - xi) * (fy - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }, rgb, a);
}

// A thick line segment: a capsule of the given width.
function thickLine(x0, y0, x1, y1, width, rgb, a = 1) {
  const r = width / 2;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  fillWhere(Math.min(x0, x1) - r, Math.min(y0, y1) - r, Math.max(x0, x1) + r, Math.max(y0, y1) + r, (fx, fy) => {
    let t = len2 === 0 ? 0 : ((fx - x0) * dx + (fy - y0) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const ex = fx - (x0 + t * dx);
    const ey = fy - (y0 + t * dy);
    return ex * ex + ey * ey <= r * r;
  }, rgb, a);
}

// A four-pointed sparkle (the ghost's eyes, and stars in the sky).
function sparkle(cx, cy, r, rgb, a = 1) {
  const pts = [];
  const inner = r * 0.24;
  for (let k = 0; k < 8; k++) {
    const ang = (k * Math.PI) / 4 - Math.PI / 2;
    const rad = k % 2 === 0 ? r : inner;
    pts.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad * 1.3]);
  }
  fillPoly(pts, rgb, a);
}

// A five-pointed star (for the ghost's coin).
function star(cx, cy, rOuter, rInner, rgb, a = 1) {
  const pts = [];
  for (let k = 0; k < 10; k++) {
    const ang = (k * Math.PI) / 5 - Math.PI / 2;
    const rad = k % 2 === 0 ? rOuter : rInner;
    pts.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad]);
  }
  fillPoly(pts, rgb, a);
}

// ---------- 5x7 pixel font (hand-authored) ----------
// Each glyph is 7 rows of 5 pixels. Text is drawn at an integer scale:
// one font pixel becomes an s-by-s block, so a glyph is 5s wide, 7s tall,
// and the character advance is 6s.

const FONT = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.####', '#....', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '.#.#.', '.#.#.', '..#..', '.#.#.', '.#.#.', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '..##.', '.#...', '#....', '#####'],
  3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '.##..', '.#...'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  "'": ['..#..', '..#..', '.#...', '.....', '.....', '.....', '.....'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  '·': ['.....', '.....', '.....', '.##..', '.##..', '.....', '.....'],
  // Lowercase, for the make.fun wordmark (the name is written in lowercase).
  a: ['.....', '.....', '.###.', '....#', '.####', '#...#', '.####'],
  c: ['.....', '.....', '.###.', '#....', '#....', '#....', '.####'],
  e: ['.....', '.....', '.###.', '#...#', '#####', '#....', '.###.'],
  f: ['..##.', '.#...', '.#...', '####.', '.#...', '.#...', '.#...'],
  k: ['#....', '#....', '#..#.', '#.#..', '##...', '#.#..', '#..#.'],
  m: ['.....', '.....', '##.#.', '#.#.#', '#.#.#', '#.#.#', '#.#.#'],
  n: ['.....', '.....', '####.', '#...#', '#...#', '#...#', '#...#'],
  u: ['.....', '.....', '#...#', '#...#', '#...#', '#..##', '.##.#'],
};

function textWidth(str, s) {
  return str.length === 0 ? 0 : str.length * 6 * s - s;
}

// Draw text with its top-left at (x, y). fauxBold draws it twice, 0.14*s
// to the right, to thicken the strokes.
function drawText(str, x, y, s, rgb, a = 1, fauxBold = false) {
  const passes = fauxBold ? [0, Math.max(1, Math.round(s * 0.14))] : [0];
  for (const off of passes) {
    let cx = x + off;
    for (const ch of str) {
      const glyph = FONT[ch];
      if (glyph) {
        for (let row = 0; row < 7; row++) {
          for (let col = 0; col < 5; col++) {
            if (glyph[row][col] === '#') fillRect(cx + col * s, y + row * s, s, s, rgb, a);
          }
        }
      }
      cx += 6 * s;
    }
  }
}

// ---------- The scene ----------

const INK = hexRgb('#221d33');
const MAGENTA = hexRgb('#e84393');
const DEEP_MAGENTA = hexRgb('#d6336c');
const YELLOW = hexRgb('#ffd23e');
const WHITE = hexRgb('#ffffff');
const BLACK = hexRgb('#14100f');

// Sky: a Leonida sunset, deep purple up top melting into orange.
{
  const stops = [
    [0.0, hexRgb('#20093f')],
    [0.45, hexRgb('#6d2160')],
    [0.75, hexRgb('#c73e63')],
    [1.0, hexRgb('#ff8c4a')],
  ];
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1);
    let lo = stops[0];
    let hi = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (t >= stops[i][0] && t <= stops[i + 1][0]) {
        lo = stops[i];
        hi = stops[i + 1];
        break;
      }
    }
    const f = (t - lo[0]) / Math.max(1e-6, hi[0] - lo[0]);
    const c = [0, 1, 2].map((k) => Math.round(lo[1][k] + (hi[1][k] - lo[1][k]) * f));
    fillRect(0, y, W, 1, c);
  }
}

// Sun and a few sparkles in the sky.
fillCircle(1238, 208, 132, hexRgb('#ffd98e'), 0.16);
fillCircle(1238, 208, 92, hexRgb('#ffd98e'), 0.9);
sparkle(60, 272, 10, WHITE, 0.7);
sparkle(1392, 88, 13, WHITE, 0.75);
sparkle(1002, 148, 9, WHITE, 0.6);

// Palm silhouettes, low in the frame.
{
  const palm = hexRgb('#220a40');
  const frond = (x0, y0, x1, y1, x2, y2) => {
    thickLine(x0, y0, x1, y1, 12, palm);
    thickLine(x1, y1, x2, y2, 9, palm);
  };
  // Left palm.
  thickLine(14, 1080, 58, 1002, 30, palm);
  thickLine(58, 1002, 104, 956, 22, palm);
  frond(104, 956, 62, 912, 22, 922);
  frond(104, 956, 84, 896, 52, 872);
  frond(104, 956, 138, 884, 128, 862);
  frond(104, 956, 172, 902, 198, 892);
  frond(104, 956, 178, 944, 204, 952);
  // Right palm.
  thickLine(1438, 1080, 1400, 992, 28, palm);
  thickLine(1400, 992, 1374, 932, 20, palm);
  frond(1374, 932, 1336, 888, 1302, 896);
  frond(1374, 932, 1362, 876, 1338, 856);
  frond(1374, 932, 1410, 880, 1412, 858);
  frond(1374, 932, 1430, 916, 1452, 912);
}

// Title.
drawText('THINGS WE GOT', 70, 63, 12, hexRgb('#2a0a44'), 0.45);
drawText('THINGS WE GOT', 64, 56, 12, WHITE);
drawText('BEFORE GTA VI', 70, 167, 12, hexRgb('#2a0a44'), 0.45);
drawText('BEFORE ', 64, 160, 12, WHITE);
drawText('GTA VI', 64 + 7 * 72, 160, 12, YELLOW);

// The checklist card.
fillRoundRect(58, 330, 960, 568, 30, hexRgb('#14062a'), 0.35);
fillRoundRect(48, 316, 960, 568, 30, hexRgb('#fffdf8'));
for (let i = 1; i < 5; i++) {
  const y = 316 + (568 * i) / 5;
  fillRect(88, y, 792, 3, hexRgb('#e7e0d2'));
}

const ROWS = ['A WHOLE PANDEMIC', 'AI AGENTS GOT JOBS', 'SPACE TOURISTS', 'I BECAME MY DAD'];
const CENTERS = [373, 486, 600, 714, 827];
ROWS.forEach((label, i) => {
  const cy = CENTERS[i];
  drawText(label, 88, cy - 24, 7, INK);
  // A ticked box on the right of the row.
  fillRoundRect(918, cy - 30, 60, 60, 10, MAGENTA);
  fillRoundRect(925, cy - 23, 46, 46, 7, WHITE);
  thickLine(930, cy + 2, 944, cy + 16, 11, MAGENTA);
  thickLine(944, cy + 16, 968, cy - 18, 11, MAGENTA);
});

// The last row: GTA VI itself, its box still being ticked.
drawText('GTA VI', 88, CENTERS[4] - 31, 9, DEEP_MAGENTA);
fillRoundRect(918, CENTERS[4] - 30, 60, 60, 10, MAGENTA);
fillRoundRect(925, CENTERS[4] - 23, 46, 46, 7, WHITE);
thickLine(930, CENTERS[4] + 2, 944, CENTERS[4] + 16, 11, MAGENTA);
thickLine(944, CENTERS[4] + 16, 960, CENTERS[4] - 7, 11, MAGENTA); // the stroke the marker is drawing now

// ---------- make.fun's ghost, leaning in to finish the tick ----------

function ghostOutline(cx, topY, halfW, sideBottom) {
  const pts = [];
  const domeCy = topY + 162;
  pts.push([cx - halfW, sideBottom]);
  pts.push([cx - halfW, domeCy]);
  for (let a = 180; a >= 0; a -= 9) {
    const rad = (a * Math.PI) / 180;
    pts.push([cx + halfW * Math.cos(rad), domeCy - 162 * Math.sin(rad)]);
  }
  pts.push([cx + halfW, sideBottom]);
  for (let t = 0.05; t <= 1.0001; t += 0.025) {
    pts.push([cx + halfW - 2 * halfW * t, sideBottom - 26 * (0.5 - 0.5 * Math.cos(t * Math.PI * 8))]);
  }
  return pts;
}

{
  const cx = 1205;
  const outline = ghostOutline(cx, 398, 158, 872);
  const midY = 640;
  const fat = outline.map(([x, y]) => [cx + (x - cx) * 1.07, midY + (y - midY) * 1.05]);
  fillPoly(fat, BLACK); // the thick black outline
  fillPoly(outline, WHITE); // the ghost itself

  // Sparkle eyes and a small round mouth.
  sparkle(1148, 548, 40, BLACK);
  sparkle(1262, 548, 40, BLACK);
  fillEllipse(1205, 630, 15, 20, BLACK);

  // Right hand holding the magenta coin with its white star.
  fillCircle(1352, 706, 39, BLACK);
  fillCircle(1352, 706, 32, WHITE);
  fillCircle(1366, 614, 58, hexRgb('#c2185b'));
  fillCircle(1366, 614, 48, MAGENTA);
  star(1366, 614, 27, 12, WHITE);

  // Left hand on the card's edge, marker in it, tip on the last tick.
  fillCircle(1042, 792, 39, BLACK);
  fillCircle(1042, 792, 32, WHITE);
  thickLine(1032, 798, 968, 818, 30, hexRgb('#2b2b3a'));
  thickLine(968, 818, 957, 822, 12, MAGENTA);
}

// Bottom band: the date, and make.fun's name worked into the poster.
fillRect(0, 924, W, 156, hexRgb('#180830'), 0.86);
drawText('THE WAIT IS OVER', 56, 944, 8, WHITE);
drawText('NOV 19, 2026', 56, 1012, 7, YELLOW);
drawText('make.fun', W - 56 - textWidth('make.fun', 10), 967, 10, hexRgb('#ff4fa3'), 1, true);

// ---------- Downsample and write ----------

const out = Buffer.alloc(W * H * 3);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    let r = 0;
    let g = 0;
    let b = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const i = ((y * SS + sy) * DW + (x * SS + sx)) * 3;
        r += buf[i];
        g += buf[i + 1];
        b += buf[i + 2];
      }
    }
    const o = (y * W + x) * 3;
    out[o] = Math.round(r / (SS * SS));
    out[o + 1] = Math.round(g / (SS * SS));
    out[o + 2] = Math.round(b / (SS * SS));
  }
}

const here = fileURLToPath(new URL('.', import.meta.url));
const target = join(here, 'meme.png');
const png = encodePng(W, H, out);
writeFileSync(target, png);
console.log(`wrote ${target} (${png.length} bytes)`);
