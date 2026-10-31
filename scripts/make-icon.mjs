// Generates the app icon (rounded indigo square with a white check mark)
// as a 256x256 PNG, with no image libraries. Run: npm run icon
import fs from 'node:fs'
import zlib from 'node:zlib'

const S = 256
const px = Buffer.alloc(S * S * 4)

function distToSegment(x, y, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy))
}

function roundedRectAlpha(x, y, r) {
  const cx = Math.min(Math.max(x, r + 8), S - r - 8)
  const cy = Math.min(Math.max(y, r + 8), S - r - 8)
  return Math.max(0, Math.min(1, r - Math.hypot(x - cx, y - cy) + 0.5))
}

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4
    const a = roundedRectAlpha(x + 0.5, y + 0.5, 56)
    if (a === 0) continue
    // Diagonal gradient #6366f1 -> #8b5cf6
    const g = (x + y) / (2 * S)
    let r = 0x63 + (0x8b - 0x63) * g
    let gr = 0x66 + (0x5c - 0x66) * g
    let b = 0xf1 + (0xf6 - 0xf1) * g
    const d = Math.min(distToSegment(x, y, 72, 132, 112, 172), distToSegment(x, y, 112, 172, 186, 92))
    const check = Math.max(0, Math.min(1, 14 - d + 0.5))
    r += (255 - r) * check
    gr += (255 - gr) * check
    b += (255 - b) * check
    px[i] = r
    px[i + 1] = gr
    px[i + 2] = b
    px[i + 3] = a * 255
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(S, 0)
ihdr.writeUInt32BE(S, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // RGBA
const raw = Buffer.alloc(S * (S * 4 + 1))
for (let y = 0; y < S; y++) px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4)

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0))
])

for (const dir of ['resources', 'build']) {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(`${dir}/icon.png`, png)
}
console.log('Wrote resources/icon.png and build/icon.png')
