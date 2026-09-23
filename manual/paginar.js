/* BioModelling Pro — manual de usuario: paginador.
   Reparte el contenido de cada <section> de <body> en hojas tamaño carta, en orden:
   – un elemento que no cabe pasa a la hoja siguiente; las tablas y listas largas se
     parten por filas o incisos (la tabla repite su encabezado);
   – un título nunca queda solo al pie de una hoja;
   – pone encabezados, números de página (romanos en preliminares) y los números del índice.
   Secciones: class="preliminares" (sin encabezado, números romanos), class="capitulo"
   (empieza hoja; el <h1> da el título corrido), data-nueva-hoja (empieza hoja).
   Sin dependencias: funciona abierto con doble clic y al imprimir a PDF. */
(function () {
  const MANUAL = 'BioModelling Pro · Manual de usuario';
  const romano = n => { const t = [['m', 1000], ['cm', 900], ['d', 500], ['cd', 400], ['c', 100], ['xc', 90], ['l', 50], ['xl', 40], ['x', 10], ['ix', 9], ['v', 5], ['iv', 4], ['i', 1]]; let s = ''; for (const [r, v] of t) while (n >= v) { s += r; n -= v; } return s; };
  const TITULOS = /^H[1-4]$/;

  async function listo() {
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) { /* sin fuentes web: usa las del sistema */ } }
    await Promise.all([...document.images].map(img => (img.complete ? Promise.resolve() : new Promise(r => { img.onload = img.onerror = r; }))));
  }

  function paginar() {
    /* the page numbers of the table of contents take room (a title may wrap): their places are made
       before measuring, with a placeholder as wide as a three-digit number, and filled in at the end.
       A chapter title whose row has its own page column gets no number of its own. */
    const tocLinks = [...document.querySelectorAll('.toc a[href^="#"]')].filter(a =>
      a.classList.contains('pag') || !a.parentElement.querySelector(`a.pag[href="${a.getAttribute('href')}"]`));
    tocLinks.forEach(a => {
      const n = document.createElement('span');
      n.className = 'toc-pag';
      n.textContent = '000';
      if (a.classList.contains('pag')) a.replaceChildren(n);
      else { const l = document.createElement('span'); l.className = 'lider'; a.appendChild(l); a.appendChild(n); }
    });
    const secciones = [...document.body.children].filter(n => n.tagName === 'SECTION');
    const libro = document.createElement('div');
    libro.className = 'libro';
    /* sheets must be in the document to be measured */
    document.body.appendChild(libro);
    let hoja = null, cuerpo = null, seccion = null;
    let nPrelim = 0, nCuerpo = 0, tituloCorrido = '';

    function nuevaHoja() {
      hoja = document.createElement('div');
      hoja.className = 'hoja';
      const prelim = seccion.classList.contains('preliminares');
      hoja.dataset.tipo = prelim ? 'preliminar' : 'cuerpo';
      const num = prelim ? ++nPrelim : ++nCuerpo;
      hoja.dataset.num = prelim ? romano(num) : String(num);
      hoja.classList.add(num % 2 ? 'impar' : 'par');
      if (seccion.getAttribute('style')) hoja.setAttribute('style', seccion.getAttribute('style'));
      if (seccion.dataset.pestana) { hoja.dataset.pestana = seccion.dataset.pestana; hoja.dataset.orden = seccion.dataset.orden || 0; }
      cuerpo = document.createElement('div');
      cuerpo.className = 'hoja-cuerpo';
      /* the section's classes travel with its content, so rules like .creditos dl still apply */
      [...seccion.classList].forEach(c => { if (c !== 'capitulo' && c !== 'preliminares') cuerpo.classList.add(c); });
      hoja.appendChild(cuerpo);
      libro.appendChild(hoja);
      return hoja;
    }
    const desborda = () => cuerpo.scrollHeight > cuerpo.clientHeight + 1;

    /* split a table or list so that the first part fits; returns the remainder or null */
    function partir(el) {
      if (el.tagName === 'TABLE') {
        const filas = [...el.tBodies[0].rows];
        if (filas.length < 2) return null;
        const resto = el.cloneNode(false);
        if (el.tHead) resto.appendChild(el.tHead.cloneNode(true));
        const tb = document.createElement('tbody');
        resto.appendChild(tb);
        const cap = el.querySelector('caption');
        const cuerpoTabla = el.tBodies[0];
        while (desborda() && cuerpoTabla.rows.length > 1) tb.insertBefore(cuerpoTabla.rows[cuerpoTabla.rows.length - 1], tb.firstChild);
        /* fewer than two rows would be left behind: put the rows back and move the whole table */
        if (desborda() || cuerpoTabla.rows.length < 2 || !tb.rows.length) { while (tb.rows.length) cuerpoTabla.appendChild(tb.rows[0]); return null; }
        /* nor a lone row on the next sheet */
        if (tb.rows.length === 1 && cuerpoTabla.rows.length >= 3) tb.insertBefore(cuerpoTabla.rows[cuerpoTabla.rows.length - 1], tb.firstChild);
        /* a group heading (one cell across the table) travels with the rows it introduces */
        const esGrupo = f => f.cells.length === 1 && f.cells[0].colSpan > 1;
        while (cuerpoTabla.rows.length > 2 && esGrupo(cuerpoTabla.rows[cuerpoTabla.rows.length - 1])) tb.insertBefore(cuerpoTabla.rows[cuerpoTabla.rows.length - 1], tb.firstChild);
        /* a table over three or more sheets keeps a single "(continuación)" */
        if (cap) { const c2 = cap.cloneNode(true); c2.innerHTML = cap.innerHTML.replace(/ <i>\(continuación\)<\/i>$/, '') + ' <i>(continuación)</i>'; resto.insertBefore(c2, resto.firstChild); }
        return resto;
      }
      if ((el.tagName === 'UL' || el.tagName === 'OL') && el.children.length > 1) {
        const resto = el.cloneNode(false);
        let movidos = 0;
        while (desborda() && el.children.length > 1) { resto.insertBefore(el.lastElementChild, resto.firstChild); movidos++; }
        if (desborda() || !movidos) { while (resto.firstElementChild) el.appendChild(resto.firstElementChild); return null; }
        /* numbering continues on the next sheet */
        if (el.classList.contains('pasos')) resto.style.counterReset = 'paso ' + (parseInt((el.style.counterReset || '').split(' ')[1], 10) || 0) + el.children.length;
        if (el.tagName === 'OL' && !el.classList.contains('pasos')) resto.start = (el.start || 1) + el.children.length;
        return resto;
      }
      return null;
    }

    function colocar(el) {
      cuerpo.appendChild(el);
      if (!desborda()) return;
      const vacia = cuerpo.children.length === 1;
      /* try splitting long tables and lists in place */
      if (!vacia || el.tagName === 'TABLE' || el.tagName === 'UL' || el.tagName === 'OL') {
        const resto = partir(el);
        if (resto) { nuevaHoja(); colocar(resto); return; }
      }
      if (vacia) { console.warn('elemento más alto que una hoja:', el); return; }
      cuerpo.removeChild(el);
      /* keep headings with what follows them */
      const arrastrar = [];
      while (cuerpo.lastElementChild && TITULOS.test(cuerpo.lastElementChild.tagName) && cuerpo.children.length > 1) arrastrar.unshift(cuerpo.removeChild(cuerpo.lastElementChild));
      nuevaHoja();
      arrastrar.forEach(h => cuerpo.appendChild(h));
      colocar(el);
    }

    /* a figure that does not fit would leave a gap at the foot of the sheet: the
       blocks that follow it (text, boxes, tables, and a minor heading together
       with the block it introduces — never a chapter or section heading, nor
       another figure) move up into the gap when they fit whole, and the figure
       opens the next sheet, as figures float in a printed book */
    function adelantar(hijos, i) {
      const fig = hijos[i];
      if (fig.tagName !== 'FIGURE' || !cuerpo.children.length) return;
      cuerpo.appendChild(fig);
      const cabe = !desborda();
      cuerpo.removeChild(fig);
      if (cabe) return;
      const tope = n => n.tagName === 'FIGURE' || /^H[12]$/.test(n.tagName) || n.hasAttribute('data-nueva-hoja') || n.classList.contains('leyenda-marcas');
      let j = i + 1;
      while (j < hijos.length && j - i <= 6) {
        const sig = hijos[j];
        /* the legend of a figure's numbered marks stays with its figure */
        if (tope(sig)) break;
        /* a minor heading only moves with the block that follows it */
        const grupo = TITULOS.test(sig.tagName) ? [sig, hijos[j + 1]] : [sig];
        if (!grupo[grupo.length - 1] || (grupo.length > 1 && (tope(grupo[1]) || TITULOS.test(grupo[1].tagName)))) break;
        grupo.forEach(g => cuerpo.appendChild(g));
        if (desborda()) { grupo.forEach(g => cuerpo.removeChild(g)); break; }
        grupo.forEach(g => { g.dataset.adelantado = '1'; });
        j += grupo.length;
      }
      /* the blocks already placed leave the queue; the figure comes next */
      hijos.splice(i + 1, j - i - 1);
    }

    /* the sections leave the document once paginated: the sheet where each one begins answers for its id */
    const inicioSeccion = new Map();
    secciones.forEach(sec => {
      seccion = sec;
      const empieza = !hoja || sec.classList.contains('capitulo') || sec.hasAttribute('data-nueva-hoja') || hoja.dataset.tipo !== (sec.classList.contains('preliminares') ? 'preliminar' : 'cuerpo');
      if (empieza) nuevaHoja();
      if (sec.id) inicioSeccion.set(sec.id, hoja);
      const hijos = [...sec.children];
      for (let i = 0; i < hijos.length; i++) {
        const ch = hijos[i];
        if (ch.hasAttribute('data-nueva-hoja') && cuerpo.children.length) nuevaHoja();
        adelantar(hijos, i);
        colocar(ch);
      }
      sec.remove();
    });

    /* running heads: the chapter title in force on each sheet */
    libro.querySelectorAll('.hoja').forEach(h => {
      const h1 = h.querySelector('.cap-apertura h1');
      if (h1) tituloCorrido = h1.dataset.corto || h1.textContent.trim();
      if (h.dataset.tipo === 'preliminar') {
        h.insertAdjacentHTML('beforeend', `<div class="pie">${h.dataset.num}</div>`);
        return;
      }
      const apertura = !!h1;
      const par = h.classList.contains('par');
      /* thumb tab on the outer edge, one height per chapter */
      if (h.dataset.pestana) h.insertAdjacentHTML('beforeend', `<div class="pestana" style="top:${(0.85 + 0.64 * (+h.dataset.orden || 0)).toFixed(2)}in">${h.dataset.pestana}</div>`);
      if (!apertura) h.insertAdjacentHTML('beforeend', par
        ? `<div class="cabeza"><span class="cab-num">${h.dataset.num}</span><span class="cab-cap">${tituloCorrido}</span><span class="cab-man">${MANUAL}</span></div>`
        : `<div class="cabeza"><span class="cab-man">${MANUAL}</span><span class="cab-cap">${tituloCorrido}</span><span class="cab-num">${h.dataset.num}</span></div>`);
      else h.insertAdjacentHTML('beforeend', `<div class="pie">${h.dataset.num}</div>`);
    });

    /* page numbers in the table of contents */
    /* the id of each section stays as an empty mark on its first sheet, so links to a chapter still land */
    inicioSeccion.forEach((h, id) => {
      if (document.getElementById(id)) return;
      const marca = document.createElement('span');
      marca.id = id;
      h.insertBefore(marca, h.firstChild);
    });
    tocLinks.forEach(a => {
      const ancla = a.getAttribute('href').slice(1);
      const destino = document.getElementById(ancla);
      const hojaDestino = destino ? destino.closest('.hoja') : inicioSeccion.get(ancla);
      a.querySelector('.toc-pag').textContent = hojaDestino ? hojaDestino.dataset.num : '';
    });
    document.documentElement.classList.add('paginado');
  }

  window.addEventListener('DOMContentLoaded', async () => { await listo(); paginar(); });
})();
