# BioModelling Pro

**Biogeografía y modelado de distribución de especies, en tu navegador.** Descarga registros de presencia de
GBIF, depúralos, extrae variables bioclimáticas, de clima y de suelo, explóralas con estadística y métodos
multivariados y modela la distribución de la especie con diez algoritmos y un ensamble, con mapas, validación,
umbrales, importancia de variables y proyecciones a escenarios climáticos. No hay nada que instalar ni servidor
propio: tus archivos y análisis se quedan en tu equipo.

La interfaz es **bilingüe (español / inglés)** y tiene **tema claro y oscuro**; los dos interruptores están en la
barra superior y la elección se recuerda.

## Cómo abrir

- **Doble clic en `index.html`.** Funciona todo, incluido el ejemplo incluido (*Pinus cembroides*: 2 400
  registros de GBIF y capas de WorldClim y Köppen-Geiger recortadas). Necesitas internet para GBIF, los mapas base y
  el motor de Python (estadística, ML y modelado).
- **En línea:** https://luisangelbg.github.io/BioModellingPro/
- **Servidor local opcional** (por ejemplo, para abrirlo desde una tablet en la misma red): doble clic en
  `Open BioModelling Pro.bat`, o clic derecho en `server.ps1` → *Ejecutar con PowerShell*, y abre
  `http://localhost:9400`.

## Los diez pasos

1. **GBIF o tus datos** — resuelve el nombre científico y descarga los registros, con un filtro opcional de países (México, Centroamérica y Sudamérica, con atajos por región) que se aplica en la propia consulta a GBIF, o sube tu propio archivo (CSV, TXT o Excel con especie, longitud y latitud; acepta grados-minutos-segundos), solo o sumado a los de GBIF. También hay un ejemplo.
2. **Filtrar** — taxón, país, año, tipo de registro, recuadro geográfico dibujable y **estado o región**: trae los 32
   estados de México y asigna el estado de cada registro por sus coordenadas (así completa los que GBIF entrega sin
   estado), con atajos por grupos de estados; también puedes cargar tu propia capa de regiones (municipios, cuencas,
   áreas naturales protegidas) en GeoJSON.
3. **Depurar** — nueve reglas de calidad de coordenadas con reporte antes/después.
4. **Mapa** — puntos, leyenda, escala, rosa de los vientos, retícula y exportación a PNG.
5. **Variables** — 19 variables bioclimáticas, altitud, clima de Köppen-Geiger y suelo (WRB) en cada punto.
6. **Correlación** — matriz de correlación interactiva (Pearson o Spearman) con dendrograma, VIF en vivo de las variables que marcas, selección recomendada poco colineal que respeta las variables que fijes (como BIO1 y BIO12) y visor de pares. Tu elección es la de partida de los pasos siguientes.
7. **Estadística** — descriptiva, histogramas, diagramas de caja y pruebas de normalidad con transformaciones sugeridas.
8. **ML, ecología y diversidad** — además de PCA, agrupamientos y correspondencias: riqueza y sus estimadores, Shannon, Simpson, números de Hill, equidad, rarefacción a igual esfuerzo y a igual cobertura, y diversidad beta con su partición en recambio y anidamiento. También — PCA, agrupamientos, análisis de correspondencias y métricas de área, patrón espacial y nicho.
9. **Modelado SDM** — diez algoritmos (MaxEnt, GLM, GAM, bosques aleatorios, árboles potenciados, SVM, red neuronal,
   Bioclim, Domain, Mahalanobis) y un ensamble; validación por bloques espaciales, AUC, TSS y Boyce; umbrales;
   importancia y curvas de respuesta; mapas; y un banco de trabajo de proyección al futuro: varios escenarios a la vez,
   ensamble entre modelos con su mapa de acuerdo, métricas de desplazamiento del área idónea, supuestos de dispersión,
   refugios climáticos y mapa de extrapolación (MESS).
10. **Adaptación agroclimática** — índices agroclimáticos (grados-día, heladas, horas frío, evapotranspiración de
   referencia, balance hídrico, duración del periodo de crecimiento, aridez), aptitud de cultivos con su calendario de
   siembra óptimo y su factor limitante, comparación entre cultivos, análogos climáticos y cambio de aptitud a futuro.

En los pasos 7, 8, 9 y 10 aún puedes cambiar qué variables entran, incluso variables colineales que el paso 6 sugirió descartar.

La **portada** trae un laboratorio de especie virtual: un paisaje sintético con un nicho conocido, presencias
muestreadas (con o sin sesgo) y tres algoritmos reales cuya estimación se compara con la verdad.

## Ayuda de interpretación

Los números de los pasos 6 a 10 llevan al lado un botón de ayuda. Abre una ficha que dice, en palabras llanas, qué
mide ese valor, cómo se lee, **en qué escala** (una barra de bandas de colores marca dónde cae el valor: |r|, VIF,
AUC, TSS, Boyce, silueta, Hopkins, Shannon, los umbrales de área de las listas rojas, las clases de aptitud…), cuál es
el error más común al usarlo y la referencia de donde sale. Cuando la escala es una convención de lectura y no una ley
estadística, la ficha lo dice; cuando no existe una escala aceptada, también. Al final de cada paso hay una **guía de
interpretación** plegable con todas sus fichas, y al principio una caja que explica para qué sirve el paso y qué
decides en él.

## Mapas

Los mapas de los pasos 4, 5 y 9 se editan en un estudio con pestañas: capas base, textos y fuentes elemento por
elemento, leyenda, escala, rosa de los vientos, retícula, colores y estilos guardados. Al exportar puedes ver una
**vista previa** de la imagen exacta que se va a guardar, **recortar el mapa a México** o a los estados elegidos en el
paso 2 (lo de fuera queda transparente, con el contorno del país dibujado), elegir el encuadre y el tamaño de papel con
su resolución, y guardar en PNG, JPEG, WebP, SVG, **TIFF** y **GeoTIFF** georreferenciado para seguir editando el mapa
en QGIS, ArcGIS o Illustrator.

## Datos

Ver [`datos/LEE-ME.md`](datos/LEE-ME.md). Las capas de ejemplo van incrustadas en `js/example-rasters.js`; para un
estudio real carga los archivos completos de WorldClim (30 arc-seg a 10 arc-min) y de Köppen-Geiger.

> Nota: GBIF entrega primero los registros más recientes. Si limitas la descarga, obtendrás sobre todo registros de
> años recientes. Para un muestreo completo, sube el límite por encima del total que reporta GBIF.

## Cómo citar

Barrera-Guzmán, L. Á., Ramírez-Ojeda, G., Cadena-Iñiguez, J., Cadena-Zamudio, D. A., Cadena-Zamudio, J. D. y
Mojica-Zárate, H. T. (2026). *BioModelling Pro: biogeography and species distribution modelling in the browser*
(versión 1.0.1) [Software]. Zenodo. https://doi.org/10.5281/zenodo.22907825

Ese DOI es el **DOI de concepto**: siempre lleva a la versión más reciente. La versión 1.0.0 tiene además el suyo,
[10.5281/zenodo.22907826](https://doi.org/10.5281/zenodo.22907826), por si necesitas señalar exactamente el código
que usaste.

Licencia GPL v3 o posterior. Componentes de terceros: `vendor/THIRD-PARTY-NOTICES.txt`.
