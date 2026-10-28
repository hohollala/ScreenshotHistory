const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const iconPath = path.join(root, 'assets', 'screenshot-timeline.ico');
const svgPath = path.join(root, 'assets', 'screenshot-timeline.svg');
const icon = fs.readFileSync(iconPath);
const svg = fs.readFileSync(svgPath, 'utf8');
const expectedSizes = [16, 24, 32, 48, 64, 128, 256];

assert.match(svg, /<svg\b[^>]*viewBox="0 0 256 256"/);
assert.equal(icon.readUInt16LE(0), 0, 'ICO reserved field');
assert.equal(icon.readUInt16LE(2), 1, 'ICO image type');
assert.equal(icon.readUInt16LE(4), expectedSizes.length, 'ICO frame count');

for (const [index, expectedSize] of expectedSizes.entries()) {
  const offset = 6 + index * 16;
  const widthByte = icon.readUInt8(offset);
  const heightByte = icon.readUInt8(offset + 1);
  const width = widthByte || 256;
  const height = heightByte || 256;
  const bytesInResource = icon.readUInt32LE(offset + 8);
  const imageOffset = icon.readUInt32LE(offset + 12);

  assert.equal(width, expectedSize, `${expectedSize}px frame width`);
  assert.equal(height, expectedSize, `${expectedSize}px frame height`);
  assert.equal(icon.readUInt16LE(offset + 4), 1, `${expectedSize}px planes`);
  assert.equal(icon.readUInt16LE(offset + 6), 32, `${expectedSize}px color depth`);
  assert.ok(imageOffset >= 6 + expectedSizes.length * 16, `${expectedSize}px data offset`);
  assert.ok(imageOffset + bytesInResource <= icon.length, `${expectedSize}px frame bounds`);
  assert.equal(icon.readUInt32LE(imageOffset), 40, `${expectedSize}px DIB header`);
  assert.equal(icon.readInt32LE(imageOffset + 4), expectedSize, `${expectedSize}px DIB width`);
  assert.equal(icon.readInt32LE(imageOffset + 8), expectedSize * 2, `${expectedSize}px DIB height`);
}

console.log('Icon asset tests passed ✓');
