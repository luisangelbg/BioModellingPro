/* LABG Suite — puente entre las figuras de Python y el Estudio de figuras LABG.
   Copyright (C) 2026  Luis Ángel Barrera-Guzmán

   This program is free software: you can redistribute it and/or modify it under
   the terms of the GNU General Public License as published by the Free Software
   Foundation, either version 3 of the License, or (at your option) any later
   version. It is distributed in the hope that it will be useful, but WITHOUT ANY
   WARRANTY; see the GNU General Public License, in the file LICENSE at the root
   of this program, or <https://www.gnu.org/licenses/>.

   Qué hace
   --------
   Las figuras que dibuja Python (matplotlib, en el navegador) llegan como imágenes PNG
   a la resolución de la pantalla. Este puente recuerda qué llamada de Python dibujó cada
   imagen; cuando el Estudio de figuras exporta una de ellas, vuelve a ejecutar la MISMA
   llamada con las medidas de salida del estudio:
     · el ancho y el alto en milímetros (el texto conserva su tamaño en puntos),
     · la resolución (300, 600 o 1200 ppp),
     · el formato: PNG con su resolución escrita, SVG y PDF vectoriales,
     · y el fondo (transparente si se pide).
   Nada se calcula de otra forma: es el mismo dibujo con otro papel. Del lado de Python lo
   reciben _xp_run(), _xp_fit() y fig_to_uri()/fig_to_b64() en pyodide-core.js.

   Uso: una línea después de pyodide-core.js:
     <script src="js/labg-pyfig.js"></script> */
(function () {
  'use strict';
  if (window.LABGPyFig) return;
  const LIMITE = 400;                        /* imágenes que se recuerdan (las más recientes) */
  const memo = new Map();                    /* clave de la imagen → { code, globals, path } */
  const esImagen = v => typeof v === 'string' && v.slice(0, 11) === 'data:image/';
  const esDatos = v => typeof v === 'string' && v.slice(0, 5) === 'data:';
  /* una huella corta del data URI: su largo y unos trozos del principio y del final */
  const clave = uri => uri.length + '|' + uri.slice(22, 140) + '|' + uri.slice(-140);

  function recordar(uri, code, globals, path) {
    const k = clave(uri);
    if (memo.has(k)) memo.delete(k);
    memo.set(k, { code, globals: globals ? Object.assign({}, globals) : null, path });
    if (memo.size > LIMITE) memo.delete(memo.keys().next().value);
  }
  /* busca imágenes en lo que devolvió Python: una cadena, un objeto o un JSON con varias */
  function buscar(v, code, globals, path, hondo) {
    if (v == null || hondo > 4) return;
    if (esImagen(v)) { recordar(v, code, globals, path); return; }
    if (typeof v === 'string') {
      if (v.length > 40 && (v[0] === '{' || v[0] === '[') && v.indexOf('"data:image/') >= 0) {
        try { buscar(JSON.parse(v), code, globals, path.concat(['#json']), hondo + 1); } catch (e) { /* no era JSON */ }
      }
      return;
    }
    if (typeof v === 'object') Object.keys(v).forEach(k => buscar(v[k], code, globals, path.concat([k]), hondo + 1));
  }
  function tomar(v, path) {
    for (const p of path) {
      if (v == null) return null;
      if (p === '#json') { try { v = JSON.parse(v); } catch (e) { return null; } }
      else v = v[p];
    }
    return v;
  }
  function aBlob(uri) {
    const coma = uri.indexOf(',');
    const cab = uri.slice(5, coma), mime = cab.split(';')[0] || 'application/octet-stream';
    const dat = uri.slice(coma + 1);
    if (/;base64/.test(cab)) {
      const bin = atob(dat), u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return new Blob([u], { type: mime });
    }
    return new Blob([decodeURIComponent(dat)], { type: mime });
  }

  /* envuelve runPy: cada vez que devuelve una imagen, se anota la llamada que la dibujó */
  function envolver() {
    const orig = window.runPy;
    if (typeof orig !== 'function') return false;
    if (orig.__pyfig) return true;
    const w = async function (code, globals) {
      const res = await orig.apply(this, arguments);
      /* las llamadas con await no se pueden repetir fuera de su contexto */
      try { if (typeof code === 'string' && code.indexOf('await ') < 0) buscar(res, code, globals, [], 0); } catch (e) { /* nada */ }
      return res;
    };
    w.__pyfig = true; w.__orig = orig;
    window.runPy = w;
    return true;
  }

  /* la misma llamada, con las medidas de salida del estudio; devuelve el archivo */
  let cola = Promise.resolve();
  function dibujar(m, fmt, o) {
    const tarea = async () => {
      const run = (window.runPy && window.runPy.__orig) || window.runPy;
      const xo = { fmt, dpi: o.dpi || 300, w: o.win || null, h: o.hin || null, transparent: !!o.transparent, light: !!o.light, legend: o.legend && o.legend !== 'orig' ? o.legend : null };
      const g = Object.assign({}, m.globals || {}, { _xp_o: JSON.stringify(xo), _xp_c: m.code });
      let res = await run('_xp_run(_xp_o, _xp_c)', g);
      res = tomar(res, m.path);
      if (!esDatos(res)) throw new Error('Python no devolvió la figura');
      return aBlob(res);
    };
    /* una a la vez: la vista previa y la exportación no se cruzan */
    const p = cola.then(tarea, tarea);
    cola = p.catch(() => {});
    return p;
  }

  /* lo que el Estudio de figuras pregunta por cada figura */
  function describir(rec) {
    const el = rec && rec.el;
    if (!el || el.tagName !== 'IMG') return null;
    const m = memo.get(clave(el.getAttribute('src') || ''));
    if (!m) return null;
    return {
      label: 'Python',
      formats: ['png', 'svg', 'pdf'],
      legend: true,                    // la leyenda de matplotlib va donde la pida el estudio
      render: (fmt, o) => dibujar(m, fmt, o || {}),
    };
  }

  envolver();
  /* por si runPy se define después de este archivo */
  if (!window.runPy || !window.runPy.__pyfig) document.addEventListener('DOMContentLoaded', envolver);
  const cfg = window.LABG_FIGSTUDIO = window.LABG_FIGSTUDIO || {};
  const previo = cfg.nativeExport;
  cfg.nativeExport = rec => describir(rec) || (typeof previo === 'function' ? previo(rec) : null);
  window.LABGPyFig = { version: '1.0.0', describir, recordadas: () => memo.size };
})();
