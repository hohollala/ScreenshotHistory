'use strict';

// 앱 통합 스모크 테스트 — 실제 렌더러 화면을 띄워 DOM/라이트박스/스크린샷을 검증한다.
//
//   npx electron tests/smoke.js          # 픽스처 폴더로 UI 검증 + QA용 스크린샷 저장
//   npx electron tests/smoke.js --empty  # 빈 폴더 상태 화면 검증
//   npx electron tests/smoke.js --reveal # '파일 위치 열기' 실제 동작 검증 (탐색기 창이 열림)

const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, BrowserWindow } = require('electron');
const { registerIpcHandlers } = require('../src/main/ipc');

const REPO_ROOT = path.join(__dirname, '..');
const FIXTURE_DIR = path.join(__dirname, 'fixtures');
const EMPTY_DIR = path.join(__dirname, 'fixtures-empty');
const OUT_DIR = path.join(REPO_ROOT, 'docs', 'qa');

const mode = process.argv.includes('--empty') ? 'empty'
  : process.argv.includes('--reveal') ? 'reveal'
  : 'default';

const failures = [];
function check(cond, label) {
  console.log(`  ${cond ? '✓' : '✗'} ${label}`);
  if (!cond) failures.push(label);
}

async function waitFor(fn, timeoutMs = 10000, intervalMs = 250) {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() - start > timeoutMs) return null;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

app.whenReady().then(async () => {
  try {
    const userData = path.join(os.tmpdir(), `st-smoke-userdata-${mode}`);
    fs.mkdirSync(userData, { recursive: true });
    const targetDir = mode === 'empty' ? EMPTY_DIR : FIXTURE_DIR;
    fs.writeFileSync(
      path.join(userData, 'settings.json'),
      JSON.stringify({ lastFolder: targetDir }),
      'utf8'
    );
    app.setPath('userData', userData);
    registerIpcHandlers({ userDataDir: userData });

    const win = new BrowserWindow({
      width: 1360,
      height: 860,
      show: false,
      webPreferences: {
        preload: path.join(REPO_ROOT, 'src', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    await win.loadFile(path.join(REPO_ROOT, 'src', 'renderer', 'index.html'));

    console.log(`\n[smoke:${mode}] 대상 폴더: ${targetDir}`);

    if (mode === 'empty') {
      await new Promise((r) => setTimeout(r, 1200));
      const diag = await win.webContents.executeJavaScript(`(() => ({
        thumbs: document.querySelectorAll('.thumb').length,
        emptyVisible: !document.getElementById('emptyState').hidden,
        galleryHidden: document.getElementById('gallery').hidden,
        lightboxHidden: document.getElementById('lightbox').hidden,
      }))()`);
      console.log('  DOM:', JSON.stringify(diag));
      check(diag.thumbs === 0, '빈 폴더에서 썸네일 0개');
      check(diag.emptyVisible, '빈 상태 화면 표시');
      check(diag.galleryHidden, '갤러리 영역 숨김');
      check(diag.lightboxHidden, '라이트박스 숨김 유지');
      finish(win);
      return;
    }

    // 1) 스캔 → 그리드 렌더 대기
    const loaded = await waitFor(() => win.webContents.executeJavaScript(
      `document.querySelectorAll('.thumb').length > 0`
    ));
    check(loaded, '스캔 결과가 그리드에 렌더됨');

    const diag = await win.webContents.executeJavaScript(`(() => ({
      folder: document.getElementById('folderPath').textContent.trim(),
      thumbs: document.querySelectorAll('.thumb').length,
      groups: Array.from(document.querySelectorAll('.group-title')).map((e) => e.textContent.trim()),
      filters: Array.from(document.querySelectorAll('.filter-item')).map((e) => e.textContent.trim()),
      lightboxHidden: document.getElementById('lightbox').hidden,
      loadingHidden: document.getElementById('loadingState').hidden,
      emptyHidden: document.getElementById('emptyState').hidden,
      status: document.getElementById('statusLine').textContent.trim(),
      brokenImages: Array.from(document.querySelectorAll('.thumb img')).filter((i) => !i.complete || i.naturalWidth === 0).length,
    }))()`);
    console.log('  DOM:', JSON.stringify(diag, null, 2));

    check(diag.thumbs === 6, `썸네일 6개 (실제: ${diag.thumbs})`);
    const sectionTitles = {
      today: '오늘',
      yesterday: '어제',
      week: '이번 주',
      month: '이번 달',
      older: '이전 항목',
    };
    const expectedSectionKeys = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'manifest.json'), 'utf8')).expectedSectionKeys;
    for (const key of expectedSectionKeys) {
      check(diag.groups.some((group) => group.startsWith(sectionTitles[key])), `날짜 섹션 "${sectionTitles[key]}" 표시`);
    }
    check(diag.filters.some((f) => f.startsWith('전체')), '사이드바 "전체" 필터');
    check(diag.filters.length === 6, `사이드바 필터 6개(전체+5섹션), 실제: ${diag.filters.length}`);
    check(diag.lightboxHidden, '초기 상태에서 라이트박스 숨김');
    check(diag.loadingHidden, '로딩 스피너 숨김(로드 완료)');
    check(diag.emptyHidden, '빈 상태 화면 숨김');
    check(diag.brokenImages === 0, `이미지 모두 정상 디코딩 (깨진 이미지 ${diag.brokenImages}개)`);
    check(diag.folder.toLowerCase().includes('fixtures'), `폴더 경로 표시: ${diag.folder}`);

    // 2) QA용 스크린샷 저장 (갤러리)
    fs.mkdirSync(OUT_DIR, { recursive: true });
    await new Promise((r) => setTimeout(r, 400));
    const galleryPng = await win.capturePage();
    fs.writeFileSync(path.join(OUT_DIR, 'app-v1.1-gallery.png'), galleryPng.toPNG());
    console.log(`  스크린샷 저장: ${path.join(OUT_DIR, 'app-v1.1-gallery.png')}`);

    if (mode === 'reveal') {
      // 3) '파일 위치 열기' — 실제 탐색기 열림 확인은 list_windows로 수행
      const clicked = await win.webContents.executeJavaScript(`(() => {
        document.querySelector('.thumb').click();
        return true;
      })()`);
      check(clicked, '썸네일 클릭 → 라이트박스 열기');
      await new Promise((r) => setTimeout(r, 300));
      const revealResult = await win.webContents.executeJavaScript(
        `window.screenshotAPI.revealFile(${JSON.stringify(path.join(FIXTURE_DIR, 'screenshot-2026-10-09-a.png'))})`
      );
      check(revealResult === true, `revealFile IPC 호출 성공 (결과: ${revealResult})`);
      console.log('  ※ 이제 list_windows에서 "fixtures" 탐색기 창이 나타나는지 확인할 것');
      await new Promise((r) => setTimeout(r, 3000));
      finish(win);
      return;
    }

    // 3) 라이트박스: 열기 / 메타데이터 / 키보드 이동 / 닫기
    const lb = await win.webContents.executeJavaScript(`(() => {
      document.querySelector('.thumb').click();
      return {
        hidden: document.getElementById('lightbox').hidden,
        name: document.getElementById('lightboxName').textContent.trim(),
        meta: document.getElementById('lightboxMeta').textContent.trim(),
        counter: document.getElementById('lightboxCounter').textContent.trim(),
        imageSet: !!document.getElementById('lightboxImage').getAttribute('src'),
      };
    })()`);
    console.log('  라이트박스:', JSON.stringify(lb, null, 2));
    check(lb.hidden === false, '썸네일 클릭 시 라이트박스 열림');
    check(lb.name.length > 0, `파일명 표시: ${lb.name}`);
    check(lb.meta.includes('년') && lb.meta.includes('·'), `날짜·크기 메타 표시: ${lb.meta}`);
    check(lb.counter === '1 / 6', `카운터 표시: ${lb.counter}`);
    check(lb.imageSet, '큰 이미지 로드됨');

    const moved = await win.webContents.executeJavaScript(`(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      return document.getElementById('lightboxCounter').textContent.trim();
    })()`);
    check(moved === '2 / 6', `→ 키로 다음 이미지 이동: ${moved}`);

    const lightboxPng = await win.capturePage();
    fs.writeFileSync(path.join(OUT_DIR, 'app-v1.1-lightbox.png'), lightboxPng.toPNG());
    console.log(`  스크린샷 저장: ${path.join(OUT_DIR, 'app-v1.1-lightbox.png')}`);

    const closed = await win.webContents.executeJavaScript(`(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return document.getElementById('lightbox').hidden;
    })()`);
    check(closed === true, 'Esc로 라이트박스 닫힘');

    finish(win);
  } catch (err) {
    console.error('SMOKE ERROR:', err);
    app.exit(2);
  }
});

function finish() {
  console.log(`\n결과: ${failures.length === 0 ? 'ALL PASS' : `FAIL ${failures.length}건 - ${failures.join(' / ')}`}`);
  app.exit(failures.length === 0 ? 0 : 1);
}
