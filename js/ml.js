/* Paso 7 (Bloque D): PCA, clustering y análisis de correspondencias. Cálculo en Pyodide. */

const PY_ML = String.raw`
import numpy as np, pandas as pd, json
from scipy.cluster import hierarchy
from scipy.spatial.distance import pdist, squareform
from sklearn.decomposition import PCA
from sklearn.cluster import KMeans
from sklearn.mixture import GaussianMixture
from sklearn.neighbors import NearestNeighbors
from sklearn.metrics import silhouette_samples, silhouette_score
import matplotlib.pyplot as plt
from matplotlib.patches import Ellipse

_ML = {}
PAL = ['#4c78a8','#f58518','#54a24b','#e45756','#72b7b2','#b279a2','#ff9da6','#9d755d','#bab0ac','#1b9e77','#d95f02','#7570b3']

def ml_prepare(json_str, cont_vars, cat_vars, standardize, group_key='taxon'):
    df = pd.DataFrame(json.loads(json_str))
    cont = [c for c in cont_vars if c in df.columns]
    cat = [c for c in cat_vars if c in df.columns]
    for k in cont: df[k] = pd.to_numeric(df[k], errors='coerce')
    d = df.dropna(subset=cont).reset_index(drop=True)
    X = d[cont].values.astype(float)
    mu, sd = X.mean(0), X.std(0, ddof=0); sd[sd == 0] = 1
    Xs = (X - mu) / sd if standardize else (X - mu)
    _ML.update(d=d, X=Xs, cont=cont, cat=cat, std=bool(standardize))
    _ML['group'] = d[group_key].astype(str).values if group_key in d.columns else np.array(['sp'] * len(d))
    _ML['coords'] = d[['decimalLongitude', 'decimalLatitude']].values if 'decimalLatitude' in d.columns else None
    _ML.pop('scores', None); _ML.pop('labels', None)
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
    tbl = [dict(dim=i + 1, valor_propio=round(float(eig[i]), 3), varianza=round(float(var[i]), 2),
               acumulada=round(float(cum[i]), 2)) for i in range(nd)]
    desc = []
    for k in range(min(4, nd)):
        for i in np.argsort(-np.abs(load[:, k]))[:6]:
            desc.append(dict(dim=k + 1, variable=vlabel(cont[i]),
                correlacion=round(float(load[i, k]), 3), contribucion=round(float(contrib[i, k]), 1),
                cos2=round(float(cos2[i, k]), 3)))
    return json.dumps(dict(table=tbl, desc=desc, kaiser=int(np.sum(eig > 1)),
        n80=int(np.argmax(cum >= 80) + 1) if cum.max() >= 80 else nd, ndim=nd,
        var=[round(float(v), 2) for v in var]))

def fig_scree():
    var = _ML['pca'].explained_variance_ratio_ * 100
    k = min(len(var), 15)
    fig, a = plt.subplots(figsize=(7, 3.6))
    a.bar(range(1, k + 1), var[:k], color='#4c78a8', alpha=.8)
    a.plot(range(1, k + 1), var[:k], 'o-', color='#e45756')
    for i, v in enumerate(var[:k]): a.text(i + 1, v + .6, f'{v:.1f}%', ha='center', fontsize=7)
    a.axhline(100 / len(var), color='#999', ls='--', lw=.8, label='umbral 1/p')
    a.set_xlabel('Dimensión'); a.set_ylabel('% de varianza'); a.set_title('Gráfico de sedimentación')
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
    a.plot(np.cos(th), np.sin(th), color='#bbb', lw=1)
    a.axhline(0, color='#ddd', lw=.8); a.axvline(0, color='#ddd', lw=.8)
    sm = plt.cm.ScalarMappable(cmap='viridis', norm=plt.Normalize(val.min(), val.max()))
    for t, k in enumerate(cont):
        c = sm.to_rgba(val[t])
        a.arrow(0, 0, load[t, i], load[t, j], color=c, head_width=.03, length_includes_head=True)
        a.text(load[t, i] * 1.12, load[t, j] * 1.12, vlabel(k), color=c, fontsize=8, ha='center')
    a.set_xlim(-1.15, 1.15); a.set_ylim(-1.15, 1.15); a.set_aspect('equal')
    a.set_xlabel(f'Dim {i+1} ({var[i]:.1f}%)'); a.set_ylabel(f'Dim {j+1} ({var[j]:.1f}%)')
    a.set_title(f'Círculo de correlación · color = {"calidad (cos²)" if color=="cos2" else "contribución"}')
    fig.colorbar(sm, ax=a, shrink=.7); fig.tight_layout(); return fig_to_b64(fig)

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
            a.scatter(sc[m, i], sc[m, j], s=16, color=col, alpha=.7, label=gg, edgecolor='white', linewidth=.2)
            _conf_ellipse(sc[m, i], sc[m, j], a, col)
        a.legend(fontsize=7)
    else:
        hb = a.hexbin(sc[:, i], sc[:, j], gridsize=28, cmap='viridis', mincnt=1)
        fig.colorbar(hb, ax=a, shrink=.7)
    a.axhline(0, color='#ddd', lw=.8); a.axvline(0, color='#ddd', lw=.8)
    a.set_xlabel(f'Dim {i+1} ({var[i]:.1f}%)'); a.set_ylabel(f'Dim {j+1} ({var[j]:.1f}%)')
    a.set_title('Mapa de individuos'); fig.tight_layout(); return fig_to_b64(fig)

def fig_biplot(axes='12'):
    i, j = _axes(axes); sc = _ML['scores']; load = _ML['load']; cont = _ML['cont']; g = _ML['group']
    var = _ML['pca'].explained_variance_ratio_ * 100
    sf = 0.8 * np.abs(sc[:, [i, j]]).max() / np.abs(load[:, [i, j]]).max()
    fig, a = plt.subplots(figsize=(7.5, 6))
    for t, gg in enumerate(sorted(set(g.tolist()))):
        m = g == gg
        a.scatter(sc[m, i], sc[m, j], s=12, color=PAL[t % len(PAL)], alpha=.5, label=gg)
    for t, k in enumerate(cont):
        a.arrow(0, 0, load[t, i] * sf, load[t, j] * sf, color='#333', head_width=sf * .03, length_includes_head=True)
        a.text(load[t, i] * sf * 1.1, load[t, j] * sf * 1.1, vlabel(k), fontsize=7, color='#b2182b')
    a.axhline(0, color='#ddd', lw=.8); a.axvline(0, color='#ddd', lw=.8)
    a.set_xlabel(f'Dim {i+1} ({var[i]:.1f}%)'); a.set_ylabel(f'Dim {j+1} ({var[j]:.1f}%)')
    a.set_title('Biplot (individuos + variables)'); a.legend(fontsize=7); fig.tight_layout(); return fig_to_b64(fig)

def fig_contrib():
    cont = _ML['cont']; contrib = _ML['contrib']; cos2 = _ML['cos2']
    fig, ax = plt.subplots(1, 3, figsize=(13, 4))
    for d in range(2):
        order = np.argsort(-contrib[:, d])
        ax[d].barh([vlabel(cont[o]) for o in order][::-1], contrib[order, d][::-1], color='#4c78a8')
        ax[d].axvline(100 / len(cont), color='#e45756', ls='--', lw=1)
        ax[d].set_title(f'Contribución a Dim {d+1} (%)'); ax[d].tick_params(labelsize=7)
    im = ax[2].imshow(cos2[:, :min(5, cos2.shape[1])], cmap='YlOrRd', aspect='auto')
    ax[2].set_yticks(range(len(cont))); ax[2].set_yticklabels([vlabel(c) for c in cont], fontsize=7)
    ax[2].set_xticks(range(min(5, cos2.shape[1]))); ax[2].set_xticklabels([f'Dim{i+1}' for i in range(min(5, cos2.shape[1]))], fontsize=7)
    ax[2].set_title('cos² (calidad de representación)'); fig.colorbar(im, ax=ax[2], shrink=.7)
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
    n, d = X.shape; m = m or max(5, min(150, n // 4))
    nb = NearestNeighbors(n_neighbors=2).fit(X)
    idx = np.random.choice(n, m, replace=False)
    uj = nb.kneighbors(X[idx], return_distance=True)[0][:, 1]
    rand = np.random.uniform(X.min(0), X.max(0), (m, d))
    wj = nb.kneighbors(rand, n_neighbors=1, return_distance=True)[0][:, 0]
    s = np.sum(wj) + np.sum(uj)
    return float(np.sum(wj) / s) if s > 0 else 0.5

def _vat_order(D):
    n = D.shape[0]; P = [int(np.unravel_index(np.argmax(D), D.shape)[0])]
    rem = set(range(n)) - set(P)
    while rem:
        best, bd = None, np.inf
        for j in rem:
            dj = min(D[j, p] for p in P)
            if dj < bd: bd, best = dj, j
        P.append(best); rem.discard(best)
    return np.array(P)

def cl_tendency(use_pca, nd):
    X = _cdata(use_pca, nd)
    H = _hopkins(X)
    D = squareform(pdist(X))
    o = _vat_order(D)
    fig, ax = plt.subplots(1, 2, figsize=(11, 4.4))
    ax[0].hist(pdist(X), bins=40, color='#72b7b2'); ax[0].set_title('Distribución de distancias')
    im = ax[1].imshow(D[np.ix_(o, o)], cmap='viridis'); ax[1].set_title('VAT (imagen de disimilitud ordenada)')
    ax[1].set_xticks([]); ax[1].set_yticks([]); fig.colorbar(im, ax=ax[1], shrink=.7)
    fig.suptitle(f'Estadístico de Hopkins = {H:.3f}  ' +
                 ('(muy agrupable)' if H > .75 else '(agrupable)' if H > .6 else '(cercano a aleatorio)'))
    fig.tight_layout(); return json.dumps(dict(hopkins=round(H, 3), img=fig_to_b64(fig)))

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
    X = _cdata(use_pca, nd); ks = list(range(2, kmax + 1))
    wss = [KMeans(k, n_init=5, random_state=0).fit(X).inertia_ for k in [1] + ks]
    sil = [silhouette_score(X, KMeans(k, n_init=5, random_state=0).fit_predict(X)) for k in ks]
    gap, sk = _gap(X, ks)
    k_sil = ks[int(np.argmax(sil))]
    k_gap = next((ks[i] for i in range(len(ks) - 1) if gap[i] >= gap[i + 1] - sk[i + 1]), ks[int(np.argmax(gap))])
    fig, ax = plt.subplots(1, 3, figsize=(13, 3.8))
    ax[0].plot([1] + ks, wss, 'o-', color='#4c78a8'); ax[0].set_title('Codo (WSS)'); ax[0].set_xlabel('k')
    ax[1].plot(ks, sil, 'o-', color='#54a24b'); ax[1].axvline(k_sil, color='#e45756', ls='--')
    ax[1].set_title(f'Silueta media (mejor k={k_sil})'); ax[1].set_xlabel('k')
    ax[2].errorbar(ks, gap, yerr=sk, fmt='o-', color='#f58518'); ax[2].axvline(k_gap, color='#e45756', ls='--')
    ax[2].set_title(f'Estadístico gap (k={k_gap})'); ax[2].set_xlabel('k')
    fig.tight_layout()
    return json.dumps(dict(img=fig_to_b64(fig), k_sil=int(k_sil), k_gap=int(k_gap)))

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
    intra = max(D[np.ix_(lab == c, lab == c)].max() for c in cl)
    inter = min(D[np.ix_(lab == a, lab == b)][D[np.ix_(lab == a, lab == b)] > 0].min()
                for i, a in enumerate(cl) for b in cl[i + 1:])
    return float(inter / intra) if intra > 0 else None

def cl_kdist(use_pca, nd, minpts):
    X = _cdata(use_pca, nd)
    nb = NearestNeighbors(n_neighbors=minpts).fit(X)
    d = np.sort(nb.kneighbors(X)[0][:, -1])
    fig, a = plt.subplots(figsize=(7, 3.6))
    a.plot(d, color='#4c78a8'); a.set_xlabel('puntos ordenados'); a.set_ylabel(f'{minpts}-distancia')
    a.set_title('Gráfico de k-distancias (busca el "codo" para eps)')
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
        from sklearn.cluster import DBSCAN
        lab = DBSCAN(eps=eps, min_samples=minpts).fit_predict(X)
    _ML['labels'] = lab
    uniq = sorted(set(lab.tolist()))
    valid = [c for c in uniq if c >= 0]
    sizes = {int(c): int((lab == c).sum()) for c in uniq}
    sil = None
    if len(valid) > 1 and (lab >= 0).sum() > len(valid):
        mask = lab >= 0
        sil = float(silhouette_score(X[mask], lab[mask]))
    res = dict(method=method, k=len(valid), sizes=sizes, noise=int((lab == -1).sum()),
               silhouette=round(sil, 3) if sil is not None else None,
               dunn=(lambda x: round(x, 3) if x else None)(_dunn(D, lab)),
               cophenetic=round(coph, 3) if coph is not None else None)
    figs = {}
    if Z is not None:
        figs['dendro'] = _fig_dendro(Z, k)
    figs['scatter'] = _fig_cluster_scatter(X, lab, use_pca)
    figs['profile'] = _fig_cluster_profile(lab)
    if sil is not None:
        figs['silhouette'] = _fig_silhouette(X, lab)
    res['figs'] = figs
    return json.dumps(res)

def _fig_dendro(Z, k):
    hs = np.sort(Z[:, 2]); cut = (hs[-k] + hs[-k + 1]) / 2 if k < len(hs) else hs[-1]
    fig, a = plt.subplots(figsize=(11, 4.6))
    hierarchy.dendrogram(Z, no_labels=True, color_threshold=cut, ax=a)
    a.axhline(cut, color='#e45756', ls='--', lw=1.3, label=f'corte para k={k}')
    a.set_ylabel('altura'); a.set_title(f'Dendrograma (corte en {cut:.2f} → {k} grupos)')
    a.legend(fontsize=8); fig.tight_layout(); return fig_to_b64(fig)

def _fig_cluster_scatter(X, lab, use_pca):
    if 'scores' in _ML and use_pca:
        sc = _ML['scores']; xl, yl = 'Dim 1', 'Dim 2'
    else:
        sc = PCA(2).fit_transform(X); xl, yl = 'PC 1', 'PC 2'
    fig, a = plt.subplots(figsize=(7, 5.4))
    for c in sorted(set(lab.tolist())):
        m = lab == c
        col = '#999' if c == -1 else PAL[c % len(PAL)]
        a.scatter(sc[m, 0], sc[m, 1], s=16, color=col, alpha=.75,
                  label='ruido' if c == -1 else f'grupo {c+1}', edgecolor='white', linewidth=.2)
        if c != -1: _conf_ellipse(sc[m, 0], sc[m, 1], a, col)
    a.set_xlabel(xl); a.set_ylabel(yl); a.set_title('Clusters en el plano principal')
    a.legend(fontsize=7); fig.tight_layout(); return fig_to_b64(fig)

def _fig_cluster_profile(lab):
    cont = _ML['cont']; X = _ML['X']
    cl = [c for c in sorted(set(lab.tolist())) if c >= 0]
    M = np.array([X[lab == c].mean(0) for c in cl])
    fig, a = plt.subplots(figsize=(max(6, len(cont) * .5), 0.7 * len(cl) + 1.5))
    im = a.imshow(M, cmap='RdBu_r', aspect='auto', vmin=-np.abs(M).max(), vmax=np.abs(M).max())
    a.set_xticks(range(len(cont))); a.set_xticklabels([vlabel(c) for c in cont], rotation=90, fontsize=7)
    a.set_yticks(range(len(cl))); a.set_yticklabels([f'grupo {c+1}' for c in cl])
    for i in range(len(cl)):
        for j in range(len(cont)): a.text(j, i, f'{M[i,j]:.1f}', ha='center', va='center', fontsize=6)
    a.set_title('Perfil de cada grupo (media estandarizada)'); fig.colorbar(im, ax=a, shrink=.7)
    fig.tight_layout(); return fig_to_b64(fig)

def _fig_silhouette(X, lab):
    m = lab >= 0; sv = silhouette_samples(X[m], lab[m]); ll = lab[m]
    cl = sorted(set(ll.tolist())); fig, a = plt.subplots(figsize=(7, 4.4)); y = 0
    for c in cl:
        s = np.sort(sv[ll == c]); a.barh(range(y, y + len(s)), s, height=1,
            color=PAL[c % len(PAL)], edgecolor='none'); y += len(s) + 8
    a.axvline(sv.mean(), color='#e45756', ls='--', label=f'media = {sv.mean():.2f}')
    a.set_xlabel('coeficiente de silueta'); a.set_yticks([]); a.set_title('Gráfico de silueta')
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

# ---------- correspondencias ----------
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

def _ca_fig(F, G, rlab, clab, var, title):
    fig, a = plt.subplots(figsize=(7.5, 6))
    a.scatter(F[:, 0], F[:, 1], color='#4c78a8', s=30)
    for i, l in enumerate(rlab): a.text(F[i, 0], F[i, 1], str(l), color='#4c78a8', fontsize=8)
    a.scatter(G[:, 0], G[:, 1], color='#e45756', marker='^', s=30)
    for i, l in enumerate(clab): a.text(G[i, 0], G[i, 1], str(l), color='#e45756', fontsize=8)
    a.axhline(0, color='#ddd', lw=.8); a.axvline(0, color='#ddd', lw=.8)
    a.set_xlabel(f'Dim 1 ({var[0]:.1f}%)'); a.set_ylabel(f'Dim 2 ({var[1]:.1f}%)')
    a.set_title(title); fig.tight_layout(); return fig_to_b64(fig)

def ml_ca(row_var, col_var):
    d = _ML['d']
    if row_var not in d.columns or col_var not in d.columns:
        return json.dumps(dict(error=f'La variable no está disponible.'))
    ct = pd.crosstab(d[row_var].fillna('NA').astype(str), d[col_var].fillna('NA').astype(str))
    if ct.shape[0] < 2 or ct.shape[1] < 2:
        return json.dumps(dict(error=f'La tabla de contingencia {row_var} × {col_var} es {ct.shape[0]}×{ct.shape[1]}; '
            'la AC simple necesita al menos 2 categorías en cada variable. Prueba con otras variables o usa ACM.'))
    F, G, inertia, var = _ca_core(ct.values)
    chi2 = None
    try:
        from scipy.stats import chi2_contingency
        chi2, p, _, _ = chi2_contingency(ct.values); chi2 = dict(chi2=round(float(chi2), 1), p=float(p))
    except Exception: pass
    tbl = [dict(dim=i + 1, inercia=round(float(inertia[i]), 4), varianza=round(float(var[i]), 2)) for i in range(len(inertia))]
    fig = _ca_fig(F, G, list(ct.index), list(ct.columns), var, f'AC: {row_var} × {col_var}')
    return json.dumps(dict(img=fig, table=tbl, chi2=chi2, contingency=ct.reset_index().to_dict('records')))

def ml_mca(cat_vars):
    d = _ML['d'][cat_vars].astype(str).fillna('NA')
    Z = pd.get_dummies(d)
    F, G, inertia, var = _ca_core(Z.values)
    fig, ax = plt.subplots(1, 2, figsize=(13, 5.6))
    g = _ML['group']
    for t, gg in enumerate(sorted(set(g.tolist()))):
        m = g == gg
        ax[0].scatter(F[m, 0], F[m, 1], s=12, color=PAL[t % len(PAL)], alpha=.5, label=gg)
    ax[0].set_title('Individuos'); ax[0].legend(fontsize=7)
    ax[1].scatter(G[:, 0], G[:, 1], color='#e45756', s=25)
    for i, l in enumerate(Z.columns): ax[1].text(G[i, 0], G[i, 1], l, fontsize=7)
    ax[1].set_title('Categorías')
    for a in ax:
        a.axhline(0, color='#ddd', lw=.8); a.axvline(0, color='#ddd', lw=.8)
        a.set_xlabel(f'Dim 1 ({var[0]:.1f}%)'); a.set_ylabel(f'Dim 2 ({var[1]:.1f}%)')
    fig.tight_layout()
    tbl = [dict(dim=i + 1, inercia=round(float(inertia[i]), 4), varianza=round(float(var[i]), 2)) for i in range(len(inertia))]
    return json.dumps(dict(img=fig_to_b64(fig), table=tbl))

def ml_famd(cat_vars):
    cont = _ML['cont']; d = _ML['d']
    Xc = _ML['X']  # ya estandarizado
    dummies = pd.get_dummies(d[cat_vars].astype(str).fillna('NA')) if cat_vars else pd.DataFrame(index=d.index)
    prop = dummies.mean(0).replace(0, 1e-9)
    Xd = (dummies.values - prop.values) / np.sqrt(prop.values)
    M = np.hstack([Xc, Xd]) if Xd.size else Xc
    pca = PCA().fit(M); sc = pca.transform(M); var = pca.explained_variance_ratio_ * 100
    g = _ML['group']
    fig, a = plt.subplots(figsize=(7.5, 6))
    for t, gg in enumerate(sorted(set(g.tolist()))):
        m = g == gg
        a.scatter(sc[m, 0], sc[m, 1], s=14, color=PAL[t % len(PAL)], alpha=.6, label=gg)
    a.axhline(0, color='#ddd', lw=.8); a.axvline(0, color='#ddd', lw=.8)
    a.set_xlabel(f'Dim 1 ({var[0]:.1f}%)'); a.set_ylabel(f'Dim 2 ({var[1]:.1f}%)')
    a.set_title('FAMD / AFDM (datos mixtos)'); a.legend(fontsize=7); fig.tight_layout()
    tbl = [dict(dim=i + 1, varianza=round(float(var[i]), 2), acumulada=round(float(np.cumsum(var)[i]), 2)) for i in range(min(8, len(var)))]
    return json.dumps(dict(img=fig_to_b64(fig), table=tbl))
`;

/* ============ JS ============ */
let mlReady = false, mlPrepared = false, clusterMap = null, clusterLayer = null;

function mlAllContVars() {
  const t = state.env.table || [];
  return [...Array(19)].map((_, i) => 'bio_' + (i + 1)).concat('elev').filter(k => t.some(r => r[k] != null));
}
function mlCatVars() {
  const t = state.env.table || [];
  const out = [];
  if (t.some(r => r.koppen_code)) out.push(['koppen_code', 'Clima de Köppen']);
  if (t.some(r => r.soil_wrb)) out.push(['soil_wrb', 'Tipo de suelo (WRB)']);
  if (t.some(r => r.country)) out.push(['country', 'País']);
  if (t.some(r => r.taxonRank)) out.push(['taxonRank', 'Rango taxonómico']);
  return out;
}

function buildMlPickers(force) {
  if (!force && el('mlVarChecklist').children.length) return;  // no re-generar si el usuario ya ajustó
  const rec = new Set((state.stats && state.stats.recommendedVars) || mlAllContVars());
  const box = el('mlVarChecklist'); box.innerHTML = '';
  mlAllContVars().forEach(k => {
    const meta = rasters.BIOCLIM_META[k];
    const l = document.createElement('label'); l.className = 'checkbox-label';
    l.innerHTML = `<input type="checkbox" value="${k}" ${rec.has(k) ? 'checked' : ''}>
      ${meta ? meta[0] : k}${rec.has(k) ? ' <span class="tag-info">recomendada</span>' : ''}`;
    box.appendChild(l);
  });
  const cbox = el('mlCatChecklist'); cbox.innerHTML = '';
  mlCatVars().forEach(([k, lab]) => {
    const l = document.createElement('label'); l.className = 'checkbox-label';
    l.innerHTML = `<input type="checkbox" value="${k}"> ${lab}`;
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

function refreshCaVarSelects() {
  const cats = mlCatVars();
  [el('caRowVar'), el('caColVar')].forEach((sel, n) => {
    sel.innerHTML = '';
    [['taxon', 'Taxón']].concat(cats).forEach(([k, lab]) => sel.add(new Option(lab, k)));
    if (cats.length && n === 1) sel.selectedIndex = 1;
  });
}

el('mlPrepareBtn').addEventListener('click', mlPrepare);

async function mlPrepare() {
  const cont = mlSelectedCont();
  if (cont.length < 3) { showMessage('mlMessages', 'error', 'Selecciona al menos 3 variables continuas.'); return; }
  clearMessages('mlMessages');
  showSpinner('Preparando datos en Python…');
  try {
    const py = await getPyodide();
    if (!mlReady) { py.runPython(PY_ML); mlReady = true; }
    py.globals.set('env_json', JSON.stringify(state.env.table));
    py.globals.set('cont_json', JSON.stringify(cont));
    py.globals.set('cat_json', JSON.stringify(mlSelectedCat()));
    py.globals.set('vlab_json', JSON.stringify(Object.fromEntries(
      cont.map(k => [k, rasters.BIOCLIM_META[k] ? rasters.BIOCLIM_META[k][0] : k]))));
    const info = JSON.parse(py.runPython(`import json as _j
set_var_labels(vlab_json)
ml_prepare(env_json, _j.loads(cont_json), _j.loads(cat_json), ${el('mlStandardize').checked ? 'True' : 'False'})`));
    mlPrepared = true;
    el('mlSections').style.display = 'block';
    showMessage('mlMessages', 'success',
      `Datos listos: ${info.n} individuos × ${info.p} variables` +
      (info.dropped ? ` (${info.dropped} descartados por datos faltantes).` : '.') +
      (info.cat.length ? ` Categóricas: ${info.cat.join(', ')}.` : ''));
  } catch (err) {
    console.error(err); showMessage('mlMessages', 'error', 'Error: ' + err.message);
  } finally { hideSpinner(); }
}

/* ---- PCA ---- */
el('pcaRunBtn').addEventListener('click', async () => {
  if (!mlPrepared) return;
  showSpinner('Ejecutando PCA…');
  try {
    const r = JSON.parse((await getPyodide()).runPython('ml_pca()'));
    statTiles('pcaSummary', [
      ['Dimensiones', r.ndim], ['Criterio de Kaiser', r.kaiser + ' comp.'],
      ['80% de varianza', r.n80 + ' comp.'], ['Var. Dim 1–2', (r.var[0] + r.var[1]).toFixed(1) + '%'],
    ]);
    buildTable('pcaEigTable', [
      { key: 'dim', label: 'Dim' }, { key: 'valor_propio', label: 'Valor propio' },
      { key: 'varianza', label: '% varianza' }, { key: 'acumulada', label: '% acumulada' }], r.table);
    buildTable('pcaDimDesc', [
      { key: 'dim', label: 'Dim' }, { key: 'variable', label: 'Variable' },
      { key: 'correlacion', label: 'Correlación' }, { key: 'contribucion', label: 'Contrib. %' },
      { key: 'cos2', label: 'cos²' }], r.desc);
    await refreshPcaFigs();
    el('pcaOut').style.display = 'block';
  } catch (e) { console.error(e); showMessage('mlMessages', 'error', 'Error en PCA: ' + e.message); }
  finally { hideSpinner(); }
});

async function refreshPcaFigs() {
  const ax = el('pcaAxes').value, vc = el('pcaVarColor').value, ic = el('pcaIndColor').value;
  imgInto('figScree', await runPy('fig_scree()'));
  imgInto('figVarCircle', await runPy(`fig_var_circle(${JSON.stringify(vc)}, ${JSON.stringify(ax)})`));
  imgInto('figIndividuals', await runPy(`fig_individuals(${JSON.stringify(ic)}, ${JSON.stringify(ax)})`));
  imgInto('figBiplot', await runPy(`fig_biplot(${JSON.stringify(ax)})`));
  imgInto('figContrib', await runPy('fig_contrib()'));
}
['pcaAxes', 'pcaVarColor', 'pcaIndColor'].forEach(id => el(id).addEventListener('change', async () => {
  showSpinner('Actualizando figuras…'); try { await refreshPcaFigs(); } finally { hideSpinner(); }
}));
el('dlPcaScores').addEventListener('click', async () => downloadBlob(
  (await getPyodide()).runPython('ml_pca_scores_csv()'),
  (state.query || 'especie').replace(/\s+/g, '_') + '_PCA_individuos.csv', 'text/csv;charset=utf-8'));

/* ---- clustering ---- */
el('clMethod').addEventListener('change', e => {
  el('clDbscanOpts').style.display = e.target.value === 'dbscan' ? 'inline' : 'none';
});
const clArgs = () => [el('clInput').value === 'pca' ? 'True' : 'False', +el('clNDims').value || 3];

el('clTendencyBtn').addEventListener('click', async () => {
  if (!ensurePca()) return;
  showSpinner('Evaluando tendencia de agrupamiento…');
  try {
    const [up, nd] = clArgs();
    const r = JSON.parse(await runPy(`cl_tendency(${up}, ${nd})`));
    imgInto('figTendency', r.img);
  } finally { hideSpinner(); }
});
el('clOptimalBtn').addEventListener('click', async () => {
  if (!ensurePca()) return;
  showSpinner('Buscando el número óptimo de clusters…');
  try {
    const [up, nd] = clArgs();
    const r = JSON.parse(await runPy(`cl_optimal(${up}, ${nd})`));
    imgInto('figOptimalK', r.img);
    showMessage('clOptimalNote', 'info', `Sugerencias: silueta → k=${r.k_sil}; gap → k=${r.k_gap}.`);
  } finally { hideSpinner(); }
});
el('clKdistBtn').addEventListener('click', async () => {
  if (!ensurePca()) return;
  showSpinner('Calculando k-distancias…');
  try {
    const [up, nd] = clArgs();
    imgInto('figKdist', await runPy(`cl_kdist(${up}, ${nd}, ${+el('clMinPts').value || 5})`));
  } finally { hideSpinner(); }
});

function ensurePca() {
  if (!mlPrepared) { showMessage('mlMessages', 'warning', 'Pulsa primero «Preparar datos».'); return false; }
  if (el('clInput').value === 'pca') {
    const hasScores = mlReady && window.__pyodide && window.__pyodide.runPython("1 if 'scores' in _ML else 0");
    if (!hasScores) {
      showMessage('mlMessages', 'warning', 'Ejecuta primero el PCA (o cambia la entrada a «variables estandarizadas»).');
      return false;
    }
  }
  return true;
}

el('clRunBtn').addEventListener('click', async () => {
  if (!ensurePca()) return;
  showSpinner('Ejecutando clustering…');
  try {
    const [up, nd] = clArgs();
    const m = el('clMethod').value, k = +el('clK').value || 3;
    const eps = +el('clEps').value || 1.5, mp = +el('clMinPts').value || 5;
    const r = JSON.parse(await runPy(`cl_run(${JSON.stringify(m)}, ${k}, ${up}, ${nd}, ${eps}, ${mp})`));
    const tiles = [['Grupos', r.k], ['Silueta media', r.silhouette ?? '—'], ['Índice de Dunn', r.dunn ?? '—']];
    if (r.cophenetic != null) tiles.push(['Corr. cofenética', r.cophenetic]);
    if (r.noise) tiles.push(['Ruido (DBSCAN)', r.noise]);
    statTiles('clSummary', tiles);
    el('figDendrogram').innerHTML = r.figs.dendro ? `<img src="${r.figs.dendro}" style="max-width:100%">` : '';
    imgInto('figClusterScatter', r.figs.scatter);
    imgInto('figClusterProfile', r.figs.profile);
    el('figSilhouette').innerHTML = r.figs.silhouette ? `<img src="${r.figs.silhouette}" style="max-width:100%">` : '';
    renderClusterMap(JSON.parse((await getPyodide()).runPython('cl_labels_json()')));
    el('clOut').style.display = 'block';
    enableStep(8);
  } catch (e) { console.error(e); showMessage('mlMessages', 'error', 'Error en clustering: ' + e.message); }
  finally { hideSpinner(); }
});

function renderClusterMap(pts) {
  if (!clusterMap) { clusterMap = mapkit.makeBaseMap('mapCluster'); window.__clusterMap = clusterMap; }
  if (clusterLayer) clusterMap.removeLayer(clusterLayer);
  clusterLayer = L.layerGroup();
  const cs = [...new Set(pts.map(p => p.cluster))].sort((a, b) => a - b);
  const cmap = {}; cs.forEach((c, i) => cmap[c] = c === 0 ? '#999' : mapkit.CAT_PALETTE[(c - 1) % mapkit.CAT_PALETTE.length]);
  pts.forEach(p => L.circleMarker([p.lat, p.lon], {
    radius: 5, weight: 1, color: '#fff', fillColor: cmap[p.cluster], fillOpacity: .85,
  }).bindPopup(`${p.taxon}<br>${p.cluster === 0 ? 'ruido' : 'grupo ' + p.cluster}`).addTo(clusterLayer));
  clusterLayer.addTo(clusterMap);
  mapkit.fitToPoints(clusterMap, pts.map(p => ({ decimalLatitude: p.lat, decimalLongitude: p.lon })));
  setTimeout(() => clusterMap.invalidateSize(), 60);
  el('mapClusterLegend').innerHTML = '<strong style="width:100%">Grupos</strong>' + cs.map(c =>
    `<div class="legend-item"><span class="legend-swatch" style="background:${cmap[c]}"></span>${c === 0 ? 'ruido' : 'grupo ' + c}</div>`).join('');
}

el('dlClusters').addEventListener('click', async () => downloadBlob(
  (await getPyodide()).runPython('cl_labels_csv()'),
  (state.query || 'especie').replace(/\s+/g, '_') + '_clusters.csv', 'text/csv;charset=utf-8'));

/* ---- correspondencias ---- */
el('caType').addEventListener('change', e => {
  el('caSimpleVars').style.display = e.target.value === 'ca' ? 'inline' : 'none';
});
el('caRunBtn').addEventListener('click', async () => {
  if (!mlPrepared) return;
  const type = el('caType').value;
  showSpinner('Ejecutando análisis de correspondencias…');
  try {
    const py = await getPyodide();
    let r;
    if (type === 'ca') {
      r = JSON.parse(await runPy(`ml_ca(${JSON.stringify(el('caRowVar').value)}, ${JSON.stringify(el('caColVar').value)})`));
      if (r.error) { showMessage('mlMessages', 'warning', r.error); return; }
      if (r.chi2) statTiles('caSummary', [['χ²', r.chi2.chi2], ['p', r.chi2.p < 0.001 ? '<0.001' : r.chi2.p.toFixed(3)],
        ['Dim 1 %', r.table[0].varianza], ['Dim 2 %', (r.table[1] || {}).varianza ?? '—']]);
      else statTiles('caSummary', r.table.slice(0, 2).map(t => ['Dim ' + t.dim + ' %', t.varianza]));
      imgInto('figCaContrib', '');
    } else if (type === 'mca') {
      const cats = mlSelectedCat();
      if (cats.length < 2) { showMessage('mlMessages', 'warning', 'La ACM necesita ≥2 variables categóricas seleccionadas arriba.'); return; }
      py.globals.set('cats_json', JSON.stringify(cats));
      r = JSON.parse(await runPy('ml_mca(__import__("json").loads(cats_json))'));
      statTiles('caSummary', r.table.slice(0, 3).map(t => ['Dim ' + t.dim + ' %', t.varianza]));
      imgInto('figCaContrib', '');
    } else {
      const cats = mlSelectedCat();
      py.globals.set('cats_json', JSON.stringify(cats));
      r = JSON.parse(await runPy('ml_famd(__import__("json").loads(cats_json))'));
      statTiles('caSummary', r.table.slice(0, 3).map(t => ['Dim ' + t.dim + ' %', t.varianza]));
      imgInto('figCaContrib', '');
    }
    imgInto('figCaBiplot', r.img);
    if (r.table) buildTable('caTable', Object.keys(r.table[0]).map(k => ({ key: k, label: k })), r.table);
    el('caOut').style.display = 'block';
  } catch (e) { console.error(e); showMessage('mlMessages', 'error', 'Error en AC: ' + e.message); }
  finally { hideSpinner(); }
});

el('toStep7Btn') && el('toStep7Btn').addEventListener('click', () => { goToStep(7); buildMlPickers(true); });

window.buildMlPickers = buildMlPickers;
