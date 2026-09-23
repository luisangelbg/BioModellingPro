/* Step 8: PCA, clustering and correspondence analysis. Computation runs in Python (Pyodide).
   Python returns language-neutral numbers and codes; every text the user reads is produced here in
   JavaScript ({es, en} labels) or, for figure text only, through tr() inside the figure functions.
   Figures are drawn with showFig so they are redrawn when the language or the theme changes. */

const PY_ML = String.raw`
import numpy as np, pandas as pd, json
from scipy.cluster import hierarchy
from scipy.spatial.distance import pdist, squareform
from sklearn.decomposition import PCA
from sklearn.cluster import KMeans, DBSCAN
from sklearn.mixture import GaussianMixture
from sklearn.neighbors import NearestNeighbors
from sklearn.metrics import silhouette_samples, silhouette_score
import matplotlib.pyplot as plt
from matplotlib.patches import Ellipse

_ML = {}
# results that depend on the prepared data: cleared every time the data are prepared again
_ML_RESULTS = ('scores', 'labels', 'pca', 'load', 'contrib', 'cos2', 'fuzzyU', 'tend', 'opt', 'run', 'ca')
_CATNAME = {'taxon': ('Taxón', 'Taxon'), 'koppen_code': ('Clima de Köppen', 'Köppen climate'),
            'soil_wrb': ('Tipo de suelo (WRB)', 'Soil type (WRB)'), 'country': ('País', 'Country'),
            'taxonRank': ('Rango taxonómico', 'Taxonomic rank')}

def set_ml_labels(mapping_json):
    """Short variable labels (BIO1 ... ELEV) for this module; refreshed when the language changes."""
    _ML['vlab'] = json.loads(mapping_json)

def mlab(k):
    return _ML.get('vlab', {}).get(k, k)

def catname(k):
    e = _CATNAME.get(k)
    return tr(e[0], e[1]) if e else k

def _zero_lines(a):
    a.axhline(0, color=_UI['border'], lw=.8); a.axvline(0, color=_UI['border'], lw=.8)

def _cbar(fig, mappable, ax):
    cb = fig.colorbar(mappable, ax=ax, shrink=.7)
    cb.outline.set_edgecolor(_UI['border']); cb.ax.tick_params(colors=_UI['muted'])
    return cb

def _cname(c):
    return tr('ruido', 'noise') if c == -1 else tr(f'grupo {c+1}', f'cluster {c+1}')

def ml_prepare(json_str, cont_json, cat_json, standardize, group_key='taxon'):
    df = pd.DataFrame(json.loads(json_str))
    cont = [c for c in json.loads(cont_json) if c in df.columns]
    cat = [c for c in json.loads(cat_json) if c in df.columns]
    for k in cont: df[k] = pd.to_numeric(df[k], errors='coerce')
    d = df.dropna(subset=cont).reset_index(drop=True)
    if len(d) == 0:
        return json.dumps(dict(n=0, p=len(cont), dropped=int(len(df)), cont=cont, cat=cat, groups=[]))
    X = d[cont].values.astype(float)
    mu, sd = X.mean(0), X.std(0, ddof=0); sd[sd == 0] = 1
    Xs = (X - mu) / sd if standardize else (X - mu)
    _ML.update(d=d, X=Xs, cont=cont, cat=cat, std=bool(standardize))
    _ML['group'] = d[group_key].astype(str).values if group_key in d.columns else np.array(['sp'] * len(d))
    _ML['coords'] = d[['decimalLongitude', 'decimalLatitude']].values if 'decimalLatitude' in d.columns else None
    for key in _ML_RESULTS: _ML.pop(key, None)
    return json.dumps(dict(n=int(len(d)), p=len(cont), dropped=int(len(df) - len(d)),
        cont=cont, cat=cat, groups=sorted(set(_ML['group'].tolist()))))

# ---------- PCA ----------
def ml_pca():
    X, cont = _ML['X'], _ML['cont']
    pca = PCA().fit(X); sc = pca.transform(X)
    _ML['pca'] = pca; _ML['scores'] = sc
    eig = pca.explained_variance_; var = pca.explained_variance_ratio_ * 100
    load = (pca.components_.T * np.sqrt(pca.explained_variance_))
    contrib = (pca.components_ ** 2 * 100).T
    cos2 = load ** 2
    _ML['load'] = load; _ML['contrib'] = contrib; _ML['cos2'] = cos2
    nd = len(eig); cum = np.cumsum(var)
    tbl = [dict(dim=i + 1, eigenvalue=round(float(eig[i]), 3), variance=round(float(var[i]), 2),
               cumulative=round(float(cum[i]), 2)) for i in range(nd)]
    desc = []
    for k in range(min(4, nd)):
        for i in np.argsort(-np.abs(load[:, k]))[:6]:
            desc.append(dict(dim=k + 1, variable=cont[i],
                correlation=round(float(load[i, k]), 3), contribution=round(float(contrib[i, k]), 1),
                cos2=round(float(cos2[i, k]), 3)))
    return json.dumps(dict(table=tbl, desc=desc, kaiser=int(np.sum(eig > 1)),
        n80=int(np.argmax(cum >= 80) + 1) if cum.max() >= 80 else nd, ndim=nd,
        var=[round(float(v), 2) for v in var]))

def fig_scree():
    var = _ML['pca'].explained_variance_ratio_ * 100
    k = min(len(var), 15)
    fig, a = plt.subplots(figsize=(7, 3.6))
    a.bar(range(1, k + 1), var[:k], color=PAL[2], alpha=.8)
    a.plot(range(1, k + 1), var[:k], 'o-', color=PAL[1])
    for i, v in enumerate(var[:k]): a.text(i + 1, v + .6, f'{v:.1f}%', ha='center', fontsize=7, color=_UI['text'])
    a.axhline(100 / len(var), color=_UI['muted'], ls='--', lw=.8, label=tr('umbral 1/p', 'threshold 1/p'))
    a.set_xlabel(tr('Dimensión', 'Dimension')); a.set_ylabel(tr('% de varianza', '% of variance'))
    a.set_title(tr('Gráfico de sedimentación', 'Scree plot'))
    a.legend(fontsize=8); fig.tight_layout(); return fig_to_b64(fig)

def _axes(code):
    return (int(code[0]) - 1, int(code[1]) - 1)

def fig_var_circle(color='cos2', axes='12'):
    i, j = _axes(axes); cont = _ML['cont']
    load, cos2, contrib = _ML['load'], _ML['cos2'], _ML['contrib']
    val = cos2[:, [i, j]].sum(1) if color == 'cos2' else contrib[:, [i, j]].sum(1)
    var = _ML['pca'].explained_variance_ratio_ * 100
    fig, a = plt.subplots(figsize=(6.2, 6))
    th = np.linspace(0, 2 * np.pi, 100)
    a.plot(np.cos(th), np.sin(th), color=_UI['muted'], lw=1)
    _zero_lines(a)
    sm = plt.cm.ScalarMappable(cmap='viridis', norm=plt.Normalize(val.min(), val.max()))
    for t, k in enumerate(cont):
        c = sm.to_rgba(val[t])
        a.arrow(0, 0, load[t, i], load[t, j], color=c, head_width=.03, length_includes_head=True)
        a.text(load[t, i] * 1.12, load[t, j] * 1.12, mlab(k), color=c, fontsize=8, ha='center')
    a.set_xlim(-1.15, 1.15); a.set_ylim(-1.15, 1.15); a.set_aspect('equal')
    a.set_xlabel(f'Dim {i+1} ({var[i]:.1f}%)'); a.set_ylabel(f'Dim {j+1} ({var[j]:.1f}%)')
    what = tr('calidad (cos²)', 'quality (cos²)') if color == 'cos2' else tr('contribución', 'contribution')
    a.set_title(tr('Círculo de correlación · color = ', 'Correlation circle · colour = ') + what)
    _cbar(fig, sm, a); fig.tight_layout(); return fig_to_b64(fig)

def _conf_ellipse(x, y, ax, color, nstd=2.0):
    if len(x) < 3: return
    cov = np.cov(x, y); ev, evec = np.linalg.eigh(cov)
    ang = np.degrees(np.arctan2(*evec[:, 1][::-1]))
    w, h = 2 * nstd * np.sqrt(np.maximum(ev, 1e-12))
    e = Ellipse((np.mean(x), np.mean(y)), w, h, angle=ang, facecolor=color, alpha=.12, edgecolor=color, lw=1.2)
    ax.add_patch(e)

def fig_individuals(color='taxon', axes='12'):
    i, j = _axes(axes); sc = _ML['scores']; g = _ML['group']
    var = _ML['pca'].explained_variance_ratio_ * 100
    fig, a = plt.subplots(figsize=(7, 5.6))
    if color == 'taxon':
        for t, gg in enumerate(sorted(set(g.tolist()))):
            m = g == gg; col = PAL[t % len(PAL)]
            a.scatter(sc[m, i], sc[m, j], s=16, color=col, alpha=.7, label=gg, edgecolor=_UI['bg'], linewidth=.2)
            _conf_ellipse(sc[m, i], sc[m, j], a, col)
        a.legend(fontsize=7)
    else:
        hb = a.hexbin(sc[:, i], sc[:, j], gridsize=28, cmap='viridis', mincnt=1)
        a.grid(False); _cbar(fig, hb, a)
    _zero_lines(a)
    a.set_xlabel(f'Dim {i+1} ({var[i]:.1f}%)'); a.set_ylabel(f'Dim {j+1} ({var[j]:.1f}%)')
    a.set_title(tr('Mapa de individuos', 'Individuals map')); fig.tight_layout(); return fig_to_b64(fig)

def fig_biplot(axes='12'):
    i, j = _axes(axes); sc = _ML['scores']; load = _ML['load']; cont = _ML['cont']; g = _ML['group']
    var = _ML['pca'].explained_variance_ratio_ * 100
    sf = 0.8 * np.abs(sc[:, [i, j]]).max() / np.abs(load[:, [i, j]]).max()
    fig, a = plt.subplots(figsize=(7.5, 6))
    for t, gg in enumerate(sorted(set(g.tolist()))):
        m = g == gg
        a.scatter(sc[m, i], sc[m, j], s=12, color=PAL[t % len(PAL)], alpha=.5, label=gg)
    for t, k in enumerate(cont):
        a.arrow(0, 0, load[t, i] * sf, load[t, j] * sf, color=_UI['text'], head_width=sf * .03, length_includes_head=True)
        a.text(load[t, i] * sf * 1.1, load[t, j] * sf * 1.1, mlab(k), fontsize=7, color=_UI['accent'])
    _zero_lines(a)
    a.set_xlabel(f'Dim {i+1} ({var[i]:.1f}%)'); a.set_ylabel(f'Dim {j+1} ({var[j]:.1f}%)')
    a.set_title(tr('Biplot (individuos + variables)', 'Biplot (individuals + variables)'))
    a.legend(fontsize=7); fig.tight_layout(); return fig_to_b64(fig)

def fig_contrib():
    cont = _ML['cont']; contrib = _ML['contrib']; cos2 = _ML['cos2']
    fig, ax = plt.subplots(1, 3, figsize=(13, 4))
    for d in range(2):
        order = np.argsort(-contrib[:, d])
        ax[d].barh([mlab(cont[o]) for o in order][::-1], contrib[order, d][::-1], color=PAL[2])
        ax[d].axvline(100 / len(cont), color=PAL[5], ls='--', lw=1)
        ax[d].set_title(tr(f'Contribución a Dim {d+1} (%)', f'Contribution to Dim {d+1} (%)')); ax[d].tick_params(labelsize=7)
    nc = min(5, cos2.shape[1])
    im = ax[2].imshow(cos2[:, :nc], cmap='YlOrRd', aspect='auto'); ax[2].grid(False)
    ax[2].set_yticks(range(len(cont))); ax[2].set_yticklabels([mlab(c) for c in cont], fontsize=7)
    ax[2].set_xticks(range(nc)); ax[2].set_xticklabels([f'Dim{i+1}' for i in range(nc)], fontsize=7)
    ax[2].set_title(tr('cos² (calidad de representación)', 'cos² (quality of representation)')); _cbar(fig, im, ax[2])
    fig.tight_layout(); return fig_to_b64(fig)

def ml_pca_scores_csv():
    sc = _ML['scores']; d = _ML['d']
    cols = {'gbif_key': d['key'] if 'key' in d.columns else range(len(d)), 'taxon': _ML['group']}
    for k in range(min(6, sc.shape[1])): cols[f'Dim{k+1}'] = sc[:, k].round(4)
    return pd.DataFrame(cols).to_csv(index=False)

# ---------- clustering ----------
def _cdata(use_pca, nd):
    if use_pca and 'scores' in _ML: return _ML['scores'][:, :nd]
    return _ML['X']

def _hopkins(X, m=None):
    n, d = X.shape; m = m or max(5, min(150, n // 4)); m = min(m, n)
    nb = NearestNeighbors(n_neighbors=2).fit(X)
    idx = np.random.choice(n, m, replace=False)
    uj = nb.kneighbors(X[idx], return_distance=True)[0][:, 1]
    rand = np.random.uniform(X.min(0), X.max(0), (m, d))
    wj = nb.kneighbors(rand, n_neighbors=1, return_distance=True)[0][:, 0]
    s = np.sum(wj) + np.sum(uj)
    return float(np.sum(wj) / s) if s > 0 else 0.5

def _vat_order(D):
    # Prim-like ordering of the dissimilarity matrix, O(n^2): dmin holds, for every object,
    # its smallest distance to the objects already placed.
    n = D.shape[0]
    first = int(np.unravel_index(np.argmax(D), D.shape)[0])
    order = [first]; used = np.zeros(n, dtype=bool); used[first] = True
    dmin = D[first].copy()
    for _ in range(n - 1):
        j = int(np.argmin(np.where(used, np.inf, dmin)))
        order.append(j); used[j] = True
        dmin = np.minimum(dmin, D[j])
    return np.array(order)

def cl_tendency(use_pca, nd):
    X = _cdata(use_pca, nd)
    H = _hopkins(X)
    dist = pdist(X); D = squareform(dist)
    o = _vat_order(D)
    _ML['tend'] = dict(H=H, dist=dist, vat=D[np.ix_(o, o)])
    return json.dumps(dict(hopkins=round(H, 3)))

def fig_tendency():
    t = _ML['tend']; H = t['H']
    fig, ax = plt.subplots(1, 2, figsize=(11, 4.4))
    ax[0].hist(t['dist'], bins=40, color=PAL[6]); ax[0].set_title(tr('Distribución de distancias', 'Distance distribution'))
    im = ax[1].imshow(t['vat'], cmap='viridis')
    ax[1].set_title(tr('VAT (imagen de disimilitud ordenada)', 'VAT (ordered dissimilarity image)'))
    ax[1].set_xticks([]); ax[1].set_yticks([]); ax[1].grid(False); _cbar(fig, im, ax[1])
    verdict = (tr('(muy agrupable)', '(highly clusterable)') if H > .75
               else tr('(agrupable)', '(clusterable)') if H > .6 else tr('(cercano a aleatorio)', '(close to random)'))
    fig.suptitle(tr('Estadístico de Hopkins = ', 'Hopkins statistic = ') + f'{H:.3f}  ' + verdict)
    fig.tight_layout(); return fig_to_b64(fig)

def _gap(X, ks, B=8):
    mins, maxs = X.min(0), X.max(0); lw = []; lws = []; sk = []
    for k in ks:
        w = KMeans(k, n_init=5, random_state=0).fit(X).inertia_
        lw.append(np.log(w))
        refs = [np.log(KMeans(k, n_init=3, random_state=b).fit(
            np.random.uniform(mins, maxs, X.shape)).inertia_) for b in range(B)]
        lws.append(np.mean(refs)); sk.append(np.std(refs) * np.sqrt(1 + 1 / B))
    gap = np.array(lws) - np.array(lw)
    return gap, np.array(sk)

def cl_optimal(use_pca, nd, kmax=10):
    X = _cdata(use_pca, nd); kmax = min(kmax, len(X) - 1); ks = list(range(2, kmax + 1))
    wss = [KMeans(k, n_init=5, random_state=0).fit(X).inertia_ for k in [1] + ks]
    sil = [silhouette_score(X, KMeans(k, n_init=5, random_state=0).fit_predict(X)) for k in ks]
    gap, sk = _gap(X, ks)
    k_sil = ks[int(np.argmax(sil))]
    k_gap = next((ks[i] for i in range(len(ks) - 1) if gap[i] >= gap[i + 1] - sk[i + 1]), ks[int(np.argmax(gap))])
    _ML['opt'] = dict(ks=ks, wss=wss, sil=sil, gap=gap, sk=sk, k_sil=int(k_sil), k_gap=int(k_gap))
    return json.dumps(dict(k_sil=int(k_sil), k_gap=int(k_gap)))

def fig_optimal():
    o = _ML['opt']; ks = o['ks']
    fig, ax = plt.subplots(1, 3, figsize=(13, 3.8))
    ax[0].plot([1] + ks, o['wss'], 'o-', color=PAL[2]); ax[0].set_title(tr('Codo (WSS)', 'Elbow (WSS)')); ax[0].set_xlabel('k')
    ax[1].plot(ks, o['sil'], 'o-', color=PAL[0]); ax[1].axvline(o['k_sil'], color=PAL[5], ls='--')
    ax[1].set_title(tr(f"Silueta media (mejor k={o['k_sil']})", f"Mean silhouette (best k={o['k_sil']})")); ax[1].set_xlabel('k')
    ax[2].errorbar(ks, o['gap'], yerr=o['sk'], fmt='o-', color=PAL[1], ecolor=PAL[1]); ax[2].axvline(o['k_gap'], color=PAL[5], ls='--')
    ax[2].set_title(tr(f"Estadístico gap (k={o['k_gap']})", f"Gap statistic (k={o['k_gap']})")); ax[2].set_xlabel('k')
    fig.tight_layout(); return fig_to_b64(fig)

def _kmedoids(D, k):
    n = D.shape[0]; rng = np.random.default_rng(0); med = rng.choice(n, k, replace=False)
    for _ in range(120):
        lab = np.argmin(D[:, med], axis=1); new = med.copy()
        for j in range(k):
            mem = np.where(lab == j)[0]
            if len(mem): new[j] = mem[np.argmin(D[np.ix_(mem, mem)].sum(0))]
        if np.array_equal(new, med): break
        med = new
    return np.argmin(D[:, med], axis=1)

def _fcm(X, k, m=2.0):
    n = X.shape[0]; rng = np.random.default_rng(0)
    U = rng.random((n, k)); U /= U.sum(1, keepdims=True)
    for _ in range(200):
        um = U ** m; C = (um.T @ X) / um.sum(0)[:, None]
        D = np.linalg.norm(X[:, None, :] - C[None, :, :], axis=2) + 1e-9
        d2 = D ** (2 / (m - 1)); U2 = 1.0 / (d2 * (1.0 / d2).sum(1, keepdims=True))
        if np.abs(U2 - U).max() < 1e-5: U = U2; break
        U = U2
    return U

def _dunn(D, lab):
    cl = [c for c in np.unique(lab) if c >= 0 and (lab == c).sum() > 1]
    if len(cl) < 2: return None
    try:
        intra = max(D[np.ix_(lab == c, lab == c)].max() for c in cl)
        inter = min(D[np.ix_(lab == a, lab == b)][D[np.ix_(lab == a, lab == b)] > 0].min()
                    for i, a in enumerate(cl) for b in cl[i + 1:])
    except ValueError:
        return None   # a block made only of coincident points
    return float(inter / intra) if intra > 0 else None

def fig_kdist(use_pca, nd, minpts):
    X = _cdata(use_pca, nd); minpts = max(2, min(int(minpts), len(X)))
    nb = NearestNeighbors(n_neighbors=minpts).fit(X)
    d = np.sort(nb.kneighbors(X)[0][:, -1])
    fig, a = plt.subplots(figsize=(7, 3.6))
    a.plot(d, color=PAL[2]); a.set_xlabel(tr('puntos ordenados', 'sorted points'))
    a.set_ylabel(tr(f'{minpts}-distancia', f'{minpts}-distance'))
    a.set_title(tr('Gráfico de k-distancias (busca el "codo" para eps)', 'k-distance plot (look for the "elbow" to choose eps)'))
    fig.tight_layout(); return fig_to_b64(fig)

def cl_run(method, k, use_pca, nd, eps, minpts):
    X = _cdata(use_pca, nd); D = squareform(pdist(X)); Z = None; coph = None
    if method in ('ward', 'complete', 'average', 'single'):
        Z = hierarchy.linkage(X, method=method)
        lab = hierarchy.fcluster(Z, k, criterion='maxclust') - 1
        coph = float(hierarchy.cophenet(Z, pdist(X))[0])
    elif method == 'kmeans':
        lab = KMeans(k, n_init=10, random_state=0).fit_predict(X)
    elif method == 'pam':
        lab = _kmedoids(D, k)
    elif method == 'hkmeans':
        Zh = hierarchy.linkage(X, 'ward'); h = hierarchy.fcluster(Zh, k, 'maxclust') - 1
        cent = np.array([X[h == j].mean(0) for j in range(k)])
        lab = KMeans(k, init=cent, n_init=1).fit_predict(X)
    elif method == 'fuzzy':
        U = _fcm(X, k); _ML['fuzzyU'] = U; lab = U.argmax(1)
    elif method == 'gmm':
        lab = GaussianMixture(k, random_state=0).fit_predict(X)
    elif method == 'dbscan':
        lab = DBSCAN(eps=eps, min_samples=minpts).fit_predict(X)
    _ML['labels'] = lab
    uniq = sorted(set(lab.tolist()))
    valid = [c for c in uniq if c >= 0]
    sil = None
    if len(valid) > 1 and (lab >= 0).sum() > len(valid):
        mask = lab >= 0
        sil = float(silhouette_score(X[mask], lab[mask]))
    # plane used by the scatter figure: the PCA scores when they were the input, otherwise a fresh 2-D PCA
    if 'scores' in _ML and use_pca:
        sc2 = _ML['scores'][:, :2]; axl = ('Dim 1', 'Dim 2')
    else:
        sc2 = PCA(2, random_state=0).fit_transform(X); axl = ('PC 1', 'PC 2')
    _ML['run'] = dict(X=X, lab=lab, Z=Z, k=int(k), sc2=sc2, axl=axl)
    dunn = _dunn(D, lab)
    res = dict(method=method, k=len(valid), noise=int((lab == -1).sum()),
               silhouette=round(sil, 3) if sil is not None else None,
               dunn=round(dunn, 3) if dunn else None,
               cophenetic=round(coph, 3) if coph is not None else None,
               figs=dict(dendro=Z is not None, profile=len(valid) > 0, silhouette=sil is not None))
    return json.dumps(res)

def fig_dendrogram():
    r = _ML['run']; Z = r['Z']; k = r['k']
    hs = np.sort(Z[:, 2]); cut = (hs[-k] + hs[-k + 1]) / 2 if k < len(hs) else hs[-1]
    fig, a = plt.subplots(figsize=(11, 4.6))
    hierarchy.dendrogram(Z, no_labels=True, color_threshold=cut, ax=a, above_threshold_color=_UI['muted'])
    a.axhline(cut, color=PAL[5], ls='--', lw=1.3, label=tr(f'corte para k={k}', f'cut for k={k}'))
    a.set_ylabel(tr('altura', 'height'))
    a.set_title(tr(f'Dendrograma (corte en {cut:.2f} → {k} grupos)', f'Dendrogram (cut at {cut:.2f} → {k} clusters)'))
    a.legend(fontsize=8); fig.tight_layout(); return fig_to_b64(fig)

def fig_cluster_scatter():
    r = _ML['run']; lab = r['lab']; sc = r['sc2']
    fig, a = plt.subplots(figsize=(7, 5.4))
    for c in sorted(set(lab.tolist())):
        m = lab == c
        col = _UI['muted'] if c == -1 else PAL[c % len(PAL)]
        a.scatter(sc[m, 0], sc[m, 1], s=16, color=col, alpha=.75, label=_cname(c), edgecolor=_UI['bg'], linewidth=.2)
        if c != -1: _conf_ellipse(sc[m, 0], sc[m, 1], a, col)
    a.set_xlabel(r['axl'][0]); a.set_ylabel(r['axl'][1])
    a.set_title(tr('Grupos en el plano principal', 'Clusters on the principal plane'))
    a.legend(fontsize=7); fig.tight_layout(); return fig_to_b64(fig)

def fig_cluster_profile():
    r = _ML['run']; lab = r['lab']; cont = _ML['cont']; X = _ML['X']
    cl = [c for c in sorted(set(lab.tolist())) if c >= 0]
    M = np.array([X[lab == c].mean(0) for c in cl])
    vmax = max(float(np.abs(M).max()), 1e-9)
    fig, a = plt.subplots(figsize=(max(6, len(cont) * .5), 0.7 * len(cl) + 1.5))
    im = a.imshow(M, cmap='RdBu_r', aspect='auto', vmin=-vmax, vmax=vmax); a.grid(False)
    a.set_xticks(range(len(cont))); a.set_xticklabels([mlab(c) for c in cont], rotation=90, fontsize=7)
    a.set_yticks(range(len(cl))); a.set_yticklabels([_cname(c) for c in cl])
    for i in range(len(cl)):
        for j in range(len(cont)):
            a.text(j, i, f'{M[i,j]:.1f}', ha='center', va='center', fontsize=6,
                   color='white' if abs(M[i, j]) > .55 * vmax else '#222222')
    a.set_title(tr('Perfil de cada grupo (media estandarizada)', 'Profile of each cluster (standardised mean)'))
    _cbar(fig, im, a); fig.tight_layout(); return fig_to_b64(fig)

def fig_silhouette():
    r = _ML['run']; X = r['X']; lab = r['lab']
    m = lab >= 0; sv = silhouette_samples(X[m], lab[m]); ll = lab[m]
    cl = sorted(set(ll.tolist())); fig, a = plt.subplots(figsize=(7, 4.4)); y = 0
    for c in cl:
        s = np.sort(sv[ll == c]); a.barh(range(y, y + len(s)), s, height=1,
            color=PAL[c % len(PAL)], edgecolor='none'); y += len(s) + 8
    a.axvline(sv.mean(), color=PAL[5], ls='--', label=tr(f'media = {sv.mean():.2f}', f'mean = {sv.mean():.2f}'))
    a.set_xlabel(tr('coeficiente de silueta', 'silhouette coefficient')); a.set_yticks([])
    a.set_title(tr('Gráfico de silueta', 'Silhouette plot'))
    a.legend(fontsize=8); fig.tight_layout(); return fig_to_b64(fig)

def cl_labels_csv():
    d = _ML['d']; lab = _ML['labels']
    out = {'gbif_key': d['key'] if 'key' in d.columns else range(len(d)),
           'taxon': _ML['group'], 'lat': d['decimalLatitude'], 'lon': d['decimalLongitude'],
           'cluster': [int(x) + 1 if x >= 0 else 0 for x in lab]}
    return pd.DataFrame(out).to_csv(index=False)

def cl_labels_json():
    lab = _ML['labels']; c = _ML['coords']
    return json.dumps([dict(lat=float(c[i, 1]), lon=float(c[i, 0]), taxon=_ML['group'][i],
        cluster=int(lab[i]) + 1 if lab[i] >= 0 else 0) for i in range(len(lab))])

# ---------- correspondence analysis ----------
def _pad2(M):
    if M.shape[1] >= 2: return M
    return np.hstack([M, np.zeros((M.shape[0], 2 - M.shape[1]))])

def _ca_core(N):
    N = N.astype(float) + 1e-9; n = N.sum(); P = N / n
    r = P.sum(1); c = P.sum(0)
    S = np.diag(1 / np.sqrt(r)) @ (P - np.outer(r, c)) @ np.diag(1 / np.sqrt(c))
    U, sv, Vt = np.linalg.svd(S, full_matrices=False)
    tot = (sv ** 2).sum() or 1
    d = max(1, min(len(sv) - 1, 5))
    F = _pad2(np.diag(1 / np.sqrt(r)) @ U[:, :d] @ np.diag(sv[:d]))
    G = _pad2(np.diag(1 / np.sqrt(c)) @ Vt.T[:, :d] @ np.diag(sv[:d]))
    inertia = np.pad(sv[:d] ** 2, (0, max(0, 2 - d)))
    return F, G, inertia, inertia / tot * 100

def ml_ca(row_var, col_var):
    d = _ML['d']
    if row_var not in d.columns or col_var not in d.columns:
        return json.dumps(dict(error='missing'))
    ct = pd.crosstab(d[row_var].fillna('NA').astype(str), d[col_var].fillna('NA').astype(str))
    if ct.shape[0] < 2 or ct.shape[1] < 2:
        return json.dumps(dict(error='small', rows=int(ct.shape[0]), cols=int(ct.shape[1])))
    F, G, inertia, var = _ca_core(ct.values)
    chi2 = None
    try:
        from scipy.stats import chi2_contingency
        stat, p, _, _ = chi2_contingency(ct.values); chi2 = dict(chi2=round(float(stat), 1), p=float(p))
    except Exception: pass
    tbl = [dict(dim=i + 1, inertia=round(float(inertia[i]), 4), variance=round(float(var[i]), 2)) for i in range(len(inertia))]
    _ML['ca'] = dict(kind='ca', F=F, G=G, var=var, rlab=list(ct.index), clab=list(ct.columns),
                     row_var=row_var, col_var=col_var)
    return json.dumps(dict(table=tbl, chi2=chi2))

def ml_mca(cats_json):
    cat_vars = json.loads(cats_json)
    d = _ML['d'][cat_vars].astype(str).fillna('NA')
    Z = pd.get_dummies(d)
    F, G, inertia, var = _ca_core(Z.values)
    _ML['ca'] = dict(kind='mca', F=F, G=G, var=var, names=[str(c) for c in Z.columns])
    tbl = [dict(dim=i + 1, inertia=round(float(inertia[i]), 4), variance=round(float(var[i]), 2)) for i in range(len(inertia))]
    return json.dumps(dict(table=tbl))

def ml_famd(cats_json):
    cat_vars = json.loads(cats_json)
    d = _ML['d']
    Xc = _ML['X']  # already standardised (or centred)
    dummies = pd.get_dummies(d[cat_vars].astype(str).fillna('NA')) if cat_vars else pd.DataFrame(index=d.index)
    prop = dummies.mean(0).replace(0, 1e-9)
    Xd = (dummies.values.astype(float) - prop.values) / np.sqrt(prop.values)
    M = np.hstack([Xc, Xd]) if Xd.size else Xc
    pca = PCA().fit(M); sc = pca.transform(M); var = pca.explained_variance_ratio_ * 100
    _ML['ca'] = dict(kind='famd', sc=sc, var=var)
    cum = np.cumsum(var)
    tbl = [dict(dim=i + 1, variance=round(float(var[i]), 2), cumulative=round(float(cum[i]), 2)) for i in range(min(8, len(var)))]
    return json.dumps(dict(table=tbl))

def fig_ca():
    r = _ML['ca']; var = r['var']; g = _ML['group']; taxa = sorted(set(g.tolist()))
    if r['kind'] == 'ca':
        F, G = r['F'], r['G']
        fig, a = plt.subplots(figsize=(7.5, 6))
        a.scatter(F[:, 0], F[:, 1], color=PAL[2], s=30)
        for i, l in enumerate(r['rlab']): a.text(F[i, 0], F[i, 1], str(l), color=PAL[2], fontsize=8)
        a.scatter(G[:, 0], G[:, 1], color=PAL[5], marker='^', s=30)
        for i, l in enumerate(r['clab']): a.text(G[i, 0], G[i, 1], str(l), color=PAL[5], fontsize=8)
        _zero_lines(a)
        a.set_xlabel(f'Dim 1 ({var[0]:.1f}%)'); a.set_ylabel(f'Dim 2 ({var[1]:.1f}%)')
        a.set_title(tr('AC: ', 'CA: ') + catname(r['row_var']) + ' × ' + catname(r['col_var']))
    elif r['kind'] == 'mca':
        F, G = r['F'], r['G']
        fig, ax = plt.subplots(1, 2, figsize=(13, 5.6))
        for t, gg in enumerate(taxa):
            m = g == gg
            ax[0].scatter(F[m, 0], F[m, 1], s=12, color=PAL[t % len(PAL)], alpha=.5, label=gg)
        ax[0].set_title(tr('Individuos', 'Individuals')); ax[0].legend(fontsize=7)
        ax[1].scatter(G[:, 0], G[:, 1], color=PAL[5], s=25)
        for i, l in enumerate(r['names']): ax[1].text(G[i, 0], G[i, 1], l, fontsize=7, color=_UI['text'])
        ax[1].set_title(tr('Categorías', 'Categories'))
        for a in ax:
            _zero_lines(a)
            a.set_xlabel(f'Dim 1 ({var[0]:.1f}%)'); a.set_ylabel(f'Dim 2 ({var[1]:.1f}%)')
    else:
        sc = r['sc']
        fig, a = plt.subplots(figsize=(7.5, 6))
        for t, gg in enumerate(taxa):
            m = g == gg
            a.scatter(sc[m, 0], sc[m, 1], s=14, color=PAL[t % len(PAL)], alpha=.6, label=gg)
        _zero_lines(a)
        a.set_xlabel(f'Dim 1 ({var[0]:.1f}%)'); a.set_ylabel(f'Dim 2 ({var[1]:.1f}%)')
        a.set_title(tr('AFDM (datos mixtos)', 'FAMD (mixed data)')); a.legend(fontsize=7)
    fig.tight_layout(); return fig_to_b64(fig)
`;

/* ============ JS ============ */
let mlReady = false, mlPrepared = false, mlPcaDone = false, mlContKeys = [];
let clusterMap = null, clusterStudio = null, clusterPts = null;

/* names of the categorical variables */
const ML_CAT_NAMES = {
  taxon: { es: 'Taxón', en: 'Taxon' },
  koppen_code: { es: 'Clima de Köppen', en: 'Köppen climate' },
  soil_wrb: { es: 'Tipo de suelo (WRB)', en: 'Soil type (WRB)' },
  country: { es: 'País', en: 'Country' },
  taxonRank: { es: 'Rango taxonómico', en: 'Taxonomic rank' },
};
const mlCatName = k => ML_CAT_NAMES[k] ? T(ML_CAT_NAMES[k].es, ML_CAT_NAMES[k].en) : k;
const mlCatNameL2 = k => ML_CAT_NAMES[k] ? L2(ML_CAT_NAMES[k].es, ML_CAT_NAMES[k].en) : esc(k);

/* short variable code in both languages ({es, en}), so tables and pickers follow the language */
function mlVarCode2(k) {
  const m = BIOCLIM_META[k], c = m ? m[0] : k;
  return { es: c, en: k === 'elev' ? 'ELEV' : c };
}
function mlVarCodeL2(k) {
  const c = mlVarCode2(k);
  return c.es === c.en ? esc(c.es) : L2(esc(c.es), esc(c.en));
}
function mlVarLabelMap(keys) {
  const m = {}; keys.forEach(k => { m[k] = varCode(k); }); return m;
}
/* the short labels sent to Python depend on the language (ELEV / ALT): refresh them before the redraw */
document.addEventListener('langchange', () => {
  if (!mlPrepared || !window.__pyodide) return;
  try {
    window.__pyodide.globals.set('ml_vlab_json', JSON.stringify(mlVarLabelMap(mlContKeys)));
    window.__pyodide.runPython('set_ml_labels(ml_vlab_json)');
  } catch (e) { console.warn(e); }
});

function mlAllContVars() {
  const t = state.env.table || [];
  return [...Array(19)].map((_, i) => 'bio_' + (i + 1)).concat('elev').filter(k => t.some(r => r[k] != null));
}
function mlCatVars() {
  const t = state.env.table || [];
  const out = [];
  if (t.some(r => r.koppen_code)) out.push('koppen_code');
  if (t.some(r => r.soil_wrb)) out.push('soil_wrb');
  if (t.some(r => r.country)) out.push('country');
  if (t.some(r => r.taxonRank)) out.push('taxonRank');
  return out;
}

function buildMlPickers(force) {
  if (!force && el('mlVarChecklist').children.length) return;  // do not regenerate if the user already adjusted them
  const rec = new Set((state.stats && state.stats.recommendedVars) || mlAllContVars());
  const box = el('mlVarChecklist'); box.innerHTML = '';
  mlAllContVars().forEach(k => {
    const l = document.createElement('label'); l.className = 'checkbox-label';
    l.innerHTML = `<input type="checkbox" value="${k}" ${rec.has(k) ? 'checked' : ''}> ${mlVarCodeL2(k)} — ${varNameL2(k)}` +
      (rec.has(k) ? ` <span class="tag-info">${L2('paso 6', 'step 6')}</span>` : '');
    box.appendChild(l);
  });
  const cbox = el('mlCatChecklist'); cbox.innerHTML = '';
  mlCatVars().forEach(k => {
    const l = document.createElement('label'); l.className = 'checkbox-label';
    l.innerHTML = `<input type="checkbox" value="${k}"> ${mlCatNameL2(k)}`;
    cbox.appendChild(l);
  });
  refreshCaVarSelects();
}

el('mlVarsRecommended').addEventListener('click', () => {
  const rec = new Set((state.stats && state.stats.recommendedVars) || []);
  el('mlVarChecklist').querySelectorAll('input').forEach(i => i.checked = rec.has(i.value));
});
el('mlVarsAll').addEventListener('click', () =>
  el('mlVarChecklist').querySelectorAll('input').forEach(i => i.checked = true));

function mlSelectedCont() { return [...el('mlVarChecklist').querySelectorAll('input:checked')].map(i => i.value); }
function mlSelectedCat() { return [...el('mlCatChecklist').querySelectorAll('input:checked')].map(i => i.value); }

/* <option> text is plain text: rebuilt when the language changes, keeping the selection */
function refreshCaVarSelects() {
  const opts = ['taxon', ...mlCatVars()];
  [el('caRowVar'), el('caColVar')].forEach((sel, n) => {
    const prev = sel.value;
    sel.innerHTML = '';
    opts.forEach(k => sel.add(new Option(mlCatName(k), k)));
    if (prev && opts.includes(prev)) sel.value = prev;
    else if (opts.length > 1 && n === 1) sel.selectedIndex = 1;
  });
}
document.addEventListener('langchange', refreshCaVarSelects);

/* shows a figure, or empties its box (and forgets it) when that figure does not apply */
async function mlShowFigIf(boxId, expr, applies) {
  if (!applies) { Views.drop(boxId); el(boxId).innerHTML = ''; return; }
  await showFig(boxId, expr);
}

/* every figure box of this step, to forget them when the data are prepared again */
const ML_FIG_IDS = ['figScree', 'figVarCircle', 'figIndividuals', 'figBiplot', 'figContrib', 'figTendency', 'figOptimalK',
  'figKdist', 'figDendrogram', 'figClusterScatter', 'figClusterProfile', 'figSilhouette', 'figCaBiplot', 'figCaContrib'];
function mlResetOutputs() {
  ML_FIG_IDS.forEach(id => { Views.drop(id); el(id).innerHTML = ''; });
  ['pcaOut', 'clOut', 'caOut'].forEach(id => { el(id).style.display = 'none'; });
  el('clOptimalNote').innerHTML = '';
  mlPcaDone = false; clusterPts = null;
  document.dispatchEvent(new CustomEvent('mlreset'));   // the ecology block listens to this too
}

el('mlPrepareBtn').addEventListener('click', mlPrepare);

async function mlPrepare() {
  const cont = mlSelectedCont();
  if (cont.length < 3) {
    showMessage('mlMessages', 'error', L2('Selecciona al menos 3 variables continuas.', 'Select at least 3 continuous variables.')); return;
  }
  clearMessages('mlMessages');
  showSpinner(T('Preparando datos en Python…', 'Preparing the data in Python…'));
  try {
    const py = await getPyodide();
    if (!mlReady) { py.runPython(PY_ML); mlReady = true; }
    mlPrepared = false; mlResetOutputs(); el('mlSections').style.display = 'none';
    mlContKeys = cont;
    await runPy('set_ml_labels(vlab_json)', { vlab_json: JSON.stringify(mlVarLabelMap(cont)) });
    const info = await runPyJSON('ml_prepare(env_json, cont_json, cat_json, std_flag)', {
      env_json: JSON.stringify(state.env.table || []), cont_json: JSON.stringify(cont),
      cat_json: JSON.stringify(mlSelectedCat()), std_flag: el('mlStandardize').checked });
    if (info.n < 3) {
      showMessage('mlMessages', 'error', L2(
        `Solo hay ${info.n} registros completos: se necesitan al menos 3 (${info.dropped} descartados por datos faltantes).`,
        `Only ${info.n} complete records: at least 3 are needed (${info.dropped} dropped because of missing data).`));
      return;
    }
    mlPrepared = true;
    el('mlSections').style.display = 'block';
    const dropped = info.dropped
      ? L2(` (${info.dropped} descartados por datos faltantes).`, ` (${info.dropped} dropped because of missing data).`) : '.';
    const cats = info.cat.length
      ? ' ' + L2('Categóricas: ', 'Categorical: ') + info.cat.map(mlCatNameL2).join(', ') + '.' : '';
    showMessage('mlMessages', 'success',
      L2(`Datos listos: ${info.n} individuos × ${info.p} variables`, `Data ready: ${info.n} individuals × ${info.p} variables`) + dropped + cats);
  } catch (err) {
    console.error(err); showMessage('mlMessages', 'error', 'Error: ' + esc(err.message));
  } finally { hideSpinner(); }
}

/* ---- PCA ---- */
el('pcaRunBtn').addEventListener('click', async () => {
  if (!mlPrepared) return;
  showSpinner(T('Ejecutando PCA…', 'Running PCA…'));
  try {
    const r = await runPyJSON('ml_pca()');
    mlPcaDone = true;
    statTiles('pcaSummary', [
      [{ es: 'Dimensiones', en: 'Dimensions' }, r.ndim],
      [{ es: 'Criterio de Kaiser', en: 'Kaiser criterion' }, r.kaiser + ' comp.'],
      [{ es: '80% de varianza', en: '80% of variance' }, r.n80 + ' comp.'],
      ['Var. Dim 1–2', fmt(r.var[0] + r.var[1], 1) + '%'],
    ]);
    buildTable('pcaEigTable', [
      { key: 'dim', label: 'Dim' }, { key: 'eigenvalue', label: { es: 'Valor propio', en: 'Eigenvalue' } },
      { key: 'variance', label: { es: '% varianza', en: '% variance' } },
      { key: 'cumulative', label: { es: '% acumulada', en: '% cumulative' } }], r.table);
    buildTable('pcaDimDesc', [
      { key: 'dim', label: 'Dim' }, { key: 'variable', label: { es: 'Variable', en: 'Variable' }, get: row => mlVarCode2(row.variable) },
      { key: 'correlation', label: { es: 'Correlación', en: 'Correlation' } },
      { key: 'contribution', label: { es: 'Contrib. %', en: 'Contrib. %' } },
      { key: 'cos2', label: 'cos²' }], r.desc);
    await refreshPcaFigs();
    el('pcaOut').style.display = 'block';
  } catch (e) {
    console.error(e); showMessage('mlMessages', 'error', L2('Error en PCA: ', 'PCA error: ') + esc(e.message));
  } finally { hideSpinner(); }
});

/* the function form is evaluated at every redraw, so the figures always follow the current selections */
async function refreshPcaFigs() {
  const q = id => JSON.stringify(el(id).value);
  await showFig('figScree', 'fig_scree()');
  await showFig('figVarCircle', () => `fig_var_circle(${q('pcaVarColor')}, ${q('pcaAxes')})`);
  await showFig('figIndividuals', () => `fig_individuals(${q('pcaIndColor')}, ${q('pcaAxes')})`);
  await showFig('figBiplot', () => `fig_biplot(${q('pcaAxes')})`);
  await showFig('figContrib', 'fig_contrib()');
}
['pcaAxes', 'pcaVarColor', 'pcaIndColor'].forEach(id => el(id).addEventListener('change', async () => {
  if (!mlPcaDone) return;
  showSpinner(T('Actualizando figuras…', 'Updating the figures…'));
  try { await refreshPcaFigs(); } finally { hideSpinner(); }
}));
el('dlPcaScores').addEventListener('click', async () => {
  try {
    downloadBlob(await runPy('ml_pca_scores_csv()'),
      slugName(state.query) + T('_PCA_individuos.csv', '_PCA_individuals.csv'), 'text/csv;charset=utf-8');
  } catch (e) { console.error(e); showMessage('mlMessages', 'error', 'Error: ' + esc(e.message)); }
});

/* ---- clustering ---- */
el('clMethod').addEventListener('change', e => {
  el('clDbscanOpts').style.display = e.target.value === 'dbscan' ? 'inline' : 'none';
});
const clArgs = () => [el('clInput').value === 'pca' ? 'True' : 'False', +el('clNDims').value || 3];

el('clTendencyBtn').addEventListener('click', async () => {
  if (!ensurePca()) return;
  showSpinner(T('Evaluando tendencia de agrupamiento…', 'Assessing the clustering tendency…'));
  try {
    const [up, nd] = clArgs();
    await runPy(`cl_tendency(${up}, ${nd})`);
    await showFig('figTendency', 'fig_tendency()');
  } catch (e) {
    console.error(e); showMessage('mlMessages', 'error', 'Error: ' + esc(e.message));
  } finally { hideSpinner(); }
});
el('clOptimalBtn').addEventListener('click', async () => {
  if (!ensurePca()) return;
  showSpinner(T('Buscando el número óptimo de grupos…', 'Looking for the optimal number of clusters…'));
  try {
    const [up, nd] = clArgs();
    const r = await runPyJSON(`cl_optimal(${up}, ${nd})`);
    await showFig('figOptimalK', 'fig_optimal()');
    clearMessages('clOptimalNote');
    showMessage('clOptimalNote', 'info', L2(`Sugerencias: silueta → k=${r.k_sil}; gap → k=${r.k_gap}.`,
      `Suggestions: silhouette → k=${r.k_sil}; gap → k=${r.k_gap}.`));
  } catch (e) {
    console.error(e); showMessage('mlMessages', 'error', 'Error: ' + esc(e.message));
  } finally { hideSpinner(); }
});
el('clKdistBtn').addEventListener('click', async () => {
  if (!ensurePca()) return;
  showSpinner(T('Calculando k-distancias…', 'Computing k-distances…'));
  try {
    const [up, nd] = clArgs();
    await showFig('figKdist', `fig_kdist(${up}, ${nd}, ${+el('clMinPts').value || 5})`);
  } catch (e) {
    console.error(e); showMessage('mlMessages', 'error', 'Error: ' + esc(e.message));
  } finally { hideSpinner(); }
});

function ensurePca() {
  if (!mlPrepared) {
    showMessage('mlMessages', 'warning', L2('Pulsa primero «Preparar datos».', 'First press "Prepare data".')); return false;
  }
  if (el('clInput').value === 'pca' && !mlPcaDone) {
    showMessage('mlMessages', 'warning', L2('Ejecuta primero el PCA (o cambia la entrada a «variables estandarizadas»).',
      'First run the PCA (or change the input to "standardised variables").'));
    return false;
  }
  return true;
}

el('clRunBtn').addEventListener('click', async () => {
  if (!ensurePca()) return;
  showSpinner(T('Ejecutando agrupamiento…', 'Running clustering…'));
  try {
    const [up, nd] = clArgs();
    const m = el('clMethod').value, k = +el('clK').value || 3;
    const eps = +el('clEps').value || 1.5, mp = +el('clMinPts').value || 5;
    const r = await runPyJSON(`cl_run(${JSON.stringify(m)}, ${k}, ${up}, ${nd}, ${eps}, ${mp})`);
    const tiles = [[{ es: 'Grupos', en: 'Clusters' }, r.k], [{ es: 'Silueta media', en: 'Mean silhouette' }, fmt(r.silhouette, 3)],
      [{ es: 'Índice de Dunn', en: 'Dunn index' }, fmt(r.dunn, 3)]];
    if (r.cophenetic != null) tiles.push([{ es: 'Corr. cofenética', en: 'Cophenetic corr.' }, fmt(r.cophenetic, 3)]);
    if (r.noise) tiles.push([{ es: 'Ruido (DBSCAN)', en: 'Noise (DBSCAN)' }, r.noise]);
    statTiles('clSummary', tiles);
    await mlShowFigIf('figDendrogram', 'fig_dendrogram()', r.figs.dendro);
    await showFig('figClusterScatter', 'fig_cluster_scatter()');
    await mlShowFigIf('figClusterProfile', 'fig_cluster_profile()', r.figs.profile);
    await mlShowFigIf('figSilhouette', 'fig_silhouette()', r.figs.silhouette);
    el('clOut').style.display = 'block';   // visible before drawing the map, so Leaflet can measure it
    clusterPts = await runPyJSON('cl_labels_json()');
    renderClusterMap(clusterPts, true);
    enableStep(9);
  } catch (e) {
    console.error(e); showMessage('mlMessages', 'error', L2('Error en el agrupamiento: ', 'Clustering error: ') + esc(e.message));
  } finally { hideSpinner(); }
});

/* cluster colours: the app series palette, the same one the Python figures use */
const mlClusterPalette = () => ['--c1', '--c2', '--c3', '--c4', '--c5', '--c6', '--c7', '--c8', '--c9', '--c10'].map(v => cssVar(v));
const mlClusterLabel = c => c === 0 ? L2('ruido', 'noise') : L2('grupo ' + c, 'cluster ' + c);

function renderClusterMap(pts, fit) {
  if (!clusterMap) {
    clusterMap = mapkit.makeBaseMap('mapCluster'); window.__clusterMap = clusterMap;
    clusterStudio = mapstudio.attach(clusterMap, {
      kind: 'cluster', legendPanel: el('mapClusterLegend'),
      hooks: { defaultTitle: () => state.query || '', fileName: () => 'map_clusters_' + slugName(state.query) },
    });
  }
  const pal = mlClusterPalette(), noiseColor = cssVar('--text-muted', '#5b7266');
  const cs = [...new Set(pts.map(p => p.cluster))].sort((a, b) => a - b);
  const defaults = {}; cs.forEach(c => { defaults[c] = c === 0 ? noiseColor : pal[(c - 1) % pal.length]; });
  clusterStudio.setData({
    kind: 'categorical', defaults, cats: cs,
    items: pts.map(p => ({ lat: p.lat, lon: p.lon, cat: p.cluster, tip: () => `${esc(p.taxon)}<br>${mlClusterLabel(p.cluster)}` })),
    title: () => T('Grupos', 'Clusters'),
    catLabel: c => +c === 0 ? T('ruido', 'noise') : T('grupo ' + c, 'cluster ' + c),
  });
  if (fit) mapkit.fitToPoints(clusterMap, pts.map(p => ({ decimalLatitude: p.lat, decimalLongitude: p.lon })));
  setTimeout(() => clusterMap.invalidateSize(), 60);
}
/* the colours come from the theme: redraw the markers (without moving the map) when it changes */
document.addEventListener('themechange', () => { if (clusterPts && clusterMap) renderClusterMap(clusterPts, false); });

el('dlClusters').addEventListener('click', async () => {
  try {
    downloadBlob(await runPy('cl_labels_csv()'), slugName(state.query) + '_clusters.csv', 'text/csv;charset=utf-8');
  } catch (e) { console.error(e); showMessage('mlMessages', 'error', 'Error: ' + esc(e.message)); }
});

/* ---- correspondence analysis ---- */
el('caType').addEventListener('change', e => {
  el('caSimpleVars').style.display = e.target.value === 'ca' ? 'inline' : 'none';
});

const ML_CA_COLS = {
  inertia: [{ key: 'dim', label: 'Dim' }, { key: 'inertia', label: { es: 'Inercia', en: 'Inertia' } },
    { key: 'variance', label: { es: '% varianza', en: '% variance' } }],
  famd: [{ key: 'dim', label: 'Dim' }, { key: 'variance', label: { es: '% varianza', en: '% variance' } },
    { key: 'cumulative', label: { es: '% acumulada', en: '% cumulative' } }],
};

el('caRunBtn').addEventListener('click', async () => {
  if (!mlPrepared) return;
  const type = el('caType').value;
  showSpinner(T('Ejecutando análisis de correspondencias…', 'Running correspondence analysis…'));
  try {
    let r;
    const dimTiles = n => r.table.slice(0, n).map(t => ['Dim ' + t.dim + ' %', t.variance]);
    if (type === 'ca') {
      const rv = el('caRowVar').value, cv = el('caColVar').value;
      r = await runPyJSON(`ml_ca(${JSON.stringify(rv)}, ${JSON.stringify(cv)})`);
      if (r.error === 'missing') {
        showMessage('mlMessages', 'warning', L2('La variable no está disponible.', 'The variable is not available.')); return;
      }
      if (r.error === 'small') {
        const nm = k => (ML_CAT_NAMES[k] || { es: k, en: k });
        showMessage('mlMessages', 'warning', L2(
          `La tabla de contingencia ${esc(nm(rv).es)} × ${esc(nm(cv).es)} es ${r.rows}×${r.cols}; el AC simple necesita al menos 2 categorías en cada variable. Prueba con otras variables o usa el ACM.`,
          `The contingency table ${esc(nm(rv).en)} × ${esc(nm(cv).en)} is ${r.rows}×${r.cols}; simple CA needs at least 2 categories in each variable. Try other variables or use MCA.`));
        return;
      }
      if (r.chi2) statTiles('caSummary', [['χ²', r.chi2.chi2], ['p', r.chi2.p < 0.001 ? '<0.001' : fmt(r.chi2.p, 3)],
        ['Dim 1 %', r.table[0].variance], ['Dim 2 %', (r.table[1] || {}).variance ?? '—']]);
      else statTiles('caSummary', dimTiles(2));
      buildTable('caTable', ML_CA_COLS.inertia, r.table);
    } else if (type === 'mca') {
      const cats = mlSelectedCat();
      if (cats.length < 2) {
        showMessage('mlMessages', 'warning', L2('El ACM necesita ≥2 variables categóricas seleccionadas arriba.',
          'MCA needs ≥2 categorical variables selected above.')); return;
      }
      r = await runPyJSON('ml_mca(cats_json)', { cats_json: JSON.stringify(cats) });
      statTiles('caSummary', dimTiles(3));
      buildTable('caTable', ML_CA_COLS.inertia, r.table);
    } else {
      r = await runPyJSON('ml_famd(cats_json)', { cats_json: JSON.stringify(mlSelectedCat()) });
      statTiles('caSummary', dimTiles(3));
      buildTable('caTable', ML_CA_COLS.famd, r.table);
    }
    Views.drop('figCaContrib'); el('figCaContrib').innerHTML = '';
    await showFig('figCaBiplot', 'fig_ca()');
    el('caOut').style.display = 'block';
  } catch (e) {
    console.error(e); showMessage('mlMessages', 'error', L2('Error en el análisis de correspondencias: ', 'Correspondence analysis error: ') + esc(e.message));
  } finally { hideSpinner(); }
});

el('toStep8Btn') && el('toStep8Btn').addEventListener('click', () => { goToStep(8); buildMlPickers(true); });

window.buildMlPickers = buildMlPickers;
/* a new selection in step 6 replaces the default of the ML variable list */
document.addEventListener('selchange', () => { if (el('mlVarChecklist').children.length) buildMlPickers(true); });
