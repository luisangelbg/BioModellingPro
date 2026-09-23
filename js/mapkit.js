/* Map utilities shared by the record map (step 4), the thematic map (step 5), the cluster map
   and the model maps. The look and the export of every map are handled by mapstudio.js, which
   attaches to the records created here. */

const CAT_PALETTE = ['#4c78a8', '#f58518', '#54a24b', '#e45756', '#72b7b2', '#b279a2',
  '#ff9da6', '#9d755d', '#bab0ac', '#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e',
  '#a6761d', '#1f78b4', '#33a02c', '#fb9a99', '#fdbf6f', '#cab2d6'];

/* sequential ramp sampled from a perceptually uniform scale */
const SEQ_RAMP = ['#440154', '#472d7b', '#3b528b', '#2c728e', '#21918c', '#28ae80', '#5ec962', '#addc30', '#fde725'];
const DIV_RAMP = ['#2166ac', '#67a9cf', '#d1e5f0', '#f7f7f7', '#fddbc7', '#ef8a62', '#b2182b'];

function lerpColor(a, b, t) {
  const pa = a.match(/\w\w/g).map(h => parseInt(h, 16));
  const pb = b.match(/\w\w/g).map(h => parseInt(h, 16));
  const p = pa.map((x, i) => Math.round(x + (pb[i] - x) * t));
  return '#' + p.map(x => x.toString(16).padStart(2, '0')).join('');
}
function rampColor(ramp, t) {
  t = Math.max(0, Math.min(1, t));
  const seg = (ramp.length - 1) * t, i = Math.min(ramp.length - 2, Math.floor(seg));
  return lerpColor(ramp[i].replace('#', ''), ramp[i + 1].replace('#', ''), seg - i);
}
function categoricalColors(values) {
  const uniq = [...new Set(values)].filter(v => v !== null && v !== undefined && v !== '').sort();
  const m = {}; uniq.forEach((v, i) => m[v] = CAT_PALETTE[i % CAT_PALETTE.length]);
  return m;
}
function quantileBreaks(values, n) {
  const v = values.filter(x => x != null && isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return [];
  const breaks = []; for (let i = 1; i < n; i++) breaks.push(quantile(v, i / n));
  return [v[0], ...breaks, v[v.length - 1]];
}

/* ---------- base maps ----------
   [key, name, url, tile options, extra]. extra.safe: the server answers requests that carry no Referer (pages opened from
   disk); extra.dark: the map looks dark, so text drawn over it should be light. The standard OpenStreetMap tile server is
   deliberately absent: it answers "Access blocked" to such pages. */
const CARTO_ATTR = '© OpenStreetMap contributors © CARTO';
const BASEMAPS = () => [
  ['gray', T('Gris claro (Esri)', 'Light grey (Esri)'), 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', { attribution: 'Esri, HERE, Garmin', maxZoom: 16 }, { safe: true }],
  ['darkgray', T('Gris oscuro (Esri)', 'Dark grey (Esri)'), 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { attribution: 'Esri, HERE, Garmin', maxZoom: 16 }, { safe: true, dark: true }],
  ['light', T('Claro (CARTO)', 'Light (CARTO)'), 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: CARTO_ATTR, maxZoom: 19, subdomains: 'abcd' }, { safe: true }],
  ['lightnl', T('Claro sin etiquetas (CARTO)', 'Light, no labels (CARTO)'), 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', { attribution: CARTO_ATTR, maxZoom: 19, subdomains: 'abcd' }, { safe: true }],
  ['voyager', T('Calles (CARTO)', 'Streets (CARTO)'), 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { attribution: CARTO_ATTR, maxZoom: 19, subdomains: 'abcd' }, { safe: true }],
  ['dark', T('Oscuro (CARTO)', 'Dark (CARTO)'), 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: CARTO_ATTR, maxZoom: 19, subdomains: 'abcd' }, { safe: true, dark: true }],
  ['darknl', T('Oscuro sin etiquetas (CARTO)', 'Dark, no labels (CARTO)'), 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', { attribution: CARTO_ATTR, maxZoom: 19, subdomains: 'abcd' }, { safe: true, dark: true }],
  ['topoEsri', T('Topográfico (Esri)', 'Topographic (Esri)'), 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', { attribution: 'Esri, HERE, Garmin, USGS, NGA', maxZoom: 19 }, {}],
  ['street', T('Calles (Esri)', 'Streets (Esri)'), 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', { attribution: 'Esri, HERE, Garmin, USGS, NGA', maxZoom: 19 }, {}],
  ['topo', T('Relieve (OpenTopoMap)', 'Terrain (OpenTopoMap)'), 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { attribution: '© OpenTopoMap (CC-BY-SA)', maxZoom: 17 }, {}],
  ['sat', T('Satélite (Esri)', 'Imagery (Esri)'), 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Esri, Maxar, Earthstar Geographics', maxZoom: 19 }, { dark: true }],
  ['relief', T('Sombreado (Esri)', 'Shaded relief (Esri)'), 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}', { attribution: 'Esri', maxZoom: 13 }, {}],
  ['none', T('Ninguno (color de fondo)', 'None (background colour)'), null, {}, { safe: true }],
];
const baseMeta = key => { const b = BASEMAPS().find(x => x[0] === key); return b ? b[4] || {} : {}; };
const autoBase = () => Theme.current() === 'dark' ? 'darkgray' : 'gray';
const MAPS = [];   // {map, layers:{key:layer}, ctl, userBase, current, legacy, studio}

function makeBaseMap(divId) {
  const map = L.map(divId, { worldCopyJump: true }).setView([20, 0], 2);
  const rec = { map, layers: {}, ctl: null, userBase: false, current: null, legacy: {}, busy: false };
  BASEMAPS().forEach(([k, , url, opt]) => {
    if (!url) { rec.layers[k] = L.layerGroup(); return; }        // "None": an empty group, the container background shows
    rec.layers[k] = L.tileLayer(url, { ...opt, crossOrigin: true }); watchTiles(rec, k);
  });
  rec.current = autoBase();
  rec.layers[rec.current].addTo(map);
  buildLayersControl(rec);
  map.on('baselayerchange', e => {
    if (rec.busy) return;                                         // switched by code, not by the layers control
    rec.userBase = true; rec.current = Object.keys(rec.layers).find(k => rec.layers[k] === e.layer) || rec.current;
    map.fire('bmp:base', { key: rec.current, user: true });
  });
  rec.legacy.scale = L.control.scale({ position: 'bottomleft', imperial: false, maxWidth: 200 }).addTo(map);
  rec.legacy.north = addNorthArrow(map);
  rec.legacy.grat = addGraticule(map);
  MAPS.push(rec);
  return map;
}
/* the map studio draws its own scale bar, north arrow and graticule (so that exports match the screen) */
function dropLegacyDecor(rec) {
  const l = rec.legacy || {};
  if (l.scale) l.scale.remove();
  if (l.north) l.north.remove();
  if (l.grat) l.grat.remove();
  rec.legacy = {};
}
function getRec(x) {
  return MAPS.find(r => r.map === x || r === x || (typeof x === 'string' && r.map.getContainer().id === x)) || null;
}
/* switch the base layer by code; user = true when it is the user's choice (the theme then stops driving it) */
function setBase(rec, key, user) {
  if (!rec.layers[key]) return;
  if (user !== undefined) rec.userBase = !!user;
  if (key !== rec.current) {
    rec.busy = true;
    try {
      const prev = rec.layers[rec.current];
      if (prev && rec.map.hasLayer(prev)) rec.map.removeLayer(prev);
      rec.layers[key].addTo(rec.map); rec.current = key;
      if (rec.layers[key].bringToBack) rec.layers[key].bringToBack();
    } finally { rec.busy = false; }
  }
  rec.map.fire('bmp:base', { key });
}

/* Some tile servers refuse requests that carry no Referer (which is the case when index.html is opened from disk with a
   double click) and answer with an image that says "Access blocked". When the active base layer only fails, switch once
   to a server that accepts such requests and tell the user why. */
function watchTiles(rec, key) {
  let bad = 0, good = 0;
  const layer = rec.layers[key];
  layer.on('tileload', () => { good++; });
  layer.on('tileerror', () => {
    bad++;
    if (bad >= 4 && !good && rec.current === key && !baseMeta(key).safe && !rec.notified) {
      rec.notified = true;
      setBase(rec, 'gray');
      const note = L.control({ position: 'bottomright' });
      note.onAdd = () => { const d = L.DomUtil.create('div', 'map-tile-note'); d.innerHTML = L2('La capa base elegida no respondió; se cambió a «Gris claro (Esri)».', 'The chosen base layer did not respond; switched to “Light grey (Esri)”.'); return d; };
      note.addTo(rec.map); setTimeout(() => note.remove(), 9000);
    }
  });
}

/* Optional place-name overlay (transparent tiles with labels only) drawn above the muted base map. The Esri grey maps have
   their own matching reference layers; the other base maps get light or dark CARTO labels depending on how dark the map is. */
function setLabels(rec, on, dark) {
  const cur = rec.current, key = cur === 'gray' ? 'esri-light' : cur === 'darkgray' ? 'esri-dark' : (dark ? 'carto-dark' : 'carto-light');
  if (rec.labelLayer && (!on || rec.labelKey !== key)) { rec.map.removeLayer(rec.labelLayer); rec.labelLayer = null; }
  if (!on) return;
  if (!rec.labelLayer) {
    if (!rec.map.getPane('bmpLabels')) { const p = rec.map.createPane('bmpLabels'); p.style.zIndex = 250; p.style.pointerEvents = 'none'; }
    rec.labelKey = key;
    const esri = key.startsWith('esri');
    rec.labelLayer = esri
      ? L.tileLayer(`https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${key === 'esri-dark' ? 'Dark' : 'Light'}_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, { pane: 'bmpLabels', maxZoom: 16, crossOrigin: true, attribution: 'Esri, HERE, Garmin' })
      : L.tileLayer(`https://{s}.basemaps.cartocdn.com/${key === 'carto-dark' ? 'dark' : 'light'}_only_labels/{z}/{x}/{y}{r}.png`, { pane: 'bmpLabels', subdomains: 'abcd', maxZoom: 19, crossOrigin: true, attribution: CARTO_ATTR });
  }
  if (!rec.map.hasLayer(rec.labelLayer)) rec.labelLayer.addTo(rec.map);
}

function tileLayerFor(key, opts) { const b = BASEMAPS().find(x => x[0] === key); return L.tileLayer(b[2], { ...b[3], ...opts }); }

function buildLayersControl(rec) {
  if (rec.ctl) rec.ctl.remove();
  const base = {}; BASEMAPS().forEach(([k, name]) => { base[name] = rec.layers[k]; });
  rec.busy = true;
  try { rec.ctl = L.control.layers(base, null, { position: 'topright' }).addTo(rec.map); } finally { rec.busy = false; }
}
/* language: rename the entries of the layers control; theme: follow it unless the user chose a base map */
document.addEventListener('langchange', () => MAPS.forEach(buildLayersControl));
document.addEventListener('themechange', () => MAPS.forEach(rec => {
  if (rec.userBase) return;
  setBase(rec, autoBase());
}));

function addNorthArrow(map) {
  const c = L.control({ position: 'topleft' });
  c.onAdd = () => { const d = L.DomUtil.create('div', 'leaflet-north-arrow'); d.innerHTML = '<span class="arrow">↑</span>N'; return d; };
  c.addTo(map);
  return c;
}

function addGraticule(map) {
  let layer = null;
  const draw = () => {
    if (layer) map.removeLayer(layer);
    layer = L.layerGroup();
    const b = map.getBounds(), z = map.getZoom();
    const step = z < 3 ? 30 : z < 5 ? 10 : z < 7 ? 5 : z < 9 ? 1 : z < 11 ? 0.5 : 0.25;
    const s = Math.floor(b.getSouth() / step) * step, n = Math.ceil(b.getNorth() / step) * step;
    const w = Math.floor(b.getWest() / step) * step, e = Math.ceil(b.getEast() / step) * step;
    const style = { color: '#8892a0', weight: 0.5, opacity: 0.5, interactive: false };
    for (let lat = s; lat <= n + 1e-9; lat += step) {
      L.polyline([[lat, w], [lat, e]], style).addTo(layer);
      L.marker([lat, b.getWest()], { interactive: false, icon: L.divIcon({ className: 'grat-label', html: lat.toFixed(step < 1 ? 2 : 0) + '°', iconSize: [40, 12] }) }).addTo(layer);
    }
    for (let lon = w; lon <= e + 1e-9; lon += step) {
      L.polyline([[s, lon], [n, lon]], style).addTo(layer);
      L.marker([b.getSouth(), lon], { interactive: false, icon: L.divIcon({ className: 'grat-label', html: lon.toFixed(step < 1 ? 2 : 0) + '°', iconSize: [40, 12] }) }).addTo(layer);
    }
    layer.addTo(map);
  };
  map.on('moveend zoomend', draw);
  draw();
  return { remove() { map.off('moveend zoomend', draw); if (layer) map.removeLayer(layer); layer = null; } };
}

function fitToPoints(map, recs) {
  const pts = recs.filter(r => r.decimalLatitude != null).map(r => [r.decimalLatitude, r.decimalLongitude]);
  if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.12));
}

/* Kept for the modules that call it: the map studio does the work when it is attached to that map. */
async function exportMapPNG(divId, filename) {
  const rec = getRec(divId);
  if (rec && rec.studio && rec.studio.exportNow) return rec.studio.exportNow({ fmt: 'png', name: filename });
  if (!window.html2canvas) await loadScript('vendor/html2canvas.min.js');
  const canvas = await window.html2canvas(el(divId), { useCORS: true, allowTaint: false, scale: 2, logging: false });
  await new Promise(res => canvas.toBlob(b => { if (b) downloadBlob(b, filename, 'image/png'); res(); }, 'image/png'));
}

function loadScript(src) {
  return new Promise((res, rej) => {
    if ([...document.scripts].some(s => s.src === src || s.getAttribute('src') === src)) return res();
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error(T('no se pudo cargar ' + src, 'could not load ' + src)));
    document.head.appendChild(s);
  });
}

window.mapkit = { tileLayerFor, BASEMAPS, baseMeta, autoBase, CAT_PALETTE, SEQ_RAMP, DIV_RAMP, rampColor, categoricalColors, quantileBreaks, makeBaseMap,
  fitToPoints, exportMapPNG, loadScript, getRec, setBase, setLabels, dropLegacyDecor, MAPS };
window.loadScript = loadScript;
