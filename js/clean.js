/* Step 3: coordinate cleaning (rules for the usual georeferencing errors of biodiversity records). */

/* Approximate country centroids (ISO-3166 alpha-2) -> [lat, lon].
   Used to detect records georeferenced to the centre of the country. */
const COUNTRY_CENTROIDS = {
  AF:[33.94,67.71],AL:[41.15,20.17],DZ:[28.03,1.66],AO:[-11.20,17.87],AR:[-38.42,-63.62],
  AM:[40.07,45.04],AU:[-25.27,133.78],AT:[47.52,14.55],AZ:[40.14,47.58],BS:[25.03,-77.40],
  BD:[23.68,90.36],BY:[53.71,27.95],BE:[50.50,4.47],BZ:[17.19,-88.50],BJ:[9.31,2.32],
  BT:[27.51,90.43],BO:[-16.29,-63.59],BA:[43.92,17.68],BW:[-22.33,24.68],BR:[-14.24,-51.93],
  BN:[4.54,114.73],BG:[42.73,25.49],BF:[12.24,-1.56],BI:[-3.37,29.92],KH:[12.57,104.99],
  CM:[7.37,12.35],CA:[56.13,-106.35],CV:[16.00,-24.01],CF:[6.61,20.94],TD:[15.45,18.73],
  CL:[-35.68,-71.54],CN:[35.86,104.20],CO:[4.57,-74.30],KM:[-11.65,43.33],CG:[-0.23,15.83],
  CD:[-4.04,21.76],CR:[9.75,-83.75],CI:[7.54,-5.55],HR:[45.10,15.20],CU:[21.52,-77.78],
  CY:[35.13,33.43],CZ:[49.82,15.47],DK:[56.26,9.50],DJ:[11.83,42.59],DO:[18.74,-70.16],
  EC:[-1.83,-78.18],EG:[26.82,30.80],SV:[13.79,-88.90],GQ:[1.65,10.27],ER:[15.18,39.78],
  EE:[58.60,25.01],SZ:[-26.52,31.47],ET:[9.15,40.49],FJ:[-16.58,179.41],FI:[61.92,25.75],
  FR:[46.23,2.21],GA:[-0.80,11.61],GM:[13.44,-15.31],GE:[42.32,43.36],DE:[51.17,10.45],
  GH:[7.95,-1.02],GR:[39.07,21.82],GL:[71.71,-42.60],GT:[15.78,-90.23],GN:[9.95,-9.70],
  GW:[11.80,-15.18],GY:[4.86,-58.93],HT:[18.97,-72.29],HN:[15.20,-86.24],HU:[47.16,19.50],
  IS:[64.96,-19.02],IN:[20.59,78.96],ID:[-0.79,113.92],IR:[32.43,53.69],IQ:[33.22,43.68],
  IE:[53.41,-8.24],IL:[31.05,34.85],IT:[41.87,12.57],JM:[18.11,-77.30],JP:[36.20,138.25],
  JO:[30.59,36.24],KZ:[48.02,66.92],KE:[-0.02,37.91],KW:[29.31,47.48],KG:[41.20,74.77],
  LA:[19.86,102.50],LV:[56.88,24.60],LB:[33.85,35.86],LS:[-29.61,28.23],LR:[6.43,-9.43],
  LY:[26.34,17.23],LT:[55.17,23.88],LU:[49.82,6.13],MG:[-18.77,46.87],MW:[-13.25,34.30],
  MY:[4.21,101.98],ML:[17.57,-4.00],MR:[21.01,-10.94],MU:[-20.35,57.55],MX:[23.63,-102.55],
  MD:[47.41,28.37],MN:[46.86,103.85],ME:[42.71,19.37],MA:[31.79,-7.09],MZ:[-18.67,35.53],
  MM:[21.91,95.96],NA:[-22.96,18.49],NP:[28.39,84.12],NL:[52.13,5.29],NZ:[-40.90,174.89],
  NI:[12.87,-85.21],NE:[17.61,8.08],NG:[9.08,8.68],KP:[40.34,127.51],MK:[41.61,21.75],
  NO:[60.47,8.47],OM:[21.51,55.92],PK:[30.38,69.35],PA:[8.54,-80.78],PG:[-6.31,143.96],
  PY:[-23.44,-58.44],PE:[-9.19,-75.02],PH:[12.88,121.77],PL:[51.92,19.15],PT:[39.40,-8.22],
  QA:[25.35,51.18],RO:[45.94,24.97],RU:[61.52,105.32],RW:[-1.94,29.87],SA:[23.89,45.08],
  SN:[14.50,-14.45],RS:[44.02,21.01],SL:[8.46,-11.78],SG:[1.35,103.82],SK:[48.67,19.70],
  SI:[46.15,14.99],SB:[-9.65,160.16],SO:[5.15,46.20],ZA:[-30.56,22.94],KR:[35.91,127.77],
  SS:[6.88,31.31],ES:[40.46,-3.75],LK:[7.87,80.77],SD:[12.86,30.22],SR:[3.92,-56.03],
  SE:[60.13,18.64],CH:[46.82,8.23],SY:[34.80,38.997],TW:[23.70,120.96],TJ:[38.86,71.28],
  TZ:[-6.37,34.89],TH:[15.87,100.99],TL:[-8.87,125.73],TG:[8.62,0.82],TT:[10.69,-61.22],
  TN:[33.89,9.54],TR:[38.96,35.24],TM:[38.97,59.56],UG:[1.37,32.29],UA:[48.38,31.17],
  AE:[23.42,53.85],GB:[55.38,-3.44],US:[39.83,-98.58],UY:[-32.52,-55.77],UZ:[41.38,64.59],
  VU:[-15.38,166.96],VE:[6.42,-66.59],VN:[14.06,108.28],YE:[15.55,48.52],ZM:[-13.13,27.85],
  ZW:[-19.02,29.15],PR:[18.22,-66.59],
};

const CLEAN_RULES = [
  { id: 'invalid', defaultOn: true, info: false,
    title: { es: 'Coordenadas ausentes o fuera de rango', en: 'Missing or out-of-range coordinates' },
    desc: { es: 'Latitud/longitud vacía, no numérica, |lat|>90 o |lon|>180.', en: 'Empty or non-numeric latitude/longitude, |lat|>90 or |lon|>180.' } },
  { id: 'zeroZero', defaultOn: true, info: false,
    title: { es: 'Coordenada (0, 0)', en: 'Coordinate (0, 0)' },
    desc: { es: 'Punto en el golfo de Guinea; casi siempre un error de georreferenciación.', en: 'A point in the Gulf of Guinea; almost always a georeferencing error.' } },
  { id: 'latEqLon', defaultOn: false, info: true,
    title: { es: 'Latitud ≈ longitud', en: 'Latitude ≈ longitude' },
    desc: { es: '|lat| y |lon| casi idénticos (lejos de 0); patrón sospechoso de error.', en: '|lat| and |lon| almost identical (far from 0); a suspicious pattern.' } },
  { id: 'gbifIssues', defaultOn: false, info: true,
    title: { es: 'Issues geoespaciales de GBIF', en: 'GBIF geospatial issues' },
    desc: { es: 'Registros con COUNTRY_COORDINATE_MISMATCH, PRESUMED_SWAPPED_COORDINATE, etc.', en: 'Records with COUNTRY_COORDINATE_MISMATCH, PRESUMED_SWAPPED_COORDINATE, etc.' } },
  { id: 'exactDup', defaultOn: true, info: false,
    title: { es: 'Duplicados exactos de coordenada', en: 'Exact coordinate duplicates' },
    desc: { es: 'Misma lat/lon exacta que otro registro (se conserva el primero).', en: 'Exactly the same lat/lon as another record (the first is kept).' } },
  { id: 'roundedDup', defaultOn: true, info: false,
    title: { es: 'Duplicados por redondeo', en: 'Duplicates after rounding' },
    desc: { es: 'Misma lat/lon al redondear a N decimales (se conserva el primero).', en: 'Same lat/lon after rounding to N decimals (the first is kept).' } },
  { id: 'lowPrec', defaultOn: false, info: true,
    title: { es: 'Baja precisión', en: 'Low precision' },
    desc: { es: 'Incertidumbre mayor al umbral, o coordenadas con ≤2 decimales.', en: 'Uncertainty above the threshold, or coordinates with ≤2 decimals.' } },
  { id: 'countryCentroid', defaultOn: true, info: false,
    title: { es: 'Centroide de país', en: 'Country centroid' },
    desc: { es: 'A menos de ~10 km del centro geográfico del país indicado.', en: 'Within ~10 km of the geographic centre of the stated country.' } },
  { id: 'spatialOutlier', defaultOn: true, info: false,
    title: { es: 'Valores atípicos espaciales', en: 'Spatial outliers' },
    desc: { es: 'Distancia al centro de la nube mayor a k·IQR (por taxón).', en: 'Distance to the centre of the point cloud greater than k·IQR (per taxon).' } },
];

function buildCleanRules() {
  const box = el('cleanRules');
  box.innerHTML = '';
  CLEAN_RULES.forEach(rule => {
    if (!(rule.id in state.cleanRules)) state.cleanRules[rule.id] = rule.defaultOn;
    const div = document.createElement('div');
    div.className = 'rule-item';
    div.innerHTML = `
      <input type="checkbox" data-rule="${rule.id}" ${state.cleanRules[rule.id] ? 'checked' : ''}>
      <div class="rule-body">
        <div class="rule-title">${labHTML(rule.title)}${rule.info ? `<span class="tag-info">${L2('informativa', 'informative')}</span>` : ''}</div>
        <div class="rule-desc">${labHTML(rule.desc)}</div>
      </div>
      <span class="rule-hits zero" id="hits-${rule.id}">—</span>`;
    div.querySelector('input').addEventListener('change', e => {
      state.cleanRules[rule.id] = e.target.checked;
      previewCleanHits();
    });
    box.appendChild(div);
  });
  previewCleanHits();
}

function readCleanParams() {
  state.cleanParams = {
    dupDecimals: Math.max(0, Math.min(6, parseInt(el('dupDecimals').value, 10) || 4)),
    uncThreshold: Math.max(0, parseFloat(el('uncThreshold').value) || 10000),
    outlierK: Math.max(1, parseFloat(el('outlierK').value) || 3),
  };
}

/* Marks each record of `recs` with _drop = rule id (or null) and returns the count per rule.
   Rules are applied in a chain: a record already dropped is not marked again by another rule.
   `preview=true` evaluates ALL the rules (for the preview of how many each one would flag). */
function computeCleaning(recs, preview) {
  readCleanParams();
  const P = state.cleanParams;
  const counts = {}; CLEAN_RULES.forEach(r => counts[r.id] = 0);
  recs.forEach(r => r._drop = null);

  const on = id => preview || state.cleanRules[id];
  const mark = (r, id) => { if (r._drop == null) { r._drop = id; counts[id]++; } };

  if (on('invalid')) for (const r of recs) {
    if (r.decimalLatitude == null || r.decimalLongitude == null ||
        Math.abs(r.decimalLatitude) > 90 || Math.abs(r.decimalLongitude) > 180) mark(r, 'invalid');
  }
  // from here on the coordinates are assumed valid; invalid ones are skipped
  const coordOk = r => r._drop == null && r.decimalLatitude != null && r.decimalLongitude != null &&
    Math.abs(r.decimalLatitude) <= 90 && Math.abs(r.decimalLongitude) <= 180;

  if (on('zeroZero')) for (const r of recs) {
    if (coordOk(r) && Math.abs(r.decimalLatitude) < 0.01 && Math.abs(r.decimalLongitude) < 0.01) mark(r, 'zeroZero');
  }
  if (on('latEqLon')) for (const r of recs) {
    if (coordOk(r) && Math.abs(Math.abs(r.decimalLatitude) - Math.abs(r.decimalLongitude)) < 0.001 &&
        Math.abs(r.decimalLatitude) > 1) mark(r, 'latEqLon');
  }
  const BAD_ISSUES = ['COUNTRY_COORDINATE_MISMATCH', 'PRESUMED_SWAPPED_COORDINATE',
    'PRESUMED_NEGATED_LATITUDE', 'PRESUMED_NEGATED_LONGITUDE', 'ZERO_COORDINATE',
    'COORDINATE_INVALID', 'COORDINATE_OUT_OF_RANGE'];
  if (on('gbifIssues')) for (const r of recs) {
    if (coordOk(r) && BAD_ISSUES.some(i => (r.issues || '').includes(i))) mark(r, 'gbifIssues');
  }
  // exact duplicates / duplicates after rounding
  const seenExact = new Set(), seenRound = new Set(), d = P.dupDecimals;
  for (const r of recs) {
    if (!coordOk(r)) continue;
    const ex = r.decimalLatitude + ',' + r.decimalLongitude;
    if (seenExact.has(ex)) { if (on('exactDup')) mark(r, 'exactDup'); continue; }
    seenExact.add(ex);
    const rk = r.decimalLatitude.toFixed(d) + ',' + r.decimalLongitude.toFixed(d);
    if (seenRound.has(rk)) { if (on('roundedDup')) mark(r, 'roundedDup'); continue; }
    seenRound.add(rk);
  }
  if (on('lowPrec')) for (const r of recs) {
    if (!coordOk(r)) continue;
    const dec = Math.max(decimalPlaces(r.decimalLatitude), decimalPlaces(r.decimalLongitude));
    const lowUnc = r.coordinateUncertaintyInMeters != null && r.coordinateUncertaintyInMeters > P.uncThreshold;
    if (lowUnc || dec <= 2) mark(r, 'lowPrec');
  }
  if (on('countryCentroid')) for (const r of recs) {
    if (!coordOk(r)) continue;
    const c = COUNTRY_CENTROIDS[(r.countryCode || '').toUpperCase()];
    if (c && haversineKm(r.decimalLatitude, r.decimalLongitude, c[0], c[1]) < 10) mark(r, 'countryCentroid');
  }
  if (on('spatialOutlier')) {
    const byTaxon = {};
    for (const r of recs) if (coordOk(r)) (byTaxon[r.taxon || 'sp'] ||= []).push(r);
    for (const group of Object.values(byTaxon)) {
      if (group.length < 8) continue;
      const clat = median(group.map(r => r.decimalLatitude));
      const clon = median(group.map(r => r.decimalLongitude));
      const dists = group.map(r => haversineKm(r.decimalLatitude, r.decimalLongitude, clat, clon));
      const sorted = [...dists].sort((a, b) => a - b);
      const q1 = quantile(sorted, 0.25), q3 = quantile(sorted, 0.75);
      const fence = q3 + P.outlierK * (q3 - q1);
      group.forEach((r, i) => { if (dists[i] > fence) mark(r, 'spatialOutlier'); });
    }
  }
  return counts;
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/* Preview on the filtered set: how many records each rule would claim
   if all the rules were applied in a chain (the total is not double-counted). */
function previewCleanHits() {
  const recs = state.filtered.map(r => ({ ...r }));
  const counts = computeCleaning(recs, true);
  CLEAN_RULES.forEach(rule => {
    const span = el('hits-' + rule.id);
    const n = counts[rule.id];
    span.innerHTML = n ? L2(`${n.toLocaleString('en-US')} marcados`, `${n.toLocaleString('en-US')} flagged`) : '0';
    span.className = 'rule-hits ' + (n ? 'some' : 'zero');
  });
}

el('runCleanBtn').addEventListener('click', runClean);
['dupDecimals', 'uncThreshold', 'outlierK'].forEach(id =>
  el(id).addEventListener('change', previewCleanHits));

function runClean() {
  const recs = state.filtered.map(r => ({ ...r }));
  const counts = computeCleaning(recs, false);
  const kept = recs.filter(r => r._drop == null);
  state.clean = kept;
  state.cleanReport = { counts, kept: kept.length, input: recs.length, all: recs };

  statTiles('cleanSummary', [
    [{ es: 'Entraron', en: 'Entered' }, recs.length.toLocaleString('en-US')],
    [{ es: 'Depurados', en: 'Cleaned' }, kept.length.toLocaleString('en-US')],
    [{ es: 'Descartados', en: 'Discarded' }, (recs.length - kept.length).toLocaleString('en-US')],
    [{ es: '% conservado', en: '% kept' }, recs.length ? (kept.length / recs.length * 100).toFixed(1) + '%' : '—'],
  ]);

  const ruleRows = CLEAN_RULES.map(rule => ({
    regla: rule.title,
    estado: state.cleanRules[rule.id] ? { es: 'aplicada', en: 'applied' } : { es: 'desactivada', en: 'switched off' },
    descartados: state.cleanRules[rule.id] ? (counts[rule.id] || 0).toLocaleString('en-US') : '—',
  }));
  buildTable('cleanRuleTable', [
    { key: 'regla', label: { es: 'Regla', en: 'Rule' } },
    { key: 'estado', label: { es: 'Estado', en: 'Status' } },
    { key: 'descartados', label: { es: 'Registros descartados', en: 'Records discarded' } },
  ], ruleRows);

  el('cleanReportCard').style.display = 'block';
  enableStep(4);
  enableStep(5);
  el('envNPts').textContent = el('envNPts2').textContent = kept.length.toLocaleString('en-US');
  clearMessages('cleanMessages');
  showMessage('cleanMessages', 'success', L2(`Dataset depurado: ${kept.length.toLocaleString('en-US')} registros listos para el mapa y el análisis.`,
    `Cleaned dataset: ${kept.length.toLocaleString('en-US')} records ready for the map and the analysis.`));
}

el('toStep4Btn').addEventListener('click', () => goToStep(4));

window.buildCleanRules = buildCleanRules;
window.CLEAN_RULES = CLEAN_RULES;
