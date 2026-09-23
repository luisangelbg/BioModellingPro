/* Step 10 · crop parameter catalogue for the mechanistic suitability envelope.

   The envelope follows the FAO EcoCrop approach as formalised by Ramirez-Villegas et al. (2013):
   each crop is described by an absolute and an optimal range for the mean temperature of the cycle
   and for the precipitation accumulated over the cycle, plus a cycle length, a killing temperature
   and (for perennials) a chilling requirement.

   The values below are INDICATIVE reference ranges gathered from the agronomic literature for the
   species as a whole. They are not variety specific and the user is expected to edit them: every
   field is editable in the interface, crops can be added or removed and the whole set can be saved
   and reloaded as JSON so that the parameters actually used can be reported in a paper.

   Field names are kept short because they are written out many times:
     tna / tno / txo / txa   absolute min, optimal min, optimal max, absolute max mean temperature (°C)
     rna / rno / rxo / rxa   absolute min, optimal min, optimal max, absolute max precipitation over the cycle (mm)
     cmin / cmax             cycle length (days); 365 marks a perennial evaluated over the whole year
     kt                      killing low temperature (°C): a month colder than this inside the cycle kills the crop
     kx                      killing high temperature (°C) or null (then txa + 8 is used)
     ch                      chilling requirement (hours below the chilling threshold) or null
     phn / phx               pH range (reported only: the app has no soil-pH layer)
     ev                      maximum elevation (m) or null
     n                       a short bilingual note
   All code comments are in English; every text shown to the user carries both languages. */

(function () {
  const KEY = 'biomodellingpro:crops';

  const GROUPS = {
    cereal:      { es: 'Cereales', en: 'Cereals' },
    pseudo:      { es: 'Pseudocereales', en: 'Pseudocereals' },
    legume:      { es: 'Leguminosas', en: 'Legumes' },
    tuber:       { es: 'Raíces y tubérculos', en: 'Roots and tubers' },
    veg:         { es: 'Hortalizas', en: 'Vegetables' },
    oil:         { es: 'Oleaginosas', en: 'Oilseeds' },
    forage:      { es: 'Forrajes', en: 'Forages' },
    industrial:  { es: 'Industriales', en: 'Industrial crops' },
    fruit:       { es: 'Frutales tropicales y subtropicales', en: 'Tropical and subtropical fruit' },
    temperate:   { es: 'Frutales de clima templado', en: 'Temperate fruit' },
    berry:       { es: 'Frutillas', en: 'Berries' },
    arid:        { es: 'Cultivos de zonas áridas', en: 'Arid-land crops' },
    plantation:  { es: 'Cultivos de plantación', en: 'Plantation crops' },
  };

  /* id, es, en, group, tna, tno, txo, txa, rna, rno, rxo, rxa, cmin, cmax, kt, kx, ch, phn, phx, ev, note */
  const DEFAULTS = [
    { id: 'maize', es: 'Maíz', en: 'Maize', g: 'cereal', tna: 10, tno: 20, txo: 33, txa: 45, rna: 300, rno: 500, rxo: 1200, rxa: 1800, cmin: 90, cmax: 160, kt: 0, kx: null, ch: null, phn: 5.0, phx: 8.0, ev: 3300,
      n: { es: 'Muy amplio: las razas de altiplano toleran ciclos más fríos y largos que las tropicales.', en: 'Very broad: highland landraces tolerate colder and longer cycles than tropical ones.' } },
    { id: 'bean', es: 'Frijol común', en: 'Common bean', g: 'legume', tna: 10, tno: 18, txo: 28, txa: 35, rna: 250, rno: 400, rxo: 800, rxa: 1300, cmin: 70, cmax: 110, kt: 0.5, kx: null, ch: null, phn: 5.5, phx: 7.5, ev: 3000,
      n: { es: 'Sensible al calor en floración; el exceso de lluvia favorece enfermedades.', en: 'Heat sensitive at flowering; excess rainfall favours disease.' } },
    { id: 'wheat', es: 'Trigo', en: 'Wheat', g: 'cereal', tna: 4, tno: 15, txo: 24, txa: 35, rna: 300, rno: 450, rxo: 900, rxa: 1600, cmin: 100, cmax: 180, kt: -5, kx: null, ch: null, phn: 5.5, phx: 8.0, ev: 3000,
      n: { es: 'Valores de trigo de primavera; los de invierno toleran temperaturas mucho menores.', en: 'Values for spring wheat; winter types tolerate much lower temperatures.' } },
    { id: 'barley', es: 'Cebada', en: 'Barley', g: 'cereal', tna: 2, tno: 12, txo: 22, txa: 32, rna: 200, rno: 350, rxo: 800, rxa: 1400, cmin: 90, cmax: 150, kt: -6, kx: null, ch: null, phn: 6.0, phx: 8.5, ev: 3400,
      n: { es: 'Más tolerante a sequía y salinidad que el trigo.', en: 'More tolerant of drought and salinity than wheat.' } },
    { id: 'oat', es: 'Avena', en: 'Oat', g: 'cereal', tna: 2, tno: 12, txo: 22, txa: 30, rna: 250, rno: 400, rxo: 900, rxa: 1500, cmin: 90, cmax: 150, kt: -6, kx: null, ch: null, phn: 5.0, phx: 7.5, ev: 3200,
      n: { es: 'Usada también como forraje de invierno.', en: 'Also grown as a winter forage.' } },
    { id: 'sorghum', es: 'Sorgo', en: 'Sorghum', g: 'cereal', tna: 12, tno: 22, txo: 34, txa: 45, rna: 250, rno: 400, rxo: 900, rxa: 1600, cmin: 90, cmax: 150, kt: 2, kx: null, ch: null, phn: 5.5, phx: 8.5, ev: 2300,
      n: { es: 'Resiste sequía y calor mejor que el maíz.', en: 'Withstands drought and heat better than maize.' } },
    { id: 'rice', es: 'Arroz', en: 'Rice', g: 'cereal', tna: 15, tno: 22, txo: 32, txa: 40, rna: 700, rno: 1000, rxo: 2000, rxa: 3500, cmin: 90, cmax: 180, kt: 5, kx: null, ch: null, phn: 4.5, phx: 7.5, ev: 2000,
      n: { es: 'Los umbrales de lluvia suponen secano; bajo riego el límite inferior no aplica.', en: 'Rainfall thresholds assume rainfed conditions; under irrigation the lower limit does not apply.' } },
    { id: 'amaranth', es: 'Amaranto', en: 'Amaranth', g: 'pseudo', tna: 12, tno: 20, txo: 30, txa: 40, rna: 200, rno: 400, rxo: 800, rxa: 1500, cmin: 90, cmax: 140, kt: 1, kx: null, ch: null, phn: 5.5, phx: 8.0, ev: 2800,
      n: { es: 'Cultivo C4 eficiente en agua, de grano de alto valor.', en: 'Water-efficient C4 crop with a high-value grain.' } },
    { id: 'chia', es: 'Chía', en: 'Chia', g: 'pseudo', tna: 12, tno: 20, txo: 30, txa: 38, rna: 300, rno: 450, rxo: 900, rxa: 1500, cmin: 100, cmax: 150, kt: 2, kx: null, ch: null, phn: 6.0, phx: 8.0, ev: 2200,
      n: { es: 'De día corto: la floración depende del fotoperiodo, no solo del clima.', en: 'Short-day plant: flowering depends on photoperiod, not only on climate.' } },
    { id: 'quinoa', es: 'Quinua', en: 'Quinoa', g: 'pseudo', tna: 2, tno: 12, txo: 22, txa: 32, rna: 200, rno: 300, rxo: 800, rxa: 1500, cmin: 120, cmax: 180, kt: -3, kx: null, ch: null, phn: 6.0, phx: 8.5, ev: 4000,
      n: { es: 'Tolera heladas ligeras y suelos salinos; el calor reduce el llenado de grano.', en: 'Tolerates light frost and saline soils; heat reduces grain filling.' } },
    { id: 'fababean', es: 'Haba', en: 'Faba bean', g: 'legume', tna: 3, tno: 12, txo: 22, txa: 30, rna: 300, rno: 450, rxo: 900, rxa: 1500, cmin: 110, cmax: 180, kt: -5, kx: null, ch: null, phn: 6.0, phx: 8.0, ev: 3200,
      n: { es: 'Común en temporal de altiplano, asociada con maíz.', en: 'Common in highland rainfed systems, intercropped with maize.' } },
    { id: 'chickpea', es: 'Garbanzo', en: 'Chickpea', g: 'legume', tna: 5, tno: 15, txo: 27, txa: 35, rna: 200, rno: 350, rxo: 700, rxa: 1200, cmin: 100, cmax: 170, kt: -3, kx: null, ch: null, phn: 6.0, phx: 8.5, ev: 2600,
      n: { es: 'Cultivo de invierno con humedad residual; el exceso de lluvia le perjudica.', en: 'Winter crop on residual moisture; excess rainfall is harmful.' } },
    { id: 'potato', es: 'Papa', en: 'Potato', g: 'tuber', tna: 5, tno: 15, txo: 22, txa: 30, rna: 300, rno: 500, rxo: 900, rxa: 1400, cmin: 90, cmax: 150, kt: -1, kx: 32, ch: null, phn: 4.5, phx: 7.0, ev: 4000,
      n: { es: 'La tuberización se detiene por encima de unos 25 °C nocturnos.', en: 'Tuber formation stops above about 25 °C at night.' } },
    { id: 'sweetpotato', es: 'Camote', en: 'Sweet potato', g: 'tuber', tna: 12, tno: 20, txo: 30, txa: 38, rna: 400, rno: 600, rxo: 1200, rxa: 2000, cmin: 100, cmax: 180, kt: 2, kx: null, ch: null, phn: 5.0, phx: 7.5, ev: 2200,
      n: { es: 'Tolera suelos pobres; no resiste heladas.', en: 'Tolerates poor soils; no frost tolerance.' } },
    { id: 'cassava', es: 'Yuca', en: 'Cassava', g: 'tuber', tna: 14, tno: 22, txo: 32, txa: 40, rna: 500, rno: 800, rxo: 1800, rxa: 3000, cmin: 240, cmax: 365, kt: 5, kx: null, ch: null, phn: 4.5, phx: 7.5, ev: 1800,
      n: { es: 'Ciclo largo, muy tolerante a sequía una vez establecida.', en: 'Long cycle, very drought tolerant once established.' } },
    { id: 'tomato', es: 'Jitomate', en: 'Tomato', g: 'veg', tna: 12, tno: 20, txo: 28, txa: 35, rna: 300, rno: 500, rxo: 900, rxa: 1400, cmin: 90, cmax: 150, kt: 1, kx: 38, ch: null, phn: 5.5, phx: 7.5, ev: 2400,
      n: { es: 'A cielo abierto la lluvia intensa favorece tizones.', en: 'In the open field heavy rain favours blights.' } },
    { id: 'chilli', es: 'Chile', en: 'Chilli pepper', g: 'veg', tna: 14, tno: 20, txo: 30, txa: 38, rna: 300, rno: 500, rxo: 1000, rxa: 1600, cmin: 100, cmax: 180, kt: 2, kx: null, ch: null, phn: 5.5, phx: 7.5, ev: 2300,
      n: { es: 'Muchos tipos locales con requerimientos distintos; ajusta los valores.', en: 'Many local types with different requirements; adjust the values.' } },
    { id: 'squash', es: 'Calabaza', en: 'Squash', g: 'veg', tna: 12, tno: 20, txo: 30, txa: 38, rna: 250, rno: 400, rxo: 900, rxa: 1600, cmin: 80, cmax: 140, kt: 1, kx: null, ch: null, phn: 5.5, phx: 7.5, ev: 2600,
      n: { es: 'Parte de la milpa; tolera calor con humedad suficiente.', en: 'Part of the milpa system; tolerates heat with enough moisture.' } },
    { id: 'onion', es: 'Cebolla', en: 'Onion', g: 'veg', tna: 6, tno: 15, txo: 25, txa: 33, rna: 300, rno: 450, rxo: 800, rxa: 1300, cmin: 100, cmax: 180, kt: -2, kx: null, ch: null, phn: 6.0, phx: 7.5, ev: 2600,
      n: { es: 'El bulbeo depende también del fotoperiodo del cultivar.', en: 'Bulbing also depends on the cultivar photoperiod.' } },
    { id: 'garlic', es: 'Ajo', en: 'Garlic', g: 'veg', tna: 5, tno: 13, txo: 24, txa: 32, rna: 250, rno: 400, rxo: 700, rxa: 1200, cmin: 120, cmax: 210, kt: -4, kx: null, ch: null, phn: 6.0, phx: 7.5, ev: 2800,
      n: { es: 'Necesita un periodo fresco para diferenciar los dientes.', en: 'Needs a cool period to differentiate the cloves.' } },
    { id: 'carrot', es: 'Zanahoria', en: 'Carrot', g: 'veg', tna: 5, tno: 15, txo: 24, txa: 32, rna: 300, rno: 450, rxo: 800, rxa: 1300, cmin: 80, cmax: 140, kt: -2, kx: null, ch: null, phn: 5.5, phx: 7.5, ev: 2900,
      n: { es: 'El calor deforma la raíz y aumenta el sabor amargo.', en: 'Heat deforms the root and increases bitterness.' } },
    { id: 'lettuce', es: 'Lechuga', en: 'Lettuce', g: 'veg', tna: 4, tno: 13, txo: 22, txa: 30, rna: 200, rno: 350, rxo: 700, rxa: 1200, cmin: 55, cmax: 100, kt: -2, kx: 30, ch: null, phn: 6.0, phx: 7.5, ev: 2900,
      n: { es: 'Ciclo corto: permite varias siembras al año donde el clima es fresco.', en: 'Short cycle: several plantings a year where the climate is cool.' } },
    { id: 'broccoli', es: 'Brócoli', en: 'Broccoli', g: 'veg', tna: 4, tno: 13, txo: 22, txa: 30, rna: 300, rno: 450, rxo: 800, rxa: 1300, cmin: 80, cmax: 130, kt: -3, kx: 32, ch: null, phn: 6.0, phx: 7.5, ev: 2900,
      n: { es: 'Necesita clima fresco constante para formar la pella.', en: 'Needs a steadily cool climate to form the head.' } },
    { id: 'alfalfa', es: 'Alfalfa', en: 'Alfalfa', g: 'forage', tna: 5, tno: 18, txo: 28, txa: 38, rna: 400, rno: 600, rxo: 1200, rxa: 2000, cmin: 300, cmax: 365, kt: -15, kx: null, ch: null, phn: 6.5, phx: 8.5, ev: 3000,
      n: { es: 'Perenne de varios cortes; muy demandante de agua.', en: 'Perennial with several cuts; very water demanding.' } },
    { id: 'ryegrass', es: 'Ballico', en: 'Ryegrass', g: 'forage', tna: 3, tno: 12, txo: 22, txa: 30, rna: 400, rno: 600, rxo: 1300, rxa: 2200, cmin: 120, cmax: 365, kt: -8, kx: null, ch: null, phn: 5.5, phx: 7.5, ev: 3200,
      n: { es: 'Forraje de invierno en zonas templadas y de altura.', en: 'Winter forage in temperate and highland areas.' } },
    { id: 'soybean', es: 'Soya', en: 'Soybean', g: 'oil', tna: 12, tno: 20, txo: 30, txa: 38, rna: 400, rno: 600, rxo: 1200, rxa: 1800, cmin: 90, cmax: 160, kt: 1, kx: null, ch: null, phn: 5.5, phx: 7.5, ev: 2000,
      n: { es: 'De día corto; el grupo de madurez debe ajustarse a la latitud.', en: 'Short-day crop; the maturity group must match the latitude.' } },
    { id: 'peanut', es: 'Cacahuate', en: 'Peanut', g: 'oil', tna: 14, tno: 22, txo: 32, txa: 40, rna: 400, rno: 600, rxo: 1200, rxa: 1800, cmin: 100, cmax: 160, kt: 3, kx: null, ch: null, phn: 5.5, phx: 7.5, ev: 1800,
      n: { es: 'Requiere suelos arenosos y sequía al final del ciclo.', en: 'Requires sandy soils and a dry spell at the end of the cycle.' } },
    { id: 'sesame', es: 'Ajonjolí', en: 'Sesame', g: 'oil', tna: 15, tno: 22, txo: 32, txa: 40, rna: 300, rno: 500, rxo: 900, rxa: 1400, cmin: 80, cmax: 140, kt: 4, kx: null, ch: null, phn: 5.5, phx: 8.0, ev: 1600,
      n: { es: 'La lluvia en cosecha abre las cápsulas y tira la semilla.', en: 'Rain at harvest splits the capsules and sheds the seed.' } },
    { id: 'safflower', es: 'Cártamo', en: 'Safflower', g: 'oil', tna: 5, tno: 18, txo: 28, txa: 38, rna: 200, rno: 350, rxo: 700, rxa: 1200, cmin: 110, cmax: 180, kt: -5, kx: null, ch: null, phn: 6.0, phx: 8.5, ev: 2300,
      n: { es: 'Muy tolerante a sequía; raíz profunda.', en: 'Very drought tolerant; deep rooted.' } },
    { id: 'sunflower', es: 'Girasol', en: 'Sunflower', g: 'oil', tna: 8, tno: 20, txo: 28, txa: 36, rna: 300, rno: 500, rxo: 900, rxa: 1500, cmin: 90, cmax: 150, kt: -1, kx: null, ch: null, phn: 6.0, phx: 8.0, ev: 2600,
      n: { es: 'Buen uso del agua del perfil; sensible a exceso de humedad.', en: 'Uses profile water well; sensitive to waterlogging.' } },
    { id: 'canola', es: 'Canola', en: 'Canola', g: 'oil', tna: 3, tno: 14, txo: 24, txa: 32, rna: 300, rno: 450, rxo: 800, rxa: 1300, cmin: 100, cmax: 180, kt: -8, kx: null, ch: null, phn: 5.5, phx: 8.0, ev: 2700,
      n: { es: 'Cultivo de invierno; el calor en floración corta el rendimiento.', en: 'Winter crop; heat at flowering cuts yield sharply.' } },
    { id: 'cotton', es: 'Algodón', en: 'Cotton', g: 'industrial', tna: 14, tno: 22, txo: 32, txa: 42, rna: 400, rno: 600, rxo: 1100, rxa: 1800, cmin: 150, cmax: 210, kt: 3, kx: null, ch: null, phn: 5.5, phx: 8.5, ev: 1600,
      n: { es: 'Ciclo largo y cálido; necesita final de ciclo seco.', en: 'Long warm cycle; needs a dry end of season.' } },
    { id: 'sugarcane', es: 'Caña de azúcar', en: 'Sugarcane', g: 'industrial', tna: 15, tno: 24, txo: 33, txa: 40, rna: 900, rno: 1200, rxo: 2000, rxa: 3500, cmin: 300, cmax: 365, kt: 2, kx: null, ch: null, phn: 5.0, phx: 8.0, ev: 1600,
      n: { es: 'Muy demandante de agua y calor; 10–14 meses de ciclo.', en: 'Very water and heat demanding; 10–14 month cycle.' } },
    { id: 'coffee', es: 'Café arábica', en: 'Arabica coffee', g: 'plantation', tna: 13, tno: 18, txo: 24, txa: 30, rna: 1000, rno: 1200, rxo: 1800, rxa: 3000, cmin: 365, cmax: 365, kt: 4, kx: 32, ch: null, phn: 5.0, phx: 6.5, ev: 2200,
      n: { es: 'Rango térmico estrecho: el indicador clásico del cambio climático en el trópico de altura.', en: 'Narrow thermal range: the classic climate-change indicator of the tropical highlands.' } },
    { id: 'cacao', es: 'Cacao', en: 'Cacao', g: 'plantation', tna: 18, tno: 22, txo: 30, txa: 35, rna: 1200, rno: 1500, rxo: 2500, rxa: 4000, cmin: 365, cmax: 365, kt: 10, kx: null, ch: null, phn: 5.0, phx: 7.5, ev: 1000,
      n: { es: 'Necesita sombra y humedad constante; no tolera sequía marcada.', en: 'Needs shade and constant moisture; does not tolerate a marked dry season.' } },
    { id: 'vanilla', es: 'Vainilla', en: 'Vanilla', g: 'plantation', tna: 18, tno: 22, txo: 30, txa: 35, rna: 1500, rno: 1800, rxo: 2800, rxa: 4000, cmin: 365, cmax: 365, kt: 10, kx: null, ch: null, phn: 5.5, phx: 7.5, ev: 800,
      n: { es: 'Orquídea trepadora de sombra; muy sensible a sequía.', en: 'Shade-grown climbing orchid; very sensitive to drought.' } },
    { id: 'oilpalm', es: 'Palma de aceite', en: 'Oil palm', g: 'plantation', tna: 16, tno: 24, txo: 32, txa: 38, rna: 1300, rno: 1800, rxo: 3000, rxa: 4500, cmin: 365, cmax: 365, kt: 12, kx: null, ch: null, phn: 4.5, phx: 7.0, ev: 700,
      n: { es: 'Trópico húmedo sin estación seca larga.', en: 'Humid tropics with no long dry season.' } },
    { id: 'coconut', es: 'Cocotero', en: 'Coconut', g: 'plantation', tna: 15, tno: 24, txo: 32, txa: 38, rna: 1000, rno: 1300, rxo: 2500, rxa: 4000, cmin: 365, cmax: 365, kt: 8, kx: null, ch: null, phn: 5.0, phx: 8.0, ev: 600,
      n: { es: 'Costero; tolera suelos arenosos y salinidad moderada.', en: 'Coastal; tolerates sandy soils and moderate salinity.' } },
    { id: 'avocado', es: 'Aguacate', en: 'Avocado', g: 'fruit', tna: 10, tno: 17, txo: 28, txa: 35, rna: 700, rno: 1000, rxo: 1600, rxa: 2500, cmin: 365, cmax: 365, kt: -2, kx: null, ch: null, phn: 5.5, phx: 7.0, ev: 2500,
      n: { es: 'Valores de la raza mexicana; las razas antillana y guatemalteca son menos tolerantes al frío.', en: 'Values for the Mexican race; the West Indian and Guatemalan races are less cold tolerant.' } },
    { id: 'mango', es: 'Mango', en: 'Mango', g: 'fruit', tna: 15, tno: 22, txo: 32, txa: 40, rna: 500, rno: 700, rxo: 1500, rxa: 2500, cmin: 365, cmax: 365, kt: 2, kx: null, ch: null, phn: 5.5, phx: 7.5, ev: 1200,
      n: { es: 'Necesita un periodo seco para florecer bien.', en: 'Needs a dry period to flower well.' } },
    { id: 'banana', es: 'Plátano', en: 'Banana', g: 'fruit', tna: 15, tno: 22, txo: 30, txa: 36, rna: 1000, rno: 1200, rxo: 2200, rxa: 3500, cmin: 300, cmax: 365, kt: 6, kx: null, ch: null, phn: 5.5, phx: 7.5, ev: 1800,
      n: { es: 'Sensible a viento y a frío; riego indispensable donde hay estación seca.', en: 'Sensitive to wind and cold; irrigation essential where there is a dry season.' } },
    { id: 'papaya', es: 'Papaya', en: 'Papaya', g: 'fruit', tna: 16, tno: 22, txo: 32, txa: 38, rna: 800, rno: 1000, rxo: 1800, rxa: 3000, cmin: 300, cmax: 365, kt: 5, kx: null, ch: null, phn: 5.5, phx: 7.0, ev: 1200,
      n: { es: 'No tolera encharcamiento; frutos deformes con frío.', en: 'Does not tolerate waterlogging; cold causes deformed fruit.' } },
    { id: 'pineapple', es: 'Piña', en: 'Pineapple', g: 'fruit', tna: 14, tno: 22, txo: 30, txa: 36, rna: 600, rno: 900, rxo: 1600, rxa: 2500, cmin: 300, cmax: 365, kt: 5, kx: null, ch: null, phn: 4.5, phx: 6.5, ev: 1200,
      n: { es: 'Metabolismo CAM: buena eficiencia de agua.', en: 'CAM metabolism: good water-use efficiency.' } },
    { id: 'guava', es: 'Guayaba', en: 'Guava', g: 'fruit', tna: 13, tno: 20, txo: 30, txa: 38, rna: 600, rno: 900, rxo: 1600, rxa: 2800, cmin: 365, cmax: 365, kt: 0, kx: null, ch: null, phn: 5.0, phx: 8.0, ev: 2100,
      n: { es: 'Rústica; tolera heladas muy ligeras.', en: 'Hardy; tolerates very light frost.' } },
    { id: 'orange', es: 'Naranja', en: 'Orange', g: 'fruit', tna: 10, tno: 18, txo: 30, txa: 38, rna: 600, rno: 900, rxo: 1600, rxa: 2600, cmin: 365, cmax: 365, kt: -3, kx: null, ch: null, phn: 5.5, phx: 7.5, ev: 1600,
      n: { es: 'Las heladas por debajo de −3 °C dañan fruto y ramas.', en: 'Frost below −3 °C damages fruit and branches.' } },
    { id: 'lime', es: 'Limón mexicano', en: 'Mexican lime', g: 'fruit', tna: 13, tno: 20, txo: 32, txa: 38, rna: 700, rno: 1000, rxo: 1800, rxa: 2800, cmin: 365, cmax: 365, kt: 0, kx: null, ch: null, phn: 5.5, phx: 7.5, ev: 1000,
      n: { es: 'El más sensible al frío de los cítricos.', en: 'The most cold-sensitive of the citrus crops.' } },
    { id: 'apple', es: 'Manzano', en: 'Apple', g: 'temperate', tna: 3, tno: 12, txo: 22, txa: 30, rna: 500, rno: 700, rxo: 1300, rxa: 2000, cmin: 365, cmax: 365, kt: -25, kx: 38, ch: 1000, phn: 5.5, phx: 7.0, ev: 3000,
      n: { es: 'Requerimiento de frío alto: el limitante real en el centro de México.', en: 'High chilling requirement: the real constraint in central Mexico.' } },
    { id: 'peach', es: 'Durazno', en: 'Peach', g: 'temperate', tna: 4, tno: 14, txo: 25, txa: 33, rna: 500, rno: 700, rxo: 1300, rxa: 2000, cmin: 365, cmax: 365, kt: -20, kx: 40, ch: 600, phn: 5.5, phx: 7.5, ev: 2800,
      n: { es: 'Hay cultivares de bajo requerimiento de frío (250–400 h).', en: 'Low-chill cultivars exist (250–400 h).' } },
    { id: 'pear', es: 'Peral', en: 'Pear', g: 'temperate', tna: 3, tno: 12, txo: 22, txa: 30, rna: 500, rno: 700, rxo: 1300, rxa: 2000, cmin: 365, cmax: 365, kt: -25, kx: 38, ch: 800, phn: 5.5, phx: 7.5, ev: 2900,
      n: { es: 'Similar al manzano, algo menos exigente en frío.', en: 'Similar to apple, slightly less chill demanding.' } },
    { id: 'pecan', es: 'Nogal pecanero', en: 'Pecan', g: 'temperate', tna: 5, tno: 18, txo: 30, txa: 38, rna: 500, rno: 800, rxo: 1500, rxa: 2200, cmin: 365, cmax: 365, kt: -20, kx: null, ch: 400, phn: 6.0, phx: 8.0, ev: 2000,
      n: { es: 'Ciclo largo y cálido; casi siempre bajo riego en el norte.', en: 'Long warm season; almost always irrigated in the north.' } },
    { id: 'grape', es: 'Vid', en: 'Grapevine', g: 'temperate', tna: 6, tno: 16, txo: 26, txa: 35, rna: 300, rno: 500, rxo: 900, rxa: 1600, cmin: 365, cmax: 365, kt: -15, kx: null, ch: 300, phn: 5.5, phx: 8.0, ev: 2400,
      n: { es: 'La lluvia en maduración arruina la calidad de la uva de vino.', en: 'Rain at ripening ruins the quality of wine grapes.' } },
    { id: 'olive', es: 'Olivo', en: 'Olive', g: 'temperate', tna: 6, tno: 15, txo: 26, txa: 35, rna: 250, rno: 450, rxo: 900, rxa: 1400, cmin: 365, cmax: 365, kt: -8, kx: null, ch: 250, phn: 6.0, phx: 8.5, ev: 2200,
      n: { es: 'Mediterráneo: invierno fresco y verano seco.', en: 'Mediterranean: cool winter and dry summer.' } },
    { id: 'fig', es: 'Higuera', en: 'Fig', g: 'temperate', tna: 8, tno: 16, txo: 28, txa: 38, rna: 300, rno: 500, rxo: 1000, rxa: 1700, cmin: 365, cmax: 365, kt: -8, kx: null, ch: 100, phn: 6.0, phx: 8.0, ev: 2200,
      n: { es: 'Tolera sequía y suelos calcáreos.', en: 'Tolerates drought and calcareous soils.' } },
    { id: 'blackberry', es: 'Zarzamora', en: 'Blackberry', g: 'berry', tna: 4, tno: 14, txo: 24, txa: 32, rna: 700, rno: 900, rxo: 1600, rxa: 2400, cmin: 365, cmax: 365, kt: -15, kx: 35, ch: 400, phn: 5.0, phx: 7.0, ev: 2600,
      n: { es: 'Alto valor de exportación en clima templado húmedo.', en: 'High export value in humid temperate climates.' } },
    { id: 'strawberry', es: 'Fresa', en: 'Strawberry', g: 'berry', tna: 4, tno: 14, txo: 24, txa: 32, rna: 500, rno: 700, rxo: 1200, rxa: 1900, cmin: 150, cmax: 300, kt: -5, kx: 35, ch: 200, phn: 5.5, phx: 7.0, ev: 2700,
      n: { es: 'Ciclo ajustable con planta frigoconservada y acolchado.', en: 'Cycle adjustable with cold-stored plants and mulching.' } },
    { id: 'blueberry', es: 'Arándano azul', en: 'Blueberry', g: 'berry', tna: 3, tno: 14, txo: 24, txa: 31, rna: 700, rno: 900, rxo: 1600, rxa: 2400, cmin: 365, cmax: 365, kt: -20, kx: 35, ch: 500, phn: 4.0, phx: 5.5, ev: 2800,
      n: { es: 'Exige suelo muy ácido: casi siempre en sustrato.', en: 'Requires a very acid soil: almost always grown in substrate.' } },
    { id: 'raspberry', es: 'Frambuesa', en: 'Raspberry', g: 'berry', tna: 3, tno: 13, txo: 23, txa: 30, rna: 700, rno: 900, rxo: 1600, rxa: 2400, cmin: 365, cmax: 365, kt: -20, kx: 33, ch: 500, phn: 5.5, phx: 7.0, ev: 2700,
      n: { es: 'Más sensible al calor que la zarzamora.', en: 'More heat sensitive than blackberry.' } },
    { id: 'agave', es: 'Agave (mezcal y tequila)', en: 'Agave (spirits)', g: 'agave', tna: 8, tno: 18, txo: 30, txa: 40, rna: 300, rno: 500, rxo: 1000, rxa: 1800, cmin: 365, cmax: 365, kt: -4, kx: null, ch: null, phn: 5.5, phx: 8.0, ev: 2300,
      n: { es: 'Ciclo real de 6–8 años: el índice anual solo indica si el sitio es viable.', en: 'Real cycle of 6–8 years: the annual index only shows whether the site is viable.' } },
    { id: 'nopal', es: 'Nopal', en: 'Prickly pear', g: 'arid', tna: 6, tno: 16, txo: 30, txa: 40, rna: 150, rno: 300, rxo: 800, rxa: 1500, cmin: 365, cmax: 365, kt: -6, kx: null, ch: null, phn: 6.0, phx: 8.5, ev: 2600,
      n: { es: 'CAM: el cultivo de secano más eficiente en agua del catálogo.', en: 'CAM: the most water-efficient rainfed crop in the catalogue.' } },
    { id: 'maguey_pulque', es: 'Maguey pulquero', en: 'Pulque maguey', g: 'agave', tna: 5, tno: 14, txo: 26, txa: 36, rna: 250, rno: 400, rxo: 900, rxa: 1600, cmin: 365, cmax: 365, kt: -8, kx: null, ch: null, phn: 6.0, phx: 8.5, ev: 2900,
      n: { es: 'De altiplano frío y seco; tolera heladas fuertes.', en: 'From the cold dry highlands; tolerates hard frost.' } },
    { id: 'jamaica', es: 'Jamaica', en: 'Roselle', g: 'industrial', tna: 14, tno: 22, txo: 32, txa: 40, rna: 400, rno: 600, rxo: 1200, rxa: 1800, cmin: 150, cmax: 210, kt: 4, kx: null, ch: null, phn: 5.5, phx: 7.5, ev: 1200,
      n: { es: 'Necesita final de ciclo seco para secar los cálices.', en: 'Needs a dry end of season to dry the calyces.' } },
    { id: 'castor', es: 'Higuerilla', en: 'Castor bean', g: 'oil', tna: 10, tno: 20, txo: 30, txa: 40, rna: 300, rno: 500, rxo: 1000, rxa: 1800, cmin: 140, cmax: 240, kt: 1, kx: null, ch: null, phn: 5.5, phx: 8.0, ev: 2000,
      n: { es: 'Oleaginosa rústica para tierras marginales.', en: 'Hardy oilseed for marginal land.' } },
  ];

  /* the editable fields, in the order they appear in the table */
  const FIELDS = [
    { k: 'tna', l: { es: 'T mín. abs.', en: 'Abs. min T' }, u: '°C', step: 0.5, min: -30, max: 40 },
    { k: 'tno', l: { es: 'T mín. ópt.', en: 'Opt. min T' }, u: '°C', step: 0.5, min: -20, max: 40 },
    { k: 'txo', l: { es: 'T máx. ópt.', en: 'Opt. max T' }, u: '°C', step: 0.5, min: 0, max: 50 },
    { k: 'txa', l: { es: 'T máx. abs.', en: 'Abs. max T' }, u: '°C', step: 0.5, min: 0, max: 60 },
    { k: 'rna', l: { es: 'P mín. abs.', en: 'Abs. min P' }, u: 'mm', step: 25, min: 0, max: 6000 },
    { k: 'rno', l: { es: 'P mín. ópt.', en: 'Opt. min P' }, u: 'mm', step: 25, min: 0, max: 6000 },
    { k: 'rxo', l: { es: 'P máx. ópt.', en: 'Opt. max P' }, u: 'mm', step: 25, min: 0, max: 8000 },
    { k: 'rxa', l: { es: 'P máx. abs.', en: 'Abs. max P' }, u: 'mm', step: 25, min: 0, max: 10000 },
    { k: 'cmin', l: { es: 'Ciclo mín.', en: 'Min cycle' }, u: 'd', step: 5, min: 30, max: 365 },
    { k: 'cmax', l: { es: 'Ciclo máx.', en: 'Max cycle' }, u: 'd', step: 5, min: 30, max: 365 },
    { k: 'kt', l: { es: 'T letal baja', en: 'Killing low T' }, u: '°C', step: 0.5, min: -40, max: 20 },
    { k: 'kx', l: { es: 'T letal alta', en: 'Killing high T' }, u: '°C', step: 0.5, min: 10, max: 60, opt: true },
    { k: 'ch', l: { es: 'Frío requerido', en: 'Chilling required' }, u: 'h', step: 50, min: 0, max: 2000, opt: true },
    { k: 'ev', l: { es: 'Altitud máx.', en: 'Max elevation' }, u: 'm', step: 100, min: 0, max: 5000, opt: true },
    { k: 'phn', l: { es: 'pH mín.', en: 'Min pH' }, u: '', step: 0.1, min: 3, max: 9, opt: true },
    { k: 'phx', l: { es: 'pH máx.', en: 'Max pH' }, u: '', step: 0.1, min: 3, max: 10, opt: true },
  ];

  const clone = o => JSON.parse(JSON.stringify(o));
  let LIST = clone(DEFAULTS);

  /* trapezoidal suitability: 0 outside [a, d], 1 inside [b, c], linear in between */
  function trap(x, a, b, c, d) {
    if (x == null || !isFinite(x)) return NaN;
    if (x <= a || x >= d) return 0;
    if (x >= b && x <= c) return 1;
    if (x < b) return b > a ? (x - a) / (b - a) : 1;
    return d > c ? (d - x) / (d - c) : 1;
  }

  /* the four thresholds must not cross; the interface calls this after every edit */
  function fix(c) {
    c.tno = Math.max(c.tno, c.tna); c.txo = Math.max(c.txo, c.tno); c.txa = Math.max(c.txa, c.txo);
    c.rno = Math.max(c.rno, c.rna); c.rxo = Math.max(c.rxo, c.rno); c.rxa = Math.max(c.rxa, c.rxo);
    c.cmax = Math.max(c.cmax, c.cmin);
    c.kt = Math.min(c.kt, c.tna);
    if (c.kx != null) c.kx = Math.max(c.kx, c.txa);
    return c;
  }

  const list = () => LIST;
  const byId = id => LIST.find(c => c.id === id) || null;
  const name = c => T(c.es, c.en);
  const nameHTML = c => L2(c.es, c.en);
  const groupLabel = g => GROUPS[g] ? T(GROUPS[g].es, GROUPS[g].en) : g;
  const isPerennial = c => c.cmin >= 300;

  function setAll(arr) { LIST = arr.map(fix); save(); }
  function reset() { LIST = clone(DEFAULTS); try { localStorage.removeItem(KEY); } catch (e) { /* storage unavailable */ } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(LIST)); } catch (e) { /* private mode or file:// restrictions */ } }
  function load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { return false; }
    if (!raw) return false;
    try {
      const a = JSON.parse(raw);
      if (Array.isArray(a) && a.length && a[0].id && a[0].tna != null) { LIST = a.map(fix); return true; }
    } catch (e) { /* corrupt entry: keep the defaults */ }
    return false;
  }

  /* JSON exchange: a small header plus the whole set, so it can be cited and reloaded */
  function toJSON() {
    return JSON.stringify({ format: 'biomodellingpro-crop-parameters', version: 1, saved: new Date().toISOString().slice(0, 10), crops: LIST }, null, 1);
  }
  function fromJSON(text) {
    const o = JSON.parse(text);
    const arr = Array.isArray(o) ? o : o.crops;
    if (!Array.isArray(arr) || !arr.length) throw new Error('empty');
    const need = ['id', 'tna', 'tno', 'txo', 'txa', 'rna', 'rno', 'rxo', 'rxa', 'cmin', 'cmax', 'kt'];
    const out = arr.map(c => {
      for (const k of need) if (c[k] == null) throw new Error('missing ' + k);
      return fix({ id: String(c.id), es: c.es || c.id, en: c.en || c.es || c.id, g: c.g || 'cereal',
        tna: +c.tna, tno: +c.tno, txo: +c.txo, txa: +c.txa, rna: +c.rna, rno: +c.rno, rxo: +c.rxo, rxa: +c.rxa,
        cmin: +c.cmin, cmax: +c.cmax, kt: +c.kt, kx: c.kx == null ? null : +c.kx, ch: c.ch == null ? null : +c.ch,
        ev: c.ev == null ? null : +c.ev, phn: c.phn == null ? null : +c.phn, phx: c.phx == null ? null : +c.phx,
        n: c.n && c.n.es ? c.n : { es: '', en: '' } });
    });
    LIST = out; save();
    return out.length;
  }

  /* a blank crop, ready to be edited */
  function blank(id) {
    return fix({ id, es: 'Cultivo nuevo', en: 'New crop', g: 'cereal', tna: 10, tno: 18, txo: 28, txa: 38,
      rna: 300, rno: 500, rxo: 1000, rxa: 1600, cmin: 100, cmax: 140, kt: 0, kx: null, ch: null, ev: null,
      phn: 5.5, phx: 7.5, n: { es: '', en: '' } });
  }

  load();
  window.cropdb = { GROUPS, DEFAULTS, FIELDS, list, byId, name, nameHTML, groupLabel, isPerennial, setAll, reset, save, load, toJSON, fromJSON, blank, trap, fix, clone };
})();
