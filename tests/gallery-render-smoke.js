'use strict';

const assert = require('assert');
const path = require('path');
const { app, BrowserWindow } = require('electron');

async function waitFor(test, timeoutMs = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = await test();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for gallery render');
}

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true } });
  try {
    await window.loadFile(path.join(__dirname, 'gallery-render.html'));
    await waitFor(() => window.webContents.executeJavaScript('typeof window.renderGallery === "function"'));
    const total = 9206;
    const initialCount = await window.webContents.executeJavaScript(`(() => {
      const items = Array.from({ length: ${total} }, (_, index) => ({
        id: String(index),
        path: 'C:/synthetic/screenshot-' + index + '.png',
        name: 'screenshot-' + index + '.png',
        date: '2026-10-09T12:00:00.000Z',
        url: 'file:///C:/synthetic/screenshot-' + index + '.png',
      }));
      window.renderProgress = [];
      window.renderGallery(document.getElementById('gallery'), {
        sections: [{ key: 'today', title: '오늘', items }],
        selection: new Set(),
      }, {
        onOpen() {},
        onToggleSelect() {},
        onRangeSelect() {},
        onProgress(rendered, count) { window.renderProgress.push([rendered, count]); },
      });
      return document.querySelectorAll('.thumb').length;
    })()`);

    assert.ok(initialCount < total, `초기 렌더에서 전체 ${total}개를 DOM에 넣지 않음 (초기 ${initialCount})`);
    await waitFor(() => window.webContents.executeJavaScript(
      'document.getElementById("scroller").scrollHeight > 100000'
    ));
    const result = await window.webContents.executeJavaScript(`({
      count: document.querySelectorAll('.thumb').length,
      progress: window.renderProgress,
      scrollHeight: document.getElementById('scroller').scrollHeight,
      first: document.querySelector('.thumb[data-path$="screenshot-0.png"]') !== null,
      last: document.querySelector('.thumb[data-path$="screenshot-${total - 1}.png"]') !== null,
    })`);
    assert.ok(result.count > 0 && result.count <= 200, `화면 주변 카드만 DOM에 유지 (${result.count})`);
    assert.ok(result.scrollHeight > 100000, `전체 목록 길이를 가상 스크롤 높이로 유지 (${result.scrollHeight})`);
    assert.ok(result.first, '처음 위치에서 첫 카드가 렌더됨');
    assert.ok(!result.last, '처음 위치에서 마지막 카드 DOM은 생성하지 않음');
    assert.strictEqual(result.progress.at(-1)[0], total, '목록 준비 진행률이 전체 개수와 일치');

    const bottom = await window.webContents.executeJavaScript(`(async () => {
      const scroller = document.getElementById('scroller');
      scroller.scrollTop = scroller.scrollHeight;
      scroller.dispatchEvent(new Event('scroll'));
      const deadline = Date.now() + 5000;
      while (!document.querySelector('.thumb[data-path$="screenshot-${total - 1}.png"]') && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return {
        count: document.querySelectorAll('.thumb').length,
        first: document.querySelector('.thumb[data-path$="screenshot-0.png"]') !== null,
        last: document.querySelector('.thumb[data-path$="screenshot-${total - 1}.png"]') !== null,
      };
    })()`);
    assert.ok(bottom.count > 0 && bottom.count <= 200, `아래쪽에서도 DOM 개수 제한 (${bottom.count})`);
    assert.ok(bottom.last && !bottom.first, '아래로 스크롤하면 아래 카드로 DOM 창이 교체됨');

    const top = await window.webContents.executeJavaScript(`(async () => {
      const scroller = document.getElementById('scroller');
      scroller.scrollTop = 0;
      scroller.dispatchEvent(new Event('scroll'));
      const deadline = Date.now() + 5000;
      while (!document.querySelector('.thumb[data-path$="screenshot-0.png"]') && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return document.querySelectorAll('.thumb').length;
    })()`);
    assert.ok(top <= 200, `위로 복귀해도 DOM 개수 제한 (${top})`);
    console.log(`gallery virtualization tests passed ✓ (total ${total}, mounted <= ${Math.max(result.count, bottom.count, top)})`);
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
