/* Step 5: extraction of raster variables at the cleaned points + thematic map + soil query. */

/* [code shown, Spanish name, unit, English name] */
const BIOCLIM_META = {
  bio_1:  ['BIO1',  'Temperatura media anual', '°C', 'Annual mean temperature'],
  bio_2:  ['BIO2',  'Rango diurno medio de temperatura', '°C', 'Mean diurnal range'],
  bio_3:  ['BIO3',  'Isotermalidad (BIO2/BIO7×100)', '%', 'Isothermality (BIO2/BIO7×100)'],
  bio_4:  ['BIO4',  'Estacionalidad de la temperatura (DE×100)', '°C×100', 'Temperature seasonality (SD×100)'],
  bio_5:  ['BIO5',  'Temp. máxima del mes más cálido', '°C', 'Max temperature of warmest month'],
  bio_6:  ['BIO6',  'Temp. mínima del mes más frío', '°C', 'Min temperature of coldest month'],
  bio_7:  ['BIO7',  'Rango anual de temperatura (BIO5−BIO6)', '°C', 'Temperature annual range (BIO5−BIO6)'],
  bio_8:  ['BIO8',  'Temp. media del trimestre más húmedo', '°C', 'Mean temperature of wettest quarter'],
  bio_9:  ['BIO9',  'Temp. media del trimestre más seco', '°C', 'Mean temperature of driest quarter'],
  bio_10: ['BIO10', 'Temp. media del trimestre más cálido', '°C', 'Mean temperature of warmest quarter'],
  bio_11: ['BIO11', 'Temp. media del trimestre más frío', '°C', 'Mean temperature of coldest quarter'],
  bio_12: ['BIO12', 'Precipitación anual', 'mm', 'Annual precipitation'],
  bio_13: ['BIO13', 'Precipitación del mes más húmedo', 'mm', 'Precipitation of wettest month'],
  bio_14: ['BIO14', 'Precipitación del mes más seco', 'mm', 'Precipitation of driest month'],
  bio_15: ['BIO15', 'Estacionalidad de la precipitación (CV)', '%', 'Precipitation seasonality (CV)'],
  bio_16: ['BIO16', 'Precipitación del trimestre más húmedo', 'mm', 'Precipitation of wettest quarter'],
  bio_17: ['BIO17', 'Precipitación del trimestre más seco', 'mm', 'Precipitation of driest quarter'],
  bio_18: ['BIO18', 'Precipitación del trimestre más cálido', 'mm', 'Precipitation of warmest quarter'],
  bio_19: ['BIO19', 'Precipitación del trimestre más frío', 'mm', 'Precipitation of coldest quarter'],
  elev:   ['ELEV',  'Altitud', 'm', 'Elevation'],
};
const BIO_KEYS = Object.keys(BIOCLIM_META);          // includes elev
const BIO_ONLY = BIO_KEYS.filter(k => k !== 'elev'); // bio_1..bio_19
const varCode = k => BIOCLIM_META[k] ? BIOCLIM_META[k][0] : k;
const varName = k => BIOCLIM_META[k] ? T(BIOCLIM_META[k][1], BIOCLIM_META[k][3]) : k;
const varNameL2 = k => BIOCLIM_META[k] ? L2(BIOCLIM_META[k][1], BIOCLIM_META[k][3]) : esc(k);

state.env = { files: {}, resolution: null, table: [], sampling: 'bilinear',
  dropNoData: true, soilRunning: false };

/* ---------- 1. file selection ---------- */

function matchRasterFile(name) {
  const n = name.toLowerCase();
  if (!/\.tiff?$/.test(n)) return null;
  const bio = n.match(/bio[_-]?(\d{1,2})(?!\d)/);
  if (bio) { const i = +bio[1]; if (i >= 1 && i <= 19) return 'bio_' + i; }
  if (/elev|elevation|_alt|dem|srtm/.test(n)) return 'elev';
  if (/koppen|köppen|beck_kg|_kg_|kg_v|climate_class/.test(n)) {
    if (/conf|future|_0p5\.|_0p083\./.test(n)) return null;   // skip confidence, future and coarse-resolution files
    return 'koppen';
  }
  return null;
}

function koppenScore(n) { // higher = preferred
  n = n.toLowerCase();
  return (/present/.test(n) ? 4 : 0) + (/0p0083|0083|0\.0083/.test(n) ? 2 : 0) + (/\.tif$/.test(n) ? 1 : 0);
}

function handleEnvFiles(fileList, source) {
  const files = [...fileList];
  const found = {};
  let res = null;
  for (const f of files) {
    const key = matchRasterFile(f.name);
    if (!key) continue;
    if (key === 'koppen' && found.koppen && koppenScore(found.koppen.name) >= koppenScore(f.name)) continue;
    found[key] = f;
    const rm = f.name.toLowerCase().match(/wc2\.1_(\d+\.?\d*[ms])_/);
    if (rm) res = rm[1];
  }
  state.env.files = found;
  state.env.resolution = res;
  renderEnvFileReport();
  setPickStatus(source, files, found);
}

function renderEnvFileReport() {
  const box = el('envFileReport');
  const f = state.env.files;
  const want = [...BIO_ONLY, 'elev', 'koppen'];
  const labelOf = k => k === 'koppen' ? 'Köppen' : k === 'elev' ? L2('Altitud', 'Elevation') : k.toUpperCase().replace('_', '');
  const badges = want.map(k =>
    `<span class="layer-badge ${f[k] ? 'ok' : 'missing'}">${f[k] ? '✓' : '×'} ${labelOf(k)}</span>`
  ).join('');
  const nBio = BIO_ONLY.filter(k => f[k]).length;
  const yn = (v, es, en) => v ? L2(es[0], en[0]) : L2(es[1], en[1]);
  box.innerHTML =
    `<div class="msg msg-${nBio === 19 ? 'success' : nBio ? 'warning' : 'error'}">
      ${nBio}/19 ${L2('bioclimáticas', 'bioclimatic')} · ${L2('altitud', 'elevation')} ${yn(f.elev, ['sí', 'no'], ['yes', 'no'])} · Köppen ${yn(f.koppen, ['sí', 'no'], ['yes', 'no'])}
      ${state.env.resolution ? ' · ' + L2('resolución', 'resolution') + ' ' + state.env.resolution : ''}
     </div>
     <div class="layer-badges">${badges}</div>`;
  el('envExtractBtn').disabled = nBio === 0;
  if (nBio) enableStep(10);        // the agroclimatic step only needs the layers, not the extracted table
}

el('envFolderBtn').addEventListener('click', () => el('envFolder').click());
el('envFilesBtn').addEventListener('click', () => el('envFiles').click());
el('envFolder').addEventListener('change', e => { handleEnvFiles(e.target.files, 'folder'); e.target.value = ''; });
el('envFiles').addEventListener('change', e => { handleEnvFiles(e.target.files, 'files'); e.target.value = ''; });

/* Example layers, read from the datos/ folder of the program: Köppen-Geiger travels with it, and the WorldClim
   layers are downloaded once by whoever uses it (datos/LEE-ME.md says how), because WorldClim does not allow them
   to be redistributed. Reading that folder needs the local server: from file:// the browser refuses to fetch it,
   and the folder and file pickers are the way in.
   The first branch is an escape hatch: whoever wants the double-click example back can build their own
   js/example-rasters.js from the layers they downloaded and load it from index.html. Nothing ships with one. */
function base64ToFile(b64, name) {
  const bin = atob(b64), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new File([u8], name, { type: 'image/tiff' });
}
async function loadExampleRasters() {
  const found = {};
  if (window.EXAMPLE_RASTERS) {
    for (const [key, o] of Object.entries(window.EXAMPLE_RASTERS.layers)) found[key] = base64ToFile(o, window.EXAMPLE_RASTERS.names[key]);
    state.env.resolution = window.EXAMPLE_RASTERS.resolution;
  } else {
    const names = [...BIO_ONLY.map(k => ['datos/worldclim/wc2.1_10m_bio_' + k.split('_')[1] + '.tif', k]),
      ['datos/worldclim/wc2.1_10m_elev.tif', 'elev'], ['datos/koppen/Beck_KG_V1_present_0p0083.tif', 'koppen']];
    for (const [url, key] of names) {
      const r = await fetch(url); if (!r.ok) continue;
      found[key] = new File([await r.blob()], url.split('/').pop(), { type: 'image/tiff' });
    }
    state.env.resolution = '10m';
  }
  if (!Object.keys(found).length) throw bilingualError('no se encontraron los archivos de ejemplo', 'the example files were not found');
  state.env.files = found;
}
/* what to say when datos/ has nothing to give: it is the usual case the first time, and it is not a failure */
function comoConseguirLasCapas() {
  return L2('No hay capas en la carpeta <span class="ruta">datos/</span> del programa. Las de WorldClim no se distribuyen con él porque su licencia no lo permite: descárgalas una vez de <b>worldclim.org</b> —10 arc-min basta para aprender— y déjalas en <span class="ruta">datos/worldclim/</span>; las instrucciones están en <span class="ruta">datos/LEE-ME.md</span>. Si ya las tienes en cualquier otra carpeta, los dos botones de la izquierda las cargan directamente y son la vía cuando abres el programa con doble clic.',
    'There are no layers in the program’s <span class="ruta">datos/</span> folder. The WorldClim ones are not distributed with it because their licence does not allow it: download them once from <b>worldclim.org</b> — 10 arc-minutes is enough to learn — and drop them in <span class="ruta">datos/worldclim/</span>; the instructions are in <span class="ruta">datos/LEE-ME.md</span>. If you already have them anywhere else, the two buttons on the left load them straight away, and they are the way in when you open the program with a double click.');
}
el('envUseSample').addEventListener('click', async () => {
  showSpinner(T('Cargando las capas de datos/…', 'Loading the layers in datos/…'));
  try {
    await loadExampleRasters();
    renderEnvFileReport();
    setPickStatus('sample', [], state.env.files);
    const n = Object.keys(state.env.files).length;
    showMessage('envMessages', 'info', L2(`${n} capas cargadas desde la carpeta <span class="ruta">datos/</span> del programa. Los registros que caigan fuera de su cobertura quedan sin dato y se descartan.`,
      `${n} layers loaded from the program’s <span class="ruta">datos/</span> folder. Records falling outside their coverage get no data and are dropped.`));
  } catch (e) {
    showMessage('envMessages', 'warning', comoConseguirLasCapas());
  } finally { hideSpinner(); }
});
window.loadExampleRasters = loadExampleRasters;

/* ---------- 2. sampling a GeoTIFF ---------- */

function isNoData(v, nd) {
  return v == null || Number.isNaN(v) || v < -1e30 || (nd != null && v === nd);
}

async function openGeo(file) {
  const tiff = await GeoTIFF.fromBlob(file);
  const image = await tiff.getImage();
  const [ox, oy] = image.getOrigin();
  const [rx, ryRaw] = image.getResolution();
  const ry = ryRaw; // normally negative
  return {
    image, ox, oy, rx, ry,
    w: image.getWidth(), h: image.getHeight(),
    nd: image.getGDALNoData(),
  };
}

/* Returns an array of values (or null) for each {lat, lon} point. */
async function sampleGeo(geo, pts, { categorical }) {
  const method = categorical ? 'nearest' : state.env.sampling;
  const cols = pts.map(p => (p.lon - geo.ox) / geo.rx);
  const rows = pts.map(p => (p.lat - geo.oy) / geo.ry);
  const finite = cols.map((c, i) => isFinite(c) && isFinite(rows[i]) &&
    c >= 0 && c < geo.w && rows[i] >= 0 && rows[i] < geo.h);

  let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
  cols.forEach((c, i) => { if (!finite[i]) return;
    minC = Math.min(minC, c); maxC = Math.max(maxC, c);
    minR = Math.min(minR, rows[i]); maxR = Math.max(maxR, rows[i]); });
  if (!isFinite(minC)) return pts.map(() => null);

  const x0 = Math.max(0, Math.floor(minC) - 1), x1 = Math.min(geo.w, Math.ceil(maxC) + 2);
  const y0 = Math.max(0, Math.floor(minR) - 1), y1 = Math.min(geo.h, Math.ceil(maxR) + 2);
  const wpx = x1 - x0, hpx = y1 - y0;

  const bilinAt = (band, ww, hh, c, r) => {
    const c0 = Math.floor(c), r0 = Math.floor(r);
    const fc = c - c0, fr = r - r0;
    const get = (cc, rr) => {
      cc = Math.max(0, Math.min(ww - 1, cc)); rr = Math.max(0, Math.min(hh - 1, rr));
      return band[rr * ww + cc];
    };
    const v00 = get(c0, r0), v10 = get(c0 + 1, r0), v01 = get(c0, r0 + 1), v11 = get(c0 + 1, r0 + 1);
    if ([v00, v10, v01, v11].some(v => isNoData(v, geo.nd))) {
      const nv = get(Math.round(c), Math.round(r));
      return isNoData(nv, geo.nd) ? null : nv;
    }
    return (v00 * (1 - fc) + v10 * fc) * (1 - fr) + (v01 * (1 - fc) + v11 * fc) * fr;
  };

  if (wpx > 0 && hpx > 0 && wpx * hpx <= 24e6) {
    const band = (await geo.image.readRasters({ window: [x0, y0, x1, y1], samples: [0] }))[0];
    return pts.map((p, i) => {
      if (!finite[i]) return null;
      const c = cols[i] - x0, r = rows[i] - y0;
      if (method === 'nearest') {
        const v = band[Math.min(hpx - 1, Math.round(r)) * wpx + Math.min(wpx - 1, Math.round(c))];
        return isNoData(v, geo.nd) ? null : v;
      }
      return bilinAt(band, wpx, hpx, c, r);
    });
  }

  // point-by-point mode (very scattered points)
  const out = new Array(pts.length).fill(null);
  for (let i = 0; i < pts.length; i++) {
    if (!finite[i]) continue;
    const c = cols[i], r = rows[i];
    const cc = Math.max(0, Math.floor(c) - 1), rr = Math.max(0, Math.floor(r) - 1);
    const cw = Math.min(geo.w, cc + 3) - cc, rh = Math.min(geo.h, rr + 3) - rr;
    const band = (await geo.image.readRasters({ window: [cc, rr, cc + cw, rr + rh], samples: [0] }))[0];
    out[i] = method === 'nearest'
      ? (() => { const v = band[Math.min(rh - 1, Math.round(r - rr)) * cw + Math.min(cw - 1, Math.round(c - cc))];
          return isNoData(v, geo.nd) ? null : v; })()
      : bilinAt(band, cw, rh, c - cc, r - rr);
  }
  return out;
}

/* ---------- 3. full extraction ---------- */

el('envExtractBtn').addEventListener('click', extractAll);

async function extractAll() {
  const recs = state.clean;
  if (!recs.length) { showMessage('envMessages', 'error', L2('No hay registros depurados (vuelve al paso 3).', 'There are no cleaned records (go back to step 3).')); return; }
  state.env.sampling = el('envSampling').value;
  state.env.dropNoData = el('envDropNoData').checked;

  const pts = recs.map(r => ({ lat: r.decimalLatitude, lon: r.decimalLongitude }));
  const rows = recs.map(r => ({
    key: r.key, taxon: r.taxon, scientificName: r.scientificName, taxonRank: r.taxonRank,
    country: r.country, stateProvince: r.stateProvince, year: r.year,
    decimalLatitude: r.decimalLatitude, decimalLongitude: r.decimalLongitude,
  }));

  const layers = [...BIO_ONLY.filter(k => state.env.files[k]),
    ...(state.env.files.elev ? ['elev'] : []),
    ...(state.env.files.koppen ? ['koppen'] : [])];

  el('envProgress').style.display = 'flex';
  el('envExtractBtn').disabled = true;
  clearMessages('envMessages');
  let done = 0;

  try {
    for (const key of layers) {
      el('envProgressLabel').textContent = `${T('Leyendo', 'Reading')} ${key === 'koppen' ? 'Köppen' : key.toUpperCase()}… (${done}/${layers.length})`;
      el('envProgressFill').style.width = Math.round(done / layers.length * 100) + '%';
      await new Promise(r => setTimeout(r, 15)); // let the browser paint
      const geo = await openGeo(state.env.files[key]);
      const vals = await sampleGeo(geo, pts, { categorical: key === 'koppen' });
      vals.forEach((v, i) => {
        if (key === 'koppen') {
          const iv = v == null ? null : Math.round(v);
          rows[i].koppen = iv;
          rows[i].koppen_code = iv == null ? null : (KOPPEN_LEGEND[iv] ? KOPPEN_LEGEND[iv].code : String(iv));
        } else {
          rows[i][key] = v == null ? null : +(+v).toFixed(key === 'elev' ? 0 : 2);
        }
      });
      done++;
    }
    el('envProgressFill').style.width = '100%';

    // flag / drop points with no bioclimatic data
    const bioPresent = BIO_ONLY.filter(k => state.env.files[k]);
    let dropped = 0;
    rows.forEach(row => {
      row._noData = bioPresent.some(k => row[k] == null);
      if (row._noData) dropped++;
    });
    state.env.table = state.env.dropNoData ? rows.filter(r => !r._noData) : rows;

    const dn = state.env.dropNoData;
    showMessage('envMessages', 'success',
      L2(`Extracción completa: ${layers.length} capas × ${rows.length} puntos.`, `Extraction complete: ${layers.length} layers × ${rows.length} points.`) +
      (dropped ? ' ' + L2(`${dropped} punto(s) sin dato bioclimático (${dn ? 'descartados' : 'marcados'}).`,
        `${dropped} point(s) without bioclimatic data (${dn ? 'dropped' : 'flagged'}).`) : ''));

    renderEnvResult();
    if (window.corrInvalidate) corrInvalidate();     // new extraction: recompute the default selection of step 6
    buildEnvMap();
    el('soilCard').style.display = 'block';
    enableStep(5);
    /* with the table extracted, every analysis step has what it needs: correlation, statistics and the multivariate
       block work on this table, and the modelling step on the table plus the raster files that produced it. Before,
       step 9 only became available after running the clustering, which it does not need at all. */
    [6, 7, 8, 9].forEach(enableStep);
  } catch (err) {
    console.error(err);
    showMessage('envMessages', 'error', L2('Error leyendo los GeoTIFF: ', 'Error reading the GeoTIFF files: ') + esc(err.message) +
      '<br>' + L2('Revisa que los archivos no estén corruptos y que sean WorldClim 2.1 (EPSG:4326).',
        'Check that the files are not corrupted and that they are WorldClim 2.1 (EPSG:4326).'));
  } finally {
    el('envExtractBtn').disabled = false;
  }
}

/* ---------- 4. results: summary + table ---------- */

function envVarKeys() {
  const t = state.env.table;
  if (!t.length) return [];
  const keys = [...BIO_ONLY, 'elev'].filter(k => t.some(r => r[k] != null));
  if (t.some(r => r.koppen != null)) keys.push('koppen');
  if (t.some(r => r.soil_wrb)) keys.push('soil_wrb');
  return keys;
}

function renderEnvResult() {
  const t = state.env.table;
  const contKeys = [...BIO_ONLY, 'elev'].filter(k => t.some(r => r[k] != null));
  const has = { koppen: t.some(r => r.koppen != null), soil: t.some(r => r.soil_wrb) };
  statTiles('envSummary', [
    [{ es: 'Puntos con variables', en: 'Points with variables' }, t.length.toLocaleString('en-US')],
    [{ es: 'Variables continuas', en: 'Continuous variables' }, contKeys.length],
    [{ es: 'Clima de Köppen', en: 'Köppen climate' }, has.koppen ? { es: 'sí', en: 'yes' } : '—'],
    [{ es: 'Suelo (WRB)', en: 'Soil (WRB)' }, has.soil ? { es: 'sí', en: 'yes' } : { es: 'pendiente', en: 'pending' }],
  ]);

  const cols = [
    { key: 'taxon', label: { es: 'Taxón', en: 'Taxon' } },
    { key: 'decimalLatitude', label: 'Lat', get: r => r.decimalLatitude.toFixed(4) },
    { key: 'decimalLongitude', label: 'Lon', get: r => r.decimalLongitude.toFixed(4) },
    ...contKeys.map(k => ({ key: k, label: () => varCode(k) })),
    ...(has.koppen ? [{ key: 'koppen_code', label: 'Köppen' }] : []),
    ...(has.soil ? [{ key: 'soil_wrb', label: { es: 'Suelo WRB', en: 'WRB soil' } }] : []),
  ];
  buildTable('envTable', cols, t, 200);
  el('envResultCard').style.display = 'block';
  [6, 7, 9, 10].forEach(enableStep);                     // correlation, statistics and SDM open once the variables exist (ML opens after the statistics)
  if (window.corrEnsure) corrEnsure();               // default selection of step 6 (kept if the layers did not change)
  if (window.buildStatsVarPicker) buildStatsVarPicker();
  fillEnvMapSelect();
}

/* variable selector of the thematic map (labels follow the language) */
function fillEnvMapSelect() {
  const t = state.env.table, sel = el('envMapVar');
  if (!t.length) return;
  const prev = sel.value;
  const contKeys = [...BIO_ONLY, 'elev'].filter(k => t.some(r => r[k] != null));
  sel.innerHTML = '';
  contKeys.forEach(k => sel.add(new Option(`${varCode(k)} — ${varName(k)}`, k)));
  if (t.some(r => r.koppen != null)) sel.add(new Option(T('Clima de Köppen-Geiger', 'Köppen-Geiger climate'), 'koppen'));
  if (t.some(r => r.soil_wrb)) sel.add(new Option(T('Tipo de suelo (WRB)', 'Soil type (WRB)'), 'soil_wrb'));
  if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
}
document.addEventListener('langchange', () => { fillEnvMapSelect(); if (typeof envMap !== 'undefined' && envMap) updateEnvMap(); });

el('dlEnvCsv').addEventListener('click', () => {
  const t = state.env.table;
  const keys = envVarKeys();
  const cols = [
    { key: 'key', label: 'gbif_key' }, { key: 'taxon', label: 'taxon' },
    { key: 'taxonRank', label: 'taxonRank' }, { key: 'country', label: 'country' },
    { key: 'stateProvince', label: 'stateProvince' }, { key: 'year', label: 'year' },
    { key: 'decimalLatitude', label: 'decimalLatitude' }, { key: 'decimalLongitude', label: 'decimalLongitude' },
    ...keys.filter(k => k !== 'koppen' && k !== 'soil_wrb').map(k => ({ key: k, label: varCode(k) })),
    ...(keys.includes('koppen') ? [{ key: 'koppen', label: 'koppen_code_num' }, { key: 'koppen_code', label: 'koppen' }] : []),
    ...(keys.includes('soil_wrb') ? [{ key: 'soil_wrb', label: 'soil_wrb' }, { key: 'soil_prob', label: 'soil_wrb_prob' }] : []),
  ];
  downloadBlob(toCSV(cols, t), slugName(state.query) + '_environmental_variables.csv', 'text/csv;charset=utf-8');
});

/* ---------- 5. thematic map ----------
   Drawing, colours (ramp, class method, palette), legend, decoration and export belong to the map studio; this part only
   supplies the points with their values or categories. */

let envMap = null, envStudio = null, envHullCache = null;

function ensureEnvMap() {
  if (envMap) return;
  envMap = mapkit.makeBaseMap('mapEnv'); window.envMap = envMap;
  envStudio = mapstudio.attach(envMap, {
    kind: 'thematic', legendPanel: el('mapEnvLegend'),
    hooks: { defaultTitle: () => state.query || '', fileName: () => `map_${el('envMapVar').value}_${slugName(state.query)}` },
  });
  envStudio.setExtras(envHullExtra);
}

function buildEnvMap() {
  el('envMapCard').style.display = 'block';
  ensureEnvMap();
  updateEnvMap(true);
  setTimeout(() => envMap.invalidateSize(), 60);
}

['envMapVar', 'envMapHull'].forEach(id => el(id).addEventListener('change', () => updateEnvMap(false)));
el('envMapExportBtn').addEventListener('click', () => { if (envStudio) envStudio.exportNow(); });

function convexHull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const pt of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop(); lower.push(pt); }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) { const pt = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop(); upper.push(pt); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/* distribution polygon (convex hull of the points), drawn dashed under the markers; cached per table */
function envHullExtra() {
  const t = state.env.table;
  if (!el('envMapHull').checked || t.length < 3) return [];
  if (!envHullCache || envHullCache.table !== t || envHullCache.n !== t.length)
    envHullCache = { table: t, n: t.length, pts: convexHull(t.map(r => [r.decimalLongitude, r.decimalLatitude])).map(([x, y]) => [y, x]) };
  return [{ pts: envHullCache.pts, stroke: '#e45756', lw: 2, dash: [6, 5], fill: '#e45756', fa: 0.05 }];
}

function updateEnvMap(fit) {
  if (!envMap) return;
  const t = state.env.table, vkey = el('envMapVar').value;
  const categorical = vkey === 'koppen' || vkey === 'soil_wrb';
  const popup = r => `<b>${esc(r.taxon)}</b><br>${r.decimalLatitude.toFixed(3)}, ${r.decimalLongitude.toFixed(3)}<br>` +
    (categorical
      ? esc(vkey === 'koppen' ? koppenLabel(r.koppen) : (r.soil_wrb || '—'))
      : `${varCode(vkey)}: ${r[vkey] ?? '—'} ${BIOCLIM_META[vkey] ? BIOCLIM_META[vkey][2] : ''}`);
  if (categorical) {
    const valOf = r => vkey === 'koppen'
      ? (r.koppen == null ? null : (KOPPEN_LEGEND[r.koppen] ? KOPPEN_LEGEND[r.koppen].code : String(r.koppen)))
      : (r.soil_wrb || null);
    const defaults = {};
    if (vkey === 'koppen') Object.values(KOPPEN_LEGEND).forEach(k => { defaults[k.code] = k.color; });
    envStudio.setData({
      kind: 'categorical', defaults,
      items: t.map(r => ({ lat: r.decimalLatitude, lon: r.decimalLongitude, cat: valOf(r), tip: () => popup(r) })),
      title: () => vkey === 'koppen' ? T('Clima de Köppen-Geiger', 'Köppen-Geiger climate') : T('Tipo de suelo (WRB)', 'Soil type (WRB)'),
      catLabel: c => { const ke = vkey === 'koppen' && Object.values(KOPPEN_LEGEND).find(x => x.code === c); return ke ? c + ' — ' + T(ke.es, ke.en) : c; },
    });
  } else {
    envStudio.setData({
      kind: 'continuous',
      items: t.map(r => ({ lat: r.decimalLatitude, lon: r.decimalLongitude, v: r[vkey], tip: () => popup(r) })),
      title: () => varCode(vkey) + ' · ' + varName(vkey),
      unit: BIOCLIM_META[vkey] ? BIOCLIM_META[vkey][2] : '',
    });
  }
  if (fit) mapkit.fitToPoints(envMap, t.map(r => ({ decimalLatitude: r.decimalLatitude, decimalLongitude: r.decimalLongitude })));
}

/* ---------- 6. soil: SoilGrids ---------- */

el('soilRunBtn').addEventListener('click', runSoil);
el('soilStopBtn').addEventListener('click', () => { state.env.soilRunning = false; });

async function soilQuery(lon, lat) {
  const url = `https://rest.isric.org/soilgrids/v2.0/classification/query?lon=${lon}&lat=${lat}&number_classes=1`;
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (r.status === 429) throw Object.assign(new Error('rate-limit'), { rate: true });
  if (!r.ok) throw new Error('SoilGrids ' + r.status);
  const j = await r.json();
  return { name: j.wrb_class_name || null, prob: Array.isArray(j.wrb_class_probability) && j.wrb_class_probability[0]
    ? j.wrb_class_probability[0][1] : null };
}

/* persistent soil cache keyed by rounded lon,lat (independent of the grid); the pre-rename key is still read */
function loadSoilCache() {
  try { return JSON.parse(localStorage.getItem('biomodellingpro_soil_cache') || localStorage.getItem('biosdm_soil_cache') || '{}'); } catch { return {}; }
}
function saveSoilCache(c) {
  try { localStorage.setItem('biomodellingpro_soil_cache', JSON.stringify(c)); } catch {}
}
function soilCacheKey(lon, lat) { return lon.toFixed(3) + ',' + lat.toFixed(3); }

function applySoilToTable(t, cellKey, k, res) {
  t.forEach(r => { if (cellKey(r) === k) { r.soil_wrb = res.name; r.soil_prob = res.prob; } });
}

async function runSoil() {
  const t = state.env.table;
  if (!t.length) { showMessage('soilMessages', 'error', L2('Primero extrae las variables ráster.', 'Extract the raster variables first.')); return; }
  const grid = +el('soilGrid').value;
  let delay = Math.max(300, +el('soilDelay').value || 1100);

  const cellKey = r => grid
    ? `${Math.round(r.decimalLongitude / grid)},${Math.round(r.decimalLatitude / grid)}`
    : String(r.key);
  const cells = new Map();
  t.forEach(r => { if (!cells.has(cellKey(r))) cells.set(cellKey(r), r); });
  const uniq = [...cells.entries()];

  clearMessages('soilMessages');
  el('soilProgress').style.display = 'flex';
  el('soilRunBtn').disabled = true; el('soilStopBtn').disabled = false;
  state.env.soilRunning = true;
  const cache = loadSoilCache();
  let i = 0, ok = 0, fromCache = 0;

  // first fill everything already in the cache (instant)
  for (const [k, rep] of uniq) {
    const ck = soilCacheKey(rep.decimalLongitude, rep.decimalLatitude);
    if (cache[ck] && cache[ck].name) { applySoilToTable(t, cellKey, k, cache[ck]); ok++; fromCache++; }
  }
  if (fromCache) { renderEnvResult(); updateEnvMap(); }

  const eta = () => {
    const rem = uniq.length - i;
    const secs = Math.round(rem * (delay + 2500) / 1000);
    return secs > 90 ? `${Math.round(secs / 60)} min` : `${secs} s`;
  };

  for (const [k, rep] of uniq) {
    if (!state.env.soilRunning) break;
    i++;
    const ck = soilCacheKey(rep.decimalLongitude, rep.decimalLatitude);
    el('soilProgressFill').style.width = Math.round(i / uniq.length * 100) + '%';
    el('soilProgressLabel').textContent = `${i}/${uniq.length} ${T('celdas', 'cells')} · ${ok} ${T('con dato', 'with data')} · ~${eta()} ${T('restante', 'left')}`;
    if (cache[ck]) continue; // already resolved above
    try {
      const res = await soilQuery(rep.decimalLongitude.toFixed(4), rep.decimalLatitude.toFixed(4));
      cache[ck] = res; saveSoilCache(cache);
      if (res.name) { ok++; applySoilToTable(t, cellKey, k, res); }
      if (ok % 10 === 0) { renderEnvResult(); updateEnvMap(); }
    } catch (e) {
      if (e.rate) {
        delay = Math.min(10000, delay * 1.8);
        showMessage('soilMessages', 'warning', L2(`Límite de SoilGrids; pausa aumentada a ${Math.round(delay)} ms.`,
          `SoilGrids rate limit; pause increased to ${Math.round(delay)} ms.`));
      }
    }
    await new Promise(r => setTimeout(r, delay));
  }

  state.env.soilRunning = false;
  el('soilRunBtn').disabled = false; el('soilStopBtn').disabled = true;
  const nPts = t.filter(r => r.soil_wrb).length;
  showMessage('soilMessages', ok ? 'success' : 'warning',
    L2(`Suelo asignado en ${ok}/${uniq.length} celdas → ${nPts} puntos` + (fromCache ? ` (${fromCache} desde caché local).` : '.') +
        (i < uniq.length ? ' Puedes reanudar más tarde: lo consultado queda en caché.' : ''),
      `Soil assigned in ${ok}/${uniq.length} cells → ${nPts} points` + (fromCache ? ` (${fromCache} from the local cache).` : '.') +
        (i < uniq.length ? ' You can resume later: what was queried stays cached.' : '')));
  renderEnvResult();
  updateEnvMap();
}

el('toStep5Btn') && el('toStep5Btn').addEventListener('click', () => goToStep(5));
/* the button that closes step 5 had no handler: it looked like a dead end between the variables and the correlation */
el('toStep6Btn') && el('toStep6Btn').addEventListener('click', () => {
  if (!state.env.table.length) {
    showMessage('envMessages', 'warning', L2('Primero extrae los valores ráster: la correlación se calcula sobre esa tabla.',
      'Extract the raster values first: the correlation is computed on that table.'));
    return;
  }
  [6, 7, 8, 9].forEach(enableStep);
  goToStep(6);
});

Object.assign(window, { BIOCLIM_META, BIO_KEYS, BIO_ONLY, varCode, varName, varNameL2, envVarKeys });
window.rasters = { extractAll, BIOCLIM_META };

/* Which of the three ways was used, and what it found (shown under its own button) */
function setPickStatus(source, files, found) {
  ['Folder', 'Files', 'Sample'].forEach(k => { const s = el('env' + k + 'Status'); s.textContent = ''; s.className = 'pick-status'; });
  const box = el(source === 'folder' ? 'envFolderStatus' : source === 'files' ? 'envFilesStatus' : 'envSampleStatus');
  const n = Object.keys(found).length, tif = files.filter(f => /\.tiff?$/i.test(f.name)).length;
  const dir = source === 'folder' && files[0] && files[0].webkitRelativePath ? files[0].webkitRelativePath.split('/')[0] : '';
  box.className = 'pick-status' + (n ? ' ok' : '');
  box.textContent = source === 'sample' ? T(`${n} capas cargadas de datos/`, `${n} layers loaded from datos/`)
    : n ? T(`${dir ? '«' + dir + '»: ' : ''}${tif} archivos .tif, ${n} capas reconocidas`, `${dir ? '“' + dir + '”: ' : ''}${tif} .tif files, ${n} layers recognised`)
        : T(`${files.length} archivos leídos, ninguno reconocido como WorldClim o Köppen`, `${files.length} files read, none recognised as WorldClim or Köppen`);
}
