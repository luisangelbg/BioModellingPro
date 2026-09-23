# Datos ráster / Raster data

## Ejemplo incluido / Bundled example

El ejemplo (*Pinus cembroides*) **no necesita esta carpeta**: sus registros van en `js/example-records.js` y sus
capas (WorldClim a 10 arc-min y Köppen-Geiger recortados a lon −122° a −86°, lat 13° a 40°: todo México, la península
de Yucatán incluida) en
`js/example-rasters.js`. Por eso funciona con doble clic en `index.html`. En el paso 1 pulsa **«Usar registros de
ejemplo»** y en el paso 5 **«Usar las capas de ejemplo»**.

*The example needs nothing from this folder: its records are in `js/example-records.js` and its layers (WorldClim at
10 arc-minutes and Köppen-Geiger, cropped to lon −122° to −86°, lat 13° to 40°, which covers the whole of Mexico) in
`js/example-rasters.js`, so it works
by double-clicking `index.html`.*

## Contenido de esta carpeta / What is here

- `koppen/Beck_KG_V1_present_0p0083.tif` — Köppen-Geiger a 1 km (Beck et al. 2018, CC BY 4.0), mundo completo.
  Viaja con el programa porque su licencia lo permite.
- `worldclim/` — **no viene en el repositorio**. Las condiciones de uso de WorldClim permiten el uso académico y
  no comercial, pero **no la redistribución sin permiso previo** (https://www.worldclim.org/about.html), así que
  las capas no se distribuyen aquí: descárgalas con las instrucciones de abajo y déjalas en esa carpeta. El
  programa las lee igual y el repositorio la ignora.

Sirven para probar el selector de carpeta del paso 5 con archivos reales, o para estudios de baja resolución; el
ejemplo incrustado no las necesita.

*`koppen/` ships with the program because CC BY 4.0 allows it. `worldclim/` is not in the repository on purpose:
WorldClim allows academic and non-commercial use but not redistribution without prior permission, so you download
the layers yourself with the instructions below and drop them in that folder. They let you try the folder picker
of step 5 with real files; the bundled example does not need them.*

## Para un estudio real (30 arc-seg ≈ 1 km) / For a real study

### 1. WorldClim 2.1 — variables bioclimáticas y altitud

Página oficial: https://www.worldclim.org/data/worldclim21.html

- **Bioclim (19 capas):** https://geodata.ucdavis.edu/climate/worldclim/2_1/base/wc2.1_30s_bio.zip (varios GB)
- **Altitud:** https://geodata.ucdavis.edu/climate/worldclim/2_1/base/wc2.1_30s_elev.zip

Descomprime cada zip (`wc2.1_30s_bio_1.tif` … `bio_19.tif`, `wc2.1_30s_elev.tif`) y en el paso 5 elige la carpeta o los
archivos con los botones de selección. Puedes usar `2.5m`, `5m` o `10m` cambiando `30s` en la dirección.
*Unzip each file and pick the folder or the files with the selection buttons of step 5. You can use `2.5m`, `5m` or
`10m` by changing `30s` in the address.*

### 2. Köppen-Geiger

Beck et al. (2018), mapas a 1 km:
https://figshare.com/articles/dataset/Present_and_future_K_ppen-Geiger_climate_classification_maps_at_1-km_resolution/6396959

Descarga el archivo del **presente** (`Beck_KG_V1_present_0p0083.tif`). La leyenda (código → clase climática) viene en la app.

### 3. Suelo / Soil

No hay que descargar nada: la app consulta la clasificación **WRB** de SoilGrids (ISRIC) por internet. Cada consulta
tarda unos segundos, así que la app agrupa los puntos en celdas, guarda cada respuesta en la caché local del navegador
(puedes parar y reanudar otro día) y el suelo es **opcional**.
*Nothing to download: the app queries the SoilGrids WRB classification online, groups points into cells and caches each answer locally. Soil is optional.*

### 4. Datos mensuales para el paso agroclimático / Monthly data for the agroclimatic step

El paso 10 (adaptación agroclimática) da todos sus índices cuando tiene los **datos mensuales**: temperatura mínima,
máxima y precipitación de los 12 meses. De https://www.worldclim.org/data/worldclim21.html descarga, en la resolución
que uses, los tres grupos: `wc2.1_<res>_tmin.zip`, `wc2.1_<res>_tmax.zip` y `wc2.1_<res>_prec.zip` (opcionales:
`tavg`, `srad`, `wind`, `vapr`). Al descomprimir quedan 12 archivos por variable (`wc2.1_10m_tmin_01.tif` …
`_12.tif`). Sin ellos el paso funciona con las 19 variables bioclimáticas, pero varios índices quedan como
aproximaciones y otros se desactivan; la app lo indica.

*Step 10 gives all its indices when it has the **monthly** layers: minimum and maximum temperature and precipitation for
the 12 months (`wc2.1_<res>_tmin.zip`, `tmax`, `prec`; optionally `tavg`, `srad`, `wind`, `vapr`). Without them the step
works from the 19 bioclimatic variables, but several indices become approximations and others are disabled; the app says so.*

Para el futuro agroclimático, las proyecciones CMIP6 de WorldClim traen un archivo **de 12 bandas** por variable
(una por mes), p. ej. `wc2.1_10m_tmin_ACCESS-CM2_ssp245_2041-2060.tif`. El paso 10 los lee tal cual.

### 5. Escenarios futuros (opcional, paso 9) / Future scenarios

De WorldClim (proyecciones CMIP6, https://www.worldclim.org/data/cmip6/cmip6climate.html) descarga el archivo **de la
misma resolución** que usas en el presente, p. ej. `wc2.1_10m_bioc_ACCESS-CM2_ssp245_2041-2060.tif` (un solo archivo de
19 bandas). En el paso 9 → «Proyección a otro escenario» selecciónalo tal cual. La altitud no cambia.
*Download the file of the same resolution as your present layers (one 19-band file) and select it in step 9 → «Projection to another scenario».*
