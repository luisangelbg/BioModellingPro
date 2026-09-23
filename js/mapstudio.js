/* Map studio — one shared editor for every map of the app: base map, title and credit, north arrow, scale bar, graticule,
   legend, frame, point styles, colour ramps and classification, presets, and export (PNG, JPEG, WebP, SVG).

   How it works
   - Data is drawn by our own canvas layer (fast with ~20,000 points; six marker shapes, heat map, density grid, hulls).
   - Title, legend, north arrow, scale bar, graticule and frame are drawn by one function (drawDecor) on a canvas that sits
     inside the map container. The export calls the very same functions on a bigger canvas or on an SVG surface, so what
     is exported is what is seen.
   - Base-map tiles and image overlays are read back from the DOM and composed under the data at export time.
   - Everything written on the map is drawn with plain colours, so nothing depends on CSS variables at export. */

(function () {
  'use strict';

  const PREFIX = 'biomodellingpro:mapstyle:';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode or blocked storage */ } };
  const dpr = () => Math.min(2, window.devicePixelRatio || 1);
  const R2D = 180 / Math.PI;

  /* ---------- colour helpers (plain #rrggbb strings only) ---------- */
  function hexRgb(h) {
    h = String(h || '#000000').trim();
    if (h[0] !== '#') { const m = h.match(/[\d.]+/g); return m && m.length >= 3 ? [+m[0], +m[1], +m[2]] : [0, 0, 0]; }
    h = h.slice(1); if (h.length === 3) h = h.replace(/./g, c => c + c);
    return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
  }
  const rgbHex = (r, g, b) => '#' + [r, g, b].map(x => clamp(Math.round(x), 0, 255).toString(16).padStart(2, '0')).join('');
  const lum = h => { const [r, g, b] = hexRgb(h); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
  const mixHex = (a, b, t) => { const A = hexRgb(a), B = hexRgb(b); return rgbHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); };
  const asHex = c => { const s = String(c || ''); return /^#[0-9a-f]{6}$/i.test(s) ? s.toLowerCase() : rgbHex(...hexRgb(s)); };

  /* ---------- colour ramps ---------- */
  const RAMPS = {
    suit: ['#ffffff', '#fdfdc8', '#d3ec9f', '#8bd0a7', '#3fb0ac', '#f3d35a', '#f79a3a', '#e5462f', '#a8141e'],
    viridis: ['#440154', '#482878', '#3e4a89', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6dcd59', '#b4de2c', '#fde725'],
    magma: ['#000004', '#140e36', '#3b0f70', '#641a80', '#8c2981', '#b73779', '#de4968', '#f7705c', '#fe9f6d', '#fecf92', '#fcfdbf'],
    plasma: ['#0d0887', '#47039f', '#7301a8', '#9c179e', '#bd3786', '#d8576b', '#ed7953', '#fb9f3a', '#fdca26', '#f0f921'],
    inferno: ['#000004', '#160b39', '#420a68', '#6a176e', '#932667', '#bc3754', '#dd513a', '#f37819', '#fca50a', '#f6d746', '#fcffa4'],
    cividis: ['#00204d', '#00336f', '#39486b', '#575c6e', '#707173', '#8a8779', '#a69d75', '#c4b56c', '#e4cf5b', '#ffea46'],
    turbo: ['#30123b', '#4662d7', '#36aaf9', '#1ae4b6', '#72fe5e', '#c7ef34', '#faba39', '#f66b19', '#ca2a04', '#7a0403'],
    YlGnBu: ['#ffffd9', '#edf8b1', '#c7e9b4', '#7fcdbb', '#41b6c4', '#1d91c0', '#225ea8', '#253494', '#081d58'],
    YlOrRd: ['#ffffcc', '#ffeda0', '#fed976', '#feb24c', '#fd8d3c', '#fc4e2a', '#e31a1c', '#bd0026', '#800026'],
    Spectral: ['#9e0142', '#d53e4f', '#f46d43', '#fdae61', '#fee08b', '#ffffbf', '#e6f598', '#abdda4', '#66c2a5', '#3288bd', '#5e4fa2'],
    RdYlBu: ['#a50026', '#d73027', '#f46d43', '#fdae61', '#fee090', '#ffffbf', '#e0f3f8', '#abd9e9', '#74add1', '#4575b4', '#313695'],
    RdBu: ['#67001f', '#b2182b', '#d6604d', '#f4a582', '#fddbc7', '#f7f7f7', '#d1e5f0', '#92c5de', '#4393c3', '#2166ac', '#053061'],
    Greens: ['#f7fcf5', '#e5f5e0', '#c7e9c0', '#a1d99b', '#74c476', '#41ab5d', '#238b45', '#006d2c', '#00441b'],
    Blues: ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#08519c', '#08306b'],
    Oranges: ['#fff5eb', '#fee6ce', '#fdd0a2', '#fdae6b', '#fd8d3c', '#f16913', '#d94801', '#a63603', '#7f2704'],
    terrain: ['#333399', '#0066cc', '#00a6a6', '#33cc66', '#99dd55', '#e6e666', '#c9a96e', '#a07850', '#f4f0ea'],
    temp: ['#313695', '#4575b4', '#74add1', '#abd9e9', '#ffffbf', '#fdae61', '#f46d43', '#d73027', '#a50026'],
    precip: ['#8c510a', '#bf812d', '#dfc27d', '#f6e8c3', '#f5f5f5', '#c7eae5', '#80cdc1', '#35978f', '#01665e'],
  };
  const RAMP_NAMES = {
    suit: { es: 'Idoneidad (blanco → rojo)', en: 'Suitability (white → red)' },
    viridis: 'Viridis', magma: 'Magma', plasma: 'Plasma', inferno: 'Inferno', cividis: 'Cividis', turbo: 'Turbo',
    YlGnBu: 'YlGnBu', YlOrRd: 'YlOrRd', Spectral: 'Spectral', RdYlBu: 'RdYlBu', RdBu: 'RdBu', Greens: 'Greens', Blues: 'Blues', Oranges: 'Oranges',
    terrain: { es: 'Terreno', en: 'Terrain' }, temp: { es: 'Temperatura (azul→rojo)', en: 'Temperature (blue→red)' },
    precip: { es: 'Precipitación (marrón→verde)', en: 'Precipitation (brown→green)' },
  };
  const rampName = k => { const n = RAMP_NAMES[k] || k; return typeof n === 'string' ? n : T(n.es, n.en); };
  /* white = force the lowest stop to white (the ramp then starts at white whatever its own first colour) */
  const whiteFirst = stops => { const s = stops.slice(); s[0] = '#ffffff'; return s; };
  const rampStops = (key, rev, white) => { let s = (RAMPS[key] || RAMPS.viridis).slice(); if (rev) s.reverse(); return white ? whiteFirst(s) : s; };
  const rampAt = (stops, t) => mapkit.rampColor(stops, clamp(t, 0, 1));
  const rampCSS = (key, rev, white) => 'linear-gradient(90deg,' + rampStops(key, rev, white).join(',') + ')';

  /* ---------- categorical palettes ---------- */
  const PALETTES = {
    okabe: ['#e69f00', '#56b4e9', '#009e73', '#f0e442', '#0072b2', '#d55e00', '#cc79a7', '#000000'],
    tableau: ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac'],
    set2: ['#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', '#ffd92f', '#e5c494', '#b3b3b3'],
    dark2: ['#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02', '#a6761d', '#666666'],
    paired: ['#a6cee3', '#1f78b4', '#b2df8a', '#33a02c', '#fb9a99', '#e31a1c', '#fdbf6f', '#ff7f00', '#cab2d6', '#6a3d9a', '#ffff99', '#b15928'],
    classic: mapkit.CAT_PALETTE.slice(),
  };
  const PALETTE_NAMES = {
    okabe: { es: 'Okabe-Ito (apta para daltonismo)', en: 'Okabe-Ito (colour-blind safe)' }, tableau: 'Tableau', set2: 'Set2', dark2: 'Dark2', paired: 'Paired',
    classic: { es: 'Clásica (20 colores)', en: 'Classic (20 colours)' }, auto: { es: 'Colores originales', en: 'Original colours' },
  };
  /* after the first cycle the colours are darkened / lightened so that many categories stay distinguishable */
  function palColor(pal, i) {
    const p = PALETTES[pal] || PALETTES.okabe, n = p.length, base = p[i % n], cyc = Math.floor(i / n);
    if (!cyc) return base;
    const k = Math.ceil(cyc / 2) * 0.22;
    return cyc % 2 ? mixHex(base, '#000000', Math.min(0.6, k + 0.1)) : mixHex(base, '#ffffff', Math.min(0.7, k + 0.15));
  }

  /* ---------- classification ---------- */
  function sortedFinite(vals) {
    const v = []; for (const x of vals) if (x != null && isFinite(x)) v.push(+x);
    return v.sort((a, b) => a - b);
  }
  /* Fisher-Jenks natural breaks on (at most) 900 points sampled evenly from the sorted values */
  function jenksBreaks(sorted, k) {
    let data = sorted;
    if (data.length > 900) data = Array.from({ length: 900 }, (_, i) => sorted[Math.round(i * (sorted.length - 1) / 899)]);
    const n = data.length; k = Math.min(k, n);
    const m1 = [], m2 = [];
    for (let i = 0; i <= n; i++) { m1.push(new Array(k + 1).fill(0)); m2.push(new Array(k + 1).fill(Infinity)); }
    for (let i = 1; i <= k; i++) { m1[1][i] = 1; m2[1][i] = 0; }
    for (let l = 2; l <= n; l++) {
      let s1 = 0, s2 = 0, w = 0, v = 0;
      for (let m = 1; m <= l; m++) {
        const i3 = l - m + 1, val = data[i3 - 1];
        s2 += val * val; s1 += val; w++; v = s2 - s1 * s1 / w;
        const i4 = i3 - 1;
        if (i4 !== 0) for (let j = 2; j <= k; j++) if (m2[l][j] >= v + m2[i4][j - 1]) { m1[l][j] = i3; m2[l][j] = v + m2[i4][j - 1]; }
      }
      m1[l][1] = 1; m2[l][1] = v;
    }
    const out = new Array(k + 1); out[k] = data[n - 1]; out[0] = data[0];
    let idx = n, cnt = k;
    while (cnt >= 2) { const id = m1[idx][cnt] - 2; out[cnt - 1] = data[id]; idx = m1[idx][cnt] - 1; cnt--; }
    return out;
  }
  /* strictly increasing class limits: [min, …, max] (fewer classes than asked when values repeat) */
  function classBreaks(sorted, method, n) {
    if (!sorted.length) return [];
    const lo = sorted[0], hi = sorted[sorted.length - 1];
    if (lo === hi) return [lo, hi];
    let b;
    if (method === 'equal') b = Array.from({ length: n + 1 }, (_, i) => lo + (hi - lo) * i / n);
    else if (method === 'jenks') b = jenksBreaks(sorted, n);
    else { b = [lo]; for (let i = 1; i < n; i++) b.push(quantile(sorted, i / n)); b.push(hi); }
    const eps = 1e-9 * Math.max(1, Math.abs(hi - lo)), mid = [];
    for (let i = 1; i < b.length - 1; i++) if (b[i] > lo + eps && b[i] < hi - eps && (!mid.length || b[i] > mid[mid.length - 1] + eps)) mid.push(b[i]);
    return [lo, ...mid, hi];
  }
  /* labels with the fewest decimals that keep the class limits distinct */
  function fmtList(b) {
    for (let d = 0; d <= 4; d++) { const s = b.map(x => fmt(x, d)); if (new Set(s).size === s.length) return s; }
    return b.map(x => fmt(x, 5));
  }

  /* A colour scale for numbers. st: {ramp, rampRev, classMethod, nClasses, legendMode}. */
  function makeScale(values, st) {
    const v = sortedFinite(values); if (!v.length) return null;
    const stops = rampStops(st.ramp, st.rampRev, st.whiteMin), lo = v[0], hi = v[v.length - 1];
    if (st.legendMode === 'continuous') {
      const span = hi - lo || 1;
      /* the number of tick labels is read when the legend is built, so changing it does not rebuild the colours */
      const ticksOf = () => {
        const n = clamp(Math.round(+st.legendTicks) || 5, 2, 9), labs = fmtList(Array.from({ length: n }, (_, i) => lo + span * i / (n - 1)));
        return labs.map((label, i) => ({ t: i / (n - 1), label }));
      };
      return { kind: 'continuous', lo, hi, colorOf: x => rampAt(stops, (x - lo) / span),
        legend: () => ({ kind: 'grad', stops, ticks: ticksOf() }) };
    }
    const b = classBreaks(v, st.classMethod, clamp(+st.nClasses || 6, 2, 12)), nc = Math.max(1, b.length - 1);
    const cols = Array.from({ length: nc }, (_, i) => rampAt(stops, nc > 1 ? i / (nc - 1) : 0.5));
    const classOf = x => { let i = 0; while (i < nc - 1 && x > b[i + 1]) i++; return i; };
    const labs = fmtList(b);
    return { kind: 'classes', lo, hi, breaks: b, classOf, colors: cols, colorOf: x => cols[classOf(x)],
      legend: () => ({ kind: 'classes', items: cols.map((c, i) => ({ color: c, label: labs[i] + ' – ' + labs[i + 1], shape: 'square' })).reverse() }) };
  }
  /* a colour per category: the chosen palette, the module's own colours ("auto"), and the user's overrides */
  function categoryColors(cats, st, defaults) {
    const out = {};
    cats.forEach((c, i) => {
      out[c] = st.catColors && st.catColors[c] ? st.catColors[c]
        : st.catPalette === 'auto' ? ((defaults && defaults[c]) || palColor('tableau', i)) : palColor(st.catPalette, i);
    });
    return out;
  }

  function convexHull(points) {           // points: [[x, y], ...]
    const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (p.length < 3) return p;
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [], upper = [];
    for (const pt of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop(); lower.push(pt); }
    for (let i = p.length - 1; i >= 0; i--) { const pt = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop(); upper.push(pt); }
    return lower.slice(0, -1).concat(upper.slice(0, -1));
  }

  /* ================= drawing surfaces =================
     One tiny drawing API with two back ends (canvas and SVG), so the same code paints the screen, the raster export and
     the vector export. Coordinates are in CSS pixels of the map container. */
  const FONTS = {
    sans: 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    serif: 'Georgia, "Times New Roman", Times, serif',
    mono: 'ui-monospace, "Cascadia Code", Consolas, "Courier New", monospace',
    georgia: 'Georgia, "Times New Roman", serif',
    palatino: '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
    trebuchet: '"Trebuchet MS", Tahoma, Verdana, sans-serif',
    verdana: 'Verdana, Geneva, Tahoma, sans-serif',
    times: '"Times New Roman", Times, Georgia, serif',
    courier: '"Courier New", Courier, monospace',
  };
  const fontStr = o => `${o.italic ? 'italic ' : ''}${o.weight || 400} ${o.size || 12}px ${o.family || FONTS.sans}`;
  const measureCtx = document.createElement('canvas').getContext('2d');
  const textWidth = (s, o) => { measureCtx.font = fontStr(o); return measureCtx.measureText(s).width; };

  function shapePoly(shape, x, y, r) {
    switch (shape) {
      case 'square': { const h = r * 0.9; return [[x - h, y - h], [x + h, y - h], [x + h, y + h], [x - h, y + h]]; }
      case 'triangle': { const h = r * 1.2; return [[x, y - h], [x + h * 0.95, y + h * 0.68], [x - h * 0.95, y + h * 0.68]]; }
      case 'diamond': { const h = r * 1.3; return [[x, y - h], [x + h, y], [x, y + h], [x - h, y]]; }
      case 'cross': { const a = r * 1.25, t = r * 0.42; return [[x - t, y - a], [x + t, y - a], [x + t, y - t], [x + a, y - t], [x + a, y + t], [x + t, y + t], [x + t, y + a], [x - t, y + a], [x - t, y + t], [x - a, y + t], [x - a, y - t], [x - t, y - t]]; }
      case 'star': { const R = r * 1.45, ri = R * 0.45, o = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? ri : R; o.push([x + Math.cos(a) * q, y + Math.sin(a) * q]); } return o; }
      default: return null;
    }
  }
  function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r); ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
  }

  function canvasSurface(ctx, W, H) {
    const S = { kind: 'canvas', W, H, ctx };
    const alpha = a => { ctx.globalAlpha = a == null ? 1 : a; };
    const paint = o => {
      if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
      if (o.stroke && o.lw > 0) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw; ctx.lineJoin = 'round'; ctx.setLineDash(o.dash || []); ctx.stroke(); }
    };
    S.rect = (x, y, w, h, o = {}) => { ctx.save(); alpha(o.a); ctx.beginPath(); if (o.r) roundRectPath(ctx, x, y, w, h, o.r); else ctx.rect(x, y, w, h); paint(o); ctx.restore(); };
    S.path = (pts, o = {}) => {
      if (pts.length < 2) return;
      ctx.save(); alpha(o.a); ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      if (o.close) ctx.closePath();
      if (o.cap) ctx.lineCap = o.cap;
      paint(o); ctx.restore();
    };
    S.circle = (x, y, r, o = {}) => { ctx.save(); alpha(o.a); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); paint(o); ctx.restore(); };
    /* many markers of one shape and size; o: {fill, a, stroke, lw, merge} (merge = one path: fastest, overlaps are not blended) */
    S.markers = (shape, pts, r, o = {}) => {
      if (!pts.length) return;
      ctx.save(); alpha(o.a);
      const one = (x, y) => {
        const poly = shapePoly(shape, x, y, r);
        if (!poly) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); return; }
        ctx.moveTo(poly[0][0], poly[0][1]); for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]); ctx.closePath();
      };
      if (o.merge || pts.length > 9000) { ctx.beginPath(); for (const p of pts) one(p[0], p[1]); paint(o); }
      else for (const p of pts) { ctx.beginPath(); one(p[0], p[1]); paint(o); }
      ctx.restore();
    };
    S.text = (str, x, y, o = {}) => {
      ctx.save(); alpha(o.a); ctx.font = fontStr(o); ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.base || 'alphabetic';
      if (o.halo) { ctx.lineJoin = 'round'; ctx.lineWidth = o.haloW || 3; ctx.strokeStyle = o.halo; ctx.strokeText(str, x, y); }
      ctx.fillStyle = o.fill || '#000000'; ctx.fillText(str, x, y); ctx.restore();
    };
    S.measure = textWidth;
    S.image = (img, x, y, w, h, o = {}) => { ctx.save(); alpha(o.a); ctx.imageSmoothingEnabled = o.smooth !== false; ctx.drawImage(img, x, y, w, h); ctx.restore(); };
    S.gradRect = (x, y, w, h, stops, o = {}) => {
      ctx.save(); alpha(o.a);
      const g = o.vertical ? ctx.createLinearGradient(0, y + h, 0, y) : ctx.createLinearGradient(x, 0, x + w, 0);
      stops.forEach((c, i) => g.addColorStop(stops.length > 1 ? i / (stops.length - 1) : 0, c));
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h); ctx.restore();
    };
    S.clipStart = (x, y, w, h) => { ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); };
    /* clip to a set of closed rings (a region and its holes); the even-odd rule turns inner rings into holes */
    S.clipRings = rings => { ctx.save(); ringPath(ctx, rings); ctx.clip('evenodd'); };
    S.clipEnd = () => ctx.restore();
    S.scaleStart = u => { ctx.save(); ctx.scale(u, u); };
    S.scaleEnd = () => ctx.restore();
    S.rotateStart = (deg, cx, cy) => { ctx.save(); ctx.translate(cx, cy); ctx.rotate(deg * Math.PI / 180); ctx.translate(-cx, -cy); };
    S.rotateEnd = () => ctx.restore();
    return S;
  }

  function svgSurface(W, H, widthAttr, heightAttr) {
    const body = [], defs = []; let uid = 0;
    const S = { kind: 'svg', W, H };
    const xe = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const f = v => +(+v).toFixed(2);
    const paint = o => {
      let s = o.fill ? ` fill="${o.fill}"` : ' fill="none"';
      if (o.stroke && o.lw > 0) s += ` stroke="${o.stroke}" stroke-width="${f(o.lw)}" stroke-linejoin="round"` + (o.dash ? ` stroke-dasharray="${o.dash.join(' ')}"` : '') + (o.cap ? ` stroke-linecap="${o.cap}"` : '');
      if (o.a != null && o.a < 1) s += ` opacity="${f(o.a)}"`;
      return s;
    };
    const poly = (pts, close) => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L') + (close ? 'Z' : '');
    S.rect = (x, y, w, h, o = {}) => { body.push(`<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"${o.r ? ` rx="${f(Math.min(o.r, w / 2, h / 2))}"` : ''}${paint(o)}/>`); };
    S.path = (pts, o = {}) => { if (pts.length >= 2) body.push(`<path d="${poly(pts, o.close)}"${paint(o)}/>`); };
    S.circle = (x, y, r, o = {}) => { body.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}"${paint(o)}/>`); };
    S.markers = (shape, pts, r, o = {}) => {
      if (!pts.length) return;
      const g = paint(o).replace(/ opacity="[^"]*"/, '');
      body.push(`<g${g}${o.a != null && o.a < 1 ? ` opacity="${f(o.a)}"` : ''}>` + pts.map(p => {
        const pl = shapePoly(shape, p[0], p[1], r);
        if (!pl) return `<circle cx="${f(p[0])}" cy="${f(p[1])}" r="${f(r)}"/>`;
        return `<path d="${poly(pl, true)}"/>`;
      }).join('') + '</g>');
    };
    S.text = (str, x, y, o = {}) => {
      const fam = (o.family || FONTS.sans).replace(/"/g, "'");
      let s = `<text x="${f(x)}" y="${f(y)}" font-family="${fam}" font-size="${o.size || 12}" font-weight="${o.weight || 400}"` +
        (o.italic ? ' font-style="italic"' : '') + ` text-anchor="${o.align === 'center' ? 'middle' : o.align === 'right' ? 'end' : 'start'}"` +
        (o.base === 'middle' ? ' dominant-baseline="central"' : o.base === 'top' ? ' dominant-baseline="hanging"' : '') +
        ` fill="${o.fill || '#000000'}"` + (o.a != null && o.a < 1 ? ` opacity="${f(o.a)}"` : '');
      if (o.halo) s += ` stroke="${o.halo}" stroke-width="${o.haloW || 3}" stroke-linejoin="round" paint-order="stroke"`;
      body.push(s + `>${xe(str)}</text>`);
    };
    S.measure = textWidth;
    S.image = (img, x, y, w, h, o = {}) => {
      let url = '';
      try {
        if (img.src && String(img.src).startsWith('data:')) url = img.src;
        else { const c = document.createElement('canvas'); c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height; c.getContext('2d').drawImage(img, 0, 0); url = c.toDataURL('image/png'); }
      } catch (e) { return; }
      body.push(`<image x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" href="${url}" preserveAspectRatio="none"${o.a != null && o.a < 1 ? ` opacity="${f(o.a)}"` : ''}` +
        (o.smooth === false ? ' style="image-rendering:pixelated"' : '') + '/>');
    };
    S.gradRect = (x, y, w, h, stops, o = {}) => {
      const id = 'g' + (++uid);
      defs.push(`<linearGradient id="${id}" ${o.vertical ? 'x1="0" y1="1" x2="0" y2="0"' : 'x1="0" y1="0" x2="1" y2="0"'}>` +
        stops.map((c, i) => `<stop offset="${f(stops.length > 1 ? i / (stops.length - 1) : 0)}" stop-color="${c}"/>`).join('') + '</linearGradient>');
      body.push(`<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="url(#${id})"${o.a != null && o.a < 1 ? ` opacity="${f(o.a)}"` : ''}/>`);
    };
    S.clipStart = (x, y, w, h) => { const id = 'c' + (++uid); defs.push(`<clipPath id="${id}"><rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"/></clipPath>`); body.push(`<g clip-path="url(#${id})">`); };
    S.clipRings = rings => {
      const id = 'k' + (++uid), d = rings.map(r => poly(r, true)).join('');
      defs.push(`<clipPath id="${id}" clipPathUnits="userSpaceOnUse"><path d="${d}" clip-rule="evenodd"/></clipPath>`);
      body.push(`<g clip-path="url(#${id})">`);
    };
    S.clipEnd = () => body.push('</g>');
    S.scaleStart = u => body.push(`<g transform="scale(${u})">`);
    S.scaleEnd = () => body.push('</g>');
    S.rotateStart = (deg, cx, cy) => body.push(`<g transform="rotate(${f(deg)} ${f(cx)} ${f(cy)})">`);
    S.rotateEnd = () => body.push('</g>');
    S.finish = () => `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${widthAttr || W}" height="${heightAttr || H}" viewBox="0 0 ${f(W)} ${f(H)}">` +
      (defs.length ? `<defs>${defs.join('')}</defs>` : '') + body.join('\n') + '</svg>';
    return S;
  }

  /* ================= map view (lat/lon <-> container pixels) ================= */
  function mapView(map) {
    const size = map.getSize(), z = map.getZoom(), sc = 256 * Math.pow(2, z), org = map.getPixelOrigin(), off = map.layerPointToContainerPoint(L.point(0, 0));
    const ox = off.x - org.x, oy = off.y - org.y;
    return {
      W: size.x, H: size.y, zoom: z, box: [0, 0, size.x, size.y],
      proj(lat, lon) {
        const s = Math.sin(clamp(lat, -85.0511287798, 85.0511287798) / R2D);
        return [(lon + 180) / 360 * sc + ox, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * sc + oy];
      },
      unproj(x, y) { const p = map.containerPointToLatLng([x, y]); return [p.lat, p.lng]; },
      mPerPx() {                                   // metres per pixel at the centre of the view
        const a = this.unproj(this.W / 2, this.H / 2), b = this.unproj(this.W / 2 + 100, this.H / 2);
        return haversineKm(a[0], a[1], b[0], b[1]) * 1000 / 100;
      },
    };
  }

  /* ================= clipping to a country or to the chosen regions =================
     The region layers of js/regions.js keep every region as { n, b:[w,s,e,n], p:[polygon, …] }, where a polygon is an
     array of rings and a ring is a flat [lon, lat, lon, lat, …] array: the first ring is the outline and the rest are
     holes. Everything here works on those rings, projected with the very same transform the composition uses. */
  const CLIP_TARGETS = ['selected', 'mexico', 'layer'];
  const regLayer = id => (typeof window.regionLayer === 'function' ? window.regionLayer(id) : null);
  /* the regions a clip target stands for (an empty list means "nothing to clip to") */
  function clipRegions(what) {
    if (what === 'mexico') { const l = regLayer('mx-states'); return l ? l.regions : []; }
    if (what === 'layer') { const l = regLayer(); return l ? l.regions : []; }
    const names = typeof window.selectedRegionNames === 'function' ? window.selectedRegionNames() : [];
    const l = regLayer();
    if (!names.length || !l) return [];
    const want = new Set(names);
    return l.regions.filter(r => want.has(r.n));
  }
  const clipLabel = what => what === 'mexico' ? T('todo México', 'the whole of Mexico')
    : what === 'layer' ? T('toda la capa de regiones', 'the whole region layer') : T('los estados o regiones elegidos', 'the chosen states or regions');
  /* bounding box of a set of regions as Leaflet bounds, or null */
  function regionsBoundsOf(regs) {
    if (!regs || !regs.length) return null;
    let W = Infinity, S = Infinity, E = -Infinity, N = -Infinity;
    regs.forEach(r => { const b = r.b; if (!b) return; W = Math.min(W, b[0]); S = Math.min(S, b[1]); E = Math.max(E, b[2]); N = Math.max(N, b[3]); });
    return isFinite(W) ? L.latLngBounds([S, W], [N, E]) : null;
  }
  /* Every ring projected into drawing pixels (scale = output pixels per container pixel). Rings whose box falls
     wholly outside the picture are dropped, which keeps 600 dpi fast when only a few states are kept. */
  function projectClip(regs, view, scale, box) {
    const out = [], s = scale || 1;
    for (const reg of regs) for (const pol of reg.p) for (const ring of pol) {
      const n = ring.length; if (n < 6) continue;
      const pts = new Array(n / 2);
      let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
      for (let i = 0, j = 0; i < n; i += 2, j++) {
        const p = view.proj(ring[i + 1], ring[i]), x = p[0] * s, y = p[1] * s;
        pts[j] = [x, y];
        if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
      }
      if (maxx < box[0] || minx > box[2] || maxy < box[1] || miny > box[3]) continue;
      out.push(pts);
    }
    return out;
  }
  function ringPath(ctx, rings) {
    ctx.beginPath();
    for (const r of rings) {
      if (r.length < 3) continue;
      ctx.moveTo(r[0][0], r[0][1]);
      for (let i = 1; i < r.length; i++) ctx.lineTo(r[i][0], r[i][1]);
      ctx.closePath();
    }
  }
  const boxRing = box => [[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]];
  /* Outline of the clipped area.
     - 'all' strokes every ring, so a whole country also gets its internal divisions.
     - 'outer' strokes only the silhouette, with the internal borders dissolved. The drawing is first clipped to
       everything OUTSIDE the union of the rings (a rectangle plus the rings under the even-odd rule, which is the
       exact complement of the clip itself), and every ring is then stroked at twice the width. The half of the
       stroke that falls inside the union is cut away, and a border shared by two neighbours lies inside the union
       on both of its sides, so it disappears altogether; only the outer edge survives, at the asked-for width.
       Each separate piece of a region (a peninsula, an island) keeps its own outline, and so does every hole,
       because a hole is outside the union too. */
  function strokeRingsCanvas(ctx, rings, box, outer, color, lw) {
    if (!rings.length || !(lw > 0)) return;
    ctx.save();
    if (outer) { ringPath(ctx, [boxRing(box), ...rings]); ctx.clip('evenodd'); }
    ringPath(ctx, rings);
    ctx.strokeStyle = color; ctx.lineWidth = outer ? lw * 2 : lw; ctx.lineJoin = 'round'; ctx.setLineDash([]);
    ctx.stroke();
    ctx.restore();
  }
  function strokeRingsSvg(S, rings, box, outer, color, lw) {
    if (!rings.length || !(lw > 0)) return;
    if (outer) S.clipRings([boxRing(box), ...rings]);
    rings.forEach(r => S.path(r, { close: true, stroke: color, lw: outer ? lw * 2 : lw }));
    if (outer) S.clipEnd();
  }

  /* ================= data drawing ================= */
  /* Heat map: every point splats a smooth kernel into a float grid; the grid is scaled by its 99th percentile so that the
     hottest cores reach the top of the ramp whatever the number of points, then coloured with the ramp. Computed at (at most)
     screen resolution and drawn smoothed, which is what a heat map is anyway. */
  function heatCanvas(px, box, res, st, stops) {
    res = Math.min(res, 1);
    const bw = box[2] - box[0], bh = box[3] - box[1];
    const w = Math.max(1, Math.round(bw * res)), h = Math.max(1, Math.round(bh * res));
    const r = Math.max(2, Math.round(st.heatRadius * res)), ks = r * 2 + 1, r2 = r * r, ker = new Float32Array(ks * ks), dens = new Float32Array(w * h);
    for (let j = 0; j < ks; j++) for (let i = 0; i < ks; i++) { const d2 = (i - r) * (i - r) + (j - r) * (j - r); ker[j * ks + i] = d2 <= r2 ? (1 - d2 / r2) * (1 - d2 / r2) : 0; }
    for (const p of px) {
      const cx = Math.round((p[0] - box[0]) * res), cy = Math.round((p[1] - box[1]) * res);
      const x0 = Math.max(0, cx - r), x1 = Math.min(w - 1, cx + r), y0 = Math.max(0, cy - r), y1 = Math.min(h - 1, cy + r);
      for (let y = y0; y <= y1; y++) { let ki = (y - cy + r) * ks + (x0 - cx + r), di = y * w + x0; for (let x = x0; x <= x1; x++) dens[di++] += ker[ki++]; }
    }
    let mx = 0; for (let i = 0; i < dens.length; i++) if (dens[i] > mx) mx = dens[i];
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    if (mx <= 0) return cv;
    const hist = new Uint32Array(256); let npos = 0;
    for (let i = 0; i < dens.length; i++) if (dens[i] > 0) { hist[Math.min(255, Math.floor(dens[i] / mx * 255))]++; npos++; }
    let acc = 0, pb = 255; for (let b = 0; b < 256; b++) { acc += hist[b]; if (acc >= npos * 0.99) { pb = b; break; } }
    const pmax = Math.max(mx * (pb + 1) / 256, mx * 0.05), gain = 0.3 + 3 * clamp(st.heatIntensity, 0.05, 1), fa = clamp(st.fillAlpha, 0.1, 1);
    const lut = Array.from({ length: 256 }, (_, i) => hexRgb(rampAt(stops, i / 255)));
    const ctx = cv.getContext('2d'), img = ctx.createImageData(w, h), d = img.data;
    for (let i = 0; i < dens.length; i++) {
      const v = dens[i]; if (v <= 0) continue;
      const t = Math.min(1, v / pmax * gain), c = lut[Math.round(t * 255)], o = i * 4;
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = Math.round(255 * fa * Math.min(1, t * 2.4));
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  /* scene: {mode, items:[{lat, lon, c, rm}], grid:{cells}, extras:[{pts, stroke, fill, fa, lw, dash}]}; opt: {dark, res} */
  function drawData(S, view, scene, st, opt) {
    /* opt.us: sizes are multiplied when the map is drawn on a bigger container than the layout (sharper export tiles) */
    const us = opt.us || 1, mode = scene.mode || 'points', box = view.box, R = st.radius * us, items = scene.items || [];
    st = us === 1 ? st : Object.assign({}, st, { outlineW: st.outlineW * us, halo: st.halo * us, heatRadius: st.heatRadius * us });
    if (mode === 'grid' && scene.grid) {
      for (const c of scene.grid.cells) {
        const a = view.proj(c.lat0, c.lon0), b = view.proj(c.lat1, c.lon1);
        const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]), w = Math.abs(b[0] - a[0]), h = Math.abs(b[1] - a[1]);
        if (x > box[2] || y > box[3] || x + w < box[0] || y + h < box[1]) continue;
        S.rect(x, y, w, h, { fill: c.c, a: st.fillAlpha, stroke: mixHex(c.c, opt.dark ? '#000000' : '#ffffff', 0.5), lw: w > 6 * us ? 0.6 * us : 0 });
      }
    }
    const inView = [], m = R * 3 + 30;
    for (const it of items) {
      const p = view.proj(it.lat, it.lon);
      if (p[0] < box[0] - m || p[0] > box[2] + m || p[1] < box[1] - m || p[1] > box[3] + m) continue;
      inView.push({ it, p });
    }
    if (mode === 'heat') {
      const stops = rampStops(st.ramp, st.rampRev, st.whiteMin);
      const cv = heatCanvas(inView.map(o => o.p), box, opt.res || 1, st, stops);
      S.image(cv, box[0], box[1], box[2] - box[0], box[3] - box[1], { smooth: true });
      return;
    }
    if (mode === 'grid') return;
    for (const e of scene.extras || []) {
      const px = e.pts.map(q => view.proj(q[0], q[1]));
      if (e.fill) S.path(px, { close: true, fill: e.fill, a: e.fa == null ? 0.12 : e.fa });
      if (e.stroke) S.path(px, { close: true, stroke: e.stroke, lw: (e.lw || 1.5) * us, dash: e.dash ? e.dash.map(d => d * us) : e.dash });
    }
    if (!inView.length) return;
    const groups = new Map();
    for (const o of inView) {
      const col = o.it.c === '@ink' ? (opt.dark ? INK_DARK : INK) : o.it.c;      // '@ink': dark on light maps, light on dark maps
      const key = col + '|' + (o.it.rm || 1);
      let g = groups.get(key); if (!g) { g = { c: col, rm: o.it.rm || 1, pts: [] }; groups.set(key, g); }
      g.pts.push(o.p);
    }
    if (st.halo > 0) for (const g of groups.values()) S.markers(st.shape, g.pts, R * g.rm + st.halo, { fill: opt.dark ? '#000000' : '#ffffff', a: 0.55, merge: true });
    for (const g of groups.values())
      S.markers(st.shape, g.pts, R * g.rm, lum(g.c) > 0.93   // (near) white fill: keep it visible with a grey outline
        ? { fill: g.c, a: st.fillAlpha, stroke: '#5b6874', lw: Math.max(0.8 * us, st.outlineW) }
        : { fill: g.c, a: st.fillAlpha, stroke: st.outlineW > 0 ? st.outlineColor : null, lw: st.outlineW * (g.rm < 1 ? 0.5 : 1) });
  }

  /* what is under a click: {lat, lon, html} or null */
  function hitTest(view, scene, st, x, y) {
    if (scene.mode === 'heat') return null;
    if (scene.mode === 'grid' && scene.grid) {
      const ll = view.unproj(x, y), g = scene.grid, c = g.cells.find(k => ll[0] >= k.lat0 && ll[0] < k.lat1 && ll[1] >= k.lon0 && ll[1] < k.lon1);
      return c ? { lat: ll[0], lon: ll[1], html: `<b>${c.n}</b> ${T('registro(s)', 'record(s)')}<br><span style="color:#888">${fmt(c.lat0, 2)}°, ${fmt(c.lon0, 2)}° → ${fmt(c.lat1, 2)}°, ${fmt(c.lon1, 2)}°</span>` } : null;
    }
    let best = null, bd = Infinity;
    for (const it of scene.items || []) {
      if (!it.tip) continue;
      const p = view.proj(it.lat, it.lon), d = Math.hypot(p[0] - x, p[1] - y), lim = st.radius * (it.rm || 1) + 4;
      if (d <= lim && d < bd) { bd = d; best = it; }
    }
    if (!best) return null;
    return { lat: best.lat, lon: best.lon, html: typeof best.tip === 'function' ? best.tip() : best.tip };
  }

  /* the layer that hosts the data on a Leaflet map (a canvas in its own pane, redrawn when the view changes) */
  const DataLayer = L.Layer.extend({
    initialize(studio) { this._studio = studio; },
    onAdd(map) {
      if (!map.getPane('bmpData')) { const p = map.createPane('bmpData'); p.style.zIndex = 450; p.style.pointerEvents = 'none'; }
      this._canvas = L.DomUtil.create('canvas', 'leaflet-zoom-animated bmp-data-canvas');
      map.getPane('bmpData').appendChild(this._canvas);
      map.on('click', this._onClick, this);
      this._reset();
    },
    onRemove(map) { map.off('click', this._onClick, this); L.DomUtil.remove(this._canvas); this._canvas = null; },
    getEvents() { return { moveend: this._reset, resize: this._reset, zoomanim: this._animateZoom }; },
    redraw() { if (this._canvas) this._draw(); },
    _reset() {
      if (!this._canvas) return;
      const map = this._map, size = map.getSize(), pad = size.multiplyBy(0.15).round(), c = this._canvas, r = dpr();
      this._pad = pad; this._min = map.containerPointToLayerPoint(pad.multiplyBy(-1)).round();
      const w = size.x + pad.x * 2, h = size.y + pad.y * 2;
      c.width = Math.round(w * r); c.height = Math.round(h * r); c.style.width = w + 'px'; c.style.height = h + 'px';
      L.DomUtil.setPosition(c, this._min);
      this._center = map.getCenter(); this._zoom = map.getZoom();
      this._draw();
    },
    _draw() {
      const c = this._canvas, map = this._map; if (!c) return;
      const r = dpr(), ctx = c.getContext('2d'), tl = map.layerPointToContainerPoint(this._min), st = this._studio;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height);
      ctx.setTransform(r, 0, 0, r, -tl.x * r, -tl.y * r);
      const view = mapView(map); view.box = [tl.x, tl.y, tl.x + c.width / r, tl.y + c.height / r];
      try { drawData(canvasSurface(ctx, view.W, view.H), view, st.scene(), st.style, { dark: st.isDark(), res: r }); }
      catch (e) { console.warn('map studio: data layer failed', e); }
    },
    _animateZoom(e) {
      const map = this._map, scale = map.getZoomScale(e.zoom, this._zoom), half = map.getSize().multiplyBy(0.5).add(this._pad);
      const off = half.multiplyBy(-scale).add(map.project(this._center, e.zoom)).subtract(map._getNewPixelOrigin(e.center, e.zoom));
      L.DomUtil.setTransform(this._canvas, off, scale);
    },
    _onClick(e) {
      const hit = hitTest(mapView(this._map), this._studio.scene(), this._studio.style, e.containerPoint.x, e.containerPoint.y);
      if (hit) L.popup({ maxWidth: 320 }).setLatLng([hit.lat, hit.lon]).setContent(hit.html).openOn(this._map);
    },
  });

  /* ================= decoration: graticule, title, north arrow, legend, scale bar, credit, frame ================= */
  const INK = '#17212b', PAPER = '#ffffff', INK_DARK = '#f4f6f8', PANEL_DARK = '#111a22';
  const haloFor = fill => lum(fill) > 0.5 ? '#000000' : '#ffffff';

  /* Every piece of text has its own size, weight, style and colour in the style; textScale multiplies them all. Sizes are
     in layout pixels (the decoration is scaled with the layout, see drawDecorScaled). autoSize is used when the size is 0.
     Some pieces may also carry their own font family (key `font`); empty means "follow the family of the whole map". */
  const TXTKEYS = {
    title: { size: 'titleSize', bold: 'titleBold', italic: 'italic', color: 'titleColor', font: 'titleFont' },
    subtitle: { size: 'subSize', bold: 'subBold', italic: 'subItalic', color: 'subColor', font: 'subFont' },
    credit: { size: 'creditSize', bold: 'creditBold', italic: 'creditItalic', color: 'creditColor', font: 'creditFont' },
    legTitle: { size: 'legTitleSize', bold: 'legTitleBold', italic: 'legTitleItalic', color: 'legTitleColor', font: 'legTitleFont' },
    legLabel: { size: 'legendSize', bold: 'legLabelBold', italic: 'legLabelItalic', color: 'legLabelColor', font: 'legLabelFont' },
    scale: { size: 'scaleSize', bold: 'scaleBold', italic: 'scaleItalic', color: 'scaleColor' },
    grat: { size: 'gratSize', bold: 'gratBold', italic: 'gratItalic', color: 'gratLabelColor' },
    north: { size: 'northLetterSize', bold: 'northBold', italic: 'northItalic', color: 'northColor' },
  };
  /* the family of one piece of text: its own when it has one, otherwise the family of the whole map */
  function familyOf(st, k) { const own = k && k.font ? st[k.font] : ''; return FONTS[own] || FONTS[st.font] || FONTS.sans; }
  function fontOf(st, key, autoSize) {
    const k = TXTKEYS[key], sc = clamp(+st.textScale || 1, 0.3, 4), own = +st[k.size];
    return { size: (own > 0 ? own : autoSize) * sc, weight: st[k.bold] ? 700 : 400, italic: !!st[k.italic], family: familyOf(st, k), fill: st[k.color] || null };
  }

  function wrapText(S, str, o, maxW) {
    const words = String(str).split(/\s+/).filter(Boolean), lines = []; let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (cur && S.measure(t, o) > maxW) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  }
  const niceStep = span => { const c = [0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 45, 90]; return c.find(s => span / s <= 9) || 90; };
  const degLabel = (v, isLat, dec) => {
    const a = Math.abs(v), s = a < 1e-9 ? '' : isLat ? (v < 0 ? 'S' : 'N') : (v < 0 ? T('O', 'W') : 'E');
    return a.toFixed(dec) + '°' + s;
  };

  /* colours and margins shared by every decoration block */
  function decorContext(view, st, info) {
    const dark = info.dark, inset = st.frameOn ? st.frameMargin + st.frameWidth : 0, fg = st.textAuto ? (dark ? INK_DARK : INK) : st.textColor;
    return { W: view.W, H: view.H, dark, inset, edge: 10 + inset, fg, halo: haloFor(fg), paper: dark ? '#1a232c' : PAPER, ink: dark ? INK_DARK : INK, mapHalo: dark ? '#000000' : '#ffffff' };
  }

  function drawGraticule(S, view, st, c, avoid) {
    const tl = view.unproj(0, 0), br = view.unproj(view.W, view.H), inset = c.inset;
    const N = tl[0], Sx = br[0], Wl = tl[1], E = br[1];
    const step = niceStep(Math.max(Math.abs(N - Sx), Math.abs(E - Wl))), dec = step < 0.05 ? 3 : step < 0.5 ? 2 : step < 1 ? 1 : 0;
    const f = fontOf(st, 'grat', 12), fill = f.fill || c.ink;
    const line = { stroke: st.gratColor, lw: 0.7, a: st.gratAlpha }, lab = { ...f, fill, halo: f.fill ? haloFor(f.fill) : c.mapHalo, haloW: 2.6, a: 0.95 };
    const lat0 = Math.floor(Sx / step) * step, lon0 = Math.floor(Wl / step) * step, fs = f.size;
    const hit = (x, y, w, h) => (avoid || []).some(r => x < r[2] + 6 && x + w > r[0] - 6 && y < r[3] + 6 && y + h > r[1] - 6);   // label boxes are moved out of the way of the title
    for (let lat = lat0; lat <= N + 1e-9; lat += step) {
      const y = view.proj(lat, Wl)[1]; if (y < 0 || y > view.H) continue;
      S.path([[0, y], [view.W, y]], line);
      const lt = degLabel(lat, true, dec);
      if (y > inset + fs + 6 && y < view.H - inset - fs - 8 && !hit(inset + 4, y - 3 - fs, S.measure(lt, lab), fs * 1.2)) S.text(lt, inset + 4, y - 3, lab);
    }
    for (let lon = lon0; lon <= E + 1e-9; lon += step) {
      const x = view.proj(N, lon)[0]; if (x < 0 || x > view.W) continue;
      S.path([[x, 0], [x, view.H]], line);
      const ln = degLabel(lon, false, dec);
      if (x > inset + fs * 2.6 && x < view.W - inset - fs * 2.6 && !hit(x + 3, view.H - inset - 4 - fs, S.measure(ln, lab), fs * 1.2)) S.text(ln, x + 3, view.H - inset - 4, lab);
    }
  }

  /* ---------- north arrows ---------- */
  const NORTH_STYLES = ['arrow', 'rose', 'minimal', 'rose4', 'rose8', 'rose16', 'star', 'needle', 'circleN', 'triangleN', 'modern'];
  const NORTH_NAMES = { arrow: ['Flecha', 'Arrow'], rose: ['Rosa', 'Rose'], minimal: ['Mínima', 'Minimal'], rose4: ['Rosa 4 puntas', '4-point rose'], rose8: ['Rosa 8 puntas', '8-point rose'],
    rose16: ['Rosa 16 puntas', '16-point rose'], star: ['Estrella', 'Star'], needle: ['Aguja', 'Needle'], circleN: ['N en círculo', 'Circled N'], triangleN: ['Triángulo', 'Triangle'], modern: ['Moderna', 'Modern'] };
  function northGeom(style, size, letters, fs) {
    const top = letters ? fs * 1.3 : 0;
    switch (style) {
      case 'rose': return { w: size, h: (letters ? fs * 1.15 : 0) + size };
      case 'minimal': return { w: size, h: top + size * 0.85 };
      case 'rose4': case 'rose8': case 'rose16': return { w: size, h: size };
      case 'star': return { w: size, h: (letters ? fs * 1.2 : 0) + size * 0.9 };
      case 'circleN': return { w: size, h: size * 1.05 };
      case 'triangleN': return { w: size, h: size * 0.95 };
      default: return { w: size, h: top + size * 0.95 };            // arrow, needle, modern
    }
  }
  /* compass points: [direction in degrees clockwise from north, length, half width] as fractions of the radius */
  function rosePoints(kind) {
    const out = [0, 90, 180, 270].map(a => [a, 1, kind === 'rose4' ? 0.2 : kind === 'rose8' ? 0.17 : 0.15]);
    if (kind !== 'rose4') [45, 135, 225, 315].forEach(a => out.push([a, kind === 'rose8' ? 0.64 : 0.72, kind === 'rose8' ? 0.13 : 0.11]));
    if (kind === 'rose16') for (let k = 0; k < 8; k++) out.push([22.5 + k * 45, 0.5, 0.07]);
    return out.sort((a, b) => a[1] - b[1]);
  }
  function drawRose(S, cx, cy, R, kind, ink, paper) {
    if (kind === 'rose8') S.circle(cx, cy, R * 0.5, { stroke: ink, lw: 0.9, a: 0.8 });
    if (kind === 'rose16') S.circle(cx, cy, R * 0.78, { stroke: ink, lw: 0.9, a: 0.8 });
    rosePoints(kind).forEach(([deg, len, hw]) => {
      const a = (deg - 90) / R2D, tip = [cx + Math.cos(a) * R * len, cy + Math.sin(a) * R * len], w = R * hw;
      const b1 = [cx + Math.cos(a - Math.PI / 2) * w, cy + Math.sin(a - Math.PI / 2) * w], b2 = [cx + Math.cos(a + Math.PI / 2) * w, cy + Math.sin(a + Math.PI / 2) * w];
      S.path([tip, b1, [cx, cy]], { close: true, fill: ink, stroke: ink, lw: 0.8 });
      S.path([tip, b2, [cx, cy]], { close: true, fill: paper, stroke: ink, lw: 0.8 });
    });
  }
  /* o: {ink, paper, halo, letters, f (font of the letters), rot} */
  function drawNorthSymbol(S, x, y, size, style, o) {
    const { ink, paper, halo, letters, f } = o, fs = f.size, letFill = f.fill || ink, g = northGeom(style, size, letters, fs), cx = x + g.w / 2, cyc = y + g.h / 2;
    const lab = (str, px, py, extra) => S.text(str, px, py, { size: fs, weight: f.weight, italic: f.italic, family: f.family, fill: letFill, halo, haloW: 2.6, align: 'center', base: 'middle', ...extra });
    if (o.rot) S.rotateStart(o.rot, cx, cyc);
    try {
      if (style === 'rose4' || style === 'rose8' || style === 'rose16') {
        const R = Math.max(size * 0.22, size / 2 - (letters ? fs * 0.95 : 2));
        drawRose(S, cx, cyc, R, style, ink, paper);
        if (letters) { const d = R + fs * 0.7; lab('N', cx, cyc - d); lab('E', cx + d, cyc); lab('S', cx, cyc + d); lab(T('O', 'W'), cx - d, cyc); }
      } else if (style === 'rose') {
        const top = letters ? fs * 1.15 : 0, cy = y + top + size / 2, R = size * 0.5, ri = R * 0.27;
        if (letters) lab('N', cx, y + fs * 0.6);
        S.circle(cx, cy, R * 0.78, { stroke: ink, lw: 1, a: 0.85 });
        [45, 135, 225, 315].forEach(deg => {
          const a = deg / R2D, tip = [cx + Math.cos(a) * R * 0.6, cy - Math.sin(a) * R * 0.6], w = R * 0.11, nx = Math.sin(a) * w, ny = Math.cos(a) * w;
          S.path([tip, [cx + nx, cy + ny], [cx - nx, cy - ny]], { close: true, fill: ink, a: 0.55 });
        });
        [-90, 0, 90, 180].forEach(deg => {
          const a = deg / R2D, tip = [cx + Math.cos(a) * R, cy + Math.sin(a) * R];
          const i1 = [cx + Math.cos(a - Math.PI / 4) * ri * 1.4, cy + Math.sin(a - Math.PI / 4) * ri * 1.4], i2 = [cx + Math.cos(a + Math.PI / 4) * ri * 1.4, cy + Math.sin(a + Math.PI / 4) * ri * 1.4];
          S.path([tip, i1, [cx, cy]], { close: true, fill: ink, stroke: ink, lw: 0.8 });
          S.path([tip, i2, [cx, cy]], { close: true, fill: paper, stroke: ink, lw: 0.8 });
        });
      } else if (style === 'minimal') {
        const top = y + (letters ? fs * 1.3 : 0), bot = y + g.h;
        if (letters) lab('N', cx, y + fs * 0.6);
        S.path([[cx, bot], [cx, top]], { stroke: halo, lw: 4, a: 0.7, cap: 'round' });
        S.path([[cx, bot], [cx, top]], { stroke: ink, lw: 1.6, cap: 'round' });
        const head = [[cx - size * 0.13, top + size * 0.2], [cx, top], [cx + size * 0.13, top + size * 0.2]];
        S.path(head, { stroke: halo, lw: 4, a: 0.7, cap: 'round' }); S.path(head, { stroke: ink, lw: 1.6, cap: 'round' });
      } else if (style === 'star') {
        const top = letters ? fs * 1.2 : 0, R = size * 0.45, cy = y + top + R, pts = [];
        for (let k = 0; k < 8; k++) {
          const a = (k * 45 - 90) / R2D, b = (k * 45 - 67.5) / R2D, L = k % 2 ? 0.62 : 1;
          pts.push([cx + Math.cos(a) * R * L, cy + Math.sin(a) * R * L], [cx + Math.cos(b) * R * 0.22, cy + Math.sin(b) * R * 0.22]);
        }
        if (letters) lab('N', cx, y + fs * 0.6);
        S.path(pts, { close: true, fill: ink, stroke: ink, lw: 0.8 });
        S.circle(cx, cy, R * 0.12, { fill: paper, stroke: ink, lw: 0.8 });
      } else if (style === 'needle') {
        const top = letters ? fs * 1.3 : 0, hh = size * 0.475, cy = y + top + hh, hw = size * 0.16;
        if (letters) lab('N', cx, y + fs * 0.6);
        S.path([[cx, cy - hh], [cx + hw, cy], [cx - hw, cy]], { close: true, fill: ink, stroke: ink, lw: 1 });
        S.path([[cx, cy + hh], [cx + hw, cy], [cx - hw, cy]], { close: true, fill: paper, stroke: ink, lw: 1 });
        S.circle(cx, cy, size * 0.04, { fill: paper, stroke: ink, lw: 0.9 });
      } else if (style === 'circleN') {
        const R = size * 0.36, ah = size * 0.26, cy = y + ah + size * 0.03 + R;
        S.path([[cx, y], [cx - R * 0.5, y + ah], [cx + R * 0.5, y + ah]], { close: true, fill: ink, stroke: ink, lw: 0.8 });
        S.circle(cx, cy, R, { fill: paper, stroke: ink, lw: 1.6 });
        if (letters) lab('N', cx, cy, { size: Math.max(fs, R * 0.95) });
      } else if (style === 'triangleN') {
        const bot = y + g.h;
        S.path([[cx, y + 1], [cx + size * 0.4, bot], [cx - size * 0.4, bot]], { close: true, fill: ink, stroke: ink, lw: 1 });
        if (letters) lab('N', cx, y + g.h * 0.7, { size: Math.min(fs, size * 0.36), fill: paper, halo: null });
      } else if (style === 'modern') {
        const top = y + (letters ? fs * 1.3 : 0), bot = y + g.h - size * 0.05;
        if (letters) lab('N', cx, y + fs * 0.6);
        S.path([[cx, bot], [cx, top + size * 0.28]], { stroke: halo, lw: 3.6, a: 0.6, cap: 'round' });
        S.path([[cx, bot], [cx, top + size * 0.28]], { stroke: ink, lw: 1.3, cap: 'round' });
        S.path([[cx, top], [cx - size * 0.14, top + size * 0.3], [cx + size * 0.14, top + size * 0.3]], { close: true, fill: ink, stroke: ink, lw: 0.8 });
        S.circle(cx, bot, size * 0.05, { fill: paper, stroke: ink, lw: 1.1 });
      } else {                                                      // 'arrow'
        const top = letters ? fs * 1.3 : 0, tip = y + top, bot = y + g.h, notch = bot - size * 0.3, hw = size * 0.3;
        if (letters) lab('N', cx, y + fs * 0.6);
        S.path([[cx, tip], [cx, notch], [cx - hw, bot]], { close: true, fill: ink, stroke: ink, lw: 1 });
        S.path([[cx, tip], [cx + hw, bot], [cx, notch]], { close: true, fill: paper, stroke: ink, lw: 1 });
      }
    } finally { if (o.rot) S.rotateEnd(); }
  }
  /* small preview of a north arrow for the style picker (ink and paper are plain colours) */
  function drawNorthThumb(canvas, style, ink, paper) {
    const r = dpr(), n = 56; canvas.width = n * r; canvas.height = n * r; canvas.style.width = canvas.style.height = n + 'px';
    const ctx = canvas.getContext('2d'); ctx.setTransform(r, 0, 0, r, 0, 0); ctx.clearRect(0, 0, n, n);
    const S = canvasSurface(ctx, n, n), size = 34, f = { size: 9, weight: 700, italic: false, family: FONTS.sans, fill: null }, g = northGeom(style, size, true, 9);
    drawNorthSymbol(S, (n - g.w) / 2, (n - g.h) / 2, size, style, { ink, paper, halo: paper, letters: true, f, rot: 0 });
  }
  function northBlock(S, st, c) {
    if (st.north === 'off') return null;
    const size = clamp(+st.northSize || 46, 24, 200), letters = st.northLetters !== false, f = fontOf(st, 'north', Math.max(9, size * (/^rose\d/.test(st.north) ? 0.17 : 0.3))), g = northGeom(st.north, size, letters, f.size);
    const o = { ink: st.northInk || c.ink, paper: st.northPaper || c.paper, halo: c.mapHalo, letters, f, rot: +st.northRot || 0 };
    return { corner: st.northPos, mg: +st.northMargin || 0, w: g.w, h: g.h, draw: (x, y) => drawNorthSymbol(S, x, y, size, st.north, o) };
  }

  /* ---------- scale bars ---------- */
  const SCALE_UNITS = { km: [1000, 'km'], mi: [1609.344, 'mi'], nmi: [1852, 'nmi'], m: [1, 'm'], ft: [0.3048, 'ft'] };
  const SCALE_STYLES = ['alt', 'line', 'solid', 'stepped', 'ruler', 'text', 'dual', 'ratio'];
  /* nice lengths: 1, 2, 5 x 10^n (the largest that is not above max) */
  function niceLength(max) {
    if (!(max > 0)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(max)));
    for (const m of [5, 2, 1, 0.5, 0.2, 0.1]) if (m * p <= max) return m * p;
    return p * 0.1;
  }
  const fmtNum = v => String(Math.round(v * 100) / 100);
  const groupDigits = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const ratioText = N => N > 0 ? '1:' + groupDigits(Math.round(N / Math.pow(10, Math.max(0, Math.floor(Math.log10(N)) - 1))) * Math.pow(10, Math.max(0, Math.floor(Math.log10(N)) - 1))) : '—';
  function scaleBlock(S, view, st, c, info) {
    const mpp = view.mPerPx(); if (!isFinite(mpp) || mpp <= 0) return null;
    const style = SCALE_STYLES.includes(st.scaleStyle) ? st.scaleStyle : 'alt', uk = SCALE_UNITS[st.scaleUnit] ? st.scaleUnit : 'km', uM = SCALE_UNITS[uk][0], uName = SCALE_UNITS[uk][1];
    const f = fontOf(st, 'scale', 13), fs = f.size, ink = st.scaleInk || c.ink, paper = st.scalePaper || c.paper, boxed = !!st.scaleBox, pad = boxed ? 7 : 3;
    const fill = f.fill || ink, halo = boxed ? null : (f.fill ? haloFor(f.fill) : c.mapHalo), tf = { ...f, fill, halo, haloW: 2.6 };
    const th = clamp(+st.scaleThick || 6, 2, 30), n = clamp(Math.round(+st.scaleSegs || 4), 2, 6), corner = st.scalePos, mg = +st.scaleMargin || 0;
    const wrap = (w, h, body) => ({ corner, mg, w: w + pad * 2, h: h + pad * 2, draw(x, y) {
      if (boxed) S.rect(x, y, w + pad * 2, h + pad * 2, { fill: paper, a: 0.88, r: 5, stroke: mixHex(ink, '#ffffff', 0.55), lw: 0.8 });
      body(x + pad, y + pad);
    } });
    if (style === 'text' || style === 'ratio') {
      const avail = Math.min(300, view.W * 0.36);
      let label;
      if (style === 'ratio') label = ratioText(info.ratioN) + '  (' + T('aprox.', 'approx.') + ')';
      else { const lenU = st.scaleLenMode === 'fixed' ? Math.max(1e-6, +st.scaleFixed || 100) : niceLength(avail * mpp / uM); label = fmtNum(lenU) + ' ' + uName; }
      const w = S.measure(label, tf);
      return wrap(w, fs * 1.2, (x, y) => S.text(label, x, y + fs * 0.95, tf));
    }
    const avail = Math.min(300, view.W * 0.36);
    let segU, lenU;
    if (st.scaleLenMode === 'fixed') { lenU = Math.max(1e-6, +st.scaleFixed || 100); segU = lenU / n; }
    else { segU = niceLength(avail * mpp / uM / n); lenU = segU * n; }
    let bw = lenU * uM / mpp;
    if (bw > view.W * 0.9) { segU = niceLength(view.W * 0.9 * mpp / uM / n); lenU = segU * n; bw = lenU * uM / mpp; }
    const sw = bw / n, above = st.scaleLabelPos !== 'below' || style === 'dual', labH = fs * 1.2;
    const labelsOf = () => {                                       // boundaries with a label, thinned out when they would touch
      const all = Array.from({ length: n + 1 }, (_, i) => ({ x: i * sw, t: fmtNum(i * segU) + (i === n ? ' ' + uName : '') }));
      for (let stride = 1; stride <= n; stride++) {
        const pick = all.filter((p, i) => i % stride === 0 || i === n);
        let ok = true; for (let i = 1; i < pick.length; i++) if (pick[i].x - S.measure(pick[i].t, tf) / 2 < pick[i - 1].x + S.measure(pick[i - 1].t, tf) / 2 + 6) ok = false;
        if (ok) return pick;
      }
      return [all[0], all[n]];
    };
    const labs = labelsOf(), ovL = S.measure(labs[0].t, tf) / 2, ovR = S.measure(labs[labs.length - 1].t, tf) / 2;
    let barH = th, sec = null;
    if (style === 'solid') barH = th * 1.3; else if (style === 'stepped') barH = th * 1.7; else if (style === 'ruler') barH = th * 1.5; else if (style === 'line') barH = th;
    if (style === 'dual') {                                        // second unit under the bar
      const u2 = uk === 'km' ? 'mi' : uk === 'm' ? 'ft' : 'km', u2M = SCALE_UNITS[u2][0], tot2 = lenU * uM / u2M, step2 = niceLength(tot2 / 3), items = [];
      for (let v = 0; v <= tot2 + 1e-9; v += step2) items.push({ x: v * u2M / mpp, t: fmtNum(v) });
      items[items.length - 1].t += ' ' + SCALE_UNITS[u2][1];
      const kept = [], half = it => S.measure(it.t, tf) / 2;          // thin the second row out so that labels never touch
      items.forEach((it, i) => {
        const last = i === items.length - 1;
        while (last && kept.length > 1 && it.x - half(it) < kept[kept.length - 1].x + half(kept[kept.length - 1]) + 6) kept.pop();
        if (!kept.length || it.x - half(it) >= kept[kept.length - 1].x + half(kept[kept.length - 1]) + 6) kept.push(it);
      });
      sec = kept;
    }
    const w = bw + ovL + ovR, gap = 3;
    const contentH = style === 'dual' ? labH + gap + th + 1 + 5 + labH : (above ? labH + gap + barH : barH + gap + labH);
    return wrap(w, contentH, (x, y) => {
      const bx = x + ovL, by = y + (above ? labH + gap : 0), sc = { stroke: ink, lw: 0.9 };
      const drawLabels = (yy) => labs.forEach(p => S.text(p.t, bx + p.x, yy, { ...tf, align: 'center' }));
      if (style === 'alt' || style === 'dual') { for (let i = 0; i < n; i++) S.rect(bx + i * sw, by, sw, th, { fill: i % 2 ? paper : ink, ...sc }); }
      else if (style === 'line') {
        S.path([[bx, by + th], [bx + bw, by + th]], { stroke: ink, lw: 1.6, cap: 'butt' });
        for (let i = 0; i <= n; i++) S.path([[bx + i * sw, by + th], [bx + i * sw, by + (i === 0 || i === n ? 0 : th * 0.45)]], { stroke: ink, lw: 1.4 });
      } else if (style === 'solid') S.rect(bx, by, bw, barH, { fill: ink, stroke: paper, lw: 0.8 });
      else if (style === 'stepped') {
        for (let i = 0; i < n; i++) { S.rect(bx + i * sw, by, sw, barH / 2, { fill: i % 2 ? paper : ink, ...sc }); S.rect(bx + i * sw, by + barH / 2, sw, barH / 2, { fill: i % 2 ? ink : paper, ...sc }); }
      } else if (style === 'ruler') {
        const base = by + barH; S.path([[bx, base], [bx + bw, base]], { stroke: ink, lw: 1.3 });
        for (let i = 0; i <= n; i++) { S.path([[bx + i * sw, base], [bx + i * sw, base - barH]], { stroke: ink, lw: 1.3 });
          if (i < n) for (let k = 1; k < 5; k++) S.path([[bx + i * sw + sw * k / 5, base], [bx + i * sw + sw * k / 5, base - barH * (k === 2 || k === 3 ? 0.5 : 0.35)]], { stroke: ink, lw: 0.9 }); }
      }
      if (above) drawLabels(by - gap); else drawLabels(by + barH + gap + fs * 0.95);
      if (sec) {
        const yb = by + th + 1; S.path([[bx, yb], [bx + bw, yb]], { stroke: ink, lw: 1.1 });
        sec.forEach(p => { S.path([[bx + p.x, yb], [bx + p.x, yb + 4]], { stroke: ink, lw: 1.1 }); S.text(p.t, bx + p.x, yb + 5 + fs * 0.95, { ...tf, align: 'center' }); });
      }
    });
  }

  /* keeps the tick labels of a colour bar that fit without touching (the first and the last are always kept) */
  function pickTicks(S, ticks, barW, lf) {
    if (ticks.length <= 2) return ticks;
    const box = t => { const w = S.measure(t.label, lf), x = t.t * barW; return t.t === 0 ? [x, x + w] : t.t === 1 ? [x - w, x] : [x - w / 2, x + w / 2]; };
    const last = box(ticks[ticks.length - 1]), keep = [ticks[0]]; let edge = box(ticks[0])[1];
    for (let i = 1; i < ticks.length - 1; i++) { const b = box(ticks[i]); if (b[0] > edge + 8 && b[1] < last[0] - 8) { keep.push(ticks[i]); edge = b[1]; } }
    keep.push(ticks[ticks.length - 1]);
    return keep;
  }
  /* Tick labels of a colour bar. n = 0 keeps the ones the legend itself gives; fewer are thinned out evenly, and more are
     interpolated when every label is a plain number and the first and last ticks sit at the ends of the bar. */
  function resampleTicks(ticks, n) {
    n = Math.round(+n || 0);
    if (!ticks || ticks.length < 2 || !(n >= 2) || n === ticks.length) return ticks || [];
    const last = ticks.length - 1;
    if (n < ticks.length) return Array.from({ length: n }, (_, i) => ticks[Math.round(i * last / (n - 1))]);
    const num = s => { const m = /^[-−+]?\d+(\.\d+)?$/.exec(String(s).trim()); return m ? parseFloat(m[0].replace('−', '-')) : NaN; };
    const vals = ticks.map(t => num(t.label));
    if (vals.some(v => !isFinite(v)) || ticks[0].t !== 0 || ticks[last].t !== 1) return ticks;
    let dec = 0;
    ticks.forEach(t => { const s = String(t.label), i = s.indexOf('.'); if (i >= 0) dec = Math.max(dec, s.length - i - 1); });
    return Array.from({ length: n }, (_, i) => {
      const t = i / (n - 1);
      let j = 0; while (j < last - 1 && ticks[j + 1].t < t) j++;
      const span = ticks[j + 1].t - ticks[j].t || 1;
      return { t, label: fmt(vals[j] + (vals[j + 1] - vals[j]) * (t - ticks[j].t) / span, dec) };
    });
  }
  /* legend layout read from the style: colour patch, row height, gradient bar and number of columns (0 = automatic) */
  function legendMetrics(st, fs) {
    return {
      sw: Math.round(clamp(+st.legendSwatch || 1, 0.4, 3) * fs * 0.95),
      lh: fs * 1.4 * clamp(+st.legendGap || 1, 0.6, 3),
      barW: +st.legendBarW > 0 ? clamp(+st.legendBarW, 40, 600) : Math.max(150, Math.round(fs * 13)),
      barH: +st.legendBarH > 0 ? clamp(+st.legendBarH, 3, 60) : fs * 0.9,
      cols: clamp(Math.round(+st.legendCols || 0), 0, 3),
      titleOn: st.legTitleOn !== false,
    };
  }
  function legendBlock(S, model, st, info, maxH) {
    const lf0 = fontOf(st, 'legLabel', 13), fs = lf0.size, pad = Math.round(fs * 0.7), box = st.legendBox === 'auto' ? (info.dark ? 'dark' : 'light') : st.legendBox;
    const boxed = box !== 'none';
    const ink = boxed ? (box === 'dark' ? INK_DARK : INK) : (info.dark ? INK_DARK : INK), muted = boxed ? (box === 'dark' ? '#aab6c1' : '#5b6874') : ink;
    const halo = boxed ? null : (lum(ink) > 0.5 ? '#000000' : '#ffffff');
    const tf0 = fontOf(st, 'legTitle', (+st.legendSize || 13) + 1), tfs = tf0.size;
    const tf = { size: tfs, weight: tf0.weight, italic: tf0.italic, family: tf0.family }, uf = { size: fs * 0.92, weight: 400, family: tf0.family }, lf = { size: fs, weight: lf0.weight, italic: lf0.italic, family: lf0.family }, nf = { size: fs * 0.85, weight: 400, family: tf0.family };
    const tcol = tf0.fill || ink, lcol = lf0.fill || ink, mt = legendMetrics(st, fs);
    const title = mt.titleOn ? ((st.legendTitle || '').trim() || model.title || '') : '';
    const maxTitleW = Math.max(120, Math.min(340, info.W * 0.42));
    const tLines = title ? wrapText(S, title, tf, maxTitleW) : [];
    const uLines = model.unit ? wrapText(S, model.unit, uf, maxTitleW) : [];
    const nLines = model.note ? wrapText(S, model.note, nf, maxTitleW + 30) : [];
    const lh = mt.lh, tH = tfs * 1.25, uH = uf.size * 1.25, nH = nf.size * 1.3;
    let headH = tLines.length * tH + uLines.length * uH, w = 0, body = 0, rowsPer = 0, colW = 0, labW = 0;
    tLines.forEach(l => { w = Math.max(w, S.measure(l, tf)); }); uLines.forEach(l => { w = Math.max(w, S.measure(l, uf)); }); nLines.forEach(l => { w = Math.max(w, S.measure(l, nf)); });
    const noteH = nLines.length * nH + (nLines.length ? 4 : 0);
    const head = (x, y) => {
      let cy = y + pad + tfs * 0.95; const tx = x + pad;
      tLines.forEach(l => { S.text(l, tx, cy, { ...tf, fill: tcol, halo, haloW: 2.6 }); cy += tH; });
      uLines.forEach(l => { S.text(l, tx, cy - tfs * 0.15, { ...uf, fill: muted, halo, haloW: 2.6 }); cy += uH; });
    };
    if (model.kind === 'grad') {
      const barW = mt.barW, bh = mt.barH, ticks = resampleTicks(model.ticks, st.legendTicks);
      w = Math.max(w, barW); body = bh + 3 + fs * 1.25;
      if (headH) headH += 4;
      const totalH = pad * 2 + headH + body + noteH + (nLines.length ? nf.size : 0);
      return { w: w + pad * 2, h: totalH, draw(x, y) {
        boxDraw(S, x, y, w + pad * 2, totalH, st, box); head(x, y);
        const tx = x + pad, barY = y + pad + headH;
        S.gradRect(tx, barY, barW, bh, model.stops);
        S.rect(tx, barY, barW, bh, { stroke: muted, lw: 0.8 });
        pickTicks(S, ticks, barW, lf).forEach(t => {
          const px = tx + t.t * barW;
          S.path([[px, barY + bh], [px, barY + bh + 3]], { stroke: muted, lw: 0.8 });
          S.text(t.label, px, barY + bh + 3 + fs * 0.95, { ...lf, fill: lcol, align: t.t === 0 ? 'left' : t.t === 1 ? 'right' : 'center', halo, haloW: 2.6 });
        });
        let cy = barY + body + nf.size + 3; nLines.forEach(l => { S.text(l, tx, cy, { ...nf, fill: muted, halo, haloW: 2.6 }); cy += nH; });
      } };
    }
    const items = model.items || [], sw = mt.sw, gapX = 7;
    items.forEach(it => { labW = Math.max(labW, S.measure(it.label, lf)); });
    if (headH) headH += 5;
    let cols;
    if (mt.cols >= 1) { cols = Math.min(mt.cols, Math.max(1, items.length)); rowsPer = items.length ? Math.max(1, Math.ceil(items.length / cols)) : 0; }
    else {
      const room = Math.max(4 * lh, maxH - pad * 2 - headH - noteH);
      rowsPer = Math.max(4, Math.floor(room / lh)); cols = Math.max(1, Math.ceil(items.length / rowsPer));
      if (cols === 1) rowsPer = items.length;
    }
    colW = sw + gapX + labW + (cols > 1 ? 16 : 0);
    w = Math.max(w, colW * cols - (cols > 1 ? 16 : 0));
    const totalH = pad * 2 + headH + rowsPer * lh + noteH;
    return { w: w + pad * 2, h: totalH, draw(x, y) {
      boxDraw(S, x, y, w + pad * 2, totalH, st, box); head(x, y);
      const tx = x + pad, iy = y + pad + headH;
      items.forEach((it, i) => {
        const col = Math.floor(i / rowsPer), row = i % rowsPer, ix = tx + col * colW, ry = iy + row * lh, mid = ry + lh / 2, edge = mixHex(it.color, '#000000', 0.4);
        if (it.shape === 'square') S.rect(ix, mid - sw / 2, sw, sw, { fill: it.color, stroke: edge, lw: 0.8 });
        else S.markers(st.shape, [[ix + sw / 2, mid]], sw * 0.46, { fill: it.color, stroke: edge, lw: 0.8 });
        S.text(it.label, ix + sw + gapX, mid, { ...lf, fill: lcol, base: 'middle', halo, haloW: 2.6 });
      });
      let cy = iy + rowsPer * lh + (nLines.length ? 2 : 0) + nf.size;
      nLines.forEach(l => { S.text(l, tx, cy, { ...nf, fill: muted, halo, haloW: 2.6 }); cy += nH; });
    } };
  }
  function boxDraw(S, x, y, w, h, st, box) {
    if (box === 'none') return;
    if (box === 'dark') S.rect(x, y, w, h, { fill: PANEL_DARK, a: 0.88, r: 6, stroke: '#3a4753', lw: 0.8 });
    else if (box === 'outline') S.rect(x, y, w, h, { fill: PAPER, r: 3, stroke: '#54616d', lw: 1 });
    else S.rect(x, y, w, h, { fill: PAPER, a: 0.9, r: 6, stroke: '#c7d0d8', lw: 0.8 });
  }

  function titleBlock(S, st, c) {
    const title = (st.title || '').trim(), sub = (st.subtitle || '').trim();
    if (!title && !sub) return null;
    const boxed = st.textBox !== 'none', W = c.W, base = st.textAuto ? (boxed ? (st.textBox === 'dark' ? INK_DARK : INK) : c.fg) : st.textColor;
    const tf = fontOf(st, 'title', 22), sf = fontOf(st, 'subtitle', Math.max(12, Math.round((+st.titleSize || 22) * 0.56)));
    const tcol = tf.fill || base, scol = sf.fill || base, ts = tf.size, ss = sf.size, maxW = Math.min(W - 2 * c.edge, W * (st.titlePos[1] === 'c' ? 0.8 : 0.6));
    const tl = title ? wrapText(S, title, tf, maxW) : [], sl = sub ? wrapText(S, sub, sf, maxW) : [], bp = boxed ? 10 : 0;
    let w = 0; tl.forEach(l => { w = Math.max(w, S.measure(l, tf)); }); sl.forEach(l => { w = Math.max(w, S.measure(l, sf)); });
    const h = tl.length * ts * 1.18 + sl.length * ss * 1.25 + (tl.length && sl.length ? 3 : 0), pos = st.titlePos;
    return { corner: pos, w: w + bp * 2, h: h + bp * 2, draw(x, y) {
      if (boxed) S.rect(x, y, w + bp * 2, h + bp * 2, { fill: st.textBox === 'dark' ? PANEL_DARK : PAPER, a: clamp(st.boxAlpha, 0.2, 1), r: 6 });
      const al = pos[1] === 'l' ? 'left' : pos[1] === 'r' ? 'right' : 'center', ax = al === 'left' ? x + bp : al === 'right' ? x + bp + w : x + bp + w / 2;
      let cy = y + bp + ts * 0.9;
      tl.forEach(l => { S.text(l, ax, cy, { ...tf, fill: tcol, align: al, halo: boxed ? null : haloFor(tcol), haloW: Math.max(3, ts / 6) }); cy += ts * 1.18; });
      cy += tl.length && sl.length ? 3 : 0; cy += sl.length ? ss * 0.1 : 0;
      sl.forEach(l => { S.text(l, ax, cy, { ...sf, fill: scol, align: al, halo: boxed ? null : haloFor(scol), haloW: 3 }); cy += ss * 1.25; });
    } };
  }
  function creditBlock(S, st, c) {
    const credit = (st.credit || '').trim(); if (!credit) return null;
    const cf = fontOf(st, 'credit', 12), lines = wrapText(S, credit, cf, c.W * 0.5), fill = cf.fill || c.fg, lh = cf.size * 1.25, pos = st.creditPos;
    let w = 0; lines.forEach(l => { w = Math.max(w, S.measure(l, cf)); });
    const al = pos[1] === 'r' ? 'right' : pos[1] === 'c' ? 'center' : 'left';
    return { corner: pos, w, h: lines.length * lh, draw(x, y) {
      lines.forEach((l, i) => S.text(l, al === 'left' ? x : al === 'right' ? x + w : x + w / 2, y + cf.size * 0.9 + i * lh, { ...cf, fill, align: al, halo: cf.fill ? haloFor(cf.fill) : c.halo, haloW: 3 }));
    } };
  }

  /* Paints every decoration on surface S. info: {legend, dark, attribution, live, ratioN} */
  function drawDecor(S, view, st, info) {
    const c = decorContext(view, st, info), W = c.W, H = c.H, edge = c.edge, sc = clamp(+st.textScale || 1, 0.3, 4);
    const cur = { tl: edge, tc: edge, tr: edge, bl: edge, bc: edge, br: edge + 18 * sc }, gap = 8;
    const place = (corner, w, h, mg) => {
      mg = mg || 0;
      const hz = corner[1], x = hz === 'l' ? edge + mg : hz === 'r' ? W - edge - w - mg : (W - w) / 2;
      let y;
      if (corner[0] === 't') { y = cur[corner] + mg; cur[corner] += h + gap + mg; }
      else { y = H - cur[corner] - h - mg; cur[corner] += h + gap + mg; }
      return [x, y];
    };
    info.W = W;
    /* every block is placed first, so that the graticule labels can keep out of their way, then graticule and blocks are drawn */
    const placed = [];
    const put = blk => { if (!blk) return; const [x, y] = place(blk.corner, blk.w, blk.h, blk.mg); placed.push({ blk, x, y }); };
    put(titleBlock(S, st, c));
    put(northBlock(S, st, c));
    if (st.legendOn && info.legend) { const lb = legendBlock(S, info.legend, st, info, H * 0.78 - cur[st.legendPos]); put({ corner: st.legendPos, w: lb.w, h: lb.h, draw: lb.draw }); }
    if (st.scaleOn) put(scaleBlock(S, view, st, c, info));
    put(creditBlock(S, st, c));
    if (st.grat) {
      const avoid = placed.map(p => [p.x, p.y, p.x + p.blk.w, p.y + p.blk.h]);
      if (info.attribution) { const aw = S.measure(info.attribution, { size: 10 * sc }); avoid.push([W - edge - aw, H - edge + 4 - 10 * sc, W - edge, H - edge + 8]); }
      drawGraticule(S, view, st, c, avoid);
    }
    placed.forEach(p => p.blk.draw(p.x, p.y));
    /* attribution of the base map (the screen shows it in the Leaflet control) */
    if (info.attribution) S.text(info.attribution, W - edge, H - edge + 4, { size: 10 * sc, fill: c.ink, halo: c.mapHalo, haloW: 3, align: 'right', a: 0.9 });
    /* frame */
    if (st.frameOn) {
      const m = st.frameMargin, lw = st.frameWidth;
      if (m > 0) { const o = { fill: st.frameFill };
        S.rect(0, 0, W, m, o); S.rect(0, H - m, W, m, o); S.rect(0, m, m, H - 2 * m, o); S.rect(W - m, m, m, H - 2 * m, o); }
      if (lw > 0) S.rect(m + lw / 2, m + lw / 2, W - 2 * m - lw, H - 2 * m - lw, { stroke: st.frameColor, lw });
    }
  }

  /* The decoration grows and shrinks with the layout (phone-size maps, journal columns, big pictures) and follows the bigger
     container used for sharper export tiles: it is drawn in virtual units and scaled. info.grid = container pixels per
     layout pixel, info.dpiOut / info.kc = output resolution (for the 1:N text). */
  const decorAutoScale = (W, H) => clamp(Math.min(W, H * 1.5) / 800, 0.7, 3);
  function drawDecorScaled(S, view, st, info) {
    const g = info.grid || 1, ua = decorAutoScale(view.W / g, view.H / g), u = g * ua;
    info.ratioN = view.mPerPx() * ((info.dpiOut || 96) / (info.kc || 1)) / 0.0254;
    if (u === 1) return drawDecor(S, view, st, info);
    const v2 = { W: view.W / u, H: view.H / u, zoom: view.zoom, proj: (a, b) => { const p = view.proj(a, b); return [p[0] / u, p[1] / u]; },
      unproj: (x, y) => view.unproj(x * u, y * u), mPerPx: () => view.mPerPx() * u };
    S.scaleStart(u);
    try { drawDecor(S, v2, st, info); } finally { S.scaleEnd(); }
  }

  /* Space (container pixels) that the title and, if asked, the legend take, so that a fitted extent leaves them room.
     W, H = layout size; u = container pixels per virtual pixel. */
  function decorReserve(st, info, W, H, g) {
    const ua = decorAutoScale(W, H), u = g * ua, vw = W / ua, vh = H / ua, res = { top: 0, right: 0, bottom: 0, left: 0 };
    const S0 = canvasSurface(measureCtx, vw, vh), c = decorContext({ W: vw, H: vh }, st, info), sc = clamp(+st.textScale || 1, 0.3, 4);
    const tb = titleBlock(S0, st, c);
    if (tb) res[tb.corner[0] === 't' ? 'top' : 'bottom'] += tb.h + c.edge + 8;
    if (info.reserveLegend && st.legendOn && info.legend) {
      const lb = legendBlock(S0, info.legend, st, { ...info, W: vw }, vh * 0.78), p = st.legendPos;
      if (lb.h / vh <= lb.w / vw) res[p[0] === 't' ? 'top' : 'bottom'] += lb.h + c.edge + 8; else res[p[1] === 'l' ? 'left' : 'right'] += lb.w + c.edge + 8;
    }
    res.bottom += 24 * sc;                                        // attribution line
    const fr = st.frameOn ? st.frameMargin + st.frameWidth : 0;
    ['top', 'right', 'bottom', 'left'].forEach(k => { res[k] = (res[k] + fr) * u; });
    return res;
  }

  /* ================= export ================= */
  const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(bytes) { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  /* writes the physical resolution (pHYs chunk) into a PNG so that print programs place it at the right size */
  async function addPhys(blob, dpi) {
    const buf = new Uint8Array(await blob.arrayBuffer());
    if (buf.length < 34 || buf[1] !== 0x50) return blob;
    const ppm = Math.round(dpi / 0.0254), chunk = new Uint8Array(21), dv = new DataView(chunk.buffer);
    dv.setUint32(0, 9); chunk.set([0x70, 0x48, 0x59, 0x73], 4); dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1;
    dv.setUint32(17, crc32(chunk.subarray(4, 17)));
    return new Blob([buf.subarray(0, 33), chunk, buf.subarray(33)], { type: 'image/png' });
  }

  const SIZES = {
    shown: { es: 'Como se ve', en: 'As shown' },
    a4l: { mm: [297, 210], es: 'A4 horizontal', en: 'A4 landscape' }, a4p: { mm: [210, 297], es: 'A4 vertical', en: 'A4 portrait' },
    j85: { mm: [85, 64], es: 'Revista, 1 columna (85 mm)', en: 'Journal, single column (85 mm)' },
    j180: { mm: [180, 120], es: 'Revista, 2 columnas (180 mm)', en: 'Journal, double column (180 mm)' },
    slide: { px: [1280, 720], es: 'Diapositiva 16:9', en: 'Slide 16:9' }, square: { px: [900, 900], es: 'Cuadrado', en: 'Square' },
    custom: { es: 'Personalizado…', en: 'Custom…' },
  };
  /* {mm:[w,h]} (physical size, dpi decides the pixels), {px:[w,h]}, or {} = the map as shown */
  function sizeSpec(ex) {
    if (ex.size === 'custom') {
      const w = clamp(+ex.cw || 1, 1, 100000), h = clamp(+ex.ch || 1, 1, 100000);
      return ex.cunit === 'mm' ? { mm: [w, h], custom: 'mm' } : { px: [Math.round(w), Math.round(h)], custom: 'px' };
    }
    return SIZES[ex.size] || SIZES.shown;
  }

  /* ---------- framing ----------
     Every framing but "as it looks on screen" gives a geographic extent the export is fitted to. */
  const FRAMES = ['asis', 'fit', 'regions', 'mexico', 'manual'];
  function manualBounds(ex) {
    const n = +ex.mN, s = +ex.mS, e = +ex.mE, w = +ex.mW;
    if (![n, s, e, w].every(v => isFinite(v)) || n <= s || e <= w || Math.abs(n) > 85.06 || Math.abs(s) > 85.06 || Math.abs(w) > 180 || Math.abs(e) > 180) return null;
    return L.latLngBounds([s, w], [n, e]);
  }
  /* The extent a framing asks for, or null when it cannot be worked out (then the extent on screen is used). */
  function frameBounds(studio, ex) {
    switch (ex.frame) {
      case 'fit': return studio.dataBounds();
      case 'regions': return regionsBoundsOf(clipRegions('selected'));
      case 'mexico': return regionsBoundsOf(clipRegions('mexico'));
      case 'manual': return manualBounds(ex);
      default: return null;                                        // 'asis'
    }
  }
  /* width / height of an extent measured in Mercator, which is the shape it takes on the picture */
  function extentAspect(b) {
    const dx = Math.abs(b.getEast() - b.getWest()) * Math.PI / 180, dy = Math.abs(mercY(b.getNorth()) - mercY(b.getSouth()));
    return dx > 0 && dy > 0 ? dx / dy : 1;
  }
  /* layout size in CSS pixels (that is what fixes the relative size of text and markers) and the pixel scale of the output */
  function planExport(studio, ex) {
    const sz = sizeSpec(ex), cur = studio.rec.map.getSize();
    let mm = sz.mm ? sz.mm.slice() : null, px = sz.px ? sz.px.slice() : [cur.x, cur.y];
    const target = frameBounds(studio, ex);
    /* aspect ratio not locked: the picture itself is trimmed so that its shape is the shape of the extent asked for */
    let trimmed = false;
    if (target && ex.lockAspect === false) {
      const ar = extentAspect(target), cw = mm ? mm[0] : px[0], ch = mm ? mm[1] : px[1];
      let nw = cw, nh = ch;
      if (cw / ch > ar) nw = ch * ar; else nh = cw / ar;
      trimmed = Math.abs(nw - cw) > 0.5 || Math.abs(nh - ch) > 0.5;
      if (mm) mm = [Math.round(nw * 10) / 10, Math.round(nh * 10) / 10];
      else px = [Math.max(16, Math.round(nw)), Math.max(16, Math.round(nh))];
    }
    let W, H, k;
    if (mm) { W = Math.round(mm[0] / 25.4 * 96); H = Math.round(mm[1] / 25.4 * 96); k = ex.dpi / 96; }
    else { W = px[0]; H = px[1]; k = sz.custom === 'px' ? 1 : ex.factor; }
    let limited = false;
    while ((W * k > 16000 || H * k > 16000 || W * k * H * k > 120e6) && k > 0.25) { k *= 0.9; limited = true; }
    const exact = mm && !limited;   // paper sizes: exactly the pixels of that many millimetres at the chosen dpi
    const outW = exact ? Math.round(mm[0] / 25.4 * ex.dpi) : Math.round(W * k), outH = exact ? Math.round(mm[1] / 25.4 * ex.dpi) : Math.round(H * k);
    if (exact) k = outW / W;
    /* boost: the map is loaded on a container 2^boost times bigger (a higher zoom) so that base-map tiles have more detail */
    let boost = ex.fmt === 'svg' ? 0 : clamp(+ex.boost || 0, 0, 2);
    while (boost > 0 && (W << boost) * (H << boost) > 12e6) boost--;
    const g = 1 << boost;
    const wanted = FRAMES.includes(ex.frame) ? ex.frame : 'asis';
    return { W, H, k, outW, outH, dpi: Math.round(96 * k), mm: mm || null, limited, trimmed, g, cW: W * g, cH: H * g,
      frame: target ? wanted : 'asis', wantedFrame: wanted, target, missing: wanted !== 'asis' && !target,
      zoomAdj: clamp(+ex.zoomAdj || 0, -3, 3), padPct: clamp(+ex.pad, 0, 25), reserve: !!ex.reserve, clip: clipPlanFor(studio, ex) };
  }
  /* what the export has to clip to, or null when clipping is off or the target holds no polygon */
  function clipPlanFor(studio, ex) {
    if (!ex.clipOn) return null;
    const what = CLIP_TARGETS.includes(ex.clipWhat) ? ex.clipWhat : 'selected', regs = clipRegions(what);
    if (!regs.length) return null;
    return { what, regs, outside: ex.clipOutside, color: ex.clipColor, border: !!ex.clipBorder,
      bcol: ex.clipBorderColor, bw: clamp(+ex.clipBorderW || 0, 0, 8), outer: ex.clipBorderWhat !== 'all', keepPoints: !!ex.clipKeepPoints };
  }
  /* ---------- export settings: defaults, validation and persistence ---------- */
  const EX_PREFIX = 'biomodellingpro:mapexport:';
  const exDefaults = () => ({
    fmt: 'png', size: 'shown', factor: 2, dpi: 300, quality: 0.92, boost: 0, cw: 1600, ch: 1000, cunit: 'px',
    /* framing: 'asis' keeps exactly what the screen shows, which is the one thing nobody can be surprised by */
    frame: 'asis', pad: 3, reserve: false, lockAspect: true, zoomAdj: 0,
    mN: 32.8, mS: 14.4, mE: -86.6, mW: -118.5,                     // manual extent: the whole of Mexico to start from
    clipOn: false, clipWhat: 'selected', clipOutside: 'transparent', clipColor: '#ffffff',
    clipBorder: true, clipBorderWhat: 'outer', clipBorderColor: '#17212b', clipBorderW: 1.2, clipKeepPoints: false, clipScreen: true,
    geoDecor: false, tiffPack: true, preview: true,
  });
  const EX_ENUMS = { fmt: ['png', 'jpeg', 'webp', 'tiff', 'geotiff', 'svg'], size: Object.keys(SIZES), cunit: ['px', 'mm'],
    frame: FRAMES, clipWhat: CLIP_TARGETS, clipOutside: ['transparent', 'white', 'page', 'custom'], clipBorderWhat: ['outer', 'all'] };
  function sanitizeEx(obj, defs) {
    const out = {};
    if (!obj || typeof obj !== 'object') return out;
    for (const k of Object.keys(defs)) {
      if (!(k in obj)) continue;
      const v = obj[k], d = defs[k];
      if (typeof d === 'number') { if (typeof v === 'number' && isFinite(v)) out[k] = v; }
      else if (typeof d === 'boolean') { if (typeof v === 'boolean') out[k] = v; }
      else if (typeof v === 'string') {
        if (EX_ENUMS[k] && !EX_ENUMS[k].includes(v)) continue;
        if (/Color$/.test(k) && !/^#[0-9a-f]{6}$/i.test(v)) continue;
        out[k] = v.slice(0, 40);
      }
    }
    return out;
  }
  /* the colour that fills everything outside the clip; null = leave it transparent */
  function outsideFill(studio, cp, fmt) {
    if (cp.outside === 'white') return '#ffffff';
    if (cp.outside === 'custom') return asHex(cp.color || '#ffffff');
    if (cp.outside === 'page') return studio.bgColor();
    return fmt === 'jpeg' ? '#ffffff' : null;                      // 'transparent' (JPEG carries no alpha)
  }

  const mercY = lat => Math.log(Math.tan(Math.PI / 4 + clamp(lat, -85.05, 85.05) * Math.PI / 360));
  const mercInv = y => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * R2D;
  /* Tight bounds of what an image overlay really draws (pixels that are not transparent), not of its whole rectangle. The
     image rows are evenly spaced in Mercator between its north and south edges, as the map draws them. */
  function overlayTight(l) {
    const img = l.getElement && l.getElement(), gb = l.getBounds();
    if (!img || !img.complete || !img.naturalWidth) return gb;
    if (l.__tight && l.__tightUrl === l._url) return l.__tight;
    let res = gb;
    try {
      const w = img.naturalWidth, h = img.naturalHeight, c = document.createElement('canvas'); c.width = w; c.height = h;
      const cx = c.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0);
      const d = cx.getImageData(0, 0, w, h).data; let x0 = w, x1 = -1, y0 = h, y1 = -1;
      for (let y = 0; y < h; y++) { const row = y * w * 4; for (let x = 0; x < w; x++) if (d[row + x * 4 + 3] >= 28) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; } }
      if (x1 >= 0) {
        const W0 = gb.getWest(), E0 = gb.getEast(), yN = mercY(gb.getNorth()), yS = mercY(gb.getSouth()), lat = row => mercInv(yN - row / h * (yN - yS));
        res = L.latLngBounds([lat(y1 + 1), W0 + x0 / w * (E0 - W0)], [lat(y0), W0 + (x1 + 1) / w * (E0 - W0)]);
      }
    } catch (e) { res = gb; }
    l.__tight = res; l.__tightUrl = l._url; return res;
  }
  /* padding (container pixels) around the fitted extent: the chosen percentage plus room for the title (and the legend if asked) */
  function fitPadding(studio, plan) {
    const st = studio.style, r = decorReserve(st, { legend: studio.legendModel(), dark: studio.isDark(), reserveLegend: plan.reserve }, plan.W, plan.H, plan.g);
    const l = plan.padPct / 100 * plan.cW + r.left, rt = plan.padPct / 100 * plan.cW + r.right, t = plan.padPct / 100 * plan.cH + r.top, b = plan.padPct / 100 * plan.cH + r.bottom;
    const fx = Math.min(1, plan.cW * 0.7 / Math.max(1, l + rt)), fy = Math.min(1, plan.cH * 0.7 / Math.max(1, t + b));
    return { tl: [l * fx, t * fy], br: [rt * fx, b * fy] };
  }
  /* zoom, scale and extent that fitting the target would give (without touching the map), for the export dialog */
  function fitEstimate(studio, plan) {
    const map = studio.rec.map, target = plan.frame === 'asis' ? null : plan.target, b = target || map.getBounds();
    const pad = target ? fitPadding(studio, plan) : { tl: [0, 0], br: [0, 0] };
    const wx = x => (x + 180) / 360, wy = lat => 0.5 - mercY(lat) / (2 * Math.PI);
    const dx = Math.max(1e-9, wx(b.getEast()) - wx(b.getWest())), dy = Math.max(1e-9, wy(b.getSouth()) - wy(b.getNorth()));
    const aw = Math.max(20, plan.cW - pad.tl[0] - pad.br[0]), ah = Math.max(20, plan.cH - pad.tl[1] - pad.br[1]);
    let z = Math.min(Math.log2(Math.min(aw / (256 * dx), ah / (256 * dy))), 19);
    if (target) z = Math.min(z, 16 + Math.log2(plan.g));
    z += plan.zoomAdj;
    const lat = b.getCenter().lat;
    const mpp = 40075016.686 * Math.cos(lat / R2D) / (256 * Math.pow(2, z)), cpi = plan.dpi * plan.cW / plan.outW;
    /* the extent the picture really shows at that zoom (the framing box grows to fill the shape of the paper) */
    const halfW = plan.cW / 2 / (256 * Math.pow(2, z)), halfH = plan.cH / 2 / (256 * Math.pow(2, z));
    const cx = (wx(b.getEast()) + wx(b.getWest())) / 2 + (pad.br[0] - pad.tl[0]) / 2 / (256 * Math.pow(2, z));
    const cy = (wy(b.getNorth()) + wy(b.getSouth())) / 2 + (pad.br[1] - pad.tl[1]) / 2 / (256 * Math.pow(2, z));
    const lonOf = x => clamp(x * 360 - 180, -180, 180), latOf = y => mercInv((0.5 - y) * 2 * Math.PI);
    const shown = L.latLngBounds([latOf(cy + halfH), lonOf(cx - halfW)], [latOf(cy - halfH), lonOf(cx + halfW)]);
    return { bounds: target ? shown : b, ask: b, zoom: z, ratio: mpp * cpi / 0.0254, fitted: !!target };
  }

  async function waitTiles(rec) {
    await sleep(70);
    const t0 = performance.now(), layers = [rec.layers[rec.current], rec.labelLayer].filter(l => l && l._tiles && rec.map.hasLayer(l));
    while (performance.now() - t0 < 12000) {
      const pending = layers.some(l => Object.values(l._tiles).some(t => t.current && t.el && !t.el.complete));
      if (!pending) break;
      await sleep(120);
    }
    for (const img of rec.map.getContainer().querySelectorAll('img.leaflet-image-layer'))
      if (!img.complete) await new Promise(r => { img.onload = img.onerror = r; setTimeout(r, 3000); });
    await sleep(150);
  }

  /* run fn with the map at the export size and extent (the data fill the frame, or the extent as seen), then put everything back */
  async function withExportView(studio, plan, fn) {
    const rec = studio.rec, map = rec.map, cont = map.getContainer(), cs = cont.style;
    const prev = { w: cs.width, h: cs.height, mw: cs.maxWidth, minw: cs.minWidth, fx: cs.flex, zs: map.options.zoomSnap, c: map.getCenter(), z: map.getZoom(), b: map.getBounds(), sx: window.scrollX, sy: window.scrollY };
    const cur = map.getSize(), resize = plan.cW !== cur.x || plan.cH !== cur.y;
    const target = plan.frame === 'asis' ? null : plan.target;
    const tiny = target && Math.abs(target.getNorth() - target.getSouth()) + Math.abs(target.getEast() - target.getWest()) < 1e-4;
    const fit = !!target && !tiny, zA = plan.zoomAdj || 0;
    try {
      if (resize || fit || zA) {
        if (resize) {
          const bx = cont.offsetWidth - cont.clientWidth, by = cont.offsetHeight - cont.clientHeight;
          cs.width = (plan.cW + bx) + 'px'; cs.height = (plan.cH + by) + 'px'; cs.maxWidth = 'none'; cs.minWidth = '0'; cs.flex = 'none';
        }
        map.options.zoomSnap = 0;
        map.invalidateSize({ animate: false, pan: false });
        if (fit) { const p = fitPadding(studio, plan); map.fitBounds(target, { paddingTopLeft: p.tl, paddingBottomRight: p.br, maxZoom: 16 + Math.log2(plan.g), animate: false }); }
        else if (resize) map.fitBounds(prev.b, { animate: false, padding: [0, 0] });
        if (zA) map.setZoom(clamp(map.getZoom() + zA, 0, 22), { animate: false });
      }
      await waitTiles(rec);
      return await fn();
    } finally {
      cs.width = prev.w; cs.height = prev.h; cs.maxWidth = prev.mw; cs.minWidth = prev.minw; cs.flex = prev.fx; map.options.zoomSnap = prev.zs;
      if (resize || fit || zA) { map.invalidateSize({ animate: false, pan: false }); map.setView(prev.c, prev.z, { animate: false }); }
      window.scrollTo(prev.sx, prev.sy);
    }
  }

  /* CSS filter (grayscale, brightness, contrast, saturate — same order as on screen) applied to pixels: canvas has no
     dependable filter support in every browser and html2canvas ignores CSS filters altogether */
  function filterPixels(cv, st) {
    const ctx = cv.getContext('2d'), img = ctx.getImageData(0, 0, cv.width, cv.height), d = img.data;
    const g = st.gray, b = st.bright, c = st.contrast, s = st.sat, cl = v => v < 0 ? 0 : v > 255 ? 255 : v;
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i], gg = d[i + 1], bb = d[i + 2], y;
      if (g > 0) { y = 0.2126 * r + 0.7152 * gg + 0.0722 * bb; r += (y - r) * g; gg += (y - gg) * g; bb += (y - bb) * g; }
      if (b !== 1) { r = cl(r * b); gg = cl(gg * b); bb = cl(bb * b); }
      if (c !== 1) { r = cl((r - 127.5) * c + 127.5); gg = cl((gg - 127.5) * c + 127.5); bb = cl((bb - 127.5) * c + 127.5); }
      if (s !== 1) { y = 0.213 * r + 0.715 * gg + 0.072 * bb; r = cl(y + (r - y) * s); gg = cl(y + (gg - y) * s); bb = cl(y + (bb - y) * s); }
      d[i] = r; d[i + 1] = gg; d[i + 2] = bb;
    }
    ctx.putImageData(img, 0, 0);
  }
  const needsFilter = st => st.gray > 0 || st.bright !== 1 || st.contrast !== 1 || st.sat !== 1;

  function contentOrigin(cont) { const r = cont.getBoundingClientRect(); return [r.left + cont.clientLeft, r.top + cont.clientTop]; }
  function collectOverlays(cont) {
    const [ox, oy] = contentOrigin(cont), out = [];
    cont.querySelectorAll('img.leaflet-image-layer').forEach(img => {
      if (!img.complete || !img.naturalWidth) return;
      const r = img.getBoundingClientRect(), cs = getComputedStyle(img), op = parseFloat(cs.opacity);
      out.push({ img, x0: r.left - ox, y0: r.top - oy, x1: r.right - ox, y1: r.bottom - oy, a: isNaN(op) ? 1 : op, smooth: !/pixel|crisp/i.test(cs.imageRendering) });
    });
    return out;
  }
  /* draws the loaded tiles of one tile layer; filtered = apply the base-map filters and opacity */
  function drawTiles(ctx, rec, layer, k, st, filtered) {
    if (!layer || !layer._tiles) return;
    const cont = rec.map.getContainer(), [ox, oy] = contentOrigin(cont);
    const tcv = document.createElement('canvas'); tcv.width = ctx.canvas.width; tcv.height = ctx.canvas.height;
    const t = tcv.getContext('2d', { willReadFrequently: true });
    for (const tile of Object.values(layer._tiles)) {
      const im = tile.el; if (!tile.current || tile.coords.z !== layer._tileZoom || !im || !im.complete || !im.naturalWidth) continue;
      const r = im.getBoundingClientRect();
      const x0 = Math.round((r.left - ox) * k), y0 = Math.round((r.top - oy) * k), x1 = Math.round((r.right - ox) * k), y1 = Math.round((r.bottom - oy) * k);
      t.drawImage(im, x0, y0, x1 - x0, y1 - y0);
    }
    if (filtered && needsFilter(st)) filterPixels(tcv, st);
    ctx.save(); ctx.globalAlpha = filtered ? clamp(st.baseOpacity, 0, 1) : 1; ctx.drawImage(tcv, 0, 0); ctx.restore();
  }
  function attributionText(rec) {
    const parts = [];
    [rec.layers[rec.current], rec.labelLayer && rec.map.hasLayer(rec.labelLayer) ? rec.labelLayer : null].forEach(l => {
      const a = l && l.options && l.options.attribution; if (!a) return;
      const d = document.createElement('div'); d.innerHTML = a; const s = d.textContent.trim(); if (s && !parts.includes(s)) parts.push(s);
    });
    return parts.join(' · ');
  }

  /* opt.noDecor: only the map (used by the georeferenced export, where a title or a legend would sit on top of the pixels
     that mapping software places on the ground) */
  function composeRaster(studio, plan, ex, withTiles, opt) {
    opt = opt || {};
    const rec = studio.rec, map = rec.map, cont = map.getContainer(), st = studio.style;
    const cv = document.createElement('canvas'); cv.width = plan.outW; cv.height = plan.outH;
    const ctx = cv.getContext('2d'), k = plan.outW / plan.cW, W = cv.width, H = cv.height;
    const transparent = st.bgMode === 'transparent' && ex.fmt !== 'jpeg';
    const inside = transparent ? null : (st.bgMode === 'transparent' ? '#ffffff' : studio.bgColor());
    const view = mapView(map), cp = plan.clip;
    const rings = cp ? projectClip(cp.regs, view, k, [0, 0, W, H]) : null;
    const outCol = cp ? outsideFill(studio, cp, ex.fmt) : null;
    if (cp && outCol) { ctx.fillStyle = outCol; ctx.fillRect(0, 0, W, H); }
    ctx.save();
    /* a canvas clip lives in device pixels, so it keeps holding while the transform below is changed */
    if (rings) { ringPath(ctx, rings); ctx.clip('evenodd'); }
    if (inside) { ctx.fillStyle = inside; ctx.fillRect(0, 0, W, H); }
    if (withTiles && rec.current !== 'none') drawTiles(ctx, rec, rec.layers[rec.current], k, st, true);
    if (withTiles && rec.labelLayer && map.hasLayer(rec.labelLayer)) drawTiles(ctx, rec, rec.labelLayer, k, st, false);
    for (const o of collectOverlays(cont)) {
      ctx.save(); ctx.globalAlpha = o.a; ctx.imageSmoothingEnabled = o.smooth;
      const x0 = Math.round(o.x0 * k), y0 = Math.round(o.y0 * k);
      ctx.drawImage(o.img, x0, y0, Math.round(o.x1 * k) - x0, Math.round(o.y1 * k) - y0); ctx.restore();
    }
    const S = canvasSurface(ctx, plan.cW, plan.cH), dark = studio.isDark(), dataOpt = { dark, res: 1 / plan.g, us: plan.g };
    ctx.setTransform(k, 0, 0, k, 0, 0);
    if (!(cp && cp.keepPoints)) drawData(S, view, studio.scene(), st, dataOpt);
    ctx.restore();
    if (rings && cp.border && cp.bw > 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      strokeRingsCanvas(ctx, rings, [0, 0, W, H], cp.outer, asHex(cp.bcol || '#17212b'), Math.max(0.6, cp.bw * k * plan.g));
    }
    ctx.setTransform(k, 0, 0, k, 0, 0);
    if (cp && cp.keepPoints) drawData(S, view, studio.scene(), st, dataOpt);
    if (!opt.noDecor) drawDecorScaled(S, view, st, { legend: studio.legendModel(), dark, attribution: withTiles ? attributionText(rec) : '', live: false, grid: plan.g, dpiOut: plan.dpi, kc: k });
    return cv;
  }
  function composeSvg(studio, plan, ex) {
    const rec = studio.rec, map = rec.map, cont = map.getContainer(), st = studio.style;
    const S = svgSurface(plan.W, plan.H, plan.mm ? plan.mm[0] + 'mm' : null, plan.mm ? plan.mm[1] + 'mm' : null);
    const view = mapView(map), dark = studio.isDark(), cp = plan.clip;
    const rings = cp ? projectClip(cp.regs, view, 1, [0, 0, plan.W, plan.H]) : null;
    const outCol = cp ? outsideFill(studio, cp, ex.fmt) : null;
    if (cp) { if (outCol) S.rect(0, 0, plan.W, plan.H, { fill: outCol }); }
    else if (st.bgMode !== 'transparent') S.rect(0, 0, plan.W, plan.H, { fill: studio.bgColor() });
    if (rings) S.clipRings(rings);
    if (cp && st.bgMode !== 'transparent') S.rect(0, 0, plan.W, plan.H, { fill: studio.bgColor() });
    for (const o of collectOverlays(cont)) S.image(o.img, o.x0, o.y0, o.x1 - o.x0, o.y1 - o.y0, { a: o.a, smooth: o.smooth });
    if (!(cp && cp.keepPoints)) drawData(S, view, studio.scene(), st, { dark, res: 2 });
    if (rings) S.clipEnd();
    if (rings && cp.border && cp.bw > 0) strokeRingsSvg(S, rings, [0, 0, plan.W, plan.H], cp.outer, asHex(cp.bcol || '#17212b'), cp.bw);
    if (cp && cp.keepPoints) drawData(S, view, studio.scene(), st, { dark, res: 2 });
    drawDecorScaled(S, view, st, { legend: studio.legendModel(), dark, attribution: '', live: false, grid: 1, dpiOut: 96, kc: 1 });
    return S.finish();
  }
  const canvasBlob = (cv, mime, q) => new Promise((res, rej) => { try { cv.toBlob(b => b ? res(b) : rej(new Error('toBlob')), mime, q); } catch (e) { rej(e); } });

  /* ================= TIFF and GeoTIFF =================
     Written by hand from the composed canvas: baseline TIFF, 8 bits per sample, RGB (or RGBA when the outside of the
     picture is transparent), one strip every ~64 kB, PackBits compression, and the physical resolution (XResolution,
     YResolution, ResolutionUnit) so that editing software opens the picture at the size it was asked for. The
     georeferenced flavour adds the three tags mapping software reads (pixel scale, tie point and the key directory)
     for Web Mercator, which is the projection the composition is already in. */
  const TIFF_TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 12: 8 };
  const TIFF_SOFTWARE = 'BioModelling Pro';                         // the Software tag names the program that wrote the file
  /* PackBits: runs of three or more equal bytes are written as a count and one byte, everything else literally */
  function packBits(src) {
    const n = src.length, out = new Uint8Array(n + (n >> 7) + 8);
    let o = 0, i = 0;
    while (i < n) {
      let run = 1;
      while (run < 128 && i + run < n && src[i + run] === src[i]) run++;
      if (run >= 3) { out[o++] = 257 - run; out[o++] = src[i]; i += run; continue; }
      let j = i + 1;
      while (j < n && j - i < 128 && !(j + 2 < n && src[j] === src[j + 1] && src[j + 1] === src[j + 2])) j++;
      const len = j - i;
      out[o++] = len - 1;
      for (let q = 0; q < len; q++) out[o++] = src[i + q];
      i = j;
    }
    return out.subarray(0, o);
  }
  /* o: {dpi, alpha, compress, description, software, geo:{X, Y, sx, sy} | null} */
  function makeTiff(cv, o) {
    const W = cv.width, H = cv.height, spp = o.alpha ? 4 : 3, comp = o.compress === false ? 1 : 32773;
    const ctx = cv.getContext('2d'), rowBytes = W * spp;
    const rowsPerStrip = clamp(Math.floor(65536 / Math.max(1, rowBytes)) || 1, 1, H);
    const strips = [];
    for (let y = 0; y < H; y += rowsPerStrip) {
      const rows = Math.min(rowsPerStrip, H - y), d = ctx.getImageData(0, y, W, rows).data, npx = W * rows;
      let raw;
      if (spp === 4) { raw = new Uint8Array(npx * 4); raw.set(d); }
      else { raw = new Uint8Array(npx * 3); for (let i = 0, p = 0, q = 0; i < npx; i++, p += 4, q += 3) { raw[q] = d[p]; raw[q + 1] = d[p + 1]; raw[q + 2] = d[p + 2]; } }
      strips.push(comp === 1 ? raw : packBits(raw));
    }
    const enc = new TextEncoder(), ascii = s => enc.encode(String(s == null ? '' : s).slice(0, 400) + '\0');
    const den = 1000, num = Math.round(clamp(+o.dpi || 96, 1, 20000) * den);
    const E = [], put = (tag, type, values) => E.push({ tag, type, values });
    put(256, 4, [W]); put(257, 4, [H]); put(258, 3, new Array(spp).fill(8)); put(259, 3, [comp]); put(262, 3, [2]);
    put(270, 2, ascii(o.description)); put(273, 4, strips.map(() => 0));
    put(277, 3, [spp]); put(278, 4, [rowsPerStrip]); put(279, 4, strips.map(s => s.length));
    put(282, 5, [num, den]); put(283, 5, [num, den]); put(284, 3, [1]); put(296, 3, [2]); put(305, 2, ascii(o.software));
    if (spp === 4) put(338, 3, [2]);                                // unassociated alpha, which is what a canvas holds
    if (o.geo) {
      put(33550, 12, [o.geo.sx, o.geo.sy, 0]);
      put(33922, 12, [0, 0, 0, o.geo.X, o.geo.Y, 0]);
      /* version 1.1.0, three keys: projected model, pixel is area, EPSG:3857 */
      put(34735, 3, [1, 1, 0, 3, 1024, 0, 1, 1, 1025, 0, 1, 1, 3072, 0, 1, 3857]);
      put(34737, 2, ascii('WGS 84 / Pseudo-Mercator (EPSG:3857)'));
    }
    E.sort((a, b) => a.tag - b.tag);
    const countOf = e => e.type === 5 ? e.values.length / 2 : e.values.length;
    const bytesOf = e => countOf(e) * TIFF_TYPE_SIZE[e.type];
    const align = (v, a) => v + ((a - v % a) % a);
    let off = 8 + 2 + E.length * 12 + 4;
    for (const e of E) {
      const len = bytesOf(e);
      if (len <= 4) { e.inline = true; continue; }
      off = align(off, Math.min(8, TIFF_TYPE_SIZE[e.type]));
      e.off = off; off += len;
    }
    let so = align(off, 2);
    const offs = [];
    strips.forEach(s => { offs.push(so); so += s.length + (s.length % 2); });
    const eOff = E.find(e => e.tag === 273); eOff.values = offs;
    const buf = new ArrayBuffer(so), dv = new DataView(buf), u8 = new Uint8Array(buf);
    const writeVals = (at, e) => {
      const v = e.values;
      if (e.type === 1 || e.type === 2) for (let i = 0; i < v.length; i++) dv.setUint8(at + i, v[i]);
      else if (e.type === 3) for (let i = 0; i < v.length; i++) dv.setUint16(at + i * 2, v[i], true);
      else if (e.type === 4 || e.type === 5) for (let i = 0; i < v.length; i++) dv.setUint32(at + i * 4, v[i], true);
      else for (let i = 0; i < v.length; i++) dv.setFloat64(at + i * 8, v[i], true);
    };
    dv.setUint16(0, 0x4949, true); dv.setUint16(2, 42, true); dv.setUint32(4, 8, true); dv.setUint16(8, E.length, true);
    E.forEach((e, i) => {
      const p = 10 + i * 12;
      dv.setUint16(p, e.tag, true); dv.setUint16(p + 2, e.type, true); dv.setUint32(p + 4, countOf(e), true);
      if (e.inline) writeVals(p + 8, e); else { dv.setUint32(p + 8, e.off, true); writeVals(e.off, e); }
    });
    dv.setUint32(10 + E.length * 12, 0, true);                      // no second image
    strips.forEach((s, i) => u8.set(s, offs[i]));
    return buf;
  }
  /* Top-left corner and pixel size of the picture in Web Mercator metres, read from the map in its export view.
     Container pixels are linear in Mercator, so the two corners are enough. */
  const MERC_R = 6378137;
  const mercMetres = (lat, lon) => [lon * Math.PI / 180 * MERC_R, mercY(lat) * MERC_R];
  function geoRefFor(studio, plan) {
    const map = studio.rec.map, tl = map.containerPointToLatLng([0, 0]), br = map.containerPointToLatLng([plan.cW, plan.cH]);
    const a = mercMetres(tl.lat, tl.lng), b = mercMetres(br.lat, br.lng);
    return { X: a[0], Y: a[1], sx: (b[0] - a[0]) / plan.outW, sy: (a[1] - b[1]) / plan.outH };
  }
  const isoDay = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  function tiffTexts(studio, plan, geo) {
    const st = studio.style, bits = [];
    if ((st.title || '').trim()) bits.push(st.title.trim());
    if ((st.subtitle || '').trim()) bits.push(st.subtitle.trim());
    if ((st.credit || '').trim()) bits.push(st.credit.trim());
    bits.push(plan.outW + ' x ' + plan.outH + ' px, ' + plan.dpi + ' dpi');
    if (geo) bits.push('EPSG:3857');
    bits.push(isoDay());
    return bits.join(' | ');
  }

  /* returns {blob, ext, tiles, plan, cv, bounds}; cv is the composed canvas, which the preview shows for the formats
     a browser cannot display on its own */
  async function runExport(studio, ex) {
    const plan = planExport(studio, ex);
    const geo = ex.fmt === 'geotiff', tiff = geo || ex.fmt === 'tiff';
    return withExportView(studio, plan, async () => {
      const bounds = studio.rec.map.getBounds();
      if (ex.fmt === 'svg') return { blob: new Blob([composeSvg(studio, plan, ex)], { type: 'image/svg+xml;charset=utf-8' }), ext: 'svg', tiles: false, plan, bounds };
      const mime = ex.fmt === 'jpeg' ? 'image/jpeg' : ex.fmt === 'webp' ? 'image/webp' : 'image/png';
      const noDecor = geo && ex.geoDecor !== true;
      const st = studio.style;
      /* alpha is written only when something really is transparent */
      const alpha = st.bgMode === 'transparent' || !!(plan.clip && plan.clip.outside === 'transparent');
      let cv = null;
      const make = async withTiles => {
        cv = composeRaster(studio, plan, ex, withTiles, { noDecor });
        if (tiff) return new Blob([makeTiff(cv, { dpi: plan.dpi, alpha, compress: ex.tiffPack !== false,
          description: tiffTexts(studio, plan, geo), software: TIFF_SOFTWARE, geo: geo ? geoRefFor(studio, plan) : null })], { type: 'image/tiff' });
        let blob = await canvasBlob(cv, mime, ex.quality);
        if (blob.type === 'image/png' && mime === 'image/png') blob = await addPhys(blob, plan.dpi);
        return blob;
      };
      let blob, tiles = true;
      try { blob = await make(true); }
      catch (e) {
        if (e && (e.name === 'SecurityError' || /taint|insecure/i.test(e.message))) { blob = await make(false); tiles = false; }
        else throw e;
      }
      const ext = tiff ? 'tif' : blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'png';
      return { blob, ext, tiles, plan, cv, bounds };
    });
  }

  /* ================= styles: defaults, presets, validation ================= */
  function defaultsFor(kind) {
    const d = {
      base: 'auto', labels: false, baseOpacity: 1, gray: 0, bright: 1, contrast: 1, sat: 1, bgMode: 'theme', bgColor: '#ffffff',
      title: '', subtitle: '', credit: '', titlePos: 'tl', titleSize: 22, font: 'sans', italic: false, textAuto: true, textColor: '#17212b', textBox: 'none', boxAlpha: 0.85, creditPos: 'bl',
      north: 'arrow', northPos: 'tr', northSize: 46, northInk: '', northPaper: '', northLetters: true, northRot: 0, northMargin: 0,
      scaleOn: true, scalePos: 'bl', scaleStyle: 'alt', scaleSegs: 4, scaleLenMode: 'auto', scaleFixed: 500, scaleUnit: 'km', scaleLabelPos: 'above', scaleThick: 6, scaleInk: '', scalePaper: '', scaleBox: false, scaleMargin: 0,
      grat: true, gratColor: '#6b7785', gratAlpha: 0.45,
      textScale: 1, titleBold: true, titleColor: '', subSize: 0, subBold: false, subItalic: false, subColor: '', creditSize: 12, creditBold: false, creditItalic: false, creditColor: '',
      legTitleSize: 0, legTitleBold: true, legTitleItalic: false, legTitleColor: '', legLabelBold: false, legLabelItalic: false, legLabelColor: '',
      scaleSize: 13, scaleBold: true, scaleItalic: false, scaleColor: '', gratSize: 12, gratBold: false, gratItalic: false, gratLabelColor: '',
      northLetterSize: 0, northBold: true, northItalic: false, northColor: '',
      /* per-element font family; empty = the family of the whole map (`font`) */
      titleFont: '', subFont: '', creditFont: '', legTitleFont: '', legLabelFont: '',
      legendOn: true, legendPos: 'br', legendTitle: '', legendSize: 13, legendBox: 'auto',
      /* legend layout: 0 = automatic in every one of them */
      legTitleOn: true, legendCols: 0, legendGap: 1, legendSwatch: 1, legendBarW: 0, legendBarH: 0, legendTicks: 0,
      frameOn: false, frameColor: '#17212b', frameWidth: 1.5, frameMargin: 0, frameFill: '#ffffff', cursor: true,
      radius: 4.5, fillAlpha: 0.85, outlineW: 0.8, outlineColor: '#ffffff', shape: 'circle', halo: 0,
      mode: 'points', heatRadius: 24, heatIntensity: 0.28, gridSize: 1, hullFill: 0.12,
      ramp: 'viridis', rampRev: false, whiteMin: false, classMethod: 'quantile', nClasses: 6, legendMode: 'classed', catPalette: 'okabe', catColors: {},
    };
    if (kind === 'points') { d.ramp = 'YlOrRd'; d.catPalette = 'okabe'; }
    if (kind === 'thematic') { d.catPalette = 'auto'; d.radius = 5; }
    if (kind === 'cluster') { d.catPalette = 'auto'; d.radius = 5; }
    if (kind === 'raster') { d.catPalette = 'auto'; d.radius = 3; d.outlineW = 0.7; d.ramp = 'suit'; }
    return d;
  }
  const PRESETS = [
    { id: 'publication', es: 'Publicación', en: 'Publication', des: 'Fondo gris claro, puntos finos, marco y título', den: 'Muted light basemap, small crisp points, frame and title',
      s: { base: 'gray', labels: true, baseOpacity: 1, gray: 0, bright: 1, contrast: 1, sat: 1, bgMode: 'white', radius: 3.2, fillAlpha: 0.9, outlineW: 0.6, outlineColor: '#ffffff', shape: 'circle', halo: 0,
        titlePos: 'tl', titleSize: 18, font: 'sans', italic: true, textAuto: true, textBox: 'none', north: 'arrow', northPos: 'tr', northSize: 40, scaleOn: true, scalePos: 'bl',
        grat: true, gratColor: '#6b7785', gratAlpha: 0.5, gratSize: 12, legendOn: true, legendPos: 'br', legendBox: 'light', legendSize: 13, scaleStyle: 'alt', textScale: 1,
        frameOn: true, frameColor: '#111111', frameWidth: 1, frameMargin: 0, frameFill: '#ffffff', title: '@' } },
    { id: 'presentation', es: 'Presentación oscura', en: 'Dark presentation', des: 'Fondo oscuro, puntos grandes con halo, leyenda oscura', den: 'Dark basemap, large points with halo, dark legend',
      s: { base: 'darkgray', labels: true, baseOpacity: 1, gray: 0, bright: 1, contrast: 1, sat: 1, bgMode: 'theme', radius: 6, fillAlpha: 0.92, outlineW: 1, outlineColor: '#0b1116', shape: 'circle', halo: 1.5,
        titlePos: 'tl', titleSize: 30, font: 'sans', italic: false, textAuto: true, textBox: 'none', north: 'modern', northPos: 'tr', northSize: 48, scaleOn: true, scalePos: 'bl', scaleStyle: 'solid', textScale: 1,
        grat: false, legendOn: true, legendPos: 'br', legendBox: 'dark', legendSize: 16, frameOn: false, title: '@' } },
    { id: 'field', es: 'Guía de campo', en: 'Field guide', des: 'Topográfico, puntos grandes, rosa de los vientos y retícula', den: 'Topographic, large points, compass rose and graticule',
      s: { base: 'topoEsri', labels: false, baseOpacity: 1, gray: 0, bright: 1, contrast: 1, sat: 0.9, bgMode: 'white', radius: 6.5, fillAlpha: 0.95, outlineW: 1.4, outlineColor: '#ffffff', shape: 'circle', halo: 1.5,
        titlePos: 'tl', titleSize: 22, font: 'serif', italic: true, textAuto: true, textBox: 'light', boxAlpha: 0.88, north: 'rose8', northPos: 'tr', northSize: 66, scaleOn: true, scalePos: 'bl', scaleStyle: 'stepped', textScale: 1,
        grat: true, gratColor: '#3b4652', gratAlpha: 0.6, gratSize: 13, legendOn: true, legendPos: 'br', legendBox: 'outline', legendSize: 14,
        frameOn: true, frameColor: '#17212b', frameWidth: 2, frameMargin: 6, frameFill: '#ffffff', title: '@' } },
    { id: 'poster', es: 'Cartel', en: 'Poster', des: 'Imagen de satélite, título grande y marco blanco', den: 'Satellite imagery, large title and white frame',
      s: { base: 'sat', labels: true, baseOpacity: 1, gray: 0, bright: 0.92, contrast: 1.05, sat: 1, bgMode: 'theme', radius: 7.5, fillAlpha: 0.95, outlineW: 1.6, outlineColor: '#ffffff', shape: 'circle', halo: 2.5,
        titlePos: 'tl', titleSize: 38, font: 'serif', italic: false, textAuto: false, textColor: '#ffffff', textBox: 'dark', boxAlpha: 0.72, north: 'rose16', northPos: 'tr', northSize: 90, scaleOn: true, scalePos: 'bl', scaleStyle: 'line', textScale: 1.1,
        grat: false, legendOn: true, legendPos: 'br', legendBox: 'dark', legendSize: 17, frameOn: true, frameColor: '#17212b', frameWidth: 2, frameMargin: 14, frameFill: '#ffffff', title: '@' } },
    { id: 'clean', es: 'Solo datos', en: 'Data only', des: 'Sin mapa base, fondo blanco, retícula ligera', den: 'No basemap, white background, light graticule',
      s: { base: 'none', labels: false, bgMode: 'white', gray: 0, bright: 1, contrast: 1, sat: 1, baseOpacity: 1, radius: 4, fillAlpha: 0.85, outlineW: 0.6, outlineColor: '#ffffff', halo: 0,
        titlePos: 'tl', titleSize: 18, font: 'sans', italic: true, textAuto: true, textBox: 'none', north: 'minimal', northPos: 'tr', northSize: 40, scaleOn: true, scalePos: 'bl',
        grat: true, gratColor: '#8a97a3', gratAlpha: 0.55, gratSize: 12, legendOn: true, legendPos: 'br', legendBox: 'none', legendSize: 13, scaleStyle: 'ruler', textScale: 1, frameOn: true, frameColor: '#111111', frameWidth: 1, frameMargin: 0, title: '@' } },
  ];

  const FONT_KEYS = ['sans', 'serif', 'mono', 'georgia', 'palatino', 'trebuchet', 'verdana', 'times', 'courier'];
  const FONT_NAMES = { sans: ['Sans-serif (sistema)', 'Sans-serif (system)'], serif: ['Serif (sistema)', 'Serif (system)'], mono: ['Monoespaciada', 'Monospace'],
    georgia: ['Georgia', 'Georgia'], palatino: ['Palatino', 'Palatino'], trebuchet: ['Trebuchet', 'Trebuchet'], verdana: ['Verdana', 'Verdana'], times: ['Times New Roman', 'Times New Roman'], courier: ['Courier New', 'Courier New'] };
  const ENUMS = {
    bgMode: ['theme', 'white', 'transparent', 'custom'], titlePos: ['tl', 'tc', 'tr', 'bl', 'bc', 'br'], creditPos: ['tl', 'tc', 'tr', 'bl', 'bc', 'br'], font: FONT_KEYS,
    /* '' = follow the family of the whole map, so an old saved style (which has no such key) still loads */
    titleFont: ['', ...FONT_KEYS], subFont: ['', ...FONT_KEYS], creditFont: ['', ...FONT_KEYS], legTitleFont: ['', ...FONT_KEYS], legLabelFont: ['', ...FONT_KEYS],
    textBox: ['none', 'light', 'dark'], north: ['off', ...NORTH_STYLES], scaleStyle: SCALE_STYLES, scaleLenMode: ['auto', 'fixed'], scaleUnit: ['km', 'mi', 'nmi', 'm'], scaleLabelPos: ['above', 'below'], northPos: ['tl', 'tr', 'bl', 'br'], scalePos: ['tl', 'tr', 'bl', 'br'], legendPos: ['tl', 'tr', 'bl', 'br'],
    legendBox: ['auto', 'none', 'light', 'dark', 'outline'], shape: ['circle', 'square', 'triangle', 'diamond', 'cross', 'star'], mode: ['points', 'heat', 'grid', 'hull'],
    classMethod: ['quantile', 'equal', 'jenks'], legendMode: ['classed', 'continuous'],
  };
  /* keep only well-formed values from a saved or loaded style */
  function sanitize(obj, defs) {
    const out = {};
    if (!obj || typeof obj !== 'object') return out;
    for (const k of Object.keys(defs)) {
      if (!(k in obj)) continue;
      const v = obj[k], d = defs[k];
      if (typeof d === 'number') { if (typeof v === 'number' && isFinite(v)) out[k] = v; }
      else if (typeof d === 'boolean') { if (typeof v === 'boolean') out[k] = v; }
      else if (k === 'catColors') { if (v && typeof v === 'object') { const o = {}; for (const c of Object.keys(v)) if (/^#[0-9a-f]{6}$/i.test(v[c])) o[c] = v[c]; out[k] = o; } }
      else if (typeof d === 'string' && typeof v === 'string') {
        if (ENUMS[k] && !ENUMS[k].includes(v)) continue;
        if (k === 'base' && v !== 'auto' && !mapkit.BASEMAPS().some(b => b[0] === v)) continue;
        if (k === 'ramp' && !RAMPS[v]) continue;
        if (k === 'catPalette' && v !== 'auto' && !PALETTES[v]) continue;
        if (/(Color|Fill|Ink|Paper)$/.test(k) && !(v === '' && d === '') && !/^#[0-9a-f]{6}$/i.test(v)) continue;
        out[k] = v.slice(0, 200);
      }
    }
    return out;
  }
  const PERSIST_SKIP = ['title', 'subtitle', 'credit', 'legendTitle', 'catColors'];
  const KIND_TAG = { points: 'records', thematic: 'thematic', cluster: 'clusters', raster: 'sdm' };
  const BASE_KEYS = new Set(['base', 'labels', 'baseOpacity', 'gray', 'bright', 'contrast', 'sat', 'bgMode', 'bgColor']);
  /* style keys that only change the decoration (title, arrow, legend box, frame…): the data layer is not redrawn for them */
  const DRAW_KEYS = new Set(['radius', 'fillAlpha', 'outlineW', 'outlineColor', 'shape', 'halo', 'heatRadius', 'heatIntensity']);
  const DECOR_ONLY = { has: k => !BASE_KEYS.has(k) && !DATA_KEYS.has(k) && !DRAW_KEYS.has(k) };
  const DATA_KEYS = new Set(['ramp', 'rampRev', 'whiteMin', 'classMethod', 'nClasses', 'legendMode', 'catPalette', 'catColors', 'mode', 'gridSize', 'hullFill']);
  const schedule = fn => { let pending = false; return () => { if (pending) return; pending = true; const run = () => { if (!pending) return; pending = false; fn(); }; requestAnimationFrame(run); setTimeout(run, 80); }; };
  const mk = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const POS6 = [['tl', 'Arriba izquierda', 'Top left'], ['tc', 'Arriba centro', 'Top centre'], ['tr', 'Arriba derecha', 'Top right'], ['bl', 'Abajo izquierda', 'Bottom left'], ['bc', 'Abajo centro', 'Bottom centre'], ['br', 'Abajo derecha', 'Bottom right']];
  const POS4 = POS6.filter(p => p[0][1] !== 'c');
  let studioUid = 0;

  /* ================= the studio ================= */
  function attach(target, opts) {
    const rec = mapkit.getRec(target);
    if (!rec) throw new Error('mapstudio: unknown map');
    if (rec.studio) return rec.studio;
    opts = opts || {};
    const kind = opts.kind || 'points', hooks = opts.hooks || {}, map = rec.map, cont = map.getContainer(), uid = ++studioUid;
    mapkit.dropLegacyDecor(rec);
    cont.classList.add('bmp-studio-map');

    const defs = defaultsFor(kind);
    let saved = {}; try { saved = JSON.parse(lsGet(PREFIX + kind) || '{}'); } catch (e) { saved = {}; }
    const st = Object.assign({}, defs, sanitize(saved, defs));
    const exDefs = exDefaults();
    let savedEx = {}; try { savedEx = JSON.parse(lsGet(EX_PREFIX + kind) || '{}'); } catch (e) { savedEx = {}; }
    const ex = Object.assign({}, exDefs, sanitizeEx(savedEx, exDefs));
    let data = { items: [], kind: 'fixed' }, cats = [], catCols = {}, scale = null, gridScale = null, legendFn = null, extrasFn = null, catSig = '';
    const scene = { mode: 'points', items: [], grid: null, extras: [] };
    const studio = { rec, kind, style: st, ex, hooks, map };
    rec.studio = studio; STUDIOS.push(studio);

    /* ---- data ---- */
    const resolve = x => typeof x === 'function' ? x() : x;
    function buildGrid() {
      const size = st.gridSize, cells = new Map();
      for (const it of data.items) {
        if (!isFinite(it.lat) || !isFinite(it.lon)) continue;
        const ix = Math.floor(it.lon / size), iy = Math.floor(it.lat / size), key = ix + ',' + iy;
        let c = cells.get(key); if (!c) { c = { lat0: iy * size, lat1: Math.min(85.05, (iy + 1) * size), lon0: ix * size, lon1: (ix + 1) * size, n: 0 }; cells.set(key, c); }
        c.n++;
      }
      const list = [...cells.values()]; gridScale = makeScale(list.map(c => c.n), st);
      if (gridScale) list.forEach(c => { c.c = gridScale.colorOf(c.n); });
      scene.grid = { cells: list };
    }
    function buildHulls() {
      const groups = new Map();
      for (const it of data.items) { if (!isFinite(it.lat)) continue; let g = groups.get(it.c); if (!g) { g = []; groups.set(it.c, g); } g.push([it.lon, it.lat]); }
      for (const [c, pts] of groups) if (pts.length >= 3) scene.extras.push({ pts: convexHull(pts).map(p => [p[1], p[0]]), stroke: c, fill: c, fa: st.hullFill, lw: 1.8 });
    }
    function prepare() {
      const items = data.items || [];
      scene.items = items; scene.grid = null; gridScale = null;
      scene.mode = kind === 'points' ? st.mode : (kind === 'cluster' && st.mode === 'hull') ? 'hull' : 'points';
      scene.extras = extrasFn ? extrasFn() || [] : [];
      if (data.kind === 'categorical') {
        const cnt = new Map(); items.forEach(it => { if (it.cat != null && it.cat !== '') cnt.set(it.cat, (cnt.get(it.cat) || 0) + 1); });
        cats = data.cats ? data.cats.filter(c => cnt.has(c)) : [...cnt.keys()].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
        catCols = categoryColors(cats, st, data.defaults);
        items.forEach(it => { it.c = catCols[it.cat] || '#9aa5b1'; });
        scale = null;
      } else if (data.kind === 'continuous') {
        cats = []; scale = makeScale(items.map(i => i.v), st);
        items.forEach(it => { it.c = scale && it.v != null && isFinite(it.v) ? scale.colorOf(it.v) : '#bdbdbd'; });
      } else { cats = []; scale = null; }
      if (scene.mode === 'grid') buildGrid();
      if (scene.mode === 'hull') buildHulls();
    }
    studio.scene = () => scene;
    studio.setData = d => { data = d || { items: [], kind: 'fixed' }; prepare(); syncCats(); redrawAll(); };
    studio.setExtras = fn => { extrasFn = fn; prepare(); redrawAll(); };
    studio.setLegend = fn => { legendFn = fn; redrawAll(); };
    studio.showData = on => { if (on) { if (!map.hasLayer(layer)) layer.addTo(map); } else if (map.hasLayer(layer)) map.removeLayer(layer); };
    studio.rampStops = () => rampStops(st.ramp, st.rampRev, st.whiteMin);
    studio.rampName = () => rampName(st.ramp);
    studio.itemCount = () => (data.items || []).length;
    /* Tight bounds of what is drawn: the points (or grid cells) of the data layer and the non-transparent part of every image
       overlay of the map; null when nothing is drawn. */
    studio.dataBounds = () => {
      let b = null;
      const add = (lat, lon) => { if (!isFinite(lat) || !isFinite(lon)) return; if (!b) b = [lat, lon, lat, lon]; else { b[0] = Math.min(b[0], lat); b[1] = Math.min(b[1], lon); b[2] = Math.max(b[2], lat); b[3] = Math.max(b[3], lon); } };
      if (map.hasLayer(layer)) {
        if (scene.mode === 'grid' && scene.grid) scene.grid.cells.forEach(c => { add(c.lat0, c.lon0); add(c.lat1, c.lon1); });
        else for (const it of scene.items) add(it.lat, it.lon);
      }
      map.eachLayer(l => { if (l instanceof L.ImageOverlay && (l.options.opacity == null || l.options.opacity > 0)) { const o = overlayTight(l); add(o.getSouth(), o.getWest()); add(o.getNorth(), o.getEast()); } });
      return b ? L.latLngBounds([b[0], b[1]], [b[2], b[3]]) : null;
    };
    /* screen: zoom so that the drawn data fill the map (with a small margin and room for the title) */
    studio.fitToData = () => {
      const b = studio.dataBounds(); if (!b) return false;
      const size = map.getSize(), t = studio.style.title || studio.style.subtitle ? 44 : 0;
      map.fitBounds(b, { paddingTopLeft: [size.x * 0.04, size.y * 0.04 + t], paddingBottomRight: [size.x * 0.04, size.y * 0.04 + 14], maxZoom: 16 });
      return true;
    };

    studio.legendModel = () => {
      if (legendFn) return legendFn();
      const title = resolve(data.title) || '', unit = resolve(data.unit) || '', note = resolve(data.note) || '';
      if (scene.mode === 'heat') return { title: T('Densidad de registros', 'Record density'), kind: 'grad', stops: rampStops(st.ramp, st.rampRev, st.whiteMin), ticks: [{ t: 0, label: T('baja', 'low') }, { t: 1, label: T('alta', 'high') }] };
      if (scene.mode === 'grid') return gridScale ? { title: T('Registros por celda', 'Records per cell'), unit: fmt(st.gridSize, st.gridSize < 1 ? 2 : 0) + '° × ' + fmt(st.gridSize, st.gridSize < 1 ? 2 : 0) + '°', ...gridScale.legend() } : null;
      if (data.kind === 'categorical') return { title, unit, note, kind: 'cat', items: cats.map(c => ({ color: catCols[c], label: data.catLabel ? data.catLabel(c) : String(c), shape: 'point' })) };
      if (data.kind === 'continuous' && scale) return { title, unit, note, ...scale.legend() };
      return null;
    };

    /* ---- colours of the surroundings ---- */
    studio.bgColor = () => st.bgMode === 'white' ? '#ffffff' : st.bgMode === 'custom' ? st.bgColor : st.bgMode === 'transparent' ? '#ffffff' : asHex(cssVar('--map-bg', '#dbe8ee'));
    studio.isDark = () => {
      const bgLum = st.bgMode === 'transparent' ? 1 : lum(studio.bgColor()), meta = mapkit.baseMeta(rec.current);
      if (rec.current === 'none' || st.baseOpacity < 0.35) return bgLum < 0.45;
      return (meta.dark ? 0.2 : 0.85) * st.bright < 0.45;
    };

    /* ---- base map + background ---- */
    function applyBase() {
      const key = st.base === 'auto' ? mapkit.autoBase() : st.base;
      mapkit.setBase(rec, key, st.base !== 'auto');
      const pane = map.getPane('tilePane');
      pane.style.opacity = st.baseOpacity;
      pane.style.filter = needsFilter(st) ? `grayscale(${st.gray}) brightness(${st.bright}) contrast(${st.contrast}) saturate(${st.sat})` : '';
      mapkit.setLabels(rec, !!st.labels && rec.current !== 'none', studio.isDark());
      cont.classList.toggle('bmp-transparent', st.bgMode === 'transparent');
      cont.style.backgroundColor = st.bgMode === 'theme' ? '' : st.bgMode === 'white' ? '#ffffff' : st.bgMode === 'custom' ? st.bgColor : 'transparent';
    }

    /* ---- live drawing: data layer, decor canvas, legend panel ---- */
    const layer = new DataLayer(studio);
    layer.addTo(map);
    const decor = mk('canvas', 'bmp-decor-canvas'); decor.setAttribute('aria-hidden', 'true'); cont.appendChild(decor);
    const cursor = mk('div', 'bmp-cursor'); cursor.setAttribute('aria-hidden', 'true'); cont.appendChild(cursor);
    const drawDecorLive = () => {
      const size = map.getSize(); if (size.x < 20 || size.y < 20) return;
      const r = dpr(), w = Math.round(size.x * r), h = Math.round(size.y * r);
      if (decor.width !== w || decor.height !== h) { decor.width = w; decor.height = h; decor.style.width = size.x + 'px'; decor.style.height = size.y + 'px'; }
      const ctx = decor.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h); ctx.setTransform(r, 0, 0, r, 0, 0);
      try {
        drawScreenMask(ctx, size);
        drawDecorScaled(canvasSurface(ctx, size.x, size.y), mapView(map), st, { legend: studio.legendModel(), dark: studio.isDark(), attribution: '', live: true });
      } catch (e) { console.warn('map studio: decoration failed', e); }
    };
    /* A light version of the export clip, drawn on the map on screen so that the study area is visible before exporting.
       Everything outside the region is veiled instead of removed, so the data outside can still be seen while working. */
    function drawScreenMask(ctx, size) {
      if (!ex.clipOn || !ex.clipScreen) return;
      const cp = clipPlanFor(studio, ex); if (!cp) return;
      const view = mapView(map), rings = projectClip(cp.regs, view, 1, [0, 0, size.x, size.y]);
      if (!rings.length) return;
      const veil = outsideFill(studio, cp, 'png') || (studio.isDark() ? '#0b1116' : '#ffffff');
      const box = [0, 0, size.x, size.y];
      ctx.save();
      ringPath(ctx, [boxRing(box), ...rings]);
      ctx.fillStyle = veil; ctx.globalAlpha = 0.74; ctx.fill('evenodd');
      ctx.restore();
      if (cp.border && cp.bw > 0) strokeRingsCanvas(ctx, rings, box, cp.outer, asHex(cp.bcol || '#17212b'), cp.bw);
    }
    const decorSoon = schedule(drawDecorLive);
    /* The legend shown as HTML under the map is given the very same fonts and layout as the one drawn inside the image, so
       the screen matches the export. Everything travels as custom properties, so the classes, the dark theme and the phone
       layout of the panel keep working. */
    function styleLegendPanel(box) {
      const lf = fontOf(st, 'legLabel', 13), tf = fontOf(st, 'legTitle', (+st.legendSize || 13) + 1), mt = legendMetrics(st, lf.size);
      const px = v => (Math.round(v * 100) / 100) + 'px', set = (k, v) => box.style.setProperty(k, v);
      set('--msleg-l-size', px(lf.size)); set('--msleg-l-weight', String(lf.weight)); set('--msleg-l-style', lf.italic ? 'italic' : 'normal');
      set('--msleg-l-family', lf.family); set('--msleg-l-color', lf.fill || 'var(--text)');
      set('--msleg-t-size', px(tf.size)); set('--msleg-t-weight', String(tf.weight)); set('--msleg-t-style', tf.italic ? 'italic' : 'normal');
      set('--msleg-t-family', tf.family); set('--msleg-t-color', tf.fill || 'var(--text)');
      set('--msleg-sw', px(mt.sw)); set('--msleg-row', px(Math.max(0, mt.lh - lf.size * 1.3)));
      set('--msleg-bar-w', px(mt.barW)); set('--msleg-bar-h', px(mt.barH));
      set('--msleg-cols', String(mt.cols >= 1 ? mt.cols : 1));
      box.classList.add('ms-legend-styled');
      return mt;
    }
    function renderLegendPanel() {
      const box = opts.legendPanel; if (!box) return;
      box.style.display = st.legendOn ? 'none' : '';
      if (st.legendOn) return;
      const m = studio.legendModel(); box.innerHTML = ''; if (!m) return;
      const mt = styleLegendPanel(box);
      const title = mt.titleOn ? ((st.legendTitle || '').trim() || m.title || '') : '';
      /* the unit goes in brackets after the title, or on its own when the title is not shown */
      const headHtml = title ? `<strong class="ms-legt">${esc(title)}${m.unit ? ' <span class="ms-unit">(' + esc(m.unit) + ')</span>' : ''}</strong>`
        : m.unit ? `<span class="ms-unit">${esc(m.unit)}</span>` : '';
      let html = `<div class="legend-grad">` + headHtml;
      if (m.kind === 'grad') {
        const ticks = resampleTicks(m.ticks, st.legendTicks);
        html += `<div class="ms-grad" style="background:linear-gradient(to right,${m.stops.join(',')})"></div><div class="ms-ticks">${ticks.map(t => `<span>${esc(t.label)}</span>`).join('')}</div>`;
      } else html += `<div class="ms-legitems">` + (m.items || []).map(it => `<div class="legend-item"><span class="legend-swatch" style="background:${it.color};${it.shape === 'square' ? 'border-radius:3px' : ''}"></span>${esc(it.label)}</div>`).join('') + '</div>';
      box.innerHTML = html + (m.note ? `<span class="ms-note">${esc(m.note)}</span>` : '') + '</div>';
    }
    const layerSoon = schedule(() => layer.redraw());
    function redrawAll() { layerSoon(); decorSoon(); renderLegendPanel(); }
    studio.redraw = redrawAll;
    map.on('move zoom resize moveend bmp:base', decorSoon);
    map.on('bmp:base', e => {
      if (e.user && st.base !== e.key) { st.base = e.key; syncUI(); persist(); }
      mapkit.setLabels(rec, !!st.labels && rec.current !== 'none', studio.isDark()); layer.redraw();
    });
    map.on('mousemove', e => {
      if (!st.cursor) { cursor.style.display = 'none'; return; }
      const p = map.wrapLatLng(e.latlng); cursor.textContent = fmt(p.lat, 4) + '°, ' + fmt(p.lng, 4) + '°'; cursor.style.display = 'block';
    });
    map.on('mouseout', () => { cursor.style.display = 'none'; });
    document.addEventListener('themechange', () => { layer.redraw(); decorSoon(); syncUI(); previewSoon(); });
    document.addEventListener('langchange', () => { refreshTexts(); decorSoon(); renderLegendPanel(); });

    /* ---- persistence ---- */
    let ptimer = null;
    function persist() {
      clearTimeout(ptimer);
      ptimer = setTimeout(() => { const o = {}; for (const k of Object.keys(st)) if (!PERSIST_SKIP.includes(k)) o[k] = st[k]; lsSet(PREFIX + kind, JSON.stringify(o)); }, 300);
    }
    let etimer = null;
    function persistEx() { clearTimeout(etimer); etimer = setTimeout(() => lsSet(EX_PREFIX + kind, JSON.stringify(ex)), 300); }
    /* any change of an export setting: remember it, redraw the mask on screen and refresh an open preview */
    const MASK_KEYS = new Set(['clipOn', 'clipWhat', 'clipOutside', 'clipColor', 'clipBorder', 'clipBorderWhat', 'clipBorderColor', 'clipBorderW', 'clipScreen']);
    function onExportChange(key) {
      persistEx();
      if (MASK_KEYS.has(key)) decorSoon();
      previewSoon();
    }

    /* ---- style changes ---- */
    function onStyle(key) {
      if (BASE_KEYS.has(key)) applyBase();
      if (DATA_KEYS.has(key)) { prepare(); syncCats(); }
      if (DECOR_ONLY.has(key)) { decorSoon(); renderLegendPanel(); } else redrawAll();
      syncUI(); persist();
      if (DATA_KEYS.has(key) && hooks.onChange) { try { hooks.onChange(key, st, studio); } catch (e) { console.warn(e); } }
    }
    const setStyle = (k, v) => { st[k] = v; onStyle(k); };
    studio.set = setStyle;
    function applyStyle(obj) {
      const o = sanitize(obj, defs);
      if (obj && obj.title === '@') o.title = ((hooks.defaultTitle && hooks.defaultTitle()) || st.title || '');
      Object.assign(st, o);
      applyBase(); prepare(); syncCats(); redrawAll(); syncUI(); persist();
      if (hooks.onChange) { try { hooks.onChange('preset', st, studio); } catch (e) { console.warn(e); } }
    }
    studio.applyStyle = applyStyle;

    /* ================= panel UI ================= */
    const panel = mk('details', 'mstudio'); panel.dataset.kind = kind;
    panel.innerHTML = `<summary><span class="ms-ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 4.5-9 4.5-9-4.5z"/><path d="M3 12l9 4.5 9-4.5"/><path d="M3 16.5l9 4.5 9-4.5"/></svg></span>` +
      `<span class="ms-tt">${L2('Estudio de mapa', 'Map studio')}</span><span class="ms-sub">${L2('mapa base, título, leyenda, colores, estilos y exportación', 'base map, title, legend, colours, looks and export')}</span></summary>`;
    const body = mk('div', 'ms-body'); panel.appendChild(body);
    const toolbar = mk('div', 'ms-bar'), bFit = mk('button', 'btn btn-secondary btn-sm', L2('Ajustar el mapa a los datos', 'Zoom to the data')); bFit.type = 'button';
    bFit.addEventListener('click', () => { if (!studio.fitToData()) say('warn', T('No hay datos dibujados que ajustar.', 'There is nothing drawn to zoom to.')); });
    toolbar.appendChild(bFit); body.appendChild(toolbar);
    const tabs = mk('div', 'ms-tabs'); tabs.setAttribute('role', 'tablist'); body.appendChild(tabs);
    const status = mk('div', 'ms-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const TABS = [['base', 'Mapa base', 'Base map'], ['text', 'Textos y fuentes', 'Text and fonts'], ['elements', 'Elementos', 'Elements'], ['layer', 'Puntos', 'Points'], ['colors', 'Colores', 'Colours'], ['looks', 'Estilos', 'Looks'], ['export', 'Exportar', 'Export']];
    const panes = {}, tabBtns = {};
    TABS.forEach(([id, es, en]) => {
      const b = mk('button', 'ms-tab', L2(es, en)); b.type = 'button'; b.setAttribute('role', 'tab'); b.id = `ms${uid}-tab-${id}`; b.setAttribute('aria-controls', `ms${uid}-pane-${id}`);
      const p = mk('div', 'ms-pane'); p.setAttribute('role', 'tabpanel'); p.id = `ms${uid}-pane-${id}`; p.setAttribute('aria-labelledby', b.id);
      b.addEventListener('click', () => showTab(id));
      b.addEventListener('keydown', e => {
        const i = TABS.findIndex(t => t[0] === id);
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const n = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length][0]; showTab(n); tabBtns[n].focus(); }
      });
      tabs.appendChild(b); body.appendChild(p); panes[id] = p; tabBtns[id] = b;
    });
    body.appendChild(status);
    function showTab(id) {
      TABS.forEach(([t]) => { const on = t === id; panes[t].hidden = !on; tabBtns[t].setAttribute('aria-selected', on ? 'true' : 'false'); tabBtns[t].tabIndex = on ? 0 : -1; tabBtns[t].classList.toggle('on', on); });
      if (id === 'export') updateExportInfo();
    }
    const say = (type, html) => { status.className = 'ms-status ' + (type || ''); status.innerHTML = html || ''; };

    /* generic control factory */
    const controls = []; let cuid = 0;
    const dk = () => data.kind, isPts = () => scene.mode === 'points' || scene.mode === 'hull';
    function section(paneId, es, en, when) {
      const s = mk('div', 'ms-sec'); s.innerHTML = `<div class="ms-sec-h">${L2(es, en)}</div>`;
      const g = mk('div', 'ms-grid'); s.appendChild(g); panes[paneId].appendChild(s);
      if (when) controls.push({ spec: { when }, wrap: s, update() {} });
      return g;
    }
    function add(host, spec) {
      const id = `ms${uid}-c${++cuid}`, c = { spec }, wrap = mk('div', 'ms-f' + (spec.wide ? ' ms-wide' : '') + (spec.t === 'check' ? ' ms-fc' : '')); c.wrap = wrap;
      const lbl = `<span class="ms-l">${L2(spec.es, spec.en)}</span>`;
      /* a control edits the style, or another store (the export settings) when spec.store is given */
      const store = spec.store || st, commit = spec.store ? (k, v) => { store[k] = v; if (spec.after) spec.after(v); if (store === ex) onExportChange(k); syncUI(); } : setStyle;
      if (spec.t === 'range') {
        wrap.innerHTML = `<label for="${id}">${lbl}</label><div class="ms-r"><input type="range" id="${id}" min="${spec.min}" max="${spec.max}" step="${spec.step}"><output for="${id}"></output></div>`;
        const inp = wrap.querySelector('input'), out = wrap.querySelector('output');
        inp.addEventListener('input', () => { commit(spec.k, parseFloat(inp.value)); });
        c.update = () => { inp.value = store[spec.k]; out.textContent = spec.fmt ? spec.fmt(store[spec.k]) : String(+(+store[spec.k]).toFixed(2)); };
      } else if (spec.t === 'select') {
        wrap.innerHTML = `<label for="${id}">${lbl}</label><select id="${id}"></select>`;
        const sel = wrap.querySelector('select');
        c.fill = () => { const cur = store[spec.k]; sel.innerHTML = ''; spec.opts().forEach(([v, name, dis]) => { const o = document.createElement('option'); o.value = v; o.textContent = name; o.disabled = !!dis; sel.appendChild(o); }); sel.value = cur; };
        sel.addEventListener('change', () => commit(spec.k, spec.num ? parseFloat(sel.value) : sel.value));
        c.update = () => { sel.value = store[spec.k]; };
      } else if (spec.t === 'check') {
        wrap.innerHTML = `<label class="ms-chk" for="${id}"><input type="checkbox" id="${id}"><span>${L2(spec.es, spec.en)}</span></label>`;
        const inp = wrap.querySelector('input');
        inp.addEventListener('change', () => commit(spec.k, inp.checked));
        c.update = () => { inp.checked = !!store[spec.k]; };
      } else if (spec.t === 'color') {
        wrap.innerHTML = `<label for="${id}">${lbl}</label><input type="color" id="${id}">`;
        const inp = wrap.querySelector('input');
        inp.addEventListener('input', () => commit(spec.k, inp.value));
        c.update = () => { inp.value = asHex(store[spec.k]); };
      } else if (spec.t === 'text') {
        wrap.innerHTML = `<label for="${id}">${lbl}</label><input type="text" id="${id}" maxlength="200" autocomplete="off">`;
        const inp = wrap.querySelector('input');
        inp.placeholder = spec.ph ? T(spec.ph[0], spec.ph[1]) : '';
        inp.addEventListener('input', () => commit(spec.k, inp.value));
        c.update = () => { if (document.activeElement !== inp) inp.value = store[spec.k]; inp.placeholder = spec.ph ? T(spec.ph[0], spec.ph[1]) : ''; };
      } else if (spec.t === 'num') {
        wrap.innerHTML = `<label for="${id}">${lbl}</label><input type="number" id="${id}" min="${spec.min}" max="${spec.max}" step="${spec.step || 1}">`;
        const inp = wrap.querySelector('input');
        inp.addEventListener('input', () => { const v = parseFloat(inp.value); if (isFinite(v)) commit(spec.k, v); });
        c.update = () => { if (document.activeElement !== inp) inp.value = store[spec.k]; };
      } else if (spec.t === 'colorauto') {
        /* a colour that may be "automatic" (empty string in the style) */
        wrap.innerHTML = `<label for="${id}">${lbl}</label><div class="ms-ca"><input type="color" id="${id}"><label class="ms-chk"><input type="checkbox"><span>${L2('auto', 'auto')}</span></label></div>`;
        const inp = wrap.querySelector('input[type=color]'), chk = wrap.querySelector('input[type=checkbox]');
        inp.addEventListener('input', () => { chk.checked = false; commit(spec.k, inp.value); });
        chk.addEventListener('change', () => commit(spec.k, chk.checked ? '' : inp.value));
        c.update = () => { const v = store[spec.k]; chk.checked = !v; if (v) inp.value = asHex(v); else inp.value = asHex(spec.def || '#17212b'); };
      } else if (spec.t === 'btn') {
        wrap.innerHTML = `<button type="button" class="btn btn-secondary btn-sm">${L2(spec.es, spec.en)}</button>`;
        wrap.querySelector('button').addEventListener('click', spec.act);
        c.update = () => {};
      }
      host.appendChild(wrap); controls.push(c); return c;
    }
    const optsOf = list => () => list.map(([v, es, en]) => [v, T(es, en)]);
    function syncUI() {
      controls.forEach(c => { if (c.update) c.update(); if (c.spec.when) c.wrap.hidden = !c.spec.when(st); });
      updateExportInfo();
    }
    function refreshTexts() {
      controls.forEach(c => { if (c.fill) c.fill(); });
      buildRampButtons(); syncCats(true); updateExportInfo(); syncUI();
      if (prevDlg) { prevDlg.setAttribute('aria-label', T('Vista previa de la exportación', 'Export preview')); if (prevOpen) refreshPreview(); }
    }

    /* ---- Base map ---- */
    let g = section('base', 'Mapa base', 'Base map');
    add(g, { t: 'select', k: 'base', es: 'Mapa base', en: 'Base map', wide: true, opts: () => [['auto', T('Automático (sigue el tema)', 'Automatic (follows the theme)')], ...mapkit.BASEMAPS().map(b => [b[0], b[1]])] });
    add(g, { t: 'check', k: 'labels', es: 'Nombres de lugares encima (etiquetas)', en: 'Place names on top (labels)', when: s => s.base !== 'none' });
    add(g, { t: 'range', k: 'baseOpacity', es: 'Opacidad del mapa base', en: 'Base map opacity', min: 0, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%' });
    g = section('base', 'Atenuar el mapa base para que resalten los datos', 'Mute the base map so the data stand out');
    add(g, { t: 'range', k: 'gray', es: 'Escala de grises', en: 'Greyscale', min: 0, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%' });
    add(g, { t: 'range', k: 'bright', es: 'Brillo', en: 'Brightness', min: 0.4, max: 1.6, step: 0.05, fmt: v => Math.round(v * 100) + '%' });
    add(g, { t: 'range', k: 'contrast', es: 'Contraste', en: 'Contrast', min: 0.4, max: 1.6, step: 0.05, fmt: v => Math.round(v * 100) + '%' });
    add(g, { t: 'range', k: 'sat', es: 'Saturación', en: 'Saturation', min: 0, max: 2, step: 0.05, fmt: v => Math.round(v * 100) + '%' });
    add(g, { t: 'btn', es: 'Aspecto apagado', en: 'Muted look', act: () => { Object.assign(st, { gray: 0.55, bright: 1.05, contrast: 0.9, sat: 0.5 }); onStyle('gray'); } });
    add(g, { t: 'btn', es: 'Quitar filtros', en: 'Clear filters', act: () => { Object.assign(st, { gray: 0, bright: 1, contrast: 1, sat: 1, baseOpacity: 1 }); onStyle('gray'); } });
    g = section('base', 'Fondo', 'Background');
    add(g, { t: 'select', k: 'bgMode', es: 'Fondo', en: 'Background', opts: optsOf([['theme', 'Color del tema', 'Theme colour'], ['white', 'Blanco', 'White'], ['transparent', 'Transparente', 'Transparent'], ['custom', 'Otro color…', 'Custom colour…']]) });
    add(g, { t: 'color', k: 'bgColor', es: 'Color de fondo', en: 'Background colour', when: s => s.bgMode === 'custom' });
    const noteBase = mk('p', 'ms-hint', L2('Sin mapa base, el fondo se ve detrás de los datos. «Transparente» exporta PNG, WebP o SVG con fondo transparente (JPEG usa blanco). Los mapas de CARTO pueden mostrar la marca «API key required» según las condiciones vigentes del proveedor: los grises de Esri son la opción más fiable, y los nombres de lugares se pueden añadir encima. El servidor estándar de OpenStreetMap no está disponible desde archivos abiertos con doble clic.',
      'With no base map the background shows behind the data. “Transparent” exports PNG, WebP or SVG with a transparent background (JPEG uses white). CARTO maps may show an “API key required” mark depending on the provider’s current terms: the Esri greys are the most reliable option, and place names can be added on top. The standard OpenStreetMap server is not available from files opened by double click.'));
    panes.base.appendChild(noteBase);

    /* ---- Text: content, font, size and style of every piece of text ---- */
    g = section('text', 'Título, subtítulo y fuente (se dibujan dentro del mapa)', 'Title, subtitle and source (drawn inside the map)');
    add(g, { t: 'text', k: 'title', es: 'Título', en: 'Title', wide: true, ph: ['Sin título', 'No title'] });
    add(g, { t: 'text', k: 'subtitle', es: 'Subtítulo', en: 'Subtitle', wide: true, ph: ['Sin subtítulo', 'No subtitle'] });
    add(g, { t: 'text', k: 'credit', es: 'Fuente / crédito', en: 'Source / credit', wide: true, ph: ['p. ej. Datos: GBIF, WorldClim', 'e.g. Data: GBIF, WorldClim'] });
    g = section('text', 'Tipografía', 'Typography');
    const fontOpts = () => FONT_KEYS.map(k => [k, T(FONT_NAMES[k][0], FONT_NAMES[k][1])]);
    add(g, { t: 'select', k: 'font', es: 'Tipo de letra de todo el mapa', en: 'Font of the whole map', opts: fontOpts });
    add(g, { t: 'range', k: 'textScale', es: 'Tamaño de todos los textos', en: 'Size of all the text', min: 0.6, max: 3, step: 0.05, fmt: v => '×' + (+v).toFixed(2) });
    g = section('text', 'Cada texto por separado: tamaño, negrita, cursiva, color y tipo de letra', 'Each text on its own: size, bold, italic, colour and font');
    const TXT_ROWS = [['title', 'Título', 'Title', '#17212b'], ['subtitle', 'Subtítulo', 'Subtitle', '#17212b'], ['credit', 'Fuente / crédito', 'Source / credit', '#17212b'], ['legTitle', 'Título de la leyenda', 'Legend title', '#17212b'],
      ['legLabel', 'Etiquetas de la leyenda', 'Legend labels', '#17212b'], ['scale', 'Escala gráfica', 'Scale bar', '#17212b'], ['grat', 'Etiquetas de la retícula', 'Graticule labels', '#17212b'], ['north', 'Letras de la flecha del norte', 'North arrow letters', '#17212b']];
    const ttable = mk('div', 'ms-ttable ms-wide'); g.appendChild(ttable);
    ttable.appendChild(mk('div', 'ms-trow ms-thead', `<span></span><span>${L2('Tamaño (px)', 'Size (px)')}</span><span>${L2('Neg.', 'Bold')}</span><span>${L2('Curs.', 'Ital.')}</span><span>${L2('Color', 'Colour')}</span><span>${L2('Tipo de letra', 'Font')}</span>`));
    TXT_ROWS.forEach(([key, es, en, def]) => {
      const k = TXTKEYS[key], row = mk('div', 'ms-trow'), rid = `ms${uid}-t-${key}`;
      row.innerHTML = `<span class="ms-tname">${L2(es, en)}</span>` +
        `<input type="number" min="0" max="200" step="1" id="${rid}-s" placeholder="auto" data-es-title="${esc(es)}" data-en-title="${esc(en)}">` +
        `<button type="button" class="ms-tog ms-tb" aria-pressed="false" data-es-title="Negrita" data-en-title="Bold"><b>B</b></button>` +
        `<button type="button" class="ms-tog ms-ti" aria-pressed="false" data-es-title="Cursiva" data-en-title="Italic"><i>I</i></button>` +
        `<span class="ms-ca"><input type="color" data-es-title="Color" data-en-title="Colour"><label class="ms-chk"><input type="checkbox" checked><span>auto</span></label></span>` +
        (k.font ? `<select class="ms-tfont" data-es-title="Tipo de letra" data-en-title="Font"></select>` : '<span class="ms-tfont-off">—</span>');
      const size = row.querySelector('input[type=number]'), bb = row.querySelector('.ms-tb'), bi = row.querySelector('.ms-ti'), col = row.querySelector('input[type=color]'), auto = row.querySelector('input[type=checkbox]');
      const fam = row.querySelector('select.ms-tfont');
      size.addEventListener('input', () => { const v = parseFloat(size.value); setStyle(k.size, isFinite(v) && v > 0 ? v : 0); });
      bb.addEventListener('click', () => setStyle(k.bold, !st[k.bold])); bi.addEventListener('click', () => setStyle(k.italic, !st[k.italic]));
      col.addEventListener('input', () => { auto.checked = false; setStyle(k.color, col.value); });
      auto.addEventListener('change', () => setStyle(k.color, auto.checked ? '' : col.value));
      if (fam) fam.addEventListener('change', () => setStyle(k.font, fam.value));
      controls.push({ spec: {}, wrap: row,
        fill: fam ? () => {                                        // rebuilt on 'langchange': the option names are translated
          const cur = st[k.font] || ''; fam.innerHTML = '';
          [['', T('Igual que todo el mapa', 'Same as the whole map')], ...fontOpts()].forEach(([v, name]) => { const o = document.createElement('option'); o.value = v; o.textContent = name; fam.appendChild(o); });
          fam.value = cur;
        } : null,
        update() {
          if (document.activeElement !== size) size.value = +st[k.size] > 0 ? st[k.size] : '';
          bb.setAttribute('aria-pressed', st[k.bold] ? 'true' : 'false'); bi.setAttribute('aria-pressed', st[k.italic] ? 'true' : 'false');
          auto.checked = !st[k.color]; col.value = asHex(st[k.color] || def);
          if (fam) fam.value = st[k.font] || '';
        } });
      ttable.appendChild(row);
    });
    g.appendChild(mk('p', 'ms-hint ms-wide', L2('Todos los textos del mapa —incluidos el título de la leyenda y las etiquetas de la leyenda— pueden llevar su propio tamaño, negrita, cursiva, color y tipo de letra. Lo que elijas aquí se ve igual en la leyenda de la pantalla y en la imagen exportada (PNG y SVG).',
      'Every text of the map — including the legend title and the legend labels — can be given its own size, bold, italic, colour and font. What you choose here looks the same in the legend on screen and in the exported image (PNG and SVG).')));
    g = section('text', 'Posición y caja', 'Position and box');
    add(g, { t: 'select', k: 'titlePos', es: 'Posición del título', en: 'Title position', opts: optsOf(POS6) });
    add(g, { t: 'select', k: 'creditPos', es: 'Posición de la fuente', en: 'Source position', opts: optsOf(POS6) });
    add(g, { t: 'check', k: 'textAuto', es: 'Color de texto automático', en: 'Automatic text colour' });
    add(g, { t: 'color', k: 'textColor', es: 'Color del texto', en: 'Text colour', when: s => !s.textAuto });
    add(g, { t: 'select', k: 'textBox', es: 'Caja detrás del título', en: 'Box behind the title', opts: optsOf([['none', 'Sin caja', 'No box'], ['light', 'Caja clara', 'Light box'], ['dark', 'Caja oscura', 'Dark box']]) });
    add(g, { t: 'range', k: 'boxAlpha', es: 'Opacidad de la caja', en: 'Box opacity', min: 0.2, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%', when: s => s.textBox !== 'none' });

    /* ---- Elements ---- */
    g = section('elements', 'Flecha del norte', 'North arrow');
    const npick = mk('div', 'ms-npick ms-wide'); npick.setAttribute('role', 'radiogroup'); npick.setAttribute('aria-label', T('Formato de la flecha del norte', 'North arrow format')); g.appendChild(npick);
    function buildNorthPicker() {
      npick.innerHTML = '';
      ['off', ...NORTH_STYLES].forEach(sty => {
        const b = mk('button', 'ms-nbtn'); b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.n = sty;
        const nm = sty === 'off' ? [T('Sin flecha', 'None')] : [T(NORTH_NAMES[sty][0], NORTH_NAMES[sty][1])]; b.title = nm[0];
        if (sty === 'off') b.innerHTML = `<span class="ms-noff">×</span><span class="ms-nname">${esc(nm[0])}</span>`;
        else { const cv = document.createElement('canvas'); b.appendChild(cv); b.appendChild(mk('span', 'ms-nname', esc(nm[0]))); drawNorthThumb(cv, sty, cssVar('--text', '#17212b'), cssVar('--card-bg', '#ffffff')); }
        b.addEventListener('click', () => setStyle('north', sty));
        npick.appendChild(b);
      });
    }
    controls.push({ spec: {}, wrap: npick, fill: buildNorthPicker, update() { npick.querySelectorAll('.ms-nbtn').forEach(b => b.setAttribute('aria-checked', b.dataset.n === st.north ? 'true' : 'false')); } });
    document.addEventListener('themechange', () => setTimeout(buildNorthPicker, 30));
    const northOn = s => s.north !== 'off';
    add(g, { t: 'range', k: 'northSize', es: 'Tamaño', en: 'Size', min: 24, max: 200, step: 2, fmt: v => v + ' px', when: northOn });
    add(g, { t: 'select', k: 'northPos', es: 'Esquina', en: 'Corner', opts: optsOf(POS4), when: northOn });
    add(g, { t: 'range', k: 'northMargin', es: 'Margen respecto al borde', en: 'Margin from the edge', min: 0, max: 80, step: 1, fmt: v => v + ' px', when: northOn });
    add(g, { t: 'range', k: 'northRot', es: 'Rotación (grados)', en: 'Rotation (degrees)', min: -180, max: 180, step: 5, fmt: v => v + '°', when: northOn });
    add(g, { t: 'check', k: 'northLetters', es: 'Mostrar las letras (N, E, S, O)', en: 'Show the letters (N, E, S, W)', when: northOn });
    add(g, { t: 'colorauto', k: 'northInk', def: '#17212b', es: 'Color principal', en: 'Main colour', when: northOn });
    add(g, { t: 'colorauto', k: 'northPaper', def: '#ffffff', es: 'Color secundario', en: 'Second colour', when: northOn });
    g = section('elements', 'Escala gráfica', 'Scale bar');
    const scaleOn = s => s.scaleOn, barOn = s => s.scaleOn && s.scaleStyle !== 'text' && s.scaleStyle !== 'ratio', lenOn = s => s.scaleOn && s.scaleStyle !== 'ratio';
    add(g, { t: 'check', k: 'scaleOn', es: 'Mostrar la escala', en: 'Show the scale bar' });
    add(g, { t: 'select', k: 'scaleStyle', es: 'Formato', en: 'Format', wide: true, when: scaleOn, opts: optsOf([['alt', 'Segmentos alternos blanco y negro', 'Alternating black and white segments'], ['line', 'Línea con marcas en los extremos', 'Single line with end ticks'],
      ['solid', 'Barra sólida gruesa', 'Thick solid bar'], ['stepped', 'Escalonada (dos filas)', 'Stepped / ladder (two rows)'], ['ruler', 'Regla con marcas menores', 'Ruler with minor ticks'], ['text', 'Solo texto («500 km»)', 'Text only (“500 km”)'],
      ['dual', 'Doble unidad (km arriba, mi abajo)', 'Dual units (km above, mi below)'], ['ratio', 'Razón numérica 1:N (aproximada)', 'Ratio text 1:N (approximate)']]) });
    add(g, { t: 'select', k: 'scaleUnit', es: 'Unidad', en: 'Unit', when: lenOn, opts: optsOf([['km', 'Kilómetros (km)', 'Kilometres (km)'], ['mi', 'Millas (mi)', 'Miles (mi)'], ['nmi', 'Millas náuticas (nmi)', 'Nautical miles (nmi)'], ['m', 'Metros (m)', 'Metres (m)']]) });
    add(g, { t: 'range', k: 'scaleSegs', es: 'Número de segmentos', en: 'Number of segments', min: 2, max: 6, step: 1, when: barOn });
    add(g, { t: 'select', k: 'scaleLenMode', es: 'Longitud', en: 'Length', when: lenOn, opts: optsOf([['auto', 'Automática (valor redondo)', 'Automatic (round value)'], ['fixed', 'Fija', 'Fixed']]) });
    add(g, { t: 'num', k: 'scaleFixed', es: 'Longitud fija (en la unidad elegida)', en: 'Fixed length (in the chosen unit)', min: 0.001, max: 100000, step: 1, when: s => lenOn(s) && s.scaleLenMode === 'fixed' });
    add(g, { t: 'select', k: 'scaleLabelPos', es: 'Etiquetas', en: 'Labels', when: s => barOn(s) && s.scaleStyle !== 'dual', opts: optsOf([['above', 'Arriba de la barra', 'Above the bar'], ['below', 'Debajo de la barra', 'Below the bar']]) });
    add(g, { t: 'range', k: 'scaleThick', es: 'Grosor de la barra', en: 'Bar thickness', min: 2, max: 20, step: 1, fmt: v => v + ' px', when: barOn });
    add(g, { t: 'colorauto', k: 'scaleInk', def: '#17212b', es: 'Color de la tinta', en: 'Ink colour', when: scaleOn });
    add(g, { t: 'colorauto', k: 'scalePaper', def: '#ffffff', es: 'Color del papel', en: 'Paper colour', when: barOn });
    add(g, { t: 'check', k: 'scaleBox', es: 'Caja de fondo', en: 'Background box', when: scaleOn });
    add(g, { t: 'select', k: 'scalePos', es: 'Esquina', en: 'Corner', opts: optsOf(POS4), when: scaleOn });
    add(g, { t: 'range', k: 'scaleMargin', es: 'Margen respecto al borde', en: 'Margin from the edge', min: 0, max: 80, step: 1, fmt: v => v + ' px', when: scaleOn });
    g = section('elements', 'Retícula de coordenadas', 'Coordinate graticule');
    add(g, { t: 'check', k: 'grat', es: 'Mostrar la retícula', en: 'Show the graticule' });
    add(g, { t: 'color', k: 'gratColor', es: 'Color de las líneas', en: 'Line colour', when: s => s.grat });
    add(g, { t: 'range', k: 'gratAlpha', es: 'Opacidad de las líneas', en: 'Line opacity', min: 0.1, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%', when: s => s.grat });
    g = section('elements', 'Leyenda', 'Legend');
    add(g, { t: 'check', k: 'legendOn', es: 'Leyenda dentro del mapa', en: 'Legend inside the map' });
    add(g, { t: 'select', k: 'legendPos', es: 'Esquina', en: 'Corner', opts: optsOf(POS4), when: s => s.legendOn });
    add(g, { t: 'check', k: 'legTitleOn', es: 'Mostrar el título de la leyenda', en: 'Show the legend title' });
    add(g, { t: 'text', k: 'legendTitle', es: 'Título de la leyenda', en: 'Legend title', ph: ['Automático', 'Automatic'], wide: true, when: s => s.legTitleOn !== false });
    add(g, { t: 'select', k: 'legendBox', es: 'Estilo de la caja', en: 'Box style', opts: optsOf([['auto', 'Automática (según el mapa)', 'Automatic (follows the map)'], ['light', 'Clara', 'Light'], ['dark', 'Oscura', 'Dark'], ['outline', 'Con borde', 'Outlined'], ['none', 'Sin caja', 'No box']]), when: s => s.legendOn });
    add(g, { t: 'select', k: 'legendCols', num: true, es: 'Columnas de las categorías', en: 'Columns of the categories', opts: optsOf([[0, 'Automáticas', 'Automatic'], [1, '1', '1'], [2, '2', '2'], [3, '3', '3']]) });
    add(g, { t: 'range', k: 'legendGap', es: 'Separación entre entradas', en: 'Spacing between entries', min: 0.6, max: 3, step: 0.05, fmt: v => '×' + (+v).toFixed(2) });
    add(g, { t: 'range', k: 'legendSwatch', es: 'Tamaño de las muestras de color', en: 'Size of the colour patches', min: 0.4, max: 3, step: 0.05, fmt: v => '×' + (+v).toFixed(2) });
    add(g, { t: 'range', k: 'legendBarW', es: 'Largo de la barra de color', en: 'Length of the colour bar', min: 0, max: 600, step: 10, fmt: v => v > 0 ? v + ' px' : T('automático', 'automatic') });
    add(g, { t: 'range', k: 'legendBarH', es: 'Grosor de la barra de color', en: 'Thickness of the colour bar', min: 0, max: 60, step: 1, fmt: v => v > 0 ? v + ' px' : T('automático', 'automatic') });
    add(g, { t: 'range', k: 'legendTicks', es: 'Etiquetas de la barra de color', en: 'Tick labels of the colour bar', min: 0, max: 9, step: 1, fmt: v => v >= 2 ? String(v) : T('automáticas', 'automatic') });
    g.appendChild(mk('p', 'ms-hint ms-wide', L2('El tamaño, la negrita, la cursiva, el color y el tipo de letra del título y de las etiquetas de la leyenda se eligen en la pestaña «Textos y fuentes». Cuando la leyenda no va dentro del mapa, se muestra debajo con esos mismos textos.',
      'The size, bold, italic, colour and font of the legend title and of the legend labels are chosen in the “Text and fonts” tab. When the legend is not inside the map it is shown underneath with those very same texts.')));
    g = section('elements', 'Marco', 'Frame');
    add(g, { t: 'check', k: 'frameOn', es: 'Marco alrededor del mapa', en: 'Frame around the map' });
    add(g, { t: 'color', k: 'frameColor', es: 'Color del borde', en: 'Border colour', when: s => s.frameOn });
    add(g, { t: 'range', k: 'frameWidth', es: 'Grosor del borde', en: 'Border width', min: 0, max: 8, step: 0.5, fmt: v => v + ' px', when: s => s.frameOn });
    add(g, { t: 'range', k: 'frameMargin', es: 'Margen interior', en: 'Inner margin', min: 0, max: 40, step: 1, fmt: v => v + ' px', when: s => s.frameOn });
    add(g, { t: 'color', k: 'frameFill', es: 'Color del margen', en: 'Margin colour', when: s => s.frameOn && s.frameMargin > 0 });
    g = section('elements', 'Lectura', 'Read-out');
    add(g, { t: 'check', k: 'cursor', es: 'Mostrar coordenadas del cursor (no se exportan)', en: 'Show cursor coordinates (not exported)' });

    /* ---- Points ---- */
    g = section('layer', 'Modo de visualización', 'Display mode', () => kind === 'points' || kind === 'cluster');
    add(g, { t: 'select', k: 'mode', es: 'Mostrar como', en: 'Show as', wide: true, opts: () => optsOf(kind === 'points' ? [['points', 'Puntos', 'Points'], ['heat', 'Mapa de calor', 'Heat map'], ['grid', 'Densidad en cuadrícula', 'Grid density'], ['hull', 'Puntos + casco convexo', 'Points + convex hull']] : [['points', 'Puntos', 'Points'], ['hull', 'Puntos + casco convexo por grupo', 'Points + convex hull per cluster']])() });
    add(g, { t: 'select', k: 'gridSize', num: true, es: 'Tamaño de celda', en: 'Cell size', opts: optsOf([[0.1, '0.1°', '0.1°'], [0.25, '0.25°', '0.25°'], [0.5, '0.5°', '0.5°'], [1, '1°', '1°'], [2, '2°', '2°'], [5, '5°', '5°'], [10, '10°', '10°']]), when: s => s.mode === 'grid' });
    add(g, { t: 'range', k: 'heatRadius', es: 'Radio del calor', en: 'Heat radius', min: 6, max: 80, step: 1, fmt: v => v + ' px', when: s => s.mode === 'heat' });
    add(g, { t: 'range', k: 'heatIntensity', es: 'Intensidad', en: 'Intensity', min: 0.05, max: 1, step: 0.01, fmt: v => Math.round(v * 100) + '%', when: s => s.mode === 'heat' });
    add(g, { t: 'range', k: 'hullFill', es: 'Relleno del casco', en: 'Hull fill', min: 0, max: 0.6, step: 0.02, fmt: v => Math.round(v * 100) + '%', when: s => s.mode === 'hull' });
    g = section('layer', 'Estilo de los marcadores', 'Marker style');
    const ptsOnly = s => !(kind === 'points' && (s.mode === 'heat' || s.mode === 'grid'));
    add(g, { t: 'select', k: 'shape', es: 'Forma', en: 'Shape', opts: optsOf([['circle', 'Círculo', 'Circle'], ['square', 'Cuadrado', 'Square'], ['triangle', 'Triángulo', 'Triangle'], ['diamond', 'Rombo', 'Diamond'], ['cross', 'Cruz', 'Cross'], ['star', 'Estrella', 'Star']]), when: ptsOnly });
    add(g, { t: 'range', k: 'radius', es: 'Tamaño', en: 'Size', min: 1, max: 16, step: 0.5, fmt: v => v + ' px', when: ptsOnly });
    add(g, { t: 'range', k: 'fillAlpha', es: 'Opacidad del relleno', en: 'Fill opacity', min: 0.1, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%' });
    add(g, { t: 'range', k: 'outlineW', es: 'Grosor del contorno', en: 'Outline width', min: 0, max: 4, step: 0.1, fmt: v => v + ' px', when: ptsOnly });
    add(g, { t: 'color', k: 'outlineColor', es: 'Color del contorno', en: 'Outline colour', when: s => ptsOnly(s) && s.outlineW > 0 });
    add(g, { t: 'range', k: 'halo', es: 'Halo', en: 'Halo', min: 0, max: 8, step: 0.5, fmt: v => v + ' px', when: ptsOnly });

    /* ---- Colours ---- */
    const showRamp = () => dk() === 'continuous' || (kind === 'points' && (st.mode === 'heat' || st.mode === 'grid')) || kind === 'raster';
    const showClasses = () => dk() === 'continuous' || (kind === 'points' && st.mode === 'grid');
    const showCats = () => dk() === 'categorical' && kind !== 'raster' && (kind !== 'points' || st.mode === 'points' || st.mode === 'hull');
    g = section('colors', 'Rampa de colores', 'Colour ramp', showRamp);
    const rampBox = mk('div', 'ms-ramps ms-wide'); rampBox.setAttribute('role', 'radiogroup'); rampBox.setAttribute('aria-label', T('Rampa de colores', 'Colour ramp')); g.appendChild(rampBox);
    function buildRampButtons() {
      rampBox.innerHTML = '';
      Object.keys(RAMPS).forEach(key => {
        const b = mk('button', 'ms-ramp'); b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.ramp = key; b.title = rampName(key);
        b.innerHTML = `<span class="ms-rampbar" style="background:${rampCSS(key, st.rampRev, st.whiteMin)}"></span><span class="ms-rampname">${esc(rampName(key))}</span>`;
        b.setAttribute('aria-checked', st.ramp === key ? 'true' : 'false');
        b.addEventListener('click', () => setStyle('ramp', key));
        rampBox.appendChild(b);
      });
    }
    const syncRamps = () => rampBox.querySelectorAll('.ms-ramp').forEach(b => { b.setAttribute('aria-checked', b.dataset.ramp === st.ramp ? 'true' : 'false'); b.querySelector('.ms-rampbar').style.background = rampCSS(b.dataset.ramp, st.rampRev, st.whiteMin); });
    controls.push({ spec: {}, wrap: rampBox, update: syncRamps });
    add(g, { t: 'check', k: 'rampRev', es: 'Invertir la rampa', en: 'Reverse the ramp' });
    add(g, { t: 'check', k: 'whiteMin', es: 'Valor mínimo en blanco', en: 'Lowest class in white' });
    add(g, { t: 'select', k: 'classMethod', es: 'Método de clases', en: 'Class method', opts: optsOf([['quantile', 'Cuantiles', 'Quantile'], ['equal', 'Intervalos iguales', 'Equal interval'], ['jenks', 'Cortes naturales (Jenks)', 'Natural breaks (Jenks)']]), when: () => showClasses() && st.legendMode === 'classed' });
    add(g, { t: 'range', k: 'nClasses', es: 'Número de clases', en: 'Number of classes', min: 3, max: 12, step: 1, when: () => showClasses() && st.legendMode === 'classed' });
    add(g, { t: 'select', k: 'legendMode', es: 'Leyenda', en: 'Legend', opts: optsOf([['classed', 'Por clases', 'Classed'], ['continuous', 'Barra continua', 'Continuous bar']]), when: showClasses });
    g = section('colors', 'Colores por categoría', 'Colours by category', showCats);
    add(g, { t: 'select', k: 'catPalette', es: 'Paleta', en: 'Palette', wide: true,
      opts: () => [...(data.defaults || kind === 'thematic' || kind === 'cluster' ? [['auto', T(PALETTE_NAMES.auto.es, PALETTE_NAMES.auto.en)]] : []),
        ...['okabe', 'tableau', 'set2', 'dark2', 'paired', 'classic'].map(k => [k, typeof PALETTE_NAMES[k] === 'string' ? PALETTE_NAMES[k] : T(PALETTE_NAMES[k].es, PALETTE_NAMES[k].en)])] });
    add(g, { t: 'btn', es: 'Restablecer colores', en: 'Reset colours', act: () => { st.catColors = {}; onStyle('catColors'); } });
    const catBox = mk('div', 'ms-cats ms-wide'); g.appendChild(catBox);
    function syncCats(force) {
      const sig = cats.join('') + '|' + st.catPalette + '|' + I18N.lang + '|' + Object.keys(st.catColors).length;
      if (!force && sig === catSig) { catBox.querySelectorAll('input').forEach(i => { if (document.activeElement !== i && catCols[i.dataset.cat]) i.value = asHex(catCols[i.dataset.cat]); }); return; }
      catSig = sig; catBox.innerHTML = '';
      cats.forEach((c, i) => {
        const l = mk('label', 'ms-cat'), inp = document.createElement('input'); inp.type = 'color'; inp.value = asHex(catCols[c]); inp.dataset.cat = c;
        inp.addEventListener('input', () => { st.catColors = Object.assign({}, st.catColors, { [c]: inp.value }); catSig = cats.join('') + '|' + st.catPalette + '|' + I18N.lang + '|' + Object.keys(st.catColors).length; prepare(); redrawAll(); persist(); if (hooks.onChange) hooks.onChange('catColors', st, studio); });
        const s = mk('span'); s.textContent = data.catLabel ? data.catLabel(c) : String(c);
        l.append(inp, s); catBox.appendChild(l);
      });
      if (cats.length > 40) catBox.classList.add('ms-many'); else catBox.classList.remove('ms-many');
    }
    controls.push({ spec: {}, wrap: catBox, update() {} });
    const noteCol = mk('p', 'ms-hint', L2('Las rampas y los métodos de clases se aplican a las variables numéricas, al mapa de calor y a la densidad en cuadrícula. Los colores de categoría admiten un selector por cada valor.',
      'Ramps and class methods apply to numeric variables, the heat map and the grid density. Category colours have one picker per value.'));
    panes.colors.appendChild(noteCol);

    /* ---- Looks (presets, save / load) ---- */
    g = section('looks', 'Estilos con un clic', 'One-click looks');
    const presetBox = mk('div', 'ms-presets ms-wide'); g.appendChild(presetBox);
    function buildPresets() {
      presetBox.innerHTML = '';
      PRESETS.forEach(p => {
        const b = mk('button', 'ms-preset'); b.type = 'button';
        b.innerHTML = `<span class="ms-pname">${esc(T(p.es, p.en))}</span><span class="ms-pdes">${esc(T(p.des, p.den))}</span>`;
        b.addEventListener('click', () => { applyStyle(p.s); say('ok', T('Estilo aplicado: ', 'Look applied: ') + esc(T(p.es, p.en))); });
        presetBox.appendChild(b);
      });
    }
    controls.push({ spec: {}, wrap: presetBox, update() {}, fill: buildPresets });
    g = section('looks', 'Guardar y cargar', 'Save and load');
    add(g, { t: 'btn', es: 'Guardar estilo (JSON)', en: 'Save style (JSON)', act: () => {
      const o = {}; for (const k of Object.keys(st)) o[k] = st[k];
      downloadBlob(JSON.stringify({ format: 'map-style', version: 1, kind, style: o }, null, 1), 'map_style_' + KIND_TAG[kind] + '.json', 'application/json'); say('ok', T('Estilo guardado.', 'Style saved.')); } });
    const fileIn = document.createElement('input'); fileIn.type = 'file'; fileIn.accept = '.json,application/json'; fileIn.hidden = true; panes.looks.appendChild(fileIn);
    add(g, { t: 'btn', es: 'Cargar estilo…', en: 'Load style…', act: () => fileIn.click() });
    fileIn.addEventListener('change', () => {
      const f = fileIn.files[0]; fileIn.value = ''; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => { try { const j = JSON.parse(rd.result); const s = j && j.style ? j.style : j; applyStyle(s); say('ok', T('Estilo cargado.', 'Style loaded.')); } catch (e) { say('err', T('El archivo no es un estilo válido.', 'The file is not a valid style.')); } };
      rd.readAsText(f);
    });
    add(g, { t: 'btn', es: 'Restablecer todo', en: 'Reset everything', act: () => { st.catColors = {}; st.title = ''; st.subtitle = ''; st.credit = ''; st.legendTitle = ''; applyStyle(defs); say('ok', T('Estilo restablecido.', 'Style reset.')); } });
    panes.looks.appendChild(mk('p', 'ms-hint', L2('El último estilo de cada tipo de mapa se recuerda en este navegador (sin títulos ni textos). El archivo JSON guarda todo.',
      'The last style of each kind of map is remembered in this browser (without titles or texts). The JSON file keeps everything.')));

    /* ---- Export ---- */
    const hasSel = () => clipRegions('selected').length > 0, hasMx = () => clipRegions('mexico').length > 0, hasLayer = () => clipRegions('layer').length > 0;
    const fitLike = () => ex.frame !== 'asis';
    g = section('export', 'Encuadre', 'Framing');
    add(g, { t: 'select', k: 'frame', store: ex, es: 'Encuadre', en: 'Framing', wide: true, opts: () => [
      ['asis', T('Como se ve en pantalla', 'As it looks on screen')],
      ['fit', T('Ajustar a los datos', 'Fit to the data')],
      ['regions', T('Ajustar a los estados o regiones elegidos', 'Fit to the chosen states or regions') + (hasSel() ? '' : ' — ' + T('sin selección', 'nothing selected')), !hasSel()],
      ['mexico', T('México completo', 'The whole of Mexico'), !hasMx()],
      ['manual', T('Extensión manual', 'Manual extent')],
    ] });
    g.appendChild(mk('p', 'ms-hint ms-wide',
      L2('«Como se ve en pantalla» exporta exactamente la extensión que ves. Los encuadres de ajuste vuelven a encuadrar el mapa sobre la extensión elegida y sobre la forma del tamaño de salida, así que la imagen puede no coincidir con la pantalla: usa la vista previa, o el botón de abajo para llevar la pantalla a ese mismo encuadre.',
        '“As it looks on screen” exports exactly the extent you see. The fitting framings re-frame the map onto the chosen extent and onto the shape of the output size, so the picture may differ from the screen: use the preview, or the button below to take the screen to that very framing.')));
    add(g, { t: 'range', k: 'pad', store: ex, es: 'Margen alrededor', en: 'Padding around it', min: 0, max: 25, step: 0.5, fmt: v => v + '%', when: fitLike });
    add(g, { t: 'check', k: 'reserve', store: ex, es: 'Reservar espacio para la leyenda', en: 'Reserve room for the legend', when: () => fitLike() && st.legendOn });
    add(g, { t: 'check', k: 'lockAspect', store: ex, wide: true, es: 'Mantener la proporción del tamaño de salida', en: 'Keep the aspect ratio of the output size', when: fitLike });
    const lockHint = mk('p', 'ms-hint ms-wide', L2('Activado, la figura conserva la forma del tamaño elegido y la extensión crece por un lado para llenarla; desactivado, la figura se recorta a la forma exacta de la extensión.',
      'On, the figure keeps the shape of the size you chose and the extent grows on one side to fill it; off, the figure is trimmed to the exact shape of the extent.'));
    g.appendChild(lockHint);
    controls.push({ spec: { when: fitLike }, wrap: lockHint, update() {} });
    add(g, { t: 'range', k: 'zoomAdj', store: ex, wide: true, es: 'Ajuste fino del acercamiento', en: 'Zoom fine-tune', min: -2, max: 2, step: 0.1,
      fmt: v => (v > 0 ? '+' : '') + (+v).toFixed(1) + ' ' + T('niveles', 'levels') });
    add(g, { t: 'btn', es: '− Alejar un poco', en: '− Zoom out a little', act: () => { ex.zoomAdj = clamp(Math.round((ex.zoomAdj - 0.25) * 100) / 100, -2, 2); onExportChange('zoomAdj'); syncUI(); } });
    add(g, { t: 'btn', es: '+ Acercar un poco', en: '+ Zoom in a little', act: () => { ex.zoomAdj = clamp(Math.round((ex.zoomAdj + 0.25) * 100) / 100, -2, 2); onExportChange('zoomAdj'); syncUI(); } });
    const manualOn = () => ex.frame === 'manual';
    add(g, { t: 'num', k: 'mN', store: ex, es: 'Norte (latitud)', en: 'North (latitude)', min: -85, max: 85, step: 0.01, when: manualOn });
    add(g, { t: 'num', k: 'mS', store: ex, es: 'Sur (latitud)', en: 'South (latitude)', min: -85, max: 85, step: 0.01, when: manualOn });
    add(g, { t: 'num', k: 'mW', store: ex, es: 'Oeste (longitud)', en: 'West (longitude)', min: -180, max: 180, step: 0.01, when: manualOn });
    add(g, { t: 'num', k: 'mE', store: ex, es: 'Este (longitud)', en: 'East (longitude)', min: -180, max: 180, step: 0.01, when: manualOn });
    add(g, { t: 'btn', es: 'Tomar la extensión de la vista actual', en: 'Take the extent of the current view', when: manualOn, act: () => {
      const b = map.getBounds();
      ex.mN = Math.round(b.getNorth() * 1e4) / 1e4; ex.mS = Math.round(b.getSouth() * 1e4) / 1e4;
      ex.mW = Math.round(b.getWest() * 1e4) / 1e4; ex.mE = Math.round(b.getEast() * 1e4) / 1e4;
      onExportChange('mN'); syncUI(); say('ok', T('Extensión tomada de la vista actual.', 'Extent taken from the current view.'));
    } });
    add(g, { t: 'btn', wide: true, es: 'Llevar el mapa de la pantalla a este encuadre', en: 'Take the map on screen to this framing', act: () => applyFrameToScreen() });

    /* ---- clip to a region ---- */
    g = section('export', 'Recorte al área de estudio', 'Clip to the study area');
    const clipOn = () => !!ex.clipOn;
    add(g, { t: 'check', k: 'clipOn', store: ex, wide: true, es: 'Recortar al país o a las regiones elegidas', en: 'Clip to the country or the chosen regions' });
    add(g, { t: 'select', k: 'clipWhat', store: ex, wide: true, when: clipOn, es: 'Recortar a', en: 'Clip to', opts: () => [
      ['selected', T('Los estados o regiones elegidos en el paso 2', 'The states or regions chosen in step 2') + (hasSel() ? '' : ' — ' + T('sin selección', 'nothing selected')), !hasSel()],
      ['mexico', T('Todo México', 'The whole of Mexico'), !hasMx()],
      ['layer', T('Toda la capa de regiones cargada', 'The whole region layer that is loaded'), !hasLayer()],
    ] });
    add(g, { t: 'select', k: 'clipOutside', store: ex, when: clipOn, es: 'Fuera del recorte', en: 'Outside the clip',
      opts: optsOf([['transparent', 'Transparente (PNG, WebP y TIFF)', 'Transparent (PNG, WebP and TIFF)'], ['white', 'Blanco', 'White'], ['page', 'Color de fondo de la figura', 'Background colour of the figure'], ['custom', 'Otro color…', 'Custom colour…']]) });
    add(g, { t: 'color', k: 'clipColor', store: ex, es: 'Color de fuera', en: 'Outside colour', when: () => clipOn() && ex.clipOutside === 'custom' });
    add(g, { t: 'check', k: 'clipBorder', store: ex, es: 'Dibujar el límite de la región', en: 'Draw the region boundary', when: clipOn });
    add(g, { t: 'select', k: 'clipBorderWhat', store: ex, wide: true, es: 'Qué límites dibujar', en: 'Which boundaries to draw', when: () => clipOn() && ex.clipBorder,
      opts: optsOf([['outer', 'Solo el contorno exterior', 'Outer outline only'], ['all', 'Todos los límites de la capa', 'All the boundaries of the layer']]) });
    add(g, { t: 'color', k: 'clipBorderColor', store: ex, es: 'Color del límite', en: 'Boundary colour', when: () => clipOn() && ex.clipBorder });
    add(g, { t: 'range', k: 'clipBorderW', store: ex, min: 0.2, max: 6, step: 0.2, fmt: v => v + ' px', es: 'Grosor del límite', en: 'Boundary width', when: () => clipOn() && ex.clipBorder });
    add(g, { t: 'check', k: 'clipKeepPoints', store: ex, es: 'Conservar los puntos que caen fuera', en: 'Keep the points that fall outside', when: clipOn });
    add(g, { t: 'check', k: 'clipScreen', store: ex, es: 'Ver el recorte también en el mapa de la pantalla', en: 'Show the clip on the map on screen too', when: clipOn });
    g.appendChild(mk('p', 'ms-hint ms-wide', L2('Con el recorte activo, todo lo que queda fuera del polígono desaparece de la imagen y de la vista previa: teselas del mapa base, superficies de idoneidad o de índices, puntos, mapas de calor y cuadrículas. La leyenda, el título, la escala y la flecha se siguen dibujando encima de toda la figura.',
      'With the clip on, everything outside the polygon is gone from the picture and from the preview: base map tiles, suitability or index surfaces, points, heat maps and grids. The legend, the title, the scale bar and the arrow are still drawn over the whole figure.')));

    g = section('export', 'Formato y tamaño', 'Format and size');
    const spec = () => sizeSpec(ex), isMm = () => !!spec().mm, isFactor = () => !spec().mm && spec().custom !== 'px';
    add(g, { t: 'select', k: 'fmt', store: ex, wide: true, es: 'Formato', en: 'Format', opts: optsOf([['png', 'PNG', 'PNG'], ['jpeg', 'JPEG', 'JPEG'], ['webp', 'WebP', 'WebP'],
      ['tiff', 'TIFF (imagen)', 'TIFF (image)'], ['geotiff', 'GeoTIFF (georreferenciado)', 'GeoTIFF (georeferenced)'], ['svg', 'SVG (datos y textos, sin mapa base)', 'SVG (data and text, no base map)']]) });
    const fmtHint = mk('p', 'ms-hint ms-wide'); g.appendChild(fmtHint);
    add(g, { t: 'check', k: 'geoDecor', store: ex, wide: true, es: 'Incluir también título, leyenda, escala y flecha en el GeoTIFF', en: 'Include the title, legend, scale bar and arrow in the GeoTIFF too', when: () => ex.fmt === 'geotiff' });
    add(g, { t: 'range', k: 'quality', store: ex, es: 'Calidad', en: 'Quality', min: 0.5, max: 1, step: 0.01, fmt: v => Math.round(v * 100) + '%', when: () => ex.fmt === 'jpeg' || ex.fmt === 'webp' });
    add(g, { t: 'select', k: 'size', store: ex, after: v => { if (sizeSpec({ ...ex, size: v }).mm && ex.boost < 1) ex.boost = 1; }, es: 'Tamaño', en: 'Size', wide: true,
      opts: () => Object.keys(SIZES).map(k => [k, T(SIZES[k].es, SIZES[k].en) + (SIZES[k].mm ? ' · ' + SIZES[k].mm[0] + '×' + SIZES[k].mm[1] + ' mm' : '')]) });
    add(g, { t: 'num', k: 'cw', store: ex, es: 'Ancho', en: 'Width', min: 1, max: 100000, step: 1, when: () => ex.size === 'custom' });
    add(g, { t: 'num', k: 'ch', store: ex, es: 'Alto', en: 'Height', min: 1, max: 100000, step: 1, when: () => ex.size === 'custom' });
    add(g, { t: 'select', k: 'cunit', store: ex, es: 'Unidad del tamaño', en: 'Size unit', when: () => ex.size === 'custom', opts: optsOf([['px', 'Píxeles', 'Pixels'], ['mm', 'Milímetros (con dpi)', 'Millimetres (with dpi)']]) });
    add(g, { t: 'select', k: 'factor', store: ex, num: true, es: 'Resolución', en: 'Resolution', opts: optsOf([[1, '1×', '1×'], [1.5, '1.5×', '1.5×'], [2, '2×', '2×'], [3, '3×', '3×'], [4, '4×', '4×']]), when: () => isFactor() && ex.fmt !== 'svg' });
    add(g, { t: 'select', k: 'dpi', store: ex, num: true, es: 'Resolución', en: 'Resolution', opts: optsOf([[150, '150 dpi', '150 dpi'], [300, '300 dpi', '300 dpi'], [600, '600 dpi', '600 dpi']]), when: () => isMm() && ex.fmt !== 'svg' });
    add(g, { t: 'select', k: 'boost', store: ex, num: true, es: 'Detalle del mapa base', en: 'Base map detail', wide: true, opts: optsOf([[0, 'Estándar', 'Standard'], [1, 'Alto (teselas de 2× de zoom)', 'High (2× zoom tiles)'], [2, 'Muy alto (4×, más lento)', 'Very high (4×, slower)']]), when: () => ex.fmt !== 'svg' });
    const info = mk('p', 'ms-info ms-wide'); g.appendChild(info);
    const FMT_HINTS = {
      png: ['Mapa de bits sin pérdida para documentos y presentaciones; admite fondo transparente.', 'Lossless bitmap for documents and presentations; carries a transparent background.'],
      jpeg: ['Mapa de bits comprimido para documentos; sin transparencia.', 'Compressed bitmap for documents; no transparency.'],
      webp: ['Mapa de bits comprimido y ligero para la web; admite fondo transparente.', 'Light compressed bitmap for the web; carries a transparent background.'],
      tiff: ['Mapa de bits sin pérdida con la resolución física escrita dentro, para programas de edición de imágenes y de mapas.', 'Lossless bitmap that carries its physical resolution, for image editing and mapping software.'],
      geotiff: ['La misma imagen con su georreferencia (Web Mercator, EPSG:3857) para que caiga en su sitio en los programas de cartografía.', 'The same picture with its georeferencing (Web Mercator, EPSG:3857) so that it lands in the right place in mapping software.'],
      svg: ['Vector con los datos y los textos editables, para programas de ilustración; sin las teselas del mapa base.', 'Vector with the data and the texts still editable, for illustration software; without the base map tiles.'],
    };
    /* size of the picture in pixels, millimetres and inches, the extent it covers and its approximate scale */
    function planSummary(p, bounds) {
      const mmW = p.mm ? p.mm[0] : p.outW / p.dpi * 25.4, mmH = p.mm ? p.mm[1] : p.outH / p.dpi * 25.4;
      const lines = [];
      lines.push(ex.fmt === 'svg' ? T('Vectorial: ', 'Vector: ') + p.W + ' × ' + p.H + ' px' : p.outW + ' × ' + p.outH + ' px · ' + p.dpi + ' dpi');
      lines.push(fmt(mmW, 1) + ' × ' + fmt(mmH, 1) + ' mm · ' + fmt(mmW / 25.4, 2) + ' × ' + fmt(mmH / 25.4, 2) + ' ' + T('pulgadas', 'inches') +
        (p.limited ? T(' (reducido al máximo permitido)', ' (reduced to the maximum allowed)') : '') + (p.trimmed ? T(' (recortado a la forma de la extensión)', ' (trimmed to the shape of the extent)') : ''));
      if (bounds) {
        /* ground width along the middle parallel (a great-circle distance would take the short way round a very wide view) */
        const lat = bounds.getCenter().lat, groundM = Math.abs(bounds.getEast() - bounds.getWest()) * Math.PI / 180 * MERC_R * Math.cos(lat / R2D);
        lines.push(T('Extensión: ', 'Extent: ') + 'lat ' + fmt(bounds.getSouth(), 3) + '° … ' + fmt(bounds.getNorth(), 3) + '°, lon ' + fmt(bounds.getWest(), 3) + '° … ' + fmt(bounds.getEast(), 3) + '°');
        lines.push(T('Escala aproximada: ', 'Approximate scale: ') + ratioText(groundM / (p.outW / p.dpi * 0.0254)));
      }
      return lines;
    }
    function updateExportInfo() {
      if (panes.export.hidden && !prevOpen) return;
      fmtHint.innerHTML = esc(T(FMT_HINTS[ex.fmt][0], FMT_HINTS[ex.fmt][1]));
      if (panes.export.hidden) return;
      let lines = [];
      try {
        const p = planExport(studio, ex), fe = fitEstimate(studio, p);
        lines = planSummary(p, fe.bounds);
        if (p.missing) lines.push(T('(ese encuadre no tiene extensión ahora mismo: se usa la vista actual)', '(that framing has no extent right now: the current view is used)'));
      } catch (e) { /* the map may not be measurable yet */ }
      info.innerHTML = lines.map(esc).join('<br>');
    }
    const btns = mk('div', 'ms-actions ms-wide'); g.appendChild(btns);
    const bPv = mk('button', 'btn btn-primary', L2('👁 Vista previa', '👁 Preview')); bPv.type = 'button';
    const bDl = mk('button', 'btn btn-secondary', L2('⬇ Descargar imagen', '⬇ Download image')); bDl.type = 'button';
    const bCp = mk('button', 'btn btn-secondary', L2('Copiar al portapapeles', 'Copy to clipboard')); bCp.type = 'button';
    btns.append(bPv, bDl, bCp);
    add(g, { t: 'check', k: 'preview', store: ex, wide: true, es: 'Mostrar la vista previa antes de descargar', en: 'Show the preview before downloading' });
    panes.export.appendChild(mk('p', 'ms-hint', L2('La imagen se compone con el mismo dibujo que ves en pantalla: título, leyenda, flecha, escala, retícula y marco se exportan tal cual. Los tamaños de papel se guardan con su resolución física (PNG y TIFF). El SVG contiene los datos y los textos como vectores, sin las teselas del mapa base.',
      'The image is composed with the very same drawing you see on screen: title, legend, arrow, scale, graticule and frame are exported as they are. Paper sizes are saved with their physical resolution (PNG and TIFF). The SVG holds the data and the texts as vectors, without the base map tiles.')));

    const fileName = ext => (hooks.fileName ? hooks.fileName() : 'map_' + slugName(state.query) + '_' + KIND_TAG[kind]) .replace(/\.[a-z0-9]+$/i, '') + '.' + ext;

    /* ---- take the map on screen to the chosen framing, so screen and export agree ---- */
    function applyFrameToScreen() {
      const p = planExport(studio, ex);
      const size = map.getSize();
      if (p.frame === 'asis' || !p.target) {
        if (ex.zoomAdj) { map.options.zoomSnap = 0; map.setZoom(clamp(map.getZoom() + ex.zoomAdj, 0, 22), { animate: false }); }
        say('warn', T('Ese encuadre no tiene extensión: el mapa se quedó como está.', 'That framing has no extent: the map was left as it is.'));
        return;
      }
      const scr = { W: size.x, H: size.y, cW: size.x, cH: size.y, g: 1, padPct: p.padPct, reserve: p.reserve, dpi: 96, outW: size.x };
      const pad = fitPadding(studio, scr);
      map.options.zoomSnap = 0;
      map.fitBounds(p.target, { paddingTopLeft: pad.tl, paddingBottomRight: pad.br, maxZoom: 16, animate: false });
      if (ex.zoomAdj) map.setZoom(clamp(map.getZoom() + ex.zoomAdj, 0, 22), { animate: false });
      say('ok', T('El mapa de la pantalla se llevó a ese encuadre.', 'The map on screen was taken to that framing.'));
    }
    /* ================= export preview =================
       The picture shown here is composed by runExport, the one and only export pipeline, and the very blob that is
       shown is the blob the download writes, so what is seen is what is saved. */
    let prevDlg = null, prevStage = null, prevInfo = null, prevCtl = null, prevAct = null;
    let prevUrl = null, prevLast = null, prevOpen = false, prevRun = 0, prevName = null, prevTimer = null;
    const PREV_SHOWABLE = { png: 1, jpg: 1, webp: 1, svg: 1 };
    function previewSoon() {
      if (!prevOpen) return;
      clearTimeout(prevTimer);
      prevTimer = setTimeout(() => refreshPreview(), 320);
    }
    function sayPrev(kindCls, text) { if (prevInfo) { prevInfo.className = 'ms-prev-info ' + (kindCls || ''); prevInfo.innerHTML = text; } }
    function buildPreview() {
      if (prevDlg) return;
      prevDlg = mk('dialog', 'ms-prev');
      prevDlg.innerHTML = `<div class="ms-prev-head"><h3>${L2('Vista previa de la exportación', 'Export preview')}</h3>` +
        `<button type="button" class="ms-prev-close" data-es-title="Cerrar" data-en-title="Close" aria-label="Cerrar">×</button></div>` +
        `<div class="ms-prev-body"><div class="ms-prev-stage"></div>` +
        `<div class="ms-prev-side"><div class="ms-prev-info" role="status" aria-live="polite"></div>` +
        `<div class="ms-grid ms-prev-ctl"></div><div class="ms-actions ms-prev-act"></div>` +
        `<p class="ms-hint">${L2('Puedes cambiar el encuadre, el tamaño, la resolución y el formato sin cerrar esta ventana: la imagen se vuelve a componer con el mismo procedimiento que la exportación.', 'You can change the framing, the size, the resolution and the format without closing this window: the picture is composed again with the very same procedure as the export.')}</p></div></div>`;
      document.body.appendChild(prevDlg);
      prevStage = prevDlg.querySelector('.ms-prev-stage');
      prevInfo = prevDlg.querySelector('.ms-prev-info');
      prevCtl = prevDlg.querySelector('.ms-prev-ctl');
      prevAct = prevDlg.querySelector('.ms-prev-act');
      prevDlg.querySelector('.ms-prev-close').addEventListener('click', closePreview);
      prevDlg.addEventListener('close', () => { prevOpen = false; releasePreview(); });
      prevDlg.addEventListener('cancel', () => { prevOpen = false; });
      /* the browser closes a modal dialog on Escape by itself; this keeps it working where it does not */
      prevDlg.addEventListener('keydown', e => { if (e.key === 'Escape' && prevDlg.open) { e.preventDefault(); closePreview(); } });
      /* the very same controls as the export tab, so a change here is a change there */
      add(prevCtl, { t: 'select', k: 'frame', store: ex, wide: true, es: 'Encuadre', en: 'Framing', opts: () => [
        ['asis', T('Como se ve en pantalla', 'As it looks on screen')],
        ['fit', T('Ajustar a los datos', 'Fit to the data')],
        ['regions', T('Ajustar a los estados o regiones elegidos', 'Fit to the chosen states or regions'), !hasSel()],
        ['mexico', T('México completo', 'The whole of Mexico'), !hasMx()],
        ['manual', T('Extensión manual', 'Manual extent')],
      ] });
      add(prevCtl, { t: 'range', k: 'zoomAdj', store: ex, wide: true, es: 'Ajuste fino del acercamiento', en: 'Zoom fine-tune', min: -2, max: 2, step: 0.1,
        fmt: v => (v > 0 ? '+' : '') + (+v).toFixed(1) + ' ' + T('niveles', 'levels') });
      add(prevCtl, { t: 'range', k: 'pad', store: ex, wide: true, es: 'Margen alrededor', en: 'Padding around it', min: 0, max: 25, step: 0.5, fmt: v => v + '%', when: fitLike });
      add(prevCtl, { t: 'select', k: 'size', store: ex, wide: true, after: v => { if (sizeSpec({ ...ex, size: v }).mm && ex.boost < 1) ex.boost = 1; }, es: 'Tamaño', en: 'Size',
        opts: () => Object.keys(SIZES).map(k => [k, T(SIZES[k].es, SIZES[k].en) + (SIZES[k].mm ? ' · ' + SIZES[k].mm[0] + '×' + SIZES[k].mm[1] + ' mm' : '')]) });
      add(prevCtl, { t: 'select', k: 'factor', store: ex, num: true, es: 'Resolución', en: 'Resolution', opts: optsOf([[1, '1×', '1×'], [1.5, '1.5×', '1.5×'], [2, '2×', '2×'], [3, '3×', '3×'], [4, '4×', '4×']]), when: () => isFactor() && ex.fmt !== 'svg' });
      add(prevCtl, { t: 'select', k: 'dpi', store: ex, num: true, es: 'Resolución', en: 'Resolution', opts: optsOf([[150, '150 dpi', '150 dpi'], [300, '300 dpi', '300 dpi'], [600, '600 dpi', '600 dpi']]), when: () => isMm() && ex.fmt !== 'svg' });
      add(prevCtl, { t: 'select', k: 'fmt', store: ex, wide: true, es: 'Formato', en: 'Format', opts: optsOf([['png', 'PNG', 'PNG'], ['jpeg', 'JPEG', 'JPEG'], ['webp', 'WebP', 'WebP'],
        ['tiff', 'TIFF (imagen)', 'TIFF (image)'], ['geotiff', 'GeoTIFF (georreferenciado)', 'GeoTIFF (georeferenced)'], ['svg', 'SVG (datos y textos, sin mapa base)', 'SVG (data and text, no base map)']]) });
      add(prevCtl, { t: 'check', k: 'clipOn', store: ex, wide: true, es: 'Recortar al país o a las regiones elegidas', en: 'Clip to the country or the chosen regions' });
      const bd = mk('button', 'btn btn-primary', L2('⬇ Descargar', '⬇ Download')); bd.type = 'button';
      const bc = mk('button', 'btn btn-secondary', L2('Copiar al portapapeles', 'Copy to clipboard')); bc.type = 'button';
      const bx = mk('button', 'btn btn-secondary', L2('Cerrar', 'Close')); bx.type = 'button';
      prevAct.append(bd, bc, bx);
      bd.addEventListener('click', downloadFromPreview);
      bc.addEventListener('click', () => doExport({ toClipboard: true }).catch(() => {}));
      bx.addEventListener('click', closePreview);
      I18N.apply(prevDlg);
    }
    function releasePreview() { if (prevUrl) { URL.revokeObjectURL(prevUrl); prevUrl = null; } }
    function closePreview() {
      prevOpen = false; clearTimeout(prevTimer);
      if (prevDlg) { if (prevDlg.open && prevDlg.close) prevDlg.close(); else prevDlg.removeAttribute('open'); }
      releasePreview();
    }
    function openPreview(o) {
      const over = o || {};
      if (over.fmt && EX_ENUMS.fmt.includes(over.fmt) && over.fmt !== ex.fmt) { ex.fmt = over.fmt; persistEx(); }
      prevName = over.name || null;
      buildPreview();
      prevOpen = true;
      prevDlg.setAttribute('aria-label', T('Vista previa de la exportación', 'Export preview'));
      if (!prevDlg.open) { if (prevDlg.showModal) prevDlg.showModal(); else prevDlg.setAttribute('open', ''); }
      controls.forEach(c => { if (c.fill) c.fill(); });
      syncUI();
      refreshPreview();
    }
    function showPreviewResult(r) {
      prevLast = r;
      releasePreview();
      prevStage.innerHTML = '';
      prevStage.classList.toggle('alpha', studio.style.bgMode === 'transparent' || !!(r.plan.clip && r.plan.clip.outside === 'transparent'));
      const alt = T('Vista previa del mapa que se va a exportar', 'Preview of the map that is about to be exported');
      if (PREV_SHOWABLE[r.ext]) {
        prevUrl = URL.createObjectURL(r.blob);
        const img = new Image(); img.className = 'ms-prev-img'; img.alt = alt; img.src = prevUrl;
        prevStage.appendChild(img);
      } else if (r.cv) {
        /* a browser cannot display a TIFF, so the canvas the file was written from is shown instead */
        r.cv.className = 'ms-prev-img'; r.cv.setAttribute('role', 'img'); r.cv.setAttribute('aria-label', alt);
        prevStage.appendChild(r.cv);
      }
      const size = r.blob.size, weight = size > 1e6 ? fmt(size / 1e6, 2) + ' MB' : Math.max(1, Math.round(size / 1024)) + ' kB';
      const lines = planSummary(r.plan, r.bounds);
      lines.push(T('Formato: ', 'Format: ') + T(FMT_HINTS[ex.fmt][0], FMT_HINTS[ex.fmt][1]));
      lines.push(T('Archivo: ', 'File: ') + esc(prevName ? String(prevName).replace(/\.[a-z0-9]+$/i, '') + '.' + r.ext : fileName(r.ext)) + ' · ' + weight);
      if (!r.tiles && r.ext !== 'svg') lines.push(T('El servidor del mapa base no dejó leer sus teselas: la imagen va sin mapa base.', 'The base map server did not allow reading its tiles: the picture goes without a base map.'));
      if (r.plan.missing) lines.push(T('Ese encuadre no tiene extensión: se usó la vista actual.', 'That framing has no extent: the current view was used.'));
      if (ex.clipOn && !r.plan.clip) lines.push(T('El recorte está activo pero lo elegido no tiene polígonos: la imagen va sin recortar.', 'The clip is on but what was chosen holds no polygon: the picture goes unclipped.'));
      sayPrev('', lines.map(esc).join('<br>'));
    }
    async function refreshPreview() {
      if (!prevOpen) return;
      if (!cont.offsetParent || cont.clientWidth < 10) { sayPrev('err', L2('El mapa no está visible: ábrelo primero.', 'The map is not visible: open it first.')); return; }
      const id = ++prevRun;
      prevDlg.classList.add('busy');
      sayPrev('busy', L2('Componiendo la imagen…', 'Composing the picture…'));
      try {
        const r = await runExport(studio, ex);
        if (id !== prevRun || !prevOpen) return;
        showPreviewResult(r);
      } catch (e) {
        if (id !== prevRun) return;
        console.warn('map studio: preview failed', e);
        prevStage.innerHTML = '';
        sayPrev('err', L2('No se pudo componer la vista previa: ', 'The preview could not be composed: ') + esc(e && e.message || String(e)));
      } finally { if (id === prevRun && prevDlg) prevDlg.classList.remove('busy'); }
    }
    function downloadFromPreview() {
      if (!prevLast) return;
      const name = prevName ? String(prevName).replace(/\.[a-z0-9]+$/i, '') + '.' + prevLast.ext : fileName(prevLast.ext);
      downloadBlob(prevLast.blob, name);
      const size = prevLast.blob.size;
      const msg = T('Guardado: ', 'Saved: ') + name + ' (' + (size > 1e6 ? fmt(size / 1e6, 2) + ' MB' : Math.round(size / 1024) + ' kB') + ')';
      say('ok', esc(msg)); sayPrev('ok', esc(msg));
    }
    studio.showPreview = o => { openPreview(o); };

    async function doExport(o) {
      const opt = Object.assign({}, ex, o || {});
      if (!cont.offsetParent || cont.clientWidth < 10) { say('err', L2('El mapa no está visible: ábrelo primero.', 'The map is not visible: open it first.')); throw new Error('hidden'); }
      /* the preview is the normal way out: it shows the very file that would be written and downloads it from there */
      if (ex.preview && !opt.toClipboard && !(o && o.noPreview)) { openPreview(o); return null; }
      if (opt.toClipboard && (opt.fmt === 'svg' || opt.fmt === 'tiff' || opt.fmt === 'geotiff')) opt.fmt = 'png';
      say('busy', T('Generando la imagen…', 'Generating the image…'));
      showSpinner(T('Generando imagen del mapa…', 'Generating the map image…'));
      try {
        let r;
        if (opt.toClipboard) {
          if (!(navigator.clipboard && window.ClipboardItem)) throw Object.assign(new Error('clipboard'), { clip: true });
          opt.fmt = 'png';
          const run = runExport(studio, opt); let runErr = null; run.catch(e => { runErr = e; });
          /* the clipboard write starts now, inside the click, with a promise for the image (a long export would otherwise
             outlive the user activation the browser requires) */
          try {
            const writing = navigator.clipboard.write([new ClipboardItem({ 'image/png': run.then(x => x.blob) })]);
            writing.catch(() => {}); r = await run; await writing;
          } catch (e) {
            if (runErr) throw runErr;
            if (e && e.name === 'TypeError') { r = await run; await navigator.clipboard.write([new ClipboardItem({ 'image/png': r.blob })]); }
            else throw Object.assign(e, { clip: true });
          }
          say('ok', T('Imagen copiada al portapapeles.', 'Image copied to the clipboard.'));
        } else {
          r = await runExport(studio, opt);
          const name = (o && o.name) ? String(o.name).replace(/\.[a-z0-9]+$/i, '') + '.' + r.ext : fileName(r.ext);
          downloadBlob(r.blob, name);
          say(r.tiles || r.ext === 'svg' ? 'ok' : 'warn', esc(T('Guardado: ', 'Saved: ') + name + ' (' + (r.blob.size > 1e6 ? fmt(r.blob.size / 1e6, 1) + ' MB' : Math.round(r.blob.size / 1024) + ' kB') + ')') +
            (r.tiles || r.ext === 'svg' ? '' : ' ' + L2('El servidor del mapa base no permite leer sus teselas; la imagen se exportó sin mapa base.', 'The base map server does not allow reading its tiles; the image was exported without the base map.')));
        }
        return r;
      } catch (e) {
        console.warn('map studio export', e);
        say('err', e && e.clip ? L2('No se pudo copiar al portapapeles (el navegador lo bloqueó o no lo admite); usa la descarga.', 'Could not copy to the clipboard (the browser blocked it or does not support it); use the download.')
          : L2('No se pudo exportar el mapa: ', 'The map could not be exported: ') + esc(e && e.message || String(e)));
        throw e;
      } finally { hideSpinner(); }
    }
    studio.exportNow = o => doExport(o).catch(() => {});
    studio.exportBlob = o => runExport(studio, Object.assign({}, ex, o || {}));   // {blob, ext, tiles, plan}, nothing is downloaded
    bPv.addEventListener('click', () => openPreview());
    bDl.addEventListener('click', () => doExport().catch(() => {}));
    bCp.addEventListener('click', () => doExport({ toClipboard: true }).catch(() => {}));

    /* ---- mount ---- */
    const after = opts.after || cont;
    after.parentNode.insertBefore(panel, after.nextSibling);
    controls.forEach(c => { if (c.fill) c.fill(); });
    buildRampButtons();
    const firstTab = 'base';
    showTab(firstTab);
    applyBase(); prepare(); syncCats(true); syncUI(); redrawAll();
    I18N.apply(panel);
    panel.addEventListener('toggle', () => { if (panel.open) { syncUI(); updateExportInfo(); } });
    setTimeout(() => { map.invalidateSize(); decorSoon(); }, 120);
    return studio;
  }

  const STUDIOS = [];
  window.mapstudio = { attach, RAMPS, PALETTES, rampStops, whiteFirst, rampAt, rampName, makeScale, classBreaks, sortedFinite, categoryColors, palColor, PRESETS, SIZES, planExport, convexHull, studios: STUDIOS };
})();
