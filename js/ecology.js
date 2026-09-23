/* Step 8: ecological data analysis. Reuses _ML (Prepare data). Computation runs in Python (Pyodide);
   Python returns numbers and language-neutral codes, the tables below turn them into {es, en} labels. */

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
        h = ConvexHull(P); return float(h.volume)  # in 2-D 'volume' is the area
    except Exception:
        return 0.0

def _cell_ids(lon, lat, cell_km):
    """Index of the grid cell (cell_km x cell_km) holding each record."""
    gx = np.floor((lon - lon.min()) / (cell_km / (111.32 * np.cos(np.radians(np.mean(lat))))))
    gy = np.floor((lat - lat.min()) / (cell_km / 110.574))
    return gx, gy

def _levins(x, nbins=10):
    """Levins' B and its standardised form (0-1) from a histogram of nbins classes."""
    h, _ = np.histogram(x, bins=nbins)
    p = h / h.sum(); p = p[p > 0]
    B = 1 / np.sum(p ** 2)
    return float(B), float((B - 1) / (nbins - 1))

def eco_range():
    d = _ML['d']; lon = d['decimalLongitude'].values; lat = d['decimalLatitude'].values
    P = _lonlat_km(lon, lat)
    eoo = _hull_area_km2(P)
    def aoo(cell_km):
        gx, gy = _cell_ids(lon, lat, cell_km)
        return len(set(zip(gx.tolist(), gy.tolist()))) * cell_km ** 2
    def cat(v, thr):
        # red-list area thresholds: CR critically endangered, EN endangered, VU vulnerable
        return 'CR' if v < thr[0] else 'EN' if v < thr[1] else 'VU' if v < thr[2] else 'none'
    a2, a10 = aoo(2), aoo(10)
    rows = [
        dict(metric='eoo', value=round(eoo, 1), category=cat(eoo, [100, 5000, 20000])),
        dict(metric='aoo2', value=a2, category=cat(a2, [10, 500, 2000])),
        dict(metric='aoo10', value=a10, category=None),
        dict(metric='n', value=int(len(d)), category=None),
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
    pattern = 'clustered' if R < 1 and abs(z) > 1.96 else 'dispersed' if R > 1 and abs(z) > 1.96 else 'random'
    return json.dumps(dict(R=round(float(R), 3), z=round(float(z), 2), pattern=pattern,
        r_obs=round(float(r_obs), 2), r_exp=round(float(r_exp), 2)))

def eco_breadth(nbins=10):
    d = _ML['d']; out = []
    for k in _ML['cont']:
        x = pd.to_numeric(d[k], errors='coerce').dropna().values
        B, Bs = _levins(x, nbins)
        out.append(dict(variable=k, levins=round(B, 2), levins_std=round(Bs, 3),
            breadth=('wide' if Bs > .6 else 'intermediate' if Bs > .3 else 'narrow')))
    return json.dumps(out)

def fig_eco_niche():
    d = _ML['d']; cont = _ML['cont']
    fig, ax = plt.subplots(1, 2, figsize=(12, 4.4))
    B = []
    for k in cont:
        x = pd.to_numeric(d[k], errors='coerce').dropna().values
        B.append(_levins(x)[1])
    order = np.argsort(B)
    ax[0].barh([mlab(cont[o]) for o in order], np.array(B)[order], color=PAL[0])
    ax[0].set_title(tr("Amplitud de nicho (B de Levins estandarizada)", "Niche breadth (standardised Levins' B)")); ax[0].set_xlim(0, 1)
    ax[0].tick_params(labelsize=7)
    P = _lonlat_km(d['decimalLongitude'].values, d['decimalLatitude'].values)
    ax[1].scatter(P[:, 0], P[:, 1], s=10, alpha=.4, color=PAL[2])
    try:
        from scipy.spatial import ConvexHull
        h = ConvexHull(P)
        for s in h.simplices: ax[1].plot(P[s, 0], P[s, 1], color=PAL[5], lw=1)
    except Exception: pass
    ax[1].set_aspect('equal'); ax[1].set_title(tr('Distribución espacial (km) y EOO', 'Spatial distribution (km) and EOO'))
    ax[1].set_xlabel('km'); ax[1].set_ylabel('km')
    fig.tight_layout(); return fig_to_b64(fig)

def fig_accum():
    d = _ML['d']
    if 'year' not in d.columns: return ''
    yr = pd.to_numeric(d['year'], errors='coerce').dropna().astype(int)
    if len(yr) < 5: return ''
    vc = yr.value_counts().sort_index()
    cum = vc.cumsum()
    # accumulation of occupied 10 km cells as records are added in random order (mean of 20 permutations)
    lon = d['decimalLongitude'].values; lat = d['decimalLatitude'].values
    gx, gy = _cell_ids(lon, lat, 10)
    cid = np.unique(gx * 1000003 + gy, return_inverse=True)[1]
    N = len(cid); rng = np.random.default_rng(0)
    ms = np.arange(1, N + 1); acc = np.zeros(N); reps = 20
    for _ in range(reps):
        seq = cid[rng.permutation(N)]
        first = np.zeros(N); first[np.unique(seq, return_index=True)[1]] = 1
        acc += np.cumsum(first)
    acc /= reps
    fig, ax = plt.subplots(1, 2, figsize=(12, 4))
    ax[0].plot(cum.index, cum.values, 'o-', color=PAL[2]); ax[0].set_title(tr('Registros acumulados por año', 'Cumulative records by year'))
    ax[0].set_xlabel(tr('año', 'year')); ax[0].set_ylabel(tr('registros acumulados', 'cumulative records'))
    ax[1].plot(ms, ms, color=_UI['muted'], ls='--', label=tr('ideal (una celda nueva por registro)', 'ideal (a new cell per record)'))
    ax[1].plot(ms, acc, color=PAL[0], label=tr('acumulación', 'accumulation'))
    ax[1].set_title(tr('Curva de acumulación de celdas ocupadas (10 km)', 'Accumulation curve of occupied cells (10 km)'))
    ax[1].set_xlabel(tr('registros muestreados', 'records sampled')); ax[1].set_ylabel(tr('celdas de 10 km ocupadas', 'occupied 10 km cells'))
    ax[1].legend(fontsize=8)
    fig.tight_layout(); return fig_to_b64(fig)

def _pca2():
    if 'scores' in _ML: return _ML['scores'][:, :2]
    return PCA(2, random_state=0).fit_transform(_ML['X'])

def fig_env_space():
    sc = _pca2(); g = _ML['group']; taxa = sorted(set(g.tolist()))
    fig, a = plt.subplots(figsize=(7.5, 6))
    xx, yy = np.mgrid[sc[:, 0].min():sc[:, 0].max():80j, sc[:, 1].min():sc[:, 1].max():80j]
    pos = np.vstack([xx.ravel(), yy.ravel()])
    for t, tx in enumerate(taxa):
        m = g == tx; col = PAL[t % len(PAL)]
        a.scatter(sc[m, 0], sc[m, 1], s=12, alpha=.35, color=col)
        if m.sum() > 8:
            try:
                kde = gaussian_kde(sc[m].T); z = kde(pos).reshape(xx.shape)
                a.contour(xx, yy, z, levels=4, colors=[col], linewidths=1)
            except Exception: pass
        a.plot([], [], color=col, label=tx)
    a.set_xlabel('Dim 1'); a.set_ylabel('Dim 2')
    a.set_title(tr('Densidad de nicho en el espacio ambiental (PCA)', 'Niche density in environmental space (PCA)'))
    a.legend(fontsize=7); fig.tight_layout(); return fig_to_b64(fig)

def eco_overlap():
    sc = _pca2(); g = _ML['group']; taxa = sorted(set(g.tolist()))
    counts = {t: int((g == t).sum()) for t in taxa}
    usable = [t for t in taxa if counts[t] >= 6]
    if len(usable) < 2:
        return json.dumps(dict(insufficient=True, counts=[dict(taxon=t, n=counts[t]) for t in taxa]))
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
            out.append(dict(taxon_a=ks[i], taxon_b=ks[j],
                schoener_d=round(float(D), 3), hellinger_i=round(float(I), 3),
                overlap=('similar' if D > .6 else 'moderate' if D > .3 else 'divergent')))
    return json.dumps(dict(insufficient=False, rows=out))

def _max_linear_extent(P):
    """Largest distance between two records (km). Only the hull vertices can hold the maximum."""
    if len(P) < 2: return 0.0
    Q = P
    if len(P) > 3:
        try:
            from scipy.spatial import ConvexHull
            Q = P[ConvexHull(P).vertices]
        except Exception:
            Q = P
    from scipy.spatial.distance import pdist
    if len(Q) < 2: return 0.0
    return float(pdist(Q).max())

def eco_aoo_grain(grains=(1, 2, 4, 10)):
    """Area of occupancy at several grid sizes, plus the area-grain curve and the range extent."""
    d = _ML['d']; lon = d['decimalLongitude'].values; lat = d['decimalLatitude'].values
    P = _lonlat_km(lon, lat)
    rows = []
    for g in grains:
        gx, gy = _cell_ids(lon, lat, g)
        cells = len(set(zip(gx.tolist(), gy.tolist())))
        rows.append(dict(grain=g, cells=int(cells), area=float(cells * g ** 2)))
    curve = []
    for g in [0.5, 1, 2, 4, 8, 10, 20, 50, 100]:
        gx, gy = _cell_ids(lon, lat, g)
        cells = len(set(zip(gx.tolist(), gy.tolist())))
        curve.append(dict(grain=float(g), area=float(cells * g ** 2), cells=int(cells)))
    _ML['aoo_curve'] = curve
    return json.dumps(dict(rows=rows, curve=curve, extent=_max_linear_extent(P),
        eoo=_hull_area_km2(P), n=int(len(d))))

def fig_aoo_grain():
    curve = _ML.get('aoo_curve')
    if not curve: return ''
    g = np.array([c['grain'] for c in curve]); a = np.array([c['area'] for c in curve])
    fig, ax = plt.subplots(figsize=(7.2, 4.2))
    ax.plot(g, a, 'o-', color=PAL[0])
    ax.set_xscale('log'); ax.set_yscale('log')
    ax.set_xlabel(tr('lado de la celda (km)', 'cell side (km)'))
    ax.set_ylabel(tr('área de ocupación (km²)', 'area of occupancy (km²)'))
    ax.set_title(tr('Curva área-grano: el AOO depende del tamaño de celda',
                    'Area-grain curve: the AOO depends on the cell size'))
    for c in curve:
        if c['grain'] in (2, 10):
            ax.annotate(f"{c['grain']:.0f} km", (c['grain'], c['area']), textcoords='offset points',
                        xytext=(6, -10), fontsize=8, color=_UI['muted'])
    fig.tight_layout(); return fig_to_b64(fig)

def eco_elev():
    """Statistics of the elevation of the records, when the variable was extracted."""
    d = _ML['d']
    if 'elev' not in d.columns: return json.dumps(dict(available=False))
    x = pd.to_numeric(d['elev'], errors='coerce').dropna().values
    if len(x) < 5: return json.dumps(dict(available=False))
    return json.dumps(dict(available=True, n=int(len(x)), min=float(np.min(x)), p5=float(np.percentile(x, 5)),
        mean=float(np.mean(x)), median=float(np.median(x)), p95=float(np.percentile(x, 95)),
        max=float(np.max(x)), sd=float(np.std(x, ddof=1))))

def fig_elev_hist():
    d = _ML['d']
    if 'elev' not in d.columns: return ''
    x = pd.to_numeric(d['elev'], errors='coerce').dropna().values
    if len(x) < 5: return ''
    fig, ax = plt.subplots(figsize=(7.2, 4.0))
    ax.hist(x, bins=min(40, max(8, int(np.sqrt(len(x))))), color=PAL[0], alpha=.78, edgecolor=_UI['bg'])
    for q, lab, col in ((np.percentile(x, 5), tr('percentil 5', '5th percentile'), PAL[2]),
                        (np.mean(x), tr('media', 'mean'), PAL[1]),
                        (np.percentile(x, 95), tr('percentil 95', '95th percentile'), PAL[2])):
        ax.axvline(q, color=col, ls='--', lw=1.4, label=f'{lab}: {q:.0f} m')
    ax.set_xlabel(tr('altitud (m)', 'elevation (m)')); ax.set_ylabel(tr('registros', 'records'))
    ax.set_title(tr('Altitud de los registros', 'Elevation of the records'))
    ax.legend(fontsize=8)
    fig.tight_layout(); return fig_to_b64(fig)

def _hull_uniform(P, n, rng):
    """n uniform points inside the convex hull of P, by rejection inside its bounding box."""
    from scipy.spatial import ConvexHull, Delaunay
    h = ConvexHull(P); V = P[h.vertices]; tri = Delaunay(V)
    lo = V.min(0); hi = V.max(0)
    out = np.empty((0, 2))
    while len(out) < n:
        cand = rng.uniform(lo, hi, size=(max(n * 3, 64), 2))
        keep = cand[tri.find_simplex(cand) >= 0]
        out = np.vstack([out, keep])
    return out[:n]

def eco_ripley(nsim=99, nmax=500, npts=26):
    """Ripley's L with a complete-spatial-randomness envelope from nsim simulations inside the hull.
       The same uncorrected estimator is used for the observed and the simulated patterns, so the
       edge effect cancels in the comparison. Large sets are subsampled to nmax records."""
    from scipy.spatial.distance import pdist
    d = _ML['d']; P = _lonlat_km(d['decimalLongitude'].values, d['decimalLatitude'].values)
    n_all = len(P)
    if n_all < 12: return json.dumps(dict(available=False, n=int(n_all)))
    rng = np.random.default_rng(7)
    P = P if n_all <= nmax else P[rng.choice(n_all, nmax, replace=False)]
    n = len(P)
    try:
        area = _hull_area_km2(P)
        if area <= 0: return json.dumps(dict(available=False, n=int(n)))
        dd = np.sort(pdist(P))
        rmax = float(dd.max()) / 4.0
        r = np.linspace(rmax / npts, rmax, npts)
        def Lof(sorted_d):
            cnt = np.searchsorted(sorted_d, r, side='right') * 2.0        # ordered pairs
            K = area * cnt / (n * (n - 1))
            return np.sqrt(K / np.pi)
        L_obs = Lof(dd)
        sims = np.empty((nsim, npts))
        for s in range(nsim):
            Q = _hull_uniform(P, n, rng)
            sims[s] = Lof(np.sort(pdist(Q)))
        lo = np.percentile(sims, 2.5, axis=0); hi = np.percentile(sims, 97.5, axis=0)
        above = int(np.sum(L_obs > hi)); below = int(np.sum(L_obs < lo))
        pattern = 'clustered' if above > npts * 0.3 else 'dispersed' if below > npts * 0.3 else 'random'
        _ML['ripley'] = dict(r=r, L=L_obs, lo=lo, hi=hi, mean=sims.mean(0), n=n, nsim=nsim)
        return json.dumps(dict(available=True, n=int(n), n_all=int(n_all), nsim=int(nsim),
            pattern=pattern, above=above, below=below, npts=int(npts),
            rmax=float(rmax), subsampled=bool(n_all > nmax)))
    except Exception as e:
        return json.dumps(dict(available=False, n=int(n), error=str(e)))

def fig_ripley():
    R = _ML.get('ripley')
    if not R: return ''
    fig, ax = plt.subplots(figsize=(7.2, 4.4))
    ax.fill_between(R['r'], R['lo'] - R['r'], R['hi'] - R['r'], color=_UI['muted'], alpha=.22,
                    label=tr(f"envolvente del 95 % ({R['nsim']} simulaciones)", f"95 % envelope ({R['nsim']} simulations)"))
    ax.plot(R['r'], R['mean'] - R['r'], color=_UI['muted'], ls='--', lw=1.2,
            label=tr('media de las simulaciones', 'mean of the simulations'))
    ax.axhline(0, color=_UI['border'], lw=1)
    ax.plot(R['r'], R['L'] - R['r'], color=PAL[0], lw=2.2, label=tr('patrón observado', 'observed pattern'))
    ax.set_xlabel(tr('distancia r (km)', 'distance r (km)'))
    ax.set_ylabel(tr('L(r) − r', 'L(r) − r'))
    ax.set_title(tr('Función L de Ripley frente a aleatoriedad espacial completa',
                    'Ripley\'s L function against complete spatial randomness'))
    ax.legend(fontsize=8)
    fig.tight_layout(); return fig_to_b64(fig)

def eco_taxon_metrics():
    """Range, spatial pattern and niche metrics of every taxon, side by side."""
    from scipy.spatial import cKDTree
    d = _ML['d']; g = _ML['group']; cont = _ML['cont']
    has_elev = 'elev' in d.columns
    rows = []
    for tx in sorted(set(g.tolist())):
        m = g == tx; sub = d[m]
        lon = sub['decimalLongitude'].values; lat = sub['decimalLatitude'].values
        P = _lonlat_km(lon, lat); n = int(m.sum())
        row = dict(taxon=tx, n=n, eoo=round(_hull_area_km2(P), 1), extent=round(_max_linear_extent(P), 1),
                   aoo2=None, R=None, pattern=None, breadth=None, breadth_class=None, elev=None)
        gx, gy = _cell_ids(lon, lat, 2)
        row['aoo2'] = int(len(set(zip(gx.tolist(), gy.tolist())))) * 4
        if n >= 4:
            area = _hull_area_km2(P)
            if area > 0:
                tree = cKDTree(P); dist, _ = tree.query(P, k=2); nn = dist[:, 1]
                rho = n / area
                r_obs = float(nn.mean()); r_exp = 0.5 / np.sqrt(rho)
                Rv = r_obs / r_exp
                se = 0.26136 / np.sqrt(n * rho)
                z = (r_obs - r_exp) / se if se > 0 else 0.0
                row['R'] = round(float(Rv), 3)
                row['pattern'] = 'clustered' if Rv < 1 and abs(z) > 1.96 else 'dispersed' if Rv > 1 and abs(z) > 1.96 else 'random'
        bs = []
        for k in cont:
            x = pd.to_numeric(sub[k], errors='coerce').dropna().values
            if len(x) >= 8: bs.append(_levins(x)[1])
        if bs:
            b = float(np.mean(bs))
            row['breadth'] = round(b, 3)
            row['breadth_class'] = 'wide' if b > .6 else 'intermediate' if b > .3 else 'narrow'
        if has_elev:
            e = pd.to_numeric(sub['elev'], errors='coerce').dropna().values
            if len(e): row['elev'] = f'{np.median(e):.0f} [{np.min(e):.0f}–{np.max(e):.0f}]'
        rows.append(row)
    return json.dumps(dict(rows=rows, has_elev=has_elev))

def eco_taxon_summary():
    d = _ML['d']; g = _ML['group']; cont = _ML['cont']
    key_vars = cont[:4]
    has_k = 'koppen_code' in d.columns
    rows = []
    for tx in sorted(set(g.tolist())):
        m = g == tx; sub = d[m]
        P = _lonlat_km(sub['decimalLongitude'].values, sub['decimalLatitude'].values)
        row = dict(taxon=tx, n=int(m.sum()), eoo=round(_hull_area_km2(P), 1), koppen=None, vals={})
        if has_k:
            kc = sub['koppen_code'].dropna()
            row['koppen'] = str(kc.mode().iloc[0]) if len(kc) else None
        for k in key_vars:
            x = pd.to_numeric(sub[k], errors='coerce').dropna()
            row['vals'][k] = f'{x.mean():.1f} [{x.min():.0f}–{x.max():.0f}]' if len(x) else None
        rows.append(row)
    return json.dumps(dict(vars=key_vars, has_koppen=has_k, rows=rows))
`;

let ecoReady = false;

/* ---- codes to labels ---- */
const ECO_METRIC = {
  eoo: { es: 'Extensión de presencia (EOO)', en: 'Extent of occurrence (EOO)' },
  aoo2: { es: 'Área de ocupación (AOO, celdas de 2 km)', en: 'Area of occupancy (AOO, 2 km cells)' },
  aoo10: { es: 'Área de ocupación (AOO, celdas de 10 km)', en: 'Area of occupancy (AOO, 10 km cells)' },
  n: { es: 'N.º de registros', en: 'Number of records' },
};
const ECO_CATEGORY = {
  CR: { es: 'En Peligro Crítico', en: 'Critically Endangered' },
  EN: { es: 'En Peligro', en: 'Endangered' },
  VU: { es: 'Vulnerable', en: 'Vulnerable' },
  none: { es: 'sin criterio de área', en: 'no area criterion' },
};
const ECO_PATTERN = {
  clustered: { es: 'agregado', en: 'clustered' },
  dispersed: { es: 'disperso', en: 'dispersed' },
  random: { es: 'aleatorio', en: 'random' },
};
const ECO_BREADTH = {
  wide: { es: 'amplio', en: 'wide' },
  intermediate: { es: 'intermedio', en: 'intermediate' },
  narrow: { es: 'estrecho', en: 'narrow' },
};
const ECO_OVERLAP = {
  similar: { es: 'nichos muy similares', en: 'very similar niches' },
  moderate: { es: 'solapamiento moderado', en: 'moderate overlap' },
  divergent: { es: 'nichos divergentes', en: 'divergent niches' },
};

const ECO_RANGE_COLS = [
  { key: 'metric', label: { es: 'Métrica', en: 'Metric' }, get: r => ECO_METRIC[r.metric] },
  { key: 'value', label: { es: 'Valor', en: 'Value' }, get: r => r.metric === 'n' ? fmtInt(r.value) : fmtInt(r.value) + ' km²' },
  { key: 'category', label: { es: 'Referencia de la lista roja (solo área)', en: 'Red-list reference (area only)' },
    get: r => r.category ? ECO_CATEGORY[r.category] : '—' },
];
const ECO_BREADTH_COLS = [
  { key: 'variable', label: { es: 'Variable', en: 'Variable' }, get: r => mlVarCode2(r.variable) },
  { key: 'levins', label: { es: 'B de Levins', en: "Levins' B" } },
  { key: 'levins_std', label: { es: 'B estand. (0–1)', en: 'Std. B (0–1)' } },
  { key: 'breadth', label: { es: 'Amplitud', en: 'Breadth' }, get: r => ECO_BREADTH[r.breadth] },
];
const ECO_AOO_COLS = [
  { key: 'grain', label: { es: 'Lado de la celda', en: 'Cell side' }, get: r => `${r.grain} km` },
  { key: 'cells', label: { es: 'Celdas ocupadas', en: 'Occupied cells' }, get: r => fmtInt(r.cells) },
  { key: 'area', label: { es: 'Área de ocupación', en: 'Area of occupancy' }, get: r => fmtInt(r.area) + ' km²' },
  { key: 'note', label: { es: 'Nota', en: 'Note' },
    get: r => r.grain === 2 ? { es: 'tamaño de las listas rojas', en: 'red-list cell size' } : '—' },
];
const ECO_ELEV_COLS = [
  { key: 'stat', label: { es: 'Estadístico', en: 'Statistic' }, get: r => r.lab },
  { key: 'value', label: { es: 'Altitud', en: 'Elevation' }, get: r => r.fmt },
];
const ECO_TAXON_METRIC_COLS = hasElev => [
  { key: 'taxon', label: { es: 'Taxón', en: 'Taxon' } },
  { key: 'n', label: 'n', get: r => fmtInt(r.n) },
  { key: 'eoo', label: 'EOO (km²)', get: r => fmtInt(r.eoo) },
  { key: 'aoo2', label: { es: 'AOO 2 km (km²)', en: 'AOO 2 km (km²)' }, get: r => fmtInt(r.aoo2) },
  { key: 'extent', label: { es: 'Extensión lineal máx. (km)', en: 'Max linear extent (km)' }, get: r => fmtInt(r.extent) },
  { key: 'R', label: { es: 'Vecino más cercano (R)', en: 'Nearest neighbour (R)' }, get: r => r.R == null ? '—' : fmt(r.R, 3) },
  { key: 'pattern', label: { es: 'Patrón espacial', en: 'Spatial pattern' }, get: r => r.pattern ? ECO_PATTERN[r.pattern] : '—' },
  { key: 'breadth', label: { es: 'Amplitud de nicho (0–1)', en: 'Niche breadth (0–1)' }, get: r => r.breadth == null ? '—' : fmt(r.breadth, 3) },
  { key: 'breadth_class', label: { es: 'Amplitud', en: 'Breadth' }, get: r => r.breadth_class ? ECO_BREADTH[r.breadth_class] : '—' },
  ...(hasElev ? [{ key: 'elev', label: { es: 'Altitud mediana [mín–máx]', en: 'Median elevation [min–max]' }, get: r => r.elev || '—' }] : []),
];
const ECO_OVERLAP_COLS = [
  { key: 'taxon_a', label: { es: 'Taxón A', en: 'Taxon A' } }, { key: 'taxon_b', label: { es: 'Taxón B', en: 'Taxon B' } },
  { key: 'schoener_d', label: 'Schoener D' }, { key: 'hellinger_i', label: 'Hellinger I' },
  { key: 'overlap', label: { es: 'Interpretación', en: 'Interpretation' }, get: r => ECO_OVERLAP[r.overlap] },
];

/* ---- extra blocks: area of occupancy by grain, elevation, Ripley's L and the per-taxon table.
   They are created here (not in the page) so this module owns them completely. ---- */
const ECO_EXTRA_FIGS = ['figAooGrain', 'figElevHist', 'figRipley'];

function ecoEnsureExtra() {
  if (el('ecoAooTable')) return;
  el('ecoRangeTable').insertAdjacentHTML('afterend', `
    <h3><span data-l="es">El área de ocupación depende del tamaño de celda</span><span data-l="en">The area of occupancy depends on the cell size</span></h3>
    <p class="hint"><span data-l="es">La misma distribución ocupa más o menos «área» según la malla con que se mida: por eso los criterios de área piden un tamaño fijo (2 km de lado). La curva área-grano muestra ese efecto y la extensión lineal máxima resume cuán separados están los registros más distantes.</span><span data-l="en">The same distribution occupies more or less "area" depending on the grid it is measured with: that is why the area criteria ask for a fixed cell size (2 km side). The area-grain curve shows that effect, and the maximum linear extent summarises how far apart the most distant records are.</span></p>
    <div class="results-summary" id="ecoExtentTiles"></div>
    <div class="table-scroll" id="ecoAooTable"></div>
    <div id="figAooGrain" class="fig-box"></div>
    <div id="ecoElevBlock" style="display:none">
      <h3><span data-l="es">Altitud de los registros</span><span data-l="en">Elevation of the records</span></h3>
      <div class="table-scroll" id="ecoElevTable"></div>
      <div id="figElevHist" class="fig-box"></div>
    </div>`);
  el('ecoBreadthTable').insertAdjacentHTML('afterend', `
    <h3><span data-l="es">Función L de Ripley (agregación a varias escalas)</span><span data-l="en">Ripley's L function (aggregation at several scales)</span></h3>
    <p class="hint"><span data-l="es">El vecino más cercano resume el patrón a una sola escala; la función L lo examina a todas. Por encima de la envolvente los registros están <b>agregados</b> a esa distancia, por debajo <b>más separados</b> de lo que cabría esperar, y dentro son indistinguibles del azar. La envolvente se obtiene simulando patrones aleatorios dentro del casco convexo de los propios registros.</span><span data-l="en">The nearest neighbour summarises the pattern at one scale only; the L function examines it at every scale. Above the envelope the records are <b>aggregated</b> at that distance, below it <b>more spread out</b> than expected, and inside it they are indistinguishable from randomness. The envelope comes from simulating random patterns inside the convex hull of the records themselves.</span></p>
    <div id="ecoRipleyNote" class="messages"></div>
    <div id="figRipley" class="fig-box"></div>`);
  el('ecoTaxonTable').insertAdjacentHTML('afterend', `
    <h3><span data-l="es">Área, patrón espacial y nicho de cada taxón</span><span data-l="en">Range, spatial pattern and niche of every taxon</span></h3>
    <p class="hint"><span data-l="es">Las métricas de arriba, reunidas taxón por taxón. La amplitud de nicho es el promedio de la B de Levins estandarizada de las variables continuas.</span><span data-l="en">The metrics above, gathered taxon by taxon. The niche breadth is the mean standardised Levins' B across the continuous variables.</span></p>
    <div class="table-scroll" id="ecoTaxonMetricsTable"></div>`);
}

/* the results depend on the prepared data: forget them when the data are prepared again */
document.addEventListener('mlreset', () => {
  ['figEcoNiche', 'figAccum', 'figEnvSpace', ...ECO_EXTRA_FIGS].forEach(id => {
    Views.drop(id);
    const box = el(id);
    if (box) box.innerHTML = '';
  });
  el('ecoOut').style.display = 'none';
});

el('ecoRunBtn').addEventListener('click', async () => {
  if (!mlPrepared) {
    showMessage('mlMessages', 'warning', L2('Pulsa primero «Preparar datos» arriba.', 'First press "Prepare data" above.')); return;
  }
  showSpinner(T('Análisis ecológico…', 'Ecological analysis…'));
  try {
    const py = await getPyodide();
    if (!ecoReady) { py.runPython(PY_ECO); ecoReady = true; }

    ecoEnsureExtra();

    const range = await runPyJSON('eco_range()');
    buildTable('ecoRangeTable', ECO_RANGE_COLS, range.table);

    /* area of occupancy at several grains, area-grain curve and maximum linear extent */
    setSpinner(T('Área de ocupación por escala…', 'Area of occupancy by scale…'));
    const aoo = await runPyJSON('eco_aoo_grain()');
    statTiles('ecoExtentTiles', [
      [{ es: 'Extensión lineal máxima', en: 'Maximum linear extent' }, fmtInt(aoo.extent) + ' km'],
      [{ es: 'AOO con celdas de 2 km', en: 'AOO with 2 km cells' }, fmtInt(aoo.rows[1].area) + ' km²'],
      [{ es: 'AOO con celdas de 10 km', en: 'AOO with 10 km cells' }, fmtInt(aoo.rows[3].area) + ' km²'],
      [{ es: 'EOO (casco convexo)', en: 'EOO (convex hull)' }, fmtInt(aoo.eoo) + ' km²'],
    ]);
    buildTable('ecoAooTable', ECO_AOO_COLS, aoo.rows);
    await showFig('figAooGrain', 'fig_aoo_grain()');

    const nn = await runPyJSON('eco_nn()');
    const tiles = [];
    if (nn.R != null) tiles.push([{ es: 'Vecino más cercano (R)', en: 'Nearest neighbour (R)' }, fmt(nn.R, 3)],
      [{ es: 'Patrón espacial', en: 'Spatial pattern' }, ECO_PATTERN[nn.pattern]], ['z', fmt(nn.z, 2)]);
    tiles.push(['EOO', fmtInt(range.eoo) + ' km²']);
    statTiles('ecoSummary', tiles);

    /* elevation of the records, when step 5 extracted it */
    const ev = await runPyJSON('eco_elev()');
    if (ev.available) {
      buildTable('ecoElevTable', ECO_ELEV_COLS, [
        { lab: { es: 'Registros con altitud', en: 'Records with elevation' }, fmt: fmtInt(ev.n) },
        { lab: { es: 'Mínima', en: 'Minimum' }, fmt: fmtInt(ev.min) + ' m' },
        { lab: { es: 'Percentil 5', en: '5th percentile' }, fmt: fmtInt(ev.p5) + ' m' },
        { lab: { es: 'Media', en: 'Mean' }, fmt: fmtInt(ev.mean) + ' m' },
        { lab: { es: 'Mediana', en: 'Median' }, fmt: fmtInt(ev.median) + ' m' },
        { lab: { es: 'Percentil 95', en: '95th percentile' }, fmt: fmtInt(ev.p95) + ' m' },
        { lab: { es: 'Máxima', en: 'Maximum' }, fmt: fmtInt(ev.max) + ' m' },
        { lab: { es: 'Desviación estándar', en: 'Standard deviation' }, fmt: fmtInt(ev.sd) + ' m' },
      ]);
      el('ecoElevBlock').style.display = 'block';
      await showFig('figElevHist', 'fig_elev_hist()');
    } else {
      el('ecoElevBlock').style.display = 'none';
      Views.drop('figElevHist');
    }

    await showFig('figEcoNiche', 'fig_eco_niche()');
    buildTable('ecoBreadthTable', ECO_BREADTH_COLS, await runPyJSON('eco_breadth()'));

    /* Ripley's L with a complete-spatial-randomness envelope */
    setSpinner(T('Función L de Ripley (99 simulaciones)…', "Ripley's L function (99 simulations)…"));
    const rip = await runPyJSON('eco_ripley()');
    if (rip.available) {
      const sub = rip.subsampled
        ? L2(` Se usó una submuestra aleatoria de ${rip.n} de los ${fmtInt(rip.n_all)} registros para que el cálculo sea rápido.`,
          ` A random subsample of ${rip.n} of the ${fmtInt(rip.n_all)} records was used to keep the computation fast.`)
        : '';
      el('ecoRipleyNote').innerHTML = `<div class="msg msg-${rip.pattern === 'random' ? 'info' : 'success'}">` + L2(
        `Con <b>${rip.nsim} simulaciones</b> de aleatoriedad espacial completa dentro del casco convexo, el patrón es <b>${ECO_PATTERN[rip.pattern].es}</b>: la curva observada sale por encima de la envolvente en ${rip.above} de las ${rip.npts} distancias examinadas y por debajo en ${rip.below}. Se examinaron distancias de hasta ${fmtInt(rip.rmax)} km.${sub} Se usa el mismo estimador sin corrección de borde en el patrón observado y en las simulaciones, de modo que el efecto de borde se cancela al compararlos.`,
        `With <b>${rip.nsim} simulations</b> of complete spatial randomness inside the convex hull, the pattern is <b>${ECO_PATTERN[rip.pattern].en}</b>: the observed curve lies above the envelope at ${rip.above} of the ${rip.npts} distances examined and below it at ${rip.below}. Distances of up to ${fmtInt(rip.rmax)} km were examined.${sub} The same estimator, without edge correction, is used for the observed pattern and for the simulations, so the edge effect cancels when they are compared.`) + '</div>';
      await showFig('figRipley', 'fig_ripley()');
    } else {
      el('ecoRipleyNote').innerHTML = `<div class="msg msg-info">${L2(
        `Se necesitan al menos 12 registros con coordenadas para la función L (hay ${rip.n}).`,
        `At least 12 records with coordinates are needed for the L function (there are ${rip.n}).`)}</div>`;
      Views.drop('figRipley');
      el('figRipley').innerHTML = '';
    }

    /* record accumulation: a note replaces the figure when there are not enough records with a year */
    await Views.reg('figAccum', async () => {
      const uri = await runPy('fig_accum()');
      if (uri) imgInto('figAccum', uri);
      else el('figAccum').innerHTML = `<p class="hint">${L2('Sin suficientes registros con año para la curva.', 'Not enough records with a year for the curve.')}</p>`;
    });

    await showFig('figEnvSpace', 'fig_env_space()');

    const ov = await runPyJSON('eco_overlap()');
    if (ov.insufficient) {
      const list = esc(ov.counts.map(c => `${c.taxon}: ${c.n}`).join('; '));
      el('ecoOverlapTable').innerHTML = `<p class="hint">${L2(
        `Se necesitan al menos 2 taxones con ≥6 registros. Registros por taxón: ${list}`,
        `At least 2 taxa with ≥6 records are needed. Records per taxon: ${list}`)}</p>`;
    } else if (ov.rows.length) buildTable('ecoOverlapTable', ECO_OVERLAP_COLS, ov.rows);
    else el('ecoOverlapTable').innerHTML = `<p class="hint">${L2(
      'Se necesitan ≥2 taxones con suficientes registros para comparar nichos.',
      'At least 2 taxa with enough records are needed to compare niches.')}</p>`;

    const tax = await runPyJSON('eco_taxon_summary()');
    buildTable('ecoTaxonTable', [
      { key: 'taxon', label: { es: 'Taxón', en: 'Taxon' } }, { key: 'n', label: 'n' },
      { key: 'eoo', label: 'EOO (km²)', get: r => fmtInt(r.eoo) },
      ...(tax.has_koppen ? [{ key: 'koppen', label: { es: 'Köppen dominante', en: 'Dominant Köppen' } }] : []),
      ...tax.vars.map(k => ({ key: k, label: mlVarCode2(k), get: r => r.vals[k] })),
    ], tax.rows);

    /* range, spatial pattern and niche of every taxon, side by side */
    const tm = await runPyJSON('eco_taxon_metrics()');
    buildTable('ecoTaxonMetricsTable', ECO_TAXON_METRIC_COLS(tm.has_elev), tm.rows);

    el('ecoOut').style.display = 'block';
  } catch (e) {
    console.error(e);
    showMessage('mlMessages', 'error', L2('Error en el análisis ecológico: ', 'Ecological analysis error: ') + esc(e.message));
  } finally { hideSpinner(); }
});
