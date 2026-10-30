/* b4-mapa: el mapa de los registros depurados del ejemplo, tal como lo exporta el estudio de mapas (PNG, «como se ve», 2×).
   Abre la vista previa de la exportación, espera a que la imagen esté compuesta (con las teselas) y la muestra sola,
   a tamaño natural, sobre la página para recortarla. */
(async () => {
  const W = ms => new Promise(r => setTimeout(r, ms));
  const until = async (f, t = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < t) { try { const v = f(); if (v) return v; } catch (e) {} await W(500); } return null; };
  const caja = (nodos, p) => { const rs = nodos.filter(Boolean).map(n => n.getBoundingClientRect()); const x = Math.min(...rs.map(r => r.left)) - p, y = Math.min(...rs.map(r => r.top)) - p; window.__recorte = [x, y, Math.max(...rs.map(r => r.right)) + p - x, Math.max(...rs.map(r => r.bottom)) + p - y].map(Math.round).join(","); return window.__recorte; };
  await W(800); goToStep(1); await W(500);
  document.getElementById('loadExampleBtn').click(); await W(2500);
  goToStep(2); await W(800); goToStep(3); await W(1200);
  document.getElementById('runCleanBtn').click(); await W(1500);
  goToStep(4); await W(2500);
  const m = document.getElementById('map'); m.style.width = '913px'; m.style.height = '558px'; window.dispatchEvent(new Event('resize')); await W(600); renderMap(); await W(800);
  const st = mapstudio.studios[0];
  await W(4000);                                   /* teselas del mapa de la pantalla */
  st.ex.frame = 'fit';
  st.showPreview();
  const img = await until(() => { const i = document.querySelector('.ms-prev-img'); return i && i.complete && i.naturalWidth ? i : null; }, 90000);
  if (!img) return '{}';
  await W(1500);
  const i2 = document.querySelector('.ms-prev-img');
  const o = new Image(); o.src = i2.src; await o.decode();
  const d = document.querySelector('dialog[open]'); if (d) d.close();
  o.style.cssText = `position:fixed;left:0;top:0;width:${o.naturalWidth / 2}px;height:${o.naturalHeight / 2}px;z-index:2147483647;background:#fff`;
  document.body.appendChild(o); window.scrollTo(0, 0); await W(500);
  return caja([o], 0);
})()
