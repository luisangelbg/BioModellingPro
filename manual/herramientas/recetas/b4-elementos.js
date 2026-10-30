/* b4-elementos: el estudio de mapa del Bloque 4 (registros depurados del ejemplo), abierto en la pestaña «elements»
   (recorte: 560 px de alto; 0 = el panel completo). */
(async () => {
  const W = ms => new Promise(r => setTimeout(r, ms));
  await W(800); goToStep(1); await W(500);
  document.getElementById('loadExampleBtn').click(); await W(2500);
  goToStep(2); await W(800); goToStep(3); await W(1200);
  document.getElementById('runCleanBtn').click(); await W(1500);
  goToStep(4); await W(3000);
  const st = mapstudio.studios[0], p = st.panel;
  p.open = true; await W(400);
  p.querySelector('.ms-tab[id$="-tab-elements"]').click(); await W(800);
  window.scrollTo({ top: p.getBoundingClientRect().top + scrollY - 100, behavior: 'instant' }); await W(600);
  const r = p.getBoundingClientRect(), alto = 560 || r.height;
  window.__recorte = [r.left, r.top, r.width, alto].map(Math.round).join(',');
  return window.__recorte;
})()
