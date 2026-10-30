/* b4-exportar: el estudio de mapa del Bloque 4 (registros depurados del ejemplo), abierto en la pestaña «export»
   con el encuadre «Ajustar a los datos» (recorte: hasta la casilla del recorte al área de estudio). */
(async () => {
  const W = ms => new Promise(r => setTimeout(r, ms));
  await W(800); goToStep(1); await W(500);
  document.getElementById('loadExampleBtn').click(); await W(2500);
  goToStep(2); await W(800); goToStep(3); await W(1200);
  document.getElementById('runCleanBtn').click(); await W(1500);
  goToStep(4); await W(3000);
  const st = mapstudio.studios[0], p = st.panel;
  p.open = true; await W(400);
  p.querySelector('.ms-tab[id$="-tab-export"]').click(); await W(800);
  const sel = [...p.querySelectorAll('.ms-pane select')].find(s => [...s.options].some(o => o.value === 'fit') && [...s.options].some(o => o.value === 'asis'));
  sel.value = 'fit'; sel.dispatchEvent(new Event('change', { bubbles: true })); await W(800);
  window.scrollTo({ top: p.getBoundingClientRect().top + scrollY - 100, behavior: 'instant' }); await W(600);
  const clip = [...p.querySelectorAll('label')].find(l => /Clip to the country|Recortar al país/.test(l.textContent));
  const r = p.getBoundingClientRect(), alto = clip.getBoundingClientRect().bottom + 14 - r.top;
  window.__recorte = [r.left, r.top, r.width, alto].map(Math.round).join(',');
  return window.__recorte;
})()
