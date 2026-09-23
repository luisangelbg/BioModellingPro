/* Step 9 · Species distribution modelling (SDM).
   The heavy computation runs in Python (sdm-py.js). This file holds the raster-grid reading, the interface,
   the maps and the exports.
   Language: HTML that stays on the page is written with L2(es, en); transient text (spinner, progress,
   <option> text, file names) uses T(es, en). Python returns numbers and language-neutral codes; the
   {es, en} name tables below turn them into labels. Things drawn once with T() are rebuilt on 'langchange';
   presence markers follow the colour theme on 'themechange'. */

const sdmBi = (es, en) => ({ es, en: en === undefined ? es : en });

/* algorithms: key, checked by default, short name (tables, charts) and long name (checklist) */
const SDM_ALGOS = [
  { key: 'maxent', on: true, short: sdmBi('Tipo MaxEnt', 'MaxEnt-style'),
    long: sdmBi('Logístico penalizado tipo MaxEnt (salida cloglog)', 'MaxEnt-style penalised logistic (cloglog output)') },
  { key: 'glm', on: true, short: sdmBi('GLM'), long: sdmBi('GLM logístico (lineal + cuadrático)', 'Logistic GLM (linear + quadratic)') },
  { key: 'gam', on: false, short: sdmBi('GAM'), long: sdmBi('GAM (B-splines)', 'GAM (B-splines)') },
  { key: 'rf', on: true, short: sdmBi('Bosque aleatorio', 'Random forest'),
    long: sdmBi('Bosque aleatorio (submuestreo balanceado)', 'Random forest (balanced subsampling)') },
  { key: 'brt', on: true, short: sdmBi('BRT'), long: sdmBi('Árboles de regresión potenciados (BRT)', 'Boosted regression trees (BRT)') },
  { key: 'svm', on: false, short: sdmBi('SVM'), long: sdmBi('Máquina de vectores de soporte (núcleo RBF)', 'Support vector machine (RBF kernel)') },
  { key: 'ann', on: false, short: sdmBi('Red neuronal', 'Neural network'), long: sdmBi('Red neuronal (5 redes)', 'Neural network (5 nets)') },
  { key: 'bioclim', on: false, short: sdmBi('Bioclim'), long: sdmBi('Bioclim (envoltura climática)', 'Bioclim (climatic envelope)') },
  { key: 'domain', on: false, short: sdmBi('Domain'), long: sdmBi('Domain (distancia de Gower)', 'Domain (Gower distance)') },
  { key: 'mahal', on: false, short: sdmBi('Mahalanobis'), long: sdmBi('Distancia de Mahalanobis', 'Mahalanobis distance') },
];
const SDM_NAME = Object.fromEntries(SDM_ALGOS.map(a => [a.key, a.short]));
SDM_NAME.ensemble = sdmBi('Ensamble', 'Ensemble');
const sdmName = a => SDM_NAME[a] || sdmBi(a);                 // {es, en}
const algoName = a => T(sdmName(a));                          // plain text in the active language
const algoL2 = a => L2(sdmName(a).es, sdmName(a).en);         // HTML for both languages

/* error codes raised by the Python engine ('ERR:code[:detail]') and their texts */
const SDM_ERR = {
  block_min_presences: () => sdmBi('Se necesitan al menos 8 presencias para bloques espaciales.', 'At least 8 presences are needed for spatial blocks.'),
  no_algorithm: () => sdmBi('Elige al menos un algoritmo.', 'Choose at least one algorithm.'),
  scenario_grid_mismatch: () => sdmBi('La malla del escenario no coincide con la del modelo.', 'The scenario grid does not match the model grid.'),
  unknown_algorithm: d => sdmBi('Algoritmo desconocido: ' + esc(d), 'Unknown algorithm: ' + esc(d)),
};
/* an error (from JS or from Python) as HTML in both languages */
function sdmErr(e) {
  if (e && e.html) return e.html;
  const msg = String((e && e.message) || e), m = msg.match(/ERR:([a-z_]+)(?::([^\s'"]+))?/);
  if (m && SDM_ERR[m[1]]) { const o = SDM_ERR[m[1]](m[2] || ''); return L2(o.es, o.en); }
  return esc(msg);
}

/* variable code in a given language (only elevation differs: ALT / ELEV) */
const sdmCode = (k, lang) => k === 'elev' ? (lang === 'en' ? 'ELEV' : 'ALT') : varCode(k);

const sdm = { pyReady: false, keys: [], meta: null, cv: {}, final: {}, run: [], scenarios: [], folds: [],
  extentTouched: false, extentKind: null, extentName: '', bbox: null,
  map: null, dataMap: null, overlay: null, ptsLayer: null, pres: [], lastView: null,
  ensMetrics: null, ensParts: null, dataBg: [], dataPres: [], dataOverlay: null, pickSig: null,
  /* future-projection workbench (see the last section of this file) */
  fut: { scn: [], items: [], rows: [], groups: [], ref: null, rec: null, messOk: new Set(), elevSent: false,
    sort: { key: '', dir: 1 }, recSort: { key: 'n', dir: 1 }, ensRows: [], refRows: [], seq: 0 } };
window.sdm = sdm;

const tick = (ms = 25) => new Promise(r => setTimeout(r, ms));
function setBar(fillId, labelId, frac, text) {
  el(fillId).style.width = Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%';
  if (text != null) el(labelId).textContent = text;
}
/* a Python string literal holding the JSON of an object (for building expressions passed to showFig) */
const sdmPyJSON = o => JSON.stringify(JSON.stringify(o));

async function ensureSdmPy() {
  const py = await getPyodide();
  if (!sdm.pyReady) { py.runPython(PY_SDM); sdm.pyReady = true; }
  return py;
}
/* The arguments of a Python call travel through global names (_a0, _a1 …), so two calls in flight at the same
   time would overwrite each other. Every call of this file is therefore queued: sdmPyLock runs the tasks one
   after another, whatever order the interface asks for them in. */
let _pyQueue = Promise.resolve();
function sdmPyLock(task) {
  const p = _pyQueue.then(task, task);
  _pyQueue = p.then(() => {}, () => {});
  return p;
}
/* calls a Python function of the engine with positional arguments; goes through runPy so that language and
   theme are synchronised first */
function pyf(fn, ...args) {
  return sdmPyLock(async () => {
    await ensureSdmPy();
    const g = {};
    args.forEach((a, i) => { g['_a' + i] = a; });
    return runPy(`${fn}(${args.map((_, i) => '_a' + i).join(', ')})`, g);
  });
}

/* ------------------------------------------------------------ tab: selectors */
function sdmAvailableKeys() {
  const f = (state.env && state.env.files) || {};
  return [...Array(19)].map((_, i) => 'bio_' + (i + 1)).concat('elev').filter(k => f[k]);
}
const sdmRecords = () => (state.clean.length ? state.clean : state.filtered);

function sdmOnShow() {
  const keys = sdmAvailableKeys(), st = el('sdmRasterStatus');
  st.innerHTML = '';
  if (!keys.length) showMessage(st, 'warning', L2(
    'Aún no hay capas ráster cargadas. Ve al paso 5 («Variables»), selecciona los GeoTIFF de WorldClim (o usa los de ejemplo) y vuelve aquí.',
    'No raster layers are loaded yet. Go to step 5 (“Variables”), select the WorldClim GeoTIFF files (or use the example ones) and come back here.'));
  else {
    const res = state.env.resolution ? ` (WorldClim ${esc(state.env.resolution)})` : '';
    showMessage(st, 'info', L2(`${keys.length} capas ráster disponibles${res}.`, `${keys.length} raster layers available${res}.`));
  }
  sdmBuildPickers();
  /* A map built while its panel was hidden measures 0 x 0, so fitBounds lands on the whole world; the fit is
     retried here, when the step is on screen, until it really happens. */
  if (sdm.map) setTimeout(() => { sdm.map.invalidateSize(); if (!sdm.mapFitted && sdm.overlay) sdm.mapFitted = sdmFitMap(sdm.map, sdm.overlay.getBounds()); }, 60);
  if (sdm.dataMap) setTimeout(() => { sdm.dataMap.invalidateSize(); if (!sdm.dataFitted && sdm.dataOverlay) sdm.dataFitted = sdmFitMap(sdm.dataMap, sdm.dataOverlay.getBounds()); }, 60);
}

/* rebuilt only when the available layers, the records or the recommended variables have changed */
function sdmBuildPickers() {
  const sig = [sdmAvailableKeys().join(','), sdmRecords().length, ((state.stats && state.stats.recommendedVars) || []).join(',')].join('|');
  if (sig !== sdm.pickSig || !el('sdmVarChecklist').children.length) {
    sdm.pickSig = sig;
    sdmBuildVarPicker();
    sdmFillTaxon();
  }
  if (!el('sdmAlgoList').children.length) sdmBuildAlgoList();
  sdmExtentUI();
}

function sdmBuildVarPicker() {
  const keys = sdmAvailableKeys();
  const rec = new Set((state.stats && state.stats.recommendedVars) || keys);
  const box = el('sdmVarChecklist'); box.innerHTML = '';
  keys.forEach(k => {
    const l = document.createElement('label'); l.className = 'checkbox-label';
    l.innerHTML = `<input type="checkbox" value="${k}" ${rec.has(k) ? 'checked' : ''}> ${esc(varCode(k))}${rec.has(k) && state.stats && state.stats.recommendedVars ? ` <span class="tag-info">${L2('paso 6', 'step 6')}</span>` : ''}`;
    box.appendChild(l);
  });
}

/* the first option ("all records") depends on the language, so this also runs on 'langchange' */
function sdmFillTaxon() {
  const recs = sdmRecords();
  const counts = {}; recs.forEach(r => { counts[r.taxon] = (counts[r.taxon] || 0) + 1; });
  const sel = el('sdmTaxon'), cur = sel.value; sel.innerHTML = '';
  sel.add(new Option(T(`Todos los registros (${recs.length})`, `All records (${recs.length})`), ''));
  Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([t, n]) => sel.add(new Option(`${t} (${n})`, t)));
  if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
}

function sdmBuildAlgoList() {
  const ab = el('sdmAlgoList'); ab.innerHTML = '';
  SDM_ALGOS.forEach(a => {
    const l = document.createElement('label'); l.className = 'checkbox-label';
    l.innerHTML = `<input type="checkbox" value="${a.key}" ${a.on ? 'checked' : ''}> ${L2(a.long.es, a.long.en)}`; ab.appendChild(l);
  });
}

el('sdmVarsRecommended').addEventListener('click', () => {
  const rec = new Set((state.stats && state.stats.recommendedVars) || []);
  el('sdmVarChecklist').querySelectorAll('input').forEach(i => i.checked = rec.has(i.value));
});
el('sdmVarsAll').addEventListener('click', () => el('sdmVarChecklist').querySelectorAll('input').forEach(i => i.checked = true));
const sdmSelectedKeys = () => [...el('sdmVarChecklist').querySelectorAll('input:checked')].map(i => i.value);

/* ------------------------------------------------------------ raster grid reading */
const sameGrid = (a, b) => a.w === b.w && a.h === b.h && Math.abs(a.rx - b.rx) < 1e-12 && Math.abs(a.ry - b.ry) < 1e-12 &&
  Math.abs(a.ox - b.ox) < 1e-9 && Math.abs(a.oy - b.oy) < 1e-9;

/* Reads every layer on the same grid (averaging f×f blocks when the grid is aggregated).
   sources[i] = {file, band}. When refMeta is given its grid is reused (projection to another scenario).
   progress(i, n, key) is called before each layer and once at the end with key = null. */
async function sdmReadStack(keys, sources, bbox, maxCells, progress, refMeta) {
  const g0 = await openGeo(sources[0].file);
  const ref = refMeta ? refMeta.ref : { ox: g0.ox, oy: g0.oy, rx: g0.rx, ry: g0.ry, w: g0.w, h: g0.h };
  let x0, y0, f, ow, oh;
  if (refMeta) { x0 = refMeta.win.x0; y0 = refMeta.win.y0; f = refMeta.f; ow = refMeta.ncol; oh = refMeta.nrow; }
  else {
    x0 = Math.max(0, Math.floor((bbox.W - g0.ox) / g0.rx)); const x1 = Math.min(g0.w, Math.ceil((bbox.E - g0.ox) / g0.rx));
    y0 = Math.max(0, Math.floor((bbox.N - g0.oy) / g0.ry)); const y1 = Math.min(g0.h, Math.ceil((bbox.S - g0.oy) / g0.ry));
    const W = x1 - x0, H = y1 - y0;
    if (W < 10 || H < 10) throw bilingualError('El recuadro de los registros queda fuera del ráster o es demasiado pequeño.',
      'The bounding box of the records lies outside the raster or is too small.');
    f = Math.max(1, Math.ceil(Math.sqrt(W * H / maxCells)));
    ow = Math.floor(W / f); oh = Math.floor(H / f);
  }
  const meta = { keys, nrow: oh, ncol: ow, west: ref.ox + x0 * ref.rx, north: ref.oy + y0 * ref.ry,
    dx: ref.rx * f, dy: -ref.ry * f, f, win: { x0, y0 }, ref };
  const ncell = ow * oh, stack = new Float32Array(keys.length * ncell).fill(NaN);
  for (let li = 0; li < keys.length; li++) {
    progress(li, keys.length, keys[li]); await tick();
    const src = sources[li], band = src.band || 0;
    const geo = (li === 0 && !refMeta) ? g0 : await openGeo(src.file);
    const out = stack.subarray(li * ncell, (li + 1) * ncell);
    if (sameGrid(geo, ref)) {
      const rowsPer = Math.max(1, Math.floor(6e6 / (ow * f * f)));
      for (let r0 = 0; r0 < oh; r0 += rowsPer) {
        const nr = Math.min(rowsPer, oh - r0), w = ow * f;
        const data = (await geo.image.readRasters({ window: [x0, y0 + r0 * f, x0 + w, y0 + (r0 + nr) * f], samples: [band] }))[0];
        for (let r = 0; r < nr; r++) for (let c = 0; c < ow; c++) {
          let sum = 0, cnt = 0;
          for (let dy = 0; dy < f; dy++) { const base = (r * f + dy) * w + c * f; for (let dx = 0; dx < f; dx++) { const v = data[base + dx]; if (!isNoData(v, geo.nd)) { sum += v; cnt++; } } }
          out[(r0 + r) * ow + c] = cnt >= (f * f) / 2 ? sum / cnt : NaN;
        }
      }
    } else if (band === 0) {
      const pts = [];
      for (let i = 0; i < oh; i++) for (let j = 0; j < ow; j++) pts.push({ lat: meta.north - (i + 0.5) * meta.dy, lon: meta.west + (j + 0.5) * meta.dx });
      const vals = await sampleGeo(geo, pts, { categorical: false });
      for (let i = 0; i < vals.length; i++) out[i] = vals[i] == null ? NaN : vals[i];
    } else throw bilingualError(`La malla de «${sdmCode(keys[li], 'es')}» no coincide con la de las demás capas.`,
      `The grid of “${sdmCode(keys[li], 'en')}” does not match that of the other layers.`);
  }
  progress(keys.length, keys.length, null);
  return { stack, meta };
}

/* ------------------------------------------------------------ prepare data */
el('sdmPrepareBtn').addEventListener('click', sdmPrepare);

/* ------------------------------------------------------------ map extent */
/* boxes are [west, south, east, north]; the country boxes cover the mainland and the usual islands */
const SDM_EXTENTS = { mx: [-118.6, 14.4, -86.4, 32.8], mxca: [-118.6, 7.0, -77.0, 32.8], us: [-125.0, 24.4, -66.9, 49.5], namer: [-170, 5, -50, 72],
  latam: [-118.6, -56, -34, 33], samer: [-82, -56.5, -34, 13.5], eu: [-25, 34, 45, 72], af: [-18.5, -35, 52, 38], as: [25, -11, 150, 78], oc: [110, -48, 180, -8], world: [-180, -60, 180, 85] };
const SDM_COUNTRY_BOX = { MX: SDM_EXTENTS.mx, US: SDM_EXTENTS.us, CA: [-141, 41.7, -52.6, 83.1], GT: [-92.3, 13.7, -88.2, 17.8], BZ: [-89.3, 15.9, -87.5, 18.5], HN: [-89.4, 12.9, -83.1, 16.5],
  SV: [-90.1, 13.1, -87.7, 14.5], NI: [-87.7, 10.7, -82.6, 15.0], CR: [-85.95, 8.0, -82.5, 11.2], PA: [-83.1, 7.2, -77.2, 9.7], CU: [-85, 19.8, -74.1, 23.3], CO: [-79, -4.3, -66.8, 13.4],
  VE: [-73.4, 0.6, -59.8, 12.2], EC: [-81.1, -5.0, -75.2, 1.5], PE: [-81.4, -18.4, -68.7, 0], BO: [-69.7, -22.9, -57.5, -9.7], BR: [-74, -33.8, -34.8, 5.3], CL: [-75.7, -56, -66.4, -17.5],
  AR: [-73.6, -55.1, -53.6, -21.8], UY: [-58.5, -35, -53, -30], PY: [-62.7, -27.6, -54.2, -19.3] };
/* country shared by at least 60 % of the records (a few stray records elsewhere do not matter), when it is in the table */
function sdmRecordsCountry(recs) {
  const n = {}; recs.forEach(r => { const c = (r.countryCode || '').toUpperCase(); if (c) n[c] = (n[c] || 0) + 1; });
  const top = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
  return top && top[1] >= 0.6 * recs.length && SDM_COUNTRY_BOX[top[0]] ? top[0] : null;
}
/* the box of the chosen extent as {W, E, S, N}, or null for "records + margin" (or when it cannot be built) */
function sdmExtentBox(kind, recs) {
  let b = null;
  if (kind === 'country') { const c = sdmRecordsCountry(recs); b = c ? SDM_COUNTRY_BOX[c] : null; }
  else if (kind === 'states') { const r = window.selectedRegionBBox && window.selectedRegionBBox(); b = r ? [r.W, r.S, r.E, r.N] : null; }
  else if (kind === 'custom') b = [+el('sdmExtW').value, +el('sdmExtS').value, +el('sdmExtE').value, +el('sdmExtN').value];
  else if (SDM_EXTENTS[kind]) b = SDM_EXTENTS[kind];
  if (!b || b.some(v => !isFinite(v))) return null;
  return { W: Math.max(-180, Math.min(b[0], b[2])), E: Math.min(180, Math.max(b[0], b[2])), S: Math.max(-90, Math.min(b[1], b[3])), N: Math.min(90, Math.max(b[1], b[3])) };
}
/* What the map should cover unless the user says otherwise: the regions chosen in step 2 when they are a
   subset, otherwise the country the records belong to, and only as a last resort their bounding box. A map
   that stops in the middle of the country is almost never what the user wants. */
function sdmDefaultExtent() {
  const sn = window.selectedRegionNames ? window.selectedRegionNames() : [];
  const layer = window.regionLayer ? window.regionLayer() : null;
  const chosen = state.filters && state.filters.stateTouched;   /* only a deliberate choice in step 2 counts */
  if (chosen && sn.length && layer && sn.length < layer.regions.length && regionsBBox(sn)) return 'states';
  return sdmRecordsCountry(sdmRecords()) ? 'country' : 'records';
}
const extentLabel = kind => {
  const o = [...el('sdmExtent').options].find(x => x.value === kind);
  return o ? o.textContent.replace(/\s*—.*$/, '').trim() : kind;
};
const fmtBox = b => b ? `${fmt(b.W, 1)}° a ${fmt(b.E, 1)}° · ${fmt(b.S, 1)}° a ${fmt(b.N, 1)}°` : '—';

/* the "country of the records" and "chosen regions" options name what they would use, and the custom fields show only when needed */
function sdmExtentUI() {
  const opt = el('sdmExtentCountry'), c = sdmRecordsCountry(sdmRecords());
  if (opt) { opt.disabled = !c; opt.textContent = T('País de los registros', 'Country of the records') + (c ? ` (${c})` : T(' — no detectado', ' — not detected')); }
  const so = el('sdmExtentStates'), sn = window.selectedRegionNames ? window.selectedRegionNames() : [];
  if (so) { so.disabled = !sn.length; so.textContent = T('Estados o regiones elegidos en el paso 2', 'States or regions chosen in step 2') + (sn.length ? ` (${sn.length})` : T(' — ninguno', ' — none')); }
  if (!sdm.extentTouched) {                                   /* pick the sensible default while the user has not chosen */
    const want = sdmDefaultExtent();
    if (el('sdmExtent').value !== want) el('sdmExtent').value = want;
  }
  el('sdmExtentCustom').style.display = el('sdmExtent').value === 'custom' ? 'inline' : 'none';
  sdmExtentWarn();
}

/* Warns when the data were prepared with a different extent from the one now selected: the maps keep the
   prepared grid until the data are prepared again, and that is the usual reason for an incomplete map. */
function sdmExtentWarn() {
  const box = el('sdmExtentWarn'); if (!box) return;
  const kind = el('sdmExtent').value;
  box.innerHTML = '';
  if (!sdm.meta) return;
  const prepared = esc(sdm.extentName || extentLabel(sdm.extentKind));
  if (sdm.extentKind === kind) {
    box.innerHTML = '<div class="msg msg-info">' +
      L2('La malla preparada usa la extensión <b>' + prepared + '</b> (lon · lat ' + fmtBox(sdm.bbox) + ').',
        'The prepared grid uses the extent <b>' + prepared + '</b> (lon · lat ' + fmtBox(sdm.bbox) + ').') + '</div>';
    return;
  }
  const again = sdm.run.length
    ? L2('Vuelve a preparar los datos y a ejecutar los modelos para que los mapas cubran la nueva extensión.', 'Prepare the data and run the models again so the maps cover the new extent.')
    : L2('Vuelve a preparar los datos para usarla.', 'Prepare the data again to use it.');
  const btnLabel = sdm.run.length ? L2('Preparar y ejecutar de nuevo', 'Prepare and run again') : L2('Preparar de nuevo', 'Prepare again');
  box.innerHTML = '<div class="msg msg-warning">' +
    L2('Cambiaste la extensión a <b>' + esc(extentLabel(kind)) + '</b>, pero la malla preparada sigue siendo <b>' + prepared + '</b>. ',
      'You changed the extent to <b>' + esc(extentLabel(kind)) + '</b>, but the prepared grid is still <b>' + prepared + '</b>. ') +
    again + ' <button class="btn btn-primary btn-sm" id="sdmExtentRedo" style="margin-left:8px">' + btnLabel + '</button></div>';
  el('sdmExtentRedo').addEventListener('click', async () => {
    const algos = sdm.run.slice();
    await sdmPrepare();
    if (algos.length && sdm.meta) {
      el('sdmAlgoList').querySelectorAll('input').forEach(i => { i.checked = algos.includes(i.value); });
      await sdmRun();
    }
  });
}

el('sdmExtent').addEventListener('change', () => { sdm.extentTouched = true; sdmExtentUI(); });
document.addEventListener('langchange', () => setTimeout(sdmExtentUI, 0));
document.addEventListener('selchange', () => { if (el('sdmExtent')) sdmExtentUI(); });

async function sdmPrepare() {
  clearMessages('sdmMessages');
  const keys = sdmSelectedKeys();
  if (keys.length < 2) { showMessage('sdmMessages', 'error', L2('Selecciona al menos 2 variables predictoras.', 'Select at least 2 predictor variables.')); return; }
  const files = (state.env && state.env.files) || {};
  const miss = keys.filter(k => !files[k]);
  if (miss.length) {
    showMessage('sdmMessages', 'error', L2('Faltan capas ráster: ' + miss.map(k => sdmCode(k, 'es')).join(', '),
      'Missing raster layers: ' + miss.map(k => sdmCode(k, 'en')).join(', ')));
    return;
  }
  const taxon = el('sdmTaxon').value;
  const recs = sdmRecords().filter(r => r.decimalLatitude != null && (!taxon || r.taxon === taxon));
  if (recs.length < 10) { showMessage('sdmMessages', 'error', L2('Se necesitan al menos 10 registros depurados (paso 3).', 'At least 10 cleaned records are needed (step 3).')); return; }
  const margin = Math.max(0, +el('sdmMargin').value || 0);
  const lons = recs.map(r => r.decimalLongitude), lats = recs.map(r => r.decimalLatitude);
  let bbox = { W: Math.max(-180, Math.min(...lons) - margin), E: Math.min(180, Math.max(...lons) + margin),
                 S: Math.max(-90, Math.min(...lats) - margin), N: Math.min(90, Math.max(...lats) + margin) };
  const extKind = el('sdmExtent').value, ext = sdmExtentBox(extKind, recs);
  if (extKind !== 'records' && !ext) { showMessage('sdmMessages', 'error', L2(extKind === 'country' ? 'No se pudo detectar un único país en los registros; elige otra extensión.' : 'La extensión personalizada no es válida.', extKind === 'country' ? 'A single country could not be detected in the records; choose another extent.' : 'The custom extent is not valid.')); return; }
  /* An extent chosen by hand is a deliberate decision: the grid is exactly that box, and the records outside it stay
     out of the model. Widening the box to hold them looks harmless until a handful of cultivated trees in another
     continent (the example has thirteen, in New Zealand, France and Austria) stretch the grid to the whole world. */
  let used = recs, outside = 0;
  if (ext) {
    bbox = ext;
    used = recs.filter(r => r.decimalLongitude >= ext.W && r.decimalLongitude <= ext.E && r.decimalLatitude >= ext.S && r.decimalLatitude <= ext.N);
    outside = recs.length - used.length;
    if (used.length < 10) {
      showMessage('sdmMessages', 'error', L2(`La extensión elegida deja solo ${used.length} registros dentro; elige otra extensión o amplía el recuadro.`,
        `The chosen extent leaves only ${used.length} records inside; choose another extent or widen the box.`));
      return;
    }
  }
  Object.assign(sdm, { extentKind: extKind, extentName: extentLabel(extKind), bbox });
  el('sdmPrepProgress').style.display = 'flex'; el('sdmPrepareBtn').disabled = true;
  try {
    const { stack, meta } = await sdmReadStack(keys, keys.map(k => ({ file: files[k], band: 0 })), bbox,
      Math.max(5000, +el('sdmMaxCells').value || 80000),
      (i, n, k) => setBar('sdmPrepFill', 'sdmPrepLabel', i / n,
        k == null ? null : T(`Leyendo capas… ${varCode(k)} (${i}/${n})`, `Reading layers… ${varCode(k)} (${i}/${n})`)));
    setBar('sdmPrepFill', 'sdmPrepLabel', 1, T('Preparando datos en Python…', 'Preparing the data in Python…')); await tick();
    await ensureSdmPy();
    const info = await sdmPyLock(() => runPyJSON('sdm_prepare(_meta, sdm_stack, _pres, _opts)', {
      sdm_stack: stack,
      _meta: JSON.stringify({ ...meta, ref: undefined }),
      _pres: JSON.stringify(used.map(r => ({ lon: r.decimalLongitude, lat: r.decimalLatitude }))),
      _opts: JSON.stringify({ dedupe: el('sdmDedupe').checked, radius: +el('sdmRadius').value || 300,
        nbg: +el('sdmNBg').value || 10000, seed: +el('sdmSeed').value || 42 }),
    }));
    /* the previous results no longer exist in Python: stop redrawing their figures */
    ['figSdmMetrics', 'figSdmRoc', 'figSdmImp', 'figSdmResp'].forEach(id => Views.drop(id));
    Object.assign(sdm, { keys, meta, run: [], cv: {}, final: {}, scenarios: [], folds: [], ensMetrics: null, ensParts: null, mapFitted: false,
      pres: info.pres_lon.map((lo, i) => [info.pres_lat[i], lo]) });
    sdmFutReset();
    sdmRefreshModelSelects();
    statTiles('sdmPrepSummary', [
      [sdmBi('Presencias usadas', 'Presences used'), fmtInt(info.n_presence)], [sdmBi('Puntos de fondo', 'Background points'), fmtInt(info.n_background)],
      [sdmBi('Malla', 'Grid'), `${meta.ncol} × ${meta.nrow}`], [sdmBi('Tamaño de celda', 'Cell size'), fmt(meta.dx * 111.32, 1) + ' km'],
      [sdmBi('Celdas de calibración', 'Calibration cells'), fmtInt(info.n_calib_cells)], [sdmBi('Predictoras', 'Predictors'), keys.length],
      [sdmBi('Extensión del mapa', 'Map extent'), sdm.extentName],
      [sdmBi('Recuadro (lon · lat)', 'Box (lon · lat)'), fmtBox(sdm.bbox)]]);
    sdmExtentWarn();
    if (outside) showMessage('sdmMessages', 'info', L2(`${outside} de ${recs.length} registros quedan fuera de la extensión <b>${esc(sdm.extentName)}</b> y no entran en el modelo.`,
      `${outside} of ${recs.length} records fall outside the extent <b>${esc(sdm.extentName)}</b> and do not enter the model.`));
    if (info.n_presence < info.n_records) {
      const d = info.n_records - info.n_presence;
      showMessage('sdmMessages', 'info', L2(`${d} de ${info.n_records} registros se descartaron (misma celda o fuera de la malla / sin dato).`,
        `${d} of ${info.n_records} records were discarded (same cell, or outside the grid / no data).`));
    }
    if (info.n_presence < 15) showMessage('sdmMessages', 'warning', L2('Pocas presencias (<15): los modelos serán inestables; usa el esquema de bloques con cautela.',
      'Few presences (<15): the models will be unstable; use the block scheme with caution.'));
    await sdmDrawDataMap(info);
    el('sdmSections').style.display = 'block'; el('sdmResults').style.display = 'none';
    showMessage('sdmMessages', 'success', L2('Datos listos. Elige algoritmos y valida los modelos más abajo.', 'Data ready. Choose algorithms and validate the models below.'));
  } catch (e) { console.error(e); showMessage('sdmMessages', 'error', L2('Error al preparar los datos: ', 'Error preparing the data: ') + sdmErr(e)); }
  finally { el('sdmPrepareBtn').disabled = false; }
}

/* Marker colours follow the colour theme (plain hex values, so that exports carry them). Drawing, legend, decoration and
   export of the two maps belong to the map studio. */
const sdmBgColor = () => cssVar('--text-muted', '#666666'), sdmPresColor = () => cssVar('--primary', '#2f7d4f'), sdmObsColor = () => '@ink';   // the map studio resolves it: dark ink on light maps, light ink on dark maps
const sdmMapHooks = () => ({ defaultTitle: () => state.query || '', fileName: () => sdmFileTag() });

function sdmDataItems() {
  const info = sdm.dataInfo; if (!info) return [];
  const bg = sdmBgColor(), pr = sdmPresColor();
  return [...info.bg_lon.map((lo, i) => ({ lat: info.bg_lat[i], lon: lo, c: bg, rm: 0.5 })),
    ...info.pres_lon.map((lo, i) => ({ lat: info.pres_lat[i], lon: lo, c: pr, tip: () => `${T('Presencia', 'Presence')}<br>${info.pres_lat[i].toFixed(4)}, ${lo.toFixed(4)}` }))];
}
function sdmRestyleDataMap() {
  if (!sdm.dataStudio) return;
  sdm.dataStudio.setData({ kind: 'fixed', items: sdmDataItems() });
}

async function sdmDrawDataMap(info) {
  el('sdmDataMapWrap').style.display = 'block';
  if (!sdm.dataMap) {
    sdm.dataMap = mapkit.makeBaseMap('mapSdmData');
    sdm.dataStudio = mapstudio.attach(sdm.dataMap, { kind: 'raster', hooks: sdmMapHooks() });
    sdm.dataStudio.setLegend(() => ({ title: T('Área de calibración', 'Calibration area'), kind: 'cat', items: [
      { color: sdmPresColor(), label: T('Presencias usadas', 'Presences used'), shape: 'point' },
      { color: sdmBgColor(), label: T('Muestra del fondo', 'Background sample'), shape: 'point' },
      { color: '#4c78a8', label: T('Área de calibración', 'Calibration area'), shape: 'square' }] }));
  }
  const m = sdm.dataMap;
  if (sdm.dataOverlay) m.removeLayer(sdm.dataOverlay);
  const mask = await pyf('sdm_get_mask');
  const ov = sdmOverlay(mask, sdm.meta, 'mask');
  sdm.dataOverlay = L.imageOverlay(ov.url, ov.bounds, { opacity: 1, interactive: false }).addTo(m);
  sdm.dataInfo = info; sdmRestyleDataMap();
  sdmFitSoon(m, () => sdm.dataOverlay && sdm.dataOverlay.getBounds(), v => { sdm.dataFitted = v; });
  setTimeout(() => m.invalidateSize(), 80);
}

/* ------------------------------------------------------------ run the models */
el('sdmRunBtn').addEventListener('click', sdmRun);

function sdmSelectedAlgos() { return [...el('sdmAlgoList').querySelectorAll('input:checked')].map(i => i.value); }
function sdmMaxentParams() {
  const cls = [...document.querySelectorAll('.sdmFc:checked')].map(i => i.value).join('') || 'l';
  return { classes: cls, regmult: +el('sdmRegmult').value || 1, nknots: +el('sdmKnots').value || 10 };
}
const avg = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN;
const sdv = a => { if (a.length < 2) return 0; const m = avg(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };

function sdmAggregate(rows) {
  const ok = rows.filter(r => !r.skipped);
  const g = k => ok.map(r => r[k]).filter(v => v != null && isFinite(v));
  const o = { n_folds: ok.length };
  ['auc', 'tss', 'boyce'].forEach(k => { const v = g(k === 'auc' ? 'auc_test' : k); o[k + '_mean'] = avg(v); o[k + '_sd'] = sdv(v); });
  ['sens', 'spec', 'or10', 'ormtp', 'auc_train'].forEach(k => { o[k + '_mean'] = avg(g(k)); });
  return o;
}

async function sdmRun() {
  if (!sdm.meta) { showMessage('sdmRunMessages', 'warning', L2('Prepara primero los datos del modelo.', 'Prepare the model data first.')); return; }
  clearMessages('sdmRunMessages');
  const algos = sdmSelectedAlgos();
  if (!algos.length) { showMessage('sdmRunMessages', 'error', L2('Elige al menos un algoritmo.', 'Choose at least one algorithm.')); return; }
  el('sdmRunProgress').style.display = 'flex'; el('sdmRunBtn').disabled = true;
  try {
    await ensureSdmPy();
    await pyf('sdm_reset_results');
    Object.assign(sdm, { scenarios: [], ensMetrics: null, ensParts: null, lastScn: null, mapFitted: false });
    sdmFutReset();
    el('sdmProjOut').style.display = 'none'; clearMessages('sdmProjMessages'); clearMessages('sdmEnsMessages');
    const scheme = el('sdmScheme').value;
    const part = JSON.parse(await pyf('sdm_partition', scheme, +el('sdmK').value || 4, +el('sdmSeed').value || 42));
    sdm.folds = part.folds;
    const prm = a => a === 'maxent' ? sdmMaxentParams() : {};
    const total = algos.length * (part.folds.length + 1); let done = 0;
    sdm.cv = {}; sdm.final = {}; sdm.run = [];
    for (const a of algos) {
      const rows = [];
      for (const f of part.folds) {
        setBar('sdmRunFill', 'sdmRunLabel', done / total,
          T(`${algoName(a)}: pliegue ${f + 1}/${part.folds.length}`, `${algoName(a)}: fold ${f + 1}/${part.folds.length}`)); await tick();
        rows.push(JSON.parse(await pyf('sdm_fit_fold', a, JSON.stringify(prm(a)), f))); done++;
      }
      setBar('sdmRunFill', 'sdmRunLabel', done / total,
        T(`${algoName(a)}: modelo final e importancia…`, `${algoName(a)}: final model and importance…`)); await tick();
      const fin = JSON.parse(await pyf('sdm_fit_final', a, JSON.stringify(prm(a)), true)); done++;
      sdm.cv[a] = { ...sdmAggregate(rows), folds: rows }; sdm.final[a] = fin; sdm.run.push(a);
    }
    setBar('sdmRunFill', 'sdmRunLabel', 1, T('Dibujando resultados…', 'Drawing the results…')); await tick();
    /* the section must be visible before the map is created, otherwise the map fits its bounds to a 0 × 0 container */
    el('sdmResults').style.display = 'block';
    await sdmRenderResults();
    showMessage('sdmRunMessages', 'success', L2(`${algos.length} algoritmo(s) ajustado(s) y validado(s).`, `${algos.length} algorithm(s) fitted and validated.`));
  } catch (e) { console.error(e); showMessage('sdmRunMessages', 'error', L2('Error al ejecutar los modelos: ', 'Error running the models: ') + sdmErr(e)); }
  finally { el('sdmRunBtn').disabled = false; }
}

/* ------------------------------------------------------------ metrics table */
const SDM_COLS = [
  { key: 'model', label: sdmBi('Modelo', 'Model') },
  { key: 'auc', label: sdmBi('AUC prueba', 'Test AUC') },
  { key: 'aucTrain', label: sdmBi('AUC entren.', 'Train AUC') },
  { key: 'tss', label: 'TSS' },
  { key: 'sens', label: sdmBi('Sens.', 'Sens.') },
  { key: 'spec', label: sdmBi('Espec.', 'Spec.') },
  { key: 'boyce', label: 'Boyce' },
  { key: 'or10', label: sdmBi('Omisión (P10)', 'Omission (P10)') },
  { key: 'thr', label: sdmBi('Umbral máx-TSS', 'Max-TSS threshold') },
  { key: 'detail', label: sdmBi('Detalle', 'Details') },
];

/* {es, en} description of the ensemble weights, e.g. "GLM 40%, Random forest 60%" */
function sdmEnsDesc() {
  if (!sdm.ensParts) return '';
  const part = lang => sdm.ensParts.map(([a, w]) => `${sdmName(a)[lang]} ${fmt(w * 100, 0)}%`).join(', ');
  return sdmBi(part('es'), part('en'));
}

/* rows of the metrics table; plain = true gives ASCII numbers (for the CSV), otherwise typographic ones */
function sdmMetricRows(plain) {
  const N = (v, d = 3) => plain ? ((v == null || !isFinite(v)) ? '—' : (+v).toFixed(d)) : fmt(v, d);
  const PM = (m, s, n) => (m == null || !isFinite(m)) ? '—' : (n < 2 ? N(m) : `${N(m)} ± ${N(s || 0)}`);
  const rows = sdm.run.map(a => {
    const c = sdm.cv[a], f = sdm.final[a];
    let detail = '';
    if (a === 'maxent') detail = sdmBi(`clases ${f.classes}; ${f.n_params} parám.; AICc ${N(f.aicc, 1)}`, `classes ${f.classes}; ${f.n_params} params; AICc ${N(f.aicc, 1)}`);
    else if (a === 'brt') detail = sdmBi(`${f.n_iter} iteraciones`, `${f.n_iter} iterations`);
    return { key: a, model: sdmName(a), auc: PM(c.auc_mean, c.auc_sd, c.n_folds), aucTrain: N(f.auc_train), tss: PM(c.tss_mean, c.tss_sd, c.n_folds),
      sens: N(c.sens_mean, 2), spec: N(c.spec_mean, 2), boyce: PM(c.boyce_mean, c.boyce_sd, c.n_folds), or10: N(c.or10_mean, 2),
      thr: N(f.thr.maxtss), detail };
  });
  if (sdm.ensMetrics) {
    const c = sdm.ensMetrics;
    rows.push({ key: 'ensemble', model: sdmName('ensemble'), auc: PM(c.auc_mean, c.auc_sd, c.n_folds), aucTrain: N(c.auc_train), tss: PM(c.tss_mean, c.tss_sd, c.n_folds),
      sens: '—', spec: '—', boyce: PM(c.boyce_mean, c.boyce_sd, c.n_folds), or10: '—', thr: N(c.thr.maxtss), detail: sdmEnsDesc() });
  }
  return rows;
}

/* cross-validation summary handed to the metrics chart */
function sdmCvForFig() {
  const pick = c => ({ auc_mean: c.auc_mean, auc_sd: c.auc_sd, tss_mean: c.tss_mean, tss_sd: c.tss_sd, boyce_mean: c.boyce_mean, boyce_sd: c.boyce_sd });
  const cv = {}; sdm.run.forEach(a => { cv[a] = pick(sdm.cv[a]); });
  if (sdm.ensMetrics) cv.ensemble = pick(sdm.ensMetrics);
  return cv;
}
const sdmMetricsFig = () => showFig('figSdmMetrics', () => `fig_sdm_metrics(${sdmPyJSON(sdmCvForFig())})`);

async function sdmRenderResults() {
  buildTable('sdmMetricsTable', SDM_COLS, sdmMetricRows());
  await sdmMetricsFig();
  await showFig('figSdmRoc', 'fig_sdm_roc()');
  await showFig('figSdmImp', 'fig_sdm_importance()');
  await showFig('figSdmResp', () => `fig_sdm_response(${sdmPyJSON(sdm.run)})`);
  /* ensemble: candidate list */
  const eb = el('sdmEnsList'); eb.innerHTML = '';
  sdm.run.forEach(a => { const l = document.createElement('label'); l.className = 'checkbox-label';
    l.innerHTML = `<input type="checkbox" value="${a}" checked> ${algoL2(a)} <span class="hint" style="margin:0">(AUC ${fmt(sdm.cv[a].auc_mean, 2)})</span>`; eb.appendChild(l); });
  sdmRefreshModelSelects();
  await sdmShowMap();
  await sdmRenderAreaTable();
}

/* the model and scenario selects hold text drawn with T(): they are rebuilt on 'langchange' */
function sdmRefreshModelSelects() {
  const models = sdm.run.concat(sdm.ensMetrics ? ['ensemble'] : []);
  [el('sdmMapModel'), el('sdmChangeModel')].forEach(sel => {
    const cur = sel.value; sel.innerHTML = '';
    models.slice().reverse().forEach(m => sel.add(new Option(algoName(m), m)));
    if (models.includes(cur)) sel.value = cur;
  });
  const sc = el('sdmMapScn'), cur = sc.value; sc.innerHTML = ''; sc.add(new Option(T('Presente', 'Present'), ''));
  sdm.scenarios.forEach(s => sc.add(new Option(s, s))); if (sdm.scenarios.includes(cur)) sc.value = cur;
  const fs = el('sdmFutMapScn');
  if (fs) { const c2 = fs.value; fs.innerHTML = ''; sdm.scenarios.forEach(s => fs.add(new Option(s, s))); if (sdm.scenarios.includes(c2)) fs.value = c2; }
}

/* default scenario name in the active language (only while the user has not typed another one) */
function sdmSyncScnName() {
  const i = el('sdmScnName');
  if (i && (i.value === 'Futuro' || i.value === 'Future')) i.value = T('Futuro', 'Future');
}
sdmSyncScnName();

document.addEventListener('langchange', () => {
  if (el('sdmTaxon').options.length) sdmFillTaxon();
  sdmRefreshModelSelects();
  sdmSyncScnName();
});
document.addEventListener('themechange', () => { sdmRestyleDataMap(); sdmRestylePresences(); });

el('sdmDlMetrics').addEventListener('click', () => {
  downloadBlob(toCSV(SDM_COLS, sdmMetricRows(true)), slugName(state.query) + '_SDM_metrics.csv', 'text/csv;charset=utf-8');
});
el('sdmDlCoefs').addEventListener('click', async () => {
  const t = await pyf('sdm_maxent_coefs');
  if (!t) { showMessage('sdmRunMessages', 'warning', L2('El modelo tipo MaxEnt no se ha ajustado.', 'The MaxEnt-style model has not been fitted.')); return; }
  const kinds = { l: T('lineal', 'linear'), q: T('cuadrática', 'quadratic'), p: T('producto', 'product'), hf: T('bisagra ↗', 'hinge ↗'), hr: T('bisagra ↘', 'hinge ↘') };
  const rows = JSON.parse(t).map(r => [kinds[r.kind], varCode(r.var), r.var2 ? varCode(r.var2) : '', r.knot.toFixed(3), String(+r.coef.toPrecision(6))]);
  const head = T('característica,variable,variable2,nudo,coeficiente', 'feature,variable,variable2,knot,coefficient');
  downloadBlob(String.fromCharCode(0xFEFF) + [head, ...rows.map(r => r.map(csvEscape).join(','))].join('\n'),
    slugName(state.query) + '_MaxEnt_style_coefficients.csv', 'text/csv;charset=utf-8');
});

/* ------------------------------------------------------------ explore the MaxEnt-style model (feature classes × regularisation) */
el('sdmTuneBtn').addEventListener('click', async () => {
  if (!sdm.meta) { showMessage('sdmRunMessages', 'warning', L2('Prepara primero los datos del modelo.', 'Prepare the model data first.')); return; }
  showSpinner(T('Explorando el modelo tipo MaxEnt…', 'Exploring the MaxEnt-style model…'));
  try {
    await ensureSdmPy();
    await pyf('sdm_partition', el('sdmScheme').value, +el('sdmK').value || 4, +el('sdmSeed').value || 42, true);
    const combos = []; ['lq', 'lqh', 'lqhp'].forEach(c => [0.5, 1, 2, 4].forEach(r => combos.push([c, r])));
    const rows = [];
    for (let i = 0; i < combos.length; i++) {
      setSpinner(T(`Tipo MaxEnt: clases ${combos[i][0].toUpperCase()} · reg ${combos[i][1]} (${i + 1}/${combos.length})`,
        `MaxEnt-style: classes ${combos[i][0].toUpperCase()} · reg ${combos[i][1]} (${i + 1}/${combos.length})`)); await tick();
      rows.push(JSON.parse(await pyf('sdm_tune_one', combos[i][0], combos[i][1], +el('sdmKnots').value || 10)));
    }
    /* AICc may be missing (too few presences for the number of parameters): such rows go last */
    const fin = rows.filter(r => r.aicc != null), minA = fin.length ? Math.min(...fin.map(r => r.aicc)) : NaN;
    rows.forEach(r => { r.dAICc = (r.aicc != null && isFinite(minA)) ? r.aicc - minA : null; });
    const bestAuc = rows.reduce((b, r) => (r.auc_test != null && (b.auc_test == null || r.auc_test > b.auc_test)) ? r : b, rows[0]);
    rows.sort((a, b) => (a.dAICc == null ? Infinity : a.dAICc) - (b.dAICc == null ? Infinity : b.dAICc));
    buildTable('sdmTuneTable', [
      { key: 'classes', label: sdmBi('Clases', 'Classes'), get: r => r.classes.toUpperCase() }, { key: 'regmult', label: sdmBi('Regularización', 'Regularisation') },
      { key: 'auc_test', label: sdmBi('AUC prueba', 'Test AUC'), get: r => fmt(r.auc_test) },
      { key: 'auc_diff', label: sdmBi('ΔAUC (entren.−prueba)', 'ΔAUC (train − test)'), get: r => fmt(r.auc_diff) },
      { key: 'or10', label: sdmBi('Omisión P10', 'Omission P10'), get: r => fmt(r.or10, 2) }, { key: 'n_params', label: sdmBi('Parámetros', 'Parameters') },
      { key: 'dAICc', label: 'ΔAICc', get: r => fmt(r.dAICc, 1) }], rows);
    const lo = rows[0];
    showMessage('sdmRunMessages', 'info', L2(
      `Mejor AUC de prueba: clases ${bestAuc.classes.toUpperCase()} con regularización ${bestAuc.regmult}; menor AICc: clases ${lo.classes.toUpperCase()} con regularización ${lo.regmult}. Ajusta los controles del modelo tipo MaxEnt y ejecuta los modelos.`,
      `Best test AUC: classes ${bestAuc.classes.toUpperCase()} with regularisation ${bestAuc.regmult}; lowest AICc: classes ${lo.classes.toUpperCase()} with regularisation ${lo.regmult}. Adjust the MaxEnt-style controls and run the models.`));
  } catch (e) { console.error(e); showMessage('sdmRunMessages', 'error', L2('Error al explorar el modelo tipo MaxEnt: ', 'Error exploring the MaxEnt-style model: ') + sdmErr(e)); }
  finally { hideSpinner(); }
});

/* ------------------------------------------------------------ ensemble */
el('sdmEnsBtn').addEventListener('click', async () => {
  clearMessages('sdmEnsMessages');
  const minAuc = +el('sdmEnsMinAuc').value || 0;
  const chosen = [...el('sdmEnsList').querySelectorAll('input:checked')].map(i => i.value).filter(a => (sdm.cv[a].auc_mean || 0) >= minAuc);
  if (!chosen.length) { showMessage('sdmEnsMessages', 'error', L2(`Ningún modelo seleccionado alcanza AUC ≥ ${minAuc}.`, `No selected model reaches AUC ≥ ${minAuc}.`)); return; }
  showSpinner(T('Construyendo el ensamble…', 'Building the ensemble…'));
  try {
    const cv = {}; chosen.forEach(a => { cv[a] = sdm.cv[a]; });
    const r = JSON.parse(await pyf('sdm_ensemble', JSON.stringify(chosen), el('sdmEnsMethod').value, el('sdmEnsWeight').value, JSON.stringify(cv)));
    sdm.ensMetrics = r; sdm.final.ensemble = { thr: r.thr, auc_train: r.auc_train };
    sdm.ensParts = chosen.map((a, i) => [a, r.weights[i]]);
    const d = sdmEnsDesc();
    /* the scenario ensembles of the future section were built from the old surfaces: they are dropped so they get rebuilt */
    await futDropStaleGroups();
    sdmRefreshModelSelects(); el('sdmMapModel').value = 'ensemble';
    buildTable('sdmMetricsTable', SDM_COLS, sdmMetricRows());
    await sdmMetricsFig();
    showMessage('sdmEnsMessages', 'success', L2(`Ensamble de ${chosen.length} modelo(s): ${d.es}. AUC de prueba ${fmt(r.auc_mean)}, TSS ${fmt(r.tss_mean)}.`,
      `Ensemble of ${chosen.length} model(s): ${d.en}. Test AUC ${fmt(r.auc_mean)}, TSS ${fmt(r.tss_mean)}.`));
    await sdmShowMap(); await sdmRenderAreaTable();
    if (sdm.fut.scn.some(s => s.status === 'done')) await futRenderAll();
  } catch (e) { console.error(e); showMessage('sdmEnsMessages', 'error', L2('Error en el ensamble: ', 'Ensemble error: ') + sdmErr(e)); }
  finally { hideSpinner(); }
});

/* ------------------------------------------------------------ maps */
const hex2rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mercY = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
const mercInv = y => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI;
const MAGMA = ['#000004', '#3b0f70', '#8c2981', '#de4968', '#fe9f6d', '#fcfdbf'];
const lut = (ramp, n = 256) => Array.from({ length: n }, (_, i) => hex2rgb(mapkit.rampColor(ramp, i / (n - 1))));
/* The ramp of the continuous maps comes from the map studio; its default ("suit") starts at white, so zero suitability is
   white. The uncertainty map keeps magma while the default ramp is selected. "Lowest class in white" applies to any ramp. */
const sdmRampFor = mode => {
  const s = sdm.studio && sdm.studio.style;
  if (!s) return mode === 'sd' ? MAGMA : mapstudio.rampStops('suit');
  if (mode === 'sd' && s.ramp === 'suit' && !s.rampRev) return s.whiteMin ? mapstudio.whiteFirst(MAGMA) : MAGMA;
  return sdm.studio.rampStops();
};

/* Turns a grid (row 0 = north) into an image, resampled to rows evenly spaced in Mercator so that the
   cells line up with the base map. */
/* Discrete colours of the two categorical maps of the future section (plain hex, so the exports carry them).
   Agreement: 0 %, 1–33 %, 34–66 %, 67–99 %, 100 % of the scenarios calling the cell suitable. */
const SDM_AGREE_COL = ['#eeeeee', '#c6dbef', '#6baed6', '#2171b5', '#08306b'];
const sdmAgreeClass = v => v <= 0 ? 0 : v < 34 ? 1 : v < 67 ? 2 : v < 99.999 ? 3 : 4;
const SDM_REF_COL = { 0: '#e1e1e1', 1: '#2f7d4f', 2: '#e45756', 3: '#4c78a8', 4: '#e0ac2b' };

function sdmOverlay(values, meta, mode, opt = {}) {
  const { nrow, ncol, west, north, dx, dy } = meta, south = north - nrow * dy, east = west + ncol * dx;
  const yN = mercY(north), yS = mercY(south), k = (yN - yS) / ((north - south) * Math.PI / 180);
  const outH = Math.max(nrow, Math.min(3000, Math.ceil(nrow * k)));
  const cv = document.createElement('canvas'); cv.width = ncol; cv.height = outH;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(ncol, outH), d = img.data;
  const sdMax = opt.sdMax || 0.5, LUT = mode === 'cont' || mode === 'sd' ? lut(sdmRampFor(mode)) : null;
  /* opt.novel: a MESS surface; the cells with MESS < 0 (outside the calibrated range) are hatched in dark ink */
  const NOV = opt.novel || null, AG = SDM_AGREE_COL.map(hex2rgb), RF = {};
  Object.keys(SDM_REF_COL).forEach(kk => { RF[kk] = hex2rgb(SDM_REF_COL[kk]); });
  for (let r = 0; r < outH; r++) {
    const lat = mercInv(yN - (r + 0.5) / outH * (yN - yS));
    const i = Math.min(nrow - 1, Math.max(0, Math.floor((north - lat) / dy)));
    for (let c = 0; c < ncol; c++) {
      const v = values[i * ncol + c], p = (r * ncol + c) * 4; let rgb = null, a = 0;
      if (mode === 'mask') { if (v === 1) { rgb = [76, 120, 168]; a = 70; } else if (v === 0) { rgb = [200, 200, 200]; a = 25; } }
      else if (mode === 'cont') { if (isFinite(v)) { rgb = LUT[Math.max(0, Math.min(255, Math.round(v * 255)))]; a = 235; } }
      else if (mode === 'sd') { if (isFinite(v)) { rgb = LUT[Math.max(0, Math.min(255, Math.round(v / sdMax * 255)))]; a = 235; } }
      else if (mode === 'bin') { if (isFinite(v)) { if (v >= opt.thr) { rgb = [47, 125, 79]; a = 215; } else { rgb = [225, 225, 225]; a = 70; } } }
      else if (mode === 'change') { if (v === 1) { rgb = [76, 120, 168]; a = 215; } else if (v === 2) { rgb = [84, 162, 75]; a = 230; } else if (v === 3) { rgb = [228, 87, 86]; a = 230; } else if (v === 0) { rgb = [225, 225, 225]; a = 60; } }
      else if (mode === 'agree') { if (isFinite(v)) { const g = sdmAgreeClass(v); rgb = AG[g]; a = g === 0 ? 70 : 230; } }
      else if (mode === 'refugia') { const h = RF[v]; if (h) { rgb = h; a = v === 0 ? 60 : 230; } }
      else if (mode === 'mess') { if (isFinite(v)) { if (v < 0) { const t = Math.min(1, -v / 100); rgb = [228, 87 + (1 - t) * 90, 86 + (1 - t) * 90]; a = 235; } else { rgb = [220, 230, 245]; a = Math.round(40 + Math.min(1, v / 100) * 60); } } }
      /* the hatch keeps the weight of what is under it: faint over the background, solid over a class */
      if (rgb && NOV) { const nv = NOV[i * ncol + c]; if (isFinite(nv) && nv < 0 && (r + c) % 6 === 0) { rgb = [26, 26, 26]; a = a <= 80 ? 105 : Math.max(a, 205); } }
      if (rgb) { d[p] = rgb[0]; d[p + 1] = rgb[1]; d[p + 2] = rgb[2]; d[p + 3] = a; }
    }
  }
  /* Outline of the modelled area. Where suitability is near zero the ramp paints white, which over a pale base map
     looks like missing data; a thin edge along the boundary of the cells that do have a value makes it clear that
     the whole region was modelled. */
  if (opt.edge !== false && mode !== 'mask') {
    const has = new Uint8Array(ncol * outH);
    for (let i = 0, p = 3; i < has.length; i++, p += 4) has[i] = d[p] > 0 ? 1 : 0;
    const ink = hex2rgb(cssVar('--text', '#14261d')), A = 150;
    for (let r = 0; r < outH; r++) for (let c = 0; c < ncol; c++) {
      const i = r * ncol + c;
      if (!has[i]) continue;
      const border = (c === 0 || !has[i - 1]) || (c === ncol - 1 || !has[i + 1]) ||
                     (r === 0 || !has[i - ncol]) || (r === outH - 1 || !has[i + ncol]);
      if (!border) continue;
      const p = i * 4;
      d[p] = Math.round(d[p] * (1 - A / 255) + ink[0] * A / 255);
      d[p + 1] = Math.round(d[p + 1] * (1 - A / 255) + ink[1] * A / 255);
      d[p + 2] = Math.round(d[p + 2] * (1 - A / 255) + ink[2] * A / 255);
      d[p + 3] = Math.max(d[p + 3], 200);
    }
  }
  ctx.putImageData(img, 0, 0);
  return { url: cv.toDataURL('image/png'), bounds: [[south, west], [north, east]] };
}

/* Keeps trying to fit until the container has been laid out (the card is often still being shown). */
function sdmFitSoon(map, boundsFn, mark) {
  let tries = 0;
  const go = () => {
    if (sdmFitMap(map, boundsFn())) { mark(true); return; }
    if (++tries < 8) setTimeout(go, 150 * tries);
  };
  setTimeout(go, 60);
}

/* Fits a map to the data only when its container really has a size; returns whether it could. */
function sdmFitMap(map, bounds) {
  const c = map.getContainer();
  if (!c || !c.clientWidth || !c.clientHeight || !bounds) return false;
  map.invalidateSize();
  map.fitBounds(bounds, { animate: false });
  return true;
}

function sdmEnsureMap() {
  if (sdm.map) return;
  sdm.map = mapkit.makeBaseMap('mapSdm'); sdm.map.createPane('sdmPane').style.zIndex = 350;
  sdm.studio = mapstudio.attach(sdm.map, { kind: 'raster', legendPanel: el('sdmLegend'), hooks: { ...sdmMapHooks(), onChange: key => sdmRecolour(key) } });
}
/* a change of ramp repaints the overlay (the colours are baked into its image) */
async function sdmRecolour(key) {
  if (!['ramp', 'rampRev', 'preset'].includes(key) || !sdm.lastView || !sdm.map) return;
  const v = sdm.lastView;
  showSpinner(T('Dibujando mapa…', 'Drawing the map…'));
  try { await sdmShowMap(v.type === 'change' || v.type === 'mess' ? v : undefined); } finally { hideSpinner(); }
}
/* presences of the result map (colour follows the theme) */
function sdmRestylePresences() {
  if (!sdm.studio) return;
  const c = sdmObsColor();
  sdm.studio.setData({ kind: 'fixed', items: sdm.pres.map(p => ({ lat: p[0], lon: p[1], c, tip: () => `${T('Presencia', 'Presence')}<br>${p[0].toFixed(4)}, ${p[1].toFixed(4)}` })) });
  sdm.studio.showData(el('sdmShowPts').checked);
}
/* colour patches of a categorical legend */
const sdmSwatch = (color, label) => ({ color, label, shape: 'square' });

async function sdmShowMap(forced) {
  if (!sdm.meta || !sdm.run.length) return;
  sdmEnsureMap();
  let model = el('sdmMapModel').value || sdm.run[0], type = forced ? forced.type : el('sdmMapType').value;
  let scn = el('sdmMapScn').value;
  const kind = el('sdmThrKind').value;
  if (forced && forced.scn !== undefined) scn = forced.scn;
  const grp = sdmGroupOf(scn);
  /* a scenario ensemble only holds the model it was built with */
  if (grp && grp.builtModel && type !== 'sd' && !FUT_GROUP_VIEWS.has(type)) model = grp.builtModel;
  if (type === 'sd' && !sdm.ensMetrics && !grp) {
    showMessage('sdmEnsMessages', 'info', L2('El mapa de incertidumbre requiere construir primero el ensamble.', 'The uncertainty map requires building the ensemble first.'));
    type = 'cont'; el('sdmMapType').value = 'cont';
  }
  if (type === 'sd' && !grp) model = 'ensemble';
  const nov = await sdmNovelArray(scn, type);
  let arr, ov, legend;   // legend: function returning the legend model (evaluated at every draw, so it follows language and ramp)
  if (forced && forced.type === 'change') {
    arr = await pyf('sdm_get_change', forced.scn, forced.model); ov = sdmOverlay(arr, sdm.meta, 'change', { novel: nov });
    legend = () => ({ title: T('Cambio de área idónea', 'Change in suitable area') + ' · ' + algoName(forced.model) + ' · ' + forced.scn, kind: 'cat', items: [
      sdmSwatch('#4c78a8', T('Estable idónea', 'Stable suitable')), sdmSwatch('#54a24b', T('Ganancia', 'Gain')),
      sdmSwatch('#e45756', T('Pérdida', 'Loss')), sdmSwatch('#e1e1e1', T('Estable no idónea', 'Stable unsuitable'))].concat(sdmNovelSwatch(nov)),
      note: futDispNote() });
  } else if (forced && forced.type === 'mess') {
    arr = await pyf('sdm_get_mess', forced.scn); ov = sdmOverlay(arr, sdm.meta, 'mess');
    legend = () => ({ title: T('MESS · similitud ambiental con el área de calibración', 'MESS · environmental similarity to the calibration area'), kind: 'cat', items: [
      sdmSwatch('#e45756', T('Negativo = clima sin análogo (extrapolación)', 'Negative = no-analogue climate (extrapolation)')),
      sdmSwatch('#dce6f5', T('Positivo = dentro del rango calibrado', 'Positive = within the calibrated range'))] });
  } else if (forced && forced.type === 'agree') {
    arr = await pyf('sdm_get_layer', forced.scn, 'agree'); ov = sdmOverlay(arr, sdm.meta, 'agree', { novel: nov });
    legend = () => ({ title: T('Acuerdo entre escenarios', 'Agreement between scenarios') + ' · ' + forced.scn, kind: 'cat',
      unit: T('% de escenarios que la declaran idónea', '% of scenarios calling it suitable'),
      items: [sdmSwatch(SDM_AGREE_COL[4], '100 %'), sdmSwatch(SDM_AGREE_COL[3], '67–99 %'), sdmSwatch(SDM_AGREE_COL[2], '34–66 %'),
        sdmSwatch(SDM_AGREE_COL[1], '1–33 %'), sdmSwatch(SDM_AGREE_COL[0], '0 %')].concat(sdmNovelSwatch(nov)) });
  } else if (forced && forced.type === 'cons') {
    arr = await pyf('sdm_get_layer', forced.scn, 'cons'); ov = sdmOverlay(arr, sdm.meta, 'bin', { thr: 0.5, novel: nov });
    const lvl = grp ? grp.agree : 66;
    legend = () => ({ title: T('Consenso binario', 'Binary consensus') + ' · ' + forced.scn, kind: 'cat', items: [
      sdmSwatch('#2f7d4f', T(`Idóneo con acuerdo ≥ ${lvl} %`, `Suitable with agreement ≥ ${lvl} %`)),
      sdmSwatch('#e1e1e1', T('Sin consenso', 'No consensus'))].concat(sdmNovelSwatch(nov)) });
  } else if (forced && forced.type === 'refugia') {
    arr = await pyf('sdm_get_refugia'); ov = sdmOverlay(arr, sdm.meta, 'refugia');
    legend = () => ({ title: T('Refugios climáticos y riesgo', 'Climatic refugia and risk'), kind: 'cat',
      items: FUT_REF_CLASSES.map(c => sdmSwatch(c.color, T(c.legend.es, c.legend.en))),
      note: T('Comparación del presente con todos los escenarios proyectados', 'Comparison of the present with every projected scenario') });
  } else if (forced && forced.type === 'sdscn') {
    arr = await pyf('sdm_get_layer', forced.scn, 'sd'); let mx = 0; for (const v of arr) if (isFinite(v) && v > mx) mx = v;
    ov = sdmOverlay(arr, sdm.meta, 'sd', { sdMax: Math.max(mx, 0.02), novel: nov });
    legend = () => ({ title: T('Desviación entre modelos climáticos', 'Spread between climate models') + ' · ' + forced.scn,
      unit: T('DE de la idoneidad', 'SD of suitability'), kind: 'grad', stops: sdmRampFor('sd'),
      ticks: [{ t: 0, label: '0' }, { t: 0.5, label: fmt(mx / 2, 2) }, { t: 1, label: fmt(mx, 2) }],
      note: T('Más alto = mayor desacuerdo entre modelos de circulación', 'Higher = more disagreement between circulation models') });
  } else if (type === 'sd') {
    arr = grp ? await pyf('sdm_get_layer', scn, 'sd') : await pyf('sdm_get_pred', 'ensemble_sd', scn);
    let mx = 0; for (const v of arr) if (isFinite(v) && v > mx) mx = v;
    ov = sdmOverlay(arr, sdm.meta, 'sd', { sdMax: Math.max(mx, 0.05), novel: nov });
    legend = () => ({ title: (grp ? T('Desviación entre modelos climáticos', 'Spread between climate models') : T('Dispersión entre modelos', 'Spread between models')) + (scn ? ' · ' + scn : ''),
      unit: T('DE de idoneidades normalizadas', 'SD of normalised suitabilities'), kind: 'grad', stops: sdmRampFor('sd'),
      ticks: [{ t: 0, label: '0' }, { t: 0.5, label: fmt(mx / 2, 2) }, { t: 1, label: fmt(mx, 2) }],
      note: grp ? T('Más alto = mayor desacuerdo entre modelos de circulación', 'Higher = more disagreement between circulation models')
        : T('Más alto = mayor desacuerdo entre algoritmos', 'Higher = more disagreement between algorithms') });
  } else if (type === 'bin') {
    arr = await pyf('sdm_get_pred', model, scn); const thr = await pyf('sdm_thr', model, kind);
    ov = sdmOverlay(arr, sdm.meta, 'bin', { thr, novel: nov });
    legend = () => ({ title: T('Presencia / ausencia', 'Presence / absence') + ' · ' + algoName(model) + (scn ? ' · ' + scn : ''), kind: 'cat', items: [
      sdmSwatch('#2f7d4f', T(`Idóneo (≥ ${fmt(thr)})`, `Suitable (≥ ${fmt(thr)})`)), sdmSwatch('#e1e1e1', T('No idóneo', 'Not suitable'))].concat(sdmNovelSwatch(nov)) });
  } else {
    arr = await pyf('sdm_get_pred', model, scn); ov = sdmOverlay(arr, sdm.meta, 'cont', { novel: nov });
    const note = () => model === 'maxent' ? T('Salida cloglog del modelo tipo MaxEnt', 'Cloglog output of the MaxEnt-style model')
      : model === 'ensemble' ? T('Idoneidades normalizadas (0–1)', 'Normalised suitabilities (0–1)') : T('Escala propia de cada algoritmo', "Each algorithm's own scale");
    legend = () => ({ title: T('Idoneidad', 'Suitability') + ' · ' + algoName(model) + (scn ? ' · ' + scn : ''), kind: 'grad', stops: sdmRampFor('cont'),
      ticks: [{ t: 0, label: T('0 (baja)', '0 (low)') }, { t: 0.5, label: '0.5' }, { t: 1, label: T('1 (alta)', '1 (high)') }], note: note() });
  }
  if (sdm.overlay) sdm.map.removeLayer(sdm.overlay);
  sdm.overlay = L.imageOverlay(ov.url, ov.bounds, { opacity: +el('sdmOpacity').value, interactive: false, pane: 'sdmPane' }).addTo(sdm.map);
  sdmRestylePresences();
  if (!sdm.mapFitted) sdmFitSoon(sdm.map, () => sdm.overlay && sdm.overlay.getBounds(), v => { sdm.mapFitted = v; });
  setTimeout(() => sdm.map.invalidateSize(), 60);
  sdm.studio.setLegend(legend);
  sdm.lastView = forced ? { model, scn, kind, ...forced } : { type, model, scn, kind };
}
['sdmMapModel', 'sdmMapType', 'sdmMapScn', 'sdmThrKind'].forEach(id => el(id).addEventListener('change', async () => {
  showSpinner(T('Dibujando mapa…', 'Drawing the map…'));
  try {
    await sdmShowMap();
    /* the threshold feeds the areas and the whole future section, which are recomputed here (never in a
       second listener, so two chains of Python calls never overlap) */
    if (id === 'sdmThrKind') { await sdmRenderAreaTable(); await futRefresh(); }
  } finally { hideSpinner(); }
}));
el('sdmOpacity').addEventListener('input', () => { if (sdm.overlay) sdm.overlay.setOpacity(+el('sdmOpacity').value); });
el('sdmShowPts').addEventListener('change', () => { if (sdm.studio) sdm.studio.showData(el('sdmShowPts').checked); });

async function sdmRenderAreaTable() {
  const kind = el('sdmThrKind').value;
  const rows = JSON.parse(await pyf('sdm_area_table', kind));
  const cols = [{ key: 'name', label: sdmBi('Modelo', 'Model'), get: r => sdmName(r.name) }, { key: 'thr', label: sdmBi('Umbral', 'Threshold'), get: r => fmt(r.thr) },
    { key: 'present', label: sdmBi('Presente (km²)', 'Present (km²)'), get: r => fmtInt(r.present) }]
    .concat(sdm.scenarios.map(s => ({ key: s, label: s + ' (km²)', get: r => r.scn[s] == null ? '—' : fmtInt(r.scn[s]) })));
  buildTable('sdmAreaTable', cols, rows);
}

/* exports */
/* file name: species + model + kind of map + scenario, so a whole batch of exports stays sorted */
function sdmFileTag() {
  const v = sdm.lastView;
  if (!v) return slugName(state.query) + '_sdm';
  const p = [slugName(state.query)];
  if (v.type === 'sd' || v.type === 'sdscn') p.push('sd');
  else {
    if (v.model && !FUT_GROUP_VIEWS.has(v.type)) p.push(v.model);
    if (v.type && v.type !== 'cont') p.push(v.type);
  }
  if (v.scn) p.push(slugName(v.scn));
  return p.join('_');
}
const sdmNeedSuitMap = () => showMessage('sdmEnsMessages', 'info', L2('Muestra primero un mapa (idoneidad, cambio, acuerdo o refugios).', 'First show a map (suitability, change, agreement or refugia).'));
/* quick export with the settings chosen in the map studio (title, legend, arrow and the model layer are included) */
el('sdmMapPng').addEventListener('click', () => { if (sdm.studio && sdm.lastView) sdm.studio.exportNow(); else sdmNeedSuitMap(); });

/* The array behind the map that is on screen, whatever its kind, plus how it must be written out.
   nd255: the categorical maps use 255 as no-data; thr: a binary map is written as 0 / 1. */
async function sdmCurrentArray() {
  const v = sdm.lastView; if (!v) return null;
  if (v.type === 'change') return { arr: await pyf('sdm_get_change', v.scn, v.model), int: true, nd255: true };
  if (v.type === 'refugia') return { arr: await pyf('sdm_get_refugia'), int: true, nd255: true };
  if (v.type === 'agree') return { arr: await pyf('sdm_get_layer', v.scn, 'agree'), int: false };
  if (v.type === 'cons') return { arr: await pyf('sdm_get_layer', v.scn, 'cons'), int: true };
  if (v.type === 'sdscn') return { arr: await pyf('sdm_get_layer', v.scn, 'sd'), int: false };
  if (v.type === 'mess') return { arr: await pyf('sdm_get_mess', v.scn), int: false };
  if (!v.model) return null;
  const arr = await pyf('sdm_get_pred', v.type === 'sd' ? 'ensemble_sd' : v.model, v.scn || '');
  if (v.type === 'bin') return { arr, int: true, thr: await pyf('sdm_thr', v.model, v.kind) };
  return { arr, int: false };
}
/* Float32 copy with −9999 where there is no data (both the GeoTIFF and the ASCII grid use it) */
function sdmExportValues(o) {
  const n = o.arr.length, out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = o.arr[i];
    out[i] = o.nd255 ? (v === 255 ? -9999 : v) : !isFinite(v) ? -9999 : o.thr != null ? (v >= o.thr ? 1 : 0) : v;
  }
  return out;
}
function sdmAscText(vals, int) {
  const m = sdm.meta, south = m.north - m.nrow * m.dy, rows = [];
  for (let r = 0; r < m.nrow; r++) {
    const p = [];
    for (let c = 0; c < m.ncol; c++) { const v = vals[r * m.ncol + c]; p.push(v === -9999 ? '-9999' : int ? String(Math.round(v)) : v.toFixed(5)); }
    rows.push(p.join(' '));
  }
  return `ncols ${m.ncol}\nnrows ${m.nrow}\nxllcorner ${m.west.toFixed(8)}\nyllcorner ${south.toFixed(8)}\n` +
    `cellsize ${m.dx.toFixed(10)}\nNODATA_value -9999\n` + rows.join('\n') + '\n';
}
async function sdmExportGrid(fmtKind) {
  const o = await sdmCurrentArray();
  if (!o) { sdmNeedSuitMap(); return; }
  const vals = sdmExportValues(o), m = sdm.meta;
  if (fmtKind === 'asc') downloadBlob(sdmAscText(vals, o.int), sdmFileTag() + '.asc', 'text/plain;charset=utf-8');
  else downloadBlob(new Blob([sdmEncodeGeoTiff(vals, m.ncol, m.nrow, m.west, m.north, m.dx, m.dy)], { type: 'image/tiff' }), sdmFileTag() + '.tif');
}
el('sdmMapAsc').addEventListener('click', async () => {
  try { await sdmExportGrid('asc'); }
  catch (e) { console.error(e); showMessage('sdmEnsMessages', 'error', L2('No se pudo escribir la malla: ', 'The grid could not be written: ') + sdmErr(e)); }
});
/* Minimal GeoTIFF: one uncompressed Float32 band, EPSG:4326, NoData −9999 (readable by common GIS software). */
function sdmEncodeGeoTiff(values, w, h, west, north, dx, dy, nodata = -9999) {
  const nd = new TextEncoder().encode(String(nodata) + '\0');
  const scale = new Float64Array([dx, dy, 0]), tie = new Float64Array([0, 0, 0, west, north, 0]);
  const gk = new Uint16Array([1, 1, 0, 3, 1024, 0, 1, 2, 1025, 0, 1, 1, 2048, 0, 1, 4326]);   // geographic, PixelIsArea, WGS84
  const tags = [[256, 3, 1, w], [257, 3, 1, h], [258, 3, 1, 32], [259, 3, 1, 1], [262, 3, 1, 1], [273, 4, 1, 'DATA'], [277, 3, 1, 1],
    [278, 3, 1, h], [279, 4, 1, w * h * 4], [284, 3, 1, 1], [339, 3, 1, 3],
    [33550, 12, 3, scale], [33922, 12, 6, tie], [34735, 3, gk.length, gk], [42113, 2, nd.length, nd]];
  const nT = tags.length; let off = 8 + 2 + nT * 12 + 4; const blobs = [];
  for (const t of tags) if (typeof t[3] === 'object') {
    const b = new Uint8Array(t[3].buffer, t[3].byteOffset, t[3].byteLength);
    if (b.length > 4) { t.off = off; blobs.push([off, b]); off += b.length + (b.length % 2); } else t.inline = b;
  }
  off += (4 - off % 4) % 4; const dataOff = off, buf = new ArrayBuffer(dataOff + w * h * 4), dv = new DataView(buf), u8 = new Uint8Array(buf);
  dv.setUint16(0, 0x4949, true); dv.setUint16(2, 42, true); dv.setUint32(4, 8, true); dv.setUint16(8, nT, true);
  tags.forEach((t, i) => {
    const p = 10 + i * 12; dv.setUint16(p, t[0], true); dv.setUint16(p + 2, t[1], true); dv.setUint32(p + 4, t[2], true);
    if (t[3] === 'DATA') dv.setUint32(p + 8, dataOff, true);
    else if (typeof t[3] === 'number') { if (t[1] === 3) dv.setUint16(p + 8, t[3], true); else dv.setUint32(p + 8, t[3], true); }
    else if (t.off !== undefined) dv.setUint32(p + 8, t.off, true); else u8.set(t.inline, p + 8);
  });
  blobs.forEach(([o, b]) => u8.set(b, o));
  for (let i = 0; i < w * h; i++) dv.setFloat32(dataOff + i * 4, values[i], true);
  return buf;
}
window.sdmEncodeGeoTiff = sdmEncodeGeoTiff;

el('sdmMapTif').addEventListener('click', async () => {
  try { await sdmExportGrid('tif'); }
  catch (e) {
    console.error(e);
    showMessage('sdmEnsMessages', 'error', L2('No se pudo escribir el GeoTIFF: ', 'The GeoTIFF could not be written: ') + sdmErr(e) + L2(' — usa la malla ASCII.', ' — use the ASCII grid instead.'));
  }
});

/* ============================================================ future-projection workbench
   Several future layer sets are read and projected in a queue; each result stays in the Python engine
   under its own name and everything below reads those results: the per-scenario table, the range-shift
   metrics, the ensembles across scenarios, the time series, the refugia classes and the maps.
   Scenario names are language-neutral (circulation model, pathway code and period), so the same string
   works as a key in Python and as a column label in both languages. */

/* views that belong to a scenario ensemble rather than to one algorithm */
const FUT_GROUP_VIEWS = new Set(['agree', 'cons', 'sdscn', 'refugia']);
const FUT_STATUS = { pending: sdmBi('pendiente', 'pending'), done: sdmBi('proyectado', 'projected'), fail: sdmBi('falló', 'failed') };
const SDM_THR_NAME = { maxtss: sdmBi('máximo TSS', 'maximum TSS'), p10: sdmBi('percentil 10 de las presencias', '10th percentile of the presences'),
  mtp: sdmBi('mínima presencia de entrenamiento', 'minimum training presence'), eqss: sdmBi('sensibilidad = especificidad', 'sensitivity = specificity') };
const FUT_DISP_TEXT = {
  unlimited: sdmBi('dispersión ilimitada (toda celda idónea en el futuro se considera alcanzable)', 'unlimited dispersal (every cell suitable in the future is taken to be reachable)'),
  none: sdmBi('dispersión nula (solo las celdas idóneas hoy y en el futuro)', 'no dispersal (only the cells suitable both today and in the future)'),
  limited: sdmBi('dispersión limitada a {km} km del área idónea actual', 'dispersal limited to {km} km from the present suitable area'),
};
const FUT_REF_CLASSES = [
  { key: 'refugia', v: 1, color: SDM_REF_COL[1], label: sdmBi('Refugio climático: idónea hoy y en todos los escenarios', 'Climatic refugium: suitable today and in every scenario'), legend: sdmBi('Refugio (hoy y en todos)', 'Refugium (today and in all)') },
  { key: 'lost_all', v: 2, color: SDM_REF_COL[2], label: sdmBi('Pérdida segura: idónea hoy y en ningún escenario', 'Certain loss: suitable today and in no scenario'), legend: sdmBi('Pérdida en todos', 'Loss in all') },
  { key: 'gain_all', v: 3, color: SDM_REF_COL[3], label: sdmBi('Ganancia segura: no idónea hoy e idónea en todos', 'Certain gain: not suitable today and suitable in all'), legend: sdmBi('Ganancia en todos', 'Gain in all') },
  { key: 'disagree', v: 4, color: SDM_REF_COL[4], label: sdmBi('Desacuerdo: los escenarios no coinciden', 'Disagreement: the scenarios do not agree'), legend: sdmBi('Desacuerdo', 'Disagreement') },
  { key: 'unsuitable', v: 0, color: SDM_REF_COL[0], label: sdmBi('No idónea hoy ni en ningún escenario', 'Not suitable today nor in any scenario'), legend: sdmBi('No idónea', 'Not suitable') },
];
/* eight compass points, so the bearing can also be read in words */
const FUT_DIRS = [sdmBi('N', 'N'), sdmBi('NE', 'NE'), sdmBi('E', 'E'), sdmBi('SE', 'SE'), sdmBi('S', 'S'), sdmBi('SO', 'SW'), sdmBi('O', 'W'), sdmBi('NO', 'NW')];
const futDir = b => FUT_DIRS[Math.round((((b % 360) + 360) % 360) / 45) % 8];
const futD = (b, a) => (b == null || a == null || !isFinite(b) || !isFinite(a)) ? null : b - a;
const futSigned = (v, d) => (v == null || !isFinite(v)) ? '—'
  : d === 0 ? (v > 0 ? '+' : v < 0 ? '−' : '') + fmtInt(Math.abs(v)) : (v > 0 ? '+' : '') + fmt(v, d);
const futModel = () => el('sdmChangeModel').value || (sdm.ensMetrics ? 'ensemble' : sdm.run[0]);
const sdmGroupOf = n => (sdm.fut.groups || []).find(g => g.name === n) || null;
const futDispKm = () => Math.max(0, +el('sdmFutDispKm').value || 0);
const futDispNote = () => T(FUT_DISP_TEXT[el('sdmFutDisp').value].es, FUT_DISP_TEXT[el('sdmFutDisp').value].en).replace('{km}', String(futDispKm()));
const sdmNovelSwatch = nov => nov ? [{ color: '#1a1a1a', label: T('Rayado: extrapolación (MESS < 0)', 'Hatched: extrapolation (MESS < 0)'), shape: 'square' }] : [];

function sdmFutReset() {
  sdm.fut = { scn: [], items: [], rows: [], groups: [], ref: null, rec: null, messOk: new Set(), elevSent: false,
    sort: { key: '', dir: 1 }, recSort: { key: 'n', dir: 1 }, ensRows: [], refRows: [], seq: 0 };
  ['figSdmCentroids', 'figSdmSeries'].forEach(id => { Views.drop(id); const b = el(id); if (b) b.innerHTML = ''; });
  ['sdmFutScnTable', 'sdmChangeTable', 'sdmFutEnsTable', 'sdmFutRefTable', 'sdmFutRecTable', 'sdmMessInfo', 'sdmFutMethods', 'sdmFutRowsNote']
    .forEach(id => { const b = el(id); if (b) b.innerHTML = ''; });
  const w = el('sdmFutSeriesWrap'); if (w) w.style.display = 'none';
  futRenderScnTable();
}

/* ---------------- file names -> circulation model, pathway and period ---------------- */
const FUT_PERIOD_RE = /((?:19|20|21)\d{2})\s*[-–_]\s*((?:19|20|21)\d{2})/;
const FUT_JUNK = /^(wc2|wc2\.1|wc21|bioc|bio|bioclim|cmip5|cmip6|fut|future|futuro|test|v1|v2|\d+(\.\d+)?[ms])$/i;
const futIsPath = t => /^(ssp|rcp)\d{2,3}$/i.test(t);
const futIsBio = t => /^bio[_-]?\d{1,2}$/i.test(t) || /^(elev|elevation|dem|alt)$/i.test(t);

/* "wc2.1_10m_bioc_ACCESS-CM2_ssp245_2041-2060.tif" -> {model: 'ACCESS-CM2', path: 'ssp245', period: '2041–2060'} */
function futParseName(fname) {
  const base = String(fname).replace(/\.(tif|tiff)$/i, '');
  const out = { model: '', path: '', period: '' };
  let m = base.match(/(?:^|[_\-.])ssp[_\-.]?(\d{3})(?![0-9])/i);
  if (m) out.path = 'ssp' + m[1];
  else { m = base.match(/(?:^|[_\-.])rcp[_\-.]?(\d{2})(?![0-9])/i); if (m) out.path = 'rcp' + m[1]; }
  const p = base.match(FUT_PERIOD_RE);
  if (p) out.period = p[1] + '–' + p[2];
  const toks = base.split(/[_\s]+/).filter(Boolean);
  const cand = t => !futIsPath(t) && !futIsBio(t) && !FUT_JUNK.test(t) && !FUT_PERIOD_RE.test(t) && /[A-Za-z]/.test(t);
  const i = toks.findIndex(futIsPath);
  if (i > 0 && cand(toks[i - 1])) out.model = toks[i - 1];
  if (!out.model) { const c = toks.filter(cand).sort((a, b) => b.length - a.length); if (c.length) out.model = c[0]; }
  return out;
}
/* central year of a 20-year period, used for the time series and the migration rate */
function futMid(period) {
  const m = String(period || '').match(/((?:19|20|21)\d{2})\D+((?:19|20|21)\d{2})/);
  return m ? (+m[1] + +m[2]) / 2 : 2050;
}
function futUniqueName(s, custom) {
  const pre = (el('sdmScnName').value || '').trim();
  const core = [s.model, s.path, s.period].filter(Boolean).join(' · ') || ('SCN ' + s.id);
  const base = custom || ((pre ? pre + ' ' : '') + core);
  let n = base, k = 2;
  while (sdm.fut.scn.some(x => x !== s && x.name === n) || sdm.scenarios.includes(n)) n = base + ' (' + (k++) + ')';
  return n;
}

el('sdmFutAddBtn').addEventListener('click', async () => {
  clearMessages('sdmProjMessages');
  const files = [...el('sdmScnFiles').files];
  if (!files.length) { showMessage('sdmProjMessages', 'error', L2('Selecciona primero los archivos .tif de los escenarios.', 'First select the scenario .tif files.')); return; }
  showSpinner(T('Leyendo los nombres y las bandas…', 'Reading the names and the bands…'));
  try {
    const groups = new Map();
    for (const f of files) {
      let bands = 1;
      try { const t = await GeoTIFF.fromBlob(f); const im = await t.getImage(); bands = im.getSamplesPerPixel(); } catch (e) { console.warn('band count', f.name, e); }
      const p = futParseName(f.name);
      if (bands >= 19) { groups.set('M' + (++sdm.fut.seq), { ...p, multi: f, files: [] }); continue; }
      const key = 'S' + ([p.model, p.path, p.period].filter(Boolean).join('|') ||
        f.name.toLowerCase().replace(/\.(tif|tiff)$/, '').replace(/bio[_-]?\d{1,2}/g, '#'));
      let g = groups.get(key);
      if (!g) { g = { ...p, multi: null, files: [] }; groups.set(key, g); }
      g.files.push(f);
      await tick(0);
    }
    let added = 0;
    for (const g of groups.values()) {
      const s = { id: ++sdm.fut.seq, model: g.model, path: g.path, period: g.period, multi: g.multi, files: g.files, status: 'pending', err: '' };
      s.name = futUniqueName(s); sdm.fut.scn.push(s); added++;
    }
    futRenderScnTable();
    el('sdmScnFiles').value = '';
    showMessage('sdmProjMessages', added ? 'success' : 'warning', added
      ? L2(`${added} escenario(s) añadido(s) a la lista (${files.length} archivo(s)). Revisa el modelo, la vía y el periodo antes de proyectar.`,
        `${added} scenario(s) added to the list (${files.length} file(s)). Check the model, the pathway and the period before projecting.`)
      : L2('No se pudo formar ningún escenario con esos archivos.', 'No scenario could be formed from those files.'));
  } catch (e) { console.error(e); showMessage('sdmProjMessages', 'error', L2('Error al leer los archivos: ', 'Error reading the files: ') + sdmErr(e)); }
  finally { hideSpinner(); }
});
el('sdmFutClearBtn').addEventListener('click', () => {
  sdm.fut.scn = sdm.fut.scn.filter(s => s.status === 'done');
  futRenderScnTable();
});

/* the scenario list, with the parsed fields editable until the scenario has been projected */
function futRenderScnTable() {
  const box = el('sdmFutScnTable'); if (!box) return;
  box.innerHTML = '';
  if (!sdm.fut.scn.length) {
    box.innerHTML = `<p class="hint" style="padding:8px 4px">${L2('Aún no hay escenarios en la lista.', 'There are no scenarios in the list yet.')}</p>`;
    return;
  }
  const head = [sdmBi('Modelo de circulación', 'Circulation model'), sdmBi('Vía (SSP / RCP)', 'Pathway (SSP / RCP)'), sdmBi('Periodo', 'Period'),
    sdmBi('Capas', 'Layers'), sdmBi('Nombre del escenario', 'Scenario name'), sdmBi('Estado', 'Status'), sdmBi('Quitar', 'Remove')];
  const t = document.createElement('table');
  t.innerHTML = '<thead><tr>' + head.map(h => `<th>${L2(h.es, h.en)}</th>`).join('') + '</tr></thead>';
  const tb = document.createElement('tbody');
  sdm.fut.scn.forEach(s => {
    const tr = document.createElement('tr'), ro = s.status === 'done';
    const textCell = html => { const td = document.createElement('td'); td.innerHTML = html; tr.appendChild(td); };
    const field = (key, w) => {
      const td = document.createElement('td'), i = document.createElement('input');
      i.type = 'text'; i.value = s[key] || ''; i.style.width = w; i.disabled = ro;
      i.addEventListener('change', () => {
        s[key] = i.value.trim();
        if (!s.custom) s.name = futUniqueName(s);
        futRenderScnTable();
      });
      td.appendChild(i); tr.appendChild(td);
    };
    field('model', '9.5em'); field('path', '6em'); field('period', '7.5em');
    textCell(s.multi ? L2('1 archivo de 19 bandas', '1 file with 19 bands') : `${s.files.length} × bio_N`);
    const tdn = document.createElement('td'), ni = document.createElement('input');
    ni.type = 'text'; ni.value = s.name; ni.style.width = '12em'; ni.disabled = ro;
    ni.addEventListener('change', () => { s.custom = true; s.name = futUniqueName(s, ni.value.trim() || s.name); futRenderScnTable(); });
    tdn.appendChild(ni); tr.appendChild(tdn);
    textCell(`<span class="fut-pill ${s.status}">${L2(FUT_STATUS[s.status].es, FUT_STATUS[s.status].en)}</span>` +
      (s.err ? `<div class="hint" style="margin:2px 0 0">${s.err}</div>` : ''));
    const tdb = document.createElement('td');
    if (ro) tdb.innerHTML = '<span class="hint">—</span>';
    else {
      const b = document.createElement('button');
      b.className = 'btn btn-secondary'; b.textContent = '×';
      b.setAttribute('data-es-title', 'Quitar de la lista'); b.setAttribute('data-en-title', 'Remove from the list');
      b.addEventListener('click', () => { sdm.fut.scn = sdm.fut.scn.filter(x => x !== s); futRenderScnTable(); });
      tdb.appendChild(b);
    }
    tr.appendChild(tdb); tb.appendChild(tr);
  });
  t.appendChild(tb); box.appendChild(t);
  I18N.apply(box);
}

/* the layer sources of one scenario: bands of a 19-band file, separate bio_N files, and the present elevation */
function futSources(s) {
  return sdm.keys.map(k => {
    if (s.multi && k.startsWith('bio_')) return { file: s.multi, band: +k.split('_')[1] - 1 };
    const f = (s.files || []).find(fl => matchRasterFile(fl.name) === k);
    if (f) return { file: f, band: 0 };
    if (k === 'elev' && state.env.files && state.env.files.elev) return { file: state.env.files.elev, band: 0 };
    throw bilingualError(`El escenario no incluye la variable ${sdmCode(k, 'es')}.`, `The scenario does not include the variable ${sdmCode(k, 'en')}.`);
  });
}
/* elevation is needed for the shift metrics even when it is not a predictor */
async function futEnsureElev() {
  if (sdm.fut.elevSent || sdm.keys.includes('elev')) return;
  const f = state.env && state.env.files && state.env.files.elev;
  if (!f) return;
  try {
    const { stack } = await sdmReadStack(['elev'], [{ file: f, band: 0 }], null, 0, () => {}, sdm.meta);
    await pyf('sdm_set_elev', stack); sdm.fut.elevSent = true;
  } catch (e) { console.warn('elevation layer for the shift metrics is not available', e); }
}

/* ---------------- the queue ---------------- */
el('sdmProjBtn').addEventListener('click', futProject);

async function futProject() {
  clearMessages('sdmProjMessages');
  if (!sdm.run.length) { showMessage('sdmProjMessages', 'error', L2('Ajusta primero los modelos.', 'Fit the models first.')); return; }
  const todo = sdm.fut.scn.filter(s => s.status !== 'done');
  if (!todo.length) {
    showMessage('sdmProjMessages', 'info', L2('No hay escenarios pendientes; añade más archivos para proyectar otros.', 'There are no pending scenarios; add more files to project others.'));
    return;
  }
  el('sdmFutProgress').style.display = 'flex'; el('sdmProjBtn').disabled = true;
  let done = 0, ok = 0;
  try {
    await ensureSdmPy();
    await futEnsureElev();
    for (const s of todo) {
      s.status = 'pending'; s.err = '';
      setBar('sdmFutFill', 'sdmFutLabel', done / todo.length, `${s.name} (${done + 1}/${todo.length})`);
      await tick();
      try {
        const sources = futSources(s);
        const { stack, meta } = await sdmReadStack(sdm.keys, sources, null, 0, (i, n, k) => {
          if (k != null) setBar('sdmFutFill', 'sdmFutLabel', (done + i / n) / todo.length,
            T(`${s.name}: leyendo ${varCode(k)} (${i + 1}/${n})`, `${s.name}: reading ${varCode(k)} (${i + 1}/${n})`));
        }, sdm.meta);
        setBar('sdmFutFill', 'sdmFutLabel', (done + 0.9) / todo.length, T(`${s.name}: proyectando…`, `${s.name}: projecting…`));
        await tick();
        await sdmPyLock(() => runPyJSON('sdm_project(_scn, sdm_stack2, _meta2)',
          { sdm_stack2: stack, _meta2: JSON.stringify({ ...meta, ref: undefined }), _scn: s.name }));
        try { await pyf('sdm_mess', s.name); sdm.fut.messOk.add(s.name); } catch (e) { console.warn('MESS failed for', s.name, e); }
        s.status = 'done'; ok++;
        if (!sdm.scenarios.includes(s.name)) sdm.scenarios.push(s.name);
      } catch (e) { console.error(e); s.status = 'fail'; s.err = sdmErr(e); }
      done++; futRenderScnTable(); await tick();
    }
    setBar('sdmFutFill', 'sdmFutLabel', 1, T('Escenarios proyectados.', 'Scenarios projected.'));
    sdmRefreshModelSelects();
    const bad = sdm.fut.scn.filter(s => s.status === 'fail').length;
    if (ok) {
      el('sdmProjOut').style.display = 'block';
      await futRenderAll();
      await sdmRenderAreaTable();
      showMessage('sdmProjMessages', bad ? 'warning' : 'success',
        L2(`${ok} escenario(s) proyectado(s)${bad ? `; ${bad} con error (mira la columna «Estado»).` : '.'}`,
          `${ok} scenario(s) projected${bad ? `; ${bad} failed (see the “Status” column).` : '.'}`));
    } else showMessage('sdmProjMessages', 'error', L2('Ningún escenario pudo proyectarse.', 'No scenario could be projected.'));
  } catch (e) { console.error(e); showMessage('sdmProjMessages', 'error', L2('Error en la proyección: ', 'Projection error: ') + sdmErr(e)); }
  finally { el('sdmProjBtn').disabled = false; el('sdmFutProgress').style.display = 'none'; }
}

/* ---------------- per-scenario table ---------------- */
function futItems() {
  const base = sdm.fut.scn.filter(s => s.status === 'done')
    .map(s => ({ name: s.name, model: s.model, path: s.path, period: s.period, mid: futMid(s.period), isGroup: false }));
  return base.concat(sdm.fut.groups);
}

function FUT_COLS() {
  return [
    { key: 'scn', label: sdmBi('Escenario', 'Scenario'), get: r => r.scn },
    { key: 'gcm', label: sdmBi('Modelo de circulación', 'Circulation model'), get: r => r.it.isGroup ? r.it.label : (r.it.model || '—'), sortVal: r => r.it.isGroup ? 'zzz' : (r.it.model || '') },
    { key: 'path', label: sdmBi('Vía', 'Pathway'), get: r => r.it.path || '—', sortVal: r => r.it.path || '' },
    { key: 'period', label: sdmBi('Periodo', 'Period'), get: r => r.it.period || '—', sortVal: r => r.it.mid },
    { key: 'thr', label: sdmBi('Umbral', 'Threshold'), get: r => fmt(r.thr), num: r => r.thr },
    { key: 'area_fut', label: sdmBi('Área idónea (km²)', 'Suitable area (km²)'), get: r => fmtInt(r.area_fut), num: r => r.area_fut },
    { key: 'd_area', label: sdmBi('Cambio (km²)', 'Change (km²)'), get: r => futSigned(r.d_area, 0), num: r => r.d_area },
    { key: 'd_pct', label: sdmBi('Cambio (%)', 'Change (%)'), get: r => futSigned(r.d_pct, 1), num: r => r.d_pct },
    { key: 'area_unlimited', label: sdmBi('Disp. ilimitada (km²)', 'Unlimited disp. (km²)'), get: r => fmtInt(r.area_unlimited), num: r => r.area_unlimited },
    { key: 'area_limited', label: sdmBi('Disp. limitada (km²)', 'Limited disp. (km²)'), get: r => fmtInt(r.area_limited), num: r => r.area_limited },
    { key: 'area_none', label: sdmBi('Sin dispersión (km²)', 'No dispersal (km²)'), get: r => fmtInt(r.area_none), num: r => r.area_none },
    { key: 'n_stable', label: sdmBi('Celdas estables', 'Stable cells'), get: r => fmtInt(r.n_stable), num: r => r.n_stable },
    { key: 'n_gain', label: sdmBi('Celdas ganadas', 'Gained cells'), get: r => fmtInt(r.n_gain), num: r => r.n_gain },
    { key: 'n_loss', label: sdmBi('Celdas perdidas', 'Lost cells'), get: r => fmtInt(r.n_loss), num: r => r.n_loss },
    { key: 'n_new', label: sdmBi('Nuevas idóneas', 'Newly suitable'), get: r => fmtInt(r.n_new), num: r => r.n_new },
    { key: 'mean_in_present', label: sdmBi('Idoneidad media en el área actual', 'Mean suitability inside the present range'), get: r => fmt(r.mean_in_present), num: r => r.mean_in_present },
    { key: 'pct_novel', label: sdmBi('Extrapolación (% de celdas)', 'Extrapolation (% of cells)'), get: r => r.pct_novel == null ? '—' : fmt(r.pct_novel, 1), num: r => r.pct_novel },
    { key: 'shift_km', label: sdmBi('Centroide: desplazamiento (km)', 'Centroid: displacement (km)'), get: r => fmt(r.shift_km, 1), num: r => r.shift_km },
    { key: 'bearing', label: sdmBi('Centroide: rumbo (°)', 'Centroid: bearing (°)'), get: r => fmt(r.bearing, 0), num: r => r.bearing },
    { key: 'dir', label: sdmBi('Dirección', 'Direction'), get: r => r.bearing == null ? '—' : futDir(r.bearing), sortVal: r => r.bearing },
    { key: 'rate', label: sdmBi('Tasa (km por década)', 'Rate (km per decade)'), get: r => fmt(r.rate_km_dec, 2), num: r => r.rate_km_dec },
    { key: 'dlat', label: sdmBi('Δ latitud media (°)', 'Δ mean latitude (°)'), get: r => futSigned(futD(r.lat_mean1, r.lat_mean0), 3), num: r => futD(r.lat_mean1, r.lat_mean0) },
    { key: 'dlat10', label: sdmBi('Δ latitud P10 (°)', 'Δ latitude P10 (°)'), get: r => futSigned(futD(r.lat_p10_1, r.lat_p10_0), 3), num: r => futD(r.lat_p10_1, r.lat_p10_0) },
    { key: 'dlat90', label: sdmBi('Δ latitud P90 (°)', 'Δ latitude P90 (°)'), get: r => futSigned(futD(r.lat_p90_1, r.lat_p90_0), 3), num: r => futD(r.lat_p90_1, r.lat_p90_0) },
    { key: 'delev', label: sdmBi('Δ altitud media (m)', 'Δ mean elevation (m)'), get: r => futSigned(futD(r.elev_mean1, r.elev_mean0), 0), num: r => futD(r.elev_mean1, r.elev_mean0) },
    { key: 'delevmax', label: sdmBi('Δ altitud máxima (m)', 'Δ maximum elevation (m)'), get: r => futSigned(futD(r.elev_max1, r.elev_max0), 0), num: r => futD(r.elev_max1, r.elev_max0) },
    { key: 'dsuit', label: sdmBi('Δ idoneidad media (ponderada por área)', 'Δ mean suitability (area-weighted)'), get: r => futSigned(futD(r.suit_mean1, r.suit_mean0), 3), num: r => futD(r.suit_mean1, r.suit_mean0) },
  ];
}
/* the same columns with raw numbers, for the CSV */
const futCsvCols = cols => cols.map(c => ({ key: c.key, label: c.label, get: c.num || c.get }));

/* a table whose header sorts it; state = {key, dir} is kept by the caller and rerender() redraws */
function futSortable(id, cols, rows, st, rerender, limit) {
  const rs = rows.slice(), c = cols.find(x => x.key === st.key);
  if (c) {
    const v = r => c.sortVal ? c.sortVal(r) : c.num ? c.num(r) : c.get ? c.get(r) : r[c.key];
    rs.sort((a, b) => {
      const x = v(a), y = v(b);
      const xn = typeof x === 'number' && isFinite(x), yn = typeof y === 'number' && isFinite(y);
      if (xn && yn) return st.dir * (x - y);
      if (xn !== yn) return xn ? -1 : 1;                 // missing values always go last
      return st.dir * String(lab(x) == null ? '' : lab(x)).localeCompare(String(lab(y) == null ? '' : lab(y)), undefined, { numeric: true });
    });
  }
  buildTable(id, cols, rs, limit);
  el(id).querySelectorAll('thead th').forEach((th, i) => {
    const col = cols[i]; if (!col) return;
    th.style.cursor = 'pointer';
    th.setAttribute('data-es-title', 'Ordenar por esta columna'); th.setAttribute('data-en-title', 'Sort by this column');
    if (st.key === col.key) th.insertAdjacentHTML('beforeend', st.dir < 0 ? ' ▾' : ' ▴');
    th.addEventListener('click', () => {
      if (st.key === col.key) st.dir = -st.dir; else { st.key = col.key; st.dir = 1; }
      rerender();
    });
  });
  I18N.apply(el(id));
}

async function futRenderRows() {
  const name = futModel(), kind = el('sdmThrKind').value, disp = el('sdmFutDisp').value, km = futDispKm();
  const rows = [];
  for (const it of sdm.fut.items) {
    if (it.isGroup && it.builtModel !== name) continue;   // a group only holds the model it was built with
    try {
      const r = JSON.parse(await pyf('sdm_future_row', it.name, name, kind, disp, km, it.mid));
      rows.push({ ...r, it });
    } catch (e) { console.warn('scenario row failed', it.name, e); }
    await tick(0);
  }
  sdm.fut.rows = rows;
  futDrawRows();
}
function futDrawRows() {
  const cols = FUT_COLS();
  futSortable('sdmChangeTable', cols, sdm.fut.rows, sdm.fut.sort, futDrawRows);
  const kn = SDM_THR_NAME[el('sdmThrKind').value] || sdmBi('', ''), d = FUT_DISP_TEXT[el('sdmFutDisp').value];
  const nm = sdmName(futModel()), thr = sdm.fut.rows.length ? fmt(sdm.fut.rows[0].thr) : '—';
  el('sdmFutRowsNote').innerHTML = L2(
    `Modelo ${esc(nm.es)} · umbral de ${kn.es} = ${thr} · ${esc(d.es.replace('{km}', String(futDispKm())))}. Haz clic en un encabezado para ordenar. Las tres columnas de dispersión muestran el rango de resultados posibles: sin dispersión ≤ limitada ≤ ilimitada.`,
    `Model ${esc(nm.en)} · ${kn.en} threshold = ${thr} · ${esc(d.en.replace('{km}', String(futDispKm())))}. Click a header to sort. The three dispersal columns show the range of possible outcomes: no dispersal ≤ limited ≤ unlimited.`);
}
el('sdmFutDlRows').addEventListener('click', () => {
  if (!sdm.fut.rows.length) return;
  downloadBlob(toCSV(futCsvCols(FUT_COLS()), sdm.fut.rows), slugName(state.query) + '_future_scenarios.csv', 'text/csv;charset=utf-8');
});

/* ---------------- figures ---------------- */
async function futFigures() {
  const name = futModel(), kind = el('sdmThrKind').value;
  const rows = sdm.fut.rows.filter(r => r.cen_lat0 != null && r.cen_lat1 != null && !r.it.isGroup);
  const paths = [...new Set(sdm.fut.rows.map(r => r.it.path || '—'))];
  if (rows.length) {
    const payload = () => ({
      name, kind, mag: +el('sdmFutMag').value || 1,
      present: { lat: rows[0].cen_lat0, lon: rows[0].cen_lon0 },
      scn: rows.map(r => ({ lab: [r.it.model, r.it.period].filter(Boolean).join(' ') || r.scn,
        lat0: r.cen_lat0, lon0: r.cen_lon0, lat1: r.cen_lat1, lon1: r.cen_lon1,
        ci: Math.max(0, paths.indexOf(r.it.path || '—')), grp: r.it.path || '' })),
    });
    await showFig('figSdmCentroids', () => `fig_sdm_centroids(${sdmPyJSON(payload())})`);
  } else { Views.drop('figSdmCentroids'); el('figSdmCentroids').innerHTML = ''; }
  const series = futSeriesData();
  el('sdmFutSeriesWrap').style.display = series ? 'block' : 'none';
  if (series) await showFig('figSdmSeries', () => `fig_sdm_future_series(${sdmPyJSON(futSeriesData())})`);
  else { Views.drop('figSdmSeries'); el('figSdmSeries').innerHTML = ''; }
}
/* one panel per pathway, one line per circulation model plus the mean across models and its spread */
function futSeriesData() {
  const its = sdm.fut.rows.filter(r => !r.it.isGroup);
  if ([...new Set(its.map(r => r.it.mid))].length < 2) return null;
  const pathKeys = [...new Set(its.map(r => r.it.path || '—'))].sort();
  const panels = pathKeys.map(pk => {
    const sel = its.filter(r => (r.it.path || '—') === pk);
    const xs = [...new Set(sel.map(r => r.it.mid))].sort((a, b) => a - b);
    const models = [...new Set(sel.map(r => r.it.model || '—'))].sort();
    const val = (r, f) => f === 'area' ? r.area_fut : f === 'lat' ? r.cen_lat1 : r.elev_mean1;
    const byModel = models.map(m => {
      const pick = x => sel.find(r => (r.it.model || '—') === m && r.it.mid === x);
      const series = f => xs.map(x => { const r = pick(x); const v = r ? val(r, f) : null; return (v == null || !isFinite(v)) ? null : v; });
      return { m, x: xs, area: series('area'), lat: series('lat'), elev: series('elev') };
    });
    const at = (x, f) => sel.filter(r => r.it.mid === x).map(r => val(r, f)).filter(v => v != null && isFinite(v));
    const mean = f => xs.map(x => { const v = at(x, f); return v.length ? avg(v) : null; });
    const spread = f => xs.map(x => { const v = at(x, f); return v.length > 1 ? sdv(v) : 0; });
    return { key: pk, models: byModel,
      ens: { x: xs, area: mean('area'), lat: mean('lat'), elev: mean('elev'), sd_area: spread('area'), sd_lat: spread('lat'), sd_elev: spread('elev') } };
  });
  const r0 = its[0];
  return { panels, show_elev: its.some(r => r.elev_mean1 != null),
    present: { x: 1985, area: r0.area_now, lat: r0.cen_lat0, elev: r0.elev_mean0 == null ? null : r0.elev_mean0 } };
}

/* ---------------- ensembles across scenarios ---------------- */
el('sdmFutEnsBtn').addEventListener('click', async () => {
  clearMessages('sdmFutEnsMessages');
  const name = futModel(), kind = el('sdmThrKind').value;
  const agree = Math.max(1, Math.min(100, +el('sdmFutAgree').value || 66)), by = el('sdmFutGroupBy').value;
  const base = sdm.fut.scn.filter(s => s.status === 'done');
  if (base.length < 2) { showMessage('sdmFutEnsMessages', 'warning', L2('Se necesitan al menos 2 escenarios proyectados.', 'At least 2 projected scenarios are needed.')); return; }
  const keyOf = s => by === 'sspper' ? [s.path, s.period].filter(Boolean).join(' ')
    : by === 'ssp' ? (s.path || '—') : by === 'period' ? (s.period || '—') : by === 'model' ? (s.model || '—') : 'ALL';
  const g = new Map();
  base.forEach(s => { const k = keyOf(s) || 'ALL'; if (!g.has(k)) g.set(k, []); g.get(k).push(s); });
  showSpinner(T('Construyendo los ensambles…', 'Building the ensembles…'));
  try {
    sdm.fut.groups = [];
    sdm.scenarios = sdm.scenarios.filter(n => n.slice(0, 4) !== 'ENS ');
    const rows = [];
    for (const [k, members] of g) {
      if (members.length < 2) continue;
      const gname = 'ENS ' + k;
      const r = JSON.parse(await pyf('sdm_group', gname, JSON.stringify(members.map(m => m.name)), name, kind, agree));
      const single = v => { const u = [...new Set(members.map(m => m[v]).filter(Boolean))]; return u.length === 1 ? u[0] : ''; };
      const it = { name: gname, isGroup: true, builtModel: name, agree, members: members.map(m => m.name),
        model: '', path: single('path'), period: single('period'), mid: avg(members.map(m => futMid(m.period))),
        label: sdmBi(`Ensamble de ${members.length} escenarios`, `Ensemble of ${members.length} scenarios`), info: r };
      sdm.fut.groups.push(it); sdm.scenarios.push(gname);
      if (members.every(m => sdm.fut.messOk.has(m.name))) sdm.fut.messOk.add(gname);
      rows.push({ it, r });
      await tick(0);
    }
    sdm.fut.ensRows = rows;
    if (!rows.length) {
      showMessage('sdmFutEnsMessages', 'warning', L2('Cada grupo quedó con un solo escenario; elige otra agrupación.', 'Each group ended up with a single scenario; choose another grouping.'));
      futDrawEnsTable();
    } else {
      futDrawEnsTable();
      sdmRefreshModelSelects();
      await futRenderAll();
      await sdmRenderAreaTable();
      showMessage('sdmFutEnsMessages', 'success', L2(`${rows.length} ensamble(s) construido(s) con nivel de acuerdo ≥ ${agree} %.`,
        `${rows.length} ensemble(s) built at agreement level ≥ ${agree} %.`));
    }
  } catch (e) { console.error(e); showMessage('sdmFutEnsMessages', 'error', L2('Error en el ensamble: ', 'Ensemble error: ') + sdmErr(e)); }
  finally { hideSpinner(); }
});
/* Scenario ensembles built from the algorithm ensemble stop being valid when that ensemble is rebuilt:
   they are removed from the engine and from the lists, and the user builds them again. */
async function futDropStaleGroups() {
  const stale = (sdm.fut.groups || []).filter(g => g.builtModel === 'ensemble');
  if (!stale.length) return;
  for (const g of stale) { try { await pyf('sdm_drop_scenario', g.name); } catch (e) { console.warn(e); } }
  const gone = new Set(stale.map(g => g.name));
  sdm.fut.groups = sdm.fut.groups.filter(g => !gone.has(g.name));
  sdm.scenarios = sdm.scenarios.filter(n => !gone.has(n));
  sdm.fut.ensRows = (sdm.fut.ensRows || []).filter(x => !gone.has(x.it.name));
  stale.forEach(g => sdm.fut.messOk.delete(g.name));
  futDrawEnsTable();
  showMessage('sdmFutEnsMessages', 'info', L2('Los ensambles entre escenarios se borraron porque el ensamble de algoritmos cambió; vuelve a construirlos.',
    'The ensembles across scenarios were cleared because the algorithm ensemble changed; build them again.'));
}

function futDrawEnsTable() {
  const cols = [
    { key: 'name', label: sdmBi('Ensamble', 'Ensemble'), get: x => x.it.name },
    { key: 'n', label: sdmBi('Escenarios', 'Scenarios'), get: x => x.r.n },
    { key: 'members', label: sdmBi('Miembros', 'Members'), get: x => x.r.members.join('; ') },
    { key: 'agree', label: sdmBi('Nivel de acuerdo (%)', 'Agreement level (%)'), get: x => fmt(x.r.agree_level, 0) },
    { key: 'cons', label: sdmBi('Área de consenso (km²)', 'Consensus area (km²)'), get: x => fmtInt(x.r.area_consensus), num: x => x.r.area_consensus },
    { key: 'meanArea', label: sdmBi('Área de la media (km²)', 'Area of the mean (km²)'), get: x => fmtInt(x.r.area_mean), num: x => x.r.area_mean },
    { key: 'sdMean', label: sdmBi('DE media entre modelos', 'Mean SD between models'), get: x => fmt(x.r.sd_mean), num: x => x.r.sd_mean },
    { key: 'sdMax', label: sdmBi('DE máxima', 'Maximum SD'), get: x => fmt(x.r.sd_max), num: x => x.r.sd_max },
  ];
  sdm.fut.ensCols = cols;
  buildTable('sdmFutEnsTable', cols, sdm.fut.ensRows);
}
el('sdmFutDlEns').addEventListener('click', () => {
  if (!sdm.fut.ensRows.length) return;
  downloadBlob(toCSV(futCsvCols(sdm.fut.ensCols || []), sdm.fut.ensRows), slugName(state.query) + '_future_ensembles.csv', 'text/csv;charset=utf-8');
});

/* ---------------- refugia, risk classes and persistence per record ---------------- */
el('sdmFutRefBtn').addEventListener('click', async () => {
  clearMessages('sdmFutRefMessages');
  const name = futModel(), kind = el('sdmThrKind').value, disp = el('sdmFutDisp').value, km = futDispKm();
  const members = sdm.fut.scn.filter(s => s.status === 'done').map(s => s.name);
  if (members.length < 2) { showMessage('sdmFutRefMessages', 'warning', L2('Se necesitan al menos 2 escenarios proyectados.', 'At least 2 projected scenarios are needed.')); return; }
  showSpinner(T('Clasificando refugios y riesgo…', 'Classifying refugia and risk…'));
  try {
    const r = JSON.parse(await pyf('sdm_refugia', JSON.stringify(members), name, kind, disp, km));
    sdm.fut.ref = r;
    const tot = FUT_REF_CLASSES.reduce((s, c) => s + (r['a_' + c.key] || 0), 0);
    sdm.fut.refRows = FUT_REF_CLASSES.map(c => ({ c, area: r['a_' + c.key], n: r['n_' + c.key], pct: tot > 0 ? 100 * r['a_' + c.key] / tot : NaN }));
    futDrawRefTable();
    const p = JSON.parse(await pyf('sdm_rec_persist', JSON.stringify(members), name, kind, disp, km));
    sdm.fut.rec = p; futDrawRecTable();
    showMessage('sdmFutRefMessages', 'success', L2(
      `${fmtInt(r.a_refugia)} km² son refugio (idóneo hoy y en los ${r.n_scn} escenarios) y ${fmtInt(r.a_lost_all)} km² se pierden en todos. De ${p.n_records} registros usados, ${p.n_all} conservan su celda en todos los escenarios y ${p.n_none} en ninguno.`,
      `${fmtInt(r.a_refugia)} km² are refugium (suitable today and in all ${r.n_scn} scenarios) and ${fmtInt(r.a_lost_all)} km² are lost in every one. Of the ${p.n_records} records used, ${p.n_all} keep their cell in every scenario and ${p.n_none} in none.`));
    futRenderMethods();
  } catch (e) { console.error(e); showMessage('sdmFutRefMessages', 'error', L2('Error al clasificar: ', 'Classification error: ') + sdmErr(e)); }
  finally { hideSpinner(); }
});
function futDrawRefTable() {
  const cols = [
    { key: 'cls', label: sdmBi('Clase', 'Class'), get: x => ({
      es: `<span class="fut-sw" style="background:${x.c.color}"></span>${x.c.label.es}`,
      en: `<span class="fut-sw" style="background:${x.c.color}"></span>${x.c.label.en}` }), num: x => x.c.label },
    { key: 'area', label: sdmBi('Área (km²)', 'Area (km²)'), get: x => fmtInt(x.area), num: x => x.area },
    { key: 'pct', label: sdmBi('% del área con dato', '% of the area with data'), get: x => fmt(x.pct, 1), num: x => x.pct },
    { key: 'n', label: sdmBi('Celdas', 'Cells'), get: x => fmtInt(x.n), num: x => x.n },
  ];
  sdm.fut.refCols = cols;
  buildTable('sdmFutRefTable', cols, sdm.fut.refRows);
}
el('sdmFutDlRef').addEventListener('click', () => {
  if (!sdm.fut.refRows.length) return;
  downloadBlob(toCSV(futCsvCols(sdm.fut.refCols || []), sdm.fut.refRows), slugName(state.query) + '_future_refugia.csv', 'text/csv;charset=utf-8');
});
function futDrawRecTable() {
  const p = sdm.fut.rec; if (!p) return;
  const rows = p.rows.map((r, i) => ({ ...r, i: i + 1 }));
  const cols = [
    { key: 'i', label: sdmBi('#', '#'), get: r => r.i },
    { key: 'lat', label: sdmBi('Latitud', 'Latitude'), get: r => fmt(r.lat, 4), num: r => r.lat },
    { key: 'lon', label: sdmBi('Longitud', 'Longitude'), get: r => fmt(r.lon, 4), num: r => r.lon },
    { key: 'elev', label: sdmBi('Altitud (m)', 'Elevation (m)'), get: r => r.elev == null ? '—' : fmtInt(r.elev), num: r => r.elev },
    { key: 'suit', label: sdmBi('Idoneidad actual', 'Present suitability'), get: r => fmt(r.suit), num: r => r.suit },
    { key: 'now', label: sdmBi('Idónea hoy', 'Suitable today'), get: r => r.now ? sdmBi('sí', 'yes') : sdmBi('no', 'no'), sortVal: r => r.now ? 1 : 0, num: r => r.now ? 1 : 0 },
    { key: 'n', label: sdmBi('Escenarios que la conservan', 'Scenarios that keep it'), get: r => `${r.n} / ${p.n_scn}`, sortVal: r => r.n, num: r => r.n },
    { key: 'pct', label: sdmBi('% de escenarios', '% of scenarios'), get: r => fmt(r.pct, 0), num: r => r.pct },
  ];
  sdm.fut.recCols = cols; sdm.fut.recRows = rows;
  futSortable('sdmFutRecTable', cols, rows, sdm.fut.recSort, futDrawRecTable, 200);
}
el('sdmFutDlRec').addEventListener('click', () => {
  if (!sdm.fut.recRows || !sdm.fut.recRows.length) return;
  downloadBlob(toCSV(futCsvCols(sdm.fut.recCols || []), sdm.fut.recRows), slugName(state.query) + '_future_record_persistence.csv', 'text/csv;charset=utf-8');
});

/* ---------------- maps ---------------- */
/* MESS surface of a scenario, only when the user asked for the extrapolation hatch */
async function sdmNovelArray(scn, type) {
  const cb = el('sdmFutNovel');
  if (!cb || !cb.checked || !scn || type === 'mess' || type === 'refugia') return null;
  if (!sdm.fut.messOk.has(scn)) return null;
  try { return await pyf('sdm_get_mess', scn); } catch (e) { return null; }
}
const futMapScn = () => (el('sdmFutMapScn') && el('sdmFutMapScn').value) || el('sdmMapScn').value || '';

async function futShowMess(scn) {
  if (sdmGroupOf(scn)) {
    el('sdmMessInfo').innerHTML = L2('MESS medio de los escenarios del ensamble: las zonas rojas quedan fuera del rango calibrado en promedio.',
      'Mean MESS of the scenarios in the ensemble: the red areas lie outside the calibrated range on average.');
  } else {
    const r = JSON.parse(await pyf('sdm_mess', scn));
    sdm.fut.messOk.add(scn);
    const top = Object.entries(r.by_var).sort((a, b) => b[1] - a[1]).filter(e => e[1] > 0).slice(0, 4);
    const list = (lg, cells) => top.map(e => `${esc(sdmCode(e[0], lg))} (${e[1]} ${cells})`).join(', ');
    el('sdmMessInfo').innerHTML = L2(
      `${fmt(r.pct_novel, 1)} % de las celdas de «${esc(scn)}» tienen clima sin análogo en el área de calibración.` + (top.length ? ' Variables más limitantes: ' + list('es', 'celdas') + '.' : ''),
      `${fmt(r.pct_novel, 1)} % of the cells of “${esc(scn)}” have a climate with no analogue in the calibration area.` + (top.length ? ' Most limiting variables: ' + list('en', 'cells') + '.' : ''));
  }
  await sdmShowMap({ type: 'mess', scn });
}

async function futShowMap(type) {
  const scn = futMapScn();
  if (type !== 'refugia' && !scn) {
    showMessage('sdmFutRefMessages', 'info', L2('Elige un escenario o ensamble.', 'Choose a scenario or an ensemble.'));
    return;
  }
  if (['agree', 'cons', 'sdscn'].includes(type) && !sdmGroupOf(scn)) {
    showMessage('sdmFutEnsMessages', 'info', L2('Ese mapa solo existe para un ensamble entre escenarios; constrúyelo y elígelo arriba.',
      'That map only exists for an ensemble across scenarios; build one and select it above.'));
    return;
  }
  if (type === 'refugia' && !sdm.fut.ref) {
    showMessage('sdmFutRefMessages', 'info', L2('Calcula primero los refugios y el riesgo.', 'Compute the refugia and the risk first.'));
    return;
  }
  showSpinner(T('Dibujando mapa…', 'Drawing the map…'));
  try {
    if (type === 'change') {
      const m = sdmGroupOf(scn) ? sdmGroupOf(scn).builtModel : futModel();
      await pyf('sdm_change', scn, m, el('sdmThrKind').value, el('sdmFutDisp').value, futDispKm());
      await sdmShowMap({ type: 'change', scn, model: m });
    } else if (type === 'mess') await futShowMess(scn);
    else if (type === 'refugia') await sdmShowMap({ type: 'refugia', scn: '' });
    else await sdmShowMap({ type, scn });
    const mp = el('mapSdm'); if (mp && mp.scrollIntoView) mp.scrollIntoView({ block: 'center', behavior: 'smooth' });
  } catch (e) { console.error(e); showMessage('sdmProjMessages', 'error', L2('Error al dibujar el mapa: ', 'Error drawing the map: ') + sdmErr(e)); }
  finally { hideSpinner(); }
}
el('sdmShowChange').addEventListener('click', () => futShowMap('change'));
el('sdmShowMess').addEventListener('click', () => futShowMap('mess'));
el('sdmFutShowAgree').addEventListener('click', () => futShowMap('agree'));
el('sdmFutShowCons').addEventListener('click', () => futShowMap('cons'));
el('sdmFutShowSd').addEventListener('click', () => futShowMap('sdscn'));
el('sdmFutShowRefugia').addEventListener('click', () => futShowMap('refugia'));
/* the two scenario selectors (this card and the map card) stay in step */
el('sdmFutMapScn').addEventListener('change', () => {
  const v = el('sdmFutMapScn').value, o = el('sdmMapScn');
  if ([...o.options].some(x => x.value === v)) o.value = v;
});
el('sdmMapScn').addEventListener('change', () => {
  const v = el('sdmMapScn').value, f = el('sdmFutMapScn');
  if (v && [...f.options].some(x => x.value === v)) f.value = v;
});
el('sdmFutNovel').addEventListener('change', async () => {
  const v = sdm.lastView; if (!v) return;
  showSpinner(T('Dibujando mapa…', 'Drawing the map…'));
  try { await sdmShowMap(['cont', 'bin', 'sd'].includes(v.type) ? undefined : v); } finally { hideSpinner(); }
});
el('sdmFutPng').addEventListener('click', () => { if (sdm.studio && sdm.lastView) sdm.studio.exportNow(); else sdmNeedSuitMap(); });
el('sdmFutTif').addEventListener('click', async () => {
  try { await sdmExportGrid('tif'); } catch (e) { console.error(e); showMessage('sdmProjMessages', 'error', L2('No se pudo escribir el GeoTIFF: ', 'The GeoTIFF could not be written: ') + sdmErr(e)); }
});
el('sdmFutAsc').addEventListener('click', async () => {
  try { await sdmExportGrid('asc'); } catch (e) { console.error(e); showMessage('sdmProjMessages', 'error', L2('No se pudo escribir la malla: ', 'The grid could not be written: ') + sdmErr(e)); }
});

/* ---------------- methods paragraph ---------------- */
function futMethodsPairs() {
  const name = futModel(), kind = el('sdmThrKind').value;
  const f = sdm.final[name], thr = f ? f.thr[kind] : null;
  const cv = (name === 'ensemble' ? sdm.ensMetrics : sdm.cv[name]) || {};
  const algos = lg => sdm.run.map(x => sdmName(x)[lg]).join(', ');
  const vars = lg => sdm.keys.map(k => sdmCode(k, lg)).join(', ');
  const cell = fmt(sdm.meta ? sdm.meta.dx * 111.32 : 0, 1);
  const scn = sdm.fut.scn.filter(s => s.status === 'done');
  const gcms = [...new Set(scn.map(s => s.model).filter(Boolean))].sort();
  const paths = [...new Set(scn.map(s => s.path).filter(Boolean))].sort();
  const pers = [...new Set(scn.map(s => s.period).filter(Boolean))].sort();
  const scheme = { block: sdmBi('bloques espaciales', 'spatial blocks'),
    random: sdmBi(`${el('sdmK').value} pliegues aleatorios`, `${el('sdmK').value} random folds`),
    holdout: sdmBi('retención 70 / 30', '70 / 30 hold-out') }[el('sdmScheme').value] || sdmBi('', '');
  const kn = SDM_THR_NAME[kind] || sdmBi(kind, kind), d = FUT_DISP_TEXT[el('sdmFutDisp').value], km = futDispKm();
  const agree = sdm.fut.groups.length ? sdm.fut.groups[0].agree : Math.max(1, +el('sdmFutAgree').value || 66);
  const nv = sdm.fut.rows.filter(r => r.pct_novel != null).map(r => r.pct_novel);
  const sp = state.query || T('la especie', 'the species');
  const out = [];
  out.push(sdmBi(
    `Se modeló la distribución potencial de ${sp} con ${algos('es')}${sdm.ensMetrics ? ', combinados además en un ensamble ponderado' : ''}, a partir de ${sdm.pres.length} presencias depuradas y ${sdm.keys.length} variables predictoras (${vars('es')}) sobre una malla de ${sdm.meta.ncol} × ${sdm.meta.nrow} celdas de aproximadamente ${cell} km de lado.`,
    `The potential distribution of ${sp} was modelled with ${algos('en')}${sdm.ensMetrics ? ', also combined into a weighted ensemble' : ''}, from ${sdm.pres.length} cleaned presences and ${sdm.keys.length} predictor variables (${vars('en')}) on a grid of ${sdm.meta.ncol} × ${sdm.meta.nrow} cells of about ${cell} km.`));
  const mx = sdm.run.includes('maxent')
    ? sdmBi('El modelo tipo MaxEnt es una regresión logística penalizada (L1) con salida cloglog. ', 'The MaxEnt-style model is an L1-penalised logistic regression with cloglog output. ')
    : sdmBi('', '');
  out.push(sdmBi(
    `${mx.es}Los modelos se validaron con ${scheme.es} (AUC de prueba ${fmt(cv.auc_mean, 2)}, TSS ${fmt(cv.tss_mean, 2)}, índice de Boyce ${fmt(cv.boyce_mean, 2)}); las cifras de esta sección corresponden a ${sdmName(name).es} y el mapa binario usa el umbral de ${kn.es} (${fmt(thr)}).`,
    `${mx.en}The models were validated with ${scheme.en} (test AUC ${fmt(cv.auc_mean, 2)}, TSS ${fmt(cv.tss_mean, 2)}, Boyce index ${fmt(cv.boyce_mean, 2)}); the figures in this section refer to ${sdmName(name).en} and the binary map uses the ${kn.en} threshold (${fmt(thr)}).`));
  out.push(sdmBi(
    `El modelo se transfirió a ${scn.length} escenario(s) climático(s) futuro(s)${gcms.length ? `, de ${gcms.length} modelo(s) de circulación general (${gcms.join(', ')})` : ''}${paths.length ? `, vía(s) socioeconómica(s) ${paths.join(', ')}` : ''}${pers.length ? ` y periodo(s) ${pers.join(', ')}` : ''}. Cada periodo es un promedio de 20 años, no una predicción para un año concreto, y la transferencia supone que la relación especie–clima no cambia.`,
    `The model was transferred to ${scn.length} future climate scenario(s)${gcms.length ? `, from ${gcms.length} general circulation model(s) (${gcms.join(', ')})` : ''}${paths.length ? `, socioeconomic pathway(s) ${paths.join(', ')}` : ''}${pers.length ? ` and period(s) ${pers.join(', ')}` : ''}. Each period is a 20-year average, not a prediction for a given year, and the transfer assumes that the species–climate relationship does not change.`));
  out.push(sdmBi(
    `Supuesto de dispersión de las áreas informadas: ${d.es.replace('{km}', String(km))}. Las tres opciones (nula, limitada e ilimitada) se informan a la vez para acotar el rango de resultados posibles.`,
    `Dispersal assumption behind the reported areas: ${d.en.replace('{km}', String(km))}. The three options (none, limited and unlimited) are reported together to bracket the range of possible outcomes.`));
  out.push(sdmBi(
    `El desplazamiento se midió con el centroide del área idónea ponderado por la idoneidad (distancia en km, rumbo y tasa implícita en km por década respecto al periodo de referencia 1970–2000), además del cambio en la latitud media y en los percentiles 10 y 90 y, cuando hay capa de altitud, en la altitud media y máxima.`,
    `The shift was measured with the suitability-weighted centroid of the suitable area (distance in km, bearing and implied rate in km per decade against the 1970–2000 reference period), together with the change in mean latitude and in the 10th and 90th percentiles and, when an elevation layer is available, in mean and maximum elevation.`));
  if (sdm.fut.groups.length) out.push(sdmBi(
    `Los escenarios se resumieron en ${sdm.fut.groups.length} ensamble(s): media y desviación estándar de la idoneidad entre modelos, mapa de acuerdo (porcentaje de modelos que declaran idónea la celda) y mapa binario de consenso con acuerdo ≥ ${agree} %.`,
    `The scenarios were summarised into ${sdm.fut.groups.length} ensemble(s): mean and standard deviation of suitability across models, an agreement map (percentage of models calling the cell suitable) and a binary consensus map at agreement ≥ ${agree} %.`));
  out.push(sdmBi(
    `La extrapolación se evaluó con la superficie de similitud ambiental multivariada (MESS): las celdas con MESS < 0 quedan fuera del rango ambiental de calibración${nv.length ? ` y representan entre ${fmt(Math.min(...nv), 1)} % y ${fmt(Math.max(...nv), 1)} % de la malla según el escenario` : ''}; en los mapas aparecen rayadas y en las tablas como porcentaje, y las predicciones en esas zonas deben leerse con cautela.`,
    `Extrapolation was assessed with the multivariate environmental similarity surface (MESS): cells with MESS < 0 lie outside the environmental range of calibration${nv.length ? ` and make up between ${fmt(Math.min(...nv), 1)} % and ${fmt(Math.max(...nv), 1)} % of the grid depending on the scenario` : ''}; they are hatched on the maps and reported as a percentage in the tables, and predictions there must be read with caution.`));
  if (sdm.fut.ref) out.push(sdmBi(
    `Los refugios climáticos se definieron como las celdas idóneas hoy y en los ${sdm.fut.ref.n_scn} escenarios (${fmtInt(sdm.fut.ref.a_refugia)} km²); la pérdida segura, como las idóneas hoy y en ninguno (${fmtInt(sdm.fut.ref.a_lost_all)} km²); la ganancia segura, como las no idóneas hoy e idóneas en todos (${fmtInt(sdm.fut.ref.a_gain_all)} km²).`,
    `Climatic refugia were defined as the cells suitable today and in all ${sdm.fut.ref.n_scn} scenarios (${fmtInt(sdm.fut.ref.a_refugia)} km²); certain loss as those suitable today and in none of them (${fmtInt(sdm.fut.ref.a_lost_all)} km²); certain gain as those not suitable today and suitable in all (${fmtInt(sdm.fut.ref.a_gain_all)} km²).`));
  out.push(sdmBi(
    'Capas climáticas: WorldClim 2.1 para el presente y escenarios CMIP6 para el futuro. Referencias: Araújo & New (2007); Elith, Kearney & Phillips (2010); Eyring et al. (2016); Fick & Hijmans (2017); Roberts et al. (2017); Thuiller et al. (2019).',
    'Climate layers: WorldClim 2.1 for the present and CMIP6 scenarios for the future. References: Araújo & New (2007); Elith, Kearney & Phillips (2010); Eyring et al. (2016); Fick & Hijmans (2017); Roberts et al. (2017); Thuiller et al. (2019).'));
  return out;
}
function futRenderMethods() {
  const box = el('sdmFutMethods');
  if (!box || !sdm.meta || !sdm.run.length) return;
  box.innerHTML = futMethodsPairs().map(x => `<p>${L2(esc(x.es), esc(x.en))}</p>`).join('');
}
el('sdmFutCopyBtn').addEventListener('click', async () => {
  if (!sdm.meta || !sdm.run.length) return;
  const txt = futMethodsPairs().map(x => T(x.es, x.en)).join('\n\n');
  let ok = false;
  try { await navigator.clipboard.writeText(txt); ok = true; } catch (e) { /* file:// or denied: fall back */ }
  if (!ok) {
    const ta = document.createElement('textarea');
    ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
  }
  const m = document.createElement('div');
  m.className = 'msg msg-' + (ok ? 'success' : 'warning');
  m.innerHTML = ok ? L2('Texto copiado al portapapeles.', 'Text copied to the clipboard.')
    : L2('No se pudo copiar; selecciona el texto a mano.', 'Could not copy; select the text by hand.');
  el('sdmFutMethods').prepend(m);
  setTimeout(() => m.remove(), 3000);
});

/* ---------------- refresh ---------------- */
async function futRenderAll() {
  sdm.fut.items = futItems();
  if (!sdm.fut.items.length) return;
  await futRenderRows();
  await futFigures();
  futRenderMethods();
}
async function futRefresh() {
  if (!sdm.fut.scn.some(s => s.status === 'done')) return;
  showSpinner(T('Recalculando…', 'Recomputing…'));
  try { await futRenderAll(); }
  catch (e) { console.error(e); showMessage('sdmProjMessages', 'error', L2('Error al recalcular: ', 'Error recomputing: ') + sdmErr(e)); }
  finally { hideSpinner(); }
}
/* the threshold select is handled by the map listener above, which then calls futRefresh itself */
['sdmChangeModel', 'sdmFutDisp', 'sdmFutDispKm'].forEach(id => el(id).addEventListener('change', futRefresh));
el('sdmFutRefreshBtn').addEventListener('click', futRefresh);
el('sdmFutMag').addEventListener('change', () => { futFigures().catch(e => console.error(e)); });

document.addEventListener('langchange', () => {
  futRenderScnTable();
  if (sdm.fut.rows.length) futDrawRows();
  if (sdm.fut.ensRows.length) futDrawEnsTable();
  if (sdm.fut.refRows.length) futDrawRefTable();
  if (sdm.fut.rec) futDrawRecTable();
  futRenderMethods();
});

futRenderScnTable();

window.sdmOnShow = sdmOnShow;
