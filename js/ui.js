/* Navigation between steps (0 = home, 1–10 = workflow) and the global spinner. */

function goToStep(n) {
  n = Number(n);
  els('.step-panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + n));
  els('.step-btn').forEach(b => b.classList.toggle('active', Number(b.dataset.step) === n));
  document.body.classList.toggle('on-home', n === 0);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const btn = document.querySelector('.step-btn[data-step="' + n + '"]');
  if (btn && btn.scrollIntoView) btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  if (n === 4 && window.renderMap) setTimeout(window.renderMap, 60);
  if (n === 2 && window.invalidateMiniMap) setTimeout(window.invalidateMiniMap, 60);
  if (n === 5 && window.envMap) setTimeout(() => window.envMap.invalidateSize(), 60);
  if (n === 9 && window.sdmOnShow) window.sdmOnShow();
  if (n === 10 && window.agroclimOnShow) window.agroclimOnShow();
  if (n === 6 && window.buildCorr) window.buildCorr();
  if (n === 7 && window.buildStatsVarPicker) window.buildStatsVarPicker();
  if (n === 8) {
    if (window.buildMlPickers) window.buildMlPickers();
    if (window.__clusterMap) setTimeout(() => window.__clusterMap.invalidateSize(), 60);
  }
  document.dispatchEvent(new CustomEvent('stepchange', { detail: { step: n } }));
}

function enableStep(n) {
  const b = document.querySelector(`.step-btn[data-step="${n}"]`);
  if (b) b.disabled = false;
}

document.querySelectorAll('.step-btn').forEach(btn => {
  btn.addEventListener('click', () => { if (!btn.disabled) goToStep(btn.dataset.step); });
});
const brand = document.getElementById('brand');
if (brand) brand.addEventListener('click', () => goToStep(0));

let spinnerCount = 0;
function showSpinner(text) {
  spinnerCount++;
  el('spinnerText').textContent = text || T('Trabajando…', 'Working…');
  el('spinner').style.display = 'flex';
}
function setSpinner(text) { el('spinnerText').textContent = text; }
function hideSpinner() {
  spinnerCount = Math.max(0, spinnerCount - 1);
  if (spinnerCount === 0) el('spinner').style.display = 'none';
}

window.goToStep = goToStep;
window.enableStep = enableStep;
window.showSpinner = showSpinner;
window.setSpinner = setSpinner;
window.hideSpinner = hideSpinner;
