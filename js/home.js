/* BioModelling Pro — home page: workflow strip, step cards, method gallery, theory and citation.
   Everything is written with L2() (both languages), so switching language needs no redraw. */

(function () {
  const STEPS = [
    { n: 1, tag: ['Datos', 'Data'], t: ['Buscar en GBIF', 'Search GBIF'], s: ['Registros de presencia', 'Presence records'],
      d: ['Resuelve el nombre científico y descarga los registros con coordenadas, o sube tu propio archivo (especie, longitud, latitud) o el ejemplo incluido.',
          'Resolve the scientific name and download the records with coordinates, or upload your own file (species, longitude, latitude) or the bundled example.'] },
    { n: 2, tag: ['Filtros', 'Filters'], t: ['Filtrar', 'Filter'], s: ['Taxón, país, año, recuadro', 'Taxon, country, year, box'],
      d: ['Quédate con el taxón, el país, el periodo y la región que interesan; dibuja un recuadro en el mapa.',
          'Keep the taxon, country, period and region you need; draw a box on the map.'] },
    { n: 3, tag: ['Calidad', 'Quality'], t: ['Depurar', 'Clean'], s: ['Nueve reglas de calidad', 'Nine quality rules'],
      d: ['Duplicados, coordenadas imposibles, centroides, baja precisión y valores atípicos, con el conteo de cada regla.',
          'Duplicates, impossible coordinates, centroids, low precision and outliers, with the count of every rule.'] },
    { n: 4, tag: ['Mapa', 'Map'], t: ['Mapa de registros', 'Record map'], s: ['Puntos, leyenda, escala', 'Points, legend, scale'],
      d: ['Mapa listo para publicar: capas base, leyenda por taxón, rosa de los vientos, escala y retícula.',
          'Publication-ready map: base layers, legend by taxon, north arrow, scale bar and graticule.'] },
    { n: 5, tag: ['Ambiente', 'Environment'], t: ['Variables ambientales', 'Environmental variables'], s: ['Bioclim, Köppen, suelo', 'Bioclim, Köppen, soil'],
      d: ['19 variables bioclimáticas, altitud, clima de Köppen-Geiger y tipo de suelo en cada punto.',
          '19 bioclimatic variables, elevation, Köppen-Geiger climate and soil type at every point.'] },
    { n: 6, tag: ['Selección', 'Selection'], t: ['Correlación y variables', 'Correlation and variables'], s: ['Colinealidad, VIF, tú decides', 'Collinearity, VIF, you decide'],
      d: ['Matriz de correlación interactiva, VIF en vivo y una selección recomendada que respeta las variables que fijes (como BIO1 y BIO12). Lo que elijas alimenta los pasos siguientes.',
          'Interactive correlation matrix, live VIF and a recommended selection that respects the variables you pin (such as BIO1 and BIO12). What you choose feeds the following steps.'] },
    { n: 7, tag: ['Estadística', 'Statistics'], t: ['Estadística', 'Statistics'], s: ['Descriptiva y normalidad', 'Descriptives and normality'],
      d: ['Estadística descriptiva, histogramas, diagramas de caja y pruebas de normalidad con transformaciones sugeridas, de las variables que elegiste.',
          'Descriptive statistics, histograms, box plots and normality tests with suggested transformations, for the variables you chose.'] },
    { n: 8, tag: ['Multivariado', 'Multivariate'], t: ['ML y ecología', 'ML and ecology'], s: ['PCA, agrupamiento, nicho', 'PCA, clustering, niche'],
      d: ['Componentes principales, agrupamientos, análisis de correspondencias y métricas de área, nicho y patrón espacial.',
          'Principal components, clustering, correspondence analysis and metrics of area, niche and spatial pattern.'] },
    { n: 9, tag: ['Modelado', 'Modelling'], t: ['Modelado de distribución', 'Distribution modelling'], s: ['10 algoritmos + ensamble', '10 algorithms + ensemble'],
      d: ['MaxEnt y nueve algoritmos más con validación espacial, umbrales, importancia de variables, ensamble y proyección al futuro.',
          'MaxEnt plus nine more algorithms with spatial validation, thresholds, variable importance, an ensemble and future projection.'] },
    { n: 10, tag: ['Agroclima', 'Agroclimate'], t: ['Adaptación agroclimática', 'Agroclimatic adaptation'], s: ['Cultivos y calendario', 'Crops and calendar'],
      d: ['Índices agroclimáticos (grados-día, heladas, horas frío, balance hídrico, periodo de crecimiento), aptitud de cultivos con su calendario de siembra y cómo cambia con el clima futuro.',
          'Agroclimatic indices (growing degree days, frost, chilling hours, water balance, length of growing period), crop suitability with its planting calendar, and how it changes under future climate.'] },
  ];

  const METHODS = [
    { k: 'maxent', fam: 'reg', n: ['MaxEnt', 'MaxEnt'], sub: ['Entropía máxima penalizada, salida cloglog', 'Penalised maximum entropy, cloglog output'], ref: 'Phillips et al. 2006' },
    { k: 'glm', fam: 'reg', n: ['GLM', 'GLM'], sub: ['Regresión logística con términos cuadráticos', 'Logistic regression with quadratic terms'], ref: 'Guisan et al. 2002' },
    { k: 'gam', fam: 'reg', n: ['GAM', 'GAM'], sub: ['Curvas de respuesta suaves y flexibles', 'Smooth, flexible response curves'], ref: 'Hastie & Tibshirani 1990' },
    { k: 'rf', fam: 'mac', n: ['Bosques aleatorios', 'Random forest'], sub: ['Cientos de árboles con submuestreo balanceado', 'Hundreds of trees with balanced subsampling'], ref: 'Breiman 2001' },
    { k: 'brt', fam: 'mac', n: ['Árboles potenciados', 'Boosted regression trees'], sub: ['Árboles pequeños añadidos en secuencia', 'Small trees added in sequence'], ref: 'Elith et al. 2008' },
    { k: 'svm', fam: 'mac', n: ['Máquina de vectores soporte', 'Support vector machine'], sub: ['Frontera con margen máximo', 'Maximum-margin boundary'], ref: 'Cortes & Vapnik 1995' },
    { k: 'ann', fam: 'mac', n: ['Red neuronal', 'Neural network'], sub: ['Perceptrón multicapa pequeño', 'Small multilayer perceptron'], ref: 'Hastie et al. 2009' },
    { k: 'bioclim', fam: 'env', n: ['Envoltura Bioclim', 'Bioclim envelope'], sub: ['Percentiles de cada variable', 'Percentiles of each variable'], ref: 'Busby 1991' },
    { k: 'domain', fam: 'env', n: ['Domain', 'Domain'], sub: ['Similitud de Gower con los registros', 'Gower similarity to the records'], ref: 'Carpenter et al. 1993' },
    { k: 'mahal', fam: 'env', n: ['Mahalanobis', 'Mahalanobis'], sub: ['Distancia al centro del nicho', 'Distance to the niche centre'], ref: 'Farber & Kadmon 2003' },
    { k: 'ensemble', fam: 'reg', n: ['Ensamble', 'Ensemble'], sub: ['Promedio ponderado por AUC de los mejores modelos', 'AUC-weighted mean of the best models'], ref: 'Araújo & New 2007', famLabel: ['Combinación', 'Combination'] },
  ];
  const FAM = { reg: ['Regresión', 'Regression'], mac: ['Aprendizaje automático', 'Machine learning'], env: ['Envoltura / distancia', 'Envelope / distance'] };

  const $ = id => document.getElementById(id);
  const two = a => L2(a[0], a[1]);

  /* ---------- workflow strip ---------- */
  function goStep(n) {
    const b = document.querySelector('.step-btn[data-step="' + n + '"]');
    if (b && b.disabled) {
      const box = $('homeMessages'); box.innerHTML = '';
      showMessage(box, 'info', L2(`El paso ${n} se habilita cuando terminas el anterior. Empieza por el paso 1 o carga los datos de ejemplo.`,
        `Step ${n} unlocks when you finish the previous one. Start at step 1 or load the example data.`));
      return;
    }
    goToStep(n);
  }
  $('workflowStrip').innerHTML = STEPS.map(s =>
    `<div class="wf-step" data-go="${s.n}" role="button" tabindex="0"><div class="wf-n">${L2('PASO', 'STEP')} ${s.n}</div><div class="wf-t">${two(s.t)}</div><div class="wf-d">${two(s.s)}</div></div>`).join('');

  /* ---------- step cards ---------- */
  $('featureGrid').innerHTML = STEPS.map(s =>
    `<div class="feature" data-go="${s.n}" role="button" tabindex="0"><div class="f-num">${s.n}</div><div class="f-art">${Art.featureArt[s.n]()}</div>
      <div class="f-tag">${two(s.tag)}</div><h3>${two(s.t)}</h3><p>${two(s.d)}</p></div>`).join('');

  document.querySelectorAll('[data-go]').forEach(n => {
    n.addEventListener('click', () => goStep(+n.dataset.go));
    n.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goStep(+n.dataset.go); } });
  });

  /* ---------- method gallery ---------- */
  $('methodGallery').innerHTML = METHODS.map(m =>
    `<div class="method-card"><span class="m-fam ${m.fam}">${two(m.famLabel || FAM[m.fam])}</span>${Art.methodArt[m.k]()}
      <div class="m-name">${two(m.n)}</div><div class="m-sub">${two(m.sub)}</div><div class="m-sub" style="opacity:.8">${m.ref}</div></div>`).join('');

  /* ---------- theory ---------- */
  const THEORY = [
    { t: ['¿Qué es un modelo de distribución de especies?', 'What is a species distribution model?'],
      b: ['<p>Un modelo de distribución relaciona los lugares donde se ha registrado una especie con las condiciones ambientales de esos lugares y usa esa relación para estimar la <b>idoneidad ambiental</b> en todo el paisaje. Con datos de <i>solo presencia</i> lo que se estima es un valor relativo, no una probabilidad de ocupación, salvo que se conozca la prevalencia.</p>' +
          '<p>Piensa en tres piezas (diagrama BAM): <b>B</b>, las interacciones bióticas; <b>A</b>, las condiciones abióticas (lo que modelamos aquí); y <b>M</b>, la región accesible para la especie. Un mapa de idoneidad es una hipótesis sobre A dentro de M, no una prueba de que la especie viva o pueda vivir ahí.</p>',
          '<p>A distribution model relates the places where a species has been recorded to the environmental conditions of those places and uses that relationship to estimate <b>environmental suitability</b> across the landscape. With <i>presence-only</i> data the estimate is a relative value, not a probability of occupancy, unless prevalence is known.</p>' +
          '<p>Think of three pieces (the BAM diagram): <b>B</b>, biotic interactions; <b>A</b>, abiotic conditions (what we model here); and <b>M</b>, the region accessible to the species. A suitability map is a hypothesis about A inside M, not proof that the species lives or can live there.</p>'],
      r: 'Peterson et al. 2011; Elith & Leathwick 2009' },
    { t: ['Calidad de los registros y sesgo de muestreo', 'Record quality and sampling bias'],
      b: ['<p>Los datos de museos y observaciones traen coordenadas erróneas, duplicados, centroides de país y sesgo hacia caminos, ciudades y áreas protegidas. Depurar (paso 3) quita errores; el <b>sesgo</b> exige más: rarificar espacialmente los registros, o elegir el fondo con el mismo sesgo que las presencias. El laboratorio de la portada muestra cuánto puede degradar un mapa un muestreo sesgado.</p>',
          '<p>Museum and observation data carry wrong coordinates, duplicates, country centroids and a bias towards roads, cities and protected areas. Cleaning (step 3) removes errors; <b>bias</b> needs more: spatially thin the records, or choose background points with the same bias as the presences. The lab on this page shows how much biased sampling can degrade a map.</p>'],
      r: 'Chapman 2005; Phillips et al. 2009' },
    { t: ['Variables predictoras y colinealidad', 'Predictors and collinearity'],
      b: ['<p>Las 19 variables bioclimáticas resumen media, estacionalidad y extremos de temperatura y precipitación. Están muy correlacionadas entre sí. Para modelos de regresión conviene reducirlas (|r| &lt; 0,7–0,8 o VIF &lt; 10); los métodos de aprendizaje automático toleran mejor la colinealidad pero la interpretación de la importancia de cada variable se vuelve ambigua. El paso 6 propone un subconjunto y te deja conservar las variables que tú consideres importantes.</p>',
          '<p>The 19 bioclimatic variables summarise mean, seasonality and extremes of temperature and precipitation, and they are strongly correlated with each other. For regression models it is wise to reduce them (|r| &lt; 0.7–0.8 or VIF &lt; 10); machine-learning methods tolerate collinearity better, but the interpretation of each variable’s importance becomes ambiguous. Step 6 proposes a subset and lets you keep any variable you consider important.</p>'],
      r: 'Dormann et al. 2013; Fick & Hijmans 2017' },
    { t: ['Algoritmos: qué asume cada uno', 'Algorithms: what each one assumes'],
      b: ['<p><b>Envolturas y distancias</b> (Bioclim, Domain, Mahalanobis) usan solo presencias y describen el nicho como una caja, una similitud o una elipse. <b>Regresiones</b> (GLM, GAM, MaxEnt) contrastan presencias con puntos de fondo o pseudoausencias; MaxEnt penaliza la complejidad para no sobreajustar. <b>Aprendizaje automático</b> (bosques, árboles potenciados, SVM, red neuronal) captura interacciones complejas pero necesita validación rigurosa. No existe un algoritmo mejor en todos los casos: compáralos con la misma validación y considera el ensamble.</p>',
          '<p><b>Envelopes and distances</b> (Bioclim, Domain, Mahalanobis) use presences only and describe the niche as a box, a similarity or an ellipse. <b>Regressions</b> (GLM, GAM, MaxEnt) contrast presences with background points or pseudo-absences; MaxEnt penalises complexity to avoid overfitting. <b>Machine learning</b> (forests, boosted trees, SVM, neural network) captures complex interactions but needs rigorous validation. No algorithm is best in every case: compare them under the same validation and consider the ensemble.</p>'],
      r: 'Elith et al. 2006; Elith et al. 2011; Renner & Warton 2013' },
    { t: ['Validación: AUC, TSS, Boyce y bloques espaciales', 'Validation: AUC, TSS, Boyce and spatial blocks'],
      b: ['<p>El <b>AUC</b> mide qué tan bien el modelo ordena presencias por encima del fondo, pero no depende del umbral y puede inflarse con extensiones grandes. El <b>TSS</b> (sensibilidad + especificidad − 1) evalúa un umbral concreto. El <b>índice de Boyce</b> usa solo presencias. Con registros autocorrelacionados, una validación cruzada aleatoria da resultados demasiado optimistas: usa <b>bloques espaciales</b> para probar la capacidad de predecir en lugares nuevos.</p>',
          '<p><b>AUC</b> measures how well the model ranks presences above background, but it is threshold-free and can be inflated by large extents. <b>TSS</b> (sensitivity + specificity − 1) assesses one specific threshold. The <b>Boyce index</b> uses presences only. With autocorrelated records a random cross-validation is too optimistic: use <b>spatial blocks</b> to test the ability to predict in new places.</p>'],
      r: 'Allouche et al. 2006; Hirzel et al. 2006; Lobo et al. 2008; Roberts et al. 2017' },
    { t: ['Ensambles, umbrales y proyecciones al futuro', 'Ensembles, thresholds and future projections'],
      b: ['<p>Un <b>ensamble</b> combina los modelos que superan un criterio de calidad y suele ser más robusto que cualquiera de ellos. Para convertir idoneidad en presencia/ausencia hay que elegir un <b>umbral</b> (p. ej., el que maximiza TSS o el percentil 10 de las presencias). Al proyectar a climas futuros, el mapa de <b>extrapolación (MESS)</b> marca dónde las condiciones quedan fuera del rango de entrenamiento: ahí la proyección no es confiable.</p>',
          '<p>An <b>ensemble</b> combines the models that pass a quality criterion and is usually more robust than any single one. To turn suitability into presence/absence you must choose a <b>threshold</b> (e.g. the one that maximises TSS, or the 10th percentile of the presences). When projecting to future climates, the <b>extrapolation map (MESS)</b> marks where conditions fall outside the training range: there the projection is not reliable.</p>'],
      r: 'Araújo & New 2007; Elith et al. 2010' },
    { t: ['Índices de diversidad: qué mide cada uno', 'Diversity indices: what each one measures'],
      b: ['<p>La <b>riqueza</b> (S) cuenta especies y trata igual a la abundante y a la que apareció una vez; el <b>índice de Shannon</b> (H′) pesa más la equidad y el <b>índice de Simpson</b> (D = Σp²) pesa más la dominancia. Los tres son el mismo índice visto con distinto peso: los <b>números de Hill</b> con q = 0, 1 y 2 los expresan como «número efectivo de especies», que sí se pueden comparar y dividir en componentes. Por eso conviene mirar el <b>perfil de diversidad</b> (H frente a q) en lugar de un solo número.</p>' +
          '<p>Con datos de ocurrencias hay una trampa: el número de registros mide <b>esfuerzo de muestreo</b>, no abundancia. Comparar sitios con distinto esfuerzo infla la riqueza del más visitado. Las salidas honestas son la <b>rarefacción</b> (riqueza esperada a igual número de individuos), la comparación <b>a igual cobertura</b> y los estimadores de riqueza no observada (<b>Chao1</b>, ACE, jackknife), que usan los singletons y doubletons para estimar cuánto falta por ver.</p>' +
          '<p>La <b>diversidad beta</b> compara composición entre sitios. Jaccard y Sørensen usan presencia/ausencia; Bray–Curtis y Morisita–Horn usan abundancias. La partición de Baselga separa lo que es <b>recambio</b> de especies de lo que es <b>anidamiento</b> (un sitio pobre es subconjunto del rico): dos paisajes con la misma beta total pueden tener causas opuestas.</p>',
          '<p><b>Richness</b> (S) counts species and treats the abundant one and the one seen once alike; the <b>Shannon index</b> (H′) weights evenness more and the <b>Simpson index</b> (D = Σp²) weights dominance more. All three are the same index seen with a different weight: <b>Hill numbers</b> with q = 0, 1 and 2 express them as an «effective number of species», which can be compared and partitioned. That is why a <b>diversity profile</b> (H against q) says more than any single number.</p>' +
          '<p>Occurrence data carry a trap: the number of records measures <b>sampling effort</b>, not abundance. Comparing sites with unequal effort inflates the richness of the better-visited one. The honest outputs are <b>rarefaction</b> (expected richness at an equal number of individuals), comparison <b>at equal coverage</b>, and estimators of unseen richness (<b>Chao1</b>, ACE, jackknife), which use singletons and doubletons to estimate what is still missing.</p>' +
          '<p><b>Beta diversity</b> compares composition between sites. Jaccard and Sørensen use presence/absence; Bray–Curtis and Morisita–Horn use abundances. The Baselga partition separates species <b>turnover</b> from <b>nestedness</b> (a poor site being a subset of a rich one): two landscapes with the same total beta can have opposite causes.</p>'],
      r: 'Magurran 2004; Hill 1973; Jost 2006; Chao & Jost 2012; Colwell et al. 2012; Baselga 2010' },
    { t: ['Adaptación agroclimática de cultivos', 'Agroclimatic crop adaptation'],
      b: ['<p>Un cultivo no responde al promedio anual, sino a lo que ocurre <b>durante su ciclo</b>: calor acumulado, heladas, golpes de calor, agua disponible y su reparto en el año. De ahí los índices agroclimáticos: los <b>grados-día</b> (calor útil por encima de una temperatura base), el <b>periodo libre de heladas</b>, las <b>horas frío</b> que los frutales caducifolios necesitan para romper la dormancia, la <b>evapotranspiración de referencia</b> y el <b>balance hídrico</b>, que juntos dan la <b>duración del periodo de crecimiento</b> y el <b>índice de aridez</b>.</p>' +
          '<p>La aptitud por cultivo se calcula con un <b>modelo de envoltura</b>: para cada fecha de siembra posible se compara la temperatura media y la lluvia acumulada del ciclo con los rangos absolutos y óptimos de la especie, y se conserva la mejor fecha. El resultado es un mapa de aptitud, el <b>calendario de siembra</b> óptimo y el <b>factor limitante</b> de cada sitio. Es un modelo mecanístico de requerimientos, distinto de los modelos de distribución de los pasos anteriores: no aprende de registros, sino que aplica lo que se conoce del cultivo. Sus parámetros son <b>indicativos</b> y deben ajustarse a las variedades locales.</p>' +
          '<p>Con clima futuro, el mismo cálculo muestra qué superficie gana o pierde aptitud, qué cultivos se vuelven viables y cómo se desplaza la ventana de siembra. Los <b>análogos climáticos</b> responden la pregunta complementaria: ¿dónde hay hoy un clima parecido al que tendrá mi parcela?, útil para elegir germoplasma y variedades.</p>',
          '<p>A crop does not respond to the annual average but to what happens <b>during its cycle</b>: accumulated heat, frost, heat shocks, available water and how it is spread through the year. Hence the agroclimatic indices: <b>growing degree days</b> (useful heat above a base temperature), the <b>frost-free period</b>, the <b>chilling hours</b> deciduous fruit trees need to break dormancy, <b>reference evapotranspiration</b> and the <b>water balance</b>, which together give the <b>length of the growing period</b> and the <b>aridity index</b>.</p>' +
          '<p>Crop suitability is computed with an <b>envelope model</b>: for every possible planting date the mean temperature and accumulated rainfall of the cycle are compared with the absolute and optimal ranges of the crop, and the best date is kept. The result is a suitability map, the optimal <b>planting calendar</b> and the <b>limiting factor</b> of each site. This is a mechanistic requirement model, unlike the distribution models of the previous steps: it does not learn from records, it applies what is known about the crop. Its parameters are <b>indicative</b> and should be adjusted to local varieties.</p>' +
          '<p>Under future climate the same computation shows which area gains or loses suitability, which crops become viable and how the planting window shifts. <b>Climatic analogues</b> answer the complementary question — where is today’s climate like the one my field will have? — which helps in choosing germplasm and varieties.</p>'],
      r: 'FAO 1978/1996; Hargreaves & Samani 1985; Allen et al. 1998; Ramirez-Villegas et al. 2013; UNEP 1992' },
    { t: ['Fuentes de datos', 'Data sources'],
      b: ['<p>Registros: <b>GBIF</b> (gbif.org). Clima: <b>WorldClim 2.1</b> (variables bioclimáticas y altitud, resolución de 30 segundos de arco a 10 minutos). Clima de Köppen-Geiger: mapas de 1 km de Beck et al. Suelo: <b>SoilGrids</b> 2.0 (clasificación WRB), consultado en línea. La app no envía tus datos a ningún servidor propio: todo el cálculo ocurre en tu navegador.</p>',
          '<p>Records: <b>GBIF</b> (gbif.org). Climate: <b>WorldClim 2.1</b> (bioclimatic variables and elevation, from 30 arc-seconds to 10 arc-minutes). Köppen-Geiger climate: 1-km maps by Beck et al. Soil: <b>SoilGrids</b> 2.0 (WRB classification), queried online. The app sends your data to no server of its own: all computation happens in your browser.</p>'],
      r: 'Fick & Hijmans 2017; Beck et al. 2018; Poggio et al. 2021' },
  ];
  $('theoryBox').innerHTML = THEORY.map((x, i) =>
    `<details class="acc"${i === 0 ? ' open' : ''}><summary>${two(x.t)}</summary><div class="acc-body">${L2(x.b[0], x.b[1])}<p class="hint"><i>${L2('Lecturas:', 'Reading:')}</i> ${x.r}.</p></div></details>`).join('') +
    `<details class="acc"><summary>${L2('Referencias completas', 'Full references')}</summary><div class="acc-body"><ol class="refs" style="font-size:.84rem;padding-left:18px;margin:0">${REFS().map(r => `<li>${r}</li>`).join('')}</ol></div></details>`;

  function REFS() {
    return [
      'Allen RG, Pereira LS, Raes D, Smith M (1998) <i>Crop Evapotranspiration: Guidelines for Computing Crop Water Requirements</i>. FAO Irrigation and Drainage Paper 56, Rome.',
      'Allouche O, Tsoar A, Kadmon R (2006) Assessing the accuracy of species distribution models: prevalence, kappa and the true skill statistic (TSS). <i>Journal of Applied Ecology</i> 43:1223–1232.',
      'Araújo MB, New M (2007) Ensemble forecasting of species distributions. <i>Trends in Ecology &amp; Evolution</i> 22:42–47.',
      'Baselga A (2010) Partitioning the turnover and nestedness components of beta diversity. <i>Global Ecology and Biogeography</i> 19:134–143.',
      'Beck HE, Zimmermann NE, McVicar TR, Vergopolan N, Berg A, Wood EF (2018) Present and future Köppen-Geiger climate classification maps at 1-km resolution. <i>Scientific Data</i> 5:180214.',
      'Breiman L (2001) Random forests. <i>Machine Learning</i> 45:5–32.',
      'Busby JR (1991) BIOCLIM — a bioclimate analysis and prediction system. In: Margules CR, Austin MP (eds) <i>Nature Conservation: Cost Effective Biological Surveys and Data Analysis</i>. CSIRO, pp 64–68.',
      'Carpenter G, Gillison AN, Winter J (1993) DOMAIN: a flexible modelling procedure for mapping potential distributions of plants and animals. <i>Biodiversity and Conservation</i> 2:667–680.',
      'Chao A (1984) Nonparametric estimation of the number of classes in a population. <i>Scandinavian Journal of Statistics</i> 11:265–270.',
      'Chao A, Jost L (2012) Coverage-based rarefaction and extrapolation: standardizing samples by completeness rather than size. <i>Ecology</i> 93:2533–2547.',
      'Chapman AD (2005) <i>Principles and Methods of Data Cleaning: Primary Species and Species-Occurrence Data</i>. Global Biodiversity Information Facility, Copenhagen.',
      'Colwell RK, Chao A, Gotelli NJ, Lin S-Y, Mao CX, Chazdon RL, Longino JT (2012) Models and estimators linking individual-based and sample-based rarefaction, extrapolation and comparison of assemblages. <i>Journal of Plant Ecology</i> 5:3–21.',
      'Cortes C, Vapnik V (1995) Support-vector networks. <i>Machine Learning</i> 20:273–297.',
      'Dormann CF, Elith J, Bacher S, et al. (2013) Collinearity: a review of methods to deal with it and a simulation study evaluating their performance. <i>Ecography</i> 36:27–46.',
      'Elith J, Graham CH, Anderson RP, et al. (2006) Novel methods improve prediction of species’ distributions from occurrence data. <i>Ecography</i> 29:129–151.',
      'Elith J, Kearney M, Phillips S (2010) The art of modelling range-shifting species. <i>Methods in Ecology and Evolution</i> 1:330–342.',
      'Elith J, Leathwick JR (2009) Species distribution models: ecological explanation and prediction across space and time. <i>Annual Review of Ecology, Evolution, and Systematics</i> 40:677–697.',
      'Elith J, Leathwick JR, Hastie T (2008) A working guide to boosted regression trees. <i>Journal of Animal Ecology</i> 77:802–813.',
      'Elith J, Phillips SJ, Hastie T, Dudík M, Chee YE, Yates CJ (2011) A statistical explanation of MaxEnt for ecologists. <i>Diversity and Distributions</i> 17:43–57.',
      'FAO (1996) <i>Agro-ecological Zoning: Guidelines</i>. FAO Soils Bulletin 73, Rome.',
      'Farber O, Kadmon R (2003) Assessment of alternative approaches for bioclimatic modeling with special emphasis on the Mahalanobis distance. <i>Ecological Modelling</i> 160:115–130.',
      'Fick SE, Hijmans RJ (2017) WorldClim 2: new 1-km spatial resolution climate surfaces for global land areas. <i>International Journal of Climatology</i> 37:4302–4315.',
      'Guisan A, Edwards TC, Hastie T (2002) Generalized linear and generalized additive models in studies of species distributions: setting the scene. <i>Ecological Modelling</i> 157:89–100.',
      'Hargreaves GH, Samani ZA (1985) Reference crop evapotranspiration from temperature. <i>Applied Engineering in Agriculture</i> 1:96–99.',
      'Hastie T, Tibshirani R (1990) <i>Generalized Additive Models</i>. Chapman &amp; Hall, London.',
      'Hastie T, Tibshirani R, Friedman J (2009) <i>The Elements of Statistical Learning</i>, 2nd edn. Springer, New York.',
      'Hill MO (1973) Diversity and evenness: a unifying notation and its consequences. <i>Ecology</i> 54:427–432.',
      'Hirzel AH, Le Lay G, Helfer V, Randin C, Guisan A (2006) Evaluating the ability of habitat suitability models to predict species presences. <i>Ecological Modelling</i> 199:142–152.',
      'Jost L (2006) Entropy and diversity. <i>Oikos</i> 113:363–375.',
      'Lobo JM, Jiménez-Valverde A, Real R (2008) AUC: a misleading measure of the performance of predictive distribution models. <i>Global Ecology and Biogeography</i> 17:145–151.',
      'Magurran AE (2004) <i>Measuring Biological Diversity</i>. Blackwell, Oxford.',
      'Peterson AT, Soberón J, Pearson RG, et al. (2011) <i>Ecological Niches and Geographic Distributions</i>. Princeton University Press.',
      'Phillips SJ, Anderson RP, Schapire RE (2006) Maximum entropy modeling of species geographic distributions. <i>Ecological Modelling</i> 190:231–259.',
      'Phillips SJ, Dudík M, Elith J, et al. (2009) Sample selection bias and presence-only distribution models: implications for background and pseudo-absence data. <i>Ecological Applications</i> 19:181–197.',
      'Poggio L, de Sousa LM, Batjes NH, et al. (2021) SoilGrids 2.0: producing soil information for the globe with quantified spatial uncertainty. <i>SOIL</i> 7:217–240.',
      'Ramirez-Villegas J, Jarvis A, Läderach P (2013) Empirical approaches for assessing impacts of climate change on agriculture: the EcoCrop model and a case study with grain sorghum. <i>Agricultural and Forest Meteorology</i> 170:67–78.',
      'Renner IW, Warton DI (2013) Equivalence of MAXENT and Poisson point process models for species distribution modeling in ecology. <i>Biometrics</i> 69:274–281.',
      'Roberts DR, Bahn V, Ciuti S, et al. (2017) Cross-validation strategies for data with temporal, spatial, hierarchical, or phylogenetic structure. <i>Ecography</i> 40:913–929.',
      'UNEP (1992) <i>World Atlas of Desertification</i>. United Nations Environment Programme, Nairobi.',
    ];
  }

  /* ---------- citation ---------- */
  const YEAR = 2026, REPO_URL = 'https://github.com/luisangelbg/BioModellingPro';
  const APA = `Barrera-Guzmán, L. Á., Ramírez-Ojeda, G., Cadena-Iñiguez, J., Cadena-Zamudio, D. A., Cadena-Zamudio, J. D., &amp; Mojica-Zárate, H. T. (${YEAR}). <i>BioModelling Pro: biogeography and species distribution modelling in the browser</i> (Version 1.0.0) [Computer software]. ${REPO_URL}`;
  const BIBTEX = `@software{barrera_biomodellingpro_${YEAR},\n  author  = {Barrera-Guzm{\\'a}n, Luis {\\'A}ngel and Ram{\\'i}rez-Ojeda, Gabriela and Cadena-I{\\~n}iguez, Jorge and Cadena-Zamudio, Daniel Alejandro and Cadena-Zamudio, Jorge David and Mojica-Z{\\'a}rate, H{\\'e}ctor Tecumsh{\\'e}},\n  title   = {{BioModelling Pro}: biogeography and species distribution modelling in the browser},\n  year    = {${YEAR}},\n  version = {1.0.0},\n  url     = {${REPO_URL}},\n  license = {GPL-3.0-or-later}\n}`;
  $('citeBox').innerHTML = `
    <p>${L2('Si usas BioModelling Pro en una publicación, cítalo así, y cita también los datos (GBIF, WorldClim, SoilGrids) y los métodos que uses:', 'If you use BioModelling Pro in a publication, cite it as follows, and also cite the data (GBIF, WorldClim, SoilGrids) and the methods you use:')}</p>
    <p style="font-size:.92rem">${APA}</p>
    <pre id="bibtexBox" style="font-size:.78rem;overflow:auto;background:var(--bg-soft);padding:10px;border-radius:8px;margin:8px 0">${esc(BIBTEX)}</pre>
    <button class="btn btn-secondary btn-sm" id="copyBibBtn">${L2('Copiar BibTeX', 'Copy BibTeX')}</button> <span class="hint" id="copyBibMsg"></span>
    <p class="hint" style="margin-top:10px">${L2('Autoría', 'Authors')}: Luis Ángel Barrera-Guzmán (ORCID 0000-0001-8057-2583), Gabriela Ramírez-Ojeda (0000-0001-9679-6514),
      Jorge Cadena-Iñiguez (0000-0002-6427-0646), Daniel Alejandro Cadena-Zamudio (0000-0002-6972-7414),
      Jorge David Cadena-Zamudio (0000-0002-2855-4561) ${L2('y', 'and')} Héctor Tecumshé Mojica-Zárate (0000-0002-9067-3983).
      ${L2('Software libre, licencia GPL v3 o posterior.', 'Free software, GPL v3 or later.')}</p>`;
  $('copyBibBtn').addEventListener('click', async () => {
    const msg = $('copyBibMsg');
    try { await navigator.clipboard.writeText(BIBTEX); msg.innerHTML = L2('Copiado.', 'Copied.'); }
    catch (e) {
      const r = document.createRange(); r.selectNodeContents($('bibtexBox'));
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      msg.innerHTML = L2('Selecciónalo y copia con Ctrl+C.', 'Selected: copy it with Ctrl+C.');
    }
  });

  /* ---------- hero buttons ---------- */
  const scrollTo = id => { const e = $(id); if (e) e.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  $('startBtn').addEventListener('click', () => { goToStep(1); setTimeout(() => { const i = $('speciesInput'); if (i) i.focus(); }, 250); });
  $('labBtn').addEventListener('click', () => scrollTo('labs'));
  $('theoryBtn').addEventListener('click', () => scrollTo('theory'));
  $('citeBtn').addEventListener('click', () => scrollTo('cite'));
})();
