/* Paso 6 (Bloque C): estadística descriptiva, distribuciones, normalidad y correlación.
   El cálculo corre en Python (Pyodide). */

const PY_STATS = String.raw`
import numpy as np, pandas as pd, json, io, base64
from scipy import stats
from scipy.cluster import hierarchy
from scipy.spatial.distance import squareform
import matplotlib.pyplot as plt

def _df():  return _STATE['df']
def _vars(): return _STATE['vars']
def _series(k): return pd.to_numeric(_df()[k], errors='coerce').dropna().values

def describe_table():
    out = []
    for k in _vars():
        x = _series(k)
        if len(x) == 0: continue
        q1, med, q3 = np.percentile(x, [25, 50, 75])
        m = float(np.mean(x)); sd = float(np.std(x, ddof=1)) if len(x) > 1 else 0.0
        out.append(dict(variable=k, etiqueta=vlabel(k), n=int(len(x)),
            media=round(m, 3), DE=round(sd, 3),
            CV=round(abs(sd / m) * 100, 1) if m != 0 else None,
            min=round(float(np.min(x)), 3), Q1=round(float(q1), 3),
            mediana=round(float(med), 3), Q3=round(float(q3), 3),
            max=round(float(np.max(x)), 3),
            asimetria=round(float(stats.skew(x)), 3),
            curtosis=round(float(stats.kurtosis(x)), 3)))
    return json.dumps(out)

def _normality_one(x):
    res = {}
    try:
        w, p = stats.shapiro(x[:5000]); res['shapiro_W'] = round(float(w), 4); res['shapiro_p'] = float(p)
    except Exception: res['shapiro_W'] = None; res['shapiro_p'] = None
    try:
        k2, p = stats.normaltest(x); res['dagostino_p'] = float(p)
    except Exception: res['dagostino_p'] = None
    try:
        a = stats.anderson(x, 'norm')
        crit = float(a.critical_values[2])  # nivel 5%
        res['anderson_A2'] = round(float(a.statistic), 3); res['anderson_crit5'] = round(crit, 3)
        res['anderson_normal'] = bool(a.statistic < crit)
    except Exception: res['anderson_A2'] = None
    try:
        jb, p = stats.jarque_bera(x); res['jarque_bera_p'] = float(p)
    except Exception: res['jarque_bera_p'] = None
    try:
        z = (x - np.mean(x)) / np.std(x, ddof=1)
        d, p = stats.kstest(z, 'norm'); res['ks_p'] = float(p)
    except Exception: res['ks_p'] = None
    return res

def normality_table():
    out = []
    for k in _vars():
        x = _series(k)
        if len(x) < 8: continue
        r = _normality_one(x)
        ps = [r.get(t) for t in ('shapiro_p', 'dagostino_p', 'jarque_bera_p', 'ks_p')]
        ps = [p for p in ps if p is not None]
        votes_normal = sum(p > 0.05 for p in ps) + (1 if r.get('anderson_normal') else 0)
        votes_total = len(ps) + (1 if 'anderson_normal' in r and r['anderson_A2'] is not None else 0)
        r.update(variable=k, etiqueta=vlabel(k), n=int(len(x)),
                 veredicto=('normal' if votes_normal > votes_total / 2 else 'no normal'),
                 votos=f"{votes_normal}/{votes_total}")
        for key in ('shapiro_p','dagostino_p','jarque_bera_p','ks_p'):
            if r.get(key) is not None: r[key] = round(r[key], 4)
        out.append(r)
    return json.dumps(out)

_TRANSFORMS = ['ninguna', 'log', 'raíz', 'Box-Cox', 'Yeo-Johnson']
def _apply_transform(x, name):
    if name == 'ninguna': return x
    if name == 'log':
        s = 0 if x.min() > 0 else (1 - x.min())
        return np.log(x + s)
    if name == 'raíz':
        s = 0 if x.min() >= 0 else -x.min()
        return np.sqrt(x + s)
    if name == 'Box-Cox':
        s = 0 if x.min() > 0 else (1 - x.min())
        return stats.boxcox(x + s)[0]
    if name == 'Yeo-Johnson':
        return stats.yeojohnson(x)[0]
    return x

def transform_suggestions():
    out = []
    for k in _vars():
        x = _series(k)
        if len(x) < 8: continue
        base_p = _normality_one(x).get('shapiro_p') or 0
        best = ('ninguna', base_p, float(stats.skew(x)))
        for name in _TRANSFORMS[1:]:
            try:
                xt = _apply_transform(x, name)
                if not np.all(np.isfinite(xt)): continue
                w, p = stats.shapiro(xt[:5000])
                if p > best[1]: best = (name, float(p), float(stats.skew(xt)))
            except Exception: continue
        out.append(dict(variable=k, etiqueta=vlabel(k),
            asimetria_orig=round(float(stats.skew(x)), 3),
            shapiro_p_orig=round(base_p, 4),
            transf_sugerida=best[0], shapiro_p_transf=round(best[1], 4),
            asimetria_transf=round(best[2], 3),
            mejora=('sí' if best[0] != 'ninguna' and best[1] > max(base_p, 0.05) else 'marginal' if best[0] != 'ninguna' else '—')))
    return json.dumps(out)

def _corr(method):
    d = _df()[_vars()].apply(pd.to_numeric, errors='coerce')
    return d.corr(method=method)

def corr_matrix(method='pearson'):
    c = _corr(method)
    dist = 1 - c.abs().values
    np.fill_diagonal(dist, 0)
    order = list(range(len(c)))
    try:
        Z = hierarchy.linkage(squareform(dist, checks=False), method='average')
        order = hierarchy.leaves_list(Z)
    except Exception: pass
    labs = list(c.columns)
    ordered = [labs[i] for i in order]
    m = c.loc[ordered, ordered].round(3).values.tolist()
    return json.dumps(dict(labels=ordered, etiquetas=[vlabel(x) for x in ordered], matrix=m))

def vif_table():
    d = _df()[_vars()].apply(pd.to_numeric, errors='coerce').dropna()
    if len(d) < 3 or d.shape[1] < 2: return json.dumps([])
    c = d.corr().values
    try: inv = np.linalg.inv(c)
    except np.linalg.LinAlgError: inv = np.linalg.pinv(c)
    vifs = np.diag(inv)
    out = [dict(variable=k, etiqueta=vlabel(k), VIF=round(float(v), 2),
               interpretacion=('alta colinealidad' if v > 10 else 'moderada' if v > 5 else 'baja'))
           for k, v in zip(d.columns, vifs)]
    out.sort(key=lambda r: -r['VIF'])
    return json.dumps(out)

def collinearity_reduction(r_thresh=0.8, vif_thresh=10.0, keep_json='[]'):
    keep = set(json.loads(keep_json))
    d = _df()[_vars()].apply(pd.to_numeric, errors='coerce').dropna()
    remaining = list(d.columns)
    removed = []
    # 1) poda por |r| alto entre pares
    while True:
        c = d[remaining].corr().abs()
        np.fill_diagonal(c.values, 0)
        mx = c.values.max() if len(remaining) > 1 else 0
        if mx < r_thresh: break
        i, j = np.unravel_index(np.argmax(c.values), c.shape)
        a, b = remaining[i], remaining[j]
        cand = [v for v in (a, b) if v not in keep] or [a, b]
        # quita el de mayor correlación media con el resto
        drop = max(cand, key=lambda v: c[v].mean())
        removed.append(dict(variable=drop, etiqueta=vlabel(drop),
            motivo=f"|r|={mx:.2f} con {vlabel(a if drop==b else b)}"))
        remaining.remove(drop)
    # 2) poda por VIF
    while len(remaining) > 2:
        cc = d[remaining].corr().values
        try: inv = np.linalg.inv(cc)
        except np.linalg.LinAlgError: inv = np.linalg.pinv(cc)
        vifs = dict(zip(remaining, np.diag(inv)))
        order = sorted(remaining, key=lambda v: -vifs[v])
        worst = next((v for v in order if v not in keep), order[0])
        if vifs[worst] <= vif_thresh: break
        removed.append(dict(variable=worst, etiqueta=vlabel(worst), motivo=f"VIF={vifs[worst]:.1f}"))
        remaining.remove(worst)
    return json.dumps(dict(
        recomendadas=[dict(variable=v, etiqueta=vlabel(v)) for v in remaining],
        eliminadas=removed, r_thresh=r_thresh, vif_thresh=vif_thresh))

# ---------- figuras ----------
def _grid(n):
    cols = 5 if n > 12 else 4 if n > 6 else min(n, 3)
    rows = int(np.ceil(n / cols)); return rows, cols

def fig_hist_grid():
    vs = _vars(); rows, cols = _grid(len(vs))
    fig, ax = plt.subplots(rows, cols, figsize=(cols * 2.7, rows * 2.1))
    ax = np.atleast_1d(ax).ravel()
    for i, k in enumerate(vs):
        x = _series(k); a = ax[i]
        a.hist(x, bins=25, density=True, color='#4c78a8', alpha=.65, edgecolor='white', linewidth=.3)
        try:
            kde = stats.gaussian_kde(x); xs = np.linspace(x.min(), x.max(), 120)
            a.plot(xs, kde(xs), color='#e45756', lw=1.3)
        except Exception: pass
        a.set_title(vlabel(k), fontsize=8); a.tick_params(labelsize=6)
    for j in range(len(vs), len(ax)): ax[j].axis('off')
    fig.suptitle('Histogramas y densidad (KDE)', y=1.005)
    fig.tight_layout()
    return fig_to_b64(fig)

def fig_box_grid():
    vs = _vars()
    d = _df()[vs].apply(pd.to_numeric, errors='coerce')
    z = (d - d.mean()) / d.std()
    fig, a = plt.subplots(figsize=(max(6, len(vs) * .5), 4.5))
    a.boxplot([z[k].dropna().values for k in vs], labels=[vlabel(k) for k in vs],
              vert=True, patch_artist=True,
              boxprops=dict(facecolor='#72b7b2', alpha=.7), medianprops=dict(color='#333'))
    a.set_title('Boxplots (variables estandarizadas z)'); a.axhline(0, color='#999', lw=.6)
    plt.setp(a.get_xticklabels(), rotation=55, ha='right', fontsize=7)
    fig.tight_layout()
    return fig_to_b64(fig)

def fig_detail(var):
    x = _series(var)
    fig, ax = plt.subplots(2, 2, figsize=(8.4, 6.2))
    ax[0, 0].hist(x, bins=28, density=True, color='#4c78a8', alpha=.65, edgecolor='white', linewidth=.3)
    try:
        kde = stats.gaussian_kde(x); xs = np.linspace(x.min(), x.max(), 150)
        ax[0, 0].plot(xs, kde(xs), color='#e45756', lw=1.5)
        mu, sd = np.mean(x), np.std(x, ddof=1)
        ax[0, 0].plot(xs, stats.norm.pdf(xs, mu, sd), '--', color='#666', lw=1, label='normal teórica')
        ax[0, 0].legend(fontsize=7)
    except Exception: pass
    ax[0, 0].set_title('Histograma + densidad')
    ax[0, 1].boxplot(x, vert=True, patch_artist=True, boxprops=dict(facecolor='#72b7b2', alpha=.7))
    ax[0, 1].set_title('Boxplot')
    parts = ax[1, 0].violinplot(x, showmeans=True, showmedians=True)
    for pc in parts['bodies']: pc.set_facecolor('#b279a2'); pc.set_alpha(.6)
    ax[1, 0].set_title('Violín')
    stats.probplot(x, dist='norm', plot=ax[1, 1])
    ax[1, 1].set_title('Q–Q normal')
    ax[1, 1].get_lines()[0].set(marker='o', markersize=3, alpha=.5, color='#4c78a8')
    ax[1, 1].get_lines()[1].set(color='#e45756')
    fig.suptitle(vlabel(var), y=1.01)
    fig.tight_layout()
    return fig_to_b64(fig)

def fig_group(var):
    g = _STATE.get('group')
    if not g: return ''
    df = _df()[[var, g]].copy()
    df[var] = pd.to_numeric(df[var], errors='coerce')
    df = df.dropna()
    groups = [x for x in df[g].unique()]
    if len(groups) < 2: return ''
    fig, ax = plt.subplots(1, 2, figsize=(11, 4.2))
    data = [df.loc[df[g] == gg, var].values for gg in groups]
    ax[0].boxplot(data, labels=groups, patch_artist=True, boxprops=dict(facecolor='#4c78a8', alpha=.6))
    ax[0].set_title(f'{vlabel(var)} por taxón')
    plt.setp(ax[0].get_xticklabels(), rotation=25, ha='right', fontsize=7)
    for gg, dd in zip(groups, data):
        if len(dd) > 4:
            try:
                kde = stats.gaussian_kde(dd); xs = np.linspace(dd.min(), dd.max(), 120)
                ax[1].plot(xs, kde(xs), lw=1.4, label=str(gg))
            except Exception: pass
    ax[1].set_title('Densidad por taxón'); ax[1].legend(fontsize=7)
    fig.tight_layout()
    return fig_to_b64(fig)

def fig_corr(method='pearson'):
    c = _corr(method)
    dist = 1 - c.abs().values; np.fill_diagonal(dist, 0)
    try:
        Z = hierarchy.linkage(squareform(dist, checks=False), method='average')
        order = hierarchy.leaves_list(Z)
    except Exception:
        order = list(range(len(c)))
    labs = [c.columns[i] for i in order]
    m = c.loc[labs, labs].values
    fig, a = plt.subplots(figsize=(max(6, len(labs) * .55), max(5, len(labs) * .52)))
    im = a.imshow(m, cmap='RdBu_r', vmin=-1, vmax=1)
    a.set_xticks(range(len(labs))); a.set_yticks(range(len(labs)))
    a.set_xticklabels([vlabel(x) for x in labs], rotation=90, fontsize=6)
    a.set_yticklabels([vlabel(x) for x in labs], fontsize=6)
    if len(labs) <= 22:
        for i in range(len(labs)):
            for j in range(len(labs)):
                a.text(j, i, f'{m[i,j]:.2f}', ha='center', va='center', fontsize=5,
                       color='white' if abs(m[i, j]) > .55 else '#333')
    a.set_title(f'Correlación de {"Pearson" if method=="pearson" else "Spearman"} (orden por conglomerados)')
    fig.colorbar(im, ax=a, shrink=.7)
    fig.tight_layout()
    return fig_to_b64(fig)

def fig_var_dendro(method='pearson'):
    c = _corr(method)
    dist = 1 - c.abs().values; np.fill_diagonal(dist, 0)
    Z = hierarchy.linkage(squareform(dist, checks=False), method='average')
    fig, a = plt.subplots(figsize=(max(6, len(c) * .5), 4.6))
    hierarchy.dendrogram(Z, labels=[vlabel(x) for x in c.columns], ax=a, leaf_rotation=90, color_threshold=.4)
    a.set_ylabel('1 − |r|'); a.set_title('Agrupamiento de variables por correlación')
    a.axhline(1 - 0.8, color='#e45756', ls='--', lw=1, label='|r| = 0.8')
    a.legend(fontsize=8)
    fig.tight_layout()
    return fig_to_b64(fig)
`;

/* ---------- estado local del bloque ---------- */
let statsReady = false;

function envContinuousVars() {
  const t = state.env.table || [];
  return [...Array(19)].map((_, i) => 'bio_' + (i + 1)).concat('elev')
    .filter(k => t.some(r => r[k] != null));
}

function buildStatsVarPicker() {
  const box = el('statsVarChecklist');
  box.innerHTML = '';
  envContinuousVars().forEach(k => {
    const meta = rasters.BIOCLIM_META[k];
    const label = document.createElement('label');
    label.className = 'checkbox-label';
    label.innerHTML = `<input type="checkbox" value="${k}" checked> ${meta ? meta[0] + ' — ' + meta[1] : k}`;
    box.appendChild(label);
  });
}

function selectedStatsVars() {
  return [...el('statsVarChecklist').querySelectorAll('input:checked')].map(c => c.value);
}

function varLabelMap(keys) {
  const m = {};
  keys.forEach(k => { const meta = rasters.BIOCLIM_META[k]; m[k] = meta ? meta[0] : k; });
  return m;
}

el('statsRunBtn').addEventListener('click', runStats);

async function runStats() {
  const vars = selectedStatsVars();
  if (vars.length < 2) { showMessage('statsMessages', 'error', 'Selecciona al menos 2 variables.'); return; }
  if (!(state.env.table && state.env.table.length)) {
    showMessage('statsMessages', 'error', 'No hay tabla de variables ambientales (vuelve al paso 5).'); return;
  }
  clearMessages('statsMessages');
  showSpinner('Preparando análisis…');
  try {
    const py = await getPyodide();
    if (!statsReady) { py.runPython(PY_STATS); statsReady = true; }

    setSpinner('Cargando datos en Python…');
    py.globals.set('env_json', JSON.stringify(state.env.table));
    py.globals.set('vars_json', JSON.stringify(vars));
    py.globals.set('vlab_json', JSON.stringify(varLabelMap(vars)));
    py.runPython(`import json as _j; load_df(env_json, _j.loads(vars_json)); set_var_labels(vlab_json)`);

    setSpinner('Estadística descriptiva…');
    renderStatsTable('statsDescTable', JSON.parse(py.runPython('describe_table()')), DESC_COLS);

    setSpinner('Pruebas de normalidad…');
    renderStatsTable('statsNormTable', JSON.parse(py.runPython('normality_table()')), NORM_COLS);
    renderStatsTable('statsTransfTable', JSON.parse(py.runPython('transform_suggestions()')), TRANSF_COLS);

    setSpinner('Correlación y colinealidad…');
    renderStatsTable('statsVifTable', JSON.parse(py.runPython('vif_table()')), VIF_COLS);
    renderCollinearity(JSON.parse(py.runPython("collinearity_reduction(0.8, 10.0, '[]')")));

    setSpinner('Generando figuras…');
    imgInto('figHistGrid', await runPy('fig_hist_grid()'));
    imgInto('figBoxGrid', await runPy('fig_box_grid()'));
    imgInto('figCorr', await runPy("fig_corr('pearson')"));
    imgInto('figDendro', await runPy('fig_var_dendro()'));

    // selector de variable para el detalle
    const dv = el('statsDetailVar'); dv.innerHTML = '';
    vars.forEach(k => dv.add(new Option(rasters.BIOCLIM_META[k] ? rasters.BIOCLIM_META[k][1] : k, k)));
    await updateDetailFig();

    el('statsResults').style.display = 'block';
    showMessage('statsMessages', 'success', 'Análisis completo.');
    enableStep(7);
  } catch (err) {
    console.error(err);
    showMessage('statsMessages', 'error', 'Error en el análisis: ' + err.message);
  } finally {
    hideSpinner();
  }
}

async function updateDetailFig() {
  const v = el('statsDetailVar').value;
  showSpinner('Dibujando ' + v + '…');
  try {
    imgInto('figDetail', await runPy(`fig_detail(${JSON.stringify(v)})`));
    const g = await runPy(`fig_group(${JSON.stringify(v)})`);
    if (g) { imgInto('figGroup', g); el('figGroupWrap').style.display = 'block'; }
    else el('figGroupWrap').style.display = 'none';
  } finally { hideSpinner(); }
}
el('statsDetailVar').addEventListener('change', updateDetailFig);

el('statsCorrMethod').addEventListener('change', async e => {
  showSpinner('Recalculando correlación…');
  try { imgInto('figCorr', await runPy(`fig_corr(${JSON.stringify(e.target.value)})`)); }
  finally { hideSpinner(); }
});

el('collRecalcBtn').addEventListener('click', async () => {
  const r = parseFloat(el('collR').value) || 0.8;
  const v = parseFloat(el('collVif').value) || 10;
  showSpinner('Recalculando…');
  try {
    renderCollinearity(JSON.parse((await getPyodide()).runPython(
      `collinearity_reduction(${r}, ${v}, '[]')`)));
  } finally { hideSpinner(); }
});

/* ---------- render de tablas y figuras ---------- */

function imgInto(id, dataUri) {
  const box = el(id);
  box.innerHTML = dataUri ? `<img src="${dataUri}" style="max-width:100%;height:auto">` : '<p class="hint">Sin figura.</p>';
}

function renderStatsTable(id, rows, cols) {
  buildTable(id, cols, rows);
}

const DESC_COLS = [
  { key: 'etiqueta', label: 'Variable' }, { key: 'n', label: 'n' },
  { key: 'media', label: 'Media' }, { key: 'DE', label: 'DE' }, { key: 'CV', label: 'CV %' },
  { key: 'min', label: 'Mín' }, { key: 'Q1', label: 'Q1' }, { key: 'mediana', label: 'Mediana' },
  { key: 'Q3', label: 'Q3' }, { key: 'max', label: 'Máx' },
  { key: 'asimetria', label: 'Asimetría' }, { key: 'curtosis', label: 'Curtosis' },
];
const NORM_COLS = [
  { key: 'etiqueta', label: 'Variable' }, { key: 'n', label: 'n' },
  { key: 'shapiro_p', label: 'Shapiro p' }, { key: 'dagostino_p', label: "D'Agostino p" },
  { key: 'anderson_A2', label: 'A-D A²' }, { key: 'anderson_crit5', label: 'A-D crít 5%' },
  { key: 'jarque_bera_p', label: 'Jarque-Bera p' }, { key: 'ks_p', label: 'KS p' },
  { key: 'votos', label: 'Votos normal' }, { key: 'veredicto', label: 'Veredicto' },
];
const TRANSF_COLS = [
  { key: 'etiqueta', label: 'Variable' }, { key: 'asimetria_orig', label: 'Asim. original' },
  { key: 'shapiro_p_orig', label: 'Shapiro p orig.' }, { key: 'transf_sugerida', label: 'Transformación' },
  { key: 'shapiro_p_transf', label: 'Shapiro p transf.' }, { key: 'asimetria_transf', label: 'Asim. transf.' },
  { key: 'mejora', label: '¿Mejora?' },
];
const VIF_COLS = [
  { key: 'etiqueta', label: 'Variable' }, { key: 'VIF', label: 'VIF' }, { key: 'interpretacion', label: 'Colinealidad' },
];

function renderCollinearity(res) {
  const box = el('collResult');
  const rec = res.recomendadas.map(v => v.etiqueta).join(', ');
  const rem = res.eliminadas.map(v => `<li><b>${v.etiqueta}</b> — ${v.motivo}</li>`).join('');
  box.innerHTML = `
    <div class="msg msg-success"><b>${res.recomendadas.length} variables recomendadas</b>
      (|r| &lt; ${res.r_thresh}, VIF &lt; ${res.vif_thresh}):<br>${rec}</div>
    ${res.eliminadas.length ? `<p class="hint" style="margin-top:8px">Eliminadas por colinealidad:</p><ul style="font-size:.85rem">${rem}</ul>` : '<p class="hint">No se detectó colinealidad relevante.</p>'}`;
  state.stats = state.stats || {};
  state.stats.recommendedVars = res.recomendadas.map(v => v.variable);
}

el('dlRecommendedBtn').addEventListener('click', () => {
  const keep = (state.stats && state.stats.recommendedVars) || [];
  if (!keep.length) return;
  const t = state.env.table;
  const cols = [
    { key: 'key', label: 'gbif_key' }, { key: 'taxon', label: 'taxon' },
    { key: 'decimalLatitude', label: 'lat' }, { key: 'decimalLongitude', label: 'lon' },
    ...keep.map(k => ({ key: k, label: rasters.BIOCLIM_META[k] ? rasters.BIOCLIM_META[k][0] : k })),
  ];
  downloadBlob(toCSV(cols, t),
    (state.query || 'especie').replace(/\s+/g, '_') + '_variables_no_colineales.csv', 'text/csv;charset=utf-8');
});

el('toStep6Btn') && el('toStep6Btn').addEventListener('click', () => { goToStep(6); buildStatsVarPicker(); });

window.buildStatsVarPicker = buildStatsVarPicker;
