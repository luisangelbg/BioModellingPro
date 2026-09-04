/* Utilidades de mapa compartidas entre el mapa de registros (paso 4) y el
   mapa temático de variables ambientales (paso 5). */

const CAT_PALETTE = ['#4c78a8', '#f58518', '#54a24b', '#e45756', '#72b7b2', '#b279a2',
  '#ff9da6', '#9d755d', '#bab0ac', '#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e',
  '#a6761d', '#1f78b4', '#33a02c', '#fb9a99', '#fdbf6f', '#cab2d6'];

/* rampa secuencial tipo viridis (muestreada) */
const SEQ_RAMP = ['#440154', '#472d7b', '#3b528b', '#2c728e', '#21918c',
  '#28ae80', '#5ec962', '#addc30', '#fde725'];
/* rampa divergente (para anomalías / correlaciones más adelante) */
const DIV_RAMP = ['#2166ac', '#67a9cf', '#d1e5f0', '#f7f7f7', '#fddbc7', '#ef8a62', '#b2182b'];

function lerpColor(a, b, t) {
  const pa = a.match(/\w\w/g).map(h => parseInt(h, 16));
  const pb = b.match(/\w\w/g).map(h => parseInt(h, 16));
  const p = pa.map((x, i) => Math.round(x + (pb[i] - x) * t));
  return '#' + p.map(x => x.toString(16).padStart(2, '0')).join('');
}
function rampColor(ramp, t) {
  t = Math.max(0, Math.min(1, t));
  const seg = (ramp.length - 1) * t;
  const i = Math.min(ramp.length - 2, Math.floor(seg));
  return lerpColor(ramp[i].replace('#', ''), ramp[i + 1].replace('#', ''), seg - i);
}

function categoricalColors(values) {
  const uniq = [...new Set(values)].filter(v => v !== null && v !== undefined && v !== '').sort();
  const m = {};
  uniq.forEach((v, i) => m[v] = CAT_PALETTE[i % CAT_PALETTE.length]);
  return m;
}

/* cortes por cuantiles para una variable continua */
function quantileBreaks(values, n) {
  const v = values.filter(x => x != null && isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return [];
  const breaks = [];
  for (let i = 1; i < n; i++) breaks.push(quantile(v, i / n));
  return [v[0], ...breaks, v[v.length - 1]];
}

function makeBaseMap(divId) {
  const map = L.map(divId, { worldCopyJump: true }).setView([20, 0], 2);
  const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenTopoMap (CC-BY-SA)', maxZoom: 17, crossOrigin: true,
  });
  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap', maxZoom: 19, crossOrigin: true,
  });
  const sat = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution: 'Esri, Maxar, Earthstar Geographics', maxZoom: 19, crossOrigin: true });
  const relief = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}',
    { attribution: 'Esri', maxZoom: 13, crossOrigin: true });
  const gray = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    { attribution: 'Esri', maxZoom: 16, crossOrigin: true });
  topo.addTo(map);
  L.control.layers({
    'Relieve (OpenTopoMap)': topo, 'Calles (OSM)': osm, 'Satélite (Esri)': sat,
    'Sombreado (Esri)': relief, 'Gris claro (Esri)': gray,
  }, null, { position: 'topright' }).addTo(map);
  L.control.scale({ position: 'bottomleft', imperial: false, maxWidth: 200 }).addTo(map);
  addNorthArrow(map);
  addGraticule(map);
  return map;
}

function addNorthArrow(map) {
  const c = L.control({ position: 'topleft' });
  c.onAdd = () => {
    const d = L.DomUtil.create('div', 'leaflet-north-arrow');
    d.innerHTML = '<span class="arrow">↑</span>N';
    return d;
  };
  c.addTo(map);
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
      L.marker([lat, b.getWest()], { interactive: false, icon: L.divIcon({
        className: 'grat-label', html: lat.toFixed(step < 1 ? 2 : 0) + '°', iconSize: [40, 12] }) }).addTo(layer);
    }
    for (let lon = w; lon <= e + 1e-9; lon += step) {
      L.polyline([[s, lon], [n, lon]], style).addTo(layer);
      L.marker([b.getSouth(), lon], { interactive: false, icon: L.divIcon({
        className: 'grat-label', html: lon.toFixed(step < 1 ? 2 : 0) + '°', iconSize: [40, 12] }) }).addTo(layer);
    }
    layer.addTo(map);
  };
  map.on('moveend zoomend', draw);
  draw();
}

function fitToPoints(map, recs) {
  const pts = recs.filter(r => r.decimalLatitude != null).map(r => [r.decimalLatitude, r.decimalLongitude]);
  if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.12));
}

async function exportMapPNG(divId, filename, legendHTML) {
  if (!window.html2canvas) await loadScript('https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js');
  const node = el(divId);
  const canvas = await window.html2canvas(node, { useCORS: true, allowTaint: false, scale: 2, logging: false });
  await new Promise(res => canvas.toBlob(b => { if (b) downloadBlob(b, filename, 'image/png'); res(); }, 'image/png'));
}

function loadScript(src) {
  return new Promise((res, rej) => {
    if ([...document.scripts].some(s => s.src === src)) return res();
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('no se pudo cargar ' + src));
    document.head.appendChild(s);
  });
}

window.mapkit = {
  CAT_PALETTE, SEQ_RAMP, DIV_RAMP, rampColor, categoricalColors, quantileBreaks,
  makeBaseMap, fitToPoints, exportMapPNG, loadScript,
};
window.loadScript = loadScript;
