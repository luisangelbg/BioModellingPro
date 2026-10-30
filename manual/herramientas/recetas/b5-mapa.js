/* b5-mapa: el mapa temático del Bloque 5 con BIO12 (precipitación anual), tal como lo exporta el estudio de mapas
   (PNG, encuadre «Ajustar a los datos», 2×); la imagen de la vista previa se muestra sola para recortarla. */
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
  const sel = document.getElementById("envMapVar"); sel.value = "bio_12"; sel.dispatchEvent(new Event("change", { bubbles: true }));
  const m = document.getElementById("mapEnv"); m.scrollIntoView(); m.style.width = "913px"; m.style.height = "558px";
  window.envMap.invalidateSize(); await W(600); updateEnvMap(true); await W(5000);
  const st = mapstudio.studios.find(s => s.map === window.envMap);
  st.ex.frame = "fit"; st.showPreview();
  const img = await until(() => { const i = document.querySelector(".ms-prev-img"); return i && i.complete && i.naturalWidth ? i : null; }, 90000);
  if (!img) return "{}";
  await W(1500);
  const o = new Image(); o.src = document.querySelector(".ms-prev-img").src; await o.decode();
  const d = document.querySelector("dialog[open]"); if (d) d.close();
  o.style.cssText = "position:fixed;left:0;top:0;width:" + o.naturalWidth / 2 + "px;height:" + o.naturalHeight / 2 + "px;z-index:2147483647;background:#fff";
  document.body.appendChild(o); window.scrollTo(0, 0); await W(500);
  return caja([o], 0);
})()
