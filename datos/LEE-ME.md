# Datos para el Bloque B (variables ambientales)

El Bloque A (búsqueda GBIF, filtros, depuración, mapa) **no necesita ninguna descarga**.

## Ya incluido (datos de ejemplo)

Esta carpeta **ya trae** un juego de datos de baja resolución para probar todo el flujo
de inmediato, sin descargar nada:

- `worldclim/wc2.1_10m_bio_1.tif` … `bio_19.tif` + `wc2.1_10m_elev.tif`  (WorldClim 2.1 a
  10 arc-min ≈ 18 km)
- `koppen/Beck_KG_V1_present_0p0083.tif`  (Köppen-Geiger a 1 km, Beck et al. 2018)

En el paso 5 pulsa **«Usar los datos de ejemplo incluidos»** (requiere abrir la app con
`servidor.ps1`). Cuando tengas los de 30 arc-seg, ponlos en `worldclim/` y usa el botón
de seleccionar carpeta en su lugar.

## Para la versión final (30 arc-seg ≈ 1 km)

## 1. WorldClim 2.1 — variables bioclimáticas y altitud

Página oficial: https://www.worldclim.org/data/worldclim21.html

Descarga (resolución 30 arc-segundos, ~1 km — es la que elegiste):

- **Bioclim (19 capas):** https://geodata.ucdavis.edu/climate/worldclim/2_1/base/wc2.1_30s_bio.zip
  (varios GB — es normal que tarde)
- **Altitud:** https://geodata.ucdavis.edu/climate/worldclim/2_1/base/wc2.1_30s_elev.zip

Descomprime cada zip. Deberías obtener archivos como:
`wc2.1_30s_bio_1.tif` … `wc2.1_30s_bio_19.tif` y `wc2.1_30s_elev.tif`.

Colócalos todos en:  `BioSDM/datos/worldclim/`

> Si el 30s resulta muy pesado o lento, puedes usar `2.5m`, `5m` o `10m`
> (misma URL cambiando `30s` por `2.5m`, etc.). La app tiene un selector de resolución.

## 2. Clima de Köppen-Geiger

Beck et al. (2018), mapas a 1 km. Página del dataset (figshare):
https://figshare.com/articles/dataset/Present_and_future_K_ppen-Geiger_climate_classification_maps_at_1-km_resolution/6396959

Descarga el archivo del **presente** (nombre tipo `Beck_KG_V1_present_0p0083.tif`,
pesa pocos MB) y colócalo en:  `BioSDM/datos/koppen/`

La tabla de leyenda (código → clase climática, p. ej. 8 = "Csa: Mediterráneo cálido")
ya viene incluida en la app.

## 3. Tipo de suelo

No hace falta descargar nada: la app consulta la clasificación **WRB** de
SoilGrids (ISRIC) por internet (`rest.isric.org/soilgrids/v2.0/classification/query`).
Cada consulta tarda ~2–3 s en el servidor de ISRIC, así que para cientos de puntos
**es lento** (puede ser 10–20 min). Por eso:

- La app **agrupa** los puntos en celdas (elige la rejilla; ~5 km por defecto).
- Guarda cada respuesta en **caché local del navegador**: si paras y vuelves otro día,
  reanuda sin repetir lo ya consultado.
- El suelo es **opcional**; los bloques C y D funcionan sin él.

Puedes dejar la consulta corriendo en segundo plano mientras haces otra cosa.

## Estructura final esperada

```
BioSDM/
  datos/
    worldclim/
      wc2.1_30s_bio_1.tif  ...  wc2.1_30s_bio_19.tif
      wc2.1_30s_elev.tif
    koppen/
      Beck_KG_V1_present_0p0083.tif
```
