# Changelog

## 1.1.1 — 2026-09-23

- Wording. Everywhere the climate layers are explained — `NOTICE.md`, the README, the Spanish readme,
  `datos/LEE-ME.md` and the manual — the text now states the condition itself, that WorldClim data may not be
  redistributed without prior permission and that the program therefore ships none, without recounting how that
  was handled. Nothing else changed.

## 1.1.0 — 2026-09-23

- **No WorldClim data travels with the program any more.** Their terms do not allow it to be redistributed without
  prior permission, so `js/example-rasters.js` (3.7 MB) — the cropped subset the bundled example used — was
  removed. Nothing of the analysis changed: the layers are now downloaded once — `datos/LEE-ME.md` says how — and
  step 5 reads them with the folder picker, the file picker, or from the program's own `datos/` folder. The
  Köppen-Geiger map stays bundled, because CC BY 4.0 allows it, so it is one download less.
- The third button of step 5 is now **«Use the layers in `datos/`»**: it reads that folder, which needs the local
  server, and when the folder has nothing it explains where to get the layers instead of failing.
- The example **records** still travel with the program, so step 1 keeps working from a double click.
- `NOTICE.md`, the README, the Spanish readme, `datos/LEE-ME.md` and the manual (sections I.5, 5.2, 9.2 and
  appendix F) say all of this.

## 1.0.2 — 2026-09-22

Documentation and licensing hygiene. Nothing changed in the analysis.

- **New `NOTICE.md`**: what belongs to the authors and what belongs to someone else, source by source, for both
  code and data, with the terms of each one and whether it is redistributed here.
- **The global WorldClim layers are no longer in the repository.** Their terms allow academic and other
  non-commercial use but not redistribution without prior permission, so `datos/worldclim/` now ships empty and
  `datos/LEE-ME.md` says how to download the layers. The cropped subset of the bundled example stays — it is what
  makes the program work from a double click — flagged as WorldClim material, not covered by the GPL, and
  separable: deleting `js/example-rasters.js` leaves the program complete.
- **New `datos/GBIF-FUENTES.md`**: the 70 institutions and 91 datasets that published the 2,400 records of the
  example, with how many records each one contributed and how to cite them.
- The Köppen-Geiger layer, which is CC BY 4.0, keeps travelling with the program, now with its attribution stated.
- The licence sections of the README and the Spanish readme, the third-party notices and appendix F of the manual
  (now with a table of the data sources) say all of this too.

## 1.0.1 — 2026-09-22

- Archived in Zenodo. The citation now carries the DOI — the concept DOI
  [10.5281/zenodo.22907825](https://doi.org/10.5281/zenodo.22907825), which always resolves to the latest
  version — in the README, the Spanish readme, `CITATION.cff`, `codemeta.json`, the app's own citation section
  (APA and BibTeX) and the credits page of the user manual. Documentation only: nothing changed in the analysis.

## 1.0.0 — 2026-09-22

First archived release. Everything below was written before it, so it is all part of 1.0.0.

- **Step 10 honours the chosen extent too.** Like step 9, the agroclimatic grid no longer widens the chosen extent to
  hold every record: «country of the records (MX)» was reaching 38.7° N because of a handful of records in the United
  States. Both grids now cover exactly the same box.
- **Fixed: the workflow was blocked at step 5.** The button that closes the variables step had no handler at all, and
  steps 6 and 7 were never enabled, so neither the button nor the stepper led to the correlation; step 9 only became
  available after running the clustering, which it does not need. Finishing the raster extraction now enables steps 6
  to 9, the button navigates, and pressing it before extracting explains what is missing instead of doing nothing.
- **Country filter in step 1.** The download can be restricted to Mexico, Central America and South America —by
  country or with one click per region— so GBIF is asked only for those records: the count it reports already comes
  filtered and the download shrinks (maize goes from 153,301 records worldwide to 51,288 in Mexico). With no country
  ticked nothing changes: the whole world is downloaded and step 2 filters afterwards.
- **Long GBIF downloads no longer die halfway.** A page of 300 records weighs a couple of megabytes, and when the
  connection dropped while that body was being read the failure arrived as a rejection of the JSON reading, outside
  the retry loop: the whole download was lost with a bare «Failed to fetch» (seen with *Zea mays*, 153,301 records,
  at 10,200). The body is now read inside the retried block, there are six attempts with growing waits, a short pause
  between pages, and if the download still fails the app offers to keep the records that did arrive.
- **Interpretation help with scales (steps 6 to 10).** 97 cards, each one saying what the value measures, how it is
  read, on which scale (31 of them draw a bar of bands and mark where the value falls), the mistake most often made
  with it and the reference it comes from; a card states plainly whether its scale is a reading convention, a published
  threshold, or whether no accepted scale exists. Each step gained a box explaining what it is for and a collapsible
  interpretation guide.
- **Step 9**: an extent chosen by hand is now used as it is. Before, the grid was widened to hold every record, so a
  handful of cultivated trees on another continent (the bundled example has thirteen, in New Zealand, France and
  Austria) stretched the grid of "country of the records (MX)" over the whole world; the records outside the chosen
  extent are now left out of the model and counted in a message.
- **Map export: preview, clip and TIFF.** Before writing the file the studio shows the image exactly as it will be
  saved, with its size in pixels, centimetres and megabytes, so what is seen is what is downloaded. The map can be
  clipped to the country or to the states chosen in step 2, leaving everything outside transparent (or filled with a
  colour of your choice) and drawing the boundary — the outer outline of the country or every boundary of the layer, as
  you prefer; and the export adds TIFF (RGB or RGBA, lossless, with the printing resolution written in the file) for map
  editors such as QGIS, ArcGIS and Illustrator, plus a GeoTIFF variant that carries the geographic coordinates of the map.
- **Figure studio in step 7.** Every statistical figure is now drawn in the browser as a vector figure and can be edited
  down to the last detail: text and fonts per element, axes, grid and frame, series, options of each figure type,
  annotations, presets, style saved as JSON, and export to SVG, PNG, JPEG and WebP at paper sizes and 150–600 dpi. Two
  figures were added (mean with confidence interval, empirical cumulative distribution).
- **Map legends** honour the per-element font settings (size, bold, italic, colour and family) both in the drawn legend
  and in the panel under the map; the editor now lives in a tab called "Text and fonts", with the number of columns,
  entry spacing, patch size and gradient-bar options.
- **Step 9 maps**: the extent defaults to the region chosen in step 2 or to the country of the records (all of Mexico for
  Mexican data) instead of the bounding box of the records; a warning appears when the prepared grid no longer matches
  the chosen extent; the modelled area is outlined so that near-zero suitability drawn in white is not mistaken for
  missing data; and the map is fitted to the data even when its card was still being laid out.

- **Step 2: filter by state or region.** The 32 federal entities of Mexico are bundled (boundaries simplified from
  Natural Earth, public domain) and each record's entity is assigned from its coordinates by a point-in-polygon test, or
  from its text field with the usual spellings and abbreviations normalised; shortcuts select whole groups of states, the
  selection can become the geographic rectangle and the extent of the modelling step, and its outline is drawn on the
  maps. Any region layer (municipalities, watersheds, protected areas) can be loaded as GeoJSON. Disagreements between
  the text and the coordinates are counted and reported.
- Fixed the bundled example records: the accents of the state and locality fields were stored with a wrong encoding
  (1,243 values repaired), and the region filter now repairs that kind of text on the fly.

- **Step 10 (new): agroclimatic crop adaptation.** Agroclimatic indices from monthly climate layers (growing degree days,
  frost and frost-free period, chilling hours, heat-stress days, reference evapotranspiration, soil water balance, length
  of the growing period, aridity), crop suitability with an envelope model over every possible planting date (suitability,
  optimal planting calendar, limiting factor, suitability classes and their area), an editable catalogue of crop
  requirements, multi-crop comparison, climatic analogues, and the change in all of it under future climate.
- **Step 8: species diversity.** Site × taxon matrix from the records, richness with its estimators (Chao1, ACE,
  jackknife), Shannon, Simpson, Hill numbers and evenness with confidence intervals, rarefaction at equal effort and at
  equal coverage, rank-abundance models, and beta diversity (Jaccard, Sørensen, Bray–Curtis, Morisita–Horn) with the
  turnover / nestedness partition and ordination of sites. The ecology section also gained area of occupancy at several
  grains, elevation statistics and Ripley's L with a randomness envelope.
- **Step 9: future-projection workbench.** Many scenarios in one queue with their model, pathway and period, per-scenario
  area and range-shift metrics (centroid displacement, latitudinal and elevational shift, migration rate), ensemble mean
  and agreement maps, trajectories over periods, three dispersal assumptions, climatic refugia, and the extrapolation
  flagged everywhere.

### Earlier work in the same cycle

- **Own data in step 1**: upload a CSV, TXT or Excel (.xlsx) file, or paste from a spreadsheet, with species, longitude and latitude (columns found by name or by content; decimal comma, degrees-minutes-seconds, Windows-1252 files, several sheets and optional country / state / locality / year / month / elevation / uncertainty columns are handled), with checks for empty, unreadable, out-of-range and swapped coordinates; use it alone or add it to the GBIF records.
- **Renamed from BioSDM to BioModelling Pro** and rebuilt on the interface of the other LABG apps: sticky top bar with
  stepper, home page with hero, workflow, step cards, method gallery, theory and citation, and a virtual-species lab
  computed live in JavaScript.
- **Bilingual interface (Spanish and English)** and **light and dark themes**; figures drawn by Python, maps and the
  lab follow both switches and are redrawn when they change.
- **Works with a double click**: the *Pinus cembroides* example (2,400 GBIF records and cropped WorldClim /
  Köppen-Geiger layers) is embedded, and Leaflet, geotiff.js and html2canvas are bundled in `vendor/` with their licences.
- Step 6 (new): correlation and variable selection in pure JavaScript, with an interactive Pearson / Spearman matrix and dendrogram, live VIF, a recommended selection that respects pinned variables such as BIO1 and BIO12, and a pair viewer; the choice is the default of the statistics, ML and SDM steps (steps 7, 8 and 9).
- Maps: the OpenStreetMap standard tiles were replaced by CARTO ones (they refuse pages opened from disk), with an automatic fallback when a base layer does not respond.
- Step 5: the three ways of loading the raster layers (folder, files, example) are separate, labelled buttons with their own status.
- Step 9: choice of the map extent (records + margin, country of the records, regional presets such as all of Mexico, or custom coordinates) so that the suitability map can cover a whole country.
- Step 9 (species distribution modelling): MaxEnt-style penalised logistic model, GLM, GAM, random forest, boosted
  regression trees, support vector machine, neural network, Bioclim, Domain and Mahalanobis, ensemble, block / random /
  hold-out validation, AUC, TSS and Boyce, thresholds, permutation importance, response curves, maps, GeoTIFF export,
  and projection to future scenarios with gain/loss and MESS maps.
- Steps 1–7 carried over from BioSDM (GBIF, filters, cleaning, map, raster variables, statistics, ML and ecology), with
  the fixes made along the way to the accumulation curve, the VAT ordering and the group map.
