/* LABG Suite — Estudio de figuras LABG v1.0.0 (módulo compartido)
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
   Abre cualquier figura de la app en una pantalla dividida: la figura a la
   izquierda, siempre a la vista y a escala, con la silueta de su tamaño de
   exportación; el inspector a la derecha (o a la izquierda, o flotante; en el
   teléfono, una hoja que sube desde abajo), con secciones plegables y un
   buscador de controles. Arriba, una barra con deshacer y rehacer, comparar
   antes y ahora con una cortina, zoom, preajustes, exportar y cerrar.

   Sin mover nada de la app:
     · la figura se eleva a la capa superior del navegador (Popover API) y sigue
       en su lugar del documento: sus estilos, sus oyentes y el código que la
       redibuja no notan nada; si la app la reemplaza, el estudio la encuentra;
     · los controles de la figura (su menú de edición, sus opciones de descarga
       y los ajustes de su sección) se reflejan en el inspector: cada cambio se
       escribe en el control original y se le avisa con sus propios eventos;
     · si la app trae un editor fino (✎) o un panel de estilo global, se acoplan
       dentro del inspector mientras el estudio está abierto.

   Lo propio del estudio: paletas científicas con simulación de daltonismo,
   tamaño del texto y grosor de las líneas pensados para el tamaño de salida,
   edición de un texto con doble clic, historial, comparación, preajustes de un
   clic (y propios, en JSON) y exportación propia a PNG, SVG, PDF y TIFF en mm o
   pulgadas, a 300, 600 o 1200 ppp, con fondo transparente y vista a tamaño real.
   Recuerda los ajustes de cada app en este navegador.

   Mejora progresiva: si el estudio no puede abrirse, la app sigue igual.
   Funciona con doble clic (file://), sin servidor ni dependencias.

   Uso: una línea, después de labg-core.js:
     <script src="js/labg-figure-studio.js" defer></script>
   Configuración opcional, antes del script: window.LABG_FIGSTUDIO = { … }.
   API: window.LABGFigureStudio.attach(el, { library, controls, onChange, export, title, key })
        y open(el), close(), figures(), on(evento, fn). Ver GUIA-INTEGRACION.md. */
(function () {
  'use strict';
  if (window.LABGFigureStudio && window.LABGFigureStudio.version) return;
  const VERSION = '1.0.0';
  const me = document.currentScript;

  /* ---------------- hoja de estilo (se carga sola) ---------------- */
  (function css() {
    if (document.querySelector('link[data-lfs-css]')) return;
    const src = (me && me.src) || '';
    const href = (me && me.dataset.css) || (/\/js\/(?:core\/)?labg-figure-studio\.js(\?.*)?$/.test(src)
      ? src.replace(/\/js\/(?:core\/)?labg-figure-studio\.js(\?.*)?$/, '/css/labg-figure-studio.css')
      : src.replace(/\.js(\?.*)?$/, '.css'));
    if (!href) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href; l.setAttribute('data-lfs-css', '');
    (document.head || document.documentElement).appendChild(l);
  })();

  /* ---------------- utilidades ---------------- */
  const NS = 'http://www.w3.org/2000/svg';
  const lang = () => ((document.documentElement.lang || 'es').slice(0, 2) === 'en' ? 'en' : 'es');
  const T = (es, en) => (lang() === 'en' ? en : es);
  const TT = a => (Array.isArray(a) ? T(a[0], a[1]) : String(a || ''));
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const fold = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const slug = s => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'figura';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const mk = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const raf = window.requestAnimationFrame || (f => setTimeout(f, 16));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const shown = el => !!(el && el.getClientRects().length);
  const typing = t => !!(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)));
  const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const cssEsc = s => (window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'));
  const fire = (n, types) => types.forEach(t => n.dispatchEvent(new Event(t, { bubbles: true })));
  const MM_IN = 25.4;
  const PX_MM = 96 / MM_IN;              /* píxeles CSS por milímetro: el «tamaño real» de la pantalla */
  const PT_MM = 72 / MM_IN;

  /* íconos: Lucide v1.49.0 (ISC). Trazo de 1.5 para que se vean finos. */
  const ICONOS = {
    "pencil-ruler": "<path d=\"M13 7 8.7 2.7a2.41 2.41 0 0 0-3.4 0L2.7 5.3a2.41 2.41 0 0 0 0 3.4L7 13\"/><path d=\"m8 6 2-2\"/><path d=\"m18 16 2-2\"/><path d=\"m17 11 4.3 4.3c.94.94.94 2.46 0 3.4l-2.6 2.6c-.94.94-2.46.94-3.4 0L11 17\"/><path d=\"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z\"/><path d=\"m15 5 4 4\"/>",
    "undo-2": "<path d=\"M9 14 4 9l5-5\"/><path d=\"M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11\"/>",
    "redo-2": "<path d=\"m15 14 5-5-5-5\"/><path d=\"M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13\"/>",
    "columns-2": "<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"/><path d=\"M12 3v18\"/>",
    "zoom-in": "<circle cx=\"11\" cy=\"11\" r=\"8\"/><line x1=\"21\" x2=\"16.65\" y1=\"21\" y2=\"16.65\"/><line x1=\"11\" x2=\"11\" y1=\"8\" y2=\"14\"/><line x1=\"8\" x2=\"14\" y1=\"11\" y2=\"11\"/>",
    "zoom-out": "<circle cx=\"11\" cy=\"11\" r=\"8\"/><line x1=\"21\" x2=\"16.65\" y1=\"21\" y2=\"16.65\"/><line x1=\"8\" x2=\"14\" y1=\"11\" y2=\"11\"/>",
    "scan": "<path d=\"M3 7V5a2 2 0 0 1 2-2h2\"/><path d=\"M17 3h2a2 2 0 0 1 2 2v2\"/><path d=\"M21 17v2a2 2 0 0 1-2 2h-2\"/><path d=\"M7 21H5a2 2 0 0 1-2-2v-2\"/>",
    "ruler": "<path d=\"M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z\"/><path d=\"m14.5 12.5 2-2\"/><path d=\"m11.5 9.5 2-2\"/><path d=\"m8.5 6.5 2-2\"/><path d=\"m17.5 15.5 2-2\"/>",
    "wand-sparkles": "<path d=\"m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72\"/><path d=\"m14 7 3 3\"/><path d=\"M5 6v4\"/><path d=\"M19 14v4\"/><path d=\"M10 2v2\"/><path d=\"M7 8H3\"/><path d=\"M21 16h-4\"/><path d=\"M11 3H9\"/>",
    "download": "<path d=\"M12 15V3\"/><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/><path d=\"m7 10 5 5 5-5\"/>",
    "copy": "<rect width=\"14\" height=\"14\" x=\"8\" y=\"8\" rx=\"2\" ry=\"2\"/><path d=\"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2\"/>",
    "rotate-ccw": "<path d=\"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8\"/><path d=\"M3 3v5h5\"/>",
    "x": "<path d=\"M18 6 6 18\"/><path d=\"m6 6 12 12\"/>",
    "search": "<path d=\"m21 21-4.34-4.34\"/><circle cx=\"11\" cy=\"11\" r=\"8\"/>",
    "panel-right": "<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"/><path d=\"M15 3v18\"/>",
    "panel-left": "<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"/><path d=\"M9 3v18\"/>",
    "picture-in-picture-2": "<path d=\"M21 9V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10c0 1.1.9 2 2 2h4\"/><rect width=\"10\" height=\"7\" x=\"12\" y=\"13\" rx=\"2\"/>",
    "palette": "<path d=\"M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z\"/><circle cx=\"13.5\" cy=\"6.5\" r=\".5\" fill=\"currentColor\"/><circle cx=\"17.5\" cy=\"10.5\" r=\".5\" fill=\"currentColor\"/><circle cx=\"6.5\" cy=\"12.5\" r=\".5\" fill=\"currentColor\"/><circle cx=\"8.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\"/>",
    "eye": "<path d=\"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>",
    "type": "<path d=\"M12 4v16\"/><path d=\"M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2\"/><path d=\"M9 20h6\"/>",
    "history": "<path d=\"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8\"/><path d=\"M3 3v5h5\"/><path d=\"M12 7v5l4 2\"/>",
    "sliders-horizontal": "<path d=\"M10 5H3\"/><path d=\"M12 19H3\"/><path d=\"M14 3v4\"/><path d=\"M16 17v4\"/><path d=\"M21 12h-9\"/><path d=\"M21 19h-5\"/><path d=\"M21 5h-7\"/><path d=\"M8 10v4\"/><path d=\"M8 12H3\"/>",
    "chevron-down": "<path d=\"m6 9 6 6 6-6\"/>",
    "grip-vertical": "<circle cx=\"9\" cy=\"12\" r=\"1\"/><circle cx=\"9\" cy=\"5\" r=\"1\"/><circle cx=\"9\" cy=\"19\" r=\"1\"/><circle cx=\"15\" cy=\"12\" r=\"1\"/><circle cx=\"15\" cy=\"5\" r=\"1\"/><circle cx=\"15\" cy=\"19\" r=\"1\"/>",
    "save": "<path d=\"M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z\"/><path d=\"M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7\"/><path d=\"M7 3v4a1 1 0 0 0 1 1h7\"/>",
    "upload": "<path d=\"M12 3v12\"/><path d=\"m17 8-5-5-5 5\"/><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/>",
    "file-json": "<path d=\"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z\"/><path d=\"M14 2v5a1 1 0 0 0 1 1h5\"/><path d=\"M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1\"/><path d=\"M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1\"/>",
    "bookmark-plus": "<path d=\"M12 7v6\"/><path d=\"M15 10H9\"/><path d=\"M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z\"/>",
    "trash-2": "<path d=\"M10 11v6\"/><path d=\"M14 11v6\"/><path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6\"/><path d=\"M3 6h18\"/><path d=\"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"/>",
    "check": "<path d=\"M20 6 9 17l-5-5\"/>",
    "info": "<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 16v-4\"/><path d=\"M12 8h.01\"/>",
    "keyboard": "<path d=\"M10 8h.01\"/><path d=\"M12 12h.01\"/><path d=\"M14 8h.01\"/><path d=\"M16 12h.01\"/><path d=\"M18 8h.01\"/><path d=\"M6 8h.01\"/><path d=\"M7 16h10\"/><path d=\"M8 12h.01\"/><rect width=\"20\" height=\"16\" x=\"2\" y=\"4\" rx=\"2\"/>",
    "image": "<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" ry=\"2\"/><circle cx=\"9\" cy=\"9\" r=\"2\"/><path d=\"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21\"/>",
    "layers": "<path d=\"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z\"/><path d=\"M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12\"/><path d=\"M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17\"/>",
    "pencil": "<path d=\"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z\"/><path d=\"m15 5 4 4\"/>",
    "maximize-2": "<path d=\"M15 3h6v6\"/><path d=\"m21 3-7 7\"/><path d=\"m3 21 7-7\"/><path d=\"M9 21H3v-6\"/>",
    "circle-help": "<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3\"/><path d=\"M12 17h.01\"/>",
  };
  const ico = (n, cls) => '<svg class="lfs-i' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (ICONOS[n] || '') + '</svg>';

  /* el texto visible de un nodo, en el idioma activo */
  function textOf(el) {
    if (!el) return '';
    const L = lang();
    let out = '';
    const walk = n => {
      if (n.nodeType === 3) { out += n.nodeValue; return; }
      if (n.nodeType !== 1) return;
      const t = n.tagName;
      if (/^(SCRIPT|STYLE|TEMPLATE|OUTPUT|SELECT|OPTION|TEXTAREA)$/.test(t) || t.toLowerCase() === 'svg') return;
      if (n.hidden || n.classList.contains('sr-only') || n.classList.contains('range-val') || n.classList.contains('lfs-own') || n.classList.contains('lnav-own')) return;
      const dl = n.getAttribute('data-l') || n.getAttribute('lang');
      if (dl && n !== el && /^(es|en)/.test(dl) && dl.slice(0, 2) !== L) return;
      if (n.style && n.style.display === 'none') return;
      if (n !== el && getComputedStyle(n).display === 'none') return;
      const blk = /^(DIV|P|LI|SMALL|BR|H[1-6]|TD|TH|DT|DD|SUMMARY)$/.test(t);
      if (blk) out += ' ';
      for (let c = n.firstChild; c; c = c.nextSibling) walk(c);
      if (blk) out += ' ';
    };
    walk(el);
    return out.replace(/[▾▸⬇⤓↻⚙✎]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /* ---------------- identidad de la app y configuración ---------------- */
  const APP = (document.title || 'labg').split(/[\s—–·|:]+/)[0].toLowerCase().replace(/[^a-z0-9]+/g, '') || 'labg';
  const DEF = {
    root: '#main, main, body',
    /* lo que agrupa una figura en las apps de la suite */
    hosts: '.fig-block, .pg-pane, [data-fig], .fig-card, .fig-box, .fs-host, .chart-body, .map-wrap, .b6-stage, .ph-sim, figure',
    exclude: '.theory-fig, .theory-card, details.acc, .hero, .help-guide, .plate, .lnav-own, .soon-box, .sim-empty, .empty-state, [id$="NoData"], [id$="NoTree"], [id$="Empty"]',
    titles: '.fig-head h4, .pg-title, .chart-title, .fig-title, figcaption, :scope > b, :scope > h4, :scope > h3',
    btnHost: '.fig-head, .chart-actions',
    minSize: 90,
    controlsFor: null,          /* función(fig) → un nodo más con controles de esa figura */
  };
  const PERFILES = {
    pollinationpro: { exclude: DEF.exclude + ', .ms-view' },                 /* el mapa ya tiene su estudio dividido */
    biomodellingpro: { exclude: DEF.exclude + ', .main-map, .leaflet-container' },
    statspro: {
      exclude: DEF.exclude + ', .plot-studio',
      controlsFor: f => { const p = f.host.closest('.step-panel, .subtab-panel'); return p ? p.querySelector('.style-bar, [id$="StyleBar"]') : null; },
    },
    leafpro: { controlsFor: f => (f.host.closest('.b6-stage') ? document.getElementById('b6Ctrl') : null) },
    scimetricspro: { btnHost: '.chart-actions' },
    /* los ajustes del bloque (unidad, índice, distancia…) van en la primera fila de controles del cuerpo del bloque */
    germplasmpro: { controlsFor: f => { const b = f.host.closest('[id$="Body"]'); const r = b ? b.querySelector('.imp-row') : null; return r && !r.contains(f.host) ? r : null; } },
  };
  const CFG = Object.assign({}, DEF, PERFILES[APP] || {}, window.LABG_FIGSTUDIO || {});

  const KEY = 'labg-fstudio:' + APP + ':';
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(KEY + k)); return v == null ? d : v; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch (e) { /* navegación privada */ } };

  /* ---------------- paletas científicas ---------------- */
  const PALETTES = [
    { id: '', name: ['La de la figura', 'The figure’s own'], c: [] },
    { id: 'labg', name: ['LABG oro y negro', 'LABG gold and black'], c: ['#D4A848', '#111111', '#9C7128', '#8C8780', '#E6C470', '#5B5750', '#7D5B14', '#C9C3B8'], note: ['La marca de la suite', 'The suite’s brand'] },
    { id: 'okabe', name: ['Okabe e Ito', 'Okabe and Ito'], c: ['#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00', '#CC79A7', '#000000'], cvd: true, note: ['Distinguible con daltonismo (Okabe e Ito, 2008)', 'Colour-blind safe (Okabe & Ito, 2008)'] },
    { id: 'tolb', name: ['Tol brillante', 'Tol bright'], c: ['#4477AA', '#EE6677', '#228833', '#CCBB44', '#66CCEE', '#AA3377', '#BBBBBB'], cvd: true, note: ['Distinguible con daltonismo (Tol, 2021)', 'Colour-blind safe (Tol, 2021)'] },
    { id: 'tolm', name: ['Tol tenue', 'Tol muted'], c: ['#332288', '#88CCEE', '#44AA99', '#117733', '#999933', '#DDCC77', '#CC6677', '#882255', '#AA4499'], cvd: true, note: ['Nueve colores suaves, distinguibles con daltonismo', 'Nine soft colours, colour-blind safe'] },
    { id: 'tolv', name: ['Tol vibrante', 'Tol vibrant'], c: ['#0077BB', '#33BBEE', '#009988', '#EE7733', '#CC3311', '#EE3377', '#BBBBBB'], cvd: true, note: ['Para pantallas y presentaciones', 'For screens and slides'] },
    { id: 'viridis', name: ['Viridis (ordenada)', 'Viridis (ordered)'], c: ['#440154', '#46327E', '#365C8D', '#277F8E', '#1FA187', '#4AC16D', '#A0DA39', '#FDE725'], cvd: true, gray: true, note: ['Ordenada, legible en gris y con daltonismo', 'Ordered, readable in grey and colour-blind safe'] },
    { id: 'cividis', name: ['Cividis (ordenada)', 'Cividis (ordered)'], c: ['#00204D', '#31446B', '#575C6D', '#7C7B78', '#A69D75', '#D3C164', '#FFEA46'], cvd: true, gray: true, note: ['Pensada para la visión con deuteranopía', 'Designed for deuteranopic vision'] },
    { id: 'grises', name: ['Grises', 'Greys'], c: ['#111111', '#555555', '#888888', '#AAAAAA', '#333333', '#777777', '#CCCCCC'], gray: true, note: ['Para impresión en blanco y negro', 'For black-and-white print'] },
  ];
  const FONTS = [
    ['', ['La de la figura', 'The figure’s own'], ''],
    ['sans', ['Sans (palo seco)', 'Sans'], 'system-ui, sans-serif'],
    ['serif', ['Serif (con remates)', 'Serif'], 'ui-serif, serif'],
    ['labg', ['LABG Sans (de la suite)', 'LABG Sans (the suite’s)'], '"LABG Sans", system-ui, sans-serif'],
    ['mono', ['Monoespaciada', 'Monospace'], 'ui-monospace, monospace'],
  ];
  /* simulación de la visión con daltonismo (Machado, Oliveira y Fernandes, 2009; severidad 1) */
  const CVD = {
    p: ['Protanopía', 'Protanopia', '0.152286 1.052583 -0.204868 0 0  0.114503 0.786281 0.099216 0 0  -0.003882 -0.048116 1.051998 0 0  0 0 0 1 0'],
    d: ['Deuteranopía', 'Deuteranopia', '0.367322 0.860646 -0.227968 0 0  0.280085 0.672501 0.047413 0 0  -0.011820 0.042940 0.968881 0 0  0 0 0 1 0'],
    t: ['Tritanopía', 'Tritanopia', '1.255528 -0.076749 -0.178779 0 0  -0.078411 0.930809 0.147602 0 0  0.004733 0.691367 0.303900 0 0  0 0 0 1 0'],
    a: ['Acromatopsia (gris)', 'Achromatopsia (grey)', '0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0 0 0 1 0'],
  };
  /* preajustes de un clic: tamaño, resolución, formato, texto mínimo, líneas, paleta y fondo */
  const PRESETS = [
    { id: 'col1', name: ['Artículo · 1 columna', 'Article · 1 column'], w: 85, dpi: 600, fmt: 'tiff', minPt: 7, desc: ['85 mm · 600 ppp · TIFF · texto ≥ 7 pt', '85 mm · 600 dpi · TIFF · text ≥ 7 pt'] },
    { id: 'col15', name: ['Artículo · 1.5 columnas', 'Article · 1.5 columns'], w: 114, dpi: 600, fmt: 'tiff', minPt: 7, desc: ['114 mm · 600 ppp · TIFF · texto ≥ 7 pt', '114 mm · 600 dpi · TIFF · text ≥ 7 pt'] },
    { id: 'col2', name: ['Artículo · 2 columnas', 'Article · 2 columns'], w: 180, dpi: 600, fmt: 'tiff', minPt: 7, desc: ['180 mm · 600 ppp · TIFF · texto ≥ 7 pt', '180 mm · 600 dpi · TIFF · text ≥ 7 pt'] },
    { id: 'lines', name: ['Dibujo de líneas', 'Line art'], w: 85, dpi: 1200, fmt: 'tiff', minPt: 7, line: 1.25, desc: ['85 mm · 1200 ppp · líneas más firmes', '85 mm · 1200 dpi · firmer lines'] },
    { id: 'vector', name: ['Vectorial para editar', 'Editable vector'], w: 180, fmt: 'svg', minPt: 7, desc: ['180 mm · SVG · texto ≥ 7 pt', '180 mm · SVG · text ≥ 7 pt'] },
    { id: 'slides', name: ['Presentación', 'Slides'], w: 254, dpi: 192, fmt: 'png', minPt: 16, line: 1.6, desc: ['254 mm (1920 px) · PNG · texto ≥ 16 pt', '254 mm (1920 px) · PNG · text ≥ 16 pt'] },
    { id: 'poster', name: ['Póster', 'Poster'], w: 300, dpi: 300, fmt: 'pdf', minPt: 20, line: 1.8, desc: ['300 mm · 300 ppp · PDF · texto ≥ 20 pt', '300 mm · 300 dpi · PDF · text ≥ 20 pt'] },
    { id: 'web', name: ['Web y redes', 'Web and social'], w: 127, dpi: 240, fmt: 'png', minPt: 10, desc: ['1200 px · PNG · texto ≥ 10 pt', '1200 px · PNG · text ≥ 10 pt'] },
    { id: 'cvdsafe', name: ['Apta para daltonismo', 'Colour-blind safe'], pal: 'okabe', desc: ['Paleta de Okabe e Ito', 'Okabe and Ito palette'] },
    { id: 'gray', name: ['Impresión en gris', 'Greyscale print'], pal: 'grises', desc: ['Paleta de grises', 'Grey palette'] },
    { id: 'transp', name: ['Fondo transparente', 'Transparent background'], fmt: 'png', bg: 'none', desc: ['PNG sin fondo', 'PNG with no background'] },
  ];
  const WIDTHS = [[85, ['1 columna', '1 column']], [114, ['1.5 columnas', '1.5 columns']], [180, ['2 columnas', '2 columns']]];

  /* ---------------- figuras de la app ---------------- */
  const SKIP = 'button, a, .btn, .icon-btn, nav, .topbar, .stepper, .lnav-own, .lfs-own, .fig-editor, .fig-tools, .fe-panel, .fs-panel, .fig-menu, dialog, .toast-stack, .labg-iso, .brand, .suite-link, label, .seg, .lfs-before';
  const recs = new WeakMap();
  const attached = [];
  let cache = null;

  function isFigEl(el) {
    if (!el || !el.isConnected || el.closest(SKIP)) return false;
    if (CFG.exclude && el.closest(CFG.exclude)) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === 'svg') {
      if (el.parentElement && el.parentElement.closest('svg')) return false;
      const r = el.getBoundingClientRect();
      if (r.width && r.height) return r.width >= CFG.minSize * 1.6 && r.height >= CFG.minSize;
      const vb = el.viewBox && el.viewBox.baseVal;
      return !!(vb && vb.width >= 200 && vb.height >= 110 && el.parentElement && el.parentElement.closest(CFG.hosts));
    }
    if (tag === 'canvas') return !!el.parentElement.closest(CFG.hosts) && el.width >= 200 && el.height >= 110;
    if (tag === 'img') return !!el.parentElement.closest(CFG.hosts) && ((el.naturalWidth || 0) >= 160 || el.getBoundingClientRect().width >= 160);
    return false;
  }
  function hostOf(el) {
    const fc = el.parentElement && el.parentElement.closest('.fig-canvas');
    if (fc && fc.parentElement) return fc.parentElement;
    return (el.parentElement && el.parentElement.closest(CFG.hosts)) || el.parentElement;
  }
  function titleOf(rec) {
    if (rec.opts && rec.opts.title) return TT(rec.opts.title);
    let n = rec.host;
    for (let i = 0; i < 3 && n && n !== document.body; i++, n = n.parentElement) {
      let t = null;
      try { t = n.querySelector(CFG.titles); } catch (e) { t = null; }
      if (t && !rec.el.contains(t)) { const s = textOf(t); if (s) return s.slice(0, 120); }
      const card = n.closest('.chart-card');
      if (card) { const h = card.querySelector('.chart-title'); if (h) return textOf(h).slice(0, 120); }
    }
    const st = rec.el.tagName.toLowerCase() === 'svg' ? rec.el.querySelector(':scope > title') : null;
    if (st && st.textContent.trim()) return st.textContent.trim().slice(0, 120);
    const al = rec.el.getAttribute('aria-label') || rec.el.getAttribute('alt');
    return al ? al.slice(0, 120) : T('Figura', 'Figure');
  }
  function keyOf(rec) {
    if (rec.opts && rec.opts.key) return String(rec.opts.key);
    const anchor = rec.host.id ? rec.host : (rec.el.id ? rec.el : rec.host.closest('[id]'));
    const base = anchor ? anchor.id : 'doc';
    const list = anchor ? $$('svg, canvas, img', anchor).filter(isFigEl) : [];
    const i = Math.max(0, list.indexOf(rec.el));
    return base + (i ? ':' + i : '');
  }
  function libOf(el, opts) {
    if (opts && opts.library && ADAPTERS[opts.library]) return opts.library;
    for (const k of Object.keys(ADAPTERS)) if (ADAPTERS[k].test && ADAPTERS[k].test(el)) return k;
    return 'svg';
  }
  function recOf(el, opts) {
    let r = recs.get(el);
    if (!r) {
      r = { el, host: hostOf(el), opts: opts || null };
      r.lib = libOf(el, opts);
      r.key = keyOf(r);
      recs.set(el, r);
    } else if (opts) { r.opts = opts; r.lib = libOf(el, opts); }
    r.title = titleOf(r);
    return r;
  }
  function figures(root) {
    if (!cache || root) {
      const scope = root || $(CFG.root) || document.body;
      const list = $$('svg, canvas, img', scope).filter(isFigEl).map(el => recOf(el));
      attached.forEach(a => { if (a.el.isConnected && list.indexOf(a) < 0) list.push(recOf(a.el, a.opts)); });
      if (root) return list;
      cache = list;
    }
    return cache.filter(r => r.el.isConnected);
  }

  /* ---------------- adaptadores por tipo de figura ---------------- */
  const ADAPTERS = {
    svg: {
      test: el => el.tagName.toLowerCase() === 'svg',
      aspect: el => { const vb = el.viewBox && el.viewBox.baseVal; if (vb && vb.width && vb.height) return vb.height / vb.width; const r = el.getBoundingClientRect(); return r.width ? r.height / r.width : 0.62; },
      styles: true,
    },
    canvas: {
      test: el => el.tagName === 'CANVAS',
      aspect: el => (el.width ? el.height / el.width : 0.62),
      styles: false,
    },
    img: {
      test: el => el.tagName === 'IMG',
      aspect: el => (el.naturalWidth ? el.naturalHeight / el.naturalWidth : 0.62),
      styles: false,
    },
    /* figuras de bibliotecas de gráficas: se usan sus propias funciones si existen */
    plotly: {
      test: el => !!(window.Plotly && el.closest && el.closest('.js-plotly-plot') && el.classList.contains('main-svg')),
      aspect: el => { const g = el.closest('.js-plotly-plot'); return g && g.offsetWidth ? g.offsetHeight / g.offsetWidth : 0.62; },
      styles: false,
      raster: (el, w, h) => window.Plotly.toImage(el.closest('.js-plotly-plot'), { format: 'png', width: w, height: h }).then(loadImg),
    },
    chartjs: {
      test: el => !!(el.tagName === 'CANVAS' && window.Chart && window.Chart.getChart && window.Chart.getChart(el)),
      aspect: el => (el.width ? el.height / el.width : 0.62),
      styles: false,
    },
  };

  /* ---------------- botón de entrada en cada figura ---------------- */
  const openTitle = () => T('Abrir en el estudio de figuras: pantalla dividida para editar y exportar', 'Open in the figure studio: split screen to edit and export');
  function decorate() {
    cache = null;
    figures().forEach(rec => {
      const host = rec.host;
      if (!host) return;
      let inline = null;
      try { inline = CFG.btnHost ? host.querySelector(':scope > ' + CFG.btnHost.split(',').map(x => x.trim()).join(', :scope > ')) : null; } catch (e) { inline = null; }
      if (!inline) { const card = host.closest('.chart-card'); if (card) inline = card.querySelector('.chart-actions'); }
      if ((inline || host).querySelector('.lfs-open[data-for="' + cssEsc(rec.key) + '"]')) return;
      const b = mk('button', 'lfs-open lfs-own', ico('pencil-ruler'));
      b.type = 'button';
      b.setAttribute('data-for', rec.key);
      b.title = openTitle(); b.setAttribute('aria-label', openTitle() + ' — ' + rec.title);
      b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); open(rec.el, b); });
      if (inline) { b.classList.add('lfs-open-inline'); inline.appendChild(b); return; }
      /* a la izquierda de los botones flotantes que ya tenga la figura (⤓, ✎) */
      const others = $$(':scope > .fig-dl, :scope > .fig-ed, :scope > .fig-ed-solo', host).filter(x => getComputedStyle(x).position === 'absolute');
      b.style.right = (6 + others.length * 28) + 'px';
      if (getComputedStyle(host).position === 'static') host.classList.add('lfs-host-rel');
      host.appendChild(b);
    });
    applyAll();
    document.dispatchEvent(new CustomEvent('labg-figure-studio:ready'));
  }
  /* lo editado en el estudio vuelve a ponerse cada vez que la app redibuja */
  function applyAll(only) {
    if (!Object.keys(FIGS).length) return;
    (only || figures()).forEach(rec => {
      if (!FIGS[rec.key]) return;
      if (rec.lib !== 'svg') return;
      const st = figState(rec.key);
      if (!isDefault(st) && !rec.el.hasAttribute('data-lfs-done')) styleSvg(rec.el, st);
    });
  }

  /* ---------------- estado de cada figura (lo que el estudio le cambia) ---------------- */
  const FIGS = load('figs', {});
  const blankFig = () => ({ pal: '', font: '', txt: 1, line: 1, texts: {} });
  const figState = k => Object.assign(blankFig(), FIGS[k] || {});
  const isDefault = st => !st.pal && !st.font && st.txt === 1 && st.line === 1 && !Object.keys(st.texts || {}).length;
  function setFigState(k, st) {
    if (isDefault(st)) delete FIGS[k]; else FIGS[k] = JSON.parse(JSON.stringify(st));
    save('figs', FIGS);
  }

  /* ---------------- estilo del estudio sobre un SVG ---------------- */
  const SHAPES = 'path, line, polyline, polygon, rect, circle, ellipse';
  const hexOf = c => {
    if (!c || c === 'none' || c === 'transparent' || /^url\(/.test(c)) return null;
    const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+%?))?/.exec(c);
    if (m) { if (m[4] != null && parseFloat(m[4]) === 0) return null; return '#' + [m[1], m[2], m[3]].map(v => (+v).toString(16).padStart(2, '0')).join(''); }
    if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(c)) return '#' + c.slice(1).split('').map(x => x + x).join('').toLowerCase();
    return null;
  };
  const chroma = hex => { const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return { c: mx - mn, l: (mx + mn) / 2 }; };
  /* los colores de las series: con color, en el orden en que aparecen */
  function seriesColors(svg) {
    const out = [], seen = new Set();
    let bg = null, bgA = 0;
    $$('rect', svg).forEach(r => { const a = (+r.getAttribute('width') || 0) * (+r.getAttribute('height') || 0); if (a > bgA) { bgA = a; bg = hexOf(getComputedStyle(r).fill); } });
    $$(SHAPES, svg).forEach(n => {
      if (n.closest('defs, clipPath, mask, marker, pattern') || n.hasAttribute('data-lfs-own')) return;
      const cs = getComputedStyle(n);
      [cs.fill, cs.stroke].forEach(c => {
        const h = hexOf(c);
        if (!h || seen.has(h) || h === bg) return;
        const k = chroma(h);
        if (k.c < 0.16 || k.l > 0.95) return;
        seen.add(h); out.push(h);
      });
    });
    return out;
  }
  function resetSvg(svg) {
    $$('[data-lfs-o]', svg).concat(svg.hasAttribute('data-lfs-o') ? [svg] : []).forEach(n => {
      let o = {};
      try { o = JSON.parse(n.getAttribute('data-lfs-o')) || {}; } catch (e) { o = {}; }
      Object.keys(o).forEach(p => { if (o[p] === '') n.style.removeProperty(p); else n.style.setProperty(p, o[p]); });
      n.removeAttribute('data-lfs-o');
      if (n.hasAttribute('data-lfs-t0')) { n.textContent = n.getAttribute('data-lfs-t0'); n.removeAttribute('data-lfs-t0'); }
    });
    svg.removeAttribute('data-lfs-done');
  }
  function keep(n, prop) {
    let o = {};
    try { o = JSON.parse(n.getAttribute('data-lfs-o') || '{}'); } catch (e) { o = {}; }
    if (!(prop in o)) { o[prop] = n.style.getPropertyValue(prop) || ''; n.setAttribute('data-lfs-o', JSON.stringify(o)); }
  }
  let selfMut = false;
  function styleSvg(svg, st) {
    if (!svg || svg.tagName.toLowerCase() !== 'svg') return;
    selfMut = true;
    try {
      resetSvg(svg);
      if (isDefault(st)) return;
      /* paleta: el color i de la figura toma el color i de la paleta */
      const P = PALETTES.find(p => p.id === st.pal);
      if (P && P.c.length) {
        const C = seriesColors(svg), map = {};
        C.forEach((h, i) => { map[h] = P.c[i % P.c.length]; });
        $$(SHAPES, svg).forEach(n => {
          if (n.closest('defs, clipPath, mask') || n.hasAttribute('data-lfs-own')) return;
          const cs = getComputedStyle(n);
          const f = hexOf(cs.fill), s = hexOf(cs.stroke);
          if (f && map[f]) { keep(n, 'fill'); n.style.setProperty('fill', map[f]); }
          if (s && map[s]) { keep(n, 'stroke'); n.style.setProperty('stroke', map[s]); }
        });
      }
      /* textos: familia, tamaño y lo editado con doble clic */
      const F = FONTS.find(f => f[0] === st.font);
      const texts = $$('text', svg);
      const base = texts.map(t => parseFloat(getComputedStyle(t).fontSize) || 0);
      texts.forEach((t, i) => {
        const o = t.getAttribute('data-lfs-t0') || t.textContent;
        if (st.texts && st.texts[o] != null && t.children.length === 0) { t.setAttribute('data-lfs-t0', o); keep(t, 'font-size'); t.textContent = st.texts[o]; }
        if (F && F[2]) { keep(t, 'font-family'); t.style.setProperty('font-family', F[2]); }
        if (st.txt !== 1 && base[i]) { keep(t, 'font-size'); t.style.setProperty('font-size', (base[i] * st.txt).toFixed(2) + 'px'); }
      });
      if (st.txt !== 1) $$('tspan[font-size], tspan[style*="font-size"]', svg).forEach(t => { const v = parseFloat(getComputedStyle(t).fontSize); if (v) { keep(t, 'font-size'); t.style.setProperty('font-size', (v * st.txt).toFixed(2) + 'px'); } });
      /* líneas */
      if (st.line !== 1) {
        $$(SHAPES, svg).forEach(n => {
          if (n.closest('defs, clipPath, mask') || n.hasAttribute('data-lfs-own')) return;
          const cs = getComputedStyle(n);
          if (cs.stroke === 'none' || !hexOf(cs.stroke)) return;
          const w = parseFloat(cs.strokeWidth);
          if (!w) return;
          keep(n, 'stroke-width'); n.style.setProperty('stroke-width', (w * st.line).toFixed(3) + 'px');
        });
      }
      svg.setAttribute('data-lfs-done', '');
    } finally {
      if (mo) mo.takeRecords();
      selfMut = false;
    }
  }

  /* ---------------- el estudio ---------------- */
  const ST = {
    open: false, rec: null, el: null, lift: null, opener: null,
    layout: load('layout', 'right'), inspW: load('inspW', 384), float: load('float', null), sheet: 1,
    zoom: 'fit', pan: { x: 0, y: 0 }, aspect0: 0.62,
    compare: false, curtain: load('curtain', 50), before: null,
    cvd: '', exp: Object.assign({ w: 85, unit: 'mm', h: 0, dpi: 600, fmt: 'png', bg: 'white' }, load('exp', {})),
    fig: blankFig(), proxies: [], hist: [], hi: -1, secsOpen: load('secs', { app: true, palette: true, text: false, size: true, presets: false, history: false }),
    presets: load('presets', []),
  };
  const hasPopover = typeof HTMLElement !== 'undefined' && HTMLElement.prototype && typeof HTMLElement.prototype.showPopover === 'function';
  let studio, stage, insp, body, over, live, figMo = null, syncTimer = null;

  function buildStudio() {
    if (studio) return;
    studio = mk('div', 'lfs-studio lfs-own');
    studio.setAttribute('role', 'dialog');
    studio.setAttribute('aria-modal', 'true');
    studio.setAttribute('aria-labelledby', 'lfsTitle');
    if (hasPopover) studio.setAttribute('popover', 'manual');
    studio.innerHTML =
      '<header class="lfs-bar" role="toolbar">' +
        '<div class="lfs-brand">' + ico('pencil-ruler') + '<b id="lfsTitle"></b><span class="lfs-figname"></span></div>' +
        '<div class="lfs-tools">' +
          '<button type="button" class="lfs-tb" data-a="undo">' + ico('undo-2') + '</button>' +
          '<button type="button" class="lfs-tb" data-a="redo">' + ico('redo-2') + '</button>' +
          '<span class="lfs-sep"></span>' +
          '<button type="button" class="lfs-tb lfs-tbt" data-a="compare" aria-pressed="false">' + ico('columns-2') + '<span></span></button>' +
          '<span class="lfs-sep"></span>' +
          '<button type="button" class="lfs-tb" data-a="zoomout">' + ico('zoom-out') + '</button>' +
          '<button type="button" class="lfs-tb lfs-zoomval" data-a="fit"></button>' +
          '<button type="button" class="lfs-tb" data-a="zoomin">' + ico('zoom-in') + '</button>' +
          '<button type="button" class="lfs-tb" data-a="real">' + ico('ruler') + '</button>' +
          '<span class="lfs-sep"></span>' +
          '<div class="lfs-menuwrap"><button type="button" class="lfs-tb lfs-tbt" data-a="presets" aria-haspopup="true" aria-expanded="false">' + ico('wand-sparkles') + '<span></span></button><div class="lfs-menu" hidden role="menu"></div></div>' +
          '<button type="button" class="lfs-tb lfs-pri" data-a="export">' + ico('download') + '<span></span></button>' +
          '<button type="button" class="lfs-tb" data-a="copy">' + ico('copy') + '</button>' +
          '<span class="lfs-sep"></span>' +
          '<div class="lfs-lay" role="group"><button type="button" class="lfs-tb" data-a="lay-left">' + ico('panel-left') + '</button><button type="button" class="lfs-tb" data-a="lay-right">' + ico('panel-right') + '</button><button type="button" class="lfs-tb" data-a="lay-float">' + ico('picture-in-picture-2') + '</button></div>' +
          '<button type="button" class="lfs-tb" data-a="keys">' + ico('keyboard') + '</button>' +
          '<button type="button" class="lfs-tb lfs-close" data-a="close">' + ico('x') + '<span></span></button>' +
        '</div>' +
      '</header>' +
      '<div class="lfs-main">' +
        '<div class="lfs-stage"><div class="lfs-msg" hidden></div><div class="lfs-info" aria-live="polite"></div></div>' +
        '<div class="lfs-split" role="separator" aria-orientation="vertical" tabindex="0"></div>' +
        '<aside class="lfs-insp">' +
          '<div class="lfs-insp-head"><button type="button" class="lfs-grab" data-a="sheet">' + ico('grip-vertical') + '</button>' +
            '<label class="lfs-search">' + ico('search') + '<input type="search" autocomplete="off" spellcheck="false"></label></div>' +
          '<div class="lfs-insp-body"></div>' +
        '</aside>' +
      '</div>' +
      '<svg class="lfs-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>' +
        Object.keys(CVD).map(k => '<filter id="lfs-cvd-' + k + '" color-interpolation-filters="linearRGB"><feColorMatrix type="matrix" values="' + CVD[k][2] + '"/></filter>').join('') +
      '</defs></svg>' +
      '<div class="lfs-live sr-only" aria-live="polite" aria-atomic="true"></div>';
    document.body.appendChild(studio);
    stage = $('.lfs-stage', studio);
    insp = $('.lfs-insp', studio);
    body = $('.lfs-insp-body', studio);
    live = $('.lfs-live', studio);
    /* capa de encima de la figura: cortina, guías, resaltes y edición en sitio */
    over = mk('div', 'lfs-over lfs-own');
    if (hasPopover) over.setAttribute('popover', 'manual');
    over.innerHTML = '<div class="lfs-guides"></div><div class="lfs-ring"></div>' +
      '<div class="lfs-curtain" hidden><div class="lfs-before-wrap"><img class="lfs-before" alt=""></div><div class="lfs-handle" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="100"><i></i></div><span class="lfs-tag lfs-tag-a"></span><span class="lfs-tag lfs-tag-b"></span></div>' +
      '<input type="text" class="lfs-inplace" hidden>';
    document.body.appendChild(over);

    studio.addEventListener('click', onToolbar);
    $('.lfs-search input', studio).addEventListener('input', e => { clearTimeout(ST.searchT); ST.searchT = setTimeout(() => filter(e.target.value), 120); });
    body.addEventListener('click', onInspClick);
    body.addEventListener('input', onInspInput);
    body.addEventListener('change', onInspChange);
    body.addEventListener('pointerover', onInspHover);
    body.addEventListener('pointerout', e => { if (!e.relatedTarget || !body.contains(e.relatedTarget)) hilite(null); });
    splitter($('.lfs-split', studio));
    floatDrag();
    curtain();
    stagePointer();
    inplace();
    labels();
  }

  /* textos de la interfaz en el idioma activo */
  function labels() {
    if (!studio) return;
    $('#lfsTitle', studio).textContent = T('Estudio de figuras', 'Figure studio');
    $('.lfs-bar', studio).setAttribute('aria-label', T('Herramientas del estudio', 'Studio tools'));
    const tip = (a, es, en, k) => { const b = $('[data-a="' + a + '"]', studio); if (!b) return; const t = T(es, en) + (k ? ' (' + k + ')' : ''); b.title = t; b.setAttribute('aria-label', t); };
    tip('undo', 'Deshacer', 'Undo', 'Ctrl+Z'); tip('redo', 'Rehacer', 'Redo', 'Ctrl+Y');
    tip('compare', 'Comparar antes y ahora con una cortina', 'Compare before and now with a curtain', 'B');
    tip('zoomout', 'Alejar', 'Zoom out', '−'); tip('zoomin', 'Acercar', 'Zoom in', '+');
    tip('fit', 'Ajustar a la pantalla', 'Fit to the screen', '0'); tip('real', 'Tamaño real (aproximado según la pantalla)', 'Real size (approximate, depends on the screen)', '1');
    tip('presets', 'Preajustes de un clic', 'One-click presets');
    tip('export', 'Exportar la figura', 'Export the figure', 'Ctrl+E'); tip('copy', 'Copiar la imagen', 'Copy the image', 'Ctrl+Shift+C');
    tip('lay-left', 'Inspector a la izquierda', 'Inspector on the left'); tip('lay-right', 'Inspector a la derecha', 'Inspector on the right'); tip('lay-float', 'Inspector flotante', 'Floating inspector');
    tip('keys', 'Atajos del estudio', 'Studio shortcuts', '?'); tip('close', 'Cerrar el estudio', 'Close the studio', 'Esc');
    tip('sheet', 'Subir o bajar el panel', 'Raise or lower the panel');
    $('[data-a="compare"] span', studio).textContent = T('Antes / ahora', 'Before / now');
    $('[data-a="presets"] span', studio).textContent = T('Preajustes', 'Presets');
    $('[data-a="export"] span', studio).textContent = T('Exportar', 'Export');
    $('[data-a="close"] span', studio).textContent = T('Cerrar estudio', 'Close studio');
    $('.lfs-lay', studio).setAttribute('aria-label', T('Posición del inspector', 'Inspector position'));
    const si = $('.lfs-search input', studio);
    si.placeholder = T('Buscar un control…', 'Search a control…'); si.setAttribute('aria-label', T('Buscar un control del inspector', 'Search an inspector control'));
    insp.setAttribute('aria-label', T('Inspector', 'Inspector'));
    stage.setAttribute('aria-label', T('Figura', 'Figure'));
    const sp = $('.lfs-split', studio); sp.setAttribute('aria-label', T('Ancho del inspector (flechas para cambiarlo)', 'Inspector width (arrows to change it)'));
    $('.lfs-tag-a', over).textContent = T('Antes', 'Before'); $('.lfs-tag-b', over).textContent = T('Ahora', 'Now');
    $('.lfs-handle', over).setAttribute('aria-label', T('Cortina entre antes y ahora', 'Curtain between before and now'));
  }

  /* ---------------- abrir y cerrar ---------------- */
  function open(target, opener) {
    try {
      let el = target;
      if (el && !/^(svg|canvas|img)$/i.test(el.tagName)) el = $$('svg, canvas, img', el).find(isFigEl) || null;
      if (!el || !el.isConnected) return false;
      /* si está en una sección plegada o escondida por el navegador, se muestra primero */
      if (window.LABGNavigator && LABGNavigator.reveal && el.closest('.lnav-out, .lnav-hid, [inert]')) LABGNavigator.reveal(el);
      const det = el.closest('details:not([open])'); if (det) det.open = true;
      if (!shown(el)) { msgOut(T('La figura no está a la vista: abre primero su bloque.', 'The figure is not visible: open its block first.')); return false; }
      buildStudio();
      if (ST.open) close(true);
      const rec = recOf(el);
      ST.rec = rec; ST.el = el; ST.opener = opener || document.activeElement;
      ST.fig = figState(rec.key);
      ST.hist = []; ST.hi = -1;
      ST.zoom = 'fit'; ST.pan = { x: 0, y: 0 };
      ST.aspect0 = ADAPTERS[rec.lib].aspect(el) || 0.62;
      ST.compare = false; ST.cvd = '';
      document.documentElement.classList.add('lfs-is-open');
      studio.classList.add('on');
      if (hasPopover) { try { studio.showPopover(); } catch (e) { /* ya abierto */ } }
      applyLayoutClass();
      lift(el);
      if (hasPopover) { try { over.showPopover(); } catch (e) { /* nada */ } }
      over.classList.add('on');
      $('.lfs-figname', studio).textContent = rec.title;
      ST.open = true;
      render();
      place();
      snapshotBefore();
      dock(true);
      clearInterval(syncTimer); syncTimer = setInterval(syncProxies, 450);
      window.addEventListener('resize', onResize);
      document.addEventListener('keydown', onKey, true);
      setTimeout(() => { const b = $('[data-a="close"]', studio); if (b) b.focus(); }, 30);
      say(T('Estudio de figuras abierto: ', 'Figure studio open: ') + rec.title);
      document.dispatchEvent(new CustomEvent('labg-figure-studio:open', { detail: { key: rec.key, title: rec.title } }));
      return true;
    } catch (err) {
      console.error('LABG Estudio de figuras', err);
      try { close(true); } catch (e) { /* nada */ }
      return false;
    }
  }
  function close(silent) {
    if (!ST.open && !silent) return;
    ST.open = false;
    clearInterval(syncTimer);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('keydown', onKey, true);
    dock(false);
    unlift();
    if (studio) {
      studio.classList.remove('on');
      if (hasPopover) { try { studio.hidePopover(); } catch (e) { /* nada */ } }
    }
    if (over) { over.classList.remove('on'); if (hasPopover) { try { over.hidePopover(); } catch (e) { /* nada */ } } }
    if (ST.before) { try { URL.revokeObjectURL(ST.before); } catch (e) { /* nada */ } ST.before = null; }
    document.documentElement.classList.remove('lfs-is-open');
    const op = ST.opener;
    ST.rec = null; ST.el = null; ST.proxies = [];
    if (op && op.isConnected && !silent) { try { op.focus(); } catch (e) { /* nada */ } }
    if (!silent) document.dispatchEvent(new CustomEvent('labg-figure-studio:close'));
  }

  /* ---------------- elevar la figura sin moverla ---------------- */
  function lift(el) {
    const w = el.parentElement;
    ST.lift = w;
    w.classList.add('lfs-lifted');
    el.classList.add('lfs-figel');
    ST.liftWasPopover = w.hasAttribute('popover');
    /* un SVG sin viewBox no se escala: se le da uno mientras está en el estudio */
    if (el.tagName.toLowerCase() === 'svg' && !el.getAttribute('viewBox')) {
      const wd = parseFloat(el.getAttribute('width')) || el.getBoundingClientRect().width, ht = parseFloat(el.getAttribute('height')) || el.getBoundingClientRect().height;
      if (wd && ht) { el.setAttribute('viewBox', '0 0 ' + wd + ' ' + ht); el.setAttribute('data-lfs-vb', ''); }
    }
    if (hasPopover && !ST.liftWasPopover) {
      w.setAttribute('popover', 'manual');
      try { w.showPopover(); ST.lifted = true; } catch (e) { ST.lifted = false; w.removeAttribute('popover'); }
    }
    if (!ST.lifted) {
      /* sin capa superior: la figura se presta al escenario y vuelve al cerrar */
      ST.ph = document.createComment('lfs');
      w.parentNode.insertBefore(ST.ph, w);
      stage.appendChild(w);
    }
    w.addEventListener('pointerdown', onFigDown);
    w.addEventListener('click', onFigClick);
    w.addEventListener('dblclick', onFigDbl);
    if (window.MutationObserver) {
      figMo = new MutationObserver(recsM => {
        if (selfMut) return;
        if (recsM.every(r => r.target.nodeType === 1 && r.target.closest && r.target.closest('.lfs-own'))) return;
        afterRender();
      });
      figMo.observe(w, { childList: true, subtree: true, attributes: true, attributeFilter: ['viewBox', 'width', 'height', 'src'] });
      figMo.observe(document.body, { childList: true, subtree: true });
    }
  }
  function unlift() {
    if (figMo) { figMo.disconnect(); figMo = null; }
    const w = ST.lift;
    if (!w) return;
    w.removeEventListener('pointerdown', onFigDown);
    w.removeEventListener('click', onFigClick);
    w.removeEventListener('dblclick', onFigDbl);
    if (ST.lifted) { try { w.hidePopover(); } catch (e) { /* nada */ } if (!ST.liftWasPopover) w.removeAttribute('popover'); }
    else if (ST.ph && ST.ph.parentNode) { ST.ph.parentNode.insertBefore(w, ST.ph); ST.ph.remove(); }
    ST.ph = null; ST.lifted = false;
    w.classList.remove('lfs-lifted', 'lfs-transp', 'lfs-bg-screen', 'lfs-cvd-p', 'lfs-cvd-d', 'lfs-cvd-t', 'lfs-cvd-a');
    ['left', 'top', 'width', 'height'].forEach(p => w.style.removeProperty(p));
    $$('.lfs-figel', w).forEach(n => n.classList.remove('lfs-figel'));
    $$('[data-lfs-vb]', w).forEach(n => { n.removeAttribute('viewBox'); n.removeAttribute('data-lfs-vb'); });
    $$('.lfs-hl-el', w).forEach(n => n.classList.remove('lfs-hl-el'));
    ST.lift = null;
  }
  /* la app redibujó: se vuelve a encontrar la figura y a poner lo del estudio */
  let afterQ = false;
  function afterRender() {
    if (afterQ) return;
    afterQ = true;
    Promise.resolve().then(() => {
      afterQ = false;
      if (!ST.open) return;
      relocate();
      if (!ST.el) return;
      if (ADAPTERS[ST.rec.lib].styles && !isDefault(ST.fig) && !ST.el.hasAttribute('data-lfs-done')) styleSvg(ST.el, ST.fig);
      place();
      readout();
      ring();
    });
  }
  function relocate() {
    const rec = ST.rec;
    let el = ST.el;
    const ok = el && el.isConnected && ST.lift && ST.lift.contains(el) && ST.lift.isConnected;
    if (ok) return;
    /* ¿la figura nueva está en el mismo envoltorio? */
    let cand = ST.lift && ST.lift.isConnected ? $$('svg, canvas, img', ST.lift).find(n => n.parentElement === ST.lift || n.parentElement.closest('.lfs-lifted') === ST.lift) : null;
    if (!cand) {
      const host = rec.host && rec.host.isConnected ? rec.host : (rec.host && rec.host.id ? document.getElementById(rec.host.id) : null);
      const scope = host || (rec.key.split(':')[0] && document.getElementById(rec.key.split(':')[0]));
      if (scope) cand = $$('svg, canvas, img', scope).find(n => isFigEl(n) || (n.parentElement && n.parentElement.closest('.lfs-lifted')));
    }
    if (!cand) { $('.lfs-msg', stage).hidden = false; $('.lfs-msg', stage).textContent = T('La figura se está redibujando…', 'The figure is being redrawn…'); return; }
    $('.lfs-msg', stage).hidden = true;
    if (cand.parentElement !== ST.lift) {
      unliftKeepOpen();
      ST.el = cand;
      const r = recOf(cand);
      r.key = rec.key; ST.rec = r;
      lift(cand);
      if (hasPopover) { try { over.hidePopover(); over.showPopover(); } catch (e) { /* nada */ } }
    } else {
      ST.el.classList && ST.el.classList.remove('lfs-figel');
      ST.el = cand; cand.classList.add('lfs-figel');
      const r = recOf(cand); r.key = rec.key; ST.rec = r;
    }
    if (ST.cvd) setCvd(ST.cvd);
  }
  function unliftKeepOpen() { unlift(); }

  /* ---------------- disposición ---------------- */
  function applyLayoutClass() {
    const mobile = window.innerWidth < 900;
    studio.classList.toggle('lay-left', ST.layout === 'left' && !mobile);
    studio.classList.toggle('lay-float', ST.layout === 'float' && !mobile);
    studio.classList.toggle('lay-right', (ST.layout === 'right' || !ST.layout) && !mobile);
    studio.classList.toggle('lay-mobile', mobile);
    studio.classList.toggle('sheet-0', mobile && ST.sheet === 0);
    studio.classList.toggle('sheet-2', mobile && ST.sheet === 2);
    studio.style.setProperty('--lfs-insp-w', clamp(ST.inspW, 320, 560) + 'px');
    if (ST.layout === 'float' && !mobile) {
      const f = ST.float || { x: window.innerWidth - 420, y: 70, w: 390, h: Math.min(640, window.innerHeight - 110) };
      insp.style.left = clamp(f.x, 8, window.innerWidth - 200) + 'px'; insp.style.top = clamp(f.y, 56, window.innerHeight - 120) + 'px';
      insp.style.width = clamp(f.w, 300, 640) + 'px'; insp.style.height = clamp(f.h, 240, window.innerHeight - 70) + 'px';
    } else { ['left', 'top', 'width', 'height'].forEach(p => insp.style.removeProperty(p)); }
    $$('.lfs-lay [data-a]', studio).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.a === 'lay-' + ST.layout)));
  }
  function onResize() { clearTimeout(ST.rt); ST.rt = setTimeout(() => { applyLayoutClass(); place(); }, 60); }

  /* tamaño de exportación en mm */
  const expW = () => (ST.exp.unit === 'in' ? ST.exp.w * MM_IN : ST.exp.w);
  const expH = () => (ST.exp.h ? (ST.exp.unit === 'in' ? ST.exp.h * MM_IN : ST.exp.h) : expW() * ST.aspect0);
  const expPx = () => ({ w: Math.max(1, Math.round(expW() / MM_IN * ST.exp.dpi)), h: Math.max(1, Math.round(expH() / MM_IN * ST.exp.dpi)) });

  /* la figura sobre el «papel» del tamaño de salida */
  let placeQ = false;
  function place() {
    if (placeQ) return;
    placeQ = true;
    raf(() => {
      placeQ = false;
      if (!ST.open || !ST.lift) return;
      const s = stage.getBoundingClientRect();
      const pad = window.innerWidth < 900 ? 14 : 34;
      const wmm = expW(), hmm = expH();
      const A = hmm / wmm;
      const availW = Math.max(40, s.width - pad * 2), availH = Math.max(40, s.height - pad * 2 - 26);
      let pw, ph;
      if (ST.zoom === 'fit') { pw = Math.min(availW, availH / A); ph = pw * A; }
      else { pw = wmm * PX_MM * ST.zoom; ph = pw * A; }
      const cx = s.left + s.width / 2 + ST.pan.x, cy = s.top + (s.height - 26) / 2 + ST.pan.y;
      const r = { left: Math.round(cx - pw / 2), top: Math.round(cy - ph / 2), width: Math.round(pw), height: Math.round(ph) };
      ST.paper = r;
      const w = ST.lift;
      w.style.setProperty('left', r.left + 'px', 'important');
      w.style.setProperty('top', r.top + 'px', 'important');
      w.style.setProperty('width', r.width + 'px', 'important');
      w.style.setProperty('height', r.height + 'px', 'important');
      w.classList.toggle('lfs-transp', ST.exp.bg === 'none');
      w.classList.toggle('lfs-bg-screen', ST.exp.bg === 'screen');
      /* la capa de encima sigue al papel */
      const z = pw / (wmm * PX_MM);
      ST.zoomNow = z;
      $('.lfs-zoomval', studio).textContent = ST.zoom === 'fit' ? T('Ajustar', 'Fit') + ' · ' + Math.round(z * 100) + '%' : Math.round(z * 100) + '%';
      const cur = $('.lfs-curtain', over);
      if (!cur.hidden) {
        Object.assign(cur.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
        paintCurtain();
      }
      guides(r, z);
      ringBox(r);
    });
  }
  /* siluetas de 85 y 180 mm alrededor del papel */
  function guides(r, z) {
    const g = $('.lfs-guides', over);
    const s = stage.getBoundingClientRect();
    Object.assign(g.style, { left: s.left + 'px', top: s.top + 'px', width: s.width + 'px', height: s.height + 'px' });
    r = { left: r.left - s.left, top: r.top - s.top, width: r.width, height: r.height };
    const cx = r.left + r.width / 2;
    const out = [];
    WIDTHS.forEach(([mm, nm]) => {
      if (mm <= expW() + 1) return;   /* solo las más anchas: rodean al papel sin taparlo */
      const w = mm * PX_MM * z, h = w * (r.height / r.width);
      if (w > window.innerWidth * 1.4) return;
      const sl = Math.round(cx - w / 2), stp = Math.round(r.top + r.height / 2 - h / 2);
      out.push('<div class="lfs-sil" style="left:' + sl + 'px;top:' + stp + 'px;width:' + Math.round(w) + 'px;height:' + Math.round(h) + 'px"><span style="left:' + Math.max(0, -sl + 6) + 'px;top:' + (stp < 22 ? Math.max(4, -stp + 6) : -19) + 'px">' + mm + ' mm · ' + esc(TT(nm)) + '</span></div>');
    });
    out.push('<div class="lfs-paperlab" style="left:' + r.left + 'px;top:' + (r.top + r.height + 6) + 'px;width:' + r.width + 'px">' + esc(fmtSize()) + '</div>');
    g.innerHTML = out.join('');
  }
  const fmtN = (v, d) => (+v).toFixed(d).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  function fmtSize() {
    const px = expPx();
    const w = expW(), h = expH();
    return fmtN(w, 1) + ' × ' + fmtN(h, 1) + ' mm  ·  ' + fmtN(w / MM_IN, 2) + ' × ' + fmtN(h / MM_IN, 2) + ' in' + (ST.exp.fmt === 'svg' ? '  ·  ' + T('vectorial', 'vector') : '  ·  ' + ST.exp.dpi + ' ' + T('ppp', 'dpi') + ' → ' + px.w + ' × ' + px.h + ' px');
  }
  function ringBox(r) { const g = $('.lfs-ring', over); Object.assign(g.style, { left: (r.left - 3) + 'px', top: (r.top - 3) + 'px', width: (r.width + 6) + 'px', height: (r.height + 6) + 'px' }); }
  /* un destello dorado alrededor de lo que cambió */
  function ring() { const g = $('.lfs-ring', over); g.classList.remove('flash'); void g.offsetWidth; g.classList.add('flash'); }

  /* ---------------- inspector ---------------- */
  const SECTIONS = () => [
    { id: 'app', icon: 'sliders-horizontal', title: T('Ajustes de la figura', 'Figure settings'), sub: T('los de la app', 'the app’s own') },
    { id: 'docks', icon: 'layers', title: '', sub: '' },
    { id: 'palette', icon: 'palette', title: T('Paleta y color', 'Palette and colour'), sub: T('del estudio', 'studio') },
    { id: 'text', icon: 'type', title: T('Texto y líneas', 'Text and lines'), sub: T('del estudio', 'studio') },
    { id: 'size', icon: 'ruler', title: T('Tamaño y exportación', 'Size and export'), sub: '' },
    { id: 'presets', icon: 'wand-sparkles', title: T('Preajustes', 'Presets'), sub: '' },
    { id: 'history', icon: 'history', title: T('Historial', 'History'), sub: '' },
  ];
  function render() {
    const rec = ST.rec;
    const styl = ADAPTERS[rec.lib].styles;
    const html = SECTIONS().map(s => {
      if (s.id === 'docks') return '<div class="lfs-docks"></div>';
      if ((s.id === 'palette' || s.id === 'text') && !styl) return '';
      const openS = ST.secsOpen[s.id] !== false;
      return '<section class="lfs-sec" data-sec="' + s.id + '"><h3 class="lfs-sec-h"><button type="button" class="lfs-sec-btn" aria-expanded="' + openS + '" aria-controls="lfsSec-' + s.id + '">' + ico(s.icon) +
        '<span>' + esc(s.title) + '</span>' + (s.sub ? '<small>' + esc(s.sub) + '</small>' : '') + ico('chevron-down', 'lfs-chev') + '</button></h3>' +
        '<div class="lfs-sec-b" id="lfsSec-' + s.id + '"' + (openS ? '' : ' hidden') + '></div></section>';
    }).join('');
    body.innerHTML = html;
    renderApp(); renderPalette(); renderText(); renderSize(); renderPresets(); renderHistory();
    paintUndo();
    readout();
    filter($('.lfs-search input', studio).value || '');
  }
  const secB = id => $('.lfs-sec[data-sec="' + id + '"] .lfs-sec-b', body);
  const row = (label, ctl, cls, extra) => '<div class="lfs-row' + (cls ? ' ' + cls : '') + '"' + (extra || '') + '><span class="lfs-lab">' + label + '</span><div class="lfs-ctl">' + ctl + '</div></div>';

  /* ----- ajustes de la app (reflejados) ----- */
  const CTRL_SKIP = '.lfs-own, .lnav-own, .fig-tab, .fs-tab, .fig-ed, .fig-dl:not(div), .lfs-open, summary, .step-btn, [type="hidden"], [type="file"]';
  function controlsIn(root) {
    return $$('select, input, textarea, button', root).filter(c => !c.matches(CTRL_SKIP) && !c.closest('.lfs-own, .lnav-own, .fe-panel, .fs-panel, .fig-menu'));
  }
  function appGroups(rec) {
    const groups = [];
    const host = rec.host;
    const mine = n => { const ed = n.closest('details.fig-editor, .fig-tools'); return !ed || ed.parentElement === host || host.contains(ed); };
    const ed = host.querySelector(':scope > details.fig-editor, :scope > details.fstudio, details.fig-editor, details.fstudio');
    if (ed && host.contains(ed)) {
      const tabs = $$('.fig-tab, .fs-tab, [role="tab"]', ed);
      const panes = $$(':scope > .fig-opts, :scope .fs-pane, :scope [role="tabpanel"]', ed);
      if (panes.length > 1) panes.forEach((p, i) => groups.push({ title: tabs[i] ? textOf(tabs[i]) : T('Opciones', 'Options'), ctrls: controlsIn(p) }));
      else groups.push({ title: textOf(ed.querySelector('summary')) || T('Edición de la figura', 'Figure editing'), ctrls: controlsIn(ed) });
    }
    const tools = $$('.fig-tools, div.fig-dl', host).filter(t => !t.closest('.lfs-own'));
    const tc = [];
    tools.forEach(t => controlsIn(t).forEach(c => tc.push(c)));
    if (rec.opts && rec.opts.controls) {
      const extra = typeof rec.opts.controls === 'function' ? rec.opts.controls(rec) : rec.opts.controls;
      const nodes = typeof extra === 'string' ? $$(extra) : (extra && extra.length != null ? Array.from(extra) : (extra ? [extra] : []));
      const cs = []; nodes.forEach(n => (n.matches && n.matches('select, input, textarea, button') ? cs.push(n) : controlsIn(n).forEach(c => cs.push(c))));
      if (cs.length) groups.push({ title: T('Ajustes', 'Settings'), ctrls: cs });
    }
    const more = CFG.controlsFor ? CFG.controlsFor(rec) : null;
    if (more) groups.push({ title: T('Estilo de las figuras del bloque', 'Style of the block’s figures'), ctrls: controlsIn(more) });
    /* los ajustes de la tarjeta donde vive la figura (fuera de otras figuras) */
    const card = host.closest('.card, .chart-card, .qc-section, section');
    if (card && card !== host) {
      const own = new Set(groups.flatMap(g => g.ctrls).concat(tc));
      const others = $$(CFG.hosts, card).filter(h => h !== host && !h.contains(host) && !host.contains(h));
      const cs = controlsIn(card).filter(c => !host.contains(c) && !own.has(c) && !others.some(h => h.contains(c)) && mine(c) && !c.closest('details.fig-editor, .fig-tools'));
      if (cs.length && cs.length <= 60) groups.unshift({ title: T('Datos y opciones de la sección', 'Data and options of the section'), ctrls: cs });
    }
    if (tc.length) groups.push({ title: T('Descarga (la de la app)', 'Download (the app’s own)'), ctrls: tc, kind: 'export' });
    return groups.filter(g => g.ctrls.length);
  }
  function labelFor(c) {
    let t = '';
    if (c.id) { const l = document.querySelector('label[for="' + cssEsc(c.id) + '"]'); if (l) t = textOf(l); }
    const wrap = c.closest('label');
    if (!t && wrap && wrap.querySelectorAll('input, select, textarea').length === 1) t = textOf(wrap);
    if (!t) t = c.getAttribute('aria-label') || c.title || '';
    if (!t) { const it = c.closest('.color-item'); if (it) t = textOf(it); }
    if (!t && c.tagName === 'BUTTON') t = textOf(c);
    if (!t && wrap) t = textOf(wrap);
    if (!t && c.placeholder) t = c.placeholder;
    if (!t) { const pv = c.previousElementSibling; if (pv && /^(SPAN|B|SMALL|LABEL|STRONG)$/.test(pv.tagName)) t = textOf(pv); }
    return (t || c.name || c.id || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  }
  function renderApp() {
    const b = secB('app');
    if (!b) return;
    ST.proxies = [];
    const groups = appGroups(ST.rec);
    if (!groups.length) {
      b.innerHTML = '<p class="lfs-note">' + esc(T('Esta figura no trae opciones propias: usa las del estudio (paleta, texto, tamaño) o el editor de la app si lo tiene.', 'This figure has no options of its own: use the studio’s (palette, text, size) or the app’s editor if it has one.')) + '</p>';
      return;
    }
    const radios = new Set();
    b.innerHTML = groups.map((g, gi) => '<div class="lfs-grp' + (g.kind ? ' lfs-grp-' + g.kind : '') + '"><h4>' + esc(g.title) + '</h4>' + g.ctrls.map(c => {
      if (c.type === 'radio') { if (radios.has(c.name)) return ''; radios.add(c.name); }
      const k = ST.proxies.length;
      ST.proxies.push({ n: c, g: gi });
      return proxyHtml(c, k);
    }).join('') + '</div>').join('');
    syncProxies(true);
  }
  function proxyHtml(c, k) {
    const lab = esc(labelFor(c) || T('Opción', 'Option'));
    const tag = c.tagName, ty = (c.type || '').toLowerCase();
    const dis = c.disabled ? ' disabled' : '';
    if (tag === 'SELECT') return row(lab, '<select data-k="' + k + '"' + dis + '>' + c.innerHTML.replace(/\sid="[^"]*"/g, '') + '</select>', 'lfs-r-select');
    if (tag === 'TEXTAREA') return row(lab, '<textarea data-k="' + k + '" rows="2"' + dis + '></textarea>', 'lfs-r-text');
    if (tag === 'BUTTON') return '<div class="lfs-row lfs-r-btn"><button type="button" class="lfs-pbtn" data-k="' + k + '"' + dis + (c.getAttribute('aria-pressed') ? ' aria-pressed="' + c.getAttribute('aria-pressed') + '"' : '') + '>' + (c.querySelector('svg, i[style], span[style]') ? c.innerHTML.replace(/\sid="[^"]*"/g, '') : esc(labelFor(c))) + '</button></div>';
    if (ty === 'checkbox') return '<div class="lfs-row lfs-r-check"><label><input type="checkbox" data-k="' + k + '"' + dis + '><span>' + lab + '</span></label></div>';
    if (ty === 'radio') {
      const all = $$('input[type="radio"][name="' + cssEsc(c.name) + '"]');
      return row(esc(c.name ? (c.closest('fieldset') && c.closest('fieldset').querySelector('legend') ? textOf(c.closest('fieldset').querySelector('legend')) : '') : '') || lab,
        '<div class="lfs-seg">' + all.map(r => { const kk = ST.proxies.length; if (r !== c) ST.proxies.push({ n: r }); const kx = r === c ? k : kk; return '<button type="button" data-k="' + kx + '" data-radio>' + esc(labelFor(r)) + '</button>'; }).join('') + '</div>', 'lfs-r-radio');
    }
    if (ty === 'range') return row(lab, '<input type="range" data-k="' + k + '" min="' + esc(c.min) + '" max="' + esc(c.max) + '" step="' + esc(c.step || 'any') + '"' + dis + '><output></output>', 'lfs-r-range');
    if (ty === 'color') return row(lab, '<input type="color" data-k="' + k + '"' + dis + '>', 'lfs-r-color');
    if (ty === 'number') return row(lab, '<input type="number" data-k="' + k + '" min="' + esc(c.min) + '" max="' + esc(c.max) + '" step="' + esc(c.step || 'any') + '"' + dis + '>', 'lfs-r-num');
    return row(lab, '<input type="' + (/^(text|search|email|url|date|time)$/.test(ty) ? ty : 'text') + '" data-k="' + k + '"' + dis + '>', 'lfs-r-text');
  }
  /* de la app al inspector: valores, opciones y si sigue existiendo */
  function syncProxies(force) {
    if (!ST.open || !body) return;
    const gone = ST.proxies.some(p => !p.n.isConnected);
    if (gone && !force) { const sc = body.scrollTop; renderApp(); body.scrollTop = sc; filter($('.lfs-search input', studio).value || ''); return; }
    ST.proxies.forEach((p, k) => {
      const px = body.querySelector('[data-k="' + k + '"]');
      if (!px || px === document.activeElement) return;
      const n = p.n;
      if (px.hasAttribute('data-radio')) { px.setAttribute('aria-pressed', String(!!n.checked)); return; }
      if (px.classList.contains('lfs-pbtn')) { const ap = n.getAttribute('aria-pressed'); if (ap) px.setAttribute('aria-pressed', ap); px.classList.toggle('on', n.classList.contains('on') || n.classList.contains('active')); px.disabled = n.disabled; return; }
      if (px.type === 'checkbox') { if (px.checked !== n.checked) px.checked = n.checked; }
      else {
        if (n.tagName === 'SELECT' && px.options.length !== n.options.length) px.innerHTML = n.innerHTML.replace(/\sid="[^"]*"/g, '');
        if (px.value !== n.value) px.value = n.value;
        const o = px.parentElement.querySelector('output'); if (o) o.textContent = n.value;
      }
      px.disabled = n.disabled;
    });
  }

  /* ----- acoplar el editor ✎ y el panel de estilo de la app ----- */
  const DOCKS = [
    {
      id: 'figedit', icon: 'pencil', title: () => T('Edición fina de esta figura (✎ de la app)', 'Fine editing of this figure (the app’s ✎)'),
      ok: () => !!(window.FigEdit && typeof window.FigEdit.show === 'function' && ST.el && ST.el.tagName.toLowerCase() === 'svg' && (ST.el.id || window.FigEdit.__labg)),
      open: anchor => { window.FigEdit.show(anchor, ST.el); return document.getElementById('figEditPanel') || $('.fe-panel'); },
      close: () => { try { window.FigEdit.hide(); } catch (e) { /* nada */ } },
    },
    {
      id: 'figstyle', icon: 'palette', title: () => T('Estilo de todas las figuras (de la app)', 'Style of every figure (the app’s)'),
      ok: () => !!(window.FigStyle && typeof window.FigStyle.show === 'function' && typeof window.FigStyle.hide === 'function'),
      open: () => { window.FigStyle.show(); return document.getElementById('figStylePanel') || $('.fs-panel'); },
      close: () => { try { window.FigStyle.hide(); } catch (e) { /* nada */ } },
    },
  ];
  ST.docked = [];
  function dock(on) {
    if (!on) {
      ST.docked.forEach(d => {
        try {
          d.panel.classList.remove('lfs-docked');
          if (d.next && d.next.parentNode === d.parent) d.parent.insertBefore(d.panel, d.next); else d.parent.appendChild(d.panel);
          d.def.close();
        } catch (e) { /* nada */ }
      });
      ST.docked = [];
      return;
    }
    const box = $('.lfs-docks', body);
    if (!box) return;
    DOCKS.forEach(def => {
      try {
        if (!def.ok()) return;
        const openS = ST.secsOpen['dock-' + def.id] !== false;
        const sec = mk('section', 'lfs-sec lfs-dock');
        sec.setAttribute('data-sec', 'dock-' + def.id);
        sec.innerHTML = '<h3 class="lfs-sec-h"><button type="button" class="lfs-sec-btn" aria-expanded="' + openS + '">' + ico(def.icon) + '<span>' + esc(def.title()) + '</span>' + ico('chevron-down', 'lfs-chev') + '</button></h3><div class="lfs-sec-b"' + (openS ? '' : ' hidden') + '></div>';
        box.appendChild(sec);
        const panel = def.open(sec);
        if (!panel) { sec.remove(); return; }
        const d = { def, panel, parent: panel.parentNode, next: panel.nextSibling };
        panel.classList.add('lfs-docked');
        $('.lfs-sec-b', sec).appendChild(panel);
        ST.docked.push(d);
      } catch (e) { console.error('LABG Estudio: no se pudo acoplar ' + def.id, e); }
    });
  }

  /* ----- paleta y daltonismo ----- */
  function renderPalette() {
    const b = secB('palette');
    if (!b) return;
    const C = ST.el && ST.el.tagName.toLowerCase() === 'svg' ? seriesColors(ST.el) : [];
    b.innerHTML = '<div class="lfs-pals" role="radiogroup" aria-label="' + esc(T('Paleta', 'Palette')) + '">' + PALETTES.map(p => '<button type="button" class="lfs-pal" role="radio" data-pal="' + p.id + '" aria-checked="' + (ST.fig.pal === p.id) + '" title="' + esc(p.note ? TT(p.note) : '') + '">' +
      '<span class="lfs-strip">' + (p.c.length ? p.c.slice(0, 8).map(c => '<i style="background:' + c + '"></i>').join('') : C.slice(0, 8).map(c => '<i style="background:' + c + '"></i>').join('') || '<i></i>') + '</span><span class="lfs-pal-n">' + esc(TT(p.name)) + (p.cvd ? ' ' + ico('eye', 'lfs-mini') : '') + '</span></button>').join('') + '</div>' +
      '<p class="lfs-note">' + esc(C.length ? T('Esta figura usa ' + C.length + ' colores de serie; la paleta los cambia en el mismo orden.', 'This figure uses ' + C.length + ' series colours; the palette replaces them in the same order.') : T('No se encontraron colores de serie que cambiar.', 'No series colours were found to change.')) + '</p>' +
      row(T('Ver como con…', 'View as with…'), '<select data-st="cvd"><option value="">' + esc(T('Visión típica', 'Typical vision')) + '</option>' + Object.keys(CVD).map(k => '<option value="' + k + '"' + (ST.cvd === k ? ' selected' : '') + '>' + esc(T(CVD[k][0], CVD[k][1])) + '</option>').join('') + '</select>', 'lfs-r-select') +
      '<p class="lfs-note lfs-note-s">' + esc(T('La simulación solo cambia la vista: no se exporta.', 'The simulation only changes the view: it is not exported.')) + '</p>';
  }
  /* ----- texto y líneas ----- */
  function renderText() {
    const b = secB('text');
    if (!b) return;
    const st = ST.fig;
    b.innerHTML = row(T('Familia tipográfica', 'Font family'), '<select data-st="font">' + FONTS.map(f => '<option value="' + f[0] + '"' + (st.font === f[0] ? ' selected' : '') + '>' + esc(TT(f[1])) + '</option>').join('') + '</select>', 'lfs-r-select') +
      row(T('Tamaño de los textos', 'Text size'), '<input type="range" data-st="txt" min="0.5" max="3" step="0.05" value="' + st.txt + '"><output>' + Math.round(st.txt * 100) + '%</output>', 'lfs-r-range') +
      row(T('Grosor de las líneas', 'Line weight'), '<input type="range" data-st="line" min="0.3" max="3" step="0.05" value="' + st.line + '"><output>' + st.line.toFixed(2) + '×</output>', 'lfs-r-range') +
      '<div class="lfs-pt"></div>' +
      '<p class="lfs-note">' + esc(T('Doble clic sobre un texto de la figura para cambiarlo ahí mismo.', 'Double-click a text on the figure to change it in place.')) + '</p>' +
      (Object.keys(st.texts || {}).length ? '<div class="lfs-row lfs-r-btn"><button type="button" class="lfs-pbtn" data-st="texts-reset">' + ico('rotate-ccw') + esc(T('Volver a los textos originales', 'Back to the original texts')) + '</button></div>' : '') +
      '<div class="lfs-row lfs-r-btn"><button type="button" class="lfs-pbtn" data-st="fig-reset">' + ico('rotate-ccw') + esc(T('Quitar todo lo del estudio en esta figura', 'Remove every studio change on this figure')) + '</button></div>';
  }
  /* ----- tamaño y exportación ----- */
  function renderSize() {
    const b = secB('size');
    if (!b) return;
    const E = ST.exp, u = E.unit;
    const wv = fmtN(E.w, u === 'in' ? 2 : 1);
    const isVec = E.fmt === 'svg';
    const lib = ST.rec.lib;
    b.innerHTML =
      row(T('Formato', 'Format'), '<div class="lfs-seg" role="radiogroup">' + ['png', 'svg', 'pdf', 'tiff'].map(f => '<button type="button" data-exp="fmt" data-v="' + f + '" aria-pressed="' + (E.fmt === f) + '"' + (f === 'svg' && lib !== 'svg' ? ' title="' + esc(T('Esta figura es una imagen: el SVG la lleva incrustada', 'This figure is an image: the SVG carries it embedded')) + '"' : '') + '>' + f.toUpperCase() + '</button>').join('') + '</div>', 'lfs-r-seg') +
      row(T('Ancho', 'Width'), '<div class="lfs-seg lfs-seg-w">' + WIDTHS.map(([mm, nm]) => '<button type="button" data-exp="wmm" data-v="' + mm + '" aria-pressed="' + (Math.abs(expW() - mm) < 0.5) + '" title="' + esc(TT(nm)) + '">' + mm + '</button>').join('') + '</div>' +
        '<input type="number" data-exp="w" min="' + (u === 'in' ? 0.5 : 10) + '" max="' + (u === 'in' ? 40 : 1000) + '" step="' + (u === 'in' ? 0.01 : 0.5) + '" value="' + wv + '"><select data-exp="unit"><option value="mm"' + (u === 'mm' ? ' selected' : '') + '>mm</option><option value="in"' + (u === 'in' ? ' selected' : '') + '>in</option></select>', 'lfs-r-w') +
      row(T('Alto', 'Height'), '<label class="lfs-inl"><input type="checkbox" data-exp="hauto"' + (E.h ? '' : ' checked') + '>' + esc(T('el de la figura', 'the figure’s')) + '</label><input type="number" data-exp="h" step="' + (u === 'in' ? 0.01 : 0.5) + '" value="' + fmtN(u === 'in' ? expH() / MM_IN : expH(), u === 'in' ? 2 : 1) + '"' + (E.h ? '' : ' disabled') + '>', 'lfs-r-h') +
      row(T('Resolución', 'Resolution'), '<div class="lfs-seg">' + [300, 600, 1200].map(d => '<button type="button" data-exp="dpi" data-v="' + d + '" aria-pressed="' + (E.dpi === d) + '"' + (isVec ? ' disabled' : '') + '>' + d + '</button>').join('') + '</div><small class="lfs-unit">' + esc(T('ppp', 'dpi')) + '</small>', 'lfs-r-seg') +
      row(T('Fondo', 'Background'), '<div class="lfs-seg">' + [['white', ['Blanco', 'White']], ['screen', ['Como se ve', 'As shown']], ['none', ['Transparente', 'Transparent']]].map(([v, n]) => '<button type="button" data-exp="bg" data-v="' + v + '" aria-pressed="' + (E.bg === v) + '">' + esc(TT(n)) + '</button>').join('') + '</div>', 'lfs-r-seg') +
      '<div class="lfs-readout"></div>' +
      (lib !== 'svg' ? '<p class="lfs-note">' + esc(T('Esta figura es una imagen de píxeles: exportarla a más ppp no agrega detalle. Para más resolución usa la descarga de la app.', 'This figure is a pixel image: exporting it at a higher dpi adds no detail. For more resolution use the app’s own download.')) + '</p>' : '') +
      '<div class="lfs-actions"><button type="button" class="lfs-btn lfs-btn-pri" data-a="export">' + ico('download') + esc(T('Exportar', 'Export')) + '</button><button type="button" class="lfs-btn" data-a="copy">' + ico('copy') + esc(T('Copiar imagen', 'Copy image')) + '</button><button type="button" class="lfs-btn" data-a="real">' + ico('ruler') + esc(T('Ver a tamaño real', 'View at real size')) + '</button></div>';
    readout();
  }
  const darkTheme = () => { const t = document.documentElement.getAttribute('data-theme'); return t === 'dark' || (t !== 'light' && !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches)); };
  /* el texto más chico, en puntos, al tamaño de salida */
  function minPt(svg) {
    if (!svg || svg.tagName.toLowerCase() !== 'svg') return null;
    const vb = svg.viewBox && svg.viewBox.baseVal;
    const vw = vb && vb.width ? vb.width : svg.getBoundingClientRect().width;
    if (!vw) return null;
    let m = Infinity;
    $$('text', svg).forEach(t => {
      if (!t.textContent.trim()) return;
      const cs = getComputedStyle(t);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const fs = parseFloat(cs.fontSize);
      if (fs > 0 && fs < m) m = fs;
    });
    return m === Infinity ? null : m * (expW() / vw) * PT_MM;
  }
  function readout() {
    if (!ST.open) return;
    const r = $('.lfs-readout', body);
    const pt = minPt(ST.el);
    const px = expPx();
    const big = px.w * px.h > 150e6 || px.w > 16000 || px.h > 16000;
    if (r) {
      r.innerHTML = '<b>' + esc(fmtSize()) + '</b>' +
        (pt != null ? '<span class="' + (pt < 6 ? 'lfs-warn' : 'lfs-ok') + '">' + ico(pt < 6 ? 'info' : 'check') + esc(T('Texto más chico: ', 'Smallest text: ') + pt.toFixed(1) + ' pt' + (pt < 6 ? T(' — las revistas suelen pedir 6 a 8 pt; sube el tamaño del texto o usa un preajuste', ' — journals usually ask for 6 to 8 pt; raise the text size or use a preset') : '')) + '</span>' : '') +
        (darkTheme() && ST.exp.bg === 'white' ? '<span class="lfs-warn">' + ico('info') + esc(T('La app está en tema oscuro: sus figuras usan colores claros. Para fondo blanco, cámbiala a tema claro o elige «Como se ve».', 'The app is in dark theme: its figures use light colours. For a white background, switch it to light theme or choose “As shown”.')) + '</span>' : '') +
        (big && ST.exp.fmt !== 'svg' ? '<span class="lfs-warn">' + ico('info') + esc(T('Muy grande para el navegador: baja los ppp o el tamaño.', 'Too large for the browser: lower the dpi or the size.')) + '</span>' : '');
    }
    const p = $('.lfs-pt', body);
    if (p) p.innerHTML = pt != null ? '<span class="' + (pt < 6 ? 'lfs-warn' : 'lfs-ok') + '">' + esc(T('Al tamaño de salida, el texto más chico mide ', 'At the output size, the smallest text measures ') + pt.toFixed(1) + ' pt') + '</span>' : '';
    const info = $('.lfs-info', stage);
    if (info) info.textContent = (ADAPTERS[ST.rec.lib].styles ? T('Clic en la figura: su sección · Doble clic en un texto: cambiarlo · ', 'Click the figure: its section · Double-click a text: change it · ') : '') + T('Ctrl + rueda: zoom · B: antes y ahora · ?: atajos', 'Ctrl + wheel: zoom · B: before and now · ?: shortcuts');
    guides(ST.paper || { left: 0, top: 0, width: 0, height: 0 }, ST.zoomNow || 1);
  }
  /* ----- preajustes ----- */
  function presetCard(p, custom) {
    return '<div class="lfs-preset"><button type="button" class="lfs-preset-go" data-preset="' + esc(p.id) + '"><b>' + esc(TT(p.name)) + '</b><small>' + esc(p.desc ? TT(p.desc) : describe(p)) + '</small></button>' +
      (custom ? '<button type="button" class="lfs-x" data-del="' + esc(p.id) + '" title="' + esc(T('Borrar este preajuste', 'Delete this preset')) + '" aria-label="' + esc(T('Borrar el preajuste ', 'Delete the preset ') + TT(p.name)) + '">' + ico('trash-2') + '</button>' : '') + '</div>';
  }
  function describe(p) {
    const parts = [];
    if (p.w) parts.push(fmtN(p.w, 1) + ' mm');
    if (p.dpi) parts.push(p.dpi + ' ' + T('ppp', 'dpi'));
    if (p.fmt) parts.push(p.fmt.toUpperCase());
    if (p.txt && p.txt !== 1) parts.push(T('texto ', 'text ') + Math.round(p.txt * 100) + '%');
    if (p.pal) { const P = PALETTES.find(x => x.id === p.pal); if (P) parts.push(TT(P.name)); }
    return parts.join(' · ');
  }
  function renderPresets() {
    const b = secB('presets');
    if (!b) return;
    b.innerHTML = '<div class="lfs-presets">' + PRESETS.map(p => presetCard(p)).join('') + '</div>' +
      '<h4>' + esc(T('Tus preajustes', 'Your presets')) + '</h4>' +
      (ST.presets.length ? '<div class="lfs-presets">' + ST.presets.map(p => presetCard(p, true)).join('') + '</div>' : '<p class="lfs-note">' + esc(T('Guarda aquí los ajustes que uses seguido.', 'Save here the settings you use often.')) + '</p>') +
      '<div class="lfs-actions"><button type="button" class="lfs-btn" data-a="psave">' + ico('bookmark-plus') + esc(T('Guardar los ajustes actuales', 'Save the current settings')) + '</button>' +
      '<button type="button" class="lfs-btn" data-a="pexport"' + (ST.presets.length ? '' : ' disabled') + '>' + ico('file-json') + esc(T('Exportar JSON', 'Export JSON')) + '</button>' +
      '<button type="button" class="lfs-btn" data-a="pimport">' + ico('upload') + esc(T('Importar JSON', 'Import JSON')) + '</button></div>';
    const m = $('.lfs-menu', studio);
    m.innerHTML = PRESETS.concat(ST.presets).map(p => '<button type="button" role="menuitem" data-preset="' + esc(p.id) + '"><b>' + esc(TT(p.name)) + '</b><small>' + esc(p.desc ? TT(p.desc) : describe(p)) + '</small></button>').join('');
  }
  /* ----- historial ----- */
  function renderHistory() {
    const b = secB('history');
    if (!b) return;
    if (!ST.hist.length) { b.innerHTML = '<p class="lfs-note">' + esc(T('Aquí aparece cada cambio; haz clic en uno para volver a ese punto.', 'Every change appears here; click one to go back to that point.')) + '</p>'; return; }
    b.innerHTML = '<ol class="lfs-hist">' + '<li><button type="button" data-hist="-1" aria-current="' + (ST.hi === -1) + '">' + esc(T('Al abrir el estudio', 'When the studio opened')) + '</button></li>' +
      ST.hist.map((h, i) => '<li class="' + (i > ST.hi ? 'is-undone' : '') + '"><button type="button" data-hist="' + i + '" aria-current="' + (i === ST.hi) + '"><span>' + esc(h.label) + '</span><time>' + h.t + '</time></button></li>').join('') + '</ol>';
    const cur = b.querySelector('[aria-current="true"]'); if (cur) cur.scrollIntoView({ block: 'nearest' });
  }

  /* ---------------- historial: deshacer y rehacer ---------------- */
  function record(label, undo, redo) {
    ST.hist = ST.hist.slice(0, ST.hi + 1);
    const d = new Date();
    ST.hist.push({ label, undo, redo, t: d.toTimeString().slice(0, 8) });
    if (ST.hist.length > 300) ST.hist.shift();
    ST.hi = ST.hist.length - 1;
    renderHistory(); paintUndo();
  }
  function undo() { if (ST.hi < 0) return; const h = ST.hist[ST.hi--]; h.undo(); renderHistory(); paintUndo(); say(T('Deshecho: ', 'Undone: ') + h.label); ring(); }
  function redo() { if (ST.hi >= ST.hist.length - 1) return; const h = ST.hist[++ST.hi]; h.redo(); renderHistory(); paintUndo(); say(T('Rehecho: ', 'Redone: ') + h.label); ring(); }
  function jump(k) { let n = 0; while (ST.hi > k && n++ < 400) undo(); while (ST.hi < k && n++ < 800) redo(); }
  function paintUndo() {
    const u = $('[data-a="undo"]', studio), r = $('[data-a="redo"]', studio);
    if (u) u.disabled = ST.hi < 0;
    if (r) r.disabled = ST.hi >= ST.hist.length - 1;
  }

  /* ---------------- cambios del estudio ---------------- */
  function setFig(next, label) {
    const before = JSON.parse(JSON.stringify(ST.fig));
    const after = Object.assign(JSON.parse(JSON.stringify(ST.fig)), next);
    const put = st => { ST.fig = JSON.parse(JSON.stringify(st)); setFigState(ST.rec.key, ST.fig); if (ST.el && ADAPTERS[ST.rec.lib].styles) styleSvg(ST.el, ST.fig); refreshStudioSecs(); readout(); emitChange(); };
    put(after);
    if (label) record(label, () => put(before), () => put(after));
    ring();
  }
  function refreshStudioSecs() {
    const p = secB('palette'); if (p) $$('.lfs-pal', p).forEach(b => b.setAttribute('aria-checked', String(b.dataset.pal === ST.fig.pal)));
    const t = secB('text');
    if (t) {
      const f = t.querySelector('[data-st="font"]'); if (f && f !== document.activeElement) f.value = ST.fig.font;
      const x = t.querySelector('[data-st="txt"]'); if (x && x !== document.activeElement) { x.value = ST.fig.txt; x.nextElementSibling.textContent = Math.round(ST.fig.txt * 100) + '%'; }
      const l = t.querySelector('[data-st="line"]'); if (l && l !== document.activeElement) { l.value = ST.fig.line; l.nextElementSibling.textContent = ST.fig.line.toFixed(2) + '×'; }
    }
  }
  function setExp(next, label) {
    const before = Object.assign({}, ST.exp);
    const after = Object.assign({}, ST.exp, next);
    const put = e => { ST.exp = Object.assign({}, e); save('exp', ST.exp); renderSize(); place(); readout(); emitChange(); };
    put(after);
    if (label) record(label, () => put(before), () => put(after));
  }
  function emitChange() {
    const st = { key: ST.rec && ST.rec.key, figure: Object.assign({}, ST.fig), export: Object.assign({}, ST.exp) };
    if (ST.rec && ST.rec.opts && typeof ST.rec.opts.onChange === 'function') { try { ST.rec.opts.onChange(st); } catch (e) { console.error(e); } }
    document.dispatchEvent(new CustomEvent('labg-figure-studio:change', { detail: st }));
  }
  function setCvd(k) {
    ST.cvd = k;
    if (ST.lift) { ['p', 'd', 't', 'a'].forEach(x => ST.lift.classList.toggle('lfs-cvd-' + x, x === k)); }
    say(k ? T('Vista simulada: ', 'Simulated view: ') + T(CVD[k][0], CVD[k][1]) : T('Visión típica', 'Typical vision'));
  }
  function applyPreset(id) {
    const p = PRESETS.concat(ST.presets).find(x => x.id === id);
    if (!p) return;
    const beforeE = Object.assign({}, ST.exp), beforeF = JSON.parse(JSON.stringify(ST.fig));
    const e = Object.assign({}, ST.exp);
    if (p.w) { e.w = e.unit === 'in' ? +(p.w / MM_IN).toFixed(2) : p.w; e.h = 0; }
    if (p.dpi) e.dpi = p.dpi;
    if (p.fmt) e.fmt = p.fmt;
    if (p.bg) e.bg = p.bg;
    const f = Object.assign({}, ST.fig);
    if (p.pal != null) f.pal = p.pal;
    if (p.font != null) f.font = p.font;
    if (p.line) f.line = p.line;
    if (p.txt) f.txt = p.txt;
    ST.exp = e;
    if (p.minPt && ST.el && ADAPTERS[ST.rec.lib].styles) {
      /* el tamaño del texto que deja el más chico en minPt al tamaño de salida */
      const was = ST.fig.txt;
      styleSvg(ST.el, Object.assign({}, f, { txt: 1 }));
      const pt = minPt(ST.el);
      if (pt) f.txt = clamp(Math.round(Math.max(1, p.minPt / pt) * 20) / 20, 0.5, 3);
      else f.txt = was;
    }
    const afterE = Object.assign({}, e), afterF = JSON.parse(JSON.stringify(f));
    const put = (E, F) => { ST.exp = Object.assign({}, E); save('exp', ST.exp); ST.fig = JSON.parse(JSON.stringify(F)); setFigState(ST.rec.key, ST.fig); if (ST.el && ADAPTERS[ST.rec.lib].styles) styleSvg(ST.el, ST.fig); renderSize(); renderText(); refreshStudioSecs(); place(); readout(); emitChange(); };
    put(afterE, afterF);
    record(T('Preajuste: ', 'Preset: ') + TT(p.name), () => put(beforeE, beforeF), () => put(afterE, afterF));
    ring();
    say(T('Preajuste aplicado: ', 'Preset applied: ') + TT(p.name));
  }
  function savePreset() {
    const name = window.prompt(T('Nombre del preajuste:', 'Preset name:'), T('Mi preajuste', 'My preset'));
    if (!name) return;
    const p = { id: 'u' + Date.now().toString(36), name: name.slice(0, 60), w: +expW().toFixed(1), dpi: ST.exp.dpi, fmt: ST.exp.fmt, bg: ST.exp.bg, pal: ST.fig.pal, font: ST.fig.font, txt: ST.fig.txt, line: ST.fig.line };
    ST.presets.push(p); save('presets', ST.presets); renderPresets();
    say(T('Preajuste guardado: ', 'Preset saved: ') + name);
  }
  function exportPresets() {
    const data = { labgFigureStudio: VERSION, app: APP, presets: ST.presets };
    download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'labg-preajustes-' + APP + '.json');
  }
  function importPresets() {
    const inp = mk('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.addEventListener('change', () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      f.text().then(t => {
        let d = null; try { d = JSON.parse(t); } catch (e) { d = null; }
        const list = d && Array.isArray(d.presets) ? d.presets : (Array.isArray(d) ? d : null);
        if (!list) { say(T('El archivo no tiene preajustes del estudio.', 'The file has no studio presets.')); return; }
        let n = 0;
        list.forEach(p => {
          if (!p || typeof p.name !== 'string') return;
          const q = { id: 'u' + Date.now().toString(36) + n, name: p.name.slice(0, 60) };
          if (+p.w > 0 && +p.w < 2000) q.w = +p.w;
          if ([150, 192, 240, 300, 600, 900, 1200].indexOf(+p.dpi) >= 0) q.dpi = +p.dpi;
          if (['png', 'svg', 'pdf', 'tiff'].indexOf(p.fmt) >= 0) q.fmt = p.fmt;
          if (['white', 'screen', 'none'].indexOf(p.bg) >= 0) q.bg = p.bg;
          if (PALETTES.some(x => x.id === p.pal)) q.pal = p.pal;
          if (FONTS.some(x => x[0] === p.font)) q.font = p.font;
          if (+p.txt >= 0.5 && +p.txt <= 3) q.txt = +p.txt;
          if (+p.line >= 0.3 && +p.line <= 3) q.line = +p.line;
          if (+p.minPt > 0 && +p.minPt < 60) q.minPt = +p.minPt;
          ST.presets.push(q); n++;
        });
        save('presets', ST.presets); renderPresets();
        say(T(n + ' preajustes importados', n + ' presets imported'));
      });
    });
    inp.click();
  }

  /* ---------------- eventos del inspector ---------------- */
  function onInspClick(e) {
    const sb = e.target.closest('.lfs-sec-btn');
    if (sb) {
      const sec = sb.closest('.lfs-sec'), b = sec.querySelector('.lfs-sec-b');
      const opened = b.hidden;
      b.hidden = !opened; sb.setAttribute('aria-expanded', String(opened));
      ST.secsOpen[sec.dataset.sec] = opened; save('secs', ST.secsOpen);
      return;
    }
    const pal = e.target.closest('[data-pal]');
    if (pal) { const P = PALETTES.find(p => p.id === pal.dataset.pal); setFig({ pal: pal.dataset.pal }, T('Paleta: ', 'Palette: ') + TT(P.name)); return; }
    const ex = e.target.closest('[data-exp][data-v]');
    if (ex) {
      const k = ex.dataset.exp, v = ex.dataset.v;
      if (k === 'fmt') setExp({ fmt: v }, T('Formato: ', 'Format: ') + v.toUpperCase());
      else if (k === 'dpi') setExp({ dpi: +v }, v + ' ' + T('ppp', 'dpi'));
      else if (k === 'bg') setExp({ bg: v }, T('Fondo: ', 'Background: ') + ex.textContent);
      else if (k === 'wmm') setExp({ w: ST.exp.unit === 'in' ? +(+v / MM_IN).toFixed(2) : +v, h: 0 }, T('Ancho: ', 'Width: ') + v + ' mm');
      return;
    }
    const pg = e.target.closest('[data-preset]');
    if (pg) { applyPreset(pg.dataset.preset); return; }
    const del = e.target.closest('[data-del]');
    if (del) { ST.presets = ST.presets.filter(p => p.id !== del.dataset.del); save('presets', ST.presets); renderPresets(); return; }
    const hi = e.target.closest('[data-hist]');
    if (hi) { jump(+hi.dataset.hist); return; }
    const sst = e.target.closest('[data-st="fig-reset"]');
    if (sst) { setFig(blankFig(), T('Quitar lo del estudio', 'Remove the studio changes')); renderText(); return; }
    const tr = e.target.closest('[data-st="texts-reset"]');
    if (tr) { setFig({ texts: {} }, T('Textos originales', 'Original texts')); renderText(); return; }
    const pb = e.target.closest('.lfs-pbtn[data-k], [data-radio]');
    if (pb) {
      const p = ST.proxies[+pb.dataset.k];
      if (p && p.n.isConnected) { p.n.click(); ring(); setTimeout(() => syncProxies(), 60); }
      return;
    }
    const a = e.target.closest('[data-a]');
    if (a && body.contains(a)) toolbar(a.dataset.a);
  }
  const startVal = new WeakMap();
  function proxyWrite(px, commit) {
    const p = ST.proxies[+px.dataset.k];
    if (!p || !p.n.isConnected) return;
    const n = p.n;
    if (px.type === 'checkbox') {
      if (n.checked !== px.checked) {
        const was = n.checked;
        n.click();
        const lab = labelFor(n);
        record(lab + ': ' + (px.checked ? T('sí', 'on') : T('no', 'off')), () => { if (n.isConnected && n.checked !== was) n.click(); }, () => { if (n.isConnected && n.checked === was) n.click(); });
        ring();
      }
      return;
    }
    if (!startVal.has(px)) startVal.set(px, n.value);
    if (n.value !== px.value) {
      n.value = px.value;
      fire(n, ['input']);
      const o = px.parentElement.querySelector('output'); if (o) o.textContent = px.value;
    }
    if (commit) {
      fire(n, ['change']);
      const before = startVal.get(px), after = px.value;
      startVal.delete(px);
      if (before !== after) {
        const lab = labelFor(n);
        const set = v => { if (!n.isConnected) return; n.value = v; fire(n, ['input', 'change']); setTimeout(() => syncProxies(), 30); };
        record(lab + ': ' + (n.tagName === 'SELECT' && n.selectedOptions[0] ? n.selectedOptions[0].textContent.trim() : after), () => set(before), () => set(after));
      }
      ring();
    }
  }
  const textTimers = new WeakMap();
  function onInspInput(e) {
    const t = e.target;
    if (t.dataset.k != null) {
      if (t.type === 'range' || t.type === 'color') { if (!t._q) { t._q = true; raf(() => { t._q = false; proxyWrite(t, false); }); } }
      else if (t.type === 'text' || t.type === 'search' || t.tagName === 'TEXTAREA' || t.type === 'number') { clearTimeout(textTimers.get(t)); textTimers.set(t, setTimeout(() => proxyWrite(t, false), 150)); }
      return;
    }
    if (t.dataset.st === 'txt' || t.dataset.st === 'line') {
      const v = +t.value;
      t.nextElementSibling.textContent = t.dataset.st === 'txt' ? Math.round(v * 100) + '%' : v.toFixed(2) + '×';
      if (!startVal.has(t)) startVal.set(t, ST.fig[t.dataset.st]);
      if (!t._q) { t._q = true; raf(() => { t._q = false; ST.fig[t.dataset.st] = +t.value; if (ST.el) styleSvg(ST.el, ST.fig); readout(); }); }
    }
  }
  function onInspChange(e) {
    const t = e.target;
    if (t.dataset.k != null) { clearTimeout(textTimers.get(t)); proxyWrite(t, true); return; }
    const st = t.dataset.st, ex = t.dataset.exp;
    if (st === 'cvd') { setCvd(t.value); return; }
    if (st === 'font') { const F = FONTS.find(f => f[0] === t.value); setFig({ font: t.value }, T('Letra: ', 'Font: ') + TT(F[1])); return; }
    if (st === 'txt' || st === 'line') {
      const before = startVal.has(t) ? startVal.get(t) : ST.fig[st]; startVal.delete(t);
      ST.fig[st] = before;
      setFig({ [st]: +t.value }, (st === 'txt' ? T('Tamaño del texto: ', 'Text size: ') + Math.round(+t.value * 100) + '%' : T('Grosor de líneas: ', 'Line weight: ') + (+t.value).toFixed(2) + '×'));
      return;
    }
    if (ex === 'w') { const v = parseFloat(t.value); if (v > 0) setExp({ w: v }, T('Ancho: ', 'Width: ') + v + ' ' + ST.exp.unit); return; }
    if (ex === 'h') { const v = parseFloat(t.value); if (v > 0) setExp({ h: v }, T('Alto: ', 'Height: ') + v + ' ' + ST.exp.unit); return; }
    if (ex === 'hauto') { setExp({ h: t.checked ? 0 : +(ST.exp.unit === 'in' ? expH() / MM_IN : expH()).toFixed(2) }, t.checked ? T('Alto automático', 'Automatic height') : T('Alto propio', 'Own height')); return; }
    if (ex === 'unit') {
      const u = t.value, f = u === 'in' ? 1 / MM_IN : MM_IN;
      if (u === ST.exp.unit) return;
      setExp({ unit: u, w: +(ST.exp.w * f).toFixed(u === 'in' ? 2 : 1), h: ST.exp.h ? +(ST.exp.h * f).toFixed(u === 'in' ? 2 : 1) : 0 }, T('Unidades: ', 'Units: ') + u);
    }
  }
  /* al pasar sobre un control, se resalta lo que cambia en la figura */
  function onInspHover(e) {
    const t = e.target;
    if (!ST.el || ST.el.tagName.toLowerCase() !== 'svg') return;
    if (t.closest('[data-pal]') || t.closest('.lfs-sec[data-sec="palette"]')) { hilite('series'); return; }
    if (t.closest('[data-st="txt"], [data-st="font"]')) { hilite('text'); return; }
    if (t.closest('[data-st="line"]')) { hilite('lines'); return; }
    if (t.closest('.lfs-sec[data-sec="app"] .lfs-row')) { hilite('all'); return; }
    hilite(null);
  }
  let hiKind = null;
  function hilite(kind) {
    if (kind === hiKind) return;
    hiKind = kind;
    if (!ST.el) return;
    selfMut = true;
    $$('.lfs-hl-el', ST.el).forEach(n => n.classList.remove('lfs-hl-el'));
    $('.lfs-ring', over).classList.toggle('hl', kind === 'all');
    if (kind === 'text') $$('text', ST.el).forEach(n => n.classList.add('lfs-hl-el'));
    else if (kind === 'lines' || kind === 'series') {
      const C = kind === 'series' ? new Set(seriesColors(ST.el)) : null;
      $$(SHAPES, ST.el).forEach(n => {
        const cs = getComputedStyle(n);
        if (kind === 'lines' ? (cs.stroke !== 'none' && hexOf(cs.stroke)) : (C.has(hexOf(cs.fill)) || C.has(hexOf(cs.stroke)))) n.classList.add('lfs-hl-el');
      });
    }
    if (figMo) figMo.takeRecords();
    selfMut = false;
  }

  /* buscador de controles */
  function filter(q) {
    const words = fold(q).split(/\s+/).filter(Boolean);
    $$('.lfs-sec', body).forEach(sec => {
      const head = fold(sec.querySelector('.lfs-sec-btn').textContent);
      let any = false;
      $$('.lfs-row, .lfs-pal, .lfs-preset, .lfs-grp h4', sec).forEach(r => {
        const ok = !words.length || words.every(w => fold(r.textContent).indexOf(w) >= 0 || head.indexOf(w) >= 0);
        if (r.matches('.lfs-grp h4')) return;
        r.classList.toggle('lfs-nomatch', !ok);
        if (ok) any = true;
      });
      if (sec.classList.contains('lfs-dock')) any = !words.length || words.every(w => fold(sec.textContent).indexOf(w) >= 0);
      const okSec = !words.length || any || words.every(w => head.indexOf(w) >= 0);
      sec.hidden = !okSec;
      if (words.length && okSec) { const b = sec.querySelector('.lfs-sec-b'); b.hidden = false; sec.querySelector('.lfs-sec-btn').setAttribute('aria-expanded', 'true'); }
      $$('.lfs-grp', sec).forEach(g => { g.hidden = words.length > 0 && !$$('.lfs-row', g).some(r => !r.classList.contains('lfs-nomatch')); });
    });
  }

  /* ---------------- barra de herramientas ---------------- */
  function onToolbar(e) {
    const b = e.target.closest('.lfs-bar [data-a], .lfs-insp-head [data-a]');
    if (b) { toolbar(b.dataset.a, b); return; }
    const mi = e.target.closest('.lfs-menu [data-preset]');
    if (mi) { closeMenu(); applyPreset(mi.dataset.preset); return; }
    if (!e.target.closest('.lfs-menuwrap')) closeMenu();
  }
  function toolbar(a, btn) {
    switch (a) {
      case 'close': close(); break;
      case 'undo': undo(); break;
      case 'redo': redo(); break;
      case 'compare': toggleCompare(); break;
      case 'zoomin': zoomBy(1.25); break;
      case 'zoomout': zoomBy(0.8); break;
      case 'fit': ST.zoom = 'fit'; ST.pan = { x: 0, y: 0 }; place(); break;
      case 'real': ST.zoom = 1; ST.pan = { x: 0, y: 0 }; place(); say(T('Tamaño real aproximado: depende de la pantalla', 'Approximate real size: it depends on the screen')); break;
      case 'presets': toggleMenu(btn); break;
      case 'export': doExport(); break;
      case 'copy': doCopy(); break;
      case 'lay-left': case 'lay-right': case 'lay-float': ST.layout = a.slice(4); save('layout', ST.layout); applyLayoutClass(); place(); break;
      case 'keys': keysHelp(); break;
      case 'sheet': ST.sheet = (ST.sheet + 1) % 3; applyLayoutClass(); place(); break;
      case 'psave': savePreset(); break;
      case 'pexport': exportPresets(); break;
      case 'pimport': importPresets(); break;
      default: break;
    }
  }
  function toggleMenu(btn) {
    const m = $('.lfs-menu', studio);
    const open = m.hidden;
    m.hidden = !open; btn.setAttribute('aria-expanded', String(open));
    if (open) { const f = m.querySelector('button'); if (f) f.focus(); }
  }
  function closeMenu() { const m = studio && $('.lfs-menu', studio); if (m && !m.hidden) { m.hidden = true; $('[data-a="presets"]', studio).setAttribute('aria-expanded', 'false'); } }
  function zoomBy(f) {
    const z = ST.zoom === 'fit' ? (ST.zoomNow || 1) : ST.zoom;
    ST.zoom = clamp(z * f, 0.1, 8);
    place();
  }

  /* ---------------- comparar antes y ahora ---------------- */
  function snapshotBefore() {
    ST.before = null;
    const el = ST.el;
    try {
      if (el.tagName.toLowerCase() === 'svg') {
        const s = serialize(el, { forView: true });
        ST.before = URL.createObjectURL(new Blob([s], { type: 'image/svg+xml' }));
      } else if (el.tagName === 'CANVAS') ST.before = el.toDataURL('image/png');
      else if (el.tagName === 'IMG') ST.before = el.currentSrc || el.src;
    } catch (e) { ST.before = null; }
    $('.lfs-before', over).src = ST.before || '';
  }
  function toggleCompare(on) {
    ST.compare = on == null ? !ST.compare : on;
    const cur = $('.lfs-curtain', over);
    cur.hidden = !ST.compare || !ST.before;
    $('[data-a="compare"]', studio).setAttribute('aria-pressed', String(ST.compare));
    if (ST.compare && !ST.before) say(T('No se pudo tomar la imagen de antes.', 'The before image could not be taken.'));
    place();
  }
  function paintCurtain() {
    const p = ST.curtain;
    const wrap = $('.lfs-before-wrap', over);
    wrap.style.width = p + '%';
    const im = $('.lfs-before', over);
    if (ST.paper) { im.style.width = ST.paper.width + 'px'; im.style.height = ST.paper.height + 'px'; }
    const h = $('.lfs-handle', over);
    h.style.left = p + '%';
    h.setAttribute('aria-valuenow', String(Math.round(p)));
    h.setAttribute('aria-valuetext', T('Antes a la izquierda, ', 'Before on the left, ') + Math.round(p) + '%');
  }
  function curtain() {
    const h = $('.lfs-handle', over), cur = $('.lfs-curtain', over);
    let drag = false;
    h.addEventListener('pointerdown', e => { drag = true; h.setPointerCapture(e.pointerId); e.preventDefault(); });
    h.addEventListener('pointermove', e => {
      if (!drag) return;
      const r = cur.getBoundingClientRect();
      ST.curtain = clamp((e.clientX - r.left) / r.width * 100, 0, 100);
      raf(paintCurtain);
    });
    h.addEventListener('pointerup', () => { drag = false; save('curtain', ST.curtain); });
    h.addEventListener('keydown', e => {
      const d = e.key === 'ArrowLeft' ? -5 : e.key === 'ArrowRight' ? 5 : e.key === 'Home' ? -100 : e.key === 'End' ? 100 : 0;
      if (!d) return;
      e.preventDefault(); ST.curtain = clamp(ST.curtain + d, 0, 100); paintCurtain(); save('curtain', ST.curtain);
    });
  }

  /* ---------------- la figura en el escenario: clic, doble clic y paneo ---------------- */
  function onFigDown(e) { ST.downAt = { x: e.clientX, y: e.clientY, t: Date.now() }; }
  function onFigClick(e) {
    if (!ST.open) return;
    const d = ST.downAt;
    if (d && (Math.abs(e.clientX - d.x) > 4 || Math.abs(e.clientY - d.y) > 4)) return;
    const t = e.target;
    /* un clic sobre la figura abre la sección que la cambia */
    if (t.closest && t.closest('text')) openSec('text');
    else if (t.closest && (t.closest(SHAPES) && ADAPTERS[ST.rec.lib].styles)) {
      const cs = getComputedStyle(t.closest(SHAPES));
      const C = seriesColors(ST.el);
      const h = hexOf(cs.fill) || hexOf(cs.stroke);
      if (h && C.indexOf(h) >= 0) openSec('palette'); else openSec('app');
    } else openSec('size');
  }
  function openSec(id) {
    const sec = $('.lfs-sec[data-sec="' + id + '"]', body) || $('.lfs-sec[data-sec="app"]', body);
    if (!sec) return;
    const b = sec.querySelector('.lfs-sec-b');
    if (b.hidden) { b.hidden = false; sec.querySelector('.lfs-sec-btn').setAttribute('aria-expanded', 'true'); }
    sec.classList.remove('lfs-pulse'); void sec.offsetWidth; sec.classList.add('lfs-pulse');
    const top = sec.offsetTop - 8;
    body.scrollTo({ top, behavior: reduced() ? 'auto' : 'smooth' });
  }
  function stagePointer() {
    let pan = null;
    stage.addEventListener('pointerdown', e => {
      if (e.target !== stage || ST.zoom === 'fit' && !e.shiftKey) return;
      pan = { x: e.clientX, y: e.clientY, px: ST.pan.x, py: ST.pan.y };
      stage.setPointerCapture(e.pointerId); stage.classList.add('panning');
    });
    stage.addEventListener('pointermove', e => { if (!pan) return; ST.pan = { x: pan.px + e.clientX - pan.x, y: pan.py + e.clientY - pan.y }; place(); });
    stage.addEventListener('pointerup', () => { pan = null; stage.classList.remove('panning'); });
    const wheel = e => {
      if (!ST.open) return;
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.1 : 0.9); return; }
      if (ST.zoom !== 'fit') { e.preventDefault(); ST.pan = { x: ST.pan.x - e.deltaX, y: ST.pan.y - e.deltaY }; place(); }
    };
    stage.addEventListener('wheel', wheel, { passive: false });
    over.addEventListener('wheel', wheel, { passive: false });
  }
  /* doble clic sobre un texto: se cambia ahí mismo */
  function onFigDbl(e) {
    const t = e.target.closest && e.target.closest('text');
    if (!t || !ADAPTERS[ST.rec.lib].styles || t.children.length) return;
    e.preventDefault();
    const r = t.getBoundingClientRect();
    const inp = $('.lfs-inplace', over);
    inp.hidden = false;
    const orig = t.getAttribute('data-lfs-t0') || t.textContent;
    inp.value = t.textContent;
    inp.dataset.orig = orig;
    const fs = parseFloat(getComputedStyle(t).fontSize) * (ST.paper ? ST.paper.width / (ST.el.viewBox.baseVal.width || ST.paper.width) : 1);
    Object.assign(inp.style, { left: Math.round(r.left - 6) + 'px', top: Math.round(r.top + r.height / 2 - Math.max(14, fs * 0.75) - 6) + 'px', width: Math.max(160, Math.round(r.width + 40)) + 'px', fontSize: clamp(fs, 12, 28) + 'px' });
    inp.setAttribute('aria-label', T('Nuevo texto (Enter para aplicar, Esc para cancelar)', 'New text (Enter to apply, Esc to cancel)'));
    inp.focus(); inp.select();
  }
  function inplace() {
    const inp = $('.lfs-inplace', over);
    const done = ok => {
      if (inp.hidden) return;
      inp.hidden = true;
      if (!ok) return;
      const o = inp.dataset.orig, v = inp.value;
      const texts = Object.assign({}, ST.fig.texts || {});
      if (v === o) delete texts[o]; else texts[o] = v;
      setFig({ texts }, T('Texto: «', 'Text: “') + (v.length > 30 ? v.slice(0, 30) + '…' : v) + T('»', '”'));
    };
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); done(true); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
    });
    inp.addEventListener('blur', () => done(true));
  }

  /* ---------------- inspector: ancho, flotante y hoja ---------------- */
  function splitter(sp) {
    let d = null;
    const setW = w => { ST.inspW = clamp(w, 320, 560); studio.style.setProperty('--lfs-insp-w', ST.inspW + 'px'); sp.setAttribute('aria-valuenow', String(Math.round(ST.inspW))); place(); };
    sp.setAttribute('aria-valuemin', '320'); sp.setAttribute('aria-valuemax', '560');
    sp.addEventListener('pointerdown', e => { d = { x: e.clientX, w: ST.inspW }; sp.setPointerCapture(e.pointerId); studio.classList.add('resizing'); });
    sp.addEventListener('pointermove', e => { if (!d) return; const dx = e.clientX - d.x; setW(ST.layout === 'left' ? d.w + dx : d.w - dx); });
    sp.addEventListener('pointerup', () => { if (!d) return; d = null; studio.classList.remove('resizing'); save('inspW', ST.inspW); });
    sp.addEventListener('keydown', e => {
      const k = e.key === 'ArrowLeft' ? -16 : e.key === 'ArrowRight' ? 16 : 0;
      if (!k) return;
      e.preventDefault(); setW(ST.inspW + (ST.layout === 'left' ? k : -k)); save('inspW', ST.inspW);
    });
  }
  function floatDrag() {
    const head = $('.lfs-insp-head', studio);
    let d = null;
    head.addEventListener('pointerdown', e => {
      if (ST.layout !== 'float' || e.target.closest('input, button:not(.lfs-grab)')) return;
      const r = insp.getBoundingClientRect();
      d = { x: e.clientX, y: e.clientY, l: r.left, t: r.top };
      head.setPointerCapture(e.pointerId);
    });
    head.addEventListener('pointermove', e => {
      if (!d) return;
      insp.style.left = clamp(d.l + e.clientX - d.x, 4, window.innerWidth - 120) + 'px';
      insp.style.top = clamp(d.t + e.clientY - d.y, 52, window.innerHeight - 60) + 'px';
    });
    head.addEventListener('pointerup', () => {
      if (!d) return; d = null;
      const r = insp.getBoundingClientRect();
      ST.float = { x: r.left, y: r.top, w: r.width, h: r.height }; save('float', ST.float);
    });
    if (window.ResizeObserver) new ResizeObserver(() => {
      if (ST.layout !== 'float' || !ST.open) return;
      const r = insp.getBoundingClientRect();
      if (r.width && r.height) { ST.float = { x: r.left, y: r.top, w: r.width, h: r.height }; save('float', ST.float); }
    }).observe(insp);
  }

  /* ---------------- teclado ---------------- */
  function onKey(e) {
    if (!ST.open) return;
    const k = e.key, ctrl = e.ctrlKey || e.metaKey;
    const inStudio = studio.contains(e.target) || over.contains(e.target) || e.target === document.body;
    if (k === 'Escape') {
      if (!$('.lfs-menu', studio).hidden) { e.preventDefault(); closeMenu(); return; }
      if (document.querySelector('dialog[open]')) return;
      e.preventDefault(); e.stopPropagation(); close(); return;
    }
    if (k === 'Tab') { trap(e); return; }
    if (!inStudio) return;
    const ty = typing(e.target);
    if (ctrl && !e.altKey && (k === 'z' || k === 'Z') && !ty) { e.preventDefault(); e.stopPropagation(); if (e.shiftKey) redo(); else undo(); return; }
    if (ctrl && !e.altKey && (k === 'y' || k === 'Y') && !ty) { e.preventDefault(); e.stopPropagation(); redo(); return; }
    if (ctrl && !e.shiftKey && (k === 'e' || k === 'E' || k === 's' || k === 'S')) { e.preventDefault(); e.stopPropagation(); doExport(); return; }
    if (ctrl && e.shiftKey && (k === 'c' || k === 'C')) { e.preventDefault(); e.stopPropagation(); doCopy(); return; }
    if (ctrl && (k === 'f' || k === 'F')) { e.preventDefault(); e.stopPropagation(); $('.lfs-search input', studio).focus(); return; }
    if (ctrl && (k === 'k' || k === 'K')) { e.preventDefault(); e.stopPropagation(); $('.lfs-search input', studio).focus(); return; }
    if (ty || ctrl || e.altKey) return;
    if (k === '+' || k === '=') { e.preventDefault(); zoomBy(1.25); }
    else if (k === '-' || k === '_') { e.preventDefault(); zoomBy(0.8); }
    else if (k === '0') { e.preventDefault(); toolbar('fit'); }
    else if (k === '1') { e.preventDefault(); toolbar('real'); }
    else if (k === 'b' || k === 'B') { e.preventDefault(); toggleCompare(); }
    else if (k === '/') { e.preventDefault(); $('.lfs-search input', studio).focus(); }
    else if (k === '?') { e.preventDefault(); keysHelp(); }
    else if (k === 'p' || k === 'P') { e.preventDefault(); const L = ['right', 'left', 'float']; ST.layout = L[(L.indexOf(ST.layout) + 1) % 3]; save('layout', ST.layout); applyLayoutClass(); place(); say(T('Inspector: ', 'Inspector: ') + ST.layout); }
  }
  function trap(e) {
    const f = $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', studio).concat($$('.lfs-handle, .lfs-inplace', over))
      .filter(n => !n.disabled && !n.hidden && n.offsetParent !== null && !n.closest('[hidden]'));
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && (i === f.length - 1 || i < 0)) { e.preventDefault(); f[0].focus(); }
  }
  function keysHelp() {
    const list = [
      ['Esc', T('Cerrar el estudio', 'Close the studio')],
      ['Ctrl + Z', T('Deshacer', 'Undo')], ['Ctrl + Y', T('Rehacer', 'Redo')],
      ['Ctrl + E', T('Exportar', 'Export')], ['Ctrl + Shift + C', T('Copiar la imagen', 'Copy the image')],
      ['+  −', T('Acercar y alejar (también Ctrl + rueda)', 'Zoom in and out (also Ctrl + wheel)')],
      ['0', T('Ajustar a la pantalla', 'Fit to the screen')], ['1', T('Tamaño real', 'Real size')],
      ['B', T('Comparar antes y ahora', 'Compare before and now')],
      ['/  Ctrl + F', T('Buscar un control', 'Search a control')],
      ['P', T('Cambiar la posición del inspector', 'Change the inspector position')],
      [T('Doble clic', 'Double-click'), T('Cambiar un texto de la figura', 'Change a text of the figure')],
    ];
    let d = $('.lfs-keys', studio);
    if (!d) { d = mk('div', 'lfs-keys'); d.setAttribute('role', 'note'); studio.appendChild(d); d.addEventListener('click', () => { d.hidden = true; }); }
    d.innerHTML = '<div class="lfs-keys-box"><h3>' + esc(T('Atajos del estudio', 'Studio shortcuts')) + '</h3><dl>' + list.map(([k, v]) => '<dt>' + k.split(/\s+\+\s+/).map(x => '<kbd>' + esc(x) + '</kbd>').join(' + ') + '</dt><dd>' + esc(v) + '</dd>').join('') + '</dl><p>' + esc(T('Clic en cualquier parte para cerrar.', 'Click anywhere to close.')) + '</p></div>';
    d.hidden = false;
  }

  /* ---------------- exportación propia ---------------- */
  const STYLE_PROPS = ['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit',
    'opacity', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'alignment-baseline', 'baseline-shift', 'letter-spacing', 'word-spacing', 'text-decoration-line',
    'visibility', 'display', 'paint-order', 'marker-start', 'marker-mid', 'marker-end', 'stop-color', 'stop-opacity', 'shape-rendering', 'white-space', 'mix-blend-mode', 'clip-path', 'mask', 'filter', 'color', 'transform-origin', 'transform-box'];
  const DEF_VAL = { 'fill-opacity': '1', 'fill-rule': 'nonzero', 'stroke-opacity': '1', 'stroke-dasharray': 'none', 'stroke-dashoffset': '0px', 'stroke-linecap': 'butt', 'stroke-linejoin': 'miter', 'stroke-miterlimit': '4', opacity: '1', 'font-style': 'normal',
    'text-anchor': 'start', 'dominant-baseline': 'auto', 'alignment-baseline': 'auto', 'baseline-shift': '0px', 'letter-spacing': 'normal', 'word-spacing': '0px', 'text-decoration-line': 'none', visibility: 'visible', 'paint-order': 'normal', 'marker-start': 'none', 'marker-mid': 'none', 'marker-end': 'none',
    'stop-opacity': '1', 'shape-rendering': 'auto', 'white-space': 'normal', 'mix-blend-mode': 'normal', 'clip-path': 'none', mask: 'none', filter: 'none', 'transform-origin': '0px 0px', 'transform-box': 'view-box' };
  function bgColor() {
    if (ST.exp.bg === 'none') return null;
    if (ST.exp.bg === 'white') return '#ffffff';
    let n = ST.rec && ST.rec.host;
    while (n && n !== document.documentElement) {
      const c = getComputedStyle(n).backgroundColor;
      if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c;
      n = n.parentElement;
    }
    return '#ffffff';
  }
  /* el SVG con sus estilos calculados escritos dentro, para que se vea igual fuera de la app */
  function serialize(svg, o) {
    o = o || {};
    const clone = svg.cloneNode(true);
    const a = [svg].concat($$('*', svg)), b = [clone].concat($$('*', clone));
    for (let i = 0; i < a.length && i < b.length; i++) {
      const src = a[i], dst = b[i];
      if (dst.nodeType !== 1) continue;
      const cs = getComputedStyle(src);
      const out = [];
      STYLE_PROPS.forEach(p => {
        const v = cs.getPropertyValue(p);
        if (!v || v === DEF_VAL[p]) return;
        if (p === 'display' && v !== 'none') return;
        if (p === 'transform-origin' || p === 'transform-box') return;
        out.push(p + ':' + v);
      });
      if (out.length) dst.setAttribute('style', out.join(';'));
      ['class', 'data-lfs-o', 'data-lfs-t0', 'data-lfs-done', 'data-lfs-vb'].forEach(at => dst.removeAttribute(at));
      [...dst.attributes].forEach(at => { if (/^data-fe-|^data-lfs/.test(at.name)) dst.removeAttribute(at.name); });
    }
    clone.removeAttribute('popover');
    clone.setAttribute('xmlns', NS);
    clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    if (!clone.getAttribute('viewBox')) { const r = svg.getBoundingClientRect(); clone.setAttribute('viewBox', '0 0 ' + Math.round(r.width) + ' ' + Math.round(r.height)); }
    if (o.wmm) {
      clone.setAttribute('width', fmtN(o.wmm, 2) + 'mm'); clone.setAttribute('height', fmtN(o.hmm, 2) + 'mm');
    } else if (o.pxW) { clone.setAttribute('width', String(o.pxW)); clone.setAttribute('height', String(o.pxH)); }
    else if (o.forView) { const vb = clone.viewBox.baseVal; clone.setAttribute('width', String(vb.width || 800)); clone.setAttribute('height', String(vb.height || 500)); }
    const bg = o.bg;
    if (bg) {
      const vb = clone.getAttribute('viewBox').split(/[\s,]+/).map(Number);
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', vb[0]); r.setAttribute('y', vb[1]); r.setAttribute('width', vb[2]); r.setAttribute('height', vb[3]); r.setAttribute('fill', bg);
      clone.insertBefore(r, clone.firstChild);
    }
    const meta = document.createElementNS(NS, 'desc');
    meta.textContent = T('Exportada con el Estudio de figuras LABG ', 'Exported with the LABG Figure Studio ') + VERSION;
    clone.insertBefore(meta, clone.firstChild);
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
  }
  const loadImg = src => new Promise((ok, bad) => { const im = new Image(); im.decoding = 'sync'; im.onload = () => ok(im); im.onerror = () => bad(new Error('imagen')); im.src = src; });
  /* la figura dibujada en un lienzo del tamaño pedido */
  async function raster(pxW, pxH, bg) {
    const el = ST.el, lib = ST.rec.lib;
    const cv = document.createElement('canvas');
    cv.width = pxW; cv.height = pxH;
    const ctx = cv.getContext('2d');
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, pxW, pxH); }
    if (ST.rec.opts && ST.rec.opts.export && typeof ST.rec.opts.export.render === 'function') {
      const r = await ST.rec.opts.export.render(pxW, pxH);
      if (r) { drawContain(ctx, r, pxW, pxH); return cv; }
    }
    if (ADAPTERS[lib].raster) { const im = await ADAPTERS[lib].raster(el, pxW, pxH); drawContain(ctx, im, pxW, pxH); return cv; }
    if (lib === 'svg') {
      const s = serialize(el, { pxW, pxH });
      const url = URL.createObjectURL(new Blob([s], { type: 'image/svg+xml' }));
      try { const im = await loadImg(url); ctx.drawImage(im, 0, 0, pxW, pxH); } finally { URL.revokeObjectURL(url); }
      return cv;
    }
    drawContain(ctx, el, pxW, pxH);
    return cv;
  }
  function drawContain(ctx, src, W, H) {
    const sw = src.naturalWidth || src.videoWidth || src.width, sh = src.naturalHeight || src.videoHeight || src.height;
    if (!sw || !sh) return;
    const s = Math.min(W / sw, H / sh), w = sw * s, h = sh * s;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, (W - w) / 2, (H - h) / 2, w, h);
  }
  /* CRC-32 para los trozos de PNG */
  let CRC = null;
  function crc32(u8) {
    if (!CRC) { CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
    let c = 0xFFFFFFFF;
    for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  /* el PNG con su resolución escrita (trozo pHYs) */
  async function pngWithDpi(blob, dpi) {
    const u8 = new Uint8Array(await blob.arrayBuffer());
    const ppm = Math.round(dpi / 0.0254);
    const ch = new Uint8Array(21), dv = new DataView(ch.buffer);
    dv.setUint32(0, 9); ch.set([0x70, 0x48, 0x59, 0x73], 4); dv.setUint32(8, ppm); dv.setUint32(12, ppm); ch[16] = 1;
    dv.setUint32(17, crc32(ch.subarray(4, 17)));
    return new Blob([u8.subarray(0, 33), ch, u8.subarray(33)], { type: 'image/png' });
  }
  async function deflate(u8) {
    if (typeof CompressionStream === 'undefined') return null;
    const cs = new CompressionStream('deflate');
    const w = cs.writable.getWriter(); w.write(u8); w.close();
    return new Uint8Array(await new Response(cs.readable).arrayBuffer());
  }
  /* TIFF propio: RGB(A) de 8 bits, comprimido (deflate con predictor horizontal) y con su resolución */
  async function tiffBlob(cv, dpi, alpha) {
    const W = cv.width, H = cv.height, ctx = cv.getContext('2d');
    const spp = alpha ? 4 : 3;
    const comp = typeof CompressionStream !== 'undefined';
    const rps = Math.max(1, Math.min(H, Math.floor(262144 / (W * spp)) || 1));
    const strips = [];
    for (let y = 0; y < H; y += rps) {
      const h = Math.min(rps, H - y);
      const d = ctx.getImageData(0, y, W, h).data;
      const raw = new Uint8Array(W * h * spp);
      let o = 0;
      for (let r = 0; r < h; r++) {
        let i = r * W * 4, pr = 0, pg = 0, pb = 0, pa = 0;
        for (let x = 0; x < W; x++, i += 4) {
          const R = d[i], G = d[i + 1], B = d[i + 2], A = d[i + 3];
          if (comp) { raw[o++] = (R - pr) & 255; raw[o++] = (G - pg) & 255; raw[o++] = (B - pb) & 255; if (alpha) raw[o++] = (A - pa) & 255; pr = R; pg = G; pb = B; pa = A; }
          else { raw[o++] = R; raw[o++] = G; raw[o++] = B; if (alpha) raw[o++] = A; }
        }
      }
      strips.push(comp ? await deflate(raw) : raw);
    }
    const soft = 'LABG Estudio de figuras ' + VERSION + '\0';
    const tags = [];
    const T16 = (tag, v) => tags.push({ tag, type: 3, n: 1, v: [v] });
    const T32 = (tag, v) => tags.push({ tag, type: 4, n: 1, v: [v] });
    T32(256, W); T32(257, H);
    tags.push({ tag: 258, type: 3, n: spp, v: new Array(spp).fill(8) });
    T16(259, comp ? 8 : 1); T16(262, 2);
    tags.push({ tag: 273, type: 4, n: strips.length, v: null, offs: true });
    T16(277, spp); T32(278, rps);
    tags.push({ tag: 279, type: 4, n: strips.length, v: strips.map(s => s.length) });
    tags.push({ tag: 282, type: 5, n: 1, v: [dpi, 1] }); tags.push({ tag: 283, type: 5, n: 1, v: [dpi, 1] });
    T16(284, 1); T16(296, 2);
    tags.push({ tag: 305, type: 2, n: soft.length, v: soft });
    if (comp) T16(317, 2);
    if (alpha) T16(338, 2);
    const SZ = { 2: 1, 3: 2, 4: 4, 5: 8 };
    const ifdLen = 2 + tags.length * 12 + 4;
    let extra = 8 + ifdLen;
    tags.forEach(t => { const len = SZ[t.type] * t.n; if (len > 4) { t.at = extra; extra += len + (len & 1); } });
    let dataAt = extra;
    const stripOffs = strips.map(s => { const at = dataAt; dataAt += s.length; return at; });
    const total = dataAt;
    const buf = new ArrayBuffer(total), dv = new DataView(buf), u8 = new Uint8Array(buf);
    u8[0] = 0x49; u8[1] = 0x49; dv.setUint16(2, 42, true); dv.setUint32(4, 8, true);
    dv.setUint16(8, tags.length, true);
    const putVals = (t, at) => {
      const vals = t.offs ? stripOffs : t.v;
      if (t.type === 2) { for (let i = 0; i < vals.length; i++) u8[at + i] = vals.charCodeAt(i) & 127; return; }
      for (let i = 0; i < (t.type === 5 ? 1 : t.n); i++) {
        if (t.type === 3) dv.setUint16(at + i * 2, vals[i], true);
        else if (t.type === 4) dv.setUint32(at + i * 4, vals[i], true);
        else if (t.type === 5) { dv.setUint32(at, vals[0], true); dv.setUint32(at + 4, vals[1], true); }
      }
    };
    tags.forEach((t, k) => {
      const p = 10 + k * 12;
      dv.setUint16(p, t.tag, true); dv.setUint16(p + 2, t.type, true); dv.setUint32(p + 4, t.n, true);
      if (t.at != null) { dv.setUint32(p + 8, t.at, true); putVals(t, t.at); }
      else putVals(t, p + 8);
    });
    dv.setUint32(10 + tags.length * 12, 0, true);
    strips.forEach((s, i) => u8.set(s, stripOffs[i]));
    return new Blob([buf], { type: 'image/tiff' });
  }
  /* PDF propio: una página del tamaño de la figura con la imagen a la resolución elegida */
  async function pdfBlob(cv, wmm, hmm, alpha) {
    const W = cv.width, H = cv.height, ctx = cv.getContext('2d');
    const rgb = new Uint8Array(W * H * 3), a = alpha ? new Uint8Array(W * H) : null;
    const band = Math.max(1, Math.floor(1048576 / (W * 4)));
    for (let y = 0; y < H; y += band) {
      const h = Math.min(band, H - y);
      const d = ctx.getImageData(0, y, W, h).data;
      let o = y * W * 3, q = y * W;
      for (let i = 0; i < d.length; i += 4) { rgb[o++] = d[i]; rgb[o++] = d[i + 1]; rgb[o++] = d[i + 2]; if (a) a[q++] = d[i + 3]; }
    }
    const zr = await deflate(rgb), za = a ? await deflate(a) : null;
    const img = zr || rgb, filt = zr ? '/Filter /FlateDecode ' : '';
    const wpt = (wmm * PT_MM).toFixed(2), hpt = (hmm * PT_MM).toFixed(2);
    const parts = [], offs = [];
    let len = 0;
    const enc = s => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; };
    const push = x => { const u = typeof x === 'string' ? enc(x) : x; parts.push(u); len += u.length; };
    const obj = (n, s) => { offs[n] = len; push(n + ' 0 obj\n' + s + '\nendobj\n'); };
    const content = 'q ' + wpt + ' 0 0 ' + hpt + ' 0 0 cm /Im0 Do Q';
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    obj(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + wpt + ' ' + hpt + '] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>');
    obj(4, '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream');
    offs[5] = len;
    push('5 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + W + ' /Height ' + H + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 ' + filt + (a ? '/SMask 6 0 R ' : '') + '/Length ' + img.length + ' >>\nstream\n');
    push(img); push('\nendstream\nendobj\n');
    if (a) {
      const ai = za || a;
      offs[6] = len;
      push('6 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + W + ' /Height ' + H + ' /ColorSpace /DeviceGray /BitsPerComponent 8 ' + (za ? '/Filter /FlateDecode ' : '') + '/Length ' + ai.length + ' >>\nstream\n');
      push(ai); push('\nendstream\nendobj\n');
    }
    const n = a ? 7 : 6;
    obj(n, '<< /Producer (LABG Estudio de figuras ' + VERSION + ') /Creator (LABG Suite) >>');
    const xref = len;
    let x = 'xref\n0 ' + (n + 1) + '\n0000000000 65535 f \n';
    for (let i = 1; i <= n; i++) x += String(offs[i] || 0).padStart(10, '0') + ' 00000 n \n';
    push(x + 'trailer\n<< /Size ' + (n + 1) + ' /Root 1 0 R /Info ' + n + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
    return new Blob(parts, { type: 'application/pdf' });
  }
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function fileName(ext) {
    const t = slug(ST.rec.title || ST.rec.key);
    return APP + '-' + t + '-' + fmtN(expW(), 0) + 'mm' + (ext === 'svg' ? '' : '-' + ST.exp.dpi + 'ppp') + '.' + ext;
  }
  let busy = false;
  async function doExport() {
    if (busy || !ST.open) return;
    busy = true;
    const btns = $$('[data-a="export"]', studio);
    btns.forEach(b => { b.disabled = true; b.classList.add('busy'); });
    say(T('Exportando…', 'Exporting…'));
    try {
      const fmt = ST.exp.fmt, wmm = expW(), hmm = expH();
      const bg = bgColor();
      let blob, ext = fmt === 'tiff' ? 'tif' : fmt;
      if (fmt === 'svg') {
        if (ST.rec.lib === 'svg') blob = new Blob([serialize(ST.el, { wmm, hmm, bg })], { type: 'image/svg+xml' });
        else {
          const px = expPx();
          const cv = await raster(Math.min(px.w, 8000), Math.min(px.h, 8000), bg);
          const url = cv.toDataURL('image/png');
          blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="' + NS + '" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + fmtN(wmm, 2) + 'mm" height="' + fmtN(hmm, 2) + 'mm" viewBox="0 0 ' + cv.width + ' ' + cv.height + '"><image width="' + cv.width + '" height="' + cv.height + '" xlink:href="' + url + '"/></svg>'], { type: 'image/svg+xml' });
        }
      } else {
        let px = expPx();
        if (px.w * px.h > 150e6 || px.w > 16000 || px.h > 16000) {
          const k = Math.min(Math.sqrt(150e6 / (px.w * px.h)), 16000 / px.w, 16000 / px.h);
          px = { w: Math.floor(px.w * k), h: Math.floor(px.h * k) };
          say(T('La imagen era demasiado grande: se exporta a ', 'The image was too large: exported at ') + px.w + ' × ' + px.h + ' px');
        }
        const cv = await raster(px.w, px.h, fmt === 'pdf' && !bg ? null : bg);
        const dpiEff = Math.round(px.w / (wmm / MM_IN));
        if (fmt === 'png') blob = await pngWithDpi(await new Promise(r => cv.toBlob(r, 'image/png')), dpiEff);
        else if (fmt === 'tiff') blob = await tiffBlob(cv, dpiEff, !bg);
        else if (fmt === 'pdf') blob = await pdfBlob(cv, wmm, hmm, !bg);
      }
      const name = fileName(ext);
      download(blob, name);
      say(T('Exportada: ', 'Exported: ') + name + ' (' + (blob.size / 1048576).toFixed(2) + ' MB)');
      ring();
      document.dispatchEvent(new CustomEvent('labg-figure-studio:export', { detail: { name, size: blob.size, format: fmt } }));
    } catch (err) {
      console.error('LABG Estudio: exportación', err);
      say(T('No se pudo exportar: ', 'Could not export: ') + (err && err.message ? err.message : err));
    } finally {
      busy = false;
      btns.forEach(b => { b.disabled = false; b.classList.remove('busy'); });
    }
  }
  async function doCopy() {
    if (!ST.open) return;
    try {
      const k = Math.min(1, 4000 / expPx().w);
      const px = { w: Math.max(1, Math.round(expPx().w * Math.min(k, 300 / ST.exp.dpi))), h: Math.max(1, Math.round(expPx().h * Math.min(k, 300 / ST.exp.dpi))) };
      const cv = await raster(px.w, px.h, bgColor() || '#ffffff');
      const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
      if (!navigator.clipboard || !window.ClipboardItem) throw new Error(T('este navegador no deja copiar imágenes', 'this browser does not allow copying images'));
      await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
      say(T('Imagen copiada (', 'Image copied (') + px.w + ' × ' + px.h + ' px)');
      ring();
    } catch (err) { say(T('No se pudo copiar: ', 'Could not copy: ') + (err && err.message ? err.message : err)); }
  }

  /* ---------------- avisos ---------------- */
  function say(text) {
    if (live) { live.textContent = ''; setTimeout(() => { live.textContent = text; }, 40); }
    const info = stage && $('.lfs-msg', stage);
    if (info && ST.open) {
      info.hidden = false; info.textContent = text; info.classList.add('lfs-toast');
      clearTimeout(ST.msgT); ST.msgT = setTimeout(() => { info.hidden = true; info.classList.remove('lfs-toast'); }, 3600);
    }
  }
  function msgOut(text) { if (window.LABG && LABG.toast) LABG.toast(text, { type: 'info' }); }

  /* ---------------- vigilar la app ---------------- */
  let mo = null, decoT = null;
  function watch() {
    if (!window.MutationObserver) return;
    const root = $(CFG.root) || document.body;
    mo = new MutationObserver(recsM => {
      if (selfMut) return;
      let fresh = false;
      for (let i = 0; i < recsM.length; i++) {
        const r = recsM[i];
        if (r.target.nodeType === 1 && r.target.closest && r.target.closest('.lfs-own, .lnav-own')) continue;
        if (r.addedNodes.length) { fresh = true; break; }
      }
      if (!fresh) return;
      /* lo del estudio vuelve enseguida (antes de pintar), los botones un poco después */
      cache = null;
      try { applyAll(); } catch (e) { /* nada */ }
      clearTimeout(decoT); decoT = setTimeout(decorate, 250);
    });
    mo.observe(root, { childList: true, subtree: true });
    new MutationObserver(() => {
      $$('.lfs-open').forEach(b => { b.title = openTitle(); });
      if (ST.open) { labels(); const sc = body.scrollTop; render(); dock(false); dock(true); body.scrollTop = sc; }
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    document.addEventListener('stepchange', () => setTimeout(decorate, 120));
    /* fuera del estudio: con el menú de la figura abierto, la figura se queda a la vista mientras se recorren sus opciones */
    document.addEventListener('toggle', e => {
      const d = e.target;
      if (!d || !d.matches || !d.matches('details.fig-editor, details.fstudio')) return;
      const host = d.parentElement, cv = host && host.querySelector(':scope > .fig-canvas, :scope > .fs-fig');
      if (!cv) return;
      const fits = cv.getBoundingClientRect().height < window.innerHeight * 0.55;
      host.classList.toggle('lfs-sticky-fig', d.open && fits);
    }, true);
  }
  function start() {
    try {
      decorate();
      watch();
      /* las figuras de un bloque escondido miden cero hasta que se muestra */
      setTimeout(decorate, 1500);
    } catch (err) { console.error('LABG Estudio de figuras', err); }
  }

  window.LABGFigureStudio = {
    version: VERSION,
    app: APP,
    config: CFG,
    /* registra una figura que la detección no encuentra sola, o le da opciones */
    attach(el, opts) {
      if (!el) return null;
      const target = /^(svg|canvas|img)$/i.test(el.tagName) ? el : $$('svg, canvas, img', el)[0];
      if (!target) return null;
      const rec = recOf(target, opts || {});
      if (attached.indexOf(rec) < 0) attached.push(rec);
      setTimeout(decorate, 0);
      return { open: () => open(target), close: () => close(), detach: () => { const i = attached.indexOf(rec); if (i >= 0) attached.splice(i, 1); recs.delete(target); } };
    },
    open: el => open(el),
    close: () => close(),
    isOpen: () => ST.open,
    figures: root => figures(root).map(r => ({ el: r.el, key: r.key, title: r.title, library: r.lib })),
    adapters: ADAPTERS,
    palettes: PALETTES,
    presets: PRESETS,
    on: (ev, fn) => document.addEventListener('labg-figure-studio:' + ev, e => fn(e.detail)),
    refresh: () => decorate(),
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(start, 80));
  else setTimeout(start, 80);
})();
