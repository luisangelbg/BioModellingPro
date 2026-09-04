/* Paso 2: facetas y filtrado de los registros crudos. */

let miniMap = null, bboxLayer = null, drawMode = false, drawCorner = null;

function facetCounts(records, keyFn) {
  const m = new Map();
  for (const r of records) {
    const k = keyFn(r);
    if (k === '' || k === null || k === undefined) continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

/* `selectedSet` contiene SIEMPRE los valores marcados (se inicializa con todos).
   Un valor pasa el filtro si está en el set; si el set queda vacío no pasa nada. */
function renderFacet(boxTitle, entries, selectedSet, labelFn) {
  entries.forEach(([val]) => selectedSet.add(val));

  const box = document.createElement('div');
  box.className = 'filter-box';
  box.innerHTML = `<h3>${boxTitle} <a href="#" class="facet-all" style="font-weight:400;font-size:.8rem">todos</a> /
    <a href="#" class="facet-none" style="font-weight:400;font-size:.8rem">ninguno</a></h3>`;
  const list = document.createElement('div');
  list.className = 'facet-list';
  const inputs = [];
  entries.forEach(([val, count]) => {
    const row = document.createElement('label');
    row.className = 'facet-item';
    row.innerHTML = `<input type="checkbox" checked>
      <span>${labelFn ? labelFn(val) : val}</span><span class="facet-count">${count.toLocaleString()}</span>`;
    const input = row.querySelector('input');
    inputs.push(input);
    input.addEventListener('change', () => {
      if (input.checked) selectedSet.add(val); else selectedSet.delete(val);
      applyFilters();
    });
    list.appendChild(row);
  });
  box.appendChild(list);
  box.querySelector('.facet-all').onclick = e => {
    e.preventDefault(); entries.forEach(([v]) => selectedSet.add(v));
    inputs.forEach(i => i.checked = true); applyFilters();
  };
  box.querySelector('.facet-none').onclick = e => {
    e.preventDefault(); selectedSet.clear();
    inputs.forEach(i => i.checked = false); applyFilters();
  };
  return box;
}

function buildFilters() {
  const grid = el('filterGrid');
  grid.innerHTML = '';
  const R = state.raw;
  state.filters = { rank: new Set(), country: new Set(), basisOfRecord: new Set(), yearMin: null, yearMax: null, bbox: null };

  grid.appendChild(renderFacet('Rango taxonómico',
    facetCounts(R, r => r.taxonRank || 'SPECIES'), state.filters.rank));
  grid.appendChild(renderFacet('País',
    facetCounts(R, r => r.country), state.filters.country));
  grid.appendChild(renderFacet('Tipo de registro',
    facetCounts(R, r => r.basisOfRecord), state.filters.basisOfRecord));

  // año
  const years = R.map(r => r.year).filter(Boolean);
  const yBox = document.createElement('div');
  yBox.className = 'filter-box';
  if (years.length) {
    const ymin = Math.min(...years), ymax = Math.max(...years);
    yBox.innerHTML = `<h3>Año de registro</h3>
      <div class="year-range">
        <input type="number" id="fYearMin" value="${ymin}" min="${ymin}" max="${ymax}">
        <span>a</span>
        <input type="number" id="fYearMax" value="${ymax}" min="${ymin}" max="${ymax}">
      </div>
      <p class="hint">${years.length.toLocaleString()} registros con año.</p>`;
    grid.appendChild(yBox);
    yBox.querySelector('#fYearMin').addEventListener('change', readYear);
    yBox.querySelector('#fYearMax').addEventListener('change', readYear);
  }

  el('bboxApplyBtn').onclick = applyBboxFromInputs;
  el('bboxClearBtn').onclick = () => { setBbox(null); ['bboxS','bboxN','bboxW','bboxE'].forEach(i => el(i).value = ''); };

  applyFilters();
  setupMiniMap();
}

function readYear() {
  const a = parseInt(el('fYearMin').value, 10), b = parseInt(el('fYearMax').value, 10);
  state.filters.yearMin = isNaN(a) ? null : a;
  state.filters.yearMax = isNaN(b) ? null : b;
  applyFilters();
}

function applyBboxFromInputs() {
  const s = parseFloat(el('bboxS').value), n = parseFloat(el('bboxN').value);
  const w = parseFloat(el('bboxW').value), e = parseFloat(el('bboxE').value);
  if ([s, n, w, e].some(isNaN)) { showMessage('matchMessages', 'warning', 'Completa las 4 casillas del recuadro.'); return; }
  setBbox([Math.min(s, n), Math.min(w, e), Math.max(s, n), Math.max(w, e)]);
}

function setBbox(bbox) {
  state.filters.bbox = bbox;
  drawBboxLayer();
  applyFilters();
}

function passesFilters(r) {
  const f = state.filters;
  if (!f.rank.has(r.taxonRank || 'SPECIES')) return false;
  if (r.country !== '' && !f.country.has(r.country)) return false;
  if (r.basisOfRecord !== '' && !f.basisOfRecord.has(r.basisOfRecord)) return false;
  if (f.yearMin != null && (r.year == null || r.year < f.yearMin)) return false;
  if (f.yearMax != null && (r.year == null || r.year > f.yearMax)) return false;
  if (f.bbox) {
    const [S, W, N, E] = f.bbox;
    if (r.decimalLatitude == null || r.decimalLongitude == null) return false;
    if (r.decimalLatitude < S || r.decimalLatitude > N || r.decimalLongitude < W || r.decimalLongitude > E) return false;
  }
  return true;
}

function applyFilters() {
  state.filtered = state.raw.filter(passesFilters);
  el('filterCount').textContent = `${state.filtered.length.toLocaleString()} registros`;
  buildTable('filteredTable', window.RAW_COLUMNS, state.filtered, 200);
  enableStep(3);
  if (miniMap) drawMiniPoints();
}

/* ---------- mini-mapa con recuadro ---------- */

function setupMiniMap() {
  if (miniMap) { miniMap.remove(); miniMap = null; }
  miniMap = L.map('bboxMiniMap', { worldCopyJump: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap', maxZoom: 12,
  }).addTo(miniMap);

  const pts = state.raw.filter(r => r.decimalLatitude != null);
  if (pts.length) {
    const b = L.latLngBounds(pts.map(r => [r.decimalLatitude, r.decimalLongitude]));
    miniMap.fitBounds(b.pad(0.15));
  } else {
    miniMap.setView([20, 0], 2);
  }
  drawMiniPoints();
  drawBboxLayer();

  const btn = L.control({ position: 'topright' });
  btn.onAdd = () => {
    const d = L.DomUtil.create('button', 'btn btn-secondary');
    d.textContent = 'Dibujar recuadro';
    d.style.fontSize = '12px'; d.style.padding = '4px 8px';
    L.DomEvent.disableClickPropagation(d);
    d.onclick = () => {
      drawMode = !drawMode; drawCorner = null;
      d.textContent = drawMode ? 'Clic 2 esquinas…' : 'Dibujar recuadro';
      miniMap.getContainer().style.cursor = drawMode ? 'crosshair' : '';
    };
    return d;
  };
  btn.addTo(miniMap);

  miniMap.on('click', e => {
    if (!drawMode) return;
    if (!drawCorner) { drawCorner = e.latlng; return; }
    const a = drawCorner, b = e.latlng;
    setBbox([Math.min(a.lat, b.lat), Math.min(a.lng, b.lng), Math.max(a.lat, b.lat), Math.max(a.lng, b.lng)]);
    el('bboxS').value = Math.min(a.lat, b.lat).toFixed(3);
    el('bboxN').value = Math.max(a.lat, b.lat).toFixed(3);
    el('bboxW').value = Math.min(a.lng, b.lng).toFixed(3);
    el('bboxE').value = Math.max(a.lng, b.lng).toFixed(3);
    drawMode = false; drawCorner = null;
    miniMap.getContainer().style.cursor = '';
    document.querySelectorAll('#bboxMiniMap .btn').forEach(x => x.textContent = 'Dibujar recuadro');
  });
}

let miniPointLayer = null;
function drawMiniPoints() {
  if (miniPointLayer) miniMap.removeLayer(miniPointLayer);
  miniPointLayer = L.layerGroup();
  const inSet = new Set(state.filtered.map(r => r.key));
  for (const r of state.raw) {
    if (r.decimalLatitude == null) continue;
    L.circleMarker([r.decimalLatitude, r.decimalLongitude], {
      radius: 3, weight: 0,
      fillColor: inSet.has(r.key) ? '#2f7d4f' : '#bbbbbb',
      fillOpacity: inSet.has(r.key) ? 0.75 : 0.35,
    }).addTo(miniPointLayer);
  }
  miniPointLayer.addTo(miniMap);
}

function drawBboxLayer() {
  if (!miniMap) return;
  if (bboxLayer) { miniMap.removeLayer(bboxLayer); bboxLayer = null; }
  if (state.filters.bbox) {
    const [S, W, N, E] = state.filters.bbox;
    bboxLayer = L.rectangle([[S, W], [N, E]], { color: '#e45756', weight: 2, fillOpacity: 0.05 }).addTo(miniMap);
  }
}

function invalidateMiniMap() { if (miniMap) miniMap.invalidateSize(); }

el('toStep3Btn').addEventListener('click', () => { goToStep(3); if (window.buildCleanRules) window.buildCleanRules(); });

window.buildFilters = buildFilters;
window.invalidateMiniMap = invalidateMiniMap;
