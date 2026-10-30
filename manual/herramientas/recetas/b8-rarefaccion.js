(async () => {
  const W = ms => new Promise(r => setTimeout(r, ms));
  const caja = (nodos, p) => { const rs = nodos.filter(Boolean).map(n => n.getBoundingClientRect()); const x = Math.min(...rs.map(r => r.left)) - p, y = Math.min(...rs.map(r => r.top)) - p; window.__recorte = [x, y, Math.max(...rs.map(r => r.right)) + p - x, Math.max(...rs.map(r => r.bottom)) + p - y].map(Math.round).join(","); return window.__recorte; };
  const hasta = async (f, t = 180000) => { const t0 = Date.now(); while (Date.now() - t0 < t) { try { if (f()) return true; } catch (e) {} await W(500); } return false; };
  const $ = id => document.getElementById(id);
  const visible = id => $(id) && $(id).style.display === 'block';
  const conImg = id => $(id) && $(id).querySelector('img, svg, canvas');
  const alVista = async n => { window.scrollTo({ top: n.getBoundingClientRect().top + scrollY - 150, behavior: 'instant' }); await W(600); };
  /* las figuras de Python vienen a 1x: se muestran a la mitad de su ancho para que la captura (al doble) conserve sus píxeles uno a uno */  const nativa = img => { img.style.width = (img.naturalWidth / 2) + 'px'; img.style.maxWidth = 'none'; img.style.height = 'auto'; return img; };
  /* Bloques 1 a 6 con los registros de ejemplo: 2,400 registros → 1,885 depurados → 8 variables elegidas en el Bloque 6.
     Las capas de datos/ no se pueden leer desde file://: se prueban primero como lo hace la app (sirve si la app se abre
     desde un servidor) y, si no, se piden a un servidor local con CORS en el puerto 9406 que sirva la carpeta datos/. */
  await W(800); goToStep(1); await W(300);
  $('loadExampleBtn').click();
  await hasta(() => state.raw && state.raw.length > 0, 20000);
  goToStep(2); await W(800); goToStep(3); await W(1800);
  $('runCleanBtn').click(); await W(1800);
  goToStep(5); await W(500);
  try { await loadExampleRasters(); } catch (e) { state.env.files = {}; }
  if (!state.env.files || !state.env.files.bio_1) {
    const base = 'http://127.0.0.1:9406/', found = {};
    const pedir = async (ruta, clave) => { try { const r = await fetch(base + ruta); if (r.ok) found[clave] = new File([await r.blob()], ruta.split('/').pop(), { type: 'image/tiff' }); } catch (e) {} };
    for (let i = 1; i <= 19; i++) await pedir('worldclim/wc2.1_10m_bio_' + i + '.tif', 'bio_' + i);
    await pedir('worldclim/wc2.1_10m_elev.tif', 'elev');
    await pedir('koppen/Beck_KG_V1_present_0p0083.tif', 'koppen');
    state.env.files = found; state.env.resolution = '10m';
  }
  renderEnvFileReport();
  $('envExtractBtn').click();
  await hasta(() => state.env.table && state.env.table.length > 0, 120000);
  goToStep(6); await W(1800);
  goToStep(8); await W(1800);
  $('mlPrepareBtn').click();
  await hasta(() => visible('mlSections'));
  await W(500);
  /* Figura 8.7: rarefacción por individuos (sitios = celdas de rejilla) */
  $('divRunBtn').click();
  await hasta(() => visible('divOut') && conImg('figDivRaref') && conImg('figDivRad'));
  await W(1800);
  const f = conImg('figDivRaref'); await alVista(f); return caja([f], 2);
})()
