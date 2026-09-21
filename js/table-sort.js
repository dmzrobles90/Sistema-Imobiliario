(() => {
  const state = new WeakMap();

  function cleanText(cell) {
    return (cell?.dataset?.sortValue ?? cell?.innerText ?? cell?.textContent ?? '')
      .replace(/\s+/g, ' ').trim();
  }

  function parseDateBR(value) {
    const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (!m) return null;
    return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)).getTime();
  }

  function parseISODate(value) {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)).getTime();
  }

  function parseNumberBR(value) {
    const raw = value.replace(/R\$|%/g, '').replace(/\s/g, '');
    if (!/^-?[\d.]+(?:,\d+)?$/.test(raw) && !/^-?\d+(?:,\d+)?$/.test(raw)) return null;
    const n = Number(raw.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  function typedValue(text) {
    if (!text || text === '-') return { type: 'empty', value: '' };
    const dbr = parseDateBR(text);
    if (dbr !== null) return { type: 'number', value: dbr };
    const diso = parseISODate(text);
    if (diso !== null) return { type: 'number', value: diso };
    const num = parseNumberBR(text);
    if (num !== null) return { type: 'number', value: num };
    return { type: 'text', value: text.toLocaleLowerCase('pt-BR') };
  }

  function compareCells(aCell, bCell, direction) {
    const a = typedValue(cleanText(aCell));
    const b = typedValue(cleanText(bCell));
    if (a.type === 'empty' && b.type !== 'empty') return 1;
    if (b.type === 'empty' && a.type !== 'empty') return -1;
    let result = 0;
    if (a.type === 'number' && b.type === 'number') result = a.value - b.value;
    else result = String(a.value).localeCompare(String(b.value), 'pt-BR', { numeric: true, sensitivity: 'base' });
    return direction === 'desc' ? -result : result;
  }

  function sortTable(table, column, direction) {
    const tbody = table.tBodies?.[0];
    if (!tbody) return;
    const rows = Array.from(tbody.rows);
    if (rows.length < 2) return;
    const sorted = rows.map((row, index) => ({ row, index }))
      .sort((a, b) => compareCells(a.row.cells[column], b.row.cells[column], direction) || a.index - b.index)
      .map(x => x.row);
    const alreadySorted = sorted.every((row, i) => row === rows[i]);
    if (!alreadySorted) sorted.forEach(row => tbody.appendChild(row));
  }

  function refreshHeaders(table, activeColumn, direction) {
    const headers = Array.from(table.tHead?.rows?.[0]?.cells || []);
    headers.forEach((th, i) => {
      const sortable = !/^(ações?|ação)$/i.test(cleanText(th));
      th.classList.toggle('sortable-th', sortable);
      th.classList.toggle('sort-active', sortable && i === activeColumn);
      th.dataset.sortDirection = sortable && i === activeColumn ? direction : '';
      th.setAttribute('aria-sort', sortable && i === activeColumn ? (direction === 'asc' ? 'ascending' : 'descending') : 'none');
      if (sortable) th.title = 'Clique para ordenar';
    });
  }

  function enhance(table) {
    if (table.dataset.sortEnhanced === 'true' || !table.tHead) return;
    table.dataset.sortEnhanced = 'true';
    refreshHeaders(table, -1, 'asc');

    table.tHead.addEventListener('click', (event) => {
      const th = event.target.closest('th');
      if (!th || !th.classList.contains('sortable-th')) return;
      const column = th.cellIndex;
      const current = state.get(table);
      const direction = current?.column === column && current.direction === 'asc' ? 'desc' : 'asc';
      state.set(table, { column, direction });
      refreshHeaders(table, column, direction);
      sortTable(table, column, direction);
    });

    const tbody = table.tBodies?.[0];
    if (tbody) {
      const observer = new MutationObserver(() => {
        const current = state.get(table);
        if (current) queueMicrotask(() => sortTable(table, current.column, current.direction));
      });
      observer.observe(tbody, { childList: true });
    }
  }

  function enhanceAll(root = document) {
    root.querySelectorAll('table').forEach(enhance);
  }

  document.addEventListener('DOMContentLoaded', () => {
    enhanceAll();
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          if (node.matches?.('table')) enhance(node);
          enhanceAll(node);
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
})();
