/* Leyenda de la clasificación climática de Köppen-Geiger.
   Códigos numéricos según Beck et al. (2018), "Present and future Köppen-Geiger
   climate classification maps at 1-km resolution", Scientific Data 5:180214.
   El valor 0 corresponde a océano / sin dato. */

const KOPPEN_LEGEND = {
  0:  { code: '—',   name: 'Océano / sin dato',                         color: '#ffffff' },
  1:  { code: 'Af',  name: 'Tropical, selva',                           color: '#0000ff' },
  2:  { code: 'Am',  name: 'Tropical, monzónico',                       color: '#0078ff' },
  3:  { code: 'Aw',  name: 'Tropical, sabana',                          color: '#46aafa' },
  4:  { code: 'BWh', name: 'Árido, desierto, cálido',                   color: '#ff0000' },
  5:  { code: 'BWk', name: 'Árido, desierto, frío',                     color: '#ff9696' },
  6:  { code: 'BSh', name: 'Árido, estepa, cálido',                     color: '#f5a500' },
  7:  { code: 'BSk', name: 'Árido, estepa, frío',                       color: '#ffdc64' },
  8:  { code: 'Csa', name: 'Templado, verano seco y caluroso (mediterráneo)', color: '#ffff00' },
  9:  { code: 'Csb', name: 'Templado, verano seco y templado',         color: '#c8c800' },
  10: { code: 'Csc', name: 'Templado, verano seco y fresco',           color: '#969600' },
  11: { code: 'Cwa', name: 'Templado, invierno seco, verano caluroso', color: '#96ff96' },
  12: { code: 'Cwb', name: 'Templado, invierno seco, verano templado', color: '#64c864' },
  13: { code: 'Cwc', name: 'Templado, invierno seco, verano fresco',   color: '#329632' },
  14: { code: 'Cfa', name: 'Templado, sin estación seca, verano caluroso', color: '#c8ff50' },
  15: { code: 'Cfb', name: 'Templado, sin estación seca, verano templado (oceánico)', color: '#64ff50' },
  16: { code: 'Cfc', name: 'Templado, sin estación seca, verano fresco', color: '#32c800' },
  17: { code: 'Dsa', name: 'Continental, verano seco y caluroso',      color: '#ff00ff' },
  18: { code: 'Dsb', name: 'Continental, verano seco y templado',      color: '#c800c8' },
  19: { code: 'Dsc', name: 'Continental, verano seco y fresco',        color: '#963296' },
  20: { code: 'Dsd', name: 'Continental, verano seco, invierno muy frío', color: '#966496' },
  21: { code: 'Dwa', name: 'Continental, invierno seco, verano caluroso', color: '#aabfff' },
  22: { code: 'Dwb', name: 'Continental, invierno seco, verano templado', color: '#5a78dc' },
  23: { code: 'Dwc', name: 'Continental, invierno seco, verano fresco', color: '#4b50b4' },
  24: { code: 'Dwd', name: 'Continental, invierno seco y muy frío',    color: '#320087' },
  25: { code: 'Dfa', name: 'Continental, sin estación seca, verano caluroso', color: '#00ffff' },
  26: { code: 'Dfb', name: 'Continental, sin estación seca, verano templado', color: '#37c8ff' },
  27: { code: 'Dfc', name: 'Continental, sin estación seca, verano fresco (subártico)', color: '#007d7d' },
  28: { code: 'Dfd', name: 'Continental, sin estación seca, invierno muy frío', color: '#00465f' },
  29: { code: 'ET',  name: 'Polar, tundra',                            color: '#b2b2b2' },
  30: { code: 'EF',  name: 'Polar, hielo perpetuo',                    color: '#666666' },
};

function koppenLabel(v) {
  const k = KOPPEN_LEGEND[v];
  return k ? `${k.code} — ${k.name}` : (v == null ? '—' : `código ${v}`);
}

window.KOPPEN_LEGEND = KOPPEN_LEGEND;
window.koppenLabel = koppenLabel;
