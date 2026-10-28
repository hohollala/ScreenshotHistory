'use strict';

// 프리로드: 렌더러에 노출하는 API를 한 곳에서 정의한다.
// 새 기능(검색·태그 등)은 여기에 메서드를 추가하는 방식으로 확장.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('screenshotAPI', {
  detectFolder: () => ipcRenderer.invoke('folder:detect'),
  pickFolder: () => ipcRenderer.invoke('folder:pick'),
  scanFolder: (folderPath, requestId) => ipcRenderer.invoke('scan:folder', folderPath, requestId),
  onScanProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('scan:progress', listener);
    return () => ipcRenderer.removeListener('scan:progress', listener);
  },
  revealFile: (filePath) => ipcRenderer.invoke('file:reveal', filePath),
  openFile: (filePath) => ipcRenderer.invoke('file:open', filePath),
  getLastFolder: () => ipcRenderer.invoke('settings:lastFolder'),
  setLastFolder: (folderPath) => ipcRenderer.invoke('settings:setLastFolder', folderPath),
  confirmDelete: (count) => ipcRenderer.invoke('dialog:confirmDelete', count),
  deleteFiles: (filePaths) => ipcRenderer.invoke('file:delete', filePaths),
  copyImage: (filePath) => ipcRenderer.invoke('file:copyImage', filePath),
});
