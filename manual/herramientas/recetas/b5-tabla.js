/* b5-tabla: el resultado de la extracción del Bloque 5 (cifras y las primeras cinco filas de la tabla). */
(async () => {
  const W = ms => new Promise(r => setTimeout(r, ms));
  const until = async (f, t = 180000) => { const t0 = Date.now(); while (Date.now() - t0 < t) { try { const v = f(); if (v) return v; } catch (e) {} await W(500); } return null; };
  const caja = (nodos, p) => { const rs = nodos.filter(Boolean).map(n => n.getBoundingClientRect()); const x = Math.min(...rs.map(r => r.left)) - p, y = Math.min(...rs.map(r => r.top)) - p; window.__recorte = [x, y, Math.max(...rs.map(r => r.right)) + p - x, Math.max(...rs.map(r => r.bottom)) + p - y].map(Math.round).join(","); return window.__recorte; };
  await W(800); goToStep(1); await W(500);
  document.getElementById("loadExampleBtn").click(); await W(2500);
  goToStep(2); await W(800); goToStep(3); await W(1200);
  document.getElementById("runCleanBtn").click(); await W(1500);
  goToStep(5); await W(1500);
  /* desde file:// el navegador no deja leer datos/: se sirve con un servidor local con CORS en el puerto 19403
     (tools/local/cors-19403.ps1, un HttpListener que entrega datos/* con Access-Control-Allow-Origin: *) */
  const f0 = window.fetch; window.fetch = (u, o) => f0(typeof u === "string" && u.startsWith("datos/") ? "http://localhost:19403/" + u : u, o);
  document.getElementById("envUseSample").click();
  if (!await until(() => !document.getElementById("envExtractBtn").disabled, 60000)) return "{}";
  document.getElementById("envExtractBtn").click();
  if (!await until(() => document.getElementById("envResultCard").style.display === "block")) return "{}";
  await W(1500);
  const c = document.getElementById("envResultCard");
  window.scrollTo({ top: c.getBoundingClientRect().top + scrollY - 100, behavior: "instant" }); await W(500);
  const fila = document.querySelectorAll("#envTable tbody tr")[4];
  const r = c.getBoundingClientRect();
  window.__recorte = [r.left, r.top, r.width, fila.getBoundingClientRect().bottom + 2 - r.top].map(Math.round).join(",");
  return window.__recorte;
})()
