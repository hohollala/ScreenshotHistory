'use strict';

// grouping.js 단위 테스트 — node tests/grouping.test.js

const assert = require('assert');
const { sectionKeyFor, groupItemsBySection, startOfWeek, startOfMonth } = require('../src/main/services/grouping');

// 기준 시각: 2026-10-09 (금) 15:00
const now = new Date(2026, 9, 9, 15, 0, 0);

// 주/월 경계 확인
assert.strictEqual(startOfWeek(now).getDate(), 5, '이번 주는 월요일(10/5) 시작이어야 함');
assert.strictEqual(startOfMonth(now).getDate(), 1, '이번 달은 1일 시작이어야 함');

// 섹션 분류
assert.strictEqual(sectionKeyFor(new Date(2026, 9, 9, 0, 0), now), 'today');
assert.strictEqual(sectionKeyFor(new Date(2026, 9, 9, 23, 59), now), 'today');
assert.strictEqual(sectionKeyFor(new Date(2026, 9, 8, 10, 0), now), 'yesterday');
assert.strictEqual(sectionKeyFor(new Date(2026, 9, 8, 0, 1), now), 'yesterday');
assert.strictEqual(sectionKeyFor(new Date(2026, 9, 7, 12, 0), now), 'week'); // 수요일
assert.strictEqual(sectionKeyFor(new Date(2026, 9, 5, 2, 0), now), 'week'); // 월요일
assert.strictEqual(sectionKeyFor(new Date(2026, 9, 4, 12, 0), now), 'month'); // 지난주 일요일, 같은 달
assert.strictEqual(sectionKeyFor(new Date(2026, 9, 1, 0, 0), now), 'month');
assert.strictEqual(sectionKeyFor(new Date(2026, 8, 30, 12, 0), now), 'older'); // 9월
assert.strictEqual(sectionKeyFor(new Date(2026, 0, 15, 12, 0), now), 'older');

// 그룹핑 + 정렬(최신 우선)
const mk = (y, m, d, h = 12) => ({ id: `${y}-${m}-${d}-${h}`, date: new Date(y, m - 1, d, h).toISOString() });
const items = [
  mk(2026, 10, 9, 9),
  mk(2026, 10, 9, 18), // 미래 시간도 오늘
  mk(2026, 10, 8, 7),
  mk(2026, 10, 6, 12),
  mk(2026, 10, 2, 12),
  mk(2026, 7, 1, 12),
];

const groups = groupItemsBySection(items, now);
const byKey = Object.fromEntries(groups.map((g) => [g.key, g]));

assert.strictEqual(byKey.today.items.length, 2);
assert.strictEqual(byKey.yesterday.items.length, 1);
assert.strictEqual(byKey.week.items.length, 1);
assert.strictEqual(byKey.month.items.length, 1);
assert.strictEqual(byKey.older.items.length, 1);
assert.strictEqual(groups.length, 5, '빈 섹션도 5개 키 전체를 반환해야 함');

// 정렬 검증: today 섹션 안에서 18시 > 9시
assert.ok(new Date(byKey.today.items[0].date) > new Date(byKey.today.items[1].date), '섹션 내부는 최신순');

console.log('grouping tests passed ✓');
