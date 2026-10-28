'use strict';

// 로컬 폴더에서 이미지 파일만 스캔해 메타데이터 항목으로 변환한다.
// 파일 읽기는 여기에만 모아두어 나중에 중복 찾기/인덱싱 기능을 붙이기 쉽게 한다.

const fs = require('fs/promises');
const path = require('path');
const { pathToFileURL } = require('url');

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const MAX_DEPTH = 8;
const STAT_CONCURRENCY = 32;
const PROGRESS_INTERVAL = 128;

async function collectImageFiles(dir, depth, out, errors, onProgress) {
  if (depth > MAX_DEPTH) return;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    errors.push({ dir, message: err.message });
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectImageFiles(fullPath, depth + 1, out, errors, onProgress);
    } else if (entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      out.push(fullPath);
      if (out.length % PROGRESS_INTERVAL === 0) {
        onProgress?.({ phase: 'discover', completed: out.length });
      }
    }
  }
}

function toItem(filePath, stat) {
  // 생성일 우선, 없거나 이상하면 수정일 기준
  const birth = stat.birthtime;
  const useCreated = birth instanceof Date && !Number.isNaN(birth.getTime()) && birth.getTime() > 0;
  const date = useCreated ? birth : stat.mtime;
  return {
    id: filePath,
    name: path.basename(filePath),
    path: filePath,
    ext: path.extname(filePath).slice(1).toLowerCase(),
    size: stat.size,
    createdAt: (useCreated ? birth : stat.mtime).toISOString(),
    modifiedAt: stat.mtime.toISOString(),
    date: date.toISOString(),
    url: pathToFileURL(filePath).href,
  };
}

async function scanFolder(folderPath, { onProgress } = {}) {
  const files = [];
  const errors = [];
  onProgress?.({ phase: 'discover', completed: 0 });
  await collectImageFiles(folderPath, 0, files, errors, onProgress);
  onProgress?.({ phase: 'discover', completed: files.length });
  onProgress?.({ phase: 'metadata', completed: 0, total: files.length });

  const items = new Array(files.length);
  let nextIndex = 0;
  let completed = 0;
  const workerCount = Math.min(STAT_CONCURRENCY, files.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < files.length) {
      const index = nextIndex++;
      const filePath = files[index];
      try {
        const stat = await fs.stat(filePath);
        items[index] = toItem(filePath, stat);
      } catch (err) {
        errors.push({ file: filePath, message: err.message });
      }
      completed += 1;
      if (completed % PROGRESS_INTERVAL === 0 || completed === files.length) {
        onProgress?.({ phase: 'metadata', completed, total: files.length });
      }
    }
  }));

  const validItems = items.filter(Boolean);
  validItems.sort((a, b) => new Date(b.date) - new Date(a.date));
  return { folder: folderPath, items: validItems, errors, scannedAt: new Date().toISOString() };
}

module.exports = { IMAGE_EXTENSIONS, scanFolder };
