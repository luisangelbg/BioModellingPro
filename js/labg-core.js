/* LABG Suite — comportamiento común a todas las aplicaciones.
   Copyright (C) 2026  Luis Ángel Barrera-Guzmán

   This program is free software: you can redistribute it and/or modify it under
   the terms of the GNU General Public License as published by the Free Software
   Foundation, either version 3 of the License, or (at your option) any later
   version. It is distributed in the hope that it will be useful, but WITHOUT ANY
   WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
   A PARTICULAR PURPOSE. See the GNU General Public License, in the file LICENSE
   at the root of this program, or <https://www.gnu.org/licenses/>.

   Un solo objeto global, window.LABG, sin módulos ni dependencias, para que
   funcione con doble clic (file://). No sustituye el core.js de cada app: le
   da las piezas que todas deben hacer igual.

     LABG.lang()                       'es' | 'en' (lee <html lang>)
     LABG.t(es, en)                    texto en el idioma activo
     LABG.setCurrentStep(n)            marca el bloque activo (aria-current) y lo trae a la vista
     LABG.markStep(n, estado)          'done' | 'warn' | null
     LABG.bindStepKeys(goStep)         Alt+←/→ y flechas dentro de la barra de bloques
     LABG.toast(texto, {type, timeout})  aviso flotante que se anuncia al lector de pantalla
     LABG.announce(texto)              anuncio silencioso (solo lector de pantalla)
     LABG.messageRole(el, type)        role=alert / status para los mensajes en línea
     LABG.guardUnload(hayDatos)        pregunta antes de cerrar si hay trabajo sin guardar
     LABG.shortcuts(lista)             registra atajos y abre el panel «?»
     LABG.theme.init(clave) / toggle() tema claro/oscuro con memoria
     LABG.SUITE_URL                    dirección del portal
*/
(function () {
  'use strict';

  const LABG = window.LABG || {};
  LABG.SUITE_URL = 'https://luisangelbg.github.io/';

  const read = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const write = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* navegación privada */ } };

  LABG.lang = () => (document.documentElement.lang || 'es').slice(0, 2) === 'en' ? 'en' : 'es';
  LABG.t = (es, en) => (LABG.lang() === 'en' ? en : es);

  /* ---------------- barra de bloques ---------------- */
  const stepBtn = n => document.querySelector('.step-btn[data-step="' + String(n) + '"]');
  const stepBtns = () => Array.from(document.querySelectorAll('.stepper .step-btn'));

  LABG.setCurrentStep = function (n) {
    stepBtns().forEach(b => {
      const on = b.dataset.step === String(n);
      b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      b.tabIndex = on ? 0 : -1;               /* un solo punto de tabulación en la barra */
    });
    const b = stepBtn(n);
    if (b && b.scrollIntoView) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  LABG.markStep = function (n, state) {
    const b = stepBtn(n);
    if (!b) return;
    b.classList.toggle('done', state === 'done');
    b.classList.toggle('warn', state === 'warn');
    /* el estado también se dice en voz alta, no solo con color */
    let s = b.querySelector('.step-state');
    if (!s) { s = document.createElement('span'); s.className = 'sr-only step-state'; b.appendChild(s); }
    s.textContent = state === 'done' ? LABG.t(' (terminado)', ' (done)')
      : state === 'warn' ? LABG.t(' (revisar)', ' (check)') : '';
  };

  LABG.bindStepKeys = function (goStep) {
    const usable = () => stepBtns().filter(b => !b.disabled && !b.classList.contains('soon'));
    const move = (from, delta) => {
      const list = usable();
      const i = list.findIndex(b => b.dataset.step === from);
      const to = list[i + delta];
      if (to) { goStep(to.dataset.step); to.focus(); }
    };
    const current = () => {
      const b = document.querySelector('.step-btn[aria-current="step"], .step-btn.active');
      return b ? b.dataset.step : null;
    };
    document.addEventListener('keydown', e => {
      if (e.defaultPrevented) return;
      /* Alt+← / Alt+→ desde cualquier parte de la app */
      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault(); move(current(), e.key === 'ArrowRight' ? 1 : -1); return;
      }
      /* flechas, Inicio y Fin cuando el foco está en la barra */
      const t = e.target;
      if (!t.classList || !t.classList.contains('step-btn')) return;
      const list = usable();
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const i = list.indexOf(t) + (e.key === 'ArrowRight' ? 1 : -1);
        if (list[i]) list[i].focus();
      } else if (e.key === 'Home' && list[0]) { e.preventDefault(); list[0].focus(); }
      else if (e.key === 'End' && list.length) { e.preventDefault(); list[list.length - 1].focus(); }
    });
  };

  /* ---------------- anuncios y avisos ---------------- */
  let live = null;
  function liveRegion() {
    if (live) return live;
    live = document.createElement('div');
    live.className = 'sr-only'; live.setAttribute('aria-live', 'polite'); live.setAttribute('aria-atomic', 'true');
    document.body.appendChild(live);
    return live;
  }
  LABG.announce = function (text) {
    const r = liveRegion();
    r.textContent = '';
    setTimeout(() => { r.textContent = text; }, 60);
  };

  let stack = null;
  LABG.toast = function (text, opts) {
    const o = Object.assign({ type: 'info', timeout: 5000 }, opts || {});
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      document.body.appendChild(stack);
    }
    const el = document.createElement('div');
    el.className = 'toast ' + o.type;
    el.setAttribute('role', o.type === 'error' || o.type === 'warning' ? 'alert' : 'status');
    const span = document.createElement('span'); span.textContent = text;
    const x = document.createElement('button');
    x.type = 'button'; x.className = 'toast-close'; x.textContent = '×';
    x.setAttribute('aria-label', LABG.t('Cerrar aviso', 'Dismiss'));
    x.addEventListener('click', () => el.remove());
    el.append(span, x);
    stack.appendChild(el);
    if (o.timeout) setTimeout(() => el.remove(), o.timeout);
    return el;
  };

  LABG.messageRole = function (el, type) {
    if (!el) return;
    el.setAttribute('role', type === 'error' || type === 'warning' ? 'alert' : 'status');
  };

  /* ---------------- no perder el trabajo ---------------- */
  LABG.guardUnload = function (hasData) {
    window.addEventListener('beforeunload', e => {
      if (hasData()) { e.preventDefault(); e.returnValue = ''; }
    });
  };

  /* ---------------- atajos de teclado ----------------
     lista: [{ keys: ['Ctrl', 'S'], es: 'Guardar el proyecto', en: 'Save the project' }, …]
     Los de la barra de bloques y el propio «?» se añaden solos. */
  let shortcutList = [];
  let dlg = null;
  LABG.shortcuts = function (list) {
    shortcutList = (list || []).slice();
    if (LABG._shortcutsBound) return;
    LABG._shortcutsBound = true;
    document.addEventListener('keydown', e => {
      const t = e.target;
      const typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if (!typing && e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault(); LABG.showShortcuts();
      }
    });
  };
  LABG.showShortcuts = function () {
    const all = [
      { keys: ['Alt', '←'], es: 'Bloque anterior', en: 'Previous block' },
      { keys: ['Alt', '→'], es: 'Bloque siguiente', en: 'Next block' },
      { keys: ['←', '→'], es: 'Recorrer la barra de bloques (con el foco en ella)', en: 'Move along the block bar (when it has focus)' },
      { keys: ['?'], es: 'Mostrar esta lista', en: 'Show this list' },
      { keys: ['Esc'], es: 'Cerrar ventanas y paneles', en: 'Close dialogs and panels' },
    ].concat(shortcutList);
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.className = 'labg-dialog';
      dlg.setAttribute('aria-labelledby', 'labgShortcutsTitle');
      document.body.appendChild(dlg);
      dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    }
    const kbd = k => k.map(x => '<kbd>' + x.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])) + '</kbd>').join(' + ');
    dlg.innerHTML =
      '<div class="dialog-head"><h2 id="labgShortcutsTitle">' + LABG.t('Atajos de teclado', 'Keyboard shortcuts') + '</h2>' +
      '<button type="button" class="icon-btn" data-close aria-label="' + LABG.t('Cerrar', 'Close') + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<div class="dialog-body"><dl class="shortcut-list">' +
      all.map(s => '<dt>' + kbd(s.keys) + '</dt><dd>' + LABG.t(s.es, s.en) + '</dd>').join('') +
      '</dl></div>';
    dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  };

  /* ---------------- tema ---------------- */
  LABG.theme = {
    key: 'labg:theme',
    init(key) {
      if (key) this.key = key;
      const saved = read(this.key);
      if (saved === 'dark' || saved === 'light') document.documentElement.setAttribute('data-theme', saved);
      this.paint();
    },
    current() {
      const set = document.documentElement.getAttribute('data-theme');
      if (set === 'dark' || set === 'light') return set;
      return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    },
    set(mode) {
      document.documentElement.setAttribute('data-theme', mode);
      write(this.key, mode);
      this.paint();
      document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: mode } }));
    },
    toggle() { this.set(this.current() === 'dark' ? 'light' : 'dark'); },
    paint() {
      const b = document.getElementById('themeBtn');
      if (!b) return;
      const dark = this.current() === 'dark';
      const tip = dark ? LABG.t('Cambiar a tema claro', 'Switch to light theme')
                       : LABG.t('Cambiar a tema oscuro', 'Switch to dark theme');
      b.setAttribute('aria-label', tip); b.setAttribute('title', tip);
      b.setAttribute('aria-pressed', dark ? 'true' : 'false');
    },
  };

  window.LABG = LABG;
})();
