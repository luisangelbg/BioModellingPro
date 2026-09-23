/* Informa, para cada hoja de una parte del manual, el hueco que queda al pie (en pulgadas) y con qué empieza y termina. */
(async () => { const W = ms => new Promise(r => setTimeout(r, ms));
  for (let k = 0; k < 60 && !document.querySelector('.hoja'); k++) await W(250); await W(2500);
  return [...document.querySelectorAll('.hoja')].map((h, i) => { const c = h.querySelector('.hoja-cuerpo'); const cb = c.getBoundingClientRect(); const kids = [...c.children]; const last = kids[kids.length - 1]; const lb = last ? last.getBoundingClientRect().bottom : cb.top;
    const first = kids[0] ? (kids[0].tagName + '.' + (kids[0].className || '') + ' ' + (kids[0].textContent || '').trim().slice(0, 40)) : '';
    const nextStart = '';
    return `${i + 1}: hueco ${((cb.bottom - lb) / 96).toFixed(2)} in · empieza ${first.replace(/\s+/g, ' ')} · termina ${last ? last.tagName + ' ' + (last.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30) : ''}`; }).join('\n'); })()
