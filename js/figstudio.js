/* Figure studio — one shared editor for every statistical figure of the app.

   How it works
   - A figure is described declaratively (`spec`): panels, and inside each panel a list of layers
     (histogram, density curve, fitted normal, rug, box plot, violin, Q-Q, empirical cumulative
     distribution, mean with confidence interval). The studio draws the whole figure as one SVG
     string with plain resolved colours, so what is seen is what is exported.
   - Every number a figure needs is computed here in JavaScript (kernel density, histogram breaks,
     quantiles, box statistics, normal quantile function, Student t quantile), so an edit redraws
     instantly and the export is vector.
   - The editor is a collapsible panel under the figure: texts and fonts, axes, grid and frame,
     series, the controls of each figure type, annotations, one-click looks and export.
   - The last style of each kind of figure is remembered in this browser; the JSON file keeps
     everything, including the texts.

   Methods cited by author and year: Sturges 1926; Scott 1979; Freedman & Diaconis 1981;
   Silverman 1986; Tukey 1977; Hyndman & Fan 1996 (quantile type 7); Wilk & Gnanadesikan 1968
   (plotting positions); Wichura 1988 (normal quantile function). */

(function () {
  'use strict';

  const PREFIX = 'biomodellingpro:figstyle:';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode or blocked storage */ } };
  const mk = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
  const r2 = v => Math.round((+v || 0) * 100) / 100;

  /* ---------- colours (plain #rrggbb strings only, so nothing depends on CSS at export) ---------- */
  function hexRgb(h) {
    h = String(h == null ? '#000000' : h).trim();
    if (h[0] !== '#') { const m = h.match(/[\d.]+/g); return m && m.length >= 3 ? [+m[0], +m[1], +m[2]] : [0, 0, 0]; }
    h = h.slice(1); if (h.length === 3) h = h.replace(/./g, c => c + c);
    return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
  }
  const rgbHex = (r, g, b) => '#' + [r, g, b].map(x => clamp(Math.round(x), 0, 255).toString(16).padStart(2, '0')).join('');
  const lumOf = h => { const [r, g, b] = hexRgb(h); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
  const mixHex = (a, b, t) => { const A = hexRgb(a), B = hexRgb(b); return rgbHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); };
  const asHex = c => { const s = String(c || ''); return /^#[0-9a-f]{6}$/i.test(s) ? s.toLowerCase() : rgbHex(...hexRgb(s)); };

  /* ---------- categorical palettes ---------- */
  const PALETTES = {
    okabe: ['#e69f00', '#56b4e9', '#009e73', '#f0e442', '#0072b2', '#d55e00', '#cc79a7', '#000000'],
    tableau: ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac'],
    set2: ['#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', '#ffd92f', '#e5c494', '#b3b3b3'],
    dark2: ['#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02', '#a6761d', '#666666'],
    paired: ['#a6cee3', '#1f78b4', '#b2df8a', '#33a02c', '#fb9a99', '#e31a1c', '#fdbf6f', '#ff7f00', '#cab2d6', '#6a3d9a', '#ffff99', '#b15928'],
    grey: ['#3f4a55', '#6b7785', '#96a1ad', '#c0c8d0', '#5a6673', '#818d9a', '#aab3bc'],
  };
  const PALETTE_NAMES = {
    app: { es: 'Colores de la aplicación', en: 'Application colours' },
    okabe: { es: 'Okabe-Ito (apta para daltonismo)', en: 'Okabe-Ito (colour-blind safe)' },
    tableau: 'Tableau', set2: 'Set2', dark2: 'Dark2', paired: 'Paired',
    grey: { es: 'Grises (impresión en blanco y negro)', en: 'Greys (black-and-white printing)' },
  };
  /* the ten theme colours, read from the style sheet */
  const appPalette = () => ['--c1', '--c2', '--c3', '--c4', '--c5', '--c6', '--c7', '--c8', '--c9', '--c10'].map(v => asHex(cssVar(v, '#1f7a4d')));
  function palColor(pal, i) {
    const p = pal === 'app' ? appPalette() : (PALETTES[pal] || PALETTES.okabe), n = p.length, base = p[i % n], cyc = Math.floor(i / n);
    if (!cyc) return base;
    const k = Math.ceil(cyc / 2) * 0.22;
    return cyc % 2 ? mixHex(base, '#000000', Math.min(0.6, k + 0.1)) : mixHex(base, '#ffffff', Math.min(0.7, k + 0.15));
  }

  /* ---------- fonts ---------- */
  const FONTS = {
    sans: 'system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', serif: 'Georgia, "Times New Roman", Times, serif',
    mono: 'ui-monospace, "Courier New", monospace', georgia: 'Georgia, serif', palatino: '"Palatino Linotype", Palatino, "Book Antiqua", serif',
    trebuchet: '"Trebuchet MS", Tahoma, sans-serif', verdana: 'Verdana, Geneva, sans-serif', times: '"Times New Roman", Times, serif',
    courier: '"Courier New", Courier, monospace',
  };
  const FONT_OPTS = [['sans', 'Sans-serif (sistema)', 'Sans-serif (system)'], ['serif', 'Serif (sistema)', 'Serif (system)'], ['mono', 'Monoespaciada', 'Monospace'],
    ['georgia', 'Georgia', 'Georgia'], ['palatino', 'Palatino', 'Palatino'], ['trebuchet', 'Trebuchet', 'Trebuchet'], ['verdana', 'Verdana', 'Verdana'],
    ['times', 'Times New Roman', 'Times New Roman'], ['courier', 'Courier New', 'Courier New']];

  /* every piece of text has its own size, weight, style, colour and family in the style; textScale multiplies the sizes */
  const TXT_ROLES = ['title', 'subtitle', 'caption', 'axisTitle', 'tick', 'legendTitle', 'legendLabel', 'value', 'annot', 'facet'];
  const AUTO_SIZE = { title: 17, subtitle: 12.5, caption: 11, axisTitle: 12.5, tick: 11, legendTitle: 12, legendLabel: 11.5, value: 10.5, annot: 11.5, facet: 12 };
  const rk = (role, what) => role + what;                       // titleSize, titleBold, titleItalic, titleColor, titleFont
  function fontOf(st, role, ink) {
    const own = +st[rk(role, 'Size')], sc = clamp(+st.textScale || 1, 0.4, 4), fam = st[rk(role, 'Font')] || '';
    return { size: (own > 0 ? own : AUTO_SIZE[role]) * sc, weight: st[rk(role, 'Bold')] ? 700 : 400, italic: !!st[rk(role, 'Italic')],
      family: FONTS[fam] || FONTS[st.font] || FONTS.sans, fill: st[rk(role, 'Color')] || ink };
  }

  /* one offscreen canvas measures text with the very same font */
  const MEAS = (() => { const c = document.createElement('canvas'); return c.getContext('2d'); })();
  const fontCSS = f => (f.italic ? 'italic ' : '') + (f.weight >= 600 ? '700 ' : '400 ') + r2(f.size) + 'px ' + f.family;
  function measure(s, f) { MEAS.font = fontCSS(f); return MEAS.measureText(String(s == null ? '' : s)).width; }

  /* ================= numbers: estimators and distributions ================= */
  function cleanValues(v) {
    const out = [];
    for (let i = 0; i < v.length; i++) { const x = +v[i]; if (isFinite(x)) out.push(x); }
    return Float64Array.from(out);
  }
  const sortAsc = v => Float64Array.from(v).sort();
  function meanOf(x) { let s = 0; for (let i = 0; i < x.length; i++) s += x[i]; return x.length ? s / x.length : NaN; }
  function sdOf(x, ddof) { const n = x.length, m = meanOf(x); if (n - (ddof == null ? 1 : ddof) <= 0) return 0; let s = 0; for (let i = 0; i < n; i++) s += (x[i] - m) ** 2; return Math.sqrt(s / (n - (ddof == null ? 1 : ddof))); }
  function moment(x, k) { const n = x.length, m = meanOf(x); let s = 0; for (let i = 0; i < n; i++) s += (x[i] - m) ** k; return s / n; }
  const skewOf = x => { const m2 = moment(x, 2); return m2 > 0 ? moment(x, 3) / Math.pow(m2, 1.5) : 0; };
  const kurtOf = x => { const m2 = moment(x, 2); return m2 > 0 ? moment(x, 4) / (m2 * m2) - 3 : 0; };
  /* quantile of type 7 (Hyndman & Fan 1996), the one used by the tables of this step */
  function q7(sorted, p) {
    const n = sorted.length; if (!n) return NaN; if (n === 1) return sorted[0];
    const h = (n - 1) * clamp(p, 0, 1), lo = Math.floor(h), hi = Math.min(n - 1, lo + 1);
    return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
  }
  const iqrOf = sorted => q7(sorted, 0.75) - q7(sorted, 0.25);

  /* bandwidth of the Gaussian kernel: Silverman 1986 (robust rule of thumb) or Scott 1979 */
  function bandwidth(x, sorted, rule, value, adjust) {
    const n = x.length, sd = sdOf(x, 1), iq = iqrOf(sorted), a = clamp(+adjust || 1, 0.05, 10);
    let h;
    if (rule === 'manual') h = +value > 0 ? +value : 1;
    else if (rule === 'scott') h = sd * Math.pow(n, -0.2);
    else h = 0.9 * Math.min(sd || iq / 1.349 || 1, (iq / 1.349) || sd || 1) * Math.pow(n, -0.2);
    if (!isFinite(h) || h <= 0) h = (sd || 1) * Math.pow(Math.max(n, 2), -0.2) || 1;
    return h * (rule === 'manual' ? 1 : a);
  }
  /* Gaussian kernel density on a grid (down-samples the sample above 20000 points, evenly) */
  function kdeAt(x, grid, h) {
    const out = new Float64Array(grid.length), step = x.length > 20000 ? Math.ceil(x.length / 20000) : 1;
    let n = 0; const c = 1 / Math.sqrt(2 * Math.PI);
    for (let i = 0; i < x.length; i += step) n++;
    for (let g = 0; g < grid.length; g++) {
      let s = 0;
      for (let i = 0; i < x.length; i += step) { const u = (grid[g] - x[i]) / h; if (u > -8 && u < 8) s += c * Math.exp(-0.5 * u * u); }
      out[g] = s / (n * h);
    }
    return out;
  }
  const linspace = (a, b, n) => { const o = new Float64Array(n); for (let i = 0; i < n; i++) o[i] = n === 1 ? a : a + (b - a) * i / (n - 1); return o; };

  /* histogram breaks: Sturges 1926, Scott 1979, Freedman & Diaconis 1981, square root, a fixed count or a fixed width */
  function binEdges(x, sorted, rule, count, width) {
    const n = x.length, lo = sorted[0], hi = sorted[n - 1];
    if (!n) return [0, 1];
    if (hi === lo) return [lo - 0.5, lo + 0.5];
    let k = 0, w = 0;
    if (rule === 'count') k = clamp(Math.round(+count || 20), 1, 500);
    else if (rule === 'width') w = +width > 0 ? +width : (hi - lo) / 20;
    else if (rule === 'sqrt') k = Math.ceil(Math.sqrt(n));
    else if (rule === 'scott') w = Math.pow(24 * Math.sqrt(Math.PI) / n, 1 / 3) * sdOf(x, 0);
    else if (rule === 'fd') { const iq = iqrOf(sorted); w = 2 * iq * Math.pow(n, -1 / 3); if (!(w > 0)) w = Math.pow(24 * Math.sqrt(Math.PI) / n, 1 / 3) * sdOf(x, 0); }
    else k = Math.ceil(Math.log2(n)) + 1;                       // Sturges
    if (!k) k = w > 0 ? Math.ceil((hi - lo) / w) : 10;
    k = clamp(k, 1, 1000);
    const edges = new Float64Array(k + 1);
    for (let i = 0; i <= k; i++) edges[i] = lo + (hi - lo) * i / k;
    return edges;
  }
  /* a value belongs to the bin [edge_i, edge_i+1), and the last bin also holds the maximum;
     the first guess is corrected against the real edges, so a value sitting exactly on an edge is never misplaced */
  function histCounts(x, edges) {
    const k = edges.length - 1, c = new Float64Array(k), lo = edges[0], hi = edges[k];
    for (let i = 0; i < x.length; i++) {
      const v = x[i]; if (v < lo || v > hi) continue;
      let b = Math.floor((v - lo) / (hi - lo) * k); if (b >= k) b = k - 1; if (b < 0) b = 0;
      while (b > 0 && v < edges[b]) b--;
      while (b < k - 1 && v >= edges[b + 1]) b++;
      c[b]++;
    }
    return c;
  }

  /* box statistics: Tukey 1977 (whiskers to the last value inside 1.5 IQR), percentile whiskers or the extremes */
  function boxStats(sorted, o) {
    const n = sorted.length, q1 = q7(sorted, 0.25), med = q7(sorted, 0.5), q3 = q7(sorted, 0.75), iq = q3 - q1;
    let lo, hi;
    if (o.rule === 'pct') { const p = clamp(+o.pct || 5, 0, 49) / 100; lo = q7(sorted, p); hi = q7(sorted, 1 - p); }
    else if (o.rule === 'minmax') { lo = sorted[0]; hi = sorted[n - 1]; }
    else {
      const k = +o.k > 0 ? +o.k : 1.5, a = q1 - k * iq, b = q3 + k * iq;
      lo = sorted[0]; for (let i = 0; i < n; i++) if (sorted[i] >= a) { lo = sorted[i]; break; }
      hi = sorted[n - 1]; for (let i = n - 1; i >= 0; i--) if (sorted[i] <= b) { hi = sorted[i]; break; }
    }
    const out = [];
    for (let i = 0; i < n; i++) if (sorted[i] < lo || sorted[i] > hi) out.push(sorted[i]);
    const nm = 1.57 * iq / Math.sqrt(Math.max(n, 1));
    return { n, q1, med, q3, iqr: iq, lo, hi, out, mean: meanOf(sorted), sd: sdOf(sorted, 1), notchLo: med - nm, notchHi: med + nm, min: sorted[0], max: sorted[n - 1] };
  }

  /* ---------- normal and Student t ---------- */
  function gammln(z) {
    const g = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905,
      -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - gammln(1 - z);
    z -= 1; let x = 0.99999999999980993;
    for (let i = 0; i < 8; i++) x += g[i] / (z + i + 1);
    const t = z + 7.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  }
  /* regularized lower incomplete gamma: series below a+1, continued fraction above */
  function gammp(a, x) {
    if (!(x > 0)) return 0;
    if (x < a + 1) {
      let ap = a, sum = 1 / a, del = sum;
      for (let i = 0; i < 400; i++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-17) break; }
      return sum * Math.exp(-x + a * Math.log(x) - gammln(a));
    }
    const TINY = 1e-300; let b = x + 1 - a, c = 1 / TINY, d = 1 / b, h = d;
    for (let i = 1; i < 500; i++) {
      const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < TINY) d = TINY;
      c = b + an / c; if (Math.abs(c) < TINY) c = TINY; d = 1 / d;
      const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-17) break;
    }
    return 1 - Math.exp(-x + a * Math.log(x) - gammln(a)) * h;
  }
  const normCdf = z => !isFinite(z) ? (z > 0 ? 1 : 0) : z === 0 ? 0.5 : z > 0 ? 0.5 * (1 + gammp(0.5, z * z / 2)) : 0.5 * (1 - gammp(0.5, z * z / 2));
  const normPdf = (x, mu, sd) => Math.exp(-0.5 * ((x - mu) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));
  /* normal quantile function, rational approximation of Wichura 1988 (about 1e-16 relative accuracy) */
  function normPpf(p) {
    if (!(p > 0)) return -Infinity; if (!(p < 1)) return Infinity;
    const q = p - 0.5; let r, v;
    if (Math.abs(q) <= 0.425) {
      r = 0.180625 - q * q;
      v = q * (((((((2509.0809287301226727 * r + 33430.575583588128105) * r + 67265.770927008700853) * r + 45921.953931549871457) * r +
        13731.693765509461125) * r + 1971.5909503065514427) * r + 133.14166789178437745) * r + 3.387132872796366608) /
        (((((((5226.495278852545925 * r + 28729.085735721942674) * r + 39307.89580009271061) * r + 21213.794301586595867) * r +
          5394.1960214247511077) * r + 687.1870074920579083) * r + 42.313330701600911252) * r + 1);
      return v;
    }
    r = q < 0 ? p : 1 - p; r = Math.sqrt(-Math.log(r));
    if (r <= 5) {
      r -= 1.6;
      v = (((((((7.7454501427834140764e-4 * r + 0.0227238449892691845833) * r + 0.24178072517745061177) * r + 1.27045825245236838258) * r +
        3.64784832476320460504) * r + 5.7694972214606914055) * r + 4.6303378461565452959) * r + 1.42343711074968357734) /
        (((((((1.05075007164441684324e-9 * r + 5.475938084995344946e-4) * r + 0.0151986665636164571966) * r + 0.14810397642748007459) * r +
          0.68976733498510000455) * r + 1.6763848301838038494) * r + 2.05319162663775882187) * r + 1);
    } else {
      r -= 5;
      v = (((((((2.01033439929228813265e-7 * r + 2.71155556874348757815e-5) * r + 0.0012426609473880784386) * r + 0.026532189526576123093) * r +
        0.29656057182850489123) * r + 1.7848265399172913358) * r + 5.4637849111641143699) * r + 6.6579046435011037772) /
        (((((((2.04426310338993978564e-15 * r + 1.4215117583164458887e-7) * r + 1.8463183175100546818e-5) * r + 7.868691311456132591e-4) * r +
          0.0148753612908506148525) * r + 0.13692988092273580531) * r + 0.59983220655588793769) * r + 1);
    }
    return q < 0 ? -v : v;
  }
  /* regularized incomplete beta (continued fraction of Lentz), for the Student t distribution */
  function betacf(a, b, x) {
    const TINY = 1e-300; const qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - qab * x / qap; if (Math.abs(d) < TINY) d = TINY; d = 1 / d; let h = d;
    for (let m = 1; m <= 300; m++) {
      const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY; c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY; d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY; c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY; d = 1 / d;
      const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-15) break;
    }
    return h;
  }
  function betai(a, b, x) {
    if (!(x > 0)) return 0; if (!(x < 1)) return 1;
    const bt = Math.exp(gammln(a + b) - gammln(a) - gammln(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
  }
  const tCdf = (t, df) => { const p = 0.5 * betai(df / 2, 0.5, df / (df + t * t)); return t > 0 ? 1 - p : p; };
  function tPpf(p, df) {
    if (!(df > 0)) return NaN; if (df > 1e7) return normPpf(p);
    if (!(p > 0)) return -Infinity; if (!(p < 1)) return Infinity;
    let lo = -1e4, hi = 1e4;
    for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (tCdf(m, df) < p) lo = m; else hi = m; if (hi - lo < 1e-12) break; }
    return (lo + hi) / 2;
  }
  /* plotting positions (i − a)/(n + 1 − 2a): Wilk & Gnanadesikan 1968 (a = 3/8), Hazen (a = 1/2), Weibull (a = 0);
     "filliben" instead uses the medians of the order statistics (Filliben 1975), the convention of the classic engines */
  function ppoints(n, a) {
    const o = new Float64Array(n);
    if (a === 'filliben') {
      const last = Math.pow(0.5, 1 / n);
      for (let i = 1; i < n - 1; i++) o[i] = (i + 1 - 0.3175) / (n + 0.365);
      o[n - 1] = last; o[0] = 1 - last;
      return o;
    }
    const A = a == null ? (n <= 10 ? 3 / 8 : 0.5) : a;
    for (let i = 0; i < n; i++) o[i] = (i + 1 - A) / (n + 1 - 2 * A);
    return o;
  }
  /* normal Q-Q: ordered values against theoretical quantiles, the reference line and its pointwise band */
  function qqData(sorted, o) {
    const n = sorted.length, p = ppoints(n, o.pp), th = new Float64Array(n);
    for (let i = 0; i < n; i++) th[i] = normPpf(p[i]);
    let a = 0, b = 1;                                            // sample = a + b * theoretical
    if (o.line === 'ls') {
      const mx = meanOf(th), my = meanOf(sorted); let sxy = 0, sxx = 0;
      for (let i = 0; i < n; i++) { sxy += (th[i] - mx) * (sorted[i] - my); sxx += (th[i] - mx) ** 2; }
      b = sxx ? sxy / sxx : 1; a = my - b * mx;
    } else {                                                     // through the two quartiles
      const q1 = q7(sorted, 0.25), q3 = q7(sorted, 0.75), t1 = normPpf(0.25), t3 = normPpf(0.75);
      b = (q3 - q1) / (t3 - t1); a = q1 - b * t1;
    }
    let band = null;
    if (o.band) {
      const z = normPpf(1 - (1 - clamp(+o.level || 0.95, 0.5, 0.999)) / 2), up = new Float64Array(n), dn = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const d = normPdf(th[i], 0, 1), se = d > 1e-12 ? Math.abs(b) * Math.sqrt(p[i] * (1 - p[i]) / n) / d : NaN, fit = a + b * th[i];
        up[i] = isFinite(se) ? fit + z * se : NaN; dn[i] = isFinite(se) ? fit - z * se : NaN;
      }
      band = { up, dn };
    }
    return { th, p, a, b, band };
  }
  /* empirical cumulative distribution: the distinct values and the proportion at or below each of them */
  function ecdfOf(sorted) {
    const xs = [], ys = [], n = sorted.length;
    for (let i = 0; i < n;) { let j = i; while (j + 1 < n && sorted[j + 1] === sorted[i]) j++; xs.push(sorted[i]); ys.push((j + 1) / n); i = j + 1; }
    return { xs, ys, n };
  }
  const num = { cleanValues, sortAsc, meanOf, sdOf, skewOf, kurtOf, q7, iqrOf, bandwidth, kdeAt, linspace, binEdges, histCounts,
    boxStats, normCdf, normPdf, normPpf, tPpf, tCdf, ppoints, qqData, ecdfOf, gammp, betai };

  /* ================= formatting and ticks ================= */
  const SUP = { '-': '−', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  const supNum = s => String(s).replace(/[-0-9]/g, c => SUP[c]);
  const minus = s => String(s).replace(/^-/, '−');
  function group(s, sep) {
    if (!sep) return s;
    const neg = s[0] === '-' ? '-' : '', b = neg ? s.slice(1) : s, dot = b.indexOf('.'), ip = dot < 0 ? b : b.slice(0, dot), rest = dot < 0 ? '' : b.slice(dot);
    return neg + ip.replace(/\B(?=(\d{3})+(?!\d))/g, sep) + rest;
  }
  /* o: {fmt, dec, sep} — always a decimal point, and the true minus sign */
  function fmtVal(v, o) {
    if (v == null || !isFinite(v)) return '—';
    const dec = o.dec == null ? 2 : clamp(o.dec | 0, 0, 8);
    if (o.fmt === 'sci') {
      if (v === 0) return '0';
      const e = Math.floor(Math.log10(Math.abs(v))), m = v / Math.pow(10, e);
      return minus(m.toFixed(dec)) + '×10' + supNum(e);
    }
    if (o.fmt === 'percent') return minus((v * 100).toFixed(dec)) + ' %';
    if (o.fmt === 'auto') {
      const a = Math.abs(v);
      if (a !== 0 && (a >= 1e6 || a < 1e-4)) { const e = Math.floor(Math.log10(a)), m = v / Math.pow(10, e); return minus(m.toFixed(1)) + '×10' + supNum(e); }
      return minus(group(trimZeros(v.toFixed(dec)), o.sep));
    }
    return minus(group(v.toFixed(dec), o.sep));
  }
  const trimZeros = s => s.indexOf('.') < 0 ? s : s.replace(/\.?0+$/, '');
  /* the fewest decimals that write a tick step exactly (0.025 needs three, 2.5 needs one) */
  function decForStep(step) {
    let a = Math.abs(step), d = 0;
    if (!(a > 0)) return 2;
    while (d < 6 && Math.abs(a - Math.round(a)) > 1e-9) { a *= 10; d++; }
    return clamp(d, 0, 6);
  }

  function niceTicks(a, b, target) {
    if (!(b > a)) { return { ticks: [a], step: 1 }; }
    const span = b - a, raw = span / clamp(target || 6, 2, 30), mag = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / mag;
    const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
    const t = [], first = Math.ceil(a / step - 1e-9) * step;
    for (let v = first; v <= b + step * 1e-9; v += step) t.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    return { ticks: t, step };
  }
  function logTicks(a, b) {
    const t = [], minor = [], e0 = Math.floor(Math.log10(a)), e1 = Math.ceil(Math.log10(b));
    for (let e = e0; e <= e1; e++) {
      const base = Math.pow(10, e);
      if (base >= a && base <= b) t.push(base);
      for (let m = 2; m <= 9; m++) { const v = m * base; if (v >= a && v <= b) minor.push(v); }
    }
    return { ticks: t.length ? t : [a, b], minor, step: 0 };
  }

  /* ================= SVG primitives ================= */
  function txtEl(P, s, x, y, f, o) {
    if (s == null || s === '') return;
    o = o || {};
    P.push(`<text x="${r2(x)}" y="${r2(y)}" font-family="${esc(f.family)}" font-size="${r2(f.size)}"` +
      (f.weight >= 600 ? ' font-weight="700"' : '') + (f.italic ? ' font-style="italic"' : '') +
      ` fill="${f.fill}"` + (o.anchor ? ` text-anchor="${o.anchor}"` : '') + (o.op != null ? ` opacity="${r2(o.op)}"` : '') +
      (o.rot ? ` transform="rotate(${r2(o.rot)} ${r2(x)} ${r2(y)})"` : '') + '>' + esc(s) + '</text>');
  }
  const rect = (P, x, y, w, h, o) => {
    if (!(w > 0) || !(h > 0)) return;
    P.push(`<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}"` + (o.fill ? ` fill="${o.fill}"` : ' fill="none"') +
      (o.fa != null ? ` fill-opacity="${r2(o.fa)}"` : '') + (o.stroke ? ` stroke="${o.stroke}" stroke-width="${r2(o.lw == null ? 1 : o.lw)}"` : '') +
      (o.dash ? ` stroke-dasharray="${o.dash}"` : '') + (o.rx ? ` rx="${r2(o.rx)}"` : '') + (o.op != null ? ` opacity="${r2(o.op)}"` : '') + '/>');
  };
  const path = (P, d, o) => {
    if (!d) return;
    P.push(`<path d="${d}"` + (o.fill ? ` fill="${o.fill}"` : ' fill="none"') + (o.fa != null ? ` fill-opacity="${r2(o.fa)}"` : '') +
      (o.stroke ? ` stroke="${o.stroke}" stroke-width="${r2(o.lw == null ? 1 : o.lw)}"` : '') + (o.dash ? ` stroke-dasharray="${o.dash}"` : '') +
      (o.op != null ? ` opacity="${r2(o.op)}"` : '') + ' stroke-linejoin="round" stroke-linecap="round"' + (o.cls ? ` class="${o.cls}"` : '') + '/>');
  };
  const line = (P, x1, y1, x2, y2, o) => path(P, `M${r2(x1)},${r2(y1)} L${r2(x2)},${r2(y2)}`, o);
  const DASHES = { solid: '', dash: '6 4', dot: '1.6 3', dashdot: '8 3 1.6 3', long: '12 5' };
  const dashOf = k => DASHES[k] || '';

  /* marker shapes; filled shapes go in one path, stroked ones in another */
  function markerD(shape, x, y, r) {
    switch (shape) {
      case 'square': return `M${r2(x - r)},${r2(y - r)}h${r2(2 * r)}v${r2(2 * r)}h${r2(-2 * r)}z`;
      case 'triangle': return `M${r2(x)},${r2(y - r * 1.2)}L${r2(x + r * 1.1)},${r2(y + r * 0.78)}L${r2(x - r * 1.1)},${r2(y + r * 0.78)}z`;
      case 'diamond': return `M${r2(x)},${r2(y - r * 1.3)}L${r2(x + r * 1.05)},${r2(y)}L${r2(x)},${r2(y + r * 1.3)}L${r2(x - r * 1.05)},${r2(y)}z`;
      case 'star': {
        let d = ''; for (let i = 0; i < 10; i++) { const ang = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.48 : r * 1.28; d += (i ? 'L' : 'M') + r2(x + rr * Math.cos(ang)) + ',' + r2(y + rr * Math.sin(ang)); }
        return d + 'z';
      }
      default: return `M${r2(x - r)},${r2(y)}a${r2(r)},${r2(r)} 0 1,0 ${r2(2 * r)},0a${r2(r)},${r2(r)} 0 1,0 ${r2(-2 * r)},0z`;
    }
  }
  const markerStrokeD = (shape, x, y, r) => shape === 'cross'
    ? `M${r2(x - r)},${r2(y - r)}L${r2(x + r)},${r2(y + r)}M${r2(x - r)},${r2(y + r)}L${r2(x + r)},${r2(y - r)}`
    : `M${r2(x - r)},${r2(y)}H${r2(x + r)}M${r2(x)},${r2(y - r)}V${r2(y + r)}`;
  const isStrokeShape = s => s === 'cross' || s === 'plus';
  const MARKERS = [['circle', 'Círculo', 'Circle'], ['square', 'Cuadrado', 'Square'], ['triangle', 'Triángulo', 'Triangle'], ['diamond', 'Rombo', 'Diamond'],
    ['cross', 'Cruz (×)', 'Cross (×)'], ['plus', 'Más (+)', 'Plus (+)'], ['star', 'Estrella', 'Star']];

  /* deterministic jitter in [−0.5, 0.5], so a redraw never moves the points */
  function jitterAt(i) { const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return (s - Math.floor(s)) - 0.5; }
  /* evenly spaced sample of an index range, so dense figures stay fast */
  function sampleIdx(n, max) {
    if (n <= max) return null;
    const step = n / max, idx = new Int32Array(max);
    for (let i = 0; i < max; i++) idx[i] = Math.min(n - 1, Math.round(i * step));
    return idx;
  }

  /* ---------- smoothing: a monotone-ish cubic through the points (Catmull-Rom converted to Bézier) ---------- */
  function polyline(xs, ys, smooth) {
    const n = Math.min(xs.length, ys.length); if (!n) return '';
    if (!smooth || n < 3) { let d = ''; for (let i = 0; i < n; i++) d += (i ? 'L' : 'M') + r2(xs[i]) + ',' + r2(ys[i]); return d; }
    const t = clamp(smooth, 0, 1) / 6; let d = 'M' + r2(xs[0]) + ',' + r2(ys[0]);
    for (let i = 0; i < n - 1; i++) {
      const p0 = i ? i - 1 : 0, p3 = i + 2 < n ? i + 2 : n - 1;
      d += 'C' + r2(xs[i] + (xs[i + 1] - xs[p0]) * t) + ',' + r2(ys[i] + (ys[i + 1] - ys[p0]) * t) + ' ' +
        r2(xs[i + 1] - (xs[p3] - xs[i]) * t) + ',' + r2(ys[i + 1] - (ys[p3] - ys[i]) * t) + ' ' + r2(xs[i + 1]) + ',' + r2(ys[i + 1]);
    }
    return d;
  }

  /* ================= layer computation (cached on the layer) =================
     Every layer turns its data into drawable pieces. The cache key holds only the style keys the
     piece really depends on, so moving a colour slider never recomputes a kernel density. */

  function layerData(L, st) {
    const key = cacheKey(L, st);
    if (L.__c && L.__c.key === key) return L.__c.v;
    const v = computeLayer(L, st);
    L.__c = { key, v };
    return v;
  }
  function cacheKey(L, st) {
    const g = ks => ks.map(k => st[k]).join('|');
    switch (L.t) {
      case 'hist': return 'h' + g(['binRule', 'binCount', 'binWidth', 'histY', 'cumulative']);
      case 'density': return 'd' + g(['bwRule', 'bwValue', 'bwAdjust', 'densPoints', 'densCut', 'histY']) + '|' + (L.__bw || 1);
      case 'densityG': return 'd' + g(['bwRule', 'bwValue', 'bwAdjust', 'densPoints', 'densCut', 'histY']);
      case 'normal': return 'n' + g(['densPoints', 'histY']) + '|' + (L.__bw || 1);
      case 'box': return 'b' + g(['whiskRule', 'whiskPct', 'whiskK', 'groupOrder']);
      case 'violin': return 'v' + g(['bwRule', 'bwValue', 'bwAdjust', 'densPoints', 'vioCut', 'groupOrder', 'whiskRule', 'whiskPct', 'whiskK']);
      case 'qq': return 'q' + g(['qqLine', 'qqBand', 'qqLevel', 'qqPP']);
      case 'ecdf': return 'e' + g(['groupOrder']);
      case 'ci': return 'c' + g(['ciLevel', 'ciStat', 'groupOrder']);
      default: return 'x';
    }
  }
  /* the groups of a categorical layer, in the chosen order */
  function orderedGroups(L, st) {
    const gs = (L.groups || []).map(g => {
      const x = g.__x || (g.__x = cleanValues(g.v)), s = g.__s || (g.__s = sortAsc(x));
      return { id: g.id, label: g.label, x, s, n: x.length, med: q7(s, 0.5), mean: meanOf(x) };
    }).filter(g => g.n > 0);
    const o = st.groupOrder;
    if (o === 'alpha') gs.sort((a, b) => String(lab(a.label)).localeCompare(String(lab(b.label)), undefined, { numeric: true }));
    else if (o === 'median') gs.sort((a, b) => a.med - b.med);
    else if (o === 'medianDesc') gs.sort((a, b) => b.med - a.med);
    else if (o === 'n') gs.sort((a, b) => b.n - a.n);
    return gs;
  }
  function computeLayer(L, st) {
    const gridN = clamp(+st.densPoints || 200, 32, 1000);
    if (L.t === 'hist') {
      const x = L.__x || (L.__x = cleanValues(L.v)), s = L.__s || (L.__s = sortAsc(x));
      if (!x.length) return { bars: [], edges: [0, 1] };
      const edges = binEdges(x, s, st.binRule, st.binCount, st.binWidth), c = histCounts(x, edges), w = edges[1] - edges[0], n = x.length;
      let acc = 0;
      const bars = [];
      for (let i = 0; i < c.length; i++) {
        acc += c[i];
        const v = st.cumulative ? (st.histY === 'count' ? acc : acc / n)
          : st.histY === 'count' ? c[i] : st.histY === 'prob' ? c[i] / n : c[i] / (n * w);
        bars.push({ a: edges[i], b: edges[i + 1], v, n: c[i] });
      }
      return { bars, edges, w, n };
    }
    if (L.t === 'density') {
      const x = L.__x || (L.__x = cleanValues(L.v)), s = L.__s || (L.__s = sortAsc(x));
      if (x.length < 2) return { xs: [], ys: [], h: 0 };
      const h = bandwidth(x, s, st.bwRule, st.bwValue, st.bwAdjust), cut = clamp(+st.densCut || 0, 0, 4);
      const g = linspace(s[0] - cut * h, s[x.length - 1] + cut * h, gridN), y = kdeAt(x, g, h);
      const sc = st.histY === 'count' ? x.length * (L.__bw || 1) : 1;
      return { xs: Array.from(g), ys: Array.from(y, v => v * sc), h, n: x.length };
    }
    if (L.t === 'densityG') {
      const gs = orderedGroups(L, st), out = [];
      for (const g of gs) {
        if (g.n < 2) { out.push({ id: g.id, label: g.label, xs: [], ys: [], n: g.n }); continue; }
        const h = bandwidth(g.x, g.s, st.bwRule, st.bwValue, st.bwAdjust), cut = clamp(+st.densCut || 0, 0, 4);
        const gr = linspace(g.s[0] - cut * h, g.s[g.n - 1] + cut * h, gridN), y = kdeAt(g.x, gr, h);
        out.push({ id: g.id, label: g.label, xs: Array.from(gr), ys: Array.from(y), h, n: g.n });
      }
      return { curves: out };
    }
    if (L.t === 'normal') {
      const x = L.__x || (L.__x = cleanValues(L.v)), s = L.__s || (L.__s = sortAsc(x));
      if (x.length < 2) return { xs: [], ys: [] };
      const mu = meanOf(x), sd = sdOf(x, 1) || 1, g = linspace(s[0], s[x.length - 1], gridN);
      const sc = st.histY === 'count' ? x.length * (L.__bw || 1) : 1;
      return { xs: Array.from(g), ys: Array.from(g, v => normPdf(v, mu, sd) * sc), mu, sd };
    }
    if (L.t === 'rug') {
      const x = L.__x || (L.__x = cleanValues(L.v));
      return { xs: Array.from(x) };
    }
    if (L.t === 'box' || L.t === 'violin') {
      const gs = orderedGroups(L, st), o = { rule: st.whiskRule, pct: st.whiskPct, k: st.whiskK }, out = [];
      for (const g of gs) {
        const b = boxStats(g.s, o), rec = { id: g.id, label: g.label, x: g.x, s: g.s, b };
        if (L.t === 'violin' && g.n >= 2) {
          const h = bandwidth(g.x, g.s, st.bwRule, st.bwValue, st.bwAdjust), cut = clamp(+st.vioCut == null ? 1.5 : +st.vioCut, 0, 4);
          const gr = linspace(g.s[0] - cut * h, g.s[g.n - 1] + cut * h, clamp(gridN, 32, 400));
          rec.xs = Array.from(gr); rec.ys = Array.from(kdeAt(g.x, gr, h)); rec.h = h;
          rec.peak = rec.ys.reduce((m, v) => Math.max(m, v), 0) || 1;
        }
        out.push(rec);
      }
      return { groups: out };
    }
    if (L.t === 'qq') {
      const x = L.__x || (L.__x = cleanValues(L.v)), s = L.__s || (L.__s = sortAsc(x));
      if (x.length < 3) return { th: [], s: [] };
      const q = qqData(s, { line: st.qqLine === 'ls' ? 'ls' : 'quartile', band: !!st.qqBand, level: st.qqLevel,
        pp: st.qqPP === 'auto' ? null : st.qqPP === 'filliben' ? 'filliben' : +st.qqPP });
      return { th: q.th, s, a: q.a, b: q.b, band: q.band, n: x.length };
    }
    if (L.t === 'ecdf') {
      const gs = orderedGroups(L, st);
      return { curves: gs.map(g => Object.assign({ id: g.id, label: g.label, mean: g.mean, sd: sdOf(g.x, 1) }, ecdfOf(g.s))) };
    }
    if (L.t === 'ci') {
      const gs = orderedGroups(L, st), lev = clamp(+st.ciLevel || 0.95, 0.5, 0.999), out = [];
      for (const g of gs) {
        const m = meanOf(g.x), sd = sdOf(g.x, 1), n = g.n;
        let half;
        if (st.ciStat === 'sd') half = sd;
        else if (st.ciStat === 'se') half = n > 1 ? sd / Math.sqrt(n) : 0;
        else half = n > 1 ? tPpf(1 - (1 - lev) / 2, n - 1) * sd / Math.sqrt(n) : 0;
        out.push({ id: g.id, label: g.label, m, sd, n, lo: m - half, hi: m + half, half });
      }
      return { points: out };
    }
    return {};
  }

  /* ================= domains ================= */
  const VAL_AXIS = st => st.orient === 'h' ? 'x' : 'y';          // where the values of a categorical layer go
  const isCatLayer = t => t === 'box' || t === 'violin' || t === 'ci';

  function panelDomain(panel, st) {
    let vx = [Infinity, -Infinity], vy = [Infinity, -Infinity], cat = null, catN = 0, zeroY = false, unit = false;
    const ex = (d, a, b) => { if (isFinite(a)) { d[0] = Math.min(d[0], a); d[1] = Math.max(d[1], b == null ? a : b); } };
    for (const L of panel.layers) {
      if (st.hidden && L.sid && st.hidden[L.sid]) continue;
      const D = layerData(L, st);
      if (L.t === 'hist') { if (D.bars.length) { ex(vx, D.edges[0], D.edges[D.edges.length - 1]); ex(vy, 0, D.bars.reduce((m, b) => Math.max(m, b.v), 0)); zeroY = true; } }
      else if (L.t === 'density' || L.t === 'normal') { if (D.xs.length) { ex(vx, D.xs[0], D.xs[D.xs.length - 1]); ex(vy, 0, D.ys.reduce((m, v) => Math.max(m, v), 0)); zeroY = true; } }
      else if (L.t === 'rug') { if (D.xs.length) { let a = Infinity, b = -Infinity; for (const v of D.xs) { if (v < a) a = v; if (v > b) b = v; } ex(vx, a, b); } }
      else if (L.t === 'densityG') { D.curves.forEach(c => { if (!c.xs.length || (st.hidden && st.hidden[c.id])) return; ex(vx, c.xs[0], c.xs[c.xs.length - 1]); ex(vy, 0, c.ys.reduce((m, v) => Math.max(m, v), 0)); }); zeroY = true; }
      else if (L.t === 'ecdf') { D.curves.forEach(c => { if (!c.xs.length || (st.hidden && st.hidden[c.id])) return; ex(vx, c.xs[0], c.xs[c.xs.length - 1]); }); ex(vy, 0, 1); unit = true; }
      else if (L.t === 'qq') { if (D.th.length) { ex(vx, D.th[0], D.th[D.th.length - 1]); ex(vy, D.s[0], D.s[D.s.length - 1]); if (D.band) { for (let i = 0; i < D.band.up.length; i++) { if (isFinite(D.band.up[i])) ex(vy, D.band.dn[i], D.band.up[i]); } } } }
      else if (isCatLayer(L.t)) {
        const items = L.t === 'ci' ? D.points : D.groups, vis = items.filter(g => !(st.hidden && st.hidden[g.id]));
        cat = vis.map(g => ({ id: g.id, label: g.label })); catN = vis.length;
        const d = [Infinity, -Infinity];
        vis.forEach(g => {
          if (L.t === 'ci') { d[0] = Math.min(d[0], g.lo); d[1] = Math.max(d[1], g.hi); }
          else {
            const b = g.b; d[0] = Math.min(d[0], b.lo, b.out.length ? b.out[0] : b.lo); d[1] = Math.max(d[1], b.hi, b.out.length ? b.out[b.out.length - 1] : b.hi);
            if (L.t === 'violin' && g.xs) { d[0] = Math.min(d[0], g.xs[0]); d[1] = Math.max(d[1], g.xs[g.xs.length - 1]); }
            if (st.meanMark !== 'none') { d[0] = Math.min(d[0], b.mean); d[1] = Math.max(d[1], b.mean); }
          }
        });
        if (st.orient === 'h') { ex(vx, d[0], d[1]); vy = [0.5, catN + 0.5]; }
        else { ex(vy, d[0], d[1]); vx = [0.5, catN + 0.5]; }
      }
    }
    if (!isFinite(vx[0])) vx = [0, 1];
    if (!isFinite(vy[0])) vy = [0, 1];
    return { vx, vy, cat, catN, zeroY, unit, catOn: cat ? (st.orient === 'h' ? 'y' : 'x') : null };
  }
  /* pad a value domain, honour manual limits, log and reversed axes */
  function finishAxis(d, st, ax, o) {
    let a = d[0], b = d[1];
    const log = st[ax + 'Log'], pad = clamp(+st.domPad || 0, 0, 30) / 100;
    if (a === b) { const e = Math.abs(a) > 0 ? Math.abs(a) * 0.08 : 0.5; a -= e; b += e; }
    else if (!o.cat && !o.unit) { const s = (b - a) * pad; a -= (o.zero && a === 0 ? 0 : s); b += s; }
    if (st[ax + 'Mode'] === 'manual') {
      const mn = parseFloat(st[ax + 'Min']), mx = parseFloat(st[ax + 'Max']);
      if (isFinite(mn)) a = mn; if (isFinite(mx)) b = mx;
    }
    if (log) { if (!(a > 0)) a = Math.max(b / 1e4, 1e-9); if (!(b > a)) b = a * 10; }
    if (!(b > a)) b = a + 1;
    return { a, b, log: !!log, rev: !!st[ax + 'Rev'] };
  }
  function scaleFn(d, p0, p1) {
    const f = d.log ? Math.log10 : (v => v), A = f(d.a), B = f(d.b), q0 = d.rev ? p1 : p0, q1 = d.rev ? p0 : p1;
    return v => { const t = (f(v) - A) / ((B - A) || 1); return q0 + t * (q1 - q0); };
  }
  function axisTicks(d, st, ax, o, px) {
    if (o.cat) return { ticks: o.cat.map((c, i) => i + 1), minor: [], cat: o.cat, step: 1 };
    const mode = st[ax + 'TickMode'];
    if (d.log) return logTicks(d.a, d.b);
    if (mode === 'step') { const s = parseFloat(st[ax + 'TickStep']); if (isFinite(s) && s > 0) { const t = [], f = Math.ceil(d.a / s - 1e-9) * s; for (let v = f; v <= d.b + s * 1e-9 && t.length < 400; v += s) t.push(Math.abs(v) < s * 1e-9 ? 0 : v); return { ticks: t, minor: [], step: s }; } }
    const target = mode === 'count' ? clamp(parseFloat(st[ax + 'TickCount']) || 6, 2, 30) : clamp(Math.round(px / (ax === 'x' ? 70 : 46)), 3, 12);
    const r = niceTicks(d.a, d.b, target), minor = [];
    if (st.gridMinor) for (let i = 0; i < r.ticks.length; i++) { const m = r.ticks[i] + r.step / 2; if (m > d.a && m < d.b) minor.push(m); }
    const first = r.ticks.length ? r.ticks[0] - r.step / 2 : null;
    if (st.gridMinor && first != null && first > d.a) minor.push(first);
    return { ticks: r.ticks.filter(v => v >= d.a - r.step * 1e-9 && v <= d.b + r.step * 1e-9), minor, step: r.step };
  }

  /* ================= palette of the figure (resolved plain colours) ================= */
  function inkSet(st) {
    const dark = typeof Theme !== 'undefined' && Theme.current() === 'dark';
    const paper = st.figBg === 'white' ? '#ffffff' : st.figBg === 'custom' ? asHex(st.figColor) : st.figBg === 'transparent' ? (dark ? '#0f1720' : '#ffffff') : asHex(cssVar('--card-bg', dark ? '#111a22' : '#ffffff'));
    const ink = st.inkAuto ? (lumOf(paper) > 0.5 ? '#17212b' : '#eef3f7') : asHex(st.inkColor);
    const muted = mixHex(ink, paper, 0.42);
    const plot = st.plotBg === 'paper' ? paper : st.plotBg === 'white' ? '#ffffff' : st.plotBg === 'soft' ? mixHex(paper, ink, 0.05) : st.plotBg === 'custom' ? asHex(st.plotColor) : null;
    return { dark, paper, ink, muted, plot, border: mixHex(ink, paper, 0.62), transparent: st.figBg === 'transparent' };
  }
  const serColor = (st, spec, id) => {
    if (st.serColors && st.serColors[id]) return asHex(st.serColors[id]);
    const i = spec.series.findIndex(s => s.id === id);
    return palColor(st.palette, i < 0 ? 0 : i);
  };
  const serLabel = (st, s) => (st.serLabels && st.serLabels[s.id] != null && st.serLabels[s.id] !== '') ? st.serLabels[s.id] : lab(s.label);
  const facetTitle = (st, p, i) => (st.facetTitles && st.facetTitles[p.id] != null && st.facetTitles[p.id] !== '') ? st.facetTitles[p.id] : lab(p.title);
  const txtOr = (v, d) => (v != null && v !== '') ? v : (d == null ? '' : lab(d));

  /* ================= the whole figure ================= */
  /* Returns {svg, notes:[...]}; notes are shown in the editor (for example when markers are sampled). */
  function render(spec, st, W, H) {
    const C = inkSet(st), P = [], notes = [];
    const pad = clamp(+st.padOuter, 0, 80);
    const fTitle = fontOf(st, 'title', C.ink), fSub = fontOf(st, 'subtitle', C.muted), fCap = fontOf(st, 'caption', C.muted),
      fAxT = fontOf(st, 'axisTitle', C.ink), fTick = fontOf(st, 'tick', C.muted), fLegT = fontOf(st, 'legendTitle', C.ink),
      fLeg = fontOf(st, 'legendLabel', C.ink), fVal = fontOf(st, 'value', C.ink), fFac = fontOf(st, 'facet', C.ink), fAnn = fontOf(st, 'annot', C.ink);
    P.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r2(W)} ${r2(H)}" width="${r2(W)}" height="${r2(H)}" role="img">`);
    if (!C.transparent) rect(P, 0, 0, W, H, { fill: C.paper });

    /* ---- texts and their blocks ---- */
    const title = txtOr(st.title, spec.title), subtitle = txtOr(st.subtitle, spec.subtitle), caption = txtOr(st.caption, spec.caption);
    const alignX = a => a === 'left' ? pad : a === 'right' ? W - pad : W / 2, anchorOf = a => a === 'left' ? 'start' : a === 'right' ? 'end' : 'middle';
    let top = pad, bottom = H - pad;
    if (title) { wrap(title, fTitle, W - 2 * pad).forEach(ln => { top += fTitle.size * 1.15; txtEl(P, ln, alignX(st.titleAlign), top, fTitle, { anchor: anchorOf(st.titleAlign) }); }); top += fTitle.size * 0.22; }
    if (subtitle) { wrap(subtitle, fSub, W - 2 * pad).forEach(ln => { top += fSub.size * 1.15; txtEl(P, ln, alignX(st.titleAlign), top, fSub, { anchor: anchorOf(st.titleAlign) }); }); top += fSub.size * 0.25; }
    if (title || subtitle) top += 4;
    if (caption) { const lines = wrap(caption, fCap, W - 2 * pad); for (let i = lines.length - 1; i >= 0; i--) { txtEl(P, lines[i], alignX(st.captionAlign), bottom, fCap, { anchor: anchorOf(st.captionAlign) }); bottom -= fCap.size * 1.25; } bottom -= 4; }

    /* ---- panels that are drawn ---- */
    const panels = spec.panels.filter(p => !(st.panelOff && st.panelOff[p.id]));
    panels.forEach(p => {                                        // the density and normal curves follow the histogram when counts are drawn
      const hl = p.layers.find(l => l.t === 'hist');
      if (hl) { const d = layerData(hl, st); p.layers.forEach(l => { if (l.t === 'density' || l.t === 'normal') l.__bw = st.histY === 'count' ? (d.w || 1) : 1; }); }
    });
    const nP = panels.length || 1;
    let cols = clamp(Math.round(+st.cols) || 1, 1, 8), rows = Math.ceil(nP / cols);

    /* ---- legend ---- */
    const legSeries = st.legendOn ? spec.series.filter(s => !(st.hidden && st.hidden[s.id]) && serLabel(st, s) !== '') : [];
    const legTitle = txtOr(st.legendTitle, spec.legendTitle);
    let legBox = null;
    if (legSeries.length) {
      const sw = 22, gap = 9, maxLab = Math.max(60, W - 2 * pad - sw - 10);
      const items = legSeries.map(s => { const t = clipText(serLabel(st, s), fLeg, maxLab); return { s, t, w: sw + 5 + measure(t, fLeg) }; });
      const horiz = st.legendPos === 'top' || st.legendPos === 'bottom';
      if (horiz) {
        const avail = W - 2 * pad, lines = [[]]; let cur = 0;
        items.forEach(it => { if (cur && cur + it.w + gap > avail) { lines.push([]); cur = 0; } lines[lines.length - 1].push(it); cur += it.w + gap; });
        const hh = lines.length * (fLeg.size * 1.5) + (legTitle ? fLegT.size * 1.5 : 0) + 4;
        legBox = { horiz, lines, w: avail, h: hh, x: pad, y: 0 };
        if (st.legendPos === 'top') { legBox.y = top; top += hh + 4; } else { legBox.y = bottom - hh; bottom -= hh + 4; }
      } else if (st.legendPos === 'right') {
        const ww = Math.max(...items.map(i => i.w), legTitle ? measure(legTitle, fLegT) : 0) + 12;
        legBox = { horiz: false, lines: items.map(i => [i]), w: ww, h: 0, x: W - pad - ww, y: top, side: true };
      } else legBox = { horiz: false, lines: items.map(i => [i]), w: Math.max(...items.map(i => i.w), legTitle ? measure(legTitle, fLegT) : 0) + 14, overlay: st.legendPos };
    }
    const gridRight = legBox && legBox.side ? legBox.x - 8 : W - pad;

    /* ---- axis titles of the whole figure ---- */
    const xTitle = txtOr(st.xTitle, spec.xTitle), yTitle = txtOr(st.yTitle, spec.yTitle);
    const titlesAtFigure = st.axisTitleWhere !== 'panel';
    let gx0 = pad, gy0 = top, gx1 = gridRight, gy1 = bottom;
    if (yTitle && titlesAtFigure) gx0 += fAxT.size * 1.5;
    if (xTitle && titlesAtFigure) gy1 -= fAxT.size * 1.6;

    /* ---- measure what the panels need for their tick labels ---- */
    const info = panels.map(p => {
      const o = panelDomain(p, st);
      return { p, o };
    });
    const shX = st.sharedX !== 'free' && nP > 1, shY = st.sharedY !== 'free' && nP > 1;
    const uni = (get) => { let a = Infinity, b = -Infinity; info.forEach(i => { const d = get(i.o); a = Math.min(a, d[0]); b = Math.max(b, d[1]); }); return [a, b]; };
    const shDx = shX ? uni(o => o.vx) : null, shDy = shY ? uni(o => o.vy) : null;
    info.forEach(i => {
      const o = i.o;
      i.dx = finishAxis(shDx && !o.cat ? shDx : o.vx, st, 'x', { cat: o.catOn === 'x', zero: false, unit: false });
      i.dy = finishAxis(shDy && o.catOn !== 'y' ? shDy : o.vy, st, 'y', { cat: o.catOn === 'y', zero: o.zeroY, unit: o.unit });
    });
    const gapX = clamp(+st.panelGapX, 0, 120), gapY = clamp(+st.panelGapY, 0, 120);
    /* on a narrow figure the grid drops columns by itself, so no panel is ever too small to be drawn */
    cols = gridCols(cols, gx1 - gx0, gapX); rows = Math.ceil(nP / cols);
    const cellW0 = (gx1 - gx0 - gapX * (cols - 1)) / cols, cellH0 = (gy1 - gy0 - gapY * (rows - 1)) / rows;
    const fx = { fmt: st.xFmt, dec: st.xFmt === 'auto' ? null : +st.xDec, sep: st.thouSep === 'comma' ? ',' : st.thouSep === 'space' ? ' ' : '' };
    const fy = { fmt: st.yFmt, dec: st.yFmt === 'auto' ? null : +st.yDec, sep: fx.sep };
    /* tick label texts, so their width fixes the margins */
    info.forEach(i => {
      i.tx = axisTicks(i.dx, st, 'x', { cat: i.o.catOn === 'x' ? i.o.cat : null }, Math.max(40, cellW0));
      i.ty = axisTicks(i.dy, st, 'y', { cat: i.o.catOn === 'y' ? i.o.cat : null }, Math.max(40, cellH0));
      const dX = fx.dec == null ? decForStep(i.tx.step || (i.dx.b - i.dx.a) / 6) : fx.dec, dY = fy.dec == null ? decForStep(i.ty.step || (i.dy.b - i.dy.a) / 6) : fy.dec;
      i.lx = i.tx.cat ? i.tx.cat.map(c => serLabel(st, c)) : i.tx.ticks.map(v => fmtVal(v, { fmt: st.xFmt, dec: dX, sep: fx.sep }));
      i.ly = i.ty.cat ? i.ty.cat.map(c => serLabel(st, c)) : i.ty.ticks.map(v => fmtVal(v, { fmt: st.yFmt, dec: dY, sep: fy.sep }));
    });
    const tickLen = clamp(+st.tickLen, 0, 14), tOut = st.tickSide === 'out' || st.tickSide === 'both' ? tickLen : 0;
    const showTickLab = st.tickSide !== 'none', showX = showTickLab && st.xLabels !== false, showY = showTickLab && st.yLabels !== false;
    const yLabW = showY ? Math.max(...info.map(i => Math.max(0, ...i.ly.map(s => measure(s, fTick))))) : 0;
    /* rotation of the category labels on the x axis */
    let rot = 0;
    const xMaxW = Math.max(0, ...info.map(i => Math.max(0, ...i.lx.map(s => measure(s, fTick)))));
    const slots = Math.max(1, Math.max(...info.map(i => i.lx.length)));
    if (st.catRotate === 'auto') rot = (xMaxW > (cellW0 - 12) / slots * 0.96) ? (xMaxW > cellW0 / slots * 2.2 ? 55 : 35) : 0;
    else rot = clamp(+st.catRotate || 0, 0, 90);
    const xLabH = !showX ? 0 : rot ? Math.min(cellH0 * 0.5, Math.sin(rot * Math.PI / 180) * xMaxW + fTick.size * 0.7) : fTick.size * 1.25;
    const extraT = titlesAtFigure ? 0 : fAxT.size * 1.5;
    const mL = (showY ? yLabW + 6 : 2) + tOut + (yTitle ? extraT : 0), mB = (showX ? xLabH + 4 : 2) + tOut + (xTitle ? extraT : 0),
      mR = 6 + (st.padInner || 0), mT = 4 + (st.facetOn && nP > 1 ? fFac.size * 1.5 : 0);
    const cellW = cellW0, cellH = cellH0;

    /* ---- draw every panel ---- */
    const rectsOf = [];
    info.forEach((i, k) => {
      const cx = k % cols, cy = Math.floor(k / cols);
      const x0 = gx0 + cx * (cellW + gapX) + mL, y0 = gy0 + cy * (cellH + gapY) + mT;
      const x1 = gx0 + cx * (cellW + gapX) + cellW - mR, y1 = gy0 + cy * (cellH + gapY) + cellH - mB;
      const R = { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, lastRow: cy === rows - 1 || k + cols >= info.length, firstCol: cx === 0 };
      i.R = R; rectsOf.push(R);
      if (!(R.w > 4 && R.h > 4)) return;
      const sx = scaleFn(i.dx, x0, x1), sy = scaleFn(i.dy, y1, y0);
      i.sx = sx; i.sy = sy;
      if (C.plot) rect(P, x0, y0, R.w, R.h, { fill: C.plot });
      /* grid */
      const gc = st.gridColor ? asHex(st.gridColor) : C.border, gw = clamp(+st.gridW, 0.2, 4), gd = dashOf(st.gridDash), ga = clamp(+st.gridAlpha, 0, 1);
      if (st.gridY) { i.ty.ticks.forEach(v => { const y = sy(v); if (y >= y0 - 0.5 && y <= y1 + 0.5) line(P, x0, y, x1, y, { stroke: gc, lw: gw, dash: gd, op: ga }); });
        (i.ty.minor || []).forEach(v => { const y = sy(v); if (y > y0 && y < y1) line(P, x0, y, x1, y, { stroke: gc, lw: gw * 0.7, dash: gd, op: ga * 0.5 }); }); }
      if (st.gridX) { i.tx.ticks.forEach(v => { const x = sx(v); if (x >= x0 - 0.5 && x <= x1 + 0.5) line(P, x, y0, x, y1, { stroke: gc, lw: gw, dash: gd, op: ga }); });
        (i.tx.minor || []).forEach(v => { const x = sx(v); if (x > x0 && x < x1) line(P, x, y0, x, y1, { stroke: gc, lw: gw * 0.7, dash: gd, op: ga * 0.5 }); }); }
      /* zero line */
      if (st.zeroLine) {
        const zc = st.zeroColor ? asHex(st.zeroColor) : C.muted;
        if (!i.dy.log && i.dy.a <= 0 && i.dy.b >= 0) line(P, x0, sy(0), x1, sy(0), { stroke: zc, lw: clamp(+st.axisW, 0.3, 4), op: 0.85 });
        if (!i.dx.log && i.o.catOn !== 'x' && i.dx.a <= 0 && i.dx.b >= 0) line(P, sx(0), y0, sx(0), y1, { stroke: zc, lw: clamp(+st.axisW, 0.3, 4), op: 0.85 });
      }
      drawLayers(P, i, spec, st, C, R, notes, fVal);
      /* spines */
      const ac = st.axisColor ? asHex(st.axisColor) : C.border, aw = clamp(+st.axisW, 0.3, 4);
      const sp = st.spines;
      if (sp === 'box') rect(P, x0, y0, R.w, R.h, { stroke: ac, lw: aw });
      else if (sp !== 'none') { line(P, x0, y1, x1, y1, { stroke: ac, lw: aw }); line(P, x0, y0, x0, y1, { stroke: ac, lw: aw }); if (sp === 'lbt') line(P, x0, y0, x1, y0, { stroke: ac, lw: aw }); }
      /* ticks and their labels */
      const tIn = st.tickSide === 'in' || st.tickSide === 'both' ? tickLen : 0;
      const labX = showX && (!shX || R.lastRow || st.sharedX === 'all'), labY = showY && (!shY || R.firstCol || st.sharedY === 'all');
      i.tx.ticks.forEach((v, j) => {
        const x = sx(v); if (x < x0 - 1 || x > x1 + 1) return;
        if (tickLen && sp !== 'none') line(P, x, y1 - tIn, x, y1 + tOut, { stroke: ac, lw: aw });
        if (!labX) return;
        if (rot) txtEl(P, i.lx[j], x + fTick.size * 0.18, y1 + tOut + fTick.size * 0.92, fTick, { anchor: 'end', rot: -rot });
        else txtEl(P, i.lx[j], x, y1 + tOut + fTick.size * 1.05, fTick, { anchor: 'middle' });
      });
      i.ty.ticks.forEach((v, j) => {
        const y = sy(v); if (y < y0 - 1 || y > y1 + 1) return;
        if (tickLen && sp !== 'none') line(P, x0 - tOut, y, x0 + tIn, y, { stroke: ac, lw: aw });
        if (labY) txtEl(P, i.ly[j], x0 - tOut - 4, y + fTick.size * 0.36, fTick, { anchor: 'end' });
      });
      if (st.facetOn && nP > 1) {
        const ft = clipText(facetTitle(st, i.p, k), fFac, R.w + mL - 4);
        if (ft) txtEl(P, ft, st.facetAlign === 'left' ? x0 : (x0 + x1) / 2, y0 - fFac.size * 0.5, fFac, { anchor: st.facetAlign === 'left' ? 'start' : 'middle' });
      }
      /* axis titles inside the panel when every panel has its own */
      if (st.axisTitleWhere === 'panel') {
        const px = i.p.xTitle != null ? lab(i.p.xTitle) : xTitle, py = i.p.yTitle != null ? lab(i.p.yTitle) : yTitle;
        if (px && R.lastRow) txtEl(P, px, (x0 + x1) / 2, y1 + tOut + xLabH + fAxT.size * 1.05, fAxT, { anchor: 'middle' });
        if (py) txtEl(P, py, x0 - tOut - yLabW - 8, (y0 + y1) / 2, fAxT, { anchor: 'middle', rot: -90 });
      }
    });
    /* axis titles of the whole figure */
    if (st.axisTitleWhere !== 'panel') {
      if (xTitle) txtEl(P, xTitle, (gx0 + gx1) / 2, gy1 + fAxT.size * 1.15, fAxT, { anchor: 'middle' });
      if (yTitle) txtEl(P, yTitle, pad + fAxT.size * 0.85, (gy0 + gy1) / 2, fAxT, { anchor: 'middle', rot: -90 });
    }
    /* annotations */
    drawAnnots(P, info, st, C, fAnn);
    /* legend on top of everything */
    if (legBox) drawLegend(P, legBox, legSeries, legTitle, spec, st, C, fLeg, fLegT, rectsOf, W, H, pad);
    P.push('</svg>');
    return { svg: P.join(''), notes, info };
  }

  /* shortens a text with an ellipsis so it never spills out of the space it was given */
  function clipText(s, f, maxW) {
    s = String(s == null ? '' : s);
    if (!s || maxW <= 0 || measure(s, f) <= maxW) return s;
    let lo = 0, hi = s.length;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (measure(s.slice(0, m) + '…', f) <= maxW) lo = m; else hi = m - 1; }
    return lo > 0 ? s.slice(0, lo) + '…' : '';
  }
  /* how many columns really fit: at least 130 px of drawing per panel */
  const gridCols = (want, availW, gap) => clamp(Math.min(want, Math.max(1, Math.floor((availW + gap) / (130 + gap)))), 1, 8);
  function wrap(s, f, maxW) {
    const words = String(s).split(/\s+/).filter(Boolean), out = []; let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (cur && measure(t, f) > maxW) { out.push(cur); cur = w; } else cur = t; }
    if (cur) out.push(cur);
    return out.length ? out : [''];
  }

  /* ---------- the layers of one panel ---------- */
  function drawLayers(P, i, spec, st, C, R, notes, fVal) {
    const { sx, sy } = i, x0 = R.x0, y1 = R.y1, x1 = R.x1;
    const order = (st.order && st.order.length) ? st.order : null;
    const layers = i.p.layers.slice();
    if (order) layers.sort((a, b) => (order.indexOf(a.sid) + 1 || 99) - (order.indexOf(b.sid) + 1 || 99));
    const fa = clamp(+st.fillAlpha, 0, 1), lw = clamp(+st.lineW, 0.2, 8), dash = dashOf(st.lineDash), sm = clamp(+st.smooth, 0, 1);
    const maxPts = clamp(+st.maxPts || 4000, 200, 60000);
    const valOn = st.valLabels && st.valLabels !== 'none';

    for (const L of layers) {
      if (L.sid && st.hidden && st.hidden[L.sid]) continue;
      const D = layerData(L, st);
      const col = id => serColor(st, spec, id);

      if (L.t === 'hist') {
        const c = col(L.sid), gap = clamp(+st.barGap, 0, 0.6), ow = clamp(+st.barOutlineW, 0, 3);
        const oc = st.barOutline === 'series' ? c : st.barOutline === 'ink' ? C.ink : st.barOutline === 'custom' ? asHex(st.barOutlineColor) : C.paper;
        let d = '';
        D.bars.forEach(b => {
          if (!(b.v > 0)) return;
          const a = sx(b.a), bb = sx(b.b), g = Math.min(Math.abs(bb - a) * gap / 2, Math.abs(bb - a) / 2 - 0.2);
          const xa = Math.min(a, bb) + g, w = Math.abs(bb - a) - 2 * g, yv = sy(Math.max(b.v, i.dy.a)), yb = sy(Math.max(i.dy.a, 0));
          if (!(w > 0)) return;
          d += `M${r2(xa)},${r2(yb)}V${r2(yv)}H${r2(xa + w)}V${r2(yb)}z`;
        });
        path(P, d, { fill: c, fa, stroke: ow > 0 ? oc : null, lw: ow });
        if (valOn) D.bars.forEach(b => { if (b.v > 0) txtEl(P, fmtVal(st.histY === 'count' ? b.n : b.v, { fmt: 'auto', dec: st.histY === 'count' ? 0 : 3 }), (sx(b.a) + sx(b.b)) / 2, sy(b.v) - 3, fVal, { anchor: 'middle' }); });
      } else if (L.t === 'density' || L.t === 'normal') {
        const c = col(L.sid), xs = D.xs.map(sx), ys = D.ys.map(sy);
        const d = polyline(xs, ys, L.t === 'density' ? sm : 0);
        if (L.t === 'density' && st.densFill > 0 && d) path(P, d + `L${r2(xs[xs.length - 1])},${r2(sy(Math.max(i.dy.a, 0)))}L${r2(xs[0])},${r2(sy(Math.max(i.dy.a, 0)))}z`, { fill: c, fa: clamp(+st.densFill, 0, 1) });
        path(P, d, { stroke: c, lw: L.t === 'normal' ? lw * 0.85 : lw, dash: L.t === 'normal' ? dashOf(st.normalDash) : dash });
      } else if (L.t === 'rug') {
        const c = col(L.sid), h = clamp(+st.rugH, 1, 40), idx = sampleIdx(D.xs.length, maxPts);
        if (idx) notes.push({ es: `Franja de datos: se dibujan ${idx.length} de ${D.xs.length} valores (muestreo uniforme).`, en: `Rug plot: ${idx.length} of ${D.xs.length} values are drawn (even sampling).` });
        let d = ''; const n = idx ? idx.length : D.xs.length;
        for (let k = 0; k < n; k++) { const v = D.xs[idx ? idx[k] : k], x = sx(v); if (x >= x0 - 1 && x <= x1 + 1) d += `M${r2(x)},${r2(y1)}V${r2(y1 - h)}`; }
        path(P, d, { stroke: c, lw: clamp(+st.rugW, 0.3, 3), op: clamp(+st.rugAlpha, 0.05, 1) });
      } else if (L.t === 'densityG') {
        D.curves.forEach(cv => {
          if (st.hidden && st.hidden[cv.id]) return;
          const c = col(cv.id), xs = cv.xs.map(sx), ys = cv.ys.map(sy), d = polyline(xs, ys, sm);
          if (st.densFill > 0 && d) path(P, d + `L${r2(xs[xs.length - 1])},${r2(sy(Math.max(i.dy.a, 0)))}L${r2(xs[0])},${r2(sy(Math.max(i.dy.a, 0)))}z`, { fill: c, fa: clamp(+st.densFill, 0, 1) });
          path(P, d, { stroke: c, lw, dash });
        });
      } else if (L.t === 'ecdf') {
        D.curves.forEach(cv => {
          if (st.hidden && st.hidden[cv.id]) return;
          const c = col(cv.id), xs = [], ys = [];
          if (st.ecdfStep === 'point') { cv.xs.forEach((v, k) => { xs.push(sx(v)); ys.push(sy(cv.ys[k])); }); }
          else { let prev = 0; cv.xs.forEach((v, k) => { xs.push(sx(v)); ys.push(sy(prev)); xs.push(sx(v)); ys.push(sy(cv.ys[k])); prev = cv.ys[k]; }); }
          path(P, polyline(xs, ys, st.ecdfStep === 'point' ? sm : 0), { stroke: c, lw, dash });
          if (st.ecdfNormal && cv.sd > 0) {
            const g = linspace(i.dx.a, i.dx.b, 160);
            path(P, polyline(Array.from(g, sx), Array.from(g, v => sy(normCdf((v - cv.mean) / cv.sd)))), { stroke: c, lw: lw * 0.8, dash: dashOf(st.normalDash), op: 0.8 });
          }
        });
      } else if (L.t === 'qq') {
        const c = col(L.sid), n = D.th.length, idx = sampleIdx(n, maxPts);
        if (idx) notes.push({ es: `Gráfico Q–Q: se dibujan ${idx.length} de ${n} puntos (muestreo uniforme).`, en: `Q–Q plot: ${idx.length} of ${n} points are drawn (even sampling).` });
        if (D.band) {
          let up = '', dn = '';
          const ux = [], uy = [], dx2 = [], dy2 = [];
          for (let k = 0; k < n; k++) { if (!isFinite(D.band.up[k])) continue; ux.push(sx(D.th[k])); uy.push(sy(D.band.up[k])); }
          for (let k = n - 1; k >= 0; k--) { if (!isFinite(D.band.dn[k])) continue; dx2.push(sx(D.th[k])); dy2.push(sy(D.band.dn[k])); }
          up = polyline(ux, uy, 0); dn = polyline(dx2, dy2, 0);
          if (up && dn) path(P, up + dn.replace(/^M/, 'L') + 'z', { fill: c, fa: 0.13 });
          path(P, up, { stroke: c, lw: lw * 0.6, dash: '3 3', op: 0.7 }); path(P, dn, { stroke: c, lw: lw * 0.6, dash: '3 3', op: 0.7 });
        }
        drawMarkers(P, idx ? Array.from(idx, k => sx(D.th[k])) : Array.from(D.th, sx), idx ? Array.from(idx, k => sy(D.s[k])) : Array.from(D.s, sy), c, st, clamp(+st.qqPtSize, 0.5, 12));
        if (st.qqLine !== 'none') {
          const a = i.dx.a, b = i.dx.b;
          path(P, `M${r2(sx(a))},${r2(sy(D.a + D.b * a))}L${r2(sx(b))},${r2(sy(D.a + D.b * b))}`, { stroke: st.qqLineColor ? asHex(st.qqLineColor) : C.ink, lw, dash: dashOf(st.qqLineDash) });
        }
      } else if (L.t === 'box' || L.t === 'violin') {
        drawBoxLike(P, L, D, i, spec, st, C, R, notes, fVal);
      } else if (L.t === 'ci') {
        const horiz = st.orient === 'h', cap = clamp(+st.ciCap, 0, 20), lwc = clamp(+st.ciW, 0.3, 6);
        D.points.forEach((g, k) => {
          if (st.hidden && st.hidden[g.id]) return;
          const c = col(g.id), pos = horiz ? sy(k + 1) : sx(k + 1);
          if (horiz) { line(P, sx(g.lo), pos, sx(g.hi), pos, { stroke: c, lw: lwc }); if (cap) { line(P, sx(g.lo), pos - cap / 2, sx(g.lo), pos + cap / 2, { stroke: c, lw: lwc }); line(P, sx(g.hi), pos - cap / 2, sx(g.hi), pos + cap / 2, { stroke: c, lw: lwc }); } drawMarkers(P, [sx(g.m)], [pos], c, st, clamp(+st.markerSize, 1, 14)); }
          else { line(P, pos, sy(g.lo), pos, sy(g.hi), { stroke: c, lw: lwc }); if (cap) { line(P, pos - cap / 2, sy(g.lo), pos + cap / 2, sy(g.lo), { stroke: c, lw: lwc }); line(P, pos - cap / 2, sy(g.hi), pos + cap / 2, sy(g.hi), { stroke: c, lw: lwc }); } drawMarkers(P, [pos], [sy(g.m)], c, st, clamp(+st.markerSize, 1, 14)); }
          if (valOn) { const t = fmtVal(g.m, { fmt: 'auto', dec: 2 }); if (horiz) txtEl(P, t, sx(g.hi) + 5, pos + fVal.size * 0.35, fVal); else txtEl(P, t, pos + clamp(+st.markerSize, 1, 14) + 4, sy(g.m) + fVal.size * 0.35, fVal); }
        });
      }
    }
  }

  function drawMarkers(P, xs, ys, c, st, r) {
    const shape = st.marker || 'circle', ow = clamp(+st.markerOutlineW, 0, 3), a = clamp(+st.markerAlpha, 0.03, 1);
    if (isStrokeShape(shape)) { let d = ''; for (let k = 0; k < xs.length; k++) d += markerStrokeD(shape, xs[k], ys[k], r); path(P, d, { stroke: c, lw: Math.max(0.6, r * 0.42), op: a }); return; }
    let d = ''; for (let k = 0; k < xs.length; k++) d += markerD(shape, xs[k], ys[k], r);
    path(P, d, { fill: c, fa: a, stroke: ow > 0 ? (st.markerOutlineColor ? asHex(st.markerOutlineColor) : '#ffffff') : null, lw: ow });
  }

  /* box plots and violins share their geometry: a position axis (categories) and a value axis */
  function drawBoxLike(P, L, D, i, spec, st, C, R, notes, fVal) {
    const horiz = st.orient === 'h', { sx, sy } = i;
    const pos = k => horiz ? sy(k + 1) : sx(k + 1), val = v => horiz ? sx(v) : sy(v);
    /* the slot of one group; with very few groups it is capped, so a single box does not fill the panel */
    const span = horiz ? R.h : R.w, slot = Math.min(span / Math.max(1, D.groups.length), span * 0.4);
    const bw = slot * clamp(+st.boxW, 0.05, 1), vw = slot * clamp(+st.vioW, 0.05, 1.2);
    const fa = clamp(+st.fillAlpha, 0, 1), lw = clamp(+st.lineW, 0.2, 8), maxPts = clamp(+st.maxPts || 4000, 200, 60000);
    const ink = st.boxInk ? asHex(st.boxInk) : C.ink, valOn = st.valLabels && st.valLabels !== 'none';
    let vis = 0;
    D.groups.forEach((g, k0) => {
      if (st.hidden && st.hidden[g.id]) return;
      const k = vis++, c = serColor(st, spec, g.id), p = pos(k), b = g.b;
      if (L.t === 'violin' && g.xs) {
        const half = st.vioHalf, pk = g.peak || 1, w = vw / 2;
        const a = [], bb = [];
        for (let j = 0; j < g.xs.length; j++) { const off = g.ys[j] / pk * w, v = val(g.xs[j]); a.push([v, p - (half === 'right' ? 0 : off)]); bb.push([v, p + (half === 'left' ? 0 : off)]); }
        let d = '';
        a.forEach((q, j) => { d += (j ? 'L' : 'M') + r2(horiz ? q[0] : q[1]) + ',' + r2(horiz ? q[1] : q[0]); });
        for (let j = bb.length - 1; j >= 0; j--) { const q = bb[j]; d += 'L' + r2(horiz ? q[0] : q[1]) + ',' + r2(horiz ? q[1] : q[0]); }
        path(P, d + 'z', { fill: c, fa, stroke: ink, lw: lw * 0.8 });
      }
      const drawBox = L.t === 'box' || st.vioInner === 'box';
      if (drawBox) {
        const w = (L.t === 'violin' ? Math.min(bw, vw * 0.28) : bw) / 2;
        const q1 = val(b.q1), q3 = val(b.q3), med = val(b.med);
        /* whiskers */
        if (st.whiskRule !== 'none') {
          line(P, horiz ? val(b.lo) : p, horiz ? p : val(b.lo), horiz ? q1 : p, horiz ? p : q1, { stroke: ink, lw: lw * 0.9 });
          line(P, horiz ? val(b.hi) : p, horiz ? p : val(b.hi), horiz ? q3 : p, horiz ? p : q3, { stroke: ink, lw: lw * 0.9 });
          const cw = w * clamp(+st.capW, 0, 1.2);
          if (cw > 0.5) {
            if (horiz) { line(P, val(b.lo), p - cw, val(b.lo), p + cw, { stroke: ink, lw: lw * 0.9 }); line(P, val(b.hi), p - cw, val(b.hi), p + cw, { stroke: ink, lw: lw * 0.9 }); }
            else { line(P, p - cw, val(b.lo), p + cw, val(b.lo), { stroke: ink, lw: lw * 0.9 }); line(P, p - cw, val(b.hi), p + cw, val(b.hi), { stroke: ink, lw: lw * 0.9 }); }
          }
        }
        if (st.notch) {
          const nl = val(Math.max(b.notchLo, b.q1)), nh = val(Math.min(b.notchHi, b.q3)), wn = w * 0.55;
          const pts = horiz
            ? [[q1, p - w], [nl, p - w], [med, p - wn], [nh, p - w], [q3, p - w], [q3, p + w], [nh, p + w], [med, p + wn], [nl, p + w], [q1, p + w]]
            : [[p - w, q1], [p - w, nl], [p - wn, med], [p - w, nh], [p - w, q3], [p + w, q3], [p + w, nh], [p + wn, med], [p + w, nl], [p + w, q1]];
          let d = ''; pts.forEach((q, j) => { d += (j ? 'L' : 'M') + r2(horiz ? q[0] : q[0]) + ',' + r2(horiz ? q[1] : q[1]); });
          path(P, d + 'z', { fill: c, fa, stroke: ink, lw });
          if (horiz) line(P, med, p - wn, med, p + wn, { stroke: st.medColor ? asHex(st.medColor) : ink, lw: lw * 1.5 });
          else line(P, p - wn, med, p + wn, med, { stroke: st.medColor ? asHex(st.medColor) : ink, lw: lw * 1.5 });
        } else {
          if (horiz) rect(P, Math.min(q1, q3), p - w, Math.abs(q3 - q1), 2 * w, { fill: c, fa, stroke: ink, lw });
          else rect(P, p - w, Math.min(q1, q3), 2 * w, Math.abs(q3 - q1), { fill: c, fa, stroke: ink, lw });
          if (horiz) line(P, med, p - w, med, p + w, { stroke: st.medColor ? asHex(st.medColor) : ink, lw: lw * 1.6 });
          else line(P, p - w, med, p + w, med, { stroke: st.medColor ? asHex(st.medColor) : ink, lw: lw * 1.6 });
        }
      } else if (L.t === 'violin' && (st.vioInner === 'quart' || st.vioInner === 'stick')) {
        const w = vw * 0.5;
        const put = (v, k2, dsh) => horiz ? line(P, val(v), p - w * k2, val(v), p + w * k2, { stroke: ink, lw: lw * 0.9, dash: dsh }) : line(P, p - w * k2, val(v), p + w * k2, val(v), { stroke: ink, lw: lw * 0.9, dash: dsh });
        if (st.vioInner === 'quart') { put(b.q1, 0.5, '4 3'); put(b.q3, 0.5, '4 3'); put(b.med, 0.7, ''); }
        else { if (horiz) line(P, val(b.lo), p, val(b.hi), p, { stroke: ink, lw: lw * 0.9 }); else line(P, p, val(b.lo), p, val(b.hi), { stroke: ink, lw: lw * 0.9 }); put(b.med, 0.35, ''); }
      }
      /* individual points */
      if (st.jitterPts && st.jitterPts !== 'none') {
        const n = g.x.length, idx = sampleIdx(n, maxPts), m = idx ? idx.length : n, jw = slot * clamp(+st.jitterW, 0, 0.9) / 2, xs = [], ys = [];
        if (idx) notes.push({ es: `Puntos individuales: se dibujan ${m} de ${n} en cada grupo grande (muestreo uniforme).`, en: `Individual points: ${m} of ${n} are drawn in each large group (even sampling).` });
        for (let j = 0; j < m; j++) {
          const v = g.x[idx ? idx[j] : j], off = st.jitterPts === 'strip' ? 0 : jitterAt(j * 7 + k * 101) * 2 * jw;
          if (horiz) { xs.push(val(v)); ys.push(p + off); } else { xs.push(p + off); ys.push(val(v)); }
        }
        drawMarkers(P, xs, ys, st.jitterColor ? asHex(st.jitterColor) : c, Object.assign({}, st, { markerAlpha: clamp(+st.jitterAlpha, 0.02, 1), markerOutlineW: 0 }), clamp(+st.ptSize, 0.4, 10));
      }
      /* outliers */
      if (st.outlierMark !== 'none' && b.out.length) {
        const xs = [], ys = [], idx = sampleIdx(b.out.length, maxPts);
        const m = idx ? idx.length : b.out.length;
        for (let j = 0; j < m; j++) { const v = b.out[idx ? idx[j] : j]; if (horiz) { xs.push(val(v)); ys.push(p); } else { xs.push(p); ys.push(val(v)); } }
        drawMarkers(P, xs, ys, st.outlierColor ? asHex(st.outlierColor) : ink, Object.assign({}, st, { marker: st.outlierMark, markerAlpha: clamp(+st.outlierAlpha, 0.05, 1) }), clamp(+st.outlierSize, 0.5, 10));
      }
      /* mean marker */
      if (st.meanMark && st.meanMark !== 'none') {
        const r = clamp(+st.meanSize, 1, 14);
        drawMarkers(P, [horiz ? val(b.mean) : p], [horiz ? p : val(b.mean)], st.meanColor ? asHex(st.meanColor) : ink,
          Object.assign({}, st, { marker: st.meanMark, markerAlpha: 1, markerOutlineW: 1, markerOutlineColor: C.paper }), r);
      }
      if (valOn) {
        const t = fmtVal(st.valLabels === 'mean' ? b.mean : b.med, { fmt: 'auto', dec: 2 });
        if (horiz) txtEl(P, t, val(b.hi) + 5, p + fVal.size * 0.35, fVal);
        else txtEl(P, t, p + (L.t === 'violin' ? vw / 2 : bw / 2) + 4, val(b.med) + fVal.size * 0.35, fVal);
      }
    });
  }

  /* ---------- legend ---------- */
  function drawLegend(P, B, series, title, spec, st, C, fLeg, fLegT, rects, W, H, pad) {
    const sw = 22, gap = 9, lh = fLeg.size * 1.5;
    let x = B.x, y = B.y;
    if (B.overlay) {
      const R = rects[rects.length - 1] || { x0: pad, y0: pad, x1: W - pad, y1: H - pad };
      const h = series.length * lh + (title ? fLegT.size * 1.5 : 0) + 10, w = B.w;
      x = /l$/.test(B.overlay) || /^tl|bl$/.test(B.overlay) ? R.x0 + 8 : R.x1 - w - 8;
      y = B.overlay[0] === 't' ? R.y0 + 8 : R.y1 - h - 8;
      if (st.legendBox !== 'none') rect(P, x, y, w, h, { fill: st.legendBox === 'dark' ? '#111a22' : C.paper, fa: clamp(+st.legendBoxAlpha, 0.1, 1), stroke: st.legendBox === 'outline' ? C.border : null, lw: 1, rx: 6 });
      x += 8; y += 8;
    } else if (B.side) {
      if (st.legendBox !== 'none') {
        const h = series.length * lh + (title ? fLegT.size * 1.5 : 0) + 10;
        rect(P, x, y, B.w, h, { fill: st.legendBox === 'dark' ? '#111a22' : C.paper, fa: clamp(+st.legendBoxAlpha, 0.1, 1), stroke: st.legendBox === 'outline' ? C.border : null, lw: 1, rx: 6 });
        x += 6; y += 6;
      }
    }
    if (title) { txtEl(P, clipText(title, fLegT, Math.max(40, W - 2 * pad)), x, y + fLegT.size, fLegT); y += fLegT.size * 1.5; }
    B.lines.forEach(ln => {
      let cx = B.horiz && st.legendAlign === 'center' ? (W - ln.reduce((s, it) => s + it.w + gap, -gap)) / 2 : x;
      ln.forEach(it => {
        swatch(P, it.s, cx, y + lh * 0.5, sw, st, spec, C);
        txtEl(P, it.t, cx + sw + 5, y + lh * 0.5 + fLeg.size * 0.36, fLeg);
        cx += it.w + gap;
      });
      y += lh;
    });
  }
  function swatch(P, s, x, y, w, st, spec, C) {
    const c = serColor(st, spec, s.id), k = s.swatch || 'bar';
    if (k === 'line') path(P, `M${r2(x)},${r2(y)}H${r2(x + w)}`, { stroke: c, lw: clamp(+st.lineW, 0.2, 8), dash: dashOf(st.lineDash) });
    else if (k === 'marker') drawMarkers(P, [x + w / 2], [y], c, Object.assign({}, st, { markerAlpha: 1 }), Math.min(5, w / 3));
    else rect(P, x, y - 5, w, 10, { fill: c, fa: clamp(+st.fillAlpha, 0.15, 1), stroke: C.ink, lw: 0.7 });
  }

  /* ---------- annotations ---------- */
  function drawAnnots(P, info, st, C, fAnn) {
    (st.annots || []).forEach(A => {
      const list = A.panel === '*' ? info : info.filter((i, k) => String(k) === String(A.panel) || i.p.id === A.panel);
      list.forEach(i => {
        if (!i.sx) return;
        const R = i.R, f = Object.assign({}, fAnn, { fill: A.color ? asHex(A.color) : fAnn.fill, size: A.size > 0 ? A.size * clamp(+st.textScale || 1, 0.4, 4) : fAnn.size });
        const col = A.color ? asHex(A.color) : C.muted, lw = clamp(+A.lw || 1, 0.3, 5), dsh = dashOf(A.dash || 'dash');
        if (A.kind === 'hline' && isFinite(+A.y)) {
          const y = i.sy(+A.y); if (y < R.y0 - 2 || y > R.y1 + 2) return;
          line(P, R.x0, y, R.x1, y, { stroke: col, lw, dash: dsh });
          if (A.text) txtEl(P, A.text, R.x1 - 4, y - 4, f, { anchor: 'end' });
        } else if (A.kind === 'vline' && isFinite(+A.x)) {
          const x = i.sx(+A.x); if (x < R.x0 - 2 || x > R.x1 + 2) return;
          line(P, x, R.y0, x, R.y1, { stroke: col, lw, dash: dsh });
          if (A.text) txtEl(P, A.text, x + 4, R.y0 + f.size, f);
        } else if (A.kind === 'diag') {
          const a = isFinite(+A.a) ? +A.a : 0, b = isFinite(+A.b) ? +A.b : 1;
          line(P, i.sx(i.dx.a), i.sy(a + b * i.dx.a), i.sx(i.dx.b), i.sy(a + b * i.dx.b), { stroke: col, lw, dash: dsh });
          if (A.text) txtEl(P, A.text, i.sx(i.dx.b) - 4, i.sy(a + b * i.dx.b) - 4, f, { anchor: 'end' });
        } else {
          const atData = A.at === 'data' && isFinite(+A.x) && isFinite(+A.y);
          const px = atData ? i.sx(+A.x) : R.x0 + (clamp(+A.fx, 0, 1) || 0.5) * R.w, py = atData ? i.sy(+A.y) : R.y0 + (clamp(+A.fy, 0, 1) || 0.1) * R.h;
          const dx = +A.dx || 0, dy = +A.dy || 0;
          if (A.arrow && (dx || dy)) {
            line(P, px + dx, py + dy, px, py, { stroke: col, lw });
            const ang = Math.atan2(py - (py + dy), px - (px + dx)), h = 5;
            path(P, `M${r2(px)},${r2(py)}L${r2(px - h * Math.cos(ang - 0.4))},${r2(py - h * Math.sin(ang - 0.4))}L${r2(px - h * Math.cos(ang + 0.4))},${r2(py - h * Math.sin(ang + 0.4))}z`, { fill: col });
          }
          if (A.text) txtEl(P, A.text, px + dx, py + dy - 2, f, { anchor: dx < 0 ? 'end' : dx > 0 ? 'start' : 'middle' });
        }
      });
    });
  }

  /* ================= export ================= */
  const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  /* writes the physical resolution (pHYs chunk) into a PNG, so print programs place it at the right size */
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
    j85: { mm: [85, 70], es: 'Revista, 1 columna (85 mm)', en: 'Journal, single column (85 mm)' },
    j180: { mm: [180, 120], es: 'Revista, 2 columnas (180 mm)', en: 'Journal, double column (180 mm)' },
    slide: { px: [1280, 720], es: 'Diapositiva 16:9', en: 'Slide 16:9' }, square: { px: [900, 900], es: 'Cuadrado', en: 'Square' },
    custom: { es: 'Personalizado…', en: 'Custom…' },
  };
  function sizeSpec(ex) {
    if (ex.size === 'custom') {
      const w = clamp(+ex.cw || 1, 1, 20000), h = clamp(+ex.ch || 1, 1, 20000);
      return ex.cunit === 'mm' ? { mm: [w, h], custom: 'mm' } : { px: [Math.round(w), Math.round(h)], custom: 'px' };
    }
    return SIZES[ex.size] || SIZES.shown;
  }
  /* layout size in CSS pixels (that fixes the relative size of the text) and the pixel scale of the output */
  function planExport(cur, ex) {
    const sz = sizeSpec(ex);
    let W, H, k;
    if (sz.mm) { W = Math.round(sz.mm[0] / 25.4 * 96); H = Math.round(sz.mm[1] / 25.4 * 96); k = ex.dpi / 96; }
    else if (sz.px) { W = sz.px[0]; H = sz.px[1]; k = sz.custom ? 1 : ex.factor; }
    else { W = cur[0]; H = cur[1]; k = ex.factor; }
    let limited = false;
    while ((W * k > 16000 || H * k > 16000 || W * k * H * k > 100e6) && k > 0.2) { k *= 0.9; limited = true; }
    const exact = !!sz.mm && !limited;
    const outW = exact ? Math.round(sz.mm[0] / 25.4 * ex.dpi) : Math.round(W * k), outH = exact ? Math.round(sz.mm[1] / 25.4 * ex.dpi) : Math.round(H * k);
    return { W, H, k: exact ? outW / W : k, outW, outH, dpi: Math.round(96 * (exact ? outW / W : k)), mm: sz.mm || null, limited };
  }
  /* rasterises an SVG string; the fonts are generic families, so they resolve inside the image */
  async function rasterise(svg, plan, ex, bg) {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })), img = new Image();
    try {
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('svg')); img.src = url; });
      const cv = document.createElement('canvas'); cv.width = plan.outW; cv.height = plan.outH;
      const g = cv.getContext('2d');
      if (ex.fmt === 'jpeg' || bg) { g.fillStyle = bg || '#ffffff'; g.fillRect(0, 0, cv.width, cv.height); }
      g.setTransform(plan.outW / plan.W, 0, 0, plan.outH / plan.H, 0, 0);
      g.drawImage(img, 0, 0, plan.W, plan.H);
      const mime = ex.fmt === 'jpeg' ? 'image/jpeg' : ex.fmt === 'webp' ? 'image/webp' : 'image/png';
      let blob = await new Promise(res => cv.toBlob(res, mime, ex.fmt === 'png' ? undefined : clamp(+ex.quality || 0.92, 0.3, 1)));
      if (!blob) throw new Error('canvas');
      if (mime === 'image/png') blob = await addPhys(blob, plan.dpi);
      return { blob, ext: ex.fmt === 'jpeg' ? 'jpg' : ex.fmt };
    } finally { URL.revokeObjectURL(url); }
  }

  /* ================= defaults, presets and validation ================= */
  function defaults() {
    const st = {
      /* texts */
      title: '', subtitle: '', caption: '', xTitle: '', yTitle: '', legendTitle: '', facetTitles: {}, serLabels: {},
      titleAlign: 'center', captionAlign: 'left', font: 'sans', textScale: 1,
      /* figure */
      figBg: 'theme', figColor: '#ffffff', plotBg: 'none', plotColor: '#ffffff', inkAuto: true, inkColor: '#17212b',
      padOuter: 12, padInner: 0, figW: 0, figH: 0, aspect: 'auto',
      /* axes */
      xMode: 'auto', xMin: '', xMax: '', yMode: 'auto', yMin: '', yMax: '', xLog: false, yLog: false, xRev: false, yRev: false,
      xTickMode: 'auto', xTickCount: 6, xTickStep: '', yTickMode: 'auto', yTickCount: 6, yTickStep: '',
      xFmt: 'auto', xDec: 2, yFmt: 'auto', yDec: 2, xLabels: true, yLabels: true, thouSep: 'none', tickLen: 4, tickSide: 'out', axisW: 1, axisColor: '',
      zeroLine: false, zeroColor: '', domPad: 4, catRotate: 'auto', axisTitleWhere: 'figure',
      /* grid and frame */
      gridX: false, gridY: true, gridMinor: false, gridColor: '', gridW: 1, gridDash: 'solid', gridAlpha: 0.45, spines: 'lb',
      /* series */
      palette: 'app', serColors: {}, hidden: {}, order: [], panelOff: {},
      fillAlpha: 0.72, lineW: 1.6, lineDash: 'solid', marker: 'circle', markerSize: 3.2, markerAlpha: 0.65,
      markerOutlineW: 0, markerOutlineColor: '#ffffff', smooth: 0, maxPts: 4000, valLabels: 'none',
      /* histogram */
      binRule: 'fd', binCount: 25, binWidth: '', histY: 'density', cumulative: false, barGap: 0.06, barOutlineW: 0.4, barOutline: 'paper', barOutlineColor: '#ffffff',
      /* density and normal */
      bwRule: 'silverman', bwValue: '', bwAdjust: 1, densPoints: 200, densCut: 0, densFill: 0, normalDash: 'dash',
      rugH: 8, rugW: 0.7, rugAlpha: 0.35,
      /* box and violin */
      orient: 'v', whiskRule: 'tukey', whiskK: 1.5, whiskPct: 5, notch: false, boxW: 0.55, capW: 0.6, medColor: '', boxInk: '',
      meanMark: 'none', meanSize: 3.4, meanColor: '', outlierMark: 'circle', outlierSize: 2.2, outlierAlpha: 0.75, outlierColor: '',
      jitterPts: 'none', jitterW: 0.3, jitterAlpha: 0.35, ptSize: 1.9, jitterColor: '',
      vioW: 0.8, vioHalf: 'full', vioInner: 'box', vioCut: 1.5, groupOrder: 'asis',
      /* Q-Q, cumulative distribution, confidence interval */
      qqLine: 'quartile', qqLineDash: 'solid', qqLineColor: '', qqBand: false, qqLevel: 0.95, qqPtSize: 2.4, qqPP: 'auto',
      ecdfStep: 'step', ecdfNormal: false, ciLevel: 0.95, ciStat: 'ci', ciCap: 7, ciW: 1.4,
      /* panels */
      cols: 4, sharedX: 'free', sharedY: 'free', panelGapX: 16, panelGapY: 18, facetOn: true, facetAlign: 'center',
      /* legend */
      legendOn: true, legendPos: 'bottom', legendAlign: 'center', legendBox: 'none', legendBoxAlpha: 0.9,
      annots: [],
    };
    TXT_ROLES.forEach(r => { st[rk(r, 'Size')] = 0; st[rk(r, 'Bold')] = false; st[rk(r, 'Italic')] = false; st[rk(r, 'Color')] = ''; st[rk(r, 'Font')] = ''; });
    st.titleBold = true; st.subtitleItalic = true;
    return st;
  }
  const KIND_DEF = {
    histgrid: { cols: 4, gridY: true, legendPos: 'bottom', hidden: { norm: true, rug: true } },
    boxgrid: { cols: 1, gridY: true, legendOn: false, catRotate: 'auto', boxW: 0.6, outlierSize: 2, facetOn: false },
    ciplot: { cols: 4, gridY: true, legendOn: true, legendPos: 'bottom', facetOn: true, marker: 'circle', markerSize: 3.6, markerAlpha: 1, axisTitleWhere: 'panel', catRotate: 0, xLabels: false, domPad: 12 },
    hist: { cols: 1, facetOn: false, legendPos: 'tr', legendOn: true, legendBox: 'light', hidden: { rug: true } },
    box: { cols: 1, facetOn: false, legendOn: false, jitterPts: 'jitter', meanMark: 'diamond' },
    violin: { cols: 1, facetOn: false, legendOn: false, vioInner: 'box' },
    qq: { cols: 1, facetOn: false, legendOn: false, gridX: true },
    ecdf: { cols: 1, facetOn: false, legendOn: false, gridX: true },
    groupbox: { cols: 1, facetOn: false, legendOn: false, catRotate: 'auto' },
    groupdens: { cols: 1, facetOn: false, legendOn: true, legendPos: 'tr', legendBox: 'light' },
  };
  const defaultsFor = kind => Object.assign(defaults(), KIND_DEF[kind] || {});

  const PRESETS = [
    { id: 'publication', es: 'Publicación', en: 'Publication', des: 'Sin relleno de fondo, líneas finas, rejilla discreta', den: 'No panel fill, thin lines, discreet grid',
      s: { figBg: 'white', plotBg: 'none', font: 'sans', textScale: 1, titleSize: 0, titleBold: true, subtitleItalic: true, spines: 'lb', axisW: 0.9,
        gridX: false, gridY: true, gridMinor: false, gridAlpha: 0.32, gridW: 0.8, gridDash: 'solid', tickLen: 3.5, tickSide: 'out',
        fillAlpha: 0.7, lineW: 1.4, markerSize: 2.6, markerAlpha: 0.55, barOutlineW: 0.4, barOutline: 'paper', legendBox: 'none', padOuter: 12, palette: 'app' } },
    { id: 'presentation', es: 'Presentación', en: 'Presentation', des: 'Textos y líneas grandes, relleno fuerte', den: 'Large text and lines, strong fill',
      s: { figBg: 'theme', plotBg: 'soft', font: 'sans', textScale: 1.35, titleBold: true, spines: 'lb', axisW: 1.4, gridY: true, gridX: false, gridAlpha: 0.4, gridW: 1.2,
        fillAlpha: 0.85, lineW: 2.6, markerSize: 4.2, markerAlpha: 0.8, barOutlineW: 0.8, legendBox: 'light', padOuter: 16, palette: 'okabe', tickLen: 5 } },
    { id: 'poster', es: 'Cartel', en: 'Poster', des: 'Muy grande, marco completo y rejilla doble', den: 'Very large, full frame and grid on both axes',
      s: { figBg: 'white', plotBg: 'soft', font: 'serif', textScale: 1.7, titleBold: true, spines: 'box', axisW: 1.8, gridX: true, gridY: true, gridMinor: true, gridAlpha: 0.35, gridW: 1.1,
        fillAlpha: 0.9, lineW: 3.2, markerSize: 5, markerAlpha: 0.85, barOutlineW: 1, legendBox: 'outline', padOuter: 22, palette: 'tableau', tickLen: 6 } },
    { id: 'minimal', es: 'Mínimo', en: 'Minimal', des: 'Sin rejilla ni marco, gris, ideal para imprimir', den: 'No grid, no frame, grey, ready to print',
      s: { figBg: 'white', plotBg: 'none', font: 'sans', textScale: 0.95, spines: 'none', axisW: 0.8, gridX: false, gridY: false, gridMinor: false, tickLen: 0, tickSide: 'none',
        fillAlpha: 0.6, lineW: 1.2, markerSize: 2.2, markerAlpha: 0.5, barOutlineW: 0.3, legendBox: 'none', padOuter: 10, palette: 'grey', valLabels: 'none' } },
  ];
  /* keeps only well-formed values from a saved or loaded style */
  function sanitize(obj, defs) {
    const out = {};
    if (!obj || typeof obj !== 'object') return out;
    for (const k of Object.keys(defs)) {
      if (!(k in obj)) continue;
      const d = defs[k], v = obj[k];
      if (typeof d === 'boolean') { if (typeof v === 'boolean') out[k] = v; }
      else if (typeof d === 'number') { const n = parseFloat(v); if (isFinite(n)) out[k] = n; }
      else if (Array.isArray(d)) { if (Array.isArray(v)) out[k] = v.slice(0, 60); }
      else if (d && typeof d === 'object') { if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = Object.assign({}, v); }
      else if (typeof v === 'string' || typeof v === 'number') out[k] = String(v).slice(0, 400);
    }
    return out;
  }
  const PERSIST_SKIP = ['title', 'subtitle', 'caption', 'xTitle', 'yTitle', 'legendTitle', 'facetTitles', 'serLabels', 'annots', 'panelOff', 'hidden', 'figW', 'figH', 'xMin', 'xMax', 'yMin', 'yMax', 'xMode', 'yMode'];
  /* keys that a look does not carry over to the other figures of the step */
  const SHARE_SKIP = PERSIST_SKIP.concat(['cols', 'orient', 'serColors', 'order', 'groupOrder']);

  /* ================= the studio ================= */
  const STUDIOS = [];
  let studioUid = 0;

  function attach(target, opts) {
    const host = typeof target === 'string' ? el(target) : target;
    if (!host) throw new Error('figstudio: unknown container');
    if (host.__studio) { if (opts && opts.spec) host.__studio.setSpec(opts.spec); return host.__studio; }
    opts = opts || {};
    const kind = opts.kind || 'hist', hooks = opts.hooks || {}, group = opts.group || '', uid = ++studioUid;
    const defs = defaultsFor(kind);
    let saved = {}; try { saved = JSON.parse(lsGet(PREFIX + kind) || '{}'); } catch (e) { saved = {}; }
    const st = Object.assign({}, defs, sanitize(saved, defs));
    const ex = { fmt: 'png', size: 'shown', factor: 2, dpi: 300, quality: 0.92, cw: 1600, ch: 1000, cunit: 'px' };
    let spec = normSpec(opts.spec), lastSize = [760, 320], lastNotes = [];
    const studio = { kind, style: st, ex, group, host };
    host.__studio = studio; STUDIOS.push(studio);

    host.classList.add('fs-host');
    const figWrap = mk('div', 'fs-fig');
    host.innerHTML = ''; host.appendChild(figWrap);

    function normSpec(s) {
      s = s || { panels: [], series: [] };
      s.panels = (s.panels || []).map((p, i) => Object.assign({ id: p.id || 'p' + i }, p));
      s.series = s.series || [];
      s.has = t => s.panels.some(p => p.layers.some(l => l.t === t));
      return s;
    }
    const has = t => spec.has(t);
    const nPanels = () => spec.panels.filter(p => !(st.panelOff && st.panelOff[p.id])).length;

    /* ---- size and drawing ---- */
    function plannedSize() {
      const avail = Math.max(240, figWrap.clientWidth || host.clientWidth || 760);
      const W = clamp(Math.round(+st.figW > 0 ? +st.figW : avail), 240, 6000);
      const rows = Math.ceil(Math.max(1, nPanels()) / gridCols(clamp(Math.round(+st.cols) || 1, 1, 8), W - 2 * clamp(+st.padOuter, 0, 80) - 24, clamp(+st.panelGapX, 0, 120)));
      let H;
      if (+st.figH > 0) H = clamp(Math.round(+st.figH), 140, 6000);
      else if (st.aspect !== 'auto') { const r = { '16:9': 16 / 9, '4:3': 4 / 3, '3:2': 1.5, '1:1': 1, golden: 1.618 }[st.aspect] || 1.6; H = Math.round(W / r); }
      else H = clamp(Math.round(rows * (spec.rowH || 210) + (spec.extraH || 60) + (st.textScale - 1) * 40), 140, 6000);
      return [W, H];
    }
    let drawTimer = null;
    function draw() {
      const [W, H] = plannedSize(); lastSize = [W, H];
      let out;
      try { out = render(spec, st, W, H); }
      catch (e) { console.warn('figure studio draw', e); figWrap.innerHTML = `<p class="hint">${L2('No se pudo dibujar la figura.', 'The figure could not be drawn.')}</p>`; return; }
      figWrap.innerHTML = out.svg;
      const svg = figWrap.querySelector('svg');
      if (svg) { svg.style.width = '100%'; svg.style.maxWidth = W + 'px'; svg.style.height = 'auto'; }
      lastNotes = out.notes || [];
      showNotes();
      if (panel.open) updateExportInfo();
    }
    const drawSoon = () => { clearTimeout(drawTimer); drawTimer = setTimeout(draw, 16); };
    studio.redraw = draw;
    studio.setSpec = s => { spec = normSpec(s); rebuildDynamic(); draw(); };

    /* ================= panel ================= */
    const panel = mk('details', 'fstudio'); panel.dataset.kind = kind;
    panel.innerHTML = `<summary><span class="fs-ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l3-4 3 3 4-6"/></svg></span>` +
      `<span class="fs-tt">${L2('Estudio de figura', 'Figure studio')}</span><span class="fs-sub">${L2('textos, ejes, cuadrícula, series, anotaciones y exportación', 'text, axes, grid, series, annotations and export')}</span></summary>`;
    const body = mk('div', 'fs-body'); panel.appendChild(body);
    const tabs = mk('div', 'fs-tabs'); tabs.setAttribute('role', 'tablist'); body.appendChild(tabs);
    const status = mk('div', 'fs-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const notesBox = mk('p', 'fs-notes');
    const TABS = [['text', 'Textos', 'Text'], ['axes', 'Ejes', 'Axes'], ['grid', 'Cuadrícula', 'Grid'], ['series', 'Series', 'Series'],
      ['type', 'Figura', 'Figure'], ['annot', 'Anotaciones', 'Annotations'], ['looks', 'Estilos', 'Looks'], ['export', 'Exportar', 'Export']];
    const panes = {}, tabBtns = {};
    TABS.forEach(([id, es, en]) => {
      const b = mk('button', 'fs-tab', L2(es, en)); b.type = 'button'; b.setAttribute('role', 'tab'); b.id = `fs${uid}-tab-${id}`; b.setAttribute('aria-controls', `fs${uid}-pane-${id}`);
      const p = mk('div', 'fs-pane'); p.setAttribute('role', 'tabpanel'); p.id = `fs${uid}-pane-${id}`; p.setAttribute('aria-labelledby', b.id);
      b.addEventListener('click', () => showTab(id));
      b.addEventListener('keydown', e => {
        const i = TABS.findIndex(t => t[0] === id);
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const n = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length][0]; showTab(n); tabBtns[n].focus(); }
      });
      tabs.appendChild(b); body.appendChild(p); panes[id] = p; tabBtns[id] = b;
    });
    body.appendChild(notesBox); body.appendChild(status);
    function showTab(id) {
      TABS.forEach(([t]) => { const on = t === id; panes[t].hidden = !on; tabBtns[t].setAttribute('aria-selected', on ? 'true' : 'false'); tabBtns[t].tabIndex = on ? 0 : -1; tabBtns[t].classList.toggle('on', on); });
      if (id === 'export') updateExportInfo();
    }
    const say = (type, html) => { status.className = 'fs-status ' + (type || ''); status.innerHTML = html || ''; };
    function showNotes() {
      notesBox.innerHTML = lastNotes.length ? lastNotes.map(n => esc(T(n.es, n.en))).join('<br>') : '';
      notesBox.style.display = lastNotes.length ? 'block' : 'none';
    }

    /* ---- generic control factory ---- */
    const controls = []; let cuid = 0;
    function section(paneId, es, en, when) {
      const s = mk('div', 'fs-sec'); s.innerHTML = `<div class="fs-sec-h">${L2(es, en)}</div>`;
      const g = mk('div', 'fs-grid'); s.appendChild(g); panes[paneId].appendChild(s);
      if (when) controls.push({ spec: { when }, wrap: s, update() {} });
      return g;
    }
    function add(host2, spec2) {
      const id = `fs${uid}-c${++cuid}`, c = { spec: spec2 }, wrap = mk('div', 'fs-f' + (spec2.wide ? ' fs-wide' : '') + (spec2.t === 'check' ? ' fs-fc' : '')); c.wrap = wrap;
      const lbl = `<span class="fs-l">${L2(spec2.es, spec2.en)}</span>`;
      const store = spec2.store || st;
      const commit = (k, v) => { store[k] = v; if (spec2.after) spec2.after(v); if (spec2.store) { syncUI(); } else onStyle(k); };
      if (spec2.t === 'range') {
        wrap.innerHTML = `<label for="${id}">${lbl}</label><div class="fs-r"><input type="range" id="${id}" min="${spec2.min}" max="${spec2.max}" step="${spec2.step}"><output for="${id}"></output></div>`;
        const inp = wrap.querySelector('input'), out = wrap.querySelector('output');
        inp.addEventListener('input', () => commit(spec2.k, parseFloat(inp.value)));
        c.update = () => { inp.value = store[spec2.k]; out.textContent = spec2.fmt ? spec2.fmt(store[spec2.k]) : String(+(+store[spec2.k]).toFixed(2)); };
      } else if (spec2.t === 'select') {
        wrap.innerHTML = `<label for="${id}">${lbl}</label><select id="${id}"></select>`;
        const sel = wrap.querySelector('select');
        c.fill = () => { const cur = store[spec2.k]; sel.innerHTML = ''; spec2.opts().forEach(([v, name]) => { const o = document.createElement('option'); o.value = v; o.textContent = name; sel.appendChild(o); }); sel.value = cur; };
        sel.addEventListener('change', () => commit(spec2.k, spec2.num ? parseFloat(sel.value) : sel.value));
        c.update = () => { sel.value = store[spec2.k]; };
      } else if (spec2.t === 'check') {
        wrap.innerHTML = `<label class="fs-chk" for="${id}"><input type="checkbox" id="${id}"><span>${L2(spec2.es, spec2.en)}</span></label>`;
        const inp = wrap.querySelector('input');
        inp.addEventListener('change', () => commit(spec2.k, inp.checked));
        c.update = () => { inp.checked = !!store[spec2.k]; };
      } else if (spec2.t === 'color') {
        wrap.innerHTML = `<label for="${id}">${lbl}</label><input type="color" id="${id}">`;
        const inp = wrap.querySelector('input');
        inp.addEventListener('input', () => commit(spec2.k, inp.value));
        c.update = () => { inp.value = asHex(store[spec2.k] || spec2.def || '#888888'); };
      } else if (spec2.t === 'colorauto') {
        wrap.innerHTML = `<label for="${id}">${lbl}</label><div class="fs-ca"><input type="color" id="${id}"><label class="fs-chk"><input type="checkbox"><span>${L2('auto', 'auto')}</span></label></div>`;
        const inp = wrap.querySelector('input[type=color]'), chk = wrap.querySelector('input[type=checkbox]');
        inp.addEventListener('input', () => { chk.checked = false; commit(spec2.k, inp.value); });
        chk.addEventListener('change', () => commit(spec2.k, chk.checked ? '' : inp.value));
        c.update = () => { const v = store[spec2.k]; chk.checked = !v; inp.value = asHex(v || spec2.def || '#888888'); };
      } else if (spec2.t === 'text') {
        wrap.innerHTML = `<label for="${id}">${lbl}</label><input type="text" id="${id}" maxlength="300" autocomplete="off">`;
        const inp = wrap.querySelector('input');
        inp.addEventListener('input', () => commit(spec2.k, inp.value));
        c.update = () => { if (document.activeElement !== inp) inp.value = store[spec2.k] == null ? '' : store[spec2.k]; inp.placeholder = spec2.ph ? T(spec2.ph[0], spec2.ph[1]) : (spec2.phf ? String(spec2.phf() || '') : ''); };
      } else if (spec2.t === 'num') {
        wrap.innerHTML = `<label for="${id}">${lbl}</label><input type="number" id="${id}"${spec2.min != null ? ` min="${spec2.min}"` : ''}${spec2.max != null ? ` max="${spec2.max}"` : ''} step="${spec2.step || 1}">`;
        const inp = wrap.querySelector('input');
        inp.addEventListener('input', () => { if (spec2.allowEmpty && inp.value === '') { commit(spec2.k, ''); return; } const v = parseFloat(inp.value); if (isFinite(v)) commit(spec2.k, v); });
        c.update = () => { if (document.activeElement !== inp) inp.value = store[spec2.k] === '' ? '' : store[spec2.k]; inp.placeholder = spec2.ph ? T(spec2.ph[0], spec2.ph[1]) : ''; };
      } else if (spec2.t === 'btn') {
        wrap.innerHTML = `<button type="button" class="btn btn-secondary btn-sm">${L2(spec2.es, spec2.en)}</button>`;
        wrap.querySelector('button').addEventListener('click', spec2.act);
        c.update = () => {};
      }
      host2.appendChild(wrap); controls.push(c); return c;
    }
    const optsOf = list => () => list.map(([v, es, en]) => [v, T(es, en)]);
    function syncUI() {
      controls.forEach(c => { if (c.update) c.update(); if (c.spec.when) c.wrap.hidden = !c.spec.when(st); });
      if (!panes.export.hidden) updateExportInfo();
    }
    function refreshTexts() { controls.forEach(c => { if (c.fill) c.fill(); }); buildPresets(); rebuildDynamic(); syncUI(); }

    /* ---- style changes and persistence ---- */
    let ptimer = null;
    function persist() {
      clearTimeout(ptimer);
      ptimer = setTimeout(() => { const o = {}; for (const k of Object.keys(st)) if (!PERSIST_SKIP.includes(k)) o[k] = st[k]; lsSet(PREFIX + kind, JSON.stringify(o)); }, 300);
    }
    function onStyle() { drawSoon(); syncUI(); persist(); }
    const setStyle = (k, v) => { st[k] = v; onStyle(k); };
    studio.set = setStyle;
    function applyStyle(obj, quiet) {
      Object.assign(st, sanitize(obj, defs));
      draw(); syncUI(); persist();
      if (!quiet) say('ok', T('Estilo aplicado.', 'Look applied.'));
    }
    studio.applyStyle = o => applyStyle(o, true);
    studio.shareStyle = () => { const o = {}; for (const k of Object.keys(st)) if (!SHARE_SKIP.includes(k)) o[k] = st[k]; return o; };

    /* ================= TEXT ================= */
    let g = section('text', 'Textos de la figura (escribe los tuyos)', 'Text of the figure (type your own)');
    add(g, { t: 'text', k: 'title', es: 'Título', en: 'Title', wide: true, phf: () => lab(spec.title) || T('Sin título', 'No title') });
    add(g, { t: 'text', k: 'subtitle', es: 'Subtítulo', en: 'Subtitle', wide: true, phf: () => lab(spec.subtitle) || T('Sin subtítulo', 'No subtitle') });
    add(g, { t: 'text', k: 'caption', es: 'Pie / fuente', en: 'Caption / source', wide: true, ph: ['p. ej. Datos: registros depurados', 'e.g. Data: cleaned records'] });
    add(g, { t: 'text', k: 'xTitle', es: 'Título del eje X (con unidades)', en: 'X axis title (with units)', wide: true, phf: () => lab(spec.xTitle) || '' });
    add(g, { t: 'text', k: 'yTitle', es: 'Título del eje Y (con unidades)', en: 'Y axis title (with units)', wide: true, phf: () => lab(spec.yTitle) || '' });
    add(g, { t: 'text', k: 'legendTitle', es: 'Título de la leyenda', en: 'Legend title', wide: true, phf: () => lab(spec.legendTitle) || '' });
    g = section('text', 'Tipo de letra y tamaño general', 'Font and overall size');
    add(g, { t: 'select', k: 'font', es: 'Tipo de letra de toda la figura', en: 'Font of the whole figure', wide: true, opts: optsOf(FONT_OPTS) });
    add(g, { t: 'range', k: 'textScale', es: 'Tamaño de todos los textos', en: 'Size of all the text', min: 0.5, max: 3, step: 0.05, fmt: v => '×' + (+v).toFixed(2) });
    add(g, { t: 'select', k: 'titleAlign', es: 'Alineación del título', en: 'Title alignment', opts: optsOf([['left', 'Izquierda', 'Left'], ['center', 'Centro', 'Centre'], ['right', 'Derecha', 'Right']]) });
    add(g, { t: 'select', k: 'captionAlign', es: 'Alineación del pie', en: 'Caption alignment', opts: optsOf([['left', 'Izquierda', 'Left'], ['center', 'Centro', 'Centre'], ['right', 'Derecha', 'Right']]) });
    add(g, { t: 'select', k: 'axisTitleWhere', es: 'Títulos de los ejes', en: 'Axis titles', opts: optsOf([['figure', 'Una vez para toda la figura', 'Once for the whole figure'], ['panel', 'En cada panel', 'In every panel']]) });
    g = section('text', 'Tamaño, negrita, cursiva, color y letra de cada texto', 'Size, bold, italic, colour and font of each text');
    const TXT_ROW_NAMES = { title: ['Título', 'Title'], subtitle: ['Subtítulo', 'Subtitle'], caption: ['Pie / fuente', 'Caption / source'],
      axisTitle: ['Títulos de los ejes', 'Axis titles'], tick: ['Números de los ejes', 'Axis numbers'], legendTitle: ['Título de la leyenda', 'Legend title'],
      legendLabel: ['Etiquetas de la leyenda', 'Legend labels'], value: ['Etiquetas de valor', 'Value labels'], annot: ['Anotaciones', 'Annotations'], facet: ['Títulos de los paneles', 'Panel titles'] };
    const ttable = mk('div', 'fs-ttable fs-wide'); g.appendChild(ttable);
    ttable.appendChild(mk('div', 'fs-trow fs-thead', `<span></span><span>${L2('Tamaño', 'Size')}</span><span>${L2('Neg.', 'Bold')}</span><span>${L2('Curs.', 'Ital.')}</span><span>${L2('Color', 'Colour')}</span><span>${L2('Letra', 'Font')}</span>`));
    TXT_ROLES.forEach(role => {
      const row = mk('div', 'fs-trow'), rid = `fs${uid}-t-${role}`, nm = TXT_ROW_NAMES[role];
      row.innerHTML = `<span class="fs-tname">${L2(nm[0], nm[1])}</span>` +
        `<input type="number" min="0" max="120" step="0.5" id="${rid}-s" placeholder="auto" data-es-title="Tamaño en píxeles (vacío = automático)" data-en-title="Size in pixels (empty = automatic)">` +
        `<button type="button" class="fs-tog fs-tb" aria-pressed="false" data-es-title="Negrita" data-en-title="Bold"><b>B</b></button>` +
        `<button type="button" class="fs-tog fs-ti" aria-pressed="false" data-es-title="Cursiva" data-en-title="Italic"><i>I</i></button>` +
        `<span class="fs-ca"><input type="color" data-es-title="Color" data-en-title="Colour"><label class="fs-chk"><input type="checkbox" checked><span>auto</span></label></span>` +
        `<select data-es-title="Tipo de letra" data-en-title="Font"></select>`;
      const size = row.querySelector('input[type=number]'), bb = row.querySelector('.fs-tb'), bi = row.querySelector('.fs-ti'),
        col = row.querySelector('input[type=color]'), auto = row.querySelector('input[type=checkbox]'), fsel = row.querySelector('select');
      size.addEventListener('input', () => { const v = parseFloat(size.value); setStyle(rk(role, 'Size'), isFinite(v) && v > 0 ? v : 0); });
      bb.addEventListener('click', () => setStyle(rk(role, 'Bold'), !st[rk(role, 'Bold')]));
      bi.addEventListener('click', () => setStyle(rk(role, 'Italic'), !st[rk(role, 'Italic')]));
      col.addEventListener('input', () => { auto.checked = false; setStyle(rk(role, 'Color'), col.value); });
      auto.addEventListener('change', () => setStyle(rk(role, 'Color'), auto.checked ? '' : col.value));
      fsel.addEventListener('change', () => setStyle(rk(role, 'Font'), fsel.value));
      controls.push({ spec: {}, wrap: row,
        fill() { fsel.innerHTML = ''; [['', 'Como la figura', 'Same as the figure']].concat(FONT_OPTS).forEach(([v, es, en]) => { const o = document.createElement('option'); o.value = v; o.textContent = T(es, en); fsel.appendChild(o); }); fsel.value = st[rk(role, 'Font')] || ''; },
        update() {
          if (document.activeElement !== size) size.value = +st[rk(role, 'Size')] > 0 ? st[rk(role, 'Size')] : '';
          bb.setAttribute('aria-pressed', st[rk(role, 'Bold')] ? 'true' : 'false'); bi.setAttribute('aria-pressed', st[rk(role, 'Italic')] ? 'true' : 'false');
          auto.checked = !st[rk(role, 'Color')]; col.value = asHex(st[rk(role, 'Color')] || '#17212b'); fsel.value = st[rk(role, 'Font')] || '';
        } });
      ttable.appendChild(row);
    });
    const facetSec = section('text', 'Título de cada panel', 'Title of each panel', () => spec.panels.length > 1);
    const facetBox = mk('div', 'fs-list fs-wide'); facetSec.appendChild(facetBox);

    /* ================= AXES ================= */
    [['x', 'Eje X (horizontal)', 'X axis (horizontal)'], ['y', 'Eje Y (vertical)', 'Y axis (vertical)']].forEach(([ax, es, en]) => {
      const gg = section('axes', es, en);
      add(gg, { t: 'select', k: ax + 'Mode', es: 'Límites', en: 'Limits', opts: optsOf([['auto', 'Automáticos', 'Automatic'], ['manual', 'Manuales', 'Manual']]) });
      add(gg, { t: 'num', k: ax + 'Min', es: 'Mínimo', en: 'Minimum', step: 'any', allowEmpty: true, ph: ['auto', 'auto'], when: s => s[ax + 'Mode'] === 'manual' });
      add(gg, { t: 'num', k: ax + 'Max', es: 'Máximo', en: 'Maximum', step: 'any', allowEmpty: true, ph: ['auto', 'auto'], when: s => s[ax + 'Mode'] === 'manual' });
      add(gg, { t: 'check', k: ax + 'Log', es: 'Escala logarítmica', en: 'Logarithmic scale' });
      add(gg, { t: 'check', k: ax + 'Rev', es: 'Dirección invertida', en: 'Reversed direction' });
      add(gg, { t: 'select', k: ax + 'TickMode', es: 'Marcas', en: 'Ticks', opts: optsOf([['auto', 'Automáticas', 'Automatic'], ['count', 'Número de marcas', 'Number of ticks'], ['step', 'Paso entre marcas', 'Step between ticks']]) });
      add(gg, { t: 'num', k: ax + 'TickCount', es: 'Número de marcas', en: 'Number of ticks', min: 2, max: 30, when: s => s[ax + 'TickMode'] === 'count' });
      add(gg, { t: 'num', k: ax + 'TickStep', es: 'Paso', en: 'Step', step: 'any', allowEmpty: true, when: s => s[ax + 'TickMode'] === 'step' });
      add(gg, { t: 'select', k: ax + 'Fmt', es: 'Formato de los números', en: 'Number format', opts: optsOf([['auto', 'Automático', 'Automatic'], ['fixed', 'Decimales fijos', 'Fixed decimals'], ['sci', 'Científico (×10ⁿ)', 'Scientific (×10ⁿ)'], ['percent', 'Porcentaje', 'Percentage']]) });
      add(gg, { t: 'num', k: ax + 'Dec', es: 'Decimales', en: 'Decimals', min: 0, max: 8, when: s => s[ax + 'Fmt'] !== 'auto' });
      add(gg, { t: 'check', k: ax + 'Labels', es: 'Escribir los números / etiquetas', en: 'Write the numbers / labels' });
    });
    g = section('axes', 'Marcas, números y línea de los ejes', 'Ticks, numbers and axis line');
    add(g, { t: 'select', k: 'tickSide', es: 'Marcas hacia', en: 'Ticks pointing', opts: optsOf([['out', 'Fuera', 'Outwards'], ['in', 'Dentro', 'Inwards'], ['both', 'Ambos lados', 'Both sides'], ['none', 'Sin marcas ni números', 'No ticks or numbers']]) });
    add(g, { t: 'range', k: 'tickLen', es: 'Longitud de las marcas', en: 'Tick length', min: 0, max: 14, step: 0.5, fmt: v => v + ' px' });
    add(g, { t: 'select', k: 'thouSep', es: 'Separador de miles', en: 'Thousands separator', opts: optsOf([['none', 'Ninguno', 'None'], ['comma', 'Coma (1,234)', 'Comma (1,234)'], ['space', 'Espacio fino (1 234)', 'Thin space (1 234)']]) });
    add(g, { t: 'select', k: 'catRotate', es: 'Giro de las etiquetas del eje X', en: 'Rotation of the X axis labels', opts: optsOf([['auto', 'Automático', 'Automatic'], [0, 'Horizontal', 'Horizontal'], [25, '25°', '25°'], [35, '35°', '35°'], [45, '45°', '45°'], [55, '55°', '55°'], [90, 'Vertical (90°)', 'Vertical (90°)']]) });
    add(g, { t: 'range', k: 'domPad', es: 'Margen de los datos dentro del panel', en: 'Padding of the data inside the panel', min: 0, max: 20, step: 0.5, fmt: v => v + '%' });
    add(g, { t: 'range', k: 'axisW', es: 'Grosor de la línea de los ejes', en: 'Axis line width', min: 0.3, max: 4, step: 0.1 });
    add(g, { t: 'colorauto', k: 'axisColor', es: 'Color de la línea de los ejes', en: 'Axis line colour', def: '#bccfc5' });
    add(g, { t: 'check', k: 'zeroLine', es: 'Línea en el cero', en: 'Zero line' });
    add(g, { t: 'colorauto', k: 'zeroColor', es: 'Color de la línea del cero', en: 'Zero line colour', def: '#5b7266', when: s => s.zeroLine });

    /* ================= GRID AND FRAME ================= */
    g = section('grid', 'Cuadrícula', 'Grid');
    add(g, { t: 'check', k: 'gridY', es: 'Líneas horizontales', en: 'Horizontal lines' });
    add(g, { t: 'check', k: 'gridX', es: 'Líneas verticales', en: 'Vertical lines' });
    add(g, { t: 'check', k: 'gridMinor', es: 'Cuadrícula secundaria (menor)', en: 'Secondary (minor) grid' });
    add(g, { t: 'colorauto', k: 'gridColor', es: 'Color', en: 'Colour', def: '#bccfc5' });
    add(g, { t: 'range', k: 'gridW', es: 'Grosor', en: 'Width', min: 0.2, max: 4, step: 0.1 });
    add(g, { t: 'select', k: 'gridDash', es: 'Trazo', en: 'Dash', opts: optsOf([['solid', 'Continuo', 'Solid'], ['dash', 'Discontinuo', 'Dashed'], ['dot', 'Punteado', 'Dotted'], ['dashdot', 'Trazo y punto', 'Dash-dot'], ['long', 'Trazo largo', 'Long dash']]) });
    add(g, { t: 'range', k: 'gridAlpha', es: 'Opacidad', en: 'Opacity', min: 0, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%' });
    g = section('grid', 'Marco y fondos', 'Frame and backgrounds');
    add(g, { t: 'select', k: 'spines', es: 'Lados dibujados', en: 'Spines drawn', opts: optsOf([['lb', 'Izquierdo e inferior', 'Left and bottom'], ['lbt', 'Izquierdo, inferior y superior', 'Left, bottom and top'], ['box', 'Marco completo', 'Full frame'], ['none', 'Ninguno', 'None']]) });
    add(g, { t: 'select', k: 'plotBg', es: 'Fondo del panel', en: 'Panel background', opts: optsOf([['none', 'Sin fondo', 'No fill'], ['paper', 'Igual que la figura', 'Same as the figure'], ['soft', 'Tenue', 'Soft'], ['white', 'Blanco', 'White'], ['custom', 'Otro color…', 'Custom colour…']]) });
    add(g, { t: 'color', k: 'plotColor', es: 'Color del panel', en: 'Panel colour', when: s => s.plotBg === 'custom' });
    add(g, { t: 'select', k: 'figBg', es: 'Fondo de la figura', en: 'Figure background', opts: optsOf([['theme', 'Color del tema', 'Theme colour'], ['white', 'Blanco', 'White'], ['transparent', 'Transparente', 'Transparent'], ['custom', 'Otro color…', 'Custom colour…']]) });
    add(g, { t: 'color', k: 'figColor', es: 'Color de la figura', en: 'Figure colour', when: s => s.figBg === 'custom' });
    add(g, { t: 'check', k: 'inkAuto', es: 'Color de texto automático', en: 'Automatic text colour' });
    add(g, { t: 'color', k: 'inkColor', es: 'Color base del texto', en: 'Base text colour', when: s => !s.inkAuto });
    add(g, { t: 'range', k: 'padOuter', es: 'Margen exterior', en: 'Outer margin', min: 0, max: 60, step: 1, fmt: v => v + ' px' });
    add(g, { t: 'range', k: 'padInner', es: 'Margen interior derecho', en: 'Inner right margin', min: 0, max: 60, step: 1, fmt: v => v + ' px' });
    g = section('grid', 'Leyenda', 'Legend');
    add(g, { t: 'check', k: 'legendOn', es: 'Mostrar la leyenda', en: 'Show the legend' });
    add(g, { t: 'select', k: 'legendPos', es: 'Posición', en: 'Position', when: s => s.legendOn, opts: optsOf([['top', 'Arriba', 'Top'], ['bottom', 'Abajo', 'Bottom'], ['right', 'Derecha', 'Right'], ['tr', 'Dentro, arriba derecha', 'Inside, top right'], ['tl', 'Dentro, arriba izquierda', 'Inside, top left'], ['br', 'Dentro, abajo derecha', 'Inside, bottom right'], ['bl', 'Dentro, abajo izquierda', 'Inside, bottom left']]) });
    add(g, { t: 'select', k: 'legendAlign', es: 'Alineación', en: 'Alignment', when: s => s.legendOn && (s.legendPos === 'top' || s.legendPos === 'bottom'), opts: optsOf([['left', 'Izquierda', 'Left'], ['center', 'Centro', 'Centre']]) });
    add(g, { t: 'select', k: 'legendBox', es: 'Caja', en: 'Box', when: s => s.legendOn, opts: optsOf([['none', 'Sin caja', 'No box'], ['light', 'Caja clara', 'Light box'], ['dark', 'Caja oscura', 'Dark box'], ['outline', 'Solo contorno', 'Outline only']]) });
    add(g, { t: 'range', k: 'legendBoxAlpha', es: 'Opacidad de la caja', en: 'Box opacity', min: 0.1, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%', when: s => s.legendOn && s.legendBox !== 'none' });

    /* ================= SERIES ================= */
    g = section('series', 'Colores', 'Colours');
    add(g, { t: 'select', k: 'palette', es: 'Paleta', en: 'Palette', wide: true, opts: () => ['app', 'okabe', 'tableau', 'set2', 'dark2', 'paired', 'grey'].map(k => [k, lab(PALETTE_NAMES[k])]) });
    const serBox = mk('div', 'fs-list fs-wide'); g.appendChild(serBox);
    g = section('series', 'Relleno, líneas y marcadores', 'Fill, lines and markers');
    add(g, { t: 'range', k: 'fillAlpha', es: 'Opacidad del relleno', en: 'Fill opacity', min: 0, max: 1, step: 0.02, fmt: v => Math.round(v * 100) + '%' });
    add(g, { t: 'range', k: 'lineW', es: 'Grosor de las líneas', en: 'Line width', min: 0.2, max: 8, step: 0.1 });
    add(g, { t: 'select', k: 'lineDash', es: 'Trazo de las líneas', en: 'Line dash', opts: optsOf([['solid', 'Continuo', 'Solid'], ['dash', 'Discontinuo', 'Dashed'], ['dot', 'Punteado', 'Dotted'], ['dashdot', 'Trazo y punto', 'Dash-dot'], ['long', 'Trazo largo', 'Long dash']]) });
    add(g, { t: 'range', k: 'smooth', es: 'Suavizado de las curvas', en: 'Curve smoothing', min: 0, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%' });
    add(g, { t: 'select', k: 'marker', es: 'Forma del marcador', en: 'Marker shape', opts: optsOf(MARKERS) });
    add(g, { t: 'range', k: 'markerSize', es: 'Tamaño del marcador', en: 'Marker size', min: 0.5, max: 12, step: 0.1 });
    add(g, { t: 'range', k: 'markerAlpha', es: 'Opacidad del marcador', en: 'Marker opacity', min: 0.03, max: 1, step: 0.02, fmt: v => Math.round(v * 100) + '%' });
    add(g, { t: 'range', k: 'markerOutlineW', es: 'Contorno del marcador', en: 'Marker outline', min: 0, max: 3, step: 0.1 });
    add(g, { t: 'color', k: 'markerOutlineColor', es: 'Color del contorno', en: 'Outline colour', when: s => s.markerOutlineW > 0 });
    add(g, { t: 'select', k: 'valLabels', es: 'Etiquetas de valor', en: 'Value labels', opts: optsOf([['none', 'Sin etiquetas', 'None'], ['median', 'Mediana / valor', 'Median / value'], ['mean', 'Media', 'Mean']]) });
    add(g, { t: 'num', k: 'maxPts', es: 'Máximo de puntos dibujados', en: 'Maximum points drawn', min: 200, max: 60000, step: 100 });
    panes.series.appendChild(mk('p', 'fs-hint', L2('Cuando una serie tiene más puntos que el máximo, se dibuja una muestra uniforme y se avisa debajo de la figura (los cálculos usan todos los datos).',
      'When a series has more points than the maximum, an even sample is drawn and a note appears under the figure (the computations always use every value).')));

    /* ================= FIGURE TYPE ================= */
    g = section('type', 'Histograma', 'Histogram', () => has('hist'));
    add(g, { t: 'select', k: 'binRule', es: 'Regla de los intervalos', en: 'Bin rule', wide: true, opts: optsOf([['sturges', 'Sturges 1926', 'Sturges 1926'], ['scott', 'Scott 1979', 'Scott 1979'], ['fd', 'Freedman y Diaconis 1981', 'Freedman & Diaconis 1981'], ['sqrt', 'Raíz cuadrada de n', 'Square root of n'], ['count', 'Número fijo de intervalos', 'Fixed number of bins'], ['width', 'Ancho fijo de intervalo', 'Fixed bin width']]) });
    add(g, { t: 'num', k: 'binCount', es: 'Número de intervalos', en: 'Number of bins', min: 1, max: 500, when: s => s.binRule === 'count' });
    add(g, { t: 'num', k: 'binWidth', es: 'Ancho del intervalo', en: 'Bin width', step: 'any', allowEmpty: true, when: s => s.binRule === 'width' });
    add(g, { t: 'select', k: 'histY', es: 'Eje vertical', en: 'Vertical axis', opts: optsOf([['density', 'Densidad', 'Density'], ['count', 'Frecuencia (conteo)', 'Frequency (count)'], ['prob', 'Proporción', 'Proportion']]) });
    add(g, { t: 'check', k: 'cumulative', es: 'Acumulado', en: 'Cumulative' });
    add(g, { t: 'range', k: 'barGap', es: 'Separación entre barras', en: 'Gap between bars', min: 0, max: 0.6, step: 0.02, fmt: v => Math.round(v * 100) + '%' });
    add(g, { t: 'range', k: 'barOutlineW', es: 'Grosor del contorno', en: 'Outline width', min: 0, max: 3, step: 0.1 });
    add(g, { t: 'select', k: 'barOutline', es: 'Color del contorno', en: 'Outline colour', when: s => s.barOutlineW > 0, opts: optsOf([['paper', 'Color del fondo', 'Background colour'], ['series', 'Color de la serie', 'Series colour'], ['ink', 'Color del texto', 'Text colour'], ['custom', 'Otro color…', 'Custom colour…']]) });
    add(g, { t: 'color', k: 'barOutlineColor', es: 'Contorno', en: 'Outline', when: s => s.barOutlineW > 0 && s.barOutline === 'custom' });
    g = section('type', 'Curva de densidad (núcleo gaussiano)', 'Density curve (Gaussian kernel)', () => has('density') || has('densityG') || has('violin'));
    add(g, { t: 'select', k: 'bwRule', es: 'Ancho de banda', en: 'Bandwidth', wide: true, opts: optsOf([['silverman', 'Silverman 1986 (robusta)', 'Silverman 1986 (robust)'], ['scott', 'Scott 1979', 'Scott 1979'], ['manual', 'Valor fijo', 'Fixed value']]) });
    add(g, { t: 'num', k: 'bwValue', es: 'Valor del ancho de banda', en: 'Bandwidth value', step: 'any', allowEmpty: true, when: s => s.bwRule === 'manual' });
    add(g, { t: 'range', k: 'bwAdjust', es: 'Ajuste del ancho de banda', en: 'Bandwidth adjustment', min: 0.2, max: 3, step: 0.05, fmt: v => '×' + (+v).toFixed(2), when: s => s.bwRule !== 'manual' });
    add(g, { t: 'num', k: 'densPoints', es: 'Puntos de la curva', en: 'Points of the curve', min: 32, max: 1000, step: 8 });
    add(g, { t: 'range', k: 'densCut', es: 'Extensión más allá de los datos', en: 'Extension beyond the data', min: 0, max: 4, step: 0.25, fmt: v => v + ' h' });
    add(g, { t: 'range', k: 'densFill', es: 'Relleno bajo la curva', en: 'Fill under the curve', min: 0, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%' });
    add(g, { t: 'select', k: 'normalDash', es: 'Trazo de la normal ajustada', en: 'Dash of the fitted normal', when: () => has('normal') || has('ecdf'), opts: optsOf([['solid', 'Continuo', 'Solid'], ['dash', 'Discontinuo', 'Dashed'], ['dot', 'Punteado', 'Dotted'], ['dashdot', 'Trazo y punto', 'Dash-dot']]) });
    g = section('type', 'Franja de datos (rug)', 'Rug plot', () => has('rug'));
    add(g, { t: 'range', k: 'rugH', es: 'Altura', en: 'Height', min: 1, max: 40, step: 1, fmt: v => v + ' px' });
    add(g, { t: 'range', k: 'rugW', es: 'Grosor', en: 'Width', min: 0.3, max: 3, step: 0.1 });
    add(g, { t: 'range', k: 'rugAlpha', es: 'Opacidad', en: 'Opacity', min: 0.05, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%' });
    g = section('type', 'Cajas y violines: orden y orientación', 'Boxes and violins: order and orientation', () => has('box') || has('violin') || has('ci'));
    add(g, { t: 'select', k: 'orient', es: 'Orientación', en: 'Orientation', opts: optsOf([['v', 'Vertical', 'Vertical'], ['h', 'Horizontal', 'Horizontal']]) });
    add(g, { t: 'select', k: 'groupOrder', es: 'Orden de los grupos', en: 'Order of the groups', wide: true, opts: optsOf([['asis', 'Como llegan', 'As given'], ['alpha', 'Alfabético', 'Alphabetical'], ['median', 'Mediana ascendente', 'Median ascending'], ['medianDesc', 'Mediana descendente', 'Median descending'], ['n', 'Tamaño de muestra', 'Sample size']]) });
    g = section('type', 'Diagrama de caja', 'Box plot', () => has('box') || has('violin'));
    add(g, { t: 'select', k: 'whiskRule', es: 'Bigotes', en: 'Whiskers', wide: true, opts: optsOf([['tukey', 'Regla 1.5 × RIC (Tukey 1977)', '1.5 × IQR rule (Tukey 1977)'], ['pct', 'Percentiles', 'Percentiles'], ['minmax', 'Mínimo y máximo', 'Minimum and maximum'], ['none', 'Sin bigotes', 'None']]) });
    add(g, { t: 'range', k: 'whiskK', es: 'Múltiplo del rango intercuartílico', en: 'Multiple of the interquartile range', min: 0.5, max: 3, step: 0.1, fmt: v => '×' + (+v).toFixed(1), when: s => s.whiskRule === 'tukey' });
    add(g, { t: 'range', k: 'whiskPct', es: 'Percentil inferior', en: 'Lower percentile', min: 0, max: 25, step: 0.5, fmt: v => v + ' %', when: s => s.whiskRule === 'pct' });
    add(g, { t: 'check', k: 'notch', es: 'Muesca en la mediana', en: 'Notch at the median' });
    add(g, { t: 'range', k: 'boxW', es: 'Ancho de la caja', en: 'Box width', min: 0.05, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%' });
    add(g, { t: 'range', k: 'capW', es: 'Ancho de los extremos', en: 'Cap width', min: 0, max: 1.2, step: 0.05, fmt: v => Math.round(v * 100) + '%' });
    add(g, { t: 'colorauto', k: 'boxInk', es: 'Color del contorno', en: 'Outline colour', def: '#17212b' });
    add(g, { t: 'colorauto', k: 'medColor', es: 'Color de la mediana', en: 'Median colour', def: '#17212b' });
    add(g, { t: 'select', k: 'meanMark', es: 'Marca de la media', en: 'Mean marker', opts: () => [['none', T('Sin marca', 'None')]].concat(MARKERS.map(([v, es, en]) => [v, T(es, en)])) });
    add(g, { t: 'range', k: 'meanSize', es: 'Tamaño de la media', en: 'Mean marker size', min: 1, max: 14, step: 0.2, when: s => s.meanMark !== 'none' });
    add(g, { t: 'colorauto', k: 'meanColor', es: 'Color de la media', en: 'Mean colour', def: '#17212b', when: s => s.meanMark !== 'none' });
    add(g, { t: 'select', k: 'outlierMark', es: 'Marca de los valores extremos', en: 'Outlier marker', opts: () => [['none', T('Sin marca', 'None')]].concat(MARKERS.map(([v, es, en]) => [v, T(es, en)])) });
    add(g, { t: 'range', k: 'outlierSize', es: 'Tamaño de los extremos', en: 'Outlier size', min: 0.5, max: 10, step: 0.1, when: s => s.outlierMark !== 'none' });
    add(g, { t: 'range', k: 'outlierAlpha', es: 'Opacidad de los extremos', en: 'Outlier opacity', min: 0.05, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%', when: s => s.outlierMark !== 'none' });
    add(g, { t: 'colorauto', k: 'outlierColor', es: 'Color de los extremos', en: 'Outlier colour', def: '#17212b', when: s => s.outlierMark !== 'none' });
    add(g, { t: 'select', k: 'jitterPts', es: 'Puntos individuales', en: 'Individual points', opts: optsOf([['none', 'Sin puntos', 'None'], ['jitter', 'Dispersos (jitter)', 'Jittered'], ['strip', 'En línea', 'In a line']]) });
    add(g, { t: 'range', k: 'jitterW', es: 'Dispersión de los puntos', en: 'Spread of the points', min: 0, max: 0.9, step: 0.05, fmt: v => Math.round(v * 100) + '%', when: s => s.jitterPts === 'jitter' });
    add(g, { t: 'range', k: 'ptSize', es: 'Tamaño de los puntos', en: 'Point size', min: 0.4, max: 10, step: 0.1, when: s => s.jitterPts !== 'none' });
    add(g, { t: 'range', k: 'jitterAlpha', es: 'Opacidad de los puntos', en: 'Point opacity', min: 0.02, max: 1, step: 0.02, fmt: v => Math.round(v * 100) + '%', when: s => s.jitterPts !== 'none' });
    add(g, { t: 'colorauto', k: 'jitterColor', es: 'Color de los puntos', en: 'Point colour', def: '#5b7266', when: s => s.jitterPts !== 'none' });
    g = section('type', 'Violín', 'Violin', () => has('violin'));
    add(g, { t: 'range', k: 'vioW', es: 'Ancho del violín', en: 'Violin width', min: 0.05, max: 1.2, step: 0.05, fmt: v => Math.round(v * 100) + '%' });
    add(g, { t: 'select', k: 'vioHalf', es: 'Forma', en: 'Shape', opts: optsOf([['full', 'Completo', 'Full'], ['left', 'Mitad izquierda', 'Left half'], ['right', 'Mitad derecha', 'Right half']]) });
    add(g, { t: 'select', k: 'vioInner', es: 'Interior', en: 'Inside', opts: optsOf([['box', 'Caja', 'Box'], ['quart', 'Líneas de cuartiles', 'Quartile lines'], ['stick', 'Línea y mediana', 'Line and median'], ['none', 'Vacío', 'Empty']]) });
    add(g, { t: 'range', k: 'vioCut', es: 'Extensión del violín', en: 'Violin extension', min: 0, max: 4, step: 0.25, fmt: v => v + ' h' });
    g = section('type', 'Gráfico Q–Q normal', 'Normal Q–Q plot', () => has('qq'));
    add(g, { t: 'select', k: 'qqLine', es: 'Línea de referencia', en: 'Reference line', wide: true, opts: optsOf([['quartile', 'Por los cuartiles', 'Through the quartiles'], ['ls', 'Mínimos cuadrados', 'Least squares'], ['none', 'Sin línea', 'None']]) });
    add(g, { t: 'select', k: 'qqLineDash', es: 'Trazo de la línea', en: 'Line dash', when: s => s.qqLine !== 'none', opts: optsOf([['solid', 'Continuo', 'Solid'], ['dash', 'Discontinuo', 'Dashed'], ['dot', 'Punteado', 'Dotted']]) });
    add(g, { t: 'colorauto', k: 'qqLineColor', es: 'Color de la línea', en: 'Line colour', def: '#cf6a24', when: s => s.qqLine !== 'none' });
    add(g, { t: 'check', k: 'qqBand', es: 'Banda de confianza puntual', en: 'Pointwise confidence band' });
    add(g, { t: 'select', k: 'qqLevel', num: true, es: 'Nivel de la banda', en: 'Band level', when: s => s.qqBand, opts: optsOf([[0.9, '90 %', '90 %'], [0.95, '95 %', '95 %'], [0.99, '99 %', '99 %']]) });
    add(g, { t: 'range', k: 'qqPtSize', es: 'Tamaño de los puntos', en: 'Point size', min: 0.5, max: 12, step: 0.1 });
    add(g, { t: 'select', k: 'qqPP', es: 'Posiciones de trazado', en: 'Plotting positions', wide: true, opts: optsOf([['auto', 'Automáticas (3/8 con n ≤ 10, 1/2 en el resto)', 'Automatic (3/8 for n ≤ 10, 1/2 otherwise)'], [0.375, 'a = 3/8 (Wilk y Gnanadesikan 1968)', 'a = 3/8 (Wilk & Gnanadesikan 1968)'], [0.5, 'a = 1/2', 'a = 1/2'], [0, 'a = 0 (i/(n+1))', 'a = 0 (i/(n+1))'], ['filliben', 'Medianas de los estadísticos de orden (Filliben 1975)', 'Medians of the order statistics (Filliben 1975)']]) });
    g = section('type', 'Distribución acumulada empírica', 'Empirical cumulative distribution', () => has('ecdf'));
    add(g, { t: 'select', k: 'ecdfStep', es: 'Trazo', en: 'Drawing', opts: optsOf([['step', 'Escalonado', 'Stepped'], ['point', 'Unido punto a punto', 'Point to point']]) });
    add(g, { t: 'check', k: 'ecdfNormal', es: 'Añadir la normal teórica', en: 'Add the theoretical normal' });
    g = section('type', 'Media e intervalo', 'Mean and interval', () => has('ci'));
    add(g, { t: 'select', k: 'ciStat', es: 'Barras de error', en: 'Error bars', wide: true, opts: optsOf([['ci', 'Intervalo de confianza de la media', 'Confidence interval of the mean'], ['se', 'Error estándar', 'Standard error'], ['sd', 'Desviación estándar', 'Standard deviation']]) });
    add(g, { t: 'select', k: 'ciLevel', num: true, es: 'Nivel de confianza', en: 'Confidence level', when: s => s.ciStat === 'ci', opts: optsOf([[0.9, '90 %', '90 %'], [0.95, '95 %', '95 %'], [0.99, '99 %', '99 %']]) });
    add(g, { t: 'range', k: 'ciCap', es: 'Ancho del extremo', en: 'Cap width', min: 0, max: 20, step: 1, fmt: v => v + ' px' });
    add(g, { t: 'range', k: 'ciW', es: 'Grosor de la barra', en: 'Bar width', min: 0.3, max: 6, step: 0.1 });
    g = section('type', 'Rejilla de paneles', 'Panel grid', () => spec.panels.length > 1);
    add(g, { t: 'num', k: 'cols', es: 'Columnas', en: 'Columns', min: 1, max: 8 });
    add(g, { t: 'select', k: 'sharedX', es: 'Eje X compartido', en: 'Shared X axis', opts: optsOf([['free', 'Cada panel el suyo', 'Each panel its own'], ['shared', 'Compartido (números abajo)', 'Shared (numbers at the bottom)'], ['all', 'Compartido, números en todos', 'Shared, numbers everywhere']]) });
    add(g, { t: 'select', k: 'sharedY', es: 'Eje Y compartido', en: 'Shared Y axis', opts: optsOf([['free', 'Cada panel el suyo', 'Each panel its own'], ['shared', 'Compartido (números a la izquierda)', 'Shared (numbers on the left)'], ['all', 'Compartido, números en todos', 'Shared, numbers everywhere']]) });
    add(g, { t: 'range', k: 'panelGapX', es: 'Separación horizontal', en: 'Horizontal spacing', min: 0, max: 120, step: 2, fmt: v => v + ' px' });
    add(g, { t: 'range', k: 'panelGapY', es: 'Separación vertical', en: 'Vertical spacing', min: 0, max: 120, step: 2, fmt: v => v + ' px' });
    add(g, { t: 'check', k: 'facetOn', es: 'Título en cada panel', en: 'Title in every panel' });
    add(g, { t: 'select', k: 'facetAlign', es: 'Alineación del título del panel', en: 'Panel title alignment', when: s => s.facetOn, opts: optsOf([['left', 'Izquierda', 'Left'], ['center', 'Centro', 'Centre']]) });
    const panelSec = section('type', 'Paneles dibujados', 'Panels drawn', () => spec.panels.length > 1);
    const panelBox = mk('div', 'fs-list fs-wide'); panelSec.appendChild(panelBox);
    g = section('type', 'Tamaño de la figura en pantalla', 'Size of the figure on screen');
    add(g, { t: 'num', k: 'figW', es: 'Ancho (px, 0 = todo el ancho)', en: 'Width (px, 0 = full width)', min: 0, max: 6000, step: 10 });
    add(g, { t: 'num', k: 'figH', es: 'Alto (px, 0 = automático)', en: 'Height (px, 0 = automatic)', min: 0, max: 6000, step: 10 });
    add(g, { t: 'select', k: 'aspect', es: 'Proporción', en: 'Aspect ratio', when: s => !(+s.figH > 0), opts: optsOf([['auto', 'Automática', 'Automatic'], ['16:9', '16:9', '16:9'], ['4:3', '4:3', '4:3'], ['3:2', '3:2', '3:2'], ['1:1', 'Cuadrada', 'Square'], ['golden', 'Áurea', 'Golden']]) });

    /* ================= ANNOTATIONS ================= */
    const annotSec = section('annot', 'Anotaciones y líneas de referencia', 'Annotations and reference lines');
    const annotBox = mk('div', 'fs-list fs-wide'); annotSec.appendChild(annotBox);
    const annotBtns = mk('div', 'fs-actions fs-wide'); annotSec.appendChild(annotBtns);
    [['text', 'Añadir texto', 'Add a text'], ['hline', 'Añadir línea horizontal', 'Add a horizontal line'], ['vline', 'Añadir línea vertical', 'Add a vertical line'], ['diag', 'Añadir línea diagonal', 'Add a diagonal line']]
      .forEach(([k, es, en]) => { const b = mk('button', 'btn btn-secondary btn-sm', L2(es, en)); b.type = 'button';
        b.addEventListener('click', () => { st.annots = (st.annots || []).concat([{ kind: k, panel: '*', text: '', at: 'free', fx: 0.5, fy: 0.12, x: '', y: '', a: 0, b: 1, dx: 0, dy: 0, arrow: false, color: '', size: 0, lw: 1, dash: 'dash' }]); buildAnnots(); onStyle(); }); annotBtns.appendChild(b); });
    panes.annot.appendChild(mk('p', 'fs-hint', L2('Una anotación puede ir en un lugar cualquiera del panel (posición relativa) o en un punto de los datos. Las líneas horizontales y verticales se colocan en el valor que escribas y pueden llevar su propia etiqueta.',
      'An annotation can sit anywhere in the panel (relative position) or at a data point. Horizontal and vertical lines are placed at the value you type and may carry their own label.')));

    function buildAnnots() {
      annotBox.innerHTML = '';
      (st.annots || []).forEach((A, i) => {
        const row = mk('div', 'fs-arow');
        const KINDS = { text: ['Texto', 'Text'], hline: ['Línea horizontal', 'Horizontal line'], vline: ['Línea vertical', 'Vertical line'], diag: ['Línea diagonal', 'Diagonal line'] };
        row.innerHTML = `<div class="fs-ahead"><b>${L2(KINDS[A.kind][0], KINDS[A.kind][1])}</b>` +
          `<button type="button" class="btn btn-ghost btn-sm fs-adel">${L2('Quitar', 'Remove')}</button></div><div class="fs-agrid"></div>`;
        const gg = row.querySelector('.fs-agrid');
        /* the label is bilingual HTML; the accessible name takes the active language only */
        const oneLang = html => { const d = mk('div', '', html), n = d.querySelector('[data-l="' + I18N.lang + '"]'); return (n || d).textContent.trim(); };
        const fld = (label, el2) => { const w = mk('div', 'fs-f'); w.innerHTML = `<span class="fs-l">${label}</span>`;
          el2.setAttribute('aria-label', oneLang(label) + ' — ' + T(KINDS[A.kind][0], KINDS[A.kind][1]) + ' ' + (i + 1));
          w.appendChild(el2); gg.appendChild(w); return el2; };
        const inp = (type, val, on, attrs) => { const n = document.createElement('input'); n.type = type; if (attrs) Object.assign(n, attrs); n.value = val == null ? '' : val; n.addEventListener('input', () => on(n.value)); return n; };
        const selEl = (list, val, on) => { const n = document.createElement('select'); list.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; n.appendChild(o); }); n.value = val; n.addEventListener('change', () => on(n.value)); return n; };
        const upd = (k, v) => { A[k] = v; onStyle(); };
        fld(L2('Texto', 'Text'), inp('text', A.text, v => upd('text', v), { maxLength: 200 }));
        if (spec.panels.length > 1) fld(L2('Panel', 'Panel'), selEl([['*', T('Todos', 'All')]].concat(spec.panels.map((p, k) => [String(k), facetTitle(st, p, k) || String(k + 1)])), String(A.panel), v => upd('panel', v)));
        if (A.kind === 'text') {
          fld(L2('Colocar en', 'Place at'), selEl([['free', T('Posición relativa', 'Relative position')], ['data', T('Un punto de los datos', 'A data point')]], A.at, v => upd('at', v)));
          if (A.at === 'data') { fld('x', inp('number', A.x, v => upd('x', v), { step: 'any' })); fld('y', inp('number', A.y, v => upd('y', v), { step: 'any' })); }
          else { fld(L2('Horizontal (0–1)', 'Horizontal (0–1)'), inp('number', A.fx, v => upd('fx', v), { step: 0.05, min: 0, max: 1 })); fld(L2('Vertical (0–1)', 'Vertical (0–1)'), inp('number', A.fy, v => upd('fy', v), { step: 0.05, min: 0, max: 1 })); }
          fld(L2('Desplazamiento x', 'Offset x'), inp('number', A.dx, v => upd('dx', v), { step: 2 }));
          fld(L2('Desplazamiento y', 'Offset y'), inp('number', A.dy, v => upd('dy', v), { step: 2 }));
          const ch = document.createElement('input'); ch.type = 'checkbox'; ch.checked = !!A.arrow; ch.addEventListener('change', () => upd('arrow', ch.checked));
          const lw2 = mk('label', 'fs-chk'); lw2.appendChild(ch); lw2.appendChild(mk('span', '', L2('Con flecha', 'With an arrow'))); gg.appendChild(lw2);
        } else if (A.kind === 'hline') fld(L2('Valor en Y', 'Value on Y'), inp('number', A.y, v => upd('y', v), { step: 'any' }));
        else if (A.kind === 'vline') fld(L2('Valor en X', 'Value on X'), inp('number', A.x, v => upd('x', v), { step: 'any' }));
        else { fld(L2('Ordenada al origen', 'Intercept'), inp('number', A.a, v => upd('a', v), { step: 'any' })); fld(L2('Pendiente', 'Slope'), inp('number', A.b, v => upd('b', v), { step: 'any' })); }
        fld(L2('Tamaño del texto', 'Text size'), inp('number', A.size, v => upd('size', v), { step: 0.5, min: 0, max: 80, placeholder: 'auto' }));
        const cin = inp('color', asHex(A.color || '#5b7266'), v => upd('color', v));
        fld(L2('Color', 'Colour'), cin);
        if (A.kind !== 'text') {
          fld(L2('Grosor', 'Width'), inp('number', A.lw, v => upd('lw', v), { step: 0.1, min: 0.2, max: 5 }));
          fld(L2('Trazo', 'Dash'), selEl([['solid', T('Continuo', 'Solid')], ['dash', T('Discontinuo', 'Dashed')], ['dot', T('Punteado', 'Dotted')], ['dashdot', T('Trazo y punto', 'Dash-dot')]], A.dash || 'dash', v => upd('dash', v)));
        }
        row.querySelector('.fs-adel').addEventListener('click', () => { st.annots.splice(i, 1); buildAnnots(); onStyle(); });
        annotBox.appendChild(row);
      });
      if (!(st.annots || []).length) annotBox.innerHTML = `<p class="fs-hint">${L2('Todavía no hay anotaciones.', 'There are no annotations yet.')}</p>`;
    }

    /* ---- dynamic lists: series, facet titles, panels ---- */
    function rebuildDynamic() { buildSeries(); buildFacets(); buildPanelList(); buildAnnots(); }
    function buildSeries() {
      serBox.innerHTML = '';
      if (!spec.series.length) { serBox.innerHTML = `<p class="fs-hint">${L2('Esta figura no tiene series con nombre.', 'This figure has no named series.')}</p>`; return; }
      const head = mk('div', 'fs-srow fs-thead', `<span>${L2('Ver', 'Show')}</span><span>${L2('Nombre (edítalo)', 'Name (edit it)')}</span><span>${L2('Color', 'Colour')}</span><span>${L2('Orden', 'Order')}</span>`);
      serBox.appendChild(head);
      spec.series.forEach((s, i) => {
        const row = mk('div', 'fs-srow');
        row.innerHTML = `<label class="fs-chk"><input type="checkbox"${!(st.hidden && st.hidden[s.id]) ? ' checked' : ''}><span class="fs-sr-sr"></span></label>` +
          `<input type="text" maxlength="120" value="${esc(st.serLabels && st.serLabels[s.id] != null ? st.serLabels[s.id] : '')}" placeholder="${esc(lab(s.label))}" aria-label="${esc(T('Nombre de ', 'Name of ') + lab(s.label))}">` +
          `<span class="fs-ca"><input type="color" value="${serColor(st, spec, s.id)}" aria-label="${esc(T('Color de ', 'Colour of ') + lab(s.label))}"><label class="fs-chk"><input type="checkbox" class="fs-cauto"${st.serColors && st.serColors[s.id] ? '' : ' checked'}><span>auto</span></label></span>` +
          `<span class="fs-ord"><button type="button" data-d="-1" title="${esc(T('Subir', 'Up'))}">↑</button><button type="button" data-d="1" title="${esc(T('Bajar', 'Down'))}">↓</button></span>`;
        const vis = row.querySelector('input[type=checkbox]'), name = row.querySelector('input[type=text]'),
          col = row.querySelector('input[type=color]'), auto = row.querySelector('.fs-cauto');
        vis.addEventListener('change', () => { st.hidden = Object.assign({}, st.hidden); if (vis.checked) delete st.hidden[s.id]; else st.hidden[s.id] = true; onStyle(); });
        name.addEventListener('input', () => { st.serLabels = Object.assign({}, st.serLabels, { [s.id]: name.value }); onStyle(); });
        col.addEventListener('input', () => { auto.checked = false; st.serColors = Object.assign({}, st.serColors, { [s.id]: col.value }); onStyle(); });
        auto.addEventListener('change', () => { st.serColors = Object.assign({}, st.serColors); if (auto.checked) delete st.serColors[s.id]; else st.serColors[s.id] = col.value; buildSeries(); onStyle(); });
        row.querySelectorAll('.fs-ord button').forEach(b => b.addEventListener('click', () => {
          const ids = (st.order && st.order.length ? st.order.filter(x => spec.series.some(q => q.id === x)) : spec.series.map(q => q.id)).slice();
          spec.series.forEach(q => { if (!ids.includes(q.id)) ids.push(q.id); });
          const k = ids.indexOf(s.id), j = k + (+b.dataset.d);
          if (k < 0 || j < 0 || j >= ids.length) return;
          ids.splice(j, 0, ids.splice(k, 1)[0]); st.order = ids; onStyle();
        }));
        row.querySelector('.fs-sr-sr').style.background = serColor(st, spec, s.id);
        serBox.appendChild(row);
      });
    }
    function buildFacets() {
      facetBox.innerHTML = '';
      if (spec.panels.length < 2) return;
      spec.panels.forEach((p, i) => {
        const row = mk('div', 'fs-f');
        const nm = lab(p.title) || T('Panel ', 'Panel ') + (i + 1);
        row.innerHTML = `<span class="fs-l">${esc(nm)}</span><input type="text" maxlength="160" value="${esc(st.facetTitles && st.facetTitles[p.id] != null ? st.facetTitles[p.id] : '')}" placeholder="${esc(lab(p.title) || '')}" aria-label="${esc(T('Título del panel ', 'Title of panel ') + nm)}">`;
        const inp = row.querySelector('input');
        inp.addEventListener('input', () => { st.facetTitles = Object.assign({}, st.facetTitles, { [p.id]: inp.value }); onStyle(); });
        facetBox.appendChild(row);
      });
    }
    function buildPanelList() {
      panelBox.innerHTML = '';
      if (spec.panels.length < 2) return;
      spec.panels.forEach((p, i) => {
        const l = mk('label', 'fs-chk fs-inline');
        l.innerHTML = `<input type="checkbox"${!(st.panelOff && st.panelOff[p.id]) ? ' checked' : ''}><span>${esc(facetTitle(st, p, i) || String(i + 1))}</span>`;
        const inp = l.querySelector('input');
        inp.addEventListener('change', () => { st.panelOff = Object.assign({}, st.panelOff); if (inp.checked) delete st.panelOff[p.id]; else st.panelOff[p.id] = true; onStyle(); });
        panelBox.appendChild(l);
      });
    }

    /* ================= LOOKS ================= */
    g = section('looks', 'Estilos con un clic', 'One-click looks');
    const presetBox = mk('div', 'fs-presets fs-wide'); g.appendChild(presetBox);
    function buildPresets() {
      presetBox.innerHTML = '';
      PRESETS.forEach(p => {
        const b = mk('button', 'fs-preset'); b.type = 'button';
        b.innerHTML = `<span class="fs-pname">${esc(T(p.es, p.en))}</span><span class="fs-pdes">${esc(T(p.des, p.den))}</span>`;
        b.addEventListener('click', () => { applyStyle(p.s); say('ok', T('Estilo aplicado: ', 'Look applied: ') + esc(T(p.es, p.en))); });
        presetBox.appendChild(b);
      });
    }
    controls.push({ spec: {}, wrap: presetBox, update() {}, fill: buildPresets });
    g = section('looks', 'Guardar, cargar y propagar', 'Save, load and propagate');
    add(g, { t: 'btn', es: 'Guardar estilo (JSON)', en: 'Save style (JSON)', act: () => {
      const o = {}; for (const k of Object.keys(st)) o[k] = st[k];
      downloadBlob(JSON.stringify({ format: 'figure-style', version: 1, kind, style: o }, null, 1), 'figure_style_' + kind + '.json', 'application/json');
      say('ok', T('Estilo guardado.', 'Style saved.'));
    } });
    const fileIn = document.createElement('input'); fileIn.type = 'file'; fileIn.accept = '.json,application/json'; fileIn.hidden = true; panes.looks.appendChild(fileIn);
    add(g, { t: 'btn', es: 'Cargar estilo…', en: 'Load style…', act: () => fileIn.click() });
    fileIn.addEventListener('change', () => {
      const f = fileIn.files[0]; fileIn.value = ''; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => { try { const j = JSON.parse(rd.result); applyStyle(j && j.style ? j.style : j); rebuildDynamic(); say('ok', T('Estilo cargado.', 'Style loaded.')); } catch (e) { say('err', T('El archivo no es un estilo válido.', 'The file is not a valid style.')); } };
      rd.readAsText(f);
    });
    add(g, { t: 'btn', es: 'Aplicar a todas las figuras del paso', en: 'Apply to every figure of the step', act: () => {
      const o = studio.shareStyle(); let n = 0;
      STUDIOS.forEach(s2 => { if (s2 !== studio && s2.group === group && group) { s2.applyStyle(o); n++; } });
      say('ok', T(`Estilo aplicado a ${n} figura(s) más del paso.`, `Look applied to ${n} more figure(s) of the step.`));
    } });
    add(g, { t: 'btn', es: 'Restablecer todo', en: 'Reset everything', act: () => {
      Object.keys(st).forEach(k => { delete st[k]; });
      Object.assign(st, defaultsFor(kind)); rebuildDynamic(); draw(); syncUI(); persist(); say('ok', T('Estilo restablecido.', 'Style reset.'));
    } });
    panes.looks.appendChild(mk('p', 'fs-hint', L2('El último estilo de cada tipo de figura se recuerda en este navegador (sin los textos ni los límites manuales). El archivo JSON guarda todo, incluidos los títulos y las anotaciones.',
      'The last style of each kind of figure is remembered in this browser (without the texts or the manual limits). The JSON file keeps everything, including the titles and the annotations.')));

    /* ================= EXPORT ================= */
    g = section('export', 'Formato y tamaño', 'Format and size');
    const szSpec = () => sizeSpec(ex), isMm = () => !!szSpec().mm, isFactor = () => !szSpec().mm && szSpec().custom !== 'px';
    add(g, { t: 'select', k: 'fmt', store: ex, es: 'Formato', en: 'Format', opts: optsOf([['svg', 'SVG (vectorial)', 'SVG (vector)'], ['png', 'PNG', 'PNG'], ['jpeg', 'JPEG', 'JPEG'], ['webp', 'WebP', 'WebP']]) });
    add(g, { t: 'select', k: 'size', store: ex, es: 'Tamaño', en: 'Size', wide: true, opts: () => Object.keys(SIZES).map(k => [k, T(SIZES[k].es, SIZES[k].en) + (SIZES[k].mm ? ' · ' + SIZES[k].mm[0] + '×' + SIZES[k].mm[1] + ' mm' : '')]) });
    add(g, { t: 'num', k: 'cw', store: ex, es: 'Ancho', en: 'Width', min: 1, max: 20000, when: () => ex.size === 'custom' });
    add(g, { t: 'num', k: 'ch', store: ex, es: 'Alto', en: 'Height', min: 1, max: 20000, when: () => ex.size === 'custom' });
    add(g, { t: 'select', k: 'cunit', store: ex, es: 'Unidad', en: 'Unit', when: () => ex.size === 'custom', opts: optsOf([['px', 'Píxeles', 'Pixels'], ['mm', 'Milímetros (con dpi)', 'Millimetres (with dpi)']]) });
    add(g, { t: 'select', k: 'factor', store: ex, num: true, es: 'Resolución', en: 'Resolution', opts: optsOf([[1, '1×', '1×'], [1.5, '1.5×', '1.5×'], [2, '2×', '2×'], [3, '3×', '3×'], [4, '4×', '4×']]), when: () => isFactor() && ex.fmt !== 'svg' });
    add(g, { t: 'select', k: 'dpi', store: ex, num: true, es: 'Resolución', en: 'Resolution', opts: optsOf([[150, '150 dpi', '150 dpi'], [300, '300 dpi', '300 dpi'], [600, '600 dpi', '600 dpi']]), when: () => isMm() && ex.fmt !== 'svg' });
    add(g, { t: 'range', k: 'quality', store: ex, es: 'Calidad', en: 'Quality', min: 0.5, max: 1, step: 0.01, fmt: v => Math.round(v * 100) + '%', when: () => ex.fmt === 'jpeg' || ex.fmt === 'webp' });
    const info = mk('p', 'fs-info fs-wide'); g.appendChild(info);
    function updateExportInfo() {
      const p = planExport(lastSize, ex);
      let s = ex.fmt === 'svg' ? T('SVG vectorial: ', 'Vector SVG: ') + p.W + ' × ' + p.H + ' px' + (p.mm ? ' (' + p.mm[0] + ' × ' + p.mm[1] + ' mm)' : '')
        : p.outW + ' × ' + p.outH + ' px · ' + p.dpi + ' dpi' + (p.mm ? ' · ' + p.mm[0] + ' × ' + p.mm[1] + ' mm' : '') + (p.limited ? T(' (reducido al máximo permitido)', ' (reduced to the maximum allowed)') : '');
      info.textContent = s;
    }
    const btns = mk('div', 'fs-actions fs-wide'); g.appendChild(btns);
    const bDl = mk('button', 'btn btn-primary', L2('⬇ Descargar figura', '⬇ Download figure')); bDl.type = 'button';
    const bCp = mk('button', 'btn btn-secondary', L2('Copiar al portapapeles', 'Copy to clipboard')); bCp.type = 'button';
    btns.append(bDl, bCp);
    panes.export.appendChild(mk('p', 'fs-hint', L2('La figura se dibuja de nuevo al tamaño elegido, así que los textos guardan su proporción. El SVG es vectorial y se puede editar después; el PNG lleva escrita su resolución física, de modo que los programas de imprenta lo colocan al tamaño correcto.',
      'The figure is drawn again at the chosen size, so the text keeps its proportion. The SVG is vector and can be edited afterwards; the PNG carries its physical resolution, so print programs place it at the right size.')));

    const fileName = ext => ((hooks.fileName ? hooks.fileName() : slugName(state.query) + '_' + (spec.name || kind)) + '').replace(/\.[a-z0-9]+$/i, '') + '.' + ext;
    async function build(o) {
      const opt = Object.assign({}, ex, o || {}), p = planExport(lastSize, opt);
      const out = render(spec, st, p.W, p.H);
      if (opt.fmt === 'svg') return { blob: new Blob([out.svg], { type: 'image/svg+xml;charset=utf-8' }), ext: 'svg' };
      const C = inkSet(st);
      return rasterise(out.svg, p, opt, opt.fmt === 'jpeg' ? (C.transparent ? '#ffffff' : C.paper) : (C.transparent ? null : null));
    }
    studio.exportBlob = build;
    async function doExport(o) {
      say('busy', T('Generando la imagen…', 'Generating the image…'));
      try {
        if (o && o.toClipboard) {
          if (!(navigator.clipboard && window.ClipboardItem)) throw Object.assign(new Error('clipboard'), { clip: true });
          const run = build({ fmt: ex.fmt === 'svg' ? 'png' : ex.fmt }).then(r => r.blob);
          run.catch(() => {});
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': run })]);
          say('ok', T('Figura copiada al portapapeles.', 'Figure copied to the clipboard.'));
          return;
        }
        const r = await build(o);
        const name = (o && o.name) ? String(o.name).replace(/\.[a-z0-9]+$/i, '') + '.' + r.ext : fileName(r.ext);
        downloadBlob(r.blob, name);
        say('ok', esc(T('Guardado: ', 'Saved: ') + name + ' (' + (r.blob.size > 1e6 ? fmt(r.blob.size / 1e6, 1) + ' MB' : Math.round(r.blob.size / 1024) + ' kB') + ')'));
      } catch (e) {
        console.warn('figure studio export', e);
        say('err', e && e.clip ? L2('No se pudo copiar al portapapeles (el navegador lo bloqueó o no lo admite); usa la descarga.', 'Could not copy to the clipboard (the browser blocked it or does not support it); use the download.')
          : L2('No se pudo exportar la figura: ', 'The figure could not be exported: ') + esc(e && e.message || String(e)));
      }
    }
    studio.exportNow = o => doExport(o);
    bDl.addEventListener('click', () => doExport());
    bCp.addEventListener('click', () => doExport({ toClipboard: true }));

    /* ---- mount ---- */
    (opts.after || host).parentNode.insertBefore(panel, (opts.after || host).nextSibling);
    controls.forEach(c => { if (c.fill) c.fill(); });
    rebuildDynamic(); showTab('text'); syncUI(); draw();
    I18N.apply(panel);
    panel.addEventListener('toggle', () => { if (panel.open) { syncUI(); updateExportInfo(); } });
    const onLang = () => { refreshTexts(); draw(); };
    const onTheme = () => { draw(); syncUI(); };
    document.addEventListener('langchange', onLang);
    document.addEventListener('themechange', onTheme);
    if (window.ResizeObserver) {
      let lastW = 0;
      const ro = new ResizeObserver(() => { const w = figWrap.clientWidth; if (w > 10 && Math.abs(w - lastW) > 8) { lastW = w; if (!(+st.figW > 0)) drawSoon(); } });
      try { ro.observe(figWrap); } catch (e) { /* not observable yet */ }
    }
    return studio;
  }

  /* applies one look to every figure of a group (the step) */
  function applyToGroup(group, style) {
    let n = 0;
    STUDIOS.forEach(s => { if (s.group === group) { s.applyStyle(style); n++; } });
    return n;
  }

  window.figstudio = { attach, applyToGroup, studios: STUDIOS, num, PALETTES, PALETTE_NAMES, palColor, FONTS,
    fmtVal, niceTicks, measure, render, SIZES, PRESETS, planExport, defaultsFor, sizeSpec };
})();
