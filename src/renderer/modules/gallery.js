// 썸네일 그리드 렌더링 — 선택(체크박스/컨트롤·쉬프트 클릭) 지원

import { formatShortDate } from './format.js';
import { isSelected } from './state.js';

const cardsByPath = new Map();
const OVERSCAN_ROWS = 2;
let renderGeneration = 0;
let activeCleanup = null;

export function setThumbSelected(path, selected) {
  const entry = cardsByPath.get(path);
  if (!entry) return;
  entry.card.classList.toggle('selected', selected);
  entry.check.classList.toggle('checked', selected);
}

export function applySelectionChanges(changes, selection) {
  if (changes === null) {
    for (const path of cardsByPath.keys()) setThumbSelected(path, selection.has(path));
    return;
  }
  for (const change of changes) setThumbSelected(change.path, change.selected);
}

export function renderGallery(container, state, { onOpen, onToggleSelect, onRangeSelect, onProgress = () => {} }) {
  activeCleanup?.();
  activeCleanup = null;
  const generation = ++renderGeneration;
  cardsByPath.clear();
  container.textContent = '';
  const scroller = container.closest('.content') || container.parentElement;

  const groups = [];
  for (const section of state.sections) {
    if (section.items.length === 0) continue;

    const group = document.createElement('section');
    group.className = 'group';
    group.id = `group-${section.key}`;

    const title = document.createElement('h3');
    title.className = 'group-title';
    title.append(document.createTextNode(section.title));

    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = `${section.items.length}장`;
    title.append(count);

    const grid = document.createElement('div');
    grid.className = 'grid';
    group.append(title, grid);
    container.append(group);
    groups.push({
      items: section.items,
      grid,
      mounted: new Map(),
      startIndex: -1,
      endIndex: -1,
      columns: 1,
      rows: 0,
      rowStep: 0,
      cardWidth: 0,
      trackWidth: 0,
      columnGap: 0,
      marginLeft: 0,
      marginTop: 0,
      rowHeight: 0,
      rowGap: 0,
    });
  }

  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  if (total === 0) {
    onProgress(0, 0);
    return;
  }

  let layoutWidth = 0;
  let updateTimer = null;

  function unmountGroup(group) {
    for (const [index, entry] of group.mounted) {
      entry.card.remove();
      cardsByPath.delete(group.items[index].path);
    }
    group.mounted.clear();
    group.startIndex = -1;
    group.endIndex = -1;
  }

  function updateWindow() {
    if (generation !== renderGeneration) return;
    const viewportTop = scroller.scrollTop;
    const viewportBottom = viewportTop + scroller.clientHeight;
    const scrollerTop = scroller.getBoundingClientRect().top;

    for (const group of groups) {
      if (group.rows === 0) continue;
      const gridTop = group.grid.getBoundingClientRect().top - scrollerTop + viewportTop;
      const firstRow = Math.floor((viewportTop - gridTop) / group.rowStep);
      const lastRow = Math.ceil((viewportBottom - gridTop) / group.rowStep);
      const startRow = Math.max(0, Math.min(group.rows, firstRow - OVERSCAN_ROWS));
      const endRow = Math.max(startRow, Math.min(group.rows, lastRow + OVERSCAN_ROWS));
      const startIndex = Math.min(group.items.length, startRow * group.columns);
      const endIndex = Math.min(group.items.length, endRow * group.columns);
      if (group.startIndex === startIndex && group.endIndex === endIndex) continue;

      for (const [index, entry] of group.mounted) {
        if (index < startIndex || index >= endIndex) {
          entry.card.remove();
          cardsByPath.delete(group.items[index].path);
          group.mounted.delete(index);
        }
      }

      for (let index = startIndex; index < endIndex; index += 1) {
        if (group.mounted.has(index)) continue;
        const entry = buildThumb(group.items[index], { onOpen, onToggleSelect, onRangeSelect });
        const row = Math.floor(index / group.columns);
        const column = index % group.columns;
        Object.assign(entry.card.style, {
          position: 'absolute',
          width: `${group.cardWidth}px`,
          margin: '0',
          left: `${column * (group.trackWidth + group.columnGap) + group.marginLeft}px`,
          top: `${row * group.rowStep + group.marginTop}px`,
        });
        group.grid.append(entry.card);
        group.mounted.set(index, entry);
        cardsByPath.set(group.items[index].path, entry);
      }
      group.startIndex = startIndex;
      group.endIndex = endIndex;
    }
  }

  function measureAndLayout() {
    if (generation !== renderGeneration) return;
    const measureTarget = groups.find((group) => group.items.length > 0);
    const gridWidth = measureTarget.grid.clientWidth;
    if (gridWidth === 0) {
      updateTimer = setTimeout(() => {
        updateTimer = null;
        measureAndLayout();
      }, 16);
      return;
    }

    for (const group of groups) unmountGroup(group);
    const measureGrid = document.createElement('div');
    measureGrid.className = 'grid';
    Object.assign(measureGrid.style, {
      position: 'fixed',
      left: '-10000px',
      top: '0',
      width: `${gridWidth}px`,
      visibility: 'hidden',
      pointerEvents: 'none',
    });
    const sample = buildThumb(measureTarget.items[0], { onOpen, onToggleSelect, onRangeSelect });
    measureGrid.append(sample.card);
    document.body.append(measureGrid);

    const gridStyle = getComputedStyle(measureGrid);
    const columns = gridStyle.gridTemplateColumns.match(/[\d.]+px/g) || [];
    const cardStyle = getComputedStyle(sample.card);
    const cardRect = sample.card.getBoundingClientRect();
    const trackWidth = Number.parseFloat(columns[0]) || gridWidth;
    const columnGap = Number.parseFloat(gridStyle.columnGap) || 0;
    const rowGap = Number.parseFloat(gridStyle.rowGap) || 0;
    const marginLeft = Number.parseFloat(cardStyle.marginLeft) || 0;
    const marginTop = Number.parseFloat(cardStyle.marginTop) || 0;
    const marginBottom = Number.parseFloat(cardStyle.marginBottom) || 0;
    const rowHeight = cardRect.height + marginTop + marginBottom;
    measureGrid.remove();

    layoutWidth = gridWidth;
    for (const group of groups) {
      group.columns = Math.max(1, columns.length);
      group.rows = Math.ceil(group.items.length / group.columns);
      group.trackWidth = trackWidth;
      group.columnGap = columnGap;
      group.marginLeft = marginLeft;
      group.marginTop = marginTop;
      group.cardWidth = cardRect.width;
      group.rowHeight = rowHeight;
      group.rowGap = rowGap;
      group.rowStep = rowHeight + rowGap;
      group.grid.style.display = 'block';
      group.grid.style.position = 'relative';
      group.grid.style.height = `${group.rows * rowHeight + Math.max(0, group.rows - 1) * rowGap}px`;
    }
    updateWindow();
    onProgress(total, total);
  }

  function scheduleUpdate() {
    if (updateTimer !== null) return;
    updateTimer = setTimeout(() => {
      updateTimer = null;
      if (generation !== renderGeneration) return;
      if (groups[0].grid.clientWidth !== layoutWidth) measureAndLayout();
      else updateWindow();
    }, 0);
  }

  scroller.addEventListener('scroll', scheduleUpdate, { passive: true });
  const resizeObserver = new ResizeObserver(scheduleUpdate);
  resizeObserver.observe(scroller);
  activeCleanup = () => {
    scroller.removeEventListener('scroll', scheduleUpdate);
    resizeObserver.disconnect();
    if (updateTimer !== null) clearTimeout(updateTimer);
  };
  measureAndLayout();
}

function buildThumb(item, { onOpen, onToggleSelect, onRangeSelect }) {
  const card = document.createElement('figure');
  card.className = `thumb${isSelected(item.path) ? ' selected' : ''}`;
  card.dataset.path = item.path;

  const img = document.createElement('img');
  img.src = item.url;
  img.alt = item.name;
  img.loading = 'lazy';
  img.draggable = false;

  // 선택 체크박스 (호버/선택 시 표시)
  const check = document.createElement('button');
  check.type = 'button';
  check.className = `thumb-check${isSelected(item.path) ? ' checked' : ''}`;
  check.textContent = '✓';
  check.title = '선택/해제';
  check.setAttribute('aria-label', `${item.name} 선택`);
  check.addEventListener('click', (event) => {
    event.stopPropagation();
    onToggleSelect(item);
  });

  const name = document.createElement('span');
  name.className = 'thumb-name';
  name.textContent = item.name;
  name.title = item.name;

  const date = document.createElement('span');
  date.className = 'thumb-date';
  date.textContent = formatShortDate(item.date);

  card.append(img, check, name, date);
  card.addEventListener('click', (event) => {
    if (event.ctrlKey || event.metaKey) onToggleSelect(item);
    else if (event.shiftKey) onRangeSelect(item);
    else onOpen(item);
  });
  return { card, check };
}

export function scrollToSection(key) {
  const target = key === 'all' ? null : document.getElementById(`group-${key}`);
  const scroller = document.querySelector('.content');
  if (!scroller) return;
  if (!target) {
    scroller.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
