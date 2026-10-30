/* Bloque 10: tarjetas de resumen de la aptitud del maíz */
(async () => {
  const W = ms => new Promise(r => setTimeout(r, ms));
  const caja = (nodos, p) => { const rs = nodos.filter(Boolean).map(n => n.getBoundingClientRect()); const x = Math.min(...rs.map(r => r.left)) - p, y = Math.min(...rs.map(r => r.top)) - p; window.__recorte = [x, y, Math.max(...rs.map(r => r.right)) + p - x, Math.max(...rs.map(r => r.bottom)) + p - y].map(Math.round).join(","); return window.__recorte; };
  const hasta = async (f, s = 180) => { for (let i = 0; i < s * 2; i++) { try { if (f()) return true; } catch (e) {} await W(500); } return false; };
  const $ = id => document.getElementById(id);
  const visible = id => $(id) && $(id).offsetParent !== null && getComputedStyle($(id)).display !== 'none';
  const elegir = (id, v) => { $(id).value = v; $(id).dispatchEvent(new Event('change', { bubbles: true })); };
  /* muestra la exportación del estudio de mapas (la misma imagen que descarga ⬇ PNG) sobre una hoja blanca, a su tamaño real */
  const mostrarExport = async (mapaId, opciones) => {
    const st = mapstudio.studios.find(s => s.map.getContainer().id === mapaId);
    const r = await st.exportBlob(Object.assign({ fmt: 'png', size: 'shown', factor: 2, frame: 'mexico', clipOn: true, clipWhat: 'mexico', clipOutside: 'white', preview: false }, opciones || {}));
    const img = new Image(); img.src = URL.createObjectURL(r.blob); await img.decode();
    const hoja = document.createElement('div'); hoja.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:99999';
    img.style.cssText = 'position:absolute;left:0;top:0;width:' + img.naturalWidth / 2 + 'px;height:' + img.naturalHeight / 2 + 'px';
    hoja.appendChild(img); document.body.appendChild(hoja); await W(300);
    return img;
  };
  await W(800);
  /* Bloques 1–3: registros de ejemplo y depuración de fábrica (2,400 → 1,885) */
  goToStep(1); await W(300); $('loadExampleBtn').click(); await hasta(() => state.raw && state.raw.length > 0, 30);
  $('toStep2Btn').click(); await W(800); $('toStep3Btn').click(); await W(800);
  $('runCleanBtn').click(); await hasta(() => state.clean && state.clean.length > 0, 60); await W(500);
  /* Bloque 5: las capas de WorldClim (10 arc-min) y Köppen. No viajan con el programa y desde file:// no se leen de
     datos/: se carga un example-rasters.js armado con ellas (la vía de escape descrita en js/rasters.js). */
  goToStep(5); await W(300);
  if (!window.EXAMPLE_RASTERS) {
    await new Promise((ok, mal) => { const s = document.createElement('script'); s.src = window.__RASTERS_JS || 'tools/local/rasters-datos.js'; s.onload = ok; s.onerror = mal; document.head.appendChild(s); });
  }
  $('envUseSample').click(); await hasta(() => !$('envExtractBtn').disabled, 120);
  $('envExtractBtn').click(); await hasta(() => state.env && state.env.table && state.env.table.length > 0 && !$('envExtractBtn').disabled, 180); await W(800);
  /* Bloque 10: índices aproximados a partir de las bioclimáticas del paso 5, y aptitud del maíz (primer cultivo) */
  goToStep(10); await W(1500);
  $('agUseBio').click(); await hasta(() => !$('agReadBtn').disabled, 60); await W(500);
  $('agReadBtn').click(); await W(1000); await hasta(() => !$('agReadBtn').disabled && $('agGridSummary').textContent.trim(), 300); await W(500);
  $('agCalcBtn').click(); await W(1000); await hasta(() => !$('agCalcBtn').disabled && visible('agIdxCard'), 300); await W(1500);
  $('agCropRunBtn').click(); await W(1000); await hasta(() => $('agCropSummary').textContent.trim() && !$('agCropRunBtn').disabled, 300); await W(2000);
  const s = $('agCropSummary'); s.scrollIntoView({ block: 'center', behavior: 'instant' }); await W(600); return caja([s], 0);
})()
