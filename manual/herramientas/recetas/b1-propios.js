/* Bloque 1: cinco registros propios pegados desde una hoja de cálculo */
(async () => {
  const W = ms => new Promise(r => setTimeout(r, ms));
  const caja = (nodos, p) => { const rs = nodos.filter(Boolean).map(n => n.getBoundingClientRect()); const x = Math.min(...rs.map(r => r.left)) - p, y = Math.min(...rs.map(r => r.top)) - p; window.__recorte = [x, y, Math.max(...rs.map(r => r.right)) + p - x, Math.max(...rs.map(r => r.bottom)) + p - y].map(Math.round).join(","); return window.__recorte; };
  const ver = async n => { window.scrollTo({ top: n.getBoundingClientRect().top + scrollY - 90, behavior: "instant" }); await W(500); };
  const espera = async (f, ms = 60000) => { for (let t = 0; t < ms; t += 500) { if (f()) return true; await W(500); } return false; };
  await W(800); goToStep(1); await W(500);
  const t = document.getElementById("userPaste");
  t.value = ["especie\tlongitud\tlatitud",
    "Pinus cembroides\t-104.6532\t24.0217",
    "Pinus cembroides\t-100.9832\t22.1512",
    "Pinus cembroides\t-105.2214\t25.4410",
    "Pinus cembroides subsp. orizabensis\t-97.2647\t19.0355",
    "Pinus cembroides\t-102.3145\t23.7708"].join("\n");
  document.getElementById("userPasteBtn").click();
  await espera(() => document.getElementById("userMapping").style.display !== "none" && document.getElementById("uTiles"));
  await W(1000);
  const d = t.closest("details"); if (d) d.open = false;
  document.getElementById("userFile").style.visibility = "hidden"; await W(300);
  const c = document.getElementById("userDataCard"); await ver(c);
  return caja([c], 8);
})()
