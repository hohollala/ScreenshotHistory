'use strict';

// 날짜 섹션 그룹화 — 순수 함수만 두어 테스트/확장(검색·태그)이 쉽도록 분리.
// 섹션 기준: 오늘 → 어제 → 이번 주(월요일 시작) → 이번 달 → 이전 항목

const DAY_MS = 24 * 60 * 60 * 1000;

const SECTIONS = [
  { key: 'today', title: '오늘' },
  { key: 'yesterday', title: '어제' },
  { key: 'week', title: '이번 주' },
  { key: 'month', title: '이번 달' },
  { key: 'older', title: '이전 항목' },
];

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(date) {
  const d = startOfDay(date);
  const day = d.getDay(); // 0=일요일
  const offsetFromMonday = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - offsetFromMonday);
  return d;
}

function startOfMonth(date) {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
}

function sectionKeyFor(date, now = new Date()) {
  const target = startOfDay(date);
  const today = startOfDay(now);
  if (target >= today) return 'today'; // 미래 타임스탬프도 오늘 취급
  const diffDays = Math.round((today - target) / DAY_MS);
  if (diffDays === 1) return 'yesterday';
  if (target >= startOfWeek(now)) return 'week';
  if (target >= startOfMonth(now)) return 'month';
  return 'older';
}

function groupItemsBySection(items, now = new Date()) {
  const buckets = new Map(SECTIONS.map((s) => [s.key, []]));
  for (const item of items) {
    buckets.get(sectionKeyFor(item.date, now)).push(item);
  }
  const sortDesc = (a, b) => new Date(b.date) - new Date(a.date);
  return SECTIONS.map((s) => ({ ...s, items: buckets.get(s.key).sort(sortDesc) }));
}

module.exports = {
  SECTIONS,
  startOfDay,
  startOfWeek,
  startOfMonth,
  sectionKeyFor,
  groupItemsBySection,
};
