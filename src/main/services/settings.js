'use strict';

// 간단한 설정 저장소 — 마지막으로 본 폴더만 기억한다 (로컬 JSON, 외부 전송 없음)

const fs = require('fs');
const path = require('path');

function settingsPath(userDataDir) {
  return path.join(userDataDir, 'settings.json');
}

function loadSettings(userDataDir) {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(userDataDir), 'utf8'));
  } catch (_) {
    return {};
  }
}

function saveSettings(userDataDir, settings) {
  fs.writeFileSync(settingsPath(userDataDir), JSON.stringify(settings, null, 2), 'utf8');
}

module.exports = { loadSettings, saveSettings };
