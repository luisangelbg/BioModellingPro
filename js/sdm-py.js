/* Step 9 · Species distribution modelling (SDM). Python engine (Pyodide); the controller is sdm.js.
   The MaxEnt-style model is an L1-penalised logistic regression over linear / quadratic / product /
   hinge features, with regularisation constants after Phillips et al. (2006, 2008, 2017) and cloglog
   output. It is statistically equivalent to maximum-entropy modelling (Renner & Warton 2013) but not
   numerically identical to it.
   Language: Python returns numbers and language-neutral codes (algorithm keys, error codes 'ERR:code');
   sdm.js turns them into {es, en} labels. Only figure text is translated here, with tr(). */

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
# short algorithm names used inside figures (Spanish, English); the page keeps its own table for labels
_ALG = {'maxent': ('Tipo MaxEnt', 'MaxEnt-style'), 'glm': ('GLM', 'GLM'), 'gam': ('GAM', 'GAM'),
        'rf': ('Bosque aleatorio', 'Random forest'), 'brt': ('BRT', 'BRT'), 'svm': ('SVM', 'SVM'),
        'ann': ('Red neuronal', 'Neural network'), 'bioclim': ('Bioclim', 'Bioclim'), 'domain': ('Domain', 'Domain'),
        'mahal': ('Mahalanobis', 'Mahalanobis'), 'ensemble': ('Ensamble', 'Ensemble')}
RE = 6371.0088

def _clean(o):
    """NaN / infinity are not valid JSON: they become null (the page shows them as a dash)."""
    if isinstance(o, float): return o if math.isfinite(o) else None
    if isinstance(o, dict): return {k: _clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)): return [_clean(v) for v in o]
    return o

def _dumps(o): return json.dumps(_clean(o))

def _alg(g):
    es, en = _ALG.get(g, (g, g)); return tr(es, en)

def _vl(k):
    """Short variable code in the active language (BIO1 ... BIO19; ALT in Spanish, ELEV in English)."""
    if k == 'elev': return tr('ALT', 'ELEV')
    return str(k).upper().replace('_', '')

# ------------------------------------------------------------------ metrics
def _auc(pos, neg):
    pos = np.asarray(pos, float); neg = np.asarray(neg, float)
    if len(pos) == 0 or len(neg) == 0: return float('nan')
    r = stats.rankdata(np.r_[pos, neg]); n1, n0 = len(pos), len(neg)
    return float((r[:n1].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))

def _thresholds(pp, pb):
    pp = np.sort(np.asarray(pp, float)); pb = np.sort(np.asarray(pb, float))
    cand = np.unique(np.r_[pp, pb])
    if len(cand) > 4000: cand = np.unique(np.quantile(np.r_[pp, pb], np.linspace(0, 1, 4000)))
    sens = 1 - np.searchsorted(pp, cand, 'left') / len(pp)      # fraction of presences >= t
    spec = np.searchsorted(pb, cand, 'left') / len(pb)          # fraction of background < t
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
    keep = np.r_[Fk[:-1] != Fk[1:], True]           # drops consecutive repeated values (continuous Boyce index, Hirzel et al. 2006)
    if keep.sum() < 4: return float('nan')
    r = stats.spearmanr(mk[keep], Fk[keep]).correlation
    return float(r)

# ------------------------------------------------------------------ MaxEnt-style features
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

# ------------------------------------------------------------------ models
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
            dt = DecisionTreeClassifier(max_features=mf, random_state=int(rng.integers(0, 2 ** 31 - 1)))
            dt.fit(np.vstack([Xp[ip], Xb[ib]]), np.r_[np.ones(n), np.zeros(n)]); self.trees.append(dt)
            op = np.ones(n, bool); op[ip] = False; ob = np.ones(nb, bool); ob[ib] = False   # out-of-bag rows
            if op.any(): sp[op] += dt.predict_proba(Xp[op])[:, 1]; cp[op] += 1
            sb[ob] += dt.predict_proba(Xb[ob])[:, 1]; cb[ob] += 1
        # out-of-bag predictions: avoid overfitting when computing thresholds and training metrics
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
        # leave-one-out training predictions: without them every presence would predict itself (suitability 1)
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
    raise ValueError('ERR:unknown_algorithm:' + str(algo))

# ------------------------------------------------------------------ data preparation
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

def sdm_prepare(meta_json, stack, pres_json, opts_json):
    S = _SDM; S.clear()
    meta = json.loads(meta_json); opts = json.loads(opts_json)
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
    # calibration area: valid cells within <= R km of any record
    R = float(opts.get('radius', 300)); chord = 2 * RE * math.sin(min(R / (2 * RE), math.pi / 2))
    tree = cKDTree(_xyz(lon[pcells], lat[pcells]))
    vidx = np.where(valid)[0]
    d, _ = tree.query(_xyz(lon[vidx], lat[vidx]))
    calib = np.zeros(n, bool); calib[vidx[d <= chord]] = True
    cand = np.where(calib)[0]
    rng = np.random.default_rng(int(opts.get('seed', 42)))
    nbg = int(min(opts.get('nbg', 10000), len(cand)))
    bg = rng.choice(cand, nbg, replace=False)
    bgall = np.unique(np.r_[bg, pcells])          # presences are added to the background (Phillips et al. 2017)
    S.update(keys=keys, meta=meta, G=G, valid=valid, lon=lon, lat=lat, calib=calib,
             pcells=pcells, bcells=bgall, n=n)
    S['Xp'] = G[:, pcells].T.copy(); S['Xb'] = G[:, bgall].T.copy()
    S['models'] = {}; S['pred'] = {}; S['cv'] = {}; S['final'] = {}; S['proj'] = {}; S['ens'] = None
    S['area'] = _cell_area(lat, dx, dy)
    sel = rng.choice(len(bgall), min(1500, len(bgall)), replace=False)
    return _dumps(dict(n_records=int(len(pres)), n_in_extent=int(inside.sum()), n_valid=int(ok.sum()),
        n_presence=int(len(pcells)), n_background=int(len(bgall)), n_cells=int(n), n_valid_cells=int(valid.sum()),
        n_calib_cells=int(calib.sum()), layers=len(keys),
        pres_lon=lon[pcells].tolist(), pres_lat=lat[pcells].tolist(),
        bg_lon=lon[bgall[sel]].tolist(), bg_lat=lat[bgall[sel]].tolist()))

def sdm_get_mask():
    return to_js(np.where(_SDM['calib'], 1.0, np.where(_SDM['valid'], 0.0, np.nan)).astype(np.float32))

def sdm_reset_results():
    S = _SDM; S['models'] = {}; S['pred'] = {}; S['cv'] = {}; S['final'] = {}; S['proj'] = {}; S['ens'] = None
    S['dist'] = {}; S.pop('refugia', None)
    return 'ok'

def _make_partition(scheme, k, seed):
    S = _SDM; rng = np.random.default_rng(int(seed))
    pl, pt = S['lon'][S['pcells']], S['lat'][S['pcells']]; bl, bt = S['lon'][S['bcells']], S['lat'][S['bcells']]
    npres = len(pl)
    if scheme == 'block':
        if npres < 8: raise ValueError('ERR:block_min_presences')
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
    else:  # hold-out 70/30 (fold 0 = test)
        fp = (rng.random(npres) >= 0.3).astype(int); fb = (rng.random(len(bl)) >= 0.3).astype(int); folds = [0]
    return fp, fb, folds

def sdm_partition(scheme, k, seed, tune=False):
    S = _SDM; fp, fb, folds = _make_partition(scheme, k, seed)
    if tune: S['tune'] = (fp, fb, folds)
    else: S['fold_p'] = fp; S['fold_b'] = fb; S['folds'] = folds; S['scheme'] = scheme
    return _dumps(dict(folds=folds, sizes=[int((fp == f).sum()) for f in folds]))

# ------------------------------------------------------------------ validation
def sdm_fit_fold(algo, prm_json, f):
    S = _SDM; prm = json.loads(prm_json); f = int(f)
    trp = S['fold_p'] != f; trb = S['fold_b'] != f
    tep = ~trp; teb = ~trb
    if tep.sum() < 2 or teb.sum() < 2 or trp.sum() < 5: return _dumps(dict(algo=algo, fold=f, skipped=True))
    m = _make(algo, prm, 1000 + f).fit(S['Xp'][trp], S['Xb'][trb])
    pp_te = m.predict(S['Xp'][tep]); pb_te = m.predict(S['Xb'][teb])
    pp_tr, pb_tr = _train_preds(m, S['Xp'][trp], S['Xb'][trb])
    thr = _thresholds(pp_tr, pb_tr)
    sens = float((pp_te >= thr['maxtss']).mean()); spec = float((pb_te < thr['maxtss']).mean())
    drops = _perm_drops(m, S['Xp'][tep], S['Xb'][teb]) if tep.sum() >= 5 else None
    S['cv'].setdefault(algo, {})[f] = dict(pp=pp_te, pb=pb_te, drops=drops)
    return _dumps(dict(algo=algo, fold=f, auc_test=_auc(pp_te, pb_te), auc_train=_auc(pp_tr, pb_tr),
        tss=sens + spec - 1, sens=sens, spec=spec, boyce=_boyce(pb_te, pp_te),
        or10=float((pp_te < thr['p10']).mean()), ormtp=float((pp_te < thr['mtp']).mean())))

def _train_preds(m, Xp, Xb):
    """Predictions on the training data; the random forest uses its out-of-bag predictions (avoids overfitting)."""
    if hasattr(m, 'train_pred'): return m.train_pred
    return m.predict(Xp), m.predict(Xb)

def _perm_drops(m, Xp, Xb, nrep=2, seed=0, nmax=1000):
    """Drop in AUC when each variable is permuted (test data)."""
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
    if importance:   # mean of the AUC drops measured on the test folds; without folds, on the training data
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
    return _dumps(out)

def sdm_tune_one(classes, regmult, nknots):
    """One MaxEnt-style fit to explore feature classes and the regularisation multiplier."""
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
    return _dumps(dict(classes=classes, regmult=float(regmult), auc_test=float(a[:, 0].mean()), auc_diff=float((a[:, 1] - a[:, 0]).mean()),
        or10=float(a[:, 2].mean()), ormtp=float(a[:, 3].mean()), n_params=k, aicc=float(aicc)))

# ------------------------------------------------------------------ figures
def _nn(v): return np.nan if v is None else float(v)

def fig_sdm_metrics(cv_json):
    cv = json.loads(cv_json)              # {algo: {auc_mean, auc_sd, tss_mean, tss_sd, boyce_mean, boyce_sd}}
    algos = list(cv); x = np.arange(len(algos)); w = 0.26
    fig, a = plt.subplots(figsize=(max(6.5, 1.1 * len(algos) + 3), 4.2))
    for t, (k, lab, col) in enumerate([('auc', tr('AUC (prueba)', 'AUC (test)'), PAL[2]), ('tss', 'TSS', PAL[1]),
                                       ('boyce', tr('Índice de Boyce', 'Boyce index'), PAL[0])]):
        a.bar(x + (t - 1) * w, [_nn(cv[g].get(k + '_mean')) for g in algos], w,
              yerr=[0 if cv[g].get(k + '_sd') is None else cv[g].get(k + '_sd') for g in algos], label=lab, color=col, capsize=2,
              ecolor=_UI['muted'])
    a.set_xticks(x); a.set_xticklabels([_alg(g) for g in algos], rotation=25, ha='right')
    a.axhline(0.5, color=_UI['muted'], lw=.8, ls='--'); a.set_ylim(min(0, a.get_ylim()[0]), 1.02)
    a.set_title(tr('Desempeño en validación cruzada (media ± DE)', 'Cross-validation performance (mean ± SD)')); a.legend(fontsize=8); fig.tight_layout()
    return fig_to_b64(fig)

def fig_sdm_roc():
    S = _SDM; fig, a = plt.subplots(figsize=(5.6, 5.2))
    from sklearn.metrics import roc_curve
    for t, algo in enumerate(S['cv']):
        pp = np.concatenate([v['pp'] for v in S['cv'][algo].values()]); pb = np.concatenate([v['pb'] for v in S['cv'][algo].values()])
        y = np.r_[np.ones(len(pp)), np.zeros(len(pb))]; s = np.r_[pp, pb]
        fpr, tpr, _ = roc_curve(y, s); a.plot(fpr, tpr, color=PAL[t % len(PAL)], lw=1.6, label=f"{_alg(algo)} ({_auc(pp, pb):.2f})")
    a.plot([0, 1], [0, 1], color=_UI['muted'], ls='--', lw=.8)
    a.set_xlabel(tr('1 − especificidad (fondo)', '1 − specificity (background)')); a.set_ylabel(tr('Sensibilidad (presencias de prueba)', 'Sensitivity (test presences)'))
    a.set_title(tr('Curvas ROC (pliegues de prueba agrupados)', 'ROC curves (pooled test folds)')); a.legend(fontsize=7, loc='lower right'); fig.tight_layout()
    return fig_to_b64(fig)

def fig_sdm_importance():
    S = _SDM; algos = [g for g in S['final'] if S['final'][g]['imp'] is not None]
    if not algos: return ''
    M = np.array([S['final'][g]['imp'] for g in algos]); labs = [_vl(k) for k in S['keys']]
    fig, a = plt.subplots(figsize=(max(6, len(labs) * .55), 0.55 * len(algos) + 2.2))
    im = a.imshow(M, cmap='YlGnBu', aspect='auto'); a.grid(False)
    a.set_xticks(range(len(labs))); a.set_xticklabels(labs, rotation=90, fontsize=8)
    a.set_yticks(range(len(algos))); a.set_yticklabels([_alg(g) for g in algos], fontsize=8)
    for i in range(M.shape[0]):
        for j in range(M.shape[1]): a.text(j, i, f'{M[i, j]:.0f}', ha='center', va='center', fontsize=6, color='white' if M[i, j] > M.max() * .6 else '#333')
    a.set_title(tr('Importancia de variables por permutación (% de la pérdida de AUC)', 'Permutation variable importance (% of the AUC loss)'))
    cb = fig.colorbar(im, ax=a, shrink=.7); cb.outline.set_edgecolor(_UI['border']); cb.ax.tick_params(colors=_UI['muted'])
    fig.tight_layout()
    return fig_to_b64(fig)

def fig_sdm_response(algos_json, nx=40):
    S = _SDM; algos = [g for g in json.loads(algos_json) if g in S['models']]
    Xall = np.vstack([S['Xp'], S['Xb']]); p = Xall.shape[1]; base = np.median(S['Xp'], axis=0)
    cols = min(4, p); rows = int(math.ceil(p / cols))
    fig, ax = plt.subplots(rows, cols, figsize=(cols * 3.0, rows * 2.4)); ax = np.atleast_1d(ax).ravel()
    for j in range(p):
        xs = np.linspace(Xall[:, j].min(), Xall[:, j].max(), nx); Xg = np.tile(base, (nx, 1)); Xg[:, j] = xs
        for t, g in enumerate(algos): ax[j].plot(xs, S['models'][g].predict(Xg), color=PAL[t % len(PAL)], lw=1.3, label=_alg(g))
        ax[j].plot(S['Xp'][:, j], np.full(len(S['Xp']), -0.03), '|', color=_UI['muted'], alpha=.25, ms=6)
        ax[j].set_title(_vl(S['keys'][j]), fontsize=8); ax[j].tick_params(labelsize=6); ax[j].set_ylim(-0.06, 1.02)
    for j in range(p, len(ax)): ax[j].axis('off')
    if algos: ax[0].legend(fontsize=6, loc='upper left')
    fig.suptitle(tr('Curvas de respuesta marginal (otras variables en la mediana de las presencias)', 'Marginal response curves (other variables at the median of the presences)'), y=1.0, fontsize=10)
    fig.tight_layout(); return fig_to_b64(fig)

# ------------------------------------------------------------------ ensemble
def _ens_norm(g, arr):
    f = _SDM['final'][g]; return np.clip((arr - f['lo']) / (f['hi'] - f['lo']), 0, 1)

def _ens_combine(getter, algos, w, method):
    """Combines the predictions of several algorithms (normalised to 0-1): weighted mean, median or committee of votes.
    Returns (ensemble, spread between models)."""
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
    if not algos: raise ValueError('ERR:no_algorithm')
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
    S['dist'] = {}          # the present range of the ensemble changed: drop the distance-to-range cache
    # training data
    pp = _ens_combine(lambda g: S['models'][g].predict(S['Xp']), algos, w, method)[0]
    pb = _ens_combine(lambda g: S['models'][g].predict(S['Xb']), algos, w, method)[0]
    thr = _thresholds(pp, pb)
    lo, hi = float(np.nanpercentile(pb, 0.5)), float(np.nanpercentile(pb, 99.5))
    S['final']['ensemble'] = dict(thr=thr, auc_train=_auc(pp, pb), lo=lo, hi=max(hi, lo + 1e-9), prm={}, imp=None)
    # cross-validation of the ensemble (same folds as the algorithms)
    folds = []
    common = [f for f in S['folds'] if all(f in S['cv'].get(g, {}) for g in algos)]
    for f in common:
        mp = _ens_combine(lambda g, f=f: S['cv'][g][f]['pp'], algos, w, method)[0]
        mb = _ens_combine(lambda g, f=f: S['cv'][g][f]['pb'], algos, w, method)[0]
        t = thr['maxtss']
        folds.append((_auc(mp, mb), float((mp >= t).mean() + (mb < t).mean() - 1), _boyce(mb, mp)))
    F = np.array(folds) if folds else np.full((1, 3), np.nan)
    # if scenarios were already projected, the ensemble is recomputed on them
    for scn, P in S['proj'].items():
        if P.get('group'): continue      # a scenario ensemble keeps one surface only: it has to be rebuilt instead
        e_, s_ = _ens_combine(lambda g, P=P: P['pred'][g], algos, w, method)
        P['pred']['ensemble'] = np.where(P['valid'], e_, np.nan).astype(np.float32)
        P['pred']['ensemble_sd'] = np.where(P['valid'], s_, np.nan).astype(np.float32)
    return _dumps(dict(algos=algos, weights=w.tolist(), thr=thr, auc_train=S['final']['ensemble']['auc_train'], n_folds=len(folds),
        auc_mean=float(np.nanmean(F[:, 0])), auc_sd=float(np.nanstd(F[:, 0])), tss_mean=float(np.nanmean(F[:, 1])),
        tss_sd=float(np.nanstd(F[:, 1])), boyce_mean=float(np.nanmean(F[:, 2])), boyce_sd=float(np.nanstd(F[:, 2]))))

# ------------------------------------------------------------------ maps, areas and projection
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
        row = dict(name=name, thr=float(S['final'][name]['thr'][kind]), present=sdm_area(name, kind), scn={})
        for scn in S['proj']:   # scenario names are free text: kept in their own dict so they cannot clash with the other keys
            if name in S['proj'][scn]['pred']: row['scn'][scn] = sdm_area(name, kind, scn)
        out.append(row)
    return _dumps(out)

def sdm_project(scn, stack, meta_json):
    S = _SDM; meta = json.loads(meta_json)
    if meta['nrow'] * meta['ncol'] != S['n'] or len(meta['keys']) != len(S['keys']):
        raise ValueError('ERR:scenario_grid_mismatch')
    G2 = _grid_from_stack(stack, meta); v2 = np.isfinite(G2).all(0)
    preds = {}
    for g, m in S['models'].items():
        arr = np.full(S['n'], np.nan, np.float32); arr[v2] = m.predict(G2[:, v2].T); preds[g] = arr
    S['proj'][scn] = dict(G=G2, valid=v2, pred=preds)
    if S['ens'] is not None:
        e = S['ens']; ens, sd = _ens_combine(lambda g: preds[g], e['algos'], e['w'], e['method'])
        preds['ensemble'] = np.where(v2, ens, np.nan).astype(np.float32); preds['ensemble_sd'] = np.where(v2, sd, np.nan).astype(np.float32)
    return _dumps(dict(scn=scn, n_valid=int(v2.sum()), models=list(preds.keys())))

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
    cnt = {S['keys'][j]: int((neg & (worst == j)).sum()) for j in range(len(S['keys']))}   # keyed by variable key; the page labels them
    return _dumps(dict(pct_novel=float(100 * neg.sum() / max(valid.sum(), 1)), by_var=cnt))

def sdm_get_mess(scn): return to_js(np.asarray(_SDM['proj'][scn]['mess'], np.float32))

def sdm_change(scn, name, kind, disp='unlimited', maxkm=0):
    """Gain / loss categories between the present and one scenario. disp: 'unlimited', 'none' or 'limited'
    (only cells within maxkm of the present range are reachable)."""
    S = _SDM; thr = S['final'][name]['thr'][kind]
    a = S['pred'][name]; b = S['proj'][scn]['pred'][name]
    ok = np.isfinite(a) & np.isfinite(b)
    pa = _suit(a, thr); pb_ = _disp(_suit(b, thr), name, kind, disp, maxkm)
    cat = np.full(S['n'], 255, np.uint8)
    cat[ok & ~pa & ~pb_] = 0; cat[ok & pa & pb_] = 1; cat[ok & ~pa & pb_] = 2; cat[ok & pa & ~pb_] = 3
    ar = S['area']
    res = dict(stable_suit=float(ar[cat == 1].sum()), gain=float(ar[cat == 2].sum()), loss=float(ar[cat == 3].sum()),
               stable_unsuit=float(ar[cat == 0].sum()), now=float(ar[ok & pa].sum()), future=float(ar[ok & pb_].sum()))
    S['proj'][scn]['change_' + name] = cat
    return _dumps(res)

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
    """Non-zero coefficients of the MaxEnt-style model, largest first, as JSON rows (the page writes the CSV in the active language).
    kind: l linear, q quadratic, p product, hf forward hinge, hr reverse hinge."""
    m = _SDM['models'].get('maxent')
    if m is None: return ''
    keys = _SDM['keys']; rows = []
    for b, (k, i, j, kn) in sorted(zip(m.beta, m.sub), key=lambda t: -abs(t[0])):
        rows.append(dict(kind=k, var=keys[i], var2=(keys[j] if k == 'p' else ''), knot=float(kn), coef=float(b)))
    return _dumps(rows)

# ================================================================== future-projection workbench
# Everything below returns numbers and language-neutral codes; the page writes the labels.
_PRESENT_MID = 1985.0        # central year of the 1970-2000 reference period of the baseline layers

def _hav(lat1, lon1, lat2, lon2):
    p1 = math.radians(lat1); p2 = math.radians(lat2)
    dp = p2 - p1; dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * RE * math.asin(min(1.0, math.sqrt(max(a, 0.0))))

def _bearing(lat1, lon1, lat2, lon2):
    """Initial great-circle bearing in degrees clockwise from north."""
    p1 = math.radians(lat1); p2 = math.radians(lat2); dl = math.radians(lon2 - lon1)
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(y, x)) + 360.0) % 360.0

def _suit(arr, thr):
    a = np.asarray(arr, np.float64); return np.isfinite(a) & (a >= thr)

def sdm_set_elev(arr):
    """Elevation on the model grid, sent by the page when elevation is not one of the predictors."""
    _SDM['elev_ext'] = np.frombuffer(arr.to_bytes(), dtype=np.float32).astype(np.float64)
    return 'ok'

def _elev_grid():
    S = _SDM
    if 'elev' in S['keys']: return np.asarray(S['G'][S['keys'].index('elev')], np.float64)
    e = S.get('elev_ext')
    return None if e is None else np.asarray(e, np.float64)

def _dist_to_present(name, kind):
    """Great-circle distance (km) from every cell centre to the nearest cell suitable in the present.
    Cached per (model, threshold rule); the cache is dropped when the results change."""
    S = _SDM; S.setdefault('dist', {}); key = (name, kind)
    if key in S['dist']: return S['dist'][key]
    thr = S['final'][name]['thr'][kind]; mp = _suit(S['pred'][name], thr)
    out = np.full(S['n'], np.inf)
    if mp.any():
        tree = cKDTree(_xyz(S['lon'][mp], S['lat'][mp]))
        d, _ = tree.query(_xyz(S['lon'], S['lat']))
        out = 2 * RE * np.arcsin(np.clip(d / (2 * RE), 0.0, 1.0))   # chord -> great-circle distance
    S['dist'][key] = out
    return out

def _disp(mask, name, kind, disp, maxkm):
    """Dispersal filter: 'unlimited' keeps the mask, 'none' keeps only cells already suitable now,
    'limited' keeps cells at most maxkm away from the present range."""
    S = _SDM
    if disp == 'none': return mask & _suit(S['pred'][name], S['final'][name]['thr'][kind])
    if disp == 'limited': return mask & (_dist_to_present(name, kind) <= float(maxkm))
    return mask

def sdm_dispersal_reach(name, kind, maxkm):
    d = _dist_to_present(name, kind); ok = np.isfinite(d)
    return _dumps(dict(n_reach=int((d <= float(maxkm)).sum()), n_finite=int(ok.sum()),
                       max_dist=float(d[ok].max()) if ok.any() else None))

def _wmean(mask, v, w):
    if not mask.any(): return None
    ww = w[mask]; vv = v[mask]; g = np.isfinite(vv) & np.isfinite(ww)
    if not g.any() or ww[g].sum() <= 0: return None
    return float((vv[g] * ww[g]).sum() / ww[g].sum())

def sdm_future_row(scn, name, kind, disp, maxkm, mid_year):
    """Every number of one row of the per-scenario table: areas under the three dispersal assumptions,
    change against the present, cell counts, extrapolation share and the range-shift metrics."""
    S = _SDM; thr = float(S['final'][name]['thr'][kind])
    P = S['proj'][scn]
    a = np.asarray(S['pred'][name], np.float64); b = np.asarray(P['pred'][name], np.float64)
    ar = S['area']; lat = S['lat']; lon = S['lon']
    mp = _suit(a, thr); mfu = _suit(b, thr)
    dist = _dist_to_present(name, kind)
    mfn = mfu & mp
    mfl = mfu & (dist <= float(maxkm))
    mf = mfu if disp == 'unlimited' else (mfn if disp == 'none' else mfl)
    ok = np.isfinite(a) & np.isfinite(b)
    stable = mp & mf; gain = (~mp) & mf & ok; loss = mp & (~mf) & ok
    A = lambda m: float(ar[m].sum())
    now = A(mp); fut = A(mf)
    out = dict(scn=scn, model=name, kind=kind, thr=thr, disp=disp, maxkm=float(maxkm), mid_year=float(mid_year),
               area_now=now, area_fut=fut, d_area=fut - now, d_pct=(100.0 * (fut - now) / now) if now > 0 else None,
               area_unlimited=A(mfu), area_none=A(mfn), area_limited=A(mfl),
               n_stable=int(stable.sum()), n_gain=int(gain.sum()), n_loss=int(loss.sum()),
               n_new=int(((~mp) & mfu & ok).sum()), n_now=int(mp.sum()), n_fut=int(mf.sum()),
               a_stable=A(stable), a_gain=A(gain), a_loss=A(loss), is_group=bool(P.get('group')))
    bin_p = b[mp]; bin_p = bin_p[np.isfinite(bin_p)]
    out['mean_in_present'] = float(bin_p.mean()) if len(bin_p) else None
    m = P.get('mess')
    if m is not None:
        v = np.isfinite(m)
        out['pct_novel'] = float(100.0 * (v & (m < 0)).sum() / max(int(v.sum()), 1))
    if P.get('cons') is not None:
        c = np.asarray(P['cons'], np.float64); out['area_consensus'] = float(ar[c == 1].sum())
        out['agree_level'] = float(P.get('agree_level', 0))
        out['n_members'] = int(len(P.get('members') or []))
    # suitability-weighted centroid of the suitable area
    def centroid(mask, vals):
        if not mask.any(): return None
        w = ar[mask] * np.clip(np.nan_to_num(vals[mask], nan=0.0), 0.0, None)
        if w.sum() <= 0: w = ar[mask]
        if w.sum() <= 0: return None
        return float((lat[mask] * w).sum() / w.sum()), float((lon[mask] * w).sum() / w.sum())
    c0 = centroid(mp, a); c1 = centroid(mf, b)
    if c0 is not None: out['cen_lat0'], out['cen_lon0'] = c0
    if c1 is not None: out['cen_lat1'], out['cen_lon1'] = c1
    if c0 is not None and c1 is not None:
        out['shift_km'] = _hav(c0[0], c0[1], c1[0], c1[1])
        out['bearing'] = _bearing(c0[0], c0[1], c1[0], c1[1])
        dec = (float(mid_year) - _PRESENT_MID) / 10.0
        out['rate_km_dec'] = out['shift_km'] / dec if dec > 0 else None
    # latitude of the suitable area: area-weighted mean and the 10th / 90th percentiles
    out['lat_mean0'] = _wmean(mp, lat, ar); out['lat_mean1'] = _wmean(mf, lat, ar)
    for q, tag in ((10, 'p10'), (90, 'p90')):
        out['lat_' + tag + '_0'] = float(np.percentile(lat[mp], q)) if mp.any() else None
        out['lat_' + tag + '_1'] = float(np.percentile(lat[mf], q)) if mf.any() else None
    E = _elev_grid()
    if E is not None:
        e0 = mp & np.isfinite(E); e1 = mf & np.isfinite(E)
        out['elev_mean0'] = _wmean(e0, E, ar); out['elev_mean1'] = _wmean(e1, E, ar)
        out['elev_max0'] = float(E[e0].max()) if e0.any() else None
        out['elev_max1'] = float(E[e1].max()) if e1.any() else None
    out['suit_mean0'] = _wmean(mp, a, ar); out['suit_mean1'] = _wmean(mf, b, ar)
    return _dumps(out)

# ---------------------------------------------------------------- ensemble across scenarios
def sdm_group(gname, scns_json, name, kind, agree):
    """Mean and standard deviation of suitability across scenarios, the agreement map (% of scenarios that
    call the cell suitable) and the consensus binary map at the given agreement level."""
    S = _SDM; scns = [s for s in json.loads(scns_json) if s in S['proj'] and name in S['proj'][s]['pred']]
    if len(scns) < 1: raise ValueError('ERR:no_scenario')
    thr = float(S['final'][name]['thr'][kind])
    A = np.stack([np.asarray(S['proj'][s]['pred'][name], np.float64) for s in scns])
    fin = np.isfinite(A); nok = fin.sum(0); den = np.maximum(nok, 1)
    Z = np.where(fin, A, 0.0)
    mean = np.where(nok > 0, Z.sum(0) / den, np.nan)
    var = np.where(nok > 0, np.where(fin, (A - mean) ** 2, 0.0).sum(0) / den, np.nan)
    sd = np.sqrt(np.maximum(var, 0.0))
    B = fin & (A >= thr)
    agr = np.where(nok > 0, 100.0 * B.sum(0) / den, np.nan)
    cons = np.where(np.isfinite(agr), (agr >= float(agree)).astype(np.float64), np.nan)
    P = dict(G=None, valid=nok > 0, pred={name: mean.astype(np.float32)}, sd=sd.astype(np.float32),
             agree=agr.astype(np.float32), cons=cons.astype(np.float32), members=scns, group=True,
             agree_level=float(agree), thr=thr)
    ms = [S['proj'][s]['mess'] for s in scns if S['proj'][s].get('mess') is not None]
    if ms:
        M = np.stack(ms).astype(np.float64); fm = np.isfinite(M); nm = fm.sum(0)
        P['mess'] = np.where(nm > 0, np.where(fm, M, 0.0).sum(0) / np.maximum(nm, 1), np.nan).astype(np.float32)
    S['proj'][gname] = P
    ar = S['area']
    return _dumps(dict(gname=gname, n=len(scns), members=scns, agree_level=float(agree),
        area_consensus=float(ar[cons == 1].sum()), area_mean=float(ar[_suit(mean, thr)].sum()),
        sd_mean=float(np.nanmean(sd)) if np.isfinite(sd).any() else None,
        sd_max=float(np.nanmax(sd)) if np.isfinite(sd).any() else None))

def sdm_drop_scenario(name):
    """Forgets one scenario (used for the scenario ensembles, which are rebuilt rather than updated)."""
    _SDM['proj'].pop(name, None)
    return 'ok'

def sdm_get_layer(scn, what):
    """'sd', 'agree' or 'cons' of a scenario group."""
    return to_js(np.asarray(_SDM['proj'][scn][what], np.float32))

def sdm_agree_hist(scn):
    """Cells and area per agreement class, for the legend and the table."""
    S = _SDM; a = np.asarray(S['proj'][scn]['agree'], np.float64); ar = S['area']
    edges = [(-0.001, 0.001), (0.001, 34.0), (34.0, 67.0), (67.0, 99.999), (99.999, 100.001)]
    out = []
    for lo, hi in edges:
        m = np.isfinite(a) & (a > lo) & (a <= hi) if lo > 0 else np.isfinite(a) & (a >= lo) & (a <= hi)
        out.append(dict(lo=max(lo, 0.0), hi=min(hi, 100.0), n=int(m.sum()), area=float(ar[m].sum())))
    return _dumps(out)

# ---------------------------------------------------------------- refugia and risk classes
def sdm_refugia(scns_json, name, kind, disp='unlimited', maxkm=0):
    """1 refugium (suitable now and in every scenario), 2 lost in every scenario, 3 gained in every
    scenario, 4 scenarios disagree, 0 unsuitable now and in every scenario."""
    S = _SDM; scns = [s for s in json.loads(scns_json) if s in S['proj'] and name in S['proj'][s]['pred']]
    if not scns: raise ValueError('ERR:no_scenario')
    thr = float(S['final'][name]['thr'][kind])
    a = np.asarray(S['pred'][name], np.float64); mp = _suit(a, thr)
    B = np.stack([_disp(_suit(S['proj'][s]['pred'][name], thr), name, kind, disp, maxkm) for s in scns])
    allf = B.all(0); anyf = B.any(0); ok = np.isfinite(a)
    cat = np.full(S['n'], 255, np.uint8)
    cat[ok] = 0
    cat[ok & (~mp) & allf] = 3
    cat[ok & mp & (~anyf)] = 2
    cat[ok & mp & allf] = 1
    rest = ok & (mp | anyf) & (cat == 0)
    cat[rest] = 4
    S['refugia'] = cat
    ar = S['area']
    cls = [(1, 'refugia'), (2, 'lost_all'), (3, 'gain_all'), (4, 'disagree'), (0, 'unsuitable')]
    out = dict(n_scn=len(scns), members=scns, thr=thr, disp=disp)
    for v, k in cls:
        m = cat == v; out['a_' + k] = float(ar[m].sum()); out['n_' + k] = int(m.sum())
    return _dumps(out)

def sdm_get_refugia(): return to_js(_SDM['refugia'])

def sdm_rec_persist(scns_json, name, kind, disp='unlimited', maxkm=0):
    """For every presence used in the calibration: in how many scenarios its cell stays suitable."""
    S = _SDM; scns = [s for s in json.loads(scns_json) if s in S['proj'] and name in S['proj'][s]['pred']]
    thr = float(S['final'][name]['thr'][kind]); cells = S['pcells']
    a = np.asarray(S['pred'][name], np.float64)
    now = _suit(a, thr)[cells]
    cnt = np.zeros(len(cells), int); per = []
    for s in scns:
        m = _disp(_suit(S['proj'][s]['pred'][name], thr), name, kind, disp, maxkm)[cells]
        cnt += m.astype(int); per.append(m.astype(int).tolist())
    E = _elev_grid()
    rows = []
    for i, c in enumerate(cells):
        rows.append(dict(lon=float(S['lon'][c]), lat=float(S['lat'][c]), now=bool(now[i]), n=int(cnt[i]),
            pct=float(100.0 * cnt[i] / max(len(scns), 1)),
            suit=float(a[c]) if np.isfinite(a[c]) else None,
            elev=float(E[c]) if (E is not None and np.isfinite(E[c])) else None))
    return _dumps(dict(n_scn=len(scns), members=scns, rows=rows, by_scn=per,
        n_records=len(cells), n_now=int(now.sum()), n_all=int((cnt == len(scns)).sum()) if scns else 0,
        n_none=int((cnt == 0).sum())))

# ---------------------------------------------------------------- figures
def fig_sdm_centroids(json_str):
    """Centroid displacement arrows of every scenario over the present binary map."""
    d = json.loads(json_str); S = _SDM
    name = d['name']; thr = float(S['final'][name]['thr'][d['kind']]); mag = float(d.get('mag', 1) or 1)
    m = S['meta']; nrow, ncol = m['nrow'], m['ncol']
    a = np.asarray(S['pred'][name], np.float64).reshape(nrow, ncol)
    ext = [m['west'], m['west'] + ncol * m['dx'], m['north'] - nrow * m['dy'], m['north']]
    bg = np.where(np.isfinite(a), (a >= thr).astype(float), np.nan)
    from matplotlib.colors import ListedColormap
    from matplotlib.lines import Line2D
    fig, ax = plt.subplots(figsize=(6.9, 5.9))
    ax.imshow(bg, extent=ext, origin='upper', vmin=0, vmax=1, interpolation='nearest',
              cmap=ListedColormap([_UI['border'], PAL[0]]), alpha=.55)
    seen = {}
    for k, s in enumerate(d.get('scn') or []):
        col = PAL[int(s.get('ci', 0)) % len(PAL)]
        x0, y0 = s['lon0'], s['lat0']
        x1 = x0 + (s['lon1'] - x0) * mag; y1 = y0 + (s['lat1'] - y0) * mag
        ax.annotate('', xy=(x1, y1), xytext=(x0, y0),
                    arrowprops=dict(arrowstyle='-|>', color=col, lw=1.5, shrinkA=0, shrinkB=0, alpha=.95))
        ax.plot([x1], [y1], 'o', ms=4, color=col)
        # the labels are staggered: with short arrows every tip falls near the present centroid
        ax.annotate(s['lab'], (x1, y1), fontsize=6, color=col, xytext=(7, 9 * (k % 6) - 23),
                    textcoords='offset points',
                    arrowprops=dict(arrowstyle='-', color=col, lw=.5, alpha=.5, shrinkA=0, shrinkB=1))
        if s.get('grp'): seen.setdefault(s['grp'], col)
    p = d['present']
    ax.plot([p['lon']], [p['lat']], marker='*', ms=14, color=_UI['text'], zorder=5)
    ax.annotate(tr('Presente', 'Present'), (p['lon'], p['lat']), fontsize=7, color=_UI['text'],
                xytext=(6, -10), textcoords='offset points')
    ax.set_xlabel(tr('Longitud (°)', 'Longitude (°)'), fontsize=8)
    ax.set_ylabel(tr('Latitud (°)', 'Latitude (°)'), fontsize=8)
    t = tr('Desplazamiento del centroide ponderado por idoneidad', 'Displacement of the suitability-weighted centroid')
    if mag != 1: t += tr(' (flechas ×', ' (arrows ×') + ('%g' % mag) + ')'
    ax.set_title(t, fontsize=10)
    hs = [Line2D([0], [0], color=PAL[0], lw=6, alpha=.55), Line2D([0], [0], marker='*', color=_UI['text'], lw=0, ms=10)]
    ls = [tr('Idónea hoy', 'Suitable today'), tr('Centroide actual', 'Present centroid')]
    for k, c in seen.items(): hs.append(Line2D([0], [0], color=c, lw=2)); ls.append(k)
    ax.legend(hs, ls, fontsize=7, loc='best')
    ax.tick_params(labelsize=7); ax.grid(True, alpha=.22)
    fig.tight_layout(); return fig_to_b64(fig)

def fig_sdm_future_series(json_str):
    """Trajectory of suitable area, centroid latitude and mean elevation, one column per pathway."""
    d = json.loads(json_str); panels = d.get('panels') or []
    if not panels: return ''
    fields = ['area', 'lat'] + (['elev'] if d.get('show_elev') else [])
    ylab = {'area': tr('Área idónea (km²)', 'Suitable area (km²)'),
            'lat': tr('Latitud del centroide (°)', 'Centroid latitude (°)'),
            'elev': tr('Altitud media (m)', 'Mean elevation (m)')}
    rows = len(fields); cols = len(panels)
    fig, ax = plt.subplots(rows, cols, figsize=(max(4.4, 3.5 * cols), 2.6 * rows), squeeze=False)
    pres = d.get('present') or {}
    for ci, p in enumerate(panels):
        for ri, fld in enumerate(fields):
            a = ax[ri][ci]
            for mi, mo in enumerate(p.get('models') or []):
                ys = mo.get(fld) or []
                if not any(y is not None for y in ys): continue
                a.plot(mo['x'], [np.nan if y is None else y for y in ys], marker='o', ms=3.4, lw=1.1,
                       color=PAL[mi % len(PAL)], alpha=.9, label=(mo['m'] if (ri == 0 and ci == 0) else None))
            e = p.get('ens') or {}
            ev = e.get(fld) or []
            if any(v is not None for v in ev):
                a.plot(e['x'], [np.nan if v is None else v for v in ev], lw=2.4, color=_UI['text'],
                       label=(tr('Media del ensamble', 'Ensemble mean') if (ri == 0 and ci == 0) else None))
                sdv_ = e.get('sd_' + fld) or []
                if len(sdv_) == len(ev):
                    lo = [np.nan if (v is None or s is None) else v - s for v, s in zip(ev, sdv_)]
                    hi = [np.nan if (v is None or s is None) else v + s for v, s in zip(ev, sdv_)]
                    a.fill_between(e['x'], lo, hi, color=_UI['muted'], alpha=.18, lw=0)
            if pres.get(fld) is not None:
                a.axhline(pres[fld], color=_UI['muted'], ls='--', lw=.9)
                a.plot([pres.get('x', _PRESENT_MID)], [pres[fld]], marker='s', ms=5, color=_UI['muted'])
            if ri == 0: a.set_title(str(p.get('key', '')), fontsize=10)
            if ci == 0: a.set_ylabel(ylab[fld], fontsize=8)
            if ri == rows - 1: a.set_xlabel(tr('Año central del periodo', 'Central year of the period'), fontsize=8)
            a.tick_params(labelsize=7)
    h, l = ax[0][0].get_legend_handles_labels()
    if h: fig.legend(h, l, fontsize=7, loc='lower center', ncol=min(5, len(l)), frameon=False, bbox_to_anchor=(0.5, -0.06))
    fig.suptitle(tr('Trayectoria por vía socioeconómica (promedios de 20 años, no predicciones anuales)',
                    'Trajectory by socioeconomic pathway (20-year averages, not annual predictions)'), y=1.01, fontsize=10)
    fig.tight_layout(); return fig_to_b64(fig)
`;
window.PY_SDM = PY_SDM;
