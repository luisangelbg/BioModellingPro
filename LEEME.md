# BioSDM

Herramienta local para análisis biogeográfico y multivariado de especies vegetales.
Todo corre en tu navegador; nada se sube a servidores propios.

## Cómo abrir

**Opción rápida (Bloque A):** doble clic en `index.html`. Se abre en tu navegador.
Necesitas internet para GBIF y los mapas base.

**Opción con servidor local (recomendada, obligatoria para los bloques con Python):**
clic derecho en `servidor.ps1` → *Ejecutar con PowerShell*.
Luego abre `http://localhost:8765` en Chrome o Edge.
Si el puerto está ocupado: `powershell -ExecutionPolicy Bypass -File servidor.ps1 -Port 9000`

## Estado

- **Bloque A — LISTO:** búsqueda en GBIF, filtros por taxón/país/año/tipo de registro,
  recorte geográfico, depuración de coordenadas (duplicados, centroides de país,
  baja precisión, outliers espaciales, issues de GBIF), mapa con leyenda, escala,
  rosa de los vientos y retícula, y exportación a CSV y GeoJSON.
- **Bloque B — LISTO:** paso 5 «Variables». Extracción de las 19 variables Bioclim +
  altitud (WorldClim, GeoTIFF locales leídos con geotiff.js) + clima de Köppen +
  tipo de suelo (SoilGrids, opcional y lento). Tabla puntos × variables, mapa temático
  (graduado o categórico, con polígono de distribución) y exportación CSV/PNG.
  Trae datos de ejemplo a 10 arc-min; ver `datos/LEE-ME.md` para los de 30 arc-seg.
- **Bloque C — LISTO:** paso 6 «Estadística». Cálculo en Python (Pyodide, en el navegador).
  Estadística descriptiva, histogramas+KDE, boxplots, detalle por variable (hist/box/violín/Q-Q),
  comparación entre taxones, pruebas de normalidad (Shapiro, D'Agostino, Anderson-Darling,
  Jarque-Bera, KS) con transformación sugerida, matriz de correlación Pearson/Spearman
  (ordenada por conglomerados), dendrograma de variables, VIF, y rutina que recomienda el
  subconjunto de variables no colineales (CSV descargable).
- **Bloque D — LISTO:** paso 7 «ML + Ecología» (Pyodide). Selección de variables que **permite
  añadir variables colineales** si son importantes para el análisis. PCA completo (sedimentación,
  círculo de correlación, individuos, biplot, contribuciones, cos², descripción de dimensiones).
  Clustering: tendencia (Hopkins + VAT), n.º óptimo (codo/silueta/gap), jerárquico (Ward/completo/
  promedio/simple) con dendrograma y línea de corte, k-means, PAM, k-means jerárquico, difuso,
  mezcla gaussiana, DBSCAN; validación (silueta, Dunn, cofenética), perfiles, mapa de clusters.
  Correspondencias: AC simple, ACM, AFDM/FAMD. Ecología: EOO/AOO (referencia UICN), índice de
  Clark-Evans, amplitud de nicho (B de Levins), curva de acumulación, densidad de nicho en el
  espacio PCA, solapamiento de nicho (Schoener D / Hellinger I), resumen ambiental por taxón.

## Flujo del Bloque A

1. **Buscar en GBIF** — escribe el nombre científico → se resuelve el taxón → descarga
   los registros de presencia (paginados, con barra de progreso).
2. **Filtrar** — facetas con conteos; recorte por rectángulo dibujable en el mini-mapa.
3. **Depurar** — activa/desactiva reglas; cada una muestra cuántos registros marca;
   reporte antes/después.
4. **Mapa** — puntos por taxón o tipo de registro, capas base intercambiables,
   exportación a PNG.

> Nota: GBIF entrega los registros más recientes primero. Si limitas la descarga,
> obtendrás sobre todo registros de años recientes. Para un muestreo completo, sube
> el límite por encima del total que reporta GBIF.
