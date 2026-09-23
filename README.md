# BioModelling Pro

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.22907825.svg)](https://doi.org/10.5281/zenodo.22907825)

**Biogeography and species distribution modelling, in your browser.** Download presence records
from GBIF, clean them, extract bioclimatic, climate and soil variables, explore them with statistics
and multivariate methods, and model the species distribution with ten algorithms and an ensemble —
with maps, validation, thresholds, variable importance and projections to climate scenarios.
Nothing to install, no account, no server of our own: your files and analyses stay on your computer.

The interface is **bilingual (Spanish / English)** and has **light and dark themes**. Both switches are in the
top bar; the choice is remembered.

## Use it online

👉 **https://luisangelbg.github.io/BioModellingPro/**

You only need a modern browser (Chrome or Edge recommended) and an internet connection for GBIF, the base
maps and the Python engine.

## Use it locally

Download or clone the repository and **double-click `index.html`**. Everything works from `file://`, including
the example records (*Pinus cembroides*, 2,400 records from GBIF). The **climate layers you download once**:
WorldClim does not allow them to be redistributed, so they do not travel with the program —
[`datos/LEE-ME.md`](datos/LEE-ME.md) says where to get them and step 5 reads them from wherever you keep them.
Köppen-Geiger is bundled. To serve the folder on your network, run `Open BioModelling Pro.bat` (Windows) or
`server.ps1` and open `http://localhost:9400`.

## The workflow, in ten steps

| # | Step | What it does |
|---|------|--------------|
| 1 | **GBIF or your own data** | Resolves the scientific name and downloads every record with coordinates —optionally restricted to the countries you tick, with one-click shortcuts for Mexico, Central America and South America— or loads your own file (CSV, TXT or Excel with species, longitude and latitude; DMS accepted), alone or added to the GBIF records. A bundled example is available. |
| 2 | **Filter** | By taxon, country, year, record type, a bounding box you can draw, and **state or region**: the 32 states of Mexico come bundled and the state of each record is assigned from its coordinates (which completes the records GBIF delivers without one), with shortcuts by group of states; you can also load your own region layer (municipalities, watersheds, protected areas) as GeoJSON. |
| 3 | **Clean** | Nine coordinate-quality rules (duplicates, impossible values, country centroids, low precision, outliers…) with a before/after report. |
| 4 | **Map** | Publication-ready map: base layers, legend, north arrow, scale bar, graticule, PNG export. |
| 5 | **Variables** | 19 bioclimatic variables and elevation (WorldClim 2.1), Köppen-Geiger climate and WRB soil type (SoilGrids) at every point; thematic map. |
| 6 | **Correlation** | Interactive Pearson / Spearman correlation matrix with dendrogram, live VIF of the variables you tick, a recommended low-collinearity selection that respects the variables you pin (for example BIO1 and BIO12) and a pair viewer. Your choice becomes the default of the next steps. |
| 7 | **Statistics** | Descriptive statistics, histograms, box plots and normality tests with suggested transformations. |
| 8 | **ML, ecology and diversity** | PCA, clustering (hierarchical, k-means, PAM, fuzzy, Gaussian mixture, DBSCAN), correspondence analysis, metrics of range area, spatial pattern, niche breadth and overlap, and species diversity: richness and its estimators, Shannon, Simpson, Hill numbers, evenness, rarefaction at equal effort and coverage, and beta diversity with its turnover / nestedness partition and ordination of sites. |
| 9 | **SDM modelling** | Ten algorithms plus an ensemble, spatial cross-validation, thresholds, variable importance, response curves, maps, and a future-projection workbench (many scenarios, model ensemble and agreement, range-shift metrics, dispersal assumptions, refugia). |
| 10 | **Agroclimatic adaptation** | Agroclimatic indices (growing degree days, frost, chilling hours, reference evapotranspiration, water balance, length of growing period, aridity), crop suitability with its optimal planting calendar and limiting factor, crop comparison, climatic analogues, and the change in suitability under future climate. |

In steps 7, 8, 9 and 10 you can still change which variables enter the analysis — even collinear ones that step 6 flagged, when you
consider them ecologically important.

The home page includes a **virtual-species lab**: a synthetic landscape with a niche you know, sampled presences
(with or without sampling bias) and three real algorithms whose estimate is compared with the truth.

### Interpretation help

Every number in steps 6 to 10 carries a help button. It opens a card that says, in plain words, what the value
measures, how to read it, **on which scale** (a bar of coloured bands shows where the value falls: |r|, VIF, AUC, TSS,
Boyce, silhouette, Hopkins, Shannon, the red-list area thresholds, the land suitability classes…), the mistake most
often made with it, and the reference it comes from. When the scale is a reading convention rather than a statistical
law the card says so, and when no accepted scale exists it says that too. Each step ends with a collapsible
**interpretation guide** holding all of its cards, and opens with a box explaining what the step is for and what you
decide in it.

### Map export

The maps of steps 4, 5 and 9 are edited in a studio with tabs (base layers, text and fonts per element, legend, scale
bar, north arrow, graticule, colours, saved styles). On export you can see a **preview** of the exact image that will
be written, **clip the map to the country** or to the states chosen in step 2 (everything outside becomes transparent,
with the outline of the country drawn), choose the framing and the paper size with its resolution, and save as PNG,
JPEG, WebP, SVG, **TIFF** and georeferenced **GeoTIFF** for further editing in QGIS, ArcGIS or Illustrator.

### Step 9 · Species distribution modelling

- **Algorithms (10):** MaxEnt-style penalised logistic model (cloglog output), GLM, GAM, random forest, boosted
  regression trees, support vector machine, neural network, Bioclim envelope, Domain and Mahalanobis distance, plus an
  **ensemble** (weighted mean, median or vote committee; weights by AUC, TSS or Boyce).
- **MaxEnt-style model:** L1-penalised logistic regression on linear, quadratic, product and hinge features, with
  cloglog output. It is statistically equivalent to maximum-entropy modelling (Renner & Warton 2013).
- **Data:** one presence per cell, background sampled from the accessible area, predictors you choose. The map extent can be the box of the records plus a margin, a whole country or region (for example all of Mexico, Yucatán peninsula included) or custom coordinates; the model is projected over all of it.
- **Validation:** spatial blocks, random folds or a 70/30 hold-out; AUC, TSS, continuous Boyce index, sensitivity,
  specificity and omission; thresholds (max TSS, 10th percentile, minimum presence, sensitivity = specificity).
  Random forest and Domain use out-of-bag / leave-one-out predictions so the training fit is not overstated.
- **Variables:** permutation importance on the test data and response curves.
- **Maps:** continuous suitability, threshold presence/absence and between-model uncertainty, with suitable area in km²;
  export to PNG, ASCII grid and GeoTIFF (Float32, EPSG:4326).
- **Projection to other scenarios** (e.g. WorldClim CMIP6 future, one 19-band file or separate `bio_N` layers):
  gain/loss of suitable area and an extrapolation map (**MESS**, Elith et al. 2010).

## Data and credits

- **[GBIF](https://www.gbif.org)** — species occurrence records (public API).
- **[WorldClim 2.1](https://www.worldclim.org)** (Fick & Hijmans 2017) — bioclimatic variables and elevation.
- **Köppen-Geiger** (Beck et al. 2018, *Scientific Data*, CC BY 4.0) — climate classification.
- **[SoilGrids](https://soilgrids.org)** (ISRIC; Poggio et al. 2021) — WRB soil classification.

**No WorldClim data travels with the program.** We asked for permission to bundle a small cropped subset for the
example and WorldClim refused, so since version 1.1.0 there is none: you download the layers once
([`datos/LEE-ME.md`](datos/LEE-ME.md) says how — 10 arc-minutes to learn, 30 arc-seconds for a real study) and step 5
reads them with the folder picker, the file picker, or from the program's own `datos/` folder. Köppen-Geiger is
bundled, because CC BY 4.0 allows it.

Who is behind the records of the example: [`datos/GBIF-FUENTES.md`](datos/GBIF-FUENTES.md), 70 institutions and 91
datasets. What is ours and what is not, source by source: [`NOTICE.md`](NOTICE.md). Third-party libraries and their
licences: [`vendor/THIRD-PARTY-NOTICES.txt`](vendor/THIRD-PARTY-NOTICES.txt).

## Privacy and architecture

All processing happens **in your browser**: GeoTIFF files are read locally, and the statistics, machine learning and
modelling run in Python compiled to WebAssembly. The only network calls are to the public GBIF and SoilGrids APIs, to
the map-tile servers and to a public content-delivery network that provides the Python engine. There is no back end and
no database; nothing is stored or shared beyond your computer (only your language, theme and a soil-query cache are kept
in the browser).

## Repository layout

```
index.html                 the application (home + 10 steps)
css/style.css              styles, light and dark themes
js/                        one file per block (i18n, state, ui, maps, GBIF, filters, cleaning, rasters, statistics,
                           ML, ecology, SDM, export) and the home page (art, home, lab)
js/example-records.js      the bundled GBIF example (Pinus cembroides); no climate layers are bundled
vendor/                    Leaflet, geotiff.js, html2canvas and their licences
datos/                     the Köppen-Geiger layer, where to download the climate layers, and who published
                           the records of the example
manual/                    the user manual in Spanish, in HTML by parts and as a PDF
NOTICE.md                  what is ours and what belongs to someone else, source by source
server.ps1, *.bat          optional local web server (Windows)
```

## How to cite

Barrera-Guzmán, L. Á., Ramírez-Ojeda, G., Cadena-Iñiguez, J., Cadena-Zamudio, D. A., Cadena-Zamudio, J. D., &
Mojica-Zárate, H. T. (2026). *BioModelling Pro: biogeography and species distribution modelling in the browser*
(Version 1.1.0) [Computer software]. Zenodo. https://doi.org/10.5281/zenodo.22907825

That DOI is the **concept DOI**: it always resolves to the latest version. Version 1.0.0 also has its own,
[10.5281/zenodo.22907826](https://doi.org/10.5281/zenodo.22907826), if you need to point at exactly the code you used.

See [`CITATION.cff`](CITATION.cff). Please also cite the data sources and the methods you use.

## Licence, and what it covers

The program is free software under the **GNU General Public License v3.0 or later** (see [`LICENSE`](LICENSE)).
That licence covers the source code written by the authors.

The libraries the program bundles or loads, and the data it ships as an example, belong to other people and keep
their own terms — and one of them has a restriction worth knowing before you redistribute the program:
**WorldClim does not allow redistribution of its layers without prior permission**, which is why the global layers
are not in this repository and neither is any subset of them. [`NOTICE.md`](NOTICE.md) says exactly
what is whose, source by source, and [`datos/GBIF-FUENTES.md`](datos/GBIF-FUENTES.md) lists the 70 institutions
whose records make up the example.
