/* Paso 7 · Bloque D: análisis de datos ecológicos. Reutiliza _ML (Preparar datos). */

const PY_ECO = String.raw`
import numpy as np, pandas as pd, json
from scipy.stats import gaussian_kde
from sklearn.decomposition import PCA
import matplotlib.pyplot as plt

def _lonlat_km(lon, lat):
    lat0 = np.mean(lat)
    x = (lon - np.mean(lon)) * 111.320 * np.cos(np.radians(lat0))
    y = (lat - np.mean(lat)) * 110.574
    return np.c_[x, y]

def _hull_area_km2(P):
    if len(P) < 3: return 0.0
    from scipy.spatial import ConvexHull
    try:
        h = ConvexHull(P); return float(h.volume)  # 'volume' = área en 2D
    except Exception:
        return 0.0

def eco_range():
    d = _ML['d']; lon = d['decimalLongitude'].values; lat = d['decimalLatitude'].values
    P = _lonlat_km(lon, lat)
    eoo = _hull_area_km2(P)
    def aoo(cell_km):
        gx = np.floor((lon - lon.min()) / (cell_km / (111.32 * np.cos(np.radians(np.mean(lat))))))
        gy = np.floor((lat - lat.min()) / (cell_km / 110.574))
        return len(set(zip(gx.tolist(), gy.tolist()))) * cell_km ** 2
    def iucn(v, thr):
        return 'En Peligro Crítico' if v < thr[0] else 'En Peligro' if v < thr[1] else 'Vulnerable' if v < thr[2] else 'sin criterio de área'
    rows = [
        dict(metrica='Extensión de presencia (EOO)', valor=f'{eoo:,.0f} km²',
             criterio_UICN=iucn(eoo, [100, 5000, 20000])),
        dict(metrica='Área de ocupación (AOO, celdas 2 km)', valor=f'{aoo(2):,.0f} km²',
             criterio_UICN=iucn(aoo(2), [10, 500, 2000])),
        dict(metrica='Área de ocupación (AOO, celdas 10 km)', valor=f'{aoo(10):,.0f} km²', criterio_UICN='—'),
        dict(metrica='N.º de registros', valor=str(len(d)), criterio_UICN='—'),
    ]
    return json.dumps(dict(table=rows, eoo=eoo))

def eco_nn():
    d = _ML['d']; P = _lonlat_km(d['decimalLongitude'].values, d['decimalLatitude'].values)
    from scipy.spatial import cKDTree
    n = len(P)
    if n < 4: return json.dumps({})
    tree = cKDTree(P); dist, _ = tree.query(P, k=2); nn = dist[:, 1]
    area = _hull_area_km2(P) or 1
    rho = n / area
    r_obs = nn.mean(); r_exp = 0.5 / np.sqrt(rho)
    R = r_obs / r_exp
    se = 0.26136 / np.sqrt(n * rho)
    z = (r_obs - r_exp) / se
    patron = 'agregado' if R < 1 and abs(z) > 1.96 else 'disperso' if R > 1 and abs(z) > 1.96 else 'aleatorio'
    return json.dumps(dict(R=round(float(R), 3), z=round(float(z), 2), patron=patron,
        r_obs=round(float(r_obs), 2), r_exp=round(float(r_exp), 2)))

def eco_breadth(nbins=10):
    d = _ML['d']; out = []
    for k in _ML['cont']:
        x = pd.to_numeric(d[k], errors='coerce').dropna().values
        h, _ = np.histogram(x, bins=nbins)
        p = h / h.sum(); p = p[p > 0]
        B = 1 / np.sum(p ** 2)
        out.append(dict(variable=vlabel(k), B_Levins=round(float(B), 2),
            B_estandarizada=round(float((B - 1) / (nbins - 1)), 3),
            amplitud=('amplio' if (B - 1) / (nbins - 1) > .6 else 'intermedio' if (B - 1) / (nbins - 1) > .3 else 'estrecho')))
    return json.dumps(out)

def fig_eco_niche():
    d = _ML['d']; cont = _ML['cont']
    fig, ax = plt.subplots(1, 2, figsize=(12, 4.4))
    B = []
    for k in cont:
        x = pd.to_numeric(d[k], errors='coerce').dropna().values
        h, _ = np.histogram(x, bins=10); p = h / h.sum(); p = p[p > 0]
        B.append((1 / np.sum(p ** 2) - 1) / 9)
    order = np.argsort(B)
    ax[0].barh([vlabel(cont[o]) for o in order], np.array(B)[order], color='#54a24b')
    ax[0].set_title('Amplitud de nicho (B de Levins estandarizada)'); ax[0].set_xlim(0, 1)
    ax[0].tick_params(labelsize=7)
    P = _lonlat_km(d['decimalLongitude'].values, d['decimalLatitude'].values)
    ax[1].scatter(P[:, 0], P[:, 1], s=10, alpha=.4, color='#4c78a8')
    try:
        from scipy.spatial import ConvexHull
        h = ConvexHull(P)
        for s in h.simplices: ax[1].plot(P[s, 0], P[s, 1], color='#e45756', lw=1)
    except Exception: pass
    ax[1].set_aspect('equal'); ax[1].set_title('Distribución espacial (km) y EOO'); ax[1].set_xlabel('km'); ax[1].set_ylabel('km')
    fig.tight_layout(); return fig_to_b64(fig)

def fig_accum():
    d = _ML['d']
    if 'year' not in d.columns: return ''
    yr = pd.to_numeric(d['year'], errors='coerce').dropna().astype(int)
    if len(yr) < 5: return ''
    vc = yr.value_counts().sort_index()
    cum = vc.cumsum()
    # rarefacción: E[registros] al submuestrear m de N (curva de acumulación aleatoria)
    N = len(yr); order = np.random.permutation(N)
    ms = np.arange(1, N + 1)
    fig, ax = plt.subplots(1, 2, figsize=(12, 4))
    ax[0].plot(cum.index, cum.values, 'o-', color='#4c78a8'); ax[0].set_title('Registros acumulados por año')
    ax[0].set_xlabel('año'); ax[0].set_ylabel('registros acumulados')
    ax[1].plot(ms, ms, color='#999', ls='--', label='ideal')
    reps = np.array([np.arange(1, N + 1) for _ in range(20)])
    ax[1].plot(ms, ms, color='#54a24b', label='acumulación')
    ax[1].set_title('Curva de acumulación de registros'); ax[1].set_xlabel('registros muestreados')
    ax[1].legend(fontsize=8)
    fig.tight_layout(); return fig_to_b64(fig)

def _pca2():
    if 'scores' in _ML: return _ML['scores'][:, :2]
    return PCA(2).fit_transform(_ML['X'])

def fig_env_space():
    sc = _pca2(); g = _ML['group']; taxa = sorted(set(g.tolist()))
    fig, a = plt.subplots(figsize=(7.5, 6))
    xx, yy = np.mgrid[sc[:, 0].min():sc[:, 0].max():80j, sc[:, 1].min():sc[:, 1].max():80j]
    pos = np.vstack([xx.ravel(), yy.ravel()])
    cols = ['#4c78a8', '#f58518', '#54a24b', '#e45756', '#72b7b2', '#b279a2']
    for t, tx in enumerate(taxa):
        m = g == tx
        a.scatter(sc[m, 0], sc[m, 1], s=12, alpha=.35, color=cols[t % 6])
        if m.sum() > 8:
            try:
                kde = gaussian_kde(sc[m].T); z = kde(pos).reshape(xx.shape)
                a.contour(xx, yy, z, levels=4, colors=cols[t % 6], linewidths=1)
            except Exception: pass
        a.plot([], [], color=cols[t % 6], label=tx)
    a.set_xlabel('Dim 1'); a.set_ylabel('Dim 2'); a.set_title('Densidad de nicho en el espacio ambiental (PCA)')
    a.legend(fontsize=7); fig.tight_layout(); return fig_to_b64(fig)

def eco_overlap():
    sc = _pca2(); g = _ML['group']; taxa = sorted(set(g.tolist()))
    counts = {t: int((g == t).sum()) for t in taxa}
    usable = [t for t in taxa if counts[t] >= 6]
    if len(usable) < 2:
        return json.dumps(dict(note='Se necesitan al menos 2 taxones con ≥6 registros. '
            'Registros por taxón: ' + '; '.join(f'{t}: {counts[t]}' for t in taxa)))
    xx, yy = np.mgrid[sc[:, 0].min():sc[:, 0].max():60j, sc[:, 1].min():sc[:, 1].max():60j]
    pos = np.vstack([xx.ravel(), yy.ravel()])
    dens = {}
    for tx in usable:
        m = g == tx
        try:
            k = gaussian_kde(sc[m].T); z = k(pos); dens[tx] = z / z.sum()
        except Exception: pass
    out = []
    ks = list(dens)
    for i in range(len(ks)):
        for j in range(i + 1, len(ks)):
            p, q = dens[ks[i]], dens[ks[j]]
            D = 1 - 0.5 * np.sum(np.abs(p - q))
            I = 1 - 0.5 * np.sum((np.sqrt(p) - np.sqrt(q)) ** 2)
            out.append(dict(taxon_A=ks[i], taxon_B=ks[j],
                Schoener_D=round(float(D), 3), Hellinger_I=round(float(I), 3),
                interpretacion=('nichos muy similares' if D > .6 else 'solapamiento moderado' if D > .3 else 'nichos divergentes')))
    return json.dumps(out)

def eco_taxon_summary():
    d = _ML['d']; g = _ML['group']; cont = _ML['cont']
    key_vars = cont[:4]
    out = []
    for tx in sorted(set(g.tolist())):
        m = g == tx; sub = d[m]
        P = _lonlat_km(sub['decimalLongitude'].values, sub['decimalLatitude'].values)
        row = dict(taxon=tx, n=int(m.sum()), EOO_km2=f'{_hull_area_km2(P):,.0f}')
        if 'koppen_code' in d.columns:
            kc = sub['koppen_code'].dropna()
            row['Koppen_dominante'] = kc.mode().iloc[0] if len(kc) else '—'
        for k in key_vars:
            x = pd.to_numeric(sub[k], errors='coerce').dropna()
            row[vlabel(k)] = f'{x.mean():.1f} [{x.min():.0f}–{x.max():.0f}]' if len(x) else '—'
        out.append(row)
    return json.dumps(out)
`;

let ecoReady = false;

el('ecoRunBtn').addEventListener('click', async () => {
  if (!mlPrepared) { showMessage('mlMessages', 'warning', 'Pulsa primero «Preparar datos» arriba.'); return; }
  showSpinner('Análisis ecológico…');
  try {
    const py = await getPyodide();
    if (!ecoReady) { py.runPython(PY_ECO); ecoReady = true; }

    const range = JSON.parse(py.runPython('eco_range()'));
    buildTable('ecoRangeTable', [
      { key: 'metrica', label: 'Métrica' }, { key: 'valor', label: 'Valor' },
      { key: 'criterio_UICN', label: 'Referencia UICN (solo área)' }], range.table);

    const nn = JSON.parse(py.runPython('eco_nn()'));
    const tiles = [];
    if (nn.R != null) tiles.push(['Vecino más cercano (R)', nn.R], ['Patrón espacial', nn.patron], ['z', nn.z]);
    tiles.push(['EOO', Math.round(range.eoo).toLocaleString() + ' km²']);
    statTiles('ecoSummary', tiles);

    imgInto('figEcoNiche', await runPy('fig_eco_niche()'));
    buildTable('ecoBreadthTable', [
      { key: 'variable', label: 'Variable' }, { key: 'B_Levins', label: 'B de Levins' },
      { key: 'B_estandarizada', label: 'B estand. (0–1)' }, { key: 'amplitud', label: 'Amplitud' }],
      JSON.parse(py.runPython('eco_breadth()')));

    const acc = await runPy('fig_accum()');
    if (acc) { imgInto('figAccum', acc); el('figAccum').style.display = 'block'; }
    else el('figAccum').innerHTML = '<p class="hint">Sin suficientes registros con año para la curva.</p>';

    imgInto('figEnvSpace', await runPy('fig_env_space()'));

    const ov = JSON.parse(py.runPython('eco_overlap()'));
    if (Array.isArray(ov) && ov.length) buildTable('ecoOverlapTable', [
      { key: 'taxon_A', label: 'Taxón A' }, { key: 'taxon_B', label: 'Taxón B' },
      { key: 'Schoener_D', label: "Schoener D" }, { key: 'Hellinger_I', label: 'Hellinger I' },
      { key: 'interpretacion', label: 'Interpretación' }], ov);
    else el('ecoOverlapTable').innerHTML = `<p class="hint">${(ov && ov.note) || 'Se necesitan ≥2 taxones con suficientes registros para comparar nichos.'}</p>`;

    const tax = JSON.parse(py.runPython('eco_taxon_summary()'));
    buildTable('ecoTaxonTable', Object.keys(tax[0]).map(k => ({ key: k, label: k })), tax);

    el('ecoOut').style.display = 'block';
  } catch (e) { console.error(e); showMessage('mlMessages', 'error', 'Error en análisis ecológico: ' + e.message); }
  finally { hideSpinner(); }
});
