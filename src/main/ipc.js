'use strict';

// IPC 계약: 렌더러는 오직 이 핸들러들을 통해서만 파일 시스템/셸에 접근한다.
// 나중에 검색·태그·중복 찾기를 추가할 때도 이 경계를 유지하면 된다.

const { ipcMain, dialog, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { scanFolder } = require('./services/scanner');
const { groupItemsBySection } = require('./services/grouping');
const { detectDefaultScreenshotFolder } = require('./services/folderDetector');
const { revealInFolder, openFile, trashItems, copyImageToClipboard } = require('./services/shellActions');
const { loadSettings, saveSettings } = require('./services/settings');

function registerIpcHandlers({ userDataDir }) {
  const settings = loadSettings(userDataDir);
  const persist = () => saveSettings(userDataDir, settings);

  ipcMain.handle('settings:lastFolder', () => settings.lastFolder || null);

  ipcMain.handle('settings:setLastFolder', (_event, folderPath) => {
    settings.lastFolder = folderPath || null;
    persist();
    return settings.lastFolder;
  });

  ipcMain.handle('folder:detect', () => detectDefaultScreenshotFolder());

  ipcMain.handle('folder:pick', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      title: '스크린샷 폴더 선택',
      properties: ['openDirectory'],
      defaultPath: settings.lastFolder || detectDefaultScreenshotFolder() || undefined,
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('scan:folder', async (event, folderPath, requestId) => {
    if (!folderPath || !fs.existsSync(folderPath)) {
      return { ok: false, error: '폴더를 찾을 수 없습니다.', folder: folderPath || null };
    }
    const { items, errors, scannedAt } = await scanFolder(folderPath, {
      onProgress: (progress) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('scan:progress', { requestId, ...progress });
        }
      },
    });
    return {
      ok: true,
      folder: folderPath,
      scannedAt,
      total: items.length,
      errors,
      sections: groupItemsBySection(items),
    };
  });

  ipcMain.handle('file:reveal', (_event, filePath) => {
    if (!filePath) return false;
    revealInFolder(filePath);
    return true;
  });

  ipcMain.handle('file:open', (_event, filePath) => {
    if (!filePath) return Promise.resolve('no path');
    return openFile(filePath);
  });

  ipcMain.handle('dialog:confirmDelete', async (event, count) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 1;
    const result = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['휴지통으로 이동', '취소'],
      defaultId: 1,
      cancelId: 1,
      title: '이미지 삭제',
      message: `선택한 이미지 ${n}개를 휴지통으로 이동할까요?`,
      detail: '휴지통에서 언제든 복원할 수 있습니다.',
    });
    return result.response === 0;
  });

  ipcMain.handle('file:delete', async (_event, filePaths) => {
    const list = Array.isArray(filePaths) ? filePaths.filter((p) => typeof p === 'string' && p) : [];
    if (list.length === 0) return { deleted: [], errors: [] };

    const root = settings.lastFolder && fs.existsSync(settings.lastFolder)
      ? fs.realpathSync(settings.lastFolder)
      : null;
    const allowed = [];
    const errors = [];
    for (const filePath of list) {
      try {
        const absolute = fs.realpathSync(filePath);
        const relative = root ? path.relative(root, absolute) : '..';
        const ext = path.extname(absolute).toLowerCase();
        if (!root || relative === '' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
          throw new Error('현재 선택된 스크린샷 폴더 안의 파일만 삭제할 수 있습니다.');
        }
        if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext) || !fs.statSync(absolute).isFile()) {
          throw new Error('지원되는 이미지 파일이 아닙니다.');
        }
        allowed.push(absolute);
      } catch (err) {
        errors.push({ path: filePath, message: err.message });
      }
    }
    const result = await trashItems(allowed);
    return { deleted: result.deleted, errors: [...errors, ...result.errors] };
  });

  ipcMain.handle('file:copyImage', (_event, filePath) => {
    if (typeof filePath !== 'string' || !filePath) return false;
    try {
      const root = settings.lastFolder && fs.existsSync(settings.lastFolder)
        ? fs.realpathSync(settings.lastFolder)
        : null;
      const absolute = fs.realpathSync(filePath);
      const relative = root ? path.relative(root, absolute) : '..';
      const ext = path.extname(absolute).toLowerCase();
      if (!root || relative === '' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return false;
      if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext) || !fs.statSync(absolute).isFile()) return false;
      return copyImageToClipboard(absolute);
    } catch (_) {
      return false;
    }
  });
}

module.exports = { registerIpcHandlers };
