/* Paso 5 (Bloque B): extracción de variables ráster en los puntos depurados
   + mapa temático + consulta de suelo (SoilGrids). */

const BIOCLIM_META = {
  bio_1:  ['BIO1',  'Temperatura media anual', '°C'],
  bio_2:  ['BIO2',  'Rango diurno medio de temperatura', '°C'],
  bio_3:  ['BIO3',  'Isotermalidad (BIO2/BIO7×100)', '%'],
  bio_4:  ['BIO4',  'Estacionalidad de la temperatura (DE×100)', '°C×100'],
  bio_5:  ['BIO5',  'Temp. máxima del mes más cálido', '°C'],
  bio_6:  ['BIO6',  'Temp. mínima del mes más frío', '°C'],
  bio_7:  ['BIO7',  'Rango anual de temperatura (BIO5−BIO6)', '°C'],
  bio_8:  ['BIO8',  'Temp. media del trimestre más húmedo', '°C'],
  bio_9:  ['BIO9',  'Temp. media del trimestre más seco', '°C'],
  bio_10: ['BIO10', 'Temp. media del trimestre más cálido', '°C'],
  bio_11: ['BIO11', 'Temp. media del trimestre más frío', '°C'],
  bio_12: ['BIO12', 'Precipitación anual', 'mm'],
  bio_13: ['BIO13', 'Precipitación del mes más húmedo', 'mm'],
  bio_14: ['BIO14', 'Precipitación del mes más seco', 'mm'],
  bio_15: ['BIO15', 'Estacionalidad de la precipitación (CV)', '%'],
  bio_16: ['BIO16', 'Precipitación del trimestre más húmedo', 'mm'],
  bio_17: ['BIO17', 'Precipitación del trimestre más seco', 'mm'],
  bio_18: ['BIO18', 'Precipitación del trimestre más cálido', 'mm'],
  bio_19: ['BIO19', 'Precipitación del trimestre más frío', 'mm'],
  elev:   ['ALT',   'Altitud', 'm'],
};
const BIO_KEYS = Object.keys(BIOCLIM_META);          // incluye elev
const BIO_ONLY = BIO_KEYS.filter(k => k !== 'elev'); // bio_1..bio_19

state.env = { files: {}, resolution: null, table: [], sampling: 'bilinear',
  dropNoData: true, soilRunning: false };

/* ---------- 1. selección de archivos ---------- */

function matchRasterFile(name) {
  const n = name.toLowerCase();
  if (!/\.tiff?$/.test(n)) return null;
  const bio = n.match(/bio[_-]?(\d{1,2})(?!\d)/);
  if (bio) { const i = +bio[1]; if (i >= 1 && i <= 19) return 'bio_' + i; }
  if (/elev|elevation|_alt|dem|srtm/.test(n)) return 'elev';
  if (/koppen|köppen|beck_kg|_kg_|kg_v|climate_class/.test(n)) {
    if (/conf|future|_0p5\.|_0p083\./.test(n)) return null;   // descarta confianza, futuro y baja resolución
    return 'koppen';
  }
  return null;
}

function koppenScore(n) { // más alto = preferido
  n = n.toLowerCase();
  return (/present/.test(n) ? 4 : 0) + (/0p0083|0083|0\.0083/.test(n) ? 2 : 0) + (/\.tif$/.test(n) ? 1 : 0);
}

function handleEnvFiles(fileList) {
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
}

function renderEnvFileReport() {
  const box = el('envFileReport');
  const f = state.env.files;
  const want = [...BIO_ONLY, 'elev', 'koppen'];
  const labelOf = k => k === 'koppen' ? 'Köppen' : k === 'elev' ? 'Altitud' : k.toUpperCase().replace('_', '');
  const badges = want.map(k =>
    `<span class="layer-badge ${f[k] ? 'ok' : 'missing'}">${f[k] ? '✓' : '×'} ${labelOf(k)}</span>`
  ).join('');
  const nBio = BIO_ONLY.filter(k => f[k]).length;
  box.innerHTML =
    `<div class="msg msg-${nBio === 19 ? 'success' : nBio ? 'warning' : 'error'}">
      ${nBio}/19 bioclimáticas · altitud ${f.elev ? 'sí' : 'no'} · Köppen ${f.koppen ? 'sí' : 'no'}
      ${state.env.resolution ? ' · resolución ' + state.env.resolution : ''}
     </div>
     <div class="layer-badges">${badges}</div>`;
  el('envExtractBtn').disabled = nBio === 0;
}

el('envFolder').addEventListener('change', e => handleEnvFiles(e.target.files));
el('envFiles').addEventListener('change', e => handleEnvFiles(e.target.files));

el('envUseSample').addEventListener('click', async () => {
  showSpinner('Cargando GeoTIFF de ejemplo…');
  try {
    const names = [
      ...BIO_ONLY.map(k => ['datos/worldclim/wc2.1_10m_bio_' + k.split('_')[1] + '.tif', k]),
      ['datos/worldclim/wc2.1_10m_elev.tif', 'elev'],
      ['datos/koppen/Beck_KG_V1_present_0p0083.tif', 'koppen'],
    ];
    const found = {};
    for (const [url, key] of names) {
      const r = await fetch(url);
      if (!r.ok) continue;
      const blob = await r.blob();
      found[key] = new File([blob], url.split('/').pop(), { type: 'image/tiff' });
    }
    if (!Object.keys(found).length) throw new Error('no se encontraron los archivos en datos/');
    state.env.files = found;
    state.env.resolution = '10m';
    renderEnvFileReport();
    showMessage('envMessages', 'info', 'Datos de ejemplo cargados (WorldClim 10m ≈ 18 km, Köppen 1 km).');
  } catch (e) {
    showMessage('envMessages', 'error', 'No se pudieron cargar los datos de ejemplo: ' + e.message +
      '<br>¿Abriste la app con <code>servidor.ps1</code> (http://localhost:8765)? Con doble clic no funciona el ejemplo.');
  } finally { hideSpinner(); }
});

/* ---------- 2. muestreo de un GeoTIFF ---------- */

function isNoData(v, nd) {
  return v == null || Number.isNaN(v) || v < -1e30 || (nd != null && v === nd);
}

async function openGeo(file) {
  const tiff = await GeoTIFF.fromBlob(file);
  const image = await tiff.getImage();
  const [ox, oy] = image.getOrigin();
  const [rx, ryRaw] = image.getResolution();
  const ry = ryRaw; // normalmente negativo
  return {
    image, ox, oy, rx, ry,
    w: image.getWidth(), h: image.getHeight(),
    nd: image.getGDALNoData(),
  };
}

/* Devuelve array de valores (o null) para cada punto {lat,lon}. */
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

  // modo punto a punto (puntos muy dispersos)
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

/* ---------- 3. extracción completa ---------- */

el('envExtractBtn').addEventListener('click', extractAll);

async function extractAll() {
  const recs = state.clean;
  if (!recs.length) { showMessage('envMessages', 'error', 'No hay registros depurados (vuelve al paso 3).'); return; }
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
      el('envProgressLabel').textContent = `Leyendo ${key === 'koppen' ? 'Köppen' : key.toUpperCase()}… (${done}/${layers.length})`;
      el('envProgressFill').style.width = Math.round(done / layers.length * 100) + '%';
      await new Promise(r => setTimeout(r, 15)); // deja pintar
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

    // marca / descarta puntos sin dato bioclimático
    const bioPresent = BIO_ONLY.filter(k => state.env.files[k]);
    let dropped = 0;
    rows.forEach(row => {
      row._noData = bioPresent.some(k => row[k] == null);
      if (row._noData) dropped++;
    });
    state.env.table = state.env.dropNoData ? rows.filter(r => !r._noData) : rows;

    showMessage('envMessages', 'success',
      `Extracción completa: ${layers.length} capas × ${rows.length} puntos.` +
      (dropped ? ` ${dropped} punto(s) sin dato bioclimático${state.env.dropNoData ? ' (descartados)' : ' (marcados)'}.` : ''));

    renderEnvResult();
    buildEnvMap();
    el('soilCard').style.display = 'block';
    enableStep(5);
  } catch (err) {
    console.error(err);
    showMessage('envMessages', 'error', 'Error leyendo los GeoTIFF: ' + err.message +
      '<br>Revisa que los archivos no estén corruptos y que sean WorldClim 2.1 (EPSG:4326).');
  } finally {
    el('envExtractBtn').disabled = false;
  }
}

/* ---------- 4. resultados: resumen + tabla ---------- */

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
  statTiles('envSummary', [
    ['Puntos con variables', t.length.toLocaleString()],
    ['Variables continuas', contKeys.length],
    ['Clima de Köppen', t.some(r => r.koppen != null) ? 'sí' : '—'],
    ['Suelo (WRB)', t.some(r => r.soil_wrb) ? 'sí' : 'pendiente'],
  ]);

  const cols = [
    { key: 'taxon', label: 'Taxón' },
    { key: 'decimalLatitude', label: 'Lat', get: r => r.decimalLatitude.toFixed(4) },
    { key: 'decimalLongitude', label: 'Lon', get: r => r.decimalLongitude.toFixed(4) },
    ...contKeys.map(k => ({ key: k, label: BIOCLIM_META[k][0] })),
    ...(t.some(r => r.koppen != null) ? [{ key: 'koppen_code', label: 'Köppen' }] : []),
    ...(t.some(r => r.soil_wrb) ? [{ key: 'soil_wrb', label: 'Suelo WRB' }] : []),
  ];
  buildTable('envTable', cols, t, 200);
  el('envResultCard').style.display = 'block';
  enableStep(6);
  enableStep(8);
  if (window.buildStatsVarPicker) buildStatsVarPicker();

  // selector de variable del mapa temático
  const sel = el('envMapVar');
  sel.innerHTML = '';
  contKeys.forEach(k => sel.add(new Option(`${BIOCLIM_META[k][0]} — ${BIOCLIM_META[k][1]}`, k)));
  if (t.some(r => r.koppen != null)) sel.add(new Option('Clima de Köppen-Geiger', 'koppen'));
  if (t.some(r => r.soil_wrb)) sel.add(new Option('Tipo de suelo (WRB)', 'soil_wrb'));
}

el('dlEnvCsv').addEventListener('click', () => {
  const t = state.env.table;
  const keys = envVarKeys();
  const cols = [
    { key: 'key', label: 'gbif_key' }, { key: 'taxon', label: 'taxon' },
    { key: 'taxonRank', label: 'taxonRank' }, { key: 'country', label: 'country' },
    { key: 'stateProvince', label: 'stateProvince' }, { key: 'year', label: 'year' },
    { key: 'decimalLatitude', label: 'decimalLatitude' }, { key: 'decimalLongitude', label: 'decimalLongitude' },
    ...keys.filter(k => k !== 'koppen' && k !== 'soil_wrb').map(k => ({ key: k, label: BIOCLIM_META[k] ? BIOCLIM_META[k][0] : k })),
    ...(keys.includes('koppen') ? [{ key: 'koppen', label: 'koppen_code_num' }, { key: 'koppen_code', label: 'koppen' }] : []),
    ...(keys.includes('soil_wrb') ? [{ key: 'soil_wrb', label: 'soil_wrb' }, { key: 'soil_prob', label: 'soil_wrb_prob' }] : []),
  ];
  downloadBlob(toCSV(cols, t),
    (state.query || 'especie').replace(/\s+/g, '_') + '_variables_ambientales.csv', 'text/csv;charset=utf-8');
});

/* ---------- 5. mapa temático ---------- */

let envMap = null, envPointLayer = null, envHullLayer = null;

function buildEnvMap() {
  el('envMapCard').style.display = 'block';
  if (!envMap) { envMap = mapkit.makeBaseMap('mapEnv'); window.envMap = envMap; }
  updateEnvMap();
  setTimeout(() => envMap.invalidateSize(), 60);
}

['envMapVar', 'envMapClasses', 'envMapHull'].forEach(id =>
  el(id).addEventListener('change', updateEnvMap));

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

function updateEnvMap() {
  if (!envMap) return;
  const t = state.env.table;
  const vkey = el('envMapVar').value;
  const nClasses = Math.max(3, Math.min(9, +el('envMapClasses').value || 6));
  if (envPointLayer) envMap.removeLayer(envPointLayer);
  envPointLayer = L.layerGroup();
  const legend = el('mapEnvLegend');
  legend.innerHTML = '';

  const categorical = vkey === 'koppen' || vkey === 'soil_wrb';
  let colorFor, legendHTML;

  if (categorical) {
    const valOf = r => vkey === 'koppen'
      ? (r.koppen == null ? null : (KOPPEN_LEGEND[r.koppen] ? KOPPEN_LEGEND[r.koppen].code : String(r.koppen)))
      : (r.soil_wrb || null);
    const cats = [...new Set(t.map(valOf).filter(Boolean))].sort();
    const cmap = {};
    cats.forEach((c, i) => {
      const kEntry = vkey === 'koppen' && Object.values(KOPPEN_LEGEND).find(x => x.code === c);
      cmap[c] = kEntry ? kEntry.color : mapkit.CAT_PALETTE[i % mapkit.CAT_PALETTE.length];
    });
    colorFor = r => { const v = valOf(r); return v ? cmap[v] : '#cccccc'; };
    legendHTML = `<strong style="width:100%">${vkey === 'koppen' ? 'Clima de Köppen-Geiger' : 'Tipo de suelo (WRB)'}</strong>` +
      cats.map(c => {
        const nm = vkey === 'koppen'
          ? (Object.values(KOPPEN_LEGEND).find(x => x.code === c)?.name || '')
          : '';
        return `<div class="legend-item"><span class="legend-swatch" style="background:${cmap[c]}"></span>${c}${nm ? ' — ' + nm : ''}</div>`;
      }).join('');
  } else {
    const vals = t.map(r => r[vkey]).filter(v => v != null && isFinite(v));
    const breaks = mapkit.quantileBreaks(vals, nClasses);
    const classOf = v => { for (let i = 1; i < breaks.length; i++) if (v <= breaks[i]) return i - 1; return breaks.length - 2; };
    colorFor = r => r[vkey] == null ? '#cccccc' : mapkit.rampColor(mapkit.SEQ_RAMP, classOf(r[vkey]) / (nClasses - 1));
    const unit = BIOCLIM_META[vkey] ? BIOCLIM_META[vkey][2] : '';
    let rows = '';
    for (let i = 0; i < nClasses; i++)
      rows += `<div class="row"><span class="sw" style="background:${mapkit.rampColor(mapkit.SEQ_RAMP, i / (nClasses - 1))}"></span>` +
        `${breaks[i].toFixed(1)} – ${breaks[i + 1].toFixed(1)}</div>`;
    legendHTML = `<div class="legend-grad"><strong>${BIOCLIM_META[vkey] ? BIOCLIM_META[vkey][1] : vkey} (${unit})</strong>${rows}</div>`;
  }

  t.forEach(r => {
    L.circleMarker([r.decimalLatitude, r.decimalLongitude], {
      radius: 5, weight: 1, color: '#333', fillColor: colorFor(r), fillOpacity: 0.9,
    }).bindPopup(
      `<b>${r.taxon}</b><br>${r.decimalLatitude.toFixed(3)}, ${r.decimalLongitude.toFixed(3)}<br>` +
      (categorical
        ? (vkey === 'koppen' ? koppenLabel(r.koppen) : (r.soil_wrb || '—'))
        : `${BIOCLIM_META[vkey] ? BIOCLIM_META[vkey][0] : vkey}: ${r[vkey] ?? '—'} ${BIOCLIM_META[vkey] ? BIOCLIM_META[vkey][2] : ''}`)
    ).addTo(envPointLayer);
  });
  envPointLayer.addTo(envMap);

  if (envHullLayer) { envMap.removeLayer(envHullLayer); envHullLayer = null; }
  if (el('envMapHull').checked && t.length >= 3) {
    const hull = convexHull(t.map(r => [r.decimalLongitude, r.decimalLatitude]));
    envHullLayer = L.polygon(hull.map(([x, y]) => [y, x]),
      { color: '#e45756', weight: 2, fillOpacity: 0.05, dashArray: '5,5' }).addTo(envMap);
  }

  mapkit.fitToPoints(envMap, t.map(r => ({ decimalLatitude: r.decimalLatitude, decimalLongitude: r.decimalLongitude })));
  legend.innerHTML = legendHTML;
}

el('envMapExportBtn').addEventListener('click', async () => {
  showSpinner('Generando imagen…');
  try { await mapkit.exportMapPNG('mapEnv',
    `mapa_${el('envMapVar').value}_${(state.query || 'especie').replace(/\s+/g, '_')}.png`); }
  catch (e) { showMessage('mapEnvLegend', 'warning', 'No se pudo exportar (teselas protegidas). Usa la herramienta de recorte.'); }
  finally { hideSpinner(); }
});

/* ---------- 6. suelo: SoilGrids ---------- */

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

/* caché persistente de suelo, indexado por lon,lat redondeados (independiente de la rejilla) */
function loadSoilCache() {
  try { return JSON.parse(localStorage.getItem('biosdm_soil_cache') || '{}'); } catch { return {}; }
}
function saveSoilCache(c) {
  try { localStorage.setItem('biosdm_soil_cache', JSON.stringify(c)); } catch {}
}
function soilCacheKey(lon, lat) { return lon.toFixed(3) + ',' + lat.toFixed(3); }

function applySoilToTable(t, cellKey, k, res) {
  t.forEach(r => { if (cellKey(r) === k) { r.soil_wrb = res.name; r.soil_prob = res.prob; } });
}

async function runSoil() {
  const t = state.env.table;
  if (!t.length) { showMessage('soilMessages', 'error', 'Primero extrae las variables ráster.'); return; }
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

  // primero rellena todo lo que ya esté en caché (instantáneo)
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
    el('soilProgressLabel').textContent = `${i}/${uniq.length} celdas · ${ok} con dato · ~${eta()} restante`;
    if (cache[ck]) continue; // ya resuelto arriba
    try {
      const res = await soilQuery(rep.decimalLongitude.toFixed(4), rep.decimalLatitude.toFixed(4));
      cache[ck] = res; saveSoilCache(cache);
      if (res.name) { ok++; applySoilToTable(t, cellKey, k, res); }
      if (ok % 10 === 0) { renderEnvResult(); updateEnvMap(); }
    } catch (e) {
      if (e.rate) {
        delay = Math.min(10000, delay * 1.8);
        showMessage('soilMessages', 'warning', `Límite de SoilGrids; pausa aumentada a ${Math.round(delay)} ms.`);
      }
    }
    await new Promise(r => setTimeout(r, delay));
  }

  state.env.soilRunning = false;
  el('soilRunBtn').disabled = false; el('soilStopBtn').disabled = true;
  showMessage('soilMessages', ok ? 'success' : 'warning',
    `Suelo asignado en ${ok}/${uniq.length} celdas → ${t.filter(r => r.soil_wrb).length} puntos` +
    (fromCache ? ` (${fromCache} desde caché local).` : '.') +
    (i < uniq.length ? ' Puedes reanudar más tarde: lo consultado queda en caché.' : ''));
  renderEnvResult();
  updateEnvMap();
}

el('toStep5Btn') && el('toStep5Btn').addEventListener('click', () => goToStep(5));

window.rasters = { extractAll, BIOCLIM_META };
