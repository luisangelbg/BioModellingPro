/* BioModelling Pro — global state and shared utilities.
   No ES modules: everything hangs from window so the app also works when
   index.html is opened with a double click (file://). */

const state = {
  // Step 1 — GBIF
  query: '',
  match: null,              // species/match response
  raw: [],                  // downloaded records
  fetchMeta: { count: 0, fetched: 0, truncated: false },
  // Step 2 — filters
  filters: { rank: new Set(), country: new Set(), basisOfRecord: new Set(), yearMin: null, yearMax: null, bbox: null },
  filtered: [],
  // Step 3 — cleaning
  cleanRules: {},
  cleanParams: { dupDecimals: 4, uncThreshold: 10000, outlierK: 3 },
  cleanReport: null,
  clean: [],
  // Step 4 — map
  mapColorBy: 'taxon',
};
window.state = state;

/* ---------- DOM helpers ---------- */
function el(id) { return document.getElementById(id); }
function els(sel, root) { return [...(root || document).querySelectorAll(sel)]; }
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
/* bilingual inline HTML: both spans are written, CSS shows the active one */
function L2(es, en) { return `<span data-l="es">${es}</span><span data-l="en">${en}</span>`; }
/* a label may be a plain string, an {es, en} object or a function returning either */
function lab(x) {
  if (typeof x === 'function') x = x();
  if (x && typeof x === 'object') return T(x.es, x.en);
  return x;
}
function labHTML(x) {
  if (typeof x === 'function') x = x();
  if (x && typeof x === 'object') return L2(x.es, x.en);
  return esc(x);
}

function showMessage(container, type, html) {
  if (typeof container === 'string') container = el(container);
  if (!container) return null;
  const div = document.createElement('div');
  div.className = 'msg msg-' + type;
  div.innerHTML = html;
  container.appendChild(div);
  return div;
}
function clearMessages(container) {
  if (typeof container === 'string') container = el(container);
  if (container) container.innerHTML = '';
}

/* number formatting: decimal point in both languages, true minus sign */
function fmt(v, d = 3) {
  if (v == null || (typeof v === 'number' && !isFinite(v))) return '—';
  const n = Number(v); if (!isFinite(n)) return String(v);
  const s = n.toFixed(d);
  if (/^-0(\.0*)?$/.test(s)) return s.slice(1);
  return s.startsWith('-') ? '−' + s.slice(1) : s;
}
const fmtInt = v => (v == null || !isFinite(v)) ? '—' : Math.round(v).toLocaleString('en-US');

/* stat tiles: pairs of [label, value]; label may be {es,en} */
function statTiles(container, pairs) {
  if (typeof container === 'string') container = el(container);
  container.innerHTML = '';
  pairs.forEach(([label, value]) => {
    const d = document.createElement('div');
    d.className = 'stat-tile';
    d.innerHTML = `<div class="stat-label">${labHTML(label)}</div><div class="stat-value">${value && typeof value === 'object' && value.es ? L2(value.es, value.en) : esc(value)}</div>`;
    container.appendChild(d);
  });
}

/* Builds a <table>. columns: {key, label, get}; label and cell values may be {es, en}
   objects, so the table follows the language without being rebuilt. */
function buildTable(container, columns, rows, limit) {
  if (typeof container === 'string') container = el(container);
  container.innerHTML = '';
  const table = document.createElement('table');
  const thead = document.createElement('thead'), trh = document.createElement('tr');
  columns.forEach(c => { const th = document.createElement('th'); th.innerHTML = labHTML(c.label != null ? c.label : c.key); trh.appendChild(th); });
  thead.appendChild(trh); table.appendChild(thead);
  const tbody = document.createElement('tbody');
  (limit ? rows.slice(0, limit) : rows).forEach(r => {
    const tr = document.createElement('tr');
    columns.forEach(c => {
      const td = document.createElement('td');
      const v = c.get ? c.get(r) : r[c.key];
      if (v && typeof v === 'object' && v.es != null) td.innerHTML = L2(v.es, v.en);
      else td.textContent = (v === null || v === undefined || v === '') ? '—' : v;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody); container.appendChild(table);
  if (limit && rows.length > limit) {
    const p = document.createElement('p'); p.className = 'hint'; p.style.padding = '6px 12px';
    p.innerHTML = L2(`Mostrando ${limit} de ${rows.length} filas. Descarga el CSV para verlas todas.`,
      `Showing ${limit} of ${rows.length} rows. Download the CSV to see them all.`);
    container.appendChild(p);
  }
}

/* ---------- misc ---------- */
function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCSV(columns, rows) {
  const head = columns.map(c => csvEscape(lab(c.label || c.key))).join(',');
  const body = rows.map(r => columns.map(c => {
    const v = c.get ? c.get(r) : r[c.key];
    return csvEscape(v && typeof v === 'object' && v.es != null ? T(v.es, v.en) : v);
  }).join(','));
  return '﻿' + [head, ...body].join('\n');
}
function downloadBlob(content, filename, mime) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function decimalPlaces(n) {
  if (!isFinite(n)) return 0;
  const s = String(n), i = s.indexOf('.');
  return i === -1 ? 0 : s.length - i - 1;
}
function quantile(sortedAsc, q) {
  if (!sortedAsc.length) return NaN;
  const pos = (sortedAsc.length - 1) * q, base = Math.floor(pos), rest = pos - base;
  return sortedAsc[base + 1] !== undefined ? sortedAsc[base] + rest * (sortedAsc[base + 1] - sortedAsc[base]) : sortedAsc[base];
}
const slugName = s => String(s || 'species').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'species';
function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback || '#1f7a4d';
}
const sleep = ms => new Promise(res => setTimeout(res, ms));

/* ---------- Views: figures drawn by Python are redrawn when language or theme change ---------- */
const Views = {
  map: new Map(),
  /* register a container and the async function that draws it; run it now */
  async reg(id, fn) { Views.map.set(id, fn); return fn(); },
  drop(id) { Views.map.delete(id); },
  async refresh() {
    for (const [id, fn] of Views.map) {
      const box = document.getElementById(id);
      if (!box || !box.isConnected || !box.innerHTML.trim()) continue;
      try { await fn(); } catch (e) { console.warn('redraw failed', id, e); }
    }
  },
};
let _refreshTimer = null;
const scheduleRefresh = () => { clearTimeout(_refreshTimer); _refreshTimer = setTimeout(() => Views.refresh(), 250); };
document.addEventListener('langchange', scheduleRefresh);
document.addEventListener('themechange', scheduleRefresh);

Object.assign(window, { el, els, esc, L2, lab, labHTML, showMessage, clearMessages, fmt, fmtInt, statTiles, buildTable, csvEscape, toCSV,
  downloadBlob, haversineKm, decimalPlaces, quantile, slugName, cssVar, sleep, Views });
