// 렌더러 전역 상태 — 나중에 검색/태그 필터를 추가할 때 여기에 필터 상태를 확장한다.

const state = {
  folder: null,
  sections: [], // [{ key, title, items }]
  total: 0,
  errors: [],
  loading: false,
  ready: false,
  error: null,
  scannedAt: null,
  activeFilter: 'all',
  selection: new Set(), // 선택 경로 집합 — membership 조회가 일정 시간에 가까움
  selectionRevision: 0,
  selectionChanges: [], // null이면 현재 렌더된 카드만 전체 선택 상태로 재동기화
};

const listeners = new Set();

export function getState() {
  return state;
}

export function setState(patch) {
  Object.assign(state, patch);
  for (const fn of listeners) fn(state);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// 섹션 순서를 유지한 채 평탄화한 전체 목록 (미리보기 이동용)
export function flatItems() {
  return state.sections.flatMap((s) => s.items);
}

export function sectionByKey(key) {
  return state.sections.find((s) => s.key === key) || null;
}

// ===== 선택 상태 (다중 선택 삭제/복사용) =====

export function isSelected(path) {
  return state.selection.has(path);
}

function publishSelectionChanges(changes) {
  if (Array.isArray(changes) && changes.length === 0) return;
  setState({
    selectionRevision: state.selectionRevision + 1,
    selectionChanges: changes,
  });
}

export function toggleSelect(path) {
  const selected = !state.selection.has(path);
  if (selected) state.selection.add(path);
  else state.selection.delete(path);
  publishSelectionChanges([{ path, selected }]);
}

export function selectRange(anchorPath, targetPath) {
  const order = flatItems().map((i) => i.path);
  const from = order.indexOf(anchorPath);
  const to = order.indexOf(targetPath);
  if (from < 0 || to < 0) {
    toggleSelect(targetPath);
    return;
  }
  const [start, end] = from <= to ? [from, to] : [to, from];
  const changes = [];
  for (const path of order.slice(start, end + 1)) {
    if (!state.selection.has(path)) {
      state.selection.add(path);
      changes.push({ path, selected: true });
    }
  }
  publishSelectionChanges(changes);
}

export function setSelection(paths) {
  const next = new Set(paths);
  const changes = [];
  for (const path of state.selection) {
    if (!next.has(path)) changes.push({ path, selected: false });
  }
  for (const path of next) {
    if (!state.selection.has(path)) changes.push({ path, selected: true });
  }
  state.selection = next;
  publishSelectionChanges(changes);
}

export function clearSelection() {
  if (state.selection.size === 0) return;
  state.selection.clear();
  publishSelectionChanges(null);
}

export function selectAll() {
  const next = new Set();
  for (const section of state.sections) {
    for (const item of section.items) next.add(item.path);
  }
  if (next.size === state.selection.size) {
    let unchanged = true;
    for (const path of next) {
      if (!state.selection.has(path)) {
        unchanged = false;
        break;
      }
    }
    if (unchanged) return;
  }
  state.selection = next;
  publishSelectionChanges(null);
}
