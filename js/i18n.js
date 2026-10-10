/* BioModelling Pro — language (Spanish / English) and colour theme.

   How translation works, so that nothing is ever left half translated:
   1. Rich text in the HTML is written twice, side by side:
        <span data-l="es">…</span><span data-l="en">…</span>
      CSS hides the language that is not active (html[lang]), so switching is
      instant and needs no dictionary lookups.
   2. Short plain texts that cannot be duplicated (options of a <select>,
      button captions, placeholders, tooltips) carry both versions as
      attributes: data-es / data-en, data-es-ph / data-en-ph,
      data-es-title / data-en-title. `I18N.apply()` copies the active one.
   3. Text built by JavaScript uses T('español', 'English'), and every module
      that draws something listens to the 'langchange' event to redraw it.
   4. Figures drawn by Python read the language and the theme from I18N / Theme
      and are redrawn through the view registry (see Views in state.js).

   The initial language is the one saved by the user; otherwise Spanish, as in
   the whole LABG Suite. The theme follows the operating system until the user
   picks one; the saved choice is applied here, in <head>, before painting. */

(function () {
  const KEY_LANG = 'biomodellingpro:lang', KEY_THEME = 'biomodellingpro:theme';
  const read = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const write = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode or file:// restrictions */ } };

  function initialLang() {
    const saved = read(KEY_LANG);
    if (saved === 'es' || saved === 'en') return saved;
    return 'es';                       /* Spanish by default in the whole LABG Suite */
  }

  /* WCAG 2.5.3 (Label in Name). Does the control `n` show, in language `L`, a readable text that its tooltip `tip`
     does not contain? Only for what takes its name from its content (links, buttons, tabs); the text of the other
     language and the icons do not count, and case, punctuation and symbols are ignored. */
  const NAMED_BY_CONTENT = 'a[href], button, summary, [role="link"], [role="button"], [role="tab"], [role="menuitem"]';
  const plain = s => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  function shownText(n, L) {
    let s = '';
    n.childNodes.forEach(c => {
      if (c.nodeType === 3) s += c.nodeValue;
      else if (c.nodeType === 1 && !c.hidden && !/^(svg|script|style)$/i.test(c.nodeName) && (c.getAttribute('data-l') || L) === L) s += shownText(c, L);
    });
    return s;
  }
  function namedByItsText(n, tip, L) {
    if (!n.matches(NAMED_BY_CONTENT)) return false;
    const text = plain(shownText(n, L));
    return text.length > 1 && !plain(tip).includes(text);
  }

  const I18N = {
    lang: initialLang(),

    set(lang) {
      if (lang !== 'es' && lang !== 'en') return;
      const changed = lang !== I18N.lang;
      I18N.lang = lang;
      write(KEY_LANG, lang);
      I18N.apply();
      if (changed) document.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
    },

    /* copy the active language into attribute-translated nodes */
    apply(root) {
      const L = I18N.lang;
      document.documentElement.lang = L;
      const scope = root || document;
      scope.querySelectorAll('[data-es]').forEach(n => { const v = n.getAttribute('data-' + L); if (v != null) n.textContent = v; });
      scope.querySelectorAll('[data-es-html]').forEach(n => { const v = n.getAttribute('data-' + L + '-html'); if (v != null) n.innerHTML = v; });
      scope.querySelectorAll('[data-es-ph]').forEach(n => { const v = n.getAttribute('data-' + L + '-ph'); if (v != null) n.setAttribute('placeholder', v); });
      scope.querySelectorAll('[data-es-title]').forEach(n => {
        const v = n.getAttribute('data-' + L + '-title');
        if (v == null) return;
        n.setAttribute('title', v);
        /* the tooltip is also the name, except where the control already shows a text of its own that the tooltip
           does not contain: there the name is that text and the tooltip stays as its description */
        if (namedByItsText(n, v, L)) n.removeAttribute('aria-label'); else n.setAttribute('aria-label', v);
      });
      const t = document.querySelector('title');
      if (t && t.dataset.es) document.title = t.getAttribute('data-' + L);
      document.querySelectorAll('.lang-seg button').forEach(b => {
        b.classList.toggle('on', b.dataset.lang === L);
        b.setAttribute('aria-pressed', b.dataset.lang === L ? 'true' : 'false');
      });
    },
  };

  /* T('texto', 'text') → the active language. An object {es, en} is also accepted. */
  function T(es, en) {
    if (es && typeof es === 'object' && !Array.isArray(es)) return I18N.lang === 'en' ? es.en : es.es;
    return I18N.lang === 'en' ? en : es;
  }

  /* ---------------- theme ---------------- */
  const Theme = {
    current() {
      const set = document.documentElement.getAttribute('data-theme');
      if (set === 'dark' || set === 'light') return set;
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    },
    set(mode) {
      if (mode === 'dark' || mode === 'light') {
        document.documentElement.setAttribute('data-theme', mode);
        write(KEY_THEME, mode);
      }
      document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: Theme.current() } }));
    },
    toggle() { Theme.set(Theme.current() === 'dark' ? 'light' : 'dark'); },
  };
  const savedTheme = read(KEY_THEME);
  if (savedTheme === 'dark' || savedTheme === 'light') document.documentElement.setAttribute('data-theme', savedTheme);
  document.documentElement.lang = I18N.lang;
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onSys = () => { if (!document.documentElement.getAttribute('data-theme')) document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: Theme.current() } })); };
    if (mq.addEventListener) mq.addEventListener('change', onSys);
  }

  document.addEventListener('DOMContentLoaded', () => {
    I18N.apply();
    document.querySelectorAll('.lang-seg button').forEach(b => b.addEventListener('click', () => I18N.set(b.dataset.lang)));
    const tb = document.getElementById('themeBtn');
    if (tb) tb.addEventListener('click', () => Theme.toggle());
  });

  window.I18N = I18N;
  window.T = T;
  window.Theme = Theme;
})();
