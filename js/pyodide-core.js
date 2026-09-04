/* Carga perezosa de Pyodide (Python en el navegador) y utilidades de puente.
   Se usa en los bloques C y D. Requiere abrir la app con servidor.ps1 + internet. */

const PYODIDE_VERSION = 'v0.27.2';
let _pyPromise = null;

async function getPyodide() {
  if (_pyPromise) return _pyPromise;
  _pyPromise = (async () => {
    showSpinner('Cargando Python (Pyodide). La primera vez tarda ~30–60 s…');
    try {
      if (!window.loadPyodide)
        await loadScript(`https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/pyodide.js`);
      setSpinner('Iniciando intérprete de Python…');
      const pyodide = await loadPyodide({
        indexURL: `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/`,
      });
      setSpinner('Cargando NumPy, pandas, SciPy, scikit-learn, matplotlib…');
      await pyodide.loadPackage(['numpy', 'pandas', 'scipy', 'scikit-learn', 'matplotlib']);
      setSpinner('Preparando entorno…');
      pyodide.runPython(PY_SETUP);
      window.__pyodide = pyodide;
      return pyodide;
    } finally {
      hideSpinner();
    }
  })();
  return _pyPromise;
}

/* Ejecuta código Python async y devuelve el resultado convertido a JS puro. */
async function runPy(code, globals) {
  const py = await getPyodide();
  if (globals) for (const [k, v] of Object.entries(globals)) py.globals.set(k, v);
  const res = await py.runPythonAsync(code);
  if (res && res.toJs) {
    const js = res.toJs({ dict_converter: Object.fromEntries });
    res.destroy();
    return js;
  }
  return res;
}

/* Código base cargado una sola vez: backend sin ventana, helpers de figura y de datos. */
const PY_SETUP = `
import io, base64, json
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('AGG')
import matplotlib.pyplot as plt
plt.rcParams.update({'figure.dpi': 110, 'savefig.dpi': 110, 'font.size': 9,
    'axes.titlesize': 10, 'axes.grid': True, 'grid.alpha': .25,
    'axes.spines.top': False, 'axes.spines.right': False})

_STATE = {}

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
    return _STATE.get('vlab', {}).get(k, k)
`;

window.getPyodide = getPyodide;
window.runPy = runPy;
