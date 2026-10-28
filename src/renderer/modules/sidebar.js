// 사이드바(날짜 필터) 렌더링

const FILTER_ALL_KEY = 'all';

export function renderFilterList(container, state) {
  const counts = new Map(state.sections.map((s) => [s.key, s.items.length]));

  const filters = [
    { key: FILTER_ALL_KEY, title: '전체', count: state.total },
    ...state.sections.map((s) => ({ key: s.key, title: s.title, count: counts.get(s.key) || 0 })),
  ];

  container.textContent = '';
  for (const filter of filters) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `filter-item${state.activeFilter === filter.key ? ' active' : ''}`;
    button.dataset.filter = filter.key;

    const label = document.createElement('span');
    label.textContent = filter.title;

    const count = document.createElement('span');
    count.className = 'filter-count';
    count.textContent = filter.count;

    button.append(label, count);
    container.append(button);
  }
}

export { FILTER_ALL_KEY };
