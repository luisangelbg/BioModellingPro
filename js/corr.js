/* Step 6: correlation and variable selection. Pure JavaScript (no Python engine is needed, so the step opens at once).
   - Pearson or Spearman correlation matrix of the environmental variables extracted in step 5, ordered by average-linkage
     clustering of 1 − |r| and drawn as an SVG heat map with its dendrogram (click a cell to look at the pair).
   - Variance inflation factors (from the Pearson matrix) of the variables the user has ticked, updated live.
   - A recommended selection (drop the variable most correlated with the rest of each pair with |r| above the threshold,
     then the highest VIF above its threshold), which never drops the variables the user pinned.
   The selection becomes state.sel and state.stats.recommendedVars: the default of the statistics, ML and SDM steps. */

(function () {
  const $ = id => document.getElementById(id);
  const C = { init: false, keys: [], cols: {}, n: 0, P: null, R: null, method: 'pearson', sel: new Set(), pinned: new Set(), order: [], tree: null, removed: {}, sig: '', pair: null };

  /* ---------- statistics ---------- */
  function ranks(a) {
    const idx = Array.from(a.keys()).sort((i, j) => a[i] - a[j]), r = new Float64Array(a.length);
    for (let k = 0; k < idx.length;) { let e = k; while (e + 1 < idx.length && a[idx[e + 1]] === a[idx[k]]) e++; const v = (k + e) / 2 + 1; for (let q = k; q <= e; q++) r[idx[q]] = v; k = e + 1; }
    return r;
  }
  function zscores(cols) {
    return cols.map(c => {
      const n = c.length; let m = 0; for (let i = 0; i < n; i++) m += c[i]; m /= n;
      let s = 0; for (let i = 0; i < n; i++) s += (c[i] - m) ** 2; s = Math.sqrt(s / (n - 1)) || 0;
      return Float64Array.from(c, v => s ? (v - m) / s : 0);
    });
  }
  function corrMatrix(cols) {
    const z = zscores(cols), p = z.length, n = cols[0].length, R = Array.from({ length: p }, () => new Float64Array(p));
    for (let i = 0; i < p; i++) for (let j = i; j < p; j++) { let s = 0; for (let k = 0; k < n; k++) s += z[i][k] * z[j][k]; R[i][j] = R[j][i] = i === j ? 1 : Math.max(-1, Math.min(1, s / (n - 1))); }
    return R;
  }
  function invert(M) {                                     // Gauss–Jordan with partial pivoting; a tiny ridge is added when singular
    const n = M.length;
    for (let ridge = 0; ridge < 3; ridge++) {
      const A = M.map((r, i) => [...Array.from(r), ...Array.from({ length: n }, (_, j) => i === j ? 1 : 0)]);
      if (ridge) for (let i = 0; i < n; i++) A[i][i] += 1e-8 * Math.pow(100, ridge);
      let ok = true;
      for (let c = 0; c < n && ok; c++) {
        let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
        if (Math.abs(A[p][c]) < 1e-12) { ok = false; break; }
        [A[c], A[p]] = [A[p], A[c]];
        const d = A[c][c]; for (let k = 0; k < 2 * n; k++) A[c][k] /= d;
        for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c]; if (f) for (let k = 0; k < 2 * n; k++) A[r][k] -= f * A[c][k]; }
      }
      if (ok) return A.map(r => r.slice(n));
    }
    return M.map((r, i) => Array.from(r, (_, j) => i === j ? 1 : 0));
  }
  function vifOf(idxs) {                                   // VIF_j = j-th diagonal element of the inverse Pearson correlation matrix of the set
    if (idxs.length < 2) return idxs.map(() => 1);
    const inv = invert(idxs.map(i => idxs.map(j => C.P[i][j])));
    return idxs.map((_, k) => Math.max(1, inv[k][k]));
  }
  function linkage(R) {                                    // UPGMA on d = 1 − |r|; returns the merges and the leaf order
    const p = R.length; let cl = Array.from({ length: p }, (_, i) => ({ m: [i], id: i, h: 0 })), next = p;
    const D = (a, b) => { let s = 0; for (const i of a.m) for (const j of b.m) s += 1 - Math.abs(R[i][j]); return s / (a.m.length * b.m.length); };
    while (cl.length > 1) {
      let bi = 0, bj = 1, bd = Infinity;
      for (let i = 0; i < cl.length; i++) for (let j = i + 1; j < cl.length; j++) { const d = D(cl[i], cl[j]); if (d < bd) { bd = d; bi = i; bj = j; } }
      const node = { m: cl[bi].m.concat(cl[bj].m), id: next++, h: bd, a: cl[bi], b: cl[bj] };
      cl = cl.filter((_, k) => k !== bi && k !== bj); cl.push(node);
    }
    const order = []; (function walk(n) { if (n.a) { walk(n.a); walk(n.b); } else order.push(n.id); })(cl[0]);
    return { root: cl[0], order };
  }

  /* ---------- recommended selection ---------- */
  function recommend(rThr, vifThr, pinned) {
    const p = C.keys.length, rem = new Set(C.keys.map((_, i) => i)), removed = {}, ignored = new Set();
    const pin = i => pinned.has(C.keys[i]);
    for (;;) {                                             // 1) pairs above the |r| threshold
      const idx = [...rem]; let mx = 0, a = -1, b = -1;
      for (let x = 0; x < idx.length; x++) for (let y = x + 1; y < idx.length; y++) {
        if (ignored.has(idx[x] + '|' + idx[y])) continue;
        const v = Math.abs(C.R[idx[x]][idx[y]]); if (v > mx) { mx = v; a = idx[x]; b = idx[y]; }
      }
      if (mx < rThr || a < 0) break;
      if (pin(a) && pin(b)) { ignored.add(a + '|' + b); continue; }
      const cand = [a, b].filter(i => !pin(i)), meanAbs = i => idx.reduce((s, j) => s + (j === i ? 0 : Math.abs(C.R[i][j])), 0) / idx.length;
      const drop = cand.length === 1 ? cand[0] : (meanAbs(a) >= meanAbs(b) ? a : b), other = drop === a ? b : a;
      removed[C.keys[drop]] = { kind: 'r', value: mx, other: C.keys[other] }; rem.delete(drop);
    }
    while (rem.size > 2) {                                 // 2) variables above the VIF threshold
      const idx = [...rem], v = vifOf(idx), order = idx.map((i, k) => [i, v[k]]).sort((x, y) => y[1] - x[1]);
      const worst = order.find(([i]) => !pin(i));
      if (!worst || worst[1] <= vifThr) break;
      removed[C.keys[worst[0]]] = { kind: 'vif', value: worst[1] }; rem.delete(worst[0]);
    }
    return { sel: new Set([...rem].map(i => C.keys[i])), removed };
  }

  /* ---------- data ---------- */
  function build() {
    const t = (state.env && state.env.table) || [];
    const keys = [...BIO_ONLY, 'elev'].filter(k => t.some(r => r[k] != null));
    if (!keys.length) { C.keys = []; return false; }
    const rows = t.filter(r => keys.every(k => r[k] != null)), sig = keys.join(',') + '|' + rows.length + '|' + C.method;
    if (rows.length < 3) { C.keys = keys; C.n = rows.length; C.P = null; return false; }
    C.n = rows.length; C.keys = keys;
    const cols = keys.map(k => Float64Array.from(rows, r => +r[k]));
    C.cols = Object.fromEntries(keys.map((k, i) => [k, cols[i]]));
    C.P = corrMatrix(cols);
    C.R = C.method === 'spearman' ? corrMatrix(cols.map(ranks)) : C.P;
    const tree = linkage(C.R); C.tree = tree; C.order = tree.order;
    const newKeys = keys.join(',') !== (C.sigKeys || '');
    C.sigKeys = keys.join(','); C.sig = sig;
    if (newKeys || !C.init) { C.pinned = new Set([...C.pinned].filter(k => keys.includes(k))); autoSelect(); C.init = true; }
    return true;
  }
  function autoSelect() {
    const rThr = +$('corrR').value || 0.8, vThr = +$('corrVif').value || 10;
    const r = recommend(rThr, vThr, C.pinned); C.sel = r.sel; C.removed = r.removed;
    C.pinned.forEach(k => C.sel.add(k));
  }
  function commit() {
    const vars = C.keys.filter(k => C.sel.has(k)), prev = state.sel && state.sel.vars ? state.sel.vars.join(',') : null;
    window.state.sel = { vars, pinned: [...C.pinned], method: C.method, rThr: +$('corrR').value || 0.8, vifThr: +$('corrVif').value || 10 };
    state.stats = state.stats || {}; state.stats.recommendedVars = vars;
    if (prev !== vars.join(',')) document.dispatchEvent(new CustomEvent('selchange', { detail: vars }));   // only when the selection really changed
  }

  /* ---------- helpers to draw ---------- */
  const toRGB = s => { s = String(s).trim(); let m;
    if ((m = s.match(/^#([0-9a-f]{6})$/i))) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
    if ((m = s.match(/^#([0-9a-f]{3})$/i))) return [0, 1, 2].map(i => parseInt(m[1][i] + m[1][i], 16));
    if ((m = s.match(/rgba?\(([^)]+)\)/))) return m[1].split(',').slice(0, 3).map(Number);
    return [128, 128, 128]; };
  const mix = (a, b, t) => { const A = toRGB(a), B = toRGB(b); return 'rgb(' + A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',') + ')'; };
  const lum = rgb => { const [r, g, b] = rgb.match(/\d+/g).map(Number); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
  const code = k => varCode(k);
  const num = (v, d = 2) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(d);
  const pal = () => ({ bg: cssVar('--card-bg', '#fff'), text: cssVar('--text', '#111'), muted: cssVar('--text-muted', '#667'), border: cssVar('--border-strong', '#ccc'),
    neg: cssVar('--sky', '#2a78b5'), pos: cssVar('--accent', '#cf6a24'), danger: cssVar('--danger', '#c43a2f'), primary: cssVar('--primary', '#1f7a4d') });

  /* ---------- summary, verdict ---------- */
  function stats() {
    const S = C.keys.map((k, i) => i).filter(i => C.sel.has(C.keys[i])), v = vifOf(S);
    let maxR = 0, pa = -1, pb = -1; const bad = [];
    for (let x = 0; x < S.length; x++) for (let y = x + 1; y < S.length; y++) { const r = Math.abs(C.R[S[x]][S[y]]); if (r > maxR) { maxR = r; pa = S[x]; pb = S[y]; } if (r >= (+$('corrR').value || .8)) bad.push([S[x], S[y], r]); }
    return { S, vif: Object.fromEntries(S.map((i, k) => [C.keys[i], v[k]])), maxVif: v.length ? Math.max(...v) : 0, maxR, pa, pb, bad };
  }
  function renderTiles(st) {
    const f = v => v > 999 ? '>999' : v.toFixed(1);
    statTiles('corrTiles', [
      [{ es: 'Variables disponibles', en: 'Variables available' }, C.keys.length],
      [{ es: 'Seleccionadas', en: 'Selected' }, st.S.length],
      [{ es: 'Fijadas 📌', en: 'Pinned 📌' }, [...C.pinned].filter(k => C.sel.has(k)).length],
      [{ es: '|r| máximo entre ellas', en: 'Max |r| among them' }, st.S.length > 1 ? st.maxR.toFixed(2) : '—'],
      [{ es: 'VIF máximo', en: 'Max VIF' }, st.S.length > 1 ? f(st.maxVif) : '—'],
      [{ es: 'Registros completos', en: 'Complete records' }, C.n.toLocaleString('en-US')],
    ]);
  }
  function renderVerdict(st) {
    const rThr = +$('corrR').value || 0.8, vThr = +$('corrVif').value || 10, box = $('corrVerdict');
    let type, html;
    if (st.S.length < 2) { type = 'error'; html = L2('Selecciona al menos 2 variables para continuar.', 'Select at least 2 variables to continue.'); }
    else if (!st.bad.length && st.maxVif <= vThr) {
      type = st.maxVif <= 5 ? 'success' : 'info';
      html = L2(`Tu selección tiene <b>${st.S.length} variables</b> con |r| máximo ${st.maxR.toFixed(2)} y VIF máximo ${st.maxVif.toFixed(1)}: colinealidad ${st.maxVif <= 5 ? 'baja, adecuada para cualquier algoritmo' : 'moderada, aceptable para todos los algoritmos (con GLM y GAM vigila las variables de VIF más alto)'}.`,
        `Your selection has <b>${st.S.length} variables</b> with max |r| ${st.maxR.toFixed(2)} and max VIF ${st.maxVif.toFixed(1)}: ${st.maxVif <= 5 ? 'low collinearity, suitable for any algorithm' : 'moderate collinearity, acceptable for all algorithms (with GLM and GAM watch the variables with the highest VIF)'}.`);
    } else {
      type = 'warning';
      const pairs = st.bad.sort((a, b) => b[2] - a[2]).slice(0, 4).map(([i, j, r]) => `${code(C.keys[i])}–${code(C.keys[j])} (${r.toFixed(2)})`).join(', ');
      html = L2(`Tu selección conserva <b>${st.bad.length}</b> par(es) con |r| ≥ ${rThr}${pairs ? ' (' + pairs + ')' : ''} y un VIF máximo de ${st.maxVif > 999 ? '>999' : st.maxVif.toFixed(1)}. Es aceptable para bosques aleatorios, árboles potenciados, SVM y MaxEnt (interpreta con cautela la importancia y las curvas de respuesta); para GLM y GAM conviene quitar una de cada par.`,
        `Your selection keeps <b>${st.bad.length}</b> pair(s) with |r| ≥ ${rThr}${pairs ? ' (' + pairs + ')' : ''} and a max VIF of ${st.maxVif > 999 ? '>999' : st.maxVif.toFixed(1)}. That is acceptable for random forest, boosted trees, SVM and MaxEnt (interpret importance and response curves with care); for GLM and GAM it is better to drop one of each pair.`);
    }
    box.innerHTML = `<div class="msg msg-${type}" style="margin:10px 0">${html}</div>`;
  }

  /* ---------- variable table ---------- */
  function renderTable() {
    const box = $('corrVarTable');
    box.innerHTML = `<table class="corr-table"><thead><tr><th>${L2('Usar', 'Use')}</th><th>${L2('📌 Fijar', '📌 Pin')}</th><th>${L2('Código', 'Code')}</th><th>${L2('Variable', 'Variable')}</th>
      <th>VIF</th><th>${L2('|r| máx. (con)', 'Max |r| (with)')}</th><th>${L2('Estado', 'Status')}</th></tr></thead><tbody>` +
      C.keys.map(k => `<tr data-k="${k}"><td><input type="checkbox" class="cv-use" data-k="${k}"></td><td><input type="checkbox" class="cv-pin" data-k="${k}"></td>
        <td><b>${esc(code(k))}</b></td><td>${varNameL2(k)} <span class="hint" style="margin:0">(${esc(BIOCLIM_META[k][2])})</span></td><td class="cv-vif"></td><td class="cv-max"></td><td class="cv-st"></td></tr>`).join('') + '</tbody></table>';
    box.querySelectorAll('.cv-use').forEach(i => i.onchange = () => { i.checked ? C.sel.add(i.dataset.k) : (C.sel.delete(i.dataset.k), C.pinned.delete(i.dataset.k)); refresh(); });
    box.querySelectorAll('.cv-pin').forEach(i => i.onchange = () => { if (i.checked) { C.pinned.add(i.dataset.k); C.sel.add(i.dataset.k); } else C.pinned.delete(i.dataset.k); refresh(); });
  }
  function updateTable(st) {
    const box = $('corrVarTable');
    C.keys.forEach((k, i) => {
      const tr = box.querySelector(`tr[data-k="${k}"]`); if (!tr) return;
      const on = C.sel.has(k), pin = C.pinned.has(k);
      tr.querySelector('.cv-use').checked = on; tr.querySelector('.cv-pin').checked = pin;
      tr.classList.toggle('off', !on);
      const v = st.vif[k], vc = tr.querySelector('.cv-vif');
      vc.textContent = on && st.S.length > 1 ? (v > 999 ? '>999' : v.toFixed(1)) : '—';
      vc.className = 'cv-vif ' + (on && st.S.length > 1 ? (v > 10 ? 'hi' : v > 5 ? 'mid' : 'lo') : '');
      let mx = 0, who = -1; C.keys.forEach((_, j) => { if (j !== i && C.sel.has(C.keys[j])) { const r = Math.abs(C.R[i][j]); if (r > mx) { mx = r; who = j; } } });
      tr.querySelector('.cv-max').innerHTML = who >= 0 ? `<span class="${mx >= (+$('corrR').value || .8) ? 'hi' : ''}">${mx.toFixed(2)}</span> <span class="hint" style="margin:0">(${esc(code(C.keys[who]))})</span>` : '—';
      const rm = C.removed[k];
      tr.querySelector('.cv-st').innerHTML = on ? (pin ? L2('📌 fijada', '📌 pinned') : L2('en uso', 'in use'))
        : rm ? (rm.kind === 'r' ? L2(`quitada: |r| = ${rm.value.toFixed(2)} con ${esc(code(rm.other))}`, `dropped: |r| = ${rm.value.toFixed(2)} with ${esc(code(rm.other))}`) : L2(`quitada: VIF = ${rm.value > 999 ? '>999' : rm.value.toFixed(1)}`, `dropped: VIF = ${rm.value > 999 ? '>999' : rm.value.toFixed(1)}`))
        : L2('fuera de la selección', 'not selected');
    });
  }

  /* ---------- heat map (SVG with resolved colours, so that it can be exported as it is) ---------- */
  function heatSVG() {
    const p = pal(), n = C.keys.length, cs = n > 22 ? 18 : 27, order = C.order, dW = 84, lW = 58, top = 12, bot = 58, right = 10;
    const W = dW + lW + n * cs + right, H = top + n * cs + bot, x0 = dW + lW, pos = {}, sel = C.sel, bad = +$('corrR').value || .8;
    order.forEach((v, r) => { pos[v] = r; });
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="system-ui, Segoe UI, sans-serif"><rect width="${W}" height="${H}" fill="${p.bg}"/>`;
    // dendrogram
    const hmax = C.tree.root.h || 1, xy = {};
    (function walk(nd) { if (!nd.a) { xy[nd.id] = [dW, top + pos[nd.id] * cs + cs / 2, 0]; return; } walk(nd.a); walk(nd.b);
      xy[nd.id] = [dW - nd.h / hmax * (dW - 6), (xy[nd.a.id][1] + xy[nd.b.id][1]) / 2, nd.h];
      const A = xy[nd.a.id], B = xy[nd.b.id], X = xy[nd.id];
      s += `<path d="M${A[0]},${A[1]} H${X[0]} V${B[1]} H${B[0]}" fill="none" stroke="${p.muted}" stroke-width="1.1"/>`; })(C.tree.root);
    // cells
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const i = order[r], j = order[c], v = C.R[i][j], x = x0 + c * cs, y = top + r * cs;
      const fill = i === j ? mix(p.bg, p.muted, .18) : mix(p.bg, v < 0 ? p.neg : p.pos, Math.pow(Math.abs(v), .85) * .95);
      const isBad = i !== j && sel.has(C.keys[i]) && sel.has(C.keys[j]) && Math.abs(v) >= bad;
      s += `<rect class="hc" data-i="${i}" data-j="${j}" x="${x}" y="${y}" width="${cs}" height="${cs}" fill="${fill}" stroke="${isBad ? p.danger : p.bg}" stroke-width="${isBad ? 1.8 : 0.8}" style="cursor:${i === j ? 'default' : 'pointer'}"><title>${esc(code(C.keys[i]))} × ${esc(code(C.keys[j]))}: r = ${num(v)}</title></rect>`;
      if (n <= 22) s += `<text x="${x + cs / 2}" y="${y + cs / 2 + 3.2}" text-anchor="middle" font-size="${cs > 20 ? 9 : 7}" fill="${lum(fill) > .58 ? '#1b1b1b' : '#fff'}" pointer-events="none">${i === j ? '' : num(v).replace('0.', '.').replace('1.00', '1')}</text>`;
    }
    // labels: rows on the left, columns at the bottom (bold = selected, ● = pinned)
    order.forEach((v, r) => {
      const k = C.keys[v], on = sel.has(k), t = code(k) + (C.pinned.has(k) ? ' 📌' : '');
      s += `<text x="${x0 - 5}" y="${top + r * cs + cs / 2 + 3.5}" text-anchor="end" font-size="11" font-weight="${on ? 700 : 400}" fill="${on ? p.text : p.muted}" opacity="${on ? 1 : .75}">${esc(t)}</text>`;
      s += `<text transform="translate(${x0 + r * cs + cs / 2 + 3.5},${top + n * cs + 7}) rotate(-90)" text-anchor="end" font-size="11" font-weight="${on ? 700 : 400}" fill="${on ? p.text : p.muted}" opacity="${on ? 1 : .75}">${esc(t)}</text>`;
    });
    return s + '</svg>';
  }
  function renderHeat() {
    const box = $('corrHeat'); box.innerHTML = heatSVG();
    const svg = box.querySelector('svg'); svg.style.width = '100%'; svg.style.maxWidth = svg.getAttribute('width') + 'px'; svg.style.height = 'auto';
    svg.querySelectorAll('.hc').forEach(rc => rc.addEventListener('click', () => { const i = +rc.dataset.i, j = +rc.dataset.j; if (i !== j) showPair(i, j); }));
  }

  /* ---------- a pair: scatter plot and decisions ---------- */
  function showPair(i, j) {
    C.pair = [i, j]; const box = $('corrPair'), p = pal(), a = C.keys[i], b = C.keys[j], xa = C.cols[a], xb = C.cols[b], n = xa.length;
    const rp = C.P[i][j], rs = corrMatrix([ranks(xa), ranks(xb)])[0][1];
    const W = 340, H = 240, m = { l: 44, r: 10, t: 10, b: 34 };
    const mn = c => c.reduce((s, v) => Math.min(s, v), Infinity), mxf = c => c.reduce((s, v) => Math.max(s, v), -Infinity);
    const ax = [mn(xa), mxf(xa)], ay = [mn(xb), mxf(xb)], sx = v => m.l + (v - ax[0]) / ((ax[1] - ax[0]) || 1) * (W - m.l - m.r), sy = v => H - m.b - (v - ay[0]) / ((ay[1] - ay[0]) || 1) * (H - m.t - m.b);
    const step = Math.max(1, Math.floor(n / 900));
    let dots = ''; for (let k = 0; k < n; k += step) dots += `<circle cx="${sx(xa[k]).toFixed(1)}" cy="${sy(xb[k]).toFixed(1)}" r="2.3" fill="${p.primary}" fill-opacity=".35"/>`;
    const mxm = xa.reduce((s, v) => s + v, 0) / n, mym = xb.reduce((s, v) => s + v, 0) / n; let sxy = 0, sxx = 0; for (let k = 0; k < n; k++) { sxy += (xa[k] - mxm) * (xb[k] - mym); sxx += (xa[k] - mxm) ** 2; }
    const sl = sxx ? sxy / sxx : 0, ic = mym - sl * mxm;
    const svg = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;height:auto" font-family="system-ui,sans-serif"><rect width="${W}" height="${H}" fill="${p.bg}" rx="8"/>
      <path d="M${m.l},${m.t} V${H - m.b} H${W - m.r}" fill="none" stroke="${p.border}"/>${dots}
      <line x1="${sx(ax[0])}" y1="${sy(sl * ax[0] + ic)}" x2="${sx(ax[1])}" y2="${sy(sl * ax[1] + ic)}" stroke="${p.pos}" stroke-width="2"/>
      <text x="${(m.l + W - m.r) / 2}" y="${H - 8}" text-anchor="middle" font-size="11" fill="${p.text}">${esc(code(a))}</text>
      <text transform="translate(12,${(m.t + H - m.b) / 2}) rotate(-90)" text-anchor="middle" font-size="11" fill="${p.text}">${esc(code(b))}</text></svg>`;
    box.innerHTML = `<div class="pair-box"><div>${svg}</div><div>
      <h3 style="margin:0 0 6px">${esc(code(a))} <span class="hint" style="margin:0">${varNameL2(a)}</span><br>${esc(code(b))} <span class="hint" style="margin:0">${varNameL2(b)}</span></h3>
      <p style="margin:6px 0">Pearson r = <b>${num(rp)}</b> &nbsp;·&nbsp; Spearman ρ = <b>${num(rs)}</b> &nbsp;·&nbsp; n = ${n.toLocaleString('en-US')}</p>
      <p class="hint">${Math.abs(rp) >= (+$('corrR').value || .8) ? L2('Están fuertemente correlacionadas: aportan casi la misma información.', 'They are strongly correlated: they carry almost the same information.')
        : L2('La correlación es moderada o baja: pueden usarse juntas.', 'The correlation is moderate or low: they can be used together.')}</p>
      <div class="btn-row"><button class="btn btn-secondary btn-sm" data-act="keepA">${L2('Quedarme con', 'Keep')} ${esc(code(a))}</button>
        <button class="btn btn-secondary btn-sm" data-act="keepB">${L2('Quedarme con', 'Keep')} ${esc(code(b))}</button>
        <button class="btn btn-secondary btn-sm" data-act="both">${L2('Usar ambas (fijarlas)', 'Use both (pin them)')}</button></div></div></div>`;
    box.querySelectorAll('[data-act]').forEach(bt => bt.onclick = () => applyPair(bt.dataset.act, a, b));
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function applyPair(act, a, b) {
    if (act === 'both') { [a, b].forEach(k => { C.sel.add(k); C.pinned.add(k); }); }
    else { const keep = act === 'keepA' ? a : b, drop = keep === a ? b : a; C.sel.add(keep); C.pinned.add(keep); C.sel.delete(drop); C.pinned.delete(drop); }
    refresh();
  }

  /* ---------- highly correlated pairs ---------- */
  function renderPairs() {
    const thr = +$('corrR').value || .8, out = [];
    for (let i = 0; i < C.keys.length; i++) for (let j = i + 1; j < C.keys.length; j++) { const r = C.R[i][j]; if (Math.abs(r) >= thr) out.push([i, j, r]); }
    out.sort((x, y) => Math.abs(y[2]) - Math.abs(x[2]));
    const box = $('corrPairs');
    if (!out.length) { box.innerHTML = `<p class="hint" style="padding:10px">${L2(`Ningún par supera |r| = ${thr}.`, `No pair exceeds |r| = ${thr}.`)}</p>`; return; }
    box.innerHTML = `<table><thead><tr><th>${L2('Variable A', 'Variable A')}</th><th>${L2('Variable B', 'Variable B')}</th><th>r</th><th>${L2('En tu selección', 'In your selection')}</th><th>${L2('Decidir', 'Decide')}</th></tr></thead><tbody>` +
      out.slice(0, 80).map(([i, j, r]) => { const a = C.keys[i], b = C.keys[j], both = C.sel.has(a) && C.sel.has(b);
        return `<tr><td class="${C.sel.has(a) ? 'b' : ''}"><b>${esc(code(a))}</b> ${varNameL2(a)}</td><td class="${C.sel.has(b) ? 'b' : ''}"><b>${esc(code(b))}</b> ${varNameL2(b)}</td><td>${num(r)}</td>
          <td>${both ? '⚠ ' + L2('ambas', 'both') : C.sel.has(a) || C.sel.has(b) ? '✓ ' + L2('una', 'one') : '—'}</td>
          <td><button class="btn btn-ghost btn-sm" data-act="keepA" data-a="${a}" data-b="${b}">${L2('Quedarme con', 'Keep')} ${esc(code(a))}</button> <button class="btn btn-ghost btn-sm" data-act="keepB" data-a="${a}" data-b="${b}">${L2('Quedarme con', 'Keep')} ${esc(code(b))}</button></td></tr>`; }).join('') +
      `</tbody></table>` + (out.length > 80 ? `<p class="hint" style="padding:6px 12px">${L2(`Se muestran 80 de ${out.length} pares.`, `Showing 80 of ${out.length} pairs.`)}</p>` : '');
    box.querySelectorAll('[data-act]').forEach(bt => bt.onclick = () => applyPair(bt.dataset.act, bt.dataset.a, bt.dataset.b));
  }

  /* ---------- whole step ---------- */
  function refresh() {
    if (!C.P) return;
    const st = stats(); renderTiles(st); renderVerdict(st); updateTable(st); renderHeat(); renderPairs(); commit();
    if (C.pair && $('corrPair').firstChild) showPairQuiet();
  }
  function showPairQuiet() { const [i, j] = C.pair, sc = $('corrPair'); const y = window.scrollY; showPair(i, j); window.scrollTo(0, y); }

  function render() {
    const has = build();
    const t = (state.env && state.env.table) || [];
    if (!has) {
      ['corrTiles', 'corrVerdict', 'corrVarTable', 'corrHeat', 'corrPair', 'corrPairs'].forEach(id => { $(id).innerHTML = ''; });
      $('corrVerdict').innerHTML = `<div class="msg msg-warning">${t.length ? L2('Hacen falta al menos 3 registros con todas las variables para calcular la correlación.', 'At least 3 records with every variable are needed to compute the correlation.')
        : L2('Aún no hay variables ambientales: extráelas en el paso 5.', 'There are no environmental variables yet: extract them in step 5.')}</div>`;
      return;
    }
    renderTable(); refresh();
  }

  /* selection available to the other steps even if the user never opens this one */
  function ensure() {
    if (!(state.env && state.env.table && state.env.table.length)) return;
    if (!$('corrR')) return;
    if (build()) commit();
  }
  function invalidate() { C.sigKeys = ''; C.init = false; C.sel = new Set(); C.pair = null; ensure(); }

  /* ---------- exports ---------- */
  function svgString() { return heatSVG(); }
  $('corrDlSvg').onclick = () => { if (C.P) downloadBlob(svgString(), slugName(state.query) + '_correlation_' + C.method + '.svg', 'image/svg+xml;charset=utf-8'); };
  $('corrDlPng').onclick = async () => {
    if (!C.P) return;
    const svg = svgString(), url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })), img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const k = 3, cv = document.createElement('canvas'); cv.width = img.width * k; cv.height = img.height * k;
    const g = cv.getContext('2d'); g.scale(k, k); g.drawImage(img, 0, 0); URL.revokeObjectURL(url);
    cv.toBlob(b => downloadBlob(b, slugName(state.query) + '_correlation_' + C.method + '.png', 'image/png'), 'image/png');
  };
  $('corrDlCsv').onclick = () => {
    if (!C.P) return;
    const rows = C.keys.map((k, i) => [code(k), ...C.keys.map((_, j) => C.R[i][j].toFixed(4))].join(','));
    downloadBlob('﻿' + [['', ...C.keys.map(code)].join(','), ...rows].join('\n'), slugName(state.query) + '_correlation_' + C.method + '.csv', 'text/csv;charset=utf-8');
  };
  $('corrDlSel').onclick = () => {
    const vars = (state.sel && state.sel.vars) || []; if (!vars.length) return;
    const cols = [{ key: 'key', label: 'id' }, { key: 'taxon', label: 'taxon' }, { key: 'decimalLatitude', label: 'lat' }, { key: 'decimalLongitude', label: 'lon' }, ...vars.map(k => ({ key: k, label: code(k) }))];
    downloadBlob(toCSV(cols, state.env.table), slugName(state.query) + '_selected_variables.csv', 'text/csv;charset=utf-8');
  };

  /* ---------- controls ---------- */
  $('corrAuto').onclick = () => { if (!C.P) return; autoSelect(); C.pair = null; $('corrPair').innerHTML = ''; refresh(); };
  $('corrPinCore').onclick = () => {
    if (!C.P) return;
    ['bio_1', 'bio_12'].forEach(k => { if (C.keys.includes(k)) C.pinned.add(k); });
    autoSelect(); refresh();
  };
  $('corrAll').onclick = () => { if (!C.P) return; C.sel = new Set(C.keys); C.removed = {}; refresh(); };
  $('corrNone').onclick = () => { if (!C.P) return; C.sel = new Set(); C.pinned = new Set(); C.removed = {}; refresh(); };
  $('corrMethod').onchange = e => { C.method = e.target.value; C.sigKeys = C.sigKeys; if (!C.P) return; const keep = new Set(C.sel), pins = new Set(C.pinned); build(); C.sel = keep; C.pinned = pins; C.pair = null; $('corrPair').innerHTML = ''; refresh(); };
  ['corrR', 'corrVif'].forEach(id => $(id).onchange = () => { if (!C.P) return; refresh(); });
  $('toStep7Btn').addEventListener('click', () => { goToStep(7); });
  document.addEventListener('langchange', () => { if (C.P && $('panel-6').classList.contains('active')) { renderTable(); refresh(); } });
  document.addEventListener('themechange', () => { if (C.P) renderHeat(); });

  window.buildCorr = render;
  window.corrEnsure = ensure;
  window.corrInvalidate = invalidate;
  window.corrTest = { corrMatrix, ranks, vifOf, recommend, C };
})();
