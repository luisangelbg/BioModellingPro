/* LABG Suite — Efectos LABG v1.0.0 (módulo compartido)
   Copyright (C) 2026  Luis Ángel Barrera-Guzmán

   This program is free software: you can redistribute it and/or modify it under
   the terms of the GNU General Public License as published by the Free Software
   Foundation, either version 3 of the License, or (at your option) any later
   version. It is distributed in the hope that it will be useful, but WITHOUT ANY
   WARRANTY; see the GNU General Public License, in the file LICENSE at the root
   of this program, or <https://www.gnu.org/licenses/>.

   Ícono del botón «Animaciones»: Lucide (licencia ISC), en LICENSES-TERCEROS.md, junto a este módulo.

   Qué hace
   --------
   · La espera de cada cálculo largo se muestra como una capa sobre el panel de resultados, no sobre toda la
     pantalla: la animación propia de la app (120 px, de 2 a 3 s en bucle, en sus colores), el título, el paso
     («Calculando componentes… paso 2 de 4»), la barra y el tiempo restante. Si el cálculo termina antes de
     300 ms, no se ve nada. Al terminar: palomita breve sobre el isotipo LABG; la capa se desvanece en 300 ms y
     lo que el cálculo dibujó aparece escalonado, con 60 ms entre una pieza y otra.
   · Las apps no cambian: toma el lugar de la ventana de LABG.work (labg-core.js) con la misma API, así que todas
     sus esperas pasan a la capa. LABGfx.loading.start/step/done es la misma espera, con nombres más cortos.
   · Mientras dura la espera, un escudo transparente evita que se pulse algo a media cuenta, como hacía la
     ventana; Escape cancela si la app ofrece Cancelar.
   · Botón «Animaciones» en la cabecera, junto al del tema: las apaga o las enciende en todas las apps a la vez
     (clave labg.motion). Con «reducir movimiento» del sistema, o con el botón apagado, la espera muestra solo un
     círculo que gira y los resultados aparecen sin escalonar.
   · Microanimaciones de 150 a 200 ms: botones, paneles <details> que se abren y la fila de datos bajo el cursor.
   · Todo lo que se mueve mientras se calcula usa transform y opacity: el navegador lo anima aparte y no se
     congela aunque el cálculo ocupe la página.

   Uso: una línea, después de labg-core.js:
     <script src="js/labg-fx.js" data-app="pcapro" defer></script>
   data-app elige la animación; data-panel (selector) fija el panel de resultados si no es el del bloque activo;
   data-micro="botones paneles filas" (o "no") elige las microanimaciones; data-espera="ventana" deja la ventana
   de antes. Funciona con doble clic (file://), sin servidor ni dependencias. Ver GUIA-INTEGRACION.md. */
(function () {
  'use strict';
  if (window.LABGfx && window.LABGfx.version) return;
  const VERSION = '1.0.0';
  const me = document.currentScript;
  const DS = (me && me.dataset) || {};
  const CFG = Object.assign({ app: '', panel: null, micro: 'botones paneles filas', espera: 'capa', delay: 300, button: true }, window.LABG_FX || {});
  if (DS.app) CFG.app = DS.app;
  if (DS.panel) CFG.panel = DS.panel;
  if (DS.micro) CFG.micro = DS.micro;
  if (DS.espera) CFG.espera = DS.espera;
  const APP = String(CFG.app || (document.title || 'labg').split(/[\s—–·|:]+/)[0]).toLowerCase().replace(/[^a-z0-9]+/g, '') || 'labg';

  /* ---------------- hoja de estilo (se carga sola) ---------------- */
  (function css() {
    if (document.querySelector('link[data-lfx-css]')) return;
    const src = (me && me.src) || '';
    const href = DS.css || (/\/js\/(?:core\/)?labg-fx\.js(\?.*)?$/.test(src)
      ? src.replace(/\/js\/(?:core\/)?labg-fx\.js(\?.*)?$/, '/css/labg-fx.css')
      : src.replace(/\.js(\?.*)?$/, '.css'));
    if (!href) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href; l.setAttribute('data-lfx-css', '');
    (document.head || document.documentElement).appendChild(l);
  })();

  /* ---------------- utilidades ---------------- */
  const lang = () => ((document.documentElement.lang || 'es').slice(0, 2) === 'en' ? 'en' : 'es');
  const T = (es, en) => (lang() === 'en' ? en : es);
  function el(tag, cls, parent, style) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (style) n.style.cssText = style;
    if (parent) parent.appendChild(n);
    return n;
  }
  const r1 = v => Math.round(v * 10) / 10;
  const deg = (dy, dx) => (Math.atan2(dy, dx) * 180 / Math.PI).toFixed(1);
  let seq = 0;
  const uid = () => 'lfx' + (++seq) + Math.random().toString(36).slice(2, 5);
  /* fotogramas propios de una escena (posiciones y momentos de cada pieza) */
  const kf = (sc, css) => { if (!css) return; const st = document.createElement('style'); st.textContent = css; sc.appendChild(st); };
  let live = null;
  function announce(text) {
    if (window.LABG && LABG.announce) { LABG.announce(text); return; }
    if (!live) {
      live = el('div', 'lfx-own', document.body, 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap');
      live.setAttribute('aria-live', 'polite'); live.setAttribute('aria-atomic', 'true');
    }
    live.textContent = '';
    setTimeout(() => { live.textContent = text; }, 60);
  }
  const clock = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const secs = ms => (ms < 10000 ? (ms / 1000).toFixed(1).replace('.', lang() === 'es' ? ',' : '.') + ' s'
    : ms < 60000 ? Math.round(ms / 1000) + ' s' : clock(ms / 1000) + ' min');
  /* promesa que se cumple cuando el navegador ya pintó (o a los 90 ms, si la pestaña está oculta) */
  const nextPaint = () => new Promise(res => {
    let ok = false; const go = () => { if (!ok) { ok = true; res(); } };
    requestAnimationFrame(() => requestAnimationFrame(go));
    setTimeout(go, 90);
  });

  /* ---------------- animaciones sí o no (para toda la suite) ---------------- */
  const KEY = 'labg.motion';
  const mq = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const sysReduced = () => !!(mq && mq.matches);
  const readPref = () => { try { return localStorage.getItem(KEY) !== 'off'; } catch (e) { return true; } };
  let pref = readPref();
  const moving = () => pref && !sysReduced();
  const MICRO = { botones: 'lfx-m-btn', paneles: 'lfx-m-det', filas: 'lfx-m-row' };
  function applyMotion() {
    const h = document.documentElement;
    h.classList.toggle('lfx-motion', moving());
    h.classList.toggle('lfx-still', !moving());
    h.setAttribute('data-labg-motion', pref ? 'on' : 'off');
    const w = String(CFG.micro || '').toLowerCase();
    Object.keys(MICRO).forEach(k => h.classList.toggle(MICRO[k], w.indexOf(k) >= 0 || w === 'todas'));
    paintBtn();
  }
  function setPref(on, quiet) {
    pref = !!on;
    try { localStorage.setItem(KEY, pref ? 'on' : 'off'); } catch (e) { /* navegación privada: vale solo en esta página */ }
    applyMotion();
    document.dispatchEvent(new CustomEvent('labg-motion-change', { detail: { on: pref, moving: moving() } }));
    if (quiet) return;
    const t = pref ? T('Animaciones encendidas en toda la LABG Suite.', 'Animations on across the LABG Suite.')
      : T('Animaciones apagadas en toda la LABG Suite.', 'Animations off across the LABG Suite.');
    if (window.LABG && LABG.toast) LABG.toast(t, { type: 'info', timeout: 3000 }); else announce(t);
  }
  /* otra app (u otra pestaña) cambió la preferencia */
  window.addEventListener('storage', e => { if (e.key === KEY) { pref = readPref(); applyMotion(); } });
  if (mq) { const f = () => applyMotion(); if (mq.addEventListener) mq.addEventListener('change', f); else if (mq.addListener) mq.addListener(f); }

  /* el botón de la cabecera, junto al del tema: el ícono «sparkles» de Lucide 1.49.0 (ISC), con una raya encima
     cuando las animaciones están apagadas */
  const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/>' +
    '<path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/><path class="lfx-off" d="M3 3l18 18"/></svg>';
  let btn = null;
  function paintBtn() {
    if (!btn) return;
    btn.setAttribute('aria-pressed', pref ? 'true' : 'false');
    btn.setAttribute('aria-label', T('Animaciones', 'Animations'));
    btn.title = pref ? T('Animaciones encendidas: clic para apagarlas en toda la suite', 'Animations on: click to turn them off across the suite')
      : T('Animaciones apagadas: clic para encenderlas en toda la suite', 'Animations off: click to turn them on across the suite');
  }
  function addButton() {
    if (CFG.button === false || (btn && document.contains(btn))) return;
    const theme = document.getElementById('themeBtn') || document.querySelector('.top-tools .theme-btn, .theme-btn');
    const tools = theme ? theme.parentElement : document.querySelector('.top-tools');
    if (!tools) return;
    btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'icon-btn lfx-motion-btn'; btn.innerHTML = ICON;
    btn.addEventListener('click', () => setPref(!pref));
    if (theme && theme.nextSibling) tools.insertBefore(btn, theme.nextSibling); else tools.appendChild(btn);
    paintBtn();
  }
  /* el mismo interruptor en la ayuda («?»), que también llega en el teléfono, donde el botón no cabe */
  function hookHelp() {
    const L = window.LABG;
    if (!L || typeof L.showShortcuts !== 'function' || L.showShortcuts.__lfx) return;
    const orig = L.showShortcuts;
    const wrapped = function () {
      const r = orig.apply(this, arguments);
      try {
        const body = document.querySelector('dialog.labg-dialog[open] .dialog-body');
        if (body && !body.querySelector('.lfx-help')) {
          /* arriba, después del recuadro «Dónde estás» del navegador, para que no quede al final de la lista */
          const box = el('div', 'lfx-help');
          const nav = body.querySelector(':scope > .lnav-help');
          if (nav) nav.after(box); else body.prepend(box);
          el('span', '', box).textContent = T('Animaciones de la LABG Suite', 'LABG Suite animations');
          const b = el('button', 'btn btn-secondary btn-sm', box);
          b.type = 'button';
          const paint = () => { b.textContent = pref ? T('Apagarlas', 'Turn them off') : T('Encenderlas', 'Turn them on'); b.setAttribute('aria-pressed', String(!pref)); };
          b.addEventListener('click', () => { setPref(!pref); paint(); });
          paint();
        }
      } catch (e) { /* la ayuda sigue igual */ }
      return r;
    };
    Object.keys(orig).forEach(k => { wrapped[k] = orig[k]; });
    wrapped.__lfx = true;
    L.showShortcuts = wrapped;
  }
  /* al cambiar el idioma, el aviso del botón también */
  new MutationObserver(() => paintBtn()).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  /* una app que arma o rehace su cabecera con JavaScript (SciMetricsPro): el botón llega cuando llega la del tema */
  let watchQ = false;
  function watchHeader() {
    if (!document.body || CFG.button === false) return;
    new MutationObserver(() => {
      if (watchQ || (btn && document.contains(btn))) return;
      watchQ = true;
      requestAnimationFrame(() => { watchQ = false; if (!(btn && document.contains(btn))) { btn = null; addButton(); } });
    }).observe(document.body, { childList: true, subtree: true });
  }

  /* ---------------- escenas: 120 × 120 px, de 2 a 3 s en bucle ---------------- */
  /* la hélice: posición, tamaño y transparencia de cada cuenta a lo largo de una vuelta */
  let genDone = false;
  function genKeyframes() {
    if (genDone) return;
    genDone = true;
    const N = 16;
    let hx = '', hr = '';
    for (let k = 0; k <= N; k++) {
      const th = k / N * Math.PI * 2, p = r1(k / N * 100);
      hx += p + '%{transform:translateY(' + (-18 * Math.sin(th)).toFixed(2) + 'px) scale(' + (0.86 + 0.24 * Math.cos(th)).toFixed(3) + ');opacity:' + (0.55 + 0.45 * (Math.cos(th) + 1) / 2).toFixed(2) + '}';
      hr += p + '%{transform:scaleY(' + Math.sin(th).toFixed(3) + ')}';
    }
    const st = document.createElement('style');
    st.setAttribute('data-lfx', '');
    st.textContent = '@keyframes lfx-hx{' + hx + '}@keyframes lfx-hx-r{' + hr + '}';
    (document.head || document.documentElement).appendChild(st);
  }
  const loop = (sc, d) => { sc.classList.add('lfx-loop'); sc.style.setProperty('--lfx-d', d + 's'); };
  /* un trazo recto de (x0, y0) a (x1, y1) que se dibuja entre a% y b% de la vuelta */
  function stroke(sc, cls, id, name, x0, y0, x1, y1, a, b, dur, ease) {
    const s = el('i', cls, sc, 'left:' + r1(x0) + 'px;top:' + r1(y0) + 'px;width:' + r1(Math.hypot(x1 - x0, y1 - y0) + 0.6) + 'px');
    const g = deg(y1 - y0, x1 - x0);
    s.style.animation = id + name + ' ' + dur + 's ' + (ease || 'linear') + ' infinite';
    return '@keyframes ' + id + name + '{0%,' + r1(a) + '%{transform:rotate(' + g + 'deg) scaleX(0)}' + r1(b) + '%,100%{transform:rotate(' + g + 'deg) scaleX(1)}}';
  }
  const SCENES = {
    /* PCAPro: una nube de puntos que gira en 3D y deja su sombra sobre los dos ejes */
    pcapro(sc) {
      el('i', 'lfx-ax x', sc); el('i', 'lfx-ax y', sc);
      const P = [[-36, -7, 10, 0], [-26, 6, -15, 1], [-14, -13, 17, 0], [0, 9, -8, 2], [11, -5, 22, 1], [21, 12, -18, 2], [30, -10, 5, 0], [40, 4, -11, 1], [-5, 16, 12, 2], [16, -17, -5, 0]];
      [['main', 64, 52], ['px', 64, 107], ['py', 13, 52]].forEach(([k, x, y]) => {
        const w = el('i', 'lfx-pca-w ' + k, sc, 'left:' + x + 'px;top:' + y + 'px');
        const r = el('i', 'lfx-pca-rot', w);
        P.forEach(p => { const pt = el('i', 'lfx-pca-p', r, 'transform:translate3d(' + p[0] + 'px,' + p[1] + 'px,' + p[2] + 'px)'); el('b', 'g' + p[3], pt); });
      });
    },
    /* ClusteringPro: puntos sueltos que se agrupan y toman el color de su grupo */
    clusteringpro(sc, id) {
      const C = [[34, 36], [88, 42], [60, 90]];
      C.forEach((c, g) => el('i', 'lfx-halo g' + g, sc, 'left:' + c[0] + 'px;top:' + c[1] + 'px'));
      let css = '';
      for (let i = 0; i < 15; i++) {
        const g = i % 3, a = Math.random() * 6.283, r = 3 + Math.random() * 10;
        const tx = r1(C[g][0] + Math.cos(a) * r), ty = r1(C[g][1] + Math.sin(a) * r);
        const sx = r1(10 + Math.random() * 100), sy = r1(10 + Math.random() * 100);
        const d = el('i', 'lfx-cl will', sc); el('b', '', d);
        const c = el('b', 'c g' + g, d);
        const dl = (i * 40) + 'ms';
        d.style.animation = id + 'c' + i + ' 3s cubic-bezier(.45,.05,.3,1) ' + dl + ' infinite';
        c.style.animationDelay = dl;
        css += '@keyframes ' + id + 'c' + i + '{0%,8%{transform:translate(' + sx + 'px,' + sy + 'px)}42%,78%{transform:translate(' + tx + 'px,' + ty + 'px)}100%{transform:translate(' + sx + 'px,' + sy + 'px)}}';
      }
      kf(sc, css);
    },
    /* PopGeneticsPro: una hélice de alelos; cada dos vueltas, los extremos se recombinan */
    popgeneticspro(sc) {
      genKeyframes();
      const D = 2.8;
      for (let i = 0; i < 9; i++) {
        const x = 14 + i * 11.5, ph = -(i * 0.62 / (2 * Math.PI)) * D;
        el('i', 'lfx-hx-r', sc, 'left:' + r1(x) + 'px;animation-delay:' + ph.toFixed(3) + 's');
        ['a', 'b'].forEach((s, k) => {
          const n = el('i', 'lfx-hx will ' + s, sc, 'left:' + r1(x) + 'px;animation-delay:' + (ph - k * D / 2).toFixed(3) + 's');
          el('b', '', n);
          if (i >= 5) el('b', 'x', n);
        });
      }
    },
    /* PhylogenyPro: un cladograma que se ramifica desde la raíz, ((A,B),(C,(D,(E,F)))) */
    phylogenypro(sc, id) {
      loop(sc, 3.2);
      const X = 184;
      const P = [['h', 14, 36, 42, 0], ['v', 36, 21, 63.5, 0.08], ['h', 36, 120, 21, 0.16], ['h', 36, 78, 63.5, 0.16],
        ['v', 120, 12, 30, 0.28], ['v', 78, 48, 79, 0.28], ['h', 120, X, 12, 0.38], ['h', 120, X, 30, 0.38], ['h', 78, X, 48, 0.38], ['h', 78, 112, 79, 0.38],
        ['v', 112, 66, 92, 0.5], ['h', 112, X, 66, 0.6], ['h', 112, 150, 92, 0.6], ['v', 150, 84, 100, 0.7], ['h', 150, X, 84, 0.8], ['h', 150, X, 100, 0.8]];
      [12, 30, 48, 66, 84, 100].forEach((y, i) => P.push(['tip', X, y, i, [0.46, 0.46, 0.46, 0.68, 0.88, 0.88][i]]));
      const sx = v => r1(10 + (v - 14) * 96 / 170), sy = v => r1(14 + (v - 12) * 92 / 88);
      let css = '';
      P.forEach((p, i) => {
        let n, from;
        if (p[0] === 'h') { n = el('i', 'lfx-tr h', sc, 'left:' + sx(p[1]) + 'px;top:' + r1(sy(p[3]) - 1.25) + 'px;width:' + r1(sx(p[2]) - sx(p[1])) + 'px'); from = 'scaleX(0)'; }
        else if (p[0] === 'v') { n = el('i', 'lfx-tr v', sc, 'left:' + r1(sx(p[1]) - 1.25) + 'px;top:' + sy(p[2]) + 'px;height:' + r1(sy(p[3]) - sy(p[2])) + 'px'); from = 'scaleY(0)'; }
        else { n = el('i', 'lfx-tip g' + (p[3] % 3), sc, 'left:' + r1(sx(p[1]) - 4) + 'px;top:' + r1(sy(p[2]) - 4) + 'px'); from = 'scale(0)'; }
        const a = Math.round(p[4] * 58), b = a + 8;
        css += '@keyframes ' + id + 't' + i + '{0%,' + a + '%{transform:' + from + '}' + b + '%,100%{transform:none}}';
        n.style.transform = from;
        n.style.animation = id + 't' + i + ' 3.2s cubic-bezier(.3,.7,.3,1) infinite';
      });
      kf(sc, css);
    },
    /* PhenologyPro: un brote que crece por etapas: tallo, hojas, botón y flor */
    phenologypro(sc, id) {
      loop(sc, 3.2);
      ['lfx-gr-soil', 'lfx-gr-seed', 'lfx-gr-stem', 'lfx-gr-leaf r k1', 'lfx-gr-leaf l k2', 'lfx-gr-leaf r k3', 'lfx-gr-leaf l k4'].forEach(c => el('i', c, sc));
      const fl = el('i', 'lfx-gr-fl', sc);
      let css = '';
      for (let k = 0; k < 5; k++) {
        const p = el('b', 'lfx-gr-pet', fl), a = 66 + k * 2, rot = k * 72;
        css += '@keyframes ' + id + 'p' + k + '{0%,' + a + '%{transform:rotate(' + rot + 'deg) scale(0)}' + (a + 8) + '%,100%{transform:rotate(' + rot + 'deg) scale(1)}}';
        p.style.animation = id + 'p' + k + ' 3.2s cubic-bezier(.34,1.5,.64,1) infinite';
      }
      el('b', 'lfx-gr-eye', fl);
      kf(sc, css);
    },
    /* PollinationPro: granos de polen que viajan de una flor a la otra */
    pollinationpro(sc) {
      el('i', 'lfx-po-arc', sc);
      [[26, 'out'], [94, 'in']].forEach(([x, k]) => {
        el('i', 'lfx-po-stem', sc, 'left:' + x + 'px');
        el('i', 'lfx-po-leaf', sc, 'left:' + (x + 1) + 'px;top:96px;transform:rotate(-24deg)');
        const f = el('i', 'lfx-po-fl ' + k, sc, 'left:' + x + 'px');
        for (let j = 0; j < 6; j++) el('b', 'p', f, 'transform:rotate(' + (j * 60) + 'deg)');
        el('b', 'e', f);
      });
      for (let g = 0; g < 4; g++) {
        const n = el('i', 'lfx-po-g will', sc, 'animation-delay:' + (-g * 0.65).toFixed(2) + 's');
        el('b', '', n, 'animation-delay:' + (-g * 0.65).toFixed(2) + 's');
      }
    },
    /* AgriDesign: parcelas sueltas que se ordenan en tres bloques, cada tratamiento en su color */
    agridesign(sc, id) {
      loop(sc, 3.2);
      const rows = [16, 46, 76], perm = [[0, 2, 1, 3], [3, 1, 0, 2], [2, 0, 3, 1]];
      rows.forEach(y => el('i', 'lfx-ag-blk', sc, 'top:' + (y - 4) + 'px'));
      let css = '', i = 0;
      rows.forEach((y, r) => perm[r].forEach((t, c) => {
        const tx = 14 + c * 24, sx = r1(6 + Math.random() * 94), sy = r1(4 + Math.random() * 94), rot = Math.round(-50 + Math.random() * 100);
        const n = el('i', 'lfx-ag-pl will t' + t, sc);
        css += '@keyframes ' + id + 'g' + i + '{0%,10%{transform:translate(' + sx + 'px,' + sy + 'px) rotate(' + rot + 'deg) scale(.7)}' + (40 + i) + '%,100%{transform:translate(' + tx + 'px,' + y + 'px)}}';
        n.style.animation = id + 'g' + i + ' 3.2s cubic-bezier(.45,.05,.3,1) infinite';
        i++;
      }));
      kf(sc, css);
    },
    /* SciMetricsPro: barras de producción y una red de citas que se teje */
    scimetricspro(sc, id) {
      loop(sc, 3);
      el('i', 'lfx-ax x', sc, 'right:62px');
      let css = '';
      [22, 36, 54, 42, 28].forEach((h, k) => {
        const b = el('i', 'lfx-sm-bar', sc, 'left:' + (14 + k * 9) + 'px'), a = 4 + k * 6;
        css += '@keyframes ' + id + 'b' + k + '{0%,' + a + '%{transform:scaleY(0)}' + (a + 14) + '%,100%{transform:scaleY(' + (h / 54).toFixed(3) + ')}}';
        b.style.animation = id + 'b' + k + ' 3s cubic-bezier(.34,1.3,.64,1) infinite';
      });
      const N = [[72, 20], [100, 14], [110, 42], [90, 56], [70, 48], [90, 34]];
      [[5, 0], [5, 1], [5, 2], [5, 3], [5, 4], [0, 4], [1, 2], [3, 4]].forEach(([a, b], k) => {
        css += stroke(sc, 'lfx-sm-ed', id, 'e' + k, N[a][0], N[a][1], N[b][0], N[b][1], 18 + k * 5, 26 + k * 5, 3, 'ease');
      });
      N.forEach((p, k) => {
        const n = el('i', 'lfx-sm-nd' + (k === 5 ? ' hub' : ''), sc, 'left:' + p[0] + 'px;top:' + p[1] + 'px'), t0 = k === 5 ? 10 : 22 + k * 6;
        css += '@keyframes ' + id + 'n' + k + '{0%,' + t0 + '%{transform:scale(0)}' + (t0 + 7) + '%,100%{transform:scale(1)}}';
        n.style.animation = id + 'n' + k + ' 3s cubic-bezier(.34,1.6,.64,1) infinite';
      });
      kf(sc, css);
    },
    /* BioModelling Pro: una curva logística que se traza entre ausencias y presencias */
    biomodellingpro(sc, id) {
      loop(sc, 3);
      el('i', 'lfx-ax x', sc); el('i', 'lfx-ax y', sc);
      [[20, 99], [28, 99], [36, 99], [46, 99], [78, 24, 1], [88, 24, 1], [98, 24, 1], [106, 24, 1]].forEach(p => el('i', 'lfx-lg-pt' + (p[2] ? ' on' : ''), sc, 'left:' + p[0] + 'px;top:' + p[1] + 'px'));
      const pts = [];
      for (let k = 0; k <= 16; k++) { const x = 16 + k * 5.75; pts.push([r1(x), r1(100 - 76 / (1 + Math.exp(-(x - 62) / 9)))]); }
      let css = '', pen = '';
      for (let k = 0; k < 16; k++) css += stroke(sc, 'lfx-lg', id, 's' + k, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], 6 + k * 3.6, 9.6 + k * 3.6, 3);
      pts.forEach((p, k) => { pen += r1(6 + k * 3.6) + '%{transform:translate(' + p[0] + 'px,' + p[1] + 'px)}'; });
      css += '@keyframes ' + id + 'pen{0%{transform:translate(' + pts[0][0] + 'px,' + pts[0][1] + 'px)}' + pen + '100%{transform:translate(' + pts[16][0] + 'px,' + pts[16][1] + 'px)}}';
      el('i', 'lfx-lg-pen will', sc).style.animation = id + 'pen 3s linear infinite';
      kf(sc, css);
    },
    /* EconomicsPro: oferta y demanda que giran hasta cruzarse en el equilibrio */
    economicspro(sc) {
      loop(sc, 3.2);
      ['lfx-ax x', 'lfx-ax y', 'lfx-ec-gv', 'lfx-ec-gh', 'lfx-ec-ln d will', 'lfx-ec-ln s will', 'lfx-ec-ring', 'lfx-ec-eq'].forEach(c => el('i', c, sc));
    },
    /* BreedingPro: la cruza de dos progenitores y su descendiente */
    breedingpro(sc) {
      loop(sc, 3.2);
      ['v1', 'v2', 'h', 'v3'].forEach(k => el('i', 'lfx-br-ln ' + k, sc));
      el('i', 'lfx-br-par a', sc).textContent = '♀';
      el('i', 'lfx-br-par b', sc).textContent = '♂';
      el('i', 'lfx-br-x', sc).textContent = '×';
      el('i', 'lfx-br-gam a will', sc); el('i', 'lfx-br-gam b will', sc);
      const o = el('i', 'lfx-br-off will', sc); el('b', 'a', o); el('b', 'b', o);
    },
    /* StatsPro (y SigmaPro): un histograma que se acomoda en una campana */
    statspro(sc, id) {
      loop(sc, 3);
      el('i', 'lfx-ax x', sc);
      const H = 74, mu = 61.4, sdp = 1.75 * 10.6;
      let css = '';
      for (let k = 0; k < 9; k++) {
        const h = 6 + 64 * Math.exp(-Math.pow((k - 4) / 1.75, 2) / 2), s0 = 10 + Math.random() * 56, s1 = 10 + Math.random() * 56;
        const b = el('i', 'lfx-st-bar', sc, 'left:' + r1(15 + k * 10.6) + 'px');
        css += '@keyframes ' + id + 'b' + k + '{0%,6%{transform:scaleY(' + (s0 / H).toFixed(3) + ')}26%{transform:scaleY(' + (s1 / H).toFixed(3) + ')}' + (44 + k) + '%,100%{transform:scaleY(' + (h / H).toFixed(3) + ')}}';
        b.style.animation = id + 'b' + k + ' 3s cubic-bezier(.45,.05,.3,1) infinite';
      }
      const P = [];
      for (let k = 0; k <= 14; k++) { const x = 14 + k * 6.86, z = (x - mu) / sdp; P.push([r1(x), r1(104 - (6 + 64 * Math.exp(-z * z / 2)))]); }
      for (let k = 0; k < 14; k++) css += stroke(sc, 'lfx-st-cv', id, 'c' + k, P[k][0], P[k][1], P[k + 1][0], P[k + 1][1], 56 + k * 1.6, 58 + k * 1.6, 3);
      kf(sc, css);
    },
    /* GermplasmPro: semillas que caen en los cajones del banco y los van llenando */
    germplasmpro(sc, id) {
      loop(sc, 3.4);
      el('i', 'lfx-gm-top', sc);
      const X = [16, 46, 76], arr = [[], [], []];
      const fills = X.map(x => { const d = el('i', 'lfx-gm-dr', sc, 'left:' + x + 'px'); el('b', 'k', d); return el('b', 'f', d); });
      let css = '';
      for (let k = 0; k < 6; k++) {
        const d = k % 3, t = 6 + k * 11, cx = r1(X[d] + 14 + (Math.random() * 8 - 4) - 5), rot = Math.round(Math.random() * 120 - 60);
        arr[d].push(t + 9);
        const s = el('i', 'lfx-gm-sd will', sc);
        css += '@keyframes ' + id + 's' + k + '{0%,' + t + '%{transform:translate(' + cx + 'px,4px) rotate(' + rot + 'deg);opacity:0}' + (t + 2) + '%{opacity:1}' +
          (t + 9) + '%{transform:translate(' + cx + 'px,86px) rotate(' + (rot + 90) + 'deg);opacity:1}' + (t + 11) + '%,100%{transform:translate(' + cx + 'px,86px) rotate(' + (rot + 90) + 'deg);opacity:0}}';
        s.style.animation = id + 's' + k + ' 3.4s cubic-bezier(.55,0,.8,.5) infinite';
      }
      fills.forEach((f, d) => {
        const a1 = arr[d][0], a2 = arr[d][1];
        css += '@keyframes ' + id + 'f' + d + '{0%,' + a1 + '%{transform:scaleY(0)}' + (a1 + 3) + '%,' + a2 + '%{transform:scaleY(.5)}' + (a2 + 3) + '%,100%{transform:scaleY(1)}}';
        f.style.animation = id + 'f' + d + ' 3.4s ease-out infinite';
      });
      kf(sc, css);
    },
    /* ReviewPro: documentos que pasan por el embudo PRISMA; los excluidos salen por un lado */
    reviewpro(sc, id) {
      loop(sc, 3.4);
      [[22, 34, 53, 74], [98, 34, 67, 74], [53, 74, 53, 88], [67, 74, 67, 88]].forEach(s => {
        const e = el('i', 'lfx-rv-f', sc, 'left:' + s[0] + 'px;top:' + r1(s[1] - 1.25) + 'px;width:' + r1(Math.hypot(s[2] - s[0], s[3] - s[1])) + 'px');
        e.style.transform = 'rotate(' + deg(s[3] - s[1], s[2] - s[0]) + 'deg)';
      });
      let css = '', stack = 0;
      [[30, 1], [46, 0], [62, 1], [78, 0], [92, 1], [54, 0], [70, 1]].forEach(([x, inc], k) => {
        const d = el('i', 'lfx-rv-doc will' + (inc ? '' : ' out'), sc); el('b', 'l1', d); el('b', 'l2', d);
        const t = 4 + k * 9, x0 = x - 5.5;
        let f;
        if (inc) {
          const y = 100 - stack * 5; stack++;
          f = '0%,' + t + '%{transform:translate(' + x0 + 'px,0px);opacity:0}' + (t + 2) + '%{opacity:1}' + (t + 10) + '%{transform:translate(54.5px,62px)}' + (t + 15) + '%,100%{transform:translate(54.5px,' + y + 'px);opacity:1}';
        } else {
          const side = x < 60 ? -1 : 1;
          f = '0%,' + t + '%{transform:translate(' + x0 + 'px,0px);opacity:0}' + (t + 2) + '%{opacity:1}' + (t + 9) + '%{transform:translate(' + x0 + 'px,26px) rotate(0deg);opacity:1}' +
            (t + 16) + '%,100%{transform:translate(' + (x0 + side * 34) + 'px,40px) rotate(' + (side * 40) + 'deg);opacity:0}';
        }
        css += '@keyframes ' + id + 'd' + k + '{' + f + '}';
        d.style.animation = id + 'd' + k + ' 3.4s cubic-bezier(.45,.05,.3,1) infinite';
      });
      kf(sc, css);
    },
    /* respaldo, para una app sin escena propia: puntos que se ordenan sobre una recta */
    default(sc, id) {
      el('i', 'lfx-ax x', sc); el('i', 'lfx-ax y', sc);
      const x0 = 18, x1 = 112, y0 = 92, y1 = 22;
      const ln = el('i', 'lfx-df-ln', sc, 'width:' + r1(Math.hypot(x1 - x0, y1 - y0)) + 'px');
      ln.style.transform = 'rotate(' + deg(y1 - y0, x1 - x0) + 'deg)';
      let css = '';
      for (let i = 0; i < 12; i++) {
        const x = x0 + (i + 0.5) * (x1 - x0) / 12, tx = r1(x), ty = r1(y0 + (x - x0) * (y1 - y0) / (x1 - x0) + (Math.random() * 14 - 7));
        const sx = r1(14 + Math.random() * 92), sy = r1(10 + Math.random() * 90);
        const d = el('i', 'lfx-df-pt will' + (i % 4 === 2 ? ' g1' : ''), sc);
        d.style.animation = id + 'd' + i + ' 3s cubic-bezier(.45,.05,.3,1) ' + (i * 45) + 'ms infinite';
        css += '@keyframes ' + id + 'd' + i + '{0%,10%{transform:translate(' + sx + 'px,' + sy + 'px)}44%,76%{transform:translate(' + tx + 'px,' + ty + 'px)}100%{transform:translate(' + sx + 'px,' + sy + 'px)}}';
      }
      kf(sc, css);
    },
  };
  /* nombres que llevan a una escena de otra app */
  const ALIAS = { analizar: 'statspro', sigmapro: 'statspro', cladisticspro: 'phylogenypro', biosdm: 'biomodellingpro', biomodelling: 'biomodellingpro' };
  const sceneKey = name => { const k = String(name || APP).toLowerCase().replace(/[^a-z0-9]+/g, ''); const a = ALIAS[k] || k; return SCENES[a] ? a : 'default'; };
  function buildScene(name, host) {
    const key = sceneKey(name);
    const sc = el('div', 'lfx-scene lfx-' + key, host);
    sc.setAttribute('aria-hidden', 'true');
    SCENES[key](sc, uid());
    return sc;
  }

  /* ---------------- el panel de resultados ---------------- */
  function findPanel(o) {
    if (o.panel === false) return null;          /* sin panel: tarjeta al centro */
    let p = o.panel || CFG.panel;
    if (typeof p === 'function') { try { p = p(); } catch (e) { p = null; } }
    if (typeof p === 'string') { try { p = document.querySelector(p); } catch (e) { p = null; } }
    if (p && p.getClientRects && p.getClientRects().length) return p;
    /* el bloque activo, como lo encuentra el navegador */
    let n = null;
    try { const b = window.LABGNavigator && LABGNavigator.blocks ? LABGNavigator.blocks().find(x => x.active) : null; if (b) n = b.n; } catch (e) { n = null; }
    if (n == null) { const s = document.querySelector('.stepper .step-btn.active, .stepper .step-btn[aria-current="step"], .stepper .step-btn[aria-current="page"]'); if (s) n = s.dataset.step; }
    const cands = [n != null ? document.getElementById('panel-' + n) : null, document.querySelector('.step-panel.active'), document.getElementById('view'), document.querySelector('main')];
    for (const c of cands) if (c && c.getClientRects().length) return c;
    return null;
  }
  /* la parte del panel que se ve, debajo de la barra superior; null si queda muy chica */
  function regionOf(panel) {
    if (!panel || !panel.getClientRects().length) return null;
    const r = panel.getBoundingClientRect();
    let top = Math.max(r.top, 0);
    const bar = document.querySelector('.topbar');
    if (bar) { const q = bar.getBoundingClientRect(); if (q.bottom > top && q.top <= top + 2) top = Math.max(top, q.bottom); }
    const bottom = Math.min(r.bottom, window.innerHeight), left = Math.max(r.left, 0), right = Math.min(r.right, window.innerWidth);
    const w = right - left, h = bottom - top;
    return w >= 280 && h >= 230 ? { left, top, width: w, height: h } : null;
  }

  /* ---------------- lo que el cálculo dibujó, escalonado ---------------- */
  const NOT_CARD = /^(TR|TD|TH|TBODY|THEAD|TFOOT|LI|OPTION|OPTGROUP|SPAN|B|I|EM|STRONG|A|BR|SMALL|SUP|SUB|CODE|LABEL|SCRIPT|STYLE|LINK|META|TEMPLATE|COL|COLGROUP|SOURCE|TEXTAREA|INPUT|SELECT|DATALIST)$/i;
  function cardsOf(added) {
    const set = new Set(added.filter(n => n.isConnected && !(n.closest && n.closest('.lfx-own, .lnav-own, .lfs-own'))));
    const top = [];
    set.forEach(n => { for (let p = n.parentElement; p; p = p.parentElement) if (set.has(p)) return; top.push(n); });
    const ok = top.filter(n => {
      if (NOT_CARD.test(n.tagName)) return false;
      const r = n.getBoundingClientRect();
      return r.width >= 80 && r.height >= 18 && r.bottom > 0 && r.top < window.innerHeight * 1.5;
    });
    ok.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    return ok.slice(0, 16);
  }
  function stagger(nodes) {
    if (!moving()) { nodes.forEach(n => n.classList.remove('lfx-wait')); return; }
    nodes.forEach((n, i) => {
      const cls = getComputedStyle(n).transform === 'none' ? 'lfx-in' : 'lfx-in-o';
      const prev = n.style.animationDelay;
      n.classList.remove('lfx-wait');
      n.style.animationDelay = (i * 60) + 'ms';
      n.classList.add(cls);
      let gone = false;
      const end = () => { if (gone) return; gone = true; n.classList.remove(cls); n.style.animationDelay = prev; n.removeEventListener('animationend', onEnd); };
      const onEnd = e => { if (e.target === n) end(); };
      n.addEventListener('animationend', onEnd);
      setTimeout(end, 300 + i * 60 + 250);
    });
  }

  /* ---------------- la espera ---------------- */
  const MARK = '<svg viewBox="0 0 52 52" aria-hidden="true"><circle class="lfx-disc" cx="26" cy="26" r="26"/><path class="lfx-check" d="M14.5 27.5l8 8L38 19"/><path class="lfx-cross" d="M18 18L34 34M34 18L18 34"/></svg>';
  const PATIENCE = ['Sigue trabajando. Los análisis con muchas repeticiones tardan un poco más.', 'Still working. Analyses with many replicates take a little longer.'];
  let current = null;
  /* misma API que LABG.work: update(f, texto), message(texto), done(texto) → promesa, fail(texto), close() */
  function layer(opts) {
    const o = Object.assign({ title: T('Calculando…', 'Computing…'), message: '', cancel: null, hold: 750, delay: CFG.delay, panel: null, scene: null }, opts || {});
    if (o.delay == null) o.delay = CFG.delay;
    if (current) current.close(true);
    const t0 = performance.now();
    const before = document.activeElement;
    const anim = moving();
    const panel = findPanel(o);
    const shield = el('div', 'lfx-shield lfx-own', document.body);
    const root = el('div', 'lfx-layer lfx-own', document.body);
    const box = el('div', 'lfx-box', root);
    const tid = 'lfxt' + (++seq);
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', tid); box.tabIndex = -1;
    const stage = el('div', 'lfx-stage', box);
    if (anim) buildScene(o.scene, stage); else el('i', 'lfx-spin', stage);
    const badge = el('div', 'lfx-badge', stage);
    if (window.LABG && LABG.isotipo) badge.innerHTML = LABG.isotipo('lfx-iso'); else badge.classList.add('solo');
    el('span', 'lfx-mark', badge).innerHTML = MARK;
    const title = el('p', 'lfx-title', box); title.id = tid; title.textContent = o.title;
    const msg = el('p', 'lfx-msg', box); msg.textContent = o.message || '';
    const bar = el('div', 'lfx-bar indet', box); const fill = el('div', 'lfx-fill', bar);
    bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-labelledby', tid); bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', '100');
    const meta = el('div', 'lfx-meta', box); const pct = el('span', '', meta); const time = el('span', '', meta);
    const actions = el('div', 'lfx-actions', box);
    let cancelBtn = null;

    /* sobre la parte visible del panel; si no hay panel a la vista, tarjeta al centro */
    let placeQ = false;
    const place = () => {
      const g = regionOf(panel);
      root.classList.toggle('lfx-float', !g);
      if (g) Object.assign(root.style, { left: g.left + 'px', top: g.top + 'px', width: g.width + 'px', height: g.height + 'px' });
      else ['left', 'top', 'width', 'height'].forEach(k => root.style.removeProperty(k));
    };
    const onMove = () => { if (placeQ) return; placeQ = true; requestAnimationFrame(() => { placeQ = false; if (!closed) place(); }); };
    place();
    window.addEventListener('scroll', onMove, true); window.addEventListener('resize', onMove);

    /* lo que se agregue a la página durante la espera es lo que aparecerá escalonado */
    const scope = document.querySelector('main') || panel || document.body;
    const added = [];
    let mo = null, picked = null;
    if (window.MutationObserver && scope) {
      mo = new MutationObserver(rs => { for (const r of rs) for (const n of r.addedNodes) if (n.nodeType === 1) added.push(n); });
      mo.observe(scope, { childList: true, subtree: true });
    }
    const stopWatch = () => {
      if (!mo) return;
      mo.takeRecords().forEach(r => r.addedNodes.forEach(n => { if (n.nodeType === 1) added.push(n); }));
      mo.disconnect(); mo = null;
    };
    if (panel) panel.setAttribute('aria-busy', 'true');

    let frac = null, ended = false, closed = false, lastPatience = false;
    const tick = () => {
      if (ended) return;
      const s = (performance.now() - t0) / 1000;
      let txt = clock(s);
      if (frac != null && frac > 0.04 && s > 1.5 && frac < 1) {
        const left = s * (1 - frac) / frac;
        txt = T('quedan ~', '~') + (left < 60 ? Math.max(1, Math.round(left)) + ' s' : clock(left)) + T('', ' left');
      }
      time.textContent = txt;
      if (s > 14 && !lastPatience && !msg.textContent) { lastPatience = true; msg.textContent = T(PATIENCE[0], PATIENCE[1]); }
    };
    const timer = setInterval(tick, 500);
    const stopTimers = () => clearInterval(timer);

    const w = {
      get ended() { return ended; }, get closed() { return closed; }, cancelled: false,
      el: box,
      message(t) { if (!ended && t != null) msg.textContent = t; return w; },
      update(f, t) {
        if (ended) return w;
        if (t != null) msg.textContent = t;
        if (f == null) { frac = null; fill.style.transform = ''; bar.classList.add('indet'); bar.removeAttribute('aria-valuenow'); pct.textContent = ''; return w; }
        f = Math.max(0, Math.min(1, +f || 0));
        bar.classList.remove('indet');
        frac = f;
        fill.style.transform = 'scaleX(' + f.toFixed(4) + ')';
        const p = Math.floor(f * 100);
        pct.textContent = p + ' %';
        bar.setAttribute('aria-valuenow', p);
        return w;
      },
      done(text, opt) {
        if (ended) return Promise.resolve();
        /* terminó antes de verse: se cierra sin más (lo rápido no parpadea ni celebra) */
        if (o.delay && performance.now() - t0 < o.delay + 150) { w.close(); return Promise.resolve(); }
        const oo = Object.assign({ title: T('¡Listo!', 'Done!'), hold: o.hold }, opt || {});
        ended = true; stopTimers();
        const ms = performance.now() - t0;
        bar.classList.remove('indet'); fill.style.transform = 'scaleX(1)'; pct.textContent = '100 %'; bar.setAttribute('aria-valuenow', 100);
        stopWatch();
        /* las piezas nuevas se esconden detrás de la capa y entran escalonadas cuando se va */
        picked = moving() ? cardsOf(added) : [];
        picked.forEach(n => n.classList.add('lfx-wait'));
        return new Promise(res => {
          setTimeout(() => {
            box.classList.add('is-done');
            title.textContent = oo.title;
            msg.textContent = text || T('Terminado en ', 'Finished in ') + secs(ms);
            time.textContent = secs(ms);
            actions.textContent = '';
            shield.classList.add('lfx-done');
            announce(oo.title + ' ' + msg.textContent);
            setTimeout(() => { w.close(false, true); res(); }, moving() ? Math.min(oo.hold, 1400) : 300);
          }, moving() ? 180 : 0);
        });
      },
      fail(text) {
        if (ended) return w;
        ended = true; stopTimers(); stopWatch();
        bar.classList.remove('indet'); if (frac == null) fill.style.transform = 'scaleX(1)';
        box.classList.add('is-failed');
        time.textContent = secs(performance.now() - t0);
        title.textContent = T('No se pudo terminar', 'Could not finish');
        msg.textContent = text || '';
        actions.textContent = '';
        shield.classList.add('lfx-done');
        const b = el('button', 'btn btn-secondary btn-sm', actions); b.type = 'button';
        b.textContent = T('Cerrar', 'Close');
        b.addEventListener('click', () => w.close());
        b.focus({ preventScroll: true });
        announce(title.textContent + '. ' + msg.textContent);
        return w;
      },
      close(now, withCards) {
        if (closed) return;
        closed = true; ended = true; stopTimers(); stopWatch();
        document.removeEventListener('keydown', onKey, true);
        window.removeEventListener('scroll', onMove, true); window.removeEventListener('resize', onMove);
        if (current === w) current = null;
        if (panel) panel.removeAttribute('aria-busy');
        shield.remove();
        root.style.transitionDelay = box.style.transitionDelay = '0ms';
        root.classList.remove('open');
        if (picked) { if (withCards && !now) stagger(picked); else picked.forEach(n => n.classList.remove('lfx-wait')); picked = null; }
        setTimeout(() => root.remove(), now || !moving() ? 0 : 320);
        if ((box.contains(document.activeElement) || document.activeElement === document.body) && before && before.focus && document.contains(before)) {
          try { before.focus({ preventScroll: true }); } catch (e) { /* nada */ }
        }
      },
    };
    /* como la ventana: el foco se queda en la espera, Escape cancela o cierra */
    function onKey(e) {
      if (e.key === 'Escape') {
        if (box.classList.contains('is-failed') || box.classList.contains('is-done')) { e.preventDefault(); w.close(); }
        else if (cancelBtn) { e.preventDefault(); cancelBtn.click(); }
      } else if (e.key === 'Tab') { e.preventDefault(); const b = actions.querySelector('button'); (b || box).focus({ preventScroll: true }); }
    }
    document.addEventListener('keydown', onKey, true);
    if (typeof o.cancel === 'function') {
      cancelBtn = el('button', 'btn btn-secondary btn-sm', actions); cancelBtn.type = 'button';
      cancelBtn.textContent = T('Cancelar', 'Cancel');
      cancelBtn.addEventListener('click', () => {
        if (ended) return;
        w.cancelled = true;
        try { o.cancel(); } catch (e) { /* la app decide */ }
        announce(T('Cancelado', 'Cancelled'));
        w.close();
      });
    }
    tick();
    current = w;
    /* aparece después de la demora, aunque el cálculo ocupe la página (la transición la corre el navegador) */
    if (o.delay) root.style.transitionDelay = box.style.transitionDelay = o.delay + 'ms';
    void root.offsetWidth;
    root.classList.add('open');
    (cancelBtn || box).focus({ preventScroll: true });
    announce(o.title);
    return w;
  }

  /* ---------------- LABG.work pasa a la capa ---------------- */
  function bridge() {
    const L = window.LABG;
    if (CFG.espera === 'ventana' || !L || typeof L.work !== 'function' || L.work.__lfx) return false;
    const old = L.work;
    /* la escena la elige la app (data-app), no la escena vieja que pida la llamada */
    const fx = function (opts) { return layer(Object.assign({}, opts, { scene: null })); };
    Object.keys(old).forEach(k => { fx[k] = old[k]; });
    fx.ventana = old;
    fx.__lfx = true;
    L.work = fx;
    return true;
  }

  /* ---------------- LABGfx.loading: la misma espera, con pasos ---------------- */
  const LD = { w: null, k: 0, n: 0, base: '' };
  const loading = {
    start(o) {
      o = o || {};
      LD.k = 0;
      LD.n = Math.max(0, Math.floor(+(o.pasos || o.steps || 0)) || 0);
      LD.base = o.mensaje || o.message || '';
      LD.w = layer({ title: o.titulo || o.title || T('Calculando…', 'Computing…'), message: LD.base, delay: o.delay, cancel: o.cancelar || o.cancel || null, panel: o.panel === false ? false : (o.panel || null), scene: o.escena || o.scene || null });
      return LD.w;
    },
    step(texto) {
      const w = LD.w;
      if (!w || w.ended) return;
      LD.k++;
      const lab = texto || LD.base;
      if (LD.n) {
        const p = T('paso ', 'step ') + Math.min(LD.k, LD.n) + T(' de ', ' of ') + LD.n;
        w.update(Math.min(1, (LD.k - 1) / LD.n), lab ? lab + (/[…:.]$/.test(lab) ? ' ' : ' · ') + p : p);
      } else w.message(lab);
    },
    done(texto) { const w = LD.w; LD.w = null; return w ? w.done(texto) : Promise.resolve(); },
    fail(texto) { const w = LD.w; LD.w = null; if (w) w.fail(texto); },
    /* abre, deja pintar y corre tarea(step); si falla, la espera lo dice */
    async run(o, tarea) {
      const w = loading.start(o);
      await nextPaint();
      try {
        const r = await tarea(loading.step);
        if (w.cancelled) { w.close(); return undefined; }
        loading.done(o && (o.listo || o.doneMessage));
        return r;
      } catch (e) {
        if (w.cancelled) { w.close(); return undefined; }
        loading.fail((e && e.message) || String(e));
        throw e;
      }
    },
    get activa() { return !!(LD.w && !LD.w.ended); },
  };

  window.LABGfx = {
    version: VERSION,
    app: APP,
    config: CFG,
    loading,
    /* la espera directa (misma API que LABG.work) */
    work: layer,
    /* ¿hay animaciones? motion(false) las apaga en toda la suite, motion(true) las enciende */
    motion(v) { if (v === undefined) return moving(); setPref(!!v, true); return moving(); },
    scenes: Object.keys(SCENES).filter(k => k !== 'default'),
    scene: (name, host) => buildScene(name, host),
    stagger: nodes => stagger(Array.from(nodes || [])),
    /* ceder el paso al navegador entre trozos de un cálculo largo */
    pause: () => new Promise(r => setTimeout(r, 0)),
    nextPaint,
  };

  bridge();
  applyMotion();
  const init = () => { bridge(); applyMotion(); addButton(); watchHeader(); hookHelp(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
