'use strict';

// 기능 통합 테스트: 선택, 복사, 단건/다중 삭제, 드래그 스크롤.
// 픽스처만 휴지통으로 보내며, 앱 UI 경로를 통해 동작한다.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, BrowserWindow, dialog, clipboard } = require('electron');
const { registerIpcHandlers } = require('../src/main/ipc');

const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures');
const USER_DATA = path.join(os.tmpdir(), 'st-feature-smoke-userdata');
const failures = [];

function check(condition, label) {
  console.log(`  ${condition ? '✓' : '✗'} ${label}`);
  if (!condition) failures.push(label);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(test, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await test();
    if (result) return result;
    await wait(100);
  }
  return null;
}

app.whenReady().then(async () => {
  try {
    fs.mkdirSync(USER_DATA, { recursive: true });
    fs.writeFileSync(path.join(USER_DATA, 'settings.json'), JSON.stringify({ lastFolder: FIXTURES }));
    app.setPath('userData', USER_DATA);

    // 자동화에서만 기본 확인 버튼을 누른 것으로 처리한다. 삭제 IPC/휴지통 동작은 실제다.
    let nextDialogResponse = 0;
    dialog.showMessageBox = async () => ({ response: nextDialogResponse });
    registerIpcHandlers({ userDataDir: USER_DATA });

    const win = new BrowserWindow({
      width: 1360,
      height: 860,
      show: false,
      webPreferences: {
        preload: path.join(ROOT, 'src', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    await win.loadFile(path.join(ROOT, 'src', 'renderer', 'index.html'));
    await waitFor(() => win.webContents.executeJavaScript('document.querySelectorAll(".thumb").length === 6'));
    console.log('\n[features smoke]');

    // 스캔 진행률이 IPC를 통해 렌더러에 전달되는지 확인한다.
    await win.webContents.executeJavaScript(`(() => {
      window.__scanProgress = [];
      window.__stopScanProgress = window.screenshotAPI.onScanProgress((entry) => window.__scanProgress.push(entry));
      document.getElementById('btnRefresh').click();
    })()`);
    const progressReported = await waitFor(async () => win.webContents.executeJavaScript(
      'window.__scanProgress.some((entry) => entry.phase === "metadata" && entry.completed === entry.total)'
    ));
    const progressEvents = await win.webContents.executeJavaScript(`(() => {
      window.__stopScanProgress();
      return window.__scanProgress;
    })()`);
    check(Boolean(progressReported), '스캔 메타데이터 진행률이 IPC로 렌더러에 전달됨');
    check(progressEvents.some((entry) => entry.phase === 'discover' && entry.completed === 6), '탐색 완료 시 이미지 총개수가 전달됨');

    // 여러 이미지 선택: 체크박스 + Shift 범위 선택, 일괄 툴바 표시.
    const selected = await win.webContents.executeJavaScript(`(() => {
      const firstCard = document.querySelector('.thumb');
      const extraCards = Array.from({ length: 1000 }, () => firstCard.cloneNode(true));
      const gallery = document.getElementById('gallery');
      extraCards.forEach((card) => gallery.append(card));
      const countBefore = document.querySelectorAll('.thumb').length;
      firstCard.querySelector('.thumb-check').click();
      const cardPreserved = document.querySelector('.thumb') === firstCard;
      const countPreserved = document.querySelectorAll('.thumb').length === countBefore;
      const secondCard = document.querySelectorAll('.thumb')[1];
      secondCard.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
      extraCards.forEach((card) => card.remove());
      return {
        count: document.getElementById('selectionCount').textContent,
        barVisible: !document.getElementById('selectionBar').hidden,
        selectedCards: document.querySelectorAll('.thumb.selected').length,
        copyDisabled: document.getElementById('btnCopySelected').disabled,
        cardPreserved,
        countPreserved,
      };
    })()`);
    check(selected.cardPreserved && selected.countPreserved, '선택 토글 시 1,000개 그리드 DOM을 재생성하지 않음');
    check(selected.count === '2개 선택됨', `Shift 범위 선택으로 2개 선택: ${selected.count}`);
    check(selected.barVisible && selected.selectedCards === 2, '다중 선택 강조 및 작업 표시줄 표시');
    check(selected.copyDisabled, '복수 선택 중 단일 이미지 복사 비활성화');

    // 단일 이미지 클립보드 복사
    await win.webContents.executeJavaScript(`document.getElementById('btnClearSelection').click()`);
    await win.webContents.executeJavaScript(`document.querySelector('.thumb-check').click()`);
    await win.webContents.executeJavaScript(`document.getElementById('btnCopySelected').click()`);
    const copied = await waitFor(() => clipboard.has('image/png'));
    check(Boolean(copied), '선택한 PNG가 시스템 이미지 클립보드에 기록됨');

    // 오른쪽 네이티브 스크롤바를 누른 동작이 본문 드래그로 가로채이지 않아야 한다.
    const scrollbarDrag = await win.webContents.executeJavaScript(`(() => {
      const scroller = document.querySelector('.content');
      scroller.style.paddingBottom = '1200px';
      scroller.scrollTop = 20;
      const rect = scroller.getBoundingClientRect();
      const x = rect.right - 4;
      const y = 200;
      const before = scroller.scrollTop;
      scroller.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: x, clientY: y }));
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y - 45 }));
      const afterMove = scroller.scrollTop;
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: x, clientY: y - 45 }));
      scroller.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return { before, afterMove, scrollbarStart: rect.left + scroller.clientLeft + scroller.clientWidth };
    })()`);
    check(scrollbarDrag.afterMove === scrollbarDrag.before,
      `스크롤바 영역 입력은 본문 드래그를 시작하지 않음 (x=${scrollbarDrag.scrollbarStart})`);

    // 본문을 끄는 스크롤 + 드래그 종료 직후 무관한 썸네일 click 차단을 검증한다.
    const drag = await win.webContents.executeJavaScript(`(() => {
      const scroller = document.querySelector('.content');
      const card = document.querySelector('.thumb');
      scroller.style.paddingBottom = '1200px';
      scroller.scrollTop = 20;
      const y = 200;
      scroller.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 100, clientY: y }));
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 100, clientY: y - 45 }));
      const afterMove = scroller.scrollTop;
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: 100, clientY: y - 45 }));
      card.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return { afterMove, lightboxHidden: document.getElementById('lightbox').hidden };
    })()`);
    check(drag.afterMove >= 60, `마우스 끌기 방향으로 스크롤 이동: scrollTop=${drag.afterMove}`);
    check(drag.lightboxHidden, '드래그 종료 후 썸네일 오클릭으로 미리보기가 열리지 않음');

    // 취소 확인은 파일을 유지하고 선택 상태도 보존해야 한다.
    const singlePath = path.join(FIXTURES, 'screenshot-2026-10-09-a.png');
    nextDialogResponse = 1;
    await win.webContents.executeJavaScript(`(() => {
      document.getElementById('btnClearSelection').click();
      const card = [...document.querySelectorAll('.thumb')].find((e) => e.dataset.path.endsWith('screenshot-2026-10-09-a.png'));
      card.querySelector('.thumb-check').click();
      document.getElementById('btnDeleteSelected').click();
    })()`);
    await wait(200);
    const cancelPreserved = fs.existsSync(singlePath)
      && await win.webContents.executeJavaScript('document.querySelectorAll(".thumb").length === 6');
    check(cancelPreserved, '삭제 확인 대화상자에서 취소하면 파일이 유지됨');
    nextDialogResponse = 0;
    await win.webContents.executeJavaScript(`document.getElementById('btnClearSelection').click()`);

    // 단일 삭제는 미리보기 안에서 수행, 실제 휴지통 이동 후 재스캔에서 사라지는지 확인.
    await win.webContents.executeJavaScript(`(() => {
      const card = [...document.querySelectorAll('.thumb')].find((e) => e.dataset.path.endsWith('screenshot-2026-10-09-a.png'));
      card.click();
      document.querySelector('[data-action="delete"]').click();
    })()`);
    const singleDeleted = await waitFor(async () => {
      const dom = await win.webContents.executeJavaScript('document.querySelectorAll(".thumb").length');
      return dom === 5 && !fs.existsSync(singlePath);
    });
    check(Boolean(singleDeleted), '미리보기에서 단일 이미지 삭제 → 휴지통 이동 및 목록 갱신');

    // 다중 삭제: 두 개를 체크하고 툴바에서 일괄 삭제.
    const multiPaths = [
      path.join(FIXTURES, 'screenshot-2026-10-09-b.png'),
      path.join(FIXTURES, 'screenshot-2026-10-08.png'),
    ];
    await win.webContents.executeJavaScript(`(() => {
      const cards = [...document.querySelectorAll('.thumb')];
      for (const suffix of ['screenshot-2026-10-09-b.png', 'screenshot-2026-10-08.png']) {
        cards.find((e) => e.dataset.path.endsWith(suffix)).querySelector('.thumb-check').click();
      }
      document.getElementById('btnDeleteSelected').click();
    })()`);
    const multiDeleted = await waitFor(async () => {
      const dom = await win.webContents.executeJavaScript('document.querySelectorAll(".thumb").length');
      return dom === 3 && multiPaths.every((p) => !fs.existsSync(p));
    });
    check(Boolean(multiDeleted), '다중 선택 삭제 → 2개 모두 휴지통 이동 및 목록 갱신');

    // 대량 선택은 전체 경로를 유지하되 화면 안팎 카드 DOM은 가상화한다.
    const bulkSelection = await win.webContents.executeJavaScript(`(async () => {
      const { getState, setState } = await import('./modules/state.js');
      const total = 9206;
      const url = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      const items = Array.from({ length: total }, (_, index) => ({
        id: 'bulk-' + index,
        path: 'C:/synthetic/bulk-' + index + '.png',
        name: 'bulk-' + index + '.png',
        url,
        date: new Date(2026, 9, 10),
      }));
      setState({
        sections: [{ key: 'bulk', title: '대량 선택 테스트', items }],
        total,
        ready: true,
        loading: false,
        error: null,
      });
      const renderDeadline = Date.now() + 30000;
      const scroller = document.querySelector('.content');
      while ((document.querySelectorAll('.thumb').length === 0 || scroller.scrollHeight < 100000)
        && Date.now() < renderDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const mountedBeforeSelection = document.querySelectorAll('.thumb').length;
      scroller.scrollTop = 20;
      const scrollBefore = scroller.scrollTop;
      document.getElementById('btnSelectAll').click();
      const selectedImmediately = document.querySelectorAll('.thumb.selected').length;
      const selectionCountAll = document.getElementById('selectionCount').textContent;
      const firstCard = document.querySelector('.thumb');
      firstCard.querySelector('.thumb-check').click();
      const selectionCountAfterToggle = document.getElementById('selectionCount').textContent;
      const y = 300;
      scroller.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 200, clientY: y }));
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 200, clientY: y - 45 }));
      const dragDelta = scroller.scrollTop - scrollBefore;
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: 200, clientY: y - 45 }));

      scroller.scrollTop = scroller.scrollHeight;
      scroller.dispatchEvent(new Event('scroll'));
      const bottomDeadline = Date.now() + 10000;
      const lastPath = 'C:/synthetic/bulk-' + (total - 1) + '.png';
      while (!document.querySelector('.thumb[data-path="' + lastPath + '"]') && Date.now() < bottomDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 16));
      }
      const bottomCards = [...document.querySelectorAll('.thumb')];
      const state = getState();
      return {
        total,
        mountedBeforeSelection,
        mountedAtBottom: bottomCards.length,
        selectedImmediately,
        selectionCountAll,
        selectionCountAfterToggle,
        dragDelta,
        selectedStateSize: state.selection.size,
        selectedAtBottom: bottomCards.filter((card) => card.classList.contains('selected')).length,
        lastCardSelected: document.querySelector('.thumb[data-path="' + lastPath + '"]')?.classList.contains('selected'),
        firstCardDeselected: !state.selection.has('C:/synthetic/bulk-0.png'),
      };
    })()`);
    check(bulkSelection.mountedBeforeSelection > 0 && bulkSelection.mountedBeforeSelection <= 200,
      `전체 9,206개 중 화면 주변 ${bulkSelection.mountedBeforeSelection}개만 DOM에 유지`);
    check(bulkSelection.selectionCountAll === `${bulkSelection.total}개 선택됨`, '대량 선택 수는 즉시 반영됨');
    check(bulkSelection.selectionCountAfterToggle === `${bulkSelection.total - 1}개 선택됨`,
      '대량 선택 도중 단일 해제도 상태에 반영됨');
    check(bulkSelection.selectedImmediately === bulkSelection.mountedBeforeSelection,
      '전체 선택 시 현재 화면에 있는 카드만 즉시 표시 갱신');
    check(bulkSelection.dragDelta >= 30, `대량 선택 중 드래그 스크롤 반응: ${bulkSelection.dragDelta}px`);
    check(bulkSelection.selectedStateSize === bulkSelection.total - 1 && bulkSelection.firstCardDeselected,
      '화면 밖 항목까지 전체 선택 상태를 보존하고 단일 해제 반영');
    check(bulkSelection.mountedAtBottom > 0 && bulkSelection.mountedAtBottom <= 200
      && bulkSelection.selectedAtBottom === bulkSelection.mountedAtBottom && bulkSelection.lastCardSelected,
    `아래로 이동하면 선택된 필요한 카드만 표시 (${bulkSelection.selectedAtBottom}/${bulkSelection.mountedAtBottom})`);

    console.log(`\n결과: ${failures.length === 0 ? 'ALL PASS' : `FAIL ${failures.length}건 — ${failures.join(' / ')}`}`);
    app.exit(failures.length === 0 ? 0 : 1);
  } catch (error) {
    console.error('FEATURE SMOKE ERROR:', error);
    app.exit(2);
  }
});
