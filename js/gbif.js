/* Talking to the GBIF API (https://api.gbif.org/v1). It supports CORS, so it works from the browser. */

const GBIF_BASE = 'https://api.gbif.org/v1';

/* An error that carries its message in both languages (shown with L2) */
function bilingualError(es, en) { const e = new Error(en); e.html = L2(es, en); return e; }
const errHTML = e => e && e.html ? e.html : esc(e && e.message ? e.message : e);

/* GET with retries and growing waits on transient GBIF errors
   (429 = too many requests; 500/502/503/504 = overloaded or under maintenance; network failure). */
async function gbifJSON(url, { retries = 6, onWait } = {}) {
  let wait = 1500;
  for (let attempt = 0; ; attempt++) {
    let r, body;
    try {
      r = await fetch(url, { headers: { Accept: 'application/json' } });
      /* the body is read inside the try on purpose: a page of 300 records weighs a couple of megabytes and the
         connection can die while it is being streamed. That failure arrives as a rejection of r.json(), not of
         fetch(), and before it was thrown raw ("Failed to fetch") in the middle of a long download. */
      if (r.ok) body = await r.json();
    } catch (netErr) {
      if (attempt >= retries) throw bilingualError('se perdió la conexión con GBIF (' + netErr.message + ')', 'the connection to GBIF was lost (' + netErr.message + ')');
      if (onWait) onWait(attempt + 1, retries, wait);
      await sleep(wait); wait = Math.min(wait * 2, 30000); continue;
    }
    if (r.ok) return body;
    const transient = r.status === 429 || (r.status >= 500 && r.status <= 504);
    if (transient && attempt < retries) {
      const ra = parseInt(r.headers.get('Retry-After'), 10), w = ra ? ra * 1000 : wait;
      if (onWait) onWait(attempt + 1, retries, w);
      await sleep(w); wait = Math.min(wait * 2, 30000); continue;
    }
    throw bilingualError(
      `GBIF respondió ${r.status}` + (r.status === 503 ? ' — servicio temporalmente no disponible (servidor saturado o en mantenimiento). Espera unos minutos y reintenta.'
        : r.status === 429 ? ' — demasiadas peticiones seguidas. Espera un momento y reintenta.' : ` (${r.statusText || 'sin detalle'})`),
      `GBIF answered ${r.status}` + (r.status === 503 ? ' — service temporarily unavailable (overloaded or under maintenance). Wait a few minutes and try again.'
        : r.status === 429 ? ' — too many requests in a row. Wait a moment and try again.' : ` (${r.statusText || 'no detail'})`));
  }
}

async function gbifMatch(name) {
  return gbifJSON(`${GBIF_BASE}/species/match?verbose=true&name=${encodeURIComponent(name)}`);
}

/* ---------- country filter (step 1) ----------
   GBIF accepts the country parameter repeated, with OR semantics: country=MX&country=GT. Asking for the countries
   of interest from the start is far better than downloading the world and filtering afterwards: the count GBIF
   reports already comes filtered, and a species like maize goes from 153,301 records to a manageable number.
   The list covers Mexico, Central America and South America, which is the region this app is used in; with none
   ticked there is no country filter at all and step 2 can still filter whatever arrives. */
const GBIF_REGIONS = [
  { id: 'mx', es: 'México', en: 'Mexico', paises: [['MX', 'México', 'Mexico']] },
  { id: 'ca', es: 'Centroamérica', en: 'Central America', paises: [
    ['GT', 'Guatemala', 'Guatemala'], ['BZ', 'Belice', 'Belize'], ['SV', 'El Salvador', 'El Salvador'],
    ['HN', 'Honduras', 'Honduras'], ['NI', 'Nicaragua', 'Nicaragua'], ['CR', 'Costa Rica', 'Costa Rica'],
    ['PA', 'Panamá', 'Panama']] },
  { id: 'sa', es: 'Sudamérica', en: 'South America', paises: [
    ['CO', 'Colombia', 'Colombia'], ['VE', 'Venezuela', 'Venezuela'], ['GY', 'Guyana', 'Guyana'],
    ['SR', 'Surinam', 'Suriname'], ['GF', 'Guayana Francesa', 'French Guiana'], ['EC', 'Ecuador', 'Ecuador'],
    ['PE', 'Perú', 'Peru'], ['BO', 'Bolivia', 'Bolivia'], ['BR', 'Brasil', 'Brazil'],
    ['PY', 'Paraguay', 'Paraguay'], ['CL', 'Chile', 'Chile'], ['AR', 'Argentina', 'Argentina'],
    ['UY', 'Uruguay', 'Uruguay']] },
];
/* the name in one language: L2 would nest its twin spans inside another L2 and both names would show up */
const gbifCountryName = (code, lang) => {
  for (const r of GBIF_REGIONS) for (const p of r.paises) if (p[0] === code) return lang === 'en' ? p[2] : p[1];
  return code;
};
const gbifCountryList = (codes, lang) => codes.map(c => gbifCountryName(c, lang)).join(', ');
const selectedCountries = () => [...document.querySelectorAll('#gbifCountries input:checked')].map(i => i.value);

function buildCountryFilter() {
  const box = el('gbifCountries'), btns = el('gbifCountryBtns');
  if (!box || box.childElementCount) return;                    /* built once */
  let html = '';
  for (const r of GBIF_REGIONS)
    for (const [code, es, en] of r.paises)
      html += `<label class="state-item" data-region="${r.id}"><input type="checkbox" value="${code}">` +
        `<span class="st-n"><span data-l="es">${es}</span><span data-l="en">${en}</span></span><span class="st-c">${code}</span></label>`;
  box.innerHTML = html;
  btns.innerHTML = GBIF_REGIONS.map(r => `<button type="button" data-region="${r.id}"><span data-l="es">${r.es}</span><span data-l="en">${r.en}</span></button>`).join('');
  const sync = () => {
    for (const b of btns.querySelectorAll('button')) {
      const items = [...box.querySelectorAll(`label[data-region="${b.dataset.region}"] input`)];
      b.classList.toggle('on', items.length > 0 && items.every(i => i.checked));
    }
    const n = selectedCountries().length;
    clearMessages('gbifCountryStatus');
    if (n) {
      const cs = selectedCountries();
      showMessage('gbifCountryStatus', 'info',
        L2(`Se pedirán a GBIF solo los registros de ${n === 1 ? 'un país' : n + ' países'}: ${gbifCountryList(cs, 'es')}.`,
          `GBIF will be asked only for records from ${n === 1 ? 'one country' : n + ' countries'}: ${gbifCountryList(cs, 'en')}.`));
    }
  };
  btns.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const items = [...box.querySelectorAll(`label[data-region="${b.dataset.region}"] input`)];
    const todos = items.every(i => i.checked);                  /* a group button works as a switch */
    items.forEach(i => { i.checked = !todos; });
    sync();
  });
  box.addEventListener('change', sync);
  el('gcNone').addEventListener('click', e => { e.preventDefault(); box.querySelectorAll('input').forEach(i => { i.checked = false; }); sync(); });
  document.addEventListener('langchange', sync);
}

/* Fields kept from each occurrence. */
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
    source: 'GBIF',
    _drop: null,
  };
}
function numOrNull(v) { return (v === null || v === undefined || v === '' || isNaN(+v)) ? null : +v; }
function infraTaxonLabel(o) {
  const rank = (o.taxonRank || '').toUpperCase();
  if (rank === 'SPECIES' || !o.infraspecificEpithet) return o.species || o.scientificName || '';
  const marker = rank === 'SUBSPECIES' ? 'subsp.' : rank === 'VARIETY' ? 'var.' : rank === 'FORM' ? 'f.' : '';
  return `${o.species || ''} ${marker} ${o.infraspecificEpithet}`.trim();
}

/* Paged download of all the records with coordinates. */
async function gbifFetchOccurrences(taxonKey, opts, onProgress) {
  const LIMIT = 300;
  const params = new URLSearchParams();
  params.set('taxonKey', taxonKey);
  params.set('hasCoordinate', 'true');
  if (opts.noGeoIssue) params.set('hasGeospatialIssue', 'false');
  params.set('limit', LIMIT);
  for (const c of (opts.countries || [])) params.append('country', c);   /* repeated = OR between countries */
  const notifyWait = (n, max, ms) =>
    onProgress(null, null, null, T(`GBIF ocupado; reintento ${n}/${max} en ${Math.round(ms / 1000)} s…`, `GBIF busy; retry ${n}/${max} in ${Math.round(ms / 1000)} s…`));

  const first = await gbifJSON(`${GBIF_BASE}/occurrence/search?${params}&offset=0`, { onWait: notifyWait });
  const total = first.count;
  const cap = Math.min(total, opts.maxRecords, 99000);   // GBIF: offset + limit < 100000
  const out = first.results.map(normalizeOccurrence);
  onProgress(out.length, cap, total);
  let offset = LIMIT;
  while (offset < cap) {
    let page;
    try {
      page = await gbifJSON(`${GBIF_BASE}/occurrence/search?${params}&offset=${offset}`, { onWait: notifyWait });
    } catch (err) {
      /* a download of tens of thousands of records can die at page fifty; what was already downloaded is good
         data and the caller decides whether to keep it */
      err.partial = out.slice(0, cap); err.partialTotal = total;
      throw err;
    }
    if (!page.results || !page.results.length) break;
    for (const o of page.results) out.push(normalizeOccurrence(o));
    onProgress(Math.min(out.length, cap), cap, total);
    offset += LIMIT;
    if (page.endOfRecords) break;
    await sleep(120);          /* a short pause between pages: GBIF asks for it and it avoids the 429s of a long run */
  }
  return { records: out.slice(0, cap), total, truncated: total > cap };
}

/* ---------- Step 1 UI ---------- */
el('matchBtn').addEventListener('click', doMatch);
el('speciesInput').addEventListener('keydown', e => { if (e.key === 'Enter') doMatch(); });

function renderMatch() {
  const m = state.match; if (!m) return;
  const rows = [
    [L2('Nombre buscado', 'Name searched'), esc(state.query)],
    [L2('Nombre aceptado', 'Accepted name'), esc(m.canonicalName || m.scientificName || '—')],
    [L2('Autoría', 'Authorship'), esc((m.scientificName || '').replace(m.canonicalName || '', '').trim() || '—')],
    [L2('Rango', 'Rank'), esc(m.rank || '—')],
    [L2('Estatus', 'Status'), esc(m.status || '—')],
    [L2('Familia', 'Family'), esc(m.family || '—')],
    [L2('Género', 'Genus'), esc(m.genus || '—')],
    ['usageKey (taxonKey)', esc(m.usageKey)],
    [L2('Confianza del match', 'Match confidence'), esc((m.confidence ?? '—') + (m.matchType ? ` · ${m.matchType}` : ''))],
  ];
  let html = `<div class="accepted">${esc(m.scientificName || m.canonicalName)}</div><dl>`;
  for (const [k, v] of rows) html += `<dt>${k}</dt><dd>${v}</dd>`;
  html += '</dl>';
  if (m.synonym) html += `<p class="hint">${L2('GBIF marca el nombre buscado como sinónimo; se usará el aceptado.', 'GBIF flags the name searched as a synonym; the accepted one will be used.')}</p>`;
  el('matchResult').innerHTML = html;
}

async function doMatch() {
  const name = el('speciesInput').value.trim();
  clearMessages('matchMessages');
  el('matchResult').style.display = 'none';
  el('fetchCard').style.display = 'none';
  el('rawPreviewCard').style.display = 'none';
  if (!name) { showMessage('matchMessages', 'error', L2('Escribe un nombre científico.', 'Type a scientific name.')); return; }
  showSpinner(T('Consultando GBIF…', 'Querying GBIF…'));
  try {
    const m = await gbifMatch(name);
    if (!m || m.matchType === 'NONE' || !m.usageKey) {
      showMessage('matchMessages', 'error', L2(`GBIF no reconoció «${esc(name)}». Revisa la ortografía o prueba solo con el género.`,
        `GBIF did not recognise «${esc(name)}». Check the spelling or try the genus alone.`));
      return;
    }
    state.query = name; state.match = m;
    renderMatch();
    el('matchResult').style.display = 'block';
    el('fetchCard').style.display = 'block';
    buildCountryFilter();
    showMessage('matchMessages', 'success', L2('Nombre resuelto. Ahora descarga los registros de presencia.', 'Name resolved. Now download the presence records.'));
  } catch (err) {
    showMessage('matchMessages', 'error', L2('No se pudo consultar GBIF: ', 'Could not query GBIF: ') + errHTML(err) +
      '<br>' + L2('Verifica tu conexión a internet o usa los registros de ejemplo.', 'Check your internet connection or use the example records.'));
  } finally { hideSpinner(); }
}

el('fetchBtn').addEventListener('click', doFetch);

async function doFetch() {
  if (!state.match) return;
  clearMessages('fetchMessages');
  const opts = {
    noGeoIssue: el('optNoGeoIssue').checked,
    includeInfra: el('optIncludeInfra').checked,
    maxRecords: Math.max(300, parseInt(el('maxRecords').value, 10) || 20000),
    countries: selectedCountries(),
  };
  el('fetchProgress').style.display = 'flex';
  el('fetchBtn').disabled = true;
  const setProg = (done, cap, total, note) => {
    if (note) { el('fetchProgressLabel').textContent = note; return; }
    el('fetchProgressFill').style.width = (cap ? Math.round(done / cap * 100) : 0) + '%';
    el('fetchProgressLabel').textContent = T(
      `${done.toLocaleString('en-US')} / ${cap.toLocaleString('en-US')} (GBIF reporta ${total.toLocaleString('en-US')} en total)`,
      `${done.toLocaleString('en-US')} / ${cap.toLocaleString('en-US')} (GBIF reports ${total.toLocaleString('en-US')} in total)`);
  };
  try {
    let { records, total, truncated } = await gbifFetchOccurrences(state.match.usageKey, opts, setProg);
    if (!opts.includeInfra) {
      const before = records.length;
      records = records.filter(r => (r.taxonRank || '').toUpperCase() === 'SPECIES');
      if (before !== records.length)
        showMessage('fetchMessages', 'info', L2(`${before - records.length} registros infraespecíficos excluidos (subespecies, variedades y formas).`,
          `${before - records.length} infraspecific records excluded (subspecies, varieties and forms).`));
    }
    const own = state.raw.filter(r => r.source === 'user');      // records uploaded by the user survive a new GBIF download
    if (own.length) {
      records = records.concat(own);
      showMessage('fetchMessages', 'info', L2(`Se conservaron tus ${own.length.toLocaleString('en-US')} registros propios y se sumaron a los de GBIF.`,
        `Your ${own.length.toLocaleString('en-US')} own records were kept and added to the GBIF ones.`));
    }
    acceptRecords(records, total, truncated);
  } catch (err) {
    showMessage('fetchMessages', 'error', L2('Error al descargar los registros: ', 'Error downloading the records: ') + errHTML(err));
    /* the download died halfway: offer what did arrive instead of throwing it away */
    const partial = err.partial || [];
    if (partial.length) {
      const id = 'usePartialBtn';
      showMessage('fetchMessages', 'warning',
        L2(`Alcanzaron a descargarse <b>${partial.length.toLocaleString('en-US')}</b> registros antes del corte. Puedes usarlos tal cual o volver a intentar la descarga completa.`,
          `<b>${partial.length.toLocaleString('en-US')}</b> records were downloaded before the cut. You can use them as they are or try the full download again.`) +
        ` <button type="button" class="btn btn-secondary btn-sm" id="${id}">${L2('Usar estos ' + partial.length.toLocaleString('en-US') + ' registros', 'Use these ' + partial.length.toLocaleString('en-US') + ' records')}</button>`);
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', () => {
        let recs = partial;
        if (!opts.includeInfra) recs = recs.filter(r => (r.taxonRank || '').toUpperCase() === 'SPECIES');
        const own = state.raw.filter(r => r.source === 'user');
        if (own.length) recs = recs.concat(own);
        clearMessages('fetchMessages');
        acceptRecords(recs, err.partialTotal || recs.length, true);
      });
    }
  } finally { el('fetchBtn').disabled = false; }
}

/* common entry for downloaded and bundled records */
function acceptRecords(records, total, truncated) {
  records.forEach(r => { if (!r.source) r.source = 'GBIF'; });
  state.raw = records;
  state.fetchMeta = { count: total, fetched: records.length, truncated };
  if (truncated)
    showMessage('fetchMessages', 'warning', L2(`GBIF tiene ${total.toLocaleString('en-US')} registros (con el filtro de países aplicado, si lo hay); se descargaron los primeros ${records.length.toLocaleString('en-US')} (límite configurado). Aumenta el límite si necesitas todos.`,
      `GBIF holds ${total.toLocaleString('en-US')} records; the first ${records.length.toLocaleString('en-US')} were downloaded (configured limit). Raise the limit if you need them all.`));
  showMessage('fetchMessages', 'success', L2(`${records.length.toLocaleString('en-US')} registros con coordenadas cargados.`, `${records.length.toLocaleString('en-US')} records with coordinates loaded.`));
  renderRawPreview();
  enableStep(2);
  if (window.buildFilters) window.buildFilters();
}
window.acceptRecords = acceptRecords;

/* Bundled example (js/example-records.js): works offline and from a double-clicked index.html */
el('loadExampleBtn').addEventListener('click', () => {
  const ex = window.EXAMPLE_RECORDS;
  clearMessages('matchMessages'); clearMessages('fetchMessages');
  if (!ex) { showMessage('matchMessages', 'error', L2('No se encontró el archivo js/example-records.js.', 'The file js/example-records.js was not found.')); return; }
  el('speciesInput').value = ex.query;
  state.query = ex.query; state.match = ex.match;
  renderMatch();
  el('matchResult').style.display = 'block';
  el('fetchCard').style.display = 'block';
  buildCountryFilter();
  const records = ex.rows.map(row => { const o = {}; ex.cols.forEach((c, i) => { o[c] = row[i]; }); o._drop = null; return o; });
  acceptRecords(records, ex.total, false);
  const nT = ex.total.toLocaleString('en-US'), nR = records.length.toLocaleString('en-US');
  showMessage('matchMessages', 'info', L2(`Registros de ejemplo cargados: ${nR} de <i>${esc(ex.query)}</i> (los primeros que entregó GBIF de ${nT} con coordenadas, descargados el ${esc(ex.retrieved)}). GBIF no se consultó ahora.`,
    `Example records loaded: ${nR} of <i>${esc(ex.query)}</i> (the first ones GBIF returned out of ${nT} with coordinates, downloaded on ${esc(ex.retrieved)}). GBIF was not queried now.`));
});

const RAW_COLUMNS = [
  { key: 'key', label: 'ID' },
  { key: 'source', label: { es: 'Origen', en: 'Source' }, get: r => r.source === 'user' ? { es: 'Propio', en: 'Own' } : 'GBIF' },
  { key: 'taxon', label: { es: 'Taxón', en: 'Taxon' } },
  { key: 'taxonRank', label: { es: 'Rango', en: 'Rank' } },
  { key: 'decimalLatitude', label: 'Lat' },
  { key: 'decimalLongitude', label: 'Lon' },
  { key: 'coordinateUncertaintyInMeters', label: { es: 'Incert. (m)', en: 'Uncert. (m)' } },
  { key: 'country', label: { es: 'País', en: 'Country' } },
  { key: 'stateProvince', label: { es: 'Estado', en: 'State' }, get: r => r._region || r.stateProvince },
  { key: 'year', label: { es: 'Año', en: 'Year' } },
  { key: 'basisOfRecord', label: { es: 'Tipo', en: 'Type' } },
  { key: 'institutionCode', label: { es: 'Institución', en: 'Institution' } },
  { key: 'issues', label: { es: 'Issues GBIF', en: 'GBIF issues' } },
];

function renderRawPreview() {
  const r = state.raw;
  const nInfra = r.filter(x => (x.taxonRank || '').toUpperCase() !== 'SPECIES').length;
  const countries = new Set(r.map(x => x.country).filter(Boolean));
  const years = r.map(x => x.year).filter(Boolean);
  statTiles('rawSummary', [
    [{ es: 'Registros', en: 'Records' }, r.length.toLocaleString('en-US')],
    [{ es: 'Infraespecíficos', en: 'Infraspecific' }, nInfra.toLocaleString('en-US')],
    [{ es: 'Países', en: 'Countries' }, countries.size],
    [{ es: 'Rango de años', en: 'Year range' }, years.length ? `${Math.min(...years)}–${Math.max(...years)}` : '—'],
  ]);
  buildTable('rawTable', RAW_COLUMNS, r, 200);
  el('rawPreviewCard').style.display = 'block';
}

el('toStep2Btn').addEventListener('click', () => goToStep(2));
window.RAW_COLUMNS = RAW_COLUMNS;
