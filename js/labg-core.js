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
     LABG.linkLabels(raíz)             une cada <label> suelta con su campo (corre sola)
     LABG.guardUnload(hayDatos)      pregunta antes de cerrar si hay trabajo sin guardar
     LABG.shortcuts(lista)             registra atajos y abre el panel «?»
     LABG.theme.init(clave) / toggle() tema claro/oscuro con memoria
     LABG.work(opciones)               espera animada que termina en palomita (ver abajo)
     LABG.progressBar / busyButton     barra en línea y botón que terminan en palomita
     LABG.isotipo(clase)               el ícono LABG en vector (la A-biplot)
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

  /* ---------------- etiquetas de los campos ----------------
     Muchos formularios escriben <label>Texto</label><input>, sin «for»: a la
     vista está claro, pero un lector de pantalla anuncia un campo sin nombre.
     Cada etiqueta suelta se une aquí con su control: el hermano que la sigue o,
     si no, el único control de su caja. Si la caja tiene varios (un grupo de
     opciones) no se adivina nada. Corre al cargar y cada vez que una app
     construye un formulario nuevo. */
  let autoId = 0;
  const CONTROL = 'input:not([type="hidden"]), select, textarea';
  LABG.linkLabels = function (root) {
    (root || document).querySelectorAll('label:not([for])').forEach(l => {
      if (l.querySelector(CONTROL)) return;               /* ya envuelve su control */
      let c = l.nextElementSibling;
      if (!c || !c.matches(CONTROL)) {
        const box = l.parentElement;
        const inBox = box ? box.querySelectorAll(CONTROL) : [];
        if (inBox.length !== 1) return;
        c = inBox[0];
      }
      if ((c.labels && c.labels.length) || c.hasAttribute('aria-label') || c.hasAttribute('aria-labelledby')) return;
      if (!c.id) c.id = 'labg-campo-' + (++autoId);
      l.htmlFor = c.id;
    });
  };
  function watchLabels() {
    LABG.linkLabels();
    if (!window.MutationObserver) return;
    let pending = false;
    new MutationObserver(() => {
      if (pending) return;
      pending = true;
      setTimeout(() => { pending = false; LABG.linkLabels(); }, 150);
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchLabels);
  else watchLabels();

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

  /* ---------------- isotipo LABG (el hexágono dorado con el cubo de datos) ----------------
     LABG.isotipo(clase) devuelve el ícono en vector, con ids propios en cada copia para que
     varias puedan convivir en la página. El cubo lleva la clase iso-cubo y el brillo que lo cruza, iso-brillo. */
  let isoSeq = 0;
  const ISO_HEX = 'M414 0L828 232.9L828 713.3L414 946.2L0 713.3L0 232.9ZM414 36.6L796 251.5L796 694.7L414 909.6L32 694.7L32 251.5Z';
  const ISO_IN = 'M414 36.6L796 251.5L796 694.7L414 909.6L32 694.7L32 251.5Z';
  const ISO_CUBO = 'M440.8 246.5L421.7 257.7L404.8 247.9L424 236.8ZM318.9 256.4L301.7 266.3L285.7 257.1L302.9 247.2ZM522.2 260.9L438.6 309.1L420.1 298.5L503.7 250.2ZM392.5 269.9L373.4 280.9L356.1 271L375.3 260ZM277 277.3L235 301.6L219.9 292.9L261.9 268.6ZM576.1 291.8L398.2 394.4L380.4 384.1L558.3 281.5ZM348.1 295.6L287.5 330.5L270.1 320.5L330.6 285.6ZM404.3 419.1L577.9 318.9L579.2 318.1C579.6 318 580.7 317.9 581.5 317.6C582.2 317.4 583 317 583.8 316.6C584.5 316.2 585.3 315.8 586 315.5C586.8 315.1 587.6 314.8 588.3 314.4C589 314.1 589.8 313.8 590.6 313.5C591.4 313.2 592.2 313 593 312.9C593.8 312.6 594.6 312.5 595.5 312.4C596.3 312.2 597.1 312.2 597.9 312.1C598.9 312.1 599.7 312.1 600.4 312.1C601.4 312.1 602.2 312.1 603 312.2C603.9 312.3 604.7 312.4 605.5 312.5C606.3 312.7 607.1 313 607.9 313.2C608.7 313.5 609.5 313.9 610.1 314.2C610.9 314.6 611.6 315 612.4 315.5C613.1 315.8 613.8 316.3 614.5 316.7C615.2 317.3 615.8 317.8 616.5 318.3C617.1 318.8 617.8 319.4 618.3 319.9C618.9 320.6 619.5 321.2 620.1 321.9C620.6 322.4 621.1 323.1 621.7 323.8C622.1 324.5 622.6 325.2 623 325.8C623.5 326.5 623.9 327.2 624.4 328C624.8 328.7 625.2 329.4 625.6 330.2C626 330.9 626.4 331.7 626.8 332.3C627.1 333.1 627.5 333.8 627.9 334.6C628.3 335.4 628.6 336.1 628.9 336.9C629.3 337.7 629.6 338.4 630 339.2C630.3 340 630.7 340.7 630.9 341.5C631.2 342.3 631.6 343.1 631.9 343.9C632.1 344.5 632.5 345.3 632.7 346.1C632.9 346.9 633.3 347.7 633.5 348.5C633.7 349.3 634 350.1 634.3 350.9C634.5 351.7 634.8 352.5 635.1 353.3C635.3 354.1 635.7 354.9 635.9 355.7C636.1 356.5 636.5 357.3 636.7 358.1C636.9 358.9 637.2 359.7 637.3 360.5C637.5 361.3 637.7 362.1 638 362.9C638.1 363.8 638.3 364.6 638.5 365.4C638.6 366.2 638.9 367 639.1 367.8C639.2 368.6 639.4 369.4 639.7 370.3C639.9 371.1 640 371.9 640.2 372.7C640.3 373.5 640.5 374.3 640.7 375.2C640.8 376 640.9 376.8 641 377.6C641.1 378.5 641.3 379.3 641.4 380.1C641.5 381 641.5 381.8 641.6 382.6C641.7 383.4 641.7 384.3 641.8 385.1C641.9 385.9 641.9 386.8 642.1 387.6C642.1 388.4 642.2 389.3 642.3 390.1C642.3 390.9 642.4 391.9 642.4 392.7C642.5 393.5 642.6 394.2 642.6 395.2C642.7 396 642.7 396.8 642.9 397.7C642.9 398.5 642.9 399.3 642.9 400.2C642.9 401 642.9 401.8 642.9 402.7C642.9 403.5 642.9 404.3 642.7 405.2C642.6 406 642.6 406.8 642.5 407.7C642.4 408.5 642.3 409.3 642.2 410.1C642.1 411 641.9 411.8 641.7 412.6C641.6 413.4 641.5 414.2 641.3 415.1C641.1 415.9 640.9 416.7 640.8 417.5C640.6 418.3 640.3 419.1 640.2 420C640 420.8 639.8 421.6 639.6 422.4C639.4 423.2 639.2 424 638.9 424.8C638.6 425.6 638.4 426.4 638.2 427.2C637.8 428 637.6 428.8 637.3 429.6C637 430.4 636.8 431.2 636.6 432C636.4 432.8 636.2 433.6 636.1 434.5C636.1 435.3 636.2 436.1 636.4 436.9C636.5 437.8 636.8 438.6 637 439.3C637.4 440.1 637.8 440.9 638.2 441.6C638.6 442.2 639.1 442.9 639.6 443.7C640 444.4 640.5 445.1 640.9 445.8C641.4 446.5 641.8 447.1 642.3 447.9C642.6 448.6 643.1 449.3 643.4 450.1C643.9 450.8 644.2 451.6 644.6 452.4C644.9 453.1 645.3 453.9 645.6 454.7C645.9 455.5 646.2 456.2 646.5 456.9C646.8 457.7 647.1 458.5 647.4 459.3C647.6 460.1 647.9 460.9 648.2 461.7C648.4 462.5 648.7 463.3 648.9 464.1C649.1 464.9 649.2 465.7 649.5 466.5C649.7 467.3 649.8 468.2 650 469C650.2 469.8 650.4 470.6 650.5 471.4C650.6 472.3 650.8 473.1 651 473.9C651.1 474.7 651.3 475.5 651.4 476.4C651.5 477.2 651.7 478 651.9 478.8C652 479.6 652.1 480.5 652.2 481.3C652.3 482.1 652.4 483.1 652.5 483.9C652.7 484.7 652.7 485.4 652.8 486.4C652.8 487.2 652.9 488 652.9 488.9C652.9 489.7 653 490.5 653 491.4C653 492.2 653 493 653 493.9C653 494.7 653 495.5 653 496.4C653 497.2 653 498 653 498.9C653 499.7 653 500.5 652.9 501.4C652.9 502.2 652.9 503 652.9 503.9C652.9 504.7 652.8 505.5 652.8 506.4C652.7 507.2 652.7 508 652.5 508.9C652.5 509.7 652.4 510.5 652.3 511.4C652.3 512.2 652.2 513 652.1 513.8C652 514.7 651.9 515.5 651.7 516.3C651.6 517.1 651.5 518.1 651.3 518.9C651.2 519.6 651.1 520.4 651 521.4C650.8 522.2 650.6 523 650.5 523.8C650.4 524.7 650.3 525.5 650 526.3C649.9 527.1 649.7 527.9 649.6 528.8C649.4 529.6 649.2 530.4 649 531.2C648.9 532 648.7 532.8 648.6 533.7C648.3 534.5 648.1 535.3 648 536.1C647.8 536.9 647.5 537.7 647.3 538.5C647.2 539.3 647 540.2 646.7 541C646.4 541.8 646.2 542.6 645.9 543.4C645.7 544 645.4 544.8 645 545.6C644.8 546.4 644.5 547.2 644.1 548C643.8 548.7 643.5 549.5 643.2 550.3C642.9 551.1 642.5 551.8 642.2 552.6C641.8 553.4 641.6 554.2 641.3 554.9C640.9 555.7 640.6 556.5 640.2 557.3C639.9 558 639.6 558.8 639.2 559.5C638.8 560.2 638.4 561 638 561.7C637.6 562.4 637.2 563.2 636.7 563.9C636.4 564.6 635.9 565.4 635.4 566C635 566.7 634.5 567.4 634 568.1C633.5 568.8 633.1 569.5 632.5 570.2C632 570.7 631.5 571.4 630.9 572.1C630.4 572.7 629.9 573.3 629.3 573.9C628.7 574.6 628.2 575.2 627.6 575.7C626.9 576.3 626.3 576.9 625.6 577.4C625.1 578 624.4 578.5 623.7 579C623 579.5 622.3 580 621.7 580.4C621 581 620.3 581.4 619.6 581.9C618.9 582.3 618 582.9 617.5 583.4C617.2 583.8 617.3 584.4 617.2 584.6L403.2 708.2L380.8 695.3L380.8 575.7L220.4 483.2L218.9 482.3C218.5 482.1 217.4 481.9 216.6 481.7C215.9 481.3 215.1 480.9 214.3 480.5C213.6 480.3 212.8 479.9 212.1 479.7C211.3 479.5 210.3 479.4 209.5 479.4C208.7 479.5 207.5 479.7 207 479.9C206.7 479.9 207 479.9 207 479.9L207 596.8L175.1 578.4L175.1 319.8L203.6 303.3L404.3 419.1ZM400.8 328.5L342.4 362.2L325.6 352.6L384.1 318.8ZM381.2 446.6L381.2 536.9L206.8 436.2L206.8 345.9ZM440.3 521.4L440.3 561.1L605.9 465.6L606.9 464.9C607.2 465.3 607.7 466.4 608.3 467C608.9 467.7 609.7 468 610.4 468.5C610.9 469 611.7 469.5 612.3 470.1C612.9 470.6 613.4 471.2 614 471.9C614.5 472.6 614.9 473.3 615.4 473.9C615.8 474.7 616.2 475.4 616.5 476.2C616.9 476.9 617.2 477.7 617.5 478.5C617.9 479.3 618.1 480.1 618.3 480.9C618.7 481.7 618.9 482.5 619.1 483.3C619.4 484.1 619.6 484.9 619.8 485.7C619.9 486.5 620.2 487.3 620.3 488.1C620.4 489 620.6 489.8 620.7 490.6C620.9 491.4 621 492.3 621 493.1C621.1 493.9 621.2 494.8 621.3 495.6C621.3 496.4 621.4 497.2 621.4 498.1C621.5 498.9 621.5 499.7 621.7 500.6C621.7 501.4 621.8 502.2 621.8 503.1C621.8 503.9 621.8 504.7 621.8 505.6C621.8 506.4 621.8 507.2 621.8 508.1C621.8 508.9 621.7 509.7 621.7 510.6C621.7 511.4 621.5 512.2 621.4 513.2C621.4 513.9 621.3 514.7 621.2 515.5C621.1 516.5 621.1 517.3 621 518.1C620.9 519 620.7 519.8 620.6 520.6C620.5 521.4 620.5 522.3 620.3 523.1C620.2 523.9 620.1 524.8 619.9 525.6C619.7 526.4 619.5 527.2 619.4 528C619.1 528.8 618.8 529.6 618.6 530.4C618.2 531.2 618 532 617.7 532.8C617.3 533.4 617 534.2 616.6 535C616.3 535.8 616 536.5 615.6 537.3C615.3 538.1 614.9 538.8 614.6 539.6C614.1 540.3 613.8 541.1 613.3 541.8C612.9 542.4 612.4 543.1 612 543.8C611.5 544.5 610.9 545.2 610.4 545.8C609.8 546.4 609.2 547 608.7 547.6C608.1 548.1 607.4 548.7 606.7 549.3C606.1 549.7 605.5 550.3 604.8 550.8C604.1 551.3 603.4 552 602.8 552.4C602.2 552.6 601.1 552.8 600.8 552.8C600.4 552.8 600.6 552.6 600.6 552.6L415.5 659.3L415.5 455.6L595.9 351.5L597.6 350.6C597.8 350.8 598.6 351.8 599.3 352.3C600 352.6 600.9 352.6 601.7 352.9C602.5 353.1 603.3 353.6 604 353.9C604.7 354.3 605.4 354.8 606 355.4C606.6 355.9 607.2 356.5 607.7 357.2C608.3 357.9 608.8 358.6 609.2 359.3C609.7 359.9 610.1 360.6 610.5 361.4C610.9 362.1 611.3 362.9 611.6 363.6C612 364.4 612.3 365.2 612.6 366C612.9 366.7 613.2 367.5 613.4 368.3C613.8 369.1 614 369.9 614.4 370.7C614.6 371.4 614.8 372.2 615 373C615.2 373.8 615.4 374.8 615.5 375.6C615.7 376.4 615.8 377.1 616 377.9C616.1 378.9 616.2 379.7 616.3 380.5C616.3 381.4 616.4 382.2 616.5 383C616.5 383.8 616.6 384.7 616.6 385.5C616.8 386.3 616.8 387.2 616.9 388C616.9 388.8 616.9 389.7 616.9 390.5C616.9 391.3 616.9 392.2 616.9 393C616.8 393.8 616.8 394.7 616.8 395.5C616.6 396.3 616.5 397.2 616.5 398C616.4 398.8 616.3 399.6 616.2 400.5C616.1 401.3 615.8 402.1 615.7 402.9C615.5 403.8 615.4 404.6 615.2 405.4C614.9 406.2 614.7 407 614.5 407.8C614.2 408.6 614.1 409.4 613.8 410.2C613.6 411 613.3 411.8 613 412.6C612.8 413.4 612.4 414.2 612.1 414.9C611.7 415.7 611.3 416.5 610.9 417.2C610.5 417.8 610 418.5 609.6 419.2C609 419.9 608.5 420.6 608 421.3C607.4 421.8 606.8 422.5 606.3 423.1C605.7 423.7 605.1 424.3 604.6 424.9C604 425.5 603.4 426.2 602.8 426.7C602.3 427.3 601.6 428 601 428.4C600.6 428.9 600 429.1 599.8 429.2L440.3 521.4ZM596.1 417.6L576.9 428.8L531 402.3L550.4 391.2ZM353.9 441L293.6 475.8L276.3 465.7L336.5 431ZM498.1 481.7L478.6 492.9L423.7 461.3L443.2 450ZM374.5 483.1L343.5 501L326.6 491.3L357.6 473.4ZM603.5 540.4L584 551.7L531.7 521.5L551.2 510.2ZM272.6 534.1L272.6 633.6L255.3 623.6L255.3 524.1ZM320.8 561.3L320.8 596.5L303.7 586.6L303.7 551.5ZM363.7 585.2L363.7 684.2L348.4 675.4L348.4 576.4ZM320.8 609.7L320.8 629.8L302.9 619.4L302.9 599.3ZM320.8 642.9L320.8 661.4L303.3 651.2L303.3 632.9Z';
  LABG.isotipo = function (cls, id) {
    const k = id || 'labgIso' + (++isoSeq);
    return '<svg class="' + (cls || 'labg-iso') + '" viewBox="0 0 828 946.2" aria-hidden="true" focusable="false"><defs>' +
      '<linearGradient id="' + k + 'o" gradientUnits="userSpaceOnUse" x1="0" y1="473.1" x2="828" y2="413.1"><stop offset="0" stop-color="#BF8B3C"/><stop offset=".3" stop-color="#C99C49"/><stop offset=".55" stop-color="#D9B05C"/><stop offset=".78" stop-color="#E6C470"/><stop offset="1" stop-color="#F6D985"/></linearGradient>' +
      '<linearGradient id="' + k + 'b"><stop offset="0" stop-color="#FFF8E6" stop-opacity="0"/><stop offset=".5" stop-color="#FFF8E6" stop-opacity=".95"/><stop offset="1" stop-color="#FFF8E6" stop-opacity="0"/></linearGradient>' +
      '<clipPath id="' + k + 'c"><path clip-rule="evenodd" d="' + ISO_CUBO + '"/></clipPath></defs>' +
      '<path fill="url(#' + k + 'o)" fill-rule="evenodd" d="' + ISO_HEX + '"/><path fill="#000" d="' + ISO_IN + '"/>' +
      '<path class="iso-cubo" fill="url(#' + k + 'o)" fill-rule="evenodd" d="' + ISO_CUBO + '"/>' +
      '<g clip-path="url(#' + k + 'c)"><rect class="iso-brillo" x="-300" y="-40" width="220" height="1030" fill="url(#' + k + 'b)" transform="skewX(-18)"/></g></svg>';
  };

  /* ---------------- espera animada que termina en palomita ----------------
     const w = LABG.work({ title, message, scene, tips, cancel });
       w.update(0.4, 'Réplica 400 de 1000')  fracción 0–1; null si no se sabe cuánto falta
       w.message('Ajustando el modelo…')
       w.done('texto')   palomita, onda y estallido; se cierra sola
       w.fail('texto')   tache y botón Cerrar
     opciones.delay (ms): la ventana aparece solo si la espera dura más que eso
     LABG.work.run(opciones, tarea)   abre, deja pintar y corre tarea(w), síncrona o no
     LABG.work.scene = 'fit' | 'cluster' | 'grow'   escena por omisión de la app
     LABG.work.tips = [[es, en], …]   consejos propios de la app (se suman a los comunes)
     LABG.progressBar(contenedor)     barra en línea: update(f, texto) / done(texto) / fail(texto)
     LABG.busyButton(botón, tarea)    el botón trabaja con puntos y termina en palomita
     LABG.nextPaint()                 promesa que se cumple cuando el navegador ya pintó
     Lo que se mueve mientras se calcula usa solo transform y opacity: el navegador
     lo anima aparte, así que no se congela aunque el cálculo ocupe la página. */
  const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  LABG.nextPaint = () => new Promise(res => {
    let ok = false; const go = () => { if (!ok) { ok = true; res(); } };
    requestAnimationFrame(() => requestAnimationFrame(go));
    setTimeout(go, 90);                       /* pestaña oculta: sin cuadros de animación */
  });
  const el = (tag, cls, parent) => { const n = document.createElement(tag); if (cls) n.className = cls; if (parent) parent.appendChild(n); return n; };
  const SVGNS = 'http://www.w3.org/2000/svg';
  const markSvg = () => {
    const s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('viewBox', '0 0 52 52'); s.setAttribute('aria-hidden', 'true');
    s.innerHTML = '<circle class="lw-disc" cx="26" cy="26" r="26"/><path class="lw-check" d="M14.5 27.5l8 8L38 19"/><path class="lw-cross" d="M18 18L34 34M34 18L18 34"/>';
    return s;
  };
  const clock = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const secs = ms => ms < 10000 ? (ms / 1000).toFixed(1).replace('.', LABG.lang() === 'es' ? ',' : '.') + ' s'
    : ms < 60000 ? Math.round(ms / 1000) + ' s' : clock(ms / 1000) + ' min';

  const TIPS = [
    ['Alt + → te lleva al bloque siguiente y Alt + ← al anterior.', 'Alt + → takes you to the next block and Alt + ← to the previous one.'],
    ['Pulsa «?» para ver todos los atajos de teclado.', 'Press “?” to see every keyboard shortcut.'],
    ['Todo se calcula en tu equipo: tus datos no se suben a ningún servidor.', 'Everything is computed on your computer: your data is never uploaded.'],
    ['Las figuras se exportan en alta resolución, listas para publicar.', 'Figures export at high resolution, ready to publish.'],
    ['El botón de tema cambia entre claro y oscuro; la app lo recuerda.', 'The theme button switches light and dark; the app remembers it.'],
    ['La marca ✓ en la barra de bloques indica lo que ya terminaste.', 'A ✓ in the block bar shows what you have already finished.'],
  ];
  const PATIENCE = ['Sigue trabajando. Los análisis con muchas repeticiones tardan un poco más.',
                    'Still working. Analyses with many replicates take a little longer.'];

  /* partículas del estallido: una regla por partícula, con valores fijos */
  let burstReady = false;
  function burstStyle() {
    if (burstReady) return; burstReady = true;
    let css = '';
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + (i % 2 ? 0.17 : 0), r = 50 + (i % 3) * 13;
      const x = Math.round(Math.cos(a) * r), y = Math.round(Math.sin(a) * r), rot = (i * 47) % 360;
      css += '@keyframes lw-b' + i + '{0%{opacity:0;transform:translate(0,0) scale(.4)}12%{opacity:1}' +
        '70%{opacity:1}100%{opacity:0;transform:translate(' + x + 'px,' + (y + 6) + 'px) rotate(' + rot + 'deg) scale(1)}}' +
        '.lw-card.is-done .lw-burst i:nth-child(' + (i + 1) + '){animation:lw-b' + i + ' 900ms ' + (160 + (i % 4) * 25) + 'ms cubic-bezier(.15,.7,.3,1) both}';
    }
    const st = el('style'); st.textContent = '@media (prefers-reduced-motion: no-preference){' + css + '}';
    document.head.appendChild(st);
  }

  /* escenas: puntos que se ordenan en una recta, en grupos, o una planta que crece */
  let sceneSeq = 0;
  function buildScene(kind, host) {
    const scene = el('div', 'lw-scene', host);
    scene.setAttribute('aria-hidden', 'true');
    if (kind === 'tree') {
      /* un cladograma que se dibuja desde la raíz: ((A,B),(C,(D,(E,F)))). Cada pieza
         lleva su momento t (0–1): en bucle brota en orden; con porcentaje, cuando f ≥ t */
      const id = 'lwt' + (++sceneSeq), X = 184;
      const P = [
        ['h', 14, 36, 42, 0], ['v', 36, 21, 63.5, 0.08],
        ['h', 36, 120, 21, 0.16], ['h', 36, 78, 63.5, 0.16],
        ['v', 120, 12, 30, 0.28], ['v', 78, 48, 79, 0.28],
        ['h', 120, X, 12, 0.38], ['h', 120, X, 30, 0.38], ['h', 78, X, 48, 0.38], ['h', 78, 112, 79, 0.38],
        ['v', 112, 66, 92, 0.5], ['h', 112, X, 66, 0.6], ['h', 112, 150, 92, 0.6],
        ['v', 150, 84, 100, 0.7], ['h', 150, X, 84, 0.8], ['h', 150, X, 100, 0.8],
      ];
      [12, 30, 48, 66, 84, 100].forEach((y, i) => P.push(['tip', X, y, i, [0.46, 0.46, 0.46, 0.68, 0.88, 0.88][i]]));
      let css = '';
      const parts = P.map((p, i) => {
        const n = el('div', p[0] === 'tip' ? 'lw-tipdot g' + (p[3] % 3) : 'lw-seg ' + p[0], scene);
        let from;
        if (p[0] === 'h') { Object.assign(n.style, { left: p[1] + 'px', top: (p[3] - 1.25) + 'px', width: (p[2] - p[1]) + 'px' }); from = 'scaleX(0)'; }
        else if (p[0] === 'v') { Object.assign(n.style, { left: (p[1] - 1.25) + 'px', top: p[2] + 'px', height: (p[3] - p[2]) + 'px' }); from = 'scaleY(0)'; }
        else { Object.assign(n.style, { left: (p[1] - 4.5) + 'px', top: (p[2] - 4.5) + 'px' }); from = 'scale(0)'; }
        n.style.transform = from;
        const a = Math.round(p[4] * 55), b = a + 8;
        css += '@keyframes ' + id + 'p' + i + '{0%,' + a + '%{transform:' + from + '}' + b + '%,84%{transform:none}96%,100%{transform:' + from + '}}';
        return { n, t: p[4], from };
      });
      const st = el('style', '', scene); st.textContent = css;
      return {
        scene,
        loop() {
          if (reduced()) { parts.forEach(p => { p.n.style.transform = 'none'; }); return; }
          parts.forEach((p, i) => { p.n.style.animation = id + 'p' + i + ' 3.8s cubic-bezier(.3,.7,.3,1) infinite'; });
        },
        land(f) {
          parts.forEach(p => { p.n.style.animation = 'none'; p.n.style.transform = f >= p.t ? 'none' : p.from; });
        },
      };
    }
    if (kind === 'grow') {
      ['lw-soil', 'lw-seed', 'lw-stem', 'lw-leaf l1', 'lw-leaf l2', 'lw-leaf l3', 'lw-bud'].forEach(c => el('div', c, scene));
      const stem = scene.querySelector('.lw-stem'), parts = scene.querySelectorAll('.lw-leaf, .lw-bud');
      return {
        scene,
        loop() { scene.classList.add('loop'); },
        land(f) {
          scene.classList.remove('loop');
          stem.style.transform = 'scaleY(' + (0.05 + 0.95 * Math.min(1, f / 0.9)).toFixed(3) + ')';
          [0.3, 0.52, 0.74, 0.95].forEach((t, i) => parts[i].classList.toggle('on', f >= t));
        },
      };
    }
    const n = 15, W = 200, H = 112, id = 'lw' + (++sceneSeq);
    const rnd = (a, b) => a + Math.random() * (b - a);
    const pts = [];
    if (kind === 'cluster') {
      const C = [[48, 38], [152, 40], [100, 84]];
      C.forEach((c, g) => { const h = el('div', 'lw-halo g' + g, scene); h.style.left = c[0] + 'px'; h.style.top = c[1] + 'px'; });
      for (let i = 0; i < n; i++) {
        const g = i % 3, a = rnd(0, 6.283), r = rnd(3, 15);
        pts.push({ g, tx: C[g][0] + Math.cos(a) * r, ty: C[g][1] + Math.sin(a) * r });
      }
    } else {
      el('div', 'lw-axis x', scene); el('div', 'lw-axis y', scene);
      const x0 = 22, x1 = 188, y0 = 94, y1 = 20;
      const line = el('div', 'lw-line', scene);
      line.style.left = x0 + 'px'; line.style.top = y0 + 'px';
      line.style.width = Math.hypot(x1 - x0, y1 - y0) + 'px';
      line.style.transform = 'rotate(' + Math.atan2(y1 - y0, x1 - x0) + 'rad)';
      for (let i = 0; i < n; i++) {
        const x = x0 + (i + 0.5) * (x1 - x0) / n;
        pts.push({ g: i % 5 === 2 ? 1 : 0, tx: x, ty: y0 + (x - x0) * (y1 - y0) / (x1 - x0) + rnd(-9, 9) });
      }
    }
    let css = '';
    const dots = pts.map((p, i) => {
      p.sx = rnd(14, W - 14); p.sy = rnd(8, H - 14);
      const d = el('div', 'lw-dot g' + p.g, scene); el('i', '', d);
      const S = 'translate(' + (p.sx - 4.5).toFixed(1) + 'px,' + (p.sy - 4.5).toFixed(1) + 'px)';
      const T = 'translate(' + (p.tx - 4.5).toFixed(1) + 'px,' + (p.ty - 4.5).toFixed(1) + 'px)';
      p.S = S; p.T = T; d.style.transform = S;
      css += '@keyframes ' + id + 'd' + i + '{0%,10%{transform:' + S + '}44%,74%{transform:' + T + '}100%{transform:' + S + '}}';
      return d;
    });
    const st = el('style', '', scene); st.textContent = css;
    const order = dots.map((d, i) => i).sort(() => Math.random() - 0.5);
    const deco = scene.querySelectorAll('.lw-line, .lw-halo');
    return {
      scene,
      loop() {
        if (reduced()) { dots.forEach((d, i) => { d.style.transform = pts[i].T; }); deco.forEach(x => { x.style.opacity = 1; }); return; }
        scene.classList.add('loop');
        dots.forEach((d, i) => { d.style.animation = id + 'd' + i + ' 3.4s cubic-bezier(.45,.05,.3,1) ' + (i * 45) + 'ms infinite'; });
      },
      land(f) {
        scene.classList.remove('loop');
        const k = Math.round(f * n);
        order.forEach((i, r) => { dots[i].style.animation = 'none'; dots[i].style.transform = r < k ? pts[i].T : pts[i].S; });
        deco.forEach(x => { x.style.opacity = Math.max(0, Math.min(1, (f - 0.35) / 0.45)); });
      },
    };
  }

  let current = null;
  LABG.work = function (opts) {
    const o = Object.assign({ title: LABG.t('Calculando…', 'Computing…'), message: '', scene: LABG.work.scene || 'fit', tips: null, cancel: null, hold: 1500, delay: 0 }, opts || {});
    if (current) current.close(true);
    burstStyle();
    const before = document.activeElement;
    const back = el('div', 'lw-backdrop', document.body);
    const card = el('div', 'lw-card', back);
    /* con demora, un cálculo rápido termina antes de que la ventana se vea */
    if (o.delay) back.style.transitionDelay = card.style.transitionDelay = o.delay + 'ms';
    back.addEventListener('click', e => { if (ended && !closed && !card.contains(e.target)) w.close(); });
    const tid = 'lwt' + (++sceneSeq);
    card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', tid); card.tabIndex = -1;
    const stage = el('div', 'lw-stage', card);
    const sc = buildScene(o.scene, stage);
    /* al terminar: el isotipo LABG y, en su esquina, la insignia con la palomita (o el tache) */
    const badge = el('div', 'lw-badge', stage); badge.innerHTML = LABG.isotipo('lw-iso');
    el('div', 'lw-ripple', badge).innerHTML = '<svg viewBox="0 0 828 946.2" aria-hidden="true"><polygon points="414,0 828,232.9 828,713.3 414,946.2 0,713.3 0,232.9"/></svg>'; el('span', 'lw-mark', badge).appendChild(markSvg());
    const burst = el('div', 'lw-burst', stage); burst.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 18; i++) el('i', '', burst);
    const title = el('h2', 'lw-title', card); title.id = tid; title.textContent = o.title;
    const msg = el('p', 'lw-msg', card); msg.textContent = o.message;
    const bar = el('div', 'lw-bar indet', card); const fill = el('div', 'lw-fill', bar);
    bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-labelledby', tid);
    const meta = el('div', 'lw-meta', card); const pct = el('span', '', meta); const time = el('span', '', meta);
    const tip = el('p', 'lw-tip', card);
    const actions = el('div', 'lw-actions', card);
    let cancelBtn = null;

    const t0 = performance.now();
    let frac = null, ended = false, closed = false, lastFrac = 0;
    const tips = (LABG.work.tips || []).concat(o.tips || [], TIPS).map(x => Array.isArray(x) ? x : [x, x]);
    let ti = Math.floor(Math.random() * tips.length), shownPatience = false;
    const showTip = text => { tip.classList.add('fade'); setTimeout(() => { tip.textContent = text; tip.classList.remove('fade'); }, reduced() ? 0 : 350); };
    const tick = () => {
      if (ended) return;
      const s = (performance.now() - t0) / 1000;
      let txt = clock(s);
      if (frac != null && frac > 0.04 && s > 1.5 && frac < 1) {
        const left = s * (1 - frac) / frac;
        txt = LABG.t('quedan ~', '~') + (left < 60 ? Math.max(1, Math.round(left)) + ' s' : clock(left)) + LABG.t('', ' left');
      }
      time.textContent = txt;
    };
    const timers = [setInterval(tick, 500), setTimeout(() => showTip(LABG.t(tips[ti][0], tips[ti][1])), 1800),
      setInterval(() => {
        const s = (performance.now() - t0) / 1000;
        if (s > 14 && !shownPatience) { shownPatience = true; showTip(LABG.t(PATIENCE[0], PATIENCE[1])); return; }
        ti = (ti + 1) % tips.length; showTip(LABG.t(tips[ti][0], tips[ti][1]));
      }, 6500)];
    const stopTimers = () => timers.forEach(t => { clearInterval(t); clearTimeout(t); });

    const w = {
      get ended() { return ended; }, get closed() { return closed; }, cancelled: false,
      message(t) { if (!ended && t != null) msg.textContent = t; return w; },
      update(f, t) {
        if (ended) return w;
        if (t != null) msg.textContent = t;
        if (f == null) { frac = null; fill.style.transform = ''; bar.classList.add('indet'); bar.removeAttribute('aria-valuenow'); pct.textContent = ''; sc.loop(); return w; }
        f = Math.max(0, Math.min(1, +f || 0));
        if (frac == null) bar.classList.remove('indet');
        frac = f;
        fill.style.transform = 'scaleX(' + f.toFixed(4) + ')';
        const p = Math.floor(f * 100);
        pct.textContent = p + ' %';
        bar.setAttribute('aria-valuenow', p);
        if (Math.abs(f - lastFrac) > 0.02 || f === 1 || f === 0) { lastFrac = f; sc.land(f); }
        return w;
      },
      done(text, opt) {
        if (ended) return Promise.resolve();
        /* a wait that ended before its window showed (o.delay) closes quietly: a
           celebration for something the person never saw waiting would only get in the way */
        if (o.delay && performance.now() - t0 < o.delay + 150) { w.close(); return Promise.resolve(); }
        const oo = Object.assign({ title: LABG.t('¡Listo!', 'Done!'), hold: o.hold }, opt || {});
        ended = true; stopTimers();
        const ms = performance.now() - t0;
        bar.classList.remove('indet'); fill.style.transform = 'scaleX(1)'; pct.textContent = '100 %';
        bar.setAttribute('aria-valuenow', 100);
        sc.land(1);
        return new Promise(res => {
          setTimeout(() => {
            card.classList.add('is-done');
            title.textContent = oo.title;
            msg.textContent = text || LABG.t('Terminado en ', 'Finished in ') + secs(ms);
            time.textContent = secs(ms); tip.textContent = '';
            actions.textContent = '';
            LABG.announce(oo.title + ' ' + msg.textContent);
            setTimeout(() => { w.close(); res(); }, reduced() ? Math.min(oo.hold, 1200) : oo.hold);
          }, reduced() ? 0 : 380);
        });
      },
      fail(text) {
        if (ended) return w;
        ended = true; stopTimers();
        bar.classList.remove('indet'); if (frac == null) fill.style.transform = 'scaleX(1)';
        card.classList.add('is-failed');
        time.textContent = secs(performance.now() - t0);
        title.textContent = LABG.t('No se pudo terminar', 'Could not finish');
        msg.textContent = text || ''; tip.textContent = '';
        actions.textContent = '';
        const b = el('button', 'btn btn-secondary btn-sm', actions); b.type = 'button';
        b.textContent = LABG.t('Cerrar', 'Close'); b.addEventListener('click', () => w.close());
        b.focus();
        LABG.announce(title.textContent + '. ' + msg.textContent);
        return w;
      },
      close(now) {
        if (closed) return; closed = true; ended = true; stopTimers();
        document.removeEventListener('keydown', onKey, true);
        if (current === w) current = null;
        back.style.transitionDelay = card.style.transitionDelay = '0ms';
        back.classList.remove('open');
        setTimeout(() => back.remove(), now || reduced() ? 0 : 260);
        if (before && before.focus && document.contains(before)) try { before.focus({ preventScroll: true }); } catch (e) { /* nada */ }
      },
    };
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); if (card.classList.contains('is-failed') || card.classList.contains('is-done')) w.close(); else if (cancelBtn) cancelBtn.click(); }
      else if (e.key === 'Tab') { e.preventDefault(); const b = actions.querySelector('button'); (b || card).focus(); }
    }
    document.addEventListener('keydown', onKey, true);
    if (typeof o.cancel === 'function') {
      cancelBtn = el('button', 'btn btn-secondary btn-sm', actions); cancelBtn.type = 'button';
      cancelBtn.textContent = LABG.t('Cancelar', 'Cancel');
      cancelBtn.addEventListener('click', () => {
        if (ended) return; w.cancelled = true;
        try { o.cancel(); } catch (e) { /* la app decide */ }
        LABG.announce(LABG.t('Cancelado', 'Cancelled')); w.close();
      });
    }
    sc.loop(); tick();
    current = w;
    requestAnimationFrame(() => back.classList.add('open'));
    setTimeout(() => back.classList.add('open'), 30);
    (cancelBtn || card).focus({ preventScroll: true });
    LABG.announce(o.title);
    return w;
  };
  LABG.work.run = async function (opts, task) {
    const w = LABG.work(opts);
    await LABG.nextPaint();
    try {
      const r = await task(w);
      if (w.cancelled) { w.close(); return undefined; }
      w.done(opts && opts.doneMessage);
      return r;
    } catch (e) {
      if (w.cancelled) { w.close(); return undefined; }
      w.fail((opts && opts.failMessage) || (e && e.message) || String(e));
      throw e;
    }
  };

  LABG.progressBar = function (host, opts) {
    const o = Object.assign({ label: '' }, opts || {});
    host.textContent = '';
    const box = el('div', 'lw-inline', host);
    const bar = el('div', 'lw-bar', box); const fill = el('div', 'lw-fill', bar);
    bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', '100');
    if (o.label) bar.setAttribute('aria-label', o.label);
    const label = el('span', 'lw-ilabel', box);
    const mark = el('span', 'lw-imark', box); mark.appendChild(markSvg());
    const t0 = performance.now();
    const api = {
      update(f, text) {
        box.classList.remove('is-done', 'is-failed');
        if (f == null) { bar.classList.add('indet'); bar.removeAttribute('aria-valuenow'); fill.style.transform = ''; }
        else {
          bar.classList.remove('indet'); f = Math.max(0, Math.min(1, +f || 0));
          fill.style.transform = 'scaleX(' + f.toFixed(4) + ')'; bar.setAttribute('aria-valuenow', Math.floor(f * 100));
        }
        label.textContent = text != null ? text : (f == null ? '' : Math.floor(f * 100) + ' %');
        return api;
      },
      done(text) {
        bar.classList.remove('indet'); fill.style.transform = 'scaleX(1)'; bar.setAttribute('aria-valuenow', 100);
        setTimeout(() => {
          box.classList.add('is-done');
          label.textContent = text || LABG.t('Listo · ', 'Done · ') + secs(performance.now() - t0);
        }, reduced() ? 0 : 320);
        return api;
      },
      fail(text) { bar.classList.remove('indet'); box.classList.add('is-failed'); label.textContent = text || LABG.t('Error', 'Error'); return api; },
      el: box,
    };
    return api;
  };

  LABG.busyButton = async function (btn, task, opts) {
    const o = Object.assign({ doneText: LABG.t('Listo', 'Done'), hold: 1600 }, opts || {});
    if (!btn || btn.classList.contains('lw-btn-working')) return undefined;
    const kids = Array.from(btn.childNodes), wasDisabled = btn.disabled;
    btn.style.minWidth = btn.offsetWidth + 'px';
    btn.classList.add('lw-btn-working'); btn.setAttribute('aria-busy', 'true'); btn.disabled = true;
    const dots = el('span', 'lw-dots', btn); dots.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 3; i++) el('i', '', dots);
    const restore = () => {
      btn.classList.remove('lw-btn-working', 'lw-btn-done', 'lw-btn-failed');
      btn.removeAttribute('aria-busy'); btn.replaceChildren(...kids);
      btn.disabled = wasDisabled; btn.style.minWidth = '';
    };
    await LABG.nextPaint();
    try {
      const r = await task();
      btn.classList.remove('lw-btn-working'); btn.classList.add('lw-btn-done'); btn.removeAttribute('aria-busy');
      const s = markSvg(); s.querySelector('.lw-disc').remove(); s.setAttribute('viewBox', '10 12 32 28');
      s.querySelector('.lw-check').style.strokeDashoffset = '0';
      btn.replaceChildren(s, document.createTextNode(' ' + o.doneText));
      LABG.announce(o.doneText);
      setTimeout(restore, o.hold);
      return r;
    } catch (e) {
      btn.classList.remove('lw-btn-working'); btn.classList.add('lw-btn-failed');
      dots.remove(); setTimeout(restore, 900);
      throw e;
    }
  };

  window.LABG = LABG;
})();
