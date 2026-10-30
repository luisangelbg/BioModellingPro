/* b5-capas: la tarjeta del Bloque 5 para cargar las capas ráster (A carpeta, B archivos, C ejemplo) y las opciones de
   muestreo, con los registros depurados del ejemplo y sin capas cargadas todavía. */
(async () => {
  const W = ms => new Promise(r => setTimeout(r, ms));
  const until = async (f, t = 180000) => { const t0 = Date.now(); while (Date.now() - t0 < t) { try { const v = f(); if (v) return v; } catch (e) {} await W(500); } return null; };
  const caja = (nodos, p) => { const rs = nodos.filter(Boolean).map(n => n.getBoundingClientRect()); const x = Math.min(...rs.map(r => r.left)) - p, y = Math.min(...rs.map(r => r.top)) - p; window.__recorte = [x, y, Math.max(...rs.map(r => r.right)) + p - x, Math.max(...rs.map(r => r.bottom)) + p - y].map(Math.round).join(","); return window.__recorte; };
  await W(800); goToStep(1); await W(500);
  document.getElementById("loadExampleBtn").click(); await W(2500);
  goToStep(2); await W(800); goToStep(3); await W(1200);
  document.getElementById("runCleanBtn").click(); await W(1500);
  goToStep(5); await W(1500);
  const c = document.getElementById("envFolderBtn").closest(".card");
  window.scrollTo({ top: c.getBoundingClientRect().top + scrollY - 100, behavior: "instant" }); await W(500);
  return caja([c], 0);
})()
