/* Bloque E · Modelado de distribución de especies (SDM). Motor en Python (Pyodide).
   MaxEnt se implementa al estilo del paquete R «maxnet» (Phillips et al. 2017): regresión
   logística penalizada L1 sobre características lineal/cuadrática/producto/bisagra, con las
   constantes de regularización de maxnet, salida cloglog. Es estadísticamente equivalente a
   MaxEnt (Renner & Warton 2013) pero no idéntica al programa Java. */

const PY_SDM = String.raw`
import numpy as np, json, math
from scipy import stats
from scipy.special import logsumexp
from scipy.spatial import cKDTree
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import SplineTransformer
from sklearn.svm import SVC
from sklearn.neural_network import MLPClassifier
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import HistGradientBoostingClassifier
from pyodide.ffi import to_js
import matplotlib.pyplot as plt

_SDM = {}
LABEL = {'maxent': 'MaxEnt', 'glm': 'GLM', 'gam': 'GAM', 'rf': 'Random Forest', 'brt': 'BRT',
         'svm': 'SVM', 'ann': 'Red neuronal', 'bioclim': 'Bioclim', 'domain': 'Domain', 'mahal': 'Mahalanobis'}
PALS = ['#4c78a8', '#f58518', '#54a24b', '#e45756', '#72b7b2', '#b279a2', '#9d755d', '#bab0ac', '#1b9e77', '#d95f02', '#7570b3', '#e7298a']
RE = 6371.0088

# ------------------------------------------------------------------ métricas
def _auc(pos, neg):
    pos = np.asarray(pos, float); neg = np.asarray(neg, float)
    if len(pos) == 0 or len(neg) == 0: return float('nan')
    r = stats.rankdata(np.r_[pos, neg]); n1, n0 = len(pos), len(neg)
    return float((r[:n1].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))

def _thresholds(pp, pb):
    pp = np.sort(np.asarray(pp, float)); pb = np.sort(np.asarray(pb, float))
    cand = np.unique(np.r_[pp, pb])
    if len(cand) > 4000: cand = np.unique(np.quantile(np.r_[pp, pb], np.linspace(0, 1, 4000)))
    sens = 1 - np.searchsorted(pp, cand, 'left') / len(pp)      # fracción de presencias >= t
    spec = np.searchsorted(pb, cand, 'left') / len(pb)          # fracción de fondo < t
    tss = sens + spec - 1
    i = int(np.argmax(tss)); j = int(np.argmin(np.abs(sens - spec)))
    return dict(mtp=float(pp[0]), p10=float(np.percentile(pp, 10)), maxtss=float(cand[i]),
                eqss=float(cand[j]), tss=float(tss[i]))

def _boyce(avail, obs, res=100):
    avail = np.asarray(avail, float); obs = np.asarray(obs, float)
    avail = avail[np.isfinite(avail)]; obs = obs[np.isfinite(obs)]
    if len(obs) < 5 or len(avail) < 20: return float('nan')
    mn = min(avail.min(), obs.min()); mx = max(avail.max(), obs.max())
    if mx - mn < 1e-9: return float('nan')
    w = (mx - mn) / 10.0
    lows = np.linspace(mn, mx - w, res + 1)
    pa = np.sort(avail); po = np.sort(obs)
    cnt = lambda s, lo, hi: np.searchsorted(s, hi, 'right') - np.searchsorted(s, lo, 'left')
    P = cnt(po, lows, lows + w) / len(po); E = cnt(pa, lows, lows + w) / len(pa)
    ok = E > 0
    F = np.where(ok, P / np.where(ok, E, 1.0), np.nan)
    idx = np.where(np.isfinite(F))[0]
    if len(idx) < 4: return float('nan')
    Fk = F[idx]; mk = (lows + w / 2)[idx]
    keep = np.r_[Fk[:-1] != Fk[1:], True]           # ecospat: descarta valores repetidos consecutivos
    if keep.sum() < 4: return float('nan')
    r = stats.spearmanr(mk[keep], Fk[keep]).correlation
    return float(r)

# ------------------------------------------------------------------ características de MaxEnt
_LREG = ([0, 10, 30, 100], [1, 1, 0.2, 0.05])
_QREG = ([0, 10, 17, 30, 100], [1.3, 0.8, 0.5, 0.25, 0.05])
_PREG = ([0, 10, 17, 30, 100], [2.6, 1.6, 0.9, 0.55, 0.05])

def _feat_desc(p, classes, nknots):
    d = []
    if 'l' in classes: d += [('l', i, 0, 0.0) for i in range(p)]
    if 'q' in classes: d += [('q', i, 0, 0.0) for i in range(p)]
    if 'p' in classes: d += [('p', i, j, 0.0) for i in range(p) for j in range(i + 1, p)]
    if 'h' in classes:
        ks = np.linspace(0, 1, nknots)
        d += [('hf', i, 0, float(k)) for i in range(p) for k in ks[:-1]]
        d += [('hr', i, 0, float(k)) for i in range(p) for k in ks[1:]]
    return d

def _feat_col(dsc, xs):
    kind, i, j, k = dsc
    if kind == 'l': return xs[:, i]
    if kind == 'q': return xs[:, i] ** 2
    if kind == 'p': return xs[:, i] * xs[:, j]
    if kind == 'hf': return np.clip((xs[:, i] - k) / (1 - k), 0, 1)
    return np.clip(xs[:, i] / k, 0, 1)

def _feat_matrix(desc, xs):
    F = np.empty((len(xs), len(desc)), dtype=np.float64)
    for c, d in enumerate(desc): F[:, c] = _feat_col(d, xs)
    return F

# ------------------------------------------------------------------ modelos
class _Base:
    def predict(self, X, chunk=20000):
        X = np.asarray(X, np.float32)
        out = np.full(len(X), np.nan, np.float32)
        idx = np.where(np.isfinite(X).all(1))[0]
        for s in range(0, len(idx), chunk):
            ii = idx[s:s + chunk]
            out[ii] = np.asarray(self._pred(X[ii].astype(np.float64)), dtype=np.float32)
        return out

class MaxEnt(_Base):
    def __init__(self, classes='auto', regmult=1.0, nknots=10, clamp=True, tol=1e-5, out='cloglog', max_iter=300):
        self.classes = classes; self.regmult = float(regmult); self.nknots = int(nknots)
        self.clamp = clamp; self.tol = tol; self.out = out; self.max_iter = int(max_iter)

    def _scale(self, X):
        xs = (X - self.mn) / self.rg
        return np.clip(xs, 0, 1) if self.clamp else xs

    def fit(self, Xp, Xb):
        Xp = np.asarray(Xp, np.float64); Xb = np.asarray(Xb, np.float64)
        X = np.vstack([Xp, Xb]); npres = len(Xp); p = X.shape[1]
        self.mn = X.min(0); self.rg = np.maximum(X.max(0) - self.mn, 1e-9)
        cls = self.classes
        if cls == 'auto': cls = 'l' if npres < 10 else 'lq' if npres < 15 else 'lqh' if npres < 80 else 'lqph'
        self.cls = cls
        desc = _feat_desc(p, cls, self.nknots)
        F = _feat_matrix(desc, self._scale(X))
        rng_all = F.max(0) - F.min(0)
        keep = rng_all > 1e-12
        desc = [d for d, k in zip(desc, keep) if k]; F = F[:, keep]; rng_all = rng_all[keep]
        kinds = np.array([d[0] for d in desc]); hing = np.isin(kinds, ['hf', 'hr'])
        sdp = F[:npres].std(0, ddof=1) if npres > 1 else np.zeros(F.shape[1])
        tab = _LREG
        if 'q' in cls: tab = _QREG
        if 'p' in cls: tab = _PREG
        sq = math.sqrt(npres)
        creg = np.where(hing, 0.5, np.interp(npres, tab[0], tab[1])) / sq
        hmin = np.where(hing, np.maximum(sdp, 1 / sq) * 0.5 / sq, 0.0)
        reg = np.maximum.reduce([0.001 * rng_all, hmin, sdp * creg]) * self.regmult
        w = np.r_[np.ones(npres), np.full(len(Xb), 100.0)]
        y = np.r_[np.ones(npres), np.zeros(len(Xb))]
        scale = npres * reg
        import warnings
        clf = LogisticRegression(penalty='l1', C=1.0, solver='liblinear', tol=self.tol, max_iter=self.max_iter,
                                 intercept_scaling=100.0, fit_intercept=True)
        with warnings.catch_warnings():
            warnings.simplefilter('ignore'); clf.fit(F / scale, y, sample_weight=w)
        beta = clf.coef_[0] / scale
        nz = np.abs(beta) > 0
        self.desc_all = desc; self.reg = reg; self.scale_all = scale; self.intercept = float(clf.intercept_[0])
        self.beta_all = beta
        self.beta = beta[nz]; self.sub = [d for d, k in zip(desc, nz) if k]
        eta_b = self._eta(Xb)
        self.alpha = float(-logsumexp(eta_b))
        raw = np.exp(eta_b + self.alpha)
        self.H = float(-np.sum(np.where(raw > 0, raw * np.log(np.where(raw > 0, raw, 1.0)), 0.0)))
        return self

    def _eta(self, X):
        xs = self._scale(np.asarray(X, np.float64)); eta = np.zeros(len(xs))
        for b, d in zip(self.beta, self.sub): eta += b * _feat_col(d, xs)
        return eta

    def raw(self, X):
        X = np.asarray(X, np.float64); return np.exp(self._eta(X) + self.alpha)

    def _pred(self, X):
        z = np.clip(self.H + self._eta(X) + self.alpha, -700, 50)
        if self.out == 'raw': return np.exp(np.clip(self._eta(X) + self.alpha, -700, 50))
        if self.out == 'logistic': return 1 / (1 + np.exp(-z))
        return -np.expm1(-np.exp(z))

class _Std:
    def zfit(self, X):
        self.mu = X.mean(0); self.sd = X.std(0) + 1e-9
        Z = (X - self.mu) / self.sd; self.zlo = Z.min(0); self.zhi = Z.max(0); return Z
    def z(self, X): return np.clip((X - self.mu) / self.sd, self.zlo, self.zhi)

class GLM(_Base, _Std):
    def fit(self, Xp, Xb):
        X = np.vstack([Xp, Xb]).astype(np.float64); Z = self.zfit(X)
        y = np.r_[np.ones(len(Xp)), np.zeros(len(Xb))]; w = np.r_[np.ones(len(Xp)), np.full(len(Xb), len(Xp) / len(Xb))]
        self.clf = LogisticRegression(C=1.0, max_iter=2000).fit(np.c_[Z, Z ** 2], y, sample_weight=w); return self
    def _pred(self, X):
        Z = self.z(X); return self.clf.predict_proba(np.c_[Z, Z ** 2])[:, 1]

class GAM(_Base, _Std):
    def fit(self, Xp, Xb):
        X = np.vstack([Xp, Xb]).astype(np.float64); Z = self.zfit(X)
        self.sp = SplineTransformer(n_knots=6, degree=3, knots='quantile', extrapolation='constant')
        F = self.sp.fit_transform(Z)
        y = np.r_[np.ones(len(Xp)), np.zeros(len(Xb))]; w = np.r_[np.ones(len(Xp)), np.full(len(Xb), len(Xp) / len(Xb))]
        self.clf = LogisticRegression(C=0.5, max_iter=3000).fit(F, y, sample_weight=w); return self
    def _pred(self, X): return self.clf.predict_proba(self.sp.transform(self.z(X)))[:, 1]

class RFDS(_Base):
    def __init__(self, ntrees=200, seed=0): self.ntrees = int(ntrees); self.seed = seed
    def fit(self, Xp, Xb):
        rng = np.random.default_rng(self.seed); n = len(Xp); p = Xp.shape[1]
        mf = max(1, int(round(math.sqrt(p)))); self.trees = []
        Xp = np.asarray(Xp, np.float32); Xb = np.asarray(Xb, np.float32); nb = len(Xb)
        sp = np.zeros(n); cp = np.zeros(n); sb = np.zeros(nb); cb = np.zeros(nb)
        for t in range(self.ntrees):
            ip = rng.integers(0, n, n); ib = rng.integers(0, nb, n)
            tr = DecisionTreeClassifier(max_features=mf, random_state=int(rng.integers(0, 2 ** 31 - 1)))
            tr.fit(np.vstack([Xp[ip], Xb[ib]]), np.r_[np.ones(n), np.zeros(n)]); self.trees.append(tr)
            op = np.ones(n, bool); op[ip] = False; ob = np.ones(nb, bool); ob[ib] = False   # filas fuera de la bolsa
            if op.any(): sp[op] += tr.predict_proba(Xp[op])[:, 1]; cp[op] += 1
            sb[ob] += tr.predict_proba(Xb[ob])[:, 1]; cb[ob] += 1
        # predicciones out-of-bag: evitan el sobreajuste al calcular umbrales y métricas de entrenamiento
        self.train_pred = (sp / np.maximum(cp, 1), sb / np.maximum(cb, 1))
        return self
    def _pred(self, X):
        X = X.astype(np.float32); acc = np.zeros(len(X))
        for t in self.trees: acc += t.predict_proba(X)[:, 1]
        return acc / len(self.trees)

class BRT(_Base):
    def __init__(self, iters=300, lr=0.05, seed=0): self.iters = int(iters); self.lr = float(lr); self.seed = seed
    def fit(self, Xp, Xb):
        X = np.vstack([Xp, Xb]); y = np.r_[np.ones(len(Xp)), np.zeros(len(Xb))]
        w = np.r_[np.ones(len(Xp)), np.full(len(Xb), len(Xp) / len(Xb))]
        self.m = HistGradientBoostingClassifier(max_iter=self.iters, learning_rate=self.lr, max_leaf_nodes=8,
            min_samples_leaf=10, l2_regularization=1.0, early_stopping=True, n_iter_no_change=25,
            validation_fraction=0.2, random_state=self.seed).fit(X, y, sample_weight=w)
        self.n_iter = int(self.m.n_iter_); return self
    def _pred(self, X): return self.m.predict_proba(X)[:, 1]

class SVMm(_Base, _Std):
    def __init__(self, seed=0): self.seed = seed
    def fit(self, Xp, Xb):
        rng = np.random.default_rng(self.seed)
        ip = rng.choice(len(Xp), min(len(Xp), 1500), replace=False)
        ib = rng.choice(len(Xb), min(len(Xb), max(600, 2 * len(ip)), 3000), replace=False)
        X = np.vstack([Xp[ip], Xb[ib]]).astype(np.float64); Z = self.zfit(X)
        self.clf = SVC(kernel='rbf', C=1.0, gamma='scale', probability=True, class_weight='balanced',
                       random_state=self.seed).fit(Z, np.r_[np.ones(len(ip)), np.zeros(len(ib))]); return self
    def _pred(self, X): return self.clf.predict_proba(self.z(X))[:, 1]

class ANN(_Base, _Std):
    def __init__(self, nets=5, seed=0): self.nets = int(nets); self.seed = seed
    def fit(self, Xp, Xb):
        rng = np.random.default_rng(self.seed); n = len(Xp)
        self.zfit(np.vstack([Xp, Xb]).astype(np.float64)); self.ms = []
        for t in range(self.nets):
            ib = rng.choice(len(Xb), min(len(Xb), n), replace=False)
            Z = self.z(np.vstack([Xp, Xb[ib]]).astype(np.float64))
            m = MLPClassifier(hidden_layer_sizes=(12,), alpha=0.01, max_iter=400, random_state=self.seed + t)
            m.fit(Z, np.r_[np.ones(n), np.zeros(len(ib))]); self.ms.append(m)
        return self
    def _pred(self, X):
        Z = self.z(X); return np.mean([m.predict_proba(Z)[:, 1] for m in self.ms], axis=0)

class Bioclim(_Base):
    def fit(self, Xp, Xb):
        self.S = [np.sort(Xp[:, j].astype(np.float64)) for j in range(Xp.shape[1])]; return self
    def _pred(self, X):
        out = np.ones(len(X))
        for j, s in enumerate(self.S):
            p = np.searchsorted(s, X[:, j], 'right') / len(s)
            out = np.minimum(out, 2 * np.minimum(p, 1 - p))
        return out

class Domain(_Base):
    def fit(self, Xp, Xb):
        X = np.vstack([Xp, Xb]).astype(np.float64); self.rg = np.maximum(X.max(0) - X.min(0), 1e-9)
        self.P = np.asarray(Xp, np.float64)
        # predicciones de entrenamiento «dejando uno fuera»: sin ellas cada presencia se predice a sí misma (idoneidad 1)
        self.train_pred = (self._pred(Xp, loo=True), self._pred(Xb, loo=True)); return self
    def _pred(self, X, loo=False):
        X = np.asarray(X, np.float64); out = np.empty(len(X)); step = max(1, int(3e6 // (len(self.P) * X.shape[1] + 1)))
        for s in range(0, len(X), step):
            d = (np.abs(X[s:s + step, None, :] - self.P[None, :, :]) / self.rg).mean(2)
            if loo: d[d <= 1e-12] = np.inf
            out[s:s + step] = 1 - d.min(1)
        return np.clip(out, 0, 1)

class Mahal(_Base):
    def fit(self, Xp, Xb):
        P = np.asarray(Xp, np.float64); self.mu = P.mean(0)
        C = np.cov(P.T) + 1e-6 * np.eye(P.shape[1]); self.ci = np.linalg.pinv(C); self.df = P.shape[1]; return self
    def _pred(self, X):
        d = X - self.mu; d2 = np.einsum('ij,jk,ik->i', d, self.ci, d); return stats.chi2.sf(d2, self.df)

def _make(algo, prm, seed):
    prm = prm or {}
    if algo == 'maxent': return MaxEnt(prm.get('classes', 'auto'), prm.get('regmult', 1.0), prm.get('nknots', 10))
    if algo == 'glm': return GLM()
    if algo == 'gam': return GAM()
    if algo == 'rf': return RFDS(prm.get('ntrees', 200), seed)
    if algo == 'brt': return BRT(prm.get('iters', 300), prm.get('lr', 0.05), seed)
    if algo == 'svm': return SVMm(seed)
    if algo == 'ann': return ANN(prm.get('nets', 5), seed)
    if algo == 'bioclim': return Bioclim()
    if algo == 'domain': return Domain()
    if algo == 'mahal': return Mahal()
    raise ValueError('algoritmo desconocido: ' + str(algo))

# ------------------------------------------------------------------ preparación de datos
def _xyz(lon, lat):
    lo = np.radians(lon); la = np.radians(lat)
    return np.c_[np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)] * RE

def _cell_area(lat, dx, dy):
    a = np.radians(dx) * RE ** 2 * (np.sin(np.radians(lat + dy / 2)) - np.sin(np.radians(lat - dy / 2)))
    return np.abs(a)

def _grid_from_stack(stack, meta):
    nl = len(meta['keys']); n = meta['nrow'] * meta['ncol']
    G = np.frombuffer(stack.to_bytes(), dtype=np.float32).reshape(nl, n).copy()
    return G

def sdm_prepare(meta_json, stack, pres_json, opts_json, vlab_json):
    S = _SDM; S.clear()
    meta = json.loads(meta_json); opts = json.loads(opts_json); S['vlab'] = json.loads(vlab_json)
    keys = meta['keys']; nrow, ncol = meta['nrow'], meta['ncol']; n = nrow * ncol
    west, north, dx, dy = meta['west'], meta['north'], meta['dx'], meta['dy']
    G = _grid_from_stack(stack, meta)
    ii, jj = np.divmod(np.arange(n), ncol)
    lon = west + (jj + 0.5) * dx; lat = north - (ii + 0.5) * dy
    valid = np.isfinite(G).all(0)
    pres = json.loads(pres_json)
    plon = np.array([p['lon'] for p in pres], float); plat = np.array([p['lat'] for p in pres], float)
    pj = np.floor((plon - west) / dx).astype(int); pi_ = np.floor((north - plat) / dy).astype(int)
    inside = (pj >= 0) & (pj < ncol) & (pi_ >= 0) & (pi_ < nrow)
    cell = pi_ * ncol + pj
    ok = inside & valid[np.clip(cell, 0, n - 1)]
    cells_ok = cell[ok]
    pcells = np.unique(cells_ok) if opts.get('dedupe', True) else cells_ok
    # área de calibración: celdas válidas a <= R km de algún registro
    R = float(opts.get('radius', 300)); chord = 2 * RE * math.sin(min(R / (2 * RE), math.pi / 2))
    tree = cKDTree(_xyz(lon[pcells], lat[pcells]))
    vidx = np.where(valid)[0]
    d, _ = tree.query(_xyz(lon[vidx], lat[vidx]))
    calib = np.zeros(n, bool); calib[vidx[d <= chord]] = True
    cand = np.where(calib)[0]
    rng = np.random.default_rng(int(opts.get('seed', 42)))
    nbg = int(min(opts.get('nbg', 10000), len(cand)))
    bg = rng.choice(cand, nbg, replace=False)
    bgall = np.unique(np.r_[bg, pcells])          # maxnet: presencias se añaden al fondo
    S.update(keys=keys, meta=meta, G=G, valid=valid, lon=lon, lat=lat, calib=calib,
             pcells=pcells, bcells=bgall, n=n)
    S['Xp'] = G[:, pcells].T.copy(); S['Xb'] = G[:, bgall].T.copy()
    S['models'] = {}; S['pred'] = {}; S['cv'] = {}; S['final'] = {}; S['proj'] = {}; S['ens'] = None
    S['area'] = _cell_area(lat, dx, dy)
    sel = rng.choice(len(bgall), min(1500, len(bgall)), replace=False)
    return json.dumps(dict(n_records=int(len(pres)), n_in_extent=int(inside.sum()), n_valid=int(ok.sum()),
        n_presence=int(len(pcells)), n_background=int(len(bgall)), n_cells=int(n), n_valid_cells=int(valid.sum()),
        n_calib_cells=int(calib.sum()), layers=len(keys),
        pres_lon=lon[pcells].tolist(), pres_lat=lat[pcells].tolist(),
        bg_lon=lon[bgall[sel]].tolist(), bg_lat=lat[bgall[sel]].tolist()))

def sdm_get_mask():
    return to_js(np.where(_SDM['calib'], 1.0, np.where(_SDM['valid'], 0.0, np.nan)).astype(np.float32))

def sdm_reset_results():
    S = _SDM; S['models'] = {}; S['pred'] = {}; S['cv'] = {}; S['final'] = {}; S['proj'] = {}; S['ens'] = None
    return 'ok'

def _make_partition(scheme, k, seed):
    S = _SDM; rng = np.random.default_rng(int(seed))
    pl, pt = S['lon'][S['pcells']], S['lat'][S['pcells']]; bl, bt = S['lon'][S['bcells']], S['lat'][S['bcells']]
    npres = len(pl)
    if scheme == 'block':
        if npres < 8: raise ValueError('Se necesitan al menos 8 presencias para bloques espaciales.')
        o = np.argsort(pt); h = npres // 2
        lat_thr = (pt[o[h - 1]] + pt[o[h]]) / 2
        north = pt > lat_thr
        thr = {}
        for g in (True, False):
            idx = np.where(north == g)[0]; ol = idx[np.argsort(pl[idx])]; hh = len(ol) // 2
            thr[g] = (pl[ol[hh - 1]] + pl[ol[hh]]) / 2 if hh >= 1 else pl[ol].max()
        fp = north.astype(int) * 2 + (pl > np.where(north, thr[True], thr[False])).astype(int)
        nb = bt > lat_thr
        fb = nb.astype(int) * 2 + (bl > np.where(nb, thr[True], thr[False])).astype(int)
        folds = [0, 1, 2, 3]
    elif scheme == 'random':
        k = int(max(2, min(k, npres))); perm = rng.permutation(npres)
        fp = np.empty(npres, int); fp[perm] = np.arange(npres) % k
        fb = rng.integers(0, k, len(bl)); folds = list(range(k))
    else:  # hold-out 70/30 (fold 0 = prueba)
        fp = (rng.random(npres) >= 0.3).astype(int); fb = (rng.random(len(bl)) >= 0.3).astype(int); folds = [0]
    return fp, fb, folds

def sdm_partition(scheme, k, seed, tune=False):
    S = _SDM; fp, fb, folds = _make_partition(scheme, k, seed)
    if tune: S['tune'] = (fp, fb, folds)
    else: S['fold_p'] = fp; S['fold_b'] = fb; S['folds'] = folds; S['scheme'] = scheme
    return json.dumps(dict(folds=folds, sizes=[int((fp == f).sum()) for f in folds]))

# ------------------------------------------------------------------ validación
def sdm_fit_fold(algo, prm_json, f):
    S = _SDM; prm = json.loads(prm_json); f = int(f)
    trp = S['fold_p'] != f; trb = S['fold_b'] != f
    tep = ~trp; teb = ~trb
    if tep.sum() < 2 or teb.sum() < 2 or trp.sum() < 5: return json.dumps(dict(algo=algo, fold=f, skipped=True))
    m = _make(algo, prm, 1000 + f).fit(S['Xp'][trp], S['Xb'][trb])
    pp_te = m.predict(S['Xp'][tep]); pb_te = m.predict(S['Xb'][teb])
    pp_tr, pb_tr = _train_preds(m, S['Xp'][trp], S['Xb'][trb])
    thr = _thresholds(pp_tr, pb_tr)
    sens = float((pp_te >= thr['maxtss']).mean()); spec = float((pb_te < thr['maxtss']).mean())
    drops = _perm_drops(m, S['Xp'][tep], S['Xb'][teb]) if tep.sum() >= 5 else None
    S['cv'].setdefault(algo, {})[f] = dict(pp=pp_te, pb=pb_te, drops=drops)
    return json.dumps(dict(algo=algo, fold=f, auc_test=_auc(pp_te, pb_te), auc_train=_auc(pp_tr, pb_tr),
        tss=sens + spec - 1, sens=sens, spec=spec, boyce=_boyce(pb_te, pp_te),
        or10=float((pp_te < thr['p10']).mean()), ormtp=float((pp_te < thr['mtp']).mean())))

def _train_preds(m, Xp, Xb):
    """Predicciones sobre los datos de entrenamiento; el Random Forest usa las out-of-bag (evita sobreajuste)."""
    if hasattr(m, 'train_pred'): return m.train_pred
    return m.predict(Xp), m.predict(Xb)

def _perm_drops(m, Xp, Xb, nrep=2, seed=0, nmax=1000):
    """Caída del AUC al permutar cada variable (datos de prueba)."""
    rng = np.random.default_rng(seed)
    sel = rng.choice(len(Xb), min(len(Xb), nmax), replace=False)
    X = np.vstack([Xp, Xb[sel]]); y = np.r_[np.ones(len(Xp)), np.zeros(len(sel))].astype(bool)
    base = _auc(m.predict(X[y]), m.predict(X[~y])); out = []
    for j in range(X.shape[1]):
        d = []
        for r in range(nrep):
            Xs = X.copy(); Xs[:, j] = rng.permutation(Xs[:, j]); d.append(base - _auc(m.predict(Xs[y]), m.predict(Xs[~y])))
        out.append(float(np.mean(d)))
    return out

def _norm_pct(v):
    v = np.maximum(np.asarray(v, float), 0.0); s = v.sum()
    return (100 * v / s if s > 0 else v).tolist()

def sdm_fit_final(algo, prm_json, importance=True):
    S = _SDM; prm = json.loads(prm_json)
    m = _make(algo, prm, 7).fit(S['Xp'], S['Xb'])
    S['models'][algo] = m
    pp, pb = _train_preds(m, S['Xp'], S['Xb'])
    thr = _thresholds(pp, pb)
    grid = np.full(S['n'], np.nan, np.float32)
    v = S['valid']; grid[v] = m.predict(S['G'][:, v].T)
    S['pred'][algo] = grid
    lo, hi = np.nanpercentile(pb, 0.5), np.nanpercentile(pb, 99.5)
    imp = None
    if importance:   # promedio de las caídas de AUC medidas en los pliegues de prueba; si no hay pliegues, en el entrenamiento
        dr = [v['drops'] for v in S['cv'].get(algo, {}).values() if v.get('drops') is not None]
        imp = _norm_pct(np.mean(dr, axis=0)) if dr else _norm_pct(_perm_drops(m, S['Xp'], S['Xb']))
    S['final'][algo] = dict(thr=thr, auc_train=_auc(pp, pb), lo=float(lo), hi=float(max(hi, lo + 1e-9)), prm=prm, imp=imp)
    out = dict(algo=algo, thr=thr, auc_train=S['final'][algo]['auc_train'], imp=imp)
    if algo == 'maxent':
        npres = len(S['Xp']); raw_p = m.raw(S['Xp']); k = int(len(m.beta))
        logl = float(np.sum(np.log(np.maximum(raw_p, 1e-300))))
        aicc = 2 * k - 2 * logl + (2 * k * (k + 1) / (npres - k - 1) if npres - k - 1 > 0 else float('inf'))
        out.update(n_params=k, logl=logl, aicc=aicc, classes=m.cls, entropy=m.H)
    if algo == 'brt': out['n_iter'] = m.n_iter
    return json.dumps(out)

def sdm_tune_one(classes, regmult, nknots):
    """Un ajuste de MaxEnt para explorar clases de características y multiplicador de regularización."""
    S = _SDM; res = []
    fp, fb, folds = S['tune']
    for f in folds:
        trp = fp != f; trb = fb != f
        if (~trp).sum() < 2 or trp.sum() < 5: continue
        m = MaxEnt(classes, regmult, nknots).fit(S['Xp'][trp], S['Xb'][trb])
        pt = m.predict(S['Xp'][~trp]); pb = m.predict(S['Xb'][~trb]); ptr = m.predict(S['Xp'][trp]); pbt = m.predict(S['Xb'][trb])
        thr = _thresholds(ptr, pbt)
        res.append((_auc(pt, pb), _auc(ptr, pbt), float((pt < thr['p10']).mean()), float((pt < thr['mtp']).mean())))
    a = np.array(res)
    m = MaxEnt(classes, regmult, nknots).fit(S['Xp'], S['Xb']); k = int(len(m.beta)); n = len(S['Xp'])
    logl = float(np.sum(np.log(np.maximum(m.raw(S['Xp']), 1e-300))))
    aicc = 2 * k - 2 * logl + (2 * k * (k + 1) / (n - k - 1) if n - k - 1 > 0 else float('inf'))
    return json.dumps(dict(classes=classes, regmult=float(regmult), auc_test=float(a[:, 0].mean()), auc_diff=float((a[:, 1] - a[:, 0]).mean()),
        or10=float(a[:, 2].mean()), ormtp=float(a[:, 3].mean()), n_params=k, aicc=float(aicc)))

# ------------------------------------------------------------------ figuras
def _nn(v): return np.nan if v is None else float(v)

def fig_sdm_metrics(cv_json):
    cv = json.loads(cv_json)              # {algo: {auc_mean, auc_sd, tss_mean, tss_sd, boyce_mean, boyce_sd}}
    algos = list(cv); x = np.arange(len(algos)); w = 0.26
    fig, a = plt.subplots(figsize=(max(6.5, 1.1 * len(algos) + 3), 4.2))
    for t, (k, lab, col) in enumerate([('auc', 'AUC (prueba)', '#4c78a8'), ('tss', 'TSS', '#f58518'), ('boyce', 'Índice de Boyce', '#54a24b')]):
        a.bar(x + (t - 1) * w, [_nn(cv[g].get(k + '_mean')) for g in algos], w,
              yerr=[0 if cv[g].get(k + '_sd') is None else cv[g].get(k + '_sd') for g in algos], label=lab, color=col, capsize=2)
    a.set_xticks(x); a.set_xticklabels([LABEL.get(g, g) for g in algos], rotation=25, ha='right')
    a.axhline(0.5, color='#999', lw=.8, ls='--'); a.set_ylim(min(0, a.get_ylim()[0]), 1.02)
    a.set_title('Desempeño en validación cruzada (media ± DE)'); a.legend(fontsize=8); fig.tight_layout()
    return fig_to_b64(fig)

def fig_sdm_roc():
    S = _SDM; fig, a = plt.subplots(figsize=(5.6, 5.2))
    from sklearn.metrics import roc_curve
    for t, algo in enumerate(S['cv']):
        pp = np.concatenate([v['pp'] for v in S['cv'][algo].values()]); pb = np.concatenate([v['pb'] for v in S['cv'][algo].values()])
        y = np.r_[np.ones(len(pp)), np.zeros(len(pb))]; s = np.r_[pp, pb]
        fpr, tpr, _ = roc_curve(y, s); a.plot(fpr, tpr, color=PALS[t % 12], lw=1.6, label=f"{LABEL.get(algo, algo)} ({_auc(pp, pb):.2f})")
    a.plot([0, 1], [0, 1], color='#999', ls='--', lw=.8)
    a.set_xlabel('1 − especificidad (fondo)'); a.set_ylabel('Sensibilidad (presencias de prueba)')
    a.set_title('Curvas ROC (pliegues de prueba agrupados)'); a.legend(fontsize=7, loc='lower right'); fig.tight_layout()
    return fig_to_b64(fig)

def fig_sdm_importance():
    S = _SDM; algos = [g for g in S['final'] if S['final'][g]['imp'] is not None]
    if not algos: return ''
    M = np.array([S['final'][g]['imp'] for g in algos]); labs = [S['vlab'].get(k, k) for k in S['keys']]
    fig, a = plt.subplots(figsize=(max(6, len(labs) * .55), 0.55 * len(algos) + 2.2))
    im = a.imshow(M, cmap='YlGnBu', aspect='auto')
    a.set_xticks(range(len(labs))); a.set_xticklabels(labs, rotation=90, fontsize=8)
    a.set_yticks(range(len(algos))); a.set_yticklabels([LABEL.get(g, g) for g in algos], fontsize=8)
    for i in range(M.shape[0]):
        for j in range(M.shape[1]): a.text(j, i, f'{M[i, j]:.0f}', ha='center', va='center', fontsize=6, color='white' if M[i, j] > M.max() * .6 else '#333')
    a.set_title('Importancia de variables por permutación (% de la pérdida de AUC)'); fig.colorbar(im, ax=a, shrink=.7); fig.tight_layout()
    return fig_to_b64(fig)

def fig_sdm_response(algos_json, nx=40):
    S = _SDM; algos = [g for g in json.loads(algos_json) if g in S['models']]
    Xall = np.vstack([S['Xp'], S['Xb']]); p = Xall.shape[1]; base = np.median(S['Xp'], axis=0)
    cols = min(4, p); rows = int(math.ceil(p / cols))
    fig, ax = plt.subplots(rows, cols, figsize=(cols * 3.0, rows * 2.4)); ax = np.atleast_1d(ax).ravel()
    for j in range(p):
        xs = np.linspace(Xall[:, j].min(), Xall[:, j].max(), nx); Xg = np.tile(base, (nx, 1)); Xg[:, j] = xs
        for t, g in enumerate(algos): ax[j].plot(xs, S['models'][g].predict(Xg), color=PALS[t % 12], lw=1.3, label=LABEL.get(g, g))
        ax[j].plot(S['Xp'][:, j], np.full(len(S['Xp']), -0.03), '|', color='#333', alpha=.25, ms=6)
        ax[j].set_title(S['vlab'].get(S['keys'][j], S['keys'][j]), fontsize=8); ax[j].tick_params(labelsize=6); ax[j].set_ylim(-0.06, 1.02)
    for j in range(p, len(ax)): ax[j].axis('off')
    ax[0].legend(fontsize=6, loc='upper left'); fig.suptitle('Curvas de respuesta marginal (otras variables en la mediana de las presencias)', y=1.0, fontsize=10)
    fig.tight_layout(); return fig_to_b64(fig)

# ------------------------------------------------------------------ ensamble
def _ens_norm(g, arr):
    f = _SDM['final'][g]; return np.clip((arr - f['lo']) / (f['hi'] - f['lo']), 0, 1)

def _ens_combine(getter, algos, w, method):
    """Combina las predicciones de varios algoritmos (normalizadas 0–1): media ponderada, mediana o comité de votos.
    Devuelve (ensamble, dispersión entre modelos)."""
    A = np.stack([_ens_norm(g, np.asarray(getter(g), np.float64)) for g in algos]); fin = np.isfinite(A)
    ww = np.where(fin, w[:, None], 0.0); den = np.maximum(ww.sum(0), 1e-9); none = ~fin.any(0); A0 = np.where(fin, A, 0.0)
    if method == 'median':
        Am = np.where(fin, A, np.nan)
        with np.errstate(all='ignore'):
            import warnings
            with warnings.catch_warnings():
                warnings.simplefilter('ignore'); ens = np.nanmedian(Am, 0); sd = np.nanstd(Am, 0)
    elif method == 'committee':
        B = np.stack([(np.asarray(getter(g), np.float64) >= _SDM['final'][g]['thr']['maxtss']).astype(np.float64) for g in algos])
        ens = np.where(fin, B * w[:, None], 0.0).sum(0) / den
        mean = (A0 * ww).sum(0) / den; sd = np.sqrt((ww * (A0 - mean) ** 2).sum(0) / den)
    else:
        ens = (A0 * ww).sum(0) / den; sd = np.sqrt((ww * (A0 - ens) ** 2).sum(0) / den)
    ens = np.array(ens, np.float64); sd = np.array(sd, np.float64); ens[none] = np.nan; sd[none] = np.nan
    return ens, sd

def sdm_ensemble(algos_json, method, weight_by, cv_json):
    S = _SDM; algos = [g for g in json.loads(algos_json) if g in S['models']]; cv = json.loads(cv_json)
    if not algos: raise ValueError('Elige al menos un algoritmo.')
    def w_of(g):
        c = cv.get(g, {})
        if weight_by == 'auc': return max((c.get('auc_mean') or 0.5) - 0.5, 0.0) * 2
        if weight_by == 'tss': return max(c.get('tss_mean') or 0.0, 0.0)
        if weight_by == 'boyce': return max(c.get('boyce_mean') or 0.0, 0.0)
        return 1.0
    w = np.array([w_of(g) for g in algos], float)
    if w.sum() <= 0: w = np.ones(len(algos))
    w = w / w.sum()
    S['ens'] = dict(algos=algos, w=w, method=method)
    ens, sd = _ens_combine(lambda g: S['pred'][g], algos, w, method)
    valid = S['valid']; ens = np.where(valid, ens, np.nan).astype(np.float32); sd = np.where(valid, sd, np.nan).astype(np.float32)
    S['pred']['ensemble'] = ens; S['pred']['ensemble_sd'] = sd
    # entrenamiento
    pp = _ens_combine(lambda g: S['models'][g].predict(S['Xp']), algos, w, method)[0]
    pb = _ens_combine(lambda g: S['models'][g].predict(S['Xb']), algos, w, method)[0]
    thr = _thresholds(pp, pb)
    lo, hi = float(np.nanpercentile(pb, 0.5)), float(np.nanpercentile(pb, 99.5))
    S['final']['ensemble'] = dict(thr=thr, auc_train=_auc(pp, pb), lo=lo, hi=max(hi, lo + 1e-9), prm={}, imp=None)
    # validación cruzada del ensamble (mismos pliegues que los algoritmos)
    folds = []
    common = [f for f in S['folds'] if all(f in S['cv'].get(g, {}) for g in algos)]
    for f in common:
        mp = _ens_combine(lambda g, f=f: S['cv'][g][f]['pp'], algos, w, method)[0]
        mb = _ens_combine(lambda g, f=f: S['cv'][g][f]['pb'], algos, w, method)[0]
        t = thr['maxtss']
        folds.append((_auc(mp, mb), float((mp >= t).mean() + (mb < t).mean() - 1), _boyce(mb, mp)))
    F = np.array(folds) if folds else np.full((1, 3), np.nan)
    # si ya hay escenarios proyectados, se recalcula el ensamble en ellos
    for scn, P in S['proj'].items():
        e_, s_ = _ens_combine(lambda g, P=P: P['pred'][g], algos, w, method)
        P['pred']['ensemble'] = np.where(P['valid'], e_, np.nan).astype(np.float32)
        P['pred']['ensemble_sd'] = np.where(P['valid'], s_, np.nan).astype(np.float32)
    return json.dumps(dict(algos=algos, weights=w.tolist(), thr=thr, auc_train=S['final']['ensemble']['auc_train'], n_folds=len(folds),
        auc_mean=float(np.nanmean(F[:, 0])), auc_sd=float(np.nanstd(F[:, 0])), tss_mean=float(np.nanmean(F[:, 1])),
        tss_sd=float(np.nanstd(F[:, 1])), boyce_mean=float(np.nanmean(F[:, 2])), boyce_sd=float(np.nanstd(F[:, 2]))))

# ------------------------------------------------------------------ mapas, áreas y proyección
def sdm_get_pred(name, scn=''):
    S = _SDM
    arr = S['proj'][scn]['pred'][name] if scn else S['pred'][name]
    return to_js(np.asarray(arr, np.float32))

def sdm_thr(name, kind):
    S = _SDM; return float(S['final'][name]['thr'][kind])

def sdm_area(name, kind, scn=''):
    S = _SDM; thr = S['final'][name]['thr'][kind]
    arr = S['proj'][scn]['pred'][name] if scn else S['pred'][name]
    m = np.isfinite(arr) & (arr >= thr)
    return float(S['area'][m].sum())

def sdm_area_table(kind):
    S = _SDM; out = []
    for name in list(S['final'].keys()):
        row = dict(name=name, label=('Ensamble' if name == 'ensemble' else LABEL.get(name, name)), thr=float(S['final'][name]['thr'][kind]),
                   present=sdm_area(name, kind))
        for scn in S['proj']:
            if name in S['proj'][scn]['pred']: row[scn] = sdm_area(name, kind, scn)
        out.append(row)
    return json.dumps(out)

def sdm_project(scn, stack, meta_json):
    S = _SDM; meta = json.loads(meta_json)
    if meta['nrow'] * meta['ncol'] != S['n'] or len(meta['keys']) != len(S['keys']):
        raise ValueError('La malla del escenario no coincide con la del modelo.')
    G2 = _grid_from_stack(stack, meta); v2 = np.isfinite(G2).all(0)
    preds = {}
    for g, m in S['models'].items():
        arr = np.full(S['n'], np.nan, np.float32); arr[v2] = m.predict(G2[:, v2].T); preds[g] = arr
    S['proj'][scn] = dict(G=G2, valid=v2, pred=preds)
    if S['ens'] is not None:
        e = S['ens']; ens, sd = _ens_combine(lambda g: preds[g], e['algos'], e['w'], e['method'])
        preds['ensemble'] = np.where(v2, ens, np.nan).astype(np.float32); preds['ensemble_sd'] = np.where(v2, sd, np.nan).astype(np.float32)
    return json.dumps(dict(scn=scn, n_valid=int(v2.sum()), models=list(preds.keys())))

def _mess(G2, Xref):
    out = np.full(G2.shape[1], np.nan, np.float32); ok = np.isfinite(G2).all(0)
    sims = np.full((G2.shape[0], G2.shape[1]), np.nan, np.float32)
    for j in range(G2.shape[0]):
        ref = np.sort(Xref[:, j].astype(np.float64)); mn, mx = ref[0], ref[-1]; x = G2[j].astype(np.float64)
        f = np.searchsorted(ref, x, 'left') / len(ref) * 100.0
        rng = max(mx - mn, 1e-12)
        s = np.where(f == 0, (x - mn) / rng * 100, np.where(f <= 50, 2 * f, np.where(f < 100, 2 * (100 - f), (mx - x) / rng * 100)))
        sims[j] = s
    out[ok] = np.nanmin(sims[:, ok], axis=0); return out, sims

def sdm_mess(scn):
    S = _SDM; P = S['proj'][scn]; m, sims = _mess(P['G'], S['Xb'])
    P['mess'] = m; valid = np.isfinite(m); neg = valid & (m < 0)
    worst = np.full(S['n'], -1); worst[valid] = np.nanargmin(np.where(np.isfinite(sims[:, valid]), sims[:, valid], np.inf), axis=0)
    cnt = {S['vlab'].get(S['keys'][j], S['keys'][j]): int((neg & (worst == j)).sum()) for j in range(len(S['keys']))}
    return json.dumps(dict(pct_novel=float(100 * neg.sum() / max(valid.sum(), 1)), by_var=cnt))

def sdm_get_mess(scn): return to_js(np.asarray(_SDM['proj'][scn]['mess'], np.float32))

def sdm_change(scn, name, kind):
    S = _SDM; thr = S['final'][name]['thr'][kind]
    a = S['pred'][name]; b = S['proj'][scn]['pred'][name]
    ok = np.isfinite(a) & np.isfinite(b)
    pa = a >= thr; pb_ = b >= thr
    cat = np.full(S['n'], 255, np.uint8)
    cat[ok & ~pa & ~pb_] = 0; cat[ok & pa & pb_] = 1; cat[ok & ~pa & pb_] = 2; cat[ok & pa & ~pb_] = 3
    ar = S['area']
    res = dict(stable_suit=float(ar[cat == 1].sum()), gain=float(ar[cat == 2].sum()), loss=float(ar[cat == 3].sum()),
               stable_unsuit=float(ar[cat == 0].sum()), now=float(ar[ok & pa].sum()), future=float(ar[ok & pb_].sum()))
    S['proj'][scn]['change_' + name] = cat
    return json.dumps(res)

def sdm_get_change(scn, name): return to_js(_SDM['proj'][scn]['change_' + name])

def sdm_asc(name, kind, scn='', binary=False):
    S = _SDM; m = S['meta']
    arr = np.array(S['proj'][scn]['pred'][name] if scn else S['pred'][name], np.float64)
    if binary: arr = np.where(np.isfinite(arr), (arr >= S['final'][name]['thr'][kind]).astype(float), np.nan)
    a2 = np.where(np.isfinite(arr), arr, -9999.0).reshape(m['nrow'], m['ncol'])
    south = m['north'] - m['nrow'] * m['dy']
    head = f"ncols {m['ncol']}\nnrows {m['nrow']}\nxllcorner {m['west']:.8f}\nyllcorner {south:.8f}\ncellsize {m['dx']:.10f}\nNODATA_value -9999\n"
    body = '\n'.join(' '.join(('-9999' if v == -9999 else (f'{int(v)}' if binary else f'{v:.5f}')) for v in row) for row in a2)
    return head + body + '\n'

def sdm_maxent_coefs():
    m = _SDM['models'].get('maxent')
    if m is None: return ''
    names = {'l': 'lineal', 'q': 'cuadrática', 'p': 'producto', 'hf': 'bisagra ↗', 'hr': 'bisagra ↘'}
    lab = lambda i: _SDM['vlab'].get(_SDM['keys'][i], _SDM['keys'][i])
    rows = ['característica,variable,variable2,nudo,coeficiente']
    for b, (k, i, j, kn) in sorted(zip(m.beta, m.sub), key=lambda t: -abs(t[0])):
        rows.append(f"{names[k]},{lab(i)},{lab(j) if k == 'p' else ''},{kn:.3f}" + ('' if k in ('hf', 'hr') else '') + f",{b:.6g}")
    return '\n'.join(rows)
`;
window.PY_SDM = PY_SDM;
