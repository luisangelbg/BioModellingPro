/* Bloque 1: nombre Pinus cembroides resuelto en GBIF (consulta en línea) */
(async () => {
  const W = ms => new Promise(r => setTimeout(r, ms));
  const caja = (nodos, p) => { const rs = nodos.filter(Boolean).map(n => n.getBoundingClientRect()); const x = Math.min(...rs.map(r => r.left)) - p, y = Math.min(...rs.map(r => r.top)) - p; window.__recorte = [x, y, Math.max(...rs.map(r => r.right)) + p - x, Math.max(...rs.map(r => r.bottom)) + p - y].map(Math.round).join(","); return window.__recorte; };
  const ver = async n => { window.scrollTo({ top: n.getBoundingClientRect().top + scrollY - 90, behavior: "instant" }); await W(500); };
  const espera = async (f, ms = 60000) => { for (let t = 0; t < ms; t += 500) { if (f()) return true; await W(500); } return false; };
  await W(800); goToStep(1); await W(500);
  document.getElementById("speciesInput").value = "Pinus cembroides";
  document.getElementById("matchBtn").click();
  await espera(() => document.getElementById("matchResult").style.display !== "none" && document.getElementById("matchResult").textContent.trim());
  await W(800);
  const c = document.getElementById("matchResult").closest(".card"); window.scrollTo({ top: c.getBoundingClientRect().top + scrollY - 200, behavior: "instant" }); await W(500);
  return caja([c], 8);
})()
