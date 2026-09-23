# Notice: what is ours, what is not

BioModelling Pro is free software released under the **GNU General Public Licence, version 3 or later**.
That licence covers **the source code written by the authors of this program**: `index.html`, the files in
`css/` and `js/` (except the three data files listed below), `server.ps1` and the project's own
documentation and manual.

Everything else that travels with the program, or that the program downloads while it runs, belongs to
someone else and keeps its own terms. This file says exactly what, so that nobody has to guess.

## 1. Third-party code

| Component | What it does here | Licence | Redistributed in this repository |
|---|---|---|---|
| [Leaflet](https://github.com/Leaflet/Leaflet) 1.9.4 | interactive maps | BSD 2-Clause | yes, `vendor/leaflet/`, unmodified |
| [geotiff.js](https://github.com/geotiffjs/geotiff.js) 2.1.3 | reads GeoTIFF rasters by window | MIT | yes, `vendor/geotiff.js`, unmodified |
| [html2canvas](https://github.com/niklasvh/html2canvas) 1.4.1 | composes the map image when exporting | MIT | yes, `vendor/html2canvas.min.js`, unmodified |
| [Pyodide](https://pyodide.org) 0.27.2 and its packages (NumPy, SciPy, pandas, scikit-learn, statsmodels, Matplotlib) | the Python engine of the statistics, machine-learning and modelling steps | MPL-2.0 and the licence of each package | no: downloaded from a public CDN the first time it is needed |
| Cormorant, Crimson Pro, Jost | typefaces of the user manual only | SIL Open Font Licence 1.1 | no: requested from Google Fonts when the manual is opened |

The full licence texts are in [`vendor/THIRD-PARTY-NOTICES.txt`](vendor/THIRD-PARTY-NOTICES.txt).

## 2. Third-party data

| Source | What it is | Terms | Redistributed in this repository |
|---|---|---|---|
| [WorldClim 2.1](https://www.worldclim.org) (Fick & Hijmans 2017) | bioclimatic variables and elevation | free for academic and other non-commercial use; **redistribution or commercial use is not allowed without prior permission** | **nothing**: neither the global layers nor any subset. You download them yourself, see [`datos/LEE-ME.md`](datos/LEE-ME.md) and §3 |
| [Köppen-Geiger maps](https://doi.org/10.6084/m9.figshare.6396959) (Beck et al. 2018) | climate classification at 1 km | CC BY 4.0 | yes, `datos/koppen/`, with attribution |
| [Natural Earth](https://www.naturalearthdata.com) admin-1, 1:10 m | boundaries of the 32 federal entities of Mexico, in `js/mexico-states.js` | public domain, no permission needed | yes, filtered to Mexico and simplified (Douglas–Peucker, ≈0.4 km) |
| [GBIF](https://www.gbif.org) | the presence records of the bundled example, in `js/example-records.js` | each record keeps the licence of the institution that published it (CC0, CC BY or CC BY-NC) | yes; the 70 institutions and 91 datasets behind them are listed in [`datos/GBIF-FUENTES.md`](datos/GBIF-FUENTES.md) |
| Map tile providers (CARTO, Esri, OpenTopoMap and others) | base layers of the maps | the terms of each provider | no: requested while the map is drawn, with the attribution each one requires shown on the map |

## 3. No climate layers travel with the program

Up to version 1.0.2 the program bundled `js/example-rasters.js`, a subset of WorldClim cropped to Mexico, so
that the example ran from a double click with no downloads. WorldClim's terms of use do not allow their data
to be redistributed without prior permission, so **that file was removed in version 1.1.0** rather than leave
the program in a position that those terms do not cover. No WorldClim byte travels with BioModelling Pro any
more.

Nothing of the analysis changed. What changed is where the layers come from:

- **You download them once**, from worldclim.org, and [`datos/LEE-ME.md`](datos/LEE-ME.md) says how. Ten
  arc-minutes (about 90 MB) is enough to learn; 30 arc-seconds is what a real study wants.
- The two pickers of step 5 —a folder, or individual files— read them from wherever you keep them, and they
  work even when `index.html` is opened with a double click.
- The third button reads whatever sits in the program's own `datos/` folder, which needs the local server.
- **Köppen-Geiger is bundled** (`datos/koppen/`), because CC BY 4.0 allows it, so that is one download less.

If you want the double-click example back on your own machine, nothing stops you from building your own
`js/example-rasters.js` from the layers you downloaded and loading it from `index.html`: the program still
reads that file if it finds one. What you may not do is pass it on to anyone else.

## 4. What the licence of this program does and does not reach

The data files above sit next to the program; they are not part of its expression, they are not derived from
its code and the program is not derived from them. They are, in the words of the GPL itself, an aggregate:
each one keeps its own terms, and the GPL keeps covering the source code.

## 5. If you publish results

Cite the sources, not only the program: GBIF (and your own download, which gets its own DOI when made from
gbif.org), WorldClim, Beck et al. for Köppen-Geiger, ISRIC-SoilGrids if you used soil, and the article of each
method you ran. The interpretation cards of steps 6 to 10 and appendix E of the manual carry those references.
