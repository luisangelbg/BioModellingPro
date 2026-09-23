/* Lazy loading of Pyodide (Python in the browser) and the JS <-> Python bridge.
   Used by steps 6, 7 and 8. Needs an internet connection the first time only for the interpreter itself.

   Conventions shared by every Python block:
   - Always call Python through runPy(code) (never py.runPython directly): it first synchronises the
     interface language and colour theme, so tr() and the figure style are always current.
   - Python returns language-neutral codes (or {es, en} pairs); JavaScript decides how to show them.
   - Figures come back as PNG data URIs. showFig(boxId, pyExpr) draws one and registers it in Views,
     so it is redrawn automatically when the user switches language or theme. */

const PYODIDE_VERSION = 'v0.27.2';
let _pyPromise = null;

async function getPyodide() {
  if (_pyPromise) return _pyPromise;
  _pyPromise = (async () => {
    showSpinner(T('Cargando el motor de Python. La primera vez tarda ~30–60 s…', 'Loading the Python engine. The first time takes ~30–60 s…'));
    try {
      if (!window.loadPyodide)
        await loadScript(`https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/pyodide.js`);
      setSpinner(T('Iniciando intérprete de Python…', 'Starting the Python interpreter…'));
      const pyodide = await loadPyodide({
        indexURL: `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/`,
      });
      setSpinner(T('Cargando las bibliotecas científicas…', 'Loading the scientific libraries…'));
      await pyodide.loadPackage(['numpy', 'pandas', 'scipy', 'scikit-learn', 'matplotlib']);
      setSpinner(T('Preparando entorno…', 'Preparing the environment…'));
      pyodide.runPython(PY_SETUP);
      window.__pyodide = pyodide;
      return pyodide;
    } catch (e) {
      _pyPromise = null;   // allow a retry after a network failure
      throw e;
    } finally {
      hideSpinner();
    }
  })();
  return _pyPromise;
}

/* Push language + theme + palette to Python (cheap; done before every call). */
function syncPyUI(py) {
  const pal = ['--c1', '--c2', '--c3', '--c4', '--c5', '--c6', '--c7', '--c8', '--c9', '--c10'].map(v => cssVar(v));
  const ui = {
    lang: I18N.lang, theme: Theme.current(), pal,
    bg: cssVar('--card-bg', '#ffffff'), text: cssVar('--text', '#14261d'), muted: cssVar('--text-muted', '#5b7266'),
    border: cssVar('--border-strong', '#bccfc5'), primary: cssVar('--primary', '#1f7a4d'), accent: cssVar('--accent', '#cf6a24'),
  };
  py.globals.set('_ui_json', JSON.stringify(ui));
  py.runPython('set_ui(_ui_json)');
}

/* Runs Python code (async allowed) and returns the result converted to plain JS. */
async function runPy(code, globals) {
  const py = await getPyodide();
  syncPyUI(py);
  if (globals) for (const [k, v] of Object.entries(globals)) py.globals.set(k, v);
  const res = await py.runPythonAsync(code);
  if (res && res.toJs) {
    const js = res.toJs({ dict_converter: Object.fromEntries });
    res.destroy();
    return js;
  }
  return res;
}
/* Same, for functions that return a JSON string. */
async function runPyJSON(code, globals) { return JSON.parse(await runPy(code, globals)); }

/* Puts a PNG data URI into a box. */
function imgInto(id, dataUri) {
  const box = el(id);
  box.innerHTML = dataUri
    ? `<img src="${dataUri}" alt="" style="max-width:100%;height:auto">`
    : `<p class="hint">${L2('Sin figura.', 'No figure.')}</p>`;
}

/* Draws a Python figure into a box and keeps it in sync with language and theme.
   `pyExpr` is a string or a function returning one (evaluated at every redraw). */
async function showFig(boxId, pyExpr, opts = {}) {
  const draw = async () => {
    const expr = typeof pyExpr === 'function' ? pyExpr() : pyExpr;
    const uri = await runPy(expr);
    imgInto(boxId, uri);
    if (opts.wrap) el(opts.wrap).style.display = uri ? 'block' : 'none';
    return uri;
  };
  return Views.reg(boxId, draw);
}

/* Base code, loaded once: headless backend, translation, theme and figure helpers, data helpers. */
const PY_SETUP = String.raw`
import io, base64, json
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('AGG')
import matplotlib.pyplot as plt
from cycler import cycler

_STATE = {}
_UI = {'lang': 'es', 'theme': 'light',
       'pal': ['#1f7a4d', '#cf6a24', '#2a78b5', '#e0ac2b', '#7a5cc4', '#c4506e', '#3aa39a', '#8a6a4a', '#5f6b86', '#5aa03b'],
       'bg': '#ffffff', 'text': '#14261d', 'muted': '#5b7266', 'border': '#bccfc5', 'primary': '#1f7a4d', 'accent': '#cf6a24'}
PAL = list(_UI['pal'])

def tr(es, en):
    """Text in the active interface language."""
    return en if _UI['lang'] == 'en' else es

def set_ui(ui_json):
    """Receives language, theme and palette from the page and restyles matplotlib."""
    global PAL
    _UI.update(json.loads(ui_json))
    PAL = list(_UI['pal'])
    plt.rcParams.update({
        'figure.dpi': 110, 'savefig.dpi': 110, 'font.size': 9, 'axes.titlesize': 10,
        'figure.facecolor': _UI['bg'], 'axes.facecolor': _UI['bg'], 'savefig.facecolor': _UI['bg'],
        'text.color': _UI['text'], 'axes.labelcolor': _UI['text'], 'axes.edgecolor': _UI['border'],
        'xtick.color': _UI['muted'], 'ytick.color': _UI['muted'],
        'grid.color': _UI['border'], 'grid.alpha': .45, 'axes.grid': True,
        'axes.spines.top': False, 'axes.spines.right': False,
        'legend.facecolor': _UI['bg'], 'legend.edgecolor': _UI['border'], 'legend.labelcolor': _UI['text'],
        'axes.prop_cycle': cycler(color=PAL),
    })

set_ui(json.dumps(_UI))

def fig_to_b64(fig):
    buf = io.BytesIO()
    fig.savefig(buf, format='png', bbox_inches='tight')
    plt.close(fig)
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()

def load_df(json_str, var_keys, group_key='taxon'):
    rows = json.loads(json_str)
    df = pd.DataFrame(rows)
    vk = [k for k in var_keys if k in df.columns]
    for k in vk:
        df[k] = pd.to_numeric(df[k], errors='coerce')
    _STATE['df'] = df
    _STATE['vars'] = vk
    _STATE['group'] = group_key if group_key in df.columns else None
    return json.dumps({'n': len(df), 'vars': vk,
        'groups': sorted(df[group_key].dropna().astype(str).unique().tolist()) if group_key in df.columns else []})

def set_var_labels(mapping_json):
    _STATE['vlab'] = json.loads(mapping_json)

def vlabel(k):
    """Short language-neutral label of a variable (BIO1, BIO12, ELEV ...)."""
    return _STATE.get('vlab', {}).get(k, k)
`;

Object.assign(window, { getPyodide, runPy, runPyJSON, imgInto, showFig, syncPyUI });
