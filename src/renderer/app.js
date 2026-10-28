// 렌더러 오케스트레이터 — 상태 변경 → 화면 갱신 흐름만 담당

import { api } from './modules/api.js';
import { getState, setState, subscribe, flatItems, toggleSelect, selectRange, clearSelection, selectAll } from './modules/state.js';
import { renderFilterList, FILTER_ALL_KEY } from './modules/sidebar.js';
import { renderGallery, applySelectionChanges, scrollToSection } from './modules/gallery.js';
import { initLightbox, openLightbox, closeLightbox } from './modules/lightbox.js';
import { formatCount } from './modules/format.js';

const els = {
  folderPath: document.getElementById('folderPath'),
  filterList: document.getElementById('filterList'),
  statusLine: document.getElementById('statusLine'),
  contentTitle: document.getElementById('contentTitle'),
  contentMeta: document.getElementById('contentMeta'),
  loadingState: document.getElementById('loadingState'),
  emptyState: document.getElementById('emptyState'),
  gallery: document.getElementById('gallery'),
  btnChangeFolder: document.getElementById('btnChangeFolder'),
  btnRefresh: document.getElementById('btnRefresh'),
  btnEmptyPick: document.getElementById('btnEmptyPick'),
  selectionBar: document.getElementById('selectionBar'),
  selectionCount: document.getElementById('selectionCount'),
  btnCopySelected: document.getElementById('btnCopySelected'),
  btnDeleteSelected: document.getElementById('btnDeleteSelected'),
  btnSelectAll: document.getElementById('btnSelectAll'),
  btnClearSelection: document.getElementById('btnClearSelection'),
  toast: document.getElementById('toast'),
};

let selectionAnchor = null;
let toastTimer = null;
let renderedSections = null;
let renderedFilterSections = null;
let renderedFilterKey = null;
let renderedSelectionRevision = -1;
let nextScanRequestId = 0;

function wireEvents() {
  els.btnChangeFolder.addEventListener('click', pickFolder);
  els.btnEmptyPick.addEventListener('click', pickFolder);
  els.btnRefresh.addEventListener('click', refresh);

  els.filterList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-filter]');
    if (!button) return;
    const key = button.dataset.filter;
    setState({ activeFilter: key });
    scrollToSection(key);
  });

  els.btnCopySelected.addEventListener('click', copySelection);
  els.btnDeleteSelected.addEventListener('click', deleteSelection);
  els.btnSelectAll.addEventListener('click', () => {
    selectAll();
    selectionAnchor = null;
  });
  els.btnClearSelection.addEventListener('click', () => {
    clearSelection();
    selectionAnchor = null;
  });

  document.addEventListener('keydown', (event) => {
    const lightboxOpen = !document.getElementById('lightbox').hidden;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c' && !lightboxOpen) {
      const { selection } = getState();
      if (selection.size === 1) copyItem(selection.values().next().value);
      return;
    }
    if (event.key === 'Delete' && !lightboxOpen) {
      const { selection } = getState();
      if (selection.size > 0) deletePaths(selection);
      return;
    }
    if (event.key === 'Escape' && !lightboxOpen) {
      clearSelection();
      selectionAnchor = null;
    }
  });

  enableDragScroll(document.querySelector('.content'));
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.hidden = true;
  }, 2600);
}

async function copyItem(filePath) {
  try {
    const ok = await api.copyImage(filePath);
    showToast(ok ? '클립보드에 이미지를 복사했습니다' : '이미지를 복사하지 못했습니다');
  } catch (error) {
    showToast(`복사 실패: ${error.message}`);
  }
}

function copySelection() {
  const { selection } = getState();
  if (selection.size === 1) copyItem(selection.values().next().value);
  else if (selection.size > 1) showToast('복사는 한 번에 한 개씩 가능합니다');
}

async function deletePaths(paths) {
  const list = [...new Set(paths)].filter(Boolean);
  if (list.length === 0) return;
  const confirmed = await api.confirmDelete(list.length);
  if (!confirmed) return;

  const result = await api.deleteFiles(list);
  clearSelection();
  selectionAnchor = null;
  if (result.deleted.length > 0) {
    showToast(`${result.deleted.length}개를 휴지통으로 이동했습니다`);
    await refresh();
  }
  if (result.errors.length > 0) {
    showToast(`삭제 실패 ${result.errors.length}개: ${result.errors[0].message}`);
  }
}

function deleteSelection() {
  const { selection } = getState();
  if (selection.size > 0) deletePaths(selection);
}

// 왼쪽 버튼으로 본문을 끌어 세로 스크롤한다. 5px 미만 이동은 클릭으로 유지.
function enableDragScroll(scroller) {
  let dragging = false;
  let moved = false;
  let startY = 0;
  let startScroll = 0;
  let suppressClick = false;

  scroller.addEventListener('mousedown', (event) => {
    const rect = scroller.getBoundingClientRect();
    const scrollbarStart = rect.left + scroller.clientLeft + scroller.clientWidth;
    if (event.button !== 0 || event.target.closest('button') || event.clientX >= scrollbarStart) return;
    dragging = true;
    moved = false;
    startY = event.clientY;
    startScroll = scroller.scrollTop;
  });
  window.addEventListener('mousemove', (event) => {
    if (!dragging) return;
    const delta = event.clientY - startY;
    if (!moved && Math.abs(delta) > 5) {
      moved = true;
      scroller.classList.add('grabbing');
    }
    if (moved) {
      event.preventDefault();
      scroller.scrollTop = startScroll - delta;
    }
  });
  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    scroller.classList.remove('grabbing');
    if (moved) suppressClick = true;
    moved = false;
  });
  scroller.addEventListener('click', (event) => {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);
}

async function pickFolder() {
  const folder = await api.pickFolder();
  if (!folder) return;
  await loadFolder(folder);
}

async function refresh() {
  const { folder } = getState();
  if (folder) await loadFolder(folder);
  else await pickFolder();
}

async function loadFolder(folderPath) {
  const requestId = ++nextScanRequestId;
  setState({
    loading: true,
    error: null,
    folder: folderPath,
    selection: new Set(),
    scanRequestId: requestId,
    scanProgress: { phase: 'discover', completed: 0 },
  });
  selectionAnchor = null;
  const result = await api.scanFolder(folderPath, requestId);
  if (requestId !== getState().scanRequestId) return;
  if (!result.ok) {
    setState({ loading: false, error: result.error || '폴더를 읽을 수 없습니다.', sections: [], total: 0 });
    return;
  }
  api.setLastFolder(folderPath);
  setState({
    loading: false,
    error: null,
    folder: result.folder,
    sections: result.sections,
    total: result.total,
    errors: result.errors,
    scannedAt: result.scannedAt,
    ready: true,
    activeFilter: FILTER_ALL_KEY,
    selection: new Set(),
    scanProgress: null,
  });
}

function render(state) {
  els.folderPath.textContent = state.folder || '폴더가 선택되지 않았습니다';
  els.folderPath.title = state.folder || '';

  els.loadingState.hidden = !state.loading;
  const showEmpty = state.ready && !state.loading && state.total === 0;
  els.emptyState.hidden = !showEmpty;
  els.gallery.hidden = state.loading || showEmpty;

  const selectedCount = state.selection.size;
  els.selectionBar.hidden = selectedCount === 0;
  els.selectionCount.textContent = `${selectedCount}개 선택됨`;
  els.btnCopySelected.disabled = selectedCount !== 1;

  if (state.sections !== renderedFilterSections || state.activeFilter !== renderedFilterKey) {
    renderFilterList(els.filterList, state);
    renderedFilterSections = state.sections;
    renderedFilterKey = state.activeFilter;
  }

  if (state.sections !== renderedSections) {
    renderGallery(els.gallery, state, {
      onOpen: (item) => {
        const all = flatItems();
        openLightbox(all, all.findIndex((candidate) => candidate.id === item.id));
      },
      onToggleSelect: (item) => {
        selectionAnchor = item.path;
        toggleSelect(item.path);
      },
      onRangeSelect: (item) => {
        if (!selectionAnchor) {
          selectionAnchor = item.path;
          toggleSelect(item.path);
        } else {
          selectRange(selectionAnchor, item.path);
        }
      },
      onProgress: (rendered, total) => {
        if (rendered < total) {
          els.contentMeta.textContent = `${formatCount(total)}장 발견 · 썸네일 ${formatCount(rendered)}장 표시 중`;
          els.statusLine.textContent = `${formatCount(rendered)} / ${formatCount(total)}장 표시`;
        } else {
          els.contentMeta.textContent = `${formatCount(total)} · 최근 수정일 기준 정렬`;
          els.statusLine.textContent = `이미지 ${formatCount(total)} 불러옴`;
        }
      },
    });
    renderedSections = state.sections;
    renderedSelectionRevision = state.selectionRevision;
  } else if (state.selectionRevision !== renderedSelectionRevision) {
    applySelectionChanges(state.selectionChanges, state.selection);
    renderedSelectionRevision = state.selectionRevision;
  }


  if (state.error) {
    els.contentTitle.textContent = '불러오기 실패';
    els.contentMeta.textContent = state.error;
    els.statusLine.textContent = '오류 발생';
  } else if (state.loading) {
    const progress = state.scanProgress;
    els.contentTitle.textContent = '스크린샷';
    if (progress?.phase === 'metadata') {
      const total = progress.total || 0;
      els.contentMeta.textContent = `${formatCount(total)}장 발견 · 메타데이터 확인 중`;
      els.statusLine.textContent = `${formatCount(progress.completed)} / ${formatCount(total)} 확인`;
    } else {
      const found = progress?.completed || 0;
      els.contentMeta.textContent = '이미지 파일을 찾는 중…';
      els.statusLine.textContent = `${formatCount(found)}장 발견`;
    }
  } else if (showEmpty) {
    els.contentTitle.textContent = '스크린샷';
    els.contentMeta.textContent = state.folder ? `${state.folder} 에 이미지가 없습니다` : '';
    els.statusLine.textContent = '이미지 0장';
  } else {
    els.contentTitle.textContent = '스크린샷';
    els.contentMeta.textContent = `${formatCount(state.total)} · 최근 수정일 기준 정렬`;
    els.statusLine.textContent = `이미지 ${formatCount(state.total)} 불러옴`;
  }
}

async function bootstrap() {
  initLightbox({
    onReveal: (item) => api.revealFile(item.path),
    onCopy: (item) => copyItem(item.path),
    onDelete: async (item) => {
      closeLightbox();
      await deletePaths([item.path]);
    },
  });
  subscribe(render);
  api.onScanProgress((progress) => {
    const state = getState();
    if (progress.requestId !== state.scanRequestId || !state.loading) return;
    setState({ scanProgress: progress });
  });
  wireEvents();

  setState({ loading: true });
  let folder = await api.getLastFolder();
  if (!folder) folder = await api.detectFolder();

  if (!folder) {
    setState({ loading: false, ready: true, folder: null, sections: [], total: 0 });
    return;
  }
  await loadFolder(folder);
}

bootstrap();
