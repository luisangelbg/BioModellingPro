/* Navegación por pasos y spinner global. */

function goToStep(n) {
  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
  el('panel-' + n).classList.add('active');
  document.querySelectorAll('.step-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.step, 10) === n);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (n === 4 && window.renderMap) setTimeout(window.renderMap, 60);
  if (n === 2 && window.invalidateMiniMap) setTimeout(window.invalidateMiniMap, 60);
  if (n === 5 && window.envMap) setTimeout(() => window.envMap.invalidateSize(), 60);
  if (n === 7) {
    if (window.buildMlPickers) window.buildMlPickers();
    if (window.__clusterMap) setTimeout(() => window.__clusterMap.invalidateSize(), 60);
  }
}

function enableStep(n) {
  const b = document.querySelector(`.step-btn[data-step="${n}"]`);
  if (b) b.disabled = false;
}

document.querySelectorAll('.step-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    goToStep(parseInt(btn.dataset.step, 10));
  });
});

let spinnerCount = 0;
function showSpinner(text) {
  spinnerCount++;
  el('spinnerText').textContent = text || 'Trabajando…';
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
