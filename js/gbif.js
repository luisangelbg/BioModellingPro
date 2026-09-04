/* Interacción con la API de GBIF (https://api.gbif.org/v1). Soporta CORS. */

const GBIF_BASE = 'https://api.gbif.org/v1';

const sleep = ms => new Promise(res => setTimeout(res, ms));

/* GET con reintentos y espera creciente ante errores transitorios de GBIF
   (429 = demasiadas peticiones; 500/502/503/504 = servidor saturado o en mantenimiento;
   fallo de red). */
async function gbifJSON(url, { retries = 5, onWait } = {}) {
  let wait = 1500;
  for (let attempt = 0; ; attempt++) {
    let r;
    try {
      r = await fetch(url, { headers: { Accept: 'application/json' } });
    } catch (netErr) {
      if (attempt >= retries) throw new Error('sin conexión con GBIF (' + netErr.message + ')');
      if (onWait) onWait(attempt + 1, retries, wait);
      await sleep(wait); wait = Math.min(wait * 2, 30000); continue;
    }
    if (r.ok) return r.json();
    const transient = r.status === 429 || (r.status >= 500 && r.status <= 504);
    if (transient && attempt < retries) {
      const ra = parseInt(r.headers.get('Retry-After'), 10);
      const w = ra ? ra * 1000 : wait;
      if (onWait) onWait(attempt + 1, retries, w);
      await sleep(w); wait = Math.min(wait * 2, 30000); continue;
    }
    throw new Error(`GBIF respondió ${r.status}` +
      (r.status === 503 ? ' — servicio temporalmente no disponible (servidor saturado o en mantenimiento). Espera unos minutos y reintenta.'
        : r.status === 429 ? ' — demasiadas peticiones seguidas. Espera un momento y reintenta.'
        : ` (${r.statusText || 'sin detalle'})`));
  }
}

/* Resolver el nombre científico -> taxón aceptado. */
async function gbifMatch(name) {
  const url = `${GBIF_BASE}/species/match?verbose=true&name=${encodeURIComponent(name)}`;
  return gbifJSON(url);
}

/* Campos que conservamos de cada occurrence. */
function normalizeOccurrence(o) {
  return {
    key: o.key,
    scientificName: o.scientificName || '',
    acceptedScientificName: o.acceptedScientificName || o.scientificName || '',
    taxonRank: o.taxonRank || '',
    taxonKey: o.taxonKey,
    speciesKey: o.speciesKey,
    species: o.species || '',
    genus: o.genus || '',
    family: o.family || '',
    infraspecificEpithet: o.infraspecificEpithet || '',
    taxon: infraTaxonLabel(o),
    decimalLatitude: numOrNull(o.decimalLatitude),
    decimalLongitude: numOrNull(o.decimalLongitude),
    coordinateUncertaintyInMeters: numOrNull(o.coordinateUncertaintyInMeters),
    elevation: numOrNull(o.elevation),
    country: o.country || '',
    countryCode: o.countryCode || '',
    stateProvince: o.stateProvince || '',
    locality: o.locality || '',
    year: numOrNull(o.year),
    month: numOrNull(o.month),
    basisOfRecord: o.basisOfRecord || '',
    institutionCode: o.institutionCode || '',
    datasetName: o.datasetName || o.datasetKey || '',
    issues: Array.isArray(o.issues) ? o.issues.join('|') : '',
    _drop: null,     // motivo de descarte (depuración); null = conservado
  };
}

function numOrNull(v) { return (v === null || v === undefined || v === '' || isNaN(+v)) ? null : +v; }

function infraTaxonLabel(o) {
  const rank = (o.taxonRank || '').toUpperCase();
  if (rank === 'SPECIES' || !o.infraspecificEpithet) return o.species || o.scientificName || '';
  const marker = rank === 'SUBSPECIES' ? 'subsp.' : rank === 'VARIETY' ? 'var.' : rank === 'FORM' ? 'f.' : '';
  return `${o.species || ''} ${marker} ${o.infraspecificEpithet}`.trim();
}

/* Descarga paginada de todos los registros con coordenadas. */
async function gbifFetchOccurrences(taxonKey, opts, onProgress) {
  const LIMIT = 300;
  const params = new URLSearchParams();
  params.set('taxonKey', taxonKey);
  params.set('hasCoordinate', 'true');
  if (opts.noGeoIssue) params.set('hasGeospatialIssue', 'false');
  params.set('limit', LIMIT);

  const notifyWait = (n, max, ms) =>
    onProgress(null, null, null, `GBIF ocupado; reintento ${n}/${max} en ${Math.round(ms / 1000)} s…`);

  // primera página para conocer 'count'
  let offset = 0;
  const first = await gbifJSON(`${GBIF_BASE}/occurrence/search?${params}&offset=0`, { onWait: notifyWait });
  const total = first.count;
  const cap = Math.min(total, opts.maxRecords, 99000); // GBIF: offset+limit < 100000
  const out = first.results.map(normalizeOccurrence);
  onProgress(out.length, cap, total);

  offset = LIMIT;
  while (offset < cap) {
    const page = await gbifJSON(`${GBIF_BASE}/occurrence/search?${params}&offset=${offset}`, { onWait: notifyWait });
    if (!page.results || !page.results.length) break;
    for (const o of page.results) out.push(normalizeOccurrence(o));
    onProgress(Math.min(out.length, cap), cap, total);
    offset += LIMIT;
    if (page.endOfRecords) break;
  }
  return { records: out.slice(0, cap), total, truncated: total > cap };
}

/* ---------- Cableado de la UI del Paso 1 ---------- */

el('matchBtn').addEventListener('click', doMatch);
el('speciesInput').addEventListener('keydown', e => { if (e.key === 'Enter') doMatch(); });

async function doMatch() {
  const name = el('speciesInput').value.trim();
  clearMessages('matchMessages');
  el('matchResult').style.display = 'none';
  el('fetchCard').style.display = 'none';
  el('rawPreviewCard').style.display = 'none';
  if (!name) { showMessage('matchMessages', 'error', 'Escribe un nombre científico.'); return; }

  showSpinner('Consultando GBIF…');
  try {
    const m = await gbifMatch(name);
    if (!m || m.matchType === 'NONE' || !m.usageKey) {
      showMessage('matchMessages', 'error',
        `GBIF no reconoció «${name}». Revisa la ortografía o prueba solo con el género.`);
      return;
    }
    state.query = name;
    state.match = m;

    const rows = [
      ['Nombre buscado', name],
      ['Nombre aceptado', m.canonicalName || m.scientificName || '—'],
      ['Autoría', (m.scientificName || '').replace(m.canonicalName || '', '').trim() || '—'],
      ['Rango', m.rank || '—'],
      ['Estatus', m.status || '—'],
      ['Familia', m.family || '—'],
      ['Género', m.genus || '—'],
      ['usageKey (taxonKey)', m.usageKey],
      ['Confianza del match', (m.confidence ?? '—') + (m.matchType ? ` · ${m.matchType}` : '')],
    ];
    let html = `<div class="accepted">${m.scientificName || m.canonicalName}</div><dl>`;
    for (const [k, v] of rows) html += `<dt>${k}</dt><dd>${v}</dd>`;
    html += '</dl>';
    if (m.synonym) html += `<p class="hint">GBIF marca el nombre buscado como sinónimo; se usará el aceptado.</p>`;
    el('matchResult').innerHTML = html;
    el('matchResult').style.display = 'block';
    el('fetchCard').style.display = 'block';
    showMessage('matchMessages', 'success', 'Nombre resuelto. Ahora descarga los registros de presencia.');
  } catch (err) {
    showMessage('matchMessages', 'error', 'No se pudo consultar GBIF: ' + err.message +
      '<br>Verifica tu conexión a internet.');
  } finally {
    hideSpinner();
  }
}

el('fetchBtn').addEventListener('click', doFetch);

async function doFetch() {
  if (!state.match) return;
  clearMessages('fetchMessages');
  const opts = {
    noGeoIssue: el('optNoGeoIssue').checked,
    includeInfra: el('optIncludeInfra').checked,
    maxRecords: Math.max(300, parseInt(el('maxRecords').value, 10) || 20000),
  };
  el('fetchProgress').style.display = 'flex';
  el('fetchBtn').disabled = true;

  const setProg = (done, cap, total, note) => {
    if (note) { el('fetchProgressLabel').textContent = note; return; }
    const pct = cap ? Math.round(done / cap * 100) : 0;
    el('fetchProgressFill').style.width = pct + '%';
    el('fetchProgressLabel').textContent = `${done.toLocaleString()} / ${cap.toLocaleString()} (GBIF reporta ${total.toLocaleString()} en total)`;
  };

  try {
    let { records, total, truncated } = await gbifFetchOccurrences(state.match.usageKey, opts, setProg);

    if (!opts.includeInfra) {
      const before = records.length;
      records = records.filter(r => (r.taxonRank || '').toUpperCase() === 'SPECIES');
      if (before !== records.length)
        showMessage('fetchMessages', 'info', `${before - records.length} registros infraespecíficos excluidos (subespecies/variedades/formas).`);
    }

    state.raw = records;
    state.fetchMeta = { count: total, fetched: records.length, truncated };

    if (truncated)
      showMessage('fetchMessages', 'warning',
        `GBIF tiene ${total.toLocaleString()} registros; se descargaron los primeros ${records.length.toLocaleString()} (límite configurado). Aumenta el límite si necesitas todos.`);
    showMessage('fetchMessages', 'success', `${records.length.toLocaleString()} registros con coordenadas descargados.`);

    renderRawPreview();
    enableStep(2);
    if (window.buildFilters) window.buildFilters();
  } catch (err) {
    showMessage('fetchMessages', 'error', 'Error al descargar registros: ' + err.message);
  } finally {
    el('fetchBtn').disabled = false;
  }
}

const RAW_COLUMNS = [
  { key: 'key', label: 'GBIF key' },
  { key: 'taxon', label: 'Taxón' },
  { key: 'taxonRank', label: 'Rango' },
  { key: 'decimalLatitude', label: 'Lat' },
  { key: 'decimalLongitude', label: 'Lon' },
  { key: 'coordinateUncertaintyInMeters', label: 'Incert. (m)' },
  { key: 'country', label: 'País' },
  { key: 'stateProvince', label: 'Estado' },
  { key: 'year', label: 'Año' },
  { key: 'basisOfRecord', label: 'Tipo' },
  { key: 'institutionCode', label: 'Institución' },
  { key: 'issues', label: 'Issues GBIF' },
];

function renderRawPreview() {
  const r = state.raw;
  const nInfra = r.filter(x => (x.taxonRank || '').toUpperCase() !== 'SPECIES').length;
  const countries = new Set(r.map(x => x.country).filter(Boolean));
  const years = r.map(x => x.year).filter(Boolean);
  statTiles('rawSummary', [
    ['Registros', r.length.toLocaleString()],
    ['Infraespecíficos', nInfra.toLocaleString()],
    ['Países', countries.size],
    ['Rango de años', years.length ? `${Math.min(...years)}–${Math.max(...years)}` : '—'],
  ]);
  buildTable('rawTable', RAW_COLUMNS, r, 200);
  el('rawPreviewCard').style.display = 'block';
}

el('toStep2Btn').addEventListener('click', () => goToStep(2));

window.RAW_COLUMNS = RAW_COLUMNS;
