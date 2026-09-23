/* Regions used by the filter of step 2: the 32 federal entities of Mexico, and any region layer the user loads.
   Two ways of telling which region a record belongs to:
   - from its text field (stateProvince), normalised through a table of the usual spellings and abbreviations;
   - from its coordinates, with a point-in-polygon test against the simplified boundaries in js/mexico-states.js
     (or against the GeoJSON the user loads), which also fills in the records that carry no state at all. */

const MX_ENTITIES = [
  ['Aguascalientes', 'AGU'], ['Baja California', 'BCN'], ['Baja California Sur', 'BCS'], ['Campeche', 'CAM'],
  ['Chiapas', 'CHP'], ['Chihuahua', 'CHH'], ['Ciudad de México', 'CMX'], ['Coahuila', 'COA'], ['Colima', 'COL'],
  ['Durango', 'DUR'], ['Guanajuato', 'GUA'], ['Guerrero', 'GRO'], ['Hidalgo', 'HID'], ['Jalisco', 'JAL'],
  ['México', 'MEX'], ['Michoacán', 'MIC'], ['Morelos', 'MOR'], ['Nayarit', 'NAY'], ['Nuevo León', 'NLE'],
  ['Oaxaca', 'OAX'], ['Puebla', 'PUE'], ['Querétaro', 'QUE'], ['Quintana Roo', 'ROO'], ['San Luis Potosí', 'SLP'],
  ['Sinaloa', 'SIN'], ['Sonora', 'SON'], ['Tabasco', 'TAB'], ['Tamaulipas', 'TAM'], ['Tlaxcala', 'TLA'],
  ['Veracruz', 'VER'], ['Yucatán', 'YUC'], ['Zacatecas', 'ZAC'],
];
const MX_NAME_OF_CODE = Object.fromEntries(MX_ENTITIES.map(([n, c]) => [c, n]));

/* Reference geographic grouping of the entities, offered as a shortcut in the filter. */
const MX_REGIONS = [
  { es: 'Noroeste', en: 'North-west', codes: ['BCN', 'BCS', 'SON', 'SIN', 'CHH', 'DUR'] },
  { es: 'Noreste', en: 'North-east', codes: ['COA', 'NLE', 'TAM'] },
  { es: 'Occidente y Bajío', en: 'West and Bajío', codes: ['JAL', 'NAY', 'COL', 'MIC', 'AGU', 'GUA', 'QUE', 'SLP', 'ZAC'] },
  { es: 'Centro', en: 'Centre', codes: ['CMX', 'MEX', 'HID', 'MOR', 'PUE', 'TLA'] },
  { es: 'Pacífico Sur', en: 'South Pacific', codes: ['GRO', 'OAX', 'CHP'] },
  { es: 'Golfo', en: 'Gulf', codes: ['VER', 'TAB'] },
  { es: 'Península de Yucatán', en: 'Yucatán Peninsula', codes: ['CAM', 'YUC', 'ROO'] },
];

/* Repairs text whose UTF-8 bytes were read as single-byte characters ("QuerÃ©taro" → "Querétaro"), which is
   common in spreadsheets and exports saved with the wrong encoding. */
function fixMojibake(s) {
  if (typeof s !== 'string' || !/[ÃÂ][-¿]/.test(s)) return s;
  try {
    const b = Uint8Array.from(s, c => { const v = c.charCodeAt(0); if (v > 255) throw new Error('wide'); return v; });
    return new TextDecoder('utf-8', { fatal: true }).decode(b);
  } catch (e) { return s; }
}

/* lowercase, without accents, punctuation or repeated blanks */
const regNorm = s => fixMojibake(String(s == null ? '' : s)).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[.,;_()]/g, ' ').replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();

/* the usual spellings, official long names, postal abbreviations and ISO codes */
const MX_ALIASES = (() => {
  const raw = {
    AGU: ['aguascalientes', 'ags'],
    BCN: ['baja california', 'baja california norte', 'bc', 'b c', 'bcn'],
    BCS: ['baja california sur', 'bcs', 'b c s'],
    CAM: ['campeche', 'camp'],
    CHP: ['chiapas', 'chis'],
    CHH: ['chihuahua', 'chih'],
    CMX: ['ciudad de mexico', 'cdmx', 'distrito federal', 'df', 'd f', 'mexico city', 'mexico df', 'ciudad de mexico df', 'ciudad mexico'],
    COA: ['coahuila', 'coahuila de zaragoza', 'coah'],
    COL: ['colima', 'col'],
    DUR: ['durango', 'dgo'],
    GUA: ['guanajuato', 'gto'],
    GRO: ['guerrero', 'gro'],
    HID: ['hidalgo', 'hgo'],
    JAL: ['jalisco', 'jal'],
    MEX: ['mexico', 'estado de mexico', 'edo de mexico', 'edo mexico', 'edomex', 'mexico state', 'state of mexico', 'mex'],
    MIC: ['michoacan', 'michoacan de ocampo', 'mich'],
    MOR: ['morelos', 'mor'],
    NAY: ['nayarit', 'nay'],
    NLE: ['nuevo leon', 'nl', 'n l'],
    OAX: ['oaxaca', 'oax'],
    PUE: ['puebla', 'pue'],
    QUE: ['queretaro', 'queretaro de arteaga', 'qro'],
    ROO: ['quintana roo', 'q roo', 'qroo', 'quintanaroo'],
    SLP: ['san luis potosi', 'slp', 's l p'],
    SIN: ['sinaloa', 'sin'],
    SON: ['sonora', 'son'],
    TAB: ['tabasco', 'tab'],
    TAM: ['tamaulipas', 'tamps', 'tam'],
    TLA: ['tlaxcala', 'tlax'],
    VER: ['veracruz', 'veracruz de ignacio de la llave', 'ver'],
    YUC: ['yucatan', 'yuc'],
    ZAC: ['zacatecas', 'zac'],
  };
  const m = {};
  for (const [code, list] of Object.entries(raw)) {
    m[regNorm(code)] = code;                                  // the ISO code itself
    m[regNorm('mx ' + code)] = code;                          // ISO 3166-2 form, MX-JAL
    list.forEach(a => { m[regNorm(a)] = code; });
  }
  return m;
})();

/* Canonical name of a Mexican entity written in any of the usual ways, or null. */
function mxStateFromText(raw) {
  const n = regNorm(raw);
  if (!n) return null;
  const code = MX_ALIASES[n] || MX_ALIASES[n.replace(/^estado (de|del) /, '')] || MX_ALIASES[n.replace(/^mx /, '')];
  return code ? MX_NAME_OF_CODE[code] : null;
}

/* ---------- region layers ---------- */
/* A layer is { id, label:{es,en}, source, regions:[{ n, c, b:[w,s,e,n], p:[[ring,...],...] }] };
   every ring is a flat array of longitude, latitude pairs. */
const RegionLayers = { list: [], current: null };

function registerRegionLayer(layer) {
  if (!layer || !layer.regions || !layer.regions.length) return null;
  layer.regions.forEach(r => { if (!r.b) r.b = ringsBBox(r.p); });
  RegionLayers.list = RegionLayers.list.filter(l => l.id !== layer.id).concat(layer);
  if (!RegionLayers.current) RegionLayers.current = layer.id;
  return layer;
}
const regionLayer = id => RegionLayers.list.find(l => l.id === (id || RegionLayers.current)) || null;

function ringsBBox(polys) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const poly of polys) for (const ring of poly)
    for (let i = 0; i < ring.length; i += 2) {
      if (ring[i] < w) w = ring[i]; if (ring[i] > e) e = ring[i];
      if (ring[i + 1] < s) s = ring[i + 1]; if (ring[i + 1] > n) n = ring[i + 1];
    }
  return [w, s, e, n];
}

/* even-odd ray casting on a flat [lon, lat, …] ring */
function pointInRing(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i], yi = ring[i + 1], xj = ring[j], yj = ring[j + 1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function pointInRegion(reg, x, y) {
  if (x < reg.b[0] || x > reg.b[2] || y < reg.b[1] || y > reg.b[3]) return false;
  for (const poly of reg.p) {
    if (!pointInRing(poly[0], x, y)) continue;
    let hole = false;
    for (let h = 1; h < poly.length && !hole; h++) if (pointInRing(poly[h], x, y)) hole = true;
    if (!hole) return true;
  }
  return false;
}

/* Name of the region that contains the point, or null. The last hit is cached because records
   arrive geographically clustered, which makes the sweep over thousands of points much faster. */
let _lastHit = null;
function regionOfPoint(lat, lon, layerId) {
  const layer = regionLayer(layerId);
  if (!layer || lat == null || lon == null) return null;
  if (_lastHit && _lastHit.layer === layer.id && pointInRegion(_lastHit.reg, lon, lat)) return _lastHit.reg.n;
  for (const reg of layer.regions) if (pointInRegion(reg, lon, lat)) { _lastHit = { layer: layer.id, reg }; return reg.n; }
  return null;
}

/* Union of the bounding boxes of the named regions, as {W, S, E, N}, or null. */
function regionsBBox(names, layerId) {
  const layer = regionLayer(layerId); if (!layer) return null;
  const want = new Set(names);
  let W = Infinity, S = Infinity, E = -Infinity, N = -Infinity, hit = 0;
  for (const r of layer.regions) if (want.has(r.n)) {
    hit++; W = Math.min(W, r.b[0]); S = Math.min(S, r.b[1]); E = Math.max(E, r.b[2]); N = Math.max(N, r.b[3]);
  }
  return hit ? { W, S, E, N } : null;
}

/* Outlines of the named regions as arrays of [lat, lon] for the maps. */
function regionsOutline(names, layerId) {
  const layer = regionLayer(layerId); if (!layer) return [];
  const want = new Set(names), out = [];
  for (const r of layer.regions) if (want.has(r.n))
    for (const poly of r.p) for (const ring of poly) {
      const pts = [];
      for (let i = 0; i < ring.length; i += 2) pts.push([ring[i + 1], ring[i]]);
      if (pts.length > 2) out.push(pts);
    }
  return out;
}

/* ---------- the bundled layer of Mexican entities ---------- */
function initMexicoLayer() {
  const g = window.MX_STATE_GEOM;
  if (!g || !g.states || !g.states.length) return null;
  return registerRegionLayer({
    id: 'mx-states', source: g.source || '',
    label: { es: 'Estados de México', en: 'States of Mexico' },
    regions: g.states.map(s => ({ n: s.n, c: s.c, b: s.b, p: s.p })),
  });
}

/* ---------- a region layer from the user's own GeoJSON ---------- */
const NAME_FIELDS = ['nomgeo', 'nom_ent', 'nom_mun', 'nombre', 'estado', 'entidad', 'municipio', 'name', 'nam',
  'state', 'province', 'region', 'nom', 'nombre_ent', 'cve_ent', 'admin1', 'nombre_region', 'zona'];

function parseRegionGeoJSON(text, id, label) {
  let gj;
  try { gj = JSON.parse(text); } catch (e) { throw bilingualError('el archivo no es un GeoJSON válido', 'the file is not valid GeoJSON'); }
  const feats = gj.type === 'FeatureCollection' ? gj.features : (gj.type === 'Feature' ? [gj] : null);
  if (!feats || !feats.length) throw bilingualError('el GeoJSON no trae polígonos', 'the GeoJSON carries no polygons');
  /* pick the property that best names the regions: present everywhere, textual and mostly distinct */
  const props = {};
  feats.forEach(f => { for (const k of Object.keys(f.properties || {})) props[regNorm(k)] = (props[regNorm(k)] || 0) + 1; });
  let field = null, best = -1;
  for (const k of Object.keys(props)) {
    const i = NAME_FIELDS.indexOf(k);
    const score = (props[k] === feats.length ? 100 : 0) + (i >= 0 ? 60 - i : 0);
    if (score > best) { best = score; field = k; }
  }
  const valueOf = (f, idx) => {
    const p = f.properties || {};
    for (const k of Object.keys(p)) if (regNorm(k) === field && p[k] != null && String(p[k]).trim()) return String(p[k]).trim();
    return T('Región ', 'Region ') + (idx + 1);
  };
  const regions = [], seen = {};
  feats.forEach((f, idx) => {
    const geo = f.geometry; if (!geo) return;
    const polys = geo.type === 'Polygon' ? [geo.coordinates] : geo.type === 'MultiPolygon' ? geo.coordinates : null;
    if (!polys) return;
    let name = valueOf(f, idx);
    if (seen[name]) {                                        /* several features of the same region: merge them */
      seen[name].p.push(...polys.map(poly => poly.map(ring => flatRing(ring))));
      return;
    }
    const r = { n: name, c: '', p: polys.map(poly => poly.map(ring => flatRing(ring))) };
    seen[name] = r; regions.push(r);
  });
  if (!regions.length) throw bilingualError('no se encontraron polígonos utilizables', 'no usable polygons were found');
  return registerRegionLayer({ id, source: '', label, regions });
}
function flatRing(ring) {
  const out = new Float64Array(ring.length * 2);
  for (let i = 0; i < ring.length; i++) { out[i * 2] = +ring[i][0]; out[i * 2 + 1] = +ring[i][1]; }
  return out;
}

initMexicoLayer();

Object.assign(window, { MX_ENTITIES, MX_REGIONS, MX_NAME_OF_CODE, mxStateFromText, regNorm, fixMojibake, RegionLayers, regionLayer,
  registerRegionLayer, regionOfPoint, regionsBBox, regionsOutline, parseRegionGeoJSON, initMexicoLayer });
