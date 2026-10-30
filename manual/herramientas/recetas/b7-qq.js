/* Bloque 7: detalle de ELEV, gráfico Q-Q normal */
(async () => {
  const W = ms => new Promise(r => setTimeout(r, ms));
  const hasta = async (f, s = 180) => { for (let i = 0; i < s * 2; i++) { try { if (f()) return true; } catch (e) {} await W(500); } return false; };
  const caja = (nodos, p) => { const rs = nodos.filter(Boolean).map(n => n.getBoundingClientRect()); const x = Math.min(...rs.map(r => r.left)) - p, y = Math.min(...rs.map(r => r.top)) - p; window.__recorte = [x, y, Math.max(...rs.map(r => r.right)) + p - x, Math.max(...rs.map(r => r.bottom)) + p - y].map(Math.round).join(","); return window.__recorte; };
  const arriba = async (n, m = 90) => { window.scrollTo({ top: n.getBoundingClientRect().top + scrollY - m, behavior: 'instant' }); await W(400); };
  /* Bloques 1 a 5 con los registros de ejemplo. Las capas WorldClim de datos/ no se pueden leer con fetch desde
     file://, así que se cargan como window.EXAMPLE_RASTERS (la vía que prevé js/rasters.js) desde un archivo .js
     armado con esas mismas capas (base64), fuera del repositorio. */
  await W(800); goToStep(1); await W(400);
  document.getElementById('loadExampleBtn').click(); await W(2500);
  goToStep(2); await W(600); goToStep(3); await W(800);
  document.getElementById('runCleanBtn').click(); await W(800);
  await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'tools/local/rasters-10min.js'; s.onload = res; s.onerror = () => rej('capas'); document.head.appendChild(s); });
  goToStep(5); await W(500);
  document.getElementById('envUseSample').click();
  await hasta(() => Object.keys(state.env.files).length >= 20, 60);
  await window.rasters.extractAll();
  goToStep(6); await W(1500);
  /* Bloque 7 con la selección automática del Bloque 6 (ocho variables, sin fijar ninguna) */
  goToStep(7); await W(800);
  document.getElementById('statsRunBtn').click();
  await hasta(() => document.getElementById('statsResults').style.display === 'block' && document.querySelector('#figHistGrid svg') && document.querySelector('#figDetQQ svg'));
  await W(1500);
  const dv = document.getElementById('statsDetailVar'); dv.value = 'elev'; dv.dispatchEvent(new Event('change')); await W(1500);
  const sv = document.querySelector('#figDetQQ svg');
  await arriba(sv, 220);
  return caja([sv], 0);
})()
