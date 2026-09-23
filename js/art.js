/* BioModelling Pro — original illustrations (inline SVG, drawn with the theme colours so they follow
   light/dark automatically). No text inside the drawings, so they need no translation. */

const Art = (function () {
  const V = n => `var(--${n})`;
  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const svg = (w, h, inner, extra = '') => `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" ${extra}>${inner}</svg>`;
  let uid = 0; const id = p => `${p}${++uid}`;
  const dots = (n, seed, x0, y0, x1, y1, r, fill, stroke = V('card-bg')) => {
    const R = rng(seed); let s = '';
    for (let i = 0; i < n; i++) s += `<circle cx="${(x0 + R() * (x1 - x0)).toFixed(1)}" cy="${(y0 + R() * (y1 - y0)).toFixed(1)}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`;
    return s;
  };
  const cluster = (n, seed, cx, cy, sx, sy, r, fill, stroke = V('card-bg')) => {
    const R = rng(seed); let s = '';
    const g = () => (R() + R() + R() + R() - 2) * 1.2;
    for (let i = 0; i < n; i++) s += `<circle cx="${(cx + g() * sx).toFixed(1)}" cy="${(cy + g() * sy).toFixed(1)}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`;
    return s;
  };

  /* ---------- logo ---------- */
  function logo(px = 30) {
    return `<svg width="${px}" height="${px}" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="13" fill="none" stroke="${V('primary')}" stroke-width="3"/>
      <path d="M5 19c5-7 10-7 14-3s6 2 8-2" stroke="${V('accent')}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      <circle cx="12" cy="11" r="2.4" fill="${V('gold')}"/><circle cx="21" cy="21" r="2.4" fill="${V('gold')}"/></svg>`;
  }

  /* ---------- hero ---------- */
  function hero() {
    const g1 = id('hg'), g2 = id('hg'), cl = id('hc');
    const contour = (cx, cy, rx, ry, rot) => [1, .72, .46, .24].map((k, i) =>
      `<ellipse cx="${cx}" cy="${cy}" rx="${rx * k}" ry="${ry * k}" transform="rotate(${rot} ${cx} ${cy})" fill="none" stroke="${V('accent')}" stroke-width="${i === 0 ? 1.2 : .9}" opacity="${.35 + i * .13}"/>`).join('');
    return svg(560, 440, `
      <defs>
        <radialGradient id="${g1}"><stop offset="0" stop-color="${V('accent')}" stop-opacity=".85"/><stop offset=".55" stop-color="${V('gold')}" stop-opacity=".35"/><stop offset="1" stop-color="${V('gold')}" stop-opacity="0"/></radialGradient>
        <radialGradient id="${g2}"><stop offset="0" stop-color="${V('sky')}" stop-opacity=".5"/><stop offset="1" stop-color="${V('sky')}" stop-opacity="0"/></radialGradient>
        <clipPath id="${cl}"><rect x="24" y="34" width="392" height="290" rx="18"/></clipPath>
      </defs>
      <rect x="24" y="34" width="392" height="290" rx="18" fill="${V('card-bg')}" stroke="${V('border')}"/>
      <g clip-path="url(#${cl})">
        <rect x="24" y="34" width="392" height="290" fill="${V('bg-soft')}"/>
        <path d="M24 250c60-38 90 8 150-22s86-70 150-46 60-18 92-2v144H24z" fill="${V('primary')}" opacity=".13"/>
        <path d="M24 290c70-30 120 4 190-18s110-38 202-10v62H24z" fill="${V('primary')}" opacity=".16"/>
        <ellipse cx="190" cy="150" rx="150" ry="98" fill="url(#${g1})"/>
        <ellipse cx="330" cy="250" rx="80" ry="54" fill="url(#${g2})"/>
        ${contour(190, 150, 122, 78, -14)}
        <g stroke="${V('border-strong')}" stroke-width=".6" opacity=".55">${[...Array(9)].map((_, i) => `<path d="M${24 + i * 49} 34V324"/>`).join('')}${[...Array(6)].map((_, i) => `<path d="M24 ${34 + i * 58}H416"/>`).join('')}</g>
        ${cluster(30, 5, 190, 152, 34, 22, 3.6, V('c1'))}
        ${dots(7, 9, 60, 60, 390, 300, 3.2, V('c1'))}
      </g>
      <rect x="24" y="34" width="392" height="290" rx="18" fill="none" stroke="${V('border-strong')}"/>
      <g transform="translate(378 60)"><circle r="15" fill="${V('card-bg')}" stroke="${V('border')}"/><path d="M0-10 4 3 0 0-4 3z" fill="${V('accent')}"/><path d="M0 10-4-3 0 0 4-3z" fill="${V('border-strong')}"/></g>
      <g transform="translate(44 296)"><rect width="128" height="18" rx="9" fill="${V('card-bg')}" stroke="${V('border')}"/><rect x="6" y="6" width="116" height="6" rx="3" fill="url(#${g1})"/><rect x="6" y="6" width="116" height="6" rx="3" fill="none" stroke="${V('border-strong')}" stroke-width=".6"/></g>

      <g transform="translate(300 232)">
        <rect width="238" height="158" rx="16" fill="${V('card-bg')}" stroke="${V('border')}"/>
        <path d="M22 122H218M22 122V26" stroke="${V('border-strong')}" fill="none" stroke-width="1.2"/>
        <path d="M22 118C50 118 66 112 86 84S112 30 128 30 156 60 172 92 196 118 218 118V122H22z" fill="${V('primary')}" opacity=".18"/>
        <path d="M22 118C50 118 66 112 86 84S112 30 128 30 156 60 172 92 196 118 218 118" fill="none" stroke="${V('primary')}" stroke-width="2.6" stroke-linecap="round"/>
        <path d="M22 108C60 108 96 84 128 56S196 100 218 96" fill="none" stroke="${V('accent')}" stroke-width="2" stroke-dasharray="4 4" stroke-linecap="round"/>
        ${dots(16, 21, 40, 128, 206, 140, 2.6, V('c1'), 'none')}
      </g>

      <g transform="translate(428 46)">
        ${[0, 1, 2, 3].map(i => `<path transform="translate(${i * 3} ${i * 14})" d="M6 0h84l14 26H-8z" fill="${V(['c3', 'c7', 'c4', 'accent'][i])}" opacity="${.9 - i * .06}" stroke="${V('card-bg')}" stroke-width="1.5"/>`).join('')}
        <circle cx="52" cy="40" r="4" fill="${V('c1')}" stroke="${V('card-bg')}" stroke-width="1.5"/><path d="M52 40V96" stroke="${V('c1')}" stroke-dasharray="3 3"/>
      </g>

      <g transform="translate(14 350)">
        <rect width="120" height="62" rx="12" fill="${V('card-bg')}" stroke="${V('border')}"/>
        <rect x="14" y="16" width="14" height="30" rx="3" fill="${V('c3')}"/><rect x="34" y="8" width="14" height="38" rx="3" fill="${V('c1')}"/><rect x="54" y="22" width="14" height="24" rx="3" fill="${V('c4')}"/><rect x="74" y="12" width="14" height="34" rx="3" fill="${V('c2')}"/>
        <path d="M10 50H110" stroke="${V('border-strong')}"/>
      </g>
      <g transform="translate(146 366)">
        <rect width="132" height="46" rx="12" fill="${V('card-bg')}" stroke="${V('border')}"/>
        <path d="M16 34C30 34 34 10 66 10S102 34 116 34" fill="none" stroke="${V('c5')}" stroke-width="2.4" stroke-linecap="round"/>
        <circle cx="66" cy="10" r="3.4" fill="${V('c5')}"/>
      </g>`);
  }

  /* ---------- feature art, one per step (viewBox 300 x 112) ---------- */
  const F = (inner) => svg(300, 112, inner);
  const mapBg = (id0) => `<rect width="300" height="112" fill="${V('bg-soft')}"/><path d="M0 84c46-22 74 6 120-10s70-34 110-20 50-8 70-2v60H0z" fill="${V('primary')}" opacity=".14"/>`;
  const featureArt = {
    1: () => F(`${mapBg()}<g opacity=".95">${dots(22, 3, 20, 20, 190, 100, 3.4, V('c1'))}</g>
      <circle cx="214" cy="52" r="30" fill="${V('card-bg')}" fill-opacity=".55" stroke="${V('accent')}" stroke-width="5"/><path d="M236 74l26 26" stroke="${V('accent')}" stroke-width="8" stroke-linecap="round"/>
      ${dots(6, 4, 196, 40, 232, 66, 3.6, V('c1'))}`),
    2: () => F(`${mapBg()}<path d="M70 18h160l-58 44v34l-44 -12V62z" fill="${V('sky')}" opacity=".2" stroke="${V('sky')}" stroke-width="3" stroke-linejoin="round"/>
      ${dots(14, 6, 76, 4, 224, 20, 3.2, V('c1'))}<g>${dots(5, 8, 128, 96, 172, 108, 3.2, V('c1'))}</g>`),
    3: () => F(`${mapBg()}${dots(18, 12, 20, 16, 280, 100, 3.4, V('c1'))}
      <g stroke="${V('danger')}" stroke-width="3" stroke-linecap="round"><path d="M64 30l14 14M78 30 64 44"/><path d="M182 62l14 14M196 62l-14 14"/><path d="M236 24l14 14M250 24l-14 14"/></g>
      <circle cx="120" cy="70" r="12" fill="none" stroke="${V('warning')}" stroke-width="2.4" stroke-dasharray="3 3"/><circle cx="120" cy="70" r="3.4" fill="${V('c1')}"/><circle cx="127" cy="74" r="3.4" fill="${V('c1')}"/>`),
    4: () => F(`${mapBg()}<g stroke="${V('border-strong')}" stroke-width=".7" opacity=".6">${[...Array(6)].map((_, i) => `<path d="M${i * 60} 0V112"/>`).join('')}${[...Array(4)].map((_, i) => `<path d="M0 ${i * 40}H300"/>`).join('')}</g>
      ${cluster(26, 14, 130, 60, 36, 18, 3.6, V('c1'))}<g transform="translate(266 26)"><circle r="14" fill="${V('card-bg')}" stroke="${V('border')}"/><path d="M0-10 4 3 0 0-4 3z" fill="${V('accent')}"/></g>
      <g transform="translate(24 92)"><path d="M0 0h72" stroke="${V('text')}" stroke-width="2"/><path d="M0-4v8M36-3v6M72-4v8" stroke="${V('text')}" stroke-width="1.6"/></g>`),
    5: () => F(`<rect width="300" height="112" fill="${V('bg-soft')}"/>
      ${[0, 1, 2, 3, 4].map(i => `<path transform="translate(${i * 8} ${i * 12 - 4})" d="M70 14h150l26 32H44z" fill="${V(['c3', 'c7', 'c10', 'c4', 'accent'][i])}" opacity=".88" stroke="${V('card-bg')}" stroke-width="1.6"/>`).join('')}
      <circle cx="150" cy="30" r="5" fill="${V('c1')}" stroke="${V('card-bg')}" stroke-width="2"/><path d="M150 30v70" stroke="${V('text')}" stroke-width="1.2" stroke-dasharray="3 3"/>`),
    6: () => F(`<rect width="300" height="112" fill="${V('bg-soft')}"/>
      ${(() => { const cs = 13, n = 7, x0 = 48, y0 = 10; let s = ''; const R = rng(77);
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = i === j ? 1 : Math.exp(-Math.abs(i - j) * .55) * (R() > .35 ? 1 : -.5) * (0.6 + R() * .4), a = Math.min(1, Math.abs(v) * .95);
          s += `<rect x="${x0 + j * cs}" y="${y0 + i * cs}" width="${cs - 1}" height="${cs - 1}" rx="2" fill="${V(v < 0 ? 'sky' : 'accent')}" opacity="${(i === j ? .35 : .15 + a * .8).toFixed(2)}"/>`; }
        return s; })()}
      <path d="M44 14H24v83h20" fill="none" stroke="${V('text-muted')}" stroke-width="1.4"/><path d="M24 34H12M24 70H12" stroke="${V('text-muted')}" stroke-width="1.4"/>
      <g transform="translate(160 14)"><rect width="128" height="88" rx="10" fill="${V('card-bg')}" stroke="${V('border')}"/>
        ${[0, 1, 2, 3].map(i => `<rect x="12" y="${12 + i * 19}" width="14" height="14" rx="3" fill="none" stroke="${V('border-strong')}" stroke-width="1.6"/>${i !== 2 ? `<path d="M15 ${19 + i * 19}l3 3 6-7" stroke="${V('primary')}" stroke-width="2.2" fill="none" stroke-linecap="round"/>` : ''}<rect x="34" y="${16 + i * 19}" width="${[70, 54, 62, 78][i]}" height="6" rx="3" fill="${V(i === 2 ? 'border-strong' : 'c1')}" opacity=".8"/>`).join('')}</g>`),
    7: () => F(`<rect width="300" height="112" fill="${V('bg-soft')}"/>
      ${[8, 16, 28, 44, 58, 50, 36, 22, 12, 6].map((h, i) => `<rect x="${24 + i * 15}" y="${96 - h * 1.4}" width="12" height="${h * 1.4}" rx="2" fill="${V('c3')}" opacity=".75"/>`).join('')}
      <path d="M24 92C60 90 84 30 118 26S170 84 176 92" fill="none" stroke="${V('accent')}" stroke-width="2.6" stroke-linecap="round"/>
      <g transform="translate(206 0)"><path d="M18 30v54M60 40v34" stroke="${V('text-muted')}" stroke-width="1.6"/><rect x="6" y="44" width="24" height="26" rx="3" fill="${V('c7')}" opacity=".8" stroke="${V('text-muted')}"/><rect x="48" y="48" width="24" height="18" rx="3" fill="${V('c5')}" opacity=".8" stroke="${V('text-muted')}"/><path d="M6 58h24M48 56h24" stroke="${V('text')}" stroke-width="2"/></g>`),
    8: () => F(`<rect width="300" height="112" fill="${V('bg-soft')}"/><path d="M20 96H280M20 96V12" stroke="${V('border-strong')}" fill="none"/>
      <ellipse cx="90" cy="60" rx="46" ry="26" transform="rotate(-20 90 60)" fill="${V('c1')}" opacity=".16" stroke="${V('c1')}"/><ellipse cx="200" cy="44" rx="42" ry="20" transform="rotate(14 200 44)" fill="${V('c2')}" opacity=".16" stroke="${V('c2')}"/><ellipse cx="220" cy="78" rx="34" ry="16" transform="rotate(-8 220 78)" fill="${V('c3')}" opacity=".16" stroke="${V('c3')}"/>
      ${cluster(20, 22, 90, 60, 22, 12, 3, V('c1'))}${cluster(18, 23, 200, 44, 22, 10, 3, V('c2'))}${cluster(14, 24, 220, 78, 18, 8, 3, V('c3'))}`),
    9: () => F(`<defs><linearGradient id="fg8" x1="0" x2="1"><stop offset="0" stop-color="${V('c3')}" stop-opacity=".25"/><stop offset=".5" stop-color="${V('gold')}" stop-opacity=".75"/><stop offset="1" stop-color="${V('accent')}"/></linearGradient>
      <radialGradient id="fg8b"><stop offset="0" stop-color="${V('accent')}" stop-opacity=".9"/><stop offset="1" stop-color="${V('accent')}" stop-opacity="0"/></radialGradient></defs>
      <rect width="300" height="112" fill="${V('bg-soft')}"/><ellipse cx="150" cy="56" rx="118" ry="44" fill="url(#fg8b)"/><ellipse cx="150" cy="56" rx="72" ry="28" fill="none" stroke="${V('card-bg')}" stroke-width="1.4" opacity=".8"/><ellipse cx="150" cy="56" rx="36" ry="14" fill="none" stroke="${V('card-bg')}" stroke-width="1.4" opacity=".8"/>
      ${cluster(18, 31, 150, 56, 30, 12, 3.2, V('c1'))}<rect x="24" y="92" width="120" height="8" rx="4" fill="url(#fg8)" stroke="${V('border-strong')}" stroke-width=".6"/>`),
    10: () => F(`<rect width="300" height="112" fill="${V('bg-soft')}"/>
      <path d="M0 92h300" stroke="${V('c8')}" stroke-width="12" opacity=".35"/>
      ${[0, 1, 2, 3, 4, 5].map(i => { const x = 26 + i * 46, h = [30, 44, 52, 40, 48, 34][i];
        return `<path d="M${x} 86V${86 - h}" stroke="${V('c10')}" stroke-width="2.4" stroke-linecap="round"/>` +
          `<path d="M${x} ${86 - h * .55}c-11-6-14-16-13-24 9 1 17 8 19 18M${x} ${86 - h * .8}c11-6 14-15 13-23-9 1-17 7-19 17" fill="${V('c10')}" opacity=".55" stroke="none"/>` +
          `<circle cx="${x}" cy="${84 - h}" r="${4 + (i % 2) * 1.6}" fill="${V(['c4', 'accent', 'c4', 'c2', 'gold', 'accent'][i])}"/>`; }).join('')}
      <g transform="translate(6 6)"><rect width="74" height="34" rx="8" fill="${V('card-bg')}" stroke="${V('border')}"/>
        <path d="M10 26c6-16 12-16 18-8s10 4 14-6" fill="none" stroke="${V('c3')}" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M46 26c5-4 9-12 14-18" fill="none" stroke="${V('danger')}" stroke-width="2.2" stroke-dasharray="3 3" stroke-linecap="round"/></g>
      <g transform="translate(206 6)"><rect width="88" height="40" rx="8" fill="${V('card-bg')}" stroke="${V('border')}"/>
        ${[...Array(12)].map((_, i) => `<rect x="${6 + (i % 6) * 13}" y="${8 + ((i / 6) | 0) * 13}" width="10" height="10" rx="2" fill="${V(i > 2 && i < 9 ? 'primary' : 'border-strong')}" opacity="${i > 2 && i < 9 ? .85 : .5}"/>`).join('')}</g>`),
  };

  /* ---------- method art (viewBox 200 x 96) ---------- */
  const M = (inner) => svg(200, 96, `<rect width="200" height="96" rx="10" fill="${V('bg-soft')}"/>${inner}`);
  const axes = `<path d="M18 80H186M18 80V12" stroke="${V('border-strong')}" fill="none"/>`;
  const dotsPresence = (n, seed, x0, x1) => dots(n, seed, x0, 84, x1, 90, 2.2, V('c1'), 'none');
  const methodArt = {
    maxent: () => M(`${axes}<path d="M18 72C40 72 52 68 66 50S86 20 104 20s28 22 42 40 24 12 40 12" fill="${V('primary')}" opacity=".16"/><path d="M18 72C40 72 52 68 66 50S86 20 104 20s28 22 42 40 24 12 40 12" fill="none" stroke="${V('primary')}" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M66 50l-14 22M146 60l12 12" stroke="${V('accent')}" stroke-width="1.6" stroke-dasharray="3 3"/><circle cx="66" cy="50" r="3.2" fill="${V('accent')}"/><circle cx="146" cy="60" r="3.2" fill="${V('accent')}"/>${dotsPresence(12, 1, 60, 150)}`),
    glm: () => M(`${axes}<path d="M18 74C60 74 78 72 96 48S140 18 186 18" fill="none" stroke="${V('sky')}" stroke-width="2.8" stroke-linecap="round"/>${dots(10, 2, 24, 68, 84, 76, 2.4, V('c9'))}${dots(10, 3, 118, 16, 182, 26, 2.4, V('c1'))}`),
    gam: () => M(`${axes}<path d="M18 66C34 40 48 34 62 50s16 30 32 14 18-42 36-32 22 20 34 8 14-8 22-14" fill="none" stroke="${V('c7')}" stroke-width="2.8" stroke-linecap="round"/><path d="M18 66C34 40 48 34 62 50s16 30 32 14 18-42 36-32 22 20 34 8 14-8 22-14V80H18z" fill="${V('c7')}" opacity=".12"/>`),
    rf: () => M(`${[0, 1, 2].map(k => `<g transform="translate(${16 + k * 60} 10)"><path d="M22 6v14M22 20L8 34M22 20l14 14M8 34l-6 14M8 34l6 14M36 34l-6 14M36 34l6 14" stroke="${V('c10')}" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="22" cy="6" r="4" fill="${V('c10')}"/>${[[2, 50], [14, 50], [30, 50], [42, 50]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.4" fill="${V('c1')}"/>`).join('')}</g>`).join('')}
      <path d="M18 78H182" stroke="${V('border-strong')}"/><path d="M18 78v-6h30v-8h28v-16h30v10h34v14h42v6" fill="none" stroke="${V('accent')}" stroke-width="2.2" transform="translate(0 4)"/>`),
    brt: () => M(`${axes}${[0, 1, 2, 3, 4].map(i => `<path d="M18 ${74 - i * 3}H${40 + i * 6}v${-10 - i}h${26 - i * 2}v${-14 + i * 2}h${28}v${-6}h${30}v${10}h${40}" fill="none" stroke="${V(['c3', 'c7', 'c10', 'c4', 'accent'][i])}" stroke-width="1.6" opacity="${.35 + i * .14}" transform="translate(0 ${-i * 3})"/>`).join('')}
      <path d="M18 70v-4h26v-12h26v-16h30v-6h30v12h54" fill="none" stroke="${V('primary')}" stroke-width="2.6" stroke-linejoin="round"/>`),
    svm: () => M(`<path d="M30 84L150 8" stroke="${V('text')}" stroke-width="2"/><path d="M14 74L134 -2M50 92L170 18" stroke="${V('c5')}" stroke-width="1.4" stroke-dasharray="4 3" opacity=".8"/>
      ${dots(9, 41, 24, 14, 104, 40, 3.4, V('c1'))}${dots(9, 42, 96, 52, 176, 84, 3.4, V('c2'))}<circle cx="86" cy="42" r="6.4" fill="none" stroke="${V('c5')}" stroke-width="1.6"/><circle cx="108" cy="54" r="6.4" fill="none" stroke="${V('c5')}" stroke-width="1.6"/>`),
    ann: () => M(`${[[34, [22, 48, 74]], [100, [14, 34, 58, 78]], [166, [48]]].map(([x, ys]) => ys.map(y => `<circle cx="${x}" cy="${y}" r="7" fill="${V('card-bg')}" stroke="${V('c4')}" stroke-width="2"/>`).join('')).join('')}
      <g stroke="${V('c9')}" stroke-width=".9" opacity=".7">${[22, 48, 74].map(a => [14, 34, 58, 78].map(b => `<path d="M41 ${a}L93 ${b}"/>`).join('')).join('')}${[14, 34, 58, 78].map(a => `<path d="M107 ${a}L159 48"/>`).join('')}</g>
      ${[[34, [22, 48, 74]], [100, [14, 34, 58, 78]], [166, [48]]].map(([x, ys]) => ys.map(y => `<circle cx="${x}" cy="${y}" r="7" fill="${V('card-bg')}" stroke="${V('c4')}" stroke-width="2"/>`).join('')).join('')}`),
    bioclim: () => M(`${axes}<rect x="58" y="26" width="92" height="46" rx="3" fill="${V('sky')}" opacity=".18" stroke="${V('sky')}" stroke-width="2.2"/>${cluster(24, 51, 104, 48, 22, 10, 2.8, V('c1'))}${dots(5, 52, 24, 16, 176, 76, 2.8, V('c9'))}`),
    domain: () => M(`${cluster(20, 61, 100, 48, 32, 16, 2.8, V('c1'))}<g stroke="${V('c6')}" stroke-width="1.2" opacity=".85"><path d="M140 22L112 44M140 22L96 56M162 70L124 52M162 70L106 60"/></g><circle cx="140" cy="22" r="4.4" fill="${V('c6')}"/><circle cx="162" cy="70" r="4.4" fill="${V('c6')}"/>`),
    mahal: () => M(`${axes}<ellipse cx="106" cy="46" rx="70" ry="28" transform="rotate(-24 106 46)" fill="none" stroke="${V('violet')}" stroke-width="1.4" opacity=".55"/><ellipse cx="106" cy="46" rx="46" ry="18" transform="rotate(-24 106 46)" fill="none" stroke="${V('violet')}" stroke-width="1.8" opacity=".8"/><ellipse cx="106" cy="46" rx="22" ry="8" transform="rotate(-24 106 46)" fill="${V('violet')}" opacity=".25" stroke="${V('violet')}" stroke-width="2"/>
      ${cluster(20, 71, 106, 46, 22, 9, 2.6, V('c1'))}`),
    ensemble: () => M(`${[[70, 44, 'c3'], [104, 36, 'c2'], [130, 52, 'c10']].map(([x, y, c]) => `<ellipse cx="${x}" cy="${y}" rx="44" ry="26" fill="${V(c)}" opacity=".3" stroke="${V(c)}" stroke-width="1.4"/>`).join('')}
      <ellipse cx="102" cy="44" rx="20" ry="12" fill="${V('accent')}" opacity=".7"/>${cluster(10, 81, 102, 44, 12, 6, 2.2, V('c1'))}`),
  };

  return { logo, hero, featureArt, methodArt };
})();
window.Art = Art;

(function () {
  const lg = document.getElementById('brandLogo'); if (lg) lg.innerHTML = Art.logo(30);
  const h = document.getElementById('heroArt'); if (h) h.innerHTML = Art.hero();
})();
