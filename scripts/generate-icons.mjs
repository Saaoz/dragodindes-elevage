// Génère les icônes PWA (PNG) sans dépendance : œuf stylisé sur fond vert.
// Usage : node scripts/generate-icons.mjs  (les PNG sont commités dans public/icons)
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const BG = [22, 101, 52];
const EGG = [254, 243, 199];
const SPOT = [217, 119, 6];

function crc32(buf) {
  let c;
  let crc = ~0;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x / size, y / size);
      const o = y * stride + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
// scale < 1 : motif réduit (zone de sécurité des icônes maskable)
function icon(scale) {
  return (u, v) => {
    const x = (u - 0.5) / scale;
    const y = (v - 0.5) / scale;
    const w = y < 0 ? 0.26 : 0.31;
    const inEgg = (x / w) ** 2 + ((y - 0.02) / 0.4) ** 2 <= 1;
    if (!inEgg) return BG;
    const spots = [
      [-0.08, -0.1, 0.06],
      [0.1, 0.05, 0.05],
      [-0.04, 0.18, 0.045],
    ];
    for (const [cx, cy, r] of spots) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) return SPOT;
    return EGG;
  };
}
mkdirSync("public/icons", { recursive: true });
for (const s of [192, 512]) {
  writeFileSync(`public/icons/icon-${s}.png`, png(s, icon(1)));
  writeFileSync(`public/icons/maskable-${s}.png`, png(s, icon(0.75)));
}
writeFileSync("public/icons/apple-touch-icon.png", png(180, icon(0.85)));
console.log("Icônes générées dans public/icons");
