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

/* Waiting window: the suite's common one (LABG.work), with a growing plant.
   showSpinner(text, steps)  opens it; if it is already open (a wait inside another), changes the text.
                             With «steps», each setSpinner moves the bar one step. A wait with steps
                             inside another (the Python engine inside an analysis) only moves within
                             the stretch that belongs to it.
   setSpinner(text)          changes the text and moves the active wait one step, if it has steps
   spinnerProgress(f, text)  sets the finished fraction of the active wait, 0–1
   hideSpinner()             closes it with a check mark; without it after an error or if it was very short */
let spinnerCount = 0, spin = null;   /* spin.frames: one per open wait; the last one is active */
if (window.LABG) {
  LABG.work.scene = 'grow';
  LABG.work.tips = [
    ['El estudio de mapas cambia paleta, escala y leyenda sin repetir el análisis.',
     'The map studio changes palette, scale and legend without rerunning the analysis.'],
    ['Cada mapa se exporta como imagen o como GeoTIFF para abrirlo en un SIG.',
     'Every map exports as an image or as a GeoTIFF to open in a GIS.'],
    ['Las fichas de ayuda explican cómo leer cada resultado y qué escala usar.',
     'The help cards explain how to read each result and which scale to use.'],
  ];
}
const frameFrac = f => f.steps ? f.lo + (f.hi - f.lo) * Math.min(f.k / f.steps, 1) : f.frac;
function paintSpinner(text) {
  const f = frameFrac(spin.frames[spin.frames.length - 1]);
  spin.w.update(f == null ? null : Math.min(f, 0.97), text);
}
function showSpinner(text, steps) {
  spinnerCount++;
  if (!window.LABG) {
    el('spinnerText').textContent = text || T('Trabajando…', 'Working…');
    el('spinner').style.display = 'flex';
    return;
  }
  if (!spin) {
    spin = { w: LABG.work({ title: text || T('Trabajando…', 'Working…'), delay: 350 }), t0: performance.now(), failed: false,
             frames: [{ steps: steps || 0, k: 0, lo: 0, hi: 1, frac: steps ? 0 : null }] };
  } else {
    /* the inner wait's stretch: from where the outer one is to its next step */
    const p = spin.frames[spin.frames.length - 1], pf = frameFrac(p);
    const lo = pf == null ? 0 : pf;
    const hi = pf == null ? 1 : p.steps ? Math.min(p.hi, pf + (p.hi - p.lo) / p.steps) : pf;
    spin.frames.push({ steps: steps || 0, k: 0, lo, hi, frac: pf });
    spin.w.message(text);
  }
  paintSpinner();
}
function setSpinner(text) {
  if (!window.LABG) { el('spinnerText').textContent = text; return; }
  if (!spin) return;
  const f = spin.frames[spin.frames.length - 1];
  if (f.steps) f.k++;
  paintSpinner(text);
}
function spinnerProgress(frac, text) {
  if (!spin) return;
  const f = spin.frames[spin.frames.length - 1];
  if (!f.steps) f.frac = frac;
  paintSpinner(text);
}
/* state.js calls this when an error message is shown: that wait does not end with a check mark */
function spinnerFailed() { if (spin) spin.failed = true; }
function hideSpinner(force) {
  spinnerCount = force ? 0 : Math.max(0, spinnerCount - 1);
  if (spin && spinnerCount > 0) {
    while (spin.frames.length > spinnerCount) spin.frames.pop();
    paintSpinner();
  }
  if (spinnerCount !== 0) return;
  if (!window.LABG) { el('spinner').style.display = 'none'; return; }
  if (!spin) return;
  const s = spin; spin = null;
  if (s.failed || performance.now() - s.t0 < 450) s.w.close();
  else s.w.done(null, { hold: 1300 });
}
/* Inline progress bars (.progress-wrap): when the work behind them ends, the bar fills, turns
   green and a check mark pops at its end; with ok = false, a cross. The bar stays visible. */
function finishBar(wrapId, ok, text) {
  const wrap = el(wrapId);
  if (!wrap) return;
  const fill = wrap.querySelector('.progress-fill, .div-progress-bar > div');
  const label = wrap.querySelector('.progress-label, [id$="Label"]');
  if (fill && ok !== false) fill.style.width = '100%';
  if (label && text != null) label.textContent = text;
  let mark = wrap.querySelector('.lw-imark');
  if (!mark) {
    mark = document.createElement('span'); mark.className = 'lw-imark';
    mark.innerHTML = '<svg viewBox="0 0 52 52" aria-hidden="true"><circle class="lw-disc" cx="26" cy="26" r="26"/><path class="lw-check" d="M14.5 27.5l8 8L38 19"/><path class="lw-cross" d="M18 18L34 34M34 18L18 34"/></svg>';
    wrap.appendChild(mark);
  }
  wrap.classList.remove('is-done', 'is-failed');
  void wrap.offsetWidth;                       /* restart the pop if it ends twice */
  wrap.classList.add('lw-inline', ok === false ? 'is-failed' : 'is-done');
  if (window.LABG && text) LABG.announce(text);
}
/* a bar that starts again loses its previous ending */
function resetBar(wrapId) {
  const wrap = el(wrapId);
  if (wrap) wrap.classList.remove('is-done', 'is-failed');
}

window.goToStep = goToStep;
window.enableStep = enableStep;
window.showSpinner = showSpinner;
window.setSpinner = setSpinner;
window.hideSpinner = hideSpinner;
window.spinnerProgress = spinnerProgress;
window.spinnerFailed = spinnerFailed;
window.finishBar = finishBar;
window.resetBar = resetBar;
