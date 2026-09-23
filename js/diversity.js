/* Step 8 · species diversity: community matrix, alpha and beta diversity, richness estimators,
   rarefaction, abundance models and comparison tests.

   Everything is pure JavaScript (no Python engine), so the section opens at once and works from
   file://. Figures are hand-drawn SVG with colours resolved from the theme, so they can be
   exported as they are and are redrawn when the language or the theme change.

   Honesty note that the module repeats to the user: in a collection of presence records the number
   of records of a taxon measures sampling effort, not population abundance. The indices therefore
   describe the records. Rarefaction and the equal-coverage comparison are the fair way to compare
   sites; the module offers both.

   Methods (author and year only): Shannon 1948; Simpson 1949; Pielou 1966; Hill 1973; Margalef 1958;
   Menhinick 1964; Berger and Parker 1970; Fisher et al. 1943; Hurlbert 1971; Chao 1984, 1987;
   Chao and Lee 1992; Colwell et al. 2012; Chao and Jost 2012; Jost 2006; Baselga 2010;
   Whittaker 1960; Bray and Curtis 1957; Morisita 1959; Hutcheson 1970; Preston 1948;
   Clarke 1993; Kruskal 1964; Gower 1966; Magurran 2004. */

(function () {
  const $ = id => document.getElementById(id);

  /* module state */
  const D = {
    mat: null,          // community matrix
    alpha: null,        // alpha rows (sites + total)
    boot: null,         // bootstrap intervals
    profile: null,      // Hill profiles
    raref: null,        // rarefaction curves
    accum: null,        // sample-based accumulation
    cover: null,        // equal-coverage comparison
    beta: null,         // pairwise matrices + multiple-site betas
    pcoa: null,
    nmds: null,
    rad: null,          // rank-abundance fit of the active site
    contrib: null,
    pairs: null,
    opts: null,         // options used in the last run
    running: false,
  };
  const FIG = {};       // id -> function returning an SVG string

  /* ======================================================================
     1. numerical utilities
     ====================================================================== */

  /* log-gamma (Lanczos): keeps the exact rarefaction formula stable for large samples */
  const LG = [76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  function lgamma(x) {
    if (x <= 0) return Infinity;
    let y = x, tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += LG[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }
  /* table of log-factorials up to nMax, so the rarefaction loops are table look-ups */
  let LFACT = new Float64Array([0, 0]);
  function ensureLfact(n) {
    if (LFACT.length > n) return;
    const t = new Float64Array(n + 2);
    t.set(LFACT);
    for (let i = LFACT.length; i <= n + 1; i++) t[i] = t[i - 1] + Math.log(i);
    LFACT = t;
  }
  const lfact = n => (n < LFACT.length ? LFACT[n] : lgamma(n + 1));
  /* log of the binomial coefficient; -Infinity when it is zero */
  function lnChoose(n, k) {
    if (k < 0 || k > n || n < 0) return -Infinity;
    return lfact(n) - lfact(k) - lfact(n - k);
  }

  /* seeded random numbers, so every interval and permutation can be repeated */
  function rng(seed) {
    let a = (seed | 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* incomplete beta function, for the p value of Student's t */
  function betacf(a, b, x) {
    const FPMIN = 1e-300, qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= 300; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c; h *= del;
      if (Math.abs(del - 1) < 3e-12) break;
    }
    return h;
  }
  function betai(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
  }
  /* two-tailed p value of Student's t with df degrees of freedom */
  function tTwoSided(t, df) {
    if (!isFinite(t) || !isFinite(df) || df <= 0) return NaN;
    return betai(df / 2, 0.5, df / (df + t * t));
  }

  /* quantile of the standard normal distribution (rational approximation) */
  function qnorm(p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
      1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
      6.680131188771972e+01, -1.328068155288572e+01];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
      -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    const pl = 0.02425;
    let q, r;
    if (p < pl) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if (p > 1 - pl) {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }

  /* golden-section minimisation on [lo, hi] */
  function golden(f, lo, hi, tol = 1e-8) {
    const gr = (Math.sqrt(5) - 1) / 2;
    let a = lo, b = hi, c = b - gr * (b - a), d = a + gr * (b - a);
    let fc = f(c), fd = f(d);
    for (let i = 0; i < 200 && Math.abs(b - a) > tol; i++) {
      if (fc < fd) { b = d; d = c; fd = fc; c = b - gr * (b - a); fc = f(c); }
      else { a = c; c = d; fc = fd; d = a + gr * (b - a); fd = f(d); }
    }
    return (a + b) / 2;
  }
  /* Nelder and Mead simplex, for the two-parameter abundance models */
  function nelderMead(f, x0, step, iters = 400) {
    const n = x0.length;
    let S = [x0.slice()];
    for (let i = 0; i < n; i++) { const p = x0.slice(); p[i] += step[i]; S.push(p); }
    let F = S.map(f);
    for (let it = 0; it < iters; it++) {
      const ord = F.map((v, i) => i).sort((i, j) => F[i] - F[j]);
      S = ord.map(i => S[i]); F = ord.map(i => F[i]);
      if (Math.abs(F[n] - F[0]) < 1e-10) break;
      const cen = new Array(n).fill(0);
      for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) cen[k] += S[i][k] / n;
      const refl = cen.map((v, k) => v + (v - S[n][k])), fr = f(refl);
      if (fr < F[0]) {
        const exp = cen.map((v, k) => v + 2 * (v - S[n][k])), fe = f(exp);
        if (fe < fr) { S[n] = exp; F[n] = fe; } else { S[n] = refl; F[n] = fr; }
      } else if (fr < F[n - 1]) { S[n] = refl; F[n] = fr; }
      else {
        const con = cen.map((v, k) => v + 0.5 * (S[n][k] - v)), fc = f(con);
        if (fc < F[n]) { S[n] = con; F[n] = fc; }
        else for (let i = 1; i <= n; i++) { S[i] = S[i].map((v, k) => S[0][k] + 0.5 * (v - S[0][k])); F[i] = f(S[i]); }
      }
    }
    const best = F.indexOf(Math.min(...F));
    return { x: S[best], f: F[best] };
  }

  /* pool adjacent violators: monotone non-decreasing least-squares fit, for the NMDS disparities */
  function pava(y, w) {
    const n = y.length, v = Float64Array.from(y), ww = w ? Float64Array.from(w) : new Float64Array(n).fill(1);
    const lvl = new Float64Array(n), wt = new Float64Array(n), idx = new Int32Array(n);
    let j = -1;
    for (let i = 0; i < n; i++) {
      j++; lvl[j] = v[i]; wt[j] = ww[i]; idx[j] = 1;
      while (j > 0 && lvl[j - 1] > lvl[j]) {
        const w2 = wt[j - 1] + wt[j];
        lvl[j - 1] = (wt[j - 1] * lvl[j - 1] + wt[j] * lvl[j]) / w2;
        wt[j - 1] = w2; idx[j - 1] += idx[j]; j--;
      }
    }
    const out = new Float64Array(n);
    let k = 0;
    for (let b = 0; b <= j; b++) for (let c = 0; c < idx[b]; c++) out[k++] = lvl[b];
    return out;
  }

  /* cyclic Jacobi rotations: eigenvalues and eigenvectors of a symmetric matrix (used by the PCoA).
     Each rotation zeroes one off-diagonal pair and is applied in place to the matrix and to the
     accumulated rotations, which are the eigenvectors. */
  function jacobiEigen(Ain, sweeps = 100) {
    const n = Ain.length, A = Ain.map(r => Float64Array.from(r));
    const V = Array.from({ length: n }, (_, i) => { const r = new Float64Array(n); r[i] = 1; return r; });
    for (let s = 0; s < sweeps; s++) {
      let off = 0;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
      if (off < 1e-26) break;
      for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) {
        const apq = A[p][q];
        if (Math.abs(apq) < 1e-300) continue;
        const theta = (A[q][q] - A[p][p]) / (2 * apq);
        const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), sn = t * c;
        A[p][p] -= t * apq;
        A[q][q] += t * apq;
        A[p][q] = A[q][p] = 0;
        for (let k = 0; k < n; k++) {
          if (k === p || k === q) continue;
          const akp = A[k][p], akq = A[k][q];
          A[k][p] = A[p][k] = c * akp - sn * akq;
          A[k][q] = A[q][k] = sn * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k][p], vkq = V[k][q];
          V[k][p] = c * vkp - sn * vkq;
          V[k][q] = sn * vkp + c * vkq;
        }
      }
    }
    const ev = Array.from({ length: n }, (_, i) => i).sort((i, j) => A[j][j] - A[i][i]);
    return { values: ev.map(i => A[i][i]), vectors: ev.map(i => V.map(r => r[i])) };
  }

  const sum = a => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s; };
  const maxOf = a => { let m = -Infinity; for (let i = 0; i < a.length; i++) if (a[i] > m) m = a[i]; return m; };
  /* percentile of an unsorted array */
  function pct(arr, q) {
    const s = Array.from(arr).sort((a, b) => a - b);
    return quantile(s, q);
  }
  /* exact p value with the wording asked for: "p = 0.0032", and "p < 0.001" only below that */
  function pText(p) {
    if (p == null || !isFinite(p)) return '—';
    if (p < 0.001) return 'p < 0.001';
    return 'p = ' + p.toFixed(4);
  }
  const pCell = p => (p == null || !isFinite(p)) ? '—' : (p < 0.001 ? '< 0.001' : p.toFixed(4));
  /* Holm's step-down correction for multiple testing */
  function holm(ps) {
    const n = ps.length, ord = ps.map((v, i) => i).sort((i, j) => ps[i] - ps[j]), out = new Array(n);
    let prev = 0;
    ord.forEach((i, k) => { const v = Math.min(1, Math.max(prev, (n - k) * ps[i])); out[i] = v; prev = v; });
    return out;
  }

  /* ======================================================================
     2. the records and the community matrix
     ====================================================================== */

  /* the module works with whatever the app already has: the table of step 5 when it exists
     (it carries climate, soil and elevation), otherwise the clean records of step 3 */
  function records() {
    const t = (state.env && state.env.table) || [];
    if (t.length) return { rows: t, src: 'env' };
    const c = state.clean || [];
    if (c.length) return { rows: c, src: 'clean' };
    return { rows: [], src: 'none' };
  }
  const elevOf = r => (r.elev != null ? +r.elev : (r.elevation != null ? +r.elevation : null));

  /* cluster of step 8 for each record, matched by coordinates */
  function clusterIndex() {
    const pts = (typeof clusterPts !== 'undefined' && clusterPts) ? clusterPts : null;
    if (!pts || !pts.length) return null;
    const m = new Map();
    pts.forEach(p => m.set(p.lat.toFixed(5) + ',' + p.lon.toFixed(5), p.cluster));
    return m;
  }

  /* which ways of defining a site the data allow */
  function siteModes() {
    const { rows } = records(), out = [];
    const has = f => rows.some(f);
    out.push(['grid', { es: 'una celda de una malla', en: 'a grid cell' }]);
    if (has(r => r.country)) out.push(['country', { es: 'un país', en: 'a country' }]);
    if (has(r => r.stateProvince)) out.push(['state', { es: 'un estado o provincia', en: 'a state or province' }]);
    if (has(r => r.koppen_code)) out.push(['koppen', { es: 'una clase climática de Köppen', en: 'a Köppen climate class' }]);
    if (has(r => r.soil_wrb)) out.push(['soil', { es: 'un tipo de suelo', en: 'a soil type' }]);
    if (has(r => elevOf(r) != null)) out.push(['elev', { es: 'un tramo del gradiente altitudinal', en: 'a band of the elevation gradient' }]);
    if (clusterIndex()) out.push(['cluster', { es: 'un grupo del agrupamiento de arriba', en: 'a cluster from the clustering above' }]);
    return out;
  }
  function taxonLevels() {
    const { rows } = records(), out = [];
    if (rows.some(r => r.taxon)) out.push(['taxon', { es: 'el taxón con sus subespecies y variedades', en: 'the taxon with its subspecies and varieties' }]);
    if (rows.some(r => r.species)) out.push(['species', { es: 'la especie', en: 'the species' }]);
    if (!out.length) out.push(['taxon', { es: 'el taxón', en: 'the taxon' }]);
    return out;
  }

  /* site key and label of one record */
  function siteOf(r, o, ctx) {
    switch (o.mode) {
      case 'country': return r.country ? { k: 'c:' + r.country, l: r.country } : null;
      case 'state': return r.stateProvince ? { k: 's:' + r.stateProvince, l: r.stateProvince } : null;
      case 'koppen': return r.koppen_code ? { k: 'k:' + r.koppen_code, l: String(r.koppen_code) } : null;
      case 'soil': return r.soil_wrb ? { k: 'w:' + r.soil_wrb, l: String(r.soil_wrb) } : null;
      case 'elev': {
        const e = elevOf(r);
        if (e == null || !isFinite(e)) return null;
        const b = Math.min(ctx.bands - 1, Math.floor((e - ctx.emin) / ctx.bw));
        const lo = Math.round(ctx.emin + b * ctx.bw), hi = Math.round(ctx.emin + (b + 1) * ctx.bw);
        return { k: 'e:' + b, l: lo + '–' + hi + ' m', order: b };
      }
      case 'cluster': {
        const c = ctx.cl.get(r.decimalLatitude.toFixed(5) + ',' + r.decimalLongitude.toFixed(5));
        if (c == null) return null;
        return { k: 'g:' + c, l: c === 0 ? { es: 'ruido', en: 'noise' } : { es: 'grupo ' + c, en: 'cluster ' + c }, order: c };
      }
      default: {
        const gy = Math.floor(r.decimalLatitude / ctx.dLat), gx = Math.floor(r.decimalLongitude / ctx.dLon);
        const cy = (gy + 0.5) * ctx.dLat, cx = (gx + 0.5) * ctx.dLon;
        /* the centre of the cell, with the hemisphere letters so no minus sign is needed */
        const l = `${Math.abs(cy).toFixed(2)} ${cy >= 0 ? 'N' : 'S'}, ${Math.abs(cx).toFixed(2)} ${cx >= 0 ? 'E' : 'W'}`;
        return { k: 'm:' + gy + ',' + gx, l, order: -gy * 1e6 + gx };
      }
    }
  }

  /* builds the sites x taxa matrix of record counts */
  function buildMatrix(o) {
    const { rows, src } = records();
    if (!rows.length) return null;
    const ctx = {};
    if (o.mode === 'grid') {
      const latm = rows.reduce((s, r) => s + r.decimalLatitude, 0) / rows.length;
      if (o.unit === 'km') {
        ctx.dLat = o.size / 110.574;
        ctx.dLon = o.size / (111.320 * Math.max(0.15, Math.cos(latm * Math.PI / 180)));
      } else { ctx.dLat = o.size; ctx.dLon = o.size; }
    } else if (o.mode === 'elev') {
      const es = rows.map(elevOf).filter(v => v != null && isFinite(v));
      ctx.emin = Math.min(...es); const emax = Math.max(...es);
      ctx.bands = Math.max(2, o.bands | 0);
      ctx.bw = Math.max(1e-6, (emax - ctx.emin) / ctx.bands);
    } else if (o.mode === 'cluster') {
      ctx.cl = clusterIndex();
      if (!ctx.cl) return null;
    }

    const sMap = new Map(), tMap = new Map();
    let unassigned = 0, noTaxon = 0;
    const pairs = [];
    for (const r of rows) {
      if (r.decimalLatitude == null || r.decimalLongitude == null) { unassigned++; continue; }
      const s = siteOf(r, o, ctx);
      if (!s) { unassigned++; continue; }
      const tx = o.level === 'species' ? (r.species || r.taxon) : (r.taxon || r.species || r.scientificName);
      if (!tx) { noTaxon++; continue; }
      if (!sMap.has(s.k)) sMap.set(s.k, { id: s.k, label: s.l, order: s.order, n: 0 });
      if (!tMap.has(tx)) tMap.set(tx, { name: tx, n: 0 });
      sMap.get(s.k).n++; tMap.get(tx).n++;
      pairs.push([s.k, tx]);
    }
    if (!sMap.size || !tMap.size) return null;

    /* sites below the threshold are dropped, and the user is told which ones */
    const minN = Math.max(1, o.minN | 0);
    const dropped = [...sMap.values()].filter(s => s.n < minN).sort((a, b) => b.n - a.n);
    const keep = new Set([...sMap.values()].filter(s => s.n >= minN).map(s => s.id));
    if (!keep.size) return { empty: true, dropped, nSitesAll: sMap.size, minN, src };

    let sites = [...sMap.values()].filter(s => keep.has(s.id));
    sites.sort((a, b) => (a.order != null && b.order != null) ? a.order - b.order : b.n - a.n);
    const sIdx = new Map(sites.map((s, i) => [s.id, i]));

    /* taxa kept: those that still have at least one record in the kept sites */
    const tCount = new Map();
    pairs.forEach(([sk, tx]) => { if (keep.has(sk)) tCount.set(tx, (tCount.get(tx) || 0) + 1); });
    const taxa = [...tCount.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).map(e => e[0]);
    const tIdx = new Map(taxa.map((t, i) => [t, i]));

    const nS = sites.length, nT = taxa.length, M = new Int32Array(nS * nT);
    pairs.forEach(([sk, tx]) => { if (keep.has(sk)) M[sIdx.get(sk) * nT + tIdx.get(tx)]++; });

    sites = sites.map((s, i) => {
      let n = 0, S = 0;
      for (let j = 0; j < nT; j++) { const v = M[i * nT + j]; n += v; if (v > 0) S++; }
      return { id: s.id, label: s.label, n, S };
    });
    const colTot = new Int32Array(nT);
    for (let i = 0; i < nS; i++) for (let j = 0; j < nT; j++) colTot[j] += M[i * nT + j];
    const total = sum(colTot);
    ensureLfact(total + 2);

    return { sites, taxa, M, nS, nT, colTot, total, dropped, minN, src, unassigned, noTaxon, nSitesAll: sMap.size };
  }

  const rowOf = (m, i) => m.M.subarray(i * m.nT, (i + 1) * m.nT);

  /* ======================================================================
     3. alpha diversity
     ====================================================================== */

  /* every alpha index of one count vector. base = e, 2 or 10 for Shannon and Pielou */
  function alphaOf(x, base) {
    const lb = base === 2 ? Math.LN2 : base === 10 ? Math.LN10 : 1;
    let n = 0, S = 0, f1 = 0, f2 = 0, He = 0, sp2 = 0, mx = 0, lfSum = 0, sumIi = 0, nRare = 0, sRare = 0;
    const fk = new Int32Array(11);
    for (let j = 0; j < x.length; j++) {
      const v = x[j];
      if (v <= 0) continue;
      n += v; S++;
      if (v === 1) f1++; else if (v === 2) f2++;
      if (v <= 10) { fk[v]++; nRare += v; sRare++; sumIi += v * (v - 1); }
      if (v > mx) mx = v;
      lfSum += lfact(v);
    }
    if (!n) return null;
    for (let j = 0; j < x.length; j++) {
      const v = x[j];
      if (v <= 0) continue;
      const p = v / n;
      He -= p * Math.log(p);
      sp2 += p * p;
    }
    const H = He / lb, Hmax = Math.log(S) / lb;
    const q1 = Math.exp(He), q2 = sp2 > 0 ? 1 / sp2 : NaN;

    /* Fisher's log-series alpha: solve S = a ln(1 + n/a) */
    let fisher = null;
    if (S < n) {
      const f = a => a * Math.log(1 + n / a) - S;
      let lo = 1e-6, hi = Math.max(10, n);
      while (f(hi) < 0 && hi < 1e12) hi *= 2;
      for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (f(mid) > 0) hi = mid; else lo = mid; }
      fisher = (lo + hi) / 2;
    }

    /* sample coverage: Good and Turing, with the correction of Chao and Jost (2012) */
    let cov;
    if (f1 === 0) cov = 1;
    else if (f2 > 0) cov = 1 - (f1 / n) * ((n - 1) * f1 / ((n - 1) * f1 + 2 * f2));
    else cov = 1 - (f1 / n) * ((n - 1) * (f1 - 1) / ((n - 1) * (f1 - 1) + 2));
    const covGT = 1 - f1 / n;

    /* Chao1, classic and bias-corrected, with its variance and asymmetric interval */
    const chao1 = f2 > 0 ? S + f1 * f1 / (2 * f2) : S + f1 * (f1 - 1) / 2;
    const k = (n - 1) / n;
    const chao1bc = S + k * f1 * (f1 - 1) / (2 * (f2 + 1));
    let vr;
    if (f2 > 0) {
      const r = f1 / f2;
      vr = f2 * (0.5 * r * r + r * r * r + 0.25 * r * r * r * r);
    } else if (f1 > 0) {
      vr = f1 * (f1 - 1) / 2 + f1 * (2 * f1 - 1) * (2 * f1 - 1) / 4 - (f1 * f1 * f1 * f1) / (4 * Math.max(chao1, 1));
      vr = Math.max(vr, 0);
    } else vr = 0;
    let lo = chao1, hi = chao1;
    const Tt = chao1 - S;
    if (Tt > 0 && vr > 0) {
      const KK = Math.exp(1.959964 * Math.sqrt(Math.log(1 + vr / (Tt * Tt))));
      lo = S + Tt / KK; hi = S + Tt * KK;
    } else if (vr > 0) {
      /* no undetected taxa are estimated: the interval follows Chao (1987) for that case */
      const P = Math.exp(-f1 / Math.max(S, 1));
      lo = S / (1 - P); hi = S / (1 - P);
    }

    /* ACE (Chao and Lee 1992), with the rare / abundant cut at 10 records */
    let ace = null, cAce = null;
    const sAbund = S - sRare;
    if (nRare > 0) {
      cAce = 1 - f1 / nRare;
      if (cAce > 0) {
        let g2 = (sRare / cAce) * sumIi / Math.max(1, nRare * (nRare - 1)) - 1;
        g2 = Math.max(g2, 0);
        ace = sAbund + sRare / cAce + (f1 / cAce) * g2;
      }
    } else ace = S;

    /* jackknife richness estimators */
    const jack1 = S + f1 * (n - 1) / n;
    const jack2 = n > 2 ? S + f1 * (2 * n - 3) / n - f2 * (n - 2) * (n - 2) / (n * (n - 1)) : null;

    return {
      n, S, f1, f2,
      H, Hmax, He, J: S > 1 ? H / Hmax : (S === 1 ? 0 : NaN),
      D: sp2, D1: 1 - sp2, Dinv: q2,
      q0: S, q1, q2,
      bp: mx / n,
      marg: n > 1 ? (S - 1) / Math.log(n) : NaN,
      menh: S / Math.sqrt(n),
      bril: (lfact(n) - lfSum) / n,
      fisher, cov, covGT,
      chao1, chao1bc, chao1var: vr, chao1lo: lo, chao1hi: hi,
      ace, jack1, jack2,
    };
  }

  /* Hill number of order q */
  function hill(p, q) {
    if (Math.abs(q - 1) < 1e-9) {
      let h = 0;
      for (let i = 0; i < p.length; i++) if (p[i] > 0) h -= p[i] * Math.log(p[i]);
      return Math.exp(h);
    }
    let s = 0;
    for (let i = 0; i < p.length; i++) if (p[i] > 0) s += Math.pow(p[i], q);
    return Math.pow(s, 1 / (1 - q));
  }
  const propOf = x => { const n = sum(x); return Float64Array.from(x, v => v / n); };

  /* incidence-based estimators across sites: Chao2 and ICE */
  function incidenceEstimators(m) {
    const inc = new Int32Array(m.nT);
    for (let i = 0; i < m.nS; i++) for (let j = 0; j < m.nT; j++) if (m.M[i * m.nT + j] > 0) inc[j]++;
    const mm = m.nS;
    let Q1 = 0, Q2 = 0, S = 0;
    const Qk = new Int32Array(11);
    for (let j = 0; j < m.nT; j++) {
      const v = inc[j];
      if (!v) continue;
      S++;
      if (v === 1) Q1++; else if (v === 2) Q2++;
      if (v <= 10) Qk[v]++;
    }
    const chao2 = Q2 > 0 ? S + ((mm - 1) / mm) * Q1 * Q1 / (2 * Q2) : S + ((mm - 1) / mm) * Q1 * (Q1 - 1) / 2;
    const chao2bc = S + ((mm - 1) / mm) * Q1 * (Q1 - 1) / (2 * (Q2 + 1));
    /* ICE: taxa present in 10 sites or fewer are the infrequent ones */
    let sInfr = 0, nInfr = 0, sumJj = 0;
    for (let j = 1; j <= 10; j++) { sInfr += Qk[j]; nInfr += j * Qk[j]; sumJj += j * (j - 1) * Qk[j]; }
    const sFreq = S - sInfr;
    let mInfr = 0;
    for (let i = 0; i < m.nS; i++) {
      let any = false;
      for (let j = 0; j < m.nT && !any; j++) if (m.M[i * m.nT + j] > 0 && inc[j] <= 10) any = true;
      if (any) mInfr++;
    }
    let ice = null;
    if (nInfr > 0) {
      const cIce = 1 - Q1 / nInfr;
      if (cIce > 0 && mInfr > 1) {
        let g2 = (sInfr / cIce) * (mInfr / (mInfr - 1)) * sumJj / Math.max(1, nInfr * (nInfr - 1)) - 1;
        g2 = Math.max(g2, 0);
        ice = sFreq + sInfr / cIce + (Q1 / cIce) * g2;
      }
    } else ice = S;
    return { S, Q1, Q2, m: mm, chao2, chao2bc, ice, inc };
  }

  /* bootstrap percentile intervals of H', Simpson and evenness */
  function bootstrapCI(x, base, reps, seed) {
    const p = propOf(x), n = sum(x), S = p.reduce((s, v) => s + (v > 0 ? 1 : 0), 0);
    if (S < 2 || n < 4) return null;
    const cum = new Float64Array(p.length);
    let acc = 0;
    for (let i = 0; i < p.length; i++) { acc += p[i]; cum[i] = acc; }
    const R = rng(seed), hs = new Float64Array(reps), ds = new Float64Array(reps), js = new Float64Array(reps);
    const cnt = new Int32Array(p.length);
    const lb = base === 2 ? Math.LN2 : base === 10 ? Math.LN10 : 1;
    for (let b = 0; b < reps; b++) {
      cnt.fill(0);
      for (let d = 0; d < n; d++) {
        const u = R();
        let lo = 0, hi = cum.length - 1;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (u <= cum[mid]) hi = mid; else lo = mid + 1; }
        cnt[lo]++;
      }
      let He = 0, sp2 = 0, Sb = 0;
      for (let i = 0; i < cnt.length; i++) {
        if (!cnt[i]) continue;
        Sb++;
        const q = cnt[i] / n;
        He -= q * Math.log(q); sp2 += q * q;
      }
      hs[b] = He / lb; ds[b] = 1 - sp2; js[b] = Sb > 1 ? (He / lb) / (Math.log(Sb) / lb) : 0;
    }
    return {
      H: [pct(hs, 0.025), pct(hs, 0.975)], D1: [pct(ds, 0.025), pct(ds, 0.975)],
      J: [pct(js, 0.025), pct(js, 0.975)], reps,
    };
  }

  /* ======================================================================
     4. rarefaction, accumulation and coverage
     ====================================================================== */

  /* Hurlbert's (1971) expected richness of a subsample of m records, with the exact
     hypergeometric formula evaluated through log-factorials */
  function rarefyE(x, m) {
    const n = sum(x);
    if (m <= 0) return 0;
    if (m >= n) return x.reduce((s, v) => s + (v > 0 ? 1 : 0), 0);
    const lcn = lnChoose(n, m);
    let e = 0;
    for (let i = 0; i < x.length; i++) {
      const v = x[i];
      if (v <= 0) continue;
      const lc = lnChoose(n - v, m);
      e += 1 - (lc === -Infinity ? 0 : Math.exp(lc - lcn));
    }
    return e;
  }
  /* analytical variance of the rarefied richness (Heck, van Belle and Simberloff 1975) */
  function rarefyVar(x, m) {
    const n = sum(x), xs = [];
    for (let i = 0; i < x.length; i++) if (x[i] > 0) xs.push(x[i]);
    if (m <= 0 || m >= n) return 0;
    const lcn = lnChoose(n, m);
    const pr = xs.map(v => { const lc = lnChoose(n - v, m); return lc === -Infinity ? 0 : Math.exp(lc - lcn); });
    let v1 = 0;
    for (let i = 0; i < xs.length; i++) v1 += pr[i] * (1 - pr[i]);
    let v2 = 0;
    for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) {
      const lc = lnChoose(n - xs[i] - xs[j], m);
      const pij = lc === -Infinity ? 0 : Math.exp(lc - lcn);
      v2 += pij - pr[i] * pr[j];
    }
    return Math.max(0, v1 + 2 * v2);
  }
  /* estimated sample coverage of a subsample of m records (Chao and Jost 2012) */
  function coverageAt(x, m) {
    const n = sum(x);
    if (m >= n) {
      let f1 = 0, f2 = 0;
      for (let i = 0; i < x.length; i++) { if (x[i] === 1) f1++; else if (x[i] === 2) f2++; }
      if (f1 === 0) return 1;
      if (f2 > 0) return 1 - (f1 / n) * ((n - 1) * f1 / ((n - 1) * f1 + 2 * f2));
      return 1 - (f1 / n) * ((n - 1) * (f1 - 1) / ((n - 1) * (f1 - 1) + 2));
    }
    const lcd = lnChoose(n - 1, m);
    let s = 0;
    for (let i = 0; i < x.length; i++) {
      const v = x[i];
      if (v <= 0) continue;
      const lc = lnChoose(n - v, m);
      if (lc === -Infinity) continue;
      s += (v / n) * Math.exp(lc - lcd);
    }
    return 1 - s;
  }
  /* extrapolation beyond n (Colwell et al. 2012): expected richness with m* extra records */
  function extrapolate(x, mStar) {
    const n = sum(x);
    let S = 0, f1 = 0, f2 = 0;
    for (let i = 0; i < x.length; i++) { if (x[i] > 0) S++; if (x[i] === 1) f1++; else if (x[i] === 2) f2++; }
    const f0 = f2 > 0 ? ((n - 1) / n) * f1 * f1 / (2 * f2) : ((n - 1) / n) * f1 * (f1 - 1) / 2;
    if (f0 <= 0 || f1 <= 0) return S;
    return S + f0 * (1 - Math.pow(1 - f1 / (n * f0 + f1), mStar));
  }

  /* rarefaction curve of one count vector, with the band and the extrapolated part */
  function rarefyCurve(x, opts) {
    const n = sum(x), pts = [];
    const steps = Math.min(opts.points || 30, n);
    const grid = [];
    for (let k = 1; k <= steps; k++) grid.push(Math.max(1, Math.round(n * k / steps)));
    if (grid[grid.length - 1] !== n) grid.push(n);
    const uniq = [...new Set(grid)].sort((a, b) => a - b);
    const heavy = x.filter(v => v > 0).length;
    for (const m of uniq) {
      const e = rarefyE(x, m);
      const v = (opts.band && heavy <= 400) ? rarefyVar(x, m) : 0;
      const sd = Math.sqrt(v);
      pts.push({ m, e, sd, lo: Math.max(0, e - 1.959964 * sd), hi: e + 1.959964 * sd, ext: false });
    }
    if (opts.extrap) {
      const ex = [];
      for (let k = 1; k <= 12; k++) {
        const mStar = Math.round(n * k / 12);
        ex.push({ m: n + mStar, e: extrapolate(x, mStar), sd: 0, lo: NaN, hi: NaN, ext: true });
      }
      pts.push(...ex);
    }
    return pts;
  }

  /* sample-based accumulation: mean richness over seeded permutations of the sites */
  function accumulation(m, reps, seed) {
    const R = rng(seed), nS = m.nS, nT = m.nT;
    const meanS = new Float64Array(nS), m2 = new Float64Array(nS);
    const seen = new Uint8Array(nT), order = new Int32Array(nS);
    for (let i = 0; i < nS; i++) order[i] = i;
    for (let rep = 0; rep < reps; rep++) {
      for (let i = nS - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
      seen.fill(0);
      let s = 0;
      for (let k = 0; k < nS; k++) {
        const row = order[k] * nT;
        for (let j = 0; j < nT; j++) if (m.M[row + j] > 0 && !seen[j]) { seen[j] = 1; s++; }
        meanS[k] += s; m2[k] += s * s;
      }
    }
    return Array.from({ length: nS }, (_, k) => {
      const mu = meanS[k] / reps, va = Math.max(0, m2[k] / reps - mu * mu);
      const sd = Math.sqrt(va);
      return { k: k + 1, e: mu, sd, lo: Math.max(0, mu - 1.959964 * sd), hi: mu + 1.959964 * sd };
    });
  }

  /* comparison at equal coverage: the reference is the smallest of the sites' own coverages */
  function coverageComparison(m) {
    const rows = [];
    let base = 1;
    for (let i = 0; i < m.nS; i++) {
      const x = rowOf(m, i), c = coverageAt(x, sum(x));
      if (isFinite(c)) base = Math.min(base, c);
    }
    for (let i = 0; i < m.nS; i++) {
      const x = rowOf(m, i), n = sum(x), own = coverageAt(x, n);
      let mStar = null, sStar = null, exact = true;
      if (own >= base) {
        /* the smallest m whose coverage already reaches the reference */
        let lo = 1, hi = n;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (coverageAt(x, mid) >= base) hi = mid; else lo = mid + 1; }
        mStar = lo; sStar = rarefyE(x, lo);
      } else { exact = false; }
      rows.push({ site: m.sites[i].label, id: m.sites[i].id, n, S: m.sites[i].S, cov: own, mStar, sStar, exact });
    }
    return { base, rows };
  }

  /* ======================================================================
     5. beta diversity
     ====================================================================== */

  /* every pairwise index at once, so the matrices are built in a single pass */
  function betaMatrices(m) {
    const nS = m.nS, nT = m.nT;
    const names = ['jaccard', 'sorensen', 'bray', 'morisita', 'sim', 'sne'];
    const out = {};
    names.forEach(k => { out[k] = Array.from({ length: nS }, () => new Float64Array(nS)); });
    const rowSum = new Float64Array(nS), rowSq = new Float64Array(nS);
    for (let i = 0; i < nS; i++) {
      const r = rowOf(m, i);
      for (let j = 0; j < nT; j++) { rowSum[i] += r[j]; rowSq[i] += r[j] * r[j]; }
    }
    let sumMin = 0, sumMax = 0, sumSi = 0;
    for (let i = 0; i < nS; i++) sumSi += m.sites[i].S;
    for (let i = 0; i < nS; i++) for (let j = i + 1; j < nS; j++) {
      const a1 = i * nT, a2 = j * nT;
      let a = 0, b = 0, c = 0, dAbs = 0, dSum = 0, cross = 0;
      for (let t = 0; t < nT; t++) {
        const x = m.M[a1 + t], y = m.M[a2 + t];
        if (x > 0 && y > 0) a++; else if (x > 0) b++; else if (y > 0) c++;
        dAbs += Math.abs(x - y); dSum += x + y; cross += x * y;
      }
      const jac = (b + c) / Math.max(1e-12, a + b + c);
      const sor = (b + c) / Math.max(1e-12, 2 * a + b + c);
      const bray = dSum > 0 ? dAbs / dSum : 0;
      const l1 = rowSq[i] / Math.max(1e-12, rowSum[i] * rowSum[i]);
      const l2 = rowSq[j] / Math.max(1e-12, rowSum[j] * rowSum[j]);
      const mh = (l1 + l2) > 0 && rowSum[i] > 0 && rowSum[j] > 0
        ? 1 - 2 * cross / ((l1 + l2) * rowSum[i] * rowSum[j]) : 1;
      const mn = Math.min(b, c), mxbc = Math.max(b, c);
      const sim = (a + mn) > 0 ? mn / (a + mn) : 0;
      const sne = Math.max(0, sor - sim);
      sumMin += mn; sumMax += mxbc;
      const set = (k, v) => { out[k][i][j] = out[k][j][i] = v; };
      set('jaccard', jac); set('sorensen', sor); set('bray', Math.min(1, Math.max(0, bray)));
      set('morisita', Math.min(1, Math.max(0, mh))); set('sim', sim); set('sne', sne);
    }
    /* multiple-site partition (Baselga 2010) */
    const A = sumSi - m.nT;
    const bSim = (sumMin + A) > 0 ? sumMin / (sumMin + A) : 0;
    const bSor = (2 * A + sumMin + sumMax) > 0 ? (sumMin + sumMax) / (2 * A + sumMin + sumMax) : 0;
    const bSne = Math.max(0, bSor - bSim);
    const meanS = sumSi / nS;
    const bW = meanS > 0 ? m.nT / meanS - 1 : NaN;
    return { mats: out, multi: { bSor, bSim, bSne, bW, meanS, sTotal: m.nT } };
  }

  /* average-linkage (UPGMA) tree of a dissimilarity matrix, plus the leaf order */
  function upgma(Dm) {
    const n = Dm.length;
    if (n < 2) return { root: { id: 0, m: [0], h: 0 }, order: [0] };
    let cl = Array.from({ length: n }, (_, i) => ({ m: [i], id: i, h: 0 }));
    let next = n;
    const dist = (a, b) => {
      let s = 0;
      for (const i of a.m) for (const j of b.m) s += Dm[i][j];
      return s / (a.m.length * b.m.length);
    };
    while (cl.length > 1) {
      let bi = 0, bj = 1, bd = Infinity;
      for (let i = 0; i < cl.length; i++) for (let j = i + 1; j < cl.length; j++) {
        const d = dist(cl[i], cl[j]);
        if (d < bd) { bd = d; bi = i; bj = j; }
      }
      const node = { m: cl[bi].m.concat(cl[bj].m), id: next++, h: bd, a: cl[bi], b: cl[bj] };
      cl = cl.filter((_, k) => k !== bi && k !== bj);
      cl.push(node);
    }
    const order = [];
    (function walk(nd) { if (nd.a) { walk(nd.a); walk(nd.b); } else order.push(nd.id); })(cl[0]);
    return { root: cl[0], order };
  }

  /* principal coordinates: Gower's (1966) double centring of -D^2/2 */
  function pcoa(Dm) {
    const n = Dm.length;
    if (n < 3) return null;
    const A = Array.from({ length: n }, (_, i) => Float64Array.from({ length: n }, (_, j) => -0.5 * Dm[i][j] * Dm[i][j]));
    const rm = new Float64Array(n);
    let gm = 0;
    for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += A[i][j]; rm[i] = s / n; gm += s; }
    gm /= n * n;
    const G = Array.from({ length: n }, (_, i) => Float64Array.from({ length: n }, (_, j) => A[i][j] - rm[i] - rm[j] + gm));
    const e = jacobiEigen(G.map(r => Array.from(r)));
    const posSum = e.values.reduce((s, v) => s + Math.max(0, v), 0) || 1;
    const dims = [];
    for (let k = 0; k < Math.min(4, n); k++) {
      const lam = e.values[k];
      if (lam <= 1e-10) break;
      dims.push({ lam, pct: 100 * lam / posSum, coord: e.vectors[k].map(v => v * Math.sqrt(lam)) });
    }
    return dims.length >= 2 ? { dims, values: e.values, posSum } : null;
  }

  /* non-metric multidimensional scaling: Kruskal's (1964) stress 1 minimised by gradient descent */
  function nmdsFit(Dm, opts) {
    const n = Dm.length;
    if (n < 4) return null;
    const pairs = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs.push([i, j, Dm[i][j]]);
    pairs.sort((a, b) => a[2] - b[2]);
    const np = pairs.length, obs = Float64Array.from(pairs, p => p[2]);
    const sumObs2 = obs.reduce((s, v) => s + v * v, 0);
    if (sumObs2 <= 0) return null;

    const dvec = new Float64Array(np), dhat = new Float64Array(np);
    function stressOf(X) {
      for (let k = 0; k < np; k++) {
        const [i, j] = pairs[k];
        const dx = X[i][0] - X[j][0], dy = X[i][1] - X[j][1];
        dvec[k] = Math.sqrt(dx * dx + dy * dy);
      }
      const fit = pava(dvec);
      let num = 0, den = 0;
      for (let k = 0; k < np; k++) { dhat[k] = fit[k]; num += (dvec[k] - fit[k]) ** 2; den += dvec[k] * dvec[k]; }
      return den > 0 ? Math.sqrt(num / den) : 0;
    }
    function runFrom(X0) {
      let X = X0.map(r => r.slice()), s = stressOf(X), step = 0.2;
      for (let it = 0; it < (opts.iters || 300); it++) {
        /* gradient of stress 1 with the disparities held fixed */
        const dh = Float64Array.from(dhat), dv = Float64Array.from(dvec);
        let A = 0, B = 0;
        for (let k = 0; k < np; k++) { A += (dv[k] - dh[k]) ** 2; B += dv[k] * dv[k]; }
        if (A <= 0 || B <= 0) break;
        const S = Math.sqrt(A / B), g = X.map(() => [0, 0]);
        for (let k = 0; k < np; k++) {
          const [i, j] = pairs[k], d = dv[k] || 1e-12;
          const w = ((dv[k] - dh[k]) / A - d / B) * (S / d);
          for (let c = 0; c < 2; c++) {
            const diff = X[i][c] - X[j][c];
            g[i][c] += w * diff; g[j][c] -= w * diff;
          }
        }
        let gn = 0;
        g.forEach(v => { gn += v[0] * v[0] + v[1] * v[1]; });
        gn = Math.sqrt(gn) || 1;
        const scale = Math.sqrt(X.reduce((t, v) => t + v[0] * v[0] + v[1] * v[1], 0) / n) || 1;
        const Y = X.map((v, i) => [v[0] - step * scale * g[i][0] / gn, v[1] - step * scale * g[i][1] / gn]);
        const sy = stressOf(Y);
        if (sy < s) { X = Y; s = sy; step = Math.min(0.3, step * 1.1); }
        else { step *= 0.6; stressOf(X); if (step < 1e-5) break; }
      }
      s = stressOf(X);
      return { X, stress: s, dvec: Float64Array.from(dvec), dhat: Float64Array.from(dhat) };
    }

    /* first start: the principal coordinates; the rest, seeded random configurations */
    const starts = [];
    const pc = pcoa(Dm);
    if (pc) starts.push(pc.dims.slice(0, 2)[0].coord.map((v, i) => [v, pc.dims[1].coord[i]]));
    const R = rng(opts.seed || 42);
    const sc = Math.sqrt(sumObs2 / np);
    while (starts.length < Math.max(1, opts.starts || 5)) starts.push(Array.from({ length: n }, () => [(R() - 0.5) * sc, (R() - 0.5) * sc]));

    let best = null;
    starts.forEach((X0, k) => {
      const r = runFrom(X0);
      r.start = k === 0 && pc ? 'pcoa' : 'random';
      if (!best || r.stress < best.stress) best = r;
    });
    /* centre and rotate to the principal axes of the configuration, so the plot is reproducible */
    const mx = best.X.reduce((s, v) => s + v[0], 0) / n, my = best.X.reduce((s, v) => s + v[1], 0) / n;
    const C = best.X.map(v => [v[0] - mx, v[1] - my]);
    let sxx = 0, syy = 0, sxy = 0;
    C.forEach(v => { sxx += v[0] * v[0]; syy += v[1] * v[1]; sxy += v[0] * v[1]; });
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), cs = Math.cos(th), sn = Math.sin(th);
    const X = C.map(v => [v[0] * cs + v[1] * sn, -v[0] * sn + v[1] * cs]);
    return {
      X, stress: best.stress, start: best.start, starts: starts.length,
      shepard: pairs.map((p, k) => ({ i: p[0], j: p[1], obs: p[2], d: best.dvec[k], hat: best.dhat[k] })),
    };
  }

  /* which taxa drive the difference between two sets of sites: percentage contribution to the
     mean Bray and Curtis dissimilarity (Clarke 1993) */
  function contributions(m, gA, gB) {
    const nT = m.nT, del = new Float64Array(nT), del2 = new Float64Array(nT);
    let np = 0;
    for (const i of gA) for (const j of gB) {
      const a = i * nT, b = j * nT;
      let den = 0;
      for (let t = 0; t < nT; t++) den += m.M[a + t] + m.M[b + t];
      if (den <= 0) continue;
      np++;
      for (let t = 0; t < nT; t++) {
        const d = Math.abs(m.M[a + t] - m.M[b + t]) / den;
        del[t] += d; del2[t] += d * d;
      }
    }
    if (!np) return null;
    const rows = [];
    let tot = 0;
    for (let t = 0; t < nT; t++) { del[t] /= np; tot += del[t]; }
    for (let t = 0; t < nT; t++) {
      const sd = Math.sqrt(Math.max(0, del2[t] / np - del[t] * del[t]));
      let ma = 0, mb = 0;
      gA.forEach(i => { ma += m.M[i * nT + t]; });
      gB.forEach(j => { mb += m.M[j * nT + t]; });
      rows.push({
        taxon: m.taxa[t], delta: del[t], pct: tot > 0 ? 100 * del[t] / tot : 0,
        ratio: sd > 0 ? del[t] / sd : null, meanA: ma / gA.length, meanB: mb / gB.length,
      });
    }
    rows.sort((a, b) => b.delta - a.delta);
    let cum = 0;
    rows.forEach(r => { cum += r.pct; r.cum = cum; });
    return { rows, bray: tot, pairs: np };
  }

  /* ======================================================================
     6. abundance models (rank-abundance) and Preston octaves
     ====================================================================== */

  /* Poisson log-likelihood of the observed ranked counts under expected abundances mu */
  function poisLL(obs, mu) {
    let ll = 0;
    for (let i = 0; i < obs.length; i++) {
      const m = Math.max(mu[i], 1e-12);
      ll += obs[i] * Math.log(m) - m - lfact(obs[i]);
    }
    return ll;
  }
  function radFit(x) {
    const obs = Array.from(x).filter(v => v > 0).sort((a, b) => b - a);
    const S = obs.length, n = sum(obs);
    if (S < 3) return null;
    const models = [];

    /* broken stick (MacArthur): no free parameter */
    {
      const mu = obs.map((_, i) => {
        let s = 0;
        for (let j = i + 1; j <= S; j++) s += 1 / j;
        return n * s / S;
      });
      models.push({ key: 'brokenstick', k: 0, mu, ll: poisLL(obs, mu), par: {} });
    }
    /* geometric series, also called pre-emption (Motomura): one parameter k */
    {
      const f = kk => {
        const k = Math.min(0.999999, Math.max(1e-6, kk));
        let z = 0;
        const w = obs.map((_, i) => { const v = k * Math.pow(1 - k, i); z += v; return v; });
        const mu = w.map(v => n * v / z);
        return -poisLL(obs, mu);
      };
      const k = golden(f, 1e-5, 0.999);
      let z = 0;
      const w = obs.map((_, i) => { const v = k * Math.pow(1 - k, i); z += v; return v; });
      const mu = w.map(v => n * v / z);
      models.push({ key: 'geometric', k: 1, mu, ll: poisLL(obs, mu), par: { k } });
    }
    /* lognormal: the ranked abundances follow exp(mu + sigma z), two parameters */
    {
      const z = obs.map((_, i) => qnorm((S - i - 0.5) / S));
      const lm = obs.map(v => Math.log(v));
      const mz = z.reduce((s, v) => s + v, 0) / S, ml = lm.reduce((s, v) => s + v, 0) / S;
      let szz = 0, szl = 0;
      for (let i = 0; i < S; i++) { szz += (z[i] - mz) ** 2; szl += (z[i] - mz) * (lm[i] - ml); }
      const sig0 = szz > 0 ? szl / szz : 1;
      const f = par => {
        const mu = z.map(v => Math.exp(Math.min(30, par[0] + Math.max(1e-4, par[1]) * v)));
        return -poisLL(obs, mu);
      };
      const r = nelderMead(f, [ml, Math.max(0.05, sig0)], [0.3, 0.2]);
      const mu = z.map(v => Math.exp(Math.min(30, r.x[0] + Math.max(1e-4, r.x[1]) * v)));
      models.push({ key: 'lognormal', k: 2, mu, ll: poisLL(obs, mu), par: { logmu: r.x[0], sigma: Math.max(1e-4, r.x[1]) } });
    }
    /* log-series (Fisher et al. 1943): expected number of taxa with n individuals is alpha x^n / n */
    {
      const nMax = Math.max(obs[0] * 4, 50);
      const rankExp = (alpha, xx) => {
        const x = Math.min(0.99999, Math.max(1e-6, xx));
        /* cumulative number of taxa with abundance at least v, from the tail downwards */
        const cum = new Float64Array(nMax + 2);
        for (let v = nMax; v >= 1; v--) cum[v] = cum[v + 1] + alpha * Math.pow(x, v) / v;
        const mu = new Array(S);
        for (let i = 0; i < S; i++) {
          const target = i + 0.5;
          let v = 1;
          while (v <= nMax && cum[v] > target) v++;
          /* linear interpolation between the two bracketing abundances */
          if (v <= 1) mu[i] = nMax;
          else {
            const c1 = cum[v - 1], c2 = cum[v] || 0;
            const w = (c1 - c2) > 0 ? (c1 - target) / (c1 - c2) : 0;
            mu[i] = Math.max(0.05, (v - 1) + w);
          }
        }
        return mu;
      };
      const f = par => {
        const a = Math.max(0.01, par[0]), x = Math.min(0.999999, Math.max(1e-5, par[1]));
        return -poisLL(obs, rankExp(a, x));
      };
      /* start from the moment estimates of the log-series */
      let x0 = 0.5;
      const g = xx => S / n - (-(1 - xx) * Math.log(1 - xx) / xx);
      let lo = 1e-6, hi = 0.999999;
      for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (g(mid) > 0) hi = mid; else lo = mid; }
      x0 = (lo + hi) / 2;
      const a0 = Math.max(0.01, n * (1 - x0) / x0);
      const r = nelderMead(f, [a0, x0], [Math.max(0.5, a0 * 0.2), 0.05], 500);
      const a = Math.max(0.01, r.x[0]), xf = Math.min(0.999999, Math.max(1e-5, r.x[1]));
      const mu = rankExp(a, xf);
      models.push({ key: 'logseries', k: 2, mu, ll: poisLL(obs, mu), par: { alpha: a, x: xf } });
    }

    models.forEach(mo => { mo.aic = -2 * mo.ll + 2 * mo.k; });
    const best = models.reduce((a, b) => (b.aic < a.aic ? b : a));
    models.forEach(mo => { mo.dAic = mo.aic - best.aic; });
    models.sort((a, b) => a.aic - b.aic);
    return { obs, S, n, models, best: best.key };
  }

  /* Preston's (1948) octaves: classes of abundance doubling, with the boundary species split */
  function prestonOctaves(x) {
    const obs = Array.from(x).filter(v => v > 0);
    if (!obs.length) return null;
    const maxO = Math.floor(Math.log2(maxOf(obs))) + 2;
    const oct = new Float64Array(maxO + 1);
    obs.forEach(v => {
      const lg = Math.log2(v);
      if (Math.abs(lg - Math.round(lg)) < 1e-9 && v > 1) {
        /* exactly on a boundary: half to each neighbouring octave, as Preston proposed */
        const b = Math.round(lg);
        oct[b] += 0.5; oct[b + 1] += 0.5;
      } else oct[Math.min(maxO, Math.floor(lg) + 1)] += 1;
    });
    const rows = [];
    for (let i = 0; i < oct.length; i++) {
      if (oct[i] === 0 && (i === 0 || i === oct.length - 1)) continue;
      rows.push({ oct: i, lo: Math.pow(2, i - 1), hi: Math.pow(2, i), count: oct[i] });
    }
    return rows;
  }

  /* ======================================================================
     7. tests
     ====================================================================== */

  /* Hutcheson's (1970) t-test between two Shannon indices */
  function hutcheson(x, y, base) {
    const lb = base === 2 ? Math.LN2 : base === 10 ? Math.LN10 : 1;
    const vr = z => {
      const n = sum(z);
      let H = 0, s2 = 0, S = 0;
      for (let i = 0; i < z.length; i++) {
        if (z[i] <= 0) continue;
        S++;
        const p = z[i] / n;
        H -= p * Math.log(p); s2 += p * Math.log(p) ** 2;
      }
      const v = (s2 - H * H) / n + (S - 1) / (2 * n * n);
      return { H: H / lb, v: v / (lb * lb), n, S };
    };
    const a = vr(x), b = vr(y);
    const se = Math.sqrt(a.v + b.v);
    const t = se > 0 ? (a.H - b.H) / se : NaN;
    const df = (a.v + b.v) > 0 ? (a.v + b.v) ** 2 / (a.v ** 2 / a.n + b.v ** 2 / b.n) : NaN;
    return { Ha: a.H, Hb: b.H, diff: a.H - b.H, se, t, df, p: tTwoSided(t, df), na: a.n, nb: b.n };
  }
  /* permutation test of the difference in H' between two sites */
  function permTestH(x, y, base, reps, seed) {
    const lb = base === 2 ? Math.LN2 : base === 10 ? Math.LN10 : 1;
    const nT = x.length, pool = [];
    for (let t = 0; t < nT; t++) { for (let c = 0; c < x[t]; c++) pool.push(t); for (let c = 0; c < y[t]; c++) pool.push(t); }
    const n1 = sum(x), N = pool.length;
    const Hof = cnt => {
      const n = sum(cnt);
      let H = 0;
      for (let i = 0; i < cnt.length; i++) if (cnt[i] > 0) { const p = cnt[i] / n; H -= p * Math.log(p); }
      return H / lb;
    };
    const c1 = new Int32Array(nT), c2 = new Int32Array(nT);
    for (let t = 0; t < nT; t++) { c1[t] = x[t]; c2[t] = y[t]; }
    const obs = Math.abs(Hof(c1) - Hof(c2));
    const R = rng(seed), arr = Int32Array.from(pool);
    let ge = 0;
    for (let b = 0; b < reps; b++) {
      for (let i = N - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
      c1.fill(0); c2.fill(0);
      for (let i = 0; i < N; i++) { if (i < n1) c1[arr[i]]++; else c2[arr[i]]++; }
      if (Math.abs(Hof(c1) - Hof(c2)) >= obs - 1e-12) ge++;
    }
    return { obs, p: (1 + ge) / (reps + 1), reps };
  }

  /* ======================================================================
     8. drawing kit: small SVG plots with the colours of the active theme
     ====================================================================== */

  function pal() {
    return {
      bg: cssVar('--card-bg', '#ffffff'), soft: cssVar('--bg-soft', '#f3f7f5'),
      text: cssVar('--text', '#14261d'), muted: cssVar('--text-muted', '#5b7266'),
      border: cssVar('--border-strong', '#bccfc5'), grid: cssVar('--border', '#d6e2db'),
      primary: cssVar('--primary', '#1f7a4d'), accent: cssVar('--accent', '#cf6a24'),
      sky: cssVar('--sky', '#2a78b5'), danger: cssVar('--danger', '#c43a2f'),
      series: ['--c1', '--c2', '--c3', '--c4', '--c5', '--c6', '--c7', '--c8', '--c9', '--c10'].map(v => cssVar(v)),
    };
  }
  const toRGB = s => {
    s = String(s).trim();
    let m;
    if ((m = s.match(/^#([0-9a-f]{6})$/i))) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
    if ((m = s.match(/^#([0-9a-f]{3})$/i))) return [0, 1, 2].map(i => parseInt(m[1][i] + m[1][i], 16));
    if ((m = s.match(/rgba?\(([^)]+)\)/))) return m[1].split(',').slice(0, 3).map(Number);
    return [128, 128, 128];
  };
  const mix = (a, b, t) => {
    const A = toRGB(a), B = toRGB(b);
    return 'rgb(' + A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',') + ')';
  };
  const lumOf = rgb => { const [r, g, b] = rgb.match(/\d+(\.\d+)?/g).map(Number); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };

  function niceTicks(lo, hi, n = 6) {
    if (!(hi > lo)) return [lo];
    const raw = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), norm = raw / mag;
    const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toFixed(10));
    return out;
  }
  function logTicks(lo, hi) {
    const a = Math.floor(Math.log10(Math.max(lo, 1e-9))), b = Math.ceil(Math.log10(Math.max(hi, 1e-9)));
    const out = [], mant = (b - a) <= 3 ? [1, 2, 5] : [1];
    for (let e = a; e <= b; e++) for (const mt of mant) {
      const v = mt * Math.pow(10, e);
      if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v);
    }
    return out.length ? out : [lo, hi];
  }
  const tickFmt = v => {
    const a = Math.abs(v);
    if (a === 0) return '0';
    if (a >= 1e5) return v.toExponential(0).replace('+', '');
    if (a >= 100) return String(Math.round(v));
    if (a >= 1) return String(+v.toFixed(2)).replace('-', '−');
    return String(+v.toFixed(3)).replace('-', '−');
  };

  /* main plotting helper: draws the frame, the grid, the ticks and the legend, and lets the
     caller add the data with the scale functions it returns */
  function svgPlot(o, draw) {
    const p = pal(), W = o.W || 720;
    const legend = (o.legend || []).filter(Boolean);
    const legCols = o.legCols || Math.max(1, Math.floor(W / 190));
    const legRows = legend.length ? Math.ceil(legend.length / legCols) : 0;
    const m = Object.assign({ l: 64, r: 20, t: o.title ? 36 : 14, b: 50 + legRows * 17 }, o.m || {});
    const H = o.H || 420;
    const fx = o.xlog ? (v => Math.log10(Math.max(v, 1e-9))) : (v => v);
    const fy = o.ylog ? (v => Math.log10(Math.max(v, 1e-9))) : (v => v);
    let x0 = fx(o.xdom[0]), x1 = fx(o.xdom[1]), y0 = fy(o.ydom[0]), y1 = fy(o.ydom[1]);
    if (x1 - x0 === 0) { x1 = x0 + 1; }
    if (y1 - y0 === 0) { y1 = y0 + 1; }
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const sx = v => m.l + (fx(v) - x0) / (x1 - x0) * iw;
    const sy = v => m.t + ih - (fy(v) - y0) / (y1 - y0) * ih;
    const xt = o.xticks || (o.xlog ? logTicks(o.xdom[0], o.xdom[1]) : niceTicks(o.xdom[0], o.xdom[1], o.nxt || 6));
    const yt = o.yticks || (o.ylog ? logTicks(o.ydom[0], o.ydom[1]) : niceTicks(o.ydom[0], o.ydom[1], 6));
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="system-ui, Segoe UI, sans-serif">`;
    s += `<rect width="${W}" height="${H}" fill="${p.bg}"/>`;
    if (o.title) s += `<text x="${W / 2}" y="22" text-anchor="middle" font-size="13" font-weight="600" fill="${p.text}">${esc(o.title)}</text>`;
    yt.forEach(v => {
      const y = sy(v);
      if (y < m.t - 1 || y > m.t + ih + 1) return;
      s += `<line x1="${m.l}" y1="${y.toFixed(1)}" x2="${(m.l + iw).toFixed(1)}" y2="${y.toFixed(1)}" stroke="${p.grid}" stroke-width="1" stroke-opacity=".7"/>`;
      s += `<text x="${m.l - 7}" y="${(y + 3.6).toFixed(1)}" text-anchor="end" font-size="10" fill="${p.muted}">${esc((o.yfmt || tickFmt)(v))}</text>`;
    });
    xt.forEach(v => {
      const x = sx(v);
      if (x < m.l - 1 || x > m.l + iw + 1) return;
      s += `<line x1="${x.toFixed(1)}" y1="${m.t}" x2="${x.toFixed(1)}" y2="${(m.t + ih).toFixed(1)}" stroke="${p.grid}" stroke-width="1" stroke-opacity=".45"/>`;
      s += `<text x="${x.toFixed(1)}" y="${m.t + ih + 15}" text-anchor="middle" font-size="10" fill="${p.muted}">${esc((o.xfmt || tickFmt)(v))}</text>`;
    });
    s += `<path d="M${m.l},${m.t} V${m.t + ih} H${m.l + iw}" fill="none" stroke="${p.border}" stroke-width="1.2"/>`;
    s += draw({ sx, sy, p, W, H, m, iw, ih });
    if (o.xlab) s += `<text x="${m.l + iw / 2}" y="${m.t + ih + 33}" text-anchor="middle" font-size="11" fill="${p.text}">${esc(o.xlab)}</text>`;
    if (o.ylab) s += `<text transform="translate(14,${m.t + ih / 2}) rotate(-90)" text-anchor="middle" font-size="11" fill="${p.text}">${esc(o.ylab)}</text>`;
    legend.forEach((it, i) => {
      const col = i % legCols, row = Math.floor(i / legCols);
      const lx = m.l + col * (iw / legCols), ly = m.t + ih + 46 + row * 17;
      if (it.marker === 'square') s += `<rect x="${lx}" y="${ly - 7}" width="10" height="10" fill="${it.color}" fill-opacity="${it.opacity == null ? 1 : it.opacity}"/>`;
      else s += `<line x1="${lx}" y1="${ly - 3}" x2="${lx + 18}" y2="${ly - 3}" stroke="${it.color}" stroke-width="2.2"${it.dash ? ` stroke-dasharray="${it.dash}"` : ''}/>`;
      s += `<text x="${lx + (it.marker === 'square' ? 15 : 23)}" y="${ly}" font-size="10" fill="${p.text}">${esc(it.label)}</text>`;
    });
    return s + '</svg>';
  }
  const lineOf = (pts, sx, sy) => pts.length
    ? 'M' + pts.map(q => `${sx(q[0]).toFixed(1)},${sy(q[1]).toFixed(1)}`).join(' L') : '';
  const bandOf = (pts, sx, sy) => {
    const up = pts.map(q => `${sx(q[0]).toFixed(1)},${sy(q[1]).toFixed(1)}`);
    const dn = pts.slice().reverse().map(q => `${sx(q[0]).toFixed(1)},${sy(q[2]).toFixed(1)}`);
    return up.length ? 'M' + up.join(' L') + ' L' + dn.join(' L') + ' Z' : '';
  };

  /* the label of a site as plain text, in the active language */
  const sLab = s => (s.label && typeof s.label === 'object') ? T(s.label.es, s.label.en) : String(s.label);
  /* label of a curve: a site of the matrix, or the whole set, always in the active language */
  const rowLabel = r => r.total ? T('conjunto completo', 'whole set') : sLab(D.mat.sites[r.i]);

  function fitSvg(box) {
    const svg = box.querySelector('svg');
    if (!svg) return;
    svg.style.width = '100%';
    svg.style.maxWidth = svg.getAttribute('width') + 'px';
    svg.style.height = 'auto';
  }
  /* registers a figure: drawn now and redrawn when the language or the theme change */
  function setFig(id, builder) {
    FIG[id] = builder;
    return Views.reg(id, async () => {
      const box = $(id);
      if (!box) return;
      try { box.innerHTML = builder(); fitSvg(box); }
      catch (e) { console.warn('diversity figure', id, e); box.innerHTML = `<p class="hint">${L2('No se pudo dibujar la figura.', 'The figure could not be drawn.')}</p>`; }
    });
  }
  function clearFigs() {
    Object.keys(FIG).forEach(id => { Views.drop(id); const b = $(id); if (b) b.innerHTML = ''; delete FIG[id]; });
  }

  /* ======================================================================
     9. the figures
     ====================================================================== */

  /* which sites go into the figures: the ones with most records, so the plot stays readable */
  function figSites(limit) {
    const idx = D.mat.sites.map((s, i) => i).sort((a, b) => D.mat.sites[b].n - D.mat.sites[a].n);
    return idx.slice(0, limit);
  }

  function figProfile() {
    const prof = D.profile, qs = prof.qs;
    let ymax = 1;
    prof.rows.forEach(r => r.v.forEach(v => { if (isFinite(v) && v > ymax) ymax = v; }));
    const p = pal();
    const legend = prof.rows.map((r, i) => ({ label: rowLabel(r), color: r.total ? p.text : p.series[i % p.series.length], dash: r.total ? '5 3' : null }));
    return svgPlot({
      W: 760, H: 430, xdom: [0, 3], ydom: [0, ymax * 1.06], nxt: 7,
      title: T('Perfil de diversidad: números de Hill', 'Diversity profile: Hill numbers'),
      xlab: T('orden q', 'order q'), ylab: T('número efectivo de taxones', 'effective number of taxa'), legend,
    }, ({ sx, sy }) => {
      let s = '';
      prof.rows.forEach((r, i) => {
        const col = r.total ? p.text : p.series[i % p.series.length];
        const pts = qs.map((q, k) => [q, r.v[k]]).filter(q => isFinite(q[1]));
        s += `<path d="${lineOf(pts, sx, sy)}" fill="none" stroke="${col}" stroke-width="${r.total ? 2.6 : 1.8}"${r.total ? ' stroke-dasharray="5 3"' : ''} stroke-linejoin="round"/>`;
        [0, 1, 2].forEach(q => {
          const k = qs.indexOf(q);
          if (k >= 0 && isFinite(r.v[k])) s += `<circle cx="${sx(q).toFixed(1)}" cy="${sy(r.v[k]).toFixed(1)}" r="2.8" fill="${col}"/>`;
        });
      });
      return s;
    });
  }

  function figRaref() {
    const R = D.raref, p = pal();
    let xmax = 1, ymax = 1;
    R.rows.forEach(r => r.pts.forEach(q => {
      if (q.m > xmax) xmax = q.m;
      const top = isFinite(q.hi) ? q.hi : q.e;
      if (top > ymax) ymax = top;
    }));
    /* the whole set has many more records than a single site: a logarithmic axis keeps the small
       sites readable next to it. "auto" switches when the spread is wide */
    const ends = R.rows.map(r => { const ip = r.pts.filter(q => !q.ext); return ip.length ? ip[ip.length - 1].m : 1; });
    const spread = Math.max(...ends) / Math.max(1, Math.min(...ends));
    const mode = ($('divRarefScale') && $('divRarefScale').value) || 'auto';
    const xlog = mode === 'log' || (mode === 'auto' && spread > 8);
    const legend = R.rows.map((r, i) => ({ label: rowLabel(r), color: r.total ? p.text : p.series[i % p.series.length], dash: r.total ? '5 3' : null }));
    legend.push({ label: T('parte extrapolada (línea de puntos)', 'extrapolated part (dotted line)'), color: p.muted, dash: '2 3' });
    return svgPlot({
      W: 760, H: 430, xlog, xdom: [xlog ? 1 : 0, xmax * 1.02], ydom: [0, ymax * 1.06],
      title: T('Rarefacción por individuos (riqueza esperada)', 'Individual-based rarefaction (expected richness)'),
      xlab: T('registros muestreados (m)', 'records sampled (m)'), ylab: T('taxones esperados E[S]', 'expected taxa E[S]'), legend,
    }, ({ sx, sy }) => {
      let s = '';
      R.rows.forEach((r, i) => {
        const col = r.total ? p.text : p.series[i % p.series.length];
        const ip = r.pts.filter(q => !q.ext), ep = r.pts.filter(q => q.ext);
        const band = ip.filter(q => isFinite(q.lo) && q.sd > 0).map(q => [q.m, q.hi, q.lo]);
        if (D.opts.band && band.length > 1)
          s += `<path d="${bandOf(band, sx, sy)}" fill="${col}" fill-opacity=".13" stroke="none"/>`;
        s += `<path d="${lineOf(ip.map(q => [q.m, q.e]), sx, sy)}" fill="none" stroke="${col}" stroke-width="${r.total ? 2.6 : 1.7}"${r.total ? ' stroke-dasharray="5 3"' : ''}/>`;
        if (ep.length) {
          const last = ip[ip.length - 1];
          s += `<path d="${lineOf([[last.m, last.e], ...ep.map(q => [q.m, q.e])], sx, sy)}" fill="none" stroke="${col}" stroke-width="1.5" stroke-dasharray="2 3"/>`;
          const e2 = ep[ep.length - 1];
          s += `<circle cx="${sx(e2.m).toFixed(1)}" cy="${sy(e2.e).toFixed(1)}" r="3" fill="${p.bg}" stroke="${col}" stroke-width="1.5"/>`;
        }
        const ref = ip[ip.length - 1];
        if (ref) s += `<circle cx="${sx(ref.m).toFixed(1)}" cy="${sy(ref.e).toFixed(1)}" r="3.2" fill="${col}"/>`;
      });
      return s;
    });
  }

  function figAccum() {
    const A = D.accum, p = pal();
    const ymax = Math.max(1, ...A.map(q => isFinite(q.hi) ? q.hi : q.e));
    return svgPlot({
      W: 700, H: 380, xdom: [1, Math.max(2, A.length)], ydom: [0, ymax * 1.08],
      title: T('Curva de acumulación por sitios', 'Sample-based accumulation curve'),
      xlab: T('sitios muestreados', 'sites sampled'), ylab: T('taxones acumulados', 'accumulated taxa'),
      legend: [
        { label: T(`media de ${D.opts.reps} permutaciones`, `mean of ${D.opts.reps} permutations`), color: p.primary },
        { label: T('banda del 95 %', '95 % band'), color: p.primary, marker: 'square', opacity: 0.2 },
      ],
    }, ({ sx, sy }) => {
      let s = `<path d="${bandOf(A.map(q => [q.k, q.hi, q.lo]), sx, sy)}" fill="${p.primary}" fill-opacity=".15" stroke="none"/>`;
      s += `<path d="${lineOf(A.map(q => [q.k, q.e]), sx, sy)}" fill="none" stroke="${p.primary}" stroke-width="2.2"/>`;
      if (A.length <= 40) A.forEach(q => { s += `<circle cx="${sx(q.k).toFixed(1)}" cy="${sy(q.e).toFixed(1)}" r="2.6" fill="${p.primary}"/>`; });
      return s;
    });
  }

  /* heat map of the chosen index with the average-linkage tree on the left */
  function figBeta() {
    const key = D.beta.active, Dm = D.beta.mats[key], m = D.mat, p = pal();
    const n = m.nS, tree = D.beta.tree, order = tree.order;
    const cs = n > 26 ? 16 : n > 16 ? 22 : 28;
    const short = s => { const t = sLab(s); return t.length > 22 ? t.slice(0, 21) + '…' : t; };
    const lmax = Math.max(...m.sites.map(s => short(s).length));
    const dW = 78, lW = Math.min(160, 10 + 6.5 * lmax);
    const top = 34, right = 14;
    const bot = Math.min(170, Math.round(6.2 * lmax)) + 42;   /* rotated column labels plus the colour key */
    const W = dW + lW + n * cs + right, H = top + n * cs + bot, x0 = dW + lW;
    const pos = {};
    order.forEach((v, r) => { pos[v] = r; });
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="system-ui, Segoe UI, sans-serif"><rect width="${W}" height="${H}" fill="${p.bg}"/>`;
    s += `<text x="${W / 2}" y="20" text-anchor="middle" font-size="13" font-weight="600" fill="${p.text}">${esc(BETA_NAME[key] ? T(BETA_NAME[key].es, BETA_NAME[key].en) : key)}</text>`;
    const hmax = tree.root.h || 1, xy = {};
    (function walk(nd) {
      if (!nd.a) { xy[nd.id] = [dW, top + pos[nd.id] * cs + cs / 2]; return; }
      walk(nd.a); walk(nd.b);
      xy[nd.id] = [dW - nd.h / hmax * (dW - 6), (xy[nd.a.id][1] + xy[nd.b.id][1]) / 2];
      const A = xy[nd.a.id], B = xy[nd.b.id], X = xy[nd.id];
      s += `<path d="M${A[0].toFixed(1)},${A[1].toFixed(1)} H${X[0].toFixed(1)} V${B[1].toFixed(1)} H${B[0].toFixed(1)}" fill="none" stroke="${p.muted}" stroke-width="1.1"/>`;
    })(tree.root);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const i = order[r], j = order[c], v = Dm[i][j], x = x0 + c * cs, y = top + r * cs;
      const fill = i === j ? mix(p.bg, p.muted, 0.16) : mix(p.bg, p.accent, Math.pow(Math.min(1, v), 0.85) * 0.95);
      s += `<rect x="${x}" y="${y}" width="${cs}" height="${cs}" fill="${fill}" stroke="${p.bg}" stroke-width=".8"><title>${esc(sLab(m.sites[i]))} × ${esc(sLab(m.sites[j]))}: ${fmt(v, 3)}</title></rect>`;
      if (cs >= 22) s += `<text x="${x + cs / 2}" y="${y + cs / 2 + 3.2}" text-anchor="middle" font-size="${cs > 24 ? 9 : 8}" fill="${lumOf(fill) > 0.58 ? '#1b1b1b' : '#ffffff'}" pointer-events="none">${i === j ? '' : esc(v.toFixed(2).replace('0.', '.'))}</text>`;
    }
    order.forEach((v, r) => {
      const t = short(m.sites[v]);
      s += `<text x="${x0 - 6}" y="${top + r * cs + cs / 2 + 3.5}" text-anchor="end" font-size="10" fill="${p.text}">${esc(t)}</text>`;
      s += `<text transform="translate(${x0 + r * cs + cs / 2 + 3.5},${top + n * cs + 7}) rotate(-90)" text-anchor="end" font-size="10" fill="${p.text}">${esc(t)}</text>`;
    });
    /* colour key */
    const kx = x0, ky = H - 12;
    for (let i = 0; i <= 20; i++)
      s += `<rect x="${kx + i * 7}" y="${ky - 9}" width="7" height="9" fill="${mix(p.bg, p.accent, Math.pow(i / 20, 0.85) * 0.95)}"/>`;
    s += `<text x="${kx - 5}" y="${ky - 1}" text-anchor="end" font-size="9" fill="${p.muted}">0</text>`;
    s += `<text x="${kx + 147}" y="${ky - 1}" font-size="9" fill="${p.muted}">1 · ${esc(T('disimilitud', 'dissimilarity'))}</text>`;
    return s + '</svg>';
  }

  function scatterSites(o) {
    const m = D.mat, p = pal(), pts = o.pts;
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
    const padx = (Math.max(...xs) - Math.min(...xs) || 1) * 0.12, pady = (Math.max(...ys) - Math.min(...ys) || 1) * 0.14;
    const nMax = Math.max(...m.sites.map(s => s.n));
    return svgPlot({
      W: 700, H: 460, xdom: [Math.min(...xs) - padx, Math.max(...xs) + padx],
      ydom: [Math.min(...ys) - pady, Math.max(...ys) + pady],
      title: o.title, xlab: o.xlab, ylab: o.ylab, legend: o.legend,
    }, ({ sx, sy }) => {
      let s = `<line x1="${sx(0)}" y1="${sy(Math.min(...ys) - pady)}" x2="${sx(0)}" y2="${sy(Math.max(...ys) + pady)}" stroke="${p.grid}" stroke-dasharray="3 3"/>`;
      s += `<line x1="${sx(Math.min(...xs) - padx)}" y1="${sy(0)}" x2="${sx(Math.max(...xs) + padx)}" y2="${sy(0)}" stroke="${p.grid}" stroke-dasharray="3 3"/>`;
      pts.forEach((q, i) => {
        const r = 4 + 5 * Math.sqrt(m.sites[i].n / nMax);
        const col = p.series[i % p.series.length];
        s += `<circle cx="${sx(q[0]).toFixed(1)}" cy="${sy(q[1]).toFixed(1)}" r="${r.toFixed(1)}" fill="${col}" fill-opacity=".7" stroke="${col}" stroke-width="1.2"><title>${esc(sLab(m.sites[i]))}: n = ${m.sites[i].n}, S = ${m.sites[i].S}</title></circle>`;
      });
      pts.forEach((q, i) => {
        if (m.nS > 26) return;
        const t = sLab(m.sites[i]);
        s += `<text x="${sx(q[0]).toFixed(1)}" y="${(sy(q[1]) - 8).toFixed(1)}" text-anchor="middle" font-size="9.5" fill="${p.text}">${esc(t.length > 16 ? t.slice(0, 15) + '…' : t)}</text>`;
      });
      return s;
    });
  }
  function figPcoa() {
    const P = D.pcoa;
    return scatterSites({
      pts: P.dims[0].coord.map((v, i) => [v, P.dims[1].coord[i]]),
      title: T('Coordenadas principales (PCoA) de los sitios', 'Principal coordinates (PCoA) of the sites'),
      xlab: `PCo 1 (${fmt(P.dims[0].pct, 1)} %)`, ylab: `PCo 2 (${fmt(P.dims[1].pct, 1)} %)`,
      legend: [{ label: T('el tamaño del punto crece con los registros del sitio', 'point size grows with the site\'s records'), color: pal().muted, marker: 'square', opacity: 0.6 }],
    });
  }
  function figNmds() {
    const N = D.nmds;
    return scatterSites({
      pts: N.X, title: T('NMDS de los sitios', 'NMDS of the sites'),
      xlab: 'NMDS 1', ylab: 'NMDS 2',
      legend: [{ label: T(`estrés 1 = ${fmt(N.stress, 4)} · ${N.starts} arranque(s)`, `stress 1 = ${fmt(N.stress, 4)} · ${N.starts} start(s)`), color: pal().primary, marker: 'square' }],
    });
  }
  function figShepard() {
    const N = D.nmds, p = pal();
    const ox = N.shepard.map(q => q.obs), dy = N.shepard.map(q => q.d);
    const xmax = Math.max(...ox) * 1.05 || 1, ymax = Math.max(...dy) * 1.05 || 1;
    const sorted = N.shepard.slice().sort((a, b) => a.obs - b.obs);
    return svgPlot({
      W: 560, H: 400, xdom: [0, xmax], ydom: [0, ymax],
      title: T('Diagrama de Shepard', 'Shepard diagram'),
      xlab: T('disimilitud observada', 'observed dissimilarity'), ylab: T('distancia en la ordenación', 'distance in the ordination'),
      legend: [{ label: T('pares de sitios', 'pairs of sites'), color: p.sky, marker: 'square', opacity: 0.55 },
        { label: T('ajuste monótono', 'monotone fit'), color: p.accent }],
    }, ({ sx, sy }) => {
      let s = '';
      N.shepard.forEach(q => { s += `<circle cx="${sx(q.obs).toFixed(1)}" cy="${sy(q.d).toFixed(1)}" r="2.6" fill="${p.sky}" fill-opacity=".5"/>`; });
      s += `<path d="${lineOf(sorted.map(q => [q.obs, q.hat]), sx, sy)}" fill="none" stroke="${p.accent}" stroke-width="2"/>`;
      return s;
    });
  }

  function figRad() {
    const R = D.rad, p = pal();
    const ymax = Math.max(R.obs[0], ...R.models.map(mo => maxOf(mo.mu))) * 1.25;
    const ymin = Math.max(0.5, R.obs[R.obs.length - 1] / 1.8);
    const legend = R.models.map((mo, i) => ({
      label: `${T(RAD_NAME[mo.key].es, RAD_NAME[mo.key].en)} (AIC ${fmt(mo.aic, 1)}${mo.dAic < 1e-9 ? ' ★' : ''})`,
      color: p.series[(i + 1) % p.series.length],
    }));
    legend.unshift({ label: T('registros observados', 'observed records'), color: p.text, marker: 'square' });
    return svgPlot({
      W: 740, H: 430, xdom: [1, Math.max(2, R.S)], ydom: [ymin, ymax], ylog: true,
      title: T('Rango y abundancia con los modelos ajustados', 'Rank and abundance with the fitted models'),
      xlab: T('rango del taxón', 'rank of the taxon'), ylab: T('registros', 'records'), legend, legCols: 2,
    }, ({ sx, sy }) => {
      let s = '';
      R.models.forEach((mo, i) => {
        const col = p.series[(i + 1) % p.series.length];
        s += `<path d="${lineOf(mo.mu.map((v, k) => [k + 1, Math.max(ymin, v)]), sx, sy)}" fill="none" stroke="${col}" stroke-width="1.9" stroke-opacity=".9"/>`;
      });
      R.obs.forEach((v, k) => {
        s += `<circle cx="${sx(k + 1).toFixed(1)}" cy="${sy(v).toFixed(1)}" r="3.4" fill="${p.bg}" stroke="${p.text}" stroke-width="1.6"/>`;
      });
      return s;
    });
  }

  function figPreston() {
    const O = D.preston, p = pal();
    if (!O || !O.length) return '';
    const ymax = Math.max(1, ...O.map(r => r.count), ...(D.prestonFit || []).map(v => v)) * 1.2;
    const legend = [{ label: T('taxones observados', 'observed taxa'), color: p.primary, marker: 'square' }];
    if (D.prestonFit) legend.push({ label: T('esperado por el modelo lognormal', 'expected by the lognormal model'), color: p.accent });
    return svgPlot({
      W: 640, H: 380, xdom: [0.4, O.length + 0.6], ydom: [0, ymax],
      xticks: O.map((_, i) => i + 1), xfmt: v => {
        const r = O[Math.round(v) - 1];
        return r ? (r.lo < 1 ? '1' : `${Math.round(r.lo)}–${Math.round(r.hi)}`) : '';
      },
      title: T('Octavas de Preston', 'Preston octaves'),
      xlab: T('clase de abundancia (registros por taxón)', 'abundance class (records per taxon)'),
      ylab: T('n.º de taxones', 'number of taxa'), legend,
    }, ({ sx, sy, m, iw }) => {
      const bw = Math.min(46, iw / O.length * 0.72);
      let s = '';
      O.forEach((r, i) => {
        const x = sx(i + 1), y = sy(r.count), h = sy(0) - y;
        s += `<rect x="${(x - bw / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" fill="${p.primary}" fill-opacity=".72" stroke="${p.primary}" stroke-width="1"><title>${fmt(r.count, 1)}</title></rect>`;
      });
      if (D.prestonFit) s += `<path d="${lineOf(D.prestonFit.map((v, i) => [i + 1, v]), sx, sy)}" fill="none" stroke="${p.accent}" stroke-width="2.2"/>`;
      return s;
    });
  }

  /* ======================================================================
     10. names of the indices, models and views (both languages)
     ====================================================================== */

  const BETA_NAME = {
    jaccard: { es: 'Disimilitud de Jaccard (presencia)', en: 'Jaccard dissimilarity (presence)' },
    sorensen: { es: 'Disimilitud de Sørensen (presencia)', en: 'Sørensen dissimilarity (presence)' },
    bray: { es: 'Disimilitud de Bray y Curtis (registros)', en: 'Bray and Curtis dissimilarity (records)' },
    morisita: { es: 'Disimilitud de Morisita y Horn (registros)', en: 'Morisita and Horn dissimilarity (records)' },
    sim: { es: 'Recambio de Baselga (β_sim)', en: 'Baselga turnover (β_sim)' },
    sne: { es: 'Anidamiento de Baselga (β_sne)', en: 'Baselga nestedness (β_sne)' },
  };
  const RAD_NAME = {
    brokenstick: { es: 'Bastón roto', en: 'Broken stick' },
    geometric: { es: 'Serie geométrica', en: 'Geometric series' },
    lognormal: { es: 'Lognormal', en: 'Lognormal' },
    logseries: { es: 'Serie logarítmica', en: 'Log-series' },
  };
  const RAD_MEANING = {
    brokenstick: {
      es: 'Un buen ajuste del bastón roto sugiere que un solo recurso se reparte al azar entre los taxones: la comunidad más equitativa que cabe esperar.',
      en: 'A good fit of the broken stick suggests that a single resource is divided at random among the taxa: the most even community one can expect.',
    },
    geometric: {
      es: 'Un buen ajuste de la serie geométrica sugiere que los taxones se apropian del recurso por orden de llegada, con fuerte dominancia: típico de comunidades pobres o muy perturbadas.',
      en: 'A good fit of the geometric series suggests that taxa pre-empt the resource in order of arrival, with strong dominance: typical of poor or heavily disturbed communities.',
    },
    lognormal: {
      es: 'Un buen ajuste lognormal sugiere una comunidad grande y bien muestreada en la que muchos factores independientes se multiplican: es el patrón más común en comunidades maduras.',
      en: 'A good lognormal fit suggests a large, well-sampled community in which many independent factors multiply: the commonest pattern in mature communities.',
    },
    logseries: {
      es: 'Un buen ajuste de la serie logarítmica sugiere una muestra dominada por unos pocos taxones y con muchos raros: frecuente cuando el muestreo es escaso o la colonización es reciente.',
      en: 'A good fit of the log-series suggests a sample dominated by a few taxa with many rare ones: frequent when sampling is sparse or colonisation is recent.',
    },
  };
  const ALPHA_VIEWS = {
    basic: { es: 'los índices de diversidad', en: 'the diversity indices' },
    est: { es: 'los estimadores de riqueza', en: 'the richness estimators' },
    all: { es: 'todo', en: 'everything' },
  };
  const SITE_MODE_TXT = {
    grid: { es: 'celdas de una malla', en: 'grid cells' },
    country: { es: 'países', en: 'countries' },
    state: { es: 'estados o provincias', en: 'states or provinces' },
    koppen: { es: 'clases climáticas de Köppen', en: 'Köppen climate classes' },
    soil: { es: 'tipos de suelo', en: 'soil types' },
    elev: { es: 'tramos del gradiente altitudinal', en: 'bands of the elevation gradient' },
    cluster: { es: 'grupos del agrupamiento', en: 'clusters of the clustering' },
  };

  /* ======================================================================
     11. tables
     ====================================================================== */

  const C_SITE = { key: 'site', label: { es: 'Sitio', en: 'Site' }, get: r => r.label };
  const C_HEAD = [
    C_SITE,
    { key: 'n', label: { es: 'N (registros)', en: 'N (records)' }, get: r => fmtInt(r.a.n) },
    { key: 'S', label: { es: 'S observada', en: 'Observed S' }, get: r => fmtInt(r.a.S) },
    { key: 'f1', label: { es: 'Únicos f₁', en: 'Singletons f₁' }, get: r => fmtInt(r.a.f1) },
    { key: 'f2', label: { es: 'Dobles f₂', en: 'Doubletons f₂' }, get: r => fmtInt(r.a.f2) },
  ];
  const C_DIV = [
    { key: 'H', label: { es: 'H′ de Shannon', en: "Shannon's H′" }, get: r => fmt(r.a.H, 3) },
    { key: 'J', label: { es: 'J′ de Pielou', en: "Pielou's J′" }, get: r => fmt(r.a.J, 3) },
    { key: 'D', label: { es: 'D de Simpson (Σp²)', en: "Simpson's D (Σp²)" }, get: r => fmt(r.a.D, 4) },
    { key: 'D1', label: '1 − D', get: r => fmt(r.a.D1, 4) },
    { key: 'Dinv', label: '1/D', get: r => fmt(r.a.Dinv, 3) },
    { key: 'q0', label: { es: 'Hill q = 0', en: 'Hill q = 0' }, get: r => fmt(r.a.q0, 2) },
    { key: 'q1', label: { es: 'Hill q = 1', en: 'Hill q = 1' }, get: r => fmt(r.a.q1, 3) },
    { key: 'q2', label: { es: 'Hill q = 2', en: 'Hill q = 2' }, get: r => fmt(r.a.q2, 3) },
    { key: 'bp', label: { es: 'Dominancia de Berger y Parker', en: 'Berger and Parker dominance' }, get: r => fmt(r.a.bp, 3) },
    { key: 'marg', label: { es: 'Riqueza de Margalef', en: 'Margalef richness' }, get: r => fmt(r.a.marg, 3) },
    { key: 'menh', label: { es: 'Riqueza de Menhinick', en: 'Menhinick richness' }, get: r => fmt(r.a.menh, 3) },
    { key: 'bril', label: { es: 'Índice de Brillouin', en: 'Brillouin index' }, get: r => fmt(r.a.bril, 3) },
    { key: 'fisher', label: { es: 'α de la serie logarítmica', en: 'Log-series α' }, get: r => r.a.fisher == null ? '—' : fmt(r.a.fisher, 2) },
  ];
  const C_EST = [
    { key: 'cov', label: { es: 'Cobertura de muestra', en: 'Sample coverage' }, get: r => fmt(r.a.cov, 4) },
    { key: 'chao1', label: { es: 'Chao1 clásico', en: 'Chao1 classic' }, get: r => fmt(r.a.chao1, 2) },
    { key: 'chao1bc', label: { es: 'Chao1 corregido', en: 'Chao1 bias-corrected' }, get: r => fmt(r.a.chao1bc, 2) },
    { key: 'chao1sd', label: { es: 'EE de Chao1', en: 'SE of Chao1' }, get: r => fmt(Math.sqrt(r.a.chao1var), 2) },
    { key: 'chao1ci', label: { es: 'IC 95 % de Chao1', en: '95 % CI of Chao1' }, get: r => `${fmt(r.a.chao1lo, 1)} – ${fmt(r.a.chao1hi, 1)}` },
    { key: 'ace', label: 'ACE', get: r => r.a.ace == null ? '—' : fmt(r.a.ace, 2) },
    { key: 'jack1', label: { es: 'Navaja de 1.er orden', en: 'First-order jackknife' }, get: r => fmt(r.a.jack1, 2) },
    { key: 'jack2', label: { es: 'Navaja de 2.º orden', en: 'Second-order jackknife' }, get: r => r.a.jack2 == null ? '—' : fmt(r.a.jack2, 2) },
  ];
  const alphaCols = view => view === 'basic' ? [...C_HEAD, ...C_DIV]
    : view === 'est' ? [...C_HEAD, ...C_EST] : [...C_HEAD, ...C_DIV, ...C_EST];

  function renderMatrix() {
    const m = D.mat;
    statTiles('divMatrixTiles', [
      [{ es: 'Sitios', en: 'Sites' }, fmtInt(m.nS)],
      [{ es: 'Taxones', en: 'Taxa' }, fmtInt(m.nT)],
      [{ es: 'Registros en la matriz', en: 'Records in the matrix' }, fmtInt(m.total)],
      [{ es: 'Registros por sitio (mediana)', en: 'Records per site (median)' },
        fmtInt(quantile(m.sites.map(s => s.n).sort((a, b) => a - b), 0.5))],
      [{ es: 'Celdas ocupadas de la matriz', en: 'Filled cells of the matrix' },
        fmt(100 * m.M.reduce((s, v) => s + (v > 0 ? 1 : 0), 0) / (m.nS * m.nT), 1) + ' %'],
    ]);

    const shownT = Math.min(m.nT, 40), shownS = Math.min(m.nS, 60);
    const taxaShown = m.taxa.slice(0, shownT);
    let h = '<table class="div-mtx"><thead><tr><th>' + L2('Sitio', 'Site') + '</th>' +
      taxaShown.map(t => `<th>${esc(t)}</th>`).join('') +
      (m.nT > shownT ? `<th>${L2('otros', 'others')}</th>` : '') +
      `<th>${L2('Total', 'Total')}</th><th>S</th></tr></thead><tbody>`;
    for (let i = 0; i < shownS; i++) {
      const r = rowOf(m, i);
      let others = 0;
      for (let j = shownT; j < m.nT; j++) others += r[j];
      h += `<tr><th>${labHTML(m.sites[i].label)}</th>` +
        taxaShown.map((_, j) => `<td class="${r[j] ? '' : 'z'}">${r[j] || '·'}</td>`).join('') +
        (m.nT > shownT ? `<td class="${others ? '' : 'z'}">${others || '·'}</td>` : '') +
        `<td class="tot">${fmtInt(m.sites[i].n)}</td><td class="tot">${m.sites[i].S}</td></tr>`;
    }
    let oth = 0;
    for (let j = shownT; j < m.nT; j++) oth += m.colTot[j];
    h += `<tr class="grand"><th>${L2('Total', 'Total')}</th>` +
      taxaShown.map((_, j) => `<td>${fmtInt(m.colTot[j])}</td>`).join('') +
      (m.nT > shownT ? `<td>${fmtInt(oth)}</td>` : '') +
      `<td class="tot">${fmtInt(m.total)}</td><td class="tot">${m.nT}</td></tr></tbody></table>`;
    if (m.nS > shownS || m.nT > shownT)
      h += `<p class="hint" style="padding:6px 12px">${L2(
        `Se muestran ${shownS} de ${m.nS} sitios y ${shownT} de ${m.nT} taxones. El CSV lleva la matriz completa.`,
        `Showing ${shownS} of ${m.nS} sites and ${shownT} of ${m.nT} taxa. The CSV carries the full matrix.`)}</p>`;
    $('divMatrixTable').innerHTML = h;

    if (m.dropped.length) {
      buildTable('divDroppedTable', [
        { key: 'label', label: { es: 'Sitio descartado', en: 'Dropped site' }, get: r => r.label },
        { key: 'n', label: { es: 'Registros', en: 'Records' }, get: r => fmtInt(r.n) },
      ], m.dropped, 30);
      $('divDroppedTable').insertAdjacentHTML('afterbegin',
        `<p class="hint" style="padding:8px 12px 0">${L2(
          `${m.dropped.length} sitio(s) quedaron fuera por tener menos de ${m.minN} registros (${fmtInt(m.dropped.reduce((s, d) => s + d.n, 0))} registros en total).`,
          `${m.dropped.length} site(s) were left out for having fewer than ${m.minN} records (${fmtInt(m.dropped.reduce((s, d) => s + d.n, 0))} records in all).`)}</p>`);
    } else $('divDroppedTable').innerHTML = '';
  }

  /* what the module says when the data cannot describe a community */
  function renderHonesty() {
    const m = D.mat, out = [];
    if (m.nT === 1) {
      out.push(['error', L2(
        `<b>Aquí no hay diversidad de especies que medir.</b> La matriz tiene <b>un solo taxón</b> (${esc(m.taxa[0])}), así que por definición H′ = 0, D = 1, todos los números de Hill valen 1 y la equitatividad no está definida. Las tablas siguen abajo porque describen honradamente el reparto de los <b>registros</b> entre sitios, pero no digas que miden diversidad de la comunidad. Para que este bloque tenga sentido: cambia «un taxón es» al nivel que separe subespecies y variedades, descarga varios taxones del paso 1, o usa el bloque de análisis ecológico de arriba (área de distribución, patrón espacial y amplitud de nicho), que sí está pensado para una sola especie.`,
        `<b>There is no species diversity to measure here.</b> The matrix holds <b>a single taxon</b> (${esc(m.taxa[0])}), so by definition H′ = 0, D = 1, every Hill number equals 1 and evenness is undefined. The tables below still follow because they honestly describe how the <b>records</b> are shared among sites, but do not claim they measure community diversity. To make this block meaningful: change "a taxon is" to the level that separates subspecies and varieties, download several taxa in step 1, or use the ecological analysis block above (range size, spatial pattern and niche breadth), which is meant for a single species.`)]);
    } else if (m.nT === 2) {
      out.push(['warning', L2(
        'Solo hay <b>dos taxones</b>: los índices existen pero tienen muy poca información, y la riqueza no puede pasar de 2. Trátalos como una descripción del reparto de registros, no como diversidad de la comunidad.',
        'There are only <b>two taxa</b>: the indices exist but carry very little information, and richness cannot exceed 2. Treat them as a description of how records are shared, not as community diversity.')]);
    }
    if (m.nT >= 2 && m.nT < 6 && m.nS >= 3 * m.nT) {
      out.push(['info', L2(
        `Tienes <b>pocos taxones (${m.nT}) y muchos sitios (${m.nS})</b>: es el caso de una especie con sus subespecies o variedades repartidas por muchas celdas. Las tablas por sitio son útiles para ver <b>dónde</b> conviven los taxones, y la diversidad beta para ver cómo se sustituyen en el espacio; los estimadores de riqueza (Chao1, ACE) en cambio aportan poco cuando el techo de la riqueza es tan bajo.`,
        `You have <b>few taxa (${m.nT}) and many sites (${m.nS})</b>: this is the case of one species with its subspecies or varieties spread over many cells. The per-site tables are useful to see <b>where</b> the taxa live together, and beta diversity to see how they replace one another in space; the richness estimators (Chao1, ACE) on the other hand add little when the ceiling of richness is so low.`)]);
    }
    const allOne = m.sites.every(s => s.S === 1);
    if (allOne && m.nT > 1) {
      out.push(['warning', L2(
        'Cada sitio tiene <b>un único taxón</b>: toda la diversidad es beta (recambio entre sitios) y la diversidad alfa es cero en todos. Prueba con sitios más grandes (celdas mayores o un nivel geográfico más amplio) para que convivan varios taxones.',
        'Each site holds <b>a single taxon</b>: all diversity is beta (turnover between sites) and alpha diversity is zero everywhere. Try larger sites (bigger cells or a wider geographical level) so that several taxa coexist.')]);
    }
    out.push(['warning', L2(
      `<b>Recuerda el sesgo de muestreo.</b> Estos ${fmtInt(m.total)} números son registros, no individuos contados en campo: un taxón muy coleccionado parecerá dominante aunque sea raro. Compara sitios con la rarefacción y con la tabla a igual cobertura, y no interpretes la dominancia como abundancia poblacional.`,
      `<b>Remember the sampling bias.</b> These ${fmtInt(m.total)} numbers are records, not individuals counted in the field: a heavily collected taxon will look dominant even if it is rare. Compare sites with the rarefaction and with the equal-coverage table, and do not read dominance as population abundance.`)]);
    $('divHonesty').innerHTML = out.map(([t, html]) => `<div class="msg msg-${t}">${html}</div>`).join('');
  }

  function renderAlpha() {
    const rows = D.alpha, tot = rows[rows.length - 1];
    statTiles('divAlphaTiles', [
      [{ es: 'S observada (conjunto)', en: 'Observed S (whole set)' }, fmtInt(tot.a.S)],
      [{ es: 'H′ del conjunto', en: "Whole-set H′" }, fmt(tot.a.H, 3)],
      [{ es: '1 − D del conjunto', en: 'Whole-set 1 − D' }, fmt(tot.a.D1, 3)],
      [{ es: 'Chao1 corregido', en: 'Chao1 bias-corrected' }, fmt(tot.a.chao1bc, 1)],
      [{ es: 'Cobertura de muestra', en: 'Sample coverage' }, fmt(100 * tot.a.cov, 2) + ' %'],
      [{ es: 'Sitio más diverso (q = 1)', en: 'Most diverse site (q = 1)' },
        (() => { const s = rows.slice(0, -1).reduce((a, b) => (b.a.q1 > a.a.q1 ? b : a), rows[0]); return s.label; })()],
    ]);
    buildTable('divAlphaTable', alphaCols($('divAlphaView').value || 'basic'), rows);

    const inc = D.inc;
    const b = D.opts.base;
    $('divAlphaNotes').innerHTML =
      `<p class="hint">${L2(
        `H′ está en base ${b === 'e' ? 'e (nats)' : b}; J′ = H′/log(S) en la misma base. Los números de Hill son <b>números efectivos de taxones</b>: «este sitio se comporta como si tuviera q<sub>1</sub> taxones igualmente comunes» (Hill 1973; Jost 2006). Los únicos (f₁) y dobles (f₂) son los taxones con exactamente 1 y 2 registros: de ellos dependen Chao1, ACE y la cobertura.`,
        `H′ is in base ${b === 'e' ? 'e (nats)' : b}; J′ = H′/log(S) in the same base. The Hill numbers are <b>effective numbers of taxa</b>: "this site behaves as if it held q<sub>1</sub> equally common taxa" (Hill 1973; Jost 2006). The singletons (f₁) and doubletons (f₂) are the taxa with exactly 1 and 2 records: Chao1, ACE and the coverage all depend on them.`)}</p>` +
      `<h3>${L2('Estimadores por incidencia entre sitios', 'Incidence-based estimators across sites')}</h3>` +
      `<p class="hint">${L2(
        `Usan la presencia y ausencia en los ${inc.m} sitios en vez de los registros, así que no les afecta que un taxón esté sobrecoleccionado. Q₁ y Q₂ son los taxones presentes en exactamente 1 y 2 sitios.`,
        `They use presence and absence across the ${inc.m} sites instead of the records, so they are not affected by a taxon being over-collected. Q₁ and Q₂ are the taxa present in exactly 1 and 2 sites.`)}</p>` +
      `<div class="div-small-wrap"><table class="div-small"><tbody>` +
      `<tr><th>${L2('Sitios (m)', 'Sites (m)')}</th><td>${fmtInt(inc.m)}</td><th>Q₁</th><td>${fmtInt(inc.Q1)}</td><th>Q₂</th><td>${fmtInt(inc.Q2)}</td></tr>` +
      `<tr><th>${L2('Chao2 clásico', 'Chao2 classic')}</th><td>${fmt(inc.chao2, 2)}</td><th>${L2('Chao2 corregido', 'Chao2 bias-corrected')}</th><td>${fmt(inc.chao2bc, 2)}</td><th>ICE</th><td>${inc.ice == null ? '—' : fmt(inc.ice, 2)}</td></tr>` +
      `</tbody></table></div>`;
  }

  function renderBoot() {
    if (!D.boot || !D.boot.length) {
      $('divBootTable').innerHTML = `<p class="hint" style="padding:10px">${L2(
        'Ningún sitio tiene suficientes registros y taxones para remuestrear (se necesitan ≥2 taxones y ≥4 registros).',
        'No site has enough records and taxa to resample (at least 2 taxa and 4 records are needed).')}</p>`;
      return;
    }
    buildTable('divBootTable', [
      C_SITE,
      { key: 'n', label: 'N', get: r => fmtInt(r.n) },
      { key: 'H', label: { es: 'H′', en: 'H′' }, get: r => fmt(r.H, 3) },
      { key: 'Hci', label: { es: 'IC 95 % de H′', en: '95 % CI of H′' }, get: r => `${fmt(r.b.H[0], 3)} – ${fmt(r.b.H[1], 3)}` },
      { key: 'D1', label: '1 − D', get: r => fmt(r.D1, 4) },
      { key: 'Dci', label: { es: 'IC 95 % de 1 − D', en: '95 % CI of 1 − D' }, get: r => `${fmt(r.b.D1[0], 4)} – ${fmt(r.b.D1[1], 4)}` },
      { key: 'J', label: 'J′', get: r => fmt(r.J, 3) },
      { key: 'Jci', label: { es: 'IC 95 % de J′', en: '95 % CI of J′' }, get: r => `${fmt(r.b.J[0], 3)} – ${fmt(r.b.J[1], 3)}` },
    ], D.boot);
  }

  function renderCover() {
    const C = D.cover;
    buildTable('divCoverTable', [
      { key: 'site', label: { es: 'Sitio', en: 'Site' }, get: r => r.site },
      { key: 'n', label: 'N', get: r => fmtInt(r.n) },
      { key: 'S', label: { es: 'S observada', en: 'Observed S' }, get: r => fmtInt(r.S) },
      { key: 'cov', label: { es: 'Cobertura con todos sus registros', en: 'Coverage with all its records' }, get: r => fmt(100 * r.cov, 2) + ' %' },
      { key: 'mStar', label: { es: 'Registros necesarios para la cobertura común', en: 'Records needed for the common coverage' }, get: r => r.mStar == null ? '—' : fmtInt(r.mStar) },
      { key: 'sStar', label: { es: 'S esperada a esa cobertura', en: 'Expected S at that coverage' }, get: r => r.sStar == null ? '—' : fmt(r.sStar, 2) },
    ], C.rows);
    $('divCoverTable').insertAdjacentHTML('afterbegin',
      `<p class="hint" style="padding:8px 12px 0">${L2(
        `Cobertura común de referencia: <b>${fmt(100 * C.base, 2)} %</b>, la más baja de los sitios. La última columna es la comparación justa: la riqueza esperada de cada sitio cuando todos se llevan a esa misma cobertura (Chao y Jost 2012).`,
        `Common reference coverage: <b>${fmt(100 * C.base, 2)} %</b>, the lowest among the sites. The last column is the fair comparison: each site's expected richness when all of them are brought to that same coverage (Chao and Jost 2012).`)}</p>`);
  }

  function renderBeta() {
    const B = D.beta;
    if (!B) {
      $('divBetaTiles').innerHTML = '';
      $('divBetaNote').innerHTML = `<div class="msg msg-info">${L2(
        `La diversidad beta necesita al menos 2 sitios y como máximo ${MAX_BETA} (aquí hay ${D.mat.nS}). Sube el mínimo de registros por sitio o agranda las celdas.`,
        `Beta diversity needs at least 2 sites and at most ${MAX_BETA} (there are ${D.mat.nS} here). Raise the minimum number of records per site or enlarge the cells.`)}</div>`;
      return;
    }
    const mu = B.multi;
    statTiles('divBetaTiles', [
      ['β_sor', fmt(mu.bSor, 3)],
      [{ es: 'β_sim (recambio)', en: 'β_sim (turnover)' }, fmt(mu.bSim, 3)],
      [{ es: 'β_sne (anidamiento)', en: 'β_sne (nestedness)' }, fmt(mu.bSne, 3)],
      [{ es: 'β_w de Whittaker', en: "Whittaker's β_w" }, fmt(mu.bW, 3)],
      [{ es: 'S media por sitio', en: 'Mean S per site' }, fmt(mu.meanS, 2)],
    ]);
    const share = mu.bSor > 0 ? 100 * mu.bSim / mu.bSor : 0;
    if (D.mat.nT === 1) {
      /* with one taxon every site has the same composition: the "dissimilarities" only compare counts */
      $('divBetaNote').innerHTML = `<div class="msg msg-error">${L2(
        'Con <b>un solo taxón</b> todos los sitios tienen la misma composición: las betas de presencia valen 0 y las de abundancia (Bray y Curtis, Morisita y Horn) solo comparan <b>cuántos registros</b> tiene cada sitio, no qué taxones. La ordenación de abajo ordena los sitios por esfuerzo de colecta, no por su comunidad: no la interpretes como estructura.',
        'With <b>a single taxon</b> every site has the same composition: the presence-based betas are 0 and the abundance-based ones (Bray and Curtis, Morisita and Horn) only compare <b>how many records</b> each site holds, not which taxa. The ordination below arranges the sites by collecting effort, not by their community: do not read it as structure.')}</div>`;
      setFig('figDivBeta', figBeta);
      return;
    }
    $('divBetaNote').innerHTML = `<div class="msg msg-info">${L2(
      `La diversidad beta múltiple del conjunto es β_sor = ${fmt(mu.bSor, 3)}, y el <b>${fmt(share, 1)} %</b> se debe a <b>recambio</b> (unos taxones sustituyen a otros entre sitios) frente al ${fmt(100 - share, 1)} % debido a <b>anidamiento</b> (los sitios pobres son subconjuntos de los ricos), según la partición de Baselga (2010). β_w = ${fmt(mu.bW, 3)} de Whittaker (1960) indica cuántas veces la riqueza total supera la riqueza media por sitio, menos uno.`,
      `The multiple-site beta diversity of the set is β_sor = ${fmt(mu.bSor, 3)}, and <b>${fmt(share, 1)} %</b> of it comes from <b>turnover</b> (some taxa replace others between sites) against ${fmt(100 - share, 1)} % from <b>nestedness</b> (poor sites are subsets of rich ones), following Baselga's (2010) partition. Whittaker's (1960) β_w = ${fmt(mu.bW, 3)} says how many times the total richness exceeds the mean richness per site, minus one.`)}</div>`;
    setFig('figDivBeta', figBeta);
  }

  function renderRad() {
    const R = D.rad;
    if (!R) {
      $('divRadTable').innerHTML = '';
      $('divRadNote').innerHTML = `<div class="msg msg-info">${L2(
        'Se necesitan al menos 3 taxones con registros en el sitio elegido para ajustar los modelos de abundancia.',
        'At least 3 taxa with records in the chosen site are needed to fit the abundance models.')}</div>`;
      Views.drop('figDivRad'); $('figDivRad').innerHTML = '';
      Views.drop('figDivPreston'); $('figDivPreston').innerHTML = '';
      return;
    }
    buildTable('divRadTable', [
      { key: 'model', label: { es: 'Modelo', en: 'Model' }, get: r => RAD_NAME[r.key] },
      { key: 'k', label: { es: 'Parámetros', en: 'Parameters' }, get: r => String(r.k) },
      { key: 'll', label: { es: 'log-verosimilitud', en: 'log-likelihood' }, get: r => fmt(r.ll, 2) },
      { key: 'aic', label: 'AIC', get: r => fmt(r.aic, 2) },
      { key: 'daic', label: 'ΔAIC', get: r => fmt(r.dAic, 2) },
      { key: 'par', label: { es: 'Parámetros ajustados', en: 'Fitted parameters' },
        get: r => Object.entries(r.par).map(([k, v]) => `${k} = ${fmt(v, 3)}`).join(', ') || '—' },
    ], R.models);
    const best = R.models[0];
    $('divRadNote').innerHTML = `<div class="msg msg-success">${L2(
      `El modelo con el AIC más bajo es <b>${RAD_NAME[best.key].es}</b> (ΔAIC = 0). ${RAD_MEANING[best.key].es}`,
      `The model with the lowest AIC is <b>${RAD_NAME[best.key].en}</b> (ΔAIC = 0). ${RAD_MEANING[best.key].en}`)}</div>` +
      `<p class="hint">${L2(
        'Los cuatro modelos se ajustan por máxima verosimilitud de Poisson sobre los registros ordenados y se comparan por AIC; una diferencia de menos de 2 no distingue dos modelos. Con pocos taxones ningún modelo es concluyente.',
        'The four models are fitted by Poisson maximum likelihood on the ranked records and compared by AIC; a difference below 2 does not separate two models. With few taxa no model is conclusive.')}</p>`;
    setFig('figDivRad', figRad);
    if (D.preston && D.preston.length) setFig('figDivPreston', figPreston);
    else { Views.drop('figDivPreston'); $('figDivPreston').innerHTML = ''; }
  }

  function renderContrib() {
    const C = D.contrib;
    if (!C) { $('divContribTable').innerHTML = ''; return; }
    buildTable('divContribTable', [
      { key: 'taxon', label: { es: 'Taxón', en: 'Taxon' } },
      { key: 'meanA', label: { es: 'Registros medios en A', en: 'Mean records in A' }, get: r => fmt(r.meanA, 2) },
      { key: 'meanB', label: { es: 'Registros medios en B', en: 'Mean records in B' }, get: r => fmt(r.meanB, 2) },
      { key: 'delta', label: { es: 'Aportación media', en: 'Mean contribution' }, get: r => fmt(r.delta, 4) },
      { key: 'pct', label: { es: '% de la disimilitud', en: '% of the dissimilarity' }, get: r => fmt(r.pct, 2) },
      { key: 'cum', label: { es: '% acumulado', en: 'Cumulative %' }, get: r => fmt(r.cum, 2) },
      { key: 'ratio', label: { es: 'Aportación / DE', en: 'Contribution / SD' }, get: r => r.ratio == null ? '—' : fmt(r.ratio, 2) },
    ], C.rows, 40);
    $('divContribTable').insertAdjacentHTML('afterbegin',
      `<p class="hint" style="padding:8px 12px 0">${L2(
        `Disimilitud media de Bray y Curtis entre los dos conjuntos: <b>${fmt(C.bray, 4)}</b> (${C.pairs} parejas de sitios). Una razón aportación/DE alta significa que ese taxón separa los conjuntos de forma constante, no por culpa de un par de sitios.`,
        `Mean Bray and Curtis dissimilarity between the two sets: <b>${fmt(C.bray, 4)}</b> (${C.pairs} pairs of sites). A high contribution/SD ratio means that the taxon separates the sets consistently, not because of one or two sites.`)}</p>`);
  }

  function renderMethods() {
    const o = D.opts, m = D.mat;
    if (!o || !m) { $('divMethods').innerHTML = ''; return; }
    const site = T(SITE_MODE_TXT[o.mode].es, SITE_MODE_TXT[o.mode].en);
    const sz = fmt(o.size, o.size % 1 === 0 ? 0 : 2);
    const grain = o.mode === 'grid' ? T(` de ${sz} ${o.unit === 'km' ? 'km' : 'grados'}`, ` of ${sz} ${o.unit === 'km' ? 'km' : 'degrees'}`)
      : o.mode === 'elev' ? T(` (${o.bands} tramos)`, ` (${o.bands} bands)`) : '';
    const level = o.level === 'species' ? T('la especie', 'the species') : T('el taxón, subespecies y variedades incluidas', 'the taxon, including subspecies and varieties');
    const base = o.base === 'e' ? 'e' : String(o.base);
    const parts = [];
    parts.push(T(
      `Se construyó una matriz de comunidad de ${m.nS} sitios × ${m.nT} taxones con ${fmtInt(m.total)} registros de presencia, tomando como sitio ${site}${grain} y como taxón ${level}; se descartaron los sitios con menos de ${o.minN} registros. La abundancia es el número de registros por sitio y taxón, de modo que refleja el esfuerzo de muestreo y no la abundancia poblacional, por lo que los índices describen los registros.`,
      `A community matrix of ${m.nS} sites × ${m.nT} taxa was built from ${fmtInt(m.total)} presence records, taking as a site ${site}${grain} and as a taxon ${level}; sites with fewer than ${o.minN} records were dropped. Abundance is the number of records per site and taxon, so it reflects sampling effort rather than population abundance, and the indices therefore describe the records.`));
    parts.push(T(
      `Para cada sitio y para el conjunto se calcularon la riqueza observada, el índice de Shannon H′ en base ${base} (Shannon 1948), la equitatividad de Pielou J′ (Pielou 1966), el índice de Simpson D = Σp² con sus complementos 1 − D y 1/D (Simpson 1949), los números de Hill de orden 0, 1 y 2 interpretados como números efectivos de taxones (Hill 1973; Jost 2006), la dominancia de Berger y Parker (1970), las riquezas de Margalef (1958) y de Menhinick (1964), el índice de Brillouin y el parámetro α de la serie logarítmica resuelto numéricamente (Fisher et al. 1943).`,
      `For each site and for the whole set we computed observed richness, Shannon's H′ in base ${base} (Shannon 1948), Pielou's evenness J′ (Pielou 1966), Simpson's index D = Σp² with its complements 1 − D and 1/D (Simpson 1949), Hill numbers of order 0, 1 and 2 read as effective numbers of taxa (Hill 1973; Jost 2006), Berger and Parker dominance (1970), Margalef (1958) and Menhinick (1964) richness, the Brillouin index and the log-series parameter α solved numerically (Fisher et al. 1943).`));
    parts.push(T(
      `La riqueza no observada se estimó con Chao1 clásico y corregido por sesgo, con su varianza y su intervalo de confianza asimétrico del 95 % (Chao 1984, 1987), con ACE (Chao y Lee 1992) y con las navajas de primer y segundo orden; entre sitios se añadieron Chao2 e ICE sobre los datos de incidencia. La cobertura de muestra se estimó con el estimador de Good y Turing corregido (Chao y Jost 2012). Los intervalos de confianza del 95 % de H′, de 1 − D y de J′ se obtuvieron por remuestreo con ${o.reps} réplicas y semilla ${o.seed}.`,
      `Undetected richness was estimated with classic and bias-corrected Chao1, with its variance and asymmetric 95 % confidence interval (Chao 1984, 1987), with ACE (Chao and Lee 1992) and with the first- and second-order jackknives; across sites Chao2 and ICE were added from the incidence data. Sample coverage was estimated with the corrected Good and Turing estimator (Chao and Jost 2012). The 95 % confidence intervals of H′, 1 − D and J′ were obtained by resampling with ${o.reps} replicates and seed ${o.seed}.`));
    parts.push(T(
      `La rarefacción por individuos se calculó con la fórmula exacta de la riqueza esperada y su varianza analítica (Hurlbert 1971), con extrapolación hasta 2n (Colwell et al. 2012) y con una comparación de los sitios a igual cobertura de muestra (Chao y Jost 2012); la curva de acumulación por sitios es la media de ${o.reps} permutaciones con la misma semilla. El perfil de diversidad muestra los números de Hill para q entre 0 y 3.`,
      `Individual-based rarefaction was computed with the exact expected-richness formula and its analytical variance (Hurlbert 1971), with extrapolation up to 2n (Colwell et al. 2012) and with a comparison of the sites at equal sample coverage (Chao and Jost 2012); the sample-based accumulation curve is the mean of ${o.reps} permutations with the same seed. The diversity profile shows the Hill numbers for q between 0 and 3.`));
    if (D.beta) {
      const mu = D.beta.multi;
      /* the NMDS sentence is only added when the user ran it */
      const nm = D.nmds ? T(
        ` y con escalamiento multidimensional no métrico desde ${D.nmds.starts} arranques, con un estrés 1 final de ${fmt(D.nmds.stress, 4)} (Kruskal 1964)`,
        ` and with non-metric multidimensional scaling from ${D.nmds.starts} starts, reaching a final stress 1 of ${fmt(D.nmds.stress, 4)} (Kruskal 1964)`) : '';
      parts.push(T(
        `La diversidad beta se describió con las disimilitudes de Jaccard y de Sørensen sobre presencias, de Bray y Curtis (1957) y de Morisita y Horn (Morisita 1959) sobre los registros, y con la partición de Sørensen en recambio (β_sim) y anidamiento (β_sne) según Baselga (2010); para el conjunto β_sor = ${fmt(mu.bSor, 3)}, β_sim = ${fmt(mu.bSim, 3)} y β_sne = ${fmt(mu.bSne, 3)}, con β_w de Whittaker (1960) = ${fmt(mu.bW, 3)}. Los sitios se ordenaron con coordenadas principales sobre la matriz doblemente centrada (Gower 1966)${nm}. La aportación de cada taxón a la diferencia entre conjuntos de sitios se obtuvo descomponiendo la disimilitud media de Bray y Curtis (Clarke 1993).`,
        `Beta diversity was described with Jaccard and Sørensen dissimilarities on presences, Bray and Curtis (1957) and Morisita and Horn (Morisita 1959) on the records, and with the partition of Sørensen into turnover (β_sim) and nestedness (β_sne) after Baselga (2010); for the whole set β_sor = ${fmt(mu.bSor, 3)}, β_sim = ${fmt(mu.bSim, 3)} and β_sne = ${fmt(mu.bSne, 3)}, with Whittaker's (1960) β_w = ${fmt(mu.bW, 3)}. The sites were ordinated with principal coordinates on the double-centred matrix (Gower 1966)${nm}. Each taxon's contribution to the difference between sets of sites was obtained by decomposing the mean Bray and Curtis dissimilarity (Clarke 1993).`));
    }
    if (D.rad) {
      parts.push(T(
        `La estructura de las abundancias se examinó con el diagrama de rango y abundancia (Whittaker 1960), ajustando por máxima verosimilitud de Poisson los modelos de bastón roto, serie geométrica, lognormal y serie logarítmica y comparándolos por AIC (el mejor fue ${RAD_NAME[D.rad.models[0].key].es}), y con el histograma de octavas de Preston (1948).`,
        `The structure of the abundances was examined with the rank-abundance diagram (Whittaker 1960), fitting the broken stick, geometric series, lognormal and log-series models by Poisson maximum likelihood and comparing them by AIC (the best was ${RAD_NAME[D.rad.models[0].key].en}), and with Preston's (1948) octave histogram.`));
    }
    parts.push(T(
      `Las diferencias entre índices de Shannon se probaron con la t de Hutcheson (1970) y con una prueba de permutación de ${o.reps} réplicas; las comparaciones por pares llevan la corrección de Holm. Los conceptos y las fórmulas siguen a Magurran (2004).`,
      `Differences between Shannon indices were tested with Hutcheson's t (1970) and with a permutation test of ${o.reps} replicates; pairwise comparisons carry Holm's correction. Concepts and formulae follow Magurran (2004).`));
    const refs = [
      'Baselga, A. (2010). Global Ecology and Biogeography 19: 134–143.',
      'Berger, W. H. & Parker, F. L. (1970). Science 168: 1345–1347.',
      'Bray, J. R. & Curtis, J. T. (1957). Ecological Monographs 27: 325–349.',
      'Chao, A. (1984). Scandinavian Journal of Statistics 11: 265–270.',
      'Chao, A. (1987). Biometrics 43: 783–791.',
      'Chao, A. & Lee, S.-M. (1992). Journal of the American Statistical Association 87: 210–217.',
      'Chao, A. & Jost, L. (2012). Ecology 93: 2533–2547.',
      'Clarke, K. R. (1993). Australian Journal of Ecology 18: 117–143.',
      'Colwell, R. K. et al. (2012). Journal of Plant Ecology 5: 3–21.',
      'Fisher, R. A., Corbet, A. S. & Williams, C. B. (1943). Journal of Animal Ecology 12: 42–58.',
      'Gower, J. C. (1966). Biometrika 53: 325–338.',
      'Heck, K. L., van Belle, G. & Simberloff, D. (1975). Ecology 56: 1459–1461.',
      'Hill, M. O. (1973). Ecology 54: 427–432.',
      'Hurlbert, S. H. (1971). Ecology 52: 577–586.',
      'Hutcheson, K. (1970). Journal of Theoretical Biology 29: 151–154.',
      'Jost, L. (2006). Oikos 113: 363–375.',
      'Kruskal, J. B. (1964). Psychometrika 29: 1–27.',
      'Magurran, A. E. (2004). Measuring Biological Diversity. Blackwell, Oxford.',
      'Margalef, R. (1958). General Systems 3: 36–71.',
      'Menhinick, E. F. (1964). Ecology 45: 859–861.',
      'Morisita, M. (1959). Memoirs of the Faculty of Science, Kyushu University, Series E 3: 65–80.',
      'Pielou, E. C. (1966). Journal of Theoretical Biology 13: 131–144.',
      'Preston, F. W. (1948). Ecology 29: 254–283.',
      'Shannon, C. E. (1948). Bell System Technical Journal 27: 379–423.',
      'Simpson, E. H. (1949). Nature 163: 688.',
      'Whittaker, R. H. (1960). Ecological Monographs 30: 279–338.',
    ];
    D.methodsText = parts.join(' ') + '\n\n' + T('Referencias', 'References') + '\n' + refs.join('\n');
    $('divMethods').innerHTML = parts.map(t => `<p>${esc(t)}</p>`).join('') +
      `<h3>${L2('Referencias', 'References')}</h3><ul class="div-refs">` +
      refs.map(r => `<li>${esc(r)}</li>`).join('') + '</ul>';
  }

  /* ======================================================================
     12. tests: one pair and every pair
     ====================================================================== */

  function renderTest() {
    const m = D.mat, ia = +$('divTestA').value, ib = +$('divTestB').value;
    if (!(ia >= 0) || !(ib >= 0) || ia === ib) {
      $('divTestOut').innerHTML = `<div class="msg msg-warning">${L2('Elige dos sitios distintos.', 'Pick two different sites.')}</div>`;
      return;
    }
    const x = rowOf(m, ia), y = rowOf(m, ib), o = D.opts;
    const h = hutcheson(x, y, o.base);
    const pr = permTestH(x, y, o.base, o.reps, o.seed);
    const la = sLab(m.sites[ia]), lb = sLab(m.sites[ib]);
    const same = h.p >= 0.05;
    $('divTestOut').innerHTML =
      `<div class="msg msg-${same ? 'info' : 'success'}">${L2(
        `<b>${esc(la)}</b> tiene H′ = ${fmt(h.Ha, 3)} y <b>${esc(lb)}</b> H′ = ${fmt(h.Hb, 3)}; la diferencia es ${fmt(h.diff, 3)} (error estándar ${fmt(h.se, 4)}). Prueba t de Hutcheson: t = ${fmt(h.t, 3)} con ${fmt(h.df, 1)} grados de libertad, ${pText(h.p)}. Prueba de permutación con ${pr.reps} réplicas: ${pText(pr.p)}. ${same ? 'No hay evidencia de que los dos sitios difieran en H′.' : 'Los dos sitios difieren en H′.'}`,
        `<b>${esc(la)}</b> has H′ = ${fmt(h.Ha, 3)} and <b>${esc(lb)}</b> H′ = ${fmt(h.Hb, 3)}; the difference is ${fmt(h.diff, 3)} (standard error ${fmt(h.se, 4)}). Hutcheson's t-test: t = ${fmt(h.t, 3)} with ${fmt(h.df, 1)} degrees of freedom, ${pText(h.p)}. Permutation test with ${pr.reps} replicates: ${pText(pr.p)}. ${same ? 'There is no evidence that the two sites differ in H′.' : 'The two sites differ in H′.'}`)}</div>` +
      `<p class="hint">${L2(
        'La prueba t de Hutcheson supone que los registros son independientes; la de permutación no supone nada sobre la distribución y mezcla los registros de los dos sitios. Si discrepan, hazle más caso a la de permutación.',
        "Hutcheson's t-test assumes the records are independent; the permutation test assumes nothing about the distribution and shuffles the records of the two sites. When they disagree, trust the permutation test.")}</p>`;
  }

  function renderPairs() {
    const m = D.mat, o = D.opts, raw = [];
    for (let i = 0; i < m.nS; i++) for (let j = i + 1; j < m.nS; j++) {
      const h = hutcheson(rowOf(m, i), rowOf(m, j), o.base);
      raw.push({ a: m.sites[i].label, b: m.sites[j].label, Ha: h.Ha, Hb: h.Hb, diff: h.diff, t: h.t, df: h.df, p: h.p });
    }
    if (!raw.length) { $('divPairTable').innerHTML = `<p class="hint" style="padding:10px">${L2('Hacen falta al menos 2 sitios.', 'At least 2 sites are needed.')}</p>`; return; }
    const adj = holm(raw.map(r => isFinite(r.p) ? r.p : 1));
    raw.forEach((r, i) => { r.padj = adj[i]; });
    raw.sort((a, b) => (a.padj - b.padj) || (b.diff * b.diff - a.diff * a.diff));
    D.pairs = raw;
    buildTable('divPairTable', [
      { key: 'a', label: { es: 'Sitio A', en: 'Site A' } },
      { key: 'b', label: { es: 'Sitio B', en: 'Site B' } },
      { key: 'Ha', label: 'H′ A', get: r => fmt(r.Ha, 3) },
      { key: 'Hb', label: 'H′ B', get: r => fmt(r.Hb, 3) },
      { key: 'diff', label: { es: 'Diferencia', en: 'Difference' }, get: r => fmt(r.diff, 3) },
      { key: 't', label: 't', get: r => fmt(r.t, 3) },
      { key: 'df', label: { es: 'gl', en: 'df' }, get: r => fmt(r.df, 1) },
      { key: 'p', label: 'p', get: r => pCell(r.p) },
      { key: 'padj', label: { es: 'p con Holm', en: 'p with Holm' }, get: r => pCell(r.padj) },
      { key: 'sig', label: { es: 'Difieren (α = 0.05)', en: 'Differ (α = 0.05)' },
        get: r => r.padj < 0.05 ? { es: 'sí', en: 'yes' } : { es: 'no', en: 'no' } },
    ], raw, 200);
    const nsig = raw.filter(r => r.padj < 0.05).length;
    $('divPairTable').insertAdjacentHTML('afterbegin',
      `<p class="hint" style="padding:8px 12px 0">${L2(
        `${raw.length} ${raw.length === 1 ? 'comparación' : 'comparaciones'}; ${nsig} ${nsig === 1 ? 'sigue siendo significativa' : 'siguen siendo significativas'} tras la corrección de Holm. Las p se dan exactas hasta 0.001.`,
        `${raw.length} ${raw.length === 1 ? 'comparison' : 'comparisons'}; ${nsig} ${nsig === 1 ? 'remains' : 'remain'} significant after Holm's correction. The p values are exact down to 0.001.`)}</p>`);
  }

  /* ======================================================================
     13. the pipeline
     ====================================================================== */

  const MAX_BETA = 80, MAX_BOOT = 60, FIG_SITES = 8, PROF_SITES = 10;

  function readOpts() {
    const bv = $('divLogBase').value;
    return {
      mode: $('divSiteMode').value || 'grid',
      size: Math.max(0.01, +$('divGridSize').value || 200),
      unit: $('divGridUnit').value || 'km',
      bands: Math.max(2, +$('divElevBands').value || 6),
      level: $('divTaxonLevel').value || 'taxon',
      minN: Math.max(1, +$('divMinN').value || 1),
      base: bv === '2' ? 2 : bv === '10' ? 10 : 'e',
      reps: Math.min(2000, Math.max(50, +$('divBootReps').value || 200)),
      seed: Math.max(1, +$('divSeed').value || 42),
      band: $('divRarefBand').checked,
      extrap: $('divExtrap').checked,
    };
  }
  function prog(f, text) {
    $('divProgress').style.display = 'flex';
    $('divProgressFill').style.width = Math.round(f * 100) + '%';
    $('divProgressLabel').textContent = text;
  }
  const progEnd = () => { $('divProgress').style.display = 'none'; };

  async function run() {
    if (D.running) return;
    clearMessages('divMessages');
    const rec = records();
    if (!rec.rows.length) { refreshStatus(); return; }
    const o = readOpts();
    D.running = true;
    $('divRunBtn').disabled = true;
    try {
      prog(0.04, T('Armando la matriz de comunidad…', 'Building the community matrix…'));
      await sleep(0);
      const m = buildMatrix(o);
      if (!m) {
        showMessage('divMessages', 'error', L2(
          'No se pudo armar la matriz con esa definición de sitio. Prueba otra (por ejemplo, una malla) o revisa que los registros tengan el dato que pides.',
          'The matrix could not be built with that definition of a site. Try another one (a grid, for instance) or check that the records carry the field you asked for.'));
        return;
      }
      if (m.empty) {
        showMessage('divMessages', 'warning', L2(
          `Ningún sitio llega a ${m.minN} registros: los ${m.nSitesAll} sitios quedaron fuera. Baja el mínimo o usa sitios más grandes.`,
          `No site reaches ${m.minN} records: all ${m.nSitesAll} sites were left out. Lower the minimum or use larger sites.`));
        return;
      }
      D.mat = m; D.opts = o;
      D.nmds = null; D.contrib = null; D.pairs = null;
      clearFigs();
      $('divNmdsNote').innerHTML = ''; $('divContribTable').innerHTML = ''; $('divPairTable').innerHTML = ''; $('divTestOut').innerHTML = '';

      /* ---- alpha ---- */
      prog(0.14, T('Índices alfa por sitio…', 'Alpha indices per site…'));
      await sleep(0);
      const rows = [];
      for (let i = 0; i < m.nS; i++) {
        rows.push({ id: m.sites[i].id, label: m.sites[i].label, i, a: alphaOf(rowOf(m, i), o.base) });
        if (i % 40 === 39) { prog(0.14 + 0.08 * i / m.nS, T('Índices alfa por sitio…', 'Alpha indices per site…')); await sleep(0); }
      }
      rows.push({ id: '__all__', label: { es: 'Conjunto completo', en: 'Whole set' }, i: -1, total: true, a: alphaOf(m.colTot, o.base) });
      D.alpha = rows;
      D.inc = incidenceEstimators(m);

      /* ---- bootstrap intervals ---- */
      prog(0.28, T('Intervalos por remuestreo…', 'Resampling intervals…'));
      await sleep(0);
      const bootIdx = m.nS <= MAX_BOOT ? m.sites.map((_, i) => i) : figSites(MAX_BOOT);
      const boot = [];
      for (const i of bootIdx) {
        const b = bootstrapCI(rowOf(m, i), o.base, o.reps, o.seed + i);
        if (b) boot.push({ label: m.sites[i].label, n: m.sites[i].n, H: rows[i].a.H, D1: rows[i].a.D1, J: rows[i].a.J, b });
        await sleep(0);
      }
      const bt = bootstrapCI(m.colTot, o.base, o.reps, o.seed);
      if (bt) boot.push({ label: { es: 'Conjunto completo', en: 'Whole set' }, n: m.total, H: rows[rows.length - 1].a.H, D1: rows[rows.length - 1].a.D1, J: rows[rows.length - 1].a.J, b: bt });
      D.boot = boot;

      /* ---- diversity profile ---- */
      prog(0.42, T('Perfil de diversidad…', 'Diversity profile…'));
      await sleep(0);
      const qs = [];
      for (let q = 0; q <= 3.0001; q += 0.25) qs.push(+q.toFixed(2));
      const profIdx = m.nS <= PROF_SITES ? m.sites.map((_, i) => i) : figSites(PROF_SITES);
      const prof = profIdx.map(i => ({ i, v: qs.map(q => hill(propOf(rowOf(m, i)), q)) }));
      prof.push({ i: -1, total: true, v: qs.map(q => hill(propOf(m.colTot), q)) });
      D.profile = { qs, rows: prof, shown: profIdx.length, of: m.nS };

      /* ---- rarefaction ---- */
      prog(0.54, T('Rarefacción…', 'Rarefaction…'));
      await sleep(0);
      const rIdx = m.nS <= FIG_SITES ? m.sites.map((_, i) => i) : figSites(FIG_SITES);
      const rr = [];
      for (const i of rIdx) {
        rr.push({ i, id: m.sites[i].id, pts: rarefyCurve(rowOf(m, i), o) });
        await sleep(0);
      }
      rr.push({ i: -1, id: '__all__', total: true, pts: rarefyCurve(m.colTot, o) });
      D.raref = { rows: rr, shown: rIdx.length, of: m.nS };

      prog(0.66, T('Curva de acumulación…', 'Accumulation curve…'));
      await sleep(0);
      D.accum = accumulation(m, Math.min(o.reps, 500), o.seed);
      D.cover = coverageComparison(m);

      /* ---- beta ---- */
      prog(0.76, T('Diversidad beta…', 'Beta diversity…'));
      await sleep(0);
      if (m.nS >= 2 && m.nS <= MAX_BETA) {
        const B = betaMatrices(m);
        B.active = $('divBetaIndex').value && B.mats[$('divBetaIndex').value] ? $('divBetaIndex').value : 'bray';
        B.tree = upgma(B.mats[B.active]);
        D.beta = B;
        await sleep(0);
        D.pcoa = m.nS >= 3 ? pcoa(B.mats[B.active]) : null;
      } else { D.beta = null; D.pcoa = null; }

      /* ---- abundance models ---- */
      prog(0.88, T('Modelos de abundancia…', 'Abundance models…'));
      await sleep(0);
      fitRad('__all__');

      /* ---- render ---- */
      prog(0.96, T('Dibujando…', 'Drawing…'));
      await sleep(0);
      renderMatrix();
      renderHonesty();
      renderAlpha();
      renderBoot();
      setFig('figDivProfile', figProfile);
      setFig('figDivRaref', figRaref);
      setFig('figDivAccum', figAccum);
      renderCover();
      renderBeta();
      if (D.pcoa) setFig('figDivPcoa', figPcoa);
      else { Views.drop('figDivPcoa'); $('figDivPcoa').innerHTML = `<p class="hint">${L2('Se necesitan al menos 3 sitios para la PCoA.', 'At least 3 sites are needed for the PCoA.')}</p>`; }
      renderRad();
      fillResultSelects();
      renderMethods();
      $('divOut').style.display = 'block';
      const note = [];
      if (D.raref.shown < m.nS) note.push(L2(`la rarefacción dibuja los ${D.raref.shown} sitios con más registros`, `the rarefaction draws the ${D.raref.shown} sites with most records`));
      if (D.profile.shown < m.nS) note.push(L2(`el perfil dibuja los ${D.profile.shown} con más registros`, `the profile draws the ${D.profile.shown} with most records`));
      showMessage('divMessages', 'success', L2(
        `Listo: ${m.nS} ${m.nS === 1 ? 'sitio' : 'sitios'} × ${m.nT} ${m.nT === 1 ? 'taxón' : 'taxones'}, ${fmtInt(m.total)} registros.`,
        `Done: ${m.nS} ${m.nS === 1 ? 'site' : 'sites'} × ${m.nT} ${m.nT === 1 ? 'taxon' : 'taxa'}, ${fmtInt(m.total)} records.`) + (note.length ? ' (' + note.join('; ') + ').' : ''));
    } catch (e) {
      console.error(e);
      showMessage('divMessages', 'error', L2('Error en el cálculo de la diversidad: ', 'Error computing the diversity: ') + esc(e.message));
    } finally {
      D.running = false;
      $('divRunBtn').disabled = false;
      progEnd();
    }
  }

  /* rank-abundance fit of one site (or of the whole set) */
  function fitRad(id) {
    const m = D.mat;
    const x = id === '__all__' ? m.colTot : rowOf(m, m.sites.findIndex(s => s.id === id));
    D.rad = radFit(x);
    D.preston = prestonOctaves(x);
    D.prestonFit = null;
    if (D.rad && D.preston) {
      /* expected taxa per octave under the fitted lognormal, for the outline of the histogram */
      const ln = D.rad.models.find(mo => mo.key === 'lognormal');
      if (ln) {
        const exp = new Float64Array(D.preston.length);
        ln.mu.forEach(v => {
          const oc = Math.max(1, Math.min(D.preston.length, Math.floor(Math.log2(Math.max(v, 1))) + 1));
          const k = D.preston.findIndex(r => r.oct === oc);
          if (k >= 0) exp[k] += 1;
        });
        D.prestonFit = Array.from(exp);
      }
    }
  }

  /* ======================================================================
     14. exports
     ====================================================================== */

  const dlName = suf => slugName(state.query || 'records') + '_diversity_' + suf;
  const csvLab = v => (v && typeof v === 'object' && v.es != null) ? T(v.es, v.en) : String(v ?? '');
  const csvOf = lines => '﻿' + lines.join('\n');

  const CSV = {
    matrix: () => {
      const m = D.mat;
      const head = [T('sitio', 'site'), ...m.taxa, T('total', 'total'), 'S'].map(csvEscape).join(',');
      const body = m.sites.map((s, i) => {
        const r = rowOf(m, i);
        return [csvEscape(csvLab(s.label)), ...Array.from(r), s.n, s.S].join(',');
      });
      const tot = [csvEscape(T('total', 'total')), ...Array.from(m.colTot), m.total, m.nT].join(',');
      return { name: dlName('matrix.csv'), text: csvOf([head, ...body, tot]) };
    },
    long: () => {
      const m = D.mat, out = [[T('sitio', 'site'), T('taxon', 'taxon'), T('registros', 'records')].map(csvEscape).join(',')];
      for (let i = 0; i < m.nS; i++) for (let j = 0; j < m.nT; j++) {
        const v = m.M[i * m.nT + j];
        if (v) out.push([csvEscape(csvLab(m.sites[i].label)), csvEscape(m.taxa[j]), v].join(','));
      }
      return { name: dlName('matrix_long.csv'), text: csvOf(out) };
    },
    alpha: () => ({ name: dlName('alpha.csv'), text: toCSV(alphaCols('all'), D.alpha) }),
    boot: () => ({
      name: dlName('bootstrap.csv'),
      text: toCSV([
        C_SITE, { key: 'n', label: 'N', get: r => r.n },
        { key: 'H', label: 'H', get: r => r.H }, { key: 'H_lo', label: 'H_lo95', get: r => r.b.H[0] }, { key: 'H_hi', label: 'H_hi95', get: r => r.b.H[1] },
        { key: 'D1', label: '1_minus_D', get: r => r.D1 }, { key: 'D_lo', label: '1_minus_D_lo95', get: r => r.b.D1[0] }, { key: 'D_hi', label: '1_minus_D_hi95', get: r => r.b.D1[1] },
        { key: 'J', label: 'J', get: r => r.J }, { key: 'J_lo', label: 'J_lo95', get: r => r.b.J[0] }, { key: 'J_hi', label: 'J_hi95', get: r => r.b.J[1] },
      ], D.boot || []),
    }),
    profile: () => {
      const P = D.profile;
      const head = ['q', ...P.rows.map(rowLabel)].map(csvEscape).join(',');
      const body = P.qs.map((q, k) => [q, ...P.rows.map(r => isFinite(r.v[k]) ? r.v[k].toFixed(6) : '')].join(','));
      return { name: dlName('hill_profile.csv'), text: csvOf([head, ...body]) };
    },
    raref: () => {
      const out = [[T('sitio', 'site'), 'm', 'E_S', 'sd', 'lo95', 'hi95', T('tipo', 'type')].map(csvEscape).join(',')];
      D.raref.rows.forEach(r => r.pts.forEach(q => out.push([
        csvEscape(rowLabel(r)), q.m, q.e.toFixed(4), q.sd ? q.sd.toFixed(4) : '',
        isFinite(q.lo) ? q.lo.toFixed(4) : '', isFinite(q.hi) ? q.hi.toFixed(4) : '',
        q.ext ? T('extrapolado', 'extrapolated') : T('interpolado', 'interpolated'),
      ].join(','))));
      return { name: dlName('rarefaction.csv'), text: csvOf(out) };
    },
    accum: () => {
      const out = [[T('sitios', 'sites'), 'E_S', 'sd', 'lo95', 'hi95'].join(',')];
      D.accum.forEach(q => out.push([q.k, q.e.toFixed(4), q.sd.toFixed(4), q.lo.toFixed(4), q.hi.toFixed(4)].join(',')));
      return { name: dlName('accumulation.csv'), text: csvOf(out) };
    },
    cover: () => ({
      name: dlName('coverage.csv'),
      text: toCSV([
        { key: 'site', label: T('sitio', 'site') }, { key: 'n', label: 'N' }, { key: 'S', label: 'S_obs' },
        { key: 'cov', label: 'coverage', get: r => r.cov }, { key: 'mStar', label: 'm_at_common_coverage' },
        { key: 'sStar', label: 'S_at_common_coverage', get: r => r.sStar },
      ], D.cover.rows),
    }),
    beta: () => {
      const B = D.beta, m = D.mat;
      if (!B) return null;
      const out = [];
      Object.keys(B.mats).forEach(k => {
        out.push('# ' + csvLab(BETA_NAME[k]));
        out.push(['', ...m.sites.map(s => csvLab(s.label))].map(csvEscape).join(','));
        for (let i = 0; i < m.nS; i++)
          out.push([csvEscape(csvLab(m.sites[i].label)), ...Array.from(B.mats[k][i], v => v.toFixed(6))].join(','));
        out.push('');
      });
      const mu = B.multi;
      out.push('# ' + T('diversidad beta múltiple', 'multiple-site beta diversity'));
      out.push(['beta_sor', mu.bSor.toFixed(6)].join(','));
      out.push(['beta_sim', mu.bSim.toFixed(6)].join(','));
      out.push(['beta_sne', mu.bSne.toFixed(6)].join(','));
      out.push(['beta_w', mu.bW.toFixed(6)].join(','));
      return { name: dlName('beta.csv'), text: csvOf(out) };
    },
    pcoa: () => {
      const P = D.pcoa, m = D.mat;
      if (!P) return null;
      const head = [T('sitio', 'site'), ...P.dims.map((_, k) => 'PCo' + (k + 1))].map(csvEscape).join(',');
      const body = m.sites.map((s, i) => [csvEscape(csvLab(s.label)), ...P.dims.map(d => d.coord[i].toFixed(6))].join(','));
      const eig = ['# ' + T('valores propios y % explicado', 'eigenvalues and % explained'),
        ...P.dims.map((d, k) => ['PCo' + (k + 1), d.lam.toFixed(6), d.pct.toFixed(3)].join(','))];
      return { name: dlName('pcoa.csv'), text: csvOf([head, ...body, '', ...eig]) };
    },
    nmds: () => {
      const N = D.nmds, m = D.mat;
      if (!N) return null;
      const head = [T('sitio', 'site'), 'NMDS1', 'NMDS2'].join(',');
      const body = m.sites.map((s, i) => [csvEscape(csvLab(s.label)), N.X[i][0].toFixed(6), N.X[i][1].toFixed(6)].join(','));
      return { name: dlName('nmds.csv'), text: csvOf([head, ...body, '', '# stress_1,' + N.stress.toFixed(6)]) };
    },
    contrib: () => {
      if (!D.contrib) return null;
      return {
        name: dlName('contributions.csv'),
        text: toCSV([
          { key: 'taxon', label: T('taxon', 'taxon') }, { key: 'meanA', label: 'mean_A' }, { key: 'meanB', label: 'mean_B' },
          { key: 'delta', label: 'contribution' }, { key: 'pct', label: 'percent' }, { key: 'cum', label: 'cumulative_percent' },
          { key: 'ratio', label: 'contribution_over_sd' },
        ], D.contrib.rows),
      };
    },
    rad: () => {
      const R = D.rad;
      if (!R) return null;
      const head = [T('rango', 'rank'), T('observado', 'observed'), ...R.models.map(mo => csvLab(RAD_NAME[mo.key]))].map(csvEscape).join(',');
      const body = R.obs.map((v, k) => [k + 1, v, ...R.models.map(mo => mo.mu[k].toFixed(4))].join(','));
      const aic = ['', '# AIC', ...R.models.map(mo => [csvLab(RAD_NAME[mo.key]), mo.k, mo.ll.toFixed(4), mo.aic.toFixed(4), mo.dAic.toFixed(4)].join(','))];
      return { name: dlName('rank_abundance.csv'), text: csvOf([head, ...body, ...aic]) };
    },
    pairs: () => {
      if (!D.pairs) return null;
      return {
        name: dlName('pairwise_shannon.csv'),
        text: toCSV([
          { key: 'a', label: 'site_A' }, { key: 'b', label: 'site_B' }, { key: 'Ha', label: 'H_A' }, { key: 'Hb', label: 'H_B' },
          { key: 'diff', label: 'difference' }, { key: 't', label: 't' }, { key: 'df', label: 'df' },
          { key: 'p', label: 'p' }, { key: 'padj', label: 'p_holm' },
        ], D.pairs),
      };
    },
    methods: () => D.methodsText ? { name: dlName('methods.txt'), text: D.methodsText, mime: 'text/plain;charset=utf-8' } : null,
  };

  /* ======================================================================
     15. selects, status and events
     ====================================================================== */

  function fillSelect(id, items, keepValue) {
    const sel = $(id);
    if (!sel) return;
    const prev = keepValue === undefined ? sel.value : keepValue;
    sel.innerHTML = '';
    items.forEach(([v, lb]) => sel.add(new Option(typeof lb === 'string' ? lb : T(lb.es, lb.en), v)));
    if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
  }
  function fillConfigSelects() {
    fillSelect('divSiteMode', siteModes());
    fillSelect('divTaxonLevel', taxonLevels());
    fillSelect('divGridUnit', [['km', { es: 'kilómetros', en: 'kilometres' }], ['deg', { es: 'grados', en: 'degrees' }]]);
    fillSelect('divLogBase', [['e', { es: 'e (nats)', en: 'e (nats)' }], ['2', { es: '2 (bits)', en: '2 (bits)' }], ['10', { es: '10 (dits)', en: '10 (dits)' }]]);
    fillSelect('divAlphaView', Object.entries(ALPHA_VIEWS).map(([k, v]) => [k, v]));
    fillSelect('divRarefScale', [
      ['auto', { es: 'automático', en: 'automatic' }],
      ['linear', { es: 'lineal', en: 'linear' }],
      ['log', { es: 'logarítmico', en: 'logarithmic' }],
    ]);
    /* Bray and Curtis is the default index: it uses the counts, and the module already warns
       about what those counts mean */
    fillSelect('divBetaIndex', Object.entries(BETA_NAME).map(([k, v]) => [k, v]), $('divBetaIndex').value || 'bray');
    toggleModeOpts();
  }
  function fillResultSelects() {
    const m = D.mat;
    if (!m) return;
    const items = m.sites.map((s, i) => [String(i), sLab(s)]);
    fillSelect('divTestA', items, $('divTestA').value || '0');
    fillSelect('divTestB', items, $('divTestB').value || (m.nS > 1 ? '1' : '0'));
    fillSelect('divRadSite', [['__all__', { es: 'el conjunto completo', en: 'the whole set' }], ...m.sites.map(s => [s.id, sLab(s)])]);
    /* multiple pickers: half the sites on each side by default */
    [['divGroupA', 0], ['divGroupB', 1]].forEach(([id, half]) => {
      const sel = $(id), prev = [...sel.selectedOptions].map(o => o.value);
      sel.innerHTML = '';
      m.sites.forEach((s, i) => sel.add(new Option(sLab(s), String(i))));
      const mid = Math.ceil(m.nS / 2);
      [...sel.options].forEach((op, i) => {
        op.selected = prev.length ? prev.includes(op.value) : (half === 0 ? i < mid : i >= mid);
      });
    });
  }
  function toggleModeOpts() {
    const mode = $('divSiteMode').value;
    $('divGridOpts').style.display = mode === 'grid' ? 'inline' : 'none';
    $('divElevOpts').style.display = mode === 'elev' ? 'inline' : 'none';
  }

  function refreshStatus() {
    const rec = records(), box = $('divStatus');
    if (!box) return;
    if (!rec.rows.length) {
      box.innerHTML = `<div class="msg msg-info">${L2(
        'Todavía no hay registros que analizar. Descarga o carga registros en el <b>paso 1</b> y límpialos en el <b>paso 3</b>; si además extraes las variables del <b>paso 5</b>, podrás usar el clima de Köppen, el tipo de suelo y la altitud para definir los sitios.',
        'There are no records to analyse yet. Download or load records in <b>step 1</b> and clean them in <b>step 3</b>; if you also extract the variables of <b>step 5</b>, you will be able to use the Köppen climate, the soil type and the elevation to define the sites.')}</div>`;
      $('divRunBtn').disabled = true;
      return;
    }
    $('divRunBtn').disabled = false;
    const nTax = new Set(rec.rows.map(r => r.taxon || r.species).filter(Boolean)).size;
    const extra = [];
    if (rec.src === 'clean') extra.push(L2('extrae las variables del paso 5 para definir sitios por clima, suelo o altitud',
      'extract the variables of step 5 to define sites by climate, soil or elevation'));
    if (typeof clusterPts === 'undefined' || !clusterPts) extra.push(L2('ejecuta el agrupamiento de arriba para usar los grupos como sitios',
      'run the clustering above to use the clusters as sites'));
    box.innerHTML = `<div class="msg msg-info">${L2(
      `Hay <b>${fmtInt(rec.rows.length)} registros</b> de <b>${nTax} ${nTax === 1 ? 'taxón' : 'taxones'}</b> (${rec.src === 'env' ? 'tabla del paso 5' : 'registros limpios del paso 3'}). Pulsa «Calcular la diversidad» con las opciones de arriba.`,
      `There are <b>${fmtInt(rec.rows.length)} records</b> of <b>${nTax} ${nTax === 1 ? 'taxon' : 'taxa'}</b> (${rec.src === 'env' ? 'table of step 5' : 'clean records of step 3'}). Press "Compute diversity" with the options above.`) +
      (extra.length ? '<br>' + L2('Opcional: ', 'Optional: ') + extra.join('; ') + '.' : '')}</div>`;
  }

  /* ---------- wiring ---------- */
  function wire() {
    $('divRunBtn').addEventListener('click', run);
    $('divSiteMode').addEventListener('change', () => {
      toggleModeOpts();
      const u = $('divGridUnit');
      if ($('divSiteMode').value === 'grid' && u.value === 'km' && +$('divGridSize').value < 1) $('divGridSize').value = 200;
    });
    $('divGridUnit').addEventListener('change', () => {
      const u = $('divGridUnit').value, s = +$('divGridSize').value;
      if (u === 'deg' && s > 20) $('divGridSize').value = 1;
      if (u === 'km' && s <= 20) $('divGridSize').value = 200;
    });
    $('divAlphaView').addEventListener('change', () => {
      if (D.alpha) buildTable('divAlphaTable', alphaCols($('divAlphaView').value), D.alpha);
    });
    $('divBetaIndex').addEventListener('change', () => {
      if (!D.beta) return;
      D.beta.active = $('divBetaIndex').value;
      D.beta.tree = upgma(D.beta.mats[D.beta.active]);
      D.pcoa = D.mat.nS >= 3 ? pcoa(D.beta.mats[D.beta.active]) : null;
      renderBeta();
      if (D.pcoa) setFig('figDivPcoa', figPcoa);
      D.nmds = null;
      Views.drop('figDivNmds'); $('figDivNmds').innerHTML = '';
      Views.drop('figDivShepard'); $('figDivShepard').innerHTML = '';
      $('divNmdsNote').innerHTML = `<p class="hint">${L2('Cambiaste el índice: vuelve a ejecutar el NMDS si lo quieres con la matriz nueva.', 'You changed the index: run the NMDS again if you want it on the new matrix.')}</p>`;
      renderMethods();
    });
    ['divExtrap', 'divRarefBand'].forEach(id => $(id).addEventListener('change', async () => {
      if (!D.mat) return;
      D.opts.extrap = $('divExtrap').checked; D.opts.band = $('divRarefBand').checked;
      prog(0.5, T('Rarefacción…', 'Rarefaction…'));
      await sleep(0);
      D.raref.rows.forEach(r => { r.pts = rarefyCurve(r.total ? D.mat.colTot : rowOf(D.mat, r.i), D.opts); });
      setFig('figDivRaref', figRaref);
      progEnd();
    }));
    $('divRarefScale').addEventListener('change', () => { if (D.raref) setFig('figDivRaref', figRaref); });
    $('divNmdsBtn').addEventListener('click', async () => {
      if (!D.beta) return;
      const starts = Math.min(30, Math.max(1, +$('divNmdsStarts').value || 5));
      if (D.mat.nS < 4) {
        $('divNmdsNote').innerHTML = `<div class="msg msg-warning">${L2('El NMDS necesita al menos 4 sitios.', 'The NMDS needs at least 4 sites.')}</div>`;
        return;
      }
      $('divNmdsBtn').disabled = true;
      prog(0.5, T('Ajustando el NMDS…', 'Fitting the NMDS…'));
      await sleep(0);
      try {
        const N = nmdsFit(D.beta.mats[D.beta.active], { starts, seed: D.opts.seed, iters: 400 });
        if (!N) throw new Error(T('no se pudo ajustar', 'could not be fitted'));
        D.nmds = N;
        setFig('figDivNmds', figNmds);
        setFig('figDivShepard', figShepard);
        const q = N.stress < 0.05 ? { es: 'excelente', en: 'excellent' } : N.stress < 0.1 ? { es: 'bueno', en: 'good' }
          : N.stress < 0.2 ? { es: 'aceptable', en: 'acceptable' } : { es: 'pobre: no interpretes las distancias con confianza', en: 'poor: do not trust the distances' };
        $('divNmdsNote').innerHTML = `<div class="msg msg-${N.stress < 0.2 ? 'success' : 'warning'}">${L2(
          `Estrés 1 de Kruskal = <b>${fmt(N.stress, 4)}</b> con ${N.starts} arranque(s): ajuste <b>${q.es}</b>. El mejor arranque fue ${N.start === 'pcoa' ? 'la PCoA' : 'uno aleatorio'}.`,
          `Kruskal's stress 1 = <b>${fmt(N.stress, 4)}</b> with ${N.starts} start(s): <b>${q.en}</b> fit. The best start was ${N.start === 'pcoa' ? 'the PCoA' : 'a random one'}.`)}</div>`;
        renderMethods();
      } catch (e) {
        console.error(e);
        $('divNmdsNote').innerHTML = `<div class="msg msg-error">${L2('No se pudo ajustar el NMDS: ', 'The NMDS could not be fitted: ') + esc(e.message)}</div>`;
      } finally { $('divNmdsBtn').disabled = false; progEnd(); }
    });
    $('divContribBtn').addEventListener('click', () => {
      if (!D.mat) return;
      const gA = [...$('divGroupA').selectedOptions].map(o => +o.value);
      const gB = [...$('divGroupB').selectedOptions].map(o => +o.value);
      if (!gA.length || !gB.length) {
        $('divContribTable').innerHTML = `<div class="msg msg-warning">${L2('Elige al menos un sitio en cada conjunto.', 'Pick at least one site in each set.')}</div>`;
        return;
      }
      if (gA.some(i => gB.includes(i))) {
        $('divContribTable').innerHTML = `<div class="msg msg-warning">${L2('Un sitio no puede estar en los dos conjuntos.', 'A site cannot be in both sets.')}</div>`;
        return;
      }
      D.contrib = contributions(D.mat, gA, gB);
      renderContrib();
    });
    $('divRadSite').addEventListener('change', () => { if (!D.mat) return; fitRad($('divRadSite').value); renderRad(); renderMethods(); });
    $('divTestBtn').addEventListener('click', () => { if (D.mat) renderTest(); });
    $('divPairBtn').addEventListener('click', async () => {
      if (!D.mat) return;
      $('divPairBtn').disabled = true;
      prog(0.5, T('Comparando todas las parejas…', 'Comparing every pair…'));
      await sleep(0);
      try { renderPairs(); } finally { $('divPairBtn').disabled = false; progEnd(); }
    });
    $('divCopyMethods').addEventListener('click', async () => {
      if (!D.methodsText) return;
      try {
        await navigator.clipboard.writeText(D.methodsText);
        showMessage('divMessages', 'success', L2('Párrafo copiado.', 'Paragraph copied.'));
      } catch (e) {
        /* the clipboard is not available from file://: offer the file instead */
        downloadBlob(D.methodsText, dlName('methods.txt'), 'text/plain;charset=utf-8');
      }
    });

    /* delegated: every CSV and every figure download */
    $('divGroup').addEventListener('click', e => {
      const csvBtn = e.target.closest('[data-csv]');
      if (csvBtn) {
        const f = CSV[csvBtn.dataset.csv];
        if (!f) return;
        let r = null;
        try { r = f(); } catch (err) { console.error(err); }
        if (!r) { showMessage('divMessages', 'warning', L2('Todavía no hay nada que exportar ahí.', 'There is nothing to export there yet.')); return; }
        downloadBlob(r.text, r.name, r.mime || 'text/csv;charset=utf-8');
        return;
      }
      const figBtn = e.target.closest('[data-fig]');
      if (figBtn) downloadFig(figBtn.dataset.fig, figBtn.dataset.kind);
    });
  }

  async function downloadFig(id, kind) {
    const builder = FIG[id];
    if (!builder) { showMessage('divMessages', 'warning', L2('Esa figura aún no está dibujada.', 'That figure is not drawn yet.')); return; }
    const svg = builder(), base = dlName(id.replace(/^figDiv/, '').toLowerCase());
    if (kind === 'svg') { downloadBlob(svg, base + '.svg', 'image/svg+xml;charset=utf-8'); return; }
    try {
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })), img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      const k = 3, cv = document.createElement('canvas');
      cv.width = img.width * k; cv.height = img.height * k;
      const g = cv.getContext('2d');
      g.scale(k, k); g.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      cv.toBlob(b => downloadBlob(b, base + '.png', 'image/png'), 'image/png');
    } catch (e) {
      console.error(e);
      showMessage('divMessages', 'error', L2('No se pudo convertir la figura a PNG; descarga el SVG.', 'The figure could not be converted to PNG; download the SVG.'));
    }
  }

  /* ---------- start ---------- */
  function init() {
    const host = $('divGroup');
    if (!host) return;
    /* the block does not depend on "Prepare data", so it lives outside that hidden container */
    const panel = $('panel-8');
    if (panel && host.parentElement && host.parentElement.id === 'mlSections') panel.appendChild(host);
    fillConfigSelects();
    wire();
    refreshStatus();
    /* the data may have changed since the page loaded: the ways of defining a site are rebuilt
       every time the user comes back to this step */
    document.addEventListener('stepchange', e => {
      if (e.detail && +e.detail.step === 8) { fillConfigSelects(); refreshStatus(); }
    });
    document.addEventListener('langchange', () => {
      fillConfigSelects();
      if (D.mat) {
        fillResultSelects();
        renderMethods();
        renderMatrix();
        renderHonesty();
        renderAlpha();
        renderBoot();
        renderCover();
        if (D.beta) renderBeta();
        renderRad();
        if (D.contrib) renderContrib();
        if (D.pairs) renderPairs();
      } else refreshStatus();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  /* hooks for the numerical checks */
  window.divTest = {
    alphaOf, hill, rarefyE, rarefyVar, coverageAt, extrapolate, betaMatrices, pcoa, nmdsFit,
    incidenceEstimators, radFit, prestonOctaves, hutcheson, permTestH, holm, bootstrapCI,
    buildMatrix, accumulation, coverageComparison, upgma, jacobiEigen, lnChoose, lgamma, D, run,
  };
})();
