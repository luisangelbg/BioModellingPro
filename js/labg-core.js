/* LABG Suite — comportamiento común a todas las aplicaciones.
   Copyright (C) 2026  Luis Ángel Barrera-Guzmán

   This program is free software: you can redistribute it and/or modify it under
   the terms of the GNU General Public License as published by the Free Software
   Foundation, either version 3 of the License, or (at your option) any later
   version. It is distributed in the hope that it will be useful, but WITHOUT ANY
   WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
   A PARTICULAR PURPOSE. See the GNU General Public License, in the file LICENSE
   at the root of this program, or <https://www.gnu.org/licenses/>.

   Un solo objeto global, window.LABG, sin módulos ni dependencias, para que
   funcione con doble clic (file://). No sustituye el core.js de cada app: le
   da las piezas que todas deben hacer igual.

     LABG.lang()                       'es' | 'en' (lee <html lang>)
     LABG.t(es, en)                    texto en el idioma activo
     LABG.setCurrentStep(n)            marca el bloque activo (aria-current) y lo trae a la vista
     LABG.markStep(n, estado)          'done' | 'warn' | null
     LABG.bindStepKeys(goStep)         Alt+←/→ y flechas dentro de la barra de bloques
     LABG.toast(texto, {type, timeout})  aviso flotante que se anuncia al lector de pantalla
     LABG.announce(texto)              anuncio silencioso (solo lector de pantalla)
     LABG.messageRole(el, type)        role=alert / status para los mensajes en línea
     LABG.linkLabels(raíz)             une cada <label> suelta con su campo (corre sola)
     LABG.guardUnload(hayDatos)      pregunta antes de cerrar si hay trabajo sin guardar
     LABG.shortcuts(lista)             registra atajos y abre el panel «?»
     LABG.theme.init(clave) / toggle() tema claro/oscuro con memoria
     LABG.work(opciones)               espera animada que termina en palomita (ver abajo)
     LABG.progressBar / busyButton     barra en línea y botón que terminan en palomita
     LABG.isotipo(clase)               el ícono LABG en vector (la A-biplot)
     LABG.SUITE_URL                    dirección del portal
*/
(function () {
  'use strict';

  const LABG = window.LABG || {};
  LABG.SUITE_URL = 'https://luisangelbg.github.io/';

  const read = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const write = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* navegación privada */ } };

  LABG.lang = () => (document.documentElement.lang || 'es').slice(0, 2) === 'en' ? 'en' : 'es';
  LABG.t = (es, en) => (LABG.lang() === 'en' ? en : es);

  /* ---------------- barra de bloques ---------------- */
  const stepBtn = n => document.querySelector('.step-btn[data-step="' + String(n) + '"]');
  const stepBtns = () => Array.from(document.querySelectorAll('.stepper .step-btn'));

  LABG.setCurrentStep = function (n) {
    stepBtns().forEach(b => {
      const on = b.dataset.step === String(n);
      b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      b.tabIndex = on ? 0 : -1;               /* un solo punto de tabulación en la barra */
    });
    const b = stepBtn(n);
    if (b && b.scrollIntoView) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  LABG.markStep = function (n, state) {
    const b = stepBtn(n);
    if (!b) return;
    b.classList.toggle('done', state === 'done');
    b.classList.toggle('warn', state === 'warn');
    /* el estado también se dice en voz alta, no solo con color */
    let s = b.querySelector('.step-state');
    if (!s) { s = document.createElement('span'); s.className = 'sr-only step-state'; b.appendChild(s); }
    s.textContent = state === 'done' ? LABG.t(' (terminado)', ' (done)')
      : state === 'warn' ? LABG.t(' (revisar)', ' (check)') : '';
  };

  LABG.bindStepKeys = function (goStep) {
    const usable = () => stepBtns().filter(b => !b.disabled && !b.classList.contains('soon'));
    const move = (from, delta) => {
      const list = usable();
      const i = list.findIndex(b => b.dataset.step === from);
      const to = list[i + delta];
      if (to) { goStep(to.dataset.step); to.focus(); }
    };
    const current = () => {
      const b = document.querySelector('.step-btn[aria-current="step"], .step-btn.active');
      return b ? b.dataset.step : null;
    };
    document.addEventListener('keydown', e => {
      if (e.defaultPrevented) return;
      /* Alt+← / Alt+→ desde cualquier parte de la app */
      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault(); move(current(), e.key === 'ArrowRight' ? 1 : -1); return;
      }
      /* flechas, Inicio y Fin cuando el foco está en la barra */
      const t = e.target;
      if (!t.classList || !t.classList.contains('step-btn')) return;
      const list = usable();
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const i = list.indexOf(t) + (e.key === 'ArrowRight' ? 1 : -1);
        if (list[i]) list[i].focus();
      } else if (e.key === 'Home' && list[0]) { e.preventDefault(); list[0].focus(); }
      else if (e.key === 'End' && list.length) { e.preventDefault(); list[list.length - 1].focus(); }
    });
  };

  /* ---------------- anuncios y avisos ---------------- */
  let live = null;
  function liveRegion() {
    if (live) return live;
    live = document.createElement('div');
    live.className = 'sr-only'; live.setAttribute('aria-live', 'polite'); live.setAttribute('aria-atomic', 'true');
    document.body.appendChild(live);
    return live;
  }
  LABG.announce = function (text) {
    const r = liveRegion();
    r.textContent = '';
    setTimeout(() => { r.textContent = text; }, 60);
  };

  let stack = null;
  LABG.toast = function (text, opts) {
    const o = Object.assign({ type: 'info', timeout: 5000 }, opts || {});
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      document.body.appendChild(stack);
    }
    const el = document.createElement('div');
    el.className = 'toast ' + o.type;
    el.setAttribute('role', o.type === 'error' || o.type === 'warning' ? 'alert' : 'status');
    const span = document.createElement('span'); span.textContent = text;
    const x = document.createElement('button');
    x.type = 'button'; x.className = 'toast-close'; x.textContent = '×';
    x.setAttribute('aria-label', LABG.t('Cerrar aviso', 'Dismiss'));
    x.addEventListener('click', () => el.remove());
    el.append(span, x);
    stack.appendChild(el);
    if (o.timeout) setTimeout(() => el.remove(), o.timeout);
    return el;
  };

  LABG.messageRole = function (el, type) {
    if (!el) return;
    el.setAttribute('role', type === 'error' || type === 'warning' ? 'alert' : 'status');
  };

  /* ---------------- etiquetas de los campos ----------------
     Muchos formularios escriben <label>Texto</label><input>, sin «for»: a la
     vista está claro, pero un lector de pantalla anuncia un campo sin nombre.
     Cada etiqueta suelta se une aquí con su control: el hermano que la sigue o,
     si no, el único control de su caja. Si la caja tiene varios (un grupo de
     opciones) no se adivina nada. Corre al cargar y cada vez que una app
     construye un formulario nuevo. */
  let autoId = 0;
  const CONTROL = 'input:not([type="hidden"]), select, textarea';
  LABG.linkLabels = function (root) {
    (root || document).querySelectorAll('label:not([for])').forEach(l => {
      if (l.querySelector(CONTROL)) return;               /* ya envuelve su control */
      let c = l.nextElementSibling;
      if (!c || !c.matches(CONTROL)) {
        const box = l.parentElement;
        const inBox = box ? box.querySelectorAll(CONTROL) : [];
        if (inBox.length !== 1) return;
        c = inBox[0];
      }
      if ((c.labels && c.labels.length) || c.hasAttribute('aria-label') || c.hasAttribute('aria-labelledby')) return;
      if (!c.id) c.id = 'labg-campo-' + (++autoId);
      l.htmlFor = c.id;
    });
  };
  function watchLabels() {
    LABG.linkLabels();
    if (!window.MutationObserver) return;
    let pending = false;
    new MutationObserver(() => {
      if (pending) return;
      pending = true;
      setTimeout(() => { pending = false; LABG.linkLabels(); }, 150);
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchLabels);
  else watchLabels();

  /* ---------------- no perder el trabajo ---------------- */
  LABG.guardUnload = function (hasData) {
    window.addEventListener('beforeunload', e => {
      if (hasData()) { e.preventDefault(); e.returnValue = ''; }
    });
  };

  /* ---------------- atajos de teclado ----------------
     lista: [{ keys: ['Ctrl', 'S'], es: 'Guardar el proyecto', en: 'Save the project' }, …]
     Los de la barra de bloques y el propio «?» se añaden solos. */
  let shortcutList = [];
  let dlg = null;
  LABG.shortcuts = function (list) {
    shortcutList = (list || []).slice();
    if (LABG._shortcutsBound) return;
    LABG._shortcutsBound = true;
    document.addEventListener('keydown', e => {
      const t = e.target;
      const typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if (!typing && e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault(); LABG.showShortcuts();
      }
    });
  };
  LABG.showShortcuts = function () {
    const all = [
      { keys: ['Alt', '←'], es: 'Bloque anterior', en: 'Previous block' },
      { keys: ['Alt', '→'], es: 'Bloque siguiente', en: 'Next block' },
      { keys: ['←', '→'], es: 'Recorrer la barra de bloques (con el foco en ella)', en: 'Move along the block bar (when it has focus)' },
      { keys: ['?'], es: 'Mostrar esta lista', en: 'Show this list' },
      { keys: ['Esc'], es: 'Cerrar ventanas y paneles', en: 'Close dialogs and panels' },
    ].concat(shortcutList);
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.className = 'labg-dialog';
      dlg.setAttribute('aria-labelledby', 'labgShortcutsTitle');
      document.body.appendChild(dlg);
      dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    }
    const kbd = k => k.map(x => '<kbd>' + x.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])) + '</kbd>').join(' + ');
    dlg.innerHTML =
      '<div class="dialog-head"><h2 id="labgShortcutsTitle">' + LABG.t('Atajos de teclado', 'Keyboard shortcuts') + '</h2>' +
      '<button type="button" class="icon-btn" data-close aria-label="' + LABG.t('Cerrar', 'Close') + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<div class="dialog-body"><dl class="shortcut-list">' +
      all.map(s => '<dt>' + kbd(s.keys) + '</dt><dd>' + LABG.t(s.es, s.en) + '</dd>').join('') +
      '</dl></div>';
    dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  };

  /* ---------------- tema ---------------- */
  LABG.theme = {
    key: 'labg:theme',
    init(key) {
      if (key) this.key = key;
      const saved = read(this.key);
      if (saved === 'dark' || saved === 'light') document.documentElement.setAttribute('data-theme', saved);
      this.paint();
    },
    current() {
      const set = document.documentElement.getAttribute('data-theme');
      if (set === 'dark' || set === 'light') return set;
      return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    },
    set(mode) {
      document.documentElement.setAttribute('data-theme', mode);
      write(this.key, mode);
      this.paint();
      document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: mode } }));
    },
    toggle() { this.set(this.current() === 'dark' ? 'light' : 'dark'); },
    paint() {
      const b = document.getElementById('themeBtn');
      if (!b) return;
      const dark = this.current() === 'dark';
      const tip = dark ? LABG.t('Cambiar a tema claro', 'Switch to light theme')
                       : LABG.t('Cambiar a tema oscuro', 'Switch to dark theme');
      b.setAttribute('aria-label', tip); b.setAttribute('title', tip);
      b.setAttribute('aria-pressed', dark ? 'true' : 'false');
    },
  };

  /* ---------------- isotipo LABG (la A-biplot) ----------------
     LABG.isotipo(clase) devuelve el ícono en vector, con ids propios en cada copia para que
     varias puedan convivir en la página. Los cinco puntos llevan la clase iso-dot y --i. */
  let isoSeq = 0;
  LABG.isotipo = function (cls, id) {
    const k = id || 'labgIso' + (++isoSeq);
    const A = 'M256 102.4L129.8 389.1M129.8 389.1L125.7 340.6M129.8 389.1L168.5 359.4M256 102.4L382.2 389.1M382.2 389.1L343.5 359.4M382.2 389.1L386.3 340.6';
    let dots = '';
    for (let i = 0; i < 5; i++) dots += '<circle class="iso-dot" style="--i:' + i + '" cx="' + (177.8 + 39.1 * i).toFixed(1) + '" cy="285.9" r="16.9" fill="url(#' + k + 's)"/>';
    return '<svg class="' + (cls || 'labg-iso') + '" viewBox="0 0 512 512" aria-hidden="true" focusable="false"><defs>' +
      '<linearGradient id="' + k + 'g" gradientUnits="userSpaceOnUse" x1="0" y1="102.4" x2="0" y2="389.12"><stop offset="0" stop-color="#EAFFF4"/><stop offset=".3" stop-color="#62E6A5"/><stop offset=".55" stop-color="#0C6A44"/><stop offset=".7" stop-color="#A2F6CC"/><stop offset="1" stop-color="#053F29"/></linearGradient>' +
      '<radialGradient id="' + k + 's" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#F0FFF7"/><stop offset=".38" stop-color="#3ED68B"/><stop offset="1" stop-color="#053A25"/></radialGradient>' +
      '<radialGradient id="' + k + 'b" cx=".5" cy=".35" r=".8"><stop offset="0" stop-color="#0B2A1D"/><stop offset="1" stop-color="#08090B"/></radialGradient></defs>' +
      '<rect x=".5" y=".5" width="511" height="511" rx="112.6" fill="url(#' + k + 'b)" stroke="#7BEDB5" stroke-opacity=".5"/>' +
      '<g fill="none" stroke-width="41" stroke-linecap="round"><path d="' + A + '" stroke="#021610" transform="translate(3.2 4)"/>' +
      '<path d="' + A + '" stroke="#021610" transform="translate(1.6 2)"/><path d="' + A + '" stroke="url(#' + k + 'g)"/></g>' +
      dots + '<circle class="iso-top" cx="256" cy="102.4" r="31.9" fill="url(#' + k + 's)"/></svg>';
  };

  /* ---------------- espera animada que termina en palomita ----------------
     const w = LABG.work({ title, message, scene, tips, cancel });
       w.update(0.4, 'Réplica 400 de 1000')  fracción 0–1; null si no se sabe cuánto falta
       w.message('Ajustando el modelo…')
       w.done('texto')   palomita, onda y estallido; se cierra sola
       w.fail('texto')   tache y botón Cerrar
     opciones.delay (ms): la ventana aparece solo si la espera dura más que eso
     LABG.work.run(opciones, tarea)   abre, deja pintar y corre tarea(w), síncrona o no
     LABG.work.scene = 'fit' | 'cluster' | 'grow'   escena por omisión de la app
     LABG.work.tips = [[es, en], …]   consejos propios de la app (se suman a los comunes)
     LABG.progressBar(contenedor)     barra en línea: update(f, texto) / done(texto) / fail(texto)
     LABG.busyButton(botón, tarea)    el botón trabaja con puntos y termina en palomita
     LABG.nextPaint()                 promesa que se cumple cuando el navegador ya pintó
     Lo que se mueve mientras se calcula usa solo transform y opacity: el navegador
     lo anima aparte, así que no se congela aunque el cálculo ocupe la página. */
  const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  LABG.nextPaint = () => new Promise(res => {
    let ok = false; const go = () => { if (!ok) { ok = true; res(); } };
    requestAnimationFrame(() => requestAnimationFrame(go));
    setTimeout(go, 90);                       /* pestaña oculta: sin cuadros de animación */
  });
  const el = (tag, cls, parent) => { const n = document.createElement(tag); if (cls) n.className = cls; if (parent) parent.appendChild(n); return n; };
  const SVGNS = 'http://www.w3.org/2000/svg';
  const markSvg = () => {
    const s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('viewBox', '0 0 52 52'); s.setAttribute('aria-hidden', 'true');
    s.innerHTML = '<circle class="lw-disc" cx="26" cy="26" r="26"/><path class="lw-check" d="M14.5 27.5l8 8L38 19"/><path class="lw-cross" d="M18 18L34 34M34 18L18 34"/>';
    return s;
  };
  const clock = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const secs = ms => ms < 10000 ? (ms / 1000).toFixed(1).replace('.', LABG.lang() === 'es' ? ',' : '.') + ' s'
    : ms < 60000 ? Math.round(ms / 1000) + ' s' : clock(ms / 1000) + ' min';

  const TIPS = [
    ['Alt + → te lleva al bloque siguiente y Alt + ← al anterior.', 'Alt + → takes you to the next block and Alt + ← to the previous one.'],
    ['Pulsa «?» para ver todos los atajos de teclado.', 'Press “?” to see every keyboard shortcut.'],
    ['Todo se calcula en tu equipo: tus datos no se suben a ningún servidor.', 'Everything is computed on your computer: your data is never uploaded.'],
    ['Las figuras se exportan en alta resolución, listas para publicar.', 'Figures export at high resolution, ready to publish.'],
    ['El botón de tema cambia entre claro y oscuro; la app lo recuerda.', 'The theme button switches light and dark; the app remembers it.'],
    ['La marca ✓ en la barra de bloques indica lo que ya terminaste.', 'A ✓ in the block bar shows what you have already finished.'],
  ];
  const PATIENCE = ['Sigue trabajando. Los análisis con muchas repeticiones tardan un poco más.',
                    'Still working. Analyses with many replicates take a little longer.'];

  /* partículas del estallido: una regla por partícula, con valores fijos */
  let burstReady = false;
  function burstStyle() {
    if (burstReady) return; burstReady = true;
    let css = '';
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + (i % 2 ? 0.17 : 0), r = 50 + (i % 3) * 13;
      const x = Math.round(Math.cos(a) * r), y = Math.round(Math.sin(a) * r), rot = (i * 47) % 360;
      css += '@keyframes lw-b' + i + '{0%{opacity:0;transform:translate(0,0) scale(.4)}12%{opacity:1}' +
        '70%{opacity:1}100%{opacity:0;transform:translate(' + x + 'px,' + (y + 6) + 'px) rotate(' + rot + 'deg) scale(1)}}' +
        '.lw-card.is-done .lw-burst i:nth-child(' + (i + 1) + '){animation:lw-b' + i + ' 900ms ' + (160 + (i % 4) * 25) + 'ms cubic-bezier(.15,.7,.3,1) both}';
    }
    const st = el('style'); st.textContent = '@media (prefers-reduced-motion: no-preference){' + css + '}';
    document.head.appendChild(st);
  }

  /* escenas: puntos que se ordenan en una recta, en grupos, o una planta que crece */
  let sceneSeq = 0;
  function buildScene(kind, host) {
    const scene = el('div', 'lw-scene', host);
    scene.setAttribute('aria-hidden', 'true');
    if (kind === 'tree') {
      /* un cladograma que se dibuja desde la raíz: ((A,B),(C,(D,(E,F)))). Cada pieza
         lleva su momento t (0–1): en bucle brota en orden; con porcentaje, cuando f ≥ t */
      const id = 'lwt' + (++sceneSeq), X = 184;
      const P = [
        ['h', 14, 36, 42, 0], ['v', 36, 21, 63.5, 0.08],
        ['h', 36, 120, 21, 0.16], ['h', 36, 78, 63.5, 0.16],
        ['v', 120, 12, 30, 0.28], ['v', 78, 48, 79, 0.28],
        ['h', 120, X, 12, 0.38], ['h', 120, X, 30, 0.38], ['h', 78, X, 48, 0.38], ['h', 78, 112, 79, 0.38],
        ['v', 112, 66, 92, 0.5], ['h', 112, X, 66, 0.6], ['h', 112, 150, 92, 0.6],
        ['v', 150, 84, 100, 0.7], ['h', 150, X, 84, 0.8], ['h', 150, X, 100, 0.8],
      ];
      [12, 30, 48, 66, 84, 100].forEach((y, i) => P.push(['tip', X, y, i, [0.46, 0.46, 0.46, 0.68, 0.88, 0.88][i]]));
      let css = '';
      const parts = P.map((p, i) => {
        const n = el('div', p[0] === 'tip' ? 'lw-tipdot g' + (p[3] % 3) : 'lw-seg ' + p[0], scene);
        let from;
        if (p[0] === 'h') { Object.assign(n.style, { left: p[1] + 'px', top: (p[3] - 1.25) + 'px', width: (p[2] - p[1]) + 'px' }); from = 'scaleX(0)'; }
        else if (p[0] === 'v') { Object.assign(n.style, { left: (p[1] - 1.25) + 'px', top: p[2] + 'px', height: (p[3] - p[2]) + 'px' }); from = 'scaleY(0)'; }
        else { Object.assign(n.style, { left: (p[1] - 4.5) + 'px', top: (p[2] - 4.5) + 'px' }); from = 'scale(0)'; }
        n.style.transform = from;
        const a = Math.round(p[4] * 55), b = a + 8;
        css += '@keyframes ' + id + 'p' + i + '{0%,' + a + '%{transform:' + from + '}' + b + '%,84%{transform:none}96%,100%{transform:' + from + '}}';
        return { n, t: p[4], from };
      });
      const st = el('style', '', scene); st.textContent = css;
      return {
        scene,
        loop() {
          if (reduced()) { parts.forEach(p => { p.n.style.transform = 'none'; }); return; }
          parts.forEach((p, i) => { p.n.style.animation = id + 'p' + i + ' 3.8s cubic-bezier(.3,.7,.3,1) infinite'; });
        },
        land(f) {
          parts.forEach(p => { p.n.style.animation = 'none'; p.n.style.transform = f >= p.t ? 'none' : p.from; });
        },
      };
    }
    if (kind === 'grow') {
      ['lw-soil', 'lw-seed', 'lw-stem', 'lw-leaf l1', 'lw-leaf l2', 'lw-leaf l3', 'lw-bud'].forEach(c => el('div', c, scene));
      const stem = scene.querySelector('.lw-stem'), parts = scene.querySelectorAll('.lw-leaf, .lw-bud');
      return {
        scene,
        loop() { scene.classList.add('loop'); },
        land(f) {
          scene.classList.remove('loop');
          stem.style.transform = 'scaleY(' + (0.05 + 0.95 * Math.min(1, f / 0.9)).toFixed(3) + ')';
          [0.3, 0.52, 0.74, 0.95].forEach((t, i) => parts[i].classList.toggle('on', f >= t));
        },
      };
    }
    const n = 15, W = 200, H = 112, id = 'lw' + (++sceneSeq);
    const rnd = (a, b) => a + Math.random() * (b - a);
    const pts = [];
    if (kind === 'cluster') {
      const C = [[48, 38], [152, 40], [100, 84]];
      C.forEach((c, g) => { const h = el('div', 'lw-halo g' + g, scene); h.style.left = c[0] + 'px'; h.style.top = c[1] + 'px'; });
      for (let i = 0; i < n; i++) {
        const g = i % 3, a = rnd(0, 6.283), r = rnd(3, 15);
        pts.push({ g, tx: C[g][0] + Math.cos(a) * r, ty: C[g][1] + Math.sin(a) * r });
      }
    } else {
      el('div', 'lw-axis x', scene); el('div', 'lw-axis y', scene);
      const x0 = 22, x1 = 188, y0 = 94, y1 = 20;
      const line = el('div', 'lw-line', scene);
      line.style.left = x0 + 'px'; line.style.top = y0 + 'px';
      line.style.width = Math.hypot(x1 - x0, y1 - y0) + 'px';
      line.style.transform = 'rotate(' + Math.atan2(y1 - y0, x1 - x0) + 'rad)';
      for (let i = 0; i < n; i++) {
        const x = x0 + (i + 0.5) * (x1 - x0) / n;
        pts.push({ g: i % 5 === 2 ? 1 : 0, tx: x, ty: y0 + (x - x0) * (y1 - y0) / (x1 - x0) + rnd(-9, 9) });
      }
    }
    let css = '';
    const dots = pts.map((p, i) => {
      p.sx = rnd(14, W - 14); p.sy = rnd(8, H - 14);
      const d = el('div', 'lw-dot g' + p.g, scene); el('i', '', d);
      const S = 'translate(' + (p.sx - 4.5).toFixed(1) + 'px,' + (p.sy - 4.5).toFixed(1) + 'px)';
      const T = 'translate(' + (p.tx - 4.5).toFixed(1) + 'px,' + (p.ty - 4.5).toFixed(1) + 'px)';
      p.S = S; p.T = T; d.style.transform = S;
      css += '@keyframes ' + id + 'd' + i + '{0%,10%{transform:' + S + '}44%,74%{transform:' + T + '}100%{transform:' + S + '}}';
      return d;
    });
    const st = el('style', '', scene); st.textContent = css;
    const order = dots.map((d, i) => i).sort(() => Math.random() - 0.5);
    const deco = scene.querySelectorAll('.lw-line, .lw-halo');
    return {
      scene,
      loop() {
        if (reduced()) { dots.forEach((d, i) => { d.style.transform = pts[i].T; }); deco.forEach(x => { x.style.opacity = 1; }); return; }
        scene.classList.add('loop');
        dots.forEach((d, i) => { d.style.animation = id + 'd' + i + ' 3.4s cubic-bezier(.45,.05,.3,1) ' + (i * 45) + 'ms infinite'; });
      },
      land(f) {
        scene.classList.remove('loop');
        const k = Math.round(f * n);
        order.forEach((i, r) => { dots[i].style.animation = 'none'; dots[i].style.transform = r < k ? pts[i].T : pts[i].S; });
        deco.forEach(x => { x.style.opacity = Math.max(0, Math.min(1, (f - 0.35) / 0.45)); });
      },
    };
  }

  let current = null;
  LABG.work = function (opts) {
    const o = Object.assign({ title: LABG.t('Calculando…', 'Computing…'), message: '', scene: LABG.work.scene || 'fit', tips: null, cancel: null, hold: 1500, delay: 0 }, opts || {});
    if (current) current.close(true);
    burstStyle();
    const before = document.activeElement;
    const back = el('div', 'lw-backdrop', document.body);
    const card = el('div', 'lw-card', back);
    /* con demora, un cálculo rápido termina antes de que la ventana se vea */
    if (o.delay) back.style.transitionDelay = card.style.transitionDelay = o.delay + 'ms';
    back.addEventListener('click', e => { if (ended && !closed && !card.contains(e.target)) w.close(); });
    const tid = 'lwt' + (++sceneSeq);
    card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', tid); card.tabIndex = -1;
    const stage = el('div', 'lw-stage', card);
    const sc = buildScene(o.scene, stage);
    /* al terminar: el isotipo LABG y, en su esquina, la insignia con la palomita (o el tache) */
    const badge = el('div', 'lw-badge', stage); badge.innerHTML = LABG.isotipo('lw-iso');
    el('div', 'lw-ripple', badge); el('span', 'lw-mark', badge).appendChild(markSvg());
    const burst = el('div', 'lw-burst', stage); burst.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 18; i++) el('i', '', burst);
    const title = el('h2', 'lw-title', card); title.id = tid; title.textContent = o.title;
    const msg = el('p', 'lw-msg', card); msg.textContent = o.message;
    const bar = el('div', 'lw-bar indet', card); const fill = el('div', 'lw-fill', bar);
    bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-labelledby', tid);
    const meta = el('div', 'lw-meta', card); const pct = el('span', '', meta); const time = el('span', '', meta);
    const tip = el('p', 'lw-tip', card);
    const actions = el('div', 'lw-actions', card);
    let cancelBtn = null;

    const t0 = performance.now();
    let frac = null, ended = false, closed = false, lastFrac = 0;
    const tips = (LABG.work.tips || []).concat(o.tips || [], TIPS).map(x => Array.isArray(x) ? x : [x, x]);
    let ti = Math.floor(Math.random() * tips.length), shownPatience = false;
    const showTip = text => { tip.classList.add('fade'); setTimeout(() => { tip.textContent = text; tip.classList.remove('fade'); }, reduced() ? 0 : 350); };
    const tick = () => {
      if (ended) return;
      const s = (performance.now() - t0) / 1000;
      let txt = clock(s);
      if (frac != null && frac > 0.04 && s > 1.5 && frac < 1) {
        const left = s * (1 - frac) / frac;
        txt = LABG.t('quedan ~', '~') + (left < 60 ? Math.max(1, Math.round(left)) + ' s' : clock(left)) + LABG.t('', ' left');
      }
      time.textContent = txt;
    };
    const timers = [setInterval(tick, 500), setTimeout(() => showTip(LABG.t(tips[ti][0], tips[ti][1])), 1800),
      setInterval(() => {
        const s = (performance.now() - t0) / 1000;
        if (s > 14 && !shownPatience) { shownPatience = true; showTip(LABG.t(PATIENCE[0], PATIENCE[1])); return; }
        ti = (ti + 1) % tips.length; showTip(LABG.t(tips[ti][0], tips[ti][1]));
      }, 6500)];
    const stopTimers = () => timers.forEach(t => { clearInterval(t); clearTimeout(t); });

    const w = {
      get ended() { return ended; }, get closed() { return closed; }, cancelled: false,
      message(t) { if (!ended && t != null) msg.textContent = t; return w; },
      update(f, t) {
        if (ended) return w;
        if (t != null) msg.textContent = t;
        if (f == null) { frac = null; fill.style.transform = ''; bar.classList.add('indet'); bar.removeAttribute('aria-valuenow'); pct.textContent = ''; sc.loop(); return w; }
        f = Math.max(0, Math.min(1, +f || 0));
        if (frac == null) bar.classList.remove('indet');
        frac = f;
        fill.style.transform = 'scaleX(' + f.toFixed(4) + ')';
        const p = Math.floor(f * 100);
        pct.textContent = p + ' %';
        bar.setAttribute('aria-valuenow', p);
        if (Math.abs(f - lastFrac) > 0.02 || f === 1 || f === 0) { lastFrac = f; sc.land(f); }
        return w;
      },
      done(text, opt) {
        if (ended) return Promise.resolve();
        /* a wait that ended before its window showed (o.delay) closes quietly: a
           celebration for something the person never saw waiting would only get in the way */
        if (o.delay && performance.now() - t0 < o.delay + 150) { w.close(); return Promise.resolve(); }
        const oo = Object.assign({ title: LABG.t('¡Listo!', 'Done!'), hold: o.hold }, opt || {});
        ended = true; stopTimers();
        const ms = performance.now() - t0;
        bar.classList.remove('indet'); fill.style.transform = 'scaleX(1)'; pct.textContent = '100 %';
        bar.setAttribute('aria-valuenow', 100);
        sc.land(1);
        return new Promise(res => {
          setTimeout(() => {
            card.classList.add('is-done');
            title.textContent = oo.title;
            msg.textContent = text || LABG.t('Terminado en ', 'Finished in ') + secs(ms);
            time.textContent = secs(ms); tip.textContent = '';
            actions.textContent = '';
            LABG.announce(oo.title + ' ' + msg.textContent);
            setTimeout(() => { w.close(); res(); }, reduced() ? Math.min(oo.hold, 1200) : oo.hold);
          }, reduced() ? 0 : 380);
        });
      },
      fail(text) {
        if (ended) return w;
        ended = true; stopTimers();
        bar.classList.remove('indet'); if (frac == null) fill.style.transform = 'scaleX(1)';
        card.classList.add('is-failed');
        time.textContent = secs(performance.now() - t0);
        title.textContent = LABG.t('No se pudo terminar', 'Could not finish');
        msg.textContent = text || ''; tip.textContent = '';
        actions.textContent = '';
        const b = el('button', 'btn btn-secondary btn-sm', actions); b.type = 'button';
        b.textContent = LABG.t('Cerrar', 'Close'); b.addEventListener('click', () => w.close());
        b.focus();
        LABG.announce(title.textContent + '. ' + msg.textContent);
        return w;
      },
      close(now) {
        if (closed) return; closed = true; ended = true; stopTimers();
        document.removeEventListener('keydown', onKey, true);
        if (current === w) current = null;
        back.style.transitionDelay = card.style.transitionDelay = '0ms';
        back.classList.remove('open');
        setTimeout(() => back.remove(), now || reduced() ? 0 : 260);
        if (before && before.focus && document.contains(before)) try { before.focus({ preventScroll: true }); } catch (e) { /* nada */ }
      },
    };
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); if (card.classList.contains('is-failed') || card.classList.contains('is-done')) w.close(); else if (cancelBtn) cancelBtn.click(); }
      else if (e.key === 'Tab') { e.preventDefault(); const b = actions.querySelector('button'); (b || card).focus(); }
    }
    document.addEventListener('keydown', onKey, true);
    if (typeof o.cancel === 'function') {
      cancelBtn = el('button', 'btn btn-secondary btn-sm', actions); cancelBtn.type = 'button';
      cancelBtn.textContent = LABG.t('Cancelar', 'Cancel');
      cancelBtn.addEventListener('click', () => {
        if (ended) return; w.cancelled = true;
        try { o.cancel(); } catch (e) { /* la app decide */ }
        LABG.announce(LABG.t('Cancelado', 'Cancelled')); w.close();
      });
    }
    sc.loop(); tick();
    current = w;
    requestAnimationFrame(() => back.classList.add('open'));
    setTimeout(() => back.classList.add('open'), 30);
    (cancelBtn || card).focus({ preventScroll: true });
    LABG.announce(o.title);
    return w;
  };
  LABG.work.run = async function (opts, task) {
    const w = LABG.work(opts);
    await LABG.nextPaint();
    try {
      const r = await task(w);
      if (w.cancelled) { w.close(); return undefined; }
      w.done(opts && opts.doneMessage);
      return r;
    } catch (e) {
      if (w.cancelled) { w.close(); return undefined; }
      w.fail((opts && opts.failMessage) || (e && e.message) || String(e));
      throw e;
    }
  };

  LABG.progressBar = function (host, opts) {
    const o = Object.assign({ label: '' }, opts || {});
    host.textContent = '';
    const box = el('div', 'lw-inline', host);
    const bar = el('div', 'lw-bar', box); const fill = el('div', 'lw-fill', bar);
    bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', '100');
    if (o.label) bar.setAttribute('aria-label', o.label);
    const label = el('span', 'lw-ilabel', box);
    const mark = el('span', 'lw-imark', box); mark.appendChild(markSvg());
    const t0 = performance.now();
    const api = {
      update(f, text) {
        box.classList.remove('is-done', 'is-failed');
        if (f == null) { bar.classList.add('indet'); bar.removeAttribute('aria-valuenow'); fill.style.transform = ''; }
        else {
          bar.classList.remove('indet'); f = Math.max(0, Math.min(1, +f || 0));
          fill.style.transform = 'scaleX(' + f.toFixed(4) + ')'; bar.setAttribute('aria-valuenow', Math.floor(f * 100));
        }
        label.textContent = text != null ? text : (f == null ? '' : Math.floor(f * 100) + ' %');
        return api;
      },
      done(text) {
        bar.classList.remove('indet'); fill.style.transform = 'scaleX(1)'; bar.setAttribute('aria-valuenow', 100);
        setTimeout(() => {
          box.classList.add('is-done');
          label.textContent = text || LABG.t('Listo · ', 'Done · ') + secs(performance.now() - t0);
        }, reduced() ? 0 : 320);
        return api;
      },
      fail(text) { bar.classList.remove('indet'); box.classList.add('is-failed'); label.textContent = text || LABG.t('Error', 'Error'); return api; },
      el: box,
    };
    return api;
  };

  LABG.busyButton = async function (btn, task, opts) {
    const o = Object.assign({ doneText: LABG.t('Listo', 'Done'), hold: 1600 }, opts || {});
    if (!btn || btn.classList.contains('lw-btn-working')) return undefined;
    const kids = Array.from(btn.childNodes), wasDisabled = btn.disabled;
    btn.style.minWidth = btn.offsetWidth + 'px';
    btn.classList.add('lw-btn-working'); btn.setAttribute('aria-busy', 'true'); btn.disabled = true;
    const dots = el('span', 'lw-dots', btn); dots.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 3; i++) el('i', '', dots);
    const restore = () => {
      btn.classList.remove('lw-btn-working', 'lw-btn-done', 'lw-btn-failed');
      btn.removeAttribute('aria-busy'); btn.replaceChildren(...kids);
      btn.disabled = wasDisabled; btn.style.minWidth = '';
    };
    await LABG.nextPaint();
    try {
      const r = await task();
      btn.classList.remove('lw-btn-working'); btn.classList.add('lw-btn-done'); btn.removeAttribute('aria-busy');
      const s = markSvg(); s.querySelector('.lw-disc').remove(); s.setAttribute('viewBox', '10 12 32 28');
      s.querySelector('.lw-check').style.strokeDashoffset = '0';
      btn.replaceChildren(s, document.createTextNode(' ' + o.doneText));
      LABG.announce(o.doneText);
      setTimeout(restore, o.hold);
      return r;
    } catch (e) {
      btn.classList.remove('lw-btn-working'); btn.classList.add('lw-btn-failed');
      dots.remove(); setTimeout(restore, 900);
      throw e;
    }
  };

  window.LABG = LABG;
})();
