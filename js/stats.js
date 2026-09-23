/* Step 7: descriptive statistics, distributions and normality.
   - The tables are computed in Python (Pyodide): summary, normality tests and the suggested transformation.
     Python returns language-neutral codes; the tables below turn them into {es, en} labels.
   - Every figure is drawn in JavaScript as a vector figure by the figure studio (js/figstudio.js), so it can be
     edited down to the last detail and exported as SVG or as a raster image with its physical resolution. */

const PY_STATS = String.raw`
import numpy as np, pandas as pd, json
from scipy import stats

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
        out.append(dict(variable=k, label=vlabel(k), n=int(len(x)),
            mean=round(m, 3), sd=round(sd, 3),
            cv=round(abs(sd / m) * 100, 1) if m != 0 else None,
            min=round(float(np.min(x)), 3), q1=round(float(q1), 3),
            median=round(float(med), 3), q3=round(float(q3), 3),
            max=round(float(np.max(x)), 3),
            skew=round(float(stats.skew(x)), 3),
            kurt=round(float(stats.kurtosis(x)), 3)))
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
        crit = float(a.critical_values[2])  # 5 % level
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
        r.update(variable=k, label=vlabel(k), n=int(len(x)),
                 verdict=('normal' if votes_normal > votes_total / 2 else 'non_normal'),
                 votes=f"{votes_normal}/{votes_total}")
        for key in ('shapiro_p','dagostino_p','jarque_bera_p','ks_p'):
            if r.get(key) is not None: r[key] = round(r[key], 4)
        out.append(r)
    return json.dumps(out)

_TRANSFORMS = ['none', 'log', 'sqrt', 'boxcox', 'yeojohnson']
def _apply_transform(x, name):
    if name == 'none': return x
    if name == 'log':
        s = 0 if x.min() > 0 else (1 - x.min())
        return np.log(x + s)
    if name == 'sqrt':
        s = 0 if x.min() >= 0 else -x.min()
        return np.sqrt(x + s)
    if name == 'boxcox':
        s = 0 if x.min() > 0 else (1 - x.min())
        return stats.boxcox(x + s)[0]
    if name == 'yeojohnson':
        return stats.yeojohnson(x)[0]
    return x

def transform_suggestions():
    out = []
    for k in _vars():
        x = _series(k)
        if len(x) < 8: continue
        base_p = _normality_one(x).get('shapiro_p') or 0
        best = ('none', base_p, float(stats.skew(x)))
        for name in _TRANSFORMS[1:]:
            try:
                xt = _apply_transform(x, name)
                if not np.all(np.isfinite(xt)): continue
                w, p = stats.shapiro(xt[:5000])
                if p > best[1]: best = (name, float(p), float(stats.skew(xt)))
            except Exception: continue
        out.append(dict(variable=k, label=vlabel(k),
            skew_orig=round(float(stats.skew(x)), 3),
            shapiro_p_orig=round(base_p, 4),
            suggested=best[0], shapiro_p_transf=round(best[1], 4),
            skew_transf=round(best[2], 3),
            improves=('yes' if best[0] != 'none' and best[1] > max(base_p, 0.05) else 'marginal' if best[0] != 'none' else 'na')))
    return json.dumps(out)
`;

/* ---------- local state ---------- */
let statsReady = false;

function envContinuousVars() {
  const t = state.env.table || [];
  return [...Array(19)].map((_, i) => 'bio_' + (i + 1)).concat('elev')
    .filter(k => t.some(r => r[k] != null));
}

/* The variables come from the selection made in step 6 (all of them when that step was never opened);
   the list is rebuilt only when that selection or the extracted layers change, so a manual change here is kept. */
let statsPickSig = '';
function buildStatsVarPicker() {
  const box = el('statsVarChecklist'), all = envContinuousVars();
  const chosen = new Set((state.sel && state.sel.vars && state.sel.vars.length) ? state.sel.vars : all);
  const sig = all.join(',') + '|' + [...chosen].join(',');
  if (sig === statsPickSig && box.children.length) return;
  statsPickSig = sig;
  box.innerHTML = '';
  all.forEach(k => {
    const label = document.createElement('label');
    label.className = 'checkbox-label';
    label.innerHTML = `<input type="checkbox" value="${k}"${chosen.has(k) ? ' checked' : ''}> ${esc(varCode(k))} — ${varNameL2(k)}` +
      (chosen.has(k) && state.sel ? ` <span class="tag-info">${L2('paso 6', 'step 6')}</span>` : '');
    box.appendChild(label);
  });
}

function selectedStatsVars() {
  return [...el('statsVarChecklist').querySelectorAll('input:checked')].map(c => c.value);
}

function varLabelMap(keys) {
  const m = {};
  keys.forEach(k => { m[k] = varCode(k); });
  return m;
}

el('statsRunBtn').addEventListener('click', runStats);

async function runStats() {
  const vars = selectedStatsVars();
  if (vars.length < 2) { showMessage('statsMessages', 'error', L2('Selecciona al menos 2 variables.', 'Select at least 2 variables.')); return; }
  if (!(state.env.table && state.env.table.length)) {
    showMessage('statsMessages', 'error', L2('No hay tabla de variables ambientales (vuelve al paso 5).', 'There is no environmental variable table (go back to step 5).')); return;
  }
  clearMessages('statsMessages');
  showSpinner(T('Preparando análisis…', 'Preparing the analysis…'));
  try {
    const py = await getPyodide();
    if (!statsReady) { py.runPython(PY_STATS); statsReady = true; }

    setSpinner(T('Cargando datos en Python…', 'Loading data into Python…'));
    py.globals.set('env_json', JSON.stringify(state.env.table));
    py.globals.set('vars_json', JSON.stringify(vars));
    py.globals.set('vlab_json', JSON.stringify(varLabelMap(vars)));
    await runPy(`import json as _j; load_df(env_json, _j.loads(vars_json)); set_var_labels(vlab_json)`);

    setSpinner(T('Estadística descriptiva…', 'Descriptive statistics…'));
    buildTable('statsDescTable', DESC_COLS, await runPyJSON('describe_table()'));

    setSpinner(T('Pruebas de normalidad…', 'Normality tests…'));
    buildTable('statsNormTable', NORM_COLS, await runPyJSON('normality_table()'));
    buildTable('statsTransfTable', TRANSF_COLS, await runPyJSON('transform_suggestions()'));

    el('statsResults').style.display = 'block';
    setSpinner(T('Dibujando las figuras…', 'Drawing the figures…'));
    await sleep(30);
    buildStatsFigures(vars);

    showMessage('statsMessages', 'success', L2('Análisis completo.', 'Analysis complete.'));
    enableStep(8);
  } catch (err) {
    console.error(err);
    showMessage('statsMessages', 'error', L2('Error en el análisis: ', 'Analysis error: ') + esc(err.message));
  } finally {
    hideSpinner();
  }
}

/* ==================== figures (drawn in JavaScript, edited in the figure studio) ==================== */

const GROUP = 'stats7';          // every figure of this step shares this group, so a look can be propagated
const FS = () => window.figstudio;
let figVars = [];                // the variables of the last run

/* the finite values of one variable, and the same values standardised */
function statsCol(k) {
  const t = state.env.table || [], out = [];
  for (let i = 0; i < t.length; i++) { const v = +t[i][k]; if (isFinite(v)) out.push(v); }
  return Float64Array.from(out);
}
function statsColZ(k) {
  const x = statsCol(k), m = FS().num.meanOf(x), s = FS().num.sdOf(x, 1) || 1;
  return Float64Array.from(x, v => (v - m) / s);
}
/* the values of one variable split by taxon (only groups with enough records) */
function statsByTaxon(k, minN) {
  const t = state.env.table || [], m = new Map();
  for (let i = 0; i < t.length; i++) {
    const v = +t[i][k], g = t[i].taxon;
    if (!isFinite(v) || g == null || g === '') continue;
    let a = m.get(String(g)); if (!a) { a = []; m.set(String(g), a); }
    a.push(v);
  }
  return [...m.entries()].filter(([, a]) => a.length >= (minN || 3))
    .map(([g, a]) => ({ id: g, label: g, v: Float64Array.from(a) }));
}
const varTitle = k => varCode(k) + ' · ' + varName(k);
/* short axis label: the code and the unit (the full name is in the subtitle, and the user can type anything) */
const varAxis = k => varCode(k) + (BIOCLIM_META[k] ? ` (${BIOCLIM_META[k][2]})` : '');
/* the vertical axis of a histogram follows what the studio is drawing */
const histYTitle = studioOf => () => {
  const s = studioOf();
  const y = s && s.style ? s.style.histY : 'density', c = s && s.style ? s.style.cumulative : false;
  if (y === 'count') return c ? { es: 'Frecuencia acumulada', en: 'Cumulative frequency' } : { es: 'Frecuencia', en: 'Frequency' };
  if (y === 'prob') return c ? { es: 'Proporción acumulada', en: 'Cumulative proportion' } : { es: 'Proporción', en: 'Proportion' };
  return c ? { es: 'Densidad acumulada', en: 'Cumulative density' } : { es: 'Densidad', en: 'Density' };
};
const DIST_SERIES = [
  { id: 'hist', label: { es: 'Histograma', en: 'Histogram' }, swatch: 'bar' },
  { id: 'dens', label: { es: 'Densidad (núcleo gaussiano)', en: 'Density (Gaussian kernel)' }, swatch: 'line' },
  { id: 'norm', label: { es: 'Normal ajustada', en: 'Fitted normal' }, swatch: 'line' },
  { id: 'rug', label: { es: 'Valores individuales', en: 'Individual values' }, swatch: 'line' },
];
const distLayers = v => [{ t: 'hist', sid: 'hist', v }, { t: 'density', sid: 'dens', v }, { t: 'normal', sid: 'norm', v }, { t: 'rug', sid: 'rug', v }];

/* ---------- the specification of every figure ---------- */
function specHistGrid(vars) {
  return {
    name: 'histograms', rowH: 205, extraH: 76,
    title: { es: 'Histogramas y densidad', en: 'Histograms and density' },
    subtitle: '', xTitle: { es: 'Valor de la variable', en: 'Variable value' }, yTitle: histYTitle(() => studios.histgrid),
    panels: vars.map(k => ({ id: k, title: varTitle(k), layers: distLayers(statsCol(k)) })),
    series: DIST_SERIES,
  };
}
function specBoxGrid(vars) {
  return {
    name: 'boxplots', rowH: 330, extraH: 90,
    title: { es: 'Diagramas de caja de las variables estandarizadas', en: 'Box plots of the standardised variables' },
    subtitle: { es: 'cada variable en unidades de desviación estándar (z)', en: 'each variable in standard deviation units (z)' },
    xTitle: '', yTitle: { es: 'Valor estandarizado (z)', en: 'Standardised value (z)' },
    panels: [{ id: 'all', title: '', layers: [{ t: 'box', groups: vars.map(k => ({ id: k, label: varCode(k), v: statsColZ(k) })) }] }],
    series: vars.map(k => ({ id: k, label: varCode(k), swatch: 'box' })),
  };
}
/* Mean and interval of every variable in its own units: one panel per variable, and inside it one point
   per taxon when the records carry more than one (otherwise a single point for the whole set). */
function specCiPlot(vars) {
  const taxa = statsByTaxon(vars[0], 3), many = taxa.length >= 2;
  const groupsOf = k => many ? statsByTaxon(k, 3) : [{ id: 'all', label: state.query || T('Todos los registros', 'All the records'), v: statsCol(k) }];
  const ser = many ? taxa.map(g => ({ id: g.id, label: g.label, swatch: 'marker' }))
    : [{ id: 'all', label: state.query || T('Todos los registros', 'All the records'), swatch: 'marker' }];
  return {
    name: 'mean_ci', rowH: 215, extraH: 96,
    title: { es: 'Media e intervalo de confianza de cada variable', en: 'Mean and confidence interval of each variable' },
    subtitle: many ? { es: 'un punto por taxón, en las unidades de cada variable', en: 'one point per taxon, in the units of each variable' }
      : { es: 'en las unidades de cada variable', en: 'in the units of each variable' },
    xTitle: '', yTitle: '', legendTitle: many ? { es: 'Taxón', en: 'Taxon' } : '',
    panels: vars.map(k => ({ id: k, title: varTitle(k), yTitle: varAxis(k), layers: [{ t: 'ci', groups: groupsOf(k) }] })),
    series: ser,
  };
}
function specDetHist(k) {
  const v = statsCol(k);
  return {
    name: 'histogram_' + varCode(k), rowH: 300, extraH: 96,
    title: { es: 'Distribución de ' + varCode(k), en: 'Distribution of ' + varCode(k) }, subtitle: varTitle(k),
    xTitle: varAxis(k), yTitle: histYTitle(() => studios.hist),
    panels: [{ id: k, title: '', layers: distLayers(v) }], series: DIST_SERIES,
  };
}
function specDetBox(k) {
  return {
    name: 'boxplot_' + varCode(k), rowH: 270, extraH: 86,
    title: { es: 'Diagrama de caja de ' + varCode(k), en: 'Box plot of ' + varCode(k) }, subtitle: varTitle(k),
    xTitle: '', yTitle: varAxis(k),
    panels: [{ id: k, title: '', layers: [{ t: 'box', groups: [{ id: k, label: varCode(k), v: statsCol(k) }] }] }],
    series: [{ id: k, label: varCode(k), swatch: 'box' }],
  };
}
function specDetViolin(k) {
  return {
    name: 'violin_' + varCode(k), rowH: 270, extraH: 86,
    title: { es: 'Violín de ' + varCode(k), en: 'Violin of ' + varCode(k) }, subtitle: varTitle(k),
    xTitle: '', yTitle: varAxis(k),
    panels: [{ id: k, title: '', layers: [{ t: 'violin', groups: [{ id: k, label: varCode(k), v: statsCol(k) }] }] }],
    series: [{ id: k, label: varCode(k), swatch: 'box' }],
  };
}
function specDetQQ(k) {
  return {
    name: 'qqplot_' + varCode(k), rowH: 300, extraH: 90,
    title: { es: 'Gráfico Q–Q normal de ' + varCode(k), en: 'Normal Q–Q plot of ' + varCode(k) }, subtitle: varTitle(k),
    xTitle: { es: 'Cuantiles teóricos de la normal', en: 'Theoretical normal quantiles' }, yTitle: { es: 'Valores ordenados de la muestra', en: 'Ordered sample values' },
    panels: [{ id: k, title: '', layers: [{ t: 'qq', sid: 'qq', v: statsCol(k) }] }],
    series: [{ id: 'qq', label: varCode(k), swatch: 'marker' }],
  };
}
function specDetEcdf(k) {
  return {
    name: 'ecdf_' + varCode(k), rowH: 290, extraH: 90,
    title: { es: 'Distribución acumulada empírica de ' + varCode(k), en: 'Empirical cumulative distribution of ' + varCode(k) }, subtitle: varTitle(k),
    xTitle: varAxis(k), yTitle: { es: 'Proporción acumulada', en: 'Cumulative proportion' },
    panels: [{ id: k, title: '', layers: [{ t: 'ecdf', groups: [{ id: k, label: varCode(k), v: statsCol(k) }] }] }],
    series: [{ id: k, label: varCode(k), swatch: 'line' }],
  };
}
function specGroupBox(k, groups) {
  return {
    name: 'boxplot_taxa_' + varCode(k), rowH: 320, extraH: 96,
    title: { es: varCode(k) + ' por taxón', en: varCode(k) + ' by taxon' }, subtitle: varTitle(k),
    xTitle: { es: 'Taxón', en: 'Taxon' }, yTitle: varAxis(k),
    panels: [{ id: 'all', title: '', layers: [{ t: 'box', groups }] }],
    series: groups.map(g => ({ id: g.id, label: g.label, swatch: 'box' })),
  };
}
function specGroupDens(k, groups) {
  return {
    name: 'density_taxa_' + varCode(k), rowH: 300, extraH: 96,
    title: { es: 'Densidad de ' + varCode(k) + ' por taxón', en: 'Density of ' + varCode(k) + ' by taxon' }, subtitle: varTitle(k),
    xTitle: varAxis(k), yTitle: { es: 'Densidad', en: 'Density' }, legendTitle: { es: 'Taxón', en: 'Taxon' },
    panels: [{ id: 'all', title: '', layers: [{ t: 'densityG', groups }] }],
    series: groups.map(g => ({ id: g.id, label: g.label, swatch: 'line' })),
  };
}

/* ---------- attaching and updating the studios ---------- */
const studios = {};
function studioFor(boxId, key, kind, spec) {
  if (studios[key]) { studios[key].setSpec(spec); return studios[key]; }
  studios[key] = FS().attach(boxId, { kind, spec, group: GROUP, hooks: { fileName: () => slugName(state.query) + '_' + spec.name } });
  return studios[key];
}

function buildStatsFigures(vars) {
  if (vars) figVars = vars;
  if (!FS() || !figVars.length) return;
  studioFor('figHistGrid', 'histgrid', 'histgrid', specHistGrid(figVars));
  studioFor('figBoxGrid', 'boxgrid', 'boxgrid', specBoxGrid(figVars));
  studioFor('figCiPlot', 'ciplot', 'ciplot', specCiPlot(figVars));
  fillDetailSelect(figVars);
  updateDetailFigs();
}

/* variable selector of the detail figures (labels follow the language) */
let detailVars = [];
function fillDetailSelect(vars) {
  if (vars) detailVars = vars;
  const dv = el('statsDetailVar'), prev = dv.value;
  dv.innerHTML = '';
  detailVars.forEach(k => dv.add(new Option(`${varCode(k)} — ${varName(k)}`, k)));
  if (prev && detailVars.includes(prev)) dv.value = prev;
}
/* The specs carry the variable names of the active language, so the figures are rebuilt when it changes
   (the studio keeps the style and whatever text the user typed). */
document.addEventListener('langchange', () => {
  if (!detailVars.length) return;
  fillDetailSelect();
  if (el('statsResults').style.display === 'block') buildStatsFigures();
});

function updateDetailFigs() {
  const k = el('statsDetailVar').value || detailVars[0];
  if (!k) return;
  studioFor('figDetHist', 'hist', 'hist', specDetHist(k));
  studioFor('figDetBox', 'box', 'box', specDetBox(k));
  studioFor('figDetViolin', 'violin', 'violin', specDetViolin(k));
  studioFor('figDetQQ', 'qq', 'qq', specDetQQ(k));
  studioFor('figDetEcdf', 'ecdf', 'ecdf', specDetEcdf(k));
  const groups = statsByTaxon(k, 3);
  el('figGroupWrap').style.display = groups.length >= 2 ? 'block' : 'none';
  if (groups.length >= 2) {
    studioFor('figGroupBox', 'groupbox', 'groupbox', specGroupBox(k, groups));
    studioFor('figGroupDens', 'groupdens', 'groupdens', specGroupDens(k, groups.filter(g => g.v.length >= 5)));
  }
}
el('statsDetailVar').addEventListener('change', updateDetailFigs);

/* ---------- tables ---------- */

const pv = v => v == null ? '—' : v;
const YN = { yes: { es: 'sí', en: 'yes' }, marginal: { es: 'marginal', en: 'marginal' }, na: '—' };
const TRANSF_NAMES = { none: { es: 'ninguna', en: 'none' }, log: 'log', sqrt: { es: 'raíz cuadrada', en: 'square root' }, boxcox: 'Box-Cox', yeojohnson: 'Yeo-Johnson' };

const DESC_COLS = [
  { key: 'label', label: { es: 'Variable', en: 'Variable' } }, { key: 'n', label: 'n' },
  { key: 'mean', label: { es: 'Media', en: 'Mean' } }, { key: 'sd', label: { es: 'DE', en: 'SD' } }, { key: 'cv', label: 'CV %' },
  { key: 'min', label: { es: 'Mín', en: 'Min' } }, { key: 'q1', label: 'Q1' }, { key: 'median', label: { es: 'Mediana', en: 'Median' } },
  { key: 'q3', label: 'Q3' }, { key: 'max', label: { es: 'Máx', en: 'Max' } },
  { key: 'skew', label: { es: 'Asimetría', en: 'Skewness' } }, { key: 'kurt', label: { es: 'Curtosis', en: 'Kurtosis' } },
];
const NORM_COLS = [
  { key: 'label', label: { es: 'Variable', en: 'Variable' } }, { key: 'n', label: 'n' },
  { key: 'shapiro_p', label: 'Shapiro p' }, { key: 'dagostino_p', label: "D'Agostino p" },
  { key: 'anderson_A2', label: 'A-D A²' }, { key: 'anderson_crit5', label: { es: 'A-D crít. 5%', en: 'A-D crit. 5%' } },
  { key: 'jarque_bera_p', label: 'Jarque-Bera p' }, { key: 'ks_p', label: 'KS p' },
  { key: 'votes', label: { es: 'Votos normal', en: 'Normal votes' } },
  { key: 'verdict', label: { es: 'Veredicto', en: 'Verdict' }, get: r => r.verdict === 'normal' ? { es: 'normal', en: 'normal' } : { es: 'no normal', en: 'not normal' } },
];
const TRANSF_COLS = [
  { key: 'label', label: { es: 'Variable', en: 'Variable' } }, { key: 'skew_orig', label: { es: 'Asim. original', en: 'Original skew.' } },
  { key: 'shapiro_p_orig', label: { es: 'Shapiro p orig.', en: 'Shapiro p orig.' } },
  { key: 'suggested', label: { es: 'Transformación', en: 'Transformation' }, get: r => TRANSF_NAMES[r.suggested] },
  { key: 'shapiro_p_transf', label: { es: 'Shapiro p transf.', en: 'Shapiro p transf.' } },
  { key: 'skew_transf', label: { es: 'Asim. transf.', en: 'Transf. skew.' } },
  { key: 'improves', label: { es: '¿Mejora?', en: 'Improves?' }, get: r => YN[r.improves] },
];


window.buildStatsVarPicker = buildStatsVarPicker;
window.statsFigures = { studios, rebuild: buildStatsFigures, cols: { statsCol, statsColZ, statsByTaxon } };
