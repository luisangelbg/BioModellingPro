/* Legend of the Köppen-Geiger climate classification.
   Numeric codes follow Beck et al. (2018), "Present and future Köppen-Geiger climate
   classification maps at 1-km resolution", Scientific Data 5:180214. Value 0 = ocean / no data. */

const KOPPEN_LEGEND = {
  0:  { code: '—',   es: 'Océano / sin dato', en: 'Ocean / no data', color: '#ffffff' },
  1:  { code: 'Af',  es: 'Tropical, selva', en: 'Tropical, rainforest', color: '#0000ff' },
  2:  { code: 'Am',  es: 'Tropical, monzónico', en: 'Tropical, monsoon', color: '#0078ff' },
  3:  { code: 'Aw',  es: 'Tropical, sabana', en: 'Tropical, savannah', color: '#46aafa' },
  4:  { code: 'BWh', es: 'Árido, desierto, cálido', en: 'Arid, desert, hot', color: '#ff0000' },
  5:  { code: 'BWk', es: 'Árido, desierto, frío', en: 'Arid, desert, cold', color: '#ff9696' },
  6:  { code: 'BSh', es: 'Árido, estepa, cálido', en: 'Arid, steppe, hot', color: '#f5a500' },
  7:  { code: 'BSk', es: 'Árido, estepa, frío', en: 'Arid, steppe, cold', color: '#ffdc64' },
  8:  { code: 'Csa', es: 'Templado, verano seco y caluroso (mediterráneo)', en: 'Temperate, dry summer, hot summer', color: '#ffff00' },
  9:  { code: 'Csb', es: 'Templado, verano seco y templado', en: 'Temperate, dry summer, warm summer', color: '#c8c800' },
  10: { code: 'Csc', es: 'Templado, verano seco y fresco', en: 'Temperate, dry summer, cold summer', color: '#969600' },
  11: { code: 'Cwa', es: 'Templado, invierno seco, verano caluroso', en: 'Temperate, dry winter, hot summer', color: '#96ff96' },
  12: { code: 'Cwb', es: 'Templado, invierno seco, verano templado', en: 'Temperate, dry winter, warm summer', color: '#64c864' },
  13: { code: 'Cwc', es: 'Templado, invierno seco, verano fresco', en: 'Temperate, dry winter, cold summer', color: '#329632' },
  14: { code: 'Cfa', es: 'Templado, sin estación seca, verano caluroso', en: 'Temperate, no dry season, hot summer', color: '#c8ff50' },
  15: { code: 'Cfb', es: 'Templado, sin estación seca, verano templado (oceánico)', en: 'Temperate, no dry season, warm summer', color: '#64ff50' },
  16: { code: 'Cfc', es: 'Templado, sin estación seca, verano fresco', en: 'Temperate, no dry season, cold summer', color: '#32c800' },
  17: { code: 'Dsa', es: 'Continental, verano seco y caluroso', en: 'Cold, dry summer, hot summer', color: '#ff00ff' },
  18: { code: 'Dsb', es: 'Continental, verano seco y templado', en: 'Cold, dry summer, warm summer', color: '#c800c8' },
  19: { code: 'Dsc', es: 'Continental, verano seco y fresco', en: 'Cold, dry summer, cold summer', color: '#963296' },
  20: { code: 'Dsd', es: 'Continental, verano seco, invierno muy frío', en: 'Cold, dry summer, very cold winter', color: '#966496' },
  21: { code: 'Dwa', es: 'Continental, invierno seco, verano caluroso', en: 'Cold, dry winter, hot summer', color: '#aabfff' },
  22: { code: 'Dwb', es: 'Continental, invierno seco, verano templado', en: 'Cold, dry winter, warm summer', color: '#5a78dc' },
  23: { code: 'Dwc', es: 'Continental, invierno seco, verano fresco', en: 'Cold, dry winter, cold summer', color: '#4b50b4' },
  24: { code: 'Dwd', es: 'Continental, invierno seco y muy frío', en: 'Cold, dry winter, very cold winter', color: '#320087' },
  25: { code: 'Dfa', es: 'Continental, sin estación seca, verano caluroso', en: 'Cold, no dry season, hot summer', color: '#00ffff' },
  26: { code: 'Dfb', es: 'Continental, sin estación seca, verano templado', en: 'Cold, no dry season, warm summer', color: '#37c8ff' },
  27: { code: 'Dfc', es: 'Continental, sin estación seca, verano fresco (subártico)', en: 'Cold, no dry season, cold summer', color: '#007d7d' },
  28: { code: 'Dfd', es: 'Continental, sin estación seca, invierno muy frío', en: 'Cold, no dry season, very cold winter', color: '#00465f' },
  29: { code: 'ET',  es: 'Polar, tundra', en: 'Polar, tundra', color: '#b2b2b2' },
  30: { code: 'EF',  es: 'Polar, hielo perpetuo', en: 'Polar, frost', color: '#666666' },
};

const koppenName = k => k ? T(k.es, k.en) : '';
function koppenLabel(v) {
  const k = KOPPEN_LEGEND[v];
  return k ? `${k.code} — ${koppenName(k)}` : (v == null ? '—' : T('código ', 'code ') + v);
}

window.KOPPEN_LEGEND = KOPPEN_LEGEND;
window.koppenLabel = koppenLabel;
window.koppenName = koppenName;
