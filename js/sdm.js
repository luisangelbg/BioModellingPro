/* Paso 8 · Bloque E: modelado de distribución de especies (SDM).
   El cálculo pesado corre en Python (sdm-py.js); aquí: lectura de mallas ráster, interfaz, mapas. */

const SDM_ALGOS = [
  ['maxent', 'MaxEnt (tipo maxnet)', true], ['glm', 'GLM logístico (lineal + cuadrático)', true],
  ['gam', 'GAM (B-splines)', false], ['rf', 'Random Forest (submuestreo balanceado)', true],
  ['brt', 'BRT / boosting de árboles', true], ['svm', 'SVM (núcleo RBF)', false],
  ['ann', 'Red neuronal (5 redes)', false], ['bioclim', 'Bioclim (envoltura)', false],
  ['domain', 'Domain (distancia de Gower)', false], ['mahal', 'Mahalanobis', false],
];
const SDM_LABEL = Object.fromEntries(SDM_ALGOS.map(a => [a[0], a[1].replace(/ \(.*\)$/, '')]));
SDM_LABEL.ensemble = 'Ensamble';

const sdm = { pyReady: false, keys: [], meta: null, cv: {}, final: {}, run: [], scenarios: [], folds: [],
  map: null, dataMap: null, overlay: null, ptsLayer: null, pres: [], lastView: null };
window.sdm = sdm;

const tick = (ms = 25) => new Promise(r => setTimeout(r, ms));
function setBar(fillId, labelId, frac, text) {
  el(fillId).style.width = Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%';
  if (text != null) el(labelId).textContent = text;
}
async function pyf(fn, ...args) {
  const py = await getPyodide();
  args.forEach((a, i) => py.globals.set('_a' + i, a));
  return py.runPython(`${fn}(${args.map((_, i) => '_a' + i).join(', ')})`);
}
async function ensureSdmPy() {
  const py = await getPyodide();
  if (!sdm.pyReady) { py.runPython(PY_SDM); sdm.pyReady = true; }
  return py;
}

/* ------------------------------------------------------------ pestaña: selectores */
function sdmAvailableKeys() {
  const f = (state.env && state.env.files) || {};
  return [...Array(19)].map((_, i) => 'bio_' + (i + 1)).concat('elev').filter(k => f[k]);
}

function sdmOnShow() {
  const keys = sdmAvailableKeys(), st = el('sdmRasterStatus');
  st.innerHTML = '';
  if (!keys.length) showMessage(st, 'warning', 'Aún no hay capas ráster cargadas. Ve al paso 5 («Variables»), selecciona los GeoTIFF de WorldClim (o usa los de ejemplo) y vuelve aquí.');
  else showMessage(st, 'info', `${keys.length} capas ráster disponibles${state.env.resolution ? ' (WorldClim ' + state.env.resolution + ')' : ''}.`);
  if (!el('sdmVarChecklist').children.length) buildSdmPickers();
  if (sdm.map) setTimeout(() => sdm.map.invalidateSize(), 60);
  if (sdm.dataMap) setTimeout(() => sdm.dataMap.invalidateSize(), 60);
}

function buildSdmPickers() {
  const keys = sdmAvailableKeys();
  const rec = new Set((state.stats && state.stats.recommendedVars) || keys);
  const box = el('sdmVarChecklist'); box.innerHTML = '';
  keys.forEach(k => {
    const meta = rasters.BIOCLIM_META[k];
    const l = document.createElement('label'); l.className = 'checkbox-label';
    l.innerHTML = `<input type="checkbox" value="${k}" ${rec.has(k) ? 'checked' : ''}> ${meta ? meta[0] : k}${rec.has(k) && state.stats && state.stats.recommendedVars ? ' <span class="tag-info">recomendada</span>' : ''}`;
    box.appendChild(l);
  });
  const recs = state.clean.length ? state.clean : state.filtered;
  const counts = {}; recs.forEach(r => { counts[r.taxon] = (counts[r.taxon] || 0) + 1; });
  const sel = el('sdmTaxon'); sel.innerHTML = '';
  sel.add(new Option(`Todos los registros (${recs.length})`, ''));
  Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([t, n]) => sel.add(new Option(`${t} (${n})`, t)));
  const ab = el('sdmAlgoList'); ab.innerHTML = '';
  SDM_ALGOS.forEach(([k, lab, def]) => {
    const l = document.createElement('label'); l.className = 'checkbox-label';
    l.innerHTML = `<input type="checkbox" value="${k}" ${def ? 'checked' : ''}> ${lab}`; ab.appendChild(l);
  });
}
el('sdmVarsRecommended').addEventListener('click', () => {
  const rec = new Set((state.stats && state.stats.recommendedVars) || []);
  el('sdmVarChecklist').querySelectorAll('input').forEach(i => i.checked = rec.has(i.value));
});
el('sdmVarsAll').addEventListener('click', () => el('sdmVarChecklist').querySelectorAll('input').forEach(i => i.checked = true));
const sdmSelectedKeys = () => [...el('sdmVarChecklist').querySelectorAll('input:checked')].map(i => i.value);

/* ------------------------------------------------------------ lectura de mallas ráster */
const sameGrid = (a, b) => a.w === b.w && a.h === b.h && Math.abs(a.rx - b.rx) < 1e-12 && Math.abs(a.ry - b.ry) < 1e-12 &&
  Math.abs(a.ox - b.ox) < 1e-9 && Math.abs(a.oy - b.oy) < 1e-9;

/* Lee cada capa sobre la misma malla (promediando bloques f×f si la malla se agrega).
   sources[i] = {file, band}. Si refMeta existe se reutiliza su malla (proyección a otro escenario). */
async function sdmReadStack(keys, sources, bbox, maxCells, progress, refMeta) {
  const g0 = await openGeo(sources[0].file);
  const ref = refMeta ? refMeta.ref : { ox: g0.ox, oy: g0.oy, rx: g0.rx, ry: g0.ry, w: g0.w, h: g0.h };
  let x0, y0, f, ow, oh;
  if (refMeta) { x0 = refMeta.win.x0; y0 = refMeta.win.y0; f = refMeta.f; ow = refMeta.ncol; oh = refMeta.nrow; }
  else {
    x0 = Math.max(0, Math.floor((bbox.W - g0.ox) / g0.rx)); const x1 = Math.min(g0.w, Math.ceil((bbox.E - g0.ox) / g0.rx));
    y0 = Math.max(0, Math.floor((bbox.N - g0.oy) / g0.ry)); const y1 = Math.min(g0.h, Math.ceil((bbox.S - g0.oy) / g0.ry));
    const W = x1 - x0, H = y1 - y0;
    if (W < 10 || H < 10) throw new Error('El recuadro de los registros queda fuera del ráster o es demasiado pequeño.');
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
    } else throw new Error(`La malla de «${keys[li]}» no coincide con la de las demás capas.`);
  }
  progress(keys.length, keys.length, 'listo');
  return { stack, meta };
}

/* ------------------------------------------------------------ preparar datos */
el('sdmPrepareBtn').addEventListener('click', sdmPrepare);

async function sdmPrepare() {
  clearMessages('sdmMessages');
  const keys = sdmSelectedKeys();
  if (keys.length < 2) { showMessage('sdmMessages', 'error', 'Selecciona al menos 2 variables predictoras.'); return; }
  const files = (state.env && state.env.files) || {};
  const miss = keys.filter(k => !files[k]);
  if (miss.length) { showMessage('sdmMessages', 'error', 'Faltan capas ráster: ' + miss.join(', ')); return; }
  const taxon = el('sdmTaxon').value;
  const recs = (state.clean.length ? state.clean : state.filtered).filter(r => r.decimalLatitude != null && (!taxon || r.taxon === taxon));
  if (recs.length < 10) { showMessage('sdmMessages', 'error', 'Se necesitan al menos 10 registros depurados (paso 3).'); return; }
  const margin = Math.max(0, +el('sdmMargin').value || 0);
  const lons = recs.map(r => r.decimalLongitude), lats = recs.map(r => r.decimalLatitude);
  const bbox = { W: Math.max(-180, Math.min(...lons) - margin), E: Math.min(180, Math.max(...lons) + margin),
                 S: Math.max(-90, Math.min(...lats) - margin), N: Math.min(90, Math.max(...lats) + margin) };
  el('sdmPrepProgress').style.display = 'flex'; el('sdmPrepareBtn').disabled = true;
  try {
    const { stack, meta } = await sdmReadStack(keys, keys.map(k => ({ file: files[k], band: 0 })), bbox,
      Math.max(5000, +el('sdmMaxCells').value || 80000),
      (i, n, lab) => setBar('sdmPrepFill', 'sdmPrepLabel', i / n, `Leyendo capas… ${lab} (${i}/${n})`));
    setBar('sdmPrepFill', 'sdmPrepLabel', 1, 'Preparando datos en Python…'); await tick();
    const py = await ensureSdmPy();
    py.globals.set('sdm_stack', stack);
    py.globals.set('_meta', JSON.stringify({ ...meta, ref: undefined }));
    py.globals.set('_pres', JSON.stringify(recs.map(r => ({ lon: r.decimalLongitude, lat: r.decimalLatitude }))));
    py.globals.set('_opts', JSON.stringify({ dedupe: el('sdmDedupe').checked, radius: +el('sdmRadius').value || 300,
      nbg: +el('sdmNBg').value || 10000, seed: +el('sdmSeed').value || 42 }));
    py.globals.set('_vlab', JSON.stringify(Object.fromEntries(keys.map(k => [k, rasters.BIOCLIM_META[k] ? rasters.BIOCLIM_META[k][0] : k]))));
    const info = JSON.parse(py.runPython('sdm_prepare(_meta, sdm_stack, _pres, _opts, _vlab)'));
    Object.assign(sdm, { keys, meta, run: [], cv: {}, final: {}, scenarios: [], folds: [], ensMetrics: null, mapFitted: false,
      pres: info.pres_lon.map((lo, i) => [info.pres_lat[i], lo]) });
    sdmRefreshModelSelects();
    statTiles('sdmPrepSummary', [
      ['Presencias usadas', info.n_presence.toLocaleString()], ['Puntos de fondo', info.n_background.toLocaleString()],
      ['Malla', `${meta.ncol} × ${meta.nrow}`], ['Tamaño de celda', (meta.dx * 111.32).toFixed(1) + ' km'],
      ['Celdas de calibración', info.n_calib_cells.toLocaleString()], ['Predictoras', keys.length]]);
    if (info.n_presence < info.n_records)
      showMessage('sdmMessages', 'info', `${info.n_records - info.n_presence} de ${info.n_records} registros se descartaron (misma celda o fuera de la malla / sin dato).`);
    if (info.n_presence < 15) showMessage('sdmMessages', 'warning', 'Pocas presencias (<15): los modelos serán inestables; usa el esquema de bloques con cautela.');
    await sdmDrawDataMap(info);
    el('sdmSections').style.display = 'block'; el('sdmResults').style.display = 'none';
    showMessage('sdmMessages', 'success', 'Datos listos. Elige algoritmos y valida los modelos más abajo.');
  } catch (e) { console.error(e); showMessage('sdmMessages', 'error', 'Error al preparar los datos: ' + e.message); }
  finally { el('sdmPrepareBtn').disabled = false; }
}

async function sdmDrawDataMap(info) {
  el('sdmDataMapWrap').style.display = 'block';
  if (!sdm.dataMap) sdm.dataMap = mapkit.makeBaseMap('mapSdmData');
  const m = sdm.dataMap;
  m.eachLayer(l => { if (l.options && l.options.sdmTmp) m.removeLayer(l); });
  const mask = await pyf('sdm_get_mask');
  const ov = sdmOverlay(mask, sdm.meta, 'mask');
  L.imageOverlay(ov.url, ov.bounds, { opacity: 1, interactive: false, sdmTmp: true }).addTo(m);
  info.bg_lon.forEach((lo, i) => L.circleMarker([info.bg_lat[i], lo], { radius: 1.5, weight: 0, fillColor: '#666', fillOpacity: .5, sdmTmp: true }).addTo(m));
  info.pres_lon.forEach((lo, i) => L.circleMarker([info.pres_lat[i], lo], { radius: 3, weight: 1, color: '#fff', fillColor: '#2f7d4f', fillOpacity: .9, sdmTmp: true }).addTo(m));
  m.fitBounds(ov.bounds); setTimeout(() => m.invalidateSize(), 80);
}

/* ------------------------------------------------------------ ejecutar modelos */
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
  if (!sdm.meta) { showMessage('sdmRunMessages', 'warning', 'Prepara primero los datos del modelo.'); return; }
  clearMessages('sdmRunMessages');
  const algos = sdmSelectedAlgos();
  if (!algos.length) { showMessage('sdmRunMessages', 'error', 'Elige al menos un algoritmo.'); return; }
  el('sdmRunProgress').style.display = 'flex'; el('sdmRunBtn').disabled = true;
  try {
    await ensureSdmPy();
    await pyf('sdm_reset_results');
    Object.assign(sdm, { scenarios: [], ensMetrics: null, ensDesc: '', lastScn: null, mapFitted: false });
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
        setBar('sdmRunFill', 'sdmRunLabel', done / total, `${SDM_LABEL[a]}: pliegue ${f + 1}/${part.folds.length}`); await tick();
        rows.push(JSON.parse(await pyf('sdm_fit_fold', a, JSON.stringify(prm(a)), f))); done++;
      }
      setBar('sdmRunFill', 'sdmRunLabel', done / total, `${SDM_LABEL[a]}: modelo final e importancia…`); await tick();
      const fin = JSON.parse(await pyf('sdm_fit_final', a, JSON.stringify(prm(a)), true)); done++;
      sdm.cv[a] = { ...sdmAggregate(rows), folds: rows }; sdm.final[a] = fin; sdm.run.push(a);
    }
    setBar('sdmRunFill', 'sdmRunLabel', 1, 'Dibujando resultados…'); await tick();
    await sdmRenderResults();
    el('sdmResults').style.display = 'block';
    showMessage('sdmRunMessages', 'success', `${algos.length} algoritmo(s) ajustado(s) y validado(s).`);
  } catch (e) { console.error(e); showMessage('sdmRunMessages', 'error', 'Error al ejecutar los modelos: ' + e.message); }
  finally { el('sdmRunBtn').disabled = false; }
}

const fx = (v, d = 3) => (v == null || !isFinite(v)) ? '—' : (+v).toFixed(d);
const pm = (m, s, d = 3, n = 2) => (m == null || !isFinite(m)) ? '—' : (n < 2 ? (+m).toFixed(d) : `${(+m).toFixed(d)} ± ${(+s || 0).toFixed(d)}`);

function sdmMetricRows() {
  const rows = sdm.run.map(a => {
    const c = sdm.cv[a], f = sdm.final[a];
    return { key: a, Modelo: SDM_LABEL[a], AUC: pm(c.auc_mean, c.auc_sd, 3, c.n_folds), 'AUC entren.': fx(f.auc_train), TSS: pm(c.tss_mean, c.tss_sd, 3, c.n_folds),
      Sens: fx(c.sens_mean, 2), Espec: fx(c.spec_mean, 2), Boyce: pm(c.boyce_mean, c.boyce_sd, 3, c.n_folds), 'OR10': fx(c.or10_mean, 2),
      'Umbral máx-TSS': fx(f.thr.maxtss), _auc: c.auc_mean,
      Detalle: a === 'maxent' ? `clases ${f.classes}; ${f.n_params} parám.; AICc ${fx(f.aicc, 1)}` : a === 'brt' ? `${f.n_iter} iteraciones` : '' };
  });
  if (sdm.ensMetrics) {
    const c = sdm.ensMetrics;
    rows.push({ key: 'ensemble', Modelo: 'Ensamble', AUC: pm(c.auc_mean, c.auc_sd, 3, c.n_folds), 'AUC entren.': fx(c.auc_train), TSS: pm(c.tss_mean, c.tss_sd, 3, c.n_folds), Sens: '—', Espec: '—',
      Boyce: pm(c.boyce_mean, c.boyce_sd, 3, c.n_folds), OR10: '—', 'Umbral máx-TSS': fx(c.thr.maxtss), _auc: c.auc_mean, Detalle: sdm.ensDesc || '' });
  }
  return rows;
}

async function sdmRenderResults() {
  const rows = sdmMetricRows();
  const cols = ['Modelo', 'AUC', 'AUC entren.', 'TSS', 'Sens', 'Espec', 'Boyce', 'OR10', 'Umbral máx-TSS', 'Detalle'].map(k => ({ key: k, label: k === 'OR10' ? 'Omisión (P10)' : k === 'AUC' ? 'AUC prueba' : k }));
  buildTable('sdmMetricsTable', cols, rows);
  const cv = {}; sdm.run.forEach(a => { cv[a] = sdm.cv[a]; });
  if (sdm.ensMetrics) cv.ensemble = sdm.ensMetrics;
  const py = await getPyodide(); py.globals.set('_cv', JSON.stringify(cv)); py.globals.set('_alg', JSON.stringify(sdm.run));
  imgInto('figSdmMetrics', py.runPython('fig_sdm_metrics(_cv)'));
  imgInto('figSdmRoc', py.runPython('fig_sdm_roc()'));
  imgInto('figSdmImp', py.runPython('fig_sdm_importance()'));
  imgInto('figSdmResp', py.runPython('fig_sdm_response(_alg)'));
  // ensamble: lista de candidatos
  const eb = el('sdmEnsList'); eb.innerHTML = '';
  sdm.run.forEach(a => { const l = document.createElement('label'); l.className = 'checkbox-label';
    l.innerHTML = `<input type="checkbox" value="${a}" checked> ${SDM_LABEL[a]} <span class="hint" style="margin:0">(AUC ${fx(sdm.cv[a].auc_mean, 2)})</span>`; eb.appendChild(l); });
  sdmRefreshModelSelects();
  await sdmShowMap();
  await sdmRenderAreaTable();
}

function sdmRefreshModelSelects() {
  const models = sdm.run.concat(sdm.ensMetrics ? ['ensemble'] : []);
  [el('sdmMapModel'), el('sdmChangeModel')].forEach(sel => {
    const cur = sel.value; sel.innerHTML = '';
    models.slice().reverse().forEach(m => sel.add(new Option(SDM_LABEL[m], m)));
    if (models.includes(cur)) sel.value = cur;
  });
  const sc = el('sdmMapScn'), cur = sc.value; sc.innerHTML = ''; sc.add(new Option('Presente', ''));
  sdm.scenarios.forEach(s => sc.add(new Option(s, s))); if (sdm.scenarios.includes(cur)) sc.value = cur;
}

el('sdmDlMetrics').addEventListener('click', () => {
  const rows = sdmMetricRows(); const cols = ['Modelo', 'AUC', 'AUC entren.', 'TSS', 'Sens', 'Espec', 'Boyce', 'OR10', 'Umbral máx-TSS', 'Detalle'];
  downloadBlob(toCSV(cols.map(k => ({ key: k, label: k })), rows), (state.query || 'especie').replace(/\s+/g, '_') + '_SDM_metricas.csv', 'text/csv;charset=utf-8');
});
el('sdmDlCoefs').addEventListener('click', async () => {
  const t = await pyf('sdm_maxent_coefs');
  if (!t) { showMessage('sdmRunMessages', 'warning', 'MaxEnt no se ha ajustado.'); return; }
  downloadBlob('﻿' + t, (state.query || 'especie').replace(/\s+/g, '_') + '_MaxEnt_coeficientes.csv', 'text/csv;charset=utf-8');
});

/* ------------------------------------------------------------ explorar MaxEnt (ENMeval) */
el('sdmTuneBtn').addEventListener('click', async () => {
  if (!sdm.meta) { showMessage('sdmRunMessages', 'warning', 'Prepara primero los datos del modelo.'); return; }
  showSpinner('Explorando MaxEnt…');
  try {
    await ensureSdmPy();
    await pyf('sdm_partition', el('sdmScheme').value, +el('sdmK').value || 4, +el('sdmSeed').value || 42, true);
    const combos = []; ['lq', 'lqh', 'lqhp'].forEach(c => [0.5, 1, 2, 4].forEach(r => combos.push([c, r])));
    const rows = [];
    for (let i = 0; i < combos.length; i++) {
      setSpinner(`MaxEnt: clases ${combos[i][0].toUpperCase()} · reg ${combos[i][1]} (${i + 1}/${combos.length})`); await tick();
      rows.push(JSON.parse(await pyf('sdm_tune_one', combos[i][0], combos[i][1], +el('sdmKnots').value || 10)));
    }
    const minA = Math.min(...rows.map(r => r.aicc)); const best = rows.reduce((b, r) => r.auc_test > b.auc_test ? r : b, rows[0]);
    rows.forEach(r => { r.dAICc = r.aicc - minA; });
    buildTable('sdmTuneTable', [
      { key: 'classes', label: 'Clases', get: r => r.classes.toUpperCase() }, { key: 'regmult', label: 'Regularización' },
      { key: 'auc_test', label: 'AUC prueba', get: r => fx(r.auc_test) }, { key: 'auc_diff', label: 'ΔAUC (entren.−prueba)', get: r => fx(r.auc_diff) },
      { key: 'or10', label: 'Omisión P10', get: r => fx(r.or10, 2) }, { key: 'n_params', label: 'Parámetros' },
      { key: 'dAICc', label: 'ΔAICc', get: r => fx(r.dAICc, 1) }], rows.sort((a, b) => a.dAICc - b.dAICc));
    showMessage('sdmRunMessages', 'info', `Mejor AUC de prueba: clases ${best.classes.toUpperCase()} con regularización ${best.regmult}; menor AICc: clases ${rows[0].classes.toUpperCase()} con regularización ${rows[0].regmult}. Ajusta los controles de MaxEnt y ejecuta los modelos.`);
  } catch (e) { console.error(e); showMessage('sdmRunMessages', 'error', 'Error al explorar MaxEnt: ' + e.message); }
  finally { hideSpinner(); }
});

/* ------------------------------------------------------------ ensamble */
el('sdmEnsBtn').addEventListener('click', async () => {
  clearMessages('sdmEnsMessages');
  const minAuc = +el('sdmEnsMinAuc').value || 0;
  const chosen = [...el('sdmEnsList').querySelectorAll('input:checked')].map(i => i.value).filter(a => (sdm.cv[a].auc_mean || 0) >= minAuc);
  if (!chosen.length) { showMessage('sdmEnsMessages', 'error', `Ningún modelo seleccionado alcanza AUC ≥ ${minAuc}.`); return; }
  showSpinner('Construyendo el ensamble…');
  try {
    const cv = {}; chosen.forEach(a => { cv[a] = sdm.cv[a]; });
    const r = JSON.parse(await pyf('sdm_ensemble', JSON.stringify(chosen), el('sdmEnsMethod').value, el('sdmEnsWeight').value, JSON.stringify(cv)));
    sdm.ensMetrics = r; sdm.final.ensemble = { thr: r.thr, auc_train: r.auc_train };
    sdm.ensDesc = chosen.map((a, i) => `${SDM_LABEL[a]} ${(r.weights[i] * 100).toFixed(0)}%`).join(', ');
    sdmRefreshModelSelects(); el('sdmMapModel').value = 'ensemble';
    const cvAll = {}; sdm.run.forEach(a => { cvAll[a] = sdm.cv[a]; }); cvAll.ensemble = r;
    const py = await getPyodide(); py.globals.set('_cv', JSON.stringify(cvAll));
    buildTable('sdmMetricsTable', ['Modelo', 'AUC', 'AUC entren.', 'TSS', 'Sens', 'Espec', 'Boyce', 'OR10', 'Umbral máx-TSS', 'Detalle'].map(k => ({ key: k, label: k === 'OR10' ? 'Omisión (P10)' : k === 'AUC' ? 'AUC prueba' : k })), sdmMetricRows());
    imgInto('figSdmMetrics', py.runPython('fig_sdm_metrics(_cv)'));
    showMessage('sdmEnsMessages', 'success', `Ensamble de ${chosen.length} modelo(s): ${sdm.ensDesc}. AUC de prueba ${fx(r.auc_mean)}, TSS ${fx(r.tss_mean)}.`);
    await sdmShowMap(); await sdmRenderAreaTable();
  } catch (e) { console.error(e); showMessage('sdmEnsMessages', 'error', 'Error en el ensamble: ' + e.message); }
  finally { hideSpinner(); }
});

/* ------------------------------------------------------------ mapas */
const hex2rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mercY = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
const mercInv = y => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI;
const MAGMA = ['#000004', '#3b0f70', '#8c2981', '#de4968', '#fe9f6d', '#fcfdbf'];
const lut = (ramp, n = 256) => Array.from({ length: n }, (_, i) => hex2rgb(mapkit.rampColor(ramp, i / (n - 1))));
const LUT_VIR = lut(mapkit.SEQ_RAMP), LUT_MAG = lut(MAGMA);

/* Convierte una malla (fila 0 = norte) en imagen, remuestreada en filas equiespaciadas en Mercator
   para que las celdas coincidan con el mapa base. */
function sdmOverlay(values, meta, mode, opt = {}) {
  const { nrow, ncol, west, north, dx, dy } = meta, south = north - nrow * dy, east = west + ncol * dx;
  const yN = mercY(north), yS = mercY(south), k = (yN - yS) / ((north - south) * Math.PI / 180);
  const outH = Math.max(nrow, Math.min(3000, Math.ceil(nrow * k)));
  const cv = document.createElement('canvas'); cv.width = ncol; cv.height = outH;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(ncol, outH), d = img.data;
  const sdMax = opt.sdMax || 0.5;
  for (let r = 0; r < outH; r++) {
    const lat = mercInv(yN - (r + 0.5) / outH * (yN - yS));
    const i = Math.min(nrow - 1, Math.max(0, Math.floor((north - lat) / dy)));
    for (let c = 0; c < ncol; c++) {
      const v = values[i * ncol + c], p = (r * ncol + c) * 4; let rgb = null, a = 0;
      if (mode === 'mask') { if (v === 1) { rgb = [76, 120, 168]; a = 70; } else if (v === 0) { rgb = [200, 200, 200]; a = 25; } }
      else if (mode === 'cont') { if (isFinite(v)) { rgb = LUT_VIR[Math.max(0, Math.min(255, Math.round(v * 255)))]; a = 235; } }
      else if (mode === 'sd') { if (isFinite(v)) { rgb = LUT_MAG[Math.max(0, Math.min(255, Math.round(v / sdMax * 255)))]; a = 235; } }
      else if (mode === 'bin') { if (isFinite(v)) { if (v >= opt.thr) { rgb = [47, 125, 79]; a = 215; } else { rgb = [225, 225, 225]; a = 70; } } }
      else if (mode === 'change') { if (v === 1) { rgb = [76, 120, 168]; a = 215; } else if (v === 2) { rgb = [84, 162, 75]; a = 230; } else if (v === 3) { rgb = [228, 87, 86]; a = 230; } else if (v === 0) { rgb = [225, 225, 225]; a = 60; } }
      else if (mode === 'mess') { if (isFinite(v)) { if (v < 0) { const t = Math.min(1, -v / 100); rgb = [228, 87 + (1 - t) * 90, 86 + (1 - t) * 90]; a = 235; } else { rgb = [220, 230, 245]; a = Math.round(40 + Math.min(1, v / 100) * 60); } } }
      if (rgb) { d[p] = rgb[0]; d[p + 1] = rgb[1]; d[p + 2] = rgb[2]; d[p + 3] = a; }
    }
  }
  ctx.putImageData(img, 0, 0);
  return { url: cv.toDataURL('image/png'), bounds: [[south, west], [north, east]] };
}

function sdmEnsureMap() {
  if (sdm.map) return;
  sdm.map = mapkit.makeBaseMap('mapSdm'); sdm.map.createPane('sdmPane').style.zIndex = 350;
}
function sdmLegendGrad(title, ramp, lo, hi, note) {
  const stops = Array.from({ length: 8 }, (_, i) => mapkit.rampColor(ramp, i / 7)).join(',');
  return `<div class="legend-grad" style="min-width:260px"><strong>${title}</strong>
    <div style="height:12px;border:1px solid rgba(0,0,0,.2);background:linear-gradient(to right,${stops})"></div>
    <div style="display:flex;justify-content:space-between"><span>${lo}</span><span>${hi}</span></div>${note ? `<span style="color:var(--text-muted)">${note}</span>` : ''}</div>`;
}
const swatch = (c, t) => `<div class="legend-item"><span class="legend-swatch" style="background:${c};border-radius:3px"></span>${t}</div>`;

async function sdmShowMap(forced) {
  if (!sdm.meta || !sdm.run.length) return;
  sdmEnsureMap();
  let model = el('sdmMapModel').value || sdm.run[0], type = forced ? forced.type : el('sdmMapType').value;
  const scn = el('sdmMapScn').value, kind = el('sdmThrKind').value;
  if (type === 'sd' && !sdm.ensMetrics) { showMessage('sdmEnsMessages', 'info', 'El mapa de incertidumbre requiere construir primero el ensamble.'); type = 'cont'; el('sdmMapType').value = 'cont'; }
  if (type === 'sd') model = 'ensemble';
  let arr, ov, legend = '';
  if (forced && forced.type === 'change') {
    arr = await pyf('sdm_get_change', forced.scn, forced.model); ov = sdmOverlay(arr, sdm.meta, 'change');
    legend = '<strong style="width:100%">Cambio de área idónea (' + SDM_LABEL[forced.model] + ')</strong>' + swatch('#4c78a8', 'Estable idónea') + swatch('#54a24b', 'Ganancia') + swatch('#e45756', 'Pérdida') + swatch('#e1e1e1', 'Estable no idónea');
  } else if (forced && forced.type === 'mess') {
    arr = await pyf('sdm_get_mess', forced.scn); ov = sdmOverlay(arr, sdm.meta, 'mess');
    legend = '<strong style="width:100%">MESS · similitud ambiental con el área de calibración</strong>' + swatch('#e45756', 'Negativo = clima sin análogo (extrapolación)') + swatch('#dce6f5', 'Positivo = dentro del rango calibrado');
  } else if (type === 'sd') {
    arr = await pyf('sdm_get_pred', 'ensemble_sd', scn); let mx = 0; for (const v of arr) if (isFinite(v) && v > mx) mx = v;
    ov = sdmOverlay(arr, sdm.meta, 'sd', { sdMax: Math.max(mx, 0.05) });
    legend = sdmLegendGrad('Dispersión entre modelos (DE de idoneidades normalizadas)', MAGMA, '0', mx.toFixed(2), 'Más alto = mayor desacuerdo entre algoritmos');
  } else if (type === 'bin') {
    arr = await pyf('sdm_get_pred', model, scn); const thr = await pyf('sdm_thr', model, kind);
    ov = sdmOverlay(arr, sdm.meta, 'bin', { thr });
    legend = `<strong style="width:100%">Presencia / ausencia · ${SDM_LABEL[model]}</strong>` + swatch('#2f7d4f', `Idóneo (≥ ${(+thr).toFixed(3)})`) + swatch('#e1e1e1', 'No idóneo');
  } else {
    arr = await pyf('sdm_get_pred', model, scn); ov = sdmOverlay(arr, sdm.meta, 'cont');
    legend = sdmLegendGrad('Idoneidad · ' + SDM_LABEL[model] + (scn ? ' · ' + scn : ''), mapkit.SEQ_RAMP, '0 (baja)', '1 (alta)',
      model === 'maxent' ? 'Salida cloglog de MaxEnt' : model === 'ensemble' ? 'Idoneidades normalizadas (0–1)' : 'Escala propia de cada algoritmo');
  }
  if (sdm.overlay) sdm.map.removeLayer(sdm.overlay);
  sdm.overlay = L.imageOverlay(ov.url, ov.bounds, { opacity: +el('sdmOpacity').value, interactive: false, pane: 'sdmPane' }).addTo(sdm.map);
  if (sdm.ptsLayer) sdm.map.removeLayer(sdm.ptsLayer);
  sdm.ptsLayer = L.layerGroup(sdm.pres.map(p => L.circleMarker(p, { radius: 2.5, weight: 1, color: '#fff', fillColor: '#111', fillOpacity: .85 })));
  if (el('sdmShowPts').checked) sdm.ptsLayer.addTo(sdm.map);
  if (!sdm.mapFitted) { sdm.map.fitBounds(ov.bounds); sdm.mapFitted = true; }
  setTimeout(() => sdm.map.invalidateSize(), 60);
  el('sdmLegend').innerHTML = legend;
  sdm.lastView = forced ? { ...forced } : { type, model, scn, kind };
}
['sdmMapModel', 'sdmMapType', 'sdmMapScn', 'sdmThrKind'].forEach(id => el(id).addEventListener('change', async () => { showSpinner('Dibujando mapa…'); try { await sdmShowMap(); if (id === 'sdmThrKind') await sdmRenderAreaTable(); } finally { hideSpinner(); } }));
el('sdmOpacity').addEventListener('input', () => { if (sdm.overlay) sdm.overlay.setOpacity(+el('sdmOpacity').value); });
el('sdmShowPts').addEventListener('change', () => { if (!sdm.ptsLayer) return; if (el('sdmShowPts').checked) sdm.ptsLayer.addTo(sdm.map); else sdm.map.removeLayer(sdm.ptsLayer); });

async function sdmRenderAreaTable() {
  const kind = el('sdmThrKind').value;
  const rows = JSON.parse(await pyf('sdm_area_table', kind));
  const cols = [{ key: 'label', label: 'Modelo' }, { key: 'thr', label: 'Umbral', get: r => fx(r.thr) }, { key: 'present', label: 'Presente (km²)', get: r => Math.round(r.present).toLocaleString() }]
    .concat(sdm.scenarios.map(s => ({ key: s, label: s + ' (km²)', get: r => r[s] == null ? '—' : Math.round(r[s]).toLocaleString() })));
  buildTable('sdmAreaTable', cols, rows);
}

/* exportaciones */
const sdmFileTag = () => (state.query || 'especie').replace(/\s+/g, '_') + '_' + (sdm.lastView ? (sdm.lastView.model || sdm.lastView.type) : 'sdm');
el('sdmMapPng').addEventListener('click', async () => {
  showSpinner('Generando imagen…');
  try { await mapkit.exportMapPNG('mapSdm', sdmFileTag() + '.png'); }
  catch (e) { showMessage('sdmEnsMessages', 'warning', 'No se pudo exportar el PNG (teselas protegidas). Usa la herramienta de recorte.'); }
  finally { hideSpinner(); }
});
el('sdmMapAsc').addEventListener('click', async () => {
  const v = sdm.lastView || {}; if (!v.model || v.type === 'change' || v.type === 'mess') { showMessage('sdmEnsMessages', 'info', 'Muestra primero un mapa de idoneidad (continuo o binario).'); return; }
  const txt = await pyf('sdm_asc', v.type === 'sd' ? 'ensemble' : v.model, v.kind, v.scn || '', v.type === 'bin');
  downloadBlob(txt, sdmFileTag() + '.asc', 'text/plain;charset=utf-8');
});
/* GeoTIFF mínimo: una banda Float32 sin compresión, EPSG:4326, NoData −9999 (compatible con QGIS/ArcGIS/R). */
function sdmEncodeGeoTiff(values, w, h, west, north, dx, dy, nodata = -9999) {
  const nd = new TextEncoder().encode(String(nodata) + '\0');
  const scale = new Float64Array([dx, dy, 0]), tie = new Float64Array([0, 0, 0, west, north, 0]);
  const gk = new Uint16Array([1, 1, 0, 3, 1024, 0, 1, 2, 1025, 0, 1, 1, 2048, 0, 1, 4326]);   // geográfico, PixelIsArea, WGS84
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
  const v = sdm.lastView || {}; if (!v.model || v.type === 'change' || v.type === 'mess') { showMessage('sdmEnsMessages', 'info', 'Muestra primero un mapa de idoneidad (continuo o binario).'); return; }
  try {
    const name = v.type === 'sd' ? 'ensemble_sd' : v.model; const arr = await pyf('sdm_get_pred', name, v.scn || '');
    const thr = v.type === 'bin' ? await pyf('sdm_thr', v.model, v.kind) : null;
    const m = sdm.meta, vals = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) vals[i] = isFinite(arr[i]) ? (thr != null ? (arr[i] >= thr ? 1 : 0) : arr[i]) : -9999;
    downloadBlob(new Blob([sdmEncodeGeoTiff(vals, m.ncol, m.nrow, m.west, m.north, m.dx, m.dy)], { type: 'image/tiff' }), sdmFileTag() + '.tif');
  } catch (e) { console.error(e); showMessage('sdmEnsMessages', 'error', 'No se pudo escribir el GeoTIFF: ' + e.message + ' — usa la malla ASCII.'); }
});

/* ------------------------------------------------------------ proyección a otro escenario */
el('sdmProjBtn').addEventListener('click', async () => {
  clearMessages('sdmProjMessages');
  const files = [...el('sdmScnFiles').files];
  if (!files.length) { showMessage('sdmProjMessages', 'error', 'Selecciona los archivos .tif del escenario.'); return; }
  if (!sdm.run.length) { showMessage('sdmProjMessages', 'error', 'Ajusta primero los modelos.'); return; }
  const name = (el('sdmScnName').value || 'Escenario').trim();
  if (sdm.scenarios.includes(name)) { showMessage('sdmProjMessages', 'error', 'Ya existe un escenario con ese nombre; usa otro.'); return; }
  showSpinner('Leyendo el escenario…');
  try {
    const info = [];
    for (const f of files) { const t = await GeoTIFF.fromBlob(f); const im = await t.getImage(); info.push({ file: f, bands: im.getSamplesPerPixel() }); }
    const multi = info.find(i => i.bands >= 19);
    const sources = sdm.keys.map(k => {
      if (multi && k.startsWith('bio_')) return { file: multi.file, band: +k.split('_')[1] - 1 };
      const f = files.find(fl => matchRasterFile(fl.name) === k);
      if (f) return { file: f, band: 0 };
      if (k === 'elev' && state.env.files.elev) return { file: state.env.files.elev, band: 0 };
      throw new Error(`El escenario no incluye la variable ${k}.`);
    });
    const { stack, meta } = await sdmReadStack(sdm.keys, sources, null, 0, (i, n, lab) => setSpinner(`Escenario: ${lab} (${i}/${n})`), sdm.meta);
    setSpinner('Proyectando los modelos…'); await tick();
    const py = await getPyodide(); py.globals.set('sdm_stack2', stack); py.globals.set('_meta2', JSON.stringify({ ...meta, ref: undefined }));
    py.globals.set('_scn', name);
    const r = JSON.parse(py.runPython('sdm_project(_scn, sdm_stack2, _meta2)'));
    sdm.scenarios.push(name); sdmRefreshModelSelects(); el('sdmMapScn').value = name;
    showMessage('sdmProjMessages', 'success', `Escenario «${name}» proyectado (${r.n_valid.toLocaleString()} celdas válidas).`);
    await sdmRenderChangeTable(name); el('sdmProjOut').style.display = 'block';
    await sdmRenderAreaTable(); await sdmShowMap();
  } catch (e) { console.error(e); showMessage('sdmProjMessages', 'error', 'Error en la proyección: ' + e.message); }
  finally { hideSpinner(); }
});

async function sdmRenderChangeTable(scn) {
  const kind = el('sdmThrKind').value, rows = [];
  for (const m of sdm.run.concat(sdm.ensMetrics ? ['ensemble'] : [])) {
    const r = JSON.parse(await pyf('sdm_change', scn, m, kind));
    rows.push({ modelo: SDM_LABEL[m], now: r.now, future: r.future, stable: r.stable_suit, gain: r.gain, loss: r.loss, net: r.now > 0 ? (r.future - r.now) / r.now * 100 : NaN });
  }
  const k = v => Math.round(v).toLocaleString();
  buildTable('sdmChangeTable', [{ key: 'modelo', label: 'Modelo' }, { key: 'now', label: 'Presente (km²)', get: r => k(r.now) },
    { key: 'future', label: scn + ' (km²)', get: r => k(r.future) }, { key: 'stable', label: 'Estable (km²)', get: r => k(r.stable) },
    { key: 'gain', label: 'Ganancia (km²)', get: r => k(r.gain) }, { key: 'loss', label: 'Pérdida (km²)', get: r => k(r.loss) },
    { key: 'net', label: 'Cambio neto', get: r => isFinite(r.net) ? (r.net > 0 ? '+' : '') + r.net.toFixed(1) + ' %' : '—' }], rows);
  sdm.lastScn = scn;
}
el('sdmShowChange').addEventListener('click', async () => {
  const scn = el('sdmMapScn').value || sdm.lastScn; if (!scn) return; const m = el('sdmChangeModel').value;
  showSpinner('Dibujando cambio…'); try { await pyf('sdm_change', scn, m, el('sdmThrKind').value); await sdmShowMap({ type: 'change', scn, model: m }); } finally { hideSpinner(); }
});
el('sdmShowMess').addEventListener('click', async () => {
  const scn = el('sdmMapScn').value || sdm.lastScn; if (!scn) return;
  showSpinner('Calculando MESS…');
  try {
    const r = JSON.parse(await pyf('sdm_mess', scn));
    const top = Object.entries(r.by_var).sort((a, b) => b[1] - a[1]).filter(e => e[1] > 0).slice(0, 4).map(e => `${e[0]} (${e[1]} celdas)`).join(', ');
    el('sdmMessInfo').textContent = `${r.pct_novel.toFixed(1)} % de las celdas tienen clima sin análogo en el área de calibración.` + (top ? ' Variables más limitantes: ' + top + '.' : '');
    await sdmShowMap({ type: 'mess', scn });
  } finally { hideSpinner(); }
});

window.sdmOnShow = sdmOnShow;
