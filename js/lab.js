/* BioModelling Pro — virtual-species lab (home page).
   A synthetic landscape with two environmental gradients and a species whose niche is known exactly.
   Presences are sampled from the true suitability (optionally with a sampling bias towards an accessible
   spot) and three real algorithms estimate the niche from them: a percentile envelope, the Mahalanobis
   distance and a quadratic logistic regression fitted by Newton iterations. The estimated map is compared
   with the truth using a rank AUC on independent, unbiased test data. Everything runs in plain JavaScript. */

(function () {
  const box = document.getElementById('labBox');
  if (!box) return;

  const W = 64, H = 48, N = W * H, PX = 7;                 // grid and canvas scale (448 x 336)
  const $ = id => document.getElementById(id);

  /* ---------- controls ---------- */
  const slider = (id, es, en, min, max, step, val) =>
    `<div class="slider-row"><label for="${id}">${L2(es, en)}</label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}"><span id="${id}V"></span></div>`;
  box.innerHTML = `
    <div class="pg-controls">
      <div class="seg" id="labAlgo" role="group" aria-label="Algorithm">
        <button data-a="bioclim" class="on">${L2('Envoltura', 'Envelope')}</button><button data-a="mahal">Mahalanobis</button><button data-a="glm">GLM</button>
      </div>
      <button class="btn btn-secondary btn-sm" id="labNew">${L2('Nuevo paisaje', 'New landscape')}</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:8px 28px;margin-bottom:14px">
      ${slider('labBreadth', 'Amplitud del nicho', 'Niche breadth', 0.35, 1.4, 0.05, 0.7)}
      ${slider('labN', 'Presencias muestreadas', 'Sampled presences', 15, 300, 5, 80)}
      ${slider('labBias', 'Sesgo de muestreo', 'Sampling bias', 0, 1, 0.05, 0)}
    </div>
    <div class="lab-grid">
      <div class="pg-pane"><div class="pg-title">${L2('1 · Verdad: idoneidad real y presencias', '1 · Truth: real suitability and presences')}</div><canvas id="labC1" width="${W * PX}" height="${H * PX}"></canvas></div>
      <div class="pg-pane"><div class="pg-title">${L2('2 · Estimación del algoritmo', '2 · Algorithm estimate')}</div><canvas id="labC2" width="${W * PX}" height="${H * PX}"></canvas></div>
      <div class="pg-pane"><div class="pg-title">${L2('3 · Espacio ambiental', '3 · Environmental space')}</div><canvas id="labC3" width="${W * PX}" height="${H * PX}"></canvas></div>
    </div>
    <div class="sim-readout" id="labReadout"></div>
    <div class="pg-status" id="labStatus"></div>`;

  /* ---------- seeded random numbers ---------- */
  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

  /* ---------- landscape ---------- */
  let land = null, seedCounter = 7;

  function smoothField(R, K) {
    const c = [];
    for (let k = 0; k < K; k++) c.push({ kx: (R() * 2 - 1) * 0.24, ky: (R() * 2 - 1) * 0.24, ph: R() * 6.283, a: 0.5 + R() });
    return (x, y) => c.reduce((s, q) => s + q.a * Math.sin(q.kx * x + q.ky * y + q.ph), 0);
  }
  const standardise = a => {
    const m = a.reduce((s, v) => s + v, 0) / a.length;
    const sd = Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length) || 1;
    return a.map(v => (v - m) / sd);
  };

  function buildLandscape(seed) {
    const R = rng(seed);
    const f1 = smoothField(R, 6), f2 = smoothField(R, 6);
    const r1 = [], r2 = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      r1.push(-1.5 * (y / H) + 0.55 * f1(x, y) + 0.25 * (x / W));
      r2.push(1.3 * (x / W) + 0.55 * f2(x, y) - 0.3 * (y / H));
    }
    const e1 = standardise(r1), e2 = standardise(r2);
    const niche = { m1: (R() * 2 - 1) * 0.5, m2: (R() * 2 - 1) * 0.5, rho: (R() < .5 ? -1 : 1) * (0.25 + R() * 0.3), r: R() * .4 + .8 };
    const keys = Float64Array.from({ length: N }, () => R());                       // fixed random keys → smooth changes with n and bias
    // independent, unbiased test data (presences drawn later from the true suitability, background uniform)
    const tk = Float64Array.from({ length: N }, () => R()), bgIdx = Array.from({ length: 600 }, () => Math.floor(R() * N));
    const cand = Array.from({ length: 24 }, () => ({ x: 4 + R() * (W - 8), y: 4 + R() * (H - 8) }));
    return { seed, e1, e2, niche, keys, tk, bgIdx, cand, hot: null };
  }

  function trueSuit(L, breadth) {
    const { m1, m2, rho, r } = L.niche, s1 = breadth * r, s2 = breadth / r;
    const s = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const a = (L.e1[i] - m1) / s1, b = (L.e2[i] - m2) / s2;
      s[i] = Math.exp(-0.5 * (a * a - 2 * rho * a * b + b * b) / (1 - rho * rho));
    }
    return { s, s1, s2 };
  }

  /* the accessible spot is the candidate cell whose true suitability is closest to 0.2, so the bias pulls the samples towards the edge of the niche */
  function pickHotspot(L, s) {
    let best = null, bs = Infinity;   // distance to the target suitability
    for (const c of L.cand) { const v = Math.abs(s[Math.round(c.y) * W + Math.round(c.x)] - 0.2); if (v < bs) { bs = v; best = c; } }
    return best;
  }

  /* pick n cells with probability proportional to weight (Efraimidis–Spirakis keys) */
  function topByWeight(keys, w, n) {
    const idx = []; for (let i = 0; i < N; i++) if (w[i] > 0) idx.push([Math.log(Math.max(keys[i], 1e-12)) / w[i], i]);
    idx.sort((a, b) => b[0] - a[0]);
    return idx.slice(0, n).map(v => v[1]);
  }

  /* ---------- algorithms (each returns suitability in [0, 1] for every cell) ---------- */
  function fitBioclim(L, pres) {
    const cols = [L.e1, L.e2], scores = new Float64Array(N).fill(1);
    cols.forEach(col => {
      const v = pres.map(i => col[i]).sort((a, b) => a - b), n = v.length;
      for (let i = 0; i < N; i++) {
        const x = col[i];
        if (x < v[0] || x > v[n - 1]) { scores[i] = 0; continue; }
        let lo = 0, hi = n; while (lo < hi) { const mid = (lo + hi) >> 1; if (v[mid] <= x) lo = mid + 1; else hi = mid; }
        const F = lo / n;                                   // empirical percentile of the presences
        scores[i] = Math.min(scores[i], 2 * Math.min(F, 1 - F + 1 / n));
      }
    });
    return scores;
  }

  function fitMahalanobis(L, pres) {
    const n = pres.length;
    let m1 = 0, m2 = 0; pres.forEach(i => { m1 += L.e1[i]; m2 += L.e2[i]; }); m1 /= n; m2 /= n;
    let a = 0, b = 0, c = 0;
    pres.forEach(i => { const u = L.e1[i] - m1, v = L.e2[i] - m2; a += u * u; b += u * v; c += v * v; });
    const d = Math.max(n - 1, 1); a /= d; b /= d; c /= d;
    const det = Math.max(a * c - b * b, 1e-9), out = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const u = L.e1[i] - m1, v = L.e2[i] - m2;
      out[i] = Math.exp(-0.5 * (c * u * u - 2 * b * u * v + a * v * v) / det);   // 1 − χ²(2) distribution function
    }
    return out;
  }

  function solve(A, b) {                                    // Gaussian elimination with partial pivoting
    const n = b.length, M = A.map((r, i) => [...r, b[i]]);
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      [M[c], M[p]] = [M[p], M[c]];
      const piv = M[c][c] || 1e-12;
      for (let r = c + 1; r < n; r++) { const f = M[r][c] / piv; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
    }
    const x = new Array(n).fill(0);
    for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / (M[r][r] || 1e-12); }
    return x;
  }

  function fitGLM(L, pres) {
    const feat = i => { const u = L.e1[i], v = L.e2[i]; return [1, u, v, u * u, v * v, u * v]; };
    const X = Array.from({ length: N }, (_, i) => feat(i)), y = new Uint8Array(N); pres.forEach(i => { y[i] = 1; });
    const p = 6, beta = new Array(p).fill(0), ridge = 1e-3;
    for (let it = 0; it < 30; it++) {
      const A = Array.from({ length: p }, () => new Array(p).fill(0)), g = new Array(p).fill(0);
      for (let i = 0; i < N; i++) {
        let eta = 0; for (let j = 0; j < p; j++) eta += X[i][j] * beta[j];
        const pr = 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, eta)))), w = pr * (1 - pr) + 1e-6, r = y[i] - pr;
        for (let j = 0; j < p; j++) { g[j] += X[i][j] * r; for (let k = 0; k < p; k++) A[j][k] += w * X[i][j] * X[i][k]; }
      }
      for (let j = 0; j < p; j++) { A[j][j] += ridge; g[j] -= ridge * beta[j]; }
      const d = solve(A, g); let step = 0;
      for (let j = 0; j < p; j++) { beta[j] += d[j]; step = Math.max(step, Math.abs(d[j])); }
      if (step < 1e-6) break;
    }
    const out = new Float64Array(N); let mx = 0;
    for (let i = 0; i < N; i++) { let eta = 0; for (let j = 0; j < p; j++) eta += X[i][j] * beta[j]; out[i] = 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, eta)))); mx = Math.max(mx, out[i]); }
    for (let i = 0; i < N; i++) out[i] /= (mx || 1);
    return out;
  }
  const FIT = { bioclim: fitBioclim, mahal: fitMahalanobis, glm: fitGLM };

  /* ---------- metrics ---------- */
  function ranks(a) {
    const idx = Array.from(a.keys()).sort((i, j) => a[i] - a[j]), r = new Float64Array(a.length);
    for (let k = 0; k < idx.length;) { let e = k; while (e + 1 < idx.length && a[idx[e + 1]] === a[idx[k]]) e++; const v = (k + e) / 2 + 1; for (let q = k; q <= e; q++) r[idx[q]] = v; k = e + 1; }
    return r;
  }
  function auc(pos, neg) {                                   // Mann–Whitney: P(score+ > score−) + ½ P(tie)
    const all = Float64Array.from([...pos, ...neg]), r = ranks(all);
    let sr = 0; for (let i = 0; i < pos.length; i++) sr += r[i];
    return (sr - pos.length * (pos.length + 1) / 2) / (pos.length * neg.length);
  }
  function pearson(a, b) {
    const n = a.length; let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n;
    let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { const u = a[i] - ma, v = b[i] - mb; sab += u * v; saa += u * u; sbb += v * v; }
    return sab / Math.sqrt(saa * sbb || 1);
  }

  /* ---------- drawing ---------- */
  const LUT = Array.from({ length: 256 }, (_, i) => { const h = mapkit.rampColor(mapkit.SEQ_RAMP, i / 255); return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; });
  const off = document.createElement('canvas'); off.width = W; off.height = H;

  function drawSurface(canvas, s) {
    const ctx = canvas.getContext('2d'), img = new ImageData(W, H);
    for (let i = 0; i < N; i++) { const c = LUT[Math.max(0, Math.min(255, Math.round(s[i] * 255)))]; img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255; }
    off.getContext('2d').putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(off, 0, 0, W * PX, H * PX);
    return ctx;
  }
  function dot(ctx, x, y, r, fill, stroke) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = stroke; ctx.stroke();
  }
  const label = (ctx, txt, x, y, align) => {
    ctx.font = '600 12px system-ui, sans-serif'; ctx.textAlign = align || 'left';
    ctx.lineWidth = 3; ctx.strokeStyle = cssVar('--card-bg', '#fff'); ctx.strokeText(txt, x, y);
    ctx.fillStyle = cssVar('--text', '#111'); ctx.fillText(txt, x, y);
  };

  function ellipse(ctx, cx, cy, s1, s2, L, k) {                // contour Q = k² of the true niche in environmental space
    const { m1, m2, rho } = L.niche, sq = Math.sqrt(1 - rho * rho);
    ctx.beginPath();
    for (let t = 0; t <= 64; t++) {
      const th = t / 64 * 6.2832, u = Math.cos(th), v = Math.sin(th);
      // standardised point k·(u, ρu + √(1−ρ²)v) satisfies a² − 2ρab + b² = k²(1−ρ²)
      const a = k * u * s1, b = k * s2 * (rho * u + sq * v);
      const X = cx(m1 + a), Y = cy(m2 + b);
      if (t === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
    }
    ctx.closePath();
  }

  /* ---------- state and refresh ---------- */
  const st = { algo: 'bioclim' };
  const fmt2 = v => v.toFixed(2);

  function refresh() {
    if (!land) land = buildLandscape(seedCounter);
    const breadth = +$('labBreadth').value, n = +$('labN').value, beta = +$('labBias').value;
    $('labBreadthV').textContent = breadth.toFixed(2); $('labNV').textContent = n; $('labBiasV').textContent = beta.toFixed(2);

    const { s, s1, s2 } = trueSuit(land, breadth);
    land.hot = pickHotspot(land, s);
    // sampling weights: true suitability × accessibility
    const w = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const x = i % W, y = (i / W) | 0, d = Math.hypot(x - land.hot.x, y - land.hot.y), acc = Math.exp(-d / (0.12 * W));
      w[i] = s[i] * (1 - beta + beta * acc) + 1e-9;
    }
    const pres = topByWeight(land.keys, w, n);
    const est = FIT[st.algo](land, pres);

    // independent unbiased test: presences from the true suitability, background uniform
    const testPos = topByWeight(land.tk, Float64Array.from(s, v => v + 1e-9), 400);
    const A = auc(testPos.map(i => est[i]), land.bgIdx.map(i => est[i]));
    const ceil = auc(testPos.map(i => s[i]), land.bgIdx.map(i => s[i]));
    const rho = pearson(ranks(s), ranks(est));

    /* pane 1: truth */
    const c1 = $('labC1'), x1 = drawSurface(c1, s);
    pres.forEach(i => dot(x1, ((i % W) + .5) * PX, (((i / W) | 0) + .5) * PX, 3.1, cssVar('--accent'), cssVar('--card-bg')));
    if (beta > 0) { const hx = land.hot.x * PX, hy = land.hot.y * PX; x1.strokeStyle = cssVar('--card-bg'); x1.lineWidth = 2.5; x1.beginPath(); x1.arc(hx, hy, 9, 0, 6.2832); x1.stroke();
      x1.strokeStyle = cssVar('--danger'); x1.lineWidth = 1.6; x1.beginPath(); x1.arc(hx, hy, 9, 0, 6.2832); x1.stroke(); label(x1, T('acceso', 'access'), hx, hy - 13, 'center'); }
    /* pane 2: estimate */
    const c2 = $('labC2'), x2 = drawSurface(c2, est);
    pres.forEach(i => dot(x2, ((i % W) + .5) * PX, (((i / W) | 0) + .5) * PX, 2.2, 'rgba(255,255,255,.0)', 'rgba(255,255,255,.55)'));
    /* pane 3: environmental space */
    const c3 = $('labC3'), x3 = c3.getContext('2d'), CW = c3.width, CH = c3.height, lim = 3.2, pad = 26;
    x3.clearRect(0, 0, CW, CH); x3.fillStyle = cssVar('--bg-soft'); x3.fillRect(0, 0, CW, CH);
    const cx = v => pad + (v + lim) / (2 * lim) * (CW - pad - 8), cy = v => CH - pad - (v + lim) / (2 * lim) * (CH - pad - 8);
    x3.strokeStyle = cssVar('--border-strong'); x3.lineWidth = 1; x3.beginPath(); x3.moveTo(pad, 8); x3.lineTo(pad, CH - pad); x3.lineTo(CW - 8, CH - pad); x3.stroke();
    for (let i = 0; i < N; i += 2) { const c = LUT[Math.max(0, Math.min(255, Math.round(est[i] * 255)))]; x3.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},.55)`; x3.fillRect(cx(land.e1[i]) - 1.4, cy(land.e2[i]) - 1.4, 2.8, 2.8); }
    x3.setLineDash([6, 4]); x3.lineWidth = 2; x3.strokeStyle = cssVar('--text');
    [1, 2].forEach(k => { ellipse(x3, cx, cy, s1, s2, land, k); x3.stroke(); });
    x3.setLineDash([]);
    pres.forEach(i => dot(x3, cx(land.e1[i]), cy(land.e2[i]), 2.6, cssVar('--accent'), cssVar('--card-bg')));
    label(x3, T('Temperatura →', 'Temperature →'), CW - 10, CH - 8, 'right');
    x3.save(); x3.translate(14, 14); x3.rotate(-Math.PI / 2); label(x3, T('Precipitación →', 'Precipitation →'), 0, 0, 'right'); x3.restore();
    label(x3, T('línea punteada: nicho real (1σ y 2σ)', 'dashed: true niche (1σ and 2σ)'), pad + 8, 20, 'left');

    $('labReadout').innerHTML = [
      [L2('AUC de prueba', 'Test AUC'), fmt2(A), L2('presencias vs. fondo, sin sesgo', 'presences vs. background, unbiased')],
      [L2('Techo (mapa real)', 'Ceiling (true map)'), fmt2(ceil), L2('lo máximo alcanzable', 'the most one can reach')],
      [L2('Correlación de rangos', 'Rank correlation'), fmt2(rho), L2('estimado vs. real', 'estimate vs. truth')],
      [L2('Presencias', 'Presences'), String(n), L2('celdas muestreadas', 'sampled cells')],
    ].map(([l, v, t]) => `<div class="rd"><div class="rd-l">${l}</div><div class="rd-v">${v}</div><div class="rd-t">${t}</div></div>`).join('');

    const gap = ceil - A, msgs = [];
    msgs.push(gap < 0.03 ? L2('El mapa estimado reproduce casi por completo el nicho real.', 'The estimated map reproduces the true niche almost completely.')
      : gap < 0.08 ? L2('El mapa estimado es razonable, aunque se aleja algo del nicho real.', 'The estimated map is reasonable, though it drifts somewhat from the true niche.')
      : L2('El mapa estimado se aleja notablemente del nicho real.', 'The estimated map departs markedly from the true niche.'));
    if (beta >= 0.5) msgs.push(L2('El <b>sesgo de muestreo</b> concentra las presencias cerca del punto de acceso: en el espacio ambiental dejan de cubrir todo el nicho, y el modelo aprende un nicho recortado.',
      'The <b>sampling bias</b> concentrates presences near the access point: in environmental space they no longer cover the whole niche, so the model learns a truncated niche.'));
    else if (n < 40) msgs.push(L2('Con <b>pocas presencias</b> la estimación es inestable: prueba «Nuevo paisaje» y verás que el AUC cambia mucho.',
      'With <b>few presences</b> the estimate is unstable: try «New landscape» and the AUC will change a lot.'));
    else if (st.algo === 'bioclim') msgs.push(L2('La envoltura solo mira los percentiles de cada variable por separado: ignora la correlación entre ellas.', 'The envelope only looks at the percentiles of each variable separately: it ignores the correlation between them.'));
    else if (st.algo === 'glm') msgs.push(L2('El GLM cuadrático es una elipse suavizada: acierta cuando el nicho real es unimodal, como aquí.', 'The quadratic GLM is a smoothed ellipse: it does well when the true niche is unimodal, as here.'));
    else msgs.push(L2('Mahalanobis modela el nicho como una elipse: aprovecha la correlación entre variables, pero es sensible a presencias atípicas.', 'Mahalanobis models the niche as an ellipse: it uses the correlation between variables but is sensitive to outlying presences.'));
    $('labStatus').innerHTML = msgs.join(' ');
  }

  let pending = 0;
  const schedule = () => { cancelAnimationFrame(pending); pending = requestAnimationFrame(refresh); };
  ['labBreadth', 'labN', 'labBias'].forEach(id => $(id).addEventListener('input', schedule));
  $('labNew').addEventListener('click', () => { seedCounter = seedCounter * 31 + 11; land = null; schedule(); });
  document.querySelectorAll('#labAlgo button').forEach(b => b.addEventListener('click', () => {
    st.algo = b.dataset.a; document.querySelectorAll('#labAlgo button').forEach(x => x.classList.toggle('on', x === b)); schedule();
  }));
  document.addEventListener('langchange', schedule);
  document.addEventListener('themechange', () => setTimeout(schedule, 30));
  refresh();
  window.labRefresh = refresh;
})();
