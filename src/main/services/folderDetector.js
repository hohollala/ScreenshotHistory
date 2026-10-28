'use strict';

// 첫 실행 시 기본 스크린샷 폴더 자동 탐지 (Windows 우선)
// 후보: Pictures\Screenshots (Win+Shift&S 기본), OneDrive Pictures\Screenshots, Pictures, Desktop

const fs = require('fs');
const os = require('os');
const path = require('path');

function candidateFolders() {
  const home = os.homedir();
  const list = [];
  const push = (p) => {
    if (p && !list.includes(p)) list.push(p);
  };

  push(path.join(home, 'Pictures', 'Screenshots'));
  if (process.env.OneDrive) push(path.join(process.env.OneDrive, 'Pictures', 'Screenshots'));
  push(path.join(home, 'OneDrive', 'Pictures', 'Screenshots'));
  push(path.join(home, 'Pictures'));
  push(path.join(home, 'Desktop'));
  return list;
}

function detectDefaultScreenshotFolder() {
  for (const dir of candidateFolders()) {
    try {
      if (fs.statSync(dir).isDirectory()) return dir;
    } catch (_) {
      // 없는 경로는 다음 후보로
    }
  }
  return null;
}

module.exports = { candidateFolders, detectDefaultScreenshotFolder };
