/* b4-vistaprevia: la ventana de vista previa de la exportación del Bloque 4 (registros depurados del ejemplo,
   encuadre «Ajustar a los datos»), con la imagen ya compuesta. */
(async () => {
  const W = ms => new Promise(r => setTimeout(r, ms));
  const until = async (f, t = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < t) { try { const v = f(); if (v) return v; } catch (e) {} await W(500); } return null; };
  await W(800); goToStep(1); await W(500);
  document.getElementById('loadExampleBtn').click(); await W(2500);
  goToStep(2); await W(800); goToStep(3); await W(1200);
  document.getElementById('runCleanBtn').click(); await W(1500);
  goToStep(4); await W(2500);
  const m = document.getElementById('map'); m.style.width = '913px'; m.style.height = '558px'; window.dispatchEvent(new Event('resize')); await W(600); renderMap(); await W(4000);
  const st = mapstudio.studios[0];
  st.ex.frame = 'fit';
  st.showPreview();
  const img = await until(() => { const i = document.querySelector('.ms-prev-img'); return i && i.complete && i.naturalWidth ? i : null; }, 90000);
  if (!img) return '{}';
  await W(2000);
  const d = document.querySelector('dialog[open]');
  const b = d.querySelector('button.btn-primary'); if (b) b.blur();
  const r = d.getBoundingClientRect();
  window.__recorte = [r.left, r.top, r.width, r.height].map(Math.round).join(',');
  return window.__recorte;
})()
