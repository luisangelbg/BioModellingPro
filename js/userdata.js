/* Step 1 (second way in): the user's own records.
   Reads CSV / TXT / TSV (any delimiter, UTF-8 or Windows-1252, decimal point or comma), Excel .xlsx
   (own reader: a .xlsx file is a zip of XML parts, unzipped with the browser's DecompressionStream) and text
   pasted from a spreadsheet. The columns species, longitude and latitude are found by name or by content and
   can be corrected by hand; optional columns (country, state, locality, year, month, elevation, uncertainty)
   are recognised automatically. The records enter the same pipeline as the GBIF ones (filters, cleaning…). */

(function () {
  const $ = id => document.getElementById(id);

  /* ---------- text and delimited files ---------- */
  function decodeText(buf) {
    const u8 = new Uint8Array(buf);
    if (u8[0] === 0xFF && u8[1] === 0xFE) return new TextDecoder('utf-16le').decode(u8).replace(/^﻿/, '');
    try { return new TextDecoder('utf-8', { fatal: true }).decode(u8).replace(/^﻿/, ''); }
    catch (e) { return new TextDecoder('windows-1252').decode(u8); }      // typical of "CSV" saved by a Spanish-locale spreadsheet
  }

  function detectDelimiter(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 25);
    let best = ',', bestScore = -1;
    for (const d of [',', ';', '\t', '|']) {
      const counts = lines.map(l => { let n = 0, q = false; for (const c of l) { if (c === '"') q = !q; else if (c === d && !q) n++; } return n; });
      const modal = counts.slice().sort((a, b) => counts.filter(v => v === b).length - counts.filter(v => v === a).length)[0] || 0;
      const score = modal > 0 ? counts.filter(v => v === modal).length * 100 + modal : 0;
      if (score > bestScore) { bestScore = score; best = d; }
    }
    return best;
  }

  function parseDelimited(text, delim) {
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"' && cur === '') q = true;
      else if (c === delim) { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (c !== '\r') cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }

  /* ---------- Excel .xlsx ---------- */
  async function readXlsx(buf) {
    if (typeof DecompressionStream === 'undefined')
      throw bilingualError('este navegador no puede abrir archivos .xlsx; guarda la hoja como CSV o actualiza el navegador',
        'this browser cannot open .xlsx files; save the sheet as CSV or update the browser');
    const u8 = new Uint8Array(buf), dv = new DataView(buf);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw bilingualError('no es un archivo .xlsx válido', 'not a valid .xlsx file');
    const n = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
    const entries = {}, dec = new TextDecoder();
    for (let i = 0; i < n; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      entries[dec.decode(u8.subarray(p + 46, p + 46 + nl))] = { method: dv.getUint16(p + 10, true), csize: dv.getUint32(p + 20, true), lho: dv.getUint32(p + 42, true) };
      p += 46 + nl + xl + cl;
    }
    async function part(name) {
      const e = entries[name]; if (!e) return null;
      const start = e.lho + 30 + dv.getUint16(e.lho + 26, true) + dv.getUint16(e.lho + 28, true), data = u8.subarray(start, start + e.csize);
      if (e.method === 0) return dec.decode(data);
      if (e.method !== 8) throw bilingualError('compresión no admitida en el .xlsx', 'unsupported compression in the .xlsx');
      return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    }
    const xml = s => new DOMParser().parseFromString(s, 'application/xml');
    const wb = await part('xl/workbook.xml');
    if (!wb) throw bilingualError('no es un archivo .xlsx válido (falta el libro)', 'not a valid .xlsx file (workbook missing)');
    const rels = xml((await part('xl/_rels/workbook.xml.rels')) || '<r/>'), relTarget = {};
    for (const r of rels.getElementsByTagName('Relationship')) {
      let t = r.getAttribute('Target') || ''; t = t.startsWith('/') ? t.slice(1) : 'xl/' + t; relTarget[r.getAttribute('Id')] = t.replace('xl/xl/', 'xl/');
    }
    const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const sheets = [...xml(wb).getElementsByTagName('sheet')].map((s, i) => ({
      name: s.getAttribute('name') || ('Sheet' + (i + 1)),
      path: relTarget[s.getAttributeNS(RNS, 'id') || s.getAttribute('r:id')] || ('xl/worksheets/sheet' + (i + 1) + '.xml'),
    }));
    let shared = [];
    const ss = await part('xl/sharedStrings.xml');
    if (ss) shared = [...xml(ss).getElementsByTagName('si')].map(si => [...si.getElementsByTagName('t')].map(t => t.textContent).join(''));
    const colIndex = ref => { let c = 0; for (const ch of ref.replace(/[^A-Z]/gi, '').toUpperCase()) c = c * 26 + ch.charCodeAt(0) - 64; return c - 1; };
    async function sheetRows(sheet) {
      const doc = xml((await part(sheet.path)) || '<worksheet/>'), rows = [];
      for (const r of doc.getElementsByTagName('row')) {
        const ri = (+r.getAttribute('r') || rows.length + 1) - 1, row = [];
        for (const c of r.getElementsByTagName('c')) {
          const ci = c.getAttribute('r') ? colIndex(c.getAttribute('r')) : row.length, t = c.getAttribute('t');
          const v = c.getElementsByTagName('v')[0];
          let val = '';
          if (t === 'inlineStr') val = [...c.getElementsByTagName('t')].map(x => x.textContent).join('');
          else if (v) val = t === 's' ? (shared[+v.textContent] ?? '') : v.textContent;
          row[ci] = val;
        }
        while (rows.length < ri) rows.push([]);
        rows[ri] = Array.from(row, x => x ?? '');
      }
      return rows;
    }
    return { sheets, sheetRows };
  }

  /* ---------- coordinates ---------- */
  function parseCoord(v, isLat) {
    if (typeof v === 'number') return isFinite(v) ? { v, dms: false } : null;
    let s = String(v == null ? '' : v).trim();
    if (!s) return null;
    s = s.replace(/[−–—]/g, '-').replace(/ /g, ' ');
    let sign = 1, m;
    if ((m = s.match(/^([NSEWO])\s*(.*)$/i)) && /\d/.test(m[2])) { if (/[SWO]/i.test(m[1])) sign = -1; s = m[2]; }
    else if ((m = s.match(/^(.*?\d)\s*([NSEWO])$/i))) { if (/[SWO]/i.test(m[2])) sign = -1; s = m[1]; }
    else if ((m = s.match(/^(.*?\d[^a-z]*?)\s*([NSEWO])\b/i)) && /[°'′"″]/.test(m[1])) { if (/[SWO]/i.test(m[2])) sign = -1; s = m[1]; }
    if ((m = s.match(/^(-?\d+(?:[.,]\d+)?)\s*[°º]\s*(?:(\d+(?:[.,]\d+)?)\s*['′’]\s*)?(?:(\d+(?:[.,]\d+)?)\s*(?:"|″|''|”)?\s*)?$/))) {
      const f = x => x == null ? 0 : parseFloat(x.replace(',', '.'));
      const deg = f(m[1]), out = Math.abs(deg) + f(m[2]) / 60 + f(m[3]) / 3600;
      return { v: (deg < 0 || Object.is(deg, -0) ? -1 : 1) * out * (deg < 0 ? 1 : sign), dms: true };
    }
    if ((m = s.match(/^(-?\d+)\s+(\d+(?:[.,]\d+)?)(?:\s+(\d+(?:[.,]\d+)?))?$/)) && parseFloat(m[2].replace(',', '.')) < 60) {    // "99 50 30" → degrees minutes seconds
      const deg = parseFloat(m[1]), out = Math.abs(deg) + parseFloat(m[2].replace(',', '.')) / 60 + (m[3] ? parseFloat(m[3].replace(',', '.')) / 3600 : 0);
      return { v: (m[1].startsWith('-') ? -1 : sign) * out, dms: true };
    }
    if (/\d\s+\d/.test(s)) return null;                          // any other space inside a number is not a coordinate
    s = s.replace(/\s/g, '');
    if (s.indexOf(',') >= 0 && s.indexOf('.') < 0) s = s.replace(',', '.');       // decimal comma (coordinates never need a thousands separator)
    if (!/^-?\d+(\.\d+)?([eE]-?\d+)?$/.test(s)) return null;
    let x = parseFloat(s);
    if (!isFinite(x)) return null;
    if (sign < 0 && x > 0) x = -x;
    return { v: x, dms: false };
  }
  const numOf = s => { const c = parseCoord(s); return c ? c.v : null; };

  /* ---------- names ---------- */
  const SP_MARK = { 'subsp.': 'SUBSPECIES', 'var.': 'VARIETY', 'f.': 'FORM' };
  function cleanName(raw) {
    let s = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
    if (!s) return null;
    s = s.replace(/\b(ssp|subsp)\.?\s/i, 'subsp. ').replace(/\bvar\.?\s/i, 'var. ');
    if (s === s.toUpperCase() || s === s.toLowerCase()) { const w = s.toLowerCase().split(' '); w[0] = w[0][0].toUpperCase() + w[0].slice(1); s = w.join(' '); }
    const t = s.split(' '), genus = t[0];
    if (t.length < 2 || /^(sp|spp|sp\.|spp\.|cf\.?|aff\.?)$/i.test(t[1]) || !/^[a-z-]/.test(t[1]))
      return { taxon: t.length < 2 ? genus : genus + ' sp.', species: '', genus, rank: 'GENUS', infra: '' };
    const species = genus + ' ' + t[1];
    for (let i = 2; i < t.length - 1; i++) if (SP_MARK[t[i]] && /^[a-z-]/.test(t[i + 1]))
      return { taxon: `${species} ${t[i]} ${t[i + 1]}`, species, genus, rank: SP_MARK[t[i]], infra: t[i + 1] };
    return { taxon: species, species, genus, rank: 'SPECIES', infra: '' };
  }

  /* ---------- column recognition ---------- */
  const norm = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  const NAMES = {
    species: ['especie', 'especies', 'species', 'scientificname', 'nombrecientifico', 'nombrecientificocompleto', 'nombre', 'name', 'taxon', 'taxa', 'binomio', 'binomial', 'sp', 'nombreespecie', 'speciesname', 'nombredelaespecie', 'especiecientifica', 'acceptedscientificname'],
    lon: ['longitud', 'longitude', 'lon', 'long', 'lng', 'decimallongitude', 'x', 'coordx', 'londec', 'longitudx', 'longituddecimal', 'longitudedecimal', 'este'],
    lat: ['latitud', 'latitude', 'lat', 'decimallatitude', 'y', 'coordy', 'latdec', 'latitudy', 'latituddecimal', 'latitudedecimal', 'norte'],
    genus: ['genero', 'genus'],
    country: ['pais', 'country', 'nacion'], countryCode: ['countrycode', 'codigopais', 'iso2', 'paiscodigo', 'codpais'],
    state: ['estado', 'state', 'stateprovince', 'provincia', 'departamento', 'region'],
    locality: ['localidad', 'locality', 'sitio', 'site', 'lugar', 'municipio'],
    year: ['anio', 'ano', 'year', 'yr', 'anno'], month: ['mes', 'month'],
    unc: ['incertidumbre', 'coordinateuncertaintyinmeters', 'uncertainty', 'incertidumbrem', 'incertidumbreenmetros', 'errorm'],
    elev: ['altitud', 'elevation', 'elevacion', 'alt', 'altura', 'msnm', 'altitudmsnm'],
  };
  const ROLE_TITLE = { country: ['País', 'Country'], countryCode: ['Código de país', 'Country code'], state: ['Estado', 'State'], locality: ['Localidad', 'Locality'],
    year: ['Año', 'Year'], month: ['Mes', 'Month'], unc: ['Incertidumbre (m)', 'Uncertainty (m)'], elev: ['Altitud', 'Elevation'] };
  const COUNTRY_ISO = { mexico: 'MX', 'united states': 'US', 'united states of america': 'US', usa: 'US', 'estados unidos': 'US', eeuu: 'US', canada: 'CA', guatemala: 'GT', belize: 'BZ', belice: 'BZ',
    honduras: 'HN', 'el salvador': 'SV', nicaragua: 'NI', 'costa rica': 'CR', panama: 'PA', colombia: 'CO', venezuela: 'VE', ecuador: 'EC', peru: 'PE', bolivia: 'BO', brasil: 'BR', brazil: 'BR',
    chile: 'CL', argentina: 'AR', uruguay: 'UY', paraguay: 'PY', cuba: 'CU', espana: 'ES', spain: 'ES', francia: 'FR', france: 'FR', portugal: 'PT', italia: 'IT', italy: 'IT', china: 'CN' };

  function detectColumns(rows, hasHeader) {
    const ncol = Math.max(...rows.slice(0, 50).map(r => r.length), 0), head = hasHeader ? (rows[0] || []) : [];
    const map = {}, used = new Set();
    const take = (role, test) => { for (let c = 0; c < ncol; c++) if (!used.has(c) && test(norm(head[c]))) { map[role] = c; used.add(c); return; } };
    for (const role of Object.keys(NAMES)) take(role, h => h && NAMES[role].includes(h));
    for (const role of ['species', 'lon', 'lat', 'genus']) if (map[role] == null) take(role, h => h.length >= 4 && NAMES[role].some(n => n.length >= 4 && h.startsWith(n)));
    // content-based fallback for the three required roles: species = first text column, longitude = first numeric column, latitude = the second
    const body = rows.slice(hasHeader ? 1 : 0, 201);
    const stat = c => { const vals = body.map(r => r[c]).filter(v => v !== '' && v != null); const nums = vals.map(numOf).filter(v => v != null);
      return { frac: vals.length ? nums.length / vals.length : 0, max: nums.length ? Math.max(...nums.map(Math.abs)) : 0, frac_dec: nums.length ? nums.filter(v => !Number.isInteger(v)).length / nums.length : 0 }; };
    if (map.species == null) for (let c = 0; c < ncol; c++) if (!used.has(c) && stat(c).frac < 0.3) { map.species = c; used.add(c); break; }
    const numeric = []; for (let c = 0; c < ncol; c++) if (!used.has(c)) { const s = stat(c); if (s.frac >= 0.8 && s.max <= 180 && s.frac_dec > 0.5) numeric.push([c, s]); }
    if (map.lon == null && map.lat == null && numeric.length >= 2) {
      let [a, b] = numeric; if (a[1].max > 90 && b[1].max <= 90) { map.lon = a[0]; map.lat = b[0]; } else if (b[1].max > 90 && a[1].max <= 90) { map.lon = b[0]; map.lat = a[0]; } else { map.lon = a[0]; map.lat = b[0]; }
      used.add(map.lon); used.add(map.lat);
    } else {
      if (map.lon == null && numeric.length) { const f = numeric.find(x => !used.has(x[0])); if (f) { map.lon = f[0]; used.add(f[0]); } }
      if (map.lat == null && numeric.length) { const f = numeric.find(x => !used.has(x[0])); if (f) { map.lat = f[0]; used.add(f[0]); } }
    }
    return map;
  }
  function looksLikeHeader(row) {
    if (row.some(c => Object.values(NAMES).some(list => list.includes(norm(c))))) return true;
    return row.filter(c => c !== '' && numOf(c) != null).length < 2;
  }

  /* ---------- state ---------- */
  const U = { fileName: '', rows: [], rowOffset: 0, hasHeader: true, map: {}, swap: false, negLon: false, mode: 'append', sheets: null, sheetRows: null, sheetIdx: 0, seq: 0 };

  function setRows(rows, fileName) {
    rows = rows.map(r => r.map(v => v == null ? '' : (typeof v === 'string' ? v : String(v))));
    const blank = r => !r.some(v => v.trim() !== '');
    let a = 0, z = rows.length; while (a < z && blank(rows[a])) a++; while (z > a && blank(rows[z - 1])) z--;
    U.rowOffset = a; rows = rows.slice(a, z);            // interior blank rows are kept so that the row numbers in the messages match the file
    if (rows.length < 2) throw bilingualError('el archivo no tiene datos (necesita un encabezado y al menos una fila)', 'the file has no data (it needs a header and at least one row)');
    Object.assign(U, { fileName, rows, swap: false, negLon: false, mode: 'append' });
    U.hasHeader = looksLikeHeader(rows[0]);
    U.map = detectColumns(rows, U.hasHeader);
  }

  async function handleFile(file) {
    clearMessages('userMessages'); $('userMapping').style.display = 'none';
    if (!file) return;
    showSpinner(T('Leyendo el archivo…', 'Reading the file…'));
    try {
      const name = file.name, ext = (name.split('.').pop() || '').toLowerCase(), buf = await file.arrayBuffer();
      U.sheets = null; U.sheetRows = null; U.sheetIdx = 0;
      if (ext === 'xlsx') {
        const x = await readXlsx(buf);
        const rowsBySheet = [];
        let first = -1;
        for (let i = 0; i < x.sheets.length; i++) { rowsBySheet[i] = await x.sheetRows(x.sheets[i]); if (first < 0 && rowsBySheet[i].filter(r => r.some(v => String(v).trim() !== '')).length >= 2) first = i; }
        if (first < 0) throw bilingualError('ninguna hoja del libro tiene datos', 'no sheet of the workbook has data');
        U.sheets = x.sheets.map((s, i) => ({ name: s.name, rows: rowsBySheet[i] })); U.sheetIdx = first;
        setRows(rowsBySheet[first], name);
      } else if (ext === 'xls' || ext === 'xlsm' || ext === 'ods') {
        throw bilingualError('este formato no se puede leer; en Excel usa «Guardar como» → .xlsx o CSV', 'this format cannot be read; in your spreadsheet use “Save as” → .xlsx or CSV');
      } else {
        const text = decodeText(buf);
        setRows(parseDelimited(text, detectDelimiter(text)), name);
      }
      renderMapping();
    } catch (e) { console.error(e); showMessage('userMessages', 'error', L2('No se pudo leer el archivo: ', 'The file could not be read: ') + errHTML(e)); }
    finally { hideSpinner(); }
  }
  function handlePaste() {
    clearMessages('userMessages'); $('userMapping').style.display = 'none';
    const text = $('userPaste').value;
    if (!text.trim()) { showMessage('userMessages', 'warning', L2('Pega primero tus datos (con encabezado).', 'Paste your data first (with a header).')); return; }
    try { U.sheets = null; setRows(parseDelimited(text, detectDelimiter(text)), T('datos_pegados', 'pasted_data')); renderMapping(); }
    catch (e) { showMessage('userMessages', 'error', L2('No se pudo leer el texto: ', 'The text could not be read: ') + errHTML(e)); }
  }

  /* ---------- turning rows into records ---------- */
  function process(o) {
    const swap = o.swap, off = U.hasHeader ? 1 : 0, M = U.map, rows = U.rows;
    const res = { records: [], noName: [], badCoord: [], outOfRange: [], dms: 0, genusOnly: 0, positiveLon: 0, checked: 0 };
    const spCol = M.species, genCol = M.genus;
    const genusJoin = genCol != null && rows.slice(off, off + 100).filter(r => String(r[spCol] || '').trim().indexOf(' ') < 0).length > 0.6 * Math.min(100, rows.length - off);
    for (let i = off; i < rows.length; i++) {
      const r = rows[i], rowNo = i + 1 + U.rowOffset;
      if (!r.some(v => String(v).trim() !== '')) continue;
      let raw = spCol != null ? r[spCol] : '';
      if (genusJoin && String(raw || '').trim()) raw = String(r[genCol] || '').trim() + ' ' + String(raw).trim();
      const nm = cleanName(raw);
      if (!nm) { res.noName.push(rowNo); continue; }
      let la = M.lat != null ? parseCoord(r[M.lat], true) : null, lo = M.lon != null ? parseCoord(r[M.lon], false) : null;
      if (!la || !lo) { res.badCoord.push(rowNo); continue; }
      if (la.dms) res.dms++; if (lo.dms) res.dms++;
      let lat = la.v, lon = lo.v;
      if (swap) [lat, lon] = [lon, lat];
      if (o.negLon && lon > 0) lon = -lon;
      res.checked++;
      if (Math.abs(lat) > 90 || Math.abs(lon) > 180) { res.outOfRange.push(rowNo); continue; }
      if (lon > 0) res.positiveLon++;
      if (nm.rank === 'GENUS') res.genusOnly++;
      const o2 = c => (M[c] != null ? r[M[c]] : '');
      const yr = parseInt(o2('year'), 10), mo = parseInt(o2('month'), 10);
      const ctry = String(o2('country') || '').trim();
      let cc = String(o2('countryCode') || '').trim().toUpperCase();
      if (!cc && /^[A-Za-z]{2}$/.test(ctry)) cc = ctry.toUpperCase();
      if (!cc && ctry) cc = COUNTRY_ISO[ctry.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()] || '';
      res.records.push({
        scientificName: nm.taxon, acceptedScientificName: nm.taxon, taxonRank: nm.rank, taxonKey: null, speciesKey: null, species: nm.species || nm.taxon,
        genus: nm.genus, family: '', infraspecificEpithet: nm.infra, taxon: nm.taxon, decimalLatitude: lat, decimalLongitude: lon,
        coordinateUncertaintyInMeters: numOf(o2('unc')), elevation: numOf(o2('elev')), country: ctry, countryCode: cc,
        stateProvince: String(o2('state') || '').trim(), locality: String(o2('locality') || '').trim().slice(0, 120),
        year: yr >= 1000 && yr <= 2100 ? yr : null, month: mo >= 1 && mo <= 12 ? mo : null,
        basisOfRecord: 'USER_DATA', institutionCode: '', datasetName: U.fileName, issues: '', source: 'user', _drop: null,
      });
    }
    return res;
  }

  /* ---------- interface ---------- */
  const colLetter = i => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
  const listRows = a => a.slice(0, 6).join(', ') + (a.length > 6 ? '…' : '');

  function renderMapping() {
    const box = $('userMapping'), rows = U.rows, off = U.hasHeader ? 1 : 0, ncol = Math.max(...rows.slice(0, 50).map(r => r.length), 1);
    const colName = c => (U.hasHeader && rows[0][c] ? `${colLetter(c)} · ${rows[0][c]}` : T(`Columna ${colLetter(c)}`, `Column ${colLetter(c)}`));
    const sel = (id, role, optional) => `<select id="${id}" data-role="${role}"><option value="">${optional ? T('— ninguna —', '— none —') : T('— elegir —', '— choose —')}</option>` +
      Array.from({ length: ncol }, (_, c) => `<option value="${c}"${U.map[role] === c ? ' selected' : ''}>${esc(colName(c))}</option>`).join('') + '</select>';
    const optChips = Object.keys(ROLE_TITLE).filter(r => U.map[r] != null).map(r => `<span class="chip">${L2(ROLE_TITLE[r][0], ROLE_TITLE[r][1])}: ${esc(colName(U.map[r]))}</span>`).join('');
    const mapped = new Set(Object.values(U.map));
    const head = Array.from({ length: ncol }, (_, c) => `<th class="${mapped.has(c) ? 'mapped' : ''}">${esc(U.hasHeader ? (rows[0][c] || colLetter(c)) : colLetter(c))}</th>`).join('');
    const body = rows.slice(off, off + 8).map(r => '<tr>' + Array.from({ length: ncol }, (_, c) => `<td class="${mapped.has(c) ? 'mapped' : ''}">${esc(r[c] ?? '')}</td>`).join('') + '</tr>').join('');
    const sheetSel = U.sheets && U.sheets.length > 1
      ? `<label class="inline-label">${L2('Hoja', 'Sheet')} <select id="uSheet">${U.sheets.map((s, i) => `<option value="${i}"${i === U.sheetIdx ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>` : '';
    const haveRaw = state.raw.length > 0;
    box.innerHTML = `
      <div class="config-group">
        <p class="hint" style="margin:0 0 6px"><b>${esc(U.fileName)}</b> · ${(rows.length - off).toLocaleString('en-US')} ${L2('filas de datos', 'data rows')} ${sheetSel}</p>
        <label class="checkbox-label"><input type="checkbox" id="uHeader"${U.hasHeader ? ' checked' : ''}> ${L2('La primera fila son los encabezados', 'The first row holds the column names')}</label>
        <div class="map-cols">
          <label class="req"><span>${L2('Especie', 'Species')}</span>${sel('uSp', 'species')}</label>
          <label class="req"><span>${L2('Longitud', 'Longitude')}</span>${sel('uLon', 'lon')}</label>
          <label class="req"><span>${L2('Latitud', 'Latitude')}</span>${sel('uLat', 'lat')}</label>
          <label><span>${L2('Género (si está en columna aparte)', 'Genus (if in a separate column)')}</span>${sel('uGen', 'genus', true)}</label>
        </div>
        ${optChips ? `<div class="chips"><span class="hint" style="margin:0">${L2('Columnas opcionales reconocidas:', 'Optional columns recognised:')}</span>${optChips}</div>` : ''}
        <div class="table-scroll user-preview" style="max-height:230px"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>
      </div>
      <div id="uResult"></div>
      <div class="config-group" style="border-bottom:0;margin-bottom:0">
        <label class="checkbox-label"><input type="checkbox" id="uSwap"${U.swap ? ' checked' : ''}> ${L2('Intercambiar longitud y latitud (están al revés)', 'Swap longitude and latitude (they are the wrong way round)')}</label>
        <label class="checkbox-label"><input type="checkbox" id="uNeg"${U.negLon ? ' checked' : ''}> ${L2('Mis longitudes son del hemisferio occidental pero no llevan signo: hacerlas negativas', 'My longitudes are in the western hemisphere but carry no minus sign: make them negative')}</label>
        ${haveRaw ? `<div class="radio-row">
          <label><input type="radio" name="uMode" value="append"${U.mode === 'append' ? ' checked' : ''}> <span>${L2(`Añadir a los ${state.raw.length.toLocaleString('en-US')} registros ya cargados`, `Add to the ${state.raw.length.toLocaleString('en-US')} records already loaded`)}</span></label>
          <label><input type="radio" name="uMode" value="replace"${U.mode === 'replace' ? ' checked' : ''}> <span>${L2('Reemplazarlos por los de mi archivo', 'Replace them with those of my file')}</span></label></div>` : ''}
        <button class="btn btn-primary" id="uLoad">${L2('Usar estos registros →', 'Use these records →')}</button>
      </div>`;
    box.style.display = 'block';
    box.querySelector('#uHeader').onchange = e => { U.hasHeader = e.target.checked; U.map = detectColumns(U.rows, U.hasHeader); renderMapping(); };
    box.querySelectorAll('select[data-role]').forEach(s => s.onchange = () => { U.map[s.dataset.role] = s.value === '' ? undefined : +s.value; renderMapping(); });
    box.querySelector('#uSwap').onchange = e => { U.swap = e.target.checked; renderResult(); };
    box.querySelector('#uNeg').onchange = e => { U.negLon = e.target.checked; renderResult(); };
    box.querySelectorAll('input[name=uMode]').forEach(r => r.onchange = () => { U.mode = r.value; });
    const sh = box.querySelector('#uSheet');
    if (sh) sh.onchange = () => { U.sheetIdx = +sh.value; setRows(U.sheets[U.sheetIdx].rows, U.fileName); renderMapping(); };
    box.querySelector('#uLoad').onclick = loadRecords;
    renderResult();
  }

  function renderResult() {
    const M = U.map, res = process({ swap: U.swap, negLon: U.negLon }), box = $('uResult'), load = $('uLoad');
    const missing = ['species', 'lon', 'lat'].filter(r => M[r] == null);
    const taxa = {}; res.records.forEach(r => { taxa[r.taxon] = (taxa[r.taxon] || 0) + 1; });
    const nTaxa = Object.keys(taxa).length;
    const msgs = [];
    if (missing.length) msgs.push(['error', L2('Falta elegir la columna de ' + missing.map(r => ({ species: 'especie', lon: 'longitud', lat: 'latitud' })[r]).join(', ') + '.',
      'Choose the column for ' + missing.map(r => ({ species: 'species', lon: 'longitude', lat: 'latitude' })[r]).join(', ') + '.')]);
    if (!missing.length) {
      if (res.noName.length) msgs.push(['warning', L2(`${res.noName.length} fila(s) sin nombre de especie se omiten (filas ${listRows(res.noName)}).`, `${res.noName.length} row(s) without a species name are skipped (rows ${listRows(res.noName)}).`)]);
      if (res.badCoord.length) msgs.push(['warning', L2(`${res.badCoord.length} fila(s) con longitud o latitud vacía o ilegible se omiten (filas ${listRows(res.badCoord)}).`, `${res.badCoord.length} row(s) with an empty or unreadable longitude or latitude are skipped (rows ${listRows(res.badCoord)}).`)]);
      if (res.outOfRange.length) msgs.push(['warning', L2(`${res.outOfRange.length} fila(s) con coordenadas fuera de rango (|lat| > 90 o |lon| > 180) se omiten (filas ${listRows(res.outOfRange)}).`, `${res.outOfRange.length} row(s) with out-of-range coordinates (|lat| > 90 or |lon| > 180) are skipped (rows ${listRows(res.outOfRange)}).`)]);
      const alt = process({ swap: !U.swap, negLon: U.negLon });
      if (res.outOfRange.length && alt.records.length > res.records.length)
        msgs.push(['info', L2(`Con longitud y latitud intercambiadas serían válidas ${alt.records.length} filas en lugar de ${res.records.length}: revisa el orden de tus columnas (o marca «Intercambiar»).`, `With longitude and latitude swapped ${alt.records.length} rows would be valid instead of ${res.records.length}: check your column order (or tick “Swap”).`)]);
      if (res.records.length && res.positiveLon === res.records.length && !U.negLon)
        msgs.push(['info', L2('Todas tus longitudes son positivas. Si tus registros están en América (hemisferio occidental), marca «hacerlas negativas».', 'All your longitudes are positive. If your records are in the Americas (western hemisphere), tick “make them negative”.')]);
      if (res.dms) msgs.push(['info', L2(`${res.dms} coordenada(s) en grados-minutos-segundos se convirtieron a grados decimales.`, `${res.dms} coordinate(s) in degrees-minutes-seconds were converted to decimal degrees.`)]);
      if (res.genusOnly) msgs.push(['warning', L2(`${res.genusOnly} registro(s) están determinados solo a género («sp.»). Se cargan, pero conviene quitarlos en el filtro por rango taxonómico.`, `${res.genusOnly} record(s) are identified only to genus (“sp.”). They are loaded, but you may remove them with the taxonomic-rank filter.`)]);
    }
    const top = Object.entries(taxa).sort((a, b) => b[1] - a[1]).slice(0, 6);
    box.innerHTML = `<div class="results-summary" id="uTiles"></div>` +
      (top.length ? `<div class="chips">${top.map(([t, n]) => `<span class="chip muted"><i>${esc(t)}</i> · ${n.toLocaleString('en-US')}</span>`).join('')}${nTaxa > 6 ? `<span class="chip muted">+${nTaxa - 6}</span>` : ''}</div>` : '') +
      msgs.map(([t, h]) => `<div class="msg msg-${t}">${h}</div>`).join('');
    statTiles('uTiles', [[{ es: 'Filas leídas', en: 'Rows read' }, U.rows.slice(U.hasHeader ? 1 : 0).filter(r => r.some(v => String(v).trim() !== '')).length.toLocaleString('en-US')],
      [{ es: 'Registros válidos', en: 'Valid records' }, res.records.length.toLocaleString('en-US')], [{ es: 'Taxones', en: 'Taxa' }, nTaxa],
      [{ es: 'Omitidas', en: 'Skipped' }, (res.noName.length + res.badCoord.length + res.outOfRange.length).toLocaleString('en-US')]]);
    if (load) load.disabled = !res.records.length;
    U.last = res;
  }

  function loadRecords() {
    const res = process({ swap: U.swap, negLon: U.negLon });
    if (!res.records.length) return;
    const append = U.mode === 'append' && state.raw.length > 0;
    res.records.forEach(r => { r.key = 'U' + (++U.seq); });
    const all = (append ? state.raw : []).concat(res.records);
    if (!append) {
      const taxa = [...new Set(res.records.map(r => r.taxon))];
      state.query = taxa.length === 1 ? taxa[0] : (U.fileName.replace(/\.[^.]+$/, '') || 'my_records');
      state.match = null;
      $('matchResult').style.display = 'none'; $('fetchCard').style.display = 'none';
    } else if (!state.query) state.query = res.records[0].taxon;
    clearMessages('fetchMessages');
    acceptRecords(all, all.length, false);
    clearMessages('userMessages');
    showMessage('userMessages', 'success', L2(`${res.records.length.toLocaleString('en-US')} registros propios cargados${append ? ` y sumados a los anteriores (${all.length.toLocaleString('en-US')} en total)` : ''}. Sigue con los filtros abajo.`,
      `${res.records.length.toLocaleString('en-US')} of your own records loaded${append ? ` and added to the previous ones (${all.length.toLocaleString('en-US')} in total)` : ''}. Continue to the filters below.`));
    const c = $('rawPreviewCard'); if (c && c.scrollIntoView) c.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------- template, drag and drop ---------- */
  $('userTemplateBtn').addEventListener('click', () => {
    const es = I18N.lang === 'es';
    const csv = '﻿' + [es ? 'especie,longitud,latitud' : 'species,longitude,latitude', 'Pinus cembroides,-99.85,19.42', 'Pinus cembroides,-100.31,20.11', 'Pinus pinceana,-101.02,24.85'].join('\r\n') + '\r\n';
    downloadBlob(csv, es ? 'plantilla_registros.csv' : 'records_template.csv', 'text/csv;charset=utf-8');
  });
  $('userFile').addEventListener('change', e => { handleFile(e.target.files[0]); e.target.value = ''; });
  $('userPasteBtn').addEventListener('click', handlePaste);
  const dz = $('userDrop');
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', e => { if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]); });
  document.addEventListener('langchange', () => { if ($('userMapping').style.display !== 'none' && U.rows.length) renderMapping(); });

  window.userData = { parseCoord, cleanName, parseDelimited, detectDelimiter, readXlsx, detectColumns, handleFile, U };
})();
