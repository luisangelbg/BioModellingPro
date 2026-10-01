/* LABG Suite — Navegador LABG v1.0.0 (módulo compartido)
   Copyright (C) 2026  Luis Ángel Barrera-Guzmán

   This program is free software: you can redistribute it and/or modify it under
   the terms of the GNU General Public License as published by the Free Software
   Foundation, either version 3 of the License, or (at your option) any later
   version. It is distributed in the hope that it will be useful, but WITHOUT ANY
   WARRANTY; see the GNU General Public License, in the file LICENSE at the root
   of this program, or <https://www.gnu.org/licenses/>.

   Íconos: Lucide v1.49.0 (licencia ISC; algunos derivan de Feather, licencia MIT).
   El texto de ambas licencias está en LICENSES-TERCEROS.md, junto a este módulo.

   Qué hace
   --------
   Ordena la navegación de una app de la suite en tres niveles, sin tocar sus
   cálculos ni mover sus nodos:

     1. Bloques   barra lateral a la izquierda con el estado de cada bloque
                  (activo, terminado, con aviso, bloqueado); se contrae con «[».
                  En el teléfono se vuelve una fila de pestañas abajo.
     2. Secciones dentro del bloque, en dos modos que se recuerdan por app:
                  «Documento»: índice fijo a la derecha que sigue la lectura
                  (IntersectionObserver), barra de progreso y la sección actual
                  siempre a la vista en la ruta de arriba;
                  «Enfocado»: una sección a la vez, con Anterior / Siguiente
                  y Alt+← / Alt+→.
     3. Comandos  paleta con Ctrl+K: busca bloques, secciones, controles,
                  figuras y acciones, con los recientes primero.

   Además: ruta (App › Bloque › Sección), contraer y expandir secciones con
   memoria, botón para volver arriba y para volver a lo último que se editó,
   enlaces directos #bN/seccion que respetan Atrás y Adelante, aviso «Ir al
   paso pendiente» cuando un bloque espera un paso anterior, ayuda en contexto
   con «?» y, si el Estudio de figuras LABG está cargado, abrir desde el índice
   las figuras de cada sección.

   Mejora progresiva: si algo falla, la app sigue con su barra de bloques de
   siempre. Funciona con doble clic (file://), sin servidor ni dependencias.

   Uso: una línea, después de labg-core.js:
     <script src="js/labg-navigator.js" defer></script>
   La hoja de estilo se carga sola (css/labg-navigator.css o, si el módulo vive
   en otra carpeta, la .css del mismo nombre a su lado).

   Configuración opcional, antes del script: window.LABG_NAV = { … } (ver DEF).
   API: window.LABGNavigator  (ver al final). */
(function () {
  'use strict';
  if (window.LABGNavigator && window.LABGNavigator.version) return;
  const VERSION = '1.0.0';
  const me = document.currentScript;

  /* ---------------- hoja de estilo (se carga sola) ---------------- */
  (function css() {
    if (document.querySelector('link[data-lnav-css]')) return;
    const src = (me && me.src) || '';
    const href = (me && me.dataset.css) || (/\/js\/(?:core\/)?labg-navigator\.js(\?.*)?$/.test(src)
      ? src.replace(/\/js\/(?:core\/)?labg-navigator\.js(\?.*)?$/, '/css/labg-navigator.css')
      : src.replace(/\.js(\?.*)?$/, '.css'));
    if (!href) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href; l.setAttribute('data-lnav-css', '');
    (document.head || document.documentElement).appendChild(l);
  })();

  /* ---------------- utilidades ---------------- */
  const lang = () => ((document.documentElement.lang || 'es').slice(0, 2) === 'en' ? 'en' : 'es');
  const T = (es, en) => (lang() === 'en' ? en : es);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const slug = s => fold(s).replace(/^[\s\d.·:\-–—]+(?=[a-z])/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 's';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const mk = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const raf = window.requestAnimationFrame || (f => setTimeout(f, 16));
  const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const shown = el => !!(el && el.getClientRects().length);
  const typing = t => !!(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)));

  /* íconos: Lucide v1.49.0 (ISC). Se dibujan con trazo de 1.5 para que se vean finos. */
  const ICONOS = {
    "panel-left-close": "<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"/><path d=\"M9 3v18\"/><path d=\"m16 15-3-3 3-3\"/>",
    "panel-left-open": "<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"/><path d=\"M9 3v18\"/><path d=\"m14 9 3 3-3 3\"/>",
    "chevron-right": "<path d=\"m9 18 6-6-6-6\"/>",
    "chevron-down": "<path d=\"m6 9 6 6 6-6\"/>",
    "chevrons-down-up": "<path d=\"m7 20 5-5 5 5\"/><path d=\"m7 4 5 5 5-5\"/>",
    "chevrons-up-down": "<path d=\"m7 15 5 5 5-5\"/><path d=\"m7 9 5-5 5 5\"/>",
    "search": "<path d=\"m21 21-4.34-4.34\"/><circle cx=\"11\" cy=\"11\" r=\"8\"/>",
    "file-text": "<path d=\"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z\"/><path d=\"M14 2v5a1 1 0 0 0 1 1h5\"/><path d=\"M10 9H8\"/><path d=\"M16 13H8\"/><path d=\"M16 17H8\"/>",
    "focus": "<circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M3 7V5a2 2 0 0 1 2-2h2\"/><path d=\"M17 3h2a2 2 0 0 1 2 2v2\"/><path d=\"M21 17v2a2 2 0 0 1-2 2h-2\"/><path d=\"M7 21H5a2 2 0 0 1-2-2v-2\"/>",
    "arrow-up": "<path d=\"m5 12 7-7 7 7\"/><path d=\"M12 19V5\"/>",
    "arrow-left": "<path d=\"m12 19-7-7 7-7\"/><path d=\"M19 12H5\"/>",
    "arrow-right": "<path d=\"M5 12h14\"/><path d=\"m12 5 7 7-7 7\"/>",
    "pencil-line": "<path d=\"M13 21h8\"/><path d=\"m15 5 4 4\"/><path d=\"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z\"/>",
    "lock": "<rect width=\"18\" height=\"11\" x=\"3\" y=\"11\" rx=\"2\" ry=\"2\"/><path d=\"M7 11V7a5 5 0 0 1 10 0v4\"/>",
    "check": "<path d=\"M20 6 9 17l-5-5\"/>",
    "triangle-alert": "<path d=\"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3\"/><path d=\"M12 9v4\"/><path d=\"M12 17h.01\"/>",
    "circle-dashed": "<path d=\"M10.1 2.182a10 10 0 0 1 3.8 0\"/><path d=\"M13.9 21.818a10 10 0 0 1-3.8 0\"/><path d=\"M17.609 3.721a10 10 0 0 1 2.69 2.7\"/><path d=\"M2.182 13.9a10 10 0 0 1 0-3.8\"/><path d=\"M20.279 17.609a10 10 0 0 1-2.7 2.69\"/><path d=\"M21.818 10.1a10 10 0 0 1 0 3.8\"/><path d=\"M3.721 6.391a10 10 0 0 1 2.7-2.69\"/><path d=\"M6.391 20.279a10 10 0 0 1-2.69-2.7\"/>",
    "link": "<path d=\"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71\"/><path d=\"M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71\"/>",
    "circle-help": "<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3\"/><path d=\"M12 17h.01\"/>",
    "corner-down-right": "<path d=\"m15 10 5 5-5 5\"/><path d=\"M4 4v7a4 4 0 0 0 4 4h12\"/>",
    "pencil-ruler": "<path d=\"M13 7 8.7 2.7a2.41 2.41 0 0 0-3.4 0L2.7 5.3a2.41 2.41 0 0 0 0 3.4L7 13\"/><path d=\"m8 6 2-2\"/><path d=\"m18 16 2-2\"/><path d=\"m17 11 4.3 4.3c.94.94.94 2.46 0 3.4l-2.6 2.6c-.94.94-2.46.94-3.4 0L11 17\"/><path d=\"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z\"/><path d=\"m15 5 4 4\"/>",
    "sun": "<circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2v2\"/><path d=\"M12 20v2\"/><path d=\"m4.93 4.93 1.41 1.41\"/><path d=\"m17.66 17.66 1.41 1.41\"/><path d=\"M2 12h2\"/><path d=\"M20 12h2\"/><path d=\"m6.34 17.66-1.41 1.41\"/><path d=\"m19.07 4.93-1.41 1.41\"/>",
    "languages": "<path d=\"m5 8 6 6\"/><path d=\"m4 14 6-6 2-3\"/><path d=\"M2 5h12\"/><path d=\"M7 2h1\"/><path d=\"m22 22-5-10-5 10\"/><path d=\"M14 18h6\"/>",
    "keyboard": "<path d=\"M10 8h.01\"/><path d=\"M12 12h.01\"/><path d=\"M14 8h.01\"/><path d=\"M16 12h.01\"/><path d=\"M18 8h.01\"/><path d=\"M6 8h.01\"/><path d=\"M7 16h10\"/><path d=\"M8 12h.01\"/><rect width=\"20\" height=\"16\" x=\"2\" y=\"4\" rx=\"2\"/>",
    "message-circle-warning": "<path d=\"M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719\"/><path d=\"M12 8v4\"/><path d=\"M12 16h.01\"/>",
    "house": "<path d=\"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8\"/><path d=\"M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\"/>",
    "x": "<path d=\"M18 6 6 18\"/><path d=\"m6 6 12 12\"/>",
    "list": "<path d=\"M3 5h.01\"/><path d=\"M3 12h.01\"/><path d=\"M3 19h.01\"/><path d=\"M8 5h13\"/><path d=\"M8 12h13\"/><path d=\"M8 19h13\"/>",
    "clock": "<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 6v6l4 2\"/>",
    "zap": "<path d=\"M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z\"/>",
    "table-of-contents": "<path d=\"M16 5H3\"/><path d=\"M16 12H3\"/><path d=\"M16 19H3\"/><path d=\"M21 5h.01\"/><path d=\"M21 12h.01\"/><path d=\"M21 19h.01\"/>",
  };
  const ico = (n, cls) => '<svg class="lnav-i' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (ICONOS[n] || '') + '</svg>';

  /* el texto visible de un nodo, en el idioma activo, aunque el bloque esté oculto */
  function textOf(el) {
    if (!el) return '';
    const L = lang();
    let out = '';
    const walk = n => {
      if (n.nodeType === 3) { out += n.nodeValue; return; }
      if (n.nodeType !== 1) return;
      const t = n.tagName;
      if (/^(SCRIPT|STYLE|TEMPLATE|SELECT|OPTION|TEXTAREA|OUTPUT)$/.test(t) || t.toLowerCase() === 'svg') return;
      if (n.hidden || n.classList.contains('sr-only') || n.classList.contains('step-state') || n.classList.contains('lnav-own')) return;
      /* los distintivos de ayuda («?», «i») y los botones dentro de un título no son parte del texto */
      if (n !== el && (t === 'BUTTON' || n.hasAttribute('data-help') || /(^|\s)(help-badge|help-btn|help-dot|info-btn|hint-btn)(\s|$)/.test(n.className || ''))) return;
      const dl = n.getAttribute('data-l') || n.getAttribute('lang');
      if (dl && n !== el && dl.slice(0, 2) !== L && /^(es|en)/.test(dl)) return;
      if (n.style && n.style.display === 'none') return;
      /* el otro idioma (o lo que la app esconde con su hoja de estilo) no se lee */
      if (n !== el && getComputedStyle(n).display === 'none') return;
      const blk = /^(DIV|P|LI|SMALL|BR|H[1-6]|SECTION|TD|TH|DT|DD|SUMMARY)$/.test(t);
      if (blk) out += ' ';
      for (let c = n.firstChild; c; c = c.nextSibling) walk(c);
      if (blk) out += ' ';
    };
    walk(el);
    return out.replace(/\s+/g, ' ').trim();
  }

  /* ---------------- identidad de la app y configuración ---------------- */
  const APP = (document.title || 'labg').split(/[\s—–·|:]+/)[0].toLowerCase().replace(/[^a-z0-9]+/g, '') || 'labg';
  const APP_NAME = (document.title || 'LABG').split(/\s+[—–·|-]\s+/)[0].trim();

  const DEF = {
    steps: '.stepper .step-btn[data-step]',     /* los botones de la barra de bloques de la app */
    stepper: '.stepper',                        /* la barra que el navegador reemplaza a la vista */
    topbar: '.topbar',
    main: '#main, main',
    panel: n => document.getElementById('panel-' + n),   /* el panel de cada bloque */
    blockHead: '.panel-title, .blk-title, .blk-head, .block-title, .page-head',
    heads: 'h2, h3',                            /* títulos que abren una sección */
    skip: '.step-footer, .next-bar, .messages, .msg, script, style, template, dialog, .lnav-own, [data-lnav-skip]',
    empty: '.soon-box, .sim-empty, .empty-state, [id$="NoData"], [id$="NoTree"], [id$="NoResults"], [id$="Empty"]',
    sidebar: true,      /* false: la app ya tiene su propio menú lateral */
    hash: true,         /* enlaces #bN/seccion */
    noToc: [],          /* bloques sin índice de secciones (tienen su propio índice) */
    minSections: 2,
  };
  /* lo propio de cada app (lo demás lo encuentra solo) */
  const PERFILES = {
    scimetricspro: {
      sidebar: false, hash: false,
      panel: () => document.getElementById('view'),
      blockHead: '.page-head, .crumb',
    },
    leafpro: { noToc: ['5'] },                  /* el atlas ya tiene su índice de categorías */
    biomodellingpro: {},
  };
  const CFG = Object.assign({}, DEF, PERFILES[APP] || {}, window.LABG_NAV || {});
  ['steps', 'stepper', 'heads', 'skip', 'empty'].forEach(k => { if (me && me.dataset[k]) CFG[k] = me.dataset[k]; });

  /* memoria por app */
  const KEY = 'labg-nav:' + APP + ':';
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(KEY + k)); return v == null ? d : v; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch (e) { /* navegación privada */ } };

  /* ---------------- estado ---------------- */
  const S = {
    on: false,
    mode: load('mode', 'doc') === 'focus' ? 'focus' : 'doc',
    rail: load('rail', null),          /* null: lo decide el ancho de la pantalla */
    block: null,                       /* data-step del bloque activo */
    secs: [],                          /* secciones del bloque activo */
    cur: 0,                            /* sección activa (índice) */
    focusIdx: {},                      /* sección elegida por bloque en modo enfocado */
    folded: load('fold', {}),          /* { bloque: [id de sección, …] } */
    recents: load('recents', []),
    last: null,                        /* lo último que se editó */
    lastHash: '',
    fromPop: false,
    pendingSec: null,
  };
  const listeners = {};
  const emit = (ev, d) => (listeners[ev] || []).forEach(f => { try { f(d); } catch (e) { console.error(e); } });

  /* ---------------- bloques (leídos de la barra de la app) ---------------- */
  function stepBtns() { return $$(CFG.steps).filter(b => !b.closest('.lnav-own')); }
  function stepInfo(b) {
    const numEl = b.querySelector('.step-num');
    let label = '';
    for (let c = b.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 1 && getComputedStyle(c).display === 'none') continue;
      if (c.nodeType === 1 && (c.classList.contains('step-num') || c.classList.contains('sr-only') || c.classList.contains('step-state') || c.classList.contains('nav-dot'))) continue;
      label += c.nodeType === 1 ? textOf(c) + ' ' : (c.nodeValue || '');
    }
    label = label.replace(/\s+/g, ' ').replace(/^[^\p{L}\p{N}]+/u, '').trim();
    const num = numEl ? numEl.textContent.trim() : '';
    return {
      n: b.dataset.step, btn: b, num, label: label || num,
      active: b.getAttribute('aria-current') === 'step' || b.getAttribute('aria-current') === 'page' || b.classList.contains('active'),
      done: b.classList.contains('done'), warn: b.classList.contains('warn'),
      disabled: !!b.disabled || b.getAttribute('aria-disabled') === 'true' || b.classList.contains('locked'),
      soon: b.classList.contains('soon'),
    };
  }
  const steps = () => stepBtns().map(stepInfo);
  const activeStep = () => { const a = steps().find(s => s.active); return a ? a.n : (S.block || null); };
  function panelOf(n) {
    let p = null;
    try { p = typeof CFG.panel === 'function' ? CFG.panel(n) : document.querySelector(String(CFG.panel).replace('{n}', n)); } catch (e) { p = null; }
    return p || document.querySelector('[data-labg-block="' + n + '"]');
  }
  const activePanel = () => panelOf(S.block) || $('.step-panel.active') || $(CFG.main);

  /* ---------------- secciones ---------------- */
  const isSkip = el => el.matches(CFG.skip) || el.matches(CFG.blockHead) || el.classList.contains('lnav-own');
  const isHead = el => /^H[23]$/.test(el.tagName) || el.classList.contains('section-title');
  const HEAD_IN = [':scope > h2', ':scope > h3', ':scope > header h2', ':scope > header h3', ':scope > .card-head h2', ':scope > .card-head h3',
    ':scope > .results-header h2', ':scope > summary h2', ':scope > summary h3', ':scope > .chart-head h3', ':scope > .chart-head h2',
    ':scope > div:first-child > h2', ':scope > div:first-child > h3', ':scope > .card-head > div > h2'].join(', ');
  /* el título de un envoltorio, si lo tiene arriba (una tarjeta con su h2) */
  function headOf(el) {
    if (/^(H[1-6]|P|SPAN|A|BUTTON|LABEL|INPUT|SELECT|TEXTAREA|TABLE|UL|OL|IMG|CANVAS|svg)$/i.test(el.tagName)) return null;
    let h = null;
    try { h = el.querySelector(HEAD_IN); } catch (e) { h = null; }
    if (!h || !shown(h)) return null;
    const top = el.getBoundingClientRect().top, ht = h.getBoundingClientRect().top;
    return ht - top < 140 ? h : null;
  }
  const hasHeads = el => !!el.querySelector('h2, h3, .section-title');
  function collect(root, out, depth) {
    let range = null;
    for (const el of Array.from(root.children)) {
      if (isSkip(el) || !shown(el)) { continue; }
      if (isHead(el)) { range = { head: el, nodes: [el], wrap: null }; out.push(range); continue; }
      /* un envoltorio con varias tarjetas tituladas adentro es un contenedor, no una sección */
      if (depth < 4 && Array.from(el.children).filter(c => !isSkip(c) && shown(c) && !isHead(c) && headOf(c)).length >= 2) { collect(el, out, depth + 1); range = null; continue; }
      const h = headOf(el);
      if (h) { out.push({ head: h, nodes: [el], wrap: el }); range = null; continue; }
      if (depth < 4 && hasHeads(el) && !el.matches('details, table, form, .fig-block, .pg-pane')) { collect(el, out, depth + 1); range = null; continue; }
      if (range) range.nodes.push(el);
    }
    return out;
  }
  function detect(panel) {
    if (!panel || !shown(panel)) return [];
    let out;
    if (typeof CFG.sections === 'function') out = CFG.sections(panel) || [];
    else {
      out = collect(panel, [], 0);
      /* una sola tarjeta grande con subsecciones: se usan las de adentro */
      if (out.length === 1 && out[0].wrap) {
        const inner = [];
        Array.from(out[0].wrap.children).forEach(ch => { if (!isSkip(ch) && shown(ch) && !ch.contains(out[0].head) && hasHeads(ch)) collect(ch, inner, 1); });
        if (inner.length >= CFG.minSections) out = inner;
      }
    }
    const seen = {};
    return out.map((s, i) => {
      const title = textOf(s.head).replace(/\s*ⓘ\s*$/, '') || T('Sección ', 'Section ') + (i + 1);
      let id = slug(title); if (seen[id]) id += '-' + (++seen[id]); else seen[id] = 1;
      return Object.assign(s, { i, id, title });
    });
  }
  /* estado de una sección: pendiente (espera un paso anterior), con resultados o neutra */
  function stateOf(sec) {
    for (const n of sec.nodes) {
      const e = n.matches(CFG.empty) ? n : n.querySelector(CFG.empty);
      if (e && shown(e)) return 'pending';
    }
    for (const n of sec.nodes) {
      if (n.querySelector('.fig-canvas svg, .pg-pane svg, svg[data-plot], table.results, table.data, table.tbl, .fig-block, img.fig, .fig-card img')) return 'ready';
    }
    return '';
  }
  const figsIn = sec => {
    const F = window.LABGFigureStudio;
    if (!F || !F.figures) return [];
    try { return F.figures().filter(f => sec.nodes.some(n => n.contains(f.el))); } catch (e) { return []; }
  };

  /* ---------------- construcción de la interfaz ---------------- */
  let side, bar, crumbs, toc, tocList, floatBox, tabs, pager, pal, pendingBtn, chips, progress;
  let topbar, stepper, mainEl;

  function build() {
    topbar = $(CFG.topbar);
    stepper = $(CFG.stepper);
    mainEl = $(CFG.main);
    if (!stepBtns().length || !mainEl) return false;
    const root = document.documentElement;
    root.classList.add('lnav-on');

    /* barra lateral de bloques */
    if (CFG.sidebar) {
      side = mk('aside', 'lnav-side lnav-own');
      side.id = 'lnavSide';
      side.setAttribute('aria-label', T('Bloques de la app', 'App blocks'));
      side.innerHTML = '<div class="lnav-side-head"><span class="lnav-side-title"></span><span class="lnav-side-count"></span>' +
        '<button type="button" class="lnav-ibtn lnav-rail-btn" data-lnav="rail"></button></div>' +
        '<nav class="lnav-side-nav"><ol class="lnav-list" role="list"></ol></nav>' +
        '<div class="lnav-side-foot">' +
        '<button type="button" class="lnav-sbtn" data-lnav="palette">' + ico('search') + '<span class="lnav-sbtn-t"></span><kbd>Ctrl K</kbd></button>' +
        '<button type="button" class="lnav-sbtn" data-lnav="mode">' + ico('focus') + '<span class="lnav-sbtn-t"></span></button>' +
        '<button type="button" class="lnav-sbtn" data-lnav="help">' + ico('circle-help') + '<span class="lnav-sbtn-t"></span><kbd>?</kbd></button>' +
        '</div>';
      if (topbar && topbar.parentElement) topbar.after(side); else document.body.appendChild(side);
      side.addEventListener('click', onSideClick);
      side.addEventListener('keydown', e => roving(e, '.lnav-item', 'vertical'));
    }

    /* fila de pestañas en el teléfono */
    if (CFG.sidebar) {
      tabs = mk('nav', 'lnav-tabs lnav-own');
      tabs.setAttribute('aria-label', T('Bloques', 'Blocks'));
      document.body.appendChild(tabs);
      tabs.addEventListener('click', e => { const b = e.target.closest('[data-n]'); if (b) goBlock(b.dataset.n); });
      tabs.addEventListener('keydown', e => roving(e, '.lnav-tab', 'horizontal'));
    }

    /* barra de contexto: ruta, modo, contraer y buscar */
    bar = mk('div', 'lnav-bar lnav-own');
    bar.innerHTML = '<div class="lnav-bar-row">' +
      '<nav class="lnav-crumbs" aria-label="' + esc(T('Ruta', 'Breadcrumb')) + '"><ol></ol></nav>' +
      '<span class="lnav-bar-sp"></span>' +
      '<button type="button" class="lnav-pend" data-lnav="pending" hidden>' + ico('corner-down-right') + '<span></span></button>' +
      '<button type="button" class="lnav-ibtn lnav-secbtn" data-lnav="sections" aria-haspopup="true" aria-expanded="false">' + ico('table-of-contents') + '<span class="lnav-secbtn-t"></span></button>' +
      '<div class="lnav-seg" role="group"><button type="button" data-lnav="doc">' + ico('file-text') + '<span></span></button><button type="button" data-lnav="focus">' + ico('focus') + '<span></span></button></div>' +
      '<button type="button" class="lnav-ibtn" data-lnav="foldall"></button>' +
      '<button type="button" class="lnav-ibtn lnav-k" data-lnav="palette">' + ico('search') + '<kbd>Ctrl K</kbd></button>' +
      '</div><div class="lnav-chips" role="tablist" hidden></div><div class="lnav-prog" aria-hidden="true"><i></i></div>' +
      '<div class="lnav-secmenu" hidden></div>';
    crumbs = $('.lnav-crumbs ol', bar);
    chips = $('.lnav-chips', bar);
    progress = $('.lnav-prog i', bar);
    pendingBtn = $('.lnav-pend', bar);
    const first = steps()[0];
    const anchor = (first && panelOf(first.n)) || $('.step-panel', mainEl) || mainEl.firstElementChild;
    if (anchor && anchor.parentElement) anchor.parentElement.insertBefore(bar, anchor); else mainEl.prepend(bar);
    bar.addEventListener('click', onBarClick);

    /* índice de secciones a la derecha */
    toc = mk('nav', 'lnav-toc lnav-own');
    toc.setAttribute('aria-label', T('En este bloque', 'In this block'));
    toc.innerHTML = '<div class="lnav-toc-head"><span class="lnav-toc-title"></span><span class="lnav-toc-count"></span></div><ol class="lnav-toc-list" role="list"></ol>';
    tocList = $('.lnav-toc-list', toc);
    document.body.appendChild(toc);
    toc.addEventListener('click', onTocClick);

    /* botones flotantes: arriba y lo último que se editó */
    floatBox = mk('div', 'lnav-float lnav-own');
    floatBox.innerHTML = '<button type="button" class="lnav-fbtn" data-lnav="last" hidden>' + ico('pencil-line') + '<span></span></button>' +
      '<button type="button" class="lnav-fbtn lnav-top" data-lnav="top" hidden>' + ico('arrow-up') + '</button>';
    document.body.appendChild(floatBox);
    floatBox.addEventListener('click', e => {
      const b = e.target.closest('[data-lnav]'); if (!b) return;
      if (b.dataset.lnav === 'top') toTop(); else goLast();
    });

    /* Anterior / Siguiente en el modo enfocado */
    pager = mk('div', 'lnav-pager lnav-own');
    pager.innerHTML = '<button type="button" data-lnav="prev">' + ico('arrow-left') + '<span></span></button><b></b><button type="button" data-lnav="next"><span></span>' + ico('arrow-right') + '</button>';
    pager.hidden = true;
    document.body.appendChild(pager);
    pager.addEventListener('click', e => { const b = e.target.closest('[data-lnav]'); if (b) step(b.dataset.lnav === 'next' ? 1 : -1); });

    if (stepper && CFG.sidebar) stepper.setAttribute('data-lnav-replaced', '');
    root.classList.toggle('lnav-has-side', !!CFG.sidebar);
    labels();
    return true;
  }

  /* textos de la interfaz en el idioma activo */
  function labels() {
    if (side) {
      $('.lnav-side-title', side).textContent = T('Bloques', 'Blocks');
      side.setAttribute('aria-label', T('Bloques de la app', 'App blocks'));
      const fb = $$('.lnav-sbtn-t', side);
      fb[0].textContent = T('Buscar', 'Search');
      fb[2].textContent = T('Ayuda', 'Help');
    }
    if (tabs) tabs.setAttribute('aria-label', T('Bloques', 'Blocks'));
    $('.lnav-toc-title', toc).textContent = T('En este bloque', 'In this block');
    toc.setAttribute('aria-label', T('En este bloque', 'In this block'));
    $('.lnav-crumbs', bar).setAttribute('aria-label', T('Ruta', 'Breadcrumb'));
    const seg = $$('.lnav-seg button', bar);
    seg[0].querySelector('span').textContent = T('Documento', 'Document');
    seg[1].querySelector('span').textContent = T('Enfocado', 'Focused');
    seg[0].title = T('Todas las secciones del bloque, una tras otra', 'Every section of the block, one after another');
    seg[1].title = T('Una sección a la vez (Alt+← / Alt+→)', 'One section at a time (Alt+← / Alt+→)');
    $('.lnav-seg', bar).setAttribute('aria-label', T('Modo de lectura', 'Reading mode'));
    const k = $('.lnav-k', bar); k.title = T('Buscar en la app (Ctrl+K)', 'Search the app (Ctrl+K)'); k.setAttribute('aria-label', k.title);
    const sb = $('.lnav-secbtn', bar); sb.title = T('Secciones de este bloque', 'Sections of this block'); sb.setAttribute('aria-label', sb.title);
    $('.lnav-secbtn-t', bar).textContent = T('Secciones', 'Sections');
    const tp = $('.lnav-top', floatBox); tp.title = T('Volver arriba', 'Back to top'); tp.setAttribute('aria-label', tp.title);
    const ls = $('[data-lnav="last"]', floatBox); ls.title = T('Volver a lo último que editaste', 'Back to what you edited last');
    $('span', ls).textContent = T('Último cambio', 'Last change');
    pager.setAttribute('aria-label', T('Secciones', 'Sections'));
    paintMode(); paintRail(); paintFold();
  }

  /* flechas, Inicio y Fin dentro de una lista de botones (un solo punto de tabulación) */
  function roving(e, sel, dir) {
    const list = $$(sel, e.currentTarget);
    const i = list.indexOf(document.activeElement);
    if (i < 0) return;
    const next = dir === 'vertical' ? 'ArrowDown' : 'ArrowRight', prev = dir === 'vertical' ? 'ArrowUp' : 'ArrowLeft';
    let j = -1;
    if (e.key === next) j = Math.min(list.length - 1, i + 1);
    else if (e.key === prev) j = Math.max(0, i - 1);
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = list.length - 1;
    if (j < 0) return;
    e.preventDefault();
    list.forEach((b, k) => { b.tabIndex = k === j ? 0 : -1; });
    list[j].focus();
  }

  /* ---------------- pintar ---------------- */
  function paintSide() {
    const list = steps();
    if (side) {
      const ol = $('.lnav-list', side);
      const html = list.map(s => {
        const st = s.disabled ? 'lock' : s.done ? 'done' : s.warn ? 'warn' : '';
        const icon = s.disabled ? ico('lock', 'lnav-st') : s.warn ? ico('triangle-alert', 'lnav-st') : '';
        const tip = s.label + (s.disabled ? T(' — bloqueado: primero completa un paso anterior', ' — locked: finish an earlier step first') : s.done ? T(' — terminado', ' — done') : s.warn ? T(' — revisar', ' — check') : '');
        return '<li><button type="button" tabindex="' + (s.active ? '0' : '-1') + '" class="lnav-item' + (s.active ? ' on' : '') + (st ? ' is-' + st : '') + '" data-n="' + esc(s.n) + '"' +
          (s.active ? ' aria-current="step"' : '') + (s.disabled ? ' aria-disabled="true"' : '') + ' title="' + esc(tip) + '">' +
          '<span class="lnav-num">' + (s.done && !s.active ? ico('check') : esc(s.num || '·')) + '</span>' +
          '<span class="lnav-lab">' + esc(s.label) + '</span>' + icon + '</button></li>';
      }).join('');
      if (ol.innerHTML !== html) {
        const had = side.contains(document.activeElement) && document.activeElement.dataset ? document.activeElement.dataset.n : null;
        ol.innerHTML = html;
        if (had != null) { const b = ol.querySelector('[data-n="' + had + '"]'); if (b) b.focus(); }
      }
      const done = list.filter(s => s.done).length;
      $('.lnav-side-count', side).textContent = done ? done + '/' + list.length : '';
      $('.lnav-side-count', side).title = T(done + ' de ' + list.length + ' bloques terminados', done + ' of ' + list.length + ' blocks done');
    }
    if (tabs) {
      const html = list.map(s => '<button type="button" tabindex="' + (s.active ? '0' : '-1') + '" class="lnav-tab' + (s.active ? ' on' : '') + (s.done ? ' is-done' : '') + (s.disabled ? ' is-lock' : '') + '" data-n="' + esc(s.n) + '"' +
        (s.active ? ' aria-current="step"' : '') + (s.disabled ? ' aria-disabled="true"' : '') + ' title="' + esc(s.label) + '">' +
        '<span class="lnav-num">' + (s.done && !s.active ? ico('check') : esc(s.num || '·')) + '</span><span class="lnav-lab">' + esc(s.label) + '</span></button>').join('');
      if (tabs.innerHTML !== html) {
        tabs.innerHTML = html;
        const on = $('.lnav-tab.on', tabs);
        if (on) tabs.scrollLeft = Math.max(0, on.offsetLeft - (tabs.clientWidth - on.offsetWidth) / 2);
      }
    }
  }

  function paintCrumbs() {
    const s = steps().find(x => x.n === S.block) || steps().find(x => x.active);
    const sec = S.secs[S.cur];
    const parts = ['<li class="lnav-c-app"><span>' + esc(APP_NAME) + '</span></li>'];
    if (s) parts.push('<li class="lnav-c-block">' + ico('chevron-right', 'lnav-sep') + '<span class="lnav-blocktitle">' + (s.num && /\d/.test(s.num) ? '<em>' + esc(s.num) + '</em> ' : '') + esc(s.label) + '</span></li>');
    if (sec && S.secs.length > 1) parts.push('<li class="lnav-c-sec" aria-current="location">' + ico('chevron-right', 'lnav-sep') + '<span>' + esc(sec.title) + '</span></li>');
    const html = parts.join('');
    if (crumbs.innerHTML !== html) crumbs.innerHTML = html;
  }

  function paintToc() {
    const many = S.secs.length >= CFG.minSections && CFG.noToc.indexOf(String(S.block)) < 0;
    const folded = S.folded[S.block] || [];
    const html = many ? S.secs.map((s, i) => {
      const st = stateOf(s);
      const figs = figsIn(s).length;
      const f = folded.indexOf(s.id) >= 0;
      return '<li class="lnav-ti' + (i === S.cur ? ' on' : '') + (st ? ' is-' + st : '') + (f ? ' is-folded' : '') + '" data-i="' + i + '">' +
        '<button type="button" class="lnav-tlink" data-act="go"' + (i === S.cur ? ' aria-current="location"' : '') + '><span class="lnav-dot" aria-hidden="true"></span><span class="lnav-tt">' + esc(s.title) + '</span>' +
        (st === 'pending' ? '<span class="sr-only">' + esc(T(' (espera un paso anterior)', ' (waits for an earlier step)')) + '</span>' : '') + '</button>' +
        (figs ? '<button type="button" class="lnav-tbtn" data-act="studio" title="' + esc(T('Abrir en el estudio de figuras', 'Open in the figure studio')) + '" aria-label="' + esc(T('Abrir en el estudio de figuras: ', 'Open in the figure studio: ') + s.title) + '">' + ico('pencil-ruler') + '</button>' : '') +
        '<button type="button" class="lnav-tbtn lnav-tfold" data-act="fold" aria-expanded="' + (!f) + '" title="' + esc(f ? T('Expandir esta sección', 'Expand this section') : T('Contraer esta sección', 'Collapse this section')) + '" aria-label="' + esc((f ? T('Expandir: ', 'Expand: ') : T('Contraer: ', 'Collapse: ')) + s.title) + '">' + ico('chevron-down') + '</button></li>';
    }).join('') : '';
    if (tocList.innerHTML !== html) tocList.innerHTML = html;
    $('.lnav-toc-count', toc).textContent = many ? String(S.secs.length) : '';
    document.documentElement.classList.toggle('lnav-has-secs', many);
    /* fichas del modo enfocado y menú de secciones (pantallas angostas) */
    const ch = many ? S.secs.map((s, i) => '<button type="button" role="tab" class="lnav-chip' + (i === S.cur ? ' on' : '') + (stateOf(s) === 'pending' ? ' is-pending' : '') + '" data-i="' + i + '" aria-selected="' + (i === S.cur) + '"><b>' + (i + 1) + '</b>' + esc(s.title.replace(/^\d+(?:[.,]\d+)*[a-z]?\s*[·.:\-–]\s*/i, '')) + '</button>').join('') : '';
    if (chips.innerHTML !== ch) chips.innerHTML = ch;
    chips.setAttribute('aria-label', T('Secciones del bloque', 'Sections of the block'));
    const menu = $('.lnav-secmenu', bar);
    menu.innerHTML = many ? '<ol>' + S.secs.map((s, i) => '<li><button type="button" data-i="' + i + '"' + (i === S.cur ? ' aria-current="location"' : '') + '><span class="lnav-dot is-' + (stateOf(s) || 'none') + '"></span>' + esc(s.title) + '</button></li>').join('') + '</ol>' : '';
    $('.lnav-secbtn', bar).hidden = !many;
    paintFold();
  }

  function paintActive() {
    $$('.lnav-ti', tocList).forEach((li, i) => {
      const on = i === S.cur;
      li.classList.toggle('on', on);
      const a = li.querySelector('.lnav-tlink');
      if (on) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current');
    });
    $$('.lnav-chip', chips).forEach((c, i) => { c.classList.toggle('on', i === S.cur); c.setAttribute('aria-selected', String(i === S.cur)); });
    const on = $('.lnav-ti.on', tocList);
    if (on && toc.scrollHeight > toc.clientHeight) {
      const r = on.getBoundingClientRect(), tr = toc.getBoundingClientRect();
      if (r.top < tr.top + 40 || r.bottom > tr.bottom - 10) toc.scrollTop += r.top - tr.top - tr.height / 3;
    }
    const oc = $('.lnav-chip.on', chips);
    if (oc && !chips.hidden) chips.scrollLeft = Math.max(0, oc.offsetLeft - (chips.clientWidth - oc.offsetWidth) / 2);
    paintCrumbs();
    paintPager();
  }

  function paintMode() {
    const f = S.mode === 'focus';
    document.documentElement.classList.toggle('lnav-focus', f);
    const seg = $$('.lnav-seg button', bar);
    seg[0].setAttribute('aria-pressed', String(!f)); seg[1].setAttribute('aria-pressed', String(f));
    if (side) {
      const b = $('[data-lnav="mode"]', side);
      b.innerHTML = ico(f ? 'file-text' : 'focus') + '<span class="lnav-sbtn-t">' + esc(f ? T('Modo documento', 'Document mode') : T('Modo enfocado', 'Focused mode')) + '</span>';
      b.title = f ? T('Ver todas las secciones del bloque', 'Show every section of the block') : T('Ver una sección a la vez', 'Show one section at a time');
    }
    chips.hidden = !f || S.secs.length < CFG.minSections;
  }

  function paintRail() {
    if (!side) return;
    const rail = isRail();
    document.documentElement.classList.toggle('lnav-rail', rail);
    const b = $('.lnav-rail-btn', side);
    b.innerHTML = ico(rail ? 'panel-left-open' : 'panel-left-close');
    const t = rail ? T('Mostrar los nombres de los bloques ( [ )', 'Show block names ( [ )') : T('Contraer la barra de bloques ( [ )', 'Collapse the block bar ( [ )');
    b.title = t; b.setAttribute('aria-label', t); b.setAttribute('aria-expanded', String(!rail));
    $$('.lnav-sbtn', side).forEach(x => { const s = x.querySelector('.lnav-sbtn-t'); if (s) x.setAttribute('aria-label', s.textContent); });
  }
  const isRail = () => (S.rail == null ? window.innerWidth < 1280 : !!S.rail);

  function paintFold() {
    const b = $('[data-lnav="foldall"]', bar);
    if (!b) return;
    const f = (S.folded[S.block] || []).length;
    const all = S.secs.length && f >= S.secs.length;
    b.innerHTML = ico(all ? 'chevrons-up-down' : 'chevrons-down-up');
    const t = all ? T('Expandir todas las secciones', 'Expand every section') : T('Contraer todas las secciones', 'Collapse every section');
    b.title = t; b.setAttribute('aria-label', t);
    b.hidden = S.secs.length < CFG.minSections || S.mode === 'focus';
  }

  function paintPager() {
    const f = S.mode === 'focus' && S.secs.length >= CFG.minSections;
    pager.hidden = !f;
    if (!f) return;
    const prev = S.secs[S.cur - 1], next = S.secs[S.cur + 1];
    const [bp, bn] = $$('button', pager);
    $('span', bp).textContent = T('Anterior', 'Previous');
    $('span', bn).textContent = T('Siguiente', 'Next');
    bp.title = prev ? prev.title : T('Bloque anterior (Alt+←)', 'Previous block (Alt+←)');
    bn.title = next ? next.title : T('Bloque siguiente (Alt+→)', 'Next block (Alt+→)');
    $('b', pager).textContent = (S.cur + 1) + ' / ' + S.secs.length;
  }

  /* aviso «Ir al paso pendiente» cuando el bloque espera un paso anterior */
  function paintPending() {
    const p = activePanel();
    let target = null, msg = '';
    if (p) {
      const e = $$(CFG.empty, p).find(shown);
      if (e) {
        msg = textOf(e).slice(0, 140);
        const m = /(?:bloque|block|paso|step)\s*(\d+)/i.exec(msg);
        if (m && steps().some(s => s.n === m[1])) target = m[1];
        if (!target) target = pendingStep();
        const first = steps()[0];
        if (target === S.block || (first && target === first.n && !m)) target = null;
      }
    }
    pendingBtn.hidden = !target;
    if (target) {
      const s = steps().find(x => x.n === target);
      $('span', pendingBtn).textContent = T('Ir al paso pendiente', 'Go to the pending step');
      pendingBtn.dataset.n = target;
      pendingBtn.title = (msg ? msg + ' — ' : '') + T('Ir a ', 'Go to ') + (s ? s.label : target);
    }
  }
  /* el primer bloque anterior al activo que no está terminado (o el de datos) */
  function pendingStep(before) {
    const list = steps();
    const i = list.findIndex(s => s.n === (before || S.block));
    const prev = list.slice(0, Math.max(0, i)).filter(s => !s.disabled);
    const p = prev.find(s => !s.done && prev.indexOf(s) > 0) || prev.find(s => !s.done) || prev[1] || prev[0];
    return p ? p.n : null;
  }

  /* ---------------- secciones: aplicar modo y pliegues ---------------- */
  let mo = null;
  function applyLayout() {
    const p = activePanel();
    const f = S.mode === 'focus' && S.secs.length >= CFG.minSections;
    const folded = S.folded[S.block] || [];
    const all = new Set();
    S.secs.forEach(s => s.nodes.forEach(n => all.add(n)));
    $$('.lnav-out, .lnav-hid', p || document).forEach(n => {
      if (!all.has(n) && !(n.parentElement && all.has(n.parentElement))) { n.classList.remove('lnav-out', 'lnav-hid'); n.removeAttribute('inert'); }
    });
    S.secs.forEach((s, i) => {
      s.head.classList.add('lnav-sec-head');
      s.head.setAttribute('data-labg-section', s.id);
      (s.wrap || s.head).setAttribute('data-labg-section', s.id);
      const out = f && i !== S.cur;
      s.nodes.forEach(n => { n.classList.toggle('lnav-out', out); if (out) n.setAttribute('inert', ''); else n.removeAttribute('inert'); });
      /* plegada: queda solo el título (en el modo enfocado no se pliega) */
      const fd = !f && folded.indexOf(s.id) >= 0;
      const kids = s.wrap ? Array.from(s.wrap.children).filter(c => !c.contains(s.head)) : s.nodes.filter(n => n !== s.head);
      kids.forEach(n => n.classList.toggle('lnav-hid', fd));
      s.head.classList.toggle('lnav-folded-head', fd);
      if (s.wrap) s.wrap.classList.toggle('lnav-folded', fd);
    });
    if (p) p.setAttribute('data-labg-block', S.block);
    if (mo) mo.takeRecords();
  }

  /* ---------------- detectar y repintar el bloque activo ---------------- */
  let io = null, detectTimer = null;
  function refresh(keepCur) {
    const p = activePanel();
    const prevId = S.secs[S.cur] && S.secs[S.cur].id;
    S.secs = detect(p);
    let i = keepCur && prevId ? S.secs.findIndex(s => s.id === prevId) : -1;
    if (S.mode === 'focus' && i < 0) i = Math.min(S.focusIdx[S.block] || 0, Math.max(0, S.secs.length - 1));
    S.cur = Math.max(0, i);
    applyLayout();
    paintToc();
    paintMode();
    layout();
    spyAll();
    spy();
    paintPending();
    paintSide();
    if (mo) { mo.disconnect(); }
    if (p && window.MutationObserver) {
      mo = mo || new MutationObserver(recs => {
        if (recs.every(r => r.target.closest && r.target.closest('.lnav-own'))) return;
        clearTimeout(detectTimer); detectTimer = setTimeout(() => refresh(true), 160);
      });
      mo.observe(p, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'hidden', 'open'] });
    }
    if (S.pendingSec) { const id = S.pendingSec; if (gotoSection(id, true)) S.pendingSec = null; }
  }

  function onBlockChange(n) {
    const was = S.block;
    if (was != null && S.mode === 'focus') S.focusIdx[was] = S.cur;
    S.block = n;
    S.cur = 0;
    if (S.mode === 'focus' && S.enterFrom === 'end') S.focusIdx[n] = 999;
    S.enterFrom = null;
    refresh(false);
    paintSide();
    writeHash(was != null && was !== n);
    emit('block', { block: n });
  }

  /* ---------------- disposición según el ancho ---------------- */
  function layout() {
    const root = document.documentElement;
    const w = window.innerWidth;
    const mobile = w < 1024;
    root.classList.toggle('lnav-mobile', mobile);
    const hasToc = !mobile && w >= 1200 && S.mode === 'doc' && S.secs.length >= CFG.minSections && CFG.noToc.indexOf(String(S.block)) < 0;
    root.classList.toggle('lnav-has-toc', hasToc);
    paintRail();
    measure();
  }
  function measure() {
    const root = document.documentElement;
    const tb = topbar && shown(topbar) ? Math.round(topbar.getBoundingClientRect().height) : 0;
    const pos = topbar ? getComputedStyle(topbar).position : '';
    root.style.setProperty('--lnav-top', (pos === 'sticky' || pos === 'fixed' ? tb : 0) + 'px');
    root.style.setProperty('--lnav-bar-h', (bar ? Math.round(bar.getBoundingClientRect().height) : 44) + 'px');
    const z = topbar ? parseInt(getComputedStyle(topbar).zIndex, 10) : NaN;
    root.style.setProperty('--lnav-z', String(isFinite(z) && z > 1 ? z - 1 : 49));
  }

  /* ---------------- lectura: sección activa y progreso ---------------- */
  function spyAll() {
    if (io) io.disconnect();
    if (!('IntersectionObserver' in window) || !S.secs.length) return;
    const top = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--lnav-top'), 10) || 0;
    io = new IntersectionObserver(() => raf(spy), { rootMargin: '-' + (top + 60) + 'px 0px -45% 0px', threshold: [0, 1] });
    S.secs.forEach(s => io.observe(s.head));
  }
  let spyQueued = false;
  function spy() {
    spyQueued = false;
    if (!S.secs.length) { paintActive(); progressBar(); return; }
    if (S.mode === 'doc') {
      const line = (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--lnav-top'), 10) || 0) + (bar ? bar.offsetHeight : 44) + 24;
      let k = 0;
      for (let i = 0; i < S.secs.length; i++) {
        const r = S.secs[i].head.getBoundingClientRect();
        if (r.top - line <= 0) k = i; else break;
      }
      /* al final de la página, la última sección */
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) k = S.secs.length - 1;
      if (k !== S.cur) { S.cur = k; paintActive(); hashSection(); emit('section', { block: S.block, section: S.secs[k].id }); }
      else paintCrumbs();
    }
    progressBar();
  }
  function progressBar() {
    const p = activePanel();
    if (!p || !progress) return;
    const r = p.getBoundingClientRect();
    const total = Math.max(1, r.height - window.innerHeight * 0.6);
    const v = Math.max(0, Math.min(1, (-r.top + (bar ? bar.offsetHeight : 0)) / total));
    progress.style.transform = 'scaleX(' + v.toFixed(4) + ')';
    floatBox.querySelector('.lnav-top').hidden = window.scrollY < 600;
  }
  window.addEventListener('scroll', () => { if (!spyQueued) { spyQueued = true; raf(spy); } }, { passive: true });

  /* ---------------- moverse ---------------- */
  function goBlock(n, opts) {
    const s = steps().find(x => x.n === String(n));
    if (!s) return false;
    if (s.disabled) {
      const p = pendingStep(s.n);
      const ps = steps().find(x => x.n === p);
      toast(T('«' + s.label + '» se abre cuando terminas un paso anterior.', '“' + s.label + '” opens once an earlier step is done.'),
        ps ? { label: T('Ir a «' + ps.label + '»', 'Go to “' + ps.label + '”'), run: () => goBlock(ps.n) } : null);
      return false;
    }
    if (s.active) { if (opts && opts.section) gotoSection(opts.section); return true; }
    S.pendingSec = opts && opts.section ? opts.section : null;
    s.btn.click();
    return true;
  }
  function gotoSection(id, quiet) {
    const i = S.secs.findIndex(s => s.id === id || String(s.i) === String(id));
    if (i < 0) return false;
    showSection(i, quiet);
    return true;
  }
  function showSection(i, quiet) {
    if (!S.secs[i]) return;
    const sec = S.secs[i];
    /* si estaba plegada, se abre */
    const fl = S.folded[S.block] || [];
    if (fl.indexOf(sec.id) >= 0) { S.folded[S.block] = fl.filter(x => x !== sec.id); save('fold', S.folded); }
    S.cur = i;
    if (S.mode === 'focus') S.focusIdx[S.block] = i;
    applyLayout();
    paintToc(); paintActive();
    const target = S.mode === 'focus' ? (activePanel() || sec.head) : sec.head;
    if (S.mode === 'focus') window.scrollTo({ top: Math.max(0, window.scrollY + sec.head.getBoundingClientRect().top - (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--lnav-top'), 10) || 0) - (bar ? bar.offsetHeight : 44) - 16), behavior: reduced() ? 'auto' : 'smooth' });
    else sec.head.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' });
    if (!quiet) { try { sec.head.setAttribute('tabindex', '-1'); sec.head.focus({ preventScroll: true }); } catch (e) { /* nada */ } }
    hashSection(true);
    void target;
    emit('section', { block: S.block, section: sec.id });
  }
  function step(d) {
    if (!S.secs.length) return false;
    const i = S.cur + d;
    if (i < 0 || i >= S.secs.length) return false;
    showSection(i);
    return true;
  }
  function toTop() {
    const p = activePanel();
    const y = p ? Math.max(0, window.scrollY + p.getBoundingClientRect().top - 140) : 0;
    window.scrollTo({ top: window.scrollY < y + 10 ? 0 : y, behavior: reduced() ? 'auto' : 'smooth' });
  }

  /* lo último que se editó */
  document.addEventListener('change', onEdit, true);
  document.addEventListener('input', onEdit, true);
  function onEdit(e) {
    const t = e.target;
    if (!t || !t.closest || t.closest('.lnav-own, .lfs-studio, dialog')) return;
    if (!/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
    S.last = { el: t, block: S.block, at: Date.now() };
    const b = $('[data-lnav="last"]', floatBox);
    if (b) b.hidden = false;
  }
  function goLast() {
    const L = S.last;
    if (!L || !L.el.isConnected) { $('[data-lnav="last"]', floatBox).hidden = true; return; }
    const go = () => {
      const sec = S.secs.findIndex(s => s.nodes.some(n => n.contains(L.el)));
      if (sec >= 0 && (S.mode === 'focus' || (S.folded[S.block] || []).indexOf(S.secs[sec].id) >= 0)) showSection(sec, true);
      L.el.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
      try { L.el.focus({ preventScroll: true }); } catch (e) { /* nada */ }
      pulse(L.el.closest('label, .inline-label, .field, .row') || L.el);
    };
    if (L.block !== S.block) { goBlock(L.block); setTimeout(go, 350); } else go();
  }
  function pulse(el) {
    el.classList.remove('lnav-pulse'); void el.offsetWidth; el.classList.add('lnav-pulse');
    setTimeout(() => el.classList.remove('lnav-pulse'), 1600);
  }

  /* ---------------- plegar ---------------- */
  function toggleFold(i) {
    const s = S.secs[i]; if (!s) return;
    const fl = (S.folded[S.block] || []).slice();
    const k = fl.indexOf(s.id);
    if (k >= 0) fl.splice(k, 1); else fl.push(s.id);
    S.folded[S.block] = fl; save('fold', S.folded);
    applyLayout(); paintToc(); paintActive();
    announce(k >= 0 ? T('Sección expandida: ', 'Section expanded: ') + s.title : T('Sección contraída: ', 'Section collapsed: ') + s.title);
  }
  function foldAll() {
    const fl = S.folded[S.block] || [];
    const all = S.secs.length && fl.length >= S.secs.length;
    S.folded[S.block] = all ? [] : S.secs.map(s => s.id);
    save('fold', S.folded);
    applyLayout(); paintToc(); paintActive();
    announce(all ? T('Todas las secciones expandidas', 'Every section expanded') : T('Todas las secciones contraídas', 'Every section collapsed'));
  }
  /* un título plegado se abre con un clic */
  document.addEventListener('click', e => {
    const h = e.target.closest && e.target.closest('.lnav-folded-head');
    if (!h || e.target.closest('a, button, input, select, textarea, summary')) return;
    const i = S.secs.findIndex(s => s.head === h);
    if (i >= 0) toggleFold(i);
  });

  /* ---------------- modo ---------------- */
  function setMode(m) {
    if (m !== 'doc' && m !== 'focus') return;
    if (S.mode === m) return;
    S.mode = m; save('mode', m);
    if (m === 'focus') S.focusIdx[S.block] = S.cur;
    applyLayout(); paintMode(); paintToc(); paintActive(); layout();
    if (m === 'focus') showSection(S.cur, true);
    else if (S.secs[S.cur]) S.secs[S.cur].head.scrollIntoView({ block: 'start' });
    announce(m === 'focus' ? T('Modo enfocado: una sección a la vez', 'Focused mode: one section at a time') : T('Modo documento: todas las secciones', 'Document mode: every section'));
    emit('mode', { mode: m });
  }

  /* ---------------- clics en la interfaz ---------------- */
  function onSideClick(e) {
    const it = e.target.closest('.lnav-item');
    if (it) { goBlock(it.dataset.n); return; }
    const b = e.target.closest('[data-lnav]');
    if (!b) return;
    const a = b.dataset.lnav;
    if (a === 'rail') { S.rail = !isRail(); save('rail', S.rail); paintRail(); measure(); }
    else if (a === 'palette') openPalette();
    else if (a === 'mode') setMode(S.mode === 'focus' ? 'doc' : 'focus');
    else if (a === 'help') help();
  }
  function onBarClick(e) {
    const chip = e.target.closest('.lnav-chip');
    if (chip) { showSection(+chip.dataset.i); return; }
    const mi = e.target.closest('.lnav-secmenu [data-i]');
    if (mi) { closeSecMenu(); showSection(+mi.dataset.i); return; }
    const b = e.target.closest('[data-lnav]');
    if (!b) return;
    const a = b.dataset.lnav;
    if (a === 'doc' || a === 'focus') setMode(a);
    else if (a === 'foldall') foldAll();
    else if (a === 'palette') openPalette();
    else if (a === 'pending') goBlock(b.dataset.n);
    else if (a === 'sections') toggleSecMenu();
  }
  function toggleSecMenu() {
    const m = $('.lnav-secmenu', bar), b = $('.lnav-secbtn', bar);
    const open = m.hidden;
    m.hidden = !open; b.setAttribute('aria-expanded', String(open));
    if (open) { const f = m.querySelector('[aria-current]') || m.querySelector('button'); if (f) f.focus(); }
  }
  function closeSecMenu() { const m = $('.lnav-secmenu', bar); if (m && !m.hidden) { m.hidden = true; $('.lnav-secbtn', bar).setAttribute('aria-expanded', 'false'); } }
  document.addEventListener('click', e => { if (bar && !e.target.closest('.lnav-secmenu, .lnav-secbtn')) closeSecMenu(); });
  function onTocClick(e) {
    const li = e.target.closest('.lnav-ti');
    if (!li) return;
    const i = +li.dataset.i;
    const act = e.target.closest('[data-act]');
    const a = act ? act.dataset.act : 'go';
    if (a === 'fold') toggleFold(i);
    else if (a === 'studio') { const f = figsIn(S.secs[i])[0]; if (f && window.LABGFigureStudio) window.LABGFigureStudio.open(f.el); }
    else showSection(i);
  }

  /* ---------------- enlaces directos #bN/seccion ---------------- */
  const hashFor = (n, sec) => '#b' + n + (sec ? '/' + sec : '');
  function parseHash(h) {
    const m = /^#b([0-9a-z]+)(?:\/([\w-]+))?$/i.exec(h || '');
    return m ? { n: m[1], sec: m[2] || null } : null;
  }
  function writeHash(push) {
    if (!CFG.hash || S.fromPop) return;
    const h = hashFor(S.block, null);
    try {
      if (push) {
        /* si la app ya reescribió la dirección del bloque nuevo, se devuelve la entrada anterior y se agrega una nueva */
        if (S.lastHash && location.hash !== S.lastHash) history.replaceState(history.state, '', S.lastHash);
        history.pushState({ lnav: 1 }, '', h);
      } else if (location.hash !== h && !parseHash(location.hash)) history.replaceState(history.state, '', h);
      S.lastHash = location.hash;
    } catch (e) { /* algunos visores no dejan cambiar la dirección */ }
  }
  let hashTimer = null;
  function hashSection(now) {
    if (!CFG.hash) return;
    clearTimeout(hashTimer);
    hashTimer = setTimeout(() => {
      const sec = S.secs[S.cur];
      const h = hashFor(S.block, sec && S.secs.length > 1 && S.cur > 0 ? sec.id : null);
      try { if (location.hash !== h) history.replaceState(history.state, '', h); S.lastHash = h; } catch (e) { /* nada */ }
    }, now ? 0 : 400);
  }
  window.addEventListener('popstate', () => {
    if (!CFG.hash) return;
    const h = parseHash(location.hash);
    if (!h) return;
    S.fromPop = true;
    const target = location.hash;
    if (h.n !== S.block) goBlock(h.n, { section: h.sec });
    else if (h.sec) gotoSection(h.sec);
    setTimeout(() => { S.fromPop = false; try { if (location.hash !== target) history.replaceState(history.state, '', target); } catch (e) { /* nada */ } S.lastHash = target; }, 60);
  });

  /* ---------------- paleta de comandos (Ctrl+K) ---------------- */
  let palItems = [], palSel = 0;
  function buildPalette() {
    pal = mk('dialog', 'lnav-pal lnav-own');
    pal.innerHTML = '<div class="lnav-pal-box"><div class="lnav-pal-in">' + ico('search') +
      '<input type="text" role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls="lnavPalList" autocomplete="off" spellcheck="false">' +
      '<kbd>Esc</kbd></div><ul class="lnav-pal-list" id="lnavPalList" role="listbox"></ul><div class="lnav-pal-foot"></div></div>';
    document.body.appendChild(pal);
    const inp = $('input', pal);
    inp.addEventListener('input', () => { palSel = 0; renderPalette(); });
    inp.addEventListener('keydown', e => {
      const opts = $$('[role="option"]', pal);
      if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) { e.preventDefault(); palSel = (palSel + 1) % Math.max(1, opts.length); markSel(); }
      else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) { e.preventDefault(); palSel = (palSel - 1 + opts.length) % Math.max(1, opts.length); markSel(); }
      else if (e.key === 'Enter') { e.preventDefault(); const o = opts[palSel]; if (o) runItem(o.dataset.k); }
      else if (e.key === 'Home' && e.ctrlKey) { palSel = 0; markSel(); }
    });
    pal.addEventListener('click', e => {
      if (e.target === pal) { pal.close(); return; }
      const o = e.target.closest('[role="option"]'); if (o) runItem(o.dataset.k);
    });
    pal.addEventListener('mousemove', e => { const o = e.target.closest('[role="option"]'); if (o) { const i = $$('[role="option"]', pal).indexOf(o); if (i !== palSel) { palSel = i; markSel(true); } } });
    pal.addEventListener('close', () => { if (S.palReturn && S.palReturn.isConnected) try { S.palReturn.focus(); } catch (e) { /* nada */ } });
  }
  function indexItems() {
    const items = [];
    const add = (o) => { o.k = o.g + ':' + (o.id || o.label); items.push(o); };
    steps().forEach(s => add({ g: 'block', id: s.n, num: s.num && /\d/.test(s.num) ? s.num : '', label: s.label, hint: s.disabled ? T('bloqueado', 'locked') : s.done ? T('terminado', 'done') : '', icon: s.disabled ? 'lock' : 'chevron-right', run: () => goBlock(s.n) }));
    /* secciones y controles de todos los bloques */
    steps().forEach(s => {
      const p = panelOf(s.n);
      if (!p) return;
      const seen = {};
      $$('h2, h3, .section-title', p).forEach(h => {
        if (h.closest('.lnav-own, dialog, .fig-editor, .fe-panel, .fs-panel, svg') || h.matches(CFG.blockHead) || h.closest(CFG.blockHead)) return;
        const t = textOf(h).replace(/\s*ⓘ\s*$/, '');
        if (!t || t.length > 120 || seen[t]) return; seen[t] = 1;
        add({ g: 'section', id: s.n + '/' + slug(t) + '/' + items.length, label: t, hint: s.label, icon: 'list', run: () => goToNode(s.n, h) });
      });
      const seenC = {};
      $$('select, input:not([type="hidden"]):not([type="file"]), textarea, button', p).forEach(c => {
        if (c.closest('.lnav-own, dialog, .fe-panel, .fs-panel, .fig-ed, .fig-dl, .lfs-open, .step-footer, .next-bar') || c.matches('.step-btn')) return;
        const t = labelOf(c);
        if (!t || t.length < 2 || t.length > 90 || seenC[t]) return; seenC[t] = 1;
        add({ g: 'control', id: s.n + '/' + t, label: t, hint: s.label, icon: c.tagName === 'BUTTON' ? 'zap' : 'pencil-line', run: () => goToNode(s.n, c, true) });
      });
    });
    const F = window.LABGFigureStudio;
    if (F && F.figures) {
      try { F.figures().forEach((f, i) => add({ g: 'figure', id: 'f' + i + ':' + f.key, label: f.title || T('Figura ', 'Figure ') + (i + 1), hint: T('abrir en el estudio', 'open in the studio'), icon: 'pencil-ruler', run: () => F.open(f.el) })); } catch (e) { /* nada */ }
    }
    const A = (id, label, icon, run, hint) => add({ g: 'action', id, label, icon, run, hint });
    A('mode', S.mode === 'focus' ? T('Cambiar al modo documento', 'Switch to document mode') : T('Cambiar al modo enfocado (una sección a la vez)', 'Switch to focused mode (one section at a time)'), S.mode === 'focus' ? 'file-text' : 'focus', () => setMode(S.mode === 'focus' ? 'doc' : 'focus'));
    if (S.secs.length >= CFG.minSections) A('fold', T('Contraer o expandir todas las secciones', 'Collapse or expand every section'), 'chevrons-down-up', foldAll);
    if (side) A('rail', T('Contraer o mostrar la barra de bloques', 'Collapse or show the block bar'), 'panel-left-close', () => { S.rail = !isRail(); save('rail', S.rail); paintRail(); measure(); }, '[');
    A('top', T('Volver arriba', 'Back to top'), 'arrow-up', toTop);
    if (S.last) A('last', T('Volver a lo último que editaste', 'Back to what you edited last'), 'pencil-line', goLast);
    if (window.LABG && LABG.theme && LABG.theme.toggle) A('theme', T('Cambiar entre tema claro y oscuro', 'Switch between light and dark theme'), 'sun', () => LABG.theme.toggle());
    const other = lang() === 'en' ? 'es' : 'en';
    const lb = $$('[data-lang="' + other + '"], #lang' + other.toUpperCase() + ', .lang-' + other).find(x => x.tagName === 'BUTTON' || x.tagName === 'A');
    if (lb) A('lang', other === 'en' ? 'Cambiar el idioma a inglés (English)' : 'Switch the language to Spanish (Español)', 'languages', () => lb.click());
    if (window.LABG && LABG.showShortcuts) A('keys', T('Atajos de teclado y ayuda de esta sección', 'Keyboard shortcuts and help for this section'), 'keyboard', help, '?');
    if (CFG.hash) A('link', T('Copiar el enlace a esta sección', 'Copy the link to this section'), 'link', copyLink);
    if (window.LABG && LABG.reportUrl) A('report', T('Reportar un problema', 'Report a problem'), 'message-circle-warning', () => window.open(LABG.reportUrl(), '_blank', 'noopener'));
    if (window.LABG && LABG.SUITE_URL) A('suite', T('Ir a la LABG Suite', 'Go to the LABG Suite'), 'house', () => { location.href = LABG.SUITE_URL; });
    return items;
  }
  /* la etiqueta legible de un control */
  function labelOf(c) {
    let t = '';
    if (c.id) { const l = document.querySelector('label[for="' + (window.CSS && CSS.escape ? CSS.escape(c.id) : c.id) + '"]'); if (l) t = textOf(l); }
    if (!t) { const l = c.closest('label'); if (l) t = textOf(l); }
    if (!t) t = c.getAttribute('aria-label') || c.title || '';
    if (!t && c.tagName === 'BUTTON') t = textOf(c);
    if (!t && c.placeholder) t = c.placeholder;
    return t.replace(/[▾▸⬇⤓↻→←✓✕⚙✎]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function goToNode(n, node, focus) {
    const go = () => {
      const i = S.secs.findIndex(s => s.nodes.some(x => x.contains(node)));
      if (i >= 0 && (S.mode === 'focus' || (S.folded[S.block] || []).indexOf(S.secs[i].id) >= 0)) showSection(i, true);
      const d = node.closest('details:not([open])'); if (d) d.open = true;
      if (shown(node)) {
        node.scrollIntoView({ block: focus ? 'center' : 'start', behavior: reduced() ? 'auto' : 'smooth' });
        if (focus) { try { node.focus({ preventScroll: true }); } catch (e) { /* nada */ } }
        else { try { node.setAttribute('tabindex', '-1'); node.focus({ preventScroll: true }); } catch (e) { /* nada */ } }
        pulse(focus ? (node.closest('label, .inline-label') || node) : node);
      }
    };
    if (n !== S.block) { if (goBlock(n)) setTimeout(go, 420); } else go();
  }
  /* parecido difuso: todas las palabras deben aparecer, en orden o como subsecuencia */
  function score(q, text) {
    const t = fold(text);
    let total = 0;
    for (const w of q.split(/\s+/).filter(Boolean)) {
      const i = t.indexOf(w);
      if (i >= 0) { total += 60 - Math.min(40, i) + (i === 0 || /[\s·\-_/(]/.test(t[i - 1]) ? 25 : 0) + w.length * 2; continue; }
      let ti = 0, s = 0, run = 0, first = -1, last = -1;
      for (const ch of w) {
        const j = t.indexOf(ch, ti);
        if (j < 0) return -1;
        run = j === ti ? run + 1 : 0;
        s += 1 + run * 2 + (j === 0 || /[\s·\-_/]/.test(t[j - 1]) ? 4 : 0);
        if (first < 0) first = j; last = j; ti = j + 1;
      }
      if (last - first + 1 > w.length * 3 + 2) return -1;
      total += s - (last - first - w.length) * 0.4;
    }
    return total;
  }
  function marks(text, q) {
    if (!q) return esc(text);
    const t = fold(text), out = [];
    const on = new Array(text.length).fill(false);
    q.split(/\s+/).filter(Boolean).forEach(w => {
      const i = t.indexOf(w);
      if (i >= 0) { for (let k = i; k < i + w.length; k++) on[k] = true; return; }
      let ti = 0; for (const ch of w) { const j = t.indexOf(ch, ti); if (j < 0) break; on[j] = true; ti = j + 1; }
    });
    let open = false;
    for (let i = 0; i < text.length; i++) {
      if (on[i] && !open) { out.push('<mark>'); open = true; }
      if (!on[i] && open) { out.push('</mark>'); open = false; }
      out.push(esc(text[i]));
    }
    if (open) out.push('</mark>');
    return out.join('');
  }
  const GROUPS = () => ({ recent: T('Recientes', 'Recent'), block: T('Bloques', 'Blocks'), section: T('Secciones', 'Sections'), figure: T('Figuras', 'Figures'), control: T('Controles', 'Controls'), action: T('Acciones', 'Actions') });
  function renderPalette() {
    const inp = $('input', pal);
    const q = fold(inp.value.trim());
    const G = GROUPS();
    let groups = [];
    if (!q) {
      const rec = S.recents.map(k => palItems.find(i => i.k === k)).filter(Boolean).slice(0, 6);
      if (rec.length) groups.push(['recent', rec]);
      groups.push(['block', palItems.filter(i => i.g === 'block')]);
      groups.push(['action', palItems.filter(i => i.g === 'action')]);
    } else {
      const W = { block: 40, section: 12, figure: 10, action: 6, control: 0 };
      const scored = palItems.map(i => { const v = score(q, i.label); return { i, s: v > 0 ? v + (W[i.g] || 0) : v }; }).filter(x => x.s > 0);
      ['block', 'section', 'figure', 'control', 'action'].forEach(g => {
        const list = scored.filter(x => x.i.g === g).sort((a, b) => b.s - a.s).slice(0, g === 'control' ? 6 : 8).map(x => x.i);
        if (list.length) groups.push([g, list]);
      });
      const best = g => Math.max.apply(null, scored.filter(x => x.i.g === g[0]).map(x => x.s));
      groups.sort((a, b) => best(b) - best(a));
    }
    let n = 0;
    const html = groups.map(([g, list]) => '<li role="presentation" class="lnav-pal-g">' + esc(G[g]) + '</li>' + list.map(it => {
      const id = 'lnavOpt' + (n++);
      return '<li role="option" id="' + id + '" data-k="' + esc(it.k) + '" aria-selected="false">' + ico(it.icon || 'chevron-right') +
        (it.num ? '<b class="lnav-pal-num">' + esc(it.num) + '</b>' : '') + '<span class="lnav-pal-t">' + marks(it.label, q) + '</span>' + (it.hint ? '<span class="lnav-pal-h">' + esc(it.hint) + '</span>' : '') + '</li>';
    }).join('')).join('');
    const ul = $('.lnav-pal-list', pal);
    ul.innerHTML = html || '<li class="lnav-pal-none" role="presentation">' + esc(T('Sin resultados. Prueba con otra palabra.', 'No results. Try another word.')) + '</li>';
    palSel = Math.min(palSel, Math.max(0, n - 1));
    markSel();
    $('.lnav-pal-foot', pal).innerHTML = '<span><kbd>↑</kbd><kbd>↓</kbd> ' + esc(T('elegir', 'move')) + '</span><span><kbd>Enter</kbd> ' + esc(T('ir', 'go')) + '</span><span><kbd>Esc</kbd> ' + esc(T('cerrar', 'close')) + '</span>';
  }
  function markSel(noScroll) {
    const opts = $$('[role="option"]', pal);
    opts.forEach((o, i) => o.setAttribute('aria-selected', String(i === palSel)));
    const o = opts[palSel];
    const inp = $('input', pal);
    if (o) { inp.setAttribute('aria-activedescendant', o.id); if (!noScroll) o.scrollIntoView({ block: 'nearest' }); }
    else inp.removeAttribute('aria-activedescendant');
  }
  function runItem(k) {
    const it = palItems.find(i => i.k === k);
    if (!it) return;
    S.recents = [k].concat(S.recents.filter(x => x !== k)).slice(0, 8);
    save('recents', S.recents);
    S.palReturn = null;
    pal.close();
    setTimeout(() => it.run(), 10);
  }
  function openPalette() {
    if (!pal) buildPalette();
    if (pal.open) { pal.close(); return; }
    palItems = indexItems();
    S.palReturn = document.activeElement;
    const inp = $('input', pal);
    inp.value = ''; palSel = 0;
    inp.placeholder = T('Busca un bloque, una sección, un control o una acción…', 'Search a block, a section, a control or an action…');
    inp.setAttribute('aria-label', T('Buscar en la app', 'Search the app'));
    pal.setAttribute('aria-label', T('Paleta de comandos', 'Command palette'));
    renderPalette();
    if (pal.showModal) pal.showModal(); else pal.setAttribute('open', '');
    inp.focus();
  }
  function copyLink() {
    const url = location.href.split('#')[0] + hashFor(S.block, S.secs[S.cur] && S.cur > 0 ? S.secs[S.cur].id : null);
    const ok = () => toast(T('Enlace copiado: ', 'Link copied: ') + url);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(ok, () => toast(url));
    else toast(url);
  }

  /* ---------------- ayuda en contexto («?») ---------------- */
  const NAV_KEYS = () => [
    ['Ctrl + K', T('Buscar bloques, secciones, controles y acciones', 'Search blocks, sections, controls and actions')],
    ['[', T('Contraer o mostrar la barra de bloques', 'Collapse or show the block bar')],
    ['Alt + ← / →', T('En el modo enfocado: sección anterior o siguiente (en los extremos, el bloque)', 'In focused mode: previous or next section (at the ends, the block)')],
  ];
  function help() {
    if (window.LABG && LABG.showShortcuts) LABG.showShortcuts();
  }
  function decorateHelp(dlg) {
    if (!dlg || dlg.querySelector('.lnav-help')) return;
    const body = dlg.querySelector('.dialog-body') || dlg;
    const s = steps().find(x => x.n === S.block);
    const sec = S.secs[S.cur];
    const p = activePanel();
    const head = p && p.querySelector(CFG.blockHead);
    const desc = head ? textOf(head.querySelector('p') || head).slice(0, 240) : '';
    let secDesc = '';
    if (sec) {
      const nx = sec.wrap ? sec.wrap.querySelector('p, .hint, .section-sub') : sec.nodes[1];
      if (nx && !nx.contains(sec.head)) secDesc = textOf(nx).slice(0, 260);
    }
    const st = sec ? stateOf(sec) : '';
    const box = mk('section', 'lnav-help lnav-own');
    box.innerHTML = '<h3>' + esc(T('Dónde estás', 'Where you are')) + '</h3>' +
      '<p class="lnav-help-where">' + (s ? '<b>' + esc((s.num && /\d/.test(s.num) ? s.num + ' · ' : '') + s.label) + '</b>' : '') + (sec && S.secs.length > 1 ? ' › ' + esc(sec.title) : '') + '</p>' +
      (desc ? '<p>' + esc(desc) + '</p>' : '') + (secDesc && secDesc !== desc ? '<p>' + esc(secDesc) + '</p>' : '') +
      (st === 'pending' && !pendingBtn.hidden ? '<p><button type="button" class="lnav-help-go">' + ico('corner-down-right') + esc(T('Ir al paso pendiente', 'Go to the pending step')) + '</button></p>' : '') +
      '<h3>' + esc(T('Navegación', 'Navigation')) + '</h3>';
    body.insertBefore(box, body.firstChild);
    const go = box.querySelector('.lnav-help-go');
    if (go) go.addEventListener('click', () => { dlg.close(); goBlock(pendingBtn.dataset.n); });
    const dl = dlg.querySelector('.shortcut-list');
    if (dl && !dl.querySelector('.lnav-k-row')) {
      NAV_KEYS().forEach(([k, d]) => {
        const dt = mk('dt', 'lnav-k-row', k.split(' + ').map(x => '<kbd>' + esc(x) + '</kbd>').join(' + '));
        const dd = mk('dd', 'lnav-k-row', esc(d));
        dl.appendChild(dt); dl.appendChild(dd);
      });
    }
  }
  function hookHelp() {
    if (!window.LABG || !LABG.showShortcuts || LABG.showShortcuts.__lnav) return;
    const orig = LABG.showShortcuts;
    LABG.showShortcuts = function () {
      const r = orig.apply(this, arguments);
      try { decorateHelp(document.querySelector('dialog.labg-dialog[open]')); } catch (e) { console.error(e); }
      return r;
    };
    LABG.showShortcuts.__lnav = true;
  }

  /* ---------------- teclado ---------------- */
  window.addEventListener('keydown', e => {
    if (!S.on || e.defaultPrevented) return;
    const k = e.key;
    /* Ctrl+K / ⌘K: la paleta, también desde un campo */
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (k === 'k' || k === 'K')) {
      if (document.querySelector('.lfs-studio.on')) return;
      e.preventDefault(); e.stopPropagation(); openPalette(); return;
    }
    if (typing(e.target) || document.querySelector('dialog[open]:not(.lnav-pal)')) return;
    if (k === '[' && !e.ctrlKey && !e.metaKey && !e.altKey && side && !document.querySelector('.lfs-studio.on')) {
      e.preventDefault(); S.rail = !isRail(); save('rail', S.rail); paintRail(); measure(); return;
    }
    /* Alt+←/→ en el modo enfocado: secciones; en los extremos sigue la barra de la app */
    if (e.altKey && !e.ctrlKey && !e.metaKey && (k === 'ArrowLeft' || k === 'ArrowRight') && S.mode === 'focus' && S.secs.length >= CFG.minSections) {
      const d = k === 'ArrowRight' ? 1 : -1;
      if (step(d)) { e.preventDefault(); e.stopImmediatePropagation(); }
      else if (d < 0) { S.enterFrom = 'end'; setTimeout(() => { S.enterFrom = null; }, 1200); }
    }
  }, true);

  /* ---------------- avisos ---------------- */
  function toast(text, action) {
    if (window.LABG && LABG.toast) {
      LABG.toast(text, { type: 'info', timeout: action ? 8000 : 4500 });
      if (action) {
        const last = $$('.toast-stack .toast, .labg-toast').pop();
        if (last && !last.querySelector('.lnav-tact')) {
          const b = mk('button', 'lnav-tact', esc(action.label));
          b.type = 'button';
          b.addEventListener('click', () => { action.run(); last.remove(); });
          last.appendChild(b);
        }
      }
      return;
    }
    announce(text);
  }
  function announce(text) { if (window.LABG && LABG.announce) LABG.announce(text); }

  /* ---------------- arranque ---------------- */
  function sync() {
    const n = activeStep();
    paintSide();
    if (n != null && n !== S.block) onBlockChange(n);
  }
  function start() {
    if (S.on) return;
    try {
      S.block = activeStep();
      if (!build()) return;
      S.on = true;
      hookHelp();
      /* los cambios en la barra de la app (bloque activo, palomitas, candados) */
      const sm = new MutationObserver(() => { clearTimeout(sm.t); sm.t = setTimeout(sync, 30); });
      const host = stepper || (stepBtns()[0] && stepBtns()[0].parentElement);
      if (host) sm.observe(host, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'aria-current', 'disabled', 'aria-disabled'] });
      document.addEventListener('stepchange', () => setTimeout(sync, 0));
      new MutationObserver(() => { labels(); paintSide(); refresh(true); }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
      if (window.ResizeObserver && topbar) new ResizeObserver(() => measure()).observe(topbar);
      let rt = null;
      window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { layout(); spy(); }, 120); });
      /* enlace directo al abrir */
      const h = CFG.hash ? parseHash(location.hash) : null;
      if (S.block == null && steps()[0]) S.block = steps()[0].n;
      refresh(false);
      paintSide();
      if (h) {
        if (h.n !== S.block) goBlock(h.n, { section: h.sec });
        else if (h.sec) { S.pendingSec = h.sec; setTimeout(() => { if (S.pendingSec && gotoSection(S.pendingSec, true)) S.pendingSec = null; }, 500); }
      }
      S.lastHash = location.hash;
      document.addEventListener('labg-figure-studio:ready', () => paintToc());
      setTimeout(() => { paintToc(); measure(); }, 1200);
      emit('ready', {});
    } catch (err) {
      /* algo no cuadró: se deshace todo y la app queda como estaba */
      console.error('LABG Navegador', err);
      document.documentElement.classList.remove('lnav-on', 'lnav-has-side', 'lnav-rail', 'lnav-has-toc', 'lnav-focus', 'lnav-mobile', 'lnav-has-secs');
      $$('.lnav-own').forEach(n => n.remove());
      S.on = false;
    }
  }

  window.LABGNavigator = {
    version: VERSION,
    app: APP,
    config: CFG,
    refresh: () => refresh(true),
    go: (block, section) => goBlock(String(block), { section }),
    section: id => gotoSection(id),
    /* muestra la sección (plegada o fuera de vista en el modo enfocado) que contiene un nodo */
    reveal: node => {
      const i = S.secs.findIndex(sc => sc.nodes.some(n => n.contains(node)));
      if (i < 0) return false;
      const fl = S.folded[S.block] || [];
      if (S.mode === 'focus' || fl.indexOf(S.secs[i].id) >= 0) showSection(i, true);
      return true;
    },
    next: () => step(1),
    prev: () => step(-1),
    mode: m => { if (m) setMode(m); return S.mode; },
    palette: openPalette,
    blocks: () => steps().map(s => ({ n: s.n, label: s.label, done: s.done, disabled: s.disabled, active: s.active })),
    sections: () => S.secs.map(s => ({ id: s.id, title: s.title, state: stateOf(s), head: s.head })),
    on: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(start, 60));
  else setTimeout(start, 60);
})();
