/* Navigation between steps (0 = home, 1–10 = workflow) and the global spinner.
   The common LABG Suite pieces (window.LABG, js/labg-core.js) mark the active and
   finished steps, add the Previous / Next footer and the keyboard shortcuts. Every
   call is guarded with `if (window.LABG)` so the app still works without that file. */

/* reading order of the steps (explicit, even though it is plain 0…10) */
const STEP_ORDER = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
const stepBtn = n => document.querySelector('.step-btn[data-step="' + n + '"]');
const stepOn = n => { const b = stepBtn(n); return !!b && !b.disabled; };

function goToStep(n) {
  n = Number(n);
  els('.step-panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + n));
  els('.step-btn').forEach(b => b.classList.toggle('active', Number(b.dataset.step) === n));
  document.body.classList.toggle('on-home', n === 0);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const btn = stepBtn(n);
  if (window.LABG) {
    LABG.setCurrentStep(n);                       /* aria-current and brings the step into view */
    if (btn) LABG.announce(T('Paso: ', 'Step: ') + stepLabel(n));
  } else if (btn && btn.scrollIntoView) btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  refreshStepFooters();
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
  const b = stepBtn(n);
  if (b) b.disabled = false;
  refreshStepMarks();
  refreshStepFooters();
}

/* A step is "finished" when it is open and a later step is open too. */
function refreshStepMarks() {
  if (!window.LABG) return;
  STEP_ORDER.forEach((s, i) => {
    if (s === '0') return;
    const later = STEP_ORDER.slice(i + 1).some(stepOn);
    LABG.markStep(s, stepOn(s) && later ? 'done' : null);
  });
}

/* name of a step taken from its button, in the active language: "3 · Depurar" */
function stepLabel(n, lang) {
  const b = stepBtn(n); if (!b) return '';
  const num = b.querySelector('.step-num').textContent.trim();
  const name = b.querySelector('[data-l="' + (lang || I18N.lang) + '"]') || b;
  return (/^\d+$/.test(num) ? num + ' · ' : '') + name.textContent.replace(/\s+/g, ' ').trim();
}
const stepLabelHTML = n => L2(esc(stepLabel(n, 'es')), esc(stepLabel(n, 'en')));

/* Footer of every step: Previous / Next, with the name of the step. */
function refreshStepFooters() {
  els('.step-panel').forEach(p => {
    const n = p.id.replace('panel-', '');
    const i = STEP_ORDER.indexOf(n);
    if (i < 0) return;
    let f = p.querySelector(':scope > .step-footer');
    if (!f) {
      f = document.createElement('nav');
      f.className = 'step-footer no-print';
      f.innerHTML = '<button type="button" class="btn btn-secondary prev"></button><button type="button" class="btn btn-primary next"></button>';
      f.addEventListener('click', e => { const b = e.target.closest('button[data-go]'); if (b && !b.disabled) goToStep(b.dataset.go); });
      p.appendChild(f);
    }
    f.setAttribute('aria-label', T('Pasos', 'Steps'));
    const prev = STEP_ORDER.slice(0, i).reverse().find(stepOn);
    const next = STEP_ORDER.slice(i + 1).find(s => stepBtn(s));
    const bp = f.querySelector('.prev'), bn = f.querySelector('.next');
    bp.hidden = !prev;
    if (prev) { bp.dataset.go = prev; bp.innerHTML = `← <span><small>${L2('Anterior', 'Previous')}</small>${stepLabelHTML(prev)}</span>`; }
    bn.hidden = !next;
    if (next) {
      bn.dataset.go = next; bn.disabled = !stepOn(next);
      bn.innerHTML = `<span><small>${L2('Siguiente', 'Next')}</small>${stepLabelHTML(next)}</span> →`;
    }
  });
}

document.querySelectorAll('.step-btn').forEach(btn => {
  btn.addEventListener('click', () => { if (!btn.disabled) goToStep(btn.dataset.step); });
});
const brand = document.getElementById('brand');
if (brand) brand.addEventListener('click', e => { e.preventDefault(); goToStep(0); });

/* Common bar: theme button label, shortcuts, warning before closing, keyboard.
   The theme itself is switched by Theme (js/i18n.js) with the same saved key. */
document.addEventListener('DOMContentLoaded', () => {
  const stepper = document.getElementById('stepper');
  const nameStepper = () => { if (stepper) stepper.setAttribute('aria-label', T('Pasos', 'Steps')); };
  nameStepper();
  document.addEventListener('langchange', nameStepper);
  if (!window.LABG) return;
  LABG.theme.init('biomodellingpro:theme');
  document.addEventListener('themechange', () => LABG.theme.paint());
  document.addEventListener('langchange', () => { LABG.theme.paint(); refreshStepMarks(); refreshStepFooters(); });
  const hb = document.getElementById('helpBtn');
  if (hb) hb.addEventListener('click', () => LABG.showShortcuts());
  LABG.shortcuts([]);
  LABG.bindStepKeys(goToStep);
  LABG.guardUnload(() => (state.raw && state.raw.length > 0) || (state.clean && state.clean.length > 0));
  LABG.setCurrentStep((document.querySelector('.step-btn.active') || {}).dataset?.step || '0');
  refreshStepMarks();
  refreshStepFooters();
});

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
