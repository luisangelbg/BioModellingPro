/* Bloque 3: las nueve reglas con sus conteos (sin filtrar) */
(async () => {
  const W = ms => new Promise(r => setTimeout(r, ms));
  const caja = (nodos, p) => { const rs = nodos.filter(Boolean).map(n => n.getBoundingClientRect()); const x = Math.min(...rs.map(r => r.left)) - p, y = Math.min(...rs.map(r => r.top)) - p; window.__recorte = [x, y, Math.max(...rs.map(r => r.right)) + p - x, Math.max(...rs.map(r => r.bottom)) + p - y].map(Math.round).join(","); return window.__recorte; };
  const ocultaFlot = () => { const t = document.querySelector(".lnav-top"); if (t && t.parentElement) t.parentElement.style.display = "none"; };
  const ver = async n => { ocultaFlot(); window.scrollTo({ top: n.getBoundingClientRect().top + scrollY - 220, behavior: "instant" }); await W(500); };
  await W(800); goToStep(1); await W(500);
  document.getElementById("loadExampleBtn").click(); await W(2500);
  goToStep(3); await W(1200);
  const c = document.getElementById("cleanRules").closest(".card"); await ver(c);
  return caja([c], 8);
})()
