/* Bloque 2: filtro por estado con el grupo Noreste */
(async () => {
  const W = ms => new Promise(r => setTimeout(r, ms));
  const caja = (nodos, p) => { const rs = nodos.filter(Boolean).map(n => n.getBoundingClientRect()); const x = Math.min(...rs.map(r => r.left)) - p, y = Math.min(...rs.map(r => r.top)) - p; window.__recorte = [x, y, Math.max(...rs.map(r => r.right)) + p - x, Math.max(...rs.map(r => r.bottom)) + p - y].map(Math.round).join(","); return window.__recorte; };
  const ocultaFlot = () => { const t = document.querySelector(".lnav-top"); if (t && t.parentElement) t.parentElement.style.display = "none"; };
  const ver = async n => { ocultaFlot(); window.scrollTo({ top: n.getBoundingClientRect().top + scrollY - 220, behavior: "instant" }); await W(500); };
  await W(800); goToStep(1); await W(500);
  document.getElementById("loadExampleBtn").click(); await W(2500);
  goToStep(2); await W(800);
  const pais = [...document.querySelectorAll("#filterGrid .filter-box")][1];
  pais.querySelectorAll(".facet-item").forEach(l => { const i = l.querySelector("input"); const v = l.querySelector("span").textContent; if ((v === "Mexico") !== i.checked) i.click(); });
  await W(400);
  document.getElementById("stNone").click(); await W(300);
  document.querySelector("#stateRegionBtns button[data-g=\"1\"]").click(); await W(400);
  document.getElementById("stateBboxBtn").click(); await W(800);
  const c = document.getElementById("stateCard"); await ver(c);
  return caja([c], 8);
})()
