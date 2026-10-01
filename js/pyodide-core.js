/* Lazy loading of Pyodide (Python in the browser) and the JS <-> Python bridge.
   Used by steps 6, 7 and 8. The interpreter and its libraries ship inside the app, in vendor/pyodide/,
   and are used when the app is served by server.ps1, so it works offline. If that copy is missing or
   fails to load, the online copy is used instead.

   Conventions shared by every Python block:
   - Always call Python through runPy(code) (never py.runPython directly): it first synchronises the
     interface language and colour theme, so tr() and the figure style are always current.
   - Python returns language-neutral codes (or {es, en} pairs); JavaScript decides how to show them.
   - Figures come back as PNG data URIs. showFig(boxId, pyExpr) draws one and registers it in Views,
     so it is redrawn automatically when the user switches language or theme. */

const PYODIDE_VERSION = 'v0.27.2';
const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/`;
const PYODIDE_LOCAL = 'vendor/pyodide/';
let _pyPromise = null;

/* The local copy only works over http(s): browsers block reading it from file://. */
async function _localPyodideBase() {
  if (!/^https?:$/.test(location.protocol)) return null;
  const base = new URL(PYODIDE_LOCAL, location.href).href;
  try {
    const r = await fetch(base + 'pyodide-lock.json');
    return r.ok ? base : null;
  } catch (e) { return null; }
}

/* Starts the interpreter and the base libraries from one location. */
async function _bootPyodide(base) {
  if (!window.loadPyodide) await loadScript(base + 'pyodide.js');
  setSpinner(T('Iniciando intérprete de Python…', 'Starting the Python interpreter…'));
  const pyodide = await loadPyodide({ indexURL: base });
  setSpinner(T('Cargando las bibliotecas científicas…', 'Loading the scientific libraries…'));
  await pyodide.loadPackage(['numpy', 'pandas', 'scipy', 'scikit-learn', 'matplotlib']);
  return pyodide;
}

/* Local copy first; the online copy if that fails. */
async function _startPyodide() {
  const local = await _localPyodideBase();
  if (local) {
    try { return await _bootPyodide(local); }
    catch (e) {
      console.warn('Local Python copy failed; using the online copy.', e);
      delete window.loadPyodide;
    }
  }
  return _bootPyodide(PYODIDE_CDN);
}

async function getPyodide() {
  if (_pyPromise) return _pyPromise;
  _pyPromise = (async () => {
    showSpinner(T('Preparando el motor de Python…', 'Preparing the Python engine…'), 4);
    try {
      const pyodide = await _startPyodide();
      setSpinner(T('Preparando entorno…', 'Preparing the environment…'));
      await _paint();
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
/* With a waiting window open, let the browser paint it before Python takes over the page;
   otherwise its text and bar do not update. */
function _paint() { return window.LABG && spinnerCount ? LABG.nextPaint() : Promise.resolve(); }

async function runPy(code, globals) {
  const py = await getPyodide();
  await _paint();
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
_UI_LIGHT = dict(_UI)   # the light look, for exports on a white or transparent background

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
    fmt, kw = 'png', {}
    if _XP:
        # export from the LABG figure studio: other output measures, the same drawing
        fmt = _XP.get('fmt') or 'png'
        _xp_fit(fig)
        if _XP.get('dpi'): kw['dpi'] = int(_XP['dpi'])
        if _XP.get('transparent'): kw['transparent'] = True
    buf = io.BytesIO()
    fig.savefig(buf, format=fmt, bbox_inches='tight', **kw)
    plt.close(fig)
    mime = {'png': 'image/png', 'svg': 'image/svg+xml', 'pdf': 'application/pdf'}.get(fmt, 'image/png')
    return 'data:' + mime + ';base64,' + base64.b64encode(buf.getvalue()).decode()

# ---------- export at a given size (LABG figure studio) ----------
# The studio runs again the very call that drew a figure, with other output measures:
# width and height in inches, resolution, file format and a transparent background.
# Nothing is computed differently: only the paper size, the dpi and the file type change.
import ast, warnings
_XP = {}

def _xp_relayout(fig):
    try:
        eng = fig.get_layout_engine()
    except Exception:
        eng = None
    if eng is not None and 'Constrained' in type(eng).__name__:
        return
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('ignore')
            fig.tight_layout()
    except Exception:
        pass

def _xp_fit(fig):
    """Brings the figure to the requested width (and height), measured on the tight crop it is
    saved with; the text keeps its size in points."""
    W = _XP.get('w'); H = _XP.get('h')
    if not W:
        return
    W = float(W); H = float(H) if H else None
    try:
        pad = float(plt.rcParams.get('savefig.pad_inches', 0.1))
    except Exception:
        pad = 0.1
    w0, h0 = fig.get_size_inches()
    fig.set_size_inches(W, H if H else W * h0 / w0)
    _xp_relayout(fig)
    for _ in range(4):
        fig.canvas.draw()
        bb = fig.get_tightbbox(fig.canvas.get_renderer())
        tw, th = bb.width + 2 * pad, bb.height + 2 * pad
        if abs(tw - W) <= W * 0.004 and (H is None or abs(th - H) <= H * 0.004):
            break
        fw, fh = fig.get_size_inches()
        sx = W / tw
        sy = (H / th) if H else sx
        fig.set_size_inches(max(0.8, fw * sx), max(0.6, fh * sy))
        _xp_relayout(fig)

def _xp_begin(o_json):
    _XP.clear()
    _XP.update(json.loads(o_json) if o_json else {})
    # a white or transparent background asks for the light look even if the page is dark
    if _XP.get('light') and _UI.get('theme') == 'dark':
        _XP['_restore'] = json.dumps(_UI)
        set_ui(json.dumps(dict(_UI_LIGHT, lang=_UI.get('lang', 'es'))))

def _xp_end():
    r = _XP.get('_restore')
    _XP.clear()
    if r:
        set_ui(r)

def _xp_run(o_json, code):
    """Runs the call that drew a figure with the studio's output measures."""
    _xp_begin(o_json)
    try:
        tree = ast.parse(code, mode='exec')
        last = None
        if tree.body and isinstance(tree.body[-1], ast.Expr):
            last = ast.Expression(tree.body.pop().value)
        g = globals()
        if tree.body:
            exec(compile(tree, '<studio>', 'exec'), g)
        return eval(compile(last, '<studio>', 'eval'), g) if last is not None else None
    finally:
        _xp_end()

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
