/* Step 10 · Agroclimatic crop adaptation. Pure JavaScript (typed arrays, no Python engine), so the step is
   instant and works with index.html opened by a double click.

   What it does, in order:
     1. reads monthly minimum and maximum temperature and precipitation (WorldClim 2.1, single-month files or
        12-band CMIP6-style files) over a chosen extent, aggregating f×f blocks to respect a cell limit; when no
        monthly layers are available it reconstructs a monthly cycle from the 19 bioclimatic layers of step 5 and
        flags the derived indices as approximations;
     2. computes agroclimatic indices with a diurnal sine day model (Baskerville & Emin 1969) applied inside each
        month with that month's real number of days: degree days, frost, chilling, heat stress, reference
        evapotranspiration (Hargreaves & Samani 1985 or Thornthwaite 1948), a one-layer water balance, the FAO
        agro-ecological-zones length of growing period (FAO 1978, 1996) and the aridity index with the UNEP (1992)
        classes;
     3. evaluates crop suitability with a mechanistic envelope of the EcoCrop type (FAO concept, formalised by
        Ramirez-Villegas et al. 2013) over the 12 possible planting months, keeping the best one, and reports the
        FAO-style classes, the area per class and the limiting factor per cell;
     4. compares crops, maps climatic analogues, recomputes everything for future monthly sets and writes the
        methods paragraph with its references.

   Language: HTML that stays on the page uses L2(es, en); transient text and <select> option text uses T(es, en)
   and is rebuilt on 'langchange'; table labels and cells use {es, en} objects. Figures are registered with
   Views.reg so they follow language and theme. All code comments are in English. */

(function () {
  const $ = id => document.getElementById(id);
  const bi = (es, en) => ({ es, en: en === undefined ? es : en });

  /* ---------------------------------------------------------------- constants */
  const MDAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];            // 365-day year
  const MID_DOY = [15, 45, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349]; // mid-month day of year (Allen et al. 1998)
  const MON = [bi('ene', 'Jan'), bi('feb', 'Feb'), bi('mar', 'Mar'), bi('abr', 'Apr'), bi('may', 'May'), bi('jun', 'Jun'),
    bi('jul', 'Jul'), bi('ago', 'Aug'), bi('sep', 'Sep'), bi('oct', 'Oct'), bi('nov', 'Nov'), bi('dic', 'Dec')];
  const MONL = [bi('enero', 'January'), bi('febrero', 'February'), bi('marzo', 'March'), bi('abril', 'April'),
    bi('mayo', 'May'), bi('junio', 'June'), bi('julio', 'July'), bi('agosto', 'August'), bi('septiembre', 'September'),
    bi('octubre', 'October'), bi('noviembre', 'November'), bi('diciembre', 'December')];
  /* cyclic month palette: winter blue → spring green → summer yellow → autumn red → winter blue */
  const MON_COL = ['#2b5ea8', '#3f7fb5', '#5aa0a0', '#68b55e', '#9ac63f', '#dcc63a',
    '#f0a63a', '#e8792f', '#d4503a', '#b03f5e', '#7a3f86', '#47489e'];

  const AG_VARS = ['tmin', 'tmax', 'prec', 'tavg', 'srad', 'wind', 'vapr'];
  const AG_NEED = ['tmin', 'tmax', 'prec'];
  const VARNAME = {
    tmin: bi('T mínima', 'Min T'), tmax: bi('T máxima', 'Max T'), prec: bi('Precipitación', 'Precipitation'),
    tavg: bi('T media', 'Mean T'), srad: bi('Radiación solar', 'Solar radiation'), wind: bi('Viento', 'Wind'), vapr: bi('Presión de vapor', 'Vapour pressure'),
  };

  /* regional extents, as [west, south, east, north] */
  const EXT = { mx: [-118.6, 14.4, -86.4, 32.8], mxca: [-118.6, 7.0, -77.0, 32.8], us: [-125.0, 24.4, -66.9, 49.5],
    namer: [-170, 5, -50, 72], latam: [-118.6, -56, -34, 33], samer: [-82, -56.5, -34, 13.5], eu: [-25, 34, 45, 72],
    af: [-18.5, -35, 52, 38], as: [25, -11, 150, 78], oc: [110, -48, 180, -8], world: [-180, -60, 180, 85] };
  const COUNTRY_BOX = { MX: EXT.mx, US: EXT.us, CA: [-141, 41.7, -52.6, 83.1], GT: [-92.3, 13.7, -88.2, 17.8],
    BZ: [-89.3, 15.9, -87.5, 18.5], HN: [-89.4, 12.9, -83.1, 16.5], SV: [-90.1, 13.1, -87.7, 14.5], NI: [-87.7, 10.7, -82.6, 15.0],
    CR: [-85.95, 8.0, -82.5, 11.2], PA: [-83.1, 7.2, -77.2, 9.7], CU: [-85, 19.8, -74.1, 23.3], CO: [-79, -4.3, -66.8, 13.4],
    VE: [-73.4, 0.6, -59.8, 12.2], EC: [-81.1, -5.0, -75.2, 1.5], PE: [-81.4, -18.4, -68.7, 0], BO: [-69.7, -22.9, -57.5, -9.7],
    BR: [-74, -33.8, -34.8, 5.3], CL: [-75.7, -56, -66.4, -17.5], AR: [-73.6, -55.1, -53.6, -21.8], UY: [-58.5, -35, -53, -30],
    PY: [-62.7, -27.6, -54.2, -19.3], ES: [-9.3, 36, 3.3, 43.8] };

  /* ---------------------------------------------------------------- module state */
  const A = {
    mode: null,        // 'monthly' | 'bioclim'
    src: {}, res: null, unknown: [],
    meta: null, ncell: 0, rowArea: null, ra: null, dl: null,
    extentTouched: false, extentKind: null, extentName: '', bbox: null,
    mon: null,         // {tmin, tmax, prec, tavg?} each Float32Array(12 * ncell)
    elev: null,
    idx: null, order: [], approx: false, bioUsed: [],
    opts: null,
    pts: [], ptSource: 'records',
    crop: null, multi: null, best: null, ana: null, zones: null,
    fut: [], scn: '',
    idxMap: null, idxStudio: null, idxOv: null,
    cropMap: null, cropStudio: null, cropOv: null,
    calPoint: null, busy: false,
  };
  window.agro = A;

  const setBar = (fill, label, frac, text) => {
    $(fill).style.width = Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%';
    if (text != null) $(label).textContent = text;
  };
  const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));
  const nz = v => v != null && isFinite(v);
  const err = (es, en) => { const e = new Error(en); e.html = L2(es, en); return e; };
  const eHTML = e => (e && e.html) ? e.html : esc((e && e.message) || e);

  /* ---------------------------------------------------------------- day model */
  /* Baskerville & Emin (1969) single-sine degree days above `base` for one day */
  function ddSine(tn, tx, base) {
    if (tx <= base) return 0;
    const m = (tx + tn) / 2, a = (tx - tn) / 2;
    if (tn >= base) return m - base;
    if (a <= 0) return Math.max(0, m - base);
    const th = Math.asin(Math.max(-1, Math.min(1, (base - m) / a)));
    return ((m - base) * (Math.PI / 2 - th) + a * Math.cos(th)) / Math.PI;
  }
  /* horizontal cut-off at `cap`: everything above the cap counts as the cap */
  const ddCap = (tn, tx, base, cap) => cap > base ? Math.max(0, ddSine(tn, tx, base) - ddSine(tn, tx, cap)) : ddSine(tn, tx, base);
  /* hours of the day below `thr`, integrating the same diurnal sine curve */
  function hoursBelow(tn, tx, thr) {
    if (tx <= thr) return 24;
    if (tn >= thr) return 0;
    const m = (tx + tn) / 2, a = (tx - tn) / 2;
    if (a <= 0) return m < thr ? 24 : 0;
    return 12 * (1 + 2 * Math.asin(Math.max(-1, Math.min(1, (thr - m) / a))) / Math.PI);
  }
  /* Utah model chill units (Richardson et al. 1974), sampled hourly on the sine curve (minimum at 03:00) */
  const utahUnit = t => t < 1.4 ? 0 : t < 2.5 ? 0.5 : t < 9.2 ? 1 : t < 12.5 ? 0.5 : t < 16 ? 0 : t < 18 ? -0.5 : -1;
  function utahDay(tn, tx) {
    const m = (tx + tn) / 2, a = (tx - tn) / 2; let s = 0;
    for (let h = 0; h < 24; h++) s += utahUnit(m + a * Math.sin(2 * Math.PI * (h - 9) / 24));
    return s;
  }
  /* normal distribution function (Abramowitz & Stegun 7.1.26) for the daily deviation of threshold counts */
  function erf(x) {
    const s = x < 0 ? -1 : 1; x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    return s * (1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
  }
  const PHI = z => 0.5 * (1 + erf(z / Math.SQRT2));

  /* extraterrestrial radiation (mm of water equivalent per day) and daylight hours per month, for one latitude */
  function raRow(lat) {
    const phi = lat * Math.PI / 180, ra = new Float64Array(12), dl = new Float64Array(12);
    for (let m = 0; m < 12; m++) {
      const J = MID_DOY[m];
      const dr = 1 + 0.033 * Math.cos(2 * Math.PI * J / 365);
      const de = 0.409 * Math.sin(2 * Math.PI * J / 365 - 1.39);
      const ws = Math.acos(Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(de))));
      const r = (24 * 60 / Math.PI) * 0.0820 * dr * (ws * Math.sin(phi) * Math.sin(de) + Math.cos(phi) * Math.cos(de) * Math.sin(ws));
      ra[m] = Math.max(0, r) * 0.408;          // MJ m⁻² d⁻¹ → mm d⁻¹ (latent heat 2.45 MJ kg⁻¹)
      dl[m] = 24 * ws / Math.PI;
    }
    return { ra, dl };
  }

  /* ---------------------------------------------------------------- file recognition */
  /* Recognises both WorldClim naming schemes: single-month files (…_tmin_01.tif) and 12-band files
     (…_tmin_<model>_<ssp>_<period>.tif or a plain …_tmin.tif with 12 bands). */
  function matchMonthly(name) {
    if (!/\.tiff?$/i.test(name)) return null;
    const base = String(name).replace(/\\/g, '/').split('/').pop();
    let v = null;
    for (const k of AG_VARS) if (new RegExp('(^|[^a-z])' + k + '([^a-z]|$)', 'i').test(base)) { v = k; break; }
    if (!v) return null;
    const fut = base.match(new RegExp(v + '[_-]([A-Za-z0-9][A-Za-z0-9.+-]*?)[_-](ssp\\d{3})[_-](\\d{4}[-_]\\d{4})', 'i'));
    if (fut) {
      /* a scenario file may still carry a month at the end (…_ssp245_2041-2060_01.tif) */
      const tail = base.match(/[_-](\d{1,2})\s*(?:\([^)]*\))?\.tiff?$/);
      const mo = tail && +tail[1] >= 1 && +tail[1] <= 12 ? +tail[1] : null;
      return { v, month: mo, model: fut[1], ssp: fut[2].toLowerCase(), period: fut[3].replace('_', '-') };
    }
    const mm = base.match(new RegExp(v + '[_-]?(\\d{1,2})\\s*(?:\\([^)]*\\))?\\.tiff?$', 'i'));
    if (mm) { const n = +mm[1]; if (n >= 1 && n <= 12) return { v, month: n }; }
    return { v, month: null };
  }
  const resolutionOf = name => { const m = String(name).match(/wc2\.1_(\d+\.?\d*[ms])_/i); return m ? m[1] : null; };

  async function bandCount(file) {
    try { const t = await GeoTIFF.fromBlob(file); const im = await t.getImage(); return im.getSamplesPerPixel(); }
    catch (e) { return 0; }
  }

  /* Groups a file list into {var: {slots:[{file,band}×12], scheme}}; future files (with an ssp) are ignored here. */
  async function collectMonthly(fileList) {
    const out = {}, unknown = [], multi = []; let res = null, nTif = 0;
    for (const f of [...fileList]) {
      if (!/\.tiff?$/i.test(f.name)) continue;
      nTif++;
      const m = matchMonthly(f.name);
      if (!m) { unknown.push(f.name); continue; }
      res = res || resolutionOf(f.name);
      if (m.ssp) continue;                                  // belongs to the future card
      if (m.month) {
        out[m.v] = out[m.v] || { slots: new Array(12).fill(null), scheme: 'single' };
        out[m.v].slots[m.month - 1] = { file: f, band: 0 };
      } else multi.push({ f, v: m.v });
    }
    for (const { f, v } of multi) {
      const complete = out[v] && out[v].slots.every(s => s);
      if (complete) continue;
      if (await bandCount(f) >= 12) out[v] = { slots: Array.from({ length: 12 }, (_, i) => ({ file: f, band: i })), scheme: 'band', name: f.name };
    }
    return { out, unknown, res, nTif };
  }

  function renderFileReport(source, info) {
    const box = $('agFileReport');
    if (A.mode === 'bioclim') {
      box.innerHTML = `<div class="msg msg-warning">${L2(
        `Sin capas mensuales: los índices se derivarán de ${A.bioUsed.length} capas bioclimáticas del paso 5 (${A.bioUsed.map(k => varCode(k)).join(', ')}). Se marcarán como aproximados.`,
        `No monthly layers: the indices will be derived from ${A.bioUsed.length} bioclimatic layers of step 5 (${A.bioUsed.map(k => varCode(k)).join(', ')}). They will be flagged as approximate.`)}</div>`;
      $('agReadBtn').disabled = A.bioUsed.length < 3;
      return;
    }
    const rows = AG_VARS.filter(v => A.src[v]).map(v => {
      const s = A.src[v];
      const cells = s.slots.map((sl, i) => `<span class="ag-mo ${sl ? (s.scheme === 'band' ? 'band' : 'ok') : 'no'}">${T(MON[i].es, MON[i].en).slice(0, 1).toUpperCase()}${i + 1}</span>`).join('');
      return `<div class="ag-months"><span class="ag-vn">${L2(VARNAME[v].es, VARNAME[v].en)}</span>${cells}</div>`;
    }).join('');
    const missing = AG_NEED.filter(v => !A.src[v] || A.src[v].slots.some(s => !s));
    const ok = !missing.length;
    box.innerHTML = `<div class="msg msg-${ok ? 'success' : Object.keys(A.src).length ? 'warning' : 'error'}">${
      ok ? L2(`Capas mensuales completas de temperatura mínima, máxima y precipitación${A.res ? ' (WorldClim ' + esc(A.res) + ')' : ''}.`,
        `Complete monthly layers of minimum and maximum temperature and precipitation${A.res ? ' (WorldClim ' + esc(A.res) + ')' : ''}.`)
        : L2(`Faltan los 12 meses de: ${missing.map(v => VARNAME[v].es).join(', ')}. Puedes cargarlos o usar la vía C (derivar de las bioclimáticas).`,
          `The 12 months of ${missing.map(v => VARNAME[v].en).join(', ')} are missing. Load them or use route C (derive from the bioclimatic layers).`)
      }</div>${rows}${
      A.src.srad || A.src.wind || A.src.vapr ? `<p class="hint">${L2('Se reconocieron también capas de radiación, viento o presión de vapor: esta versión no las usa (permitirían una evapotranspiración de referencia completa tipo Penman-Monteith, no implementada aquí).',
        'Layers of solar radiation, wind or vapour pressure were also recognised: this version does not use them (they would allow a full Penman-Monteith reference evapotranspiration, not implemented here).')}</p>` : ''}${
      A.src.tavg ? `<p class="hint">${L2('Con temperatura media mensual disponible, se usará esa capa para la media del mes en lugar de (mín + máx) / 2.',
        'With monthly mean temperature available, that layer is used for the monthly mean instead of (min + max) / 2.')}</p>` : ''}`;
    $('agReadBtn').disabled = !ok;
    if (source) pickStatus(source, info, ok);
  }
  function pickStatus(source, info, ok) {
    ['Folder', 'Files', 'Bio'].forEach(k => { const s = $('ag' + k + 'Status'); s.textContent = ''; s.className = 'pick-status'; });
    const box = $(source === 'folder' ? 'agFolderStatus' : source === 'files' ? 'agFilesStatus' : 'agBioStatus');
    box.className = 'pick-status' + (ok ? ' ok' : '');
    if (source === 'bio') box.textContent = T(`${A.bioUsed.length} capas bioclimáticas usadas`, `${A.bioUsed.length} bioclimatic layers used`);
    else {
      const nv = AG_VARS.filter(v => A.src[v] && A.src[v].slots.every(s => s)).length;
      box.textContent = T(`${(info && info.nTif) || 0} archivos .tif, ${nv} variable(s) mensuales completas`,
        `${(info && info.nTif) || 0} .tif files, ${nv} complete monthly variable(s)`);
    }
  }

  async function onFiles(fileList, source) {
    showSpinner(T('Reconociendo los archivos…', 'Recognising the files…'));
    try {
      const info = await collectMonthly(fileList);
      A.src = info.out; A.res = info.res; A.unknown = info.unknown;
      A.mode = 'monthly'; A.bioUsed = [];
      renderFileReport(source, info);
    } catch (e) { showMessage('agMessages', 'error', L2('No se pudieron leer los archivos: ', 'The files could not be read: ') + eHTML(e)); }
    finally { hideSpinner(); }
  }
  $('agFolderBtn').addEventListener('click', () => $('agFolder').click());
  $('agFilesBtn').addEventListener('click', () => $('agFiles').click());
  $('agFolder').addEventListener('change', e => { onFiles(e.target.files, 'folder'); e.target.value = ''; });
  $('agFiles').addEventListener('change', e => { onFiles(e.target.files, 'files'); e.target.value = ''; });

  const BIO_WANT = ['bio_1', 'bio_2', 'bio_5', 'bio_6', 'bio_10', 'bio_11', 'bio_12', 'bio_13', 'bio_14', 'bio_15', 'bio_17', 'bio_18', 'bio_19'];
  $('agUseBio').addEventListener('click', () => {
    const f = (state.env && state.env.files) || {};
    A.bioUsed = BIO_WANT.filter(k => f[k]);
    if (!f.bio_1 || !f.bio_12) {
      showMessage('agMessages', 'error', L2('Para derivar los índices hacen falta al menos BIO1 y BIO12: cárgalas en el paso 5.',
        'To derive the indices at least BIO1 and BIO12 are needed: load them in step 5.'));
      return;
    }
    clearMessages('agMessages');
    A.mode = 'bioclim'; A.src = {}; A.res = (state.env && state.env.resolution) || null;
    renderFileReport('bio', null);
    pickStatus('bio', null, A.bioUsed.length >= 3);
  });

  /* ---------------------------------------------------------------- extent */
  const records = () => (state.clean && state.clean.length ? state.clean : (state.filtered || []));
  function recordsCountry() {
    const n = {}; records().forEach(r => { const c = (r.countryCode || '').toUpperCase(); if (c) n[c] = (n[c] || 0) + 1; });
    const top = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
    return top && top[1] >= 0.6 * records().length && COUNTRY_BOX[top[0]] ? top[0] : null;
  }
  /* A map of indices that stops in the middle of the country is almost never what the user wants, so the
     starting extent is the region deliberately chosen in step 2, else the country of the records. */
  const regionNames = () => (window.selectedRegionNames ? window.selectedRegionNames() : []);
  function defaultExtent() {
    const sn = regionNames(), layer = window.regionLayer ? window.regionLayer() : null;
    const chosen = state.filters && state.filters.stateTouched;
    if (chosen && sn.length && layer && sn.length < layer.regions.length && window.regionsBBox && window.regionsBBox(sn)) return 'states';
    return recordsCountry() ? 'country' : 'records';
  }
  const extentLabel = kind => { const o = [...$('agExtent').options].find(x => x.value === kind); return o ? o.textContent.replace(/\s*—.*$/, '').trim() : kind; };
  const fmtBox = b => b ? `${fmt(b.W, 1)}° a ${fmt(b.E, 1)}° · ${fmt(b.S, 1)}° a ${fmt(b.N, 1)}°` : '—';

  function extentUI() {
    const c = recordsCountry(), oc = $('agExtentCountry'), os = $('agExtentSdm'), ost = $('agExtentStates');
    if (oc) { oc.disabled = !c; oc.textContent = T('País de los registros', 'Country of the records') + (c ? ` (${c})` : T(' — no detectado', ' — not detected')); }
    if (os) { const has = !!(window.sdm && sdm.meta); os.disabled = !has; os.textContent = T('La misma del paso de modelado', 'Same as the modelling step') + (has ? '' : T(' — sin preparar', ' — not prepared')); }
    if (ost) { const sn = regionNames(); ost.disabled = !sn.length; ost.textContent = T('Estados o regiones elegidos en el paso 2', 'States or regions chosen in step 2') + (sn.length ? ` (${sn.length})` : T(' — ninguno', ' — none')); }
    if (!A.extentTouched) { const want = defaultExtent(); if ($('agExtent').value !== want) $('agExtent').value = want; }
    $('agExtentCustom').style.display = $('agExtent').value === 'custom' ? 'inline' : 'none';
    extentWarn();
  }

  /* The grid keeps the extent it was read with until it is read again: that is the usual reason for a map that
     stops halfway through the country. */
  function extentWarn() {
    const box = $('agExtentWarn'); if (!box) return;
    box.innerHTML = '';
    if (!A.meta) return;
    const kind = $('agExtent').value, prepared = esc(A.extentName || '');
    if (A.extentKind === kind) {
      box.innerHTML = '<div class="msg msg-info">' + L2('La malla leída usa la extensión <b>' + prepared + '</b> (lon · lat ' + fmtBox(A.bbox) + ').',
        'The grid that was read uses the extent <b>' + prepared + '</b> (lon · lat ' + fmtBox(A.bbox) + ').') + '</div>';
      return;
    }
    box.innerHTML = '<div class="msg msg-warning">' +
      L2('Cambiaste la extensión a <b>' + esc(extentLabel(kind)) + '</b>, pero la malla leída sigue siendo <b>' + prepared + '</b>. Vuelve a leer la malla climática para que los mapas la usen.',
        'You changed the extent to <b>' + esc(extentLabel(kind)) + '</b>, but the grid that was read is still <b>' + prepared + '</b>. Read the climate grid again so the maps use it.') +
      ' <button class="btn btn-primary btn-sm" id="agExtentRedo" style="margin-left:8px">' + L2('Leer la malla de nuevo', 'Read the grid again') + '</button></div>';
    $('agExtentRedo').addEventListener('click', () => $('agReadBtn').click());
  }

  $('agExtent').addEventListener('change', () => { A.extentTouched = true; extentUI(); });
  document.addEventListener('selchange', () => { if ($('agExtent')) extentUI(); });

  function extentBox() {
    const kind = $('agExtent').value, recs = records();
    const margin = Math.max(0, +$('agMargin').value || 0);
    let bbox = null;
    if (recs.length) {
      const lo = recs.map(r => r.decimalLongitude).filter(nz), la = recs.map(r => r.decimalLatitude).filter(nz);
      if (lo.length) bbox = { W: Math.max(-180, Math.min(...lo) - margin), E: Math.min(180, Math.max(...lo) + margin),
        S: Math.max(-90, Math.min(...la) - margin), N: Math.min(90, Math.max(...la) + margin) };
    }
    let b = null;
    if (kind === 'country') { const c = recordsCountry(); b = c ? COUNTRY_BOX[c] : null; }
    else if (kind === 'states') { const r = window.regionsBBox && window.regionsBBox(regionNames()); b = r ? [r.W, r.S, r.E, r.N] : null; }
    else if (kind === 'custom') b = [+$('agExtW').value, +$('agExtS').value, +$('agExtE').value, +$('agExtN').value];
    else if (kind === 'sdm') {
      const m = window.sdm && sdm.meta;
      if (m) b = [m.west, m.north - m.nrow * m.dy, m.west + m.ncol * m.dx, m.north];
    } else if (EXT[kind]) b = EXT[kind];
    if (kind !== 'records') {
      if (!b || b.some(v => !isFinite(v))) throw err('La extensión elegida no está disponible; elige otra.', 'The chosen extent is not available; choose another one.');
      const e2 = { W: Math.max(-180, Math.min(b[0], b[2])), E: Math.min(180, Math.max(b[0], b[2])),
        S: Math.max(-90, Math.min(b[1], b[3])), N: Math.min(90, Math.max(b[1], b[3])) };
      /* an extent chosen by hand is used as it is, like in step 9: widening it to hold every record turned
         «country of the records (MX)» into a box that reached 38.7° N because of a handful of records in the
         United States, and the agroclimatic map no longer showed the country that was asked for */
      return e2;
    }
    if (!bbox) throw err('No hay registros para delimitar la región; elige una extensión regional o personalizada.',
      'There are no records to delimit the region; choose a regional or a custom extent.');
    return bbox;
  }

  /* ---------------------------------------------------------------- grid reading */
  const sameGrid = (a, b) => a.w === b.w && a.h === b.h && Math.abs(a.rx - b.rx) < 1e-12 && Math.abs(a.ry - b.ry) < 1e-12 &&
    Math.abs(a.ox - b.ox) < 1e-9 && Math.abs(a.oy - b.oy) < 1e-9;

  /* Reads every source on one common grid, averaging f×f blocks so the result respects `maxCells`.
     sources[i] = {file, band}. With refMeta the grid of an earlier read is reused (future scenarios).
     progress(i, n) runs before each source. */
  async function readStack(sources, bbox, maxCells, progress, refMeta) {
    const g0 = await openGeo(sources[0].file);
    const ref = refMeta ? refMeta.ref : { ox: g0.ox, oy: g0.oy, rx: g0.rx, ry: g0.ry, w: g0.w, h: g0.h };
    let x0, y0, f, ow, oh;
    if (refMeta) { x0 = refMeta.win.x0; y0 = refMeta.win.y0; f = refMeta.f; ow = refMeta.ncol; oh = refMeta.nrow; }
    else {
      x0 = Math.max(0, Math.floor((bbox.W - g0.ox) / g0.rx));
      const x1 = Math.min(g0.w, Math.ceil((bbox.E - g0.ox) / g0.rx));
      y0 = Math.max(0, Math.floor((bbox.N - g0.oy) / g0.ry));
      const y1 = Math.min(g0.h, Math.ceil((bbox.S - g0.oy) / g0.ry));
      const W = x1 - x0, H = y1 - y0;
      if (W < 4 || H < 4) throw err('La extensión elegida queda fuera de las capas o es demasiado pequeña.',
        'The chosen extent lies outside the layers or is too small.');
      f = Math.max(1, Math.ceil(Math.sqrt(W * H / Math.max(100, maxCells))));
      ow = Math.max(2, Math.floor(W / f)); oh = Math.max(2, Math.floor(H / f));
    }
    const meta = { nrow: oh, ncol: ow, west: ref.ox + x0 * ref.rx, north: ref.oy + y0 * ref.ry,
      dx: ref.rx * f, dy: -ref.ry * f, f, win: { x0, y0 }, ref };
    const ncell = ow * oh, stack = new Float32Array(sources.length * ncell).fill(NaN);
    for (let li = 0; li < sources.length; li++) {
      if (progress) { progress(li, sources.length); await tick(8); }
      const src = sources[li], band = src.band || 0;
      const geo = (li === 0 && !refMeta) ? g0 : await openGeo(src.file);
      const out = stack.subarray(li * ncell, (li + 1) * ncell);
      if (sameGrid(geo, ref)) {
        const rowsPer = Math.max(1, Math.floor(4e6 / (ow * f * f)));
        for (let r0 = 0; r0 < oh; r0 += rowsPer) {
          const nr = Math.min(rowsPer, oh - r0), w = ow * f;
          const data = (await geo.image.readRasters({ window: [x0, y0 + r0 * f, x0 + w, y0 + (r0 + nr) * f], samples: [band] }))[0];
          for (let r = 0; r < nr; r++) for (let c = 0; c < ow; c++) {
            let sum = 0, cnt = 0;
            for (let dy = 0; dy < f; dy++) {
              const bse = (r * f + dy) * w + c * f;
              for (let dx = 0; dx < f; dx++) { const v = data[bse + dx]; if (!isNoData(v, geo.nd)) { sum += v; cnt++; } }
            }
            out[(r0 + r) * ow + c] = cnt >= (f * f) / 2 ? sum / cnt : NaN;
          }
        }
      } else if (band === 0) {
        const pts = [];
        for (let i = 0; i < oh; i++) for (let j = 0; j < ow; j++) pts.push({ lat: meta.north - (i + 0.5) * meta.dy, lon: meta.west + (j + 0.5) * meta.dx });
        const vals = await sampleGeo(geo, pts, { categorical: false });
        for (let i = 0; i < vals.length; i++) out[i] = vals[i] == null ? NaN : vals[i];
      } else throw err('La malla de una de las capas no coincide con la de las demás.', 'The grid of one of the layers does not match the others.');
    }
    return { stack, meta };
  }

  /* per-row cell area (km²) and per-row astronomical terms */
  function rowGeometry(meta) {
    const area = new Float64Array(meta.nrow), ra = new Float64Array(meta.nrow * 12), dl = new Float64Array(meta.nrow * 12);
    for (let r = 0; r < meta.nrow; r++) {
      const lat = meta.north - (r + 0.5) * meta.dy;
      area[r] = Math.max(0, meta.dx * 111.320 * Math.cos(lat * Math.PI / 180)) * (meta.dy * 110.574);
      const g = raRow(lat);
      for (let m = 0; m < 12; m++) { ra[r * 12 + m] = g.ra[m]; dl[r * 12 + m] = g.dl[m]; }
    }
    return { area, ra, dl };
  }

  /* ---------------------------------------------------------------- monthly cycle from the bioclimatic layers */
  /* Route C. The monthly mean temperature follows a cosine with its peak in July north of the equator and in
     January south of it. Its amplitude comes from the warm and cold quarters (BIO10, BIO11), which is exactly what
     they measure, and the cosine is shifted so that the day-weighted annual mean equals BIO1. The diurnal range
     varies linearly with the same cosine between two values chosen so that the warmest month reaches BIO5 and the
     coldest month reaches BIO6. The reconstruction therefore reproduces BIO1, BIO5, BIO6 and BIO7 exactly and
     BIO10 and BIO11 to within the sinusoid assumption. Precipitation follows a cosine whose coefficient of
     variation matches BIO15, is aligned with the warm or the cold season according to BIO18 against BIO19 and is
     rescaled so that the year adds up to BIO12.
     What cannot be recovered: the real month of the thermal and rainfall peaks, the day-to-day variability and any
     departure from a single annual sinusoid (bimodal rainfall, monsoon onsets, marine inversions). */
  function monthlyFromBioclim(bio, meta) {
    const n = meta.ncol * meta.nrow;
    const tmin = new Float32Array(12 * n).fill(NaN), tmax = new Float32Array(12 * n).fill(NaN), prec = new Float32Array(12 * n).fill(NaN);
    const w = new Float64Array(12);
    const g = k => bio[k] || null;
    const b1 = g('bio_1'), b2 = g('bio_2'), b5 = g('bio_5'), b6 = g('bio_6'), b10 = g('bio_10'), b11 = g('bio_11'),
      b12 = g('bio_12'), b15 = g('bio_15'), b18 = g('bio_18'), b19 = g('bio_19');
    const QK = (1 + 2 * Math.cos(Math.PI / 6)) / 3;          // 3-month mean of a sinusoid at its peak, per unit amplitude
    const shape = pk => {
      const c = new Float64Array(12);
      let off = 0;
      for (let m = 0; m < 12; m++) { c[m] = Math.cos(2 * Math.PI * (m - pk) / 12); off += c[m] * MDAYS[m] / 365; }
      return { c, off };
    };
    const SH = { 6: shape(6), 0: shape(0) };
    for (let r = 0; r < meta.nrow; r++) {
      const lat = meta.north - (r + 0.5) * meta.dy, pk = lat >= 0 ? 6 : 0, sh = SH[pk];
      for (let cc = 0; cc < meta.ncol; cc++) {
        const i = r * meta.ncol + cc;
        const t1 = b1 ? b1[i] : NaN, p12 = b12 ? b12[i] : NaN;
        if (!nz(t1) || !nz(p12)) continue;
        const dr0 = b2 && nz(b2[i]) ? Math.max(1, b2[i]) : 10;
        let A = 3;
        if (b10 && b11 && nz(b10[i]) && nz(b11[i])) A = Math.max(0, (b10[i] - b11[i]) / 2 / QK);
        else if (b5 && b6 && nz(b5[i]) && nz(b6[i])) A = Math.max(0, (b5[i] - b6[i] - dr0) / 2);
        const hot = t1 + A * (1 - sh.off), cold = t1 + A * (-1 - sh.off);
        let drH = dr0, drC = dr0;
        if (b5 && b6 && nz(b5[i]) && nz(b6[i])) {
          drH = Math.max(1, Math.min(45, 2 * (b5[i] - hot)));
          drC = Math.max(1, Math.min(45, 2 * (cold - b6[i])));
        }
        const drM = (drH + drC) / 2, drA = (drH - drC) / 2;
        const cv = b15 && nz(b15[i]) ? b15[i] : 60;
        const k = Math.min(0.98, Math.max(0, Math.SQRT2 * cv / 100));
        let wet = pk;
        if (b18 && b19 && nz(b18[i]) && nz(b19[i]) && b18[i] < b19[i]) wet = (pk + 6) % 12;
        let sw = 0;
        for (let m = 0; m < 12; m++) { w[m] = Math.max(0, 1 + k * Math.cos(2 * Math.PI * (m - wet) / 12)); sw += w[m]; }
        if (sw <= 0) { for (let m = 0; m < 12; m++) w[m] = 1; sw = 12; }
        for (let m = 0; m < 12; m++) {
          const t = t1 + A * (sh.c[m] - sh.off), dr = Math.max(0.5, drM + sh.c[m] * drA);
          tmin[m * n + i] = t - dr / 2; tmax[m * n + i] = t + dr / 2; prec[m * n + i] = p12 * w[m] / sw;
        }
      }
    }
    return { tmin, tmax, prec };
  }

  /* ---------------------------------------------------------------- read button */
  $('agReadBtn').addEventListener('click', async () => {
    if (A.busy) return;
    clearMessages('agMessages');
    let bbox;
    try { bbox = extentBox(); } catch (e) { showMessage('agMessages', 'error', eHTML(e)); return; }
    A.extentKind = $('agExtent').value; A.extentName = extentLabel(A.extentKind); A.bbox = bbox;
    const maxCells = Math.max(2000, +$('agMaxCells').value || 30000);
    A.busy = true; $('agReadBtn').disabled = true; $('agProgress').style.display = 'flex';
    try {
      let mon, meta;
      if (A.mode === 'monthly') {
        const vars = AG_VARS.filter(v => A.src[v] && A.src[v].slots.every(s => s));
        const sources = [];
        vars.forEach(v => A.src[v].slots.forEach(s => sources.push(s)));
        const r = await readStack(sources, bbox, maxCells,
          (i, n) => setBar('agProgressFill', 'agProgressLabel', i / n, T(`Leyendo capas mensuales… ${i}/${n}`, `Reading monthly layers… ${i}/${n}`)), null);
        meta = r.meta; const nc = meta.ncol * meta.nrow;
        mon = {};
        vars.forEach((v, k) => { mon[v] = r.stack.subarray(k * 12 * nc, (k + 1) * 12 * nc); });
        A.approx = false;
      } else {
        const files = (state.env && state.env.files) || {};
        const keys = A.bioUsed.filter(k => files[k]);
        const r = await readStack(keys.map(k => ({ file: files[k], band: 0 })), bbox, maxCells,
          (i, n) => setBar('agProgressFill', 'agProgressLabel', i / n, T(`Leyendo bioclimáticas… ${i}/${n}`, `Reading bioclimatic layers… ${i}/${n}`)), null);
        meta = r.meta; const nc = meta.ncol * meta.nrow;
        const bio = {}; keys.forEach((k, j) => { bio[k] = r.stack.subarray(j * nc, (j + 1) * nc); });
        setBar('agProgressFill', 'agProgressLabel', 0.9, T('Reconstruyendo el ciclo mensual…', 'Reconstructing the monthly cycle…')); await tick(10);
        mon = monthlyFromBioclim(bio, meta);
        A.approx = true;
      }
      /* elevation, when step 5 loaded it: used for the crop elevation limit */
      A.elev = null;
      const ef = (state.env && state.env.files && state.env.files.elev) || null;
      if (ef) {
        try {
          setBar('agProgressFill', 'agProgressLabel', 0.96, T('Leyendo altitud…', 'Reading elevation…')); await tick(8);
          const e = await readStack([{ file: ef, band: 0 }], null, 0, null, meta);
          A.elev = e.stack;
        } catch (e2) { console.warn('elevation not read', e2); }
      }
      setBar('agProgressFill', 'agProgressLabel', 1, '');
      A.meta = meta; A.ncell = meta.ncol * meta.nrow; A.mon = mon;
      extentWarn();
      const geo = rowGeometry(meta); A.rowArea = geo.area; A.ra = geo.ra; A.dl = geo.dl;
      A.idx = null; A.crop = null; A.multi = null; A.best = null; A.ana = null; A.zones = null; A.fut = []; A.scn = '';
      let valid = 0; const t0 = mon.tmin;
      for (let i = 0; i < A.ncell; i++) if (nz(t0[i])) valid++;
      statTiles('agGridSummary', [
        [bi('Malla', 'Grid'), `${meta.ncol} × ${meta.nrow}`],
        [bi('Celdas con dato', 'Cells with data'), fmtInt(valid)],
        [bi('Tamaño de celda', 'Cell size'), fmt(meta.dx * 111.32, 1) + ' km'],
        [bi('Superficie', 'Area'), fmtInt(validArea(t0)) + ' km²'],
        [bi('Origen', 'Source'), A.approx ? bi('bioclimáticas (aprox.)', 'bioclimatic (approx.)') : bi('mensuales', 'monthly')],
      ]);
      if (!valid) throw err('Ninguna celda tiene dato en la extensión elegida.', 'No cell has data within the chosen extent.');
      $('agOptCard').style.display = 'block';
      showMessage('agMessages', 'success', L2(`Malla lista: ${meta.ncol} × ${meta.nrow} celdas (${fmtInt(valid)} con dato). Ajusta las opciones y calcula los índices.`,
        `Grid ready: ${meta.ncol} × ${meta.nrow} cells (${fmtInt(valid)} with data). Adjust the options and compute the indices.`));
      if (A.approx) showMessage('agMessages', 'warning', L2(
        'Los meses se reconstruyeron de las capas bioclimáticas: el mes del pico térmico se supone julio en el hemisferio norte y enero en el sur, y la forma de la lluvia sigue una sinusoide. Los índices que dependen del calendario son indicativos.',
        'The months were reconstructed from the bioclimatic layers: the month of the thermal peak is assumed to be July in the northern hemisphere and January in the southern one, and the rainfall shape follows a sinusoid. Calendar-dependent indices are indicative.'));
    } catch (e) {
      console.error(e);
      showMessage('agMessages', 'error', L2('No se pudo leer la malla: ', 'The grid could not be read: ') + eHTML(e));
    } finally {
      A.busy = false; $('agReadBtn').disabled = false;
      setTimeout(() => { $('agProgress').style.display = 'none'; }, 600);
    }
  });
  function validArea(arr) {
    if (!A.meta) return 0;
    let s = 0;
    for (let r = 0; r < A.meta.nrow; r++) for (let c = 0; c < A.meta.ncol; c++) if (nz(arr[r * A.meta.ncol + c])) s += A.rowArea[r];
    return s;
  }

  /* ---------------------------------------------------------------- index catalogue */
  /* k: key · n: name · u: unit · d: decimals · cat: categorical legend · exact: taken straight from a bioclimatic
     layer, so it is not an approximation on route C · cal: depends on the month calendar, so it is switched off on
     route C · opt: only present when that option is on */
  const IDX = [
    { k: 'tmean', n: bi('Temperatura media anual', 'Mean annual temperature'), u: '°C', d: 1, exact: true },
    { k: 'prec', n: bi('Precipitación anual', 'Annual precipitation'), u: 'mm', d: 0, exact: true },
    { k: 'tamp', n: bi('Amplitud térmica anual', 'Annual thermal amplitude'), u: '°C', d: 1, exact: true },
    { k: 'tminabs', n: bi('Temperatura mínima absoluta', 'Absolute minimum temperature'), u: '°C', d: 1, exact: true },
    { k: 'tmaxabs', n: bi('Temperatura máxima absoluta', 'Absolute maximum temperature'), u: '°C', d: 1, exact: true },
    { k: 'gdd', n: bi('Grados-día de crecimiento (año)', 'Growing degree days (year)'), u: '°C·d', d: 0 },
    { k: 'gddWarm', n: bi('Grados-día de la temporada cálida', 'Degree days of the warm season'), u: '°C·d', d: 0 },
    { k: 'frostDays', n: bi('Días con helada', 'Frost days'), u: 'd', d: 0 },
    { k: 'frostMonths', n: bi('Meses con helada', 'Frost months'), u: '', d: 0 },
    { k: 'ffp', n: bi('Periodo libre de heladas', 'Frost-free period'), u: 'd', d: 0 },
    { k: 'frostLast', n: bi('Última helada antes de la temporada cálida', 'Last frost before the warm season'), u: '', d: 0, cat: 'month', cal: true },
    { k: 'frostFirst', n: bi('Primera helada después de la temporada cálida', 'First frost after the warm season'), u: '', d: 0, cat: 'month', cal: true },
    { k: 'chillH', n: bi('Horas frío acumuladas', 'Accumulated chilling hours'), u: 'h', d: 0 },
    { k: 'chillU', n: bi('Unidades frío tipo Utah', 'Utah-style chill units'), u: '', d: 0, opt: 'utah', cal: true },
    { k: 'heat1', n: bi('Días de calor (umbral 1)', 'Heat days (threshold 1)'), u: 'd', d: 0 },
    { k: 'heat2', n: bi('Días de calor (umbral 2)', 'Heat days (threshold 2)'), u: 'd', d: 0 },
    { k: 'pet', n: bi('Evapotranspiración de referencia anual', 'Annual reference evapotranspiration'), u: 'mm', d: 0 },
    { k: 'aet', n: bi('Evapotranspiración real anual', 'Annual actual evapotranspiration'), u: 'mm', d: 0 },
    { k: 'deficit', n: bi('Déficit hídrico anual', 'Annual water deficit'), u: 'mm', d: 0 },
    { k: 'surplus', n: bi('Excedente hídrico anual', 'Annual water surplus'), u: 'mm', d: 0 },
    { k: 'lgp', n: bi('Longitud del periodo de crecimiento', 'Length of the growing period'), u: 'd', d: 0 },
    { k: 'lgpStart', n: bi('Inicio del periodo de crecimiento', 'Start of the growing period'), u: '', d: 0, cat: 'month', cal: true },
    { k: 'ai', n: bi('Índice de aridez (P / ETo)', 'Aridity index (P / PET)'), u: '', d: 2 },
    { k: 'aiClass', n: bi('Clase de aridez (UNEP, 1992)', 'Aridity class (UNEP, 1992)'), u: '', d: 0, cat: 'arid' },
    { k: 'dryMonths', n: bi('Meses secos consecutivos', 'Consecutive dry months'), u: '', d: 0 },
  ];
  const IDXBY = Object.fromEntries(IDX.map(o => [o.k, o]));
  const idxMeta = k => IDXBY[k] || { k, n: bi(k, k), u: '', d: 2 };
  const idxName = k => {
    const o = idxMeta(k), x = A.opts || {};
    if (k === 'heat1') return T(`Días con máxima > ${x.heat1 != null ? x.heat1 : 30} °C`, `Days with maximum > ${x.heat1 != null ? x.heat1 : 30} °C`);
    if (k === 'heat2') return T(`Días con máxima > ${x.heat2 != null ? x.heat2 : 35} °C`, `Days with maximum > ${x.heat2 != null ? x.heat2 : 35} °C`);
    if (k === 'chillH') return T(`Horas frío acumuladas (< ${x.chillThr != null ? x.chillThr : 7.2} °C)`, `Accumulated chilling hours (< ${x.chillThr != null ? x.chillThr : 7.2} °C)`);
    if (k === 'gdd') return T(`Grados-día base ${x.base != null ? x.base : 10} °C (año)`, `Degree days, base ${x.base != null ? x.base : 10} °C (year)`);
    if (k === 'gddWarm') return T(`Grados-día base ${x.base != null ? x.base : 10} °C (temporada cálida)`, `Degree days, base ${x.base != null ? x.base : 10} °C (warm season)`);
    if (k === 'zone') return T('Zona agroclimática', 'Agroclimatic zone');
    if (k === 'ana') return T('Similitud climática con el sitio de referencia', 'Climatic similarity to the reference site');
    return T(o.n.es, o.n.en);
  };
  const idxUnit = k => k === 'zone' || k === 'ana' ? '' : idxMeta(k).u;
  const idxDec = k => k === 'ana' ? 2 : idxMeta(k).d;

  /* categorical legends: code → colour and label */
  const ARID = [null, { c: '#8c3b12', l: bi('Hiperárido (< 0.05)', 'Hyper-arid (< 0.05)') }, { c: '#d08c3a', l: bi('Árido (0.05–0.20)', 'Arid (0.05–0.20)') },
    { c: '#e8cf6a', l: bi('Semiárido (0.20–0.50)', 'Semi-arid (0.20–0.50)') }, { c: '#9ecb6a', l: bi('Subhúmedo seco (0.50–0.65)', 'Dry sub-humid (0.50–0.65)') },
    { c: '#2f7d4f', l: bi('Húmedo (> 0.65)', 'Humid (> 0.65)') }];
  const FCLASS = [null, { c: '#1a7f3c', l: bi('Muy apto (≥ 0.8)', 'Very suitable (≥ 0.8)') }, { c: '#7fc243', l: bi('Apto (0.5–0.8)', 'Suitable (0.5–0.8)') },
    { c: '#e8c34a', l: bi('Marginal (0.2–0.5)', 'Marginal (0.2–0.5)') }, { c: '#d9d9d9', l: bi('No apto (< 0.2)', 'Not suitable (< 0.2)') }];
  const LIMIT = [null, { c: '#1a7f3c', l: bi('Sin limitante (óptimo)', 'No constraint (optimal)') }, { c: '#4c78a8', l: bi('Temperatura baja', 'Low temperature') },
    { c: '#e45756', l: bi('Temperatura alta', 'High temperature') }, { c: '#e0a33a', l: bi('Agua insuficiente', 'Insufficient water') },
    { c: '#3fa8a0', l: bi('Exceso de agua', 'Excess water') }, { c: '#7b8fd4', l: bi('Helada letal', 'Killing frost') },
    { c: '#8c2d2d', l: bi('Calor letal', 'Lethal heat') }, { c: '#b279a2', l: bi('Frío insuficiente (horas frío)', 'Insufficient chilling (chill hours)') },
    { c: '#9d755d', l: bi('Altitud fuera de rango', 'Elevation out of range') }];
  const CHG = [null, { c: '#4c78a8', l: bi('Estable apto', 'Stable suitable') }, { c: '#54a24b', l: bi('Ganancia', 'Gain') },
    { c: '#e45756', l: bi('Pérdida', 'Loss') }, { c: '#e1e1e1', l: bi('Estable no apto', 'Stable unsuitable') }];
  const catTable = kind => kind === 'arid' ? ARID : kind === 'fclass' ? FCLASS : kind === 'limit' ? LIMIT : kind === 'chg' ? CHG : null;
  /* what the code 0 means in each of the month-valued indices */
  const monthZero = k => k === 'lgpStart' ? bi('sin periodo húmedo', 'no humid period')
    : (k === 'frostFirst' || k === 'frostLast') ? bi('sin heladas', 'no frost') : bi('no aplica', 'not applicable');

  /* ---------------------------------------------------------------- options */
  function readOpts() {
    const soil = $('agSoilTex').value;
    if (soil !== 'custom') $('agAwc').value = soil;
    return {
      base: +$('agGddBase').value || 0, cap: +$('agGddCap').value || 100,
      frost: +$('agFrostThr').value || 0, sig: Math.max(0, +$('agSigma').value || 0),
      heat1: +$('agHeat1').value || 30, heat2: +$('agHeat2').value || 35,
      chillThr: +$('agChillThr').value, chillWin: +$('agChillWin').value || 4, utah: $('agChillUtah').checked,
      pet: $('agPet').value, awc: Math.max(5, +$('agAwc').value || 100), lgpRes: Math.max(0, +$('agLgpRes').value || 0),
      soil,
    };
  }
  $('agSoilTex').addEventListener('change', () => { const v = $('agSoilTex').value; if (v !== 'custom') $('agAwc').value = v; });
  $('agAwc').addEventListener('input', () => { $('agSoilTex').value = 'custom'; });

  /* ---------------------------------------------------------------- per-cell index computation */
  const _tm = new Float64Array(12), _pet = new Float64Array(12), _aet = new Float64Array(12),
    _def = new Float64Array(12), _sur = new Float64Array(12), _gm = new Float64Array(12),
    _pd = new Float64Array(36), _ed = new Float64Array(36), _dk = new Float64Array(36), _hu = new Uint8Array(36);

  /* longest run of consecutive true values on a 12-month cycle, in days */
  function longestRunDays(ok) {
    let all = true, none = true;
    for (let m = 0; m < 12; m++) { if (ok[m]) none = false; else all = false; }
    if (all) return 365;
    if (none) return 0;
    let best = 0, cur = 0;
    for (let i = 0; i < 24; i++) {
      const m = i % 12;
      if (ok[m]) { cur += MDAYS[m]; if (i >= 12 && cur > 365) cur = 365; best = Math.max(best, cur); } else cur = 0;
    }
    return Math.min(365, best);
  }
  function longestRunCount(ok) {
    let all = true, none = true;
    for (let m = 0; m < 12; m++) { if (ok[m]) none = false; else all = false; }
    if (all) return 12;
    if (none) return 0;
    let best = 0, cur = 0;
    for (let i = 0; i < 24; i++) { if (ok[i % 12]) { cur++; best = Math.max(best, Math.min(12, cur)); } else cur = 0; }
    return best;
  }
  const _ok = new Uint8Array(12);

  /* tn/tx/pr: the 12 monthly values of one cell; ra/dl: the row terms; R: a reused result object */
  function cellIndices(tn, tx, pr, ra, dl, ro, o, R) {
    let sTm = 0, prec = 0, mn = 1e9, mx = -1e9;
    for (let m = 0; m < 12; m++) {
      _tm[m] = ro ? ro[m] : (tn[m] + tx[m]) / 2;
      sTm += _tm[m] * MDAYS[m]; prec += pr[m];
      if (tn[m] < mn) mn = tn[m];
      if (tx[m] > mx) mx = tx[m];
    }
    R.tmean = sTm / 365; R.prec = prec; R.tminabs = mn; R.tmaxabs = mx; R.tamp = mx - mn;

    /* degree days, annual and of the warmest 6-month run */
    let gdd = 0;
    for (let m = 0; m < 12; m++) { _gm[m] = MDAYS[m] * ddCap(tn[m], tx[m], o.base, o.cap); gdd += _gm[m]; }
    R.gdd = gdd;
    let bs = 0, bv = -1e9;
    for (let s = 0; s < 12; s++) { let v = 0; for (let i = 0; i < 6; i++) v += _tm[(s + i) % 12]; if (v > bv) { bv = v; bs = s; } }
    let gw = 0; for (let i = 0; i < 6; i++) gw += _gm[(bs + i) % 12];
    R.gddWarm = gw;

    /* frost: expected days with the daily deviation, months, frost-free period and the two calendar months */
    let fd = 0, fm = 0;
    for (let m = 0; m < 12; m++) {
      fd += MDAYS[m] * (o.sig > 0 ? PHI((o.frost - tn[m]) / o.sig) : (tn[m] < o.frost ? 1 : 0));
      _ok[m] = tn[m] >= o.frost ? 1 : 0;
      if (!_ok[m]) fm++;
    }
    R.frostDays = fd; R.frostMonths = fm; R.ffp = longestRunDays(_ok);
    let pk = 0; for (let m = 1; m < 12; m++) if (_tm[m] > _tm[pk]) pk = m;
    R.frostFirst = 0; R.frostLast = 0;
    for (let i = 1; i <= 12; i++) { const m = (pk + i) % 12; if (!_ok[m]) { R.frostFirst = m + 1; break; } }
    for (let i = 1; i <= 12; i++) { const m = (pk - i + 12) % 12; if (!_ok[m]) { R.frostLast = m + 1; break; } }

    /* chilling over the coldest consecutive months (dormancy) or the whole year */
    const nw = o.chillWin >= 12 ? 12 : o.chillWin;
    let cs = 0;
    if (nw < 12) { let cv = 1e9; for (let s = 0; s < 12; s++) { let v = 0; for (let i = 0; i < nw; i++) v += _tm[(s + i) % 12]; if (v < cv) { cv = v; cs = s; } } }
    let ch = 0, cu = 0;
    for (let i = 0; i < nw; i++) {
      const m = (cs + i) % 12;
      ch += MDAYS[m] * hoursBelow(tn[m], tx[m], o.chillThr);
      if (o.utah) cu += MDAYS[m] * utahDay(tn[m], tx[m]);
    }
    R.chillH = ch; R.chillU = o.utah ? cu : NaN;

    /* heat stress */
    let h1 = 0, h2 = 0;
    for (let m = 0; m < 12; m++) {
      h1 += MDAYS[m] * (o.sig > 0 ? 1 - PHI((o.heat1 - tx[m]) / o.sig) : (tx[m] > o.heat1 ? 1 : 0));
      h2 += MDAYS[m] * (o.sig > 0 ? 1 - PHI((o.heat2 - tx[m]) / o.sig) : (tx[m] > o.heat2 ? 1 : 0));
    }
    R.heat1 = h1; R.heat2 = h2;

    /* reference evapotranspiration (the same helper the crop calendar uses) */
    petMonths(tn, tx, _tm, ra, dl, o, _pet);
    let pet = 0;
    for (let m = 0; m < 12; m++) pet += _pet[m];
    R.pet = pet;

    /* one-layer soil bucket, three cycles so that the store reaches equilibrium */
    let S = 0, aet = 0, def = 0, sur = 0;
    for (let cyc = 0; cyc < 3; cyc++) {
      aet = def = sur = 0;
      for (let m = 0; m < 12; m++) {
        const D = pr[m] - _pet[m];
        if (D >= 0) { const add = Math.min(o.awc - S, D); S += add; _sur[m] = D - add; _aet[m] = _pet[m]; _def[m] = 0; }
        else { const use = Math.min(S, -D); S -= use; _aet[m] = pr[m] + use; _def[m] = _pet[m] - _aet[m]; _sur[m] = 0; }
        aet += _aet[m]; def += _def[m]; sur += _sur[m];
      }
    }
    R.aet = aet; R.deficit = def; R.surplus = sur;

    /* FAO length of growing period over 36 ten-day periods interpolated from the monthly rates */
    let nHum = 0, lgp = 0;
    for (let k = 0; k < 36; k++) {
      const m = (k / 3) | 0, u = m + ((k % 3) + 0.5) / 3 - 0.5;
      let i0 = Math.floor(u); const fr = u - i0;
      i0 = ((i0 % 12) + 12) % 12; const i1 = (i0 + 1) % 12;
      const dd = MDAYS[m] / 3;
      _dk[k] = dd;
      _pd[k] = (pr[i0] / MDAYS[i0] * (1 - fr) + pr[i1] / MDAYS[i1] * fr) * dd;
      _ed[k] = (_pet[i0] / MDAYS[i0] * (1 - fr) + _pet[i1] / MDAYS[i1] * fr) * dd;
      _hu[k] = _pd[k] > 0.5 * _ed[k] ? 1 : 0;
      if (_hu[k]) { nHum++; lgp += dd; }
    }
    if (nHum === 36) lgp = 365;
    else if (nHum > 0 && o.lgpRes > 0) {
      for (let k = 0; k < 36; k++) {
        if (!_hu[k] || _hu[(k + 1) % 36]) continue;                 // only at the end of a humid run
        let W = o.lgpRes, j = (k + 1) % 36, guard = 0;
        while (W > 0 && guard++ < 36) {
          const dem = _ed[j] - _pd[j];
          if (dem <= 0) break;
          if (dem >= W) { lgp += _dk[j] * W / dem; W = 0; } else { lgp += _dk[j]; W -= dem; }
          j = (j + 1) % 36;
        }
      }
    }
    R.lgp = Math.max(0, Math.min(365, lgp));
    R.lgpStart = 0;
    if (nHum > 0 && nHum < 36) {
      let bl = 0, bk = -1, cur = 0, st = 0;
      for (let i = 0; i < 72; i++) {
        const k = i % 36;
        if (_hu[k]) { if (cur === 0) st = k; cur++; if (cur > bl) { bl = cur; bk = st; } } else cur = 0;
      }
      if (bk >= 0) R.lgpStart = ((bk / 3) | 0) + 1;
    } else if (nHum === 36) R.lgpStart = 1;

    /* aridity and dry season */
    const ai = pet > 0 ? prec / pet : NaN;
    R.ai = ai;
    R.aiClass = !nz(ai) ? NaN : ai < 0.05 ? 1 : ai < 0.20 ? 2 : ai < 0.50 ? 3 : ai < 0.65 ? 4 : 5;
    for (let m = 0; m < 12; m++) _ok[m] = pr[m] < 0.5 * _pet[m] ? 1 : 0;
    R.dryMonths = longestRunCount(_ok);
    return R;
  }

  const blankR = () => ({ tmean: NaN, prec: NaN, tamp: NaN, tminabs: NaN, tmaxabs: NaN, gdd: NaN, gddWarm: NaN,
    frostDays: NaN, frostMonths: NaN, ffp: NaN, frostFirst: NaN, frostLast: NaN, chillH: NaN, chillU: NaN,
    heat1: NaN, heat2: NaN, pet: NaN, aet: NaN, deficit: NaN, surplus: NaN, lgp: NaN, lgpStart: NaN,
    ai: NaN, aiClass: NaN, dryMonths: NaN });

  /* Whole-grid computation. Returns {key: Float32Array}; yields every few rows so the interface stays alive. */
  async function computeIndices(mon, meta, o, progress) {
    const n = meta.ncol * meta.nrow, keys = activeKeys(o);
    const out = {};
    keys.forEach(k => { out[k] = new Float32Array(n).fill(NaN); });
    const tn = new Float64Array(12), tx = new Float64Array(12), pr = new Float64Array(12), ro = new Float64Array(12);
    const R = blankR(), hasAvg = !!mon.tavg;
    for (let r = 0; r < meta.nrow; r++) {
      const raRowArr = A.ra.subarray(r * 12, r * 12 + 12), dlRowArr = A.dl.subarray(r * 12, r * 12 + 12);
      for (let c = 0; c < meta.ncol; c++) {
        const i = r * meta.ncol + c;
        let ok = true;
        for (let m = 0; m < 12; m++) {
          tn[m] = mon.tmin[m * n + i]; tx[m] = mon.tmax[m * n + i]; pr[m] = mon.prec[m * n + i];
          if (hasAvg) ro[m] = mon.tavg[m * n + i];
          if (!nz(tn[m]) || !nz(tx[m]) || !nz(pr[m])) { ok = false; break; }
          if (tx[m] < tn[m]) { const t = tx[m]; tx[m] = tn[m]; tn[m] = t; }
          if (pr[m] < 0) pr[m] = 0;
        }
        if (!ok) continue;
        cellIndices(tn, tx, pr, raRowArr, dlRowArr, hasAvg ? ro : null, o, R);
        for (const k of keys) out[k][i] = R[k];
      }
      if (progress && (r % 16 === 0 || r === meta.nrow - 1)) { progress((r + 1) / meta.nrow); await tick(0); }
    }
    return out;
  }
  function activeKeys(o) {
    return IDX.filter(d => {
      if (d.opt === 'utah' && !o.utah) return false;
      if (d.cal && A.approx) return false;
      return true;
    }).map(d => d.k);
  }

  /* ---------------------------------------------------------------- raster overlays */
  const mercY = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
  const mercInv = y => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI;
  const hex2rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const lutOf = (stops, n = 256) => Array.from({ length: n }, (_, i) => hex2rgb(mapkit.rampColor(stops, i / (n - 1))));

  /* Turns a grid (row 0 = north) into a PNG resampled to rows evenly spaced in Mercator, so the cells line up with
     the base map. colorAt(v) returns [r, g, b, a] or null for a transparent cell. */
  function makeOverlay(values, meta, colorAt) {
    const { nrow, ncol, west, north, dx, dy } = meta, south = north - nrow * dy, east = west + ncol * dx;
    const yN = mercY(Math.min(85, north)), yS = mercY(Math.max(-85, south));
    const k = (yN - yS) / (((Math.min(85, north)) - (Math.max(-85, south))) * Math.PI / 180);
    const outH = Math.max(nrow, Math.min(3000, Math.ceil(nrow * (isFinite(k) && k > 0 ? k : 1))));
    const cv = document.createElement('canvas'); cv.width = ncol; cv.height = outH;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(ncol, outH), d = img.data;
    for (let r = 0; r < outH; r++) {
      const lat = mercInv(yN - (r + 0.5) / outH * (yN - yS));
      const i = Math.min(nrow - 1, Math.max(0, Math.floor((north - lat) / dy)));
      for (let c = 0; c < ncol; c++) {
        const rgb = colorAt(values[i * ncol + c]);
        if (!rgb) continue;
        const p = (r * ncol + c) * 4;
        d[p] = rgb[0]; d[p + 1] = rgb[1]; d[p + 2] = rgb[2]; d[p + 3] = rgb[3] == null ? 235 : rgb[3];
      }
    }
    ctx.putImageData(img, 0, 0);
    return { url: cv.toDataURL('image/png'), bounds: [[Math.max(-85, south), west], [Math.min(85, north), east]] };
  }

  function statsOf(arr) {
    const v = [];
    for (let i = 0; i < arr.length; i++) if (nz(arr[i])) v.push(arr[i]);
    if (!v.length) return null;
    v.sort((a, b) => a - b);
    let s = 0; for (const x of v) s += x;
    return { n: v.length, min: v[0], max: v[v.length - 1], mean: s / v.length,
      p1: quantile(v, 0.01), p2: quantile(v, 0.02), p50: quantile(v, 0.5), p98: quantile(v, 0.98), p99: quantile(v, 0.99), sorted: v };
  }
  /* area-weighted mean over the cells with data */
  function areaMean(arr, meta, rowArea) {
    let s = 0, a = 0;
    for (let r = 0; r < meta.nrow; r++) for (let c = 0; c < meta.ncol; c++) {
      const v = arr[r * meta.ncol + c];
      if (nz(v)) { s += v * rowArea[r]; a += rowArea[r]; }
    }
    return a > 0 ? s / a : NaN;
  }

  /* ---------------------------------------------------------------- the two maps */
  const fileTag = extra => slugName(state.query || 'agroclim') + '_' + (extra || 'agro');
  function ensureIdxMap() {
    if (A.idxMap) return;
    A.idxMap = mapkit.makeBaseMap('mapAgroIdx');
    A.idxMap.createPane('agroIdxPane').style.zIndex = 350;
    A.idxStudio = mapstudio.attach(A.idxMap, { kind: 'raster', legendPanel: $('agroIdxLegend'),
      hooks: { defaultTitle: () => idxName($('agIdxVar').value || 'tmean'), fileName: () => fileTag($('agIdxVar').value || 'index'),
        onChange: key => { if (['ramp', 'rampRev', 'preset'].includes(key)) drawIdxMap(); } } });
  }
  function ensureCropMap() {
    if (A.cropMap) return;
    A.cropMap = mapkit.makeBaseMap('mapAgroCrop');
    A.cropMap.createPane('agroCropPane').style.zIndex = 350;
    A.cropStudio = mapstudio.attach(A.cropMap, { kind: 'raster', legendPanel: $('agroCropLegend'),
      hooks: { defaultTitle: () => A.crop ? cropdb.name(A.crop.crop) : '', fileName: () => fileTag(A.crop ? A.crop.crop.id + '_' + $('agCropMapType').value : 'crop'),
        onChange: key => { if (['ramp', 'rampRev', 'preset'].includes(key)) drawCropMap(); } } });
    A.cropMap.on('click', e => {
      A.calPoint = { lat: e.latlng.lat, lon: e.latlng.lng, name: T('Punto del mapa', 'Point on the map') };
      fillCalPoint(); drawCalendar();
    });
  }

  /* the array behind a map selection, for the present or for a scenario */
  function idxArray(key, scn) {
    if (key === 'zone') return A.zones ? A.zones.arr : null;
    if (key === 'ana') return A.ana ? A.ana.sim : null;
    const src = scn ? (A.fut.find(f => f.name === scn) || {}).idx : A.idx;
    return src ? src[key] || null : null;
  }
  const isCat = key => key === 'zone' ? true : !!(idxMeta(key).cat);

  function drawIdxMap() {
    if (!A.meta) return;
    ensureIdxMap();
    const key = $('agIdxVar').value || 'tmean', scn = $('agIdxScn').value;
    const arr = idxArray(key, scn);
    if (!arr) return;
    let ov, legend;
    const kind = key === 'zone' ? 'zone' : idxMeta(key).cat;
    if (kind === 'month') {
      ov = makeOverlay(arr, A.meta, v => { const m = Math.round(v); return nz(v) && m >= 1 && m <= 12 ? hex2rgb(MON_COL[m - 1]) : (nz(v) ? [225, 225, 225, 90] : null); });
      legend = () => ({ title: idxName(key) + (scn ? ' · ' + scn : ''), kind: 'cat',
        items: MON_COL.map((c, i) => ({ color: c, label: T(MONL[i].es, MONL[i].en), shape: 'square' }))
          .concat([{ color: '#e1e1e1', label: T(monthZero(key).es, monthZero(key).en), shape: 'square' }]) });
    } else if (kind === 'arid' || kind === 'zone') {
      const tab = kind === 'arid' ? ARID : null;
      const zn = A.zones ? A.zones.k : 0;
      const colFor = i => tab ? (tab[i] ? tab[i].c : null) : mapkit.CAT_PALETTE[(i - 1) % mapkit.CAT_PALETTE.length];
      ov = makeOverlay(arr, A.meta, v => { const i = Math.round(v); return nz(v) && colFor(i) ? hex2rgb(colFor(i)) : null; });
      legend = () => ({ title: idxName(key) + (scn ? ' · ' + scn : ''), kind: 'cat',
        items: tab ? tab.slice(1).map((o, i) => ({ color: o.c, label: T(o.l.es, o.l.en), shape: 'square' }))
          : Array.from({ length: zn }, (_, i) => ({ color: colFor(i + 1), label: T('Zona ', 'Zone ') + (i + 1), shape: 'square' })) });
    } else {
      const st = statsOf(arr);
      if (!st) return;
      const lo = st.p2, hi = st.p98 > st.p2 ? st.p98 : st.p2 + 1;
      const stops = A.idxStudio.rampStops(), LUT = lutOf(stops);
      ov = makeOverlay(arr, A.meta, v => nz(v) ? LUT[Math.max(0, Math.min(255, Math.round((v - lo) / (hi - lo) * 255)))] : null);
      const d = idxDec(key), u = idxUnit(key);
      legend = () => ({ title: idxName(key) + (scn ? ' · ' + scn : ''), unit: u, kind: 'grad', stops: A.idxStudio.rampStops(),
        ticks: [{ t: 0, label: fmt(lo, d) }, { t: 0.5, label: fmt((lo + hi) / 2, d) }, { t: 1, label: fmt(hi, d) }],
        note: T(`mín ${fmt(st.min, d)} · mediana ${fmt(st.p50, d)} · máx ${fmt(st.max, d)}`,
          `min ${fmt(st.min, d)} · median ${fmt(st.p50, d)} · max ${fmt(st.max, d)}`) });
    }
    if (A.idxOv) A.idxMap.removeLayer(A.idxOv);
    A.idxOv = L.imageOverlay(ov.url, ov.bounds, { opacity: +$('agIdxOpacity').value, interactive: false, pane: 'agroIdxPane' }).addTo(A.idxMap);
    restyleIdxPoints();
    if (!A.idxFitted) { A.idxMap.fitBounds(ov.bounds); A.idxFitted = true; }
    setTimeout(() => A.idxMap.invalidateSize(), 60);
    A.idxStudio.setLegend(legend);
  }
  function restyleIdxPoints() {
    if (!A.idxStudio) return;
    const c = cssVar('--text', '#222');
    A.idxStudio.setData({ kind: 'fixed', items: A.pts.map(p => ({ lat: p.lat, lon: p.lon, c,
      tip: () => `<b>${esc(p.name)}</b><br>${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}` })) });
    A.idxStudio.showData($('agIdxShowPts').checked);
  }
  $('agIdxOpacity').addEventListener('input', () => { if (A.idxOv) A.idxOv.setOpacity(+$('agIdxOpacity').value); });
  $('agIdxShowPts').addEventListener('change', () => { if (A.idxStudio) A.idxStudio.showData($('agIdxShowPts').checked); });
  ['agIdxVar', 'agIdxScn'].forEach(id => $(id).addEventListener('change', () => { drawIdxMap(); drawHist(); }));
  $('agIdxPng').addEventListener('click', () => { if (A.idxStudio) A.idxStudio.exportNow(); });
  $('agIdxTif').addEventListener('click', () => exportTif(idxArray($('agIdxVar').value, $('agIdxScn').value), fileTag($('agIdxVar').value)));
  $('agIdxAsc').addEventListener('click', () => exportAsc(idxArray($('agIdxVar').value, $('agIdxScn').value), fileTag($('agIdxVar').value)));

  /* ---------------------------------------------------------------- grid exports */
  function exportTif(arr, name) {
    if (!arr || !A.meta) return;
    if (!window.sdmEncodeGeoTiff) { showMessage('agIdxMessages', 'warning', L2('El escritor de GeoTIFF no está disponible; usa la malla ASCII.', 'The GeoTIFF writer is not available; use the ASCII grid.')); return; }
    const m = A.meta, v = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) v[i] = nz(arr[i]) ? arr[i] : -9999;
    downloadBlob(new Blob([sdmEncodeGeoTiff(v, m.ncol, m.nrow, m.west, m.north, m.dx, m.dy)], { type: 'image/tiff' }), name + '.tif');
  }
  function exportAsc(arr, name) {
    if (!arr || !A.meta) return;
    const m = A.meta, out = [];
    out.push('ncols ' + m.ncol, 'nrows ' + m.nrow, 'xllcorner ' + m.west, 'yllcorner ' + (m.north - m.nrow * m.dy),
      'cellsize ' + m.dx, 'NODATA_value -9999');
    for (let r = 0; r < m.nrow; r++) {
      const row = new Array(m.ncol);
      for (let c = 0; c < m.ncol; c++) { const v = arr[r * m.ncol + c]; row[c] = nz(v) ? (Math.round(v * 1e4) / 1e4) : -9999; }
      out.push(row.join(' '));
    }
    if (Math.abs(m.dx - m.dy) > 1e-9) showMessage('agIdxMessages', 'info', L2('La malla ASCII exige celdas cuadradas: se escribió el tamaño en longitud.', 'The ASCII grid requires square cells: the longitude size was written.'));
    downloadBlob(out.join('\n') + '\n', name + '.asc', 'text/plain;charset=utf-8');
  }

  /* ---------------------------------------------------------------- histogram */
  const pal = () => ({ bg: cssVar('--card-bg', '#fff'), text: cssVar('--text', '#111'), muted: cssVar('--text-muted', '#667'),
    border: cssVar('--border-strong', '#ccc'), primary: cssVar('--primary', '#1f7a4d'), accent: cssVar('--accent', '#cf6a24'),
    sky: cssVar('--sky', '#2a78b5'), danger: cssVar('--danger', '#c43a2f') });

  function drawHist() {
    const box = $('agIdxHist');
    Views.reg('agIdxHist', () => {
      const key = $('agIdxVar').value, scn = $('agIdxScn').value, arr = idxArray(key, scn);
      if (!arr) { box.innerHTML = ''; return; }
      const p = pal(), W = 640, H = 230, m = { l: 52, r: 14, t: 14, b: 44 };
      const kind = key === 'zone' ? 'zone' : idxMeta(key).cat;
      let bars = [], xlab = [], title = idxName(key);
      if (kind) {
        const tab = catTable(kind), nk = kind === 'month' ? 12 : kind === 'zone' ? (A.zones ? A.zones.k : 0) : tab.length - 1;
        const cnt = new Float64Array(nk + 1), area = new Float64Array(nk + 1);
        for (let r = 0; r < A.meta.nrow; r++) for (let c = 0; c < A.meta.ncol; c++) {
          const v = arr[r * A.meta.ncol + c]; if (!nz(v)) continue;
          const i = Math.round(v); if (i >= 1 && i <= nk) { cnt[i]++; area[i] += A.rowArea[r]; }
        }
        for (let i = 1; i <= nk; i++) bars.push({ v: area[i], c: kind === 'month' ? MON_COL[i - 1] : tab ? tab[i].c : mapkit.CAT_PALETTE[(i - 1) % mapkit.CAT_PALETTE.length],
          l: kind === 'month' ? T(MON[i - 1].es, MON[i - 1].en) : tab ? T(tab[i].l.es, tab[i].l.en).replace(/ \(.*\)$/, '') : String(i) });
        xlab = bars.map(b => b.l);
        title += ' · ' + T('superficie (km²)', 'area (km²)');
      } else {
        const st = statsOf(arr);
        if (!st) { box.innerHTML = ''; return; }
        const lo = st.p1, hi = st.p99 > st.p1 ? st.p99 : st.p1 + 1, nb = 30, h = new Float64Array(nb);
        for (let r = 0; r < A.meta.nrow; r++) for (let c = 0; c < A.meta.ncol; c++) {
          const v = arr[r * A.meta.ncol + c]; if (!nz(v)) continue;
          h[Math.max(0, Math.min(nb - 1, Math.floor((v - lo) / (hi - lo) * nb)))] += A.rowArea[r];
        }
        const stops = A.idxStudio ? A.idxStudio.rampStops() : mapstudio.rampStops('viridis');
        bars = Array.from(h, (v, i) => ({ v, c: mapkit.rampColor(stops, (i + 0.5) / nb), l: '' }));
        const d = idxDec(key);
        xlab = [fmt(lo, d), fmt((lo + hi) / 2, d), fmt(hi, d)];
        title += (idxUnit(key) ? ' (' + idxUnit(key) + ')' : '') + ' · ' + T('superficie (km²)', 'area (km²)');
      }
      const mx = bars.reduce((a, b) => Math.max(a, b.v), 0) || 1;
      const bw = (W - m.l - m.r) / (bars.length || 1);
      let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="system-ui, Segoe UI, sans-serif"><rect width="${W}" height="${H}" fill="${p.bg}"/>`;
      s += `<text x="${m.l}" y="${m.t - 2}" font-size="11" fill="${p.muted}">${esc(title)}</text>`;
      s += `<path d="M${m.l},${m.t + 4} V${H - m.b} H${W - m.r}" fill="none" stroke="${p.border}"/>`;
      for (let g = 0; g <= 2; g++) {
        const y = H - m.b - g / 2 * (H - m.b - m.t - 6);
        s += `<line x1="${m.l}" y1="${y}" x2="${W - m.r}" y2="${y}" stroke="${p.border}" stroke-opacity=".4"/>`;
        s += `<text x="${m.l - 5}" y="${y + 3.4}" text-anchor="end" font-size="9.5" fill="${p.muted}">${esc(fmtInt(mx * g / 2))}</text>`;
      }
      bars.forEach((b, i) => {
        const bh = Math.max(0, b.v / mx * (H - m.b - m.t - 6));
        s += `<rect x="${(m.l + i * bw + 0.6).toFixed(1)}" y="${(H - m.b - bh).toFixed(1)}" width="${Math.max(1, bw - 1.2).toFixed(1)}" height="${bh.toFixed(1)}" fill="${b.c}" stroke="${p.bg}" stroke-width=".4"><title>${esc(b.l || '')}: ${esc(fmtInt(b.v))} km²</title></rect>`;
      });
      if (xlab.length === bars.length && bars.length <= 14) {
        xlab.forEach((t, i) => { s += `<text transform="translate(${(m.l + (i + 0.5) * bw).toFixed(1)},${H - m.b + 8}) rotate(-38)" text-anchor="end" font-size="9.5" fill="${p.muted}">${esc(t)}</text>`; });
      } else if (xlab.length === 3) {
        [[m.l, 'start'], [(m.l + W - m.r) / 2, 'middle'], [W - m.r, 'end']].forEach((q, i) => {
          s += `<text x="${q[0]}" y="${H - m.b + 15}" text-anchor="${q[1]}" font-size="10" fill="${p.muted}">${esc(xlab[i])}</text>`;
        });
      }
      box.innerHTML = s + '</svg>';
    });
  }

  /* ---------------------------------------------------------------- points */
  function cellOf(lat, lon) {
    const m = A.meta; if (!m) return -1;
    const c = Math.floor((lon - m.west) / m.dx), r = Math.floor((m.north - lat) / m.dy);
    if (r < 0 || c < 0 || r >= m.nrow || c >= m.ncol) return -1;
    return r * m.ncol + c;
  }
  function pointsFromRecords() {
    const seen = new Set(), out = [];
    for (const r of records()) {
      if (!nz(r.decimalLatitude) || !nz(r.decimalLongitude)) continue;
      const k = r.decimalLatitude.toFixed(3) + ',' + r.decimalLongitude.toFixed(3);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ lat: r.decimalLatitude, lon: r.decimalLongitude, name: r.taxon || r.scientificName || '—' });
      if (out.length >= 500) break;
    }
    return out;
  }
  function parsePoints(text) {
    const out = [];
    String(text || '').split(/\r?\n/).forEach((line, i) => {
      const t = line.trim(); if (!t || /^[#/]/.test(t)) return;
      const parts = t.split(/[,;\t]+/).map(s => s.trim());
      const la = parseFloat(parts[0]), lo = parseFloat(parts[1]);
      if (!nz(la) || !nz(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return;
      out.push({ lat: la, lon: lo, name: parts.slice(2).join(', ') || T('Punto ', 'Point ') + (i + 1) });
    });
    return out;
  }
  function setPoints(pts, source) {
    A.pts = pts; A.ptSource = source;
    if (!A.calPoint || source) A.calPoint = pts[0] || null;
    fillCalPoint(); fillAnaPoint(); restyleIdxPoints(); renderPointsTable();
    if (A.mon) drawCalendar();
  }
  function pointCols(scn) {
    const keys = A.order.filter(k => idxArray(k, scn));
    return [{ key: 'name', label: bi('Sitio', 'Site') },
      { key: 'lat', label: 'Lat', get: r => r.lat.toFixed(4) }, { key: 'lon', label: 'Lon', get: r => r.lon.toFixed(4) },
      ...keys.map(k => ({ key: k, label: () => idxName(k) + (idxUnit(k) ? ' (' + idxUnit(k) + ')' : ''), get: r => fmtCell(k, r[k]) }))];
  }
  function fmtCell(k, v) {
    if (!nz(v)) return '—';
    const kind = k === 'zone' ? 'zone' : idxMeta(k).cat;
    if (kind === 'month') { const i = Math.round(v); return i >= 1 && i <= 12 ? bi(MONL[i - 1].es, MONL[i - 1].en) : monthZero(k); }
    if (kind === 'arid') { const o = ARID[Math.round(v)]; return o ? bi(o.l.es, o.l.en) : '—'; }
    if (kind === 'zone') return T('Zona ', 'Zone ') + Math.round(v);
    return fmt(v, idxDec(k));
  }
  function renderPointsTable() {
    if (!A.idx || !A.pts.length) { $('agPtsTable').innerHTML = ''; return; }
    const scn = $('agIdxScn').value;
    const rows = A.pts.map(p => {
      const i = cellOf(p.lat, p.lon), o = { name: p.name, lat: p.lat, lon: p.lon };
      A.order.forEach(k => { const a = idxArray(k, scn); o[k] = i >= 0 && a ? a[i] : NaN; });
      return o;
    });
    A.ptRows = rows;
    buildTable('agPtsTable', pointCols(scn), rows, 200);
  }
  $('agPtsBtn').addEventListener('click', () => {
    clearMessages('agPtsMessages');
    const pts = parsePoints($('agPtsInput').value);
    if (!pts.length) { showMessage('agPtsMessages', 'error', L2('No se reconoció ninguna línea; usa el formato «latitud, longitud, nombre».', 'No line was recognised; use the format “latitude, longitude, name”.')); return; }
    const out = pts.filter(p => cellOf(p.lat, p.lon) >= 0);
    setPoints(pts, 'typed');
    showMessage('agPtsMessages', out.length === pts.length ? 'success' : 'warning',
      L2(`${pts.length} punto(s) leídos, ${out.length} dentro de la malla.`, `${pts.length} point(s) read, ${out.length} inside the grid.`));
  });
  $('agPtsRecs').addEventListener('click', () => { clearMessages('agPtsMessages'); setPoints(pointsFromRecords(), 'records'); });
  $('agDlPtsCsv').addEventListener('click', () => {
    if (!A.ptRows || !A.ptRows.length) return;
    downloadBlob(toCSV(pointCols($('agIdxScn').value), A.ptRows), fileTag('points_indices') + '.csv', 'text/csv;charset=utf-8');
  });
  $('agDlIdxCsv').addEventListener('click', () => {
    if (!A.idx) return;
    const m = A.meta, scn = $('agIdxScn').value, keys = A.order.filter(k => idxArray(k, scn));
    const head = ['lon', 'lat', ...keys].join(',');
    const lines = [head];
    for (let r = 0; r < m.nrow; r++) {
      const lat = m.north - (r + 0.5) * m.dy;
      for (let c = 0; c < m.ncol; c++) {
        const i = r * m.ncol + c;
        if (!nz(A.idx.tmean[i])) continue;
        const lon = m.west + (c + 0.5) * m.dx;
        lines.push([lon.toFixed(5), lat.toFixed(5), ...keys.map(k => { const a = idxArray(k, scn); const v = a ? a[i] : NaN; return nz(v) ? (Math.round(v * 1e4) / 1e4) : ''; })].join(','));
      }
    }
    downloadBlob('﻿' + lines.join('\n'), fileTag('indices_by_cell') + (scn ? '_' + slugName(scn) : '') + '.csv', 'text/csv;charset=utf-8');
  });

  /* ---------------------------------------------------------------- compute the indices */
  $('agCalcBtn').addEventListener('click', async () => {
    if (A.busy || !A.mon) return;
    clearMessages('agIdxMessages');
    A.busy = true; $('agCalcBtn').disabled = true; $('agCalcProgress').style.display = 'flex';
    try {
      const o = readOpts();
      if (o.cap <= o.base) throw err('El tope superior de grados-día debe ser mayor que la base.', 'The upper degree-day cap must be greater than the base.');
      A.opts = o;
      const t0 = performance.now();
      A.idx = await computeIndices(A.mon, A.meta, o,
        f => setBar('agCalcFill', 'agCalcLabel', f, T(`Calculando índices… ${Math.round(f * 100)} %`, `Computing the indices… ${Math.round(f * 100)} %`)));
      A.order = activeKeys(o);
      A.zones = null; A.ana = null; A.crop = null; A.multi = null; A.best = null;
      /* the future scenarios were computed with the previous options: drop them */
      if (A.fut.length) { A.fut = []; fillScnSelects(); showMessage('agIdxMessages', 'info', L2('Los escenarios futuros se descartaron porque cambiaron las opciones; vuelve a añadirlos.', 'The future scenarios were dropped because the options changed; add them again.')); }
      renderIdxSummary();
      renderAvailability();
      fillIdxVar(); fillZoneVars(); fillAnaVars(); fillCropSelect(); fillMultiList(); fillCatGroup();
      setPoints(A.ptSource === 'typed' && A.pts.length ? A.pts : pointsFromRecords(), A.ptSource === 'typed' ? 'typed' : 'records');
      ['agIdxCard', 'agZoneCard', 'agCropCard', 'agCatCard', 'agMultiCard', 'agAnaCard', 'agFutCard', 'agReportCard'].forEach(id => { $(id).style.display = 'block'; });
      A.idxFitted = false;
      drawIdxMap(); drawHist(); renderCatTable(); renderMethods();
      showMessage('agIdxMessages', 'success', L2(`${A.order.length} índices calculados en ${fmt((performance.now() - t0) / 1000, 1)} s.`,
        `${A.order.length} indices computed in ${fmt((performance.now() - t0) / 1000, 1)} s.`));
    } catch (e) {
      console.error(e);
      showMessage('agIdxMessages', 'error', L2('No se pudieron calcular los índices: ', 'The indices could not be computed: ') + eHTML(e));
    } finally {
      A.busy = false; $('agCalcBtn').disabled = false;
      setTimeout(() => { $('agCalcProgress').style.display = 'none'; }, 600);
    }
  });

  function renderIdxSummary() {
    const g = k => { const a = A.idx[k]; return a ? areaMean(a, A.meta, A.rowArea) : NaN; };
    statTiles('agIdxSummary', [
      [bi('T media anual', 'Mean annual T'), fmt(g('tmean'), 1) + ' °C'],
      [bi('Precipitación anual', 'Annual precipitation'), fmtInt(g('prec')) + ' mm'],
      [bi('Grados-día (año)', 'Degree days (year)'), fmtInt(g('gdd'))],
      [bi('ETo anual', 'Annual PET'), fmtInt(g('pet')) + ' mm'],
      [bi('Índice de aridez', 'Aridity index'), fmt(g('ai'), 2)],
      [bi('Periodo de crecimiento', 'Growing period'), fmtInt(g('lgp')) + ' d'],
      [bi('Días con helada', 'Frost days'), fmtInt(g('frostDays'))],
      [bi('Horas frío', 'Chilling hours'), fmtInt(g('chillH'))],
    ]);
  }

  /* one line per index saying whether it is exact, approximate or switched off, and what it would need */
  function renderAvailability() {
    const box = $('agIdxApprox');
    const rows = IDX.map(d => {
      let cls = 'exact', txt = bi('mensual', 'monthly'), why = '';
      if (d.opt === 'utah' && !(A.opts && A.opts.utah)) { cls = 'off'; txt = bi('no calculado', 'not computed'); why = T('actívalo en las opciones', 'switch it on in the options'); }
      else if (A.approx) {
        if (d.exact) { cls = 'exact'; txt = bi('exacto', 'exact'); why = T('viene directo de una capa bioclimática', 'taken straight from a bioclimatic layer'); }
        else if (d.cal) { cls = 'off'; txt = bi('desactivado', 'switched off'); why = T('necesita capas mensuales reales', 'needs real monthly layers'); }
        else { cls = 'approx'; txt = bi('aproximado', 'approximate'); why = T('del ciclo mensual reconstruido', 'from the reconstructed monthly cycle'); }
      }
      return `<div>${esc(T(d.n.es, d.n.en))}<span class="ag-badge ${cls}">${L2(txt.es, txt.en)}</span>${why ? ' <span class="hint" style="margin:0">' + esc(why) + '</span>' : ''}</div>`;
    }).join('');
    box.innerHTML = (A.approx
      ? `<div class="msg msg-warning">${L2('Índices derivados de las capas bioclimáticas. Los marcados como <b>aproximados</b> provienen de un ciclo mensual reconstruido; los marcados como <b>exactos</b> se leen directamente de una capa bioclimática y los <b>desactivados</b> exigen capas mensuales reales.',
        'Indices derived from the bioclimatic layers. Those marked <b>approximate</b> come from a reconstructed monthly cycle; those marked <b>exact</b> are read straight from a bioclimatic layer and the <b>switched off</b> ones require real monthly layers.')}</div>`
      : `<div class="msg msg-success">${L2('Índices calculados a partir de capas mensuales reales de temperatura mínima, máxima y precipitación.', 'Indices computed from real monthly layers of minimum and maximum temperature and precipitation.')}</div>`)
      + `<div class="ag-avail">${rows}</div>`;
  }

  /* ---------------------------------------------------------------- selects that follow the language */
  function fillIdxVar() {
    const sel = $('agIdxVar'), prev = sel.value;
    sel.innerHTML = '';
    A.order.forEach(k => sel.add(new Option(idxName(k) + (idxUnit(k) ? ` (${idxUnit(k)})` : ''), k)));
    if (A.zones) sel.add(new Option(idxName('zone'), 'zone'));
    if (A.ana) sel.add(new Option(idxName('ana'), 'ana'));
    if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
  }
  function fillScnSelects() {
    ['agIdxScn', 'agCropScn'].forEach(id => {
      const sel = $(id), prev = sel.value;
      sel.innerHTML = '';
      sel.add(new Option(T('Presente', 'Present'), ''));
      A.fut.forEach(f => sel.add(new Option(f.name, f.name)));
      if (A.fut.length > 1 && id === 'agCropScn') sel.add(new Option(T('Media de los escenarios', 'Mean of the scenarios'), '__mean'));
      if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
    });
  }
  function fillVarChecklist(boxId, def) {
    const box = $(boxId), prev = new Set([...box.querySelectorAll('input:checked')].map(i => i.value));
    const keys = A.order.filter(k => !idxMeta(k).cat);
    box.innerHTML = '';
    keys.forEach(k => {
      const on = prev.size ? prev.has(k) : def.includes(k);
      const l = document.createElement('label'); l.className = 'checkbox-label';
      l.innerHTML = `<input type="checkbox" value="${k}"${on ? ' checked' : ''}> ${esc(idxName(k))}`;
      box.appendChild(l);
    });
  }
  const ZONE_DEF = ['tmean', 'prec', 'gdd', 'lgp', 'ai', 'frostDays'];
  const ANA_DEF = ['tmean', 'prec', 'gdd', 'lgp', 'ai', 'frostDays', 'chillH'];
  const fillZoneVars = () => fillVarChecklist('agZoneVars', ZONE_DEF);
  const fillAnaVars = () => fillVarChecklist('agAnaVars', ANA_DEF);
  const checkedOf = boxId => [...$(boxId).querySelectorAll('input:checked')].map(i => i.value);

  function fillCalPoint() {
    const sel = $('agCalPoint'), prev = sel.value;
    sel.innerHTML = '';
    if (A.calPoint && !A.pts.some(p => p.lat === A.calPoint.lat && p.lon === A.calPoint.lon))
      sel.add(new Option(`${A.calPoint.name} (${A.calPoint.lat.toFixed(3)}, ${A.calPoint.lon.toFixed(3)})`, '-1'));
    A.pts.forEach((p, i) => sel.add(new Option(`${p.name} (${p.lat.toFixed(3)}, ${p.lon.toFixed(3)})`, String(i))));
    if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
    else if (sel.options.length) sel.selectedIndex = 0;
  }
  function fillAnaPoint() {
    const sel = $('agAnaPoint'), prev = sel.value;
    sel.innerHTML = '';
    sel.add(new Option(T('— coordenadas escritas abajo —', '— coordinates typed below —'), ''));
    A.pts.forEach((p, i) => sel.add(new Option(`${p.name} (${p.lat.toFixed(3)}, ${p.lon.toFixed(3)})`, String(i))));
    if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
  }
  $('agCalPoint').addEventListener('change', () => {
    const v = $('agCalPoint').value;
    if (v !== '-1' && A.pts[+v]) A.calPoint = A.pts[+v];
    drawCalendar();
  });
  $('agAnaPoint').addEventListener('change', () => {
    const p = A.pts[+$('agAnaPoint').value];
    if (p) { $('agAnaLat').value = p.lat.toFixed(4); $('agAnaLon').value = p.lon.toFixed(4); }
  });

  /* ---------------------------------------------------------------- agroclimatic zoning (k-means) */
  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

  /* standardised matrix of the chosen indices over the cells with data */
  function zMatrix(keys, scn) {
    const arrs = keys.map(k => idxArray(k, scn)).filter(Boolean);
    if (arrs.length !== keys.length) return null;
    const idx = [];
    for (let i = 0; i < A.ncell; i++) { let ok = true; for (const a of arrs) if (!nz(a[i])) { ok = false; break; } if (ok) idx.push(i); }
    if (idx.length < 10) return null;
    const p = keys.length, X = new Float64Array(idx.length * p), mean = new Float64Array(p), sd = new Float64Array(p),
      lo = new Float64Array(p).fill(Infinity), hi = new Float64Array(p).fill(-Infinity);
    for (let j = 0; j < p; j++) {
      const a = arrs[j]; let s = 0;
      for (let q = 0; q < idx.length; q++) { const v = a[idx[q]]; s += v; if (v < lo[j]) lo[j] = v; if (v > hi[j]) hi[j] = v; }
      mean[j] = s / idx.length;
      let s2 = 0; for (let q = 0; q < idx.length; q++) s2 += (a[idx[q]] - mean[j]) ** 2;
      sd[j] = Math.sqrt(s2 / Math.max(1, idx.length - 1)) || 1;
      for (let q = 0; q < idx.length; q++) X[q * p + j] = (a[idx[q]] - mean[j]) / sd[j];
    }
    return { X, idx, p, n: idx.length, mean, sd, lo, hi, keys, arrs };
  }

  /* k-means with a k-means++ start on a fixed seed; returns the labels and the within-cluster sum of squares */
  function kmeans(X, n, p, k, seed, iters = 40) {
    const rnd = rng(seed), C = new Float64Array(k * p), lab = new Int32Array(n), d2 = new Float64Array(n);
    let first = Math.floor(rnd() * n);
    for (let j = 0; j < p; j++) C[j] = X[first * p + j];
    for (let c = 1; c < k; c++) {
      let tot = 0;
      for (let q = 0; q < n; q++) {
        let best = Infinity;
        for (let cc = 0; cc < c; cc++) { let s = 0; for (let j = 0; j < p; j++) { const dd = X[q * p + j] - C[cc * p + j]; s += dd * dd; } if (s < best) best = s; }
        d2[q] = best; tot += best;
      }
      let t = rnd() * tot, pick = n - 1;
      for (let q = 0; q < n; q++) { t -= d2[q]; if (t <= 0) { pick = q; break; } }
      for (let j = 0; j < p; j++) C[c * p + j] = X[pick * p + j];
    }
    const cnt = new Float64Array(k), sum = new Float64Array(k * p);
    let wss = 0;
    for (let it = 0; it < iters; it++) {
      let moved = 0; wss = 0;
      for (let q = 0; q < n; q++) {
        let best = Infinity, bc = 0;
        for (let c = 0; c < k; c++) { let s = 0; for (let j = 0; j < p; j++) { const dd = X[q * p + j] - C[c * p + j]; s += dd * dd; } if (s < best) { best = s; bc = c; } }
        if (lab[q] !== bc) { lab[q] = bc; moved++; }
        wss += best;
      }
      cnt.fill(0); sum.fill(0);
      for (let q = 0; q < n; q++) { const c = lab[q]; cnt[c]++; for (let j = 0; j < p; j++) sum[c * p + j] += X[q * p + j]; }
      for (let c = 0; c < k; c++) {
        if (!cnt[c]) { const q = Math.floor(rnd() * n); for (let j = 0; j < p; j++) C[c * p + j] = X[q * p + j]; continue; }
        for (let j = 0; j < p; j++) C[c * p + j] = sum[c * p + j] / cnt[c];
      }
      if (!moved && it > 0) break;
    }
    return { lab, C, wss, cnt: Array.from(cnt) };
  }
  /* Mean silhouette on a regular subsample, using the distance to the cluster centroids instead of the distance to
     every other point: a fast approximation that is enough as a hint for choosing k. */
  function silhouette(X, lab, C, n, p, k) {
    const take = Math.min(1200, n), step = Math.max(1, Math.floor(n / take));
    let s = 0, m = 0;
    for (let q = 0; q < n; q += step) {
      const c = lab[q];
      let a = 0, b = Infinity;
      for (let cc = 0; cc < k; cc++) {
        let d = 0; for (let j = 0; j < p; j++) { const dd = X[q * p + j] - C[cc * p + j]; d += dd * dd; }
        d = Math.sqrt(d);
        if (cc === c) a = d; else if (d < b) b = d;
      }
      if (isFinite(b) && Math.max(a, b) > 0) { s += (b - a) / Math.max(a, b); m++; }
    }
    return m ? s / m : NaN;
  }

  $('agZoneBtn').addEventListener('click', async () => {
    clearMessages('agZoneMessages');
    const keys = checkedOf('agZoneVars');
    if (keys.length < 2) { showMessage('agZoneMessages', 'error', L2('Elige al menos 2 índices.', 'Choose at least 2 indices.')); return; }
    const k = Math.max(2, Math.min(12, +$('agZoneK').value || 5)), seed = +$('agZoneSeed').value || 42;
    showSpinner(T('Zonificando…', 'Building the zones…'));
    try {
      await tick(10);
      const M = zMatrix(keys, '');
      if (!M) throw err('No hay suficientes celdas con todos los índices elegidos.', 'There are not enough cells with all the chosen indices.');
      const r = kmeans(M.X, M.n, M.p, k, seed);
      const arr = new Float32Array(A.ncell).fill(NaN);
      M.idx.forEach((cell, q) => { arr[cell] = r.lab[q] + 1; });
      /* the elbow and the silhouette as a hint for k */
      const hint = [];
      for (let kk = 2; kk <= Math.min(9, Math.max(6, k + 2)); kk++) {
        const rr = kk === k ? r : kmeans(M.X, M.n, M.p, kk, seed);
        hint.push({ k: kk, wss: rr.wss, sil: silhouette(M.X, rr.lab, rr.C, M.n, M.p, kk) });
      }
      A.zones = { arr, k, keys, wss: r.wss, hint, M, lab: r.lab };
      /* table describing each zone: area and the mean of every chosen index */
      const rows = [];
      for (let c = 1; c <= k; c++) {
        const row = { zone: c, cells: 0, area: 0 };
        keys.forEach(kk => { row[kk] = 0; });
        for (let q = 0; q < M.n; q++) {
          if (r.lab[q] !== c - 1) continue;
          const cell = M.idx[q], rr = Math.floor(cell / A.meta.ncol);
          row.cells++; row.area += A.rowArea[rr];
          keys.forEach((kk, j) => { row[kk] += M.arrs[j][cell]; });
        }
        keys.forEach(kk => { row[kk] = row.cells ? row[kk] / row.cells : NaN; });
        rows.push(row);
      }
      A.zones.rows = rows;
      renderZoneTable();
      drawElbow();
      fillIdxVar(); $('agIdxVar').value = 'zone'; drawIdxMap(); drawHist();
      $('agDlZoneCsv').style.display = '';
      const bestSil = A.zones.hint.slice().sort((a, b) => b.sil - a.sil)[0];
      showMessage('agZoneMessages', 'success', L2(`${k} zonas sobre ${fmtInt(M.n)} celdas. La silueta media es máxima con k = ${bestSil.k} (${fmt(bestSil.sil, 2)}); el mapa muestra ahora las zonas.`,
        `${k} zones over ${fmtInt(M.n)} cells. The mean silhouette peaks at k = ${bestSil.k} (${fmt(bestSil.sil, 2)}); the map now shows the zones.`));
      renderMethods();
    } catch (e) { console.error(e); showMessage('agZoneMessages', 'error', L2('Error al zonificar: ', 'Zoning error: ') + eHTML(e)); }
    finally { hideSpinner(); }
  });
  function zoneCols() {
    const keys = A.zones ? A.zones.keys : [];
    return [{ key: 'zone', label: bi('Zona', 'Zone'), get: r => T('Zona ', 'Zone ') + r.zone },
      { key: 'area', label: bi('Superficie (km²)', 'Area (km²)'), get: r => fmtInt(r.area) },
      { key: 'pct', label: bi('% de la región', '% of the region'), get: r => fmt(r.area / A.zones.rows.reduce((s, x) => s + x.area, 0) * 100, 1) },
      ...keys.map(k => ({ key: k, label: () => idxName(k), get: r => fmt(r[k], idxDec(k)) }))];
  }
  function renderZoneTable() { if (A.zones) buildTable('agZoneTable', zoneCols(), A.zones.rows); }
  $('agDlZoneCsv').addEventListener('click', () => { if (A.zones) downloadBlob(toCSV(zoneCols(), A.zones.rows), fileTag('zones') + '.csv', 'text/csv;charset=utf-8'); });

  function drawElbow() {
    Views.reg('agZoneElbow', () => {
      const box = $('agZoneElbow');
      if (!A.zones) { box.innerHTML = ''; return; }
      const h = A.zones.hint, p = pal(), W = 520, H = 190, m = { l: 52, r: 52, t: 16, b: 34 };
      const mxW = Math.max(...h.map(o => o.wss)), mnW = Math.min(...h.map(o => o.wss));
      const sx = i => m.l + i / Math.max(1, h.length - 1) * (W - m.l - m.r);
      const syW = v => H - m.b - (v - mnW) / ((mxW - mnW) || 1) * (H - m.t - m.b);
      const syS = v => H - m.b - (v - 0) / 0.8 * (H - m.t - m.b);
      let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="system-ui, Segoe UI, sans-serif"><rect width="${W}" height="${H}" fill="${p.bg}"/>`;
      s += `<path d="M${m.l},${m.t} V${H - m.b} H${W - m.r}" fill="none" stroke="${p.border}"/>`;
      s += `<polyline points="${h.map((o, i) => sx(i).toFixed(1) + ',' + syW(o.wss).toFixed(1)).join(' ')}" fill="none" stroke="${p.primary}" stroke-width="2"/>`;
      s += `<polyline points="${h.map((o, i) => sx(i).toFixed(1) + ',' + syS(o.sil).toFixed(1)).join(' ')}" fill="none" stroke="${p.accent}" stroke-width="2" stroke-dasharray="5,4"/>`;
      h.forEach((o, i) => {
        s += `<circle cx="${sx(i).toFixed(1)}" cy="${syW(o.wss).toFixed(1)}" r="3" fill="${p.primary}"/>`;
        s += `<circle cx="${sx(i).toFixed(1)}" cy="${syS(o.sil).toFixed(1)}" r="3" fill="${p.accent}"/>`;
        s += `<text x="${sx(i).toFixed(1)}" y="${H - m.b + 14}" text-anchor="middle" font-size="10" fill="${o.k === A.zones.k ? p.text : p.muted}" font-weight="${o.k === A.zones.k ? 700 : 400}">${o.k}</text>`;
      });
      s += `<text x="${m.l}" y="${m.t - 4}" font-size="10.5" fill="${p.primary}">${esc(T('suma de cuadrados dentro de grupos (codo)', 'within-cluster sum of squares (elbow)'))}</text>`;
      s += `<text x="${W - m.r}" y="${m.t - 4}" text-anchor="end" font-size="10.5" fill="${p.accent}">${esc(T('silueta media', 'mean silhouette'))}</text>`;
      s += `<text x="${(m.l + W - m.r) / 2}" y="${H - 4}" text-anchor="middle" font-size="10" fill="${p.muted}">k</text>`;
      box.innerHTML = s + '</svg>';
    });
  }

  /* ---------------------------------------------------------------- crop suitability */
  const cycleLen = (crop, mode) => mode === 'min' ? crop.cmin : mode === 'max' ? crop.cmax : (crop.cmin + crop.cmax) / 2;
  /* days of the cycle that fall in each month, for every planting month */
  function windowMatrix(L) {
    const W = [];
    for (let p = 0; p < 12; p++) {
      const w = new Float64Array(12);
      let rem = L, m = p, guard = 0;
      while (rem > 1e-6 && guard++ < 30) { const mm = m % 12; const take = Math.min(rem, MDAYS[mm]); w[mm] += take; rem -= take; m++; }
      W.push(w);
    }
    return W;
  }

  /* Envelope of the EcoCrop type over the 12 planting months; keeps the best one and its limiting factor. */
  function computeCrop(mon, idx, crop, cycMode, useChill, useElev) {
    const n = A.ncell;
    const L = Math.min(365, Math.max(20, cycleLen(crop, cycMode)));
    const perennial = L >= 360, nP = perennial ? 1 : 12, W = windowMatrix(L);
    const suit = new Float32Array(n).fill(NaN), month = new Float32Array(n).fill(NaN),
      limit = new Float32Array(n).fill(NaN), fcls = new Float32Array(n).fill(NaN);
    const tmn = new Float64Array(12), tmx = new Float64Array(12), pr = new Float64Array(12), tm = new Float64Array(12);
    const kx = crop.kx == null ? crop.txa + 8 : crop.kx, hasAvg = !!mon.tavg;
    for (let i = 0; i < n; i++) {
      let ok = true;
      for (let m = 0; m < 12; m++) {
        tmn[m] = mon.tmin[m * n + i]; tmx[m] = mon.tmax[m * n + i]; pr[m] = mon.prec[m * n + i];
        if (!nz(tmn[m]) || !nz(tmx[m]) || !nz(pr[m])) { ok = false; break; }
        if (tmx[m] < tmn[m]) { const t = tmx[m]; tmx[m] = tmn[m]; tmn[m] = t; }
        if (pr[m] < 0) pr[m] = 0;
        tm[m] = hasAvg && nz(mon.tavg[m * n + i]) ? mon.tavg[m * n + i] : (tmn[m] + tmx[m]) / 2;
      }
      if (!ok) continue;
      let cf = 1;
      if (useChill && crop.ch) {
        const c = idx && idx.chillH ? idx.chillH[i] : NaN;
        if (nz(c)) { const half = 0.5 * crop.ch; cf = c >= crop.ch ? 1 : Math.max(0, (c - half) / half); }
      }
      const elevFail = !!(useElev && crop.ev != null && A.elev && nz(A.elev[i]) && A.elev[i] > crop.ev);
      let bs = -1, bs2 = -1, bp = 0, bl = 1;
      for (let p = 0; p < nP; p++) {
        const w = W[p];
        let tsum = 0, psum = 0, mn = 1e9, mx = -1e9;
        for (let m = 0; m < 12; m++) {
          const ww = w[m]; if (ww <= 0) continue;
          tsum += tm[m] * ww; psum += pr[m] * ww / MDAYS[m];
          if (tmn[m] < mn) mn = tmn[m];
          if (tmx[m] > mx) mx = tmx[m];
        }
        const Tc = tsum / L, Pc = psum;
        const st = cropdb.trap(Tc, crop.tna, crop.tno, crop.txo, crop.txa);
        const sp = cropdb.trap(Pc, crop.rna, crop.rno, crop.rxo, crop.rxa);
        const frost = mn < crop.kt, heat = mx > kx;
        const s2 = Math.min(st, sp) * cf;
        const s = (frost || heat || elevFail) ? 0 : s2;
        let lim;
        if (elevFail) lim = 9;
        else if (frost) lim = 6;
        else if (heat) lim = 7;
        else if (st >= 1 && sp >= 1 && cf >= 1) lim = 1;
        else if (cf < 1 && cf <= Math.min(st, sp)) lim = 8;
        else if (st <= sp) lim = Tc < crop.tno ? 2 : 3;
        else lim = Pc < crop.rno ? 4 : 5;
        if (s > bs || (s === bs && s2 > bs2)) { bs = s; bs2 = s2; bp = p; bl = lim; }
      }
      suit[i] = bs; month[i] = perennial ? NaN : bp + 1; limit[i] = bl;
      fcls[i] = bs >= 0.8 ? 1 : bs >= 0.5 ? 2 : bs >= 0.2 ? 3 : 4;
    }
    return { crop, suit, month, limit, fcls, L, perennial, cycMode, useChill, useElev };
  }

  /* area per class code (1-based), total area and the mean of the suitability */
  function classAreas(arr, nk) {
    const area = new Float64Array(nk + 1);
    let tot = 0;
    for (let r = 0; r < A.meta.nrow; r++) for (let c = 0; c < A.meta.ncol; c++) {
      const v = arr[r * A.meta.ncol + c];
      if (!nz(v)) continue;
      const i = Math.round(v);
      if (i >= 1 && i <= nk) area[i] += A.rowArea[r];
      tot += A.rowArea[r];
    }
    return { area, tot };
  }
  const suitableArea = arr => {
    let s = 0;
    for (let r = 0; r < A.meta.nrow; r++) for (let c = 0; c < A.meta.ncol; c++) { const v = arr[r * A.meta.ncol + c]; if (nz(v) && v >= 0.5) s += A.rowArea[r]; }
    return s;
  };

  function fillCropSelect() {
    const sel = $('agCrop'), prev = sel.value;
    sel.innerHTML = '';
    const groups = {};
    cropdb.list().forEach(c => { (groups[c.g] = groups[c.g] || []).push(c); });
    Object.keys(cropdb.GROUPS).forEach(g => {
      if (!groups[g]) return;
      const og = document.createElement('optgroup'); og.label = cropdb.groupLabel(g);
      groups[g].sort((a, b) => cropdb.name(a).localeCompare(cropdb.name(b))).forEach(c => og.appendChild(new Option(cropdb.name(c), c.id)));
      sel.appendChild(og);
    });
    Object.keys(groups).filter(g => !cropdb.GROUPS[g]).forEach(g => {
      const og = document.createElement('optgroup'); og.label = g;
      groups[g].forEach(c => og.appendChild(new Option(cropdb.name(c), c.id)));
      sel.appendChild(og);
    });
    if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev; else sel.value = 'maize';
  }

  $('agCropRunBtn').addEventListener('click', async () => {
    if (!A.idx) return;
    clearMessages('agCropMessages');
    const crop = cropdb.byId($('agCrop').value);
    if (!crop) { showMessage('agCropMessages', 'error', L2('Elige un cultivo.', 'Choose a crop.')); return; }
    showSpinner(T('Evaluando la aptitud…', 'Evaluating the suitability…'));
    try {
      await tick(10);
      const r = computeCrop(A.mon, A.idx, crop, $('agCycle').value, $('agApplyChill').checked, $('agApplyElev').checked);
      A.crop = r;
      /* the same crop in every scenario already loaded */
      A.fut.forEach(f => { f.crops[crop.id] = computeCrop(f.mon, f.idx, crop, r.cycMode, r.useChill, r.useElev); });
      renderCropResult();
      $('agCropMapType').value = 'suit';
      A.cropFitted = false;
      drawCropMap(); drawCalendar(); renderMethods();
    } catch (e) { console.error(e); showMessage('agCropMessages', 'error', L2('Error al evaluar la aptitud: ', 'Error evaluating the suitability: ') + eHTML(e)); }
    finally { hideSpinner(); }
  });

  function renderCropResult() {
    const r = A.crop, crop = r.crop;
    const ca = classAreas(r.fcls, 4), la = classAreas(r.limit, 9);
    const sa = ca.area[1] + ca.area[2];
    let ms = 0, mn = 0;
    for (let i = 0; i < A.ncell; i++) if (nz(r.suit[i])) { ms += r.suit[i]; mn++; }
    /* the planting month that holds the largest suitable area */
    const marea = new Float64Array(13);
    for (let row = 0; row < A.meta.nrow; row++) for (let c = 0; c < A.meta.ncol; c++) {
      const i = row * A.meta.ncol + c;
      if (nz(r.month[i]) && nz(r.suit[i]) && r.suit[i] >= 0.5) marea[Math.round(r.month[i])] += A.rowArea[row];
    }
    let bm = 0; for (let m = 1; m <= 12; m++) if (marea[m] > marea[bm]) bm = m;
    let bl = 1; for (let k = 2; k <= 9; k++) if (la.area[k] > la.area[bl]) bl = k;
    A.crop.stat = { ca, la, sa, mean: mn ? ms / mn : NaN, bestMonth: bm, mainLimit: bl, marea };
    statTiles('agCropSummary', [
      [bi('Cultivo', 'Crop'), bi(crop.es, crop.en)],
      [bi('Ciclo usado', 'Cycle used'), r.perennial ? bi('perenne (año)', 'perennial (year)') : fmtInt(r.L) + ' d'],
      [bi('Superficie apta (≥ 0.5)', 'Suitable area (≥ 0.5)'), fmtInt(sa) + ' km²'],
      [bi('% de la región', '% of the region'), fmt(ca.tot > 0 ? sa / ca.tot * 100 : NaN, 1) + ' %'],
      [bi('Aptitud media', 'Mean suitability'), fmt(A.crop.stat.mean, 3)],
      [bi('Mejor mes de siembra', 'Best planting month'), r.perennial ? bi('no aplica', 'not applicable') : (bm ? bi(MONL[bm - 1].es, MONL[bm - 1].en) : '—')],
      [bi('Limitante principal', 'Main constraint'), bi(LIMIT[bl].l.es, LIMIT[bl].l.en)],
    ]);
    const clsRows = [1, 2, 3, 4].map(i => ({ cls: i, area: ca.area[i], pct: ca.tot > 0 ? ca.area[i] / ca.tot * 100 : NaN }));
    buildTable('agClassTable', clsCols(), clsRows);
    A.clsRows = clsRows;
    const limRows = [];
    for (let i = 1; i <= 9; i++) if (la.area[i] > 0) limRows.push({ cls: i, area: la.area[i], pct: la.tot > 0 ? la.area[i] / la.tot * 100 : NaN });
    limRows.sort((a, b) => b.area - a.area);
    buildTable('agLimitTable', limCols(), limRows);
    $('agCropNote').innerHTML = L2(
      `Parámetros usados: T ${fmt(crop.tna, 1)} / ${fmt(crop.tno, 1)} / ${fmt(crop.txo, 1)} / ${fmt(crop.txa, 1)} °C · P ${fmtInt(crop.rna)} / ${fmtInt(crop.rno)} / ${fmtInt(crop.rxo)} / ${fmtInt(crop.rxa)} mm · ciclo ${fmtInt(crop.cmin)}–${fmtInt(crop.cmax)} d · T letal ${fmt(crop.kt, 1)} °C${crop.ch ? ' · frío ' + fmtInt(crop.ch) + ' h' : ''}${crop.ev != null ? ' · altitud ≤ ' + fmtInt(crop.ev) + ' m' : ''}. ${esc(crop.n ? crop.n.es : '')} <b>Son valores de referencia indicativos: ajústalos en el apartado 6.</b>`,
      `Parameters used: T ${fmt(crop.tna, 1)} / ${fmt(crop.tno, 1)} / ${fmt(crop.txo, 1)} / ${fmt(crop.txa, 1)} °C · P ${fmtInt(crop.rna)} / ${fmtInt(crop.rno)} / ${fmtInt(crop.rxo)} / ${fmtInt(crop.rxa)} mm · cycle ${fmtInt(crop.cmin)}–${fmtInt(crop.cmax)} d · killing T ${fmt(crop.kt, 1)} °C${crop.ch ? ' · chilling ' + fmtInt(crop.ch) + ' h' : ''}${crop.ev != null ? ' · elevation ≤ ' + fmtInt(crop.ev) + ' m' : ''}. ${esc(crop.n ? crop.n.en : '')} <b>These are indicative reference values: adjust them in section 6.</b>`);
    if (crop.ch && !r.useChill) showMessage('agCropMessages', 'info', L2('Este cultivo tiene requerimiento de frío y la casilla está desactivada: la aptitud no lo toma en cuenta.',
      'This crop has a chilling requirement and the box is off: the suitability does not take it into account.'));
    if (crop.ev != null && r.useElev && !A.elev) showMessage('agCropMessages', 'info', L2('No hay capa de altitud cargada (paso 5): el límite de altitud del cultivo no se aplicó.',
      'No elevation layer is loaded (step 5): the crop elevation limit was not applied.'));
    if (crop.phn != null) showMessage('agCropMessages', 'info', L2(`El rango de pH (${fmt(crop.phn, 1)}–${fmt(crop.phx, 1)}) se reporta pero no se aplica: la app no tiene capa de pH del suelo.`,
      `The pH range (${fmt(crop.phn, 1)}–${fmt(crop.phx, 1)}) is reported but not applied: the app has no soil-pH layer.`));
  }
  const clsCols = () => [
    { key: 'cls', label: bi('Clase de aptitud', 'Suitability class'), get: r => bi(FCLASS[r.cls].l.es, FCLASS[r.cls].l.en) },
    { key: 'area', label: bi('Superficie (km²)', 'Area (km²)'), get: r => fmtInt(r.area) },
    { key: 'pct', label: bi('% de la región', '% of the region'), get: r => fmt(r.pct, 1) }];
  const limCols = () => [
    { key: 'cls', label: bi('Factor limitante', 'Limiting factor'), get: r => bi(LIMIT[r.cls].l.es, LIMIT[r.cls].l.en) },
    { key: 'area', label: bi('Superficie (km²)', 'Area (km²)'), get: r => fmtInt(r.area) },
    { key: 'pct', label: bi('% de la región', '% of the region'), get: r => fmt(r.pct, 1) }];

  /* ---------------------------------------------------------------- crop map */
  function cropOf(scn) {
    if (!A.crop) return null;
    if (!scn || scn === '__mean') return A.crop;
    const f = A.fut.find(x => x.name === scn);
    return f && f.crops[A.crop.crop.id] ? f.crops[A.crop.crop.id] : null;
  }
  function drawCropMap() {
    if (!A.meta || !A.crop) return;
    ensureCropMap();
    const type = $('agCropMapType').value, scn = $('agCropScn').value;
    let arr = null, colorAt = null, legend = null;
    const title = extra => cropdb.name(A.crop.crop) + ' · ' + extra + (scn && scn !== '__mean' ? ' · ' + scn : '');
    if (type === 'suit' || type === 'class') {
      const r = scn === '__mean' ? meanFuture() : cropOf(scn);
      if (!r) { showMessage('agCropMessages', 'warning', L2('Ese escenario no tiene la aptitud de este cultivo; vuelve a calcularla.', 'That scenario does not have the suitability of this crop; compute it again.')); return; }
      if (type === 'class') {
        arr = r.fcls;
        colorAt = v => { const i = Math.round(v); return nz(v) && FCLASS[i] ? hex2rgb(FCLASS[i].c) : null; };
        legend = () => ({ title: title(T('clases tipo FAO', 'FAO-style classes')), kind: 'cat',
          items: FCLASS.slice(1).map(o => ({ color: o.c, label: T(o.l.es, o.l.en), shape: 'square' })) });
      } else {
        arr = r.suit;
        const LUT = lutOf(A.cropStudio.rampStops());
        colorAt = v => nz(v) ? LUT[Math.max(0, Math.min(255, Math.round(v * 255)))] : null;
        legend = () => ({ title: title(T('aptitud', 'suitability')), kind: 'grad', stops: A.cropStudio.rampStops(),
          ticks: [{ t: 0, label: T('0 (no apto)', '0 (not suitable)') }, { t: 0.5, label: '0.5' }, { t: 1, label: T('1 (óptimo)', '1 (optimal)') }],
          note: T('mínimo de la puntuación térmica y la hídrica, por el mejor mes de siembra', 'minimum of the temperature and the water score, for the best planting month') });
      }
    } else if (type === 'month') {
      const r = cropOf(scn) || A.crop;
      if (r.perennial) { showMessage('agCropMessages', 'info', L2('Es un cultivo perenne: no hay mes de siembra que elegir.', 'This is a perennial crop: there is no planting month to choose.')); return; }
      arr = r.month;
      colorAt = v => { const i = Math.round(v); return nz(v) && i >= 1 && i <= 12 ? hex2rgb(MON_COL[i - 1]) : null; };
      legend = () => ({ title: title(T('mejor mes de siembra', 'best planting month')), kind: 'cat',
        items: MON_COL.map((c, i) => ({ color: c, label: T(MONL[i].es, MONL[i].en), shape: 'square' })) });
    } else if (type === 'limit') {
      const r = cropOf(scn) || A.crop;
      arr = r.limit;
      colorAt = v => { const i = Math.round(v); return nz(v) && LIMIT[i] ? hex2rgb(LIMIT[i].c) : null; };
      legend = () => ({ title: title(T('factor limitante', 'limiting factor')), kind: 'cat',
        items: LIMIT.slice(1).map(o => ({ color: o.c, label: T(o.l.es, o.l.en), shape: 'square' })),
        note: T('el limitante del mejor mes de siembra de cada celda', "the constraint of each cell's best planting month") });
    } else if (type === 'best') {
      if (!A.best) { showMessage('agCropMessages', 'warning', L2('Primero compara varios cultivos en el apartado 7.', 'First compare several crops in section 7.')); return; }
      arr = A.best.arr;
      const ids = A.best.ids;
      colorAt = v => { const i = Math.round(v); return nz(v) && i >= 1 && i <= ids.length ? hex2rgb(mapkit.CAT_PALETTE[(i - 1) % mapkit.CAT_PALETTE.length]) : (nz(v) ? [225, 225, 225, 80] : null); };
      legend = () => ({ title: T('Mejor cultivo por celda', 'Best crop per cell'), kind: 'cat',
        items: ids.map((id, i) => ({ color: mapkit.CAT_PALETTE[i % mapkit.CAT_PALETTE.length], label: cropdb.name(cropdb.byId(id) || { es: id, en: id }), shape: 'square' }))
          .concat([{ color: '#e1e1e1', label: T('ninguno apto', 'none suitable'), shape: 'square' }]),
        note: T('entre los cultivos elegidos en la comparación', 'among the crops chosen in the comparison') });
    } else if (type === 'chg' || type === 'chgmonth' || type === 'agree') {
      if (!A.fut.length) { showMessage('agCropMessages', 'warning', L2('Añade primero un escenario futuro en el apartado 9.', 'First add a future scenario in section 9.')); return; }
      const f = A.fut.find(x => x.name === scn) || A.fut[0];
      const r = f.crops[A.crop.crop.id];
      if (!r) { showMessage('agCropMessages', 'warning', L2('Vuelve a calcular la aptitud para que el escenario la incluya.', 'Compute the suitability again so the scenario includes it.')); return; }
      if (type === 'chg') {
        arr = new Float32Array(A.ncell).fill(NaN);
        for (let i = 0; i < A.ncell; i++) {
          const a = A.crop.suit[i], b = r.suit[i];
          if (!nz(a) || !nz(b)) continue;
          arr[i] = a >= 0.5 ? (b >= 0.5 ? 1 : 3) : (b >= 0.5 ? 2 : 4);
        }
        colorAt = v => { const i = Math.round(v); return nz(v) && CHG[i] ? hex2rgb(CHG[i].c).concat(i === 4 ? [70] : [225]) : null; };
        legend = () => ({ title: cropdb.name(A.crop.crop) + ' · ' + T('cambio de aptitud', 'change in suitability') + ' · ' + f.name, kind: 'cat',
          items: CHG.slice(1).map(o => ({ color: o.c, label: T(o.l.es, o.l.en), shape: 'square' })) });
      } else if (type === 'chgmonth') {
        if (A.crop.perennial) { showMessage('agCropMessages', 'info', L2('Cultivo perenne: no hay mes de siembra.', 'Perennial crop: there is no planting month.')); return; }
        arr = new Float32Array(A.ncell).fill(NaN);
        for (let i = 0; i < A.ncell; i++) {
          const a = A.crop.month[i], b = r.month[i];
          if (!nz(a) || !nz(b) || A.crop.suit[i] < 0.2 || r.suit[i] < 0.2) continue;
          let d = b - a;
          while (d > 6) d -= 12;
          while (d < -6) d += 12;
          arr[i] = d;
        }
        /* diverging and reversed, so sowing earlier reads blue and sowing later reads red */
        const stops = mapstudio.rampStops('RdBu', true);
        const LUT = lutOf(stops);
        colorAt = v => nz(v) ? LUT[Math.max(0, Math.min(255, Math.round((v + 6) / 12 * 255)))] : null;
        legend = () => ({ title: cropdb.name(A.crop.crop) + ' · ' + T('cambio del mes de siembra', 'change in the planting month') + ' · ' + f.name,
          unit: T('meses', 'months'), kind: 'grad', stops,
          ticks: [{ t: 0, label: T('−6 (antes)', '−6 (earlier)') }, { t: 0.5, label: '0' }, { t: 1, label: T('+6 (después)', '+6 (later)') }] });
      } else {
        const ns = A.fut.length;
        arr = new Float32Array(A.ncell).fill(NaN);
        for (let i = 0; i < A.ncell; i++) {
          let c = 0, ok = 0;
          A.fut.forEach(g => { const rr = g.crops[A.crop.crop.id]; if (rr && nz(rr.suit[i])) { ok++; if (rr.suit[i] >= 0.5) c++; } });
          if (ok) arr[i] = c;
        }
        const LUT = lutOf(A.cropStudio.rampStops());
        colorAt = v => nz(v) ? LUT[Math.max(0, Math.min(255, Math.round(v / Math.max(1, ns) * 255)))] : null;
        legend = () => ({ title: cropdb.name(A.crop.crop) + ' · ' + T('escenarios que la mantienen apta', 'scenarios that keep it suitable'),
          unit: T(`de ${ns} escenario(s)`, `out of ${ns} scenario(s)`), kind: 'grad', stops: A.cropStudio.rampStops(),
          ticks: [{ t: 0, label: '0' }, { t: 1, label: String(ns) }] });
      }
    }
    if (!arr) return;
    A.cropArr = arr;
    const ov = makeOverlay(arr, A.meta, colorAt);
    if (A.cropOv) A.cropMap.removeLayer(A.cropOv);
    A.cropOv = L.imageOverlay(ov.url, ov.bounds, { opacity: +$('agCropOpacity').value, interactive: false, pane: 'agroCropPane' }).addTo(A.cropMap);
    if (!A.cropFitted) { A.cropMap.fitBounds(ov.bounds); A.cropFitted = true; }
    setTimeout(() => A.cropMap.invalidateSize(), 60);
    A.cropStudio.setLegend(legend);
  }
  /* the multi-scenario mean of the suitability of the active crop */
  function meanFuture() {
    if (!A.fut.length || !A.crop) return null;
    const id = A.crop.crop.id, parts = A.fut.map(f => f.crops[id]).filter(Boolean);
    if (!parts.length) return null;
    const suit = new Float32Array(A.ncell).fill(NaN), fcls = new Float32Array(A.ncell).fill(NaN),
      month = new Float32Array(A.ncell).fill(NaN), limit = new Float32Array(A.ncell).fill(NaN);
    for (let i = 0; i < A.ncell; i++) {
      let s = 0, n = 0;
      for (const p of parts) if (nz(p.suit[i])) { s += p.suit[i]; n++; }
      if (!n) continue;
      const v = s / n;
      suit[i] = v; fcls[i] = v >= 0.8 ? 1 : v >= 0.5 ? 2 : v >= 0.2 ? 3 : 4;
      month[i] = parts[0].month[i]; limit[i] = parts[0].limit[i];
    }
    return { crop: A.crop.crop, suit, fcls, month, limit, L: A.crop.L, perennial: A.crop.perennial };
  }
  ['agCropMapType', 'agCropScn'].forEach(id => $(id).addEventListener('change', () => { clearMessages('agCropMessages'); drawCropMap(); }));
  $('agCropOpacity').addEventListener('input', () => { if (A.cropOv) A.cropOv.setOpacity(+$('agCropOpacity').value); });
  $('agCropPng').addEventListener('click', () => { if (A.cropStudio) A.cropStudio.exportNow(); });
  $('agCropTif').addEventListener('click', () => exportTif(A.cropArr, fileTag((A.crop ? A.crop.crop.id : 'crop') + '_' + $('agCropMapType').value)));
  $('agCropAsc').addEventListener('click', () => exportAsc(A.cropArr, fileTag((A.crop ? A.crop.crop.id : 'crop') + '_' + $('agCropMapType').value)));

  /* ---------------------------------------------------------------- crop calendar at one site */
  /* monthly reference evapotranspiration for one cell, with the same formulas used by the index engine */
  function petMonths(tn, tx, tm, ra, dl, o, out) {
    if (o.pet === 'tw') {
      let I = 0;
      for (let m = 0; m < 12; m++) if (tm[m] > 0) I += Math.pow(tm[m] / 5, 1.514);
      const a = 6.75e-7 * I * I * I - 7.71e-5 * I * I + 1.792e-2 * I + 0.49239;
      for (let m = 0; m < 12; m++) {
        const t = tm[m];
        let e = 0;
        if (t > 26.5) e = -415.85 + 32.24 * t - 0.43 * t * t;
        else if (t > 0 && I > 0) e = 16 * Math.pow(10 * t / I, a) * (dl[m] / 12) * (MDAYS[m] / 30);
        out[m] = Math.max(0, e);
      }
    } else {
      for (let m = 0; m < 12; m++) out[m] = Math.max(0, MDAYS[m] * 0.0023 * ra[m] * (tm[m] + 17.8) * Math.sqrt(Math.max(0, tx[m] - tn[m])));
    }
    return out;
  }
  /* the 12 monthly series of one cell, plus the suitability of every planting date of the active crop */
  function cellSeries(i) {
    const n = A.ncell, o = A.opts;
    const tn = new Float64Array(12), tx = new Float64Array(12), pr = new Float64Array(12), tm = new Float64Array(12), pe = new Float64Array(12);
    for (let m = 0; m < 12; m++) {
      tn[m] = A.mon.tmin[m * n + i]; tx[m] = A.mon.tmax[m * n + i]; pr[m] = Math.max(0, A.mon.prec[m * n + i]);
      if (!nz(tn[m]) || !nz(tx[m]) || !nz(pr[m])) return null;
      if (tx[m] < tn[m]) { const t = tx[m]; tx[m] = tn[m]; tn[m] = t; }
      tm[m] = A.mon.tavg && nz(A.mon.tavg[m * n + i]) ? A.mon.tavg[m * n + i] : (tn[m] + tx[m]) / 2;
    }
    const r = Math.floor(i / A.meta.ncol);
    petMonths(tn, tx, tm, A.ra.subarray(r * 12, r * 12 + 12), A.dl.subarray(r * 12, r * 12 + 12), o, pe);
    let ps = null;
    if (A.crop) {
      const crop = A.crop.crop, L = A.crop.L, W = windowMatrix(L), kx = crop.kx == null ? crop.txa + 8 : crop.kx;
      let cf = 1;
      if (A.crop.useChill && crop.ch) { const c = A.idx.chillH ? A.idx.chillH[i] : NaN; if (nz(c)) { const h = 0.5 * crop.ch; cf = c >= crop.ch ? 1 : Math.max(0, (c - h) / h); } }
      ps = new Float64Array(12);
      for (let p = 0; p < 12; p++) {
        const w = W[p];
        let ts = 0, pss = 0, mn = 1e9, mx = -1e9;
        for (let m = 0; m < 12; m++) { const ww = w[m]; if (ww <= 0) continue; ts += tm[m] * ww; pss += pr[m] * ww / MDAYS[m]; if (tn[m] < mn) mn = tn[m]; if (tx[m] > mx) mx = tx[m]; }
        const st = cropdb.trap(ts / L, crop.tna, crop.tno, crop.txo, crop.txa), sp = cropdb.trap(pss, crop.rna, crop.rno, crop.rxo, crop.rxa);
        ps[p] = (mn < crop.kt || mx > kx) ? 0 : Math.min(st, sp) * cf;
      }
    }
    return { tn, tx, tm, pr, pet: pe, plant: ps };
  }
  function drawCalendar() {
    Views.reg('agCalFig', () => {
      const box = $('agCalFig');
      if (!A.calPoint || !A.mon) { box.innerHTML = ''; return; }
      const i = cellOf(A.calPoint.lat, A.calPoint.lon);
      if (i < 0) { box.innerHTML = `<p class="hint">${L2('El sitio queda fuera de la malla.', 'The site lies outside the grid.')}</p>`; return; }
      const s = cellSeries(i);
      if (!s) { box.innerHTML = `<p class="hint">${L2('El sitio no tiene datos climáticos en la malla.', 'The site has no climate data in the grid.')}</p>`; return; }
      const p = pal(), W = 700, H = s.plant ? 352 : 252, m = { l: 48, r: 48, t: 22, b: s.plant ? 130 : 46 };
      const chartH = H - m.b - m.t;
      const pmax = Math.max(10, ...s.pr, ...s.pet) * 1.08;
      const tlo = Math.min(...s.tn) - 2, thi = Math.max(...s.tx) + 2;
      const bw = (W - m.l - m.r) / 12;
      const sy = v => m.t + chartH - (v / pmax) * chartH;
      const st = v => m.t + chartH - ((v - tlo) / ((thi - tlo) || 1)) * chartH;
      let g = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="system-ui, Segoe UI, sans-serif"><rect width="${W}" height="${H}" fill="${p.bg}"/>`;
      g += `<text x="${m.l}" y="${m.t - 8}" font-size="11.5" fill="${p.text}" font-weight="600">${esc(A.calPoint.name)} · ${A.calPoint.lat.toFixed(3)}, ${A.calPoint.lon.toFixed(3)}</text>`;
      g += `<path d="M${m.l},${m.t} V${m.t + chartH} H${W - m.r}" fill="none" stroke="${p.border}"/>`;
      for (let k = 0; k <= 2; k++) {
        const y = m.t + chartH - k / 2 * chartH;
        g += `<line x1="${m.l}" y1="${y}" x2="${W - m.r}" y2="${y}" stroke="${p.border}" stroke-opacity=".35"/>`;
        g += `<text x="${m.l - 5}" y="${y + 3.4}" text-anchor="end" font-size="9.5" fill="${p.sky}">${esc(fmtInt(pmax * k / 2))}</text>`;
        g += `<text x="${W - m.r + 5}" y="${y + 3.4}" font-size="9.5" fill="${p.accent}">${esc(fmt(tlo + (thi - tlo) * k / 2, 0))}</text>`;
      }
      s.pr.forEach((v, k) => {
        const h = Math.max(0, m.t + chartH - sy(v));
        g += `<rect x="${(m.l + k * bw + bw * 0.18).toFixed(1)}" y="${sy(v).toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${h.toFixed(1)}" fill="${p.sky}" fill-opacity=".55"><title>${esc(T(MONL[k].es, MONL[k].en))}: ${esc(fmtInt(v))} mm</title></rect>`;
      });
      /* Array.from first: mapping a typed array would coerce the point strings back to numbers */
      const line = (arr, f, col, dash) => `<polyline points="${Array.from(arr).map((v, k) => (m.l + (k + 0.5) * bw).toFixed(1) + ',' + f(v).toFixed(1)).join(' ')}" fill="none" stroke="${col}" stroke-width="2"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
      g += line(s.pet, sy, p.danger, '5,4');
      g += line(s.tm, st, p.accent);
      g += line(s.tx, st, p.accent, '2,3');
      g += line(s.tn, st, p.accent, '2,3');
      for (let k = 0; k < 12; k++) g += `<text x="${(m.l + (k + 0.5) * bw).toFixed(1)}" y="${m.t + chartH + 13}" text-anchor="middle" font-size="9.5" fill="${p.muted}">${esc(T(MON[k].es, MON[k].en))}</text>`;
      g += `<text x="${m.l}" y="${m.t + chartH + 29}" font-size="9.5" fill="${p.muted}">`
        + `<tspan fill="${p.sky}">■</tspan> ${esc(T('precipitación (mm)', 'precipitation (mm)'))}  `
        + `<tspan fill="${p.danger}">—</tspan> ${esc(T('ETo (mm)', 'PET (mm)'))}  `
        + `<tspan fill="${p.accent}">—</tspan> ${esc(T('T media / mín / máx (°C)', 'mean / min / max T (°C)'))}</text>`;
      if (s.plant) {
        const by = H - 66, bh = 42;
        g += `<text x="${m.l}" y="${by - 6}" font-size="10.5" fill="${p.text}">${esc(T('Aptitud según el mes de siembra', 'Suitability by planting month'))} · ${esc(cropdb.name(A.crop.crop))}${A.crop.perennial ? ' (' + esc(T('perenne: la ventana es todo el año', 'perennial: the window is the whole year')) + ')' : ''}</text>`;
        const bestv = Math.max(...s.plant);
        s.plant.forEach((v, k) => {
          const h = Math.max(0.5, v * bh);
          const col = v >= 0.8 ? FCLASS[1].c : v >= 0.5 ? FCLASS[2].c : v >= 0.2 ? FCLASS[3].c : '#cfcfcf';
          g += `<rect x="${(m.l + k * bw + bw * 0.14).toFixed(1)}" y="${(by + bh - h).toFixed(1)}" width="${(bw * 0.72).toFixed(1)}" height="${h.toFixed(1)}" fill="${col}"${v === bestv && v > 0 ? ` stroke="${p.text}" stroke-width="1.2"` : ''}><title>${esc(T(MONL[k].es, MONL[k].en))}: ${esc(fmt(v, 3))}</title></rect>`;
          g += `<text x="${(m.l + (k + 0.5) * bw).toFixed(1)}" y="${by + bh + 11}" text-anchor="middle" font-size="9" fill="${p.muted}">${esc(T(MON[k].es, MON[k].en))}</text>`;
          g += `<text x="${(m.l + (k + 0.5) * bw).toFixed(1)}" y="${(by + bh - h - 3).toFixed(1)}" text-anchor="middle" font-size="8.5" fill="${p.muted}">${esc(fmt(v, 2).replace('0.', '.'))}</text>`;
        });
      }
      box.innerHTML = g + '</svg>';
    });
  }

  /* ---------------------------------------------------------------- editable catalogue */
  function fillCatGroup() {
    const sel = $('agCatGroup'), prev = sel.value;
    sel.innerHTML = '';
    sel.add(new Option(T('todos', 'all'), ''));
    Object.keys(cropdb.GROUPS).forEach(g => sel.add(new Option(cropdb.groupLabel(g), g)));
    if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
  }
  const multiChosen = () => new Set([...$('agMultiList').querySelectorAll('input:checked')].map(i => i.value));
  function catFiltered() {
    const q = ($('agCatSearch').value || '').trim().toLowerCase(), g = $('agCatGroup').value;
    const only = $('agCatOnlySel').checked, chosen = multiChosen();
    const cur = $('agCrop').value;
    return cropdb.list().filter(c => {
      if (g && c.g !== g) return false;
      if (only && !(chosen.has(c.id) || c.id === cur)) return false;
      if (q && !(c.es.toLowerCase().includes(q) || c.en.toLowerCase().includes(q) || c.id.toLowerCase().includes(q))) return false;
      return true;
    });
  }
  function renderCatTable() {
    const box = $('agCatTable'), rows = catFiltered(), chosen = multiChosen(), cur = $('agCrop').value;
    const head = `<tr><th></th><th>${L2('Cultivo (es)', 'Crop (es)')}</th><th>${L2('Cultivo (en)', 'Crop (en)')}</th><th>${L2('Grupo', 'Group')}</th>`
      + cropdb.FIELDS.map(f => `<th title="${esc(T(f.l.es, f.l.en))}">${L2(f.l.es, f.l.en)}${f.u ? ' <span class="hint" style="margin:0">(' + esc(f.u) + ')</span>' : ''}</th>`).join('')
      + `<th>${L2('Nota', 'Note')}</th></tr>`;
    const body = rows.map(c => `<tr data-id="${esc(c.id)}"${chosen.has(c.id) || c.id === cur ? ' class="sel"' : ''}>`
      + `<td><button class="ag-rm" data-rm="${esc(c.id)}" title="${esc(T('Quitar del catálogo', 'Remove from the catalogue'))}" aria-label="${esc(T('Quitar', 'Remove'))}">✕</button></td>`
      + `<td><input type="text" class="ag-t" data-f="es" value="${esc(c.es)}"></td>`
      + `<td><input type="text" class="ag-t" data-f="en" value="${esc(c.en)}"></td>`
      + `<td>${cropdb.GROUPS[c.g] ? esc(cropdb.groupLabel(c.g)) : esc(c.g)}</td>`
      + cropdb.FIELDS.map(f => `<td><input type="number" class="ag-n" data-f="${f.k}" value="${c[f.k] == null ? '' : c[f.k]}" step="${f.step}" min="${f.min}" max="${f.max}"${f.opt ? ` placeholder="—"` : ''}></td>`).join('')
      + `<td class="ag-note">${c.n ? labHTML(c.n) : ''}</td></tr>`).join('');
    box.innerHTML = `<table class="ag-cat"><thead>${head}</thead><tbody>${body}</tbody></table>`
      + (rows.length ? '' : `<p class="hint" style="padding:10px">${L2('Ningún cultivo coincide con el filtro.', 'No crop matches the filter.')}</p>`);
    box.querySelectorAll('.ag-n').forEach(inp => inp.addEventListener('change', () => {
      const c = cropdb.byId(inp.closest('tr').dataset.id); if (!c) return;
      const f = cropdb.FIELDS.find(x => x.k === inp.dataset.f);
      const raw = inp.value.trim();
      if (raw === '' && f.opt) c[f.k] = null;
      else { const v = +raw; if (!isFinite(v)) { inp.value = c[f.k] == null ? '' : c[f.k]; return; } c[f.k] = Math.max(f.min, Math.min(f.max, v)); }
      cropdb.fix(c); cropdb.save();
      renderCatTable(); catStale();
    }));
    box.querySelectorAll('.ag-t').forEach(inp => inp.addEventListener('change', () => {
      const c = cropdb.byId(inp.closest('tr').dataset.id); if (!c) return;
      c[inp.dataset.f] = inp.value.trim() || c.id;
      cropdb.save(); fillCropSelect(); fillMultiList(); renderCatTable();
    }));
    box.querySelectorAll('.ag-rm').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.rm, list = cropdb.list().filter(c => c.id !== id);
      if (!list.length) return;
      cropdb.setAll(list);
      if (A.crop && A.crop.crop.id === id) A.crop = null;
      fillCropSelect(); fillMultiList(); renderCatTable(); catStale();
    }));
  }
  function catStale() {
    if (A.crop || A.multi) showMessage('agCatMessages', 'warning', L2('Cambiaste los parámetros: vuelve a calcular la aptitud (apartado 5) y la comparación (apartado 7).',
      'You changed the parameters: compute the suitability (section 5) and the comparison (section 7) again.'));
    renderMethods();
  }
  ['agCatSearch', 'agCatGroup'].forEach(id => $(id).addEventListener('input', renderCatTable));
  $('agCatGroup').addEventListener('change', renderCatTable);
  $('agCatOnlySel').addEventListener('change', renderCatTable);
  $('agCatAdd').addEventListener('click', () => {
    let id = 'crop_' + (cropdb.list().length + 1);
    while (cropdb.byId(id)) id += 'x';
    cropdb.setAll(cropdb.list().concat([cropdb.blank(id)]));
    $('agCatSearch').value = ''; $('agCatGroup').value = ''; $('agCatOnlySel').checked = false;
    fillCropSelect(); fillMultiList(); renderCatTable();
    showMessage('agCatMessages', 'info', L2('Cultivo nuevo añadido al final: cámbiale el nombre y los parámetros.', 'A new crop was added at the end: change its name and parameters.'));
  });
  $('agCatReset').addEventListener('click', () => {
    cropdb.reset();
    fillCropSelect(); fillMultiList(); renderCatTable(); catStale();
    showMessage('agCatMessages', 'success', L2('Catálogo restablecido a los valores de referencia.', 'Catalogue reset to the reference values.'));
  });
  $('agCatExport').addEventListener('click', () => downloadBlob(cropdb.toJSON(), 'crop_parameters_biomodellingpro.json', 'application/json;charset=utf-8'));
  $('agCatImportBtn').addEventListener('click', () => $('agCatImport').click());
  $('agCatImport').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    clearMessages('agCatMessages');
    try {
      const n = cropdb.fromJSON(await f.text());
      fillCropSelect(); fillMultiList(); renderCatTable(); catStale();
      showMessage('agCatMessages', 'success', L2(`${n} cultivos cargados del archivo.`, `${n} crops loaded from the file.`));
    } catch (e2) { showMessage('agCatMessages', 'error', L2('El archivo no tiene el formato esperado: ', 'The file does not have the expected format: ') + esc(e2.message)); }
  });
  const catCols = () => [{ key: 'id', label: 'id' }, { key: 'es', label: bi('Cultivo (es)', 'Crop (es)') }, { key: 'en', label: bi('Cultivo (en)', 'Crop (en)') },
    { key: 'g', label: bi('Grupo', 'Group'), get: c => cropdb.GROUPS[c.g] ? bi(cropdb.GROUPS[c.g].es, cropdb.GROUPS[c.g].en) : c.g },
    ...cropdb.FIELDS.map(f => ({ key: f.k, label: () => T(f.l.es, f.l.en) + (f.u ? ' (' + f.u + ')' : ''), get: c => c[f.k] == null ? '' : c[f.k] }))];
  $('agCatCsv').addEventListener('click', () => downloadBlob(toCSV(catCols(), cropdb.list()), fileTag('crop_parameters') + '.csv', 'text/csv;charset=utf-8'));

  /* ---------------------------------------------------------------- multi-crop comparison */
  const STAPLES = ['maize', 'bean', 'wheat', 'sorghum', 'potato', 'coffee', 'avocado', 'agave', 'chilli', 'alfalfa'];
  function fillMultiList() {
    const box = $('agMultiList'), prev = multiChosen();
    const def = prev.size ? prev : new Set(STAPLES);
    box.innerHTML = '';
    Object.keys(cropdb.GROUPS).concat(['__other']).forEach(g => {
      const items = cropdb.list().filter(c => g === '__other' ? !cropdb.GROUPS[c.g] : c.g === g);
      if (!items.length) return;
      items.sort((a, b) => cropdb.name(a).localeCompare(cropdb.name(b))).forEach(c => {
        const l = document.createElement('label'); l.className = 'checkbox-label';
        l.innerHTML = `<input type="checkbox" value="${esc(c.id)}"${def.has(c.id) ? ' checked' : ''}> ${esc(cropdb.name(c))}`;
        box.appendChild(l);
      });
    });
    box.querySelectorAll('input').forEach(i => i.addEventListener('change', renderCatTable));
  }
  $('agMultiNone').addEventListener('click', () => { $('agMultiList').querySelectorAll('input').forEach(i => { i.checked = false; }); renderCatTable(); });
  $('agMultiBasic').addEventListener('click', () => { $('agMultiList').querySelectorAll('input').forEach(i => { i.checked = STAPLES.includes(i.value); }); renderCatTable(); });

  $('agMultiBtn').addEventListener('click', async () => {
    if (!A.idx) return;
    clearMessages('agMultiMessages');
    const ids = [...multiChosen()];
    if (ids.length < 2) { showMessage('agMultiMessages', 'error', L2('Elige al menos 2 cultivos.', 'Choose at least 2 crops.')); return; }
    if (ids.length > 30) { showMessage('agMultiMessages', 'warning', L2('Se compararán los primeros 30 cultivos elegidos.', 'The first 30 chosen crops will be compared.')); }
    const use = ids.slice(0, 30);
    $('agMultiProgress').style.display = 'flex';
    const cyc = $('agCycle').value, uc = $('agApplyChill').checked, ue = $('agApplyElev').checked;
    try {
      const res = [];
      for (let k = 0; k < use.length; k++) {
        const c = cropdb.byId(use[k]);
        if (!c) continue;
        setBar('agMultiFill', 'agMultiLabel', k / use.length, T(`${cropdb.name(c)} (${k + 1}/${use.length})`, `${cropdb.name(c)} (${k + 1}/${use.length})`));
        await tick(0);
        res.push(computeCrop(A.mon, A.idx, c, cyc, uc, ue));
      }
      setBar('agMultiFill', 'agMultiLabel', 1, '');
      A.multi = res;
      /* best crop per cell among the chosen ones */
      const arr = new Float32Array(A.ncell).fill(NaN);
      for (let i = 0; i < A.ncell; i++) {
        let bv = -1, bk = 0;
        for (let k = 0; k < res.length; k++) { const v = res[k].suit[i]; if (nz(v) && v > bv) { bv = v; bk = k + 1; } }
        if (bv >= 0) arr[i] = bv >= 0.5 ? bk : 0;
      }
      A.best = { arr, ids: res.map(r => r.crop.id) };
      const rows = res.map(r => {
        const ca = classAreas(r.fcls, 4), la = classAreas(r.limit, 9);
        const sa = ca.area[1] + ca.area[2];
        let s = 0, n = 0;
        for (let i = 0; i < A.ncell; i++) if (nz(r.suit[i])) { s += r.suit[i]; n++; }
        const marea = new Float64Array(13);
        for (let row = 0; row < A.meta.nrow; row++) for (let c = 0; c < A.meta.ncol; c++) {
          const i = row * A.meta.ncol + c;
          if (nz(r.month[i]) && nz(r.suit[i]) && r.suit[i] >= 0.5) marea[Math.round(r.month[i])] += A.rowArea[row];
        }
        const order = Array.from({ length: 12 }, (_, m) => m + 1).filter(m => marea[m] > 0).sort((a, b) => marea[b] - marea[a]).slice(0, 2);
        let bl = 1; for (let k = 2; k <= 9; k++) if (la.area[k] > la.area[bl]) bl = k;
        return { id: r.crop.id, crop: r.crop, area: sa, pct: ca.tot > 0 ? sa / ca.tot * 100 : NaN, mean: n ? s / n : NaN,
          months: r.perennial ? null : order, limit: bl, veryApt: ca.area[1], L: r.L, perennial: r.perennial };
      }).sort((a, b) => b.area - a.area);
      A.multiRows = rows;
      buildTable('agMultiTable', multiCols(), rows);
      drawRank();
      $('agDlMultiCsv').style.display = '';
      showMessage('agMultiMessages', 'success', L2(`${rows.length} cultivos comparados. El mapa «mejor cultivo por celda» ya está disponible en el apartado 5.`,
        `${rows.length} crops compared. The “best crop per cell” map is now available in section 5.`));
      renderMethods();
      if (A.fut.length) { A.fut.forEach(f => { rows.forEach(r => { if (!f.crops[r.id]) f.crops[r.id] = computeCrop(f.mon, f.idx, r.crop, cyc, uc, ue); }); }); renderFutureTables(); }
    } catch (e) { console.error(e); showMessage('agMultiMessages', 'error', L2('Error en la comparación: ', 'Comparison error: ') + eHTML(e)); }
    finally { setTimeout(() => { $('agMultiProgress').style.display = 'none'; }, 500); }
  });
  const monthList = ms => ms == null ? bi('perenne', 'perennial') : ms.length ? bi(ms.map(m => MONL[m - 1].es).join(' / '), ms.map(m => MONL[m - 1].en).join(' / ')) : '—';
  const multiCols = () => [
    { key: 'crop', label: bi('Cultivo', 'Crop'), get: r => bi(r.crop.es, r.crop.en) },
    { key: 'area', label: bi('Superficie apta (km²)', 'Suitable area (km²)'), get: r => fmtInt(r.area) },
    { key: 'pct', label: bi('% de la región', '% of the region'), get: r => fmt(r.pct, 1) },
    { key: 'veryApt', label: bi('Muy apta (km²)', 'Very suitable (km²)'), get: r => fmtInt(r.veryApt) },
    { key: 'mean', label: bi('Aptitud media', 'Mean suitability'), get: r => fmt(r.mean, 3) },
    { key: 'months', label: bi('Mejores meses de siembra', 'Best planting months'), get: r => monthList(r.months) },
    { key: 'limit', label: bi('Limitante principal', 'Main constraint'), get: r => bi(LIMIT[r.limit].l.es, LIMIT[r.limit].l.en) },
    { key: 'L', label: bi('Ciclo (d)', 'Cycle (d)'), get: r => fmtInt(r.L) }];
  $('agDlMultiCsv').addEventListener('click', () => { if (A.multiRows) downloadBlob(toCSV(multiCols(), A.multiRows), fileTag('crop_comparison') + '.csv', 'text/csv;charset=utf-8'); });

  function drawRank() {
    Views.reg('agMultiFig', () => {
      const box = $('agMultiFig');
      if (!A.multiRows || !A.multiRows.length) { box.innerHTML = ''; return; }
      const rows = A.multiRows, p = pal(), rh = 20, m = { l: 150, r: 74, t: 26, b: 26 };
      const W = 700, H = m.t + rows.length * rh + m.b;
      const mx = Math.max(...rows.map(r => r.area)) || 1;
      let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="system-ui, Segoe UI, sans-serif"><rect width="${W}" height="${H}" fill="${p.bg}"/>`;
      s += `<text x="${m.l}" y="${m.t - 10}" font-size="11" fill="${p.muted}">${esc(T('Superficie apta (km²) — el color indica el factor limitante principal', 'Suitable area (km²) — the colour shows the main limiting factor'))}</text>`;
      rows.forEach((r, i) => {
        const y = m.t + i * rh, bw = Math.max(1, r.area / mx * (W - m.l - m.r));
        s += `<text x="${m.l - 6}" y="${y + rh / 2 + 3.5}" text-anchor="end" font-size="10.5" fill="${p.text}">${esc(cropdb.name(r.crop))}</text>`;
        s += `<rect x="${m.l}" y="${y + 3}" width="${bw.toFixed(1)}" height="${rh - 7}" fill="${LIMIT[r.limit].c}" rx="2"><title>${esc(cropdb.name(r.crop))}: ${esc(fmtInt(r.area))} km² · ${esc(T(LIMIT[r.limit].l.es, LIMIT[r.limit].l.en))}</title></rect>`;
        s += `<text x="${(m.l + bw + 5).toFixed(1)}" y="${y + rh / 2 + 3.5}" font-size="9.5" fill="${p.muted}">${esc(fmtInt(r.area))}</text>`;
      });
      box.innerHTML = s + '</svg>';
    });
  }

  /* ---------------------------------------------------------------- climatic analogues */
  $('agAnaBtn').addEventListener('click', async () => {
    clearMessages('agAnaMessages');
    const keys = checkedOf('agAnaVars');
    if (keys.length < 2) { showMessage('agAnaMessages', 'error', L2('Elige al menos 2 índices.', 'Choose at least 2 indices.')); return; }
    const lat = +$('agAnaLat').value, lon = +$('agAnaLon').value;
    if (!nz(lat) || !nz(lon)) { showMessage('agAnaMessages', 'error', L2('Escribe las coordenadas del sitio de referencia o elígelo de la lista.', 'Type the coordinates of the reference site or choose it from the list.')); return; }
    const ref = cellOf(lat, lon);
    if (ref < 0) { showMessage('agAnaMessages', 'error', L2('El sitio de referencia queda fuera de la malla.', 'The reference site lies outside the grid.')); return; }
    showSpinner(T('Calculando similitud…', 'Computing the similarity…'));
    try {
      await tick(10);
      const M = zMatrix(keys, '');
      if (!M) throw err('No hay suficientes celdas con todos los índices elegidos.', 'There are not enough cells with all the chosen indices.');
      const qRef = M.idx.indexOf(ref);
      if (qRef < 0) throw err('El sitio de referencia no tiene todos los índices elegidos.', 'The reference site does not have all the chosen indices.');
      const gower = $('agAnaMetric').value === 'gower', p = M.p, d = new Float64Array(M.n);
      for (let q = 0; q < M.n; q++) {
        let s = 0;
        for (let j = 0; j < p; j++) {
          if (gower) { const rg = (M.hi[j] - M.lo[j]) || 1; s += Math.abs(M.arrs[j][M.idx[q]] - M.arrs[j][ref]) / rg; }
          else { const dd = M.X[q * p + j] - M.X[qRef * p + j]; s += dd * dd; }
        }
        d[q] = gower ? s / p : Math.sqrt(s);
      }
      const srt = Array.from(d).sort((a, b) => a - b);
      const sim = new Float32Array(A.ncell).fill(NaN);
      /* percentile scaling: similarity 1 at the reference, 0 at the most distant cell of the region */
      const rankOf = v => { let lo = 0, hi = srt.length - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (srt[mid] < v) lo = mid + 1; else hi = mid; } return lo; };
      for (let q = 0; q < M.n; q++) sim[M.idx[q]] = 1 - rankOf(d[q]) / Math.max(1, srt.length - 1);
      A.ana = { sim, keys, metric: gower ? 'gower' : 'euclid', ref, lat, lon, d, idx: M.idx };
      const topN = Math.max(5, Math.min(200, +$('agAnaTopN').value || 20));
      const ord = Array.from({ length: M.n }, (_, q) => q).sort((a, b) => d[a] - d[b]).slice(0, topN + 1);
      const rows = ord.filter(q => M.idx[q] !== ref).slice(0, topN).map(q => {
        const cell = M.idx[q], r = Math.floor(cell / A.meta.ncol), c = cell % A.meta.ncol;
        const o = { lat: A.meta.north - (r + 0.5) * A.meta.dy, lon: A.meta.west + (c + 0.5) * A.meta.dx, d: d[q], sim: sim[cell],
          km: haversineKm(lat, lon, A.meta.north - (r + 0.5) * A.meta.dy, A.meta.west + (c + 0.5) * A.meta.dx) };
        keys.forEach(k => { const a = idxArray(k, ''); o[k] = a ? a[cell] : NaN; });
        return o;
      });
      A.anaRows = rows;
      buildTable('agAnaTable', anaCols(), rows);
      $('agDlAnaCsv').style.display = '';
      fillIdxVar(); $('agIdxVar').value = 'ana'; drawIdxMap(); drawHist();
      showMessage('agAnaMessages', 'success', L2(`Similitud calculada sobre ${keys.length} índices y ${fmtInt(M.n)} celdas; el mapa del apartado 3 la muestra. La celda más parecida está a ${fmtInt(rows.length ? rows[0].km : 0)} km.`,
        `Similarity computed over ${keys.length} indices and ${fmtInt(M.n)} cells; the map of section 3 shows it. The most similar cell is ${fmtInt(rows.length ? rows[0].km : 0)} km away.`));
      renderMethods();
    } catch (e) { console.error(e); showMessage('agAnaMessages', 'error', L2('Error al calcular los análogos: ', 'Error computing the analogues: ') + eHTML(e)); }
    finally { hideSpinner(); }
  });
  const anaCols = () => [
    { key: 'lat', label: 'Lat', get: r => r.lat.toFixed(4) }, { key: 'lon', label: 'Lon', get: r => r.lon.toFixed(4) },
    { key: 'sim', label: bi('Similitud (0–1)', 'Similarity (0–1)'), get: r => fmt(r.sim, 3) },
    { key: 'd', label: bi('Distancia climática', 'Climatic distance'), get: r => fmt(r.d, 3) },
    { key: 'km', label: bi('Distancia (km)', 'Distance (km)'), get: r => fmtInt(r.km) },
    ...(A.ana ? A.ana.keys.map(k => ({ key: k, label: () => idxName(k), get: r => fmt(r[k], idxDec(k)) })) : [])];
  $('agDlAnaCsv').addEventListener('click', () => { if (A.anaRows) downloadBlob(toCSV(anaCols(), A.anaRows), fileTag('analogues') + '.csv', 'text/csv;charset=utf-8'); });

  /* ---------------------------------------------------------------- future agroclimate */
  /* Groups the chosen files into scenarios by model, ssp and period read from the file name. */
  async function groupFuture(fileList) {
    const groups = new Map();
    for (const f of [...fileList]) {
      const m = matchMonthly(f.name);
      if (!m || !(AG_NEED.includes(m.v) || m.v === 'tavg')) continue;
      const key = m.ssp ? `${m.model}|${m.ssp}|${m.period}` : '__plain';
      let g = groups.get(key);
      if (!g) { g = { key, model: m.model || null, ssp: m.ssp || null, period: m.period || null, vars: {} }; groups.set(key, g); }
      if (m.month) {
        g.vars[m.v] = g.vars[m.v] || { slots: new Array(12).fill(null) };
        g.vars[m.v].slots[m.month - 1] = { file: f, band: 0 };
      } else if (await bandCount(f) >= 12) g.vars[m.v] = { slots: Array.from({ length: 12 }, (_, i) => ({ file: f, band: i })) };
    }
    return [...groups.values()].filter(g => AG_NEED.every(v => g.vars[v] && g.vars[v].slots.every(s => s)));
  }
  const scnName = g => g.ssp ? `${g.model} ${g.ssp.toUpperCase()} ${g.period}` : T('Escenario futuro', 'Future scenario');

  $('agFutFiles').addEventListener('change', async e => {
    const st = $('agFutStatus');
    const gs = await groupFuture(e.target.files);
    st.className = 'pick-status' + (gs.length ? ' ok' : '');
    st.textContent = gs.length
      ? T(`${gs.length} escenario(s) completos: ${gs.map(scnName).join(' · ')}`, `${gs.length} complete scenario(s): ${gs.map(scnName).join(' · ')}`)
      : T('Ningún escenario completo: hacen falta los 12 meses de mínima, máxima y precipitación.', 'No complete scenario: the 12 months of minimum, maximum temperature and precipitation are needed.');
  });

  $('agFutBtn').addEventListener('click', async () => {
    if (!A.idx) { showMessage('agFutMessages', 'error', L2('Calcula primero los índices del presente.', 'Compute the present indices first.')); return; }
    clearMessages('agFutMessages');
    const gs = await groupFuture($('agFutFiles').files);
    if (!gs.length) { showMessage('agFutMessages', 'error', L2('Selecciona los archivos mensuales del escenario (mínima, máxima y precipitación de los 12 meses).', 'Select the monthly files of the scenario (minimum, maximum temperature and precipitation for the 12 months).')); return; }
    $('agFutProgress').style.display = 'flex'; $('agFutBtn').disabled = true;
    try {
      for (let gi = 0; gi < gs.length; gi++) {
        const g = gs[gi];
        let name = scnName(g), k = 2;
        while (A.fut.some(f => f.name === name)) name = scnName(g) + ' (' + k++ + ')';
        const vars = AG_NEED.concat(g.vars.tavg ? ['tavg'] : []);
        const sources = [];
        vars.forEach(v => g.vars[v].slots.forEach(s => sources.push(s)));
        const r = await readStack(sources, null, 0,
          (i, n) => setBar('agFutFill', 'agFutLabel', (gi + i / n) / gs.length, T(`${name}: capa ${i + 1}/${n}`, `${name}: layer ${i + 1}/${n}`)), A.meta);
        const nc = A.ncell, mon = {};
        vars.forEach((v, j) => { mon[v] = r.stack.subarray(j * 12 * nc, (j + 1) * 12 * nc); });
        setBar('agFutFill', 'agFutLabel', (gi + 0.8) / gs.length, T(`${name}: índices…`, `${name}: indices…`));
        const idx = await computeIndices(mon, A.meta, A.opts, null);
        /* how much of the scenario falls outside the range the present indices were built on */
        let out = 0, tot = 0;
        const lim = {};
        ['tmean', 'prec'].forEach(k2 => { const s = statsOf(A.idx[k2]); lim[k2] = s; });
        for (let i = 0; i < nc; i++) {
          if (!nz(idx.tmean[i])) continue;
          tot++;
          if ((lim.tmean && (idx.tmean[i] < lim.tmean.min || idx.tmean[i] > lim.tmean.max)) ||
              (lim.prec && (idx.prec[i] < lim.prec.min || idx.prec[i] > lim.prec.max))) out++;
        }
        const f = { name, model: g.model, ssp: g.ssp, period: g.period, mon, idx, crops: {}, outPct: tot ? out / tot * 100 : 0 };
        const cyc = $('agCycle').value, uc = $('agApplyChill').checked, ue = $('agApplyElev').checked;
        if (A.crop) f.crops[A.crop.crop.id] = computeCrop(mon, idx, A.crop.crop, A.crop.cycMode, A.crop.useChill, A.crop.useElev);
        if (A.multi) A.multi.forEach(r2 => { if (!f.crops[r2.crop.id]) f.crops[r2.crop.id] = computeCrop(mon, idx, r2.crop, cyc, uc, ue); });
        A.fut.push(f);
        showMessage('agFutMessages', f.outPct > 5 ? 'warning' : 'success',
          L2(`Escenario «${esc(name)}» añadido. ${fmt(f.outPct, 1)} % de las celdas quedan fuera del rango de temperatura media o precipitación del presente${f.outPct > 5 ? ': en esas celdas los índices y la aptitud son una extrapolación.' : '.'}`,
            `Scenario “${esc(name)}” added. ${fmt(f.outPct, 1)} % of the cells fall outside the present range of mean temperature or precipitation${f.outPct > 5 ? ': in those cells the indices and the suitability are an extrapolation.' : '.'}`));
      }
      fillScnSelects();
      renderFutureTables();
      renderMethods();
    } catch (e) { console.error(e); showMessage('agFutMessages', 'error', L2('Error al leer el escenario: ', 'Error reading the scenario: ') + eHTML(e)); }
    finally { $('agFutBtn').disabled = false; setTimeout(() => { $('agFutProgress').style.display = 'none'; }, 600); }
  });

  function renderFutureTables() {
    if (!A.fut.length) { $('agFutIdxTable').innerHTML = ''; $('agFutCropTable').innerHTML = ''; return; }
    /* change per index */
    const keys = A.order.filter(k => !idxMeta(k).cat);
    const rows = keys.map(k => {
      const o = { key: k, now: areaMean(A.idx[k], A.meta, A.rowArea) };
      A.fut.forEach(f => { o['f_' + f.name] = f.idx[k] ? areaMean(f.idx[k], A.meta, A.rowArea) : NaN; });
      return o;
    });
    const cols = [{ key: 'key', label: bi('Índice', 'Index'), get: r => idxName(r.key) + (idxUnit(r.key) ? ' (' + idxUnit(r.key) + ')' : '') },
      { key: 'now', label: bi('Presente', 'Present'), get: r => fmt(r.now, idxDec(r.key)) }];
    A.fut.forEach(f => {
      cols.push({ key: 'f_' + f.name, label: f.name, get: r => fmt(r['f_' + f.name], idxDec(r.key)) });
      cols.push({ key: 'd_' + f.name, label: () => T('Δ ', 'Δ ') + f.name, get: r => { const d = r['f_' + f.name] - r.now; return nz(d) ? (d > 0 ? '+' : '') + fmt(d, idxDec(r.key)) : '—'; } });
    });
    A.futIdxCols = cols; A.futIdxRows = rows;
    buildTable('agFutIdxTable', cols, rows);

    /* change per crop and scenario */
    const list = A.multi ? A.multi.map(r => r.crop) : (A.crop ? [A.crop.crop] : []);
    const pres = {};
    if (A.multi) A.multi.forEach(r => { pres[r.crop.id] = r; });
    if (A.crop) pres[A.crop.crop.id] = A.crop;
    const crows = [];
    list.forEach(crop => {
      const now = pres[crop.id];
      if (!now) return;
      A.fut.forEach(f => {
        const fu = f.crops[crop.id];
        if (!fu) return;
        let stable = 0, gain = 0, loss = 0, fresh = 0, nowA = 0, futA = 0, ds = 0, dn = 0;
        for (let r = 0; r < A.meta.nrow; r++) for (let c = 0; c < A.meta.ncol; c++) {
          const i = r * A.meta.ncol + c, a = now.suit[i], b = fu.suit[i];
          if (!nz(a) || !nz(b)) continue;
          const ar = A.rowArea[r], A0 = a >= 0.5, B0 = b >= 0.5;
          if (A0) nowA += ar;
          if (B0) futA += ar;
          if (A0 && B0) stable += ar;
          else if (A0 && !B0) loss += ar;
          else if (!A0 && B0) { gain += ar; if (a < 0.2) fresh += ar; }
          if (!now.perennial && nz(now.month[i]) && nz(fu.month[i]) && A0 && B0) {
            let d = fu.month[i] - now.month[i];
            while (d > 6) d -= 12;
            while (d < -6) d += 12;
            ds += d; dn++;
          }
        }
        let agree = null;
        if (A.fut.length > 1) {
          let ok = 0, n = 0;
          for (let i = 0; i < A.ncell; i++) {
            if (!nz(now.suit[i]) || now.suit[i] < 0.5) continue;
            n++;
            let c2 = 0;
            A.fut.forEach(g => { const rr = g.crops[crop.id]; if (rr && nz(rr.suit[i]) && rr.suit[i] >= 0.5) c2++; });
            if (c2 === A.fut.length) ok++;
          }
          agree = n ? ok / n * 100 : NaN;
        }
        const net = nowA > 0 ? (futA - nowA) / nowA * 100 : NaN;
        const verdict = nowA < 1 && futA >= 1 ? 5 : nowA >= 1 && futA < 1 ? 4 : !nz(net) ? 0 : net > 5 ? 1 : net < -5 ? 2 : 3;
        crows.push({ crop, scn: f.name, nowA, futA, stable, gain, loss, fresh, net, shift: dn ? ds / dn : NaN, agree, verdict });
      });
    });
    A.futCropRows = crows;
    buildTable('agFutCropTable', futCropCols(), crows);
    $('agDlFutCsv').style.display = crows.length ? '' : 'none';
  }
  const VERDICT = [bi('—', '—'), bi('gana superficie', 'gains area'), bi('pierde superficie', 'loses area'), bi('estable', 'stable'),
    bi('deja de ser viable', 'stops being viable'), bi('se vuelve viable', 'becomes viable')];
  const futCropCols = () => [
    { key: 'crop', label: bi('Cultivo', 'Crop'), get: r => bi(r.crop.es, r.crop.en) },
    { key: 'scn', label: bi('Escenario', 'Scenario') },
    { key: 'nowA', label: bi('Apta hoy (km²)', 'Suitable now (km²)'), get: r => fmtInt(r.nowA) },
    { key: 'futA', label: bi('Apta a futuro (km²)', 'Suitable in the future (km²)'), get: r => fmtInt(r.futA) },
    { key: 'net', label: bi('Cambio neto', 'Net change'), get: r => nz(r.net) ? (r.net > 0 ? '+' : '') + fmt(r.net, 1) + ' %' : '—' },
    { key: 'stable', label: bi('Estable (km²)', 'Stable (km²)'), get: r => fmtInt(r.stable) },
    { key: 'gain', label: bi('Ganancia (km²)', 'Gain (km²)'), get: r => fmtInt(r.gain) },
    { key: 'fresh', label: bi('Nueva (km²)', 'Newly suitable (km²)'), get: r => fmtInt(r.fresh) },
    { key: 'loss', label: bi('Pérdida (km²)', 'Loss (km²)'), get: r => fmtInt(r.loss) },
    { key: 'shift', label: bi('Cambio del mes de siembra', 'Planting-month shift'), get: r => !nz(r.shift) ? '—' : (r.shift > 0 ? '+' : '') + fmt(r.shift, 1) },
    { key: 'agree', label: bi('Acuerdo entre escenarios (%)', 'Agreement between scenarios (%)'), get: r => nz(r.agree) ? fmt(r.agree, 1) : '—' },
    { key: 'verdict', label: bi('Veredicto', 'Verdict'), get: r => VERDICT[r.verdict] }];
  $('agDlFutCsv').addEventListener('click', () => { if (A.futCropRows) downloadBlob(toCSV(futCropCols(), A.futCropRows), fileTag('future_crop_change') + '.csv', 'text/csv;charset=utf-8'); });

  /* ---------------------------------------------------------------- methods paragraph */
  const REFS = [
    'Allen, R. G., Pereira, L. S., Raes, D. & Smith, M. (1998). Crop evapotranspiration: guidelines for computing crop water requirements. FAO Irrigation and Drainage Paper 56. FAO, Rome.',
    'Baskerville, G. L. & Emin, P. (1969). Rapid estimation of heat accumulation from maximum and minimum temperatures. Ecology 50(3), 514–517.',
    'FAO (1978). Report on the agro-ecological zones project. Vol. 1: Methodology and results for Africa. World Soil Resources Report 48. FAO, Rome.',
    'FAO (1996). Agro-ecological zoning: guidelines. FAO Soils Bulletin 73. FAO, Rome.',
    'Fick, S. E. & Hijmans, R. J. (2017). WorldClim 2: new 1-km spatial resolution climate surfaces for global land areas. International Journal of Climatology 37(12), 4302–4315.',
    'Hargreaves, G. H. & Samani, Z. A. (1985). Reference crop evapotranspiration from temperature. Applied Engineering in Agriculture 1(2), 96–99.',
    'Ramirez-Villegas, J., Jarvis, A. & Läderach, P. (2013). Empirical approaches for assessing impacts of climate change on agriculture: the EcoCrop model and a case study with grain sorghum. Agricultural and Forest Meteorology 170, 67–78.',
    'Richardson, E. A., Seeley, S. D. & Walker, D. R. (1974). A model for estimating the completion of rest for Redhaven and Elberta peach trees. HortScience 9(4), 331–332.',
    'Thornthwaite, C. W. (1948). An approach toward a rational classification of climate. Geographical Review 38(1), 55–94.',
    'UNEP (1992). World atlas of desertification. Edward Arnold, London.',
  ];
  function renderMethods() {
    const box = $('agMethods');
    if (!A.opts || !A.meta) { box.innerHTML = ''; return; }
    const o = A.opts, m = A.meta, es = I18N.lang !== 'en';
    const petName = o.pet === 'tw' ? 'Thornthwaite (1948)' : 'Hargreaves y Samani (1985)';
    const petNameEn = o.pet === 'tw' ? 'Thornthwaite (1948)' : 'Hargreaves and Samani (1985)';
    const chillW =o.chillWin >= 12 ? (es ? 'todo el año' : 'the whole year') : (es ? `los ${o.chillWin} meses consecutivos más fríos` : `the ${o.chillWin} coldest consecutive months`);
    const p = [];
    p.push(es
      ? `Los índices agroclimáticos se calcularon sobre una malla de ${m.ncol} × ${m.nrow} celdas de ${fmt(m.dx * 111.32, 1)} km de lado (agregación de bloques de ${m.f}×${m.f} píxeles) a partir de ${A.approx ? `un ciclo mensual reconstruido de las capas bioclimáticas de WorldClim 2.1 (Fick y Hijmans, 2017) — BIO1, BIO2, BIO5, BIO6, BIO10, BIO11, BIO12, BIO15, BIO18 y BIO19 —, que reproduce BIO1, BIO5, BIO6 y BIO12 exactamente y supone el máximo térmico en julio en el hemisferio norte y en enero en el sur` : `capas mensuales de temperatura mínima, temperatura máxima y precipitación de WorldClim 2.1 (Fick y Hijmans, 2017)${A.res ? `, resolución ${A.res}` : ''}`}. Dentro de cada mes los días se modelaron con la curva sinusoidal diurna de Baskerville y Emin (1969), repetida el número real de días del mes; los conteos por umbral (días con helada y días de calor) se obtuvieron suponiendo que los valores diarios se distribuyen normalmente alrededor de la media mensual con una desviación estándar de ${fmt(o.sig, 1)} °C.`
      : `The agroclimatic indices were computed on a grid of ${m.ncol} × ${m.nrow} cells of ${fmt(m.dx * 111.32, 1)} km (aggregation of ${m.f}×${m.f} pixel blocks) from ${A.approx ? `a monthly cycle reconstructed from the WorldClim 2.1 bioclimatic layers (Fick and Hijmans, 2017) — BIO1, BIO2, BIO5, BIO6, BIO10, BIO11, BIO12, BIO15, BIO18 and BIO19 — which reproduces BIO1, BIO5, BIO6 and BIO12 exactly and assumes the thermal maximum in July in the northern hemisphere and in January in the southern one` : `monthly minimum temperature, maximum temperature and precipitation layers of WorldClim 2.1 (Fick and Hijmans, 2017)${A.res ? `, resolution ${A.res}` : ''}`}. Within each month the days were modelled with the diurnal sine curve of Baskerville and Emin (1969), repeated for the real number of days of the month; threshold counts (frost days and heat days) were obtained assuming that the daily values are normally distributed around the monthly mean with a standard deviation of ${fmt(o.sig, 1)} °C.`);
    p.push(es
      ? `Se acumularon grados-día con base ${fmt(o.base, 1)} °C y tope superior ${fmt(o.cap, 1)} °C (corte horizontal). Las heladas se definieron con un umbral de ${fmt(o.frost, 1)} °C. La acumulación de frío se integró con la misma curva diurna por debajo de ${fmt(o.chillThr, 1)} °C sobre ${chillW}${o.utah ? ', y además se calcularon unidades frío tipo Utah (Richardson et al., 1974) muestreando la curva cada hora' : ''}. El estrés por calor se contó como días con temperatura máxima por encima de ${fmt(o.heat1, 0)} y ${fmt(o.heat2, 0)} °C.`
      : `Degree days were accumulated with a base of ${fmt(o.base, 1)} °C and an upper cap of ${fmt(o.cap, 1)} °C (horizontal cut-off). Frost was defined with a threshold of ${fmt(o.frost, 1)} °C. Chilling accumulation was integrated with the same diurnal curve below ${fmt(o.chillThr, 1)} °C over ${chillW}${o.utah ? ', and Utah-style chill units (Richardson et al., 1974) were also computed by sampling the curve hourly' : ''}. Heat stress was counted as days with a maximum temperature above ${fmt(o.heat1, 0)} and ${fmt(o.heat2, 0)} °C.`);
    p.push(es
      ? `La evapotranspiración de referencia se estimó con ${petName}${o.pet === 'hs' ? ', con la radiación extraterrestre calculada de la latitud y el día del año medio de cada mes según Allen et al. (1998)' : ', con el ajuste por duración del día y número de días del mes'}. El balance hídrico mensual usó un depósito de una capa con ${fmtInt(o.awc)} mm de agua aprovechable, equilibrado en tres ciclos anuales, del que se obtuvieron la evapotranspiración real, el déficit y el excedente. La longitud del periodo de crecimiento siguió la definición de zonas agroecológicas de la FAO (1978, 1996): los 12 meses se interpolaron a 36 decenas y se sumaron los días con P > 0.5·ETo más el periodo de humedad residual necesario para evapotranspirar ${fmtInt(o.lgpRes)} mm del perfil. El índice de aridez P/ETo se clasificó con los umbrales de la UNEP (1992).`
      : `Reference evapotranspiration was estimated with ${petNameEn}${o.pet === 'hs' ? ', with extraterrestrial radiation computed from latitude and the mid-month day of year following Allen et al. (1998)' : ', with the day-length and month-length adjustment'}. The monthly water balance used a one-layer bucket with ${fmtInt(o.awc)} mm of available water, equilibrated over three annual cycles, from which actual evapotranspiration, deficit and surplus were obtained. The length of the growing period followed the FAO agro-ecological-zones definition (1978, 1996): the 12 months were interpolated to 36 ten-day periods and the days with P > 0.5·PET were added to the residual-moisture period needed to evapotranspire ${fmtInt(o.lgpRes)} mm from the profile. The aridity index P/PET was classified with the UNEP (1992) thresholds.`);
    if (A.crop || A.multi) {
      const list = A.multi ? A.multi.map(r => cropdb.name(r.crop)) : [cropdb.name(A.crop.crop)];
      const cyc = (A.crop || A.multi[0]).cycMode;
      const cycTxt = cyc === 'min' ? (es ? 'la duración mínima' : 'the minimum length') : cyc === 'max' ? (es ? 'la duración máxima' : 'the maximum length') : (es ? 'el punto medio del rango' : 'the middle of the range');
      p.push(es
        ? `La aptitud de ${list.length} cultivo(s) (${list.join(', ')}) se evaluó con una envoltura mecanística tipo EcoCrop (Ramirez-Villegas et al., 2013): para cada celda y cada uno de los 12 meses posibles de siembra se calcularon la temperatura media y la precipitación acumulada de la ventana del ciclo (usando ${cycTxt} del ciclo), se aplicaron funciones trapezoidales de aptitud definidas por los límites absolutos y óptimos de cada cultivo y se combinaron como el mínimo de la puntuación térmica y la hídrica, multiplicado por una máscara de helada y calor letales${(A.crop && A.crop.useChill) ? ' y por un factor de cumplimiento del requerimiento de frío en los perennes de clima templado' : ''}. Se conservó el mejor mes de siembra y se clasificó la aptitud en muy apta (≥ 0.8), apta (0.5–0.8), marginal (0.2–0.5) y no apta (< 0.2), registrando además el factor limitante de cada celda. Los parámetros de los cultivos son rangos de referencia indicativos, revisados y ajustados por el usuario, y se exportaron junto con los resultados.`
        : `The suitability of ${list.length} crop(s) (${list.join(', ')}) was evaluated with a mechanistic envelope of the EcoCrop type (Ramirez-Villegas et al., 2013): for every cell and each of the 12 possible planting months the mean temperature and the accumulated precipitation of the cycle window were computed (using ${cycTxt} of the cycle), trapezoidal suitability functions defined by each crop's absolute and optimal limits were applied and combined as the minimum of the temperature and the water score, multiplied by a killing-frost and lethal-heat mask${(A.crop && A.crop.useChill) ? ' and by a factor for the fulfilment of the chilling requirement in temperate perennials' : ''}. The best planting month was kept and the suitability was classified as very suitable (≥ 0.8), suitable (0.5–0.8), marginal (0.2–0.5) and not suitable (< 0.2), also recording the limiting factor of each cell. The crop parameters are indicative reference ranges, reviewed and adjusted by the user, and were exported together with the results.`);
    }
    if (A.zones) p.push(es
      ? `Las ${A.zones.k} zonas agroclimáticas se obtuvieron con k-medias (inicio tipo k-medias++ con semilla fija) sobre ${A.zones.keys.length} índices estandarizados (${A.zones.keys.map(k => idxName(k)).join(', ')}), y el número de grupos se orientó con la suma de cuadrados dentro de grupos y la silueta media.`
      : `The ${A.zones.k} agroclimatic zones were obtained with k-means (k-means++ start with a fixed seed) on ${A.zones.keys.length} standardised indices (${A.zones.keys.map(k => idxName(k)).join(', ')}), and the number of groups was guided by the within-cluster sum of squares and the mean silhouette.`);
    if (A.ana) p.push(es
      ? `Los análogos climáticos se mapearon como la distancia ${A.ana.metric === 'gower' ? 'de Gower (diferencias absolutas divididas por el rango)' : 'euclidiana sobre variables estandarizadas'} respecto al sitio de referencia (${fmt(A.ana.lat, 3)}, ${fmt(A.ana.lon, 3)}) sobre ${A.ana.keys.length} índices, reescalada a similitud por percentiles.`
      : `Climatic analogues were mapped as the ${A.ana.metric === 'gower' ? 'Gower distance (absolute differences divided by the range)' : 'Euclidean distance over standardised variables'} to the reference site (${fmt(A.ana.lat, 3)}, ${fmt(A.ana.lon, 3)}) over ${A.ana.keys.length} indices, rescaled to a similarity by percentiles.`);
    if (A.fut.length) p.push(es
      ? `Los mismos índices y la misma envoltura de aptitud se recalcularon sobre la misma malla para ${A.fut.length} escenario(s) futuro(s) (${A.fut.map(f => f.name).join('; ')}), y se compararon con el presente en superficie estable, ganada, perdida y nueva, en el cambio del mes de siembra y${A.fut.length > 1 ? ', entre escenarios, en la media y el acuerdo' : ''} en la fracción de celdas cuyo clima futuro queda fuera del rango del presente (${A.fut.map(f => fmt(f.outPct, 1) + ' %').join(', ')}), donde los resultados son una extrapolación.`
      : `The same indices and the same suitability envelope were recomputed on the same grid for ${A.fut.length} future scenario(s) (${A.fut.map(f => f.name).join('; ')}) and compared with the present in stable, gained, lost and newly suitable area, in the change of the planting month and${A.fut.length > 1 ? ', across scenarios, in the mean and the agreement, and' : ''} in the fraction of cells whose future climate falls outside the present range (${A.fut.map(f => fmt(f.outPct, 1) + ' %').join(', ')}), where the results are an extrapolation.`);
    p.push(es
      ? 'Todo el cálculo se hizo en el navegador, sin servidor, con aritmética de punto flotante de 32 y 64 bits.'
      : 'The whole computation was carried out in the browser, with no server, using 32- and 64-bit floating-point arithmetic.');
    box.innerHTML = p.map(t => `<p>${esc(t)}</p>`).join('');
    $('agRefs').innerHTML = REFS.map(r => `<li>${esc(r)}</li>`).join('');
  }
  const methodsText = () => [...$('agMethods').querySelectorAll('p')].map(n => n.textContent).join('\n\n')
    + '\n\n' + T('Referencias', 'References') + '\n' + REFS.join('\n');
  $('agCopyMethods').addEventListener('click', async () => {
    clearMessages('agReportMessages');
    const txt = methodsText();
    try {
      await navigator.clipboard.writeText(txt);
      showMessage('agReportMessages', 'success', L2('Texto copiado al portapapeles.', 'Text copied to the clipboard.'));
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand && document.execCommand('copy');
      document.body.removeChild(ta);
      showMessage('agReportMessages', ok ? 'success' : 'warning', ok
        ? L2('Texto copiado al portapapeles.', 'Text copied to the clipboard.')
        : L2('El navegador no permitió copiar; descarga el texto con el otro botón.', 'The browser did not allow copying; download the text with the other button.'));
    }
  });
  $('agDlMethods').addEventListener('click', () => downloadBlob(methodsText(), fileTag('methods') + '.txt', 'text/plain;charset=utf-8'));

  /* ---------------------------------------------------------------- language, theme and step entry */
  document.addEventListener('langchange', () => {
    extentUI();
    if (A.mode) renderFileReport(null, null);
    if (!A.idx) return;
    fillIdxVar(); fillScnSelects(); fillZoneVars(); fillAnaVars(); fillCropSelect(); fillMultiList();
    fillCatGroup(); fillCalPoint(); fillAnaPoint();
    renderAvailability(); renderIdxSummary(); renderCatTable(); renderMethods();
    if (A.zones) renderZoneTable();
    if (A.crop) renderCropResult();
    if (A.multiRows) buildTable('agMultiTable', multiCols(), A.multiRows);
    if (A.anaRows) buildTable('agAnaTable', anaCols(), A.anaRows);
    if (A.fut.length) renderFutureTables();
    renderPointsTable();
    if (A.idxStudio) drawIdxMap();
    if (A.cropStudio && A.crop) drawCropMap();
  });
  document.addEventListener('themechange', () => { if (A.idxStudio) restyleIdxPoints(); });

  function onShow() {
    extentUI();
    if (!A.mode) {
      const f = (state.env && state.env.files) || {};
      const nBio = BIO_WANT.filter(k => f[k]).length;
      clearMessages('agFileReport');
      if (nBio >= 3) showMessage('agFileReport', 'info', L2(
        `Hay ${nBio} capas bioclimáticas cargadas del paso 5: puedes derivar los índices con la vía C, o cargar las capas mensuales para tenerlos completos.`,
        `There are ${nBio} bioclimatic layers loaded from step 5: you can derive the indices with route C, or load the monthly layers to get them all.`));
      else showMessage('agFileReport', 'warning', L2(
        'Aún no hay capas. Carga las mensuales de WorldClim (vías A o B) o ve al paso 5 y carga las bioclimáticas para usar la vía C.',
        'There are no layers yet. Load the monthly WorldClim layers (routes A or B) or go to step 5 and load the bioclimatic ones to use route C.'));
    }
    if (A.idxMap) setTimeout(() => A.idxMap.invalidateSize(), 60);
    if (A.cropMap) setTimeout(() => A.cropMap.invalidateSize(), 60);
  }
  window.agroclimOnShow = onShow;

  /* The step also opens as soon as there are cleaned records: the monthly layers are loaded here and not in step 5,
     so waiting for the bioclimatic layers would leave routes A and B unreachable. */
  document.addEventListener('stepchange', () => { if (state.clean && state.clean.length) enableStep(10); });

  /* hooks used by the numerical checks */
  window.agroTest = { A, IDX, ddSine, ddCap, hoursBelow, utahDay, PHI, raRow, cellIndices, blankR, petMonths, windowMatrix,
    computeCrop, computeIndices, monthlyFromBioclim, matchMonthly, readStack, kmeans, zMatrix, cellOf, cellSeries,
    classAreas, suitableArea, areaMean, statsOf, MDAYS, MID_DOY, readOpts, longestRunDays, longestRunCount };
})();
