/* LABG Suite — Estudio de figuras LABG v1.5.1 (módulo compartido)
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

   Exportación nativa (1.1.0): si la app sabe volver a dibujar una figura (por ejemplo, las
   que dibuja Python con matplotlib, por medio de labg-pyfig.js), el estudio le pide la figura
   al tamaño, la resolución y el formato de salida —PNG con sus ppp, SVG y PDF vectoriales— en
   lugar de ampliar la imagen de la pantalla, y muestra una vista previa a tamaño de salida.

   Mapas (1.2.0): los mapas que una app arma con su propio estudio de mapas (PollinationPro,
   BioModellingPro) también se abren aquí. Un mapa interactivo no se eleva: el papel muestra la
   vista previa que dibuja el estudio de mapas de la app al tamaño de salida, y la exportación la
   hace ese mismo estudio (PNG, SVG, TIFF y GeoTIFF; el PDF sale de su PNG).

   Leyenda (1.3.0): en cualquier gráfica que tenga una aparte, el estudio la pone dentro de la gráfica (ocho
   lugares), fuera a la derecha, debajo en fila u oculta, y se arrastra sobre la figura. La encuentra marcada
   por el kit de dibujo (data-role="legend"), con nombre de leyenda, o suelta: cada texto con su muestra.

   Tema oscuro (1.4.0): con la app en oscuro, la figura se exporta con los colores del tema claro (opción «Colores»).

   PDF vectorial (1.5.0): el PDF de una figura SVG sale con trazos y texto, no como imagen: se amplía sin perder
   nitidez, pesa poco y el texto se puede buscar. El texto va con las letras estándar de PDF, como en el pdf() de R.

   Letras (1.5.1): la interfaz usa las del sistema; el estudio no trae letras de otros ni las pide a internet.

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
  const VERSION = '1.5.1';
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
    "list": '<path d="M3 5h.01"/><path d="M3 12h.01"/><path d="M3 19h.01"/><path d="M8 5h13"/><path d="M8 12h13"/><path d="M8 19h13"/>',
    "move": '<path d="M12 2v20"/><path d="m15 19-3 3-3-3"/><path d="m19 9 3 3-3 3"/><path d="M2 12h20"/><path d="m5 9-3 3 3 3"/><path d="m9 5 3-3 3 3"/>',
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
      if (n.hidden || n.classList.contains('sr-only') || /(^|\s)[\w]+-val(\s|$)/.test(n.className || '') || n.classList.contains('lfs-own') || n.classList.contains('lnav-own')) return;
      if (n !== el && (n.hasAttribute('data-help') || /(^|\s)(help-badge|help-btn|help-dot|info-btn|hint-btn)(\s|$)/.test(n.className || ''))) return;
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
    /* los mapas: los abre el estudio y los exporta el estudio de mapas de la app (js/mapstudio.js declara
       su exportación nativa y dónde están sus pestañas); dentro de un mapa interactivo nada es figura suelta */
    biomodelling: { exclude: DEF.exclude + ', .leaflet-pane, .leaflet-control-container' },   /* «BioModelling Pro»: el nombre va hasta el espacio */
    statspro: {
      hosts: DEF.hosts + ', .plot-canvas',
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

  /* ---------------- exportación nativa ----------------
     La app (o un puente como labg-pyfig.js) puede ofrecer, para una figura, volver a dibujarla a
     las medidas de salida. Se registra con attach(el, { native }) o, para todas, con
     window.LABG_FIGSTUDIO.nativeExport = rec => descripción | null. La descripción es
       { label: 'Python', formats: ['png', 'svg', 'pdf'], preview: true,
         render(fmt, o) → Blob o data URI (o una promesa de ellos) }
     con o = { fmt, wmm, hmm, win, hin, dpi, bg, transparent, light } (hmm/hin = null: el alto
     que dé la figura). El TIFF se arma con el PNG nativo; lo que la app no dibuje sale por la
     exportación propia del estudio. */
  function nativeFor(rec) {
    if (!rec) return null;
    const own = rec.opts && rec.opts.native;
    if (own && typeof own.render === 'function') return own;
    const hook = (window.LABG_FIGSTUDIO && window.LABG_FIGSTUDIO.nativeExport) || CFG.nativeExport;
    if (typeof hook !== 'function') return null;
    try { const d = hook(rec); return d && typeof d.render === 'function' ? d : null; } catch (e) { return null; }
  }
  const TAB_SEL = '.ms-tab, .fig-tab, .fs-tab, [role="tab"]';
  function bumpPreview(n) { if (!ST.noLift || (n && n.matches && n.matches(TAB_SEL))) return; ST.pvVer = (ST.pvVer || 0) + 1; schedulePreview(); }
  const nativeCan = (N, fmt) => !!(N && (N.formats || ['png']).indexOf(fmt) >= 0);
  /* ¿el aspecto de la figura es del estudio? No cuando la app la dibuja con su propio estilo (los mapas) */
  const ownLook = () => !(ST.native && ST.native.studioStyles === false);
  const canStyle = () => !!(ST.rec && ADAPTERS[ST.rec.lib] && ADAPTERS[ST.rec.lib].styles && ownLook());
  function uriBlob(uri) {
    const c = uri.indexOf(','), head = uri.slice(5, c), mime = head.split(';')[0] || 'application/octet-stream';
    if (/;base64/.test(head)) {
      const bin = atob(uri.slice(c + 1)), u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return new Blob([u], { type: mime });
    }
    return new Blob([decodeURIComponent(uri.slice(c + 1))], { type: mime });
  }
  const asBlob = r => (r instanceof Blob ? r : (typeof r === 'string' && r.slice(0, 5) === 'data:' ? uriBlob(r) : null));
  /* un PNG (por ejemplo, el nativo) en un lienzo de su tamaño */
  async function blobCanvas(blob) {
    const url = URL.createObjectURL(blob);
    try {
      const im = await loadImg(url);
      const cv = document.createElement('canvas');
      cv.width = im.naturalWidth; cv.height = im.naturalHeight;
      cv.getContext('2d').drawImage(im, 0, 0);
      return cv;
    } finally { URL.revokeObjectURL(url); }
  }

  /* ---------------- figuras de la app ---------------- */
  const SKIP = 'button, a, .btn, .icon-btn, nav, .topbar, .stepper, .lnav-own, .lfs-own, .fig-editor, .fig-tools, .fe-panel, .fs-panel, .fig-menu, dialog, .toast-stack, .labg-iso, .brand, .suite-link, label, .seg, .lfs-before';
  const recs = new WeakMap();
  const attached = [];
  let cache = null;

  function isFigEl(el) {
    if (!el || !el.isConnected || el.closest(SKIP)) return false;
    if (CFG.exclude && el.closest(CFG.exclude)) return false;
    const tag = el.tagName.toLowerCase();
    if (el.matches(MAP_SEL)) { const r = el.getBoundingClientRect(); return !r.width || (r.width >= 200 && r.height >= 120); }
    if (el.parentElement && el.parentElement.closest(MAP_SEL)) return false;   /* las piezas de un mapa no son figuras sueltas */
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
    if (el.matches && el.matches(MAP_SEL)) return el;
    const fc = el.parentElement && el.parentElement.closest('.fig-canvas');
    if (fc && fc.parentElement) return fc.parentElement;
    return (el.parentElement && el.parentElement.closest(CFG.hosts)) || el.parentElement;
  }
  function titleOf(rec) {
    if (rec.opts && rec.opts.title) return TT(rec.opts.title);
    let own = null;
    try { own = rec.host.querySelector(CFG.titles); } catch (e) { own = null; }
    if (own && !rec.el.contains(own)) { const s = textOf(own); if (s) return s.slice(0, 120); }
    /* el rótulo suelto justo antes del contenedor (un h3 y debajo la figura) */
    for (let p = rec.host.previousElementSibling, k = 0; p && k < 4; p = p.previousElementSibling, k++) {
      if (/^H[2-5]$/.test(p.tagName) || p.matches('.fig-title, .pg-title, figcaption')) { const s = textOf(p); if (s) return s.slice(0, 120); }
      if (p.matches(CFG.hosts) || p.querySelector('svg, canvas, img')) break;   /* otra figura: ese rótulo es suyo */
    }
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
    const list = anchor ? $$('svg, canvas, img, ' + MAP_SEL, anchor).filter(isFigEl) : [];
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
      const list = $$('svg, canvas, img, ' + MAP_SEL, scope).filter(isFigEl).map(el => recOf(el));
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
    /* mapas interactivos: el contenedor entero es la figura; no se eleva (sigue vivo en la página) y lo dibuja la app */
    map: {
      test: el => !!(el.classList && (el.classList.contains('leaflet-container') || el.hasAttribute('data-lfs-map'))),
      aspect: el => (el.offsetWidth ? el.offsetHeight / el.offsetWidth : 0.66),
      styles: false,
      lift: false,
    },
  };
  const MAP_SEL = '.leaflet-container, [data-lfs-map]';

  /* ---------------- botón de entrada en cada figura ---------------- */
  const openTitle = () => T('Abrir en el estudio de figuras: pantalla dividida para editar y exportar', 'Open in the figure studio: split screen to edit and export');
  function decorate() {
    cache = null;
    figures().forEach(rec => {
      const host = rec.host;
      if (!host) return;
      if (rec.lib === 'map' && !nativeFor(rec)) return;
      let inline = null;
      try { inline = CFG.btnHost ? host.querySelector(':scope > ' + CFG.btnHost.split(',').map(x => x.trim()).join(', :scope > ')) : null; } catch (e) { inline = null; }
      if (!inline) { const card = host.closest('.chart-card'); if (card) inline = card.querySelector('.chart-actions'); }
      if ((inline || host).querySelector('.lfs-open[data-for="' + cssEsc(rec.key) + '"]')) return;
      const b = mk('button', 'lfs-open lfs-own', ico('pencil-ruler'));
      b.type = 'button';
      b.setAttribute('data-for', rec.key);
      b.title = openTitle(); b.setAttribute('aria-label', openTitle() + ' — ' + rec.title);
      b.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        let el = rec.el;
        if (!el.isConnected) { const now = figures().find(r => r.key === rec.key && r.el.isConnected); el = now ? now.el : host; }
        open(el, b);
      });
      if (rec.lib === 'map') {
        /* que el mapa no se arrastre ni se acerque al pulsar el botón */
        ['pointerdown', 'mousedown', 'touchstart', 'dblclick', 'wheel'].forEach(t => b.addEventListener(t, e => e.stopPropagation(), { passive: true }));
        /* un control más del mapa, debajo del zoom: no tapa la leyenda, el título ni la flecha */
        const corner = host.querySelector(':scope > .leaflet-control-container > .leaflet-top.leaflet-left');
        if (corner) {
          const bar = mk('div', 'leaflet-control leaflet-bar lfs-mapbar lfs-own');
          b.classList.add('lfs-open-leaflet');
          bar.appendChild(b);
          corner.appendChild(bar);
          return;
        }
        b.classList.add('lfs-open-map');
        host.appendChild(b);
        return;
      }
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
  /* la opción «LABG Sans» se quitó en la 1.5.1: lo que la usaba queda en la sans del sistema, que es como ya se veía sin red */
  const sinLabg = p => (p && p.font === 'labg' ? Object.assign({}, p, { font: 'sans' }) : p);
  Object.keys(FIGS).forEach(k => { FIGS[k] = sinLabg(FIGS[k]); });
  const blankFig = () => ({ pal: '', font: '', txt: 1, line: 1, texts: {}, leg: null });
  const figState = k => Object.assign(blankFig(), FIGS[k] || {});
  /* ¿la leyenda tiene un lugar que no es el de la app? */
  const legOn = st => !!(st && st.leg && ((st.leg.pos && st.leg.pos !== 'orig') || st.leg.ox || st.leg.oy));
  const isDefault = st => !st.pal && !st.font && st.txt === 1 && st.line === 1 && !Object.keys(st.texts || {}).length && !legOn(st);
  function setFigState(k, st) {
    if (isDefault(st)) delete FIGS[k]; else FIGS[k] = JSON.parse(JSON.stringify(st));
    save('figs', FIGS);
  }

  /* ---------------- estilo del estudio sobre un SVG ---------------- */
  const SHAPES = 'path, line, polyline, polygon, rect, circle, ellipse';
  const hexOf = c => {
    if (!c || c === 'none' || c === 'transparent' || /^url\(/.test(c)) return null;
    if (c.indexOf('color(srgb') >= 0) c = normColor(c);   /* una mezcla con color-mix() */
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
    $$('[data-lfs-a]', svg).concat(svg.hasAttribute('data-lfs-a') ? [svg] : []).forEach(n => {
      let o = {};
      try { o = JSON.parse(n.getAttribute('data-lfs-a')) || {}; } catch (e) { o = {}; }
      Object.keys(o).forEach(a => { if (o[a] == null) n.removeAttribute(a); else n.setAttribute(a, o[a]); });
      n.removeAttribute('data-lfs-a');
    });
    svg.removeAttribute('data-lfs-done');
  }
  function keep(n, prop) {
    let o = {};
    try { o = JSON.parse(n.getAttribute('data-lfs-o') || '{}'); } catch (e) { o = {}; }
    if (!(prop in o)) { o[prop] = n.style.getPropertyValue(prop) || ''; n.setAttribute('data-lfs-o', JSON.stringify(o)); }
  }
  function keepAttr(n, name) {
    let o = {};
    try { o = JSON.parse(n.getAttribute('data-lfs-a') || '{}'); } catch (e) { o = {}; }
    if (!(name in o)) { o[name] = n.getAttribute(name); n.setAttribute('data-lfs-a', JSON.stringify(o)); }
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
      /* la leyenda, al final: ya con su letra y sus colores */
      if (legOn(st)) placeLegend(svg, st.leg);
      svg.setAttribute('data-lfs-done', '');
    } finally {
      if (mo) mo.takeRecords();
      selfMut = false;
    }
  }

  /* ---------------- la leyenda: dónde está y adónde va ---------------- */
  const invCTM = svg => { try { const c = svg.getScreenCTM(); return c ? c.inverse() : null; } catch (e) { return null; } };
  const vbOf = svg => { const v = svg.viewBox && svg.viewBox.baseVal; return v && v.width && v.height ? { x: v.x, y: v.y, w: v.width, h: v.height } : null; };
  const uni = bs => {
    const v = bs.filter(Boolean); if (!v.length) return null;
    const x0 = Math.min.apply(null, v.map(b => b.x)), y0 = Math.min.apply(null, v.map(b => b.y));
    return { x: x0, y: y0, w: Math.max.apply(null, v.map(b => b.x + b.w)) - x0, h: Math.max.apply(null, v.map(b => b.y + b.h)) - y0 };
  };
  /* la caja de un nodo en las unidades del SVG (las de su viewBox), aunque esté dentro de grupos movidos */
  function rootBox(svg, n, Mi) {
    let b;
    try { b = n.getBBox(); } catch (e) { return null; }
    if (!b || !(b.width || b.height)) return null;
    let M = null;
    try { const c = n.getScreenCTM(); M = c && Mi ? Mi.multiply(c) : null; } catch (e) { M = null; }
    if (!M) return { x: b.x, y: b.y, w: b.width, h: b.height };
    const xs = [], ys = [];
    [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]].forEach(p => { xs.push(M.a * p[0] + M.c * p[1] + M.e); ys.push(M.b * p[0] + M.d * p[1] + M.f); });
    const x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys);
    return { x: x0, y: y0, w: Math.max.apply(null, xs) - x0, h: Math.max.apply(null, ys) - y0 };
  }
  const LEG_SKIP = 'defs, clipPath, mask, marker, pattern, .lfs-own, [data-lfs-own]';
  function legendOf(svg) {
    if (!svg || !svg.getClientRects || !svg.getClientRects().length) return null;
    const Mi = invCTM(svg);
    if (!Mi) return null;
    /* 1) marcada por el kit de dibujo (la marca del editor ✎ común) o con nombre de leyenda */
    let g = $$('[data-role="legend"]', svg).find(x => !x.closest(LEG_SKIP));
    const NAMED = 'g[class*="legend"], g[id*="legend"], g[data-legend]';
    if (!g) g = $$(NAMED, svg).find(x => !x.closest(LEG_SKIP) && !(x.parentElement && x.parentElement.closest(NAMED)));
    if (g && getComputedStyle(g).display !== 'none') {
      const box = rootBox(svg, g, Mi);
      if (box && box.w > 2 && box.h > 2) {
        const by = new Map();
        $$('[data-li]', g).forEach(n => { const k = n.getAttribute('data-li'); if (!by.has(k)) by.set(k, []); by.get(k).push(n); });
        const entries = Array.from(by.values()).map(nodes => ({ nodes, box: uni(nodes.map(n => rootBox(svg, n, Mi))) })).filter(e => e.box);
        return { els: [g], box, tagged: g.matches('[data-role="legend"]'), entries, n: entries.length || g.querySelectorAll('text').length, extra: $$('[data-role="legend-box"]', g) };
      }
    }
    /* 2) suelta: cada texto con su muestra (rectángulo, línea, punto o marca) justo a la izquierda */
    return looseLegend(svg, Mi);
  }
  function looseLegend(svg, Mi) {
    const texts = $$('text', svg).filter(t => t.textContent.trim() && !t.closest(LEG_SKIP + ', [data-role="axis"], [data-role="tick"], [data-role="title"]'));
    if (!texts.length || texts.length > 600) return null;
    const tbox = new Map();
    texts.forEach(t => {
      const a = t.getAttribute('text-anchor') || getComputedStyle(t).textAnchor || 'start';
      if (a !== 'start') return;
      const b = rootBox(svg, t, Mi);
      if (b && b.h > 2 && b.w > 1) tbox.set(t, b);
    });
    if (tbox.size < 2) return null;
    const shapes = $$('rect, circle, ellipse, line, path, polygon, polyline, use', svg);
    if (shapes.length > 9000) return null;
    const small = [];
    /* un conector (una línea con punta de flecha) no es la muestra de una leyenda */
    const arrow = s => ['marker-start', 'marker-mid', 'marker-end'].some(m => { const v = s.getAttribute(m); return v && v !== 'none'; }) || (s.style && /url\(/.test(s.style.markerEnd + s.style.markerStart));
    shapes.forEach(s => {
      if (s.closest(LEG_SKIP) || arrow(s)) return;
      const b = rootBox(svg, s, Mi);
      if (!b || b.w > 64 || b.h > 34) return;
      small.push({ el: s, b, cy: b.y + b.h / 2 });
    });
    /* índice por renglón, para no comparar cada texto con todo */
    const R = new Map(), key = y => Math.round(y / 6);
    small.forEach(s => { const k = key(s.cy); for (let d = -2; d <= 2; d++) { if (!R.has(k + d)) R.set(k + d, []); R.get(k + d).push(s); } });
    const entries = [];
    tbox.forEach((tb, t) => {
      const fs = tb.h, cy = tb.y + tb.h / 2, near = R.get(key(cy)) || [];
      let best = null, bd = Infinity;
      near.forEach(s => {
        const sb = s.b;
        if (sb.w > fs * 3.4 || sb.h > fs * 1.7) return;
        if (/^(line|path|polyline)$/i.test(s.el.tagName) && sb.h <= 1.5 && sb.w <= fs * 0.8) return;
        const gap = tb.x - (sb.x + sb.w);
        if (gap < -2 || gap > fs * 1.7 || Math.abs(s.cy - cy) > fs * 0.6) return;
        const d = Math.max(0, gap) + Math.abs(s.cy - cy) * 2;
        if (d < bd) { bd = d; best = s; }
      });
      if (!best) return;
      /* una muestra de leyenda no tiene a su izquierda otra igual pegada (una celda de un mapa de calor sí) */
      const sb = best.b;
      if (near.some(s => s !== best && Math.abs(s.cy - best.cy) < fs * 0.4 && s.b.x + s.b.w <= sb.x + 0.5 && s.b.x + s.b.w > sb.x - fs * 1.2 && Math.abs(s.b.w - sb.w) < 1 && Math.abs(s.b.h - sb.h) < 1)) return;
      /* todo lo chico de la muestra (una línea y su punto, por ejemplo) */
      const parts = near.filter(s => Math.abs(s.cy - cy) < fs * 0.6 && s.b.x >= sb.x - fs * 1.2 && s.b.x + s.b.w <= tb.x + 1).map(s => s.el);
      entries.push({ t, parts: Array.from(new Set(parts)), tb, sb, fs, sw: best.el });
    });
    /* cada entrada tiene su muestra: dos textos que comparten una no son de una leyenda */
    const usos = new Map(); entries.forEach(e => usos.set(e.sw, (usos.get(e.sw) || 0) + 1));
    for (let i = entries.length - 1; i >= 0; i--) if (usos.get(entries[i].sw) > 1) entries.splice(i, 1);
    if (entries.length < 2) return null;
    const groups = [];
    /* en columna: textos y muestras alineados, con el mismo paso */
    const cols = [];
    entries.forEach(e => { let c = cols.find(c => Math.abs(c.x - e.tb.x) < 2.5 && Math.abs(c.sx - e.sb.x) < 3); if (!c) cols.push(c = { x: e.tb.x, sx: e.sb.x, list: [] }); c.list.push(e); });
    cols.forEach(c => {
      c.list.sort((a, b) => a.tb.y - b.tb.y);
      let run = [c.list[0]], step = null;
      for (let i = 1; i < c.list.length; i++) {
        const p = c.list[i - 1], q = c.list[i], dy = q.tb.y - p.tb.y, f = Math.max(p.fs, q.fs);
        if (dy > f * 0.85 && dy < f * 2.9 && (step == null || Math.abs(dy - step) < f * 0.35)) { if (step == null) step = dy; run.push(q); }
        else { if (run.length >= 2) groups.push(run); run = [q]; step = null; }
      }
      if (run.length >= 2) groups.push(run);
    });
    /* en fila: en el mismo renglón, una entrada tras otra */
    const rows = [];
    entries.forEach(e => { const cy = e.tb.y + e.tb.h / 2; let r = rows.find(r => Math.abs(r.cy - cy) < 2); if (!r) rows.push(r = { cy, list: [] }); r.list.push(e); });
    rows.forEach(r => {
      r.list.sort((a, b) => a.sb.x - b.sb.x);
      let run = [r.list[0]];
      for (let i = 1; i < r.list.length; i++) {
        const p = r.list[i - 1], q = r.list[i], gap = q.sb.x - (p.tb.x + p.tb.w);
        if (gap > -1 && gap < Math.max(p.fs, q.fs) * 5) run.push(q); else { if (run.length >= 2) groups.push(run); run = [q]; }
      }
      if (run.length >= 2) groups.push(run);
    });
    if (!groups.length) return null;
    groups.sort((a, b) => b.length - a.length);
    const num = s => /^[-−+]?[\d\s.,]*\d[\d\s.,]*%?$/.test(s);
    const isAxis = g => g.every(e => num(e.t.textContent.trim())) && g.every(e => /^(line|path|polyline)$/i.test(e.sw.tagName));
    const okG = groups.filter(g => !isAxis(g));
    if (!okG.length) return null;
    const best = okG[0];
    if (new Set(best.map(e => e.t.textContent.trim())).size < best.length) return null;
    let box = uni(best.map(e => uni([e.tb, e.sb])));
    const V = vbOf(svg);
    if (V && (box.w > V.w * 0.75 || box.h > V.h * 0.9)) return null;
    const els = new Set(); best.forEach(e => { els.add(e.t); e.parts.forEach(p => els.add(p)); });
    const fs = best[0].fs;
    /* su título, justo encima */
    let title = null, tg = Infinity;
    texts.forEach(t => {
      if (els.has(t)) return;
      const b = tbox.get(t) || rootBox(svg, t, Mi);
      if (!b) return;
      const gy = box.y - (b.y + b.h);
      if (gy < -1 || gy > fs * 1.5 || b.x < box.x - fs * 2.5 || b.x > box.x + fs * 2.5 || b.w > Math.max(box.w * 2.5, fs * 14)) return;
      if (gy < tg) { tg = gy; title = { t, b }; }
    });
    if (title) { els.add(title.t); box = uni([box, title.b]); }
    /* su marco: un rectángulo que la rodea con poco margen */
    const rects = $$('rect', svg);
    if (rects.length < 3000) {
      let frame = null, fa = Infinity;
      rects.forEach(r => {
        if (els.has(r) || r.closest(LEG_SKIP)) return;
        const b = rootBox(svg, r, Mi);
        if (!b || b.x > box.x + 1 || b.y > box.y + 1 || b.x + b.w < box.x + box.w - 1 || b.y + b.h < box.y + box.h - 1) return;
        if (b.w > box.w + fs * 3 || b.h > box.h + fs * 3) return;
        if (b.w * b.h < fa) { fa = b.w * b.h; frame = { r, b }; }
      });
      if (frame) { els.add(frame.r); box = uni([box, frame.b]); }
    }
    return { els: Array.from(els), box, tagged: false, entries: best.map(e => ({ nodes: [e.t].concat(e.parts), box: uni([e.tb, e.sb]) })), n: best.length, extra: [], title: title ? title.t : null };
  }
  /* el área de la gráfica: la que declara el kit (data-plot, la marca del editor común) o la que cubren ejes y rejilla */
  function plotOf(svg, lg, Mi) {
    const p = (svg.getAttribute('data-plot') || '').trim().split(/[\s,]+/).map(Number);
    if (p.length === 4 && p.every(isFinite) && p[2] > 0 && p[3] > 0) return { x: p[0], y: p[1], w: p[2], h: p[3] };
    const V = vbOf(svg) || rootBox(svg, svg, Mi) || { x: 0, y: 0, w: 300, h: 200 };
    const inLeg = n => lg && lg.els.some(e => e === n || e.contains(n));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    $$('line, path, rect, polyline', svg).forEach(n => {
      if (n.closest(LEG_SKIP) || inLeg(n)) return;
      const b = rootBox(svg, n, Mi); if (!b) return;
      const longH = b.w >= V.w * 0.4 && b.h <= 2, longV = b.h >= V.h * 0.4 && b.w <= 2;
      const frame = n.tagName.toLowerCase() === 'rect' && b.w >= V.w * 0.4 && b.h >= V.h * 0.35 && b.w < V.w * 0.995 && b.h < V.h * 0.995;
      if (longH || longV || frame) { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
    });
    if (isFinite(x0) && x1 - x0 > V.w * 0.3 && y1 - y0 > V.h * 0.25) return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    return { x: V.x + V.w * 0.1, y: V.y + V.h * 0.08, w: V.w * 0.84, h: V.h * 0.74 };
  }
  /* figuras todavía sin dibujar (un bloque cerrado): la leyenda se acomoda en cuanto se vean */
  const legPend = new Set();
  let legRO = null;
  function pendLegend(svg) {
    if (!window.ResizeObserver || legPend.has(svg)) return;
    legRO = legRO || new ResizeObserver(list => list.forEach(en => {
      const s = en.target;
      if (!s.getClientRects().length || !legPend.has(s)) return;
      legPend.delete(s); legRO.unobserve(s);
      const r = recs.get(s), st = r && FIGS[r.key] ? figState(r.key) : null;
      if (st && !isDefault(st)) styleSvg(s, st);
    }));
    legPend.add(svg); legRO.observe(svg);
  }
  /* mueve unos nodos dx, dy (en unidades del SVG), aunque sus padres estén movidos o escalados */
  function moveNodes(svg, Mi, nodes, dx, dy) {
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return;
    nodes.forEach(n => {
      let vx = dx, vy = dy;
      try {
        const pm = n.parentNode && n.parentNode.getScreenCTM ? n.parentNode.getScreenCTM() : null;
        if (pm && Mi) { const A = Mi.multiply(pm), det = A.a * A.d - A.b * A.c; if (det) { vx = (A.d * dx - A.c * dy) / det; vy = (A.a * dy - A.b * dx) / det; } }
      } catch (e) { /* sin matriz: unidades del SVG */ }
      keepAttr(n, 'transform');
      const t0 = n.getAttribute('transform');
      n.setAttribute('transform', 'translate(' + vx.toFixed(2) + ' ' + vy.toFixed(2) + ')' + (t0 ? ' ' + t0 : ''));
    });
  }
  function placeLegend(svg, L) {
    if (!svg.getClientRects().length) { pendLegend(svg); return; }
    const lg = legendOf(svg);
    if (!lg) return;
    if (L.pos === 'none') { lg.els.forEach(n => { keep(n, 'display'); n.style.setProperty('display', 'none'); }); return; }
    const Mi = invCTM(svg), b = lg.box, V = svg.hasAttribute('data-lfs-vb') ? null : vbOf(svg), P = plotOf(svg, lg, Mi);
    const pad = Math.max(4, Math.min(P.w, P.h) * 0.025);
    const others = () => $$('text', svg).filter(t => !t.closest(LEG_SKIP) && !lg.els.some(e => e === t || e.contains(t))).map(t => rootBox(svg, t, Mi)).filter(Boolean);
    let X = b.x, Y = b.y, grow = null, row = null;
    switch (L.pos) {
      case 'tl': X = P.x + pad; Y = P.y + pad; break;
      case 'tc': X = P.x + (P.w - b.w) / 2; Y = P.y + pad; break;
      case 'tr': X = P.x + P.w - pad - b.w; Y = P.y + pad; break;
      case 'ml': X = P.x + pad; Y = P.y + (P.h - b.h) / 2; break;
      case 'mr': X = P.x + P.w - pad - b.w; Y = P.y + (P.h - b.h) / 2; break;
      case 'bl': X = P.x + pad; Y = P.y + P.h - pad - b.h; break;
      case 'bc': X = P.x + (P.w - b.w) / 2; Y = P.y + P.h - pad - b.h; break;
      case 'br': X = P.x + P.w - pad - b.w; Y = P.y + P.h - pad - b.h; break;
      case 'right': {
        /* fuera, a la derecha de todo lo demás, centrada en la altura de la gráfica */
        const right = Math.max.apply(null, [P.x + P.w].concat(others().filter(o => o.y + o.h > P.y && o.y < P.y + P.h).map(o => o.x + o.w)));
        X = right + pad * 2; Y = P.y + (P.h - b.h) / 2;
        if (V) { const need = X + b.w + pad - (V.x + V.w); if (need > 0.5) grow = { w: need }; }
        break;
      }
      case 'below': {
        /* debajo de todo lo demás, en fila (y en varias si no cabe), centrada en la gráfica */
        const bottom = Math.max.apply(null, [P.y + P.h].concat(others().filter(o => o.y > P.y + P.h * 0.5).map(o => o.y + o.h)));
        let ent = lg.entries && lg.entries.length > 1 ? lg.entries.slice() : null, frames = [];
        if (ent) {
          /* lo que no es una entrada (en una leyenda marcada, lo que hay dentro de su grupo): títulos, notas y marco */
          const inE = new Set(); ent.forEach(e => e.nodes.forEach(n => inE.add(n)));
          const tag = n => n.tagName.toLowerCase(), ex = lg.extra || [];
          const rest = (lg.tagged ? $$('text, ' + SHAPES, lg.els[0]) : lg.els)
            .filter(n => !inE.has(n) && ex.indexOf(n) < 0 && tag(n) !== 'g' && !n.closest(LEG_SKIP))
            .map(n => ({ n, b: rootBox(svg, n, Mi) })).filter(o => o.b);
          /* el marco ya no la rodea en la fila: se esconde */
          frames = rest.filter(o => tag(o.n) === 'rect' && o.b.w >= b.w * 0.8 && o.b.h >= b.h * 0.8).map(o => o.n).concat(ex);
          if (rest.some(o => tag(o.n) !== 'text' && frames.indexOf(o.n) < 0)) ent = null;   /* trae algo más (una barra de color, por ejemplo): baja entera */
          else {
            /* el título va al principio de la fila, como en las revistas; una nota de debajo de las entradas, al final */
            const top = Math.min.apply(null, ent.map(e => e.box.y)), left = Math.min.apply(null, ent.map(e => e.box.x));
            const txt = rest.filter(o => tag(o.n) === 'text');
            const head = txt.filter(o => o.b.y + o.b.h <= top + 1 || o.b.x + o.b.w <= left + 1), tail = txt.filter(o => head.indexOf(o) < 0);
            if (head.length) ent = [{ nodes: head.map(o => o.n), box: uni(head.map(o => o.b)), title: true }].concat(ent);
            if (tail.length) ent = ent.concat([{ nodes: tail.map(o => o.n), box: uni(tail.map(o => o.b)), title: true }]);
          }
        }
        if (ent) {
          const fsz = Math.max.apply(null, ent.map(e => e.box.h)) || 10, gap = fsz * 1.2, maxW = Math.max(P.w, (V ? V.w : P.w) * 0.9);
          const lines = [[]];
          let cx = 0;
          ent.forEach(e => { if (cx > 0 && cx + e.box.w > maxW) { lines.push([]); cx = 0; } lines[lines.length - 1].push(e); cx += e.box.w + gap; });
          const lh = fsz * 1.5, widths = lines.map(l => l.reduce((s, e) => s + e.box.w, 0) + gap * (l.length - 1));
          row = { lines, gap, lh, w: Math.max.apply(null, widths), h: lines.length * lh, widths, frames };
          X = P.x + (P.w - row.w) / 2; Y = bottom + pad * 2;
        } else { X = P.x + (P.w - b.w) / 2; Y = bottom + pad * 2; }
        const h = row ? row.h : b.h;
        if (V) { const need = Y + h + pad - (V.y + V.h); if (need > 0.5) grow = { h: need }; }
        break;
      }
      default: break;
    }
    X += L.ox || 0; Y += L.oy || 0;
    if (row) {
      /* cada entrada a su lugar en la fila (el título, la primera); el marco ya no la rodea: se esconde */
      row.frames.forEach(n => { keep(n, 'display'); n.style.setProperty('display', 'none'); });
      row.lines.forEach((l, i) => {
        let cx = X + (row.w - row.widths[i]) / 2;
        l.forEach(e => { moveNodes(svg, Mi, e.nodes, cx - e.box.x, Y + i * row.lh + (row.lh - e.box.h) / 2 - e.box.y); cx += e.box.w + row.gap; });
      });
    } else moveNodes(svg, Mi, lg.els, X - b.x, Y - b.y);
    /* fuera de la gráfica: el dibujo crece lo justo para que quepa */
    if (grow && V) {
      keepAttr(svg, 'viewBox'); keepAttr(svg, 'width'); keepAttr(svg, 'height');
      const nw = V.w + (grow.w || 0), nh = V.h + (grow.h || 0);
      svg.setAttribute('viewBox', [V.x, V.y, nw, nh].map(v => +v.toFixed(2)).join(' '));
      const wa = svg.getAttribute('width'), ha = svg.getAttribute('height');
      if (grow.w && wa && isFinite(parseFloat(wa)) && !/%/.test(wa)) svg.setAttribute('width', (parseFloat(wa) * nw / V.w).toFixed(1));
      if (grow.h && ha && isFinite(parseFloat(ha)) && !/%/.test(ha)) svg.setAttribute('height', (parseFloat(ha) * nh / V.h).toFixed(1));
      /* el fondo de la figura, si lo tiene, también */
      $$('rect', svg).filter(r => !r.closest(LEG_SKIP) && Math.abs((parseFloat(r.getAttribute('x')) || 0) - V.x) < 0.6 && Math.abs((parseFloat(r.getAttribute('y')) || 0) - V.y) < 0.6 && Math.abs(parseFloat(r.getAttribute('width')) - V.w) < 0.6 && Math.abs(parseFloat(r.getAttribute('height')) - V.h) < 0.6)
        .forEach(r => { keepAttr(r, 'width'); keepAttr(r, 'height'); r.setAttribute('width', nw.toFixed(2)); r.setAttribute('height', nh.toFixed(2)); });
    }
  }

  /* ---------------- el estudio ---------------- */
  const ST = {
    open: false, rec: null, el: null, lift: null, opener: null,
    layout: load('layout', 'right'), inspW: load('inspW', 384), float: load('float', null), sheet: 1,
    zoom: 'fit', pan: { x: 0, y: 0 }, aspect0: 0.62,
    compare: false, curtain: load('curtain', 50), before: null,
    cvd: '', exp: Object.assign({ w: 85, unit: 'mm', h: 0, dpi: 600, fmt: 'png', bg: 'white', colors: 'light', pdf: 'vec' }, load('exp', {})),
    fig: blankFig(), proxies: [], hist: [], hi: -1, secsOpen: load('secs', { app: true, palette: true, text: false, size: true, presets: false, history: false }),
    presets: load('presets', []).map(sinLabg),
    native: null, nativeAspect: null, nativeUrl: null, pvOn: load('nativePreview', true), pvKey: null,
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
    over.innerHTML = '<div class="lfs-guides"></div><div class="lfs-paperbox" hidden></div><img class="lfs-native" alt="" hidden><span class="lfs-native-tag" hidden></span><div class="lfs-ring"></div>' +
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
      /* una figura que la app ya reemplazó al redibujar: se abre la que ocupa su lugar */
      if (el && !el.isConnected && recs.get(el)) { const k = recs.get(el).key, now = figures().find(r => r.key === k && r.el.isConnected); if (now) el = now.el; }
      if (el && !/^(svg|canvas|img)$/i.test(el.tagName) && !(el.matches && el.matches(MAP_SEL))) el = $$('svg, canvas, img, ' + MAP_SEL, el).find(isFigEl) || null;
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
      ST.native = nativeFor(rec); ST.nativeAspect = null; ST.pvKey = null; ST.pvVer = 0; ST.firstPreview = true;
      ST.noLift = ADAPTERS[rec.lib].lift === false || !!(ST.native && ST.native.lift === false);
      document.documentElement.classList.add('lfs-is-open');
      studio.classList.add('on');
      if (hasPopover) { try { studio.showPopover(); } catch (e) { /* ya abierto */ } }
      applyLayoutClass();
      if (!ST.noLift) lift(el);
      $('.lfs-paperbox', over).hidden = !ST.noLift;
      if (hasPopover) { try { over.showPopover(); } catch (e) { /* nada */ } }
      over.classList.add('on');
      $('.lfs-figname', studio).textContent = natTitle();
      ST.open = true;
      render();
      place();
      markLegend();
      snapshotBefore();
      dock(true);
      schedulePreview(80);
      clearInterval(syncTimer); syncTimer = setInterval(syncProxies, 450);
      window.addEventListener('resize', onResize);
      document.addEventListener('keydown', onKey, true);
      setTimeout(() => { const b = $('[data-a="close"]', studio); if (b) b.focus(); }, 30);
      say(T('Estudio de figuras abierto: ', 'Figure studio open: ') + natTitle());
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
    clearTimeout(pvT); pvSeq++;
    showNative(false);
    if (ST.nativeUrl) { try { URL.revokeObjectURL(ST.nativeUrl); } catch (e) { /* nada */ } ST.nativeUrl = null; }
    if (over) { const ni = $('.lfs-native', over); ni.removeAttribute('src'); $('.lfs-paperbox', over).hidden = true; }
    ST.native = null; ST.nativeAspect = null; ST.pvKey = null; ST.noLift = false;
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
    paintLight();
  }
  function unlift() {
    if (figMo) { figMo.disconnect(); figMo = null; }
    unpaintLight();
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
    $$('[data-lfs-leg]', w).forEach(n => n.removeAttribute('data-lfs-leg'));
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
      if (ST.noLift) { ST.pvVer = (ST.pvVer || 0) + 1; ST.native = nativeFor(ST.rec) || ST.native; readout(); schedulePreview(); return; }
      relocate();
      if (!ST.el) return;
      ST.native = nativeFor(ST.rec);
      if (canStyle() && !isDefault(ST.fig) && !ST.el.hasAttribute('data-lfs-done')) styleSvg(ST.el, ST.fig);
      if (legOn(ST.fig)) { const a = ADAPTERS[ST.rec.lib].aspect(ST.el); if (a) ST.aspect0 = a; }
      markLegend();
      if (ST.lift && over && !$('.lfs-native', over).hidden) ST.lift.classList.add('lfs-under-native');
      place();
      readout();
      ring();
      schedulePreview();
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
  /* el nombre que da la app (el título de su mapa, por ejemplo); si no da ninguno, el de la página */
  function natTitle() {
    const N = ST.native;
    if (N && N.title != null) { try { const t = typeof N.title === 'function' ? N.title() : N.title; if (t) return String(TT(t)).slice(0, 120); } catch (e) { /* el de la página */ } }
    return ST.rec ? ST.rec.title : '';
  }
  function natAspect() {
    const N = ST.native;
    if (!N) return null;
    if (N.aspect != null) { try { const a = typeof N.aspect === 'function' ? N.aspect() : +N.aspect; if (a > 0 && isFinite(a)) return a; } catch (e) { /* la de la vista previa */ } }
    return ST.nativeAspect;
  }
  const expH = () => (ST.exp.h ? (ST.exp.unit === 'in' ? ST.exp.h * MM_IN : ST.exp.h) : expW() * (natAspect() || ST.aspect0));
  const expPx = () => ({ w: Math.max(1, Math.round(expW() / MM_IN * ST.exp.dpi)), h: Math.max(1, Math.round(expH() / MM_IN * ST.exp.dpi)) });

  /* la figura sobre el «papel» del tamaño de salida */
  let placeQ = false;
  function place() {
    if (placeQ) return;
    placeQ = true;
    raf(() => {
      placeQ = false;
      if (!ST.open || (!ST.lift && !ST.noLift)) return;
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
      const w = ST.lift || $('.lfs-paperbox', over);
      if (ST.lift) {
        w.style.setProperty('left', r.left + 'px', 'important');
        w.style.setProperty('top', r.top + 'px', 'important');
        w.style.setProperty('width', r.width + 'px', 'important');
        w.style.setProperty('height', r.height + 'px', 'important');
      } else Object.assign(w.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
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
      const ni = $('.lfs-native', over);
      Object.assign(ni.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
      const nt = $('.lfs-native-tag', over);
      Object.assign(nt.style, { left: (r.left + 8) + 'px', top: (r.top + 8) + 'px' });
    });
  }

  /* ---------------- vista previa a tamaño de salida (exportación nativa) ---------------- */
  let pvT = null, pvSeq = 0;
  function showNative(on) {
    if (!over) return;
    $('.lfs-native', over).hidden = !on;
    if (ST.lift) ST.lift.classList.toggle('lfs-under-native', !!on);
    const pb = $('.lfs-paperbox', over);
    if (pb) pb.classList.toggle('lfs-wait', !on && !!ST.noLift);
  }
  function nativeTag(text, busy) {
    if (!over) return;
    const t = $('.lfs-native-tag', over);
    t.hidden = !text; t.textContent = text || ''; t.classList.toggle('busy', !!busy);
  }
  function schedulePreview(delay) {
    if (!ST.open) return;
    if (!ST.native || ST.native.preview === false || !nativeCan(ST.native, 'png') || (!ST.pvOn && !ST.noLift)) { clearTimeout(pvT); showNative(false); nativeTag(''); return; }
    clearTimeout(pvT); pvT = setTimeout(runPreview, delay == null ? 450 : delay);
  }
  async function runPreview() {
    if (!ST.open || !ST.native || !ST.el) return;
    const N = ST.native;
    if (busy) { schedulePreview(600); return; }   /* mientras exporta, la vista previa espera */
    const wpx = ST.paper && ST.paper.width ? ST.paper.width : 800;
    const dpi = Math.round(clamp(wpx * (window.devicePixelRatio || 1) / (expW() / MM_IN), 60, 300));
    const key = (ST.el.getAttribute('src') || '').length + '|' + (ST.el.getAttribute('src') || '').slice(-80) + '|' + JSON.stringify([ST.pvVer || 0, +expW().toFixed(2), ST.exp.h ? +expH().toFixed(2) : 0, ST.exp.bg, dpi, (ST.fig && ST.fig.leg && ST.fig.leg.pos) || 'orig']);
    if (key === ST.pvKey && !$('.lfs-native', over).hidden) return;
    const seq = ++pvSeq;
    nativeTag(T('Dibujando a tamaño de salida…', 'Drawing at output size…'), true);
    try {
      const blob = asBlob(await N.render('png', nativeOpts('png', dpi)));
      if (!blob) throw new Error('sin imagen');
      if (seq !== pvSeq || !ST.open) return;
      const url = URL.createObjectURL(blob);
      const img = $('.lfs-native', over);
      await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = url; });
      if (seq !== pvSeq || !ST.open) { URL.revokeObjectURL(url); return; }
      if (ST.nativeUrl) URL.revokeObjectURL(ST.nativeUrl);
      ST.nativeUrl = url; ST.pvKey = key;
      if (!ST.exp.h && img.naturalWidth) ST.nativeAspect = img.naturalHeight / img.naturalWidth;
      /* sin figura elevada, la primera vista previa es el «antes» de la comparación */
      if (ST.noLift && ST.firstPreview) { ST.firstPreview = false; try { if (ST.before) URL.revokeObjectURL(ST.before); } catch (e) { /* nada */ } ST.before = URL.createObjectURL(blob); $('.lfs-before', over).src = ST.before; }
      showNative(true);
      $('.lfs-figname', studio).textContent = natTitle();
      nativeTag(T('Así sale: dibujada de nuevo por ', 'This is the output: drawn again by ') + (N.label || T('la app', 'the app')), false);
      place(); readout();
    } catch (e) {
      if (seq !== pvSeq) return;
      showNative(false);
      nativeTag(T('No se pudo dibujar la vista previa', 'The preview could not be drawn'), false);
      console.warn('LABG Estudio: vista previa nativa', e);
    }
  }
  /* formatos que la app añade a los cuatro del estudio (por ejemplo, GeoTIFF) y sus notas */
  const extraFmts = () => (ST.native && Array.isArray(ST.native.extra) ? ST.native.extra : []);
  const fmtLabel = f => { const x = extraFmts().find(e => e[0] === f); return x ? TT(x[1]) : f.toUpperCase(); };
  const fmtNote = f => { const n = ST.native && ST.native.notes && ST.native.notes[f]; return n ? TT(n) : ''; };
  function nativeOpts(fmt, dpi) {
    const wmm = expW(), hmm = ST.exp.h ? expH() : null, bg = ST.exp.bg;
    return { fmt, wmm, hmm, win: wmm / MM_IN, hin: hmm ? hmm / MM_IN : null, dpi: dpi || ST.exp.dpi, bg, transparent: bg === 'none', light: bg !== 'screen', legend: (ST.fig && ST.fig.leg && ST.fig.leg.pos) || 'orig' };
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
    return fmtN(w, 1) + ' × ' + fmtN(h, 1) + ' mm  ·  ' + fmtN(w / MM_IN, 2) + ' × ' + fmtN(h / MM_IN, 2) + ' in' + (ST.exp.fmt === 'svg' || pdfVec() ? '  ·  ' + T('vectorial', 'vector') : '  ·  ' + ST.exp.dpi + ' ' + T('ppp', 'dpi') + ' → ' + px.w + ' × ' + px.h + ' px');
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
    { id: 'legend', icon: 'list', title: T('Leyenda', 'Legend'), sub: T('del estudio', 'studio') },
    { id: 'size', icon: 'ruler', title: T('Tamaño y exportación', 'Size and export'), sub: '' },
    { id: 'presets', icon: 'wand-sparkles', title: T('Preajustes', 'Presets'), sub: '' },
    { id: 'history', icon: 'history', title: T('Historial', 'History'), sub: '' },
  ];
  function render() {
    const rec = ST.rec;
    const styl = canStyle();
    ST.legAvail = legendAvail();
    const html = SECTIONS().map(s => {
      if (s.id === 'docks') return '<div class="lfs-docks"></div>';
      if ((s.id === 'palette' || s.id === 'text') && !styl) return '';
      if (s.id === 'legend' && !ST.legAvail) return '';
      const openS = ST.secsOpen[s.id] !== false;
      return '<section class="lfs-sec" data-sec="' + s.id + '"><h3 class="lfs-sec-h"><button type="button" class="lfs-sec-btn" aria-expanded="' + openS + '" aria-controls="lfsSec-' + s.id + '">' + ico(s.icon) +
        '<span>' + esc(s.title) + '</span>' + (s.sub ? '<small>' + esc(s.sub) + '</small>' : '') + ico('chevron-down', 'lfs-chev') + '</button></h3>' +
        '<div class="lfs-sec-b" id="lfsSec-' + s.id + '"' + (openS ? '' : ' hidden') + '></div></section>';
    }).join('');
    body.innerHTML = html;
    renderApp(); renderPalette(); renderText(); renderLegend(); renderSize(); renderPresets(); renderHistory();
    paintUndo();
    readout();
    filter($('.lfs-search input', studio).value || '');
  }
  const secB = id => $('.lfs-sec[data-sec="' + id + '"] .lfs-sec-b', body);
  const row = (label, ctl, cls, extra) => '<div class="lfs-row' + (cls ? ' ' + cls : '') + '"' + (extra || '') + '><span class="lfs-lab">' + label + '</span><div class="lfs-ctl">' + ctl + '</div></div>';

  /* ----- ajustes de la app (reflejados) ----- */
  /* las ayudas «?» de la app no son ajustes de la figura: no van al inspector */
  const CTRL_SKIP = '.lfs-own, .lnav-own, .fig-tab, .fs-tab, .fig-ed, .fig-dl:not(div), .lfs-open, summary, .step-btn, [type="hidden"], [type="file"], .help-badge, .help-btn, .help-dot, .info-btn, .hint-btn, [data-help], [data-help-key]';
  function controlsIn(root) {
    return $$('select, input, textarea, button', root).filter(c => !c.matches(CTRL_SKIP) && !c.closest('.lfs-own, .lnav-own, .fe-panel, .fs-panel, .fig-menu'));
  }
  /* ¿la app escondió este control (o su fila) porque no aplica? */
  function hiddenIn(c, root) {
    for (let n = c; n && n !== root && n !== document.body; n = n.parentElement) {
      if (n.hidden || (n.style && n.style.display === 'none') || getComputedStyle(n).display === 'none') return true;
    }
    return false;
  }
  /* los controles de un panel con pestañas: un grupo por pestaña (con su nombre); si solo hay un
     panel que la app rehace al cambiar de pestaña, sus botones de pestaña van arriba, como fichas */
  function groupsFrom(root, title) {
    const panes = $$(':scope > .fig-opts, .fs-pane, .ms-pane, [role="tabpanel"]', root).filter((p, i, a) => !a.some(q => q !== p && q.contains(p)));
    if (panes.length > 1) {
      const tabs = $$('.fig-tab, .fs-tab, .ms-tab, [role="tab"]', root);
      const out = panes.map((p, i) => {
        const lab = p.getAttribute('aria-labelledby') ? document.getElementById(p.getAttribute('aria-labelledby')) : null;
        return { title: textOf(lab || tabs[i]) || T('Opciones', 'Options'), ctrls: controlsIn(p).filter(c => !hiddenIn(c, p)) };
      });
      const loose = controlsIn(root).filter(c => !panes.some(p => p.contains(c)) && !c.matches('.fig-tab, .fs-tab, .ms-tab, [role="tab"]') && !hiddenIn(c, root));
      if (loose.length) out.unshift({ title, ctrls: loose });
      return out;
    }
    return [{ title, ctrls: controlsIn(root).filter(c => !hiddenIn(c, root)) }];
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
    let more = CFG.controlsFor ? CFG.controlsFor(rec) : null, moreNode = null;
    if (!more && ST.native && ST.native.controls) more = typeof ST.native.controls === 'function' ? ST.native.controls(rec) : ST.native.controls;
    if (more) {
      const node = more.node || more, title = more.title ? TT(more.title) : T('Ajustes del bloque', 'Block settings');
      if (node && node.nodeType === 1) { moreNode = node; groupsFrom(node, title).forEach(g => groups.push(g)); }
    }
    /* los ajustes de la tarjeta donde vive la figura (fuera de otras figuras) */
    const card = host.closest('.card, .chart-card, .qc-section, section');
    if (card && card !== host) {
      const own = new Set(groups.flatMap(g => g.ctrls).concat(tc));
      const others = $$(CFG.hosts, card).filter(h => h !== host && !h.contains(host) && !host.contains(h));
      const cs = controlsIn(card).filter(c => !host.contains(c) && !own.has(c) && !(moreNode && moreNode.contains(c)) && !others.some(h => h.contains(c)) && mine(c) && !c.closest('details.fig-editor, .fig-tools') && !hiddenIn(c, card));
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
  const SEC_SEL = '.ms-sec, .fig-sec, fieldset';
  function secTitle(c) {
    const s = c.closest(SEC_SEL);
    const h = s && s.querySelector(':scope > h3, :scope > h4, :scope > h5, :scope > .ms-sec-h, :scope > legend');
    const t = h ? textOf(h).replace(/\s+/g, ' ').trim() : '';
    return t.length > 90 ? t.slice(0, 88) + '…' : t;
  }
  function renderApp(pre) {
    const b = secB('app');
    if (!b) return;
    ST.proxies = [];
    const groups = pre || appGroups(ST.rec);
    ST.appSig = groups.map(g => g.ctrls.length + ':' + g.title).join('|');
    if (!groups.length) {
      b.innerHTML = '<p class="lfs-note">' + esc(T('Esta figura no trae opciones propias: usa las del estudio (paleta, texto, tamaño) o el editor de la app si lo tiene.', 'This figure has no options of its own: use the studio’s (palette, text, size) or the app’s editor if it has one.')) + '</p>';
      return;
    }
    const radios = new Set();
    b.innerHTML = groups.map((g, gi) => { let last = ''; return '<div class="lfs-grp' + (g.kind ? ' lfs-grp-' + g.kind : '') + '"><h4>' + esc(g.title) + '</h4>' + g.ctrls.map(c => {
      if (c.type === 'radio') { if (radios.has(c.name)) return ''; radios.add(c.name); }
      const k = ST.proxies.length;
      ST.proxies.push({ n: c, g: gi });
      const st = secTitle(c), head = st && st !== last && fold(st) !== fold(g.title) ? '<p class="lfs-subh">' + esc(st) + '</p>' : '';
      if (st) last = st;
      const html = proxyHtml(c, k);
      return head + (st ? html.replace('<div class="lfs-row', '<div data-sec-t="' + esc(st) + '" class="lfs-row') : html);
    }).join('') + '</div>'; }).join('');
    syncProxies(true);
  }
  function proxyHtml(c, k) {
    const lab = esc(labelFor(c) || T('Opción', 'Option'));
    const tag = c.tagName, ty = (c.type || '').toLowerCase();
    const dis = c.disabled ? ' disabled' : '';
    if (tag === 'SELECT') return row(lab, '<select data-k="' + k + '"' + dis + '>' + c.innerHTML.replace(/\sid="[^"]*"/g, '') + '</select>', 'lfs-r-select');
    if (tag === 'TEXTAREA') return row(lab, '<textarea data-k="' + k + '" rows="2"' + dis + '></textarea>', 'lfs-r-text');
    if (tag === 'BUTTON' && c.matches(TAB_SEL)) return '<div class="lfs-row lfs-r-chip"><button type="button" class="lfs-pbtn" data-k="' + k + '"' + dis + '>' + esc(labelFor(c)) + '</button></div>';
    const bt = tag === 'BUTTON' && c.querySelector(':scope > b, :scope > strong'), sm = bt && c.querySelector(':scope > small');
    if (tag === 'BUTTON') return '<div class="lfs-row lfs-r-btn"><button type="button" class="lfs-pbtn' + (sm ? ' lfs-pbtn-2' : '') + '" data-k="' + k + '"' + dis + (c.getAttribute('aria-pressed') ? ' aria-pressed="' + c.getAttribute('aria-pressed') + '"' : '') + '>' + (c.querySelector('svg, i[style], span[style]') ? c.innerHTML.replace(/\sid="[^"]*"/g, '') : sm ? '<b>' + esc(textOf(bt).trim()) + '</b><small>' + esc(textOf(sm).trim()) + '</small>' : esc(labelFor(c))) + '</button></div>';
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
    let fresh = null;
    if (!gone && !force) { fresh = appGroups(ST.rec); if (fresh.map(g => g.ctrls.length + ':' + g.title).join('|') === ST.appSig) fresh = null; }
    if ((gone || fresh) && !force) { const sc = body.scrollTop; renderApp(fresh || undefined); body.scrollTop = sc; filter($('.lfs-search input', studio).value || ''); return; }
    ST.proxies.forEach((p, k) => {
      const px = body.querySelector('[data-k="' + k + '"]');
      if (!px || px === document.activeElement) return;
      const n = p.n;
      if (px.hasAttribute('data-radio')) { px.setAttribute('aria-pressed', String(!!n.checked)); return; }
      if (px.classList.contains('lfs-pbtn')) { const ap = n.getAttribute('aria-pressed'); if (ap) px.setAttribute('aria-pressed', ap); px.classList.toggle('on', n.classList.contains('on') || n.classList.contains('active') || n.getAttribute('aria-selected') === 'true'); px.disabled = n.disabled; return; }
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
      ok: () => !!(ownLook() && !ST.noLift && window.FigEdit && typeof window.FigEdit.show === 'function' && ST.el && ST.el.tagName.toLowerCase() === 'svg' && (ST.el.id || window.FigEdit.__labg)),
      open: anchor => { window.FigEdit.show(anchor, ST.el); return document.getElementById('figEditPanel') || $('.fe-panel'); },
      close: () => { try { window.FigEdit.hide(); } catch (e) { /* nada */ } },
    },
    {
      id: 'figstyle', icon: 'palette', title: () => T('Estilo de todas las figuras (de la app)', 'Style of every figure (the app’s)'),
      ok: () => !!(ownLook() && window.FigStyle && typeof window.FigStyle.show === 'function' && typeof window.FigStyle.hide === 'function'),
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
  /* ----- leyenda ----- */
  /* 'svg': el estudio la mueve en la figura · 'native': la app la vuelve a dibujar en su lugar · 'figedit': la mueve el editor ✎ acoplado */
  const LEG_CTRL = /(leyenda|legend)/i, LEG_WHERE = /(posici|ubicaci|lugar|sitio|position|location|place)/i;
  function appLegendCtrl() {
    try { return appGroups(ST.rec).reduce((a, g) => a.concat(g.ctrls), []).find(c => { const l = labelFor(c); return LEG_CTRL.test(l) && LEG_WHERE.test(l); }) || null; } catch (e) { return null; }
  }
  function legendAvail() {
    if (!ST.rec) return null;
    ST.legApp = appLegendCtrl();
    if (ST.legApp) return 'app';
    if (ST.native && ST.native.legend && ownLook() !== false && !ST.noLift) return 'native';
    if (!canStyle() || !ST.el || ST.el.tagName.toLowerCase() !== 'svg') return null;
    const lg = legendOf(ST.el);
    if (!lg) return null;
    if (lg.tagged && DOCKS[0].ok()) return 'figedit';
    return 'svg';
  }
  const LEG_IN = [['tl', 'Dentro, arriba a la izquierda', 'Inside, top left'], ['tc', 'Dentro, arriba al centro', 'Inside, top centre'], ['tr', 'Dentro, arriba a la derecha', 'Inside, top right'],
    ['ml', 'Dentro, a la izquierda', 'Inside, left'], ['orig', 'Donde la dibujó la app', 'Where the app drew it'], ['mr', 'Dentro, a la derecha', 'Inside, right'],
    ['bl', 'Dentro, abajo a la izquierda', 'Inside, bottom left'], ['bc', 'Dentro, abajo al centro', 'Inside, bottom centre'], ['br', 'Dentro, abajo a la derecha', 'Inside, bottom right']];
  const LEG_OUT = [['right', 'Fuera, a la derecha', 'Outside, right'], ['below', 'Debajo, en fila', 'Below, in a row']];
  const legName = p => { const x = LEG_IN.concat(LEG_OUT).find(e => e[0] === p); return x ? T(x[1], x[2]) : p === 'none' ? T('Oculta', 'Hidden') : p; };
  function renderLegend() {
    const b = secB('legend');
    if (!b) return;
    const av = ST.legAvail, L = ST.fig.leg || {}, pos = L.pos || 'orig';
    if (av === 'app') {
      b.innerHTML = '<p class="lfs-note">' + esc(T('Esta figura ya trae su propio control del lugar de la leyenda: «' + labelFor(ST.legApp) + '», en los ajustes de la figura. Úsalo ahí: la app la dibuja de nuevo en ese lugar.', 'This figure already has its own control for the place of the legend: “' + labelFor(ST.legApp) + '”, in the figure settings. Use it there: the app draws it again in that place.')) + '</p>' +
        '<div class="lfs-row lfs-r-btn"><button type="button" class="lfs-pbtn" data-leg="app">' + ico('list') + esc(T('Ir a ese control', 'Go to that control')) + '</button></div>';
      return;
    }
    if (av === 'figedit') {
      b.innerHTML = '<p class="lfs-note">' + esc(T('Esta leyenda la acomoda el editor ✎ de la app, acoplado más abajo en este panel: ahí está su pestaña «Leyenda», con ocho lugares, fila o columna, tamaño y marco.', 'This legend is placed by the app’s ✎ editor, docked further down in this panel: its “Legend” tab has eight places, row or column, size and frame.')) + '</p>' +
        '<div class="lfs-row lfs-r-btn"><button type="button" class="lfs-pbtn" data-leg="figedit">' + ico('list') + esc(T('Ir a la pestaña Leyenda', 'Go to the Legend tab')) + '</button></div>';
      return;
    }
    const outOk = av === 'native' || (ST.el && vbOf(ST.el) && !ST.el.hasAttribute('data-lfs-vb'));
    const cell = e => '<button type="button" class="lfs-legpos' + (e[0] === 'orig' ? ' lfs-legpos-o' : '') + '" data-leg="' + e[0] + '" aria-pressed="' + (pos === e[0]) + '" title="' + esc(T(e[1], e[2])) + '" aria-label="' + esc(T(e[1], e[2])) + '"><i></i></button>';
    b.innerHTML = row(T('Dentro de la gráfica', 'Inside the plot'), '<div class="lfs-leggrid" role="group" aria-label="' + esc(T('Lugar de la leyenda', 'Place of the legend')) + '">' + LEG_IN.map(cell).join('') + '</div>', 'lfs-r-leg') +
      row(T('Fuera de la gráfica', 'Outside the plot'), '<div class="lfs-seg lfs-legout">' + LEG_OUT.map(e => '<button type="button" data-leg="' + e[0] + '" aria-pressed="' + (pos === e[0]) + '"' + (outOk ? '' : ' disabled title="' + esc(T('Esta figura no tiene viewBox: la leyenda solo se mueve dentro', 'This figure has no viewBox: the legend only moves inside')) + '"') + '>' + esc(T(e[1], e[2])) + '</button>').join('') + '</div>', 'lfs-r-seg') +
      '<div class="lfs-row lfs-r-check"><label><input type="checkbox" data-leg="show"' + (pos !== 'none' ? ' checked' : '') + '><span>' + esc(T('Mostrar la leyenda', 'Show the legend')) + '</span></label></div>' +
      '<p class="lfs-note">' + esc(av === 'native' ? T('La app la vuelve a dibujar en ese lugar: se ve en la vista previa y sale así al exportar.', 'The app draws it again in that place: it shows in the preview and is exported that way.')
        : T('El centro de la cuadrícula la deja donde la dibujó la app. También se arrastra sobre la figura.', 'The centre of the grid leaves it where the app drew it. It can also be dragged on the figure.')) + '</p>' +
      ((L.ox || L.oy) ? '<div class="lfs-row lfs-r-btn"><button type="button" class="lfs-pbtn" data-leg="nudge0">' + ico('move') + esc(T('Quitar el ajuste a mano', 'Remove the hand adjustment')) + '</button></div>' : '');
  }
  /* un lugar nuevo empieza sin el ajuste a mano */
  function setLeg(next) {
    const L0 = Object.assign({ pos: 'orig' }, ST.fig.leg || {}), L1 = Object.assign({}, L0, next);
    if (next.pos && next.pos !== L0.pos && !('ox' in next)) { L1.ox = 0; L1.oy = 0; }
    if (L1.pos && L1.pos !== 'none') L1.last = L1.pos;
    const on = legOn({ leg: L1 });
    setFig({ leg: on ? L1 : null }, next.pos ? T('Leyenda: ', 'Legend: ') + legName(next.pos) : T('Leyenda: sin ajuste a mano', 'Legend: no hand adjustment'));
    renderLegend();
  }
  /* las piezas de la leyenda se arrastran sobre la figura */
  function markLegend() {
    if (!ST.open || !ST.el || ST.el.tagName.toLowerCase() !== 'svg') return;
    $$('[data-lfs-leg]', ST.el).forEach(n => n.removeAttribute('data-lfs-leg'));
    if (ST.legAvail !== 'svg') return;
    const lg = legendOf(ST.el);
    if (lg) lg.els.forEach(n => n.setAttribute('data-lfs-leg', ''));
  }
  /* ----- tamaño y exportación ----- */
  function renderSize() {
    const b = secB('size');
    if (!b || !ST.rec) return;
    if (['png', 'svg', 'pdf', 'tiff'].indexOf(ST.exp.fmt) < 0 && !extraFmts().some(x => x[0] === ST.exp.fmt)) ST.exp.fmt = 'png';
    const E = ST.exp, u = E.unit;
    const wv = fmtN(E.w, u === 'in' ? 2 : 1);
    const isVec = E.fmt === 'svg' || pdfVec();
    const lib = ST.rec.lib;
    b.innerHTML =
      row(T('Formato', 'Format'), '<div class="lfs-seg" role="radiogroup">' + ['png', 'svg', 'pdf', 'tiff'].concat(extraFmts().map(x => x[0])).map(f => '<button type="button" data-exp="fmt" data-v="' + f + '" aria-pressed="' + (E.fmt === f) + '"' + (fmtNote(f) ? ' title="' + esc(fmtNote(f)) + '"' : (f === 'svg' && lib !== 'svg' && !nativeCan(ST.native, 'svg') ? ' title="' + esc(T('Esta figura es una imagen: el SVG la lleva incrustada', 'This figure is an image: the SVG carries it embedded')) + '"' : '')) + '>' + esc(fmtLabel(f)) + '</button>').join('') + '</div>', 'lfs-r-seg') +
      /* el PDF de una figura SVG: trazos y texto, o la imagen a la resolución elegida */
      (E.fmt === 'pdf' && lib === 'svg' && !nativeFmt() ? row('PDF', '<div class="lfs-seg">' + [['vec', ['Vectorial', 'Vector'], ['Trazos y texto: se amplía sin perder nitidez, pesa poco y el texto se puede buscar', 'Paths and text: it scales without losing sharpness, it is light and the text can be searched']], ['img', ['Imagen', 'Image'], ['La figura como imagen, a la resolución elegida', 'The figure as an image, at the chosen resolution']]].map(([v, n, tip]) => '<button type="button" data-exp="pdf" data-v="' + v + '" aria-pressed="' + ((E.pdf || 'vec') === v) + '" title="' + esc(TT(tip)) + '">' + esc(TT(n)) + '</button>').join('') + '</div>', 'lfs-r-seg lfs-r-pdf') : '') +
      row(T('Ancho', 'Width'), '<div class="lfs-seg lfs-seg-w">' + WIDTHS.map(([mm, nm]) => '<button type="button" data-exp="wmm" data-v="' + mm + '" aria-pressed="' + (Math.abs(expW() - mm) < 0.5) + '" title="' + esc(TT(nm)) + '">' + mm + '</button>').join('') + '</div>' +
        '<input type="number" data-exp="w" min="' + (u === 'in' ? 0.5 : 10) + '" max="' + (u === 'in' ? 40 : 1000) + '" step="' + (u === 'in' ? 0.01 : 0.5) + '" value="' + wv + '"><select data-exp="unit"><option value="mm"' + (u === 'mm' ? ' selected' : '') + '>mm</option><option value="in"' + (u === 'in' ? ' selected' : '') + '>in</option></select>', 'lfs-r-w') +
      row(T('Alto', 'Height'), '<label class="lfs-inl"><input type="checkbox" data-exp="hauto"' + (E.h ? '' : ' checked') + '>' + esc(T('el de la figura', 'the figure’s')) + '</label><input type="number" data-exp="h" step="' + (u === 'in' ? 0.01 : 0.5) + '" value="' + fmtN(u === 'in' ? expH() / MM_IN : expH(), u === 'in' ? 2 : 1) + '"' + (E.h ? '' : ' disabled') + '>', 'lfs-r-h') +
      row(T('Resolución', 'Resolution'), '<div class="lfs-seg">' + [300, 600, 1200].map(d => '<button type="button" data-exp="dpi" data-v="' + d + '" aria-pressed="' + (E.dpi === d) + '"' + (isVec ? ' disabled' : '') + '>' + d + '</button>').join('') + '</div><small class="lfs-unit">' + esc(T('ppp', 'dpi')) + '</small>', 'lfs-r-seg') +
      row(T('Fondo', 'Background'), '<div class="lfs-seg">' + [['white', ['Blanco', 'White']], ['screen', ['Como se ve', 'As shown']], ['none', ['Transparente', 'Transparent']]].map(([v, n]) => '<button type="button" data-exp="bg" data-v="' + v + '" aria-pressed="' + (E.bg === v) + '">' + esc(TT(n)) + '</button>').join('') + '</div>', 'lfs-r-seg') +
      /* la app en tema oscuro: la figura puede salir con los colores del tema claro */
      (darkTheme() && lib === 'svg' && !nativeFmt() ? row(T('Colores', 'Colours'), '<div class="lfs-seg">' + [['light', ['Del tema claro', 'Light theme'], ['Como en el tema claro de la app, para papel', 'As in the app’s light theme, for paper']], ['screen', ['Como se ven', 'As shown'], ['Como se ven ahora, en tema oscuro', 'As they look now, in dark theme']]].map(([v, n, tip]) => '<button type="button" data-exp="colors" data-v="' + v + '" aria-pressed="' + ((E.colors || 'light') === v) + '" title="' + esc(TT(tip)) + '">' + esc(TT(n)) + '</button>').join('') + '</div>', 'lfs-r-seg lfs-r-colors') : '') +
      '<div class="lfs-readout"></div>' +
      (ST.native ? '<p class="lfs-note lfs-note-native">' + ico('check') + '<span>' + esc(T('La dibuja ' + (ST.native.label || 'la app') + ': al exportar, el estudio le pide la figura a este tamaño y resolución, no la amplía. En SVG y PDF sale vectorial y el texto conserva su tamaño en puntos.', 'Drawn by ' + (ST.native.label || 'the app') + ': on export the studio asks for the figure at this size and resolution instead of enlarging it. SVG and PDF come out as vectors and the text keeps its size in points.')) + '</span></p>' +
        (ST.native.preview !== false && nativeCan(ST.native, 'png') && !ST.noLift ? '<div class="lfs-row lfs-r-check"><label><input type="checkbox" data-exp="pv"' + (ST.pvOn ? ' checked' : '') + '><span>' + esc(T('Ver en el papel cómo sale a este tamaño', 'Show on the paper how it comes out at this size')) + '</span></label></div>' : '')
        : (lib !== 'svg' ? '<p class="lfs-note">' + esc(T('Esta figura es una imagen de píxeles: exportarla a más ppp no agrega detalle. Para más resolución usa la descarga de la app.', 'This figure is a pixel image: exporting it at a higher dpi adds no detail. For more resolution use the app’s own download.')) + '</p>' : '')) +
      '<div class="lfs-actions"><button type="button" class="lfs-btn lfs-btn-pri" data-a="export">' + ico('download') + esc(T('Exportar', 'Export')) + '</button><button type="button" class="lfs-btn" data-a="copy">' + ico('copy') + esc(T('Copiar imagen', 'Copy image')) + '</button><button type="button" class="lfs-btn" data-a="real">' + ico('ruler') + esc(T('Ver a tamaño real', 'View at real size')) + '</button></div>';
    readout();
  }
  const darkTheme = () => { const t = document.documentElement.getAttribute('data-theme'); return t === 'dark' || (t !== 'light' && !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches)); };
  /* ----- la app en tema oscuro: exportar con los colores del tema claro ----- */
  /* figuras SVG de la página; vale para lo que dibuja el estudio (lo nativo, como Python, los mapas o el PDF de
     SigmaPro, lo dibuja la app a su manera) */
  const lightOn = () => darkTheme() && ST.exp.colors !== 'screen' && !!ST.rec && ST.rec.lib === 'svg';
  /* ¿este formato lo dibuja la app? */
  const nativeFmt = () => !!ST.native && (nativeCan(ST.native, ST.exp.fmt) || (ST.exp.fmt === 'tiff' && nativeCan(ST.native, 'png')) || (ST.noLift && nativeCan(ST.native, 'png')));
  /* ¿el PDF sale vectorial? Una figura SVG que exporta el estudio, con «PDF: Vectorial» */
  const pdfVec = () => ST.exp.fmt === 'pdf' && ST.exp.pdf !== 'img' && !!ST.rec && ST.rec.lib === 'svg' && !nativeFmt();
  /* fn con el tema claro puesto un instante: no se pinta nada ni se avisa a nadie (no hay evento themechange) */
  function inLight(fn) {
    const html = document.documentElement, prev = html.getAttribute('data-theme');
    html.setAttribute('data-theme', 'light');
    try { return fn(); } finally { if (prev == null) html.removeAttribute('data-theme'); else html.setAttribute('data-theme', prev); }
  }
  /* las variables de la página que cambian en el tema claro, con su valor claro */
  function lightVars() {
    const cs = getComputedStyle(document.documentElement), names = [], dark = {}, out = {};
    for (let i = 0; i < cs.length; i++) { const p = cs[i]; if (p.slice(0, 2) === '--' && p.slice(0, 5) !== '--lfs') names.push(p); }
    names.forEach(n => { dark[n] = cs.getPropertyValue(n); });
    inLight(() => { const c2 = getComputedStyle(document.documentElement); names.forEach(n => { const v = c2.getPropertyValue(n); if (v !== dark[n]) out[n] = v; }); });
    return out;
  }
  /* la vista previa también en claros: esas variables, sobre la figura elevada y solo mientras está en el estudio */
  function paintLight() {
    const w = ST.lift, want = !!w && lightOn();
    if (ST.lightEl && (!want || ST.lightEl !== w)) unpaintLight();
    if (!want || ST.lightEl === w) return;
    const vars = lightVars();
    Object.keys(vars).forEach(n => w.style.setProperty(n, vars[n]));
    w.style.setProperty('color-scheme', 'light');
    ST.lightEl = w; ST.lightNames = Object.keys(vars);
  }
  function unpaintLight() {
    const w = ST.lightEl;
    if (!w) return;
    (ST.lightNames || []).forEach(n => w.style.removeProperty(n));
    w.style.removeProperty('color-scheme');
    ST.lightEl = null; ST.lightNames = null;
  }
  /* lo que dice la lectura del tamaño con la app en tema oscuro */
  function themeNote() {
    if (lightOn()) return '<span class="lfs-ok">' + ico('check') + esc(T('Sale con los colores del tema claro de la app; la pantalla sigue en oscuro.', 'Exported with the app’s light-theme colours; the screen stays dark.')) + '</span>';
    if (ST.exp.bg !== 'white') return '';
    return '<span class="lfs-warn">' + ico('info') + esc(ST.rec && ST.rec.lib === 'svg'
      ? T('Con los colores como se ven (tema oscuro), el texto claro casi no se lee sobre blanco: elige colores «Del tema claro» o el fondo «Como se ve».', 'With the colours as shown (dark theme), light text barely shows on white: choose “Light theme” colours or the “As shown” background.')
      : T('La app está en tema oscuro y esta figura es una imagen: sus colores no cambian al exportar. Para fondo blanco, cambia la app a tema claro o elige «Como se ve».', 'The app is in dark theme and this figure is an image: its colours do not change on export. For a white background, switch the app to light theme or choose “As shown”.')) + '</span>';
  }
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
    const pt = ST.noLift || !ownLook() ? null : minPt(ST.el);
    const px = expPx();
    const big = px.w * px.h > 150e6 || px.w > 16000 || px.h > 16000;
    if (r) {
      r.innerHTML = '<b>' + esc(fmtSize()) + '</b>' +
        (pt != null ? '<span class="' + (pt < 6 ? 'lfs-warn' : 'lfs-ok') + '">' + ico(pt < 6 ? 'info' : 'check') + esc(T('Texto más chico: ', 'Smallest text: ') + pt.toFixed(1) + ' pt' + (pt < 6 ? T(' — las revistas suelen pedir 6 a 8 pt; sube el tamaño del texto o usa un preajuste', ' — journals usually ask for 6 to 8 pt; raise the text size or use a preset') : '')) + '</span>' : '') +
        (ST.native ? '<span class="lfs-ok">' + ico('check') + esc(T('Se exporta dibujada de nuevo por ', 'Exported drawn again by ') + (ST.native.label || T('la app', 'the app')) + (nativeCan(ST.native, ST.exp.fmt) || nativeCan(ST.native, 'png') && (ST.exp.fmt === 'tiff' || ST.exp.fmt === 'pdf' || ST.noLift) ? '' : T(' (este formato sale de la imagen de la pantalla)', ' (this format comes from the screen image)'))) + '</span>' : '') +
        (pdfVec() ? '<span class="lfs-ok">' + ico('check') + esc(T('PDF vectorial: trazos y texto. El texto va con las letras estándar del PDF (sans, serif o mono).', 'Vector PDF: paths and text. The text uses the standard PDF fonts (sans, serif or mono).')) + '</span>' : '') +
        (fmtNote(ST.exp.fmt) ? '<span class="lfs-note-s">' + ico('info') + esc(fmtNote(ST.exp.fmt)) + '</span>' : '') +
        (darkTheme() && !nativeFmt() ? themeNote() : '') +
        (big && ST.exp.fmt !== 'svg' && !pdfVec() ? '<span class="lfs-warn">' + ico('info') + esc(T('Muy grande para el navegador: baja los ppp o el tamaño.', 'Too large for the browser: lower the dpi or the size.')) + '</span>' : '');
    }
    const p = $('.lfs-pt', body);
    if (p) p.innerHTML = pt != null ? '<span class="' + (pt < 6 ? 'lfs-warn' : 'lfs-ok') + '">' + esc(T('Al tamaño de salida, el texto más chico mide ', 'At the output size, the smallest text measures ') + pt.toFixed(1) + ' pt') + '</span>' : '';
    const info = $('.lfs-info', stage);
    if (info) info.textContent = (canStyle() ? T('Clic en la figura: su sección · Doble clic en un texto: cambiarlo · ', 'Click the figure: its section · Double-click a text: change it · ') : '') + T('Ctrl + rueda: zoom · B: antes y ahora · ?: atajos', 'Ctrl + wheel: zoom · B: before and now · ?: shortcuts');
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
  function undo() { if (ST.hi < 0) return; const h = ST.hist[ST.hi--]; h.undo(); bumpPreview(); renderHistory(); paintUndo(); say(T('Deshecho: ', 'Undone: ') + h.label); ring(); }
  function redo() { if (ST.hi >= ST.hist.length - 1) return; const h = ST.hist[++ST.hi]; h.redo(); bumpPreview(); renderHistory(); paintUndo(); say(T('Rehecho: ', 'Redone: ') + h.label); ring(); }
  function jump(k) { let n = 0; while (ST.hi > k && n++ < 400) undo(); while (ST.hi < k && n++ < 800) redo(); }
  function paintUndo() {
    const u = $('[data-a="undo"]', studio), r = $('[data-a="redo"]', studio);
    if (u) u.disabled = ST.hi < 0;
    if (r) r.disabled = ST.hi >= ST.hist.length - 1;
  }

  /* ---------------- cambios del estudio ---------------- */
  function putFig(st) {
    ST.fig = JSON.parse(JSON.stringify(st)); setFigState(ST.rec.key, ST.fig);
    if (ST.el && canStyle()) styleSvg(ST.el, ST.fig);
    refreshStudioSecs(); readout(); emitChange(); afterFigChange();
  }
  /* la leyenda fuera agranda el dibujo: el papel toma su nueva forma; la vista previa nativa, el nuevo lugar */
  function afterFigChange() {
    if (!ST.open || !ST.el) return;
    if (ST.rec && ST.rec.lib === 'svg' && !ST.noLift) {
      const a = ADAPTERS.svg.aspect(ST.el);
      if (a && Math.abs(a - ST.aspect0) > 1e-4) { ST.aspect0 = a; place(); }
      markLegend();
    }
    if (ST.native) schedulePreview();
    const lb = secB('legend'); if (lb) renderLegend();
  }
  function setFig(next, label) {
    const before = JSON.parse(JSON.stringify(ST.fig));
    const after = Object.assign(JSON.parse(JSON.stringify(ST.fig)), next);
    putFig(after);
    if (label) record(label, () => putFig(before), () => putFig(after));
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
    const put = e => { ST.exp = Object.assign({}, e); save('exp', ST.exp); paintLight(); renderSize(); place(); readout(); emitChange(); schedulePreview(); };
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
    if (over) { const ni = $('.lfs-native', over); ['p', 'd', 't', 'a'].forEach(x => ni.classList.toggle('lfs-cvd-' + x, x === k)); }
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
    if (p.minPt && ST.el && canStyle()) {
      /* el tamaño del texto que deja el más chico en minPt al tamaño de salida */
      const was = ST.fig.txt;
      styleSvg(ST.el, Object.assign({}, f, { txt: 1 }));
      const pt = minPt(ST.el);
      if (pt) f.txt = clamp(Math.round(Math.max(1, p.minPt / pt) * 20) / 20, 0.5, 3);
      else f.txt = was;
    }
    const afterE = Object.assign({}, e), afterF = JSON.parse(JSON.stringify(f));
    const put = (E, F) => { ST.exp = Object.assign({}, E); save('exp', ST.exp); ST.fig = JSON.parse(JSON.stringify(F)); setFigState(ST.rec.key, ST.fig); if (ST.el && canStyle()) styleSvg(ST.el, ST.fig); renderSize(); renderText(); refreshStudioSecs(); place(); readout(); emitChange(); };
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
          const pf = p.font === 'labg' ? 'sans' : p.font;
          if (FONTS.some(x => x[0] === pf)) q.font = pf;
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
      else if (k === 'colors') setExp({ colors: v }, T('Colores: ', 'Colours: ') + ex.textContent);
      else if (k === 'pdf') setExp({ pdf: v }, 'PDF: ' + ex.textContent);
      else if (k === 'wmm') setExp({ w: ST.exp.unit === 'in' ? +(+v / MM_IN).toFixed(2) : +v, h: 0 }, T('Ancho: ', 'Width: ') + v + ' mm');
      return;
    }
    const pg = e.target.closest('[data-preset]');
    if (pg) { applyPreset(pg.dataset.preset); return; }
    const del = e.target.closest('[data-del]');
    if (del) { ST.presets = ST.presets.filter(p => p.id !== del.dataset.del); save('presets', ST.presets); renderPresets(); return; }
    const hi = e.target.closest('[data-hist]');
    if (hi) { jump(+hi.dataset.hist); return; }
    const lgb = e.target.closest('button[data-leg]');
    if (lgb) {
      const v = lgb.dataset.leg;
      if (v === 'figedit') {
        const sec = $('.lfs-sec[data-sec="dock-figedit"]', body);
        if (sec) { const bb = sec.querySelector('.lfs-sec-b'); if (bb.hidden) sec.querySelector('.lfs-sec-btn').click(); const tab = sec.querySelector('.fe-tab[data-fe-tab="legend"], .fe-tab[data-tab="legend"]'); if (tab) tab.click(); body.scrollTo({ top: sec.offsetTop - 8, behavior: reduced() ? 'auto' : 'smooth' }); }
        return;
      }
      if (v === 'nudge0') { setLeg({ ox: 0, oy: 0 }); return; }
      if (v === 'app') {
        const k = ST.proxies.findIndex(p => p.n === ST.legApp), px = k >= 0 ? body.querySelector('[data-k="' + k + '"]') : null;
        if (px) { const sec = px.closest('.lfs-sec'), bb = sec && sec.querySelector('.lfs-sec-b'); if (bb && bb.hidden) sec.querySelector('.lfs-sec-btn').click(); px.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' }); try { px.focus({ preventScroll: true }); } catch (e) { px.focus(); } const r = px.closest('.lfs-row'); if (r) { r.classList.remove('lfs-pulse'); void r.offsetWidth; r.classList.add('lfs-pulse'); } }
        return;
      }
      setLeg({ pos: v });
      return;
    }
    const sst = e.target.closest('[data-st="fig-reset"]');
    if (sst) { setFig(blankFig(), T('Quitar lo del estudio', 'Remove the studio changes')); renderText(); return; }
    const tr = e.target.closest('[data-st="texts-reset"]');
    if (tr) { setFig({ texts: {} }, T('Textos originales', 'Original texts')); renderText(); return; }
    const pb = e.target.closest('.lfs-pbtn[data-k], [data-radio]');
    if (pb) {
      const p = ST.proxies[+pb.dataset.k];
      if (p && p.n.isConnected) { p.n.click(); ring(); setTimeout(() => syncProxies(), 60); bumpPreview(p.n); }
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
        bumpPreview(n);
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
    bumpPreview(n);
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
    if (t.dataset.leg === 'show') { const L = ST.fig.leg || {}; setLeg({ pos: t.checked ? (L.last && L.last !== 'none' ? L.last : 'orig') : 'none' }); return; }
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
    if (ex === 'pv') { ST.pvOn = t.checked; save('nativePreview', ST.pvOn); if (ST.pvOn) { ST.pvKey = null; schedulePreview(0); } else { showNative(false); nativeTag(''); } return; }
    if (ex === 'unit') {
      const u = t.value, f = u === 'in' ? 1 / MM_IN : MM_IN;
      if (u === ST.exp.unit) return;
      setExp({ unit: u, w: +(ST.exp.w * f).toFixed(u === 'in' ? 2 : 1), h: ST.exp.h ? +(ST.exp.h * f).toFixed(u === 'in' ? 2 : 1) : 0 }, T('Unidades: ', 'Units: ') + u);
    }
  }
  /* al pasar sobre un control, se resalta lo que cambia en la figura */
  function onInspHover(e) {
    const t = e.target;
    if (!ST.el || ST.noLift || ST.el.tagName.toLowerCase() !== 'svg') return;
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
    body.classList.toggle('lfs-filtering', words.length > 0);
    $$('.lfs-sec', body).forEach(sec => {
      const head = fold(sec.querySelector('.lfs-sec-btn').textContent);
      let any = false;
      $$('.lfs-row, .lfs-pal, .lfs-preset, .lfs-grp h4', sec).forEach(r => {
        const ok = !words.length || words.every(w => fold(r.textContent + ' ' + (r.getAttribute('data-sec-t') || '')).indexOf(w) >= 0 || head.indexOf(w) >= 0);
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
    if (ST.noLift) { $('.lfs-before', over).removeAttribute('src'); return; }
    try {
      if (el.tagName.toLowerCase() === 'svg') {
        const s = serialize(el, { forView: true, light: lightOn() });
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
  function onFigDown(e) {
    ST.downAt = { x: e.clientX, y: e.clientY, t: Date.now() };
    const leg = e.target && e.target.closest && e.target.closest('[data-lfs-leg]');
    if (!leg || !ST.open || e.button !== 0 || ST.legAvail !== 'svg') return;
    let M = null;
    try { M = ST.el.getScreenCTM(); } catch (err) { M = null; }
    if (!M) return;
    e.preventDefault();
    const L = Object.assign({ pos: 'orig' }, ST.fig.leg || {});
    const start = { x: e.clientX, y: e.clientY, ox: L.ox || 0, oy: L.oy || 0, fig: JSON.parse(JSON.stringify(ST.fig)), moved: false };
    let q = false;
    const move = ev => {
      if (!start.moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 3) return;
      start.moved = true;
      ST.fig.leg = Object.assign({}, L, { ox: +(start.ox + (ev.clientX - start.x) / (M.a || 1)).toFixed(1), oy: +(start.oy + (ev.clientY - start.y) / (M.d || 1)).toFixed(1) });
      if (!q) { q = true; raf(() => { q = false; styleSvg(ST.el, ST.fig); markLegend(); }); }
    };
    const up = () => {
      window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', up, true); window.removeEventListener('pointercancel', up, true);
      if (!start.moved) return;
      const after = JSON.parse(JSON.stringify(ST.fig)), before = start.fig;
      putFig(after);
      record(T('Leyenda: movida a mano', 'Legend: moved by hand'), () => putFig(before), () => putFig(after));
      ring();
    };
    window.addEventListener('pointermove', move, true); window.addEventListener('pointerup', up, true); window.addEventListener('pointercancel', up, true);
  }
  function onFigClick(e) {
    if (!ST.open || ST.noLift || (ST.rec && ST.rec.lib === 'map')) return;
    const d = ST.downAt;
    if (d && (Math.abs(e.clientX - d.x) > 4 || Math.abs(e.clientY - d.y) > 4)) return;
    const t = e.target;
    /* un clic sobre la figura abre la sección que la cambia */
    if (t.closest && t.closest('text')) openSec('text');
    else if (t.closest && (t.closest(SHAPES) && canStyle())) {
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
    if (!t || !canStyle() || t.children.length) return;
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
    if (lightOn()) return inLight(bgColor);   /* dentro, el tema ya es claro: no se repite */
    let n = ST.rec && ST.rec.host;
    while (n && n !== document.documentElement) {
      const c = getComputedStyle(n).backgroundColor;
      if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c;
      n = n.parentElement;
    }
    return '#ffffff';
  }
  /* un color mezclado con color-mix() se calcula como color(srgb r g b / a); se escribe como rgb(), que leen todos los programas */
  const normColor = v => v.indexOf('color(srgb') < 0 ? v : v.replace(/color\(srgb\s+([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)(?:\s*\/\s*([\d.]+%?))?\)/g, (m, r, g, b, a) => {
    const c = x => Math.round(Math.max(0, Math.min(1, +x)) * 255);
    if (a == null) return 'rgb(' + c(r) + ', ' + c(g) + ', ' + c(b) + ')';
    return 'rgba(' + c(r) + ', ' + c(g) + ', ' + c(b) + ', ' + (/%$/.test(a) ? parseFloat(a) / 100 : +a) + ')';
  });
  /* el SVG con sus estilos calculados escritos dentro, para que se vea igual fuera de la app
     (con o.light, los del tema claro aunque la app esté en oscuro) */
  function serialize(svg, o) {
    o = o || {};
    if (o.light) { const o2 = Object.assign({}, o, { light: false }); return inLight(() => serialize(svg, o2)); }
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
        out.push(p + ':' + normColor(v));
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
      const s = serialize(el, { pxW, pxH, light: lightOn() });
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
    for (let p = 8; p + 12 <= u8.length;) {
      const len = ((u8[p] << 24) | (u8[p + 1] << 16) | (u8[p + 2] << 8) | u8[p + 3]) >>> 0;
      const type = String.fromCharCode(u8[p + 4], u8[p + 5], u8[p + 6], u8[p + 7]);
      if (type === 'pHYs' && len === 9) {
        const out = u8.slice(), dv = new DataView(out.buffer);
        dv.setUint32(p + 8, ppm); dv.setUint32(p + 12, ppm); out[p + 16] = 1;
        dv.setUint32(p + 17, crc32(out.subarray(p + 4, p + 17)));
        return new Blob([out], { type: 'image/png' });
      }
      if (type === 'IDAT' || type === 'IEND') break;
      p += 12 + len;
    }
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
  /* ---------------- PDF vectorial (1.5.0) ---------------- */
  /* La figura SVG pasa al PDF como trazos y texto, no como imagen. Se escribe lo que el navegador ya resolvió: los
     estilos calculados, la transformación de cada elemento y la posición de cada carácter.
     El texto va con las letras estándar de PDF (sans, serif y mono, y Symbol para el griego y los signos), como en el
     dispositivo pdf() de R: no se incrustan, porque todo lector de PDF las trae. Cada tramo de texto ocupa justo el
     ancho que tiene en la pantalla. Un carácter que ninguna de esas letras trae (♀, ▼) sale como una imagen pequeña
     de ese carácter.
     Reproduce recortes, marcadores (flechas), degradados, tramas, transparencias, SVG anidados y halos de texto; los
     filtros (sombras), las máscaras y el HTML dentro del SVG no pasan, y el estudio lo avisa. */
  const vecPdf = (() => {
    /* letras estándar de PDF: anchos WinAnsi 32–255 (milésimas de em; de las métricas AFM públicas de las 14 letras) */
    const PDF_WIN = {
      'Helvetica': '7q,7q,9v,fg,fg,op,ij,5b,99,99,at,g8,7q,99,7q,7q,fg,fg,fg,fg,fg,fg,fg,fg,fg,fg,7q,7q,g8,g8,g8,fg,s7,ij,ij,k2,k2,ij,gz,lm,k2,7q,dw,ij,fg,n5,k2,lm,ij,lm,k2,ij,gz,k2,ij,q8,ij,ij,gz,7q,7q,7q,d1,fg,99,fg,fg,dw,fg,fg,7q,fg,fg,66,66,dw,66,n5,fg,fg,fg,fg,99,dw,7q,fg,dw,k2,dw,dw,dw,9a,78,9a,g8,0,fg,0,66,fg,99,rs,fg,fg,99,rs,ij,99,rs,0,gz,0,0,66,66,99,99,9q,fg,rs,99,rs,dw,99,q8,0,dw,ij,7q,99,fg,fg,fg,fg,78,fg,99,kh,aa,fg,g8,99,kh,99,b4,g8,99,99,99,fg,ex,7q,99,99,a5,fg,n6,n6,n6,gz,ij,ij,ij,ij,ij,ij,rs,k2,ij,ij,ij,ij,7q,7q,7q,7q,k2,k2,lm,lm,lm,lm,lm,g8,lm,k2,k2,k2,k2,ij,ij,gz,fg,fg,fg,fg,fg,fg,op,dw,fg,fg,fg,fg,7q,7q,7q,7q,fg,fg,fg,fg,fg,fg,fg,g8,gz,fg,fg,fg,fg,dw,fg,dw',
      'Helvetica-Bold': '7q,99,d6,fg,fg,op,k2,6m,99,99,at,g8,7q,99,7q,7q,fg,fg,fg,fg,fg,fg,fg,fg,fg,fg,99,99,g8,g8,g8,gz,r3,k2,k2,k2,k2,ij,gz,lm,k2,7q,fg,k2,gz,n5,k2,lm,ij,lm,k2,ij,gz,k2,ij,q8,ij,ij,gz,99,7q,99,g8,fg,99,fg,gz,fg,gz,fg,99,gz,gz,7q,7q,fg,7q,op,gz,gz,gz,gz,at,fg,99,gz,fg,lm,fg,fg,dw,at,7s,at,g8,0,fg,0,7q,fg,dw,rs,fg,fg,99,rs,ij,99,rs,0,gz,0,0,7q,7q,dw,dw,9q,fg,rs,99,rs,fg,99,q8,0,dw,ij,7q,99,fg,fg,fg,fg,7s,fg,99,kh,aa,fg,g8,99,kh,99,b4,g8,99,99,99,gz,fg,7q,99,99,a5,fg,n6,n6,n6,gz,k2,k2,k2,k2,k2,k2,rs,k2,ij,ij,ij,ij,7q,7q,7q,7q,k2,k2,lm,lm,lm,lm,lm,g8,lm,k2,k2,k2,k2,ij,ij,gz,fg,fg,fg,fg,fg,fg,op,fg,fg,fg,fg,fg,7q,7q,7q,7q,gz,gz,gz,gz,gz,gz,gz,g8,gz,gz,gz,gz,gz,fg,gz,fg',
      'Times-Roman': '6y,99,bc,dw,dw,n5,lm,50,99,99,dw,fo,6y,99,6y,7q,dw,dw,dw,dw,dw,dw,dw,dw,dw,dw,7q,7q,fo,fo,fo,cc,pl,k2,ij,ij,k2,gz,fg,k2,k2,99,at,k2,gz,op,k2,k2,fg,k2,ij,fg,gz,k2,k2,q8,k2,k2,gz,99,7q,99,d1,dw,99,cc,dw,cc,dw,cc,99,dw,dw,7q,7q,dw,7q,lm,dw,dw,dw,dw,99,at,7q,dw,dw,k2,dw,dw,cc,dc,5k,dc,f1,0,dw,0,99,dw,cc,rs,dw,dw,99,rs,fg,99,op,0,gz,0,0,99,99,cc,cc,9q,dw,rs,99,r8,at,99,k2,0,cc,k2,6y,99,dw,dw,dw,dw,5k,dw,99,l4,7o,dw,fo,99,l4,99,b4,fo,8c,8c,99,dw,cl,6y,99,8c,8m,dw,ku,ku,ku,cc,k2,k2,k2,k2,k2,k2,op,ij,gz,gz,gz,gz,99,99,99,99,k2,k2,k2,k2,k2,k2,k2,fo,k2,k2,k2,k2,k2,k2,fg,dw,cc,cc,cc,cc,cc,cc,ij,cc,cc,cc,cc,cc,7q,7q,7q,7q,dw,dw,dw,dw,dw,dw,dw,fo,dw,dw,dw,dw,dw,dw,dw,dw',
      'Times-Bold': '6y,99,ff,dw,dw,rs,n5,7q,99,99,dw,fu,6y,99,6y,7q,dw,dw,dw,dw,dw,dw,dw,dw,dw,dw,99,99,fu,fu,fu,dw,pu,k2,ij,k2,k2,ij,gz,lm,lm,at,dw,lm,ij,q8,k2,lm,gz,lm,k2,fg,ij,k2,k2,rs,k2,k2,ij,99,7q,99,g5,dw,99,dw,fg,cc,fg,cc,99,dw,fg,7q,99,fg,7q,n5,fg,dw,fg,fg,cc,at,99,fg,dw,k2,dw,dw,cc,ay,64,ay,eg,0,dw,0,99,dw,dw,rs,dw,dw,99,rs,fg,99,rs,0,ij,0,0,99,99,dw,dw,9q,dw,rs,99,rs,at,99,k2,0,cc,k2,6y,99,dw,dw,dw,dw,64,dw,99,kr,8c,dw,fu,99,kr,99,b4,fu,8c,8c,99,fg,f0,6y,99,8c,96,dw,ku,ku,ku,dw,k2,k2,k2,k2,k2,k2,rs,k2,ij,ij,ij,ij,at,at,at,at,k2,k2,lm,lm,lm,lm,lm,fu,lm,k2,k2,k2,k2,k2,gz,fg,dw,dw,dw,dw,dw,dw,k2,cc,cc,cc,cc,cc,7q,7q,7q,7q,dw,fg,dw,dw,dw,dw,dw,fu,dw,fg,fg,fg,fg,dw,fg,dw',
      'Times-Italic': '6y,99,bo,dw,dw,n5,lm,5y,99,99,dw,ir,6y,99,6y,7q,dw,dw,dw,dw,dw,dw,dw,dw,dw,dw,99,99,ir,ir,ir,dw,pk,gz,gz,ij,k2,gz,gz,k2,k2,99,cc,ij,fg,n5,ij,k2,gz,k2,gz,dw,fg,k2,gz,n5,gz,fg,fg,at,7q,at,bq,dw,99,dw,dw,cc,dw,cc,7q,dw,dw,7q,7q,cc,7q,k2,dw,dw,dw,dw,at,at,7q,dw,cc,ij,cc,cc,at,b4,7n,b4,f1,0,dw,0,99,dw,fg,op,dw,dw,99,rs,dw,99,q8,0,fg,0,0,99,99,fg,fg,9q,dw,op,99,r8,at,99,ij,0,at,fg,6y,at,dw,dw,dw,dw,7n,dw,99,l4,7o,dw,ir,99,l4,99,b4,ir,8c,8c,99,dw,ej,6y,99,8c,8m,dw,ku,ku,ku,dw,gz,gz,gz,gz,gz,gz,op,ij,gz,gz,gz,gz,99,99,99,99,k2,ij,k2,k2,k2,k2,k2,ir,k2,k2,k2,k2,k2,fg,gz,dw,dw,dw,dw,dw,dw,dw,ij,cc,cc,cc,cc,cc,7q,7q,7q,7q,dw,dw,dw,dw,dw,dw,dw,ir,dw,dw,dw,dw,dw,cc,dw,cc',
      'Times-BoldItalic': '6y,at,ff,dw,dw,n5,lm,7q,99,99,dw,fu,6y,99,6y,7q,dw,dw,dw,dw,dw,dw,dw,dw,dw,dw,99,99,fu,fu,fu,dw,n4,ij,ij,ij,k2,ij,ij,k2,lm,at,dw,ij,gz,op,k2,k2,gz,k2,ij,fg,gz,k2,ij,op,ij,gz,gz,99,7q,99,fu,dw,99,dw,dw,cc,dw,cc,99,dw,fg,7q,7q,dw,7q,lm,fg,dw,dw,dw,at,at,7q,fg,cc,ij,dw,cc,at,9o,64,9o,fu,0,dw,0,99,dw,dw,rs,dw,dw,99,rs,fg,99,q8,0,gz,0,0,99,99,dw,dw,9q,dw,rs,99,rs,at,99,k2,0,at,gz,6y,at,dw,dw,dw,dw,64,dw,99,kr,7e,dw,gu,99,kr,99,b4,fu,8c,8c,99,g0,dw,6y,99,8c,8c,dw,ku,ku,ku,dw,ij,ij,ij,ij,ij,ij,q8,ij,ij,ij,ij,ij,at,at,at,at,k2,k2,k2,k2,k2,k2,k2,fu,k2,k2,k2,k2,k2,gz,gz,dw,dw,dw,dw,dw,dw,dw,k2,cc,cc,cc,cc,cc,7q,7q,7q,7q,dw,fg,dw,dw,dw,dw,dw,fu,dw,fg,fg,fg,fg,cc,dw,cc',
    };
    /* glifos que esas letras traen fuera de WinAnsi: carácter, nombre y ancho en cada letra (Courier: 600) */
    const PDF_XU = '6dg:fraction,1dkx:fi,1dky:fl,k8:breve,k9:dotaccent,ka:ring,kd:hungarumlaut,kb:ogonek,jr:caron,8x:Lslash,8h:dotlessi,8y:lslash,77:abreve,a9:uhungarumlaut,7v:ecaron,ex:scommaaccent,a6:Uring,79:aogonek,ab:uogonek,7k:Dcroat,7m:Emacron,7h:ccaron,91:Ncommaaccent,8q:lacute,9u:Tcommaaccent,7a:Cacute,7q:Edotaccent,9r:scedilla,7gq:lozenge,9k:Rcaron,82:Gcommaaccent,74:Amacron,9l:rcaron,aj:Zdotaccent,98:Omacron,9g:Racute,9m:Sacute,7j:dcaron,a2:Umacron,a7:uring,76:Abreve,9w:Tcaron,6pu:partialdiff,8z:Nacute,7b:cacute,90:nacute,a3:umacron,93:Ncaron,7y:Gbreve,8g:Idotaccent,6q9:summation,9h:racute,99:omacron,ah:Zacute,6sl:greaterequal,8s:lcommaaccent,9x:tcaron,7t:eogonek,aa:Uogonek,ai:zacute,8f:iogonek,75:amacron,9n:sacute,6py:Delta,9d:ohungarumlaut,7s:Eogonek,7l:dcroat,9q:Scedilla,8u:lcaron,8m:Kcommaaccent,8p:Lacute,7r:edotaccent,8a:Imacron,8t:Lcaron,6sk:lessequal,a8:Uhungarumlaut,7n:emacron,7z:gbreve,ew:Scommaaccent,9c:Ohungarumlaut,7g:Ccaron,6qi:radical,7i:Dcaron,9j:rcommaaccent,9i:Rcommaaccent,8r:Lcommaaccent,78:Aogonek,ak:zdotaccent,7u:Ecaron,8e:Iogonek,8n:kcommaaccent,6qa:minus,94:ncaron,9v:tcommaaccent,6sg:notequal,83:gcommaaccent,92:ncommaaccent,8b:imacron';
    const PDF_XW = {
      'Helvetica': '4n,dw,dw,99,99,99,99,99,99,fg,7q,66,fg,fg,fg,dw,k2,fg,fg,k2,ij,dw,k2,66,gz,k2,ij,dw,d3,k2,lm,ij,99,gz,lm,k2,ij,hv,k2,fg,ij,gz,d8,k2,dw,fg,fg,k2,lm,7q,go,99,fg,gz,f9,66,8t,fg,k2,dw,66,fg,dw,h0,fg,ij,fg,ij,8b,ij,fg,fg,7q,fg,f9,k2,fg,fg,ij,lm,k2,cl,k2,99,k2,fg,ij,dw,ij,7q,dw,g8,fg,7q,f9,fg,fg,7q',
      'Helvetica-Bold': '4n,gz,gz,99,99,99,99,99,99,gz,7q,7q,fg,gz,fg,fg,k2,fg,gz,k2,ij,fg,k2,7q,gz,k2,ij,fg,dq,k2,lm,k2,at,gz,lm,k2,ij,kn,k2,gz,k2,gz,dq,k2,fg,gz,gz,k2,lm,7q,go,at,gz,gz,f9,7q,at,fg,k2,dw,7q,fg,fg,h0,gz,ij,gz,ij,b4,k2,gz,fg,7q,gz,f9,k2,fg,gz,ij,lm,k2,f9,k2,at,k2,gz,k2,dw,ij,7q,fg,g8,gz,99,f9,gz,gz,7q',
      'Times-Roman': '4n,fg,fg,99,99,99,99,99,99,gz,7q,7q,cc,dw,cc,at,k2,cc,dw,k2,gz,cc,k2,7q,gz,ij,gz,at,d3,ij,k2,k2,99,gz,k2,ij,fg,gc,k2,dw,k2,gz,d8,k2,cc,dw,dw,k2,k2,99,go,99,dw,gz,f9,7q,92,cc,k2,cc,7q,cc,at,h0,dw,gz,dw,fg,9k,k2,gz,cc,99,gz,f9,k2,cc,dw,fg,k2,ij,cl,k2,99,ij,gz,k2,cc,gz,99,dw,fo,dw,7q,f9,dw,dw,7q',
      'Times-Bold': '4n,fg,fg,99,99,99,99,99,99,ij,7q,7q,dw,fg,cc,at,k2,dw,fg,k2,ij,cc,k2,7q,ij,k2,ij,at,dq,k2,lm,k2,cc,ij,lm,k2,fg,io,k2,fg,k2,ij,dq,k2,cc,fg,fg,k2,lm,at,go,cc,dw,ij,f9,7q,bk,cc,k2,cc,7q,dw,at,h0,dw,ij,fg,fg,ay,lm,ij,cc,at,ij,f9,k2,cc,dw,fg,lm,k2,f9,k2,cc,k2,ij,k2,cc,ij,at,fg,fu,fg,99,f9,dw,fg,7q',
      'Times-Italic': '4n,dw,dw,99,99,99,99,99,99,fg,7q,7q,dw,dw,cc,at,k2,dw,dw,k2,gz,cc,ij,7q,fg,ij,gz,at,d3,gz,k2,gz,at,fg,k2,gz,dw,f4,k2,dw,gz,fg,d8,ij,cc,dw,dw,ij,k2,99,go,at,dw,fg,f9,7q,8c,cc,k2,at,7q,dw,at,h0,dw,gz,dw,dw,8c,ij,fg,cc,99,gz,f9,k2,cc,dw,dw,k2,ij,cl,k2,at,gz,fg,gz,at,gz,99,cc,ir,dw,7q,f9,dw,dw,7q',
      'Times-BoldItalic': '4n,fg,fg,99,99,99,99,99,99,gz,7q,7q,dw,fg,cc,at,k2,dw,fg,k2,ij,cc,k2,7q,gz,ij,ij,at,dq,ij,k2,ij,at,gz,k2,ij,fg,gw,k2,fg,ij,gz,dq,k2,cc,fg,fg,k2,k2,at,go,at,dw,gz,f9,7q,a6,cc,k2,at,7q,dw,at,h0,dw,ij,dw,fg,am,ij,gz,cc,at,gz,f9,k2,cc,dw,fg,k2,ij,f9,k2,at,ij,gz,ij,at,ij,at,dw,gu,fg,7q,f9,dw,fg,7q',
    };
    /* la letra Symbol: carácter, código y ancho */
    const PDF_SYM = 'pd:1t:k2,pe:1u:ij,pf:1z:gr,pg:1w:h0,ph:1x:gz,pi:2i:gz,pj:20:k2,pk:29:kl,pl:21:99,pm:23:k2,pn:24:j2,po:25:op,pp:26:k2,pq:2g:hx,pr:27:k2,ps:28:lc,pt:2a:fg,pv:2b:gg,pw:2c:gz,px:2d:j6,py:1y:l7,pz:1v:k2,q0:2h:m3,q1:2f:lc,q9:2p:hj,qa:2q:f9,qb:2v:bf,qc:2s:dq,qd:2t:c7,qe:3e:dq,qf:2w:gr,qg:35:eh,qh:2x:95,qi:2z:f9,qj:30:f9,qk:31:g0,ql:32:eh,qm:3c:dp,qn:33:f9,qo:34:f9,qp:36:f9,qq:2e:c7,qr:37:gr,qs:38:c7,qt:39:g0,qu:2u:eh,qv:2r:f9,qw:3d:j2,qx:3b:j2,r5:22:hj,r6:4h:h8,r9:2y:gr,ra:3a:jt,6cy:4i:6v,6cz:4y:bf,6dg:4k:4n,6j5:5d:j2,6jc:5f:rf,6jg:5e:m3,6k5:5c:mv,6mo:4s:rf,6mp:4t:gr,6mq:4u:rf,6mr:4v:gr,6ms:4r:sy,6np:5b:ia,6og:64:rf,6oh:65:gr,6oi:66:rf,6oj:67:gr,6ok:63:sy,6ps:y:jt,6pu:52:dq,6pv:10:f9,6px:5i:mv,6pz:5t:jt,6q0:5q:jt,6q1:5r:jt,6q3:13:c7,6q7:5x:mv,6q9:6d:jt,6qa:19:f9,6qf:16:dw,6qi:5y:f9,6ql:51:jt,6qm:4l:jt,6qo:5s:lc,6qv:61:gr,6qw:62:gr,6qx:5j:lc,6qy:5k:lc,6qz:6q:7m,6r8:2k:nz,6rg:3i:f9,6rp:1s:f9,6rs:57:f9,6sg:55:f9,6sh:56:f9,6sk:4j:f9,6sl:4z:f9,6te:5o:jt,6tf:5l:jt,6tg:5n:jt,6ti:5p:jt,6tj:5m:jt,6tx:5h:lc,6tz:5g:lc,6ud:2m:ia,6v9:5z:6y,6y1:69:95,6y2:6p:95,7gq:68:dq,7kw:4q:kx,7kz:4n:kx,7l1:4p:kx,7l2:4o:kx';
    /* descriptores: caja, alto de mayúsculas y de minúsculas, ascendente, descendente, inclinación y trazo vertical */
    const PDF_DESC = {
      'Helvetica': [-166, -225, 1000, 931, 718, 523, 718, -207, 0, 88],
      'Helvetica-Bold': [-170, -228, 1003, 962, 718, 532, 718, -207, 0, 140],
      'Times-Roman': [-168, -218, 1000, 898, 662, 450, 683, -217, 0, 84],
      'Times-Bold': [-168, -218, 1000, 935, 676, 461, 683, -217, 0, 139],
      'Times-Italic': [-169, -217, 1010, 883, 653, 441, 683, -217, -15.5, 76],
      'Times-BoldItalic': [-200, -218, 996, 921, 669, 462, 683, -217, -15, 121],
      'Courier': [-23, -250, 715, 805, 562, 426, 629, -157, 0, 51],
      'Symbol': [-180, -293, 1090, 1010, 0, 0, 0, 0, 0, 85],
    };
    const POOL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 127, 129, 141, 143, 144, 157];
    let FT = null;
    /* las tablas, descomprimidas la primera vez */
    function tables() {
      if (FT) return FT;
      const n36 = s => s.split(',').map(x => parseInt(x, 36));
      const win = {}, xw = {};
      Object.keys(PDF_WIN).forEach(k => { win[k] = n36(PDF_WIN[k]); });
      Object.keys(PDF_XW).forEach(k => { xw[k] = n36(PDF_XW[k]); });
      const u2w = new Map();
      for (let c = 32; c < 127; c++) u2w.set(c, c);
      for (let c = 0xA0; c <= 0xFF; c++) u2w.set(c, c);
      [0x20AC, 0, 0x201A, 0x192, 0x201E, 0x2026, 0x2020, 0x2021, 0x2C6, 0x2030, 0x160, 0x2039, 0x152, 0, 0x17D, 0, 0, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014, 0x2DC, 0x2122, 0x161, 0x203A, 0x153, 0, 0x17E, 0x178]
        .forEach((u, i) => { if (u) u2w.set(u, 0x80 + i); });
      const xu = PDF_XU.split(',').map(p => { const i = p.indexOf(':'); return [parseInt(p.slice(0, i), 36), p.slice(i + 1)]; });
      const u2x = new Map(); xu.forEach((x, i) => u2x.set(x[0], i));
      const sym = new Map(), symW = new Map();
      PDF_SYM.split(',').forEach(p => { const v = p.split(':').map(x => parseInt(x, 36)); sym.set(v[0], [v[1], v[2]]); symW.set(v[1], v[2]); });
      FT = { win, xw, u2w, xu, u2x, sym, symW };
      return FT;
    }
    /* la letra estándar que corresponde a la del SVG, y la que da sus anchos */
    function baseFont(cs) {
      const first = String(cs.fontFamily || '').split(',')[0].replace(/["']/g, '').trim().toLowerCase();
      const kind = /mono|courier|consol|menlo|monaco|code|cascadia|jetbrains/.test(first) ? 'mono'
        : (/serif/.test(first) && !/sans/.test(first)) || /times|georgia|garamond|cambria|palatino|book|baskerville|minion|charter|merriweather|crimson|lora|playfair|didot|bodoni|caslon|constantia|tinos|spectral|alegreya|vollkorn/.test(first) ? 'serif' : 'sans';
      const bold = (parseInt(cs.fontWeight, 10) || 400) >= 600, ital = /italic|oblique/.test(cs.fontStyle || '');
      if (kind === 'serif') return bold ? (ital ? 'Times-BoldItalic' : 'Times-Bold') : (ital ? 'Times-Italic' : 'Times-Roman');
      const b = kind === 'mono' ? 'Courier' : 'Helvetica';
      return b + (bold ? (ital ? '-BoldOblique' : '-Bold') : (ital ? '-Oblique' : ''));
    }
    const metricsOf = b => (/^Courier/.test(b) ? 'Courier' : b.replace('-BoldOblique', '-Bold').replace('-Oblique', ''));

    /* ----- geometría ----- */
    const ID = [1, 0, 0, 1, 0, 0];
    const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
    const inv = m => { const d = m[0] * m[3] - m[1] * m[2]; return d ? [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d] : ID.slice(); };
    const ap = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
    const dm = d => [d.a, d.b, d.c, d.d, d.e, d.f];
    const tr = (x, y) => [1, 0, 0, 1, x, y];
    const nf = v => { const r = Math.round(v * 10000) / 10000; return String(r === 0 || !isFinite(r) ? 0 : r); };
    const mat = m => m.map(nf).join(' ');
    /* las transformaciones del atributo, sin consolidate() (que reescribiría la lista) */
    const listM = l => { let m = ID; if (l) for (let i = 0; i < l.numberOfItems; i++) m = mul(m, dm(l.getItem(i).matrix)); return m; };
    const localT = el => (el.transform && el.transform.animVal ? listM(el.transform.animVal) : ID);
    /* un rectángulo de viewBox dentro de otro de w × h, con su preserveAspectRatio */
    function fitM(vb, par, w, h) {
      let sx = w / vb.width, sy = h / vb.height, tx = 0, ty = 0;
      const al = par ? par.align : 6;
      if (al !== 1) {
        const s = par && par.meetOrSlice === 2 ? Math.max(sx, sy) : Math.min(sx, sy);
        sx = sy = s;
        const ax = (al - 2) % 3, ay = Math.floor((al - 2) / 3);
        tx = (w - vb.width * s) * ax / 2; ty = (h - vb.height * s) * ay / 2;
      }
      return [sx, 0, 0, sy, tx - sx * vb.x, ty - sy * vb.y];
    }
    const KA = 0.5522847498307936;
    function ellS(cx, cy, rx, ry) {
      const kx = rx * KA, ky = ry * KA;
      return [['M', cx + rx, cy], ['C', cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry], ['C', cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy],
        ['C', cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry], ['C', cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy], ['Z']];
    }
    function rectS(x, y, w, h, rx, ry) {
      if (!(w > 0 && h > 0)) return null;
      rx = Math.min(Math.max(rx || 0, 0), w / 2); ry = Math.min(Math.max(ry || 0, 0), h / 2);
      if (!rx || !ry) return [['M', x, y], ['L', x + w, y], ['L', x + w, y + h], ['L', x, y + h], ['Z']];
      const kx = rx * KA, ky = ry * KA;
      return [['M', x + rx, y], ['L', x + w - rx, y], ['C', x + w - rx + kx, y, x + w, y + ry - ky, x + w, y + ry], ['L', x + w, y + h - ry],
        ['C', x + w, y + h - ry + ky, x + w - rx + kx, y + h, x + w - rx, y + h], ['L', x + rx, y + h], ['C', x + rx - kx, y + h, x, y + h - ry + ky, x, y + h - ry],
        ['L', x, y + ry], ['C', x, y + ry - ky, x + rx - kx, y, x + rx, y], ['Z']];
    }
    /* un arco elíptico de SVG como curvas de Bézier (notas de implementación de SVG, F.6) */
    function arcS(x1, y1, rx, ry, phi, fa, fs, x2, y2) {
      if (x1 === x2 && y1 === y2) return [];
      rx = Math.abs(rx); ry = Math.abs(ry);
      if (!rx || !ry) return [['L', x2, y2]];
      const p = phi * Math.PI / 180, cp = Math.cos(p), sp = Math.sin(p);
      const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
      const x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
      const lam = x1p * x1p / (rx * rx) + y1p * y1p / (ry * ry);
      if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s; }
      const rx2 = rx * rx, ry2 = ry * ry;
      const num = Math.max(0, rx2 * ry2 - rx2 * y1p * y1p - ry2 * x1p * x1p);
      let co = Math.sqrt(num / (rx2 * y1p * y1p + ry2 * x1p * x1p)) * (fa === fs ? -1 : 1);
      if (!isFinite(co)) co = 0;
      const cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
      const cx = cp * cxp - sp * cyp + (x1 + x2) / 2, cy = sp * cxp + cp * cyp + (y1 + y2) / 2;
      const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
      const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
      let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
      if (!fs && dt > 0) dt -= 2 * Math.PI; else if (fs && dt < 0) dt += 2 * Math.PI;
      const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9)), d = dt / n, k = 4 / 3 * Math.tan(d / 4);
      const pt = (u, v) => [cx + rx * u * cp - ry * v * sp, cy + rx * u * sp + ry * v * cp];
      const out = [];
      let t = t1;
      for (let i = 0; i < n; i++) {
        const c1 = Math.cos(t), s1 = Math.sin(t), c2 = Math.cos(t + d), s2 = Math.sin(t + d);
        const a = pt(c1 - k * s1, s1 + k * c1), b = pt(c2 + k * s2, s2 - k * c2), e = i === n - 1 ? [x2, y2] : pt(c2, s2);
        out.push(['C', a[0], a[1], b[0], b[1], e[0], e[1]]);
        t += d;
      }
      return out;
    }
    /* el atributo d de un trazado, en segmentos absolutos M, L, C y Z */
    const NUM = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y;
    function parsePath(d) {
      const out = [], n = d.length;
      let i = 0, cx = 0, cy = 0, sx = 0, sy = 0, lc = null, lq = null, cmd = null;
      const ws = () => { while (i < n) { const c = d.charCodeAt(i); if (c === 32 || c === 44 || (c >= 9 && c <= 13)) i++; else break; } };
      const num = () => { ws(); NUM.lastIndex = i; const m = NUM.exec(d); if (!m) return null; i = NUM.lastIndex; return +m[0]; };
      const flag = () => { ws(); const c = d[i]; if (c === '0' || c === '1') { i++; return +c; } return null; };
      const nums = k => { const a = []; for (let j = 0; j < k; j++) { const v = num(); if (v == null) return null; a.push(v); } return a; };
      for (;;) {
        ws();
        if (i >= n) break;
        const ch = d[i];
        if (/[MmZzLlHhVvCcSsQqTtAa]/.test(ch)) { cmd = ch; i++; } else if (!cmd) break;
        const rel = cmd >= 'a', C = cmd.toUpperCase();
        if (C === 'Z') { out.push(['Z']); cx = sx; cy = sy; lc = lq = null; cmd = null; continue; }
        if (C === 'M') { const a = nums(2); if (!a) break; cx = rel ? cx + a[0] : a[0]; cy = rel ? cy + a[1] : a[1]; sx = cx; sy = cy; out.push(['M', cx, cy]); cmd = rel ? 'l' : 'L'; lc = lq = null; }
        else if (C === 'L') { const a = nums(2); if (!a) break; cx = rel ? cx + a[0] : a[0]; cy = rel ? cy + a[1] : a[1]; out.push(['L', cx, cy]); lc = lq = null; }
        else if (C === 'H') { const v = num(); if (v == null) break; cx = rel ? cx + v : v; out.push(['L', cx, cy]); lc = lq = null; }
        else if (C === 'V') { const v = num(); if (v == null) break; cy = rel ? cy + v : v; out.push(['L', cx, cy]); lc = lq = null; }
        else if (C === 'C' || C === 'S') {
          const a = nums(C === 'C' ? 6 : 4); if (!a) break;
          const o = rel ? [cx, cy] : [0, 0];
          let x1, y1, x2, y2, x, y;
          if (C === 'C') { x1 = a[0] + o[0]; y1 = a[1] + o[1]; x2 = a[2] + o[0]; y2 = a[3] + o[1]; x = a[4] + o[0]; y = a[5] + o[1]; }
          else { x1 = lc ? 2 * cx - lc[0] : cx; y1 = lc ? 2 * cy - lc[1] : cy; x2 = a[0] + o[0]; y2 = a[1] + o[1]; x = a[2] + o[0]; y = a[3] + o[1]; }
          out.push(['C', x1, y1, x2, y2, x, y]); lc = [x2, y2]; lq = null; cx = x; cy = y;
        }
        else if (C === 'Q' || C === 'T') {
          const a = nums(C === 'Q' ? 4 : 2); if (!a) break;
          const o = rel ? [cx, cy] : [0, 0];
          let qx, qy, x, y;
          if (C === 'Q') { qx = a[0] + o[0]; qy = a[1] + o[1]; x = a[2] + o[0]; y = a[3] + o[1]; }
          else { qx = lq ? 2 * cx - lq[0] : cx; qy = lq ? 2 * cy - lq[1] : cy; x = a[0] + o[0]; y = a[1] + o[1]; }
          out.push(['C', cx + 2 / 3 * (qx - cx), cy + 2 / 3 * (qy - cy), x + 2 / 3 * (qx - x), y + 2 / 3 * (qy - y), x, y]);
          lq = [qx, qy]; lc = null; cx = x; cy = y;
        }
        else if (C === 'A') {
          const r = nums(3); if (!r) break;
          const fa = flag(), fs = flag(); if (fa == null || fs == null) break;
          const e = nums(2); if (!e) break;
          const x = rel ? cx + e[0] : e[0], y = rel ? cy + e[1] : e[1];
          arcS(cx, cy, r[0], r[1], r[2], fa, fs, x, y).forEach(s => out.push(s));
          cx = x; cy = y; lc = lq = null;
        }
      }
      return out;
    }
    function rxy(el) {
      const cs = getComputedStyle(el);
      const g = p => { const v = cs.getPropertyValue(p); if (!v || v === 'auto' || /%/.test(v)) return null; return parseFloat(v); };
      let rx = g('rx'), ry = g('ry');
      if (rx == null && ry == null) {
        rx = el.hasAttribute('rx') ? el.rx.animVal.value : null; ry = el.hasAttribute('ry') ? el.ry.animVal.value : null;
      }
      if (rx == null) rx = ry; if (ry == null) ry = rx;
      return [rx || 0, ry || 0];
    }
    const SHAPES = { rect: 1, circle: 1, ellipse: 1, line: 1, polyline: 1, polygon: 1, path: 1 };
    function geom(el, tag) {
      const v = a => el[a].animVal.value;
      try {
        if (tag === 'rect') { const r = rxy(el); return rectS(v('x'), v('y'), v('width'), v('height'), r[0], r[1]); }
        if (tag === 'circle') { const r = v('r'); return r > 0 ? ellS(v('cx'), v('cy'), r, r) : null; }
        if (tag === 'ellipse') { const rx = v('rx'), ry = v('ry'); return rx > 0 && ry > 0 ? ellS(v('cx'), v('cy'), rx, ry) : null; }
        if (tag === 'line') return [['M', v('x1'), v('y1')], ['L', v('x2'), v('y2')]];
        if (tag === 'polyline' || tag === 'polygon') {
          const P = el.animatedPoints || el.points;
          if (!P || !P.numberOfItems) return null;
          const s = [];
          for (let i = 0; i < P.numberOfItems; i++) { const p = P.getItem(i); s.push([i ? 'L' : 'M', p.x, p.y]); }
          if (tag === 'polygon') s.push(['Z']);
          return s;
        }
        if (tag === 'path') {
          let d = el.getAttribute('d');
          if (!d) { const c = getComputedStyle(el).getPropertyValue('d'); const m = /path\(\s*["']([^"']*)["']\s*\)/.exec(c || ''); d = m ? m[1] : ''; }
          const s = d ? parsePath(d) : null;
          return s && s.length ? s : null;
        }
      } catch (e) { return null; }
      return null;
    }
    /* el trazado en operadores de PDF; con m, ya llevado a la página */
    function pathOps(segs, m) {
      const o = [];
      const P = (x, y) => { if (!m) return nf(x) + ' ' + nf(y); const p = ap(m, x, y); return nf(p[0]) + ' ' + nf(p[1]); };
      for (const s of segs) {
        if (s[0] === 'M') o.push(P(s[1], s[2]) + ' m');
        else if (s[0] === 'L') o.push(P(s[1], s[2]) + ' l');
        else if (s[0] === 'C') o.push(P(s[1], s[2]) + ' ' + P(s[3], s[4]) + ' ' + P(s[5], s[6]) + ' c');
        else o.push('h');
      }
      return o.join('\n');
    }

    /* ----- color y pintura ----- */
    let cc = null;
    const cCache = new Map();
    function rgba(v) {
      if (!v || v === 'none' || v === 'transparent') return null;
      if (cCache.has(v)) return cCache.get(v);
      let r = null;
      const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(v);
      if (m) r = [+m[1] / 255, +m[2] / 255, +m[3] / 255, m[4] == null ? 1 : (/%$/.test(m[4]) ? parseFloat(m[4]) / 100 : +m[4])];
      else {
        /* color-mix(), oklch()…: el navegador lo pinta en un píxel y se lee */
        try {
          if (!cc) { const c = document.createElement('canvas'); c.width = c.height = 1; cc = c.getContext('2d', { willReadFrequently: true }); }
          cc.clearRect(0, 0, 1, 1); cc.fillStyle = '#000'; cc.fillStyle = v; cc.fillRect(0, 0, 1, 1);
          const d = cc.getImageData(0, 0, 1, 1).data;
          r = [d[0] / 255, d[1] / 255, d[2] / 255, d[3] / 255];
        } catch (e) { r = [0, 0, 0, 1]; }
      }
      if (r[3] <= 0) r = null;
      cCache.set(v, r);
      return r;
    }
    const byId = id => (id ? document.getElementById(id) || document.getElementById(decodeURIComponent(id)) : null);
    const urlId = v => { const m = /url\(\s*["']?#([^"')]+)["']?\s*\)/.exec(v || ''); return m ? m[1] : null; };
    const solid = c => ({ a: c[3], set: k => nf(c[0]) + ' ' + nf(c[1]) + ' ' + nf(c[2]) + ' ' + k, rgb: c });
    const clamp01 = v => (isFinite(v) ? Math.max(0, Math.min(1, v)) : 1);

    /* ----- el documento: letras, transparencias, patrones e imágenes que se van usando ----- */
    function mkRes(root) {
      const R = { fonts: new Map(), gsm: new Map(), pats: [], xos: [], notes: new Set(), stc: new Map(), root };
      R.font = base => { let f = R.fonts.get(base); if (!f) { f = { name: 'F' + (R.fonts.size + 1), base, slots: new Map() }; R.fonts.set(base, f); } return f.name; };
      R.slot = (base, xi) => { R.font(base); const f = R.fonts.get(base); if (f.slots.has(xi)) return f.slots.get(xi); if (f.slots.size >= POOL.length) return null; const c = POOL[f.slots.size]; f.slots.set(xi, c); return c; };
      R.gs = (ca, CA, bm) => { const k = nf(ca) + '|' + nf(CA) + '|' + (bm || ''); let n = R.gsm.get(k); if (!n) { n = 'G' + (R.gsm.size + 1); R.gsm.set(k, n); } return n; };
      R.pat = o => { R.pats.push(o); return 'P' + R.pats.length; };
      R.xo = o => { R.xos.push(o); return 'X' + R.xos.length; };
      return R;
    }
    /* un tramo con la transparencia que pide (fill, trazo y fusión) */
    const gsOp = (R, fa, sa, bm) => (fa < 0.999 || sa < 0.999 || bm ? '/' + R.gs(fa, sa, bm) + ' gs' : '');
    const BLEND = { multiply: 'Multiply', screen: 'Screen', overlay: 'Overlay', darken: 'Darken', lighten: 'Lighten', 'color-dodge': 'ColorDodge', 'color-burn': 'ColorBurn', 'hard-light': 'HardLight', 'soft-light': 'SoftLight', difference: 'Difference', exclusion: 'Exclusion', hue: 'Hue', saturation: 'Saturation', color: 'Color', luminosity: 'Luminosity' };
    const blendOf = cs => BLEND[cs.mixBlendMode] || '';

    /* degradados: un patrón de sombreado con su función de color */
    function lenOf(v, obb, ref) {
      if (v == null || v === '') return null;
      const s = String(v).trim();
      if (/%$/.test(s)) return parseFloat(s) / 100 * (obb ? 1 : ref);
      return parseFloat(s);
    }
    function gradPaint(g, el, M, R) {
      const A = {}, seen = new Set();
      let stops = null, n = g, gt = null;
      while (n && !seen.has(n)) {
        seen.add(n);
        ['x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'fx', 'fy', 'fr', 'gradientUnits', 'spreadMethod'].forEach(a => { if (A[a] == null && n.hasAttribute(a)) A[a] = n.getAttribute(a); });
        if (!gt && n.hasAttribute('gradientTransform') && n.gradientTransform) gt = listM(n.gradientTransform.animVal);
        if (!stops) { const s = Array.from(n.children).filter(c => c.tagName === 'stop'); if (s.length) stops = s; }
        const h = n.getAttribute('href') || n.getAttribute('xlink:href');
        n = h && h[0] === '#' ? byId(h.slice(1)) : null;
        if (n && !/Gradient$/.test(n.tagName)) n = null;
      }
      if (!stops) return null;
      const st = [];
      let last = 0;
      stops.forEach(s => {
        const cs = getComputedStyle(s);
        let o = String(s.getAttribute('offset') || '0').trim();
        o = /%$/.test(o) ? parseFloat(o) / 100 : parseFloat(o);
        o = Math.max(last, clamp01(isFinite(o) ? o : 0)); last = o;
        const c = rgba(cs.stopColor) || [0, 0, 0, 0];
        st.push({ o, c, a: c[3] * clamp01(+cs.stopOpacity) });
      });
      if (st.length === 1) return solid([st[0].c[0], st[0].c[1], st[0].c[2], st[0].a]);
      const obb = A.gradientUnits !== 'userSpaceOnUse';
      let bb = null;
      if (obb) { try { bb = el.getBBox(); } catch (e) { bb = null; } if (!bb || !bb.width || !bb.height) return solid([st[st.length - 1].c[0], st[st.length - 1].c[1], st[st.length - 1].c[2], st[st.length - 1].a]); }
      const vb = R.root.viewBox && R.root.viewBox.baseVal && R.root.viewBox.baseVal.width ? R.root.viewBox.baseVal : { width: R.root.clientWidth || 300, height: R.root.clientHeight || 150 };
      const W = vb.width, H = vb.height, D = Math.sqrt((W * W + H * H) / 2);
      let m = M;
      if (obb) m = mul(m, [bb.width, 0, 0, bb.height, bb.x, bb.y]);
      if (gt) m = mul(m, gt);
      let shade;
      if (g.tagName === 'linearGradient') {
        const x1 = lenOf(A.x1, obb, W) ?? 0, y1 = lenOf(A.y1, obb, H) ?? 0, x2 = lenOf(A.x2, obb, W) ?? (obb ? 1 : W), y2 = lenOf(A.y2, obb, H) ?? 0;
        shade = '/ShadingType 2 /Coords [' + [x1, y1, x2, y2].map(nf).join(' ') + ']';
      } else {
        const cx = lenOf(A.cx, obb, W) ?? (obb ? 0.5 : W / 2), cy = lenOf(A.cy, obb, H) ?? (obb ? 0.5 : H / 2), r = lenOf(A.r, obb, D) ?? (obb ? 0.5 : D / 2);
        const fx = lenOf(A.fx, obb, W) ?? cx, fy = lenOf(A.fy, obb, H) ?? cy, fr = lenOf(A.fr, obb, D) ?? 0;
        shade = '/ShadingType 3 /Coords [' + [fx, fy, fr, cx, cy, r].map(nf).join(' ') + ']';
      }
      if (A.spreadMethod && A.spreadMethod !== 'pad') R.notes.add('spread');
      /* la función: tramos lineales entre paradas; los de largo cero marcan un salto de color */
      const s2 = st.slice();
      if (s2[0].o > 0) s2.unshift(Object.assign({}, s2[0], { o: 0 }));
      if (s2[s2.length - 1].o < 1) s2.push(Object.assign({}, s2[s2.length - 1], { o: 1 }));
      const seg = [];
      for (let i = 0; i < s2.length - 1; i++) if (s2[i + 1].o > s2[i].o) seg.push([s2[i], s2[i + 1]]);
      if (!seg.length) seg.push([s2[0], s2[s2.length - 1]]);
      const f2 = (a, b) => '<< /FunctionType 2 /Domain [0 1] /C0 [' + a.c.slice(0, 3).map(nf).join(' ') + '] /C1 [' + b.c.slice(0, 3).map(nf).join(' ') + '] /N 1 >>';
      const fn = seg.length === 1 ? f2(seg[0][0], seg[0][1])
        : '<< /FunctionType 3 /Domain [0 1] /Functions [' + seg.map(x => f2(x[0], x[1])).join(' ') + '] /Bounds [' + seg.slice(1).map(x => nf(x[0].o)).join(' ') + '] /Encode [' + seg.map(() => '0 1').join(' ') + '] >>';
      const alphas = st.map(x => x.a);
      const aMin = Math.min.apply(null, alphas), aMax = Math.max.apply(null, alphas);
      if (aMax - aMin > 0.02) R.notes.add('stop-opacity');
      const name = R.pat({ dict: '<< /PatternType 2 /Shading << ' + shade + ' /ColorSpace /DeviceRGB /Function ' + fn + ' /Extend [true true] >> /Matrix [' + mat(m) + '] >>' });
      return { a: (aMin + aMax) / 2, set: k => (k === 'rg' ? '/Pattern cs /' + name + ' scn' : '/Pattern CS /' + name + ' SCN') };
    }
    /* tramas (<pattern>): un patrón de mosaico con su propio dibujo */
    function patPaint(p, el, M, R, depth) {
      if (depth > 2) return null;
      const A = {}, seen = new Set();
      let n = p, kids = null, pt = null, vbEl = null;
      while (n && !seen.has(n)) {
        seen.add(n);
        ['x', 'y', 'width', 'height', 'patternUnits', 'patternContentUnits', 'preserveAspectRatio'].forEach(a => { if (A[a] == null && n.hasAttribute(a)) A[a] = n.getAttribute(a); });
        if (!pt && n.hasAttribute('patternTransform') && n.patternTransform) pt = listM(n.patternTransform.animVal);
        if (!vbEl && n.hasAttribute('viewBox')) vbEl = n;
        if (!kids && n.children.length) kids = n;
        const h = n.getAttribute('href') || n.getAttribute('xlink:href');
        n = h && h[0] === '#' ? byId(h.slice(1)) : null;
        if (n && n.tagName !== 'pattern') n = null;
      }
      if (!kids) return null;
      const obb = A.patternUnits !== 'userSpaceOnUse', cobb = A.patternContentUnits === 'objectBoundingBox';
      let bb = { x: 0, y: 0, width: 0, height: 0 };
      if (obb || cobb) { try { bb = el.getBBox(); } catch (e) { return null; } }
      const L = (v, o, ref, b0, bs) => { const x = lenOf(v, o, ref); return x == null ? 0 : (o ? b0 + x * bs : x); };
      const X = L(A.x, obb, 1, bb.x, bb.width), Y = L(A.y, obb, 1, bb.y, bb.height);
      const Wt = obb ? (lenOf(A.width, true, 1) || 0) * bb.width : (lenOf(A.width, false, 1) || 0);
      const Ht = obb ? (lenOf(A.height, true, 1) || 0) * bb.height : (lenOf(A.height, false, 1) || 0);
      if (!(Wt > 0 && Ht > 0)) return null;
      let C = ID;
      if (vbEl && vbEl.viewBox.animVal && vbEl.viewBox.animVal.width > 0) C = fitM(vbEl.viewBox.animVal, vbEl.preserveAspectRatio && vbEl.preserveAspectRatio.animVal, Wt, Ht);
      else if (cobb) C = [bb.width, 0, 0, bb.height, 0, 0];
      const PM = mul(mul(M, pt || ID), tr(X, Y));
      const sub = [];
      defsWalk(kids, C, sub, R, { noClip: true, alpha: 1, depth: (depth || 0) + 1 });
      const name = R.pat({ tile: sub.join('\n'), dict: '/PatternType 1 /PaintType 1 /TilingType 1 /BBox [0 0 ' + nf(Wt) + ' ' + nf(Ht) + '] /XStep ' + nf(Wt) + ' /YStep ' + nf(Ht) + ' /Matrix [' + mat(PM) + ']' });
      return { a: 1, set: k => (k === 'rg' ? '/Pattern cs /' + name + ' scn' : '/Pattern CS /' + name + ' SCN') };
    }
    function paintOf(v, el, M, R, ctx, depth) {
      if (!v || v === 'none') return null;
      if (/^context-fill/.test(v)) return ctx && ctx.cFill || null;
      if (/^context-stroke/.test(v)) return ctx && ctx.cStroke || null;
      const id = urlId(v);
      if (id) {
        const g = byId(id);
        let p = null;
        if (g && /Gradient$/.test(g.tagName)) p = gradPaint(g, el, M, R);
        else if (g && g.tagName === 'pattern') p = patPaint(g, el, M, R, depth || 0);
        if (p) return p;
        const fb = v.replace(/url\([^)]*\)/, '').trim();
        const c = fb && fb !== 'none' ? rgba(fb) : null;
        return c ? solid(c) : null;
      }
      const c = rgba(v);
      return c ? solid(c) : null;
    }
    function strokeW(cs, R) {
      const v = cs.strokeWidth || '1';
      const n = parseFloat(v);
      if (!/%$/.test(v)) return n;
      const vb = R.root.viewBox && R.root.viewBox.baseVal && R.root.viewBox.baseVal.width ? R.root.viewBox.baseVal : { width: R.root.clientWidth, height: R.root.clientHeight };
      return n / 100 * Math.sqrt((vb.width * vb.width + vb.height * vb.height) / 2);
    }
    function lineStyle(cs, sw) {
      const cap = { round: 1, square: 2 }[cs.strokeLinecap] || 0;
      const join = { round: 1, bevel: 2, arcs: 1 }[cs.strokeLinejoin] || 0;
      let s = nf(sw) + ' w ' + cap + ' J ' + join + ' j ' + nf(Math.max(1, parseFloat(cs.strokeMiterlimit) || 4)) + ' M';
      const da = String(cs.strokeDasharray || 'none');
      if (da !== 'none') {
        let a = da.split(/[\s,]+/).filter(Boolean).map(parseFloat);
        if (a.length && a.every(x => isFinite(x) && x >= 0) && a.some(x => x > 0)) {
          if (a.length % 2) a = a.concat(a);
          s += ' [' + a.map(nf).join(' ') + '] ' + nf(parseFloat(cs.strokeDashoffset) || 0) + ' d';
        }
      }
      return s;
    }
    /* recorte (clip-path): el trazado de cada hijo de <clipPath>, ya en la página */
    function clipOps(el, cs, M, R, depth) {
      const id = urlId(cs.clipPath);
      if (!id) return '';
      const cp = byId(id);
      if (!cp || cp.tagName !== 'clipPath' || (depth || 0) > 3) return '';
      let base = mul(M, localT(cp));
      if (cp.clipPathUnits && cp.clipPathUnits.animVal === 2) {
        let bb = null; try { bb = el.getBBox(); } catch (e) { bb = null; }
        if (!bb) return '';
        base = mul(base, [bb.width, 0, 0, bb.height, bb.x, bb.y]);
      }
      const parts = [];
      let rule = 'W';
      const add = (node, m) => {
        for (const ch of node.children) {
          const tag = ch.tagName;
          const ccs = getComputedStyle(ch);
          if (ccs.display === 'none' || ccs.visibility === 'hidden') continue;
          const mc = mul(m, localT(ch));
          let segs = null;
          if (tag === 'use') {
            const h = ch.getAttribute('href') || ch.getAttribute('xlink:href'), t = h && h[0] === '#' ? byId(h.slice(1)) : null;
            if (t && SHAPES[t.tagName]) { const m2 = mul(mul(mc, tr(ch.x.animVal.value, ch.y.animVal.value)), localT(t)); const s = geom(t, t.tagName); if (s) parts.push(pathOps(s, m2)); }
            continue;
          }
          if (tag === 'text') { try { const b = ch.getBBox(); segs = rectS(b.x, b.y, b.width, b.height); } catch (e) { segs = null; } }
          else if (SHAPES[tag]) segs = geom(ch, tag);
          if (!segs) continue;
          if (ccs.clipRule === 'evenodd') rule = 'W*';
          parts.push(pathOps(segs, mc));
        }
      };
      add(cp, base);
      /* un clipPath con su propio recorte: se cortan los dos */
      const inner = clipOps(el, getComputedStyle(cp), M, R, (depth || 0) + 1);
      return (inner ? inner + '\n' : '') + (parts.length ? parts.join('\n') + '\n' + rule + ' n' : '0 0 m 0 0 l h W n');
    }

    /* ----- marcadores (las flechas de un trazado) ----- */
    function vertices(segs) {
      const V = [];
      let px = 0, py = 0, sx = 0, sy = 0;
      const dir = (x0, y0, x1, y1) => Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI;
      for (const s of segs) {
        if (s[0] === 'M') { V.push({ x: s[1], y: s[2], inA: null, outA: null }); px = sx = s[1]; py = sy = s[2]; continue; }
        let x, y, a0, a1;
        if (s[0] === 'L' || s[0] === 'Z') { x = s[0] === 'L' ? s[1] : sx; y = s[0] === 'L' ? s[2] : sy; a0 = a1 = dir(px, py, x, y); }
        else {
          x = s[5]; y = s[6];
          a0 = (s[1] !== px || s[2] !== py) ? dir(px, py, s[1], s[2]) : (s[3] !== px || s[4] !== py) ? dir(px, py, s[3], s[4]) : dir(px, py, x, y);
          a1 = (x !== s[3] || y !== s[4]) ? dir(s[3], s[4], x, y) : (x !== s[1] || y !== s[2]) ? dir(s[1], s[2], x, y) : dir(px, py, x, y);
        }
        const prev = V[V.length - 1];
        if (prev && prev.outA == null) prev.outA = a0;
        V.push({ x, y, inA: a1, outA: null });
        px = x; py = y;
      }
      return V;
    }
    const angAt = v => {
      if (v.inA == null) return v.outA || 0;
      if (v.outA == null) return v.inA;
      let d = v.outA - v.inA;
      while (d > 180) d -= 360;
      while (d <= -180) d += 360;
      return v.inA + d / 2;
    };
    function markers(el, cs, segs, M, sw, cFill, cStroke, out, R, alpha) {
      const ids = [urlId(cs.markerStart), urlId(cs.markerMid), urlId(cs.markerEnd)];
      if (!ids[0] && !ids[1] && !ids[2]) return;
      const V = vertices(segs);
      if (!V.length) return;
      V.forEach((v, i) => {
        const which = i === 0 ? 0 : i === V.length - 1 ? 2 : 1;
        const mk = byId(ids[which]);
        if (!mk || mk.tagName !== 'marker') return;
        const mw = mk.markerWidth.animVal.value, mh = mk.markerHeight.animVal.value;
        if (!(mw > 0 && mh > 0)) return;
        const o = mk.getAttribute('orient') || '0';
        let a = angAt(v);
        if (o === 'auto-start-reverse') { if (which === 0) a += 180; }
        else if (o !== 'auto') {
          const m2 = /^\s*([-+\d.eE]+)\s*(deg|rad|grad|turn)?/.exec(o);
          a = m2 ? +m2[1] * ({ rad: 180 / Math.PI, grad: 0.9, turn: 360 }[m2[2]] || 1) : 0;
        }
        const vb = mk.viewBox.animVal;
        const VB = vb && vb.width > 0 && vb.height > 0 ? fitM(vb, mk.preserveAspectRatio.animVal, mw, mh) : ID;
        const ref = ap(VB, mk.refX.animVal.value, mk.refY.animVal.value);
        const s = mk.markerUnits.animVal === 1 ? 1 : sw;
        const r = a * Math.PI / 180;
        const Mm = mul(M, mul(tr(v.x, v.y), mul([Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0], mul([s, 0, 0, s, 0, 0], tr(-ref[0], -ref[1])))));
        const sub = [];
        defsWalk(mk, mul(Mm, VB), sub, R, { noClip: true, alpha, cFill, cStroke, noMarkers: true, depth: 1 });
        if (!sub.length) return;
        const mcs = getComputedStyle(mk);
        out.push('q');
        if (!/visible|auto/.test(mcs.overflow || 'hidden')) out.push(pathOps(rectS(0, 0, mw, mh), Mm) + '\nW n');
        out.push(sub.join('\n'), 'Q');
      });
    }

    /* ----- figuras ----- */
    function shape(el, cs, segs, M, out, R, ctx) {
      if (cs.visibility === 'hidden' || cs.visibility === 'collapse') return;
      const tag = el.tagName;
      const op = clamp01(+cs.opacity) * (ctx && ctx.alpha != null ? ctx.alpha : 1);
      if (op <= 0) return;
      let fp = tag === 'line' ? null : paintOf(cs.fill, el, M, R, ctx, ctx && ctx.depth);
      const sw = strokeW(cs, R);
      let sp = sw > 0 ? paintOf(cs.stroke, el, M, R, ctx, ctx && ctx.depth) : null;
      const hasMk = !(ctx && ctx.noMarkers) && /path|line|polyline|polygon/.test(tag) && [cs.markerStart, cs.markerMid, cs.markerEnd].some(v => v && v !== 'none');
      if (!fp && !sp && !hasMk) return;
      let group = op < 0.999 && ((fp && sp) || hasMk);
      const k = group ? 1 : op;
      const fa = fp ? fp.a * clamp01(+cs.fillOpacity) * k : 1, sa = sp ? sp.a * clamp01(+cs.strokeOpacity) * k : 1;
      if (fp && fa <= 0.001) fp = null;
      if (sp && sa <= 0.001) sp = null;
      if (!fp && !sp && !hasMk) return;
      group = group && ((fp && sp) || hasMk);
      const bm = blendOf(cs);
      const clip = ctx && ctx.noClip ? '' : clipOps(el, cs, M, R);
      if (cs.filter && cs.filter !== 'none') R.notes.add('filter');
      if ((cs.maskImage && cs.maskImage !== 'none') || (cs.mask && cs.mask !== 'none')) R.notes.add('mask');
      const body = [];
      const nonScaling = cs.vectorEffect === 'non-scaling-stroke';
      const P = pathOps(segs, nonScaling ? M : null);
      const fillOp = cs.fillRule === 'evenodd' ? 'f*' : 'f';
      if (!nonScaling) body.push(mat(M) + ' cm');
      if (sp) body.push(lineStyle(cs, nonScaling ? sw * 0.75 : sw), sp.set('RG'));
      if (fp) body.push(fp.set('rg'));
      const strokeFirst = /^\s*(stroke|markers\s+stroke)/.test(cs.paintOrder || '');
      if (fp && sp && !strokeFirst) body.push(P, cs.fillRule === 'evenodd' ? 'B*' : 'B');
      else if (fp && sp) body.push(P, 'S', P, fillOp);
      else if (fp) body.push(P, fillOp);
      else if (sp) body.push(P, 'S');
      const paintIt = o2 => {
        if (fp || sp) { o2.push('q'); const g = gsOp(R, fp ? fa : 1, sp ? sa : 1, group ? '' : bm); if (g) o2.push(g); o2.push(body.join('\n'), 'Q'); }
        if (hasMk) markers(el, cs, segs, M, sw, fp, sp, o2, R, group ? 1 : op);
      };
      if (group) {
        const sub = [];
        paintIt(sub);
        if (!sub.length) return;
        out.push('q'); if (clip) out.push(clip);
        out.push('/' + R.gs(op, op, bm) + ' gs /' + R.xo({ form: sub.join('\n') }) + ' Do', 'Q');
        return;
      }
      if (!clip) { paintIt(out); return; }
      out.push('q', clip); paintIt(out); out.push('Q');
    }
    /* lo de <marker> y <pattern>: no se dibuja en su lugar, así que sus transformaciones se calculan aquí */
    function defsWalk(node, M, out, R, ctx) {
      for (const el of node.children) {
        const tag = el.tagName;
        if (NOREND[tag]) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none') continue;
        const Me = mul(M, localT(el));
        if (tag === 'g' || tag === 'a') { defsWalk(el, Me, out, R, Object.assign({}, ctx, { alpha: (ctx.alpha == null ? 1 : ctx.alpha) * clamp01(+cs.opacity) })); continue; }
        if (SHAPES[tag]) { const s = geom(el, tag); if (s) shape(el, cs, s, Me, out, R, ctx); continue; }
        if (tag === 'text') R.notes.add('defs-text');
      }
    }
    const NOREND = { defs: 1, clipPath: 1, mask: 1, marker: 1, pattern: 1, linearGradient: 1, radialGradient: 1, symbol: 1, style: 1, title: 1, desc: 1, metadata: 1, script: 1, filter: 1, stop: 1, view: 1, animate: 1, animateMotion: 1, animateTransform: 1, set: 1, mpath: 1 };

    /* ----- texto ----- */
    const ZW = u => (u >= 0x200B && u <= 0x200F) || u === 0x2028 || u === 0x2029 || (u >= 0x2060 && u <= 0x2064) || u === 0xFEFF;
    const SPC = u => (u >= 0x2000 && u <= 0x200A) || u === 0x202F || u === 0x205F || u === 0x3000;
    /* acentos sueltos (combinantes) → el acento de la letra estándar que los dibuja */
    const ACC = { 0x300: 0x60, 0x301: 0xB4, 0x302: 0x2C6, 0x303: 0x2DC, 0x304: 0xAF, 0x305: 0xAF, 0x306: 0x2D8, 0x307: 0x2D9, 0x308: 0xA8, 0x30A: 0x2DA, 0x30B: 0x2DD, 0x30C: 0x2C7, 0x327: 0xB8, 0x328: 0x2DB };
    const BELOW = { 0x327: 1, 0x328: 1 };
    /* superíndices y subíndices de Unicode: se dibujan con la letra normal, más chica y arriba o abajo */
    const SCRIPT = u => ((u >= 0x2070 && u <= 0x207F) || (u >= 0x1D2C && u <= 0x1D61) || (u >= 0x1D9B && u <= 0x1DBF) || (u >= 0x2B0 && u <= 0x2B8) || (u >= 0x2E0 && u <= 0x2E4) ? 0.3
      : (u >= 0x2080 && u <= 0x209C) || (u >= 0x1D62 && u <= 0x1D6A) || u === 0x2C7C ? -0.12 : 0);
    const SCR_K = 0.62;
    function textChars(t) {
      const parts = [];
      const walkT = n => {
        for (const c of n.childNodes) {
          if (c.nodeType === 3) parts.push([c.data, n]);
          else if (c.nodeType === 1 && /^(tspan|textPath|a)$/.test(c.tagName) && getComputedStyle(c).display !== 'none') walkT(c);
        }
      };
      walkT(t);
      const pre = /^pre|break-spaces/.test(getComputedStyle(t).whiteSpace || '');
      let u = [];
      parts.forEach(([s, el]) => { for (let i = 0; i < s.length; i++) { let ch = s[i]; if (!pre && /[\n\r\t]/.test(ch)) ch = ' '; u.push([ch, el]); } });
      if (!pre) {
        const o = [];
        u.forEach(x => { if (x[0] === ' ' && (!o.length || o[o.length - 1][0] === ' ')) return; o.push(x); });
        while (o.length && o[o.length - 1][0] === ' ') o.pop();
        u = o;
      }
      return u;
    }
    let mc = null;
    const ascCache = new Map();
    /* qué parte de la caja de una letra queda arriba de la línea de base */
    function ascRatio(cs) {
      const k = cs.fontStyle + ' ' + cs.fontWeight + ' 100px ' + cs.fontFamily;
      if (ascCache.has(k)) return ascCache.get(k);
      let r = 0.8;
      try {
        if (!mc) mc = document.createElement('canvas').getContext('2d');
        mc.font = k;
        const m = mc.measureText('Hg');
        if (m.fontBoundingBoxAscent > 0) r = m.fontBoundingBoxAscent / (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent);
      } catch (e) { /* 0.8 */ }
      ascCache.set(k, r);
      return r;
    }
    function text(t, cs, M, out, R) {
      let n = 0;
      try { n = t.getNumberOfChars(); } catch (e) { return; }
      if (!n) return;
      tables();
      /* cada carácter con su elemento y su índice para el navegador (que cuenta en unidades de UTF-16 o en
         puntos de código): un par sustituto va junto */
      const units = textChars(t), list = [];
      const cps = [];
      for (let i = 0; i < units.length; i++) { const c = units[i][0].charCodeAt(0); if (c >= 0xD800 && c <= 0xDBFF && i + 1 < units.length) { cps.push([units[i][0] + units[i + 1][0], units[i][1], i]); i++; } else cps.push([units[i][0], units[i][1], i]); }
      if (units.length === n) cps.forEach(c => list.push([c[0], c[1], c[2]]));
      else if (cps.length === n) cps.forEach((c, k) => list.push([c[0], c[1], k]));
      else { R.notes.add('text-count'); return; }
      const op = clamp01(+cs.opacity);
      if (op <= 0) return;
      const STY = new Map();
      const styleOf = el => {
        let s = STY.get(el);
        if (s) return s;
        const c = el === t ? cs : getComputedStyle(el);
        const size = parseFloat(c.fontSize) || 16;
        const sw = strokeW(c, R);
        s = { el, c, size, base: baseFont(c), hidden: c.visibility === 'hidden' || c.visibility === 'collapse', ls: parseFloat(c.letterSpacing) || 0,
          fill: paintOf(c.fill, t, M, R), stroke: sw > 0 ? paintOf(c.stroke, t, M, R) : null, sw, delta: null,
          strokeFirst: /^\s*(stroke|markers\s+stroke)/.test(c.paintOrder || '') };
        s.fa = s.fill ? s.fill.a * clamp01(+c.fillOpacity) * op : 0;
        s.sa = s.stroke ? s.stroke.a * clamp01(+c.strokeOpacity) * op : 0;
        if (s.fill && s.fa <= 0.001) s.fill = null;
        if (s.stroke && s.sa <= 0.001) s.stroke = null;
        STY.set(el, s);
        return s;
      };
      const glyph = (ch, base) => {
        const u = ch.codePointAt(0), m = metricsOf(base);
        const w = FT.u2w.get(u);
        if (w != null) return { f: base, c: w, w: m === 'Courier' ? 600 : FT.win[m][w - 32] };
        const xi = FT.u2x.get(u === 0x394 ? 0x2206 : u);
        if (xi != null) { const c = R.slot(base, xi); if (c != null) return { f: base, c, w: m === 'Courier' ? 600 : FT.xw[m][xi] }; }
        if (u === 0x3BC) return glyph(String.fromCharCode(0xB5), base);
        const s = FT.sym.get(u === 0x2126 ? 0x3A9 : u);
        if (s) return { f: 'Symbol', c: s[0], w: s[1] };
        return null;
      };
      const tall = ch => ch !== ch.toLowerCase() || /[bdfhklt]/.test(ch);
      /* el acento sobre la letra anterior, centrado; más arriba sobre una mayúscula o una letra alta */
      const accentOn = (run, bg, bch, accU) => {
        const ag = glyph(String.fromCharCode(ACC[accU]), run.st.base);
        if (!ag) return false;
        const D = PDF_DESC[metricsOf(run.st.base)];
        const raise = BELOW[accU] ? 0 : (tall(bch) ? (D[4] - D[5]) / 1000 : 0);
        run.p.push({ adj: -(bg.w + ag.w) / 2000 }, { g: ag, rise: raise, acc: 1 }, { adj: (bg.w - ag.w) / 2000 });
        return true;
      };
      const pieces = (ch, base) => {
        let u = ch.codePointAt(0);
        if (ZW(u)) return { skip: 1 };
        if (SPC(u)) { ch = ' '; u = 32; }
        const g = glyph(ch, base);
        if (g) return { p: [{ g }], w: g.w, last: [g, ch] };
        if (u >= 0x300 && u <= 0x36F) return ACC[u] ? { mark: u } : { skip: 1 };
        const sc = SCRIPT(u);
        if (sc) {
          const b = Array.from(ch.normalize('NFKC')), gs = b.map(c => glyph(c, base));
          if (gs.length && gs.every(Boolean)) return { p: gs.map(x => ({ g: x, scale: SCR_K, rise: sc })), w: gs.reduce((a, x) => a + x.w * SCR_K, 0) };
        }
        const d = ch.normalize('NFD');
        if (d.length > 1) {
          const bg = glyph(d[0], base);
          if (bg && Array.from(d.slice(1)).every(c => ACC[c.codePointAt(0)])) return { p: [{ g: bg }], w: bg.w, last: [bg, d[0]], marks: Array.from(d.slice(1)).map(c => c.codePointAt(0)) };
        }
        const k = ch.normalize('NFKC');
        if (k !== ch) { const gs = Array.from(k).map(c => glyph(c, base)); if (gs.length && gs.every(Boolean)) return { p: gs.map(x => ({ g: x })), w: gs.reduce((a, x) => a + x.w, 0) }; }
        return { img: 1 };
      };
      const runs = [];
      let run = null;
      const close = () => { if (run && run.p.length) runs.push(run); run = null; };
      for (let i = 0; i < list.length; i++) {
        const ch = list[i][0], st = styleOf(list[i][1]);
        if (st.hidden || (!st.fill && !st.stroke)) { close(); continue; }
        const I = list[i][2];
        let p, e, x, r = 0;
        try { p = t.getStartPositionOfChar(I); e = t.getEndPositionOfChar(I); x = t.getExtentOfChar(I); r = t.getRotationOfChar(I) || 0; } catch (err) { close(); continue; }
        if (st.delta == null) st.delta = r ? 0 : (x.y + x.height * ascRatio(st.c) - p.y);
        const pc = pieces(ch, st.base);
        if (pc.skip) continue;
        if (pc.mark) { if (run && run.last) accentOn(run, run.last[0], run.last[1], pc.mark); continue; }
        if (pc.img) { close(); runs.push({ img: ch, st, p, x, r }); continue; }
        const tol = 0.05 * st.size;
        const by = p.y + st.delta;
        if (!(run && run.st === st && !r && !run.r && Math.abs(p.x - run.ex) < tol && Math.abs(by - run.ey) < tol)) {
          close();
          run = { st, x0: p.x, y0: by, ex: p.x, ey: by, r, p: [], nat: 0, n: 0 };
        }
        pc.p.forEach(q => run.p.push(q));
        run.nat += pc.w; run.n++;
        run.last = pc.last || null;
        if (pc.marks) pc.marks.forEach(mk => accentOn(run, pc.last[0], pc.last[1], mk));
        run.ex = e.x; run.ey = e.y + st.delta;
      }
      close();
      if (!runs.length) return;
      const clip = clipOps(t, cs, M, R);
      out.push('q');
      if (clip) out.push(clip);
      out.push(mat(M) + ' cm');
      for (const rn of runs) {
        const st = rn.st;
        if (rn.img) { stencil(rn, out, R); continue; }
        const dx = rn.ex - rn.x0, dy = rn.ey - rn.y0, L = Math.hypot(dx, dy);
        if (!(L > 0)) continue;
        if (rn.p.every(q => q.g && q.g.f !== 'Symbol' && q.g.c === 32)) continue;
        const nat = rn.nat / 1000 * st.size + rn.n * st.ls;
        if (!(nat > 0)) continue;
        const th = rn.r ? rn.r * Math.PI / 180 : Math.atan2(dy, dx);
        const tz = Math.max(25, Math.min(400, 100 * L / nat));
        const passes = st.fill && st.stroke ? (st.strokeFirst ? [1, 0] : [2]) : [st.fill ? 0 : 1];
        for (const mode of passes) {
          const o = ['BT'];
          const g = gsOp(R, mode === 1 ? 1 : st.fa, mode === 0 ? 1 : st.sa, '');
          if (g) o.push(g);
          if (mode !== 1) o.push(st.fill.set('rg'));
          if (mode !== 0) o.push(st.stroke.set('RG'), nf(st.sw) + ' w 1 j 1 J');
          o.push(mode + ' Tr', nf(tz) + ' Tz', nf(st.ls) + ' Tc');
          o.push([Math.cos(th), Math.sin(th), Math.sin(th), -Math.cos(th), rn.x0, rn.y0].map(nf).join(' ') + ' Tm');
          let curF = null, curS = 0, curR = 0, arr = [], str = null;
          const flush = () => { if (str != null) { arr.push('(' + str + ')'); str = null; } if (arr.length) { o.push('[' + arr.join(' ') + '] TJ'); arr = []; } };
          for (const q of rn.p) {
            if (q.adj != null) { if (str != null) { arr.push('(' + str + ')'); str = null; } arr.push(nf(-q.adj * st.size / curS * 1000)); continue; }
            const fname = R.font(q.g.f), size = st.size * (q.scale || 1), rise = st.size * (q.rise || 0);
            if (fname !== curF || size !== curS) { flush(); o.push('/' + fname + ' ' + nf(size) + ' Tf'); curF = fname; curS = size; }
            if (rise !== curR) { flush(); o.push(nf(rise) + ' Ts'); curR = rise; }
            const c = q.g.c;
            const b = c === 40 || c === 41 || c === 92 ? '\\' + String.fromCharCode(c) : (c < 32 || c > 126 ? '\\' + c.toString(8).padStart(3, '0') : String.fromCharCode(c));
            str = (str || '') + b;
            /* el acento no avanza: se descuenta su espacio entre letras */
            if (q.acc && st.ls) { arr.push('(' + str + ')'); str = null; arr.push(nf(st.ls / curS * 1000)); }
          }
          flush();
          o.push('ET');
          out.push(o.join('\n'));
        }
      }
      out.push('Q');
    }
    /* un carácter que no traen las letras estándar: su imagen, pintada con el color del texto. Aquí solo se pide;
       se dibuja al armar el archivo (glyphImg), como lo dibuja el navegador en un SVG */
    function stencil(rn, out, R) {
      const st = rn.st, x = rn.x;
      if (!st.fill || !(x.height > 0 && x.width > 0)) return;
      const c = st.fill.rgb || [0, 0, 0, 1];
      const key = rn.img + '|' + st.c.fontStyle + '|' + st.c.fontWeight + '|' + st.c.fontFamily + '|' + c.join(',');
      let name = R.stc.get(key);
      if (!name) {
        const k = 256 / x.height;
        name = R.xo({ glyph: { ch: rn.img, style: st.c.fontStyle, weight: st.c.fontWeight, family: st.c.fontFamily, size: st.size * k, W: Math.max(1, Math.min(1024, Math.ceil(x.width * k))), H: 256, x: (rn.p.x - x.x) * k, y: (rn.p.y + st.delta - x.y) * k, rgb: c } });
        R.stc.set(key, name);
      }
      const g = gsOp(R, st.fa, 1, '');
      out.push('q' + (g ? ' ' + g : '') + ' ' + [x.width, 0, 0, -x.height, x.x, x.y + x.height].map(nf).join(' ') + ' cm /' + name + ' Do Q');
      R.notes.add('glyph-img');
    }
    async function glyphImg(g) {
      const xe = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + g.W + '" height="' + g.H + '"><text x="' + nf(g.x) + '" y="' + nf(g.y) + '" style="font-style:' + xe(g.style) + ';font-weight:' + xe(g.weight) + ';font-size:' + nf(g.size) + 'px;font-family:' + xe(g.family) + ';fill:#000;white-space:pre">' + xe(g.ch) + '</text></svg>';
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      const a = new Uint8Array(g.W * g.H);
      try {
        const im = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
        const cv = document.createElement('canvas'); cv.width = g.W; cv.height = g.H;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(im, 0, 0);
        const d = ctx.getImageData(0, 0, g.W, g.H).data;
        for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
      } catch (e) { /* queda transparente */ } finally { URL.revokeObjectURL(url); }
      const rgb = new Uint8Array(g.W * g.H * 3), r = Math.round(g.rgb[0] * 255), gg = Math.round(g.rgb[1] * 255), b = Math.round(g.rgb[2] * 255);
      for (let i = 0; i < g.W * g.H; i++) { rgb[i * 3] = r; rgb[i * 3 + 1] = gg; rgb[i * 3 + 2] = b; }
      return { w: g.W, h: g.H, rgb, a };
    }

    /* ----- imágenes dentro del SVG ----- */
    async function loadImages(svg) {
      const map = new Map();
      for (const im of svg.querySelectorAll('image')) {
        const h = im.getAttribute('href') || im.getAttribute('xlink:href');
        if (!h || map.has(h)) continue;
        try {
          const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = h; });
          let W = img.naturalWidth, H = img.naturalHeight;
          const s = Math.min(1, 4000 / Math.max(W, H)); W = Math.max(1, Math.round(W * s)); H = Math.max(1, Math.round(H * s));
          const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
          const g = cv.getContext('2d', { willReadFrequently: true });
          g.drawImage(img, 0, 0, W, H);
          const d = g.getImageData(0, 0, W, H).data, rgb = new Uint8Array(W * H * 3), a = new Uint8Array(W * H);
          let op = true;
          for (let i = 0, j = 0; i < W * H; i++, j += 4) { rgb[i * 3] = d[j]; rgb[i * 3 + 1] = d[j + 1]; rgb[i * 3 + 2] = d[j + 2]; a[i] = d[j + 3]; if (d[j + 3] < 255) op = false; }
          map.set(h, { w: W, h: H, rgb, a: op ? null : a });
        } catch (e) { map.set(h, null); }
      }
      return map;
    }
    function image(el, cs, M, out, R) {
      if (cs.visibility === 'hidden') return;
      const h = el.getAttribute('href') || el.getAttribute('xlink:href');
      const im = R.imgs && R.imgs.get(h);
      if (!im) { R.notes.add('image'); return; }
      const x = el.x.animVal.value, y = el.y.animVal.value;
      let w = el.width.animVal.value, hh = el.height.animVal.value;
      if (!w && !hh) { w = im.w; hh = im.h; } else if (!w) w = hh * im.w / im.h; else if (!hh) hh = w * im.h / im.w;
      if (!(w > 0 && hh > 0)) return;
      const F = fitM({ x: 0, y: 0, width: im.w, height: im.h }, el.preserveAspectRatio && el.preserveAspectRatio.animVal, w, hh);
      const pl = mul(tr(x, y), mul(F, [im.w, 0, 0, -im.h, 0, im.h]));
      let name = R.stc.get('img|' + h);
      if (!name) { name = R.xo({ img: im }); R.stc.set('img|' + h, name); }
      const clip = clipOps(el, cs, M, R);
      const g = gsOp(R, clamp01(+cs.opacity), 1, blendOf(cs));
      out.push('q', clip || '', g, mat(M) + ' cm', pathOps(rectS(x, y, w, hh)) + '\nW n', mat(pl) + ' cm /' + name + ' Do', 'Q');
    }

    /* ----- el árbol de la figura ----- */
    function walk(parent, out, R) {
      for (const el of parent.children) {
        const tag = el.tagName;
        if (NOREND[tag]) continue;
        let cs;
        try { cs = getComputedStyle(el); } catch (e) { continue; }
        if (cs.display === 'none') continue;
        if (tag === 'g' || tag === 'a' || tag === 'svg' || tag === 'switch') { group(el, cs, out, R); continue; }
        const c = el.getScreenCTM && el.getScreenCTM();
        if (!c) continue;
        const M = mul(R.RB, dm(c));
        if (tag === 'text') { text(el, cs, M, out, R); continue; }
        if (tag === 'image') { image(el, cs, M, out, R); continue; }
        if (SHAPES[tag]) { const s = geom(el, tag); if (s) shape(el, cs, s, M, out, R, null); continue; }
        if (tag === 'use') { R.notes.add('use'); continue; }
        if (tag === 'foreignObject') { R.notes.add('html'); continue; }
      }
    }
    function group(el, cs, out, R) {
      const op = clamp01(+cs.opacity);
      if (op <= 0) return;
      const c = el.getScreenCTM && el.getScreenCTM();
      const M = c ? mul(R.RB, dm(c)) : null;
      let clip = M ? clipOps(el, cs, M, R) : '';
      /* un <svg> anidado recorta a su ventana */
      if (el.tagName === 'svg' && el !== R.root && !/visible|auto/.test(cs.overflow || 'hidden')) {
        const pc = el.parentNode && el.parentNode.getScreenCTM && el.parentNode.getScreenCTM();
        const w = el.width.animVal.value, h = el.height.animVal.value;
        if (pc && w > 0 && h > 0) clip = (clip ? clip + '\n' : '') + pathOps(rectS(el.x.animVal.value, el.y.animVal.value, w, h), mul(R.RB, dm(pc))) + '\nW n';
      }
      if (cs.filter && cs.filter !== 'none') R.notes.add('filter');
      if ((cs.maskImage && cs.maskImage !== 'none') || (cs.mask && cs.mask !== 'none')) R.notes.add('mask');
      const bm = blendOf(cs);
      if (!clip && op >= 0.999 && !bm) { walk(el, out, R); return; }
      out.push('q');
      if (clip) out.push(clip);
      if (op < 0.999 || bm) { const sub = []; walk(el, sub, R); if (sub.length) out.push('/' + R.gs(op, op, bm) + ' gs /' + R.xo({ form: sub.join('\n') }) + ' Do'); }
      else walk(el, out, R);
      out.push('Q');
    }

    /* ----- el archivo ----- */
    const enc = s => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; };
    const utf16 = s => { let h = 'FEFF'; for (let i = 0; i < s.length; i++) h += s.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase(); return '<' + h + '>'; };
    async function assemble(Wp, Hp, content, R, o) {
      const objs = [null, null, null, null, null];
      const add = x => { objs.push(x); return objs.length; };
      const stream = async (dict, data) => { const u = typeof data === 'string' ? enc(data) : data; const z = await deflate(u); return { dict, data: z || u, z: !!z }; };
      /* letras */
      const fontRefs = [];
      for (const f of R.fonts.values()) {
        const D = PDF_DESC[f.base === 'Symbol' ? 'Symbol' : metricsOf(f.base)];
        const obl = /Oblique/.test(f.base);
        const flags = f.base === 'Symbol' ? 4 : ((/^Times/.test(f.base) ? 2 : 0) + (/^Courier/.test(f.base) ? 1 : 0) + 32 + (/Italic|Oblique/.test(f.base) ? 64 : 0));
        const ital = obl ? -12 : D[8];
        const fd = add({ dict: '<< /Type /FontDescriptor /FontName /' + f.base + ' /Flags ' + flags + ' /FontBBox [' + D.slice(0, 4).join(' ') + '] /ItalicAngle ' + ital + ' /Ascent ' + (D[6] || D[3]) + ' /Descent ' + (D[7] || D[1]) + ' /CapHeight ' + (D[4] || D[3]) + (D[5] ? ' /XHeight ' + D[5] : '') + ' /StemV ' + D[9] + ' >>' });
        let dict;
        if (f.base === 'Symbol') {
          const w = []; for (let c = 32; c <= 254; c++) w.push(FT.symW.get(c) || 0);
          dict = '<< /Type /Font /Subtype /Type1 /BaseFont /Symbol /FirstChar 32 /LastChar 254 /Widths [' + w.join(' ') + '] /FontDescriptor ' + fd + ' 0 R >>';
        } else {
          const m = metricsOf(f.base), slots = Array.from(f.slots.entries()).sort((a, b) => a[1] - b[1]);
          const first = slots.length ? Math.min(32, slots[0][1]) : 32;
          const byCode = new Map(slots.map(([xi, c]) => [c, xi]));
          const w = [];
          for (let c = first; c <= 255; c++) {
            if (byCode.has(c)) w.push(m === 'Courier' ? 600 : FT.xw[m][byCode.get(c)]);
            else w.push(c >= 32 ? (m === 'Courier' ? (FT.win.Helvetica[c - 32] ? 600 : 0) : FT.win[m][c - 32]) : 0);
          }
          const diffs = slots.length ? ' /Differences [' + slots.map(([xi, c]) => c + ' /' + FT.xu[xi][1]).join(' ') + ']' : '';
          dict = '<< /Type /Font /Subtype /Type1 /BaseFont /' + f.base + ' /Encoding << /Type /Encoding /BaseEncoding /WinAnsiEncoding' + diffs + ' >> /FirstChar ' + first + ' /LastChar 255 /Widths [' + w.join(' ') + '] /FontDescriptor ' + fd + ' 0 R >>';
        }
        fontRefs.push('/' + f.name + ' ' + add({ dict }) + ' 0 R');
      }
      /* patrones */
      const patRefs = [];
      for (let i = 0; i < R.pats.length; i++) {
        const p = R.pats[i];
        const n = p.tile != null ? add(await stream('<< /Type /Pattern ' + p.dict + ' /Resources 4 0 R', p.tile)) : add({ dict: p.dict });
        patRefs.push('/P' + (i + 1) + ' ' + n + ' 0 R');
      }
      /* imágenes y grupos */
      const xoRefs = [];
      for (let i = 0; i < R.xos.length; i++) {
        const x = R.xos[i];
        let n;
        if (x.form != null) n = add(await stream('<< /Type /XObject /Subtype /Form /BBox [0 0 ' + nf(Wp) + ' ' + nf(Hp) + '] /Group << /S /Transparency >> /Resources 4 0 R', x.form));
        else {
          const im = x.glyph ? await glyphImg(x.glyph) : x.img;
          let sm = '';
          if (im.a) { const s = add(await stream('<< /Type /XObject /Subtype /Image /Width ' + im.w + ' /Height ' + im.h + ' /ColorSpace /DeviceGray /BitsPerComponent 8', im.a)); sm = ' /SMask ' + s + ' 0 R'; }
          n = add(await stream('<< /Type /XObject /Subtype /Image /Width ' + im.w + ' /Height ' + im.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8' + sm, im.rgb));
        }
        xoRefs.push('/X' + (i + 1) + ' ' + n + ' 0 R');
      }
      const gsRefs = Array.from(R.gsm.entries()).map(([k, n]) => { const [ca, CA, bm] = k.split('|'); return '/' + n + ' << /Type /ExtGState /ca ' + ca + ' /CA ' + CA + (bm ? ' /BM /' + bm : '') + ' >>'; });
      objs[0] = { dict: '<< /Type /Catalog /Pages 2 0 R >>' };
      objs[1] = { dict: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>' };
      objs[2] = { dict: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + nf(Wp) + ' ' + nf(Hp) + '] /Resources 4 0 R /Contents 5 0 R >>' };
      objs[3] = { dict: '<< /ProcSet [/PDF /Text /ImageB /ImageC]' + (fontRefs.length ? ' /Font << ' + fontRefs.join(' ') + ' >>' : '') + (gsRefs.length ? ' /ExtGState << ' + gsRefs.join(' ') + ' >>' : '') + (patRefs.length ? ' /Pattern << ' + patRefs.join(' ') + ' >>' : '') + (xoRefs.length ? ' /XObject << ' + xoRefs.join(' ') + ' >>' : '') + ' >>' };
      objs[4] = await stream('<<', content);
      const d = new Date(), p2 = v => String(v).padStart(2, '0');
      const info = add({ dict: '<< /Producer (LABG Estudio de figuras ' + VERSION + ') /Creator (LABG Suite)' + (o.title ? ' /Title ' + utf16(String(o.title).slice(0, 200)) : '') + ' /CreationDate (D:' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + p2(d.getHours()) + p2(d.getMinutes()) + p2(d.getSeconds()) + ') >>' });
      /* escribir */
      const parts = [], offs = [];
      let len = 0;
      const push = u => { parts.push(u); len += u.length; };
      push(enc('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));
      objs.forEach((x, i) => {
        offs[i] = len;
        if (x.data) { push(enc((i + 1) + ' 0 obj\n' + x.dict + (x.z ? ' /Filter /FlateDecode' : '') + ' /Length ' + x.data.length + ' >>\nstream\n')); push(x.data); push(enc('\nendstream\nendobj\n')); }
        else push(enc((i + 1) + ' 0 obj\n' + x.dict + '\nendobj\n'));
      });
      const xref = len;
      let x = 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
      offs.forEach(o2 => { x += String(o2).padStart(10, '0') + ' 00000 n \n'; });
      push(enc(x + 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R /Info ' + info + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF\n'));
      return new Blob(parts, { type: 'application/pdf' });
    }

    /* la figura completa: o.wmm × o.hmm, fondo o.bg (o null), colores del tema claro con o.light */
    return async function vecPdf(svg, o) {
      o = o || {};
      tables();
      const imgs = svg.querySelector('image') ? await loadImages(svg) : null;
      const Wp = o.wmm * PT_MM, Hp = o.hmm * PT_MM;
      const R = mkRes(svg);
      R.imgs = imgs;
      const draw = () => {
        const vb0 = svg.viewBox && svg.viewBox.baseVal;
        const vb = vb0 && vb0.width > 0 && vb0.height > 0 ? vb0 : { x: 0, y: 0, width: svg.clientWidth || svg.getBoundingClientRect().width || 300, height: svg.clientHeight || svg.getBoundingClientRect().height || 150 };
        const F = fitM(vb, svg.preserveAspectRatio && svg.preserveAspectRatio.baseVal, Wp, Hp);
        const B = [F[0], 0, 0, -F[3], F[4], Hp - F[5]];
        const rc = svg.getScreenCTM();
        R.RB = mul(B, rc ? inv(dm(rc)) : ID);
        const out = [];
        const bg = o.bg ? rgba(o.bg) : null;
        if (bg) out.push(nf(bg[0]) + ' ' + nf(bg[1]) + ' ' + nf(bg[2]) + ' rg 0 0 ' + nf(Wp) + ' ' + nf(Hp) + ' re f');
        walk(svg, out, R);
        return out.join('\n');
      };
      const content = o.light ? inLight(draw) : draw();
      const blob = await assemble(Wp, Hp, content, R, o);
      return { blob, notes: Array.from(R.notes) };
    };
  })();
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
    let fn = '';
    try { fn = ST.native && ST.native.file ? String(typeof ST.native.file === 'function' ? ST.native.file() : ST.native.file || '') : ''; } catch (e) { fn = ''; }
    const t = slug(fn || natTitle() || ST.rec.key);
    return APP + '-' + t + '-' + fmtN(expW(), 0) + 'mm' + (ext === 'svg' || (ext === 'pdf' && pdfVec()) ? '' : '-' + ST.exp.dpi + 'ppp') + (ST.exp.fmt === 'geotiff' ? '-geo' : '') + '.' + ext;
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
      let blob, notes = [], ext = fmt === 'tiff' || fmt === 'geotiff' ? 'tif' : fmt;
      const N = ST.native;
      /* lo que la app dibuja por sí misma; si no, se arma con su PNG (y, sin figura elevada, siempre así) */
      let want = nativeCan(N, fmt) ? fmt : (fmt === 'tiff' ? 'png' : null);
      if (!want && N && nativeCan(N, 'png') && (fmt === 'pdf' || ST.noLift)) want = 'png';
      if (want) {
        /* la app vuelve a dibujar la figura a las medidas de salida */
        say(T('Dibujando de nuevo con ', 'Drawing again with ') + (N.label || T('la app', 'the app')) + '…');
        blob = asBlob(await N.render(want, nativeOpts(want)));
        if (!blob) throw new Error(T('la app no devolvió la figura', 'the app did not return the figure'));
        if (want === 'png' && fmt !== 'png') {
          const cv = await blobCanvas(blob), transp = ST.exp.bg === 'none';
          if (fmt === 'tiff') blob = await tiffBlob(cv, ST.exp.dpi, transp);
          else if (fmt === 'pdf') blob = await pdfBlob(cv, wmm, cv.height / cv.width * wmm, transp);
          else if (fmt === 'svg') {
            const url = cv.toDataURL('image/png'), hh = cv.height / cv.width * wmm;
            blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="' + NS + '" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + fmtN(wmm, 2) + 'mm" height="' + fmtN(hh, 2) + 'mm" viewBox="0 0 ' + cv.width + ' ' + cv.height + '"><image width="' + cv.width + '" height="' + cv.height + '" xlink:href="' + url + '"/></svg>'], { type: 'image/svg+xml' });
          }
        } else if (fmt === 'png') blob = await pngWithDpi(blob, ST.exp.dpi);
        const name = fileName(ext);
        download(blob, name);
        say(T('Exportada (dibujada de nuevo por ', 'Exported (drawn again by ') + (N.label || T('la app', 'the app')) + '): ' + name + ' (' + (blob.size / 1048576).toFixed(2) + ' MB)');
        ring();
        document.dispatchEvent(new CustomEvent('labg-figure-studio:export', { detail: { name, size: blob.size, format: fmt, native: true } }));
        return;
      }
      if (fmt === 'svg') {
        if (ST.rec.lib === 'svg') blob = new Blob([serialize(ST.el, { wmm, hmm, bg, light: lightOn() })], { type: 'image/svg+xml' });
        else {
          const px = expPx();
          const cv = await raster(Math.min(px.w, 8000), Math.min(px.h, 8000), bg);
          const url = cv.toDataURL('image/png');
          blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="' + NS + '" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + fmtN(wmm, 2) + 'mm" height="' + fmtN(hmm, 2) + 'mm" viewBox="0 0 ' + cv.width + ' ' + cv.height + '"><image width="' + cv.width + '" height="' + cv.height + '" xlink:href="' + url + '"/></svg>'], { type: 'image/svg+xml' });
        }
      } else if (fmt === 'pdf' && pdfVec()) {
        /* trazos y texto, no la imagen */
        say(T('Escribiendo el PDF vectorial…', 'Writing the vector PDF…'));
        const r = await vecPdf(ST.el, { wmm, hmm, bg, light: lightOn(), title: natTitle() });
        blob = r.blob; notes = r.notes;
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
      say(T('Exportada: ', 'Exported: ') + name + ' (' + (blob.size / 1048576).toFixed(2) + ' MB)' + pdfNotes(notes));
      ring();
      document.dispatchEvent(new CustomEvent('labg-figure-studio:export', { detail: { name, size: blob.size, format: fmt, vector: fmt === 'svg' || (fmt === 'pdf' && pdfVec()) } }));
    } catch (err) {
      console.error('LABG Estudio: exportación', err);
      say(T('No se pudo exportar: ', 'Could not export: ') + (err && err.message ? err.message : err));
    } finally {
      busy = false;
      btns.forEach(b => { b.disabled = false; b.classList.remove('busy'); });
    }
  }
  /* lo que el PDF vectorial no lleva, en pocas palabras */
  function pdfNotes(n) {
    const t = [], has = k => n.indexOf(k) >= 0;
    if (has('filter')) t.push(T('sin filtros (sombras)', 'without filters (shadows)'));
    if (has('mask')) t.push(T('sin máscaras', 'without masks'));
    if (has('html')) t.push(T('sin el HTML de dentro', 'without the HTML inside'));
    if (has('use') || has('defs-text') || has('text-count')) t.push(T('falta alguna pieza: compárala con el PNG', 'some piece is missing: compare it with the PNG'));
    if (has('image')) t.push(T('sin una imagen que no se pudo leer', 'without an image that could not be read'));
    if (has('stop-opacity') || has('spread')) t.push(T('algún degradado, simplificado', 'some gradient, simplified'));
    if (has('glyph-img')) t.push(T('algún carácter especial va como imagen', 'some special character goes as an image'));
    return t.length ? ' · ' + t.join(' · ') : '';
  }
  async function doCopy() {
    if (!ST.open) return;
    try {
      const k = Math.min(1, 4000 / expPx().w);
      const px = { w: Math.max(1, Math.round(expPx().w * Math.min(k, 300 / ST.exp.dpi))), h: Math.max(1, Math.round(expPx().h * Math.min(k, 300 / ST.exp.dpi))) };
      let blob = null;
      if (nativeCan(ST.native, 'png')) blob = asBlob(await ST.native.render('png', nativeOpts('png', Math.min(ST.exp.dpi, 300))));
      if (!blob) { const cv = await raster(px.w, px.h, bgColor() || '#ffffff'); blob = await new Promise(r => cv.toBlob(r, 'image/png')); }
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
    /* solo un cambio de idioma de verdad: hay apps que vuelven a escribir el mismo «lang» cada vez que traducen un
       panel (el editor ✎ de PhenologyPro, al acoplarse), y rehacer el inspector por eso no terminaría nunca */
    let langNow = document.documentElement.lang;
    new MutationObserver(() => {
      const L = document.documentElement.lang;
      if (L === langNow) return;
      langNow = L;
      $$('.lfs-open').forEach(b => { b.title = openTitle(); });
      if (ST.open) { labels(); const sc = body.scrollTop; render(); dock(false); dock(true); body.scrollTop = sc; }
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    /* la persona cambió el tema de la app con el estudio abierto: la vista previa y la opción «Colores» lo siguen */
    document.addEventListener('themechange', () => { if (ST.open) setTimeout(() => { if (ST.open) { paintLight(); renderSize(); readout(); } }, 60); });
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
    figures: root => figures(root).map(r => ({ el: r.el, key: r.key, title: r.title, library: r.lib, native: !!nativeFor(r) })),
    adapters: ADAPTERS,
    palettes: PALETTES,
    presets: PRESETS,
    on: (ev, fn) => document.addEventListener('labg-figure-studio:' + ev, e => fn(e.detail)),
    refresh: () => decorate(),
    /* PDF vectorial de una figura SVG de la app (1.5.0): { wmm, hmm, bg, light, title } → Promise de { blob, notes } */
    toPDF(el, o) {
      o = Object.assign({ wmm: 170, bg: '#ffffff' }, o || {});
      if (!o.hmm) { const vb = el.viewBox && el.viewBox.baseVal, r = el.getBoundingClientRect(); o.hmm = o.wmm * (vb && vb.width ? vb.height / vb.width : (r.width ? r.height / r.width : 0.62)); }
      return vecPdf(el, o);
    },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(start, 80));
  else setTimeout(start, 80);
})();
