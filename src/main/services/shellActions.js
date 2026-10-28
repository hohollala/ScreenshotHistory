'use strict';

// OS 셸 연동 — 파일 위치 열기 / 외부 뷰어로 열기 / 휴지통 삭제 / 클립보드 복사

const { shell, clipboard, nativeImage, ClipboardItem } = require('electron');

function revealInFolder(filePath) {
  shell.showItemInFolder(filePath);
}

function openFile(filePath) {
  return shell.openPath(filePath); // Promise<string>, ''이면 성공
}

// 삭제는 완전 삭제 대신 휴지통으로 보내 복구 가능하게 한다
async function trashItems(filePaths) {
  const deleted = [];
  const errors = [];
  for (const filePath of filePaths) {
    try {
      await shell.trashItem(filePath);
      deleted.push(filePath);
    } catch (err) {
      errors.push({ path: filePath, message: err.message });
    }
  }
  return { deleted, errors };
}

async function copyImageToClipboard(filePath) {
  const image = nativeImage.createFromPath(filePath);
  if (image.isEmpty()) return false;
  const pngBlob = new Blob([image.toPNG()], { type: 'image/png' });
  await clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
  return true;
}

module.exports = { revealInFolder, openFile, trashItems, copyImageToClipboard };
