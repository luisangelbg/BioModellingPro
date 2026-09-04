/* Estado global compartido entre módulos + utilidades comunes.
   Sin módulos ES: todo cuelga de window para que funcione desde file://. */

const state = {
  // Paso 1 — GBIF
  query: '',
  match: null,              // respuesta de species/match
  raw: [],                  // registros crudos descargados (array de objetos normalizados)
  fetchMeta: { count: 0, fetched: 0, truncated: false },

  // Paso 2 — filtros
  filters: {
    rank: new Set(),          // rangos taxonómicos incluidos (vacío = todos)
    country: new Set(),
    basisOfRecord: new Set(),
    yearMin: null, yearMax: null,
    bbox: null,               // [S, W, N, E] o null
  },
  filtered: [],

  // Paso 3 — depuración
  cleanRules: {},             // id -> bool (activa)
  cleanParams: { dupDecimals: 4, uncThreshold: 10000, outlierK: 3 },
  cleanReport: null,          // { rules: [...], kept: n, removed: n }
  clean: [],                  // registros finales depurados

  // Paso 4 — mapa
  mapColorBy: 'taxon',
};

window.state = state;

/* ---------- utilidades DOM ---------- */
function el(id) { return document.getElementById(id); }

function showMessage(container, type, text) {
  if (typeof container === 'string') container = el(container);
  const div = document.createElement('div');
  div.className = 'msg msg-' + type;
  div.innerHTML = text;
  container.appendChild(div);
  return div;
}
function clearMessages(container) {
  if (typeof container === 'string') container = el(container);
  container.innerHTML = '';
}

function statTiles(container, pairs) {
  if (typeof container === 'string') container = el(container);
  container.innerHTML = '';
  pairs.forEach(([label, value]) => {
    const d = document.createElement('div');
    d.className = 'stat-tile';
    d.innerHTML = `<div class="stat-label">${label}</div><div class="stat-value">${value}</div>`;
    container.appendChild(d);
  });
}

/* Construye una <table> a partir de columnas y filas (array de objetos). */
function buildTable(container, columns, rows, limit) {
  if (typeof container === 'string') container = el(container);
  container.innerHTML = '';
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  columns.forEach(c => {
    const th = document.createElement('th');
    th.textContent = c.label || c.key;
    trh.appendChild(th);
  });
  thead.appendChild(trh);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  const shown = limit ? rows.slice(0, limit) : rows;
  shown.forEach(r => {
    const tr = document.createElement('tr');
    columns.forEach(c => {
      const td = document.createElement('td');
      const v = c.get ? c.get(r) : r[c.key];
      td.textContent = (v === null || v === undefined || v === '') ? '—' : v;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  container.appendChild(table);
  if (limit && rows.length > limit) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.style.padding = '6px 12px';
    p.textContent = `Mostrando ${limit} de ${rows.length} filas. Descarga el CSV para verlas todas.`;
    container.appendChild(p);
  }
}

/* ---------- utilidades varias ---------- */
function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCSV(columns, rows) {
  const head = columns.map(c => csvEscape(c.label || c.key)).join(',');
  const body = rows.map(r =>
    columns.map(c => csvEscape(c.get ? c.get(r) : r[c.key])).join(',')
  );
  return '﻿' + [head, ...body].join('\n');
}

function downloadBlob(content, filename, mime) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* distancia Haversine en km */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/* nº de decimales de un número (para detectar baja precisión) */
function decimalPlaces(n) {
  if (!isFinite(n)) return 0;
  const s = String(n);
  const i = s.indexOf('.');
  return i === -1 ? 0 : s.length - i - 1;
}

function quantile(sortedAsc, q) {
  if (!sortedAsc.length) return NaN;
  const pos = (sortedAsc.length - 1) * q;
  const base = Math.floor(pos), rest = pos - base;
  return sortedAsc[base + 1] !== undefined
    ? sortedAsc[base] + rest * (sortedAsc[base + 1] - sortedAsc[base])
    : sortedAsc[base];
}

window.el = el;
window.showMessage = showMessage;
window.clearMessages = clearMessages;
window.statTiles = statTiles;
window.buildTable = buildTable;
window.csvEscape = csvEscape;
window.toCSV = toCSV;
window.downloadBlob = downloadBlob;
window.haversineKm = haversineKm;
window.decimalPlaces = decimalPlaces;
window.quantile = quantile;
