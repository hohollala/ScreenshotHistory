const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const root = path.resolve(__dirname, '..');
const svgPath = path.join(root, 'assets', 'screenshot-timeline.svg');
const icoPath = path.join(root, 'assets', 'screenshot-timeline.ico');
const previewPath = path.join(root, 'assets', 'screenshot-timeline-preview.png');
const sizes = [16, 24, 32, 48, 64, 128, 256];

function makeBitmapFrame(size, rgbaBase64) {
  const rgba = Buffer.from(rgbaBase64, 'base64');
  const expectedLength = size * size * 4;
  if (rgba.length !== expectedLength) {
    throw new Error(`Unexpected ${size}px raster length: ${rgba.length}`);
  }

  const xorBitmap = Buffer.alloc(expectedLength);
  const maskStride = Math.ceil(size / 32) * 4;
  const andMask = Buffer.alloc(maskStride * size);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const sourceOffset = (y * size + x) * 4;
      const targetOffset = ((size - 1 - y) * size + x) * 4;
      const alpha = rgba[sourceOffset + 3];
      xorBitmap[targetOffset] = rgba[sourceOffset + 2];
      xorBitmap[targetOffset + 1] = rgba[sourceOffset + 1];
      xorBitmap[targetOffset + 2] = rgba[sourceOffset];
      xorBitmap[targetOffset + 3] = alpha;
      if (alpha < 128) {
        andMask[(size - 1 - y) * maskStride + Math.floor(x / 8)] |= 0x80 >> (x % 8);
      }
    }
  }

  const dibHeader = Buffer.alloc(40);
  dibHeader.writeUInt32LE(40, 0);
  dibHeader.writeInt32LE(size, 4);
  dibHeader.writeInt32LE(size * 2, 8);
  dibHeader.writeUInt16LE(1, 12);
  dibHeader.writeUInt16LE(32, 14);
  dibHeader.writeUInt32LE(0, 16);
  dibHeader.writeUInt32LE(xorBitmap.length + andMask.length, 20);

  return Buffer.concat([dibHeader, xorBitmap, andMask]);
}

function makeIco(frames) {
  const headerSize = 6 + frames.length * 16;
  const directory = Buffer.alloc(headerSize);
  directory.writeUInt16LE(0, 0);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(frames.length, 4);

  const images = [];
  let imageOffset = headerSize;
  frames.forEach(({ size, rgbaBase64 }, index) => {
    const image = makeBitmapFrame(size, rgbaBase64);
    const entryOffset = 6 + index * 16;
    directory.writeUInt8(size === 256 ? 0 : size, entryOffset);
    directory.writeUInt8(size === 256 ? 0 : size, entryOffset + 1);
    directory.writeUInt8(0, entryOffset + 2);
    directory.writeUInt8(0, entryOffset + 3);
    directory.writeUInt16LE(1, entryOffset + 4);
    directory.writeUInt16LE(32, entryOffset + 6);
    directory.writeUInt32LE(image.length, entryOffset + 8);
    directory.writeUInt32LE(imageOffset, entryOffset + 12);
    images.push(image);
    imageOffset += image.length;
  });

  return Buffer.concat([directory, ...images]);
}

async function main() {
  const svg = fs.readFileSync(svgPath, 'utf8');
  const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  const html = `<!doctype html><meta charset="utf-8"><script>
    window.renderIconFrames = (async () => {
      const image = new Image();
      image.src = '${svgDataUrl}';
      await image.decode();
      const frames = [];
      let preview = '';
      for (const size of ${JSON.stringify(sizes)}) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(image, 0, 0, size, size);
        const pixels = context.getImageData(0, 0, size, size).data;
        let binary = '';
        for (let start = 0; start < pixels.length; start += 0x8000) {
          binary += String.fromCharCode(...pixels.subarray(start, start + 0x8000));
        }
        frames.push({ size, rgbaBase64: btoa(binary) });
        if (size === 256) preview = canvas.toDataURL('image/png').split(',')[1];
      }
      return { frames, preview };
    })();
  </script>`;

  const window = new BrowserWindow({
    show: false,
    width: 256,
    height: 256,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  await window.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`);
  const rendered = await window.webContents.executeJavaScript('window.renderIconFrames', true);
  fs.mkdirSync(path.dirname(icoPath), { recursive: true });
  fs.writeFileSync(icoPath, makeIco(rendered.frames));
  fs.writeFileSync(previewPath, Buffer.from(rendered.preview, 'base64'));
  window.destroy();
  console.log(`Generated ${icoPath} (${rendered.frames.map(({ size }) => `${size}px`).join(', ')})`);
  console.log(`Preview: ${previewPath}`);
}

app.whenReady()
  .then(main)
  .then(() => app.quit())
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
