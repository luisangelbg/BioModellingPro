/* BioModelling Pro — interpretation help.

   A small registry of short explanations, each with the scale that says whether a value is low,
   normal or high, plus the UI that shows them:
     help.badge(key)              → the HTML of a circled question mark to put next to a label
     help.panel(keys, title)      → a collapsible "interpretation guide" listing several entries
     help.markTable(box, map)     → decorates the headers of an already-built table with badges
     help.markTiles(box, map)     → the same for the summary tiles
     help.hydrate(root)           → turns every <span data-help="key"> of the page into a badge

   Everything is written in both languages with L2(), so switching the language needs no redraw,
   and every colour comes from the tokens of the stylesheet, so both themes follow on their own.
   The popovers are built the first time they are opened, never at load. */

(function () {
  const $ = id => document.getElementById(id);

  /* ---------- helpers to write the entries ---------- */
  /* a band of a scale: from/to may be null for an open end; txt overrides the printed range */
  const S = (from, to, label, tone, txt) => ({ from, to, label, tone, txt });
  const HELP = {};
  const E = (key, def) => { HELP[key] = def; return key; };

  /* =====================================================================
     STEP 6 · correlation and variable selection
     ===================================================================== */

  E('pearson', {
    t: ['Correlación de Pearson (r)', 'Pearson correlation (r)'],
    what: ['Mide si dos variables suben y bajan juntas <b>siguiendo una línea recta</b>. Va de −1 a 1: 1 es una recta ascendente perfecta, −1 una descendente perfecta y 0 ninguna relación lineal.',
      'Measures whether two variables rise and fall together <b>along a straight line</b>. It runs from −1 to 1: 1 is a perfect rising line, −1 a perfect falling one and 0 no linear relationship.'],
    read: ['El signo dice la dirección y el valor absoluto |r| la fuerza. Aquí lo que importa es |r|: dos variables con |r| alto cuentan casi lo mismo y sobra una de ellas.',
      'The sign gives the direction and the absolute value |r| the strength. Here what matters is |r|: two variables with a high |r| say almost the same thing and one of them is redundant.'],
    formula: 'r = Σ(x−x̄)(y−ȳ) / √[Σ(x−x̄)² · Σ(y−ȳ)²]',
    scaleTitle: ['Escala de |r|', 'Scale of |r|'],
    scale: [
      S(null, 0.1, ['insignificante', 'negligible'], 'neutral'),
      S(0.1, 0.3, ['débil', 'weak'], 'good'),
      S(0.3, 0.5, ['moderada', 'moderate'], 'ok'),
      S(0.5, 0.7, ['fuerte', 'strong'], 'warn'),
      S(0.7, null, ['muy fuerte', 'very strong'], 'bad'),
    ],
    conv: true,
    care: ['Solo ve relaciones <b>rectas</b>: una relación fuerte en forma de campana puede dar r ≈ 0. Es muy sensible a los valores atípicos, y una correlación alta no significa que una variable cause la otra.',
      'It only sees <b>straight-line</b> relationships: a strong bell-shaped relationship can give r ≈ 0. It is very sensitive to outliers, and a high correlation does not mean one variable causes the other.'],
    ref: 'Pearson 1896; Cohen 1988; Evans 1996',
  });

  E('spearman', {
    t: ['Correlación de Spearman (ρ)', 'Spearman correlation (ρ)'],
    what: ['Es la correlación de Pearson calculada sobre los <b>puestos</b> (el 1.º, el 2.º, el 3.º…) en lugar de los valores. Mide si una variable crece cuando crece la otra, aunque no sea en línea recta.',
      'It is the Pearson correlation computed on the <b>ranks</b> (1st, 2nd, 3rd…) instead of the values. It measures whether one variable grows when the other grows, even if not along a straight line.'],
    read: ['Se lee con la misma escala de |r|. Si ρ es mucho mayor que r, la relación es monótona pero curva; si es mucho menor, es probable que unos pocos puntos extremos estén inflando r.',
      'It is read with the same |r| scale. If ρ is much larger than r the relationship is monotonic but curved; if it is much smaller, a few extreme points are probably inflating r.'],
    scaleTitle: ['Escala de |ρ|', 'Scale of |ρ|'],
    scale: [
      S(null, 0.1, ['insignificante', 'negligible'], 'neutral'),
      S(0.1, 0.3, ['débil', 'weak'], 'good'),
      S(0.3, 0.5, ['moderada', 'moderate'], 'ok'),
      S(0.5, 0.7, ['fuerte', 'strong'], 'warn'),
      S(0.7, null, ['muy fuerte', 'very strong'], 'bad'),
    ],
    conv: true,
    care: ['Con muchos empates (variables redondeadas o discretas) pierde precisión. No detecta relaciones que suben y luego bajan.',
      'With many ties (rounded or discrete variables) it loses precision. It does not detect relationships that rise and then fall.'],
    ref: 'Spearman 1904',
  });

  E('r2', {
    t: ['Coeficiente de determinación (r²)', 'Coefficient of determination (r²)'],
    what: ['Es la correlación elevada al cuadrado. Dice <b>qué proporción de la variación</b> de una variable queda explicada por la otra: r = 0.7 significa r² = 0.49, es decir un 49 %.',
      'It is the correlation squared. It says <b>what proportion of the variation</b> of one variable is explained by the other: r = 0.7 means r² = 0.49, that is 49 %.'],
    read: ['Va de 0 a 1 y se suele expresar en porcentaje. Es útil para traducir una correlación a información compartida: con |r| = 0.5 las dos variables comparten solo la cuarta parte de su variación.',
      'It runs from 0 to 1 and is usually given as a percentage. It is useful to translate a correlation into shared information: with |r| = 0.5 the two variables share only a quarter of their variation.'],
    formula: 'r² = r × r',
    care: ['No tiene un umbral universal: un r² de 0.3 puede ser alto en ecología y bajo en física. Y un r² alto no valida el modelo si la relación no es lineal.',
      'It has no universal threshold: an r² of 0.3 can be high in ecology and low in physics. And a high r² does not validate the model if the relationship is not linear.'],
    ref: 'Wright 1921',
  });

  E('vif', {
    t: ['Factor de inflación de la varianza (VIF)', 'Variance inflation factor (VIF)'],
    what: ['Mide cuánto se «infla» la incertidumbre del coeficiente de una variable porque <b>las demás variables del conjunto ya la explican</b>. Un VIF de 9 quiere decir que su error estándar es 3 veces mayor (√9) de lo que sería si fuese independiente.',
      'Measures how much the uncertainty of a variable\'s coefficient is "inflated" because <b>the other variables of the set already explain it</b>. A VIF of 9 means its standard error is 3 times larger (√9) than it would be if the variable were independent.'],
    read: ['Se calcula con <b>todo el conjunto a la vez</b>, no por pares: por eso puede ser alto aunque ninguna correlación individual lo sea. Empieza en 1 (independencia total) y no tiene techo.',
      'It is computed for <b>the whole set at once</b>, not pairwise: that is why it can be high even when no individual correlation is. It starts at 1 (complete independence) and has no ceiling.'],
    formula: 'VIF_j = 1 / (1 − R²_j),  con R²_j de la regresión de la variable j sobre las demás',
    scaleTitle: ['Escala del VIF', 'Scale of the VIF'],
    scale: [
      S(1, 5, ['colinealidad baja', 'low collinearity'], 'good'),
      S(5, 10, ['moderada', 'moderate'], 'warn'),
      S(10, null, ['alta', 'high'], 'bad'),
    ],
    conv: true,
    care: ['Los umbrales 5 y 10 son <b>convenciones</b>, no leyes. Un VIF alto no estropea las predicciones del modelo, pero sí vuelve poco fiable la interpretación de cada coeficiente y de la importancia de cada variable.',
      'The 5 and 10 thresholds are <b>conventions</b>, not laws. A high VIF does not spoil the model\'s predictions, but it does make the interpretation of each coefficient and of each variable\'s importance unreliable.'],
    ref: 'Marquardt 1970; Dormann et al. 2013',
  });

  E('collinearity', {
    t: ['Colinealidad', 'Collinearity'],
    what: ['Es la situación en la que varias variables ambientales llevan casi la misma información. Con 19 variables bioclimáticas es la norma: casi todas se calculan de la misma temperatura y la misma lluvia.',
      'It is the situation in which several environmental variables carry almost the same information. With 19 bioclimatic variables it is the rule: nearly all of them are computed from the same temperature and the same rainfall.'],
    read: ['Dos señales la delatan: pares con |r| alto y VIF altos. La regresión (GLM, GAM) sufre mucho; los árboles, el SVM y MaxEnt predicen bien igual, pero reparten la importancia entre las variables gemelas y ninguna parece importante.',
      'Two signs give it away: pairs with a high |r| and high VIFs. Regression (GLM, GAM) suffers a lot; trees, SVM and MaxEnt still predict well, but they share the importance among the twin variables and none of them looks important.'],
    care: ['Quitar variables por colinealidad es una decisión <b>estadística</b>; conservar una porque es la que tiene sentido biológico para tu especie es una decisión <b>ecológica</b>, y esa manda. Fíjala con el botón 📌.',
      'Dropping variables for collinearity is a <b>statistical</b> decision; keeping one because it is the one that makes biological sense for your species is an <b>ecological</b> decision, and that one wins. Pin it with the 📌 button.'],
    ref: 'Dormann et al. 2013',
  });

  E('corrSelection', {
    t: ['Regla de la selección recomendada', 'Rule of the recommended selection'],
    what: ['La app quita variables en dos pasadas. Primero busca el par con el |r| más alto; si supera tu umbral, descarta la que esté <b>más correlacionada con todas las demás</b> y repite. Después calcula los VIF del conjunto que queda y va quitando la de VIF más alto hasta bajar del umbral.',
      'The app drops variables in two passes. First it looks for the pair with the highest |r|; if it exceeds your threshold it discards the one that is <b>most correlated with all the rest</b> and repeats. Then it computes the VIFs of what is left and removes the highest one until it falls below the threshold.'],
    read: ['Los valores por omisión (|r| = 0.8 y VIF = 10) son los que más se usan en la literatura de modelos de distribución. Bájalos a 0.7 y 5 si vas a usar GLM o GAM y quieres interpretar los coeficientes.',
      'The default values (|r| = 0.8 and VIF = 10) are the ones most used in the distribution-modelling literature. Lower them to 0.7 and 5 if you are going to use GLM or GAM and want to interpret the coefficients.'],
    care: ['La regla no sabe nada de biología: puede tirar justo la variable que explica a tu especie. Las que fijes con 📌 no se tocan nunca, aunque estén correlacionadas.',
      'The rule knows nothing about biology: it may drop precisely the variable that explains your species. The ones you pin with 📌 are never touched, even if they are correlated.'],
    ref: 'Dormann et al. 2013',
  });

  /* =====================================================================
     STEP 7 · descriptive statistics and normality
     ===================================================================== */

  E('mean', {
    t: ['Media', 'Mean'],
    what: ['La suma de los valores dividida entre cuántos son: el «centro de gravedad» de la variable en los sitios donde está tu especie.',
      'The sum of the values divided by how many there are: the "centre of gravity" of the variable at the sites where your species occurs.'],
    read: ['Compárala siempre con la mediana. Si las dos se parecen, la distribución es bastante simétrica; si la media es mucho mayor, hay una cola de valores altos que tira de ella.',
      'Always compare it with the median. If the two are alike the distribution is fairly symmetric; if the mean is much larger, a tail of high values is pulling it.'],
    care: ['Un solo registro con la coordenada equivocada, en pleno desierto o en el mar, puede mover la media varios grados. Depura antes de describir.',
      'A single record with the wrong coordinate, in the middle of a desert or at sea, can move the mean by several degrees. Clean before you describe.'],
    ref: 'Sokal & Rohlf 1995',
  });

  E('median', {
    t: ['Mediana', 'Median'],
    what: ['El valor que parte los datos en dos mitades: la mitad de los registros está por debajo y la mitad por encima.',
      'The value that splits the data into two halves: half the records fall below it and half above.'],
    read: ['Es el centro <b>robusto</b>: no le afectan los valores extremos. Cuando la variable es muy asimétrica (lluvia, por ejemplo), la mediana describe mejor «lo típico» que la media.',
      'It is the <b>robust</b> centre: extreme values do not affect it. When the variable is very skewed (rainfall, for instance), the median describes "the typical case" better than the mean.'],
    care: ['No usa toda la información de los datos, así que varía más de una muestra a otra que la media cuando la distribución sí es normal.',
      'It does not use all the information in the data, so it varies more from sample to sample than the mean when the distribution really is normal.'],
    ref: 'Sokal & Rohlf 1995',
  });

  E('sd', {
    t: ['Desviación estándar (DE)', 'Standard deviation (SD)'],
    what: ['Cuánto se alejan los valores de la media, en las <b>mismas unidades</b> de la variable. Una DE de 3 °C dice que los registros se reparten típicamente unos 3 °C alrededor de la media.',
      'How far the values sit from the mean, in the <b>same units</b> as the variable. An SD of 3 °C says the records typically spread about 3 °C around the mean.'],
    read: ['En una variable aproximadamente normal, cerca del 68 % de los registros cae entre media ± 1 DE y cerca del 95 % entre media ± 2 DE. Una DE pequeña indica una especie con requerimientos estrechos en esa variable.',
      'In a roughly normal variable, about 68 % of the records fall between mean ± 1 SD and about 95 % between mean ± 2 SD. A small SD points to a species with narrow requirements in that variable.'],
    formula: 'DE = √[ Σ(x − x̄)² / (n − 1) ]',
    care: ['No se pueden comparar las DE de dos variables con unidades distintas (°C y mm). Para eso está el coeficiente de variación o la estandarización z.',
      'The SDs of two variables with different units (°C and mm) cannot be compared. That is what the coefficient of variation or the z standardisation is for.'],
    ref: 'Sokal & Rohlf 1995',
  });

  E('cv', {
    t: ['Coeficiente de variación (CV %)', 'Coefficient of variation (CV %)'],
    what: ['La desviación estándar expresada como porcentaje de la media. Sirve para comparar la variabilidad de variables con unidades distintas.',
      'The standard deviation expressed as a percentage of the mean. It serves to compare the variability of variables with different units.'],
    read: ['Cuanto mayor es el CV, más dispersa está la variable en relación con su propio tamaño.',
      'The larger the CV, the more spread out the variable is relative to its own size.'],
    formula: 'CV % = 100 × DE / |media|',
    scaleTitle: ['Escala usada en ensayos agronómicos', 'Scale used in agronomic trials'],
    scale: [
      S(null, 10, ['baja', 'low'], 'good'),
      S(10, 20, ['media', 'medium'], 'ok'),
      S(20, 30, ['alta', 'high'], 'warn'),
      S(30, null, ['muy alta', 'very high'], 'bad'),
    ],
    conv: true,
    care: ['Esta escala viene de los ensayos de campo y <b>no aplica a cualquier variable</b>. El CV pierde todo sentido cuando el cero de la escala es arbitrario: el CV de una temperatura en °C cambia si la mides en °F o en kelvin, y se dispara si la media anda cerca de 0 °C. Úsalo en lluvia o altitud, no en temperatura.',
      'This scale comes from field trials and <b>does not apply to just any variable</b>. The CV is meaningless when the zero of the scale is arbitrary: the CV of a temperature in °C changes if you measure it in °F or in kelvin, and it explodes when the mean is near 0 °C. Use it on rainfall or elevation, not on temperature.'],
    ref: 'Sokal & Rohlf 1995; Gomez & Gomez 1984',
  });

  E('quartiles', {
    t: ['Cuartiles (Q1, Q3) y rango intercuartílico', 'Quartiles (Q1, Q3) and interquartile range'],
    what: ['Q1 deja por debajo el 25 % de los registros y Q3 el 75 %. La distancia entre ellos, el <b>rango intercuartílico</b> (RIC = Q3 − Q1), contiene la mitad central de los datos.',
      'Q1 leaves 25 % of the records below it and Q3 leaves 75 %. The distance between them, the <b>interquartile range</b> (IQR = Q3 − Q1), holds the central half of the data.'],
    read: ['El intervalo Q1–Q3 es una buena descripción de «las condiciones donde se encuentra normalmente la especie», porque no depende de los extremos. El RIC es la medida de dispersión robusta equivalente a la DE.',
      'The Q1–Q3 interval is a good description of "the conditions where the species is normally found", because it does not depend on the extremes. The IQR is the robust spread measure equivalent to the SD.'],
    care: ['Hay varias definiciones de cuartil y dan valores algo distintos en muestras pequeñas; la app usa interpolación lineal, la misma que la mayoría de los programas estadísticos.',
      'There are several definitions of quartile and they give slightly different values in small samples; the app uses linear interpolation, the same one most statistical programs use.'],
    ref: 'Tukey 1977',
  });

  E('skewness', {
    t: ['Asimetría (g1)', 'Skewness (g1)'],
    what: ['Dice hacia qué lado se estira la distribución. Positiva: hay una cola de valores altos (lo típico de la lluvia). Negativa: la cola está del lado de los valores bajos. Cero: simétrica.',
      'Says which side the distribution stretches to. Positive: there is a tail of high values (typical of rainfall). Negative: the tail is on the low side. Zero: symmetric.'],
    read: ['Se lee por su valor absoluto. Cuanto más lejos de 0, más torcida está la distribución y menos representa la media al valor típico.',
      'It is read by its absolute value. The further from 0, the more skewed the distribution and the less the mean represents the typical value.'],
    scaleTitle: ['Escala de |g1|', 'Scale of |g1|'],
    scale: [
      S(null, 0.5, ['bastante simétrica', 'fairly symmetric'], 'good'),
      S(0.5, 1, ['asimetría moderada', 'moderate skew'], 'ok'),
      S(1, null, ['asimetría fuerte', 'strong skew'], 'warn'),
    ],
    conv: true,
    care: ['Los cortes 0.5 y 1 son una <b>convención</b> de uso común, no un resultado teórico. Una asimetría fuerte casi siempre sale acompañada de un rechazo de la normalidad y sugiere probar una transformación.',
      'The 0.5 and 1 cuts are a <b>widely used convention</b>, not a theoretical result. Strong skew almost always comes with a rejection of normality and suggests trying a transformation.'],
    ref: 'Bulmer 1979',
  });

  E('kurtosis', {
    t: ['Curtosis (exceso)', 'Kurtosis (excess)'],
    what: ['Describe el peso de las <b>colas</b> de la distribución comparada con la normal: si los valores muy alejados de la media son más frecuentes o menos frecuentes de lo que sería normal.',
      'Describes the weight of the <b>tails</b> of the distribution compared with the normal one: whether values far from the mean are more or less frequent than normal.'],
    read: ['La app informa el <b>exceso</b> de curtosis, así que la referencia es 0, no 3.',
      'The app reports the <b>excess</b> kurtosis, so the reference point is 0, not 3.'],
    marks: [
      { at: '≈ 0', label: ['colas como las de una distribución normal', 'tails like those of a normal distribution'] },
      { at: '> 0', label: ['colas pesadas: hay más valores extremos de lo normal (leptocúrtica)', 'heavy tails: more extreme values than normal (leptokurtic)'] },
      { at: '< 0', label: ['colas ligeras, distribución más achatada (platicúrtica)', 'light tails, flatter distribution (platykurtic)'] },
    ],
    care: ['<b>No existe una escala aceptada</b> de «curtosis alta» o «baja»: es un número descriptivo que se interpreta junto al histograma y a la asimetría. Además es muy inestable en muestras pequeñas (menos de 100 registros).',
      '<b>There is no accepted scale</b> of "high" or "low" kurtosis: it is a descriptive number read together with the histogram and the skew. It is also very unstable in small samples (fewer than 100 records).'],
    ref: 'Bulmer 1979; DeCarlo 1997',
  });

  E('pvalue', {
    t: ['Valor p', 'p value'],
    what: ['Es la probabilidad de obtener unos datos <b>al menos tan raros como los tuyos</b> si la hipótesis de partida fuera cierta. En estas tablas la hipótesis de partida es «la variable sigue una distribución normal».',
      'It is the probability of getting data <b>at least as odd as yours</b> if the starting hypothesis were true. In these tables the starting hypothesis is "the variable follows a normal distribution".'],
    read: ['Por convención, p ≤ 0.05 se toma como evidencia suficiente para <b>rechazar</b> la hipótesis; p &gt; 0.05 quiere decir que no hay evidencia suficiente para rechazarla, que no es lo mismo que demostrar que es cierta.',
      'By convention p ≤ 0.05 is taken as enough evidence to <b>reject</b> the hypothesis; p &gt; 0.05 means there is not enough evidence to reject it, which is not the same as proving it true.'],
    scaleTitle: ['Convención habitual', 'Usual convention'],
    scale: [
      S(null, 0.05, ['se rechaza la normalidad', 'normality is rejected'], 'warn', '≤ 0.05'),
      S(0.05, 1, ['no se rechaza', 'not rejected'], 'good', '> 0.05'),
    ],
    conv: true,
    care: ['El 0.05 es una <b>costumbre arbitraria</b>. El valor p <b>no</b> dice la probabilidad de que la hipótesis sea cierta, ni si la desviación es grande. Con muchos registros (n &gt; 1000) cualquier desviación mínima da p pequeñísima: mira el histograma y el gráfico Q–Q antes de decidir.',
      'The 0.05 is an <b>arbitrary habit</b>. The p value does <b>not</b> give the probability that the hypothesis is true, nor whether the departure is large. With many records (n &gt; 1000) any tiny departure gives a minute p: look at the histogram and the Q–Q plot before deciding.'],
    ref: 'Wasserstein & Lazar 2016',
  });

  E('shapiro', {
    t: ['Prueba de Shapiro y Wilk (W)', 'Shapiro–Wilk test (W)'],
    what: ['La prueba de normalidad con más capacidad de detección en muestras pequeñas y medianas. Compara los valores ordenados de tu variable con los que cabría esperar de una normal perfecta.',
      'The normality test with the most detection power in small and medium samples. It compares the ordered values of your variable with those expected from a perfect normal.'],
    read: ['El estadístico W va de 0 a 1: cuanto más cerca de 1, más se parece a una normal. La decisión se toma con el valor p.',
      'The W statistic runs from 0 to 1: the closer to 1, the more it looks normal. The decision is taken with the p value.'],
    care: ['La app la calcula con los primeros 5000 registros como máximo. Con muestras grandes rechaza casi siempre, incluso cuando la desviación no tiene ninguna importancia práctica.',
      'The app computes it on at most the first 5000 records. With large samples it almost always rejects, even when the departure has no practical importance at all.'],
    ref: 'Shapiro & Wilk 1965',
  });

  E('dagostino', {
    t: ["Prueba de D'Agostino y Pearson (K²)", "D'Agostino–Pearson test (K²)"],
    what: ['Combina en un solo número la asimetría y la curtosis de la muestra y pregunta si juntas son compatibles con una distribución normal.',
      'Combines the skew and the kurtosis of the sample into a single number and asks whether together they are compatible with a normal distribution.'],
    read: ['Se decide con el valor p, como las demás. Es especialmente buena detectando distribuciones torcidas o con colas pesadas.',
      'It is decided with the p value, like the others. It is especially good at detecting skewed or heavy-tailed distributions.'],
    care: ['Necesita al menos unos 20 registros para ser fiable, y como toda prueba de normalidad se vuelve hipersensible cuando n es muy grande.',
      'It needs at least about 20 records to be reliable and, like every normality test, it becomes hypersensitive when n is very large.'],
    ref: "D'Agostino & Pearson 1973",
  });

  E('anderson', {
    t: ['Prueba de Anderson y Darling (A²)', 'Anderson–Darling test (A²)'],
    what: ['Mide la distancia entre la distribución acumulada de tus datos y la de una normal, dando <b>más peso a las colas</b> que las demás pruebas.',
      'Measures the distance between the cumulative distribution of your data and that of a normal, giving <b>more weight to the tails</b> than the other tests.'],
    read: ['Aquí no se usa un valor p sino un <b>valor crítico</b>: la variable se considera normal si A² es menor que el valor crítico al 5 % que aparece en la columna de al lado.',
      'Here no p value is used but a <b>critical value</b>: the variable is taken as normal if A² is smaller than the 5 % critical value shown in the neighbouring column.'],
    care: ['Al pesar tanto las colas, un par de valores atípicos la hacen rechazar aunque el grueso de los datos sea muy normal.',
      'Because it weighs the tails so much, a couple of outliers make it reject even when the bulk of the data is very normal.'],
    ref: 'Anderson & Darling 1954; Stephens 1974',
  });

  E('jarquebera', {
    t: ['Prueba de Jarque y Bera', 'Jarque–Bera test'],
    what: ['Otra prueba basada en asimetría y curtosis, muy usada en economía. Su estadístico vale 0 cuando ambas coinciden exactamente con las de una normal.',
      'Another test based on skew and kurtosis, much used in economics. Its statistic is 0 when both match those of a normal exactly.'],
    read: ['Se decide con el valor p. Suele coincidir con la de D\'Agostino.',
      'It is decided with the p value. It usually agrees with D\'Agostino\'s.'],
    care: ['Es una prueba <b>asintótica</b>: su valor p solo es de fiar con muestras grandes (más de 2000 registros). Con pocos datos es demasiado indulgente.',
      'It is an <b>asymptotic</b> test: its p value is only trustworthy in large samples (more than 2000 records). With little data it is too lenient.'],
    ref: 'Jarque & Bera 1987',
  });

  E('ks', {
    t: ['Prueba de Kolmogorov y Smirnov', 'Kolmogorov–Smirnov test'],
    what: ['Compara la distribución acumulada de tus datos (ya estandarizados) con la de una normal y se queda con la <b>mayor diferencia vertical</b> entre las dos curvas.',
      'Compares the cumulative distribution of your data (already standardised) with a normal one and keeps the <b>largest vertical gap</b> between the two curves.'],
    read: ['Se decide con el valor p. Detecta bien desplazamientos del centro de la distribución.',
      'It is decided with the p value. It is good at detecting shifts of the centre of the distribution.'],
    care: ['Es la <b>menos potente</b> de las cinco para la normalidad, y además aquí la media y la desviación se estiman de los mismos datos, lo que la vuelve conservadora. Úsala como voto, no como árbitro.',
      'It is the <b>least powerful</b> of the five for normality, and here the mean and the standard deviation are estimated from the same data, which makes it conservative. Use it as a vote, not as a referee.'],
    ref: 'Kolmogorov 1933; Lilliefors 1967',
  });

  E('normalityVerdict', {
    t: ['Veredicto de normalidad (votos)', 'Normality verdict (votes)'],
    what: ['La app aplica cinco pruebas y cuenta cuántas no rechazan la normalidad. El veredicto es la mayoría: «normal» si más de la mitad de las pruebas la aceptan.',
      'The app runs five tests and counts how many do not reject normality. The verdict is the majority: "normal" if more than half of the tests accept it.'],
    read: ['Un 5/5 o 4/5 es una variable cómodamente normal; un 0/5 es un rechazo claro; un 2/5 o 3/5 indica un caso de frontera donde manda lo que veas en el histograma y en el gráfico Q–Q.',
      'A 5/5 or 4/5 is a comfortably normal variable; a 0/5 is a clear rejection; a 2/5 or 3/5 indicates a borderline case where what you see in the histogram and the Q–Q plot decides.'],
    care: ['Votar no es una regla estadística formal, es una ayuda de lectura. Y recuerda: <b>los modelos de distribución de los pasos 8 y 9 no exigen normalidad</b>; esta tabla sirve para describir tus datos y decidir si conviene transformarlos.',
      'Voting is not a formal statistical rule, it is a reading aid. And remember: <b>the distribution models of steps 8 and 9 do not require normality</b>; this table is for describing your data and deciding whether to transform it.'],
    ref: 'Razali & Wah 2011',
  });

  E('qqplot', {
    t: ['Gráfico Q–Q normal', 'Normal Q–Q plot'],
    what: ['Enfrenta los valores ordenados de tu variable con los que tendría una normal perfecta. Si la variable fuera normal, todos los puntos caerían sobre una recta.',
      'Plots the ordered values of your variable against those a perfect normal would have. If the variable were normal, every point would fall on a straight line.'],
    read: ['Las formas tienen significado: puntos <b>curvados hacia arriba en los dos extremos</b> = colas pesadas; una <b>curva en forma de arco</b> = asimetría; un <b>escalón</b> = valores repetidos o redondeo; puntos <b>sueltos en una punta</b> = valores atípicos.',
      'The shapes mean something: points <b>curving up at both ends</b> = heavy tails; an <b>arc-shaped curve</b> = skew; a <b>step</b> = repeated values or rounding; <b>stray points at one end</b> = outliers.'],
    care: ['Los extremos de la recta siempre se ven más ruidosos, incluso con datos perfectamente normales: no juzgues por los dos o tres puntos de las puntas.',
      'The ends of the line always look noisier, even with perfectly normal data: do not judge by the two or three points at the tips.'],
    ref: 'Wilk & Gnanadesikan 1968',
  });

  E('boxplot', {
    t: ['Diagrama de caja', 'Box plot'],
    what: ['Resume la distribución en cinco números. La <b>caja</b> va de Q1 a Q3 (la mitad central de los registros) y la línea de dentro es la mediana.',
      'Summarises the distribution in five numbers. The <b>box</b> runs from Q1 to Q3 (the central half of the records) and the line inside it is the median.'],
    read: ['Los <b>bigotes</b> llegan hasta el dato más alejado que esté dentro de 1.5 veces el rango intercuartílico; los puntos que quedan fuera se dibujan sueltos y son los <b>valores atípicos</b> de este criterio. Una caja corta significa requerimientos estrechos; una mediana descentrada dentro de la caja, asimetría.',
      'The <b>whiskers</b> reach the furthest value still within 1.5 times the interquartile range; the points beyond them are drawn separately and are the <b>outliers</b> of this criterion. A short box means narrow requirements; a median off-centre inside the box means skew.'],
    care: ['«Atípico» aquí es un criterio <b>geométrico</b>, no un error: en una variable asimétrica aparecen muchos puntos fuera de los bigotes y todos pueden ser registros perfectamente válidos. El diagrama tampoco muestra si la distribución tiene dos modas: para eso usa el histograma o el violín.',
      '"Outlier" here is a <b>geometric</b> criterion, not an error: in a skewed variable many points appear beyond the whiskers and all of them can be perfectly valid records. Nor does the plot show whether the distribution has two modes: use the histogram or the violin for that.'],
    ref: 'Tukey 1977',
  });

  E('kde', {
    t: ['Densidad por núcleo y su ancho de banda', 'Kernel density and its bandwidth'],
    what: ['Es un histograma suavizado: en lugar de contar en barras, coloca una campanita sobre cada registro y las suma. El resultado es una curva continua de densidad.',
      'It is a smoothed histogram: instead of counting in bars it places a little bell over every record and adds them up. The result is a continuous density curve.'],
    read: ['El <b>ancho de banda</b> decide cuánto se suaviza: pequeño deja ver todos los picos (y también el ruido), grande deja una sola loma. Vale la pena mirar la misma variable con dos anchos antes de afirmar que la distribución tiene dos modas.',
      'The <b>bandwidth</b> decides how much smoothing there is: small shows every peak (and the noise too), large leaves a single hump. It is worth looking at the same variable with two bandwidths before claiming the distribution has two modes.'],
    care: ['El área bajo la curva vale 1, así que el eje vertical es una <b>densidad</b>, no una frecuencia: su valor no se puede leer como «número de registros».',
      'The area under the curve is 1, so the vertical axis is a <b>density</b>, not a frequency: its value cannot be read as "number of records".'],
    ref: 'Silverman 1986; Scott 1992',
  });

  E('transform', {
    t: ['Transformación sugerida', 'Suggested transformation'],
    what: ['La app prueba el logaritmo, la raíz cuadrada, Box-Cox y Yeo-Johnson, y se queda con la que deja la variable <b>más cerca de la normalidad</b> según Shapiro y Wilk.',
      'The app tries the logarithm, the square root, Box-Cox and Yeo-Johnson, and keeps the one that leaves the variable <b>closest to normality</b> according to Shapiro–Wilk.'],
    read: ['Columna «¿Mejora?»: «sí» significa que la transformada pasa la prueba y la original no. Log y raíz sirven para colas hacia la derecha (lluvia); Box-Cox busca el exponente óptimo y necesita valores positivos; Yeo-Johnson admite ceros y negativos (temperaturas bajo cero).',
      'Column "Improves?": "yes" means the transformed variable passes the test and the original one does not. Log and square root handle right-hand tails (rainfall); Box-Cox finds the optimal exponent and needs positive values; Yeo-Johnson accepts zeros and negatives (sub-zero temperatures).'],
    care: ['<b>No transformes por costumbre.</b> Los modelos de los pasos 8 y 9 no lo necesitan, y una variable transformada deja de tener unidades interpretables: 2.7 en logaritmo de milímetros no le dice nada a nadie. Transforma solo si vas a usar una técnica que sí exige normalidad.',
      '<b>Do not transform out of habit.</b> The models of steps 8 and 9 do not need it, and a transformed variable loses its interpretable units: 2.7 in log millimetres means nothing to anyone. Transform only if you are going to use a technique that really requires normality.'],
    ref: 'Box & Cox 1964; Yeo & Johnson 2000',
  });

  /* =====================================================================
     STEP 8a · principal component analysis
     ===================================================================== */

  E('pca', {
    t: ['Análisis de componentes principales', 'Principal component analysis'],
    what: ['Resume muchas variables correlacionadas en unos pocos ejes nuevos (las <b>dimensiones</b> o componentes), construidos como mezclas de las originales y ordenados de mayor a menor cantidad de variación recogida.',
      'Summarises many correlated variables into a few new axes (the <b>dimensions</b> or components), built as mixtures of the original ones and ordered from most to least variation captured.'],
    read: ['Las dimensiones son independientes entre sí. Dim 1 es el gradiente ambiental más fuerte de tus registros, Dim 2 el siguiente, y así. Interpretarlas consiste en ver qué variables pesan en cada una.',
      'The dimensions are independent of each other. Dim 1 is the strongest environmental gradient in your records, Dim 2 the next one, and so on. Interpreting them means looking at which variables weigh on each.'],
    care: ['Es una técnica <b>descriptiva</b>: no hay hipótesis ni valor p. Y es sensible a la escala, por eso conviene dejar marcada la estandarización cuando mezclas °C con mm.',
      'It is a <b>descriptive</b> technique: there is no hypothesis and no p value. And it is sensitive to scale, which is why it is wise to leave standardisation ticked when you mix °C with mm.'],
    ref: 'Pearson 1901; Hotelling 1933; Jolliffe 2002',
  });

  E('eigenvalue', {
    t: ['Valor propio', 'Eigenvalue'],
    what: ['La cantidad de variación que recoge cada dimensión. Con las variables estandarizadas, cada variable original aporta una unidad de varianza, así que un valor propio de 3 significa que esa dimensión vale por 3 variables.',
      'The amount of variation each dimension captures. With standardised variables each original variable contributes one unit of variance, so an eigenvalue of 3 means that dimension is worth 3 variables.'],
    read: ['El <b>criterio de Kaiser</b> conserva las dimensiones con valor propio mayor que 1: las que explican más que una variable suelta. Es la regla que informa la app.',
      'The <b>Kaiser criterion</b> keeps the dimensions with an eigenvalue above 1: those explaining more than a single variable. That is the rule the app reports.'],
    scaleTitle: ['Criterio de Kaiser (datos estandarizados)', 'Kaiser criterion (standardised data)'],
    scale: [
      S(null, 1, ['aporta menos que una variable: se descarta', 'gives less than one variable: dropped'], 'neutral'),
      S(1, null, ['se conserva', 'kept'], 'good'),
    ],
    conv: true,
    care: ['El criterio de Kaiser es una <b>regla práctica</b> muy criticada por quedarse con demasiadas dimensiones. Contrástalo con el codo del gráfico de sedimentación y con el porcentaje acumulado.',
      'The Kaiser criterion is a <b>rule of thumb</b> widely criticised for keeping too many dimensions. Check it against the elbow of the scree plot and against the cumulative percentage.'],
    ref: 'Kaiser 1960; Jolliffe 2002',
  });

  E('varexplained', {
    t: ['Varianza explicada y acumulada', 'Explained and cumulative variance'],
    what: ['El valor propio expresado en porcentaje del total. La columna acumulada suma las dimensiones de arriba abajo.',
      'The eigenvalue expressed as a percentage of the total. The cumulative column adds the dimensions from top to bottom.'],
    read: ['Se suelen conservar las dimensiones que hacen falta para llegar al 70–80 % acumulado. Con variables bioclimáticas, muy correlacionadas, es normal que las dos primeras ya pasen del 70 %.',
      'The dimensions needed to reach 70–80 % cumulative are usually kept. With bioclimatic variables, which are strongly correlated, it is normal for the first two to already exceed 70 %.'],
    scaleTitle: ['Convención del % acumulado', 'Convention on the cumulative %'],
    scale: [
      S(null, 70, ['queda mucha información fuera del plano', 'much information left out of the plane'], 'warn'),
      S(70, 80, ['resumen aceptable', 'acceptable summary'], 'ok'),
      S(80, null, ['resumen muy fiel', 'very faithful summary'], 'good'),
    ],
    conv: true,
    care: ['El 70–80 % es una <b>costumbre</b>, no un requisito. Un porcentaje alto no garantiza que las dimensiones signifiquen algo biológico: eso lo dicen las cargas.',
      'The 70–80 % is a <b>habit</b>, not a requirement. A high percentage does not guarantee the dimensions mean anything biological: the loadings say that.'],
    ref: 'Jolliffe 2002',
  });

  E('loadings', {
    t: ['Cargas y correlación con la dimensión', 'Loadings and correlation with the dimension'],
    what: ['La correlación entre cada variable original y la dimensión. Es lo que permite ponerle nombre a un eje: «Dim 1 = gradiente de humedad», por ejemplo.',
      'The correlation between each original variable and the dimension. It is what lets you name an axis: "Dim 1 = moisture gradient", for example.'],
    read: ['Va de −1 a 1 y se lee con la misma escala que cualquier correlación: por encima de |0.7| la variable define el eje; por debajo de |0.3| casi no interviene. El signo solo dice hacia qué lado del eje crece.',
      'It runs from −1 to 1 and is read with the same scale as any correlation: above |0.7| the variable defines the axis; below |0.3| it barely takes part. The sign only says which way along the axis it grows.'],
    care: ['El signo de una dimensión es <b>arbitrario</b>: la misma solución con todos los signos cambiados es igual de válida. No interpretes «positivo» como «más».',
      'The sign of a dimension is <b>arbitrary</b>: the same solution with every sign flipped is equally valid. Do not read "positive" as "more".'],
    ref: 'Jolliffe 2002',
  });

  E('cos2', {
    t: ['Calidad de representación (cos²)', 'Quality of representation (cos²)'],
    what: ['Dice qué tan bien queda representada una variable (o un registro) en el plano que estás mirando. Es el cuadrado del coseno del ángulo entre el punto y el eje.',
      'Says how well a variable (or a record) is represented on the plane you are looking at. It is the squared cosine of the angle between the point and the axis.'],
    read: ['Va de 0 a 1. Sumando el cos² de Dim 1 y Dim 2 obtienes la calidad en ese plano: cerca de 1 la flecha está bien dibujada y se puede interpretar; cerca de 0 la variable «apunta» hacia dimensiones que no estás viendo.',
      'It runs from 0 to 1. Adding the cos² of Dim 1 and Dim 2 gives the quality on that plane: near 1 the arrow is well drawn and can be interpreted; near 0 the variable "points" towards dimensions you are not looking at.'],
    scaleTitle: ['Escala de cos² en el plano', 'Scale of cos² on the plane'],
    scale: [
      S(null, 0.3, ['mal representada: no la interpretes', 'poorly represented: do not interpret it'], 'bad'),
      S(0.3, 0.6, ['representación parcial', 'partial representation'], 'warn'),
      S(0.6, null, ['bien representada', 'well represented'], 'good'),
    ],
    conv: true,
    care: ['Los cortes son una convención de lectura. En el círculo de correlación, la distancia de la punta de la flecha al centro es precisamente la raíz del cos²: las flechas cortas no se interpretan.',
      'The cuts are a reading convention. On the correlation circle the distance from the arrowhead to the centre is precisely the square root of cos²: short arrows are not interpreted.'],
    ref: 'Lê et al. 2008',
  });

  E('contribution', {
    t: ['Contribución a la dimensión (%)', 'Contribution to the dimension (%)'],
    what: ['Cuánto de una dimensión se debe a cada variable. Las contribuciones de todas las variables de una dimensión suman 100 %.',
      'How much of a dimension is due to each variable. The contributions of every variable to one dimension add up to 100 %.'],
    read: ['La referencia es el <b>reparto uniforme</b>: con <i>p</i> variables, sería 100/<i>p</i> %. Con 8 variables el promedio es 12.5 %, y las que pasen de ahí son las que construyen el eje.',
      'The reference is the <b>uniform share</b>: with <i>p</i> variables it would be 100/<i>p</i> %. With 8 variables the average is 12.5 %, and those above it are the ones that build the axis.'],
    formula: 'referencia = 100 / (número de variables)',
    care: ['Contribución y cos² no son lo mismo: una variable puede contribuir poco a Dim 1 y aun así estar bien representada en el plano, y al revés.',
      'Contribution and cos² are not the same: a variable can contribute little to Dim 1 and still be well represented on the plane, and the other way round.'],
    ref: 'Lê et al. 2008',
  });

  E('corrcircle', {
    t: ['Círculo de correlación', 'Correlation circle'],
    what: ['Dibuja cada variable como una flecha dentro de un círculo de radio 1. La posición resume su relación con las dos dimensiones que estás mirando.',
      'Draws each variable as an arrow inside a circle of radius 1. The position summarises its relationship with the two dimensions you are looking at.'],
    read: ['Tres reglas: flechas <b>juntas</b> = variables correlacionadas positivamente; flechas <b>opuestas</b> = correlación negativa; flechas <b>en ángulo recto</b> = independientes. Y cuanto más <b>larga</b> es la flecha, mejor representada está la variable.',
      'Three rules: arrows <b>close together</b> = positively correlated variables; <b>opposite</b> arrows = negative correlation; arrows at a <b>right angle</b> = independent. And the <b>longer</b> the arrow, the better represented the variable.'],
    care: ['Los ángulos solo aproximan las correlaciones reales en la medida en que las flechas sean largas. Con flechas cortas, el ángulo no significa nada.',
      'The angles only approximate the real correlations to the extent that the arrows are long. With short arrows the angle means nothing.'],
    ref: 'Lê et al. 2008',
  });

  /* =====================================================================
     STEP 8b · clustering
     ===================================================================== */

  E('hopkins', {
    t: ['Estadístico de Hopkins', 'Hopkins statistic'],
    what: ['Contesta a la pregunta previa a cualquier agrupamiento: <b>¿hay grupos que buscar?</b> Compara qué tan cerca están tus registros entre sí frente a qué tan cerca estarían unos puntos repartidos al azar por el mismo espacio.',
      'Answers the question that comes before any clustering: <b>are there clusters to look for?</b> It compares how close your records sit to one another against how close randomly scattered points would sit in the same space.'],
    read: ['Alrededor de 0.5 los datos son indistinguibles del azar y cualquier agrupamiento será artificial. Cuanto más se acerca a 1, más concentrados están en grumos.',
      'Around 0.5 the data are indistinguishable from randomness and any clustering will be artificial. The closer to 1, the more they are concentrated in clumps.'],
    scaleTitle: ['Escala de H', 'Scale of H'],
    scale: [
      S(null, 0.5, ['más regular que el azar', 'more regular than random'], 'neutral'),
      S(0.5, 0.75, ['sin tendencia clara a agruparse', 'no clear clustering tendency'], 'warn'),
      S(0.75, null, ['tendencia clara a agruparse', 'clear clustering tendency'], 'good'),
    ],
    conv: true,
    care: ['El corte 0.75 es una <b>convención</b> de uso común. El valor cambia un poco en cada ejecución porque se basa en puntos aleatorios, y depende mucho de qué variables incluyas.',
      'The 0.75 cut is a <b>widely used convention</b>. The value changes slightly at every run because it is based on random points, and it depends a lot on which variables you include.'],
    ref: 'Hopkins & Skellam 1954; Lawson & Jurs 1990; Banerjee & Davé 2004',
  });

  E('silhouette', {
    t: ['Anchura de silueta', 'Silhouette width'],
    what: ['Para cada registro compara la distancia media a los miembros <b>de su grupo</b> con la distancia media al grupo vecino más cercano. La silueta media resume la calidad de todo el agrupamiento.',
      'For each record it compares the mean distance to the members <b>of its own cluster</b> with the mean distance to the nearest neighbouring cluster. The mean silhouette summarises the quality of the whole clustering.'],
    read: ['Va de −1 a 1. Los registros con silueta negativa estarían mejor en otro grupo. La media es la que se lee con la escala.',
      'It runs from −1 to 1. Records with a negative silhouette would fit better in another cluster. The mean is the one read with the scale.'],
    scaleTitle: ['Escala de la silueta media', 'Scale of the mean silhouette'],
    scale: [
      S(null, 0.25, ['sin estructura real', 'no real structure'], 'bad'),
      S(0.25, 0.5, ['estructura débil', 'weak structure'], 'warn'),
      S(0.5, 0.7, ['estructura razonable', 'reasonable structure'], 'ok'),
      S(0.7, null, ['estructura fuerte', 'strong structure'], 'good'),
    ],
    conv: true,
    care: ['Estos cortes son la <b>convención</b> de sus autores, no un resultado matemático. La silueta favorece los grupos redondeados y del mismo tamaño: penaliza injustamente a DBSCAN y a los grupos alargados.',
      'These cuts are their authors\' <b>convention</b>, not a mathematical result. The silhouette favours round clusters of similar size: it unfairly penalises DBSCAN and elongated clusters.'],
    ref: 'Rousseeuw 1987; Kaufman & Rousseeuw 1990',
  });

  E('dunn', {
    t: ['Índice de Dunn', 'Dunn index'],
    what: ['Divide la separación entre los dos grupos <b>más cercanos</b> entre el diámetro del grupo <b>más ancho</b>. Premia agrupamientos compactos y bien separados.',
      'Divides the separation between the two <b>closest</b> clusters by the diameter of the <b>widest</b> cluster. It rewards compact, well-separated clusterings.'],
    read: ['Cuanto mayor, mejor, pero <b>no existe una escala de referencia</b>: solo sirve para comparar entre sí distintas soluciones (distintos <i>k</i> o distintos métodos) sobre los mismos datos.',
      'The larger the better, but <b>there is no reference scale</b>: it only serves to compare different solutions (different <i>k</i> or different methods) on the same data.'],
    care: ['Se basa en dos valores extremos, así que un solo registro atípico lo hunde. Míralo junto a la silueta, nunca solo.',
      'It is based on two extreme values, so a single outlying record sinks it. Look at it together with the silhouette, never alone.'],
    ref: 'Dunn 1974',
  });

  E('elbow', {
    t: ['Método del codo', 'Elbow method'],
    what: ['Dibuja la suma de cuadrados dentro de los grupos frente al número de grupos. Esa suma siempre baja al añadir grupos; lo que se busca es el punto donde <b>deja de bajar deprisa</b>.',
      'Plots the within-cluster sum of squares against the number of clusters. That sum always falls as clusters are added; what you look for is the point where it <b>stops falling quickly</b>.'],
    read: ['El «codo» de la curva sugiere el <i>k</i> a partir del cual añadir grupos ya casi no compra nada.',
      'The "elbow" of the curve suggests the <i>k</i> beyond which adding clusters buys almost nothing.'],
    care: ['Es un criterio <b>visual y subjetivo</b>: muchas veces no hay codo, o hay dos. Por eso la app lo acompaña de la silueta y del estadístico gap, que sí dan un número.',
      'It is a <b>visual and subjective</b> criterion: quite often there is no elbow, or there are two. That is why the app accompanies it with the silhouette and the gap statistic, which do give a number.'],
    ref: 'Thorndike 1953',
  });

  E('gap', {
    t: ['Estadístico gap', 'Gap statistic'],
    what: ['Compara la compacidad de tus grupos con la que se obtendría agrupando datos <b>sin ninguna estructura</b> generados en el mismo espacio. El «hueco» entre las dos curvas es el gap.',
      'Compares the compactness of your clusters with what would be obtained by clustering data <b>with no structure at all</b>, generated in the same space. The "gap" between the two curves is the statistic.'],
    read: ['Se elige el <i>k</i> más pequeño cuyo gap ya no mejora de forma apreciable respecto al siguiente, teniendo en cuenta el error de simulación (las barras del gráfico).',
      'You pick the smallest <i>k</i> whose gap no longer improves appreciably on the next one, taking the simulation error (the bars on the plot) into account.'],
    care: ['Depende del número de simulaciones y del azar, así que puede dar un <i>k</i> distinto en dos ejecuciones. Si la silueta y el gap no coinciden, es señal de que la estructura es débil.',
      'It depends on the number of simulations and on chance, so it can give a different <i>k</i> in two runs. If the silhouette and the gap disagree, that is a sign the structure is weak.'],
    ref: 'Tibshirani et al. 2001',
  });

  E('cophenetic', {
    t: ['Correlación cofenética', 'Cophenetic correlation'],
    what: ['Mide qué tan fielmente el <b>dendrograma</b> reproduce las distancias reales entre los registros. Correlaciona la distancia original de cada par con la altura a la que el árbol los une.',
      'Measures how faithfully the <b>dendrogram</b> reproduces the real distances between records. It correlates the original distance of each pair with the height at which the tree joins them.'],
    read: ['Va de 0 a 1. Es una medida de <b>fidelidad del dibujo</b>, no de la calidad de los grupos: un árbol fiel puede no tener grupos claros.',
      'It runs from 0 to 1. It measures the <b>faithfulness of the drawing</b>, not the quality of the clusters: a faithful tree may have no clear clusters.'],
    scaleTitle: ['Escala convencional', 'Conventional scale'],
    scale: [
      S(null, 0.7, ['el árbol distorsiona las distancias', 'the tree distorts the distances'], 'bad'),
      S(0.7, 0.8, ['aceptable', 'acceptable'], 'warn'),
      S(0.8, null, ['el árbol representa bien las distancias', 'the tree represents the distances well'], 'good'),
    ],
    conv: true,
    care: ['El corte 0.8 es una <b>convención</b> de la literatura taxonómica. Solo tiene sentido con métodos jerárquicos: con k-means, PAM o DBSCAN no hay árbol y la app no la informa.',
      'The 0.8 cut is a <b>convention</b> from the taxonomic literature. It only makes sense with hierarchical methods: with k-means, PAM or DBSCAN there is no tree and the app does not report it.'],
    ref: 'Sokal & Rohlf 1962; Romesburg 1984',
  });

  E('linkage', {
    t: ['Métodos de enlace jerárquico', 'Hierarchical linkage methods'],
    what: ['Todos construyen el árbol uniendo lo más parecido, pero difieren en cómo miden la distancia <b>entre dos grupos ya formados</b>, y eso cambia mucho la forma de los grupos.',
      'All of them build the tree by joining the most similar things, but they differ in how they measure the distance <b>between two clusters already formed</b>, and that changes the shape of the clusters a lot.'],
    read: ['<b>Ward</b>: minimiza la varianza interna; da grupos compactos y de tamaño parecido, y es el más usado con variables ambientales. <b>Completo</b>: usa los miembros más alejados; grupos compactos y sensibles a los atípicos. <b>Promedio (UPGMA)</b>: término medio, el habitual en taxonomía. <b>Simple</b>: usa los miembros más cercanos; encadena y suele producir un grupo enorme y varios sueltos.',
      '<b>Ward</b>: minimises internal variance; gives compact clusters of similar size and is the one most used with environmental variables. <b>Complete</b>: uses the furthest members; compact clusters, sensitive to outliers. <b>Average (UPGMA)</b>: middle ground, the usual one in taxonomy. <b>Single</b>: uses the nearest members; it chains and tends to produce one huge cluster and several stray ones.'],
    care: ['No hay un método «correcto»: cambiar de enlace cambia los grupos. Elige uno por razones explícitas y dilo en los métodos del artículo.',
      'There is no "correct" method: changing the linkage changes the clusters. Pick one for stated reasons and say so in the methods of your paper.'],
    ref: 'Ward 1963; Sokal & Michener 1958; Murtagh & Legendre 2014',
  });

  E('clmethods', {
    t: ['Qué método de agrupamiento elegir', 'Which clustering method to choose'],
    what: ['Cada familia asume una forma distinta de grupo, y ahí está la diferencia.',
      'Each family assumes a different cluster shape, and that is where the difference lies.'],
    read: ['<b>K-means</b>: grupos esféricos del mismo tamaño, rápido, muy sensible a los atípicos. <b>PAM (k-medoides)</b>: igual pero el centro es un registro real y aguanta mejor los atípicos. <b>Difuso (c-means)</b>: cada registro pertenece a varios grupos con un grado, útil cuando los gradientes ambientales son continuos. <b>Mezcla gaussiana</b>: grupos elípticos de distinto tamaño y orientación, y da la probabilidad de pertenencia. <b>DBSCAN</b>: grupos de cualquier forma definidos por densidad, deja fuera lo que considera ruido y no exige fijar <i>k</i>.',
      '<b>K-means</b>: spherical clusters of equal size, fast, very sensitive to outliers. <b>PAM (k-medoids)</b>: the same but the centre is a real record and it stands up to outliers better. <b>Fuzzy (c-means)</b>: each record belongs to several clusters with a degree, useful when environmental gradients are continuous. <b>Gaussian mixture</b>: elliptical clusters of different size and orientation, and it gives the probability of membership. <b>DBSCAN</b>: clusters of any shape defined by density, it leaves out what it considers noise and does not require fixing <i>k</i>.'],
    care: ['Todos <b>siempre devuelven grupos</b>, incluso con datos puramente aleatorios. Por eso se mira primero la tendencia de agrupamiento (Hopkins) y después la silueta.',
      'They all <b>always return clusters</b>, even with purely random data. That is why the clustering tendency (Hopkins) is checked first and the silhouette afterwards.'],
    ref: 'MacQueen 1967; Kaufman & Rousseeuw 1990; Bezdek 1981; Fraley & Raftery 2002; Ester et al. 1996',
  });

  /* =====================================================================
     STEP 8c · correspondence analysis
     ===================================================================== */

  E('inertia', {
    t: ['Inercia', 'Inertia'],
    what: ['Es el equivalente de la varianza en el análisis de correspondencias: mide cuánto se apartan las frecuencias observadas de la tabla de lo que se esperaría si las dos variables fueran independientes.',
      'It is the equivalent of variance in correspondence analysis: it measures how far the observed frequencies of the table depart from what would be expected if the two variables were independent.'],
    read: ['La inercia total es χ²/n. Una inercia total pequeña quiere decir que las dos variables categóricas apenas se relacionan, y entonces el mapa no tiene mucho que contar.',
      'The total inertia is χ²/n. A small total inertia means the two categorical variables are barely related, and then the map has little to tell.'],
    formula: 'inercia total = χ² / n',
    care: ['No tiene una escala universal porque depende del número de categorías. Compárala siempre con el reparto entre dimensiones y con el valor p de la prueba χ².',
      'It has no universal scale because it depends on the number of categories. Always compare it with the share between dimensions and with the p value of the χ² test.'],
    ref: 'Benzécri 1973; Greenacre 2007',
  });

  E('cadim', {
    t: ['Dimensiones del análisis de correspondencias', 'Dimensions of the correspondence analysis'],
    what: ['Como en el análisis de componentes principales, los ejes ordenan la información de mayor a menor. El porcentaje de varianza dice cuánta de la inercia total recoge cada uno.',
      'As in principal component analysis, the axes order the information from most to least. The percentage of variance says how much of the total inertia each one captures.'],
    read: ['Si las dos primeras dimensiones recogen la mayor parte de la inercia, el mapa plano resume bien la tabla. En el análisis de correspondencias múltiple los porcentajes salen <b>bajos por construcción</b> y no deben compararse con los del PCA.',
      'If the first two dimensions capture most of the inertia, the flat map summarises the table well. In multiple correspondence analysis the percentages come out <b>low by construction</b> and should not be compared with those of PCA.'],
    care: ['Un número alto de categorías reparte la inercia entre muchas dimensiones y hunde los porcentajes; eso no significa que el análisis sea malo.',
      'A large number of categories spreads the inertia over many dimensions and sinks the percentages; that does not mean the analysis is bad.'],
    ref: 'Greenacre 2007',
  });

  E('cadistance', {
    t: ['Cómo se lee la distancia en el mapa', 'How distance is read on the map'],
    what: ['El mapa coloca juntas las categorías que aparecen en los mismos registros y separadas las que no coinciden nunca.',
      'The map places together the categories that appear in the same records and apart those that never coincide.'],
    read: ['Dos <b>categorías de la misma variable</b> cercanas tienen perfiles parecidos. Una categoría <b>alejada del origen</b> es rara o muy característica. Que una categoría de filas y una de columnas caigan en la misma dirección desde el centro indica asociación entre ellas.',
      'Two <b>categories of the same variable</b> that are close have similar profiles. A category <b>far from the origin</b> is rare or very distinctive. When a row category and a column category fall in the same direction from the centre, that indicates an association between them.'],
    care: ['La distancia <b>directa</b> entre un punto de fila y uno de columna no se interpreta: solo la dirección desde el origen. Y las categorías con muy pocos registros aparecen en los extremos del mapa sin que eso signifique nada.',
      'The <b>direct</b> distance between a row point and a column point is not interpreted: only the direction from the origin. And categories with very few records appear at the edges of the map without that meaning anything.'],
    ref: 'Greenacre 2007',
  });

  /* =====================================================================
     STEP 8d · range, spatial pattern and niche
     ===================================================================== */

  E('eoo', {
    t: ['Extensión de la presencia (EOO)', 'Extent of occurrence (EOO)'],
    what: ['El área del <b>polígono convexo más pequeño</b> que envuelve todos los registros: una liga estirada alrededor de los puntos. Mide cuán amplio es el territorio dentro del cual vive la especie.',
      'The area of the <b>smallest convex polygon</b> that wraps all the records: a rubber band stretched around the points. It measures how wide the territory is within which the species lives.'],
    read: ['Se expresa en km² y es uno de los dos criterios de área de las listas rojas. Los umbrales de abajo son los publicados para el criterio B1.',
      'It is given in km² and is one of the two area criteria of the red lists. The thresholds below are the published ones for criterion B1.'],
    scaleTitle: ['Umbrales del criterio B1 de las listas rojas', 'Thresholds of red-list criterion B1'],
    scale: [
      S(null, 100, ['umbral de «en peligro crítico»', 'critically endangered threshold'], 'bad'),
      S(100, 5000, ['umbral de «en peligro»', 'endangered threshold'], 'warn'),
      S(5000, 20000, ['umbral de «vulnerable»', 'vulnerable threshold'], 'ok'),
      S(20000, null, ['por encima de los umbrales de área', 'above the area thresholds'], 'good'),
    ],
    care: ['<b>Estos umbrales no bastan por sí solos para asignar una categoría de riesgo.</b> El criterio B exige además al menos dos de tres condiciones (población muy fragmentada o en pocas localidades, disminución continua, fluctuaciones extremas). El EOO incluye zonas donde la especie no está (mar, desierto) y crece con cada registro nuevo, así que depende del esfuerzo de colecta.',
      '<b>These thresholds alone are not enough to assign a risk category.</b> Criterion B also demands at least two of three conditions (severely fragmented population or few locations, continuing decline, extreme fluctuations). The EOO includes areas where the species is absent (sea, desert) and grows with every new record, so it depends on collecting effort.'],
    ref: 'IUCN 2012; IUCN Standards and Petitions Committee 2022',
  });

  E('aoo', {
    t: ['Área de ocupación (AOO)', 'Area of occupancy (AOO)'],
    what: ['La superficie realmente ocupada: se cuenta cuántas celdas de una malla contienen al menos un registro y se multiplica por el área de la celda.',
      'The surface actually occupied: how many cells of a grid contain at least one record, multiplied by the area of the cell.'],
    read: ['Los umbrales de abajo son los del criterio B2 y están definidos <b>para celdas de 2 km de lado</b>, que es el tamaño estándar. La tabla de la app muestra varios tamaños de celda precisamente para que veas cuánto cambia la cifra.',
      'The thresholds below belong to criterion B2 and are defined <b>for cells 2 km on a side</b>, which is the standard size. The app\'s table shows several cell sizes precisely so that you can see how much the figure changes.'],
    scaleTitle: ['Umbrales del criterio B2 (celda de 2 km)', 'Thresholds of criterion B2 (2 km cell)'],
    scale: [
      S(null, 10, ['umbral de «en peligro crítico»', 'critically endangered threshold'], 'bad'),
      S(10, 500, ['umbral de «en peligro»', 'endangered threshold'], 'warn'),
      S(500, 2000, ['umbral de «vulnerable»', 'vulnerable threshold'], 'ok'),
      S(2000, null, ['por encima de los umbrales de área', 'above the area thresholds'], 'good'),
    ],
    care: ['Solo son comparables los AOO medidos con <b>el mismo tamaño de celda</b>, y con un muestreo incompleto el AOO se subestima siempre. Como con el EOO, el umbral por sí solo no asigna categoría de riesgo.',
      'Only AOOs measured with <b>the same cell size</b> are comparable, and with incomplete sampling the AOO is always underestimated. As with the EOO, the threshold alone does not assign a risk category.'],
    ref: 'IUCN 2012; IUCN Standards and Petitions Committee 2022',
  });

  E('clarkevans', {
    t: ['Índice del vecino más cercano (R)', 'Nearest-neighbour index (R)'],
    what: ['Divide la distancia media observada al vecino más cercano entre la que cabría esperar si los registros estuvieran repartidos <b>completamente al azar</b> por la misma superficie.',
      'Divides the observed mean distance to the nearest neighbour by the one expected if the records were scattered <b>completely at random</b> over the same area.'],
    read: ['La referencia es 1. Por debajo, los registros están más juntos de lo que el azar explicaría (agregados); por encima, más separados (regulares).',
      'The reference is 1. Below it the records sit closer than chance would explain (clustered); above it they sit further apart (regular).'],
    formula: 'R = distancia media observada / distancia media esperada al azar',
    scaleTitle: ['Escala de R', 'Scale of R'],
    scale: [
      S(0, 1, ['agregado', 'clustered'], 'ok', '< 1'),
      S(1, 1, ['aleatorio', 'random'], 'neutral', '= 1'),
      S(1, 2.149, ['disperso o regular', 'dispersed or regular'], 'ok', '> 1'),
    ],
    care: ['El valor z de al lado dice si la diferencia respecto a 1 es estadísticamente apreciable. Ojo: en registros de colecta la agregación casi siempre refleja <b>dónde se ha buscado</b> (carreteras, ciudades) y no dónde está la especie. R también depende mucho del polígono que se tome como área de estudio.',
      'The neighbouring z value says whether the difference from 1 is statistically appreciable. Beware: in collection records clustering almost always reflects <b>where people have looked</b> (roads, cities) rather than where the species is. R also depends heavily on the polygon taken as the study area.'],
    ref: 'Clark & Evans 1954',
  });

  E('ripley', {
    t: ['Función L de Ripley y su envolvente', "Ripley's L function and its envelope"],
    what: ['Amplía la idea del vecino más cercano a <b>todas las escalas a la vez</b>: para cada distancia cuenta cuántos registros hay alrededor de cada punto y lo compara con lo esperado al azar.',
      'Extends the nearest-neighbour idea to <b>every scale at once</b>: for each distance it counts how many records lie around each point and compares that with what chance would give.'],
    read: ['La <b>envolvente</b> es la banda que ocupan las simulaciones de reparto completamente aleatorio. Donde la curva observada sale <b>por encima</b> de la banda hay agregación a esa distancia; <b>por debajo</b>, regularidad; dentro de la banda, nada distinguible del azar. Muchas veces la curva sale por encima a distancias cortas y vuelve dentro a distancias largas: eso son parches.',
      'The <b>envelope</b> is the band the completely random simulations occupy. Where the observed curve runs <b>above</b> the band there is clustering at that distance; <b>below</b> it, regularity; inside the band, nothing distinguishable from chance. Quite often the curve is above at short distances and back inside at long ones: those are patches.'],
    care: ['La envolvente <b>no es un intervalo de confianza</b> y mirar todas las distancias a la vez infla el riesgo de ver un patrón donde no lo hay. Con registros de colecta, el patrón que se detecta suele ser el del muestreo.',
      'The envelope is <b>not a confidence interval</b>, and looking at every distance at once inflates the risk of seeing a pattern where there is none. With collection records the pattern detected is usually that of the sampling.'],
    ref: 'Ripley 1977; Besag 1977',
  });

  E('levins', {
    t: ['Amplitud de nicho de Levins (B)', "Levins' niche breadth (B)"],
    what: ['Mide si la especie usa muchas condiciones distintas de una variable o solo unas pocas. Se reparte el gradiente en clases y se mira cómo se distribuyen los registros entre ellas.',
      'Measures whether the species uses many different conditions of a variable or only a few. The gradient is split into classes and the records\' distribution among them is examined.'],
    read: ['La app informa la versión <b>estandarizada, de 0 a 1</b>, que es la comparable entre variables: cerca de 0 la especie se concentra en una franja muy estrecha (especialista); cerca de 1 se reparte por igual en todo el gradiente (generalista).',
      'The app reports the <b>standardised version, from 0 to 1</b>, which is the one comparable across variables: near 0 the species concentrates in a very narrow band (specialist); near 1 it spreads evenly across the whole gradient (generalist).'],
    formula: 'B = 1 / Σp²  ·  B estandarizada = (B − 1) / (número de clases − 1)',
    scaleTitle: ['Escala de B estandarizada', 'Scale of standardised B'],
    scale: [
      S(0, 0.33, ['nicho estrecho (especialista)', 'narrow niche (specialist)'], 'ok'),
      S(0.33, 0.66, ['nicho intermedio', 'intermediate niche'], 'neutral'),
      S(0.66, 1, ['nicho amplio (generalista)', 'broad niche (generalist)'], 'ok'),
    ],
    conv: true,
    care: ['Los tercios son un <b>reparto de lectura</b>, no umbrales publicados. El valor depende de cuántas clases se usen y, sobre todo, mide el nicho <b>observado</b> en tus registros, que es más estrecho que el real si el muestreo es incompleto.',
      'The thirds are a <b>reading split</b>, not published thresholds. The value depends on how many classes are used and, above all, it measures the <b>observed</b> niche in your records, which is narrower than the real one when sampling is incomplete.'],
    ref: 'Levins 1968; Hurlbert 1978',
  });

  E('schoener', {
    t: ['Solapamiento D de Schoener', "Schoener's D overlap"],
    what: ['Compara cómo se reparten dos taxones por el espacio ambiental y resume en un número cuánto coinciden. Va de 0 (no comparten nada) a 1 (distribuciones idénticas).',
      'Compares how two taxa spread across environmental space and summarises in one number how much they coincide. It runs from 0 (nothing in common) to 1 (identical distributions).'],
    read: ['Un valor alto indica que los dos taxones ocupan las mismas condiciones; uno bajo, que se han separado ambientalmente.',
      'A high value indicates the two taxa occupy the same conditions; a low one, that they have separated environmentally.'],
    formula: 'D = 1 − ½ Σ |p_A,i − p_B,i|',
    scaleTitle: ['Bandas de uso habitual', 'Commonly used bands'],
    scale: [
      S(0, 0.2, ['solapamiento nulo o muy limitado', 'no or very limited overlap'], 'neutral'),
      S(0.2, 0.4, ['bajo', 'low'], 'neutral'),
      S(0.4, 0.6, ['moderado', 'moderate'], 'ok'),
      S(0.6, 0.8, ['alto', 'high'], 'ok'),
      S(0.8, 1, ['muy alto', 'very high'], 'good'),
    ],
    conv: true,
    care: ['Las bandas son una <b>convención</b> propuesta para leer el índice, no un resultado. Un D alto no prueba equivalencia de nichos: para eso hacen falta pruebas de identidad y de similitud con aleatorizaciones, que esta app no calcula.',
      'The bands are a <b>convention</b> proposed for reading the index, not a result. A high D does not prove niche equivalence: that needs identity and background-similarity tests with randomisations, which this app does not compute.'],
    ref: 'Schoener 1968; Warren et al. 2008; Rödder & Engler 2011',
  });

  E('hellinger', {
    t: ['Solapamiento I de Hellinger', 'Hellinger-based overlap I'],
    what: ['Otra medida del solapamiento entre dos taxones en el espacio ambiental, construida sobre la distancia de Hellinger. También va de 0 a 1.',
      'Another measure of overlap between two taxa in environmental space, built on the Hellinger distance. It also runs from 0 to 1.'],
    read: ['Se lee con las mismas bandas que D y casi siempre sale algo <b>más alto</b> que él, porque pesa menos las diferencias en las zonas de baja densidad. Interpreta los dos juntos.',
      'It is read with the same bands as D and almost always comes out somewhat <b>higher</b>, because it gives less weight to differences in low-density areas. Interpret the two together.'],
    scaleTitle: ['Bandas de uso habitual', 'Commonly used bands'],
    scale: [
      S(0, 0.2, ['solapamiento nulo o muy limitado', 'no or very limited overlap'], 'neutral'),
      S(0.2, 0.4, ['bajo', 'low'], 'neutral'),
      S(0.4, 0.6, ['moderado', 'moderate'], 'ok'),
      S(0.6, 0.8, ['alto', 'high'], 'ok'),
      S(0.8, 1, ['muy alto', 'very high'], 'good'),
    ],
    conv: true,
    care: ['Mismas cautelas que con D: son bandas convencionales y miden solapamiento <b>observado</b>, condicionado por el muestreo de cada taxón.',
      'Same cautions as with D: they are conventional bands and they measure <b>observed</b> overlap, conditioned by each taxon\'s sampling.'],
    ref: 'Warren et al. 2008; Rödder & Engler 2011',
  });

  /* =====================================================================
     STEP 8e · diversity
     ===================================================================== */

  E('richness', {
    t: ['Riqueza observada (S)', 'Observed richness (S)'],
    what: ['El número de taxones distintos que aparecen en el sitio. Es el índice más intuitivo y el que más depende del esfuerzo de muestreo.',
      'The number of distinct taxa that appear at the site. It is the most intuitive index and the one that depends most on sampling effort.'],
    read: ['No tiene escala: se compara entre sitios. Trata igual al taxón con 500 registros y al que apareció una sola vez.',
      'It has no scale: it is compared between sites. It treats the taxon with 500 records and the one seen once alike.'],
    care: ['<b>Nunca compares riquezas observadas de sitios con distinto número de registros</b>: el sitio más visitado siempre parecerá más rico. Usa la rarefacción o la comparación a igual cobertura.',
      '<b>Never compare observed richness between sites with different numbers of records</b>: the better-visited site will always look richer. Use rarefaction or the equal-coverage comparison.'],
    ref: 'Magurran 2004; Gotelli & Colwell 2001',
  });

  E('shannon', {
    t: ['Índice de Shannon (H′)', "Shannon index (H′)"],
    what: ['Combina cuántos taxones hay y qué tan repartidos están los registros entre ellos. Crece con la riqueza y con la equidad; vale 0 cuando solo hay un taxón.',
      'Combines how many taxa there are and how evenly the records are shared among them. It grows with richness and with evenness; it is 0 when there is a single taxon.'],
    read: ['Con logaritmo natural, el rango que se ve en la práctica es el de abajo. Su máximo posible es log(S), así que depende de cuántos taxones haya.',
      'With natural logarithms the range seen in practice is the one below. Its possible maximum is log(S), so it depends on how many taxa there are.'],
    formula: 'H′ = − Σ p_i · ln(p_i)',
    scaleTitle: ['Rango que se observa en la práctica (base e)', 'Range seen in practice (base e)'],
    scale: [
      S(0, 1.5, ['comunidad pobre o muy dominada', 'poor or strongly dominated community'], 'neutral'),
      S(1.5, 3.5, ['rango habitual de los datos reales', 'usual range of real data'], 'ok'),
      S(3.5, null, ['muy diversa (poco frecuente)', 'very diverse (uncommon)'], 'good'),
    ],
    conv: true,
    care: ['El 1.5–3.5 es el <b>rango que se observa</b>, no un umbral de bueno o malo, y cambia por completo con la base del logaritmo. H′ es difícil de interpretar directamente: su exponencial (Hill q = 1) sí, porque son «taxones efectivos». Con registros de presencia, H′ describe el reparto de los <b>registros</b>, no de los individuos.',
      'The 1.5–3.5 is the <b>observed range</b>, not a good-or-bad threshold, and it changes completely with the base of the logarithm. H′ is hard to interpret directly; its exponential (Hill q = 1) is not, because those are "effective taxa". With presence records H′ describes how the <b>records</b> are shared, not the individuals.'],
    ref: 'Shannon 1948; Magurran 2004; Jost 2006',
  });

  E('simpson', {
    t: ['Índice de Simpson (D) y sus complementos', "Simpson's index (D) and its complements"],
    what: ['D es la probabilidad de que dos registros tomados al azar pertenezcan <b>al mismo</b> taxón: mide dominancia. 1 − D es la probabilidad de que sean <b>distintos</b>, y 1/D es el número de taxones igualmente comunes que darían esa misma dominancia.',
      'D is the probability that two records taken at random belong to <b>the same</b> taxon: it measures dominance. 1 − D is the probability that they are <b>different</b>, and 1/D is the number of equally common taxa that would give the same dominance.'],
    read: ['D va de 0 a 1 y <b>al revés que la diversidad</b>: cuanto mayor, más dominado está el sitio. 1 − D (la «diversidad de Simpson») sí crece con la diversidad y va de 0 a 1. 1/D es el número de Hill con q = 2.',
      'D runs from 0 to 1 and <b>the opposite way to diversity</b>: the larger it is, the more dominated the site. 1 − D (the "Simpson diversity") does grow with diversity and runs from 0 to 1. 1/D is the Hill number with q = 2.'],
    formula: 'D = Σ p_i²',
    care: ['Pesa mucho a los taxones abundantes y casi ignora a los raros: por eso es <b>menos sensible al esfuerzo de muestreo</b> que la riqueza, pero también es ciego a las especies escasas. Fíjate siempre en cuál de las tres versiones estás leyendo.',
      'It weighs abundant taxa heavily and almost ignores the rare ones: that makes it <b>less sensitive to sampling effort</b> than richness, but also blind to scarce species. Always check which of the three versions you are reading.'],
    ref: 'Simpson 1949; Magurran 2004',
  });

  E('hill', {
    t: ['Números de Hill (q = 0, 1, 2)', 'Hill numbers (q = 0, 1, 2)'],
    what: ['Expresan la diversidad como un <b>número efectivo de taxones</b>: «este sitio se comporta como si tuviera <i>x</i> taxones igualmente comunes». El parámetro q decide cuánto pesan los raros.',
      'They express diversity as an <b>effective number of taxa</b>: "this site behaves as if it held <i>x</i> equally common taxa". The parameter q decides how much weight the rare ones get.'],
    read: ['<b>q = 0</b> es la riqueza (todos pesan igual, los raros mandan). <b>q = 1</b> es el exponencial de Shannon (cada taxón pesa según su frecuencia). <b>q = 2</b> es el inverso de Simpson (mandan los abundantes). Los tres están en las <b>mismas unidades</b>, así que se pueden comparar y dividir: si q0 = 20 y q2 = 3, hay muchos taxones pero solo tres mandan.',
      '<b>q = 0</b> is richness (all weigh the same, the rare ones rule). <b>q = 1</b> is the exponential of Shannon (each taxon weighs according to its frequency). <b>q = 2</b> is the inverse of Simpson (the abundant ones rule). All three are in the <b>same units</b>, so they can be compared and divided: if q0 = 20 and q2 = 3, there are many taxa but only three that matter.'],
    care: ['El perfil (H frente a q) dice más que cualquier número suelto: si las curvas de dos sitios <b>se cruzan</b>, el orden entre ellos depende del índice que elijas y no se puede afirmar que uno sea más diverso.',
      'The profile (H against q) says more than any single number: if the curves of two sites <b>cross</b>, the ranking between them depends on the index you pick and you cannot claim one is more diverse.'],
    ref: 'Hill 1973; Jost 2006',
  });

  E('pielou', {
    t: ['Equitatividad de Pielou (J′)', "Pielou's evenness (J′)"],
    what: ['Separa la parte de «reparto» de la diversidad de la parte de «cuántos hay»: divide H′ entre su máximo posible, que sería el de un sitio con los mismos taxones todos igual de frecuentes.',
      'Separates the "sharing" part of diversity from the "how many" part: it divides H′ by its possible maximum, the value of a site with the same taxa all equally frequent.'],
    read: ['Va de 0 a 1. Cerca de 1 los registros se reparten por igual entre los taxones; cerca de 0 hay uno que acapara casi todo.',
      'It runs from 0 to 1. Near 1 the records are shared evenly among the taxa; near 0 one of them takes almost everything.'],
    formula: "J′ = H′ / log(S)",
    scaleTitle: ['Escala de J′', 'Scale of J′'],
    scale: [
      S(0, 0.4, ['muy dominado por un taxón', 'strongly dominated by one taxon'], 'neutral'),
      S(0.4, 0.7, ['reparto desigual', 'uneven sharing'], 'neutral'),
      S(0.7, 1, ['reparto bastante equitativo', 'fairly even sharing'], 'ok'),
    ],
    conv: true,
    care: ['Los cortes son un <b>reparto de lectura</b>, no umbrales publicados. J′ no está definido cuando hay un solo taxón (log(1) = 0) y está correlacionado con la riqueza, así que no es tan independiente de ella como parece.',
      'The cuts are a <b>reading split</b>, not published thresholds. J′ is undefined when there is a single taxon (log(1) = 0) and it is correlated with richness, so it is not as independent of it as it looks.'],
    ref: 'Pielou 1966',
  });

  E('bergerparker', {
    t: ['Dominancia de Berger y Parker', 'Berger and Parker dominance'],
    what: ['La proporción de registros que se lleva el <b>taxón más abundante</b>. Es la medida de dominancia más sencilla que existe.',
      'The share of records taken by the <b>most abundant taxon</b>. It is the simplest dominance measure there is.'],
    read: ['Va de 1/S (todos por igual) a 1 (un solo taxón lo es todo). Un valor de 0.6 significa que seis de cada diez registros son del mismo taxón.',
      'It runs from 1/S (all equal) to 1 (a single taxon is everything). A value of 0.6 means six out of every ten records belong to the same taxon.'],
    formula: 'd = N_max / N',
    care: ['Usa un solo dato y desecha el resto de la comunidad. En registros de presencia, el taxón «dominante» es a menudo el <b>mejor coleccionado</b>, no el más abundante.',
      'It uses a single datum and throws away the rest of the community. In presence records the "dominant" taxon is often the <b>best collected</b> one, not the most abundant.'],
    ref: 'Berger & Parker 1970',
  });

  E('margalef', {
    t: ['Riqueza de Margalef y de Menhinick', 'Margalef and Menhinick richness'],
    what: ['Dos índices que intentan corregir la riqueza por el número de registros, para poder comparar sitios con distinto esfuerzo: Margalef divide por el logaritmo de N y Menhinick por su raíz cuadrada.',
      'Two indices that try to correct richness by the number of records, so that sites with different effort can be compared: Margalef divides by the logarithm of N and Menhinick by its square root.'],
    read: ['No tienen escala propia; se comparan entre sitios del mismo estudio. Cuanto mayores, más taxones por unidad de esfuerzo.',
      'They have no scale of their own; they are compared between sites of the same study. The larger they are, the more taxa per unit of effort.'],
    formula: 'D_Mg = (S − 1) / ln(N)   ·   D_Mn = S / √N',
    care: ['La corrección es <b>heurística</b> y no elimina el efecto del esfuerzo: siguen creciendo con N en la mayoría de los casos reales. La rarefacción y la comparación a igual cobertura son la salida correcta.',
      'The correction is <b>heuristic</b> and does not remove the effect of effort: they still grow with N in most real cases. Rarefaction and equal-coverage comparison are the proper way out.'],
    ref: 'Margalef 1958; Menhinick 1964; Gotelli & Colwell 2001',
  });

  E('fisheralpha', {
    t: ['α de la serie logarítmica de Fisher', "Fisher's log-series α"],
    what: ['Un parámetro de diversidad que sale de ajustar a los datos un modelo de abundancias en el que unos pocos taxones son comunes y muchísimos son raros.',
      'A diversity parameter obtained by fitting to the data an abundance model in which a few taxa are common and very many are rare.'],
    read: ['Cuanto mayor, más diversa la muestra. Su gran ventaja es que es <b>bastante estable frente al tamaño de la muestra</b>, lo que lo hace útil para comparar colecciones desiguales.',
      'The larger it is, the more diverse the sample. Its great advantage is that it is <b>fairly stable against sample size</b>, which makes it useful for comparing unequal collections.'],
    care: ['Supone que las abundancias siguen una serie logarítmica; si tu muestra no se parece a ese modelo (mira el gráfico de rango y abundancia), α pierde su sentido. Tampoco está definido en muestras muy pequeñas.',
      'It assumes the abundances follow a log-series; if your sample does not resemble that model (look at the rank-abundance plot), α loses its meaning. It is also undefined in very small samples.'],
    ref: 'Fisher et al. 1943; Magurran 2004',
  });

  E('chao1', {
    t: ['Chao1 y los demás estimadores de riqueza', 'Chao1 and the other richness estimators'],
    what: ['Estiman <b>cuántos taxones hay en realidad</b>, incluidos los que no se han visto todavía, a partir de cuántos se han visto una sola vez (f₁) y dos veces (f₂). La idea: si sigues encontrando taxones nuevos, seguro que faltan muchos.',
      'They estimate <b>how many taxa are really there</b>, including those not yet seen, from how many have been seen once (f₁) and twice (f₂). The idea: if you keep finding new taxa, there are surely many missing.'],
    read: ['La diferencia entre Chao1 y la riqueza observada es <b>lo que te falta por encontrar</b>. Si Chao1 ≈ S, el inventario está prácticamente completo; si Chao1 dobla a S, has visto la mitad. ACE y las navajas (jackknife) hacen lo mismo con fórmulas distintas: cuando los cuatro coinciden, la estimación es sólida.',
      'The gap between Chao1 and the observed richness is <b>what you still have to find</b>. If Chao1 ≈ S the inventory is practically complete; if Chao1 doubles S you have seen half. ACE and the jackknives do the same with different formulas: when the four agree, the estimate is solid.'],
    formula: 'Chao1 = S + f₁² / (2·f₂)',
    care: ['Es un <b>límite inferior</b>: la riqueza real puede ser mayor. Necesita singletons y doubletons para funcionar: si f₂ = 0 la fórmula se dispara, y por eso la app informa también la versión corregida. Con registros de colecta, los singletons pueden ser errores de identificación en lugar de especies raras.',
      'It is a <b>lower bound</b>: the real richness may be higher. It needs singletons and doubletons to work: if f₂ = 0 the formula blows up, which is why the app also reports the bias-corrected version. In collection records, singletons can be misidentifications rather than rare species.'],
    ref: 'Chao 1984; Chao 1987; Chao & Lee 1992',
  });

  E('coverage', {
    t: ['Cobertura de muestra', 'Sample coverage'],
    what: ['La proporción de los registros que pertenece a taxones <b>que ya has detectado</b>. Es la mejor medida de lo completo que está un inventario.',
      'The share of the records belonging to taxa <b>you have already detected</b>. It is the best measure of how complete an inventory is.'],
    read: ['Va de 0 a 1 y suele darse en porcentaje. Una cobertura de 0.95 quiere decir que si tomaras un registro más, hay un 95 % de probabilidad de que fuera de un taxón ya conocido, y un 5 % de que fuera nuevo.',
      'It runs from 0 to 1 and is usually given as a percentage. A coverage of 0.95 means that if you took one more record, there is a 95 % chance it would belong to a taxon you already know and a 5 % chance it would be new.'],
    formula: 'Ĉ ≈ 1 − f₁ / N   (con la corrección de Chao y Jost)',
    scaleTitle: ['Lectura de la cobertura', 'Reading the coverage'],
    scale: [
      S(0, 0.8, ['inventario muy incompleto', 'very incomplete inventory'], 'bad'),
      S(0.8, 0.95, ['inventario parcial', 'partial inventory'], 'warn'),
      S(0.95, 1, ['inventario prácticamente completo', 'practically complete inventory'], 'good'),
    ],
    conv: true,
    care: ['Los cortes 0.8 y 0.95 son de <b>lectura</b>, no umbrales publicados. Comparar sitios <b>a igual cobertura</b> es más justo que compararlos a igual número de registros, porque una cobertura del 90 % significa lo mismo en un sitio rico y en uno pobre.',
      'The 0.8 and 0.95 cuts are for <b>reading</b>, not published thresholds. Comparing sites <b>at equal coverage</b> is fairer than at an equal number of records, because 90 % coverage means the same thing at a rich site and at a poor one.'],
    ref: 'Good 1953; Chao & Jost 2012',
  });

  E('rarefaction', {
    t: ['Rarefacción', 'Rarefaction'],
    what: ['Responde a: «¿cuántos taxones habría encontrado en este sitio si solo tuviera <i>m</i> registros?». Permite comparar sitios con esfuerzos desiguales <b>bajándolos todos al mismo nivel</b>.',
      'Answers: "how many taxa would I have found at this site with only <i>m</i> records?". It lets sites with unequal effort be compared by <b>bringing them all down to the same level</b>.'],
    read: ['Compara las curvas en la <b>misma vertical</b>, nunca en sus extremos. Una curva que ya se ha aplanado indica un inventario casi completo; una que sigue subiendo con fuerza dice que faltan taxones por encontrar. Las bandas del 95 % que se solapan significan que la diferencia no es apreciable.',
      'Compare the curves on the <b>same vertical</b>, never at their ends. A curve that has already flattened means a nearly complete inventory; one still rising steeply says taxa are still missing. Overlapping 95 % bands mean the difference is not appreciable.'],
    care: ['La parte extrapolada (más allá de tus datos) es de fiar hasta aproximadamente el doble de registros observados; más allá es especulación. La rarefacción supone además que los registros son independientes, cosa que no se cumple cuando vienen de una misma expedición.',
      'The extrapolated part (beyond your data) is trustworthy up to about twice the observed records; beyond that it is speculation. Rarefaction also assumes the records are independent, which does not hold when they come from a single expedition.'],
    ref: 'Hurlbert 1971; Gotelli & Colwell 2001; Colwell et al. 2012',
  });

  E('jaccard', {
    t: ['Disimilitud de Jaccard', 'Jaccard dissimilarity'],
    what: ['Compara dos sitios por <b>qué taxones tienen</b>, sin mirar cuántos registros. Es la proporción de taxones que no comparten sobre el total de taxones entre los dos.',
      'Compares two sites by <b>which taxa they hold</b>, ignoring how many records. It is the share of taxa they do not share out of all the taxa between them.'],
    read: ['Va de 0 (exactamente los mismos taxones) a 1 (ningún taxón en común). 0.6 significa que el 60 % de los taxones son exclusivos de uno u otro sitio.',
      'It runs from 0 (exactly the same taxa) to 1 (no taxon in common). 0.6 means 60 % of the taxa are exclusive to one site or the other.'],
    formula: 'Jaccard = (b + c) / (a + b + c),  con a = compartidos, b y c = exclusivos',
    care: ['Al ignorar las abundancias, un taxón visto una sola vez pesa igual que el más común. Por eso es <b>muy sensible al esfuerzo de muestreo</b>: un sitio poco muestreado parecerá siempre muy distinto de los demás.',
      'By ignoring abundances, a taxon seen once weighs as much as the commonest one. That makes it <b>very sensitive to sampling effort</b>: a poorly sampled site will always look very different from the rest.'],
    ref: 'Jaccard 1901',
  });

  E('sorensen', {
    t: ['Disimilitud de Sørensen', 'Sørensen dissimilarity'],
    what: ['La misma idea que Jaccard, pero dando el doble de peso a los taxones <b>compartidos</b>. Por eso siempre sale más baja que Jaccard sobre los mismos datos.',
      'The same idea as Jaccard, but giving twice the weight to the <b>shared</b> taxa. That is why it always comes out lower than Jaccard on the same data.'],
    read: ['Va de 0 a 1 y se lee igual. Es la que se descompone en recambio y anidamiento, y la más usada en ecología de comunidades.',
      'It runs from 0 to 1 and is read the same way. It is the one partitioned into turnover and nestedness, and the most used in community ecology.'],
    formula: 'Sørensen = (b + c) / (2a + b + c)',
    care: ['Nunca mezcles valores de Jaccard y de Sørensen en la misma comparación: miden lo mismo en escalas distintas.',
      'Never mix Jaccard and Sørensen values in the same comparison: they measure the same thing on different scales.'],
    ref: 'Sørensen 1948',
  });

  E('braycurtis', {
    t: ['Disimilitud de Bray y Curtis', 'Bray and Curtis dissimilarity'],
    what: ['Compara dos sitios teniendo en cuenta <b>cuántos registros</b> hay de cada taxón, no solo su presencia.',
      'Compares two sites taking into account <b>how many records</b> there are of each taxon, not just their presence.'],
    read: ['Va de 0 (composición y abundancias idénticas) a 1 (nada en común). Es la base del NMDS y del análisis de qué taxones separan dos conjuntos de sitios.',
      'It runs from 0 (identical composition and abundances) to 1 (nothing in common). It is the basis of the NMDS and of the analysis of which taxa separate two sets of sites.'],
    formula: 'BC = Σ|x_i − y_i| / Σ(x_i + y_i)',
    care: ['Domina el taxón más abundante. Y aquí hay una trampa seria: con registros de presencia, la «abundancia» es esfuerzo de colecta, así que dos sitios pueden salir distintos solo porque uno se visitó más. Muchos ecólogos transforman las abundancias (raíz cuadrada) antes de calcularla.',
      'The most abundant taxon dominates it. And here lies a serious trap: with presence records the "abundance" is collecting effort, so two sites can come out different merely because one was visited more. Many ecologists transform the abundances (square root) before computing it.'],
    ref: 'Bray & Curtis 1957',
  });

  E('morisita', {
    t: ['Índice de Morisita y Horn', 'Morisita–Horn index'],
    what: ['Otra disimilitud basada en abundancias, construida sobre la probabilidad de que dos registros tomados de sitios distintos sean del mismo taxón.',
      'Another abundance-based dissimilarity, built on the probability that two records taken from different sites belong to the same taxon.'],
    read: ['Va de 0 a 1. Su ventaja es que es <b>poco sensible al tamaño de la muestra</b>, así que es la mejor opción cuando los sitios tienen números de registros muy distintos.',
      'It runs from 0 to 1. Its advantage is that it is <b>little affected by sample size</b>, which makes it the best option when sites have very different numbers of records.'],
    care: ['A cambio, depende casi por completo de los taxones más abundantes y es casi ciego a los raros. Si te interesan las especies escasas, usa Jaccard o Sørensen.',
      'In exchange it depends almost entirely on the most abundant taxa and is nearly blind to the rare ones. If the scarce species are what interest you, use Jaccard or Sørensen.'],
    ref: 'Morisita 1959; Horn 1966',
  });

  E('betapartition', {
    t: ['Partición en recambio y anidamiento', 'Turnover and nestedness partition'],
    what: ['Separa la diferencia total entre sitios (β_sor) en dos causas opuestas: el <b>recambio</b> (β_sim), unos taxones sustituyen a otros, y el <b>anidamiento</b> (β_sne), el sitio pobre es un subconjunto del rico.',
      'Splits the total difference between sites (β_sor) into two opposite causes: <b>turnover</b> (β_sim), some taxa replace others, and <b>nestedness</b> (β_sne), the poor site being a subset of the rich one.'],
    read: ['Las dos sumadas dan β_sor. Lo que se interpreta es el <b>porcentaje</b> de cada una. Predominio de recambio: hay barreras o gradientes que separan comunidades distintas, y hay que conservar muchos sitios. Predominio de anidamiento: hay sitios empobrecidos por pérdida de hábitat, y conviene concentrarse en los más ricos.',
      'The two add up to β_sor. What is interpreted is the <b>percentage</b> of each. Turnover dominating: there are barriers or gradients separating different communities, and many sites must be conserved. Nestedness dominating: some sites are impoverished by habitat loss, and the richest ones deserve the focus.'],
    care: ['Dos paisajes con <b>la misma β total</b> pueden tener causas opuestas: por eso la partición es más informativa que el número global. Solo usa presencia y ausencia, no abundancias.',
      'Two landscapes with <b>the same total β</b> can have opposite causes: that is why the partition is more informative than the overall number. It uses presence and absence only, not abundances.'],
    ref: 'Baselga 2010',
  });

  E('whittakerbeta', {
    t: ['β_w de Whittaker', "Whittaker's β_w"],
    what: ['La medida clásica de diversidad beta: cuántas veces la riqueza total del conjunto supera a la riqueza media de un sitio, menos uno.',
      'The classical beta-diversity measure: how many times the total richness of the set exceeds the mean richness of a site, minus one.'],
    read: ['β_w = 0 significa que todos los sitios tienen exactamente los mismos taxones. β_w = 1 significa que la riqueza total es el doble de la media por sitio. Cuanto mayor, más se sustituyen los taxones de un sitio a otro.',
      'β_w = 0 means every site holds exactly the same taxa. β_w = 1 means the total richness is twice the mean per site. The larger it is, the more taxa replace each other from site to site.'],
    formula: 'β_w = (S_total / S_media) − 1',
    care: ['Depende del número de sitios incluidos, así que no compares β_w entre estudios con distinto número de sitios.',
      'It depends on the number of sites included, so do not compare β_w between studies with different numbers of sites.'],
    ref: 'Whittaker 1960',
  });

  E('nmds', {
    t: ['NMDS y el estrés de Kruskal', 'NMDS and Kruskal stress'],
    what: ['El escalamiento no métrico coloca los sitios en un plano intentando que el <b>orden</b> de las distancias del dibujo reproduzca el orden de las disimilitudes reales. El <b>estrés</b> mide cuánto falla en ese intento.',
      'Non-metric scaling places the sites on a plane trying to make the <b>order</b> of the distances in the drawing reproduce the order of the real dissimilarities. The <b>stress</b> measures how much it fails.'],
    read: ['El estrés es lo que se lee antes que nada: sin él, el mapa no significa nada.',
      'The stress is the first thing to read: without it the map means nothing.'],
    scaleTitle: ['Regla de Kruskal para el estrés 1', "Kruskal's rule for stress 1"],
    scale: [
      S(0, 0.05, ['excelente', 'excellent'], 'good'),
      S(0.05, 0.1, ['bueno', 'good'], 'ok'),
      S(0.1, 0.2, ['utilizable con cautela', 'usable with caution'], 'warn'),
      S(0.2, null, ['no interpretable', 'not interpretable'], 'bad'),
    ],
    care: ['Los cortes son la regla original de su autor, y es una <b>convención</b>: el estrés sube con el número de sitios, así que un 0.15 con 40 sitios es mejor de lo que parece. En un mapa NMDS los ejes <b>no significan nada</b> (no hay «Dim 1» que interpretar) y la escala y la orientación son arbitrarias: solo cuentan las posiciones relativas. El gráfico de Shepard muestra el mismo ajuste punto por punto.',
      'The cuts are the original rule of its author and are a <b>convention</b>: stress rises with the number of sites, so a 0.15 with 40 sites is better than it looks. In an NMDS map the axes <b>mean nothing</b> (there is no "Dim 1" to interpret) and the scale and orientation are arbitrary: only relative positions count. The Shepard plot shows the same fit point by point.'],
    ref: 'Kruskal 1964; Clarke 1993',
  });

  E('pcoa', {
    t: ['Coordenadas principales (PCoA)', 'Principal coordinates (PCoA)'],
    what: ['Coloca los sitios en un plano de forma que las distancias del dibujo se parezcan lo más posible a las disimilitudes reales. Es el equivalente del análisis de componentes principales cuando se parte de una matriz de distancias.',
      'Places the sites on a plane so that the distances in the drawing resemble the real dissimilarities as closely as possible. It is the equivalent of principal component analysis when you start from a distance matrix.'],
    read: ['Aquí los ejes <b>sí</b> tienen porcentaje de varianza explicada, y se leen como en el PCA. Si los dos primeros suman poco, el plano no resume bien la matriz y conviene mirar también el NMDS.',
      'Here the axes <b>do</b> have a percentage of explained variance, read as in PCA. If the first two add up to little, the plane does not summarise the matrix well and it is worth looking at the NMDS too.'],
    care: ['Con disimilitudes no euclídeas (Bray y Curtis, por ejemplo) pueden aparecer <b>valores propios negativos</b>, que no tienen interpretación geométrica; si son grandes, fíate más del NMDS.',
      'With non-Euclidean dissimilarities (Bray and Curtis, for instance) <b>negative eigenvalues</b> can appear, and they have no geometric interpretation; if they are large, trust the NMDS more.'],
    ref: 'Gower 1966; Legendre & Legendre 2012',
  });

  E('singletons', {
    t: ['Únicos (f₁) y dobles (f₂)', 'Singletons (f₁) and doubletons (f₂)'],
    what: ['El número de taxones que aparecen exactamente una vez y exactamente dos veces en el sitio. Son la materia prima de Chao1, de ACE y de la cobertura.',
      'The number of taxa that appear exactly once and exactly twice at the site. They are the raw material of Chao1, ACE and the coverage.'],
    read: ['Muchos únicos significan que el muestreo está lejos de completarse: cada visita nueva sigue trayendo taxones nuevos. Cuando f₁ baja hacia cero, el inventario se acerca a su techo.',
      'Many singletons mean sampling is far from complete: every new visit still brings new taxa. When f₁ falls towards zero the inventory approaches its ceiling.'],
    care: ['En datos de colección, un «único» puede ser una identificación dudosa o un nombre mal escrito en lugar de un taxón raro de verdad. Revisa la lista antes de estimar riqueza.',
      'In collection data a "singleton" can be a doubtful identification or a misspelled name rather than a genuinely rare taxon. Check the list before estimating richness.'],
    ref: 'Chao 1984; Colwell et al. 2012',
  });

  E('rankabundance', {
    t: ['Rango y abundancia, y sus modelos', 'Rank-abundance and its models'],
    what: ['Ordena los taxones del más al menos registrado y dibuja el resultado en escala logarítmica. La <b>forma</b> de la curva resume la estructura de la comunidad.',
      'Orders the taxa from most to least recorded and plots the result on a logarithmic scale. The <b>shape</b> of the curve summarises the community structure.'],
    read: ['Una curva <b>muy inclinada</b> indica dominancia fuerte de unos pocos taxones; una curva <b>plana</b>, un reparto equitativo. Los cuatro modelos ajustados se comparan por AIC: el de menor AIC es el que mejor describe la muestra.',
      'A <b>steep</b> curve indicates strong dominance by a few taxa; a <b>flat</b> one, an even sharing. The four fitted models are compared by AIC: the one with the lowest AIC describes the sample best.'],
    care: ['Que un modelo ajuste bien <b>no demuestra</b> el mecanismo ecológico que lo inspiró: varios procesos distintos producen la misma curva.',
      'A model fitting well <b>does not prove</b> the ecological mechanism that inspired it: several different processes produce the same curve.'],
    ref: 'Whittaker 1960; Preston 1948; Magurran 2004',
  });

  /* =====================================================================
     STEP 9 · distribution modelling
     ===================================================================== */

  E('presenceonly', {
    t: ['Modelar con solo presencias', 'Modelling with presences only'],
    what: ['Tus registros dicen dónde <b>sí</b> se ha visto la especie, pero nunca dónde no está: un sitio sin registros puede estar vacío o simplemente no haberse visitado. Por eso estos modelos no comparan presencias con ausencias reales, sino presencias con una muestra de <b>lo que hay disponible</b> en la región (el fondo). El resultado es una <b>idoneidad relativa</b>: dice qué sitios se parecen más a los que ocupa la especie, no la probabilidad de encontrarla allí.',
      'Your records say where the species <b>has</b> been seen, never where it is absent: a site with no records may be empty or simply never visited. These models therefore do not compare presences with real absences but presences with a sample of <b>what is available</b> in the region (the background). The result is a <b>relative suitability</b>: it says which sites resemble those the species occupies, not the probability of finding it there.'],
    read: ['Un mapa de idoneidad es una hipótesis sobre las <b>condiciones abióticas</b> dentro de la región accesible a la especie. No demuestra que la especie viva ahí ni que pueda llegar.',
      'A suitability map is a hypothesis about the <b>abiotic conditions</b> inside the region accessible to the species. It does not prove the species lives there nor that it can get there.'],
    care: ['Todo lo que se mide después (AUC, TSS, importancia de variables) hereda esta limitación: se evalúa frente a un fondo, no frente a ausencias verificadas.',
      'Everything measured afterwards (AUC, TSS, variable importance) inherits this limitation: it is evaluated against a background, not against verified absences.'],
    ref: 'Elith & Leathwick 2009; Peterson et al. 2011; Renner & Warton 2013',
  });

  E('background', {
    t: ['Fondo y pseudo-ausencias', 'Background and pseudo-absences'],
    what: ['Puntos tomados en la región de estudio que representan <b>las condiciones disponibles</b>. El modelo aprende comparando el ambiente de las presencias con el de esos puntos.',
      'Points taken across the study region that represent <b>the available conditions</b>. The model learns by comparing the environment of the presences with that of those points.'],
    read: ['No son ausencias: un punto de fondo puede caer justo donde vive la especie. El <b>radio R</b> define el área accesible: el fondo se toma solo en celdas a menos de esa distancia de algún registro.',
      'They are not absences: a background point can land exactly where the species lives. The <b>radius R</b> defines the accessible area: the background is taken only in cells within that distance of some record.'],
    care: ['La elección del área de fondo <b>cambia el modelo más que el algoritmo</b>. Un fondo enorme incluye climas que la especie nunca ha podido alcanzar, el modelo distingue fácil y el AUC se infla. Un fondo demasiado pequeño deja sin contraste y el modelo no aprende nada. Ajusta R pensando en la biología de la especie, no en el tamaño del mapa.',
      'The choice of the background area <b>changes the model more than the algorithm does</b>. A huge background includes climates the species could never reach, the model separates them easily and the AUC is inflated. Too small a background leaves no contrast and the model learns nothing. Set R thinking about the biology of the species, not about the size of the map.'],
    ref: 'Phillips et al. 2009; Barve et al. 2011',
  });

  E('auc', {
    t: ['AUC (área bajo la curva ROC)', 'AUC (area under the ROC curve)'],
    what: ['La probabilidad de que el modelo dé <b>más idoneidad a una presencia que a un punto de fondo</b> tomados los dos al azar. No depende de ningún umbral.',
      'The probability that the model gives <b>more suitability to a presence than to a background point</b>, both taken at random. It does not depend on any threshold.'],
    read: ['0.5 es lo que daría tirar una moneda; 1 sería una separación perfecta. Lo que se informa es el AUC <b>de prueba</b> (con los datos que el modelo no vio); si el de entrenamiento es mucho mayor, hay sobreajuste.',
      '0.5 is what a coin toss would give; 1 would be a perfect separation. What is reported is the <b>test</b> AUC (with data the model did not see); if the training one is much higher, there is overfitting.'],
    scaleTitle: ['Escala convencional del AUC', 'Conventional AUC scale'],
    scale: [
      S(0.5, 0.7, ['no mejora al azar / pobre', 'no better than chance / poor'], 'bad'),
      S(0.7, 0.8, ['aceptable', 'acceptable'], 'warn'),
      S(0.8, 0.9, ['bueno', 'good'], 'ok'),
      S(0.9, 1, ['excelente', 'excellent'], 'good'),
    ],
    conv: true,
    care: ['Los cortes son una <b>convención</b> heredada del diagnóstico médico. Y hay un problema de fondo: con extensiones grandes el AUC <b>se infla</b>, porque el modelo solo tiene que distinguir el hábitat de la especie de desiertos y océanos, cosa trivial. Dos modelos con áreas de fondo distintas no tienen AUC comparables. Mira siempre también el TSS, el índice de Boyce y el mapa.',
      'The cuts are a <b>convention</b> inherited from medical diagnosis. And there is a deeper problem: over large extents the AUC is <b>inflated</b>, because the model only has to tell the species habitat from deserts and oceans, which is trivial. Two models with different background areas do not have comparable AUCs. Always look at the TSS, the Boyce index and the map as well.'],
    ref: 'Swets 1988; Fielding & Bell 1997; Lobo et al. 2008',
  });

  E('tss', {
    t: ['TSS (estadístico de habilidad verdadera)', 'TSS (true skill statistic)'],
    what: ['Evalúa el modelo <b>después de convertirlo en presencia/ausencia</b> con un umbral. Combina en un número la capacidad de acertar las presencias y la de acertar los sitios de fondo.',
      'Evaluates the model <b>after turning it into presence/absence</b> with a threshold. It combines into one number the ability to get the presences right and the ability to get the background right.'],
    read: ['Va de −1 a 1; 0 es lo que daría el azar. A diferencia de la kappa, <b>no depende de la prevalencia</b> (de cuántas presencias hay frente a puntos de fondo).',
      'It runs from −1 to 1; 0 is what chance would give. Unlike kappa, it <b>does not depend on prevalence</b> (on how many presences there are against background points).'],
    formula: 'TSS = sensibilidad + especificidad − 1',
    scaleTitle: ['Escala convencional del TSS', 'Conventional TSS scale'],
    scale: [
      S(null, 0.4, ['pobre', 'poor'], 'bad'),
      S(0.4, 0.6, ['aceptable', 'fair'], 'warn'),
      S(0.6, 0.8, ['bueno', 'good'], 'ok'),
      S(0.8, 1, ['muy bueno', 'very good'], 'good'),
    ],
    conv: true,
    care: ['Los cortes son una <b>convención</b> tomada de la escala de la kappa. El TSS depende por completo del umbral elegido: si cambias el umbral en «Mapas de idoneidad», la tabla cambia. La app informa el TSS del umbral que lo maximiza, que es el más favorable posible.',
      'The cuts are a <b>convention</b> borrowed from the kappa scale. The TSS depends entirely on the chosen threshold: if you change the threshold in "Suitability maps", the table changes. The app reports the TSS of the threshold that maximises it, which is the most favourable one possible.'],
    ref: 'Allouche et al. 2006; Landis & Koch 1977',
  });

  E('boyce', {
    t: ['Índice de Boyce continuo', 'Continuous Boyce index'],
    what: ['Evalúa el modelo <b>usando solo las presencias</b>, sin necesidad de ausencias ni de fondo. Comprueba si en las clases de idoneidad alta caen proporcionalmente más presencias que las que cabría esperar por el tamaño de esas clases.',
      'Evaluates the model <b>using presences only</b>, without needing absences or background. It checks whether proportionally more presences fall in the high-suitability classes than the size of those classes would lead you to expect.'],
    read: ['Va de −1 a 1. Es la métrica más honesta para datos de solo presencia, precisamente porque no inventa ausencias.',
      'It runs from −1 to 1. It is the most honest metric for presence-only data, precisely because it does not invent absences.'],
    scaleTitle: ['Escala del índice de Boyce', 'Scale of the Boyce index'],
    scale: [
      S(-1, 0, ['el modelo predice al revés', 'the model predicts backwards'], 'bad'),
      S(0, 0.5, ['poco consistente con las presencias', 'weakly consistent with the presences'], 'warn'),
      S(0.5, 0.8, ['consistente', 'consistent'], 'ok'),
      S(0.8, 1, ['muy consistente', 'very consistent'], 'good'),
    ],
    conv: true,
    care: ['Los cortes intermedios son de <b>lectura</b>; lo único publicado con firmeza es que valores cercanos a 0 indican un modelo indistinguible del azar y los negativos un modelo que predice al contrario. El índice es sensible al número de clases de idoneidad que se usen.',
      'The intermediate cuts are for <b>reading</b>; the only firmly published points are that values near 0 indicate a model indistinguishable from chance and negative ones a model that predicts the opposite. The index is sensitive to the number of suitability classes used.'],
    ref: 'Boyce et al. 2002; Hirzel et al. 2006',
  });

  E('sensitivity', {
    t: ['Sensibilidad', 'Sensitivity'],
    what: ['La proporción de presencias reales que el modelo, ya convertido en mapa binario, clasifica como idóneas. Es la capacidad de <b>no perderse a la especie</b>.',
      'The share of real presences that the model, once turned into a binary map, classifies as suitable. It is the ability <b>not to miss the species</b>.'],
    read: ['Va de 0 a 1. Una sensibilidad de 0.9 quiere decir que 9 de cada 10 registros conocidos caen dentro del área que el modelo declara idónea.',
      'It runs from 0 to 1. A sensitivity of 0.9 means 9 out of every 10 known records fall inside the area the model calls suitable.'],
    care: ['Sube siempre que bajes el umbral, al precio de declarar idónea media región. <b>No se lee sola</b>: mírala junto a la especificidad, porque un modelo que dice «idóneo» en todas partes tiene sensibilidad 1 y no sirve para nada.',
      'It rises whenever you lower the threshold, at the price of calling half the region suitable. <b>It is not read alone</b>: look at it together with the specificity, because a model saying "suitable" everywhere has a sensitivity of 1 and is useless.'],
    ref: 'Fielding & Bell 1997',
  });

  E('specificity', {
    t: ['Especificidad', 'Specificity'],
    what: ['La proporción de puntos de fondo que el modelo clasifica como no idóneos. Es la capacidad de <b>no sobrepredecir</b>.',
      'The share of background points the model classifies as unsuitable. It is the ability <b>not to overpredict</b>.'],
    read: ['Va de 0 a 1 y se mueve al revés que la sensibilidad: subir el umbral gana especificidad y pierde sensibilidad. El umbral de máximo TSS es el que mejor equilibra las dos.',
      'It runs from 0 to 1 and moves the opposite way to sensitivity: raising the threshold gains specificity and loses sensitivity. The maximum-TSS threshold is the one that balances the two best.'],
    care: ['Con solo presencias, los «fallos» que penalizan la especificidad son puntos de fondo, no ausencias comprobadas: algunos pueden ser sitios donde la especie sí está y nadie ha buscado.',
      'With presences only, the "errors" that penalise specificity are background points, not verified absences: some of them may be sites where the species is present and nobody has looked.'],
    ref: 'Fielding & Bell 1997',
  });

  E('omission', {
    t: ['Tasa de omisión (P10)', 'Omission rate (P10)'],
    what: ['La proporción de presencias que quedan <b>fuera</b> del área declarada idónea al usar el umbral del percentil 10. Es la cara opuesta de la sensibilidad.',
      'The share of presences that fall <b>outside</b> the area called suitable when the 10th-percentile threshold is used. It is the opposite face of sensitivity.'],
    read: ['Por construcción, el umbral del percentil 10 deja fuera al 10 % de las presencias de entrenamiento. Si en las presencias de <b>prueba</b> la omisión sale mucho mayor de 0.10, el modelo no está generalizando bien.',
      'By construction the 10th-percentile threshold leaves out 10 % of the training presences. If the omission comes out well above 0.10 on the <b>test</b> presences, the model is not generalising well.'],
    scaleTitle: ['Lectura de la omisión con el umbral P10', 'Reading the omission with the P10 threshold'],
    scale: [
      S(0, 0.1, ['como se esperaba', 'as expected'], 'good'),
      S(0.1, 0.2, ['algo por encima de lo esperado', 'somewhat above expectation'], 'warn'),
      S(0.2, 1, ['muy por encima: el modelo no generaliza', 'well above: the model does not generalise'], 'bad'),
    ],
    conv: true,
    care: ['La referencia 0.10 sale de la propia definición del umbral, no de un estudio: es el valor esperado, no un criterio de calidad. Una omisión alta también puede significar que hay registros mal georreferenciados.',
      'The 0.10 reference comes from the definition of the threshold itself, not from a study: it is the expected value, not a quality criterion. A high omission can also mean some records are badly georeferenced.'],
    ref: 'Pearson et al. 2007; Radosavljevic & Anderson 2014',
  });

  E('thresholds', {
    t: ['Umbrales: convertir idoneidad en presencia/ausencia', 'Thresholds: turning suitability into presence/absence'],
    what: ['Para dibujar un mapa binario hace falta decidir a partir de qué valor de idoneidad se considera «idóneo». Esa decisión <b>no la da el modelo</b>: la tomas tú, y cambia mucho el área resultante.',
      'To draw a binary map you must decide from which suitability value a cell counts as "suitable". That decision <b>does not come from the model</b>: you make it, and it changes the resulting area a lot.'],
    read: ['<b>Máximo TSS</b>: equilibra sensibilidad y especificidad; el más usado para evaluar. <b>Percentil 10</b>: acepta perder el 10 % de las presencias, el más usado para mapas de conservación porque descarta los registros dudosos. <b>Mínima presencia de entrenamiento</b>: no pierde ninguna presencia, da el área más grande y un solo registro erróneo lo arruina. <b>Sensibilidad = especificidad</b>: reparte el error a partes iguales.',
      '<b>Maximum TSS</b>: balances sensitivity and specificity; the most used for evaluation. <b>10th percentile</b>: accepts losing 10 % of the presences, the most used for conservation maps because it discards doubtful records. <b>Minimum training presence</b>: loses no presence, gives the largest area and a single wrong record ruins it. <b>Sensitivity = specificity</b>: shares the error equally.'],
    care: ['El área idónea en km² depende por completo del umbral elegido: <b>siempre hay que decir cuál se usó</b>. Si el objetivo es decidir dónde buscar la especie, un umbral bajo conviene; si es delimitar un área protegida, uno alto.',
      'The suitable area in km² depends entirely on the chosen threshold: <b>you must always say which one you used</b>. If the goal is deciding where to look for the species, a low threshold is better; if it is delimiting a protected area, a high one.'],
    ref: 'Liu et al. 2005; Pearson et al. 2007',
  });

  E('permimportance', {
    t: ['Importancia por permutación', 'Permutation importance'],
    what: ['Mide cuánto empeora el modelo cuando se <b>desordenan al azar</b> los valores de una variable. Si al desordenarla el modelo se hunde, esa variable era importante; si no cambia nada, no lo era.',
      'Measures how much the model worsens when the values of one variable are <b>randomly shuffled</b>. If shuffling it sinks the model, that variable mattered; if nothing changes, it did not.'],
    read: ['Se suele expresar en porcentaje, sumando 100 entre todas las variables. Es comparable entre algoritmos, a diferencia de las medidas internas de cada uno.',
      'It is usually given as a percentage adding up to 100 across the variables. Unlike each algorithm\'s internal measures, it is comparable between algorithms.'],
    care: ['Con variables <b>colineales</b> la importancia se reparte de forma arbitraria entre las gemelas: al desordenar una, la otra sigue dando la misma información y ninguna parece importante. Por eso el paso 6 importa. Además, importancia alta no significa causalidad: puede ser una variable que solo <i>acompaña</i> a la que de verdad limita a la especie.',
      'With <b>collinear</b> variables the importance is shared arbitrarily among the twins: when one is shuffled the other still carries the same information and neither looks important. That is why step 6 matters. And high importance does not mean causation: it may be a variable that merely <i>accompanies</i> the one that really limits the species.'],
    ref: 'Breiman 2001; Phillips et al. 2006',
  });

  E('responsecurves', {
    t: ['Curvas de respuesta', 'Response curves'],
    what: ['Muestran cómo cambia la idoneidad predicha al mover una variable, manteniendo las demás en su valor medio. Es la forma de ver <b>qué ha aprendido el modelo</b> sobre cada variable.',
      'Show how the predicted suitability changes as one variable moves, with the others held at their mean value. It is the way to see <b>what the model has learned</b> about each variable.'],
    read: ['Una curva en <b>campana</b> es la respuesta ecológica esperada: hay un óptimo y la idoneidad cae a los dos lados. Una curva <b>monótona</b> dice que dentro del rango muestreado no se ha alcanzado el límite superior. Una curva con <b>muchos picos y valles</b> es señal de sobreajuste; súbele la regularización a MaxEnt.',
      'A <b>bell-shaped</b> curve is the expected ecological response: there is an optimum and suitability falls on both sides. A <b>monotonic</b> curve says the upper limit was not reached within the sampled range. A curve with <b>many peaks and troughs</b> is a sign of overfitting; raise the regularisation of MaxEnt.'],
    care: ['Fijar las demás variables en su media crea combinaciones ambientales que <b>no existen en la naturaleza</b>, así que la curva es una simplificación. Con variables colineales las curvas se vuelven especialmente difíciles de interpretar.',
      'Holding the other variables at their mean creates environmental combinations that <b>do not exist in nature</b>, so the curve is a simplification. With collinear variables the curves become especially hard to interpret.'],
    ref: 'Elith et al. 2005; Merow et al. 2013',
  });

  E('spatialblocks', {
    t: ['Validación por bloques espaciales', 'Spatial block validation'],
    what: ['En lugar de repartir los registros al azar entre entrenamiento y prueba, parte el mapa en bloques geográficos y deja fuera bloques enteros. El modelo se prueba así en <b>zonas que no vio</b>.',
      'Instead of splitting the records at random between training and test, it cuts the map into geographical blocks and leaves whole blocks out. The model is then tested on <b>areas it never saw</b>.'],
    read: ['Un AUC por bloques es siempre <b>más bajo</b> que uno aleatorio, y esa bajada no es un defecto: es el optimismo que la validación aleatoria estaba escondiendo. Es la validación que hay que reportar si vas a proyectar a otras regiones o a otros climas.',
      'A block AUC is always <b>lower</b> than a random one, and that drop is not a flaw: it is the optimism the random validation was hiding. This is the validation to report if you are going to project to other regions or other climates.'],
    care: ['Los registros cercanos comparten clima, así que una validación aleatoria prueba el modelo con datos casi idénticos a los de entrenamiento y da resultados demasiado buenos. Si tus registros están muy amontonados, puede que algún bloque quede casi vacío y su métrica sea inestable.',
      'Nearby records share climate, so a random validation tests the model with data almost identical to the training set and gives results that are too good. If your records are heavily clumped, a block may end up nearly empty and its metric unstable.'],
    ref: 'Roberts et al. 2017; Valavi et al. 2019',
  });

  E('ensemble', {
    t: ['Ensamble y sus pesos', 'Ensemble and its weights'],
    what: ['Combina las predicciones de varios algoritmos en un solo mapa. Como cada uno se equivoca de una manera distinta, el promedio suele acercarse más a la realidad que cualquiera de ellos por separado.',
      'Combines the predictions of several algorithms into a single map. Since each one errs in a different way, the average usually gets closer to reality than any of them alone.'],
    read: ['<b>Media ponderada</b>: cada modelo pesa según su AUC, TSS o Boyce, así que los mejores mandan. <b>Mediana</b>: más robusta, ignora al modelo que se desvía. <b>Promedio de comité</b>: cada modelo vota sí o no tras aplicar su umbral, y el resultado es el porcentaje de votos, que se lee directamente como <b>acuerdo</b>. El filtro «incluir solo si AUC ≥» deja fuera a los modelos malos: incluirlos estropea el ensamble.',
      '<b>Weighted mean</b>: each model weighs according to its AUC, TSS or Boyce, so the best ones rule. <b>Median</b>: more robust, it ignores the model that strays. <b>Committee average</b>: each model votes yes or no after applying its threshold, and the result is the percentage of votes, read directly as <b>agreement</b>. The "include only if AUC ≥" filter leaves out the bad models: including them spoils the ensemble.'],
    care: ['Un ensamble <b>no corrige</b> un error compartido: si todos los modelos usan los mismos registros sesgados, todos se equivocan igual y el promedio también. La <b>dispersión entre modelos</b> (el mapa de incertidumbre) es tan informativa como la media.',
      'An ensemble <b>does not correct</b> a shared error: if every model uses the same biased records, they all err alike and so does the average. The <b>spread between models</b> (the uncertainty map) is as informative as the mean.'],
    ref: 'Araújo & New 2007; Marmion et al. 2009',
  });

  E('mess', {
    t: ['MESS y extrapolación', 'MESS and extrapolation'],
    what: ['Marca en el mapa las celdas cuyo clima queda <b>fuera del rango</b> con el que se entrenó el modelo. Es la pregunta «¿este modelo ha visto alguna vez condiciones como estas?».',
      'Flags on the map the cells whose climate falls <b>outside the range</b> the model was trained on. It is the question "has this model ever seen conditions like these?".'],
    read: ['Valores <b>negativos</b> señalan condiciones nuevas: al menos una variable está fuera del rango de entrenamiento, y cuanto más negativo, más lejos. Ahí la predicción es una <b>extrapolación</b> y cada algoritmo extrapola de forma distinta e impredecible.',
      '<b>Negative</b> values mark novel conditions: at least one variable lies outside the training range, and the more negative, the further out. There the prediction is an <b>extrapolation</b>, and each algorithm extrapolates differently and unpredictably.'],
    scaleTitle: ['Lectura del MESS', 'Reading the MESS'],
    scale: [
      S(null, 0, ['clima nuevo: no te fíes de la predicción', 'novel climate: do not trust the prediction'], 'bad', '< 0'),
      S(0, null, ['dentro del rango de entrenamiento', 'within the training range'], 'good', '≥ 0'),
    ],
    care: ['Es especialmente importante en las proyecciones al futuro, donde aparecen climas que hoy no existen. Un mapa futuro precioso sobre zonas con MESS muy negativo <b>no significa nada</b>. La app puede rayar esas zonas para que no se te olvide.',
      'It matters especially in future projections, where climates that do not exist today appear. A beautiful future map over areas with a very negative MESS <b>means nothing</b>. The app can hatch those areas so that you do not forget.'],
    ref: 'Elith et al. 2010',
  });

  E('agreement', {
    t: ['Acuerdo entre escenarios', 'Agreement between scenarios'],
    what: ['El porcentaje de modelos climáticos o de escenarios que declaran idónea una misma celda en el futuro.',
      'The percentage of climate models or scenarios that call the same cell suitable in the future.'],
    read: ['Cerca del 100 % los escenarios coinciden y la predicción es <b>robusta</b>; alrededor del 50 % están divididos y esa celda es pura incertidumbre. El mapa de consenso binario aplica el nivel de acuerdo que elijas (66 % por omisión, es decir dos de cada tres).',
      'Near 100 % the scenarios agree and the prediction is <b>robust</b>; around 50 % they are split and that cell is pure uncertainty. The binary consensus map applies the agreement level you choose (66 % by default, that is two out of three).'],
    care: ['Que los escenarios coincidan <b>no los hace acertados</b>: los modelos climáticos comparten supuestos y pueden equivocarse todos en la misma dirección. El acuerdo mide consistencia, no verdad.',
      'Scenarios agreeing <b>does not make them right</b>: climate models share assumptions and can all err in the same direction. Agreement measures consistency, not truth.'],
    ref: 'Araújo & New 2007; IPCC 2021',
  });

  E('rangeshift', {
    t: ['Métricas de cambio del área idónea', 'Range-shift metrics'],
    what: ['Comparan el mapa binario del presente con el del futuro y resumen cuánta superficie se <b>gana</b>, cuánta se <b>pierde</b> y cuánta se <b>mantiene</b>, más el desplazamiento del centro del área.',
      'Compare the present binary map with the future one and summarise how much area is <b>gained</b>, <b>lost</b> and <b>kept</b>, plus the shift of the centre of the range.'],
    read: ['El supuesto de dispersión manda en el resultado: con <b>dispersión ilimitada</b> se cuenta toda celda idónea futura (el mejor caso imaginable); con <b>dispersión nula</b> solo las que ya son idóneas hoy (el peor caso). La verdad está en medio y por eso conviene reportar los dos como una horquilla. Las flechas del centroide indican la <b>dirección</b> del desplazamiento, normalmente hacia los polos o hacia arriba en altitud.',
      'The dispersal assumption governs the result: with <b>unlimited dispersal</b> every future suitable cell counts (the best imaginable case); with <b>no dispersal</b> only those already suitable today (the worst case). The truth lies between, which is why both are worth reporting as a range. The centroid arrows show the <b>direction</b> of the shift, usually poleward or upward in elevation.'],
    care: ['Son métricas de <b>clima</b>, no de población: no tienen en cuenta el uso del suelo, la competencia, el suelo ni el tiempo que tarda un árbol en establecerse. Y el desplazamiento del centroide se calcula sobre el área idónea, que es sensible al umbral.',
      'They are metrics of <b>climate</b>, not of population: they ignore land use, competition, soil and the time a tree takes to establish. And the centroid shift is computed over the suitable area, which is sensitive to the threshold.'],
    ref: 'Thuiller et al. 2005; Elith et al. 2010',
  });

  /* =====================================================================
     STEP 10 · agroclimatic indices and crop suitability
     ===================================================================== */

  E('gdd', {
    t: ['Grados-día de crecimiento', 'Growing degree days'],
    what: ['El <b>calor útil acumulado</b>. Cada día aporta los grados que su temperatura media queda por encima de una temperatura base, por debajo de la cual la planta no crece. Se suman los días del periodo.',
      'The <b>accumulated useful heat</b>. Each day contributes the degrees by which its mean temperature sits above a base temperature, below which the plant does not grow. The days of the period are added up.'],
    read: ['Se mide en °C·día. Cada cultivo y cada variedad necesita una cantidad propia para completar su ciclo, así que el número solo se interpreta <b>frente al requerimiento del cultivo que te interese</b>; no hay una escala universal de «muchos» o «pocos» grados-día.',
      'It is measured in °C·day. Each crop and each variety needs its own amount to complete its cycle, so the number is only interpreted <b>against the requirement of the crop you care about</b>; there is no universal scale of "many" or "few" degree days.'],
    formula: 'GDD = Σ máx(0, T_media − T_base),  con tope superior opcional',
    care: ['La base importa muchísimo: 10 °C es lo habitual en maíz y otros cultivos de verano, pero los cereales de invierno usan 0 o 5 °C. Cambiar la base cambia el mapa entero, así que <b>siempre hay que decir qué base se usó</b>. El tope superior evita contar calor que la planta ya no aprovecha.',
      'The base matters enormously: 10 °C is usual for maize and other summer crops, but winter cereals use 0 or 5 °C. Changing the base changes the whole map, so <b>you must always state the base used</b>. The upper cap avoids counting heat the plant can no longer use.'],
    ref: 'Baskerville & Emin 1969; McMaster & Wilhelm 1997',
  });

  E('frost', {
    t: ['Días con helada y periodo libre de heladas', 'Frost days and frost-free period'],
    what: ['Los <b>días con helada</b> son aquellos cuya temperatura mínima baja del umbral que elijas (0 °C por omisión). El <b>periodo libre de heladas</b> es el número de días seguidos entre la última helada de la primavera y la primera del otoño.',
      '<b>Frost days</b> are those whose minimum temperature falls below the threshold you choose (0 °C by default). The <b>frost-free period</b> is the number of consecutive days between the last spring frost and the first autumn one.'],
    read: ['El periodo libre de heladas es la <b>ventana de cultivo</b> de las especies sensibles al frío. La regla práctica es directa: debe ser <b>más largo que el ciclo del cultivo</b>. Compáralo con la duración del ciclo que aparece en el catálogo de cultivos.',
      'The frost-free period is the <b>growing window</b> for frost-sensitive species. The practical rule is direct: it must be <b>longer than the crop cycle</b>. Compare it with the cycle length listed in the crop catalogue.'],
    care: ['Estos conteos salen de temperaturas <b>medias mensuales</b>, no de series diarias observadas: son valores esperados, no la frecuencia real con que hiela en tu parcela. Una helada en una noche concreta puede arruinar una cosecha aunque el mapa diga que el periodo está libre. Además el frío se acumula en las hondonadas, y una malla de un kilómetro no ve ese detalle.',
      'These counts come from <b>monthly mean</b> temperatures, not from observed daily series: they are expected values, not the real frequency of frost on your plot. A frost on one particular night can ruin a harvest even if the map says the period is frost-free. Cold also pools in hollows, and a one-kilometre grid does not see that detail.'],
    ref: 'FAO 1996',
  });

  E('chilling', {
    t: ['Horas frío acumuladas', 'Accumulated chilling hours'],
    what: ['Las horas del invierno con temperatura por debajo del umbral (7.2 °C por omisión). Los frutales caducifolios necesitan acumular una cantidad mínima para <b>romper la dormancia</b> y brotar y florecer de forma pareja.',
      'The winter hours with a temperature below the threshold (7.2 °C by default). Deciduous fruit trees must accumulate a minimum amount to <b>break dormancy</b> and bud and flower evenly.'],
    read: ['Si el sitio no reúne las horas que pide la variedad, la floración sale escalonada y pobre, y el rendimiento cae. Los rangos de abajo son requerimientos <b>indicativos publicados</b> para frutales caducifolios.',
      'If the site does not gather the hours the variety asks for, flowering comes out staggered and poor, and yield falls. The ranges below are <b>published indicative</b> requirements for deciduous fruit trees.'],
    scaleTitle: ['Requerimientos indicativos de frutales caducifolios', 'Indicative requirements of deciduous fruit trees'],
    scale: [
      S(null, 300, ['solo especies y cultivares de muy bajo requerimiento (higuera, almendro, durazno tropicalizado)', 'only very-low-chill species and cultivars (fig, almond, low-chill peach)'], 'warn', '< 300 h'),
      S(300, 600, ['cultivares de bajo requerimiento de durazno, ciruelo y manzano', 'low-chill cultivars of peach, plum and apple'], 'ok', '300–600 h'),
      S(600, 1000, ['la mayoría de los cultivares comerciales de durazno, ciruelo y peral', 'most commercial peach, plum and pear cultivars'], 'good', '600–1000 h'),
      S(1000, 1500, ['manzano, peral y cerezo de requerimiento medio a alto', 'medium- to high-chill apple, pear and cherry'], 'good', '1000–1500 h'),
      S(1500, null, ['cultivares de requerimiento alto', 'high-chill cultivars'], 'good', '> 1500 h'),
    ],
    conv: true,
    care: ['Los requerimientos son <b>propios de cada variedad</b>, no de la especie: hay duraznos de 100 horas y de 1000. Además hay varios modelos de conteo (horas por debajo de un umbral, unidades Utah, porciones frío) y <b>no dan el mismo número</b>: no mezcles cifras de modelos distintos. El modelo Utah, que la app también puede calcular, resta las horas cálidas, lo que importa mucho en climas templados con inviernos irregulares.',
      'Requirements belong to <b>each variety</b>, not to the species: there are peaches of 100 hours and of 1000. There are also several counting models (hours below a threshold, Utah units, chill portions) and they <b>do not give the same number</b>: do not mix figures from different models. The Utah model, which the app can also compute, subtracts warm hours, which matters a lot in temperate climates with irregular winters.'],
    ref: 'Weinberger 1950; Richardson et al. 1974; Erez 2000',
  });

  E('heatdays', {
    t: ['Días de calor', 'Heat days'],
    what: ['El número de días al año cuya temperatura máxima supera el umbral que fijes (30 y 35 °C por omisión). Marcan el <b>riesgo de estrés térmico</b>.',
      'The number of days a year whose maximum temperature exceeds the threshold you set (30 and 35 °C by default). They mark the <b>heat-stress risk</b>.'],
    read: ['No hay una escala general porque el daño depende del cultivo y, sobre todo, de <b>cuándo</b> ocurre el calor: unos pocos días por encima de 35 °C durante la floración del maíz o del frijol abortan el grano, mientras que los mismos días en reposo vegetativo no hacen nada.',
      'There is no general scale because the damage depends on the crop and, above all, on <b>when</b> the heat occurs: a few days above 35 °C during the flowering of maize or beans abort the grain, while the same days during vegetative rest do nothing.'],
    care: ['El conteo se estima de las medias mensuales corrigiendo con una desviación diaria; es un <b>valor esperado</b>, no una frecuencia observada. Si pones la desviación diaria en 0, el conteo baja mucho y se vuelve más conservador.',
      'The count is estimated from the monthly means corrected with a daily standard deviation; it is an <b>expected value</b>, not an observed frequency. Setting the daily SD to 0 lowers the count a lot and makes it more conservative.'],
    ref: 'FAO 1996',
  });

  E('eto', {
    t: ['Evapotranspiración de referencia (ETo)', 'Reference evapotranspiration (PET)'],
    what: ['El agua que un pasto bien regado perdería por evaporación del suelo y transpiración de las hojas. Es la medida de la <b>demanda de agua de la atmósfera</b>: cuanta más ETo, más sed tiene el aire.',
      'The water a well-watered grass would lose through soil evaporation and leaf transpiration. It is the measure of the <b>atmospheric water demand</b>: the higher the PET, the thirstier the air.'],
    read: ['Se da en mm al año o al día. Los valores indicativos de referencia por tipo de clima son los de abajo.',
      'It is given in mm per year or per day. The indicative reference values by climate type are those below.'],
    marks: [
      { at: '2–4 mm/d', label: ['regiones templadas, húmedas y frescas', 'temperate, humid and cool regions'] },
      { at: '3–5 mm/d', label: ['trópicos y subtrópicos cálidos y húmedos', 'warm humid tropics and subtropics'] },
      { at: '6–9 mm/d', label: ['regiones áridas y semiáridas cálidas', 'warm arid and semi-arid regions'] },
    ],
    care: ['La ETo <b>no es</b> el agua que consume tu cultivo: para eso hay que multiplicarla por el coeficiente de cultivo, que cambia a lo largo del ciclo. El método de Hargreaves y Samani solo usa temperaturas y suele diferir un 10–20 % del método de referencia completo, que necesita radiación, humedad y viento.',
      'PET is <b>not</b> the water your crop consumes: for that it must be multiplied by the crop coefficient, which changes through the cycle. The Hargreaves–Samani method uses temperatures only and usually differs by 10–20 % from the full reference method, which needs radiation, humidity and wind.'],
    ref: 'Hargreaves & Samani 1985; Allen et al. 1998; Thornthwaite 1948',
  });

  E('waterbalance', {
    t: ['Balance hídrico: déficit y excedente', 'Water balance: deficit and surplus'],
    what: ['Va mes a mes restando a la lluvia lo que la atmósfera pide (ETo), usando el suelo como depósito. Cuando el depósito se vacía y sigue faltando agua hay <b>déficit</b>; cuando se llena y la lluvia sobra hay <b>excedente</b>, que escurre o se infiltra.',
      'Goes month by month subtracting from the rainfall what the atmosphere demands (PET), using the soil as a store. When the store empties and water is still short there is a <b>deficit</b>; when it fills and rain is left over there is a <b>surplus</b>, which runs off or infiltrates.'],
    read: ['El déficit anual en mm es el <b>riego teórico</b> que haría falta para que el cultivo no pase sed. El excedente indica riesgo de encharcamiento y lavado de nutrientes, y también recarga de acuíferos.',
      'The annual deficit in mm is the <b>theoretical irrigation</b> needed for the crop not to go thirsty. The surplus indicates risk of waterlogging and nutrient leaching, and also aquifer recharge.'],
    care: ['El déficit <b>anual</b> puede engañar: un sitio con lluvia abundante en verano y sequía en invierno puede tener balance anual positivo y aun así ser imposible para un cultivo de invierno. Mira el reparto mensual. Y el agua aprovechable del suelo que elijas cambia el resultado: un suelo arenoso amortigua mucho menos que uno arcilloso.',
      'The <b>annual</b> deficit can mislead: a site with abundant summer rain and a dry winter can have a positive annual balance and still be impossible for a winter crop. Look at the monthly distribution. And the available soil water you choose changes the result: a sandy soil buffers far less than a clay one.'],
    ref: 'Thornthwaite & Mather 1955; Allen et al. 1998',
  });

  E('lgp', {
    t: ['Longitud del periodo de crecimiento', 'Length of the growing period'],
    what: ['El número de días al año en que hay <b>agua suficiente</b> para que un cultivo crezca: los días con lluvia por encima de la mitad de la evapotranspiración, más el periodo en que la humedad que queda en el suelo permite seguir.',
      'The number of days a year with <b>enough water</b> for a crop to grow: the days with rainfall above half the evapotranspiration, plus the period during which the moisture left in the soil allows growth to continue.'],
    read: ['Es el índice que resume la aptitud agrícola general de un sitio. Las clases de abajo son las de la zonificación agroecológica.',
      'It is the index that summarises the general agricultural suitability of a site. The classes below are those of the agro-ecological zoning.'],
    scaleTitle: ['Clases de la zonificación agroecológica', 'Agro-ecological zoning classes'],
    scale: [
      S(0, 1, ['desértico: no hay periodo de crecimiento', 'desert: no growing period'], 'bad', '0 d'),
      S(1, 75, ['muy corto: solo pastoreo o cultivos de ciclo muy corto', 'very short: grazing or very short-cycle crops only'], 'bad', '1–74 d'),
      S(75, 120, ['corto: un cultivo de ciclo corto', 'short: one short-cycle crop'], 'warn', '75–119 d'),
      S(120, 180, ['intermedio: un cultivo normal de temporal', 'intermediate: one normal rainfed crop'], 'ok', '120–179 d'),
      S(180, 270, ['largo: cultivo seguro, posible un segundo ciclo', 'long: secure crop, a second cycle possible'], 'good', '180–269 d'),
      S(270, 365, ['muy largo: dos cultivos al año', 'very long: two crops a year'], 'good', '270–364 d'),
      S(365, null, ['húmedo todo el año', 'humid all year round'], 'good', '365 d'),
    ],
    care: ['Estas clases son las <b>publicadas</b> por la zonificación agroecológica y se refieren a agricultura de temporal: con riego pierden sentido. El cálculo no tiene en cuenta la temperatura: un sitio de alta montaña puede tener agua todo el año y hacer demasiado frío para cultivar.',
      'These classes are the <b>published</b> ones of the agro-ecological zoning and refer to rainfed agriculture: under irrigation they lose their meaning. The computation ignores temperature: a high-mountain site can have water all year and still be too cold to farm.'],
    ref: 'FAO 1978; FAO 1996',
  });

  E('aridity', {
    t: ['Índice de aridez', 'Aridity index'],
    what: ['La lluvia anual dividida entre la evapotranspiración de referencia anual: cuánta agua llega frente a cuánta pide la atmósfera. Es la medida estándar de la sequedad de un clima.',
      'The annual rainfall divided by the annual reference evapotranspiration: how much water arrives against how much the atmosphere demands. It is the standard measure of how dry a climate is.'],
    read: ['Un valor de 1 significa que llueve exactamente lo que la atmósfera pide. Por debajo de 0.65 la región se considera tierra seca. Las clases de abajo son las publicadas y usadas internacionalmente.',
      'A value of 1 means rainfall matches exactly what the atmosphere demands. Below 0.65 the region is considered drylands. The classes below are the published ones, used internationally.'],
    formula: 'IA = P anual / ETo anual',
    scaleTitle: ['Clases publicadas de aridez', 'Published aridity classes'],
    scale: [
      S(0, 0.05, ['hiperárido', 'hyper-arid'], 'bad'),
      S(0.05, 0.2, ['árido', 'arid'], 'bad'),
      S(0.2, 0.5, ['semiárido', 'semi-arid'], 'warn'),
      S(0.5, 0.65, ['subhúmedo seco', 'dry sub-humid'], 'ok'),
      S(0.65, null, ['húmedo', 'humid'], 'good'),
    ],
    care: ['Es un promedio anual y no dice nada del <b>reparto</b>: un sitio con 600 mm concentrados en dos meses y otro con los mismos 600 mm repartidos tienen el mismo índice y una agricultura completamente distinta. El valor depende además del método de ETo que elijas.',
      'It is an annual average and says nothing about the <b>distribution</b>: a site with 600 mm concentrated in two months and another with the same 600 mm spread out have the same index and completely different farming. The value also depends on the PET method you choose.'],
    ref: 'UNEP 1992; Middleton & Thomas 1997',
  });

  E('cropsuit', {
    t: ['Puntuación de aptitud del cultivo', 'Crop suitability score'],
    what: ['Para cada celda y cada mes posible de siembra se comparan la temperatura media y la lluvia acumulada del ciclo con los rangos absolutos y óptimos del cultivo. Cada comparación da una puntuación de 0 a 1 y se toma la <b>peor de las dos</b>, porque el factor que falta manda.',
      'For every cell and every possible planting month the mean temperature and the accumulated rainfall of the cycle are compared with the crop\'s absolute and optimal ranges. Each comparison gives a score from 0 to 1 and the <b>worse of the two</b> is taken, because the missing factor rules.'],
    read: ['El resultado va de 0 a 1 y se agrupa en las clases de aptitud de abajo. Se conserva el <b>mejor mes de siembra</b> de cada celda, que es lo que dibuja el calendario.',
      'The result runs from 0 to 1 and is grouped into the suitability classes below. The <b>best planting month</b> of each cell is kept, and that is what draws the calendar.'],
    scaleTitle: ['Clases de aptitud', 'Suitability classes'],
    scale: [
      S(0, 0.2, ['no apto', 'not suitable'], 'bad'),
      S(0.2, 0.5, ['marginal', 'marginal'], 'warn'),
      S(0.5, 0.8, ['apto', 'suitable'], 'ok'),
      S(0.8, 1, ['muy apto', 'very suitable'], 'good'),
    ],
    care: ['Es un modelo <b>climático</b> de requerimientos: no sabe nada de suelo, pH, plagas, mercado ni manejo, y supone temporal sin riego. Los parámetros por omisión son rangos <b>indicativos de la especie</b>, no de una variedad: ajústalos en el catálogo a tus materiales antes de concluir nada, y exporta el juego que usaste. Los cortes 0.2, 0.5 y 0.8 corresponden a las clases de aptitud del marco de evaluación de tierras.',
      'It is a <b>climatic</b> requirement model: it knows nothing about soil, pH, pests, market or management, and it assumes rainfed farming. The default parameters are <b>indicative ranges of the species</b>, not of a variety: adjust them in the catalogue to your materials before concluding anything, and export the set you used. The 0.2, 0.5 and 0.8 cuts correspond to the suitability classes of the land-evaluation framework.'],
    ref: 'FAO 1976; FAO 1996; Ramirez-Villegas et al. 2013',
  });

  E('limitfactor', {
    t: ['Factor limitante', 'Limiting factor'],
    what: ['De todas las condiciones que se evalúan, la que <b>más baja</b> la aptitud de esa celda. Es la respuesta a «¿por qué no se puede sembrar aquí?».',
      'Of all the conditions evaluated, the one that <b>lowers</b> the suitability of that cell the most. It answers "why can it not be sown here?".'],
    read: ['No tiene escala, es una categoría. Su valor está en que sugiere la solución: si la limitante es <b>agua insuficiente</b>, el riego lo resuelve; si es <b>helada letal</b> o <b>frío insuficiente</b>, hay que cambiar de variedad o de sitio; si es <b>altitud</b>, el cultivo no es para ahí.',
      'It has no scale, it is a category. Its value is that it suggests the remedy: if the constraint is <b>insufficient water</b>, irrigation solves it; if it is <b>killing frost</b> or <b>insufficient chilling</b>, you must change variety or site; if it is <b>elevation</b>, the crop does not belong there.'],
    care: ['Solo informa de <b>una</b> limitante, la peor. Puede haber otra casi igual de grave justo detrás, así que resolver la primera no siempre vuelve apta la celda.',
      'It reports only <b>one</b> constraint, the worst. There may be another almost as serious right behind it, so fixing the first does not always make the cell suitable.'],
    ref: 'FAO 1976; Ramirez-Villegas et al. 2013',
  });

  E('analogues', {
    t: ['Análogos climáticos', 'Climatic analogues'],
    what: ['Busca en el mapa los sitios cuyo clima <b>más se parece</b> al de un sitio de referencia, midiendo la distancia sobre los índices que elijas, ya estandarizados.',
      'Looks across the map for the sites whose climate <b>most resembles</b> that of a reference site, measuring the distance over the indices you choose, already standardised.'],
    read: ['La similitud se expresa por percentiles: el 100 % es el propio sitio de referencia. Sirve para dos preguntas prácticas: ¿de dónde traigo germoplasma que ya esté adaptado a este clima?, y ¿a qué se parecerá el clima de mi parcela en el futuro?',
      'Similarity is expressed by percentiles: 100 % is the reference site itself. It answers two practical questions: where do I bring germplasm already adapted to this climate from, and what will my plot\'s climate resemble in the future?'],
    care: ['El resultado depende por completo de <b>qué índices incluyas</b>: con temperatura sola salen análogos distintos que añadiendo lluvia y periodo de crecimiento. Y un clima parecido no garantiza que el material se adapte: quedan fuera el fotoperiodo (que depende de la latitud, no del clima), el suelo y las plagas.',
      'The result depends entirely on <b>which indices you include</b>: with temperature alone you get different analogues than by adding rainfall and the growing period. And a similar climate does not guarantee the material will adapt: photoperiod (which depends on latitude, not on climate), soil and pests are left out.'],
    ref: 'Hallegatte et al. 2007; Ramírez-Villegas et al. 2011',
  });

  /* =====================================================================
     rendering
     ===================================================================== */

  const two = a => Array.isArray(a) ? L2(a[0], a[1]) : labHTML(a);
  const num = v => {
    if (v == null) return '';
    const s = String(v);
    return s.startsWith('-') ? '−' + s.slice(1) : s;
  };

  /* the printed range of a band, unless the entry gives its own text */
  function bandRange(b) {
    if (b.txt) return esc(b.txt);
    if (b.from == null && b.to == null) return '';
    if (b.from == null) return '&lt; ' + num(b.to);
    if (b.to == null) return '&gt; ' + num(b.from);
    if (b.from === b.to) return '= ' + num(b.from);
    return num(b.from) + ' – ' + num(b.to);
  }

  /* the widths follow the width of each band, with the open ends given an average share and
     everything clamped so that no band becomes too thin to read */
  function bandWidths(scale) {
    const spans = scale.map(b => (b.from != null && b.to != null && b.to > b.from) ? (b.to - b.from) : null);
    const finite = spans.filter(v => v != null);
    const mean = finite.length ? finite.reduce((s, v) => s + v, 0) / finite.length : 1;
    const raw = spans.map(v => (v == null || v === 0) ? mean : v);
    const m = raw.reduce((s, v) => s + v, 0) / raw.length || 1;
    return raw.map(v => Math.max(0.55, Math.min(2.2, v / m)));
  }

  function scaleHTML(d) {
    if (!d.scale || !d.scale.length) return '';
    const w = bandWidths(d.scale);
    const title = d.scaleTitle ? `<div class="help-lead">${two(d.scaleTitle)}</div>` : '';
    const bands = d.scale.map((b, i) =>
      `<div class="help-band help-t-${b.tone || 'neutral'}" style="flex:${w[i].toFixed(2)} 1 0"><b>${bandRange(b)}</b><span>${two(b.label)}</span></div>`).join('');
    return `<div class="help-scale">${title}<div class="help-bands">${bands}</div></div>`;
  }

  function marksHTML(d) {
    if (!d.marks || !d.marks.length) return '';
    return `<ul class="help-marks">` + d.marks.map(m => `<li><code>${esc(m.at)}</code> — ${two(m.label)}</li>`).join('') + `</ul>`;
  }

  const CONV = ['Esta escala es una convención de lectura de uso común, no una ley estadística.',
    'This scale is a widely used reading convention, not a statistical law.'];

  /* the body of one entry, used both inside a popover and inside the guide */
  function entryBody(d) {
    return `<p>${two(d.what)}</p>` +
      (d.formula ? `<div class="help-formula">${esc(d.formula)}</div>` : '') +
      `<div class="help-lead">${L2('Cómo se lee', 'How to read it')}</div><p>${two(d.read)}</p>` +
      scaleHTML(d) + marksHTML(d) +
      (d.conv ? `<p class="help-conv">${two(CONV)}</p>` : '') +
      (d.care ? `<div class="help-lead">${L2('Cuidado con', 'Watch out for')}</div><p class="help-care">${two(d.care)}</p>` : '') +
      (d.ref ? `<p class="help-ref">${L2('Referencia:', 'Reference:')} ${esc(d.ref)}</p>` : '');
  }

  /* =====================================================================
     the badge and its popover
     ===================================================================== */

  const badgeTitle = d => T('Qué significa: ' + d.t[0], 'What it means: ' + d.t[1]);

  function badge(key) {
    const d = HELP[key];
    if (!d) { console.warn('help: unknown key', key); return ''; }
    const ttl = esc(badgeTitle(d));
    return `<button type="button" class="help-badge" data-help-key="${esc(key)}" aria-expanded="false" aria-haspopup="dialog" title="${ttl}" aria-label="${ttl}">?</button>`;
  }

  let pop = null, openBtn = null, posTimer = null;

  function ensurePop() {
    if (pop) return pop;
    pop = document.createElement('div');
    pop.className = 'help-pop';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('tabindex', '-1');
    pop.style.display = 'none';
    document.body.appendChild(pop);
    return pop;
  }

  function fillPop(key) {
    const d = HELP[key];
    ensurePop().innerHTML =
      `<button type="button" class="help-close" data-help-close="1" title="${esc(T('Cerrar', 'Close'))}" aria-label="${esc(T('Cerrar', 'Close'))}">✕</button>` +
      `<h4>${two(d.t)}</h4>` + entryBody(d);
  }

  /* placed to the right of the badge when there is room, so it never hides the value it explains */
  function placePop() {
    if (!pop || !openBtn || !openBtn.isConnected) return;
    const r = openBtn.getBoundingClientRect(), vw = innerWidth, vh = innerHeight;
    if (vw <= 560) { pop.style.top = ''; pop.style.left = ''; return; }   // the stylesheet turns it into a sheet
    pop.style.top = '0px'; pop.style.left = '0px';
    const w = pop.offsetWidth, h = pop.offsetHeight;
    let left, top;
    if (r.right + 10 + w <= vw - 8) left = r.right + 10;
    else if (r.left - 10 - w >= 8) left = r.left - 10 - w;
    else left = Math.max(8, Math.min(vw - w - 8, r.left - w / 2));
    if (left === r.right + 10 || left === r.left - 10 - w) top = r.top - 6;
    else top = (r.bottom + 8 + h <= vh - 8) ? r.bottom + 8 : r.top - 8 - h;
    top = Math.max(8, Math.min(vh - h - 8, top));
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }
  const schedulePlace = () => { cancelAnimationFrame(posTimer); posTimer = requestAnimationFrame(placePop); };

  function openPop(btn) {
    const key = btn.dataset.helpKey;
    if (!HELP[key]) return;
    if (openBtn === btn) { closePop(true); return; }
    closePop(false);
    fillPop(key);
    openBtn = btn;
    btn.setAttribute('aria-expanded', 'true');
    pop.style.display = 'block';
    placePop();
    pop.focus({ preventScroll: true });
  }

  function closePop(refocus) {
    if (!pop || pop.style.display === 'none') { openBtn = null; return; }
    pop.style.display = 'none';
    if (openBtn) {
      openBtn.setAttribute('aria-expanded', 'false');
      if (refocus && openBtn.isConnected) openBtn.focus({ preventScroll: true });
    }
    openBtn = null;
  }

  document.addEventListener('click', e => {
    const close = e.target.closest && e.target.closest('[data-help-close]');
    if (close) { e.preventDefault(); closePop(true); return; }
    const b = e.target.closest && e.target.closest('.help-badge');
    if (b) { e.preventDefault(); e.stopPropagation(); openPop(b); return; }
    if (pop && pop.style.display !== 'none' && !(e.target.closest && e.target.closest('.help-pop'))) closePop(false);
  }, true);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && pop && pop.style.display !== 'none') { e.stopPropagation(); closePop(true); }
  });
  addEventListener('resize', schedulePlace);
  addEventListener('scroll', schedulePlace, true);

  /* =====================================================================
     decorating what the blocks already build
     ===================================================================== */

  /* the texts a header or a label can be matched against: the whole text and each language on its own */
  function candidates(node) {
    const out = [(node.textContent || '').trim()];
    node.querySelectorAll('[data-l]').forEach(s => out.push((s.textContent || '').trim()));
    return out.filter(Boolean).map(s => s.toLowerCase());
  }

  function decorate(nodes, map, prefix) {
    const pairs = Object.keys(map).map(k => [k.trim().toLowerCase(), map[k]]);
    nodes.forEach(n => {
      if (n.dataset.helpDone) return;
      const cand = candidates(n);
      const hit = prefix ? pairs.find(([txt]) => cand.some(c => c.startsWith(txt)))
        : pairs.find(([txt]) => cand.includes(txt));
      n.dataset.helpDone = '1';
      if (!hit || !HELP[hit[1]]) return;
      n.insertAdjacentHTML('beforeend', badge(hit[1]));
    });
  }

  function markTable(container, map, prefix) {
    if (typeof container === 'string') container = $(container);
    if (!container) return;
    decorate([...container.querySelectorAll('thead th')], map, prefix);
  }
  function markTiles(container, map, prefix) {
    if (typeof container === 'string') container = $(container);
    if (!container) return;
    decorate([...container.querySelectorAll('.stat-label')], map, prefix);
  }
  /* every <span data-help="key"> written in the page becomes a badge */
  function hydrate(root) {
    (root || document).querySelectorAll('[data-help]:not([data-help-ready])').forEach(n => {
      const key = n.getAttribute('data-help');
      n.setAttribute('data-help-ready', '1');
      if (HELP[key]) n.innerHTML = badge(key);
    });
  }

  /* =====================================================================
     the collapsible interpretation guide
     ===================================================================== */

  const GUIDES = {};

  function panel(keys, title) {
    const id = 'helpGuideAcc' + (panel._n = (panel._n || 0) + 1);
    GUIDES[id] = keys.filter(k => (k && k.h) || HELP[k]);
    return `<details class="acc help-guide" id="${id}">` +
      `<summary>${title ? two(title) : L2('📖 Guía de interpretación de este paso', '📖 Interpretation guide for this step')}</summary>` +
      `<div class="acc-body"><p class="hint">${L2('Qué mide cada número, en qué escala se lee y qué error es el más común. Las escalas marcadas como convención son costumbres de lectura, no leyes.',
        'What each number measures, on what scale it is read and which mistake is the most common. The scales marked as a convention are reading habits, not laws.')}</p><div class="help-guide-grid"></div></div></details>`;
  }

  /* the body of a guide is written the first time it is opened, never at load */
  function fillGuide(det) {
    const box = det.querySelector('.help-guide-grid');
    if (!box || box.dataset.filled) return;
    box.dataset.filled = '1';
    box.innerHTML = (GUIDES[det.id] || []).map(k => {
      if (k && k.h) return `<h3 style="margin:16px 0 2px">${two(k.h)}</h3>`;
      const d = HELP[k];
      return `<div class="help-entry"><h4>${two(d.t)}</h4>${entryBody(d)}</div>`;
    }).join('');
  }
  document.addEventListener('toggle', e => {
    if (e.target.classList && e.target.classList.contains('help-guide') && e.target.open) fillGuide(e.target);
  }, true);

  /* =====================================================================
     the plain-language box at the top of each step
     ===================================================================== */

  const H = (es, en) => ({ h: [es, en] });

  const INTRO = {
    6: [['<p><b>Para qué es este paso.</b> Las 19 variables bioclimáticas se calculan todas de la misma temperatura y la misma lluvia, así que muchas dicen casi lo mismo. Aquí se ve cuáles se repiten entre sí.</p><p class="help-intro-q"><b>Qué decides aquí:</b> con qué puñado de variables vas a trabajar en los pasos 7, 8 y 9. Quédate con las que aporten información distinta y con las que tengan sentido para tu especie, aunque estén correlacionadas.</p>',
      '<p><b>What this step is for.</b> The 19 bioclimatic variables are all computed from the same temperature and the same rainfall, so many of them say nearly the same thing. Here you see which ones repeat each other.</p><p class="help-intro-q"><b>What you decide here:</b> which handful of variables you will work with in steps 7, 8 and 9. Keep the ones that add different information and the ones that make sense for your species, even if they are correlated.</p>']],
    7: [['<p><b>Para qué es este paso.</b> Describe, variable por variable, el ambiente donde se ha registrado tu especie: dónde está el centro, cuánto se dispersa y qué forma tiene la distribución.</p><p class="help-intro-q"><b>Qué decides aquí:</b> si tus datos tienen valores raros que conviene revisar, si una variable es tan asimétrica que la media engaña, y si necesitas transformarla para alguna prueba posterior. Los modelos de los pasos 8 y 9 <b>no</b> exigen normalidad.</p>',
      '<p><b>What this step is for.</b> It describes, variable by variable, the environment where your species has been recorded: where the centre lies, how much it spreads and what shape the distribution has.</p><p class="help-intro-q"><b>What you decide here:</b> whether your data hold odd values worth checking, whether a variable is so skewed that the mean misleads, and whether you need to transform it for some later test. The models of steps 8 and 9 do <b>not</b> require normality.</p>']],
    8: [['<p><b>Para qué es este paso.</b> En lugar de mirar las variables de una en una, las mira todas juntas: resume el ambiente en unos pocos ejes, busca si tus registros forman grupos, mide el área de distribución y la amplitud del nicho, y describe la diversidad de taxones.</p><p class="help-intro-q"><b>Qué decides aquí:</b> si tu especie ocupa un ambiente homogéneo o se reparte en varios grupos ecológicos distintos, qué tan amplio es su nicho y qué tan grande y fragmentada es su distribución.</p>',
      '<p><b>What this step is for.</b> Instead of looking at the variables one at a time, it looks at all of them together: it summarises the environment in a few axes, checks whether your records form groups, measures range size and niche breadth, and describes the diversity of taxa.</p><p class="help-intro-q"><b>What you decide here:</b> whether your species occupies a homogeneous environment or splits into several distinct ecological groups, how broad its niche is and how large and fragmented its range is.</p>']],
    9: [['<p><b>Para qué es este paso.</b> Aprende la relación entre los lugares donde se ha registrado tu especie y el clima de esos lugares, y usa esa relación para pintar en todo el mapa qué tan parecido es cada sitio a los que ocupa.</p><p class="help-intro-q"><b>Qué decides aquí:</b> qué algoritmos usar, cómo validarlos, dónde se puede esperar encontrar a la especie y cómo cambiaría esa zona con el clima futuro. El mapa dice <b>idoneidad ambiental</b>, no probabilidad de encontrarla.</p>',
      '<p><b>What this step is for.</b> It learns the relationship between the places where your species has been recorded and the climate of those places, and uses it to paint across the whole map how similar each site is to the ones it occupies.</p><p class="help-intro-q"><b>What you decide here:</b> which algorithms to use, how to validate them, where the species can be expected and how that area would change under future climate. The map shows <b>environmental suitability</b>, not the probability of finding it.</p>']],
    10: [['<p><b>Para qué es este paso.</b> Describe el clima de la región desde el punto de vista agrícola: calor acumulado, heladas, horas frío, agua disponible y cuánto dura el periodo en que se puede cultivar. Con eso calcula dónde y cuándo se podría sembrar un cultivo.</p><p class="help-intro-q"><b>Qué decides aquí:</b> qué cultivo y qué fecha de siembra convienen en cada sitio, y qué factor es el que limita. <b>No trata de la especie de los pasos anteriores</b>, sino del clima agrícola de la misma región.</p>',
      '<p><b>What this step is for.</b> It describes the climate of the region from a farming point of view: accumulated heat, frost, chilling hours, available water and how long the period in which crops can grow lasts. With that it computes where and when a crop could be sown.</p><p class="help-intro-q"><b>What you decide here:</b> which crop and which planting date suit each site, and which factor is the limiting one. <b>It is not about the species of the previous steps</b>, but about the farming climate of the same region.</p>']],
  };

  const GUIDE_KEYS = {
    6: ['pearson', 'spearman', 'r2', 'vif', 'collinearity', 'corrSelection'],
    7: [H('Resumen numérico', 'Numerical summary'), 'mean', 'median', 'sd', 'cv', 'quartiles', 'skewness', 'kurtosis',
      H('Pruebas de normalidad', 'Normality tests'), 'pvalue', 'shapiro', 'dagostino', 'anderson', 'jarquebera', 'ks', 'normalityVerdict', 'transform',
      H('Figuras', 'Figures'), 'boxplot', 'qqplot', 'kde'],
    8: [H('Componentes principales', 'Principal components'), 'pca', 'eigenvalue', 'varexplained', 'loadings', 'cos2', 'contribution', 'corrcircle',
      H('Agrupamiento', 'Clustering'), 'hopkins', 'silhouette', 'dunn', 'elbow', 'gap', 'cophenetic', 'linkage', 'clmethods',
      H('Análisis de correspondencias', 'Correspondence analysis'), 'inertia', 'cadim', 'cadistance',
      H('Área de distribución, patrón y nicho', 'Range, pattern and niche'), 'eoo', 'aoo', 'clarkevans', 'ripley', 'levins', 'schoener', 'hellinger',
      H('Diversidad alfa', 'Alpha diversity'), 'richness', 'shannon', 'simpson', 'hill', 'pielou', 'bergerparker', 'margalef', 'fisheralpha', 'rankabundance',
      H('Qué falta por muestrear', 'What is still unsampled'), 'singletons', 'chao1', 'coverage', 'rarefaction',
      H('Diversidad beta y ordenación', 'Beta diversity and ordination'), 'jaccard', 'sorensen', 'braycurtis', 'morisita', 'betapartition', 'whittakerbeta', 'pcoa', 'nmds'],
    9: [H('El punto de partida', 'The starting point'), 'presenceonly', 'background',
      H('Validación', 'Validation'), 'spatialblocks', 'auc', 'tss', 'boyce', 'sensitivity', 'specificity', 'omission', 'thresholds',
      H('Qué aprendió el modelo', 'What the model learned'), 'permimportance', 'responsecurves', 'ensemble',
      H('El futuro', 'The future'), 'mess', 'agreement', 'rangeshift'],
    10: [H('Índices térmicos', 'Thermal indices'), 'gdd', 'frost', 'chilling', 'heatdays',
      H('Agua', 'Water'), 'eto', 'waterbalance', 'lgp', 'aridity',
      H('Cultivos', 'Crops'), 'cropsuit', 'limitfactor', 'analogues'],
  };

  /* =====================================================================
     where the badges go: the containers the blocks build on their own
     ===================================================================== */

  const WATCH = {
    /* ---- step 6 ---- */
    corrTiles: { tiles: { '|r| máximo entre ellas': 'pearson', 'Max |r| among them': 'pearson', 'VIF máximo': 'vif', 'Max VIF': 'vif' } },
    corrVarTable: { table: { VIF: 'vif', '|r| máx. (con)': 'pearson', 'Max |r| (with)': 'pearson' } },
    corrPairs: { table: { r: 'pearson' } },

    /* ---- step 7 ---- */
    statsDescTable: { table: {
      Media: 'mean', Mean: 'mean', Mediana: 'median', Median: 'median', DE: 'sd', SD: 'sd', 'CV %': 'cv',
      Q1: 'quartiles', Q3: 'quartiles', Asimetría: 'skewness', Skewness: 'skewness', Curtosis: 'kurtosis', Kurtosis: 'kurtosis' } },
    statsNormTable: { table: {
      'Shapiro p': 'shapiro', "D'Agostino p": 'dagostino', 'A-D A²': 'anderson', 'Jarque-Bera p': 'jarquebera', 'KS p': 'ks',
      'Votos normal': 'normalityVerdict', 'Normal votes': 'normalityVerdict', Veredicto: 'normalityVerdict', Verdict: 'normalityVerdict' } },
    statsTransfTable: { table: {
      Transformación: 'transform', Transformation: 'transform', 'Asim. original': 'skewness', 'Original skew.': 'skewness',
      'Shapiro p orig.': 'shapiro', 'Shapiro p transf.': 'shapiro' } },

    /* ---- step 8: principal components ---- */
    pcaSummary: { tiles: { 'Criterio de Kaiser': 'eigenvalue', 'Kaiser criterion': 'eigenvalue', '80% de varianza': 'varexplained', '80% of variance': 'varexplained', 'Var. Dim 1–2': 'varexplained' } },
    pcaEigTable: { table: { 'Valor propio': 'eigenvalue', Eigenvalue: 'eigenvalue', '% varianza': 'varexplained', '% variance': 'varexplained', '% acumulada': 'varexplained', '% cumulative': 'varexplained' } },
    pcaDimDesc: { table: { Correlación: 'loadings', Correlation: 'loadings', 'Contrib. %': 'contribution', 'cos²': 'cos2' } },

    /* ---- step 8: clustering ---- */
    clSummary: { tiles: { 'Silueta media': 'silhouette', 'Mean silhouette': 'silhouette', 'Índice de Dunn': 'dunn', 'Dunn index': 'dunn', 'Corr. cofenética': 'cophenetic', 'Cophenetic corr.': 'cophenetic' } },

    /* ---- step 8: correspondence analysis ---- */
    caSummary: { tiles: { 'Dim 1 %': 'cadim', 'Dim 2 %': 'cadim', 'Dim 3 %': 'cadim', p: 'pvalue' } },
    caTable: { table: { Inercia: 'inertia', Inertia: 'inertia', '% varianza': 'cadim', '% variance': 'cadim', '% acumulada': 'cadim', '% cumulative': 'cadim' } },

    /* ---- step 8: ecology ---- */
    ecoSummary: { tiles: { 'Vecino más cercano (R)': 'clarkevans', 'Nearest neighbour (R)': 'clarkevans', 'Patrón espacial': 'clarkevans', 'Spatial pattern': 'clarkevans', EOO: 'eoo' } },
    ecoExtentTiles: { tiles: { 'AOO con celdas de 2 km': 'aoo', 'AOO with 2 km cells': 'aoo', 'AOO con celdas de 10 km': 'aoo', 'AOO with 10 km cells': 'aoo', 'EOO (casco convexo)': 'eoo', 'EOO (convex hull)': 'eoo' } },
    ecoRangeTable: { table: { 'Referencia de la lista roja (solo área)': 'eoo', 'Red-list reference (area only)': 'eoo' } },
    ecoAooTable: { table: { 'Área de ocupación': 'aoo', 'Area of occupancy': 'aoo' } },
    ecoBreadthTable: { table: { 'B de Levins': 'levins', "Levins' B": 'levins', 'B estand. (0–1)': 'levins', 'Std. B (0–1)': 'levins', Amplitud: 'levins', Breadth: 'levins' } },
    ecoOverlapTable: { table: { 'Schoener D': 'schoener', 'Hellinger I': 'hellinger' } },
    ecoTaxonMetricsTable: { table: {
      'EOO (km²)': 'eoo', 'AOO 2 km (km²)': 'aoo', 'Vecino más cercano (R)': 'clarkevans', 'Nearest neighbour (R)': 'clarkevans',
      'Patrón espacial': 'clarkevans', 'Spatial pattern': 'clarkevans', 'Amplitud de nicho (0–1)': 'levins', 'Niche breadth (0–1)': 'levins' } },

    /* ---- step 8: diversity ---- */
    divAlphaTiles: { tiles: {
      'S observada (conjunto)': 'richness', 'Observed S (whole set)': 'richness', 'H′ del conjunto': 'shannon', 'Whole-set H′': 'shannon',
      '1 − D del conjunto': 'simpson', 'Whole-set 1 − D': 'simpson', 'Chao1 corregido': 'chao1', 'Chao1 bias-corrected': 'chao1',
      'Cobertura de muestra': 'coverage', 'Sample coverage': 'coverage' } },
    divAlphaTable: { table: {
      'S observada': 'richness', 'Observed S': 'richness', 'Únicos f₁': 'singletons', 'Singletons f₁': 'singletons',
      'Dobles f₂': 'singletons', 'Doubletons f₂': 'singletons', 'H′ de Shannon': 'shannon', "Shannon's H′": 'shannon',
      'J′ de Pielou': 'pielou', "Pielou's J′": 'pielou', 'D de Simpson (Σp²)': 'simpson', "Simpson's D (Σp²)": 'simpson',
      '1 − D': 'simpson', '1/D': 'simpson', 'Hill q = 0': 'hill', 'Hill q = 1': 'hill', 'Hill q = 2': 'hill',
      'Dominancia de Berger y Parker': 'bergerparker', 'Berger and Parker dominance': 'bergerparker',
      'Riqueza de Margalef': 'margalef', 'Margalef richness': 'margalef', 'Riqueza de Menhinick': 'margalef', 'Menhinick richness': 'margalef',
      'α de la serie logarítmica': 'fisheralpha', 'Log-series α': 'fisheralpha',
      'Cobertura de muestra': 'coverage', 'Sample coverage': 'coverage',
      'Chao1 clásico': 'chao1', 'Chao1 classic': 'chao1', 'Chao1 corregido': 'chao1', 'Chao1 bias-corrected': 'chao1',
      'EE de Chao1': 'chao1', 'SE of Chao1': 'chao1', 'IC 95 % de Chao1': 'chao1', '95 % CI of Chao1': 'chao1',
      ACE: 'chao1', 'Navaja de 1.er orden': 'chao1', 'First-order jackknife': 'chao1', 'Navaja de 2.º orden': 'chao1', 'Second-order jackknife': 'chao1' } },
    divBetaTiles: { tiles: {
      β_sor: 'sorensen', 'β_sim (recambio)': 'betapartition', 'β_sim (turnover)': 'betapartition',
      'β_sne (anidamiento)': 'betapartition', 'β_sne (nestedness)': 'betapartition',
      'β_w de Whittaker': 'whittakerbeta', "Whittaker's β_w": 'whittakerbeta' } },
    divCoverTable: { table: {
      'S observada': 'richness', 'Observed S': 'richness',
      'Cobertura con todos sus registros': 'coverage', 'Coverage with all its records': 'coverage',
      'S esperada a esa cobertura': 'rarefaction', 'Expected S at that coverage': 'rarefaction' } },

    /* ---- step 9 ---- */
    sdmPrepSummary: { tiles: { 'Presencias usadas': 'presenceonly', 'Presences used': 'presenceonly', 'Puntos de fondo': 'background', 'Background points': 'background' } },
    sdmMetricsTable: { table: {
      'AUC prueba': 'auc', 'Test AUC': 'auc', 'AUC entren.': 'auc', 'Train AUC': 'auc', TSS: 'tss',
      'Sens.': 'sensitivity', 'Espec.': 'specificity', 'Spec.': 'specificity', Boyce: 'boyce',
      'Omisión (P10)': 'omission', 'Omission (P10)': 'omission', 'Umbral máx-TSS': 'thresholds', 'Max-TSS threshold': 'thresholds' } },
    sdmAreaTable: { table: { Umbral: 'thresholds', Threshold: 'thresholds' } },

    /* ---- step 10 ---- */
    agIdxSummary: { tiles: {
      'Grados-día (año)': 'gdd', 'Degree days (year)': 'gdd', 'ETo anual': 'eto', 'Annual PET': 'eto',
      'Índice de aridez': 'aridity', 'Aridity index': 'aridity', 'Periodo de crecimiento': 'lgp', 'Growing period': 'lgp',
      'Días con helada': 'frost', 'Frost days': 'frost', 'Horas frío': 'chilling', 'Chilling hours': 'chilling' } },
    agCropSummary: { tiles: {
      'Superficie apta (≥ 0.5)': 'cropsuit', 'Suitable area (≥ 0.5)': 'cropsuit', 'Aptitud media': 'cropsuit', 'Mean suitability': 'cropsuit',
      'Mejor mes de siembra': 'cropsuit', 'Best planting month': 'cropsuit', 'Limitante principal': 'limitfactor', 'Main constraint': 'limitfactor' } },
    agClassTable: { table: { 'Clase de aptitud': 'cropsuit', 'Suitability class': 'cropsuit' } },
    agLimitTable: { table: { 'Factor limitante': 'limitfactor', 'Limiting factor': 'limitfactor' } },
    agMultiTable: { table: { 'Aptitud media': 'cropsuit', 'Mean suitability': 'cropsuit', 'Limitante principal': 'limitfactor', 'Main constraint': 'limitfactor' } },
    /* the headers of this table carry the unit and the option in brackets, so they are matched by prefix */
    agPtsTable: { prefix: true, table: {
      'Grados-día': 'gdd', 'Degree days': 'gdd', 'Grados-día base': 'gdd',
      'Longitud del periodo de crecimiento': 'lgp', 'Length of the growing period': 'lgp',
      'Índice de aridez': 'aridity', 'Aridity index': 'aridity',
      'Clase de aridez': 'aridity', 'Aridity class': 'aridity',
      'Evapotranspiración de referencia': 'eto', 'Reference evapotranspiration': 'eto', 'Annual reference evapotranspiration': 'eto',
      'Déficit hídrico': 'waterbalance', 'Annual water deficit': 'waterbalance', 'Excedente hídrico': 'waterbalance', 'Annual water surplus': 'waterbalance',
      'Evapotranspiración real': 'waterbalance', 'Annual actual evapotranspiration': 'waterbalance',
      'Días con helada': 'frost', 'Frost days': 'frost', 'Periodo libre de heladas': 'frost', 'Frost-free period': 'frost',
      'Horas frío': 'chilling', 'Accumulated chilling': 'chilling', 'Unidades frío': 'chilling', 'Utah-style chill': 'chilling',
      'Días con máxima': 'heatdays', 'Days with maximum': 'heatdays', 'Días de calor': 'heatdays', 'Heat days': 'heatdays' } },
    agFutCropTable: { table: { 'Cambio neto': 'rangeshift', 'Net change': 'rangeshift' } },
    agAnaTable: { table: { Similitud: 'analogues', Similarity: 'analogues' } },
  };

  function runWatches() {
    for (const id in WATCH) {
      const box = $(id);
      if (!box) continue;
      const w = WATCH[id];
      if (w.table) markTable(box, w.table, w.prefix);
      if (w.tiles) markTiles(box, w.tiles, w.prefix);
    }
    hydrate();
  }

  /* =====================================================================
     wiring
     ===================================================================== */

  function build() {
    for (const n of [6, 7, 8, 9, 10]) {
      const intro = $('helpIntro' + n);
      if (intro && !intro.dataset.filled) { intro.dataset.filled = '1'; intro.innerHTML = two(INTRO[n][0]); }
      const guide = $('helpGuide' + n);
      if (guide && !guide.dataset.filled) { guide.dataset.filled = '1'; guide.innerHTML = panel(GUIDE_KEYS[n]); }
    }
    runWatches();
  }

  /* the badges are decorated again whenever a block rewrites a table; the pass is cheap because every
     header already visited carries a flag, and it is debounced so a long run only triggers one sweep */
  let sweep = null;
  const scheduleSweep = () => { clearTimeout(sweep); sweep = setTimeout(runWatches, 160); };

  function start() {
    build();
    const main = document.querySelector('main');
    if (main && window.MutationObserver) new MutationObserver(scheduleSweep).observe(main, { childList: true, subtree: true });
    document.addEventListener('stepchange', scheduleSweep);
  }

  /* on a language change only the texts written with T() have to be refreshed: everything else carries
     both languages and the stylesheet picks one */
  document.addEventListener('langchange', () => {
    document.querySelectorAll('.help-badge[data-help-key]').forEach(b => {
      const d = HELP[b.dataset.helpKey];
      if (!d) return;
      const ttl = badgeTitle(d);
      b.title = ttl; b.setAttribute('aria-label', ttl);
    });
    if (pop) {
      const c = pop.querySelector('[data-help-close]');
      if (c) { c.title = T('Cerrar', 'Close'); c.setAttribute('aria-label', T('Cerrar', 'Close')); }
    }
    scheduleSweep();
  });
  document.addEventListener('themechange', schedulePlace);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  window.help = { HELP, badge, panel, markTable, markTiles, hydrate, entryBody, refresh: runWatches };
})();
