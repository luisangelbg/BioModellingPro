# BioSDM

Herramienta web para análisis biogeográfico y multivariado de especies vegetales:
descarga y depuración de registros de **GBIF**, extracción de variables **bioclimáticas,
de suelo y de clima**, estadística, y métodos de aprendizaje automático (**PCA,
clustering, análisis de correspondencias**) y de **ecología** — todo dentro del navegador,
sin instalar nada ni enviar datos a ningún servidor propio.

## Usar en línea

👉 **https://luisangelbg.github.io/BioSDM/** *(activo una vez habilitado GitHub Pages en el repositorio — ver más abajo)*

Solo necesitas un navegador moderno (Chrome o Edge recomendados) y conexión a internet.
Funciona igual en computadora, tablet o cualquier dispositivo con esos navegadores.

## Usar en local

Descarga o clona este repositorio y abre `index.html`:

- **Con doble clic** funciona el Bloque A (búsqueda GBIF, filtros, depuración, mapa).
- Para los **datos de ejemplo** del paso 5, la extracción de variables ambientales, y los
  bloques con Python (**estadística, PCA, clustering, ecología**), necesitas abrir la
  carpeta con un servidor local — incluido `servidor.ps1` (Windows/PowerShell):

  ```
  clic derecho en servidor.ps1 → Ejecutar con PowerShell
  ```

  y luego abre `http://localhost:8765` en el navegador.

## El flujo, en 8 pasos

1. **Buscar en GBIF** — resuelve el nombre científico y descarga los registros de presencia.
2. **Filtrar** — por rango taxonómico, país, año, tipo de registro, recorte geográfico.
3. **Depurar** — 9 reglas de limpieza de coordenadas (duplicados, centroides de país, baja
   precisión, outliers espaciales…) con reporte antes/después.
4. **Mapa** — de los registros depurados, con leyenda, escala, rosa de los vientos y retícula.
5. **Variables ambientales** — extrae 19 variables Bioclim + altitud (WorldClim 2.1), clima
   de Köppen-Geiger y tipo de suelo (SoilGrids) en cada punto; mapa temático.
6. **Estadística** — descriptiva, histogramas/boxplots/violín/Q-Q, pruebas de normalidad,
   correlación (Pearson/Spearman) y colinealidad (VIF), con recomendación de qué variables
   conservar.
7. **ML + Ecología** — PCA, clustering (jerárquico, k-means, PAM, difuso, mezcla gaussiana,
   DBSCAN), análisis de correspondencias (AC/ACM/AFM) y métricas ecológicas (área de
   distribución, patrón espacial, amplitud y solapamiento de nicho).

8. **Modelado de distribución de especies (SDM)** — ajusta y valida modelos de idoneidad
   del hábitat, los combina en un ensamble y proyecta mapas (ver abajo).

En los pasos 7 y 8 puedes elegir libremente qué variables entran al análisis — incluso
variables colineales que el paso 6 marcó para descartar, si consideras que son
ecológicamente relevantes.

### Paso 8 · Modelado de distribución de especies

- **Algoritmos (10):** MaxEnt, GLM, GAM, Random Forest, BRT (boosting), SVM, red neuronal,
  Bioclim, Domain y Mahalanobis, más un **ensamble** (media ponderada, mediana o comité de votos,
  con pesos por AUC, TSS o Boyce).
- **MaxEnt** se implementa al estilo del paquete R *maxnet* (Phillips et al. 2017): regresión
  logística penalizada L1 sobre características lineales, cuadráticas, de producto y de bisagra,
  con las constantes de regularización de maxnet y salida *cloglog*. Es estadísticamente
  equivalente a MaxEnt (Renner & Warton 2013), pero **no idéntica** al programa Java (que no puede
  ejecutarse en un navegador). Incluye exploración de clases de características y regularización
  con validación cruzada y AICc (estilo ENMeval).
- **Datos:** presencias (una por celda), fondo muestreado en el área accesible (radio en km
  alrededor de los registros), predictoras elegibles (por defecto las no colineales del paso 6).
- **Validación:** bloques espaciales (ENMeval), pliegues aleatorios o retención 70/30. Métricas:
  AUC, TSS, índice continuo de Boyce, sensibilidad/especificidad y omisión; umbrales (máx. TSS,
  percentil 10, mínima presencia, sens = espec). Random Forest y Domain usan predicciones
  *out-of-bag* / «dejando uno fuera» para no sobreestimar el ajuste de entrenamiento.
- **Variables:** importancia por permutación (en los datos de prueba) y curvas de respuesta.
- **Mapas:** idoneidad continua, presencia/ausencia por umbral e incertidumbre entre modelos,
  con área idónea en km². Exportación a PNG, malla ASCII y GeoTIFF (Float32, EPSG:4326).
- **Proyección a otros escenarios** (p. ej. WorldClim futuro CMIP6, archivo de 19 bandas o
  capas `bio_N` sueltas): mapas de ganancia/pérdida de área idónea y mapa de extrapolación
  **MESS** (Elith et al. 2010) que señala dónde el clima no tiene análogo en el área de calibración.

Referencias: Phillips et al. 2017 *Ecography* (maxnet); Renner & Warton 2013 *Biometrics*
(equivalencia MaxEnt–proceso de Poisson); Elith et al. 2011 *Divers Distrib*; Muscarella et al. 2014
*Methods Ecol Evol* (ENMeval); Valavi et al. 2021 *Ecography* (Random Forest con submuestreo) y
2022 *Ecol Monogr* (comparación de métodos con solo presencias); Allouche et al. 2006 *J Appl Ecol*
(TSS); Hirzel et al. 2006 *Ecol Modell* (Boyce); Elith et al. 2010 *Methods Ecol Evol* (MESS).

## Datos y créditos

Esta herramienta consulta o usa datos de:

- **[GBIF](https://www.gbif.org)** — registros de ocurrencia de especies (API pública).
- **[WorldClim 2.1](https://www.worldclim.org)** (Fick & Hijmans, 2017) — variables
  bioclimáticas y altitud.
- **Köppen-Geiger** (Beck et al., 2018, *Scientific Data*) — clasificación climática,
  CC BY 4.0.
- **[SoilGrids](https://soilgrids.org)** (ISRIC) — clasificación de suelo WRB.

El repositorio incluye una muestra de estos rásters a baja resolución (WorldClim a
10 arc-min y Köppen a 1 km, carpeta `datos/`) para poder probar el flujo completo de
inmediato. Para un análisis real, sustitúyelos por WorldClim a 30 arc-seg siguiendo
las instrucciones de [`datos/LEE-ME.md`](datos/LEE-ME.md).

## Privacidad y arquitectura

Todo el procesamiento ocurre **en tu navegador**: los archivos GeoTIFF se leen
localmente y la estadística/ML corre en Python vía [Pyodide](https://pyodide.org)
(WebAssembly). Las únicas llamadas de red son a las APIs públicas de GBIF y SoilGrids,
y a CDNs para cargar las librerías (Leaflet, geotiff.js, Pyodide). No hay backend propio
ni base de datos: nada de lo que hagas se guarda ni se comparte más allá de tu equipo.

## Estructura

```
index.html          shell de la aplicación (7 pasos)
css/style.css        estilos
js/                  lógica de cada bloque (ver comentarios en cada archivo)
datos/               datos ráster de ejemplo + instrucciones para los definitivos
servidor.ps1         servidor estático local (PowerShell), necesario para los bloques con Python
```
