/* Step 2: facets and filtering of the raw records. */

let miniMap = null, bboxLayer = null, drawMode = false, drawCorner = null, drawBtn = null;

function facetCounts(records, keyFn) {
  const m = new Map();
  for (const r of records) {
    const k = keyFn(r);
    if (k === '' || k === null || k === undefined) continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

/* `selectedSet` always holds the checked values (it starts with all of them).
   A value passes the filter if it is in the set; an empty set passes nothing. */
function renderFacet(titleHTML, entries, selectedSet) {
  entries.forEach(([val]) => selectedSet.add(val));
  const box = document.createElement('div');
  box.className = 'filter-box';
  box.innerHTML = `<h3>${titleHTML} <a href="#" class="facet-all" style="font-weight:400;font-size:.8rem">${L2('todos', 'all')}</a> /
    <a href="#" class="facet-none" style="font-weight:400;font-size:.8rem">${L2('ninguno', 'none')}</a></h3>`;
  const list = document.createElement('div');
  list.className = 'facet-list';
  const inputs = [];
  entries.forEach(([val, count]) => {
    const row = document.createElement('label');
    row.className = 'facet-item';
    row.innerHTML = `<input type="checkbox" checked><span>${esc(val)}</span><span class="facet-count">${count.toLocaleString('en-US')}</span>`;
    const input = row.querySelector('input');
    inputs.push(input);
    input.addEventListener('change', () => { if (input.checked) selectedSet.add(val); else selectedSet.delete(val); applyFilters(); });
    list.appendChild(row);
  });
  box.appendChild(list);
  box.querySelector('.facet-all').onclick = e => { e.preventDefault(); entries.forEach(([v]) => selectedSet.add(v)); inputs.forEach(i => i.checked = true); applyFilters(); };
  box.querySelector('.facet-none').onclick = e => { e.preventDefault(); selectedSet.clear(); inputs.forEach(i => i.checked = false); applyFilters(); };
  return box;
}

function buildFilters() {
  const grid = el('filterGrid');
  grid.innerHTML = '';
  const R = state.raw;
  state.filters = { rank: new Set(), country: new Set(), basisOfRecord: new Set(), state: new Set(), yearMin: null, yearMax: null, bbox: null };
  grid.appendChild(renderFacet(L2('Rango taxonómico', 'Taxonomic rank'), facetCounts(R, r => r.taxonRank || 'SPECIES'), state.filters.rank));
  grid.appendChild(renderFacet(L2('País', 'Country'), facetCounts(R, r => r.country), state.filters.country));
  grid.appendChild(renderFacet(L2('Tipo de registro', 'Record type'), facetCounts(R, r => r.basisOfRecord), state.filters.basisOfRecord));

  const years = R.map(r => r.year).filter(Boolean);
  if (years.length) {
    const ymin = Math.min(...years), ymax = Math.max(...years);
    const yBox = document.createElement('div');
    yBox.className = 'filter-box';
    yBox.innerHTML = `<h3>${L2('Año de registro', 'Year of record')}</h3>
      <div class="year-range">
        <input type="number" id="fYearMin" value="${ymin}" min="${ymin}" max="${ymax}"><span>${L2('a', 'to')}</span>
        <input type="number" id="fYearMax" value="${ymax}" min="${ymin}" max="${ymax}">
      </div>
      <p class="hint">${L2(`${years.length.toLocaleString('en-US')} registros con año.`, `${years.length.toLocaleString('en-US')} records with a year.`)}</p>`;
    grid.appendChild(yBox);
    yBox.querySelector('#fYearMin').addEventListener('change', readYear);
    yBox.querySelector('#fYearMax').addEventListener('change', readYear);
  }
  fillRegionLayerSelect();
  buildStateFilter(false);
  el('bboxApplyBtn').onclick = applyBboxFromInputs;
  el('bboxClearBtn').onclick = () => { setBbox(null); ['bboxS', 'bboxN', 'bboxW', 'bboxE'].forEach(i => el(i).value = ''); };
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
  if ([s, n, w, e].some(isNaN)) {
    clearMessages('filterMessages');
    alert(T('Completa las 4 casillas del recuadro.', 'Fill in the 4 boxes of the rectangle.')); return;
  }
  setBbox([Math.min(s, n), Math.min(w, e), Math.max(s, n), Math.max(w, e)]);
}
function setBbox(bbox) { state.filters.bbox = bbox; drawBboxLayer(); applyFilters(); }

function passesFilters(r) {
  const f = state.filters;
  if (!f.rank.has(r.taxonRank || 'SPECIES')) return false;
  if (r.country !== '' && !f.country.has(r.country)) return false;
  if (r.basisOfRecord !== '' && !f.basisOfRecord.has(r.basisOfRecord)) return false;
  if (f.state && el('stateFacet').children.length && !f.state.has(r._region || REG_NONE)) return false;
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
  el('filterCount').innerHTML = L2(`${state.filtered.length.toLocaleString('en-US')} registros`, `${state.filtered.length.toLocaleString('en-US')} records`);
  buildTable('filteredTable', window.RAW_COLUMNS, state.filtered, 200);
  enableStep(3);
  if (miniMap) { drawMiniPoints(); drawRegionOutline(); }
}

/* ---------- mini map with a rectangle ---------- */
function setupMiniMap() {
  if (miniMap) { miniMap.remove(); miniMap = null; }
  miniMap = L.map('bboxMiniMap', { worldCopyJump: true });
  mapkit.tileLayerFor('gray', { maxZoom: 12 }).addTo(miniMap);
  const pts = state.raw.filter(r => r.decimalLatitude != null);
  if (pts.length) miniMap.fitBounds(L.latLngBounds(pts.map(r => [r.decimalLatitude, r.decimalLongitude])).pad(0.15));
  else miniMap.setView([20, 0], 2);
  drawMiniPoints(); drawBboxLayer();

  const ctl = L.control({ position: 'topright' });
  ctl.onAdd = () => {
    drawBtn = L.DomUtil.create('button', 'btn btn-secondary btn-sm');
    L.DomEvent.disableClickPropagation(drawBtn);
    drawBtn.onclick = () => { drawMode = !drawMode; drawCorner = null; refreshDrawBtn(); miniMap.getContainer().style.cursor = drawMode ? 'crosshair' : ''; };
    refreshDrawBtn();
    return drawBtn;
  };
  ctl.addTo(miniMap);
  miniMap.on('click', e => {
    if (!drawMode) return;
    if (!drawCorner) { drawCorner = e.latlng; return; }
    const a = drawCorner, b = e.latlng;
    setBbox([Math.min(a.lat, b.lat), Math.min(a.lng, b.lng), Math.max(a.lat, b.lat), Math.max(a.lng, b.lng)]);
    el('bboxS').value = Math.min(a.lat, b.lat).toFixed(3); el('bboxN').value = Math.max(a.lat, b.lat).toFixed(3);
    el('bboxW').value = Math.min(a.lng, b.lng).toFixed(3); el('bboxE').value = Math.max(a.lng, b.lng).toFixed(3);
    drawMode = false; drawCorner = null; miniMap.getContainer().style.cursor = ''; refreshDrawBtn();
  });
}
function refreshDrawBtn() {
  if (drawBtn) drawBtn.textContent = drawMode ? T('Clic en 2 esquinas…', 'Click 2 corners…') : T('Dibujar recuadro', 'Draw rectangle');
}
document.addEventListener('langchange', refreshDrawBtn);

let miniPointLayer = null;
function drawMiniPoints() {
  if (miniPointLayer) miniMap.removeLayer(miniPointLayer);
  miniPointLayer = L.layerGroup();
  const inSet = new Set(state.filtered.map(r => r.key));
  for (const r of state.raw) {
    if (r.decimalLatitude == null) continue;
    const on = inSet.has(r.key);
    L.circleMarker([r.decimalLatitude, r.decimalLongitude], { radius: 3, weight: 0, fillColor: on ? '#1f7a4d' : '#bbbbbb', fillOpacity: on ? 0.75 : 0.35 }).addTo(miniPointLayer);
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

/* ---------- state / region filter ---------- */
/* Every record gets `_region`, the name of the region it falls in, taken from its text field, from its
   coordinates, or from both. REG_NONE stands for the records that could not be placed. */
const REG_NONE = '__sin_region__';
const regStats = { text: 0, coord: 0, differ: 0, none: 0 };

function regionLayerLabel(l) { return l.label ? lab(l.label) : l.id; }

function fillRegionLayerSelect() {
  const sel = el('regionLayer'), cur = sel.value;
  sel.innerHTML = '';
  RegionLayers.list.forEach(l => sel.add(new Option(regionLayerLabel(l) + ' (' + l.regions.length + ')', l.id)));
  if (!RegionLayers.list.length) sel.add(new Option(T('sin capa de regiones', 'no region layer'), ''));
  sel.value = RegionLayers.list.some(l => l.id === cur) ? cur : (RegionLayers.current || '');
  RegionLayers.current = sel.value || null;
}

/* Recomputes `_region` for every downloaded record with the current layer and mode. */
function assignRegions() {
  const layer = regionLayer(), mode = el('stateMode').value;
  const useText = layer && layer.id === 'mx-states' && mode !== 'coord';
  const useCoord = layer && mode !== 'text';
  Object.assign(regStats, { text: 0, coord: 0, differ: 0, none: 0, outside: 0 });
  for (const r of state.raw) {
    const txt = (useText || mode === 'coord') ? mxStateFromText(r.stateProvince) : null;
    const crd = useCoord ? regionOfPoint(r.decimalLatitude, r.decimalLongitude) : null;
    const v = mode === 'coord' ? crd : (txt || crd);
    if (txt && crd && txt !== crd) regStats.differ++;
    if (mode === 'coord' && txt && !crd) regStats.outside++;    /* named in the text but the point falls outside every boundary */
    if (v && v === txt) regStats.text++; else if (v) regStats.coord++;
    r._region = v || null;
    if (!v) regStats.none++;
  }
}

function buildStateFilter(keepSelection) {
  const layer = regionLayer();
  el('stateMode').disabled = !layer;
  if (!layer) {
    el('stateFacet').innerHTML = '';
    el('stateRegionBtns').innerHTML = '';
    clearMessages('stateStatus');
    showMessage('stateStatus', 'warning', L2('No hay capa de regiones disponible. Carga un GeoJSON con tus regiones para filtrar por ellas.',
      'No region layer is available. Load a GeoJSON with your regions to filter by them.'));
    state.filters.state = new Set();
    return;
  }
  assignRegions();
  const counts = {};
  state.raw.forEach(r => { const k = r._region || REG_NONE; counts[k] = (counts[k] || 0) + 1; });
  const all = layer.regions.map(r => r.n).sort((a, b) => a.localeCompare(b, 'es'));
  const many = all.length > 60;
  const shown = (many ? all.filter(n => counts[n]) : all).slice();
  if (counts[REG_NONE]) shown.push(REG_NONE);

  const prev = keepSelection && state.filters.state ? new Set(state.filters.state) : null;
  const sel = state.filters.state = new Set(prev ? [...prev].filter(v => shown.includes(v)) : shown.filter(v => counts[v]));
  if (!prev) state.filters.stateTouched = false;               /* a fresh build is the automatic selection, not a decision */
  if (!prev && counts[REG_NONE]) sel.add(REG_NONE);            /* the first view must not hide anything */

  const nameOf = n => n === REG_NONE ? '<i>' + L2('sin estado asignado', 'no state assigned') + '</i>' : esc(n);
  el('stateFacet').innerHTML =
    '<div class="state-head"><span>' + L2('Estados o regiones', 'States or regions') + '</span>' +
      '<a href="#" id="stAll">' + L2('todos', 'all') + '</a><a href="#" id="stNone">' + L2('ninguno', 'none') + '</a>' +
      '<a href="#" id="stWith">' + L2('solo con registros', 'only with records') + '</a></div>' +
    '<div class="state-list">' + shown.map(n =>
      '<label class="state-item' + (n === REG_NONE ? ' none' : '') + (counts[n] ? '' : ' zero') + '"><input type="checkbox" value="' + esc(n) + '"' + (sel.has(n) ? ' checked' : '') + '>' +
        '<span class="st-n">' + nameOf(n) + '</span><span class="st-c">' + (counts[n] || 0).toLocaleString('en-US') + '</span></label>').join('') + '</div>' +
    (many ? '<p class="hint">' + L2('La capa tiene ' + all.length + ' regiones; se listan solo las que tienen registros.',
      'The layer has ' + all.length + ' regions; only those with records are listed.') + '</p>' : '');

  const boxes = [...el('stateFacet').querySelectorAll('input')];
  const touch = () => { state.filters.stateTouched = true; };                /* a deliberate choice, unlike the default selection */
  const sync = () => { boxes.forEach(b => b.checked = sel.has(b.value)); refreshRegionBtns(); };
  boxes.forEach(b => b.addEventListener('change', () => {
    touch();
    if (b.checked) sel.add(b.value); else sel.delete(b.value);
    refreshRegionBtns(); applyFilters(); drawRegionOutline();
  }));
  el('stAll').onclick = e => { e.preventDefault(); touch(); shown.forEach(n => sel.add(n)); sync(); applyFilters(); drawRegionOutline(); };
  el('stNone').onclick = e => { e.preventDefault(); touch(); sel.clear(); sync(); applyFilters(); drawRegionOutline(); };
  el('stWith').onclick = e => { e.preventDefault(); touch(); sel.clear(); shown.forEach(n => { if (counts[n] && n !== REG_NONE) sel.add(n); }); sync(); applyFilters(); drawRegionOutline(); };

  /* shortcuts by group of states, only for the bundled Mexican layer */
  const btns = el('stateRegionBtns');
  btns.innerHTML = layer.id === 'mx-states'
    ? MX_REGIONS.map((g, i) => '<button type="button" data-g="' + i + '">' + L2(g.es, g.en) + '</button>').join('')
    : '';
  btns.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    touch();
    const g = MX_REGIONS[+b.dataset.g], names = g.codes.map(c => MX_NAME_OF_CODE[c]);
    const on = names.every(n => sel.has(n));
    names.forEach(n => { if (on) sel.delete(n); else sel.add(n); });
    sync(); applyFilters(); drawRegionOutline();
  }));
  refreshRegionBtns();
  renderRegionStatus();
}

function refreshRegionBtns() {
  const sel = state.filters.state || new Set();
  el('stateRegionBtns').querySelectorAll('button').forEach(b => {
    const g = MX_REGIONS[+b.dataset.g];
    b.classList.toggle('on', g.codes.every(c => sel.has(MX_NAME_OF_CODE[c])));
  });
}

function renderRegionStatus() {
  clearMessages('stateStatus');
  const layer = regionLayer(), mode = el('stateMode').value;
  const n = v => v.toLocaleString('en-US');
  let html = L2('Asignados por el texto del registro: <b>' + n(regStats.text) + '</b> · por coordenadas: <b>' + n(regStats.coord) + '</b> · sin asignar: <b>' + n(regStats.none) + '</b>',
    'Assigned from the record text: <b>' + n(regStats.text) + '</b> · from the coordinates: <b>' + n(regStats.coord) + '</b> · unassigned: <b>' + n(regStats.none) + '</b>');
  if (layer && layer.source) html += ' · ' + L2('límites: ', 'boundaries: ') + esc(layer.source);
  showMessage('stateStatus', 'info', html);
  if (regStats.differ && mode !== 'text')
    showMessage('stateStatus', 'warning', L2('En ' + n(regStats.differ) + ' registro(s) el texto del campo «estado» no coincide con el estado que dan sus coordenadas (nombres mal escritos, registros junto al límite o coordenadas erróneas). En el modo «siempre por coordenadas» manda la coordenada; el paso 3 puede descartar los registros mal georreferenciados.',
      'In ' + n(regStats.differ) + ' record(s) the text of the «state» field does not match the state given by its coordinates (misspelt names, records next to the boundary, or wrong coordinates). In the «always from the coordinates» mode the coordinate wins; step 3 can drop badly georeferenced records.'));
  if (regStats.outside)
    showMessage('stateStatus', 'info', L2(n(regStats.outside) + ' registro(s) traen estado en el texto pero su coordenada no cae dentro de ningún límite (costa, isla pequeña o mar); en este modo quedan sin asignar. Los límites están simplificados a unos 0.4 km.',
      n(regStats.outside) + ' record(s) name a state in the text but their coordinate falls inside no boundary (coast, small island or sea); in this mode they stay unassigned. The boundaries are simplified to about 0.4 km.'));
  if (regStats.none && mode === 'text')
    showMessage('stateStatus', 'info', L2('Con el modo por coordenadas se completarían los registros que no traen estado.', 'The coordinate mode would complete the records that carry no state.'));
}

/* outline of the chosen regions on the mini map */
let regionOutlineLayer = null;
function drawRegionOutline() {
  if (!miniMap) return;
  if (regionOutlineLayer) { miniMap.removeLayer(regionOutlineLayer); regionOutlineLayer = null; }
  if (!el('stateOutlineChk').checked) return;
  const rings = regionsOutline([...(state.filters.state || [])]);
  if (!rings.length) return;
  regionOutlineLayer = L.layerGroup(rings.map(r => L.polyline(r, { color: cssVar('--primary', '#1f7a4d'), weight: 1.4, opacity: 0.9, interactive: false })));
  regionOutlineLayer.addTo(miniMap);
}
/* the other maps can draw the same outline */
window.selectedRegionRings = () => (el('stateOutlineChk') && el('stateOutlineChk').checked) ? regionsOutline([...(state.filters.state || [])]) : [];
window.selectedRegionNames = () => [...(state.filters.state || [])].filter(v => v !== REG_NONE);
window.selectedRegionBBox = () => regionsBBox(window.selectedRegionNames());

el('stateMode').addEventListener('change', () => { buildStateFilter(true); applyFilters(); drawRegionOutline(); });
el('regionLayer').addEventListener('change', e => { RegionLayers.current = e.target.value || null; buildStateFilter(false); applyFilters(); drawRegionOutline(); });
el('stateOutlineChk').addEventListener('change', drawRegionOutline);
el('regionFileBtn').addEventListener('click', () => el('regionFile').click());
el('regionFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  clearMessages('stateStatus');
  showSpinner(T('Leyendo la capa de regiones…', 'Reading the region layer…'));
  try {
    const layer = parseRegionGeoJSON(await f.text(), 'user-' + Date.now(), { es: f.name, en: f.name });
    RegionLayers.current = layer.id;
    fillRegionLayerSelect();
    buildStateFilter(false); applyFilters(); drawRegionOutline();
    showMessage('stateStatus', 'success', L2('Capa cargada: ' + layer.regions.length + ' regiones de «' + esc(f.name) + '». La región de cada registro se asigna por sus coordenadas.',
      'Layer loaded: ' + layer.regions.length + ' regions from «' + esc(f.name) + '». Each record’s region is assigned from its coordinates.'));
  } catch (err) {
    showMessage('stateStatus', 'error', L2('No se pudo leer la capa: ', 'The layer could not be read: ') + errHTML(err));
  } finally { hideSpinner(); }
});
el('stateBboxBtn').addEventListener('click', () => {
  const b = window.selectedRegionBBox();
  if (!b) { showMessage('stateStatus', 'warning', L2('Elige al menos un estado o región.', 'Choose at least one state or region.')); return; }
  const pad = 0.1;
  el('bboxS').value = (b.S - pad).toFixed(3); el('bboxN').value = (b.N + pad).toFixed(3);
  el('bboxW').value = (b.W - pad).toFixed(3); el('bboxE').value = (b.E + pad).toFixed(3);
  setBbox([b.S - pad, b.W - pad, b.N + pad, b.E + pad]);
});
document.addEventListener('langchange', () => { if (state.raw.length && regionLayer()) { fillRegionLayerSelect(); buildStateFilter(true); } });
document.addEventListener('themechange', drawRegionOutline);
