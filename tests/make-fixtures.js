'use strict';

// 테스트용 픽스처 PNG 생성기 — 외부 의존성 없이 순수 Node로 만든다.
// node tests/make-fixtures.js

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');
const { sectionKeyFor } = require('../src/main/services/grouping');

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// 두 톤 가로 줄무늬 PNG
function makePng(width, height, rgbA, rgbB) {
  const stride = 1 + width * 3;
  const raw = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // filter: None
    const rgb = Math.floor(y / (height / 4)) % 2 === 0 ? rgbA : rgbB;
    for (let x = 0; x < width; x++) {
      const i = rowStart + 1 + x * 3;
      raw[i] = rgb[0];
      raw[i + 1] = rgb[1];
      raw[i + 2] = rgb[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function main() {
  const dir = path.join(__dirname, 'fixtures');
  const emptyDir = path.join(__dirname, 'fixtures-empty');
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(emptyDir, { recursive: true });

  const palette = [
    ['screenshot-2026-10-09-a.png', [226, 106, 106], [240, 190, 120]],
    ['screenshot-2026-10-09-b.png', [106, 160, 226], [140, 210, 200]],
    ['screenshot-2026-10-08.png', [130, 110, 220], [200, 160, 240]],
    ['screenshot-2026-10-06.png', [96, 190, 130], [200, 230, 150]],
    ['screenshot-2026-10-02.png', [220, 170, 90], [245, 220, 160]],
    ['screenshot-2026-08-15.png', [110, 120, 140], [180, 190, 205]],
  ];

  const today = new Date();
  const atLocalTime = (date, hour) => {
    const value = new Date(date);
    value.setHours(hour, 0, 0, 0);
    return value;
  };
  const todayDate = new Date(today);
  todayDate.setHours(0, 0, 0, 0);
  const yesterday = new Date(todayDate);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekStart = new Date(todayDate);
  const mondayOffset = weekStart.getDay() === 0 ? 6 : weekStart.getDay() - 1;
  weekStart.setDate(weekStart.getDate() - mondayOffset);
  const monthStart = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);
  const previousMonth = new Date(todayDate.getFullYear(), todayDate.getMonth() - 1, 15);

  const timestamps = {
    'screenshot-2026-10-09-a.png': atLocalTime(todayDate, 10),
    'screenshot-2026-10-09-b.png': atLocalTime(todayDate, 16),
    'screenshot-2026-10-08.png': atLocalTime(yesterday, 12),
    'screenshot-2026-10-06.png': atLocalTime(weekStart, 12),
    'screenshot-2026-10-02.png': atLocalTime(monthStart, 12),
    'screenshot-2026-08-15.png': atLocalTime(previousMonth, 12),
  };

  for (const [name, a, b] of palette) {
    const filePath = path.join(dir, name);
    fs.writeFileSync(filePath, makePng(480, 300, a, b));
    fs.utimesSync(filePath, timestamps[name], timestamps[name]);
    console.log(`created ${name}`);
  }

  if (process.platform === 'win32') {
    const setCreationTimes = Object.entries(timestamps)
      .map(([name, date]) => {
        const iso = date.toISOString();
        return `$f=Get-Item -LiteralPath '${path.join(dir, name)}'; $t=[DateTimeOffset]::Parse('${iso}').LocalDateTime; $f.CreationTime=$t; $f.LastWriteTime=$t`;
      })
      .join('; ');
    const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', setCreationTimes], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`픽스처 CreationTime 설정 실패: ${result.stderr || result.stdout}`);
  }

  const expectedSectionKeys = [...new Set(Object.values(timestamps).map((date) => sectionKeyFor(date, today)))];
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ expectedSectionKeys }, null, 2));
  console.log(`expected sections: ${expectedSectionKeys.join(', ')}`);
  console.log(`fixtures dir: ${dir}`);
  console.log(`empty dir:    ${emptyDir}`);
}

main();
