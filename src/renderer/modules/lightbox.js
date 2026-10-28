// 큰 미리보기(라이트박스) — 키보드(←/→/Esc)와 버튼 모두 지원

import { formatDate, formatSize } from './format.js';

let items = [];
let index = -1;
let onReveal = null;
let onCopy = null;
let onDelete = null;

const els = {};

export function initLightbox({ onReveal: revealHandler, onCopy: copyHandler, onDelete: deleteHandler }) {
  onReveal = revealHandler;
  onCopy = copyHandler;
  onDelete = deleteHandler;
  els.root = document.getElementById('lightbox');
  els.image = document.getElementById('lightboxImage');
  els.name = document.getElementById('lightboxName');
  els.meta = document.getElementById('lightboxMeta');
  els.counter = document.getElementById('lightboxCounter');

  els.root.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'close') closeLightbox();
    else if (action === 'prev') showPrev();
    else if (action === 'next') showNext();
    else if (action === 'copy') {
      const item = items[index];
      if (item && onCopy) onCopy(item);
    } else if (action === 'delete') {
      const item = items[index];
      if (item && onDelete) onDelete(item);
    }
  });

  document.getElementById('btnReveal').addEventListener('click', () => {
    const item = items[index];
    if (item && onReveal) onReveal(item);
  });

  document.addEventListener('keydown', (event) => {
    if (els.root.hidden) return;
    if (event.key === 'Escape') closeLightbox();
    else if (event.key === 'ArrowLeft') showPrev();
    else if (event.key === 'ArrowRight') showNext();
  });
}

export function openLightbox(allItems, startIndex) {
  items = allItems;
  index = startIndex;
  els.root.hidden = false;
  render();
}

export function closeLightbox() {
  els.root.hidden = true;
  els.image.removeAttribute('src');
  items = [];
  index = -1;
}

function showPrev() {
  if (items.length === 0) return;
  index = (index - 1 + items.length) % items.length;
  render();
}

function showNext() {
  if (items.length === 0) return;
  index = (index + 1) % items.length;
  render();
}

function render() {
  const item = items[index];
  if (!item) return;
  els.image.src = item.url;
  els.image.alt = item.name;
  els.name.textContent = item.name;
  els.name.title = item.name;
  els.meta.textContent = `${formatDate(item.date)} · ${formatSize(item.size)} · ${item.ext.toUpperCase()}`;
  els.counter.textContent = `${index + 1} / ${items.length}`;
}
