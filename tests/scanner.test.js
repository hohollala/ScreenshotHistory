'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { scanFolder } = require('../src/main/services/scanner');

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'screenshot-timeline-scanner-'));
  try {
    fs.mkdirSync(path.join(root, 'nested'));
    for (const name of ['a.png', 'b.jpg']) fs.writeFileSync(path.join(root, name), 'fixture');
    fs.writeFileSync(path.join(root, 'nested', 'c.webp'), 'fixture');
    fs.writeFileSync(path.join(root, 'ignore.txt'), 'not an image');

    const progress = [];
    const result = await scanFolder(root, { onProgress: (entry) => progress.push(entry) });

    assert.strictEqual(result.items.length, 3, 'PNG/JPG/WEBP 파일 3개를 스캔');
    assert.ok(progress.some((entry) => entry.phase === 'discover' && entry.completed === 3), '파일 개수 탐색 완료 진행 상황을 보고');
    assert.ok(progress.some((entry) => entry.phase === 'metadata' && entry.completed === 0 && entry.total === 3), '메타데이터 조회 전에 전체 파일 수를 보고');
    assert.ok(progress.some((entry) => entry.phase === 'metadata' && entry.completed === 3 && entry.total === 3), '메타데이터 진행 완료를 보고');
    console.log('scanner progress tests passed ✓');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
