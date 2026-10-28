'use strict';

// Electron 메인 프로세스 진입점 — 창 생성과 IPC 등록만 담당

const path = require('path');
const { app, BrowserWindow } = require('electron');
const { registerIpcHandlers } = require('./ipc');

// 제품명 변경 후에도 기존 설정 폴더와 마지막 스크린샷 경로를 유지한다.
app.setPath('userData', path.join(app.getPath('appData'), 'Screenshot Timeline'));

let mainWindow = null;

function getWindowIcon() {
  if (process.platform !== 'win32') return undefined;
  return app.isPackaged
    ? path.join(process.resourcesPath, 'screenshot-timeline.ico')
    : path.join(__dirname, '..', '..', 'assets', 'screenshot-timeline.ico');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1000,
    minHeight: 620,
    backgroundColor: '#0f1115',
    show: false,
    autoHideMenuBar: true,
    title: '어썸 캡처 모아',
    icon: getWindowIcon(),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  registerIpcHandlers({ userDataDir: app.getPath('userData') });
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
