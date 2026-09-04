/* Paso 4: mapa Leaflet de los registros depurados (coloreado por taxón / tipo). */

let mainMap = null, pointLayer = null, legendCategories = [];

function categoryOf(r) {
  if (state.mapColorBy === 'taxon') return r.taxon || 'sp.';
  if (state.mapColorBy === 'basisOfRecord') return r.basisOfRecord || '—';
  return 'Registros';
}

function renderMap() {
  const recs = state.clean.length ? state.clean : state.filtered;
  if (!mainMap) mainMap = mapkit.makeBaseMap('map');

  if (pointLayer) mainMap.removeLayer(pointLayer);
  pointLayer = L.layerGroup();

  const cmap = mapkit.categoricalColors(recs.map(categoryOf));
  legendCategories = Object.entries(cmap);

  recs.forEach(r => {
    if (r.decimalLatitude == null) return;
    L.circleMarker([r.decimalLatitude, r.decimalLongitude], {
      radius: 5, weight: 1, color: '#fff', fillColor: cmap[categoryOf(r)] || '#888', fillOpacity: 0.85,
    }).bindPopup(
      `<b>${r.taxon || r.scientificName}</b><br>${r.decimalLatitude.toFixed(4)}, ${r.decimalLongitude.toFixed(4)}<br>` +
      `${r.stateProvince ? r.stateProvince + ', ' : ''}${r.country || ''}<br>` +
      `${r.year || 's/f'} · ${r.basisOfRecord || ''}<br><span style="color:#888">GBIF ${r.key}</span>`
    ).addTo(pointLayer);
  });
  pointLayer.addTo(mainMap);
  mapkit.fitToPoints(mainMap, recs);
  mainMap.invalidateSize();
  renderLegend();
}

function renderLegend() {
  const box = el('mapLegend');
  box.innerHTML = `<strong style="width:100%">Leyenda — ${
    state.mapColorBy === 'taxon' ? 'taxón' : state.mapColorBy === 'basisOfRecord' ? 'tipo de registro' : 'registros'
  }</strong>`;
  legendCategories.forEach(([cat, color]) => {
    const d = document.createElement('div');
    d.className = 'legend-item';
    d.innerHTML = `<span class="legend-swatch" style="background:${color}"></span>${cat}`;
    box.appendChild(d);
  });
}

el('mapColorBy').addEventListener('change', e => { state.mapColorBy = e.target.value; renderMap(); });

el('mapExportBtn').addEventListener('click', async () => {
  showSpinner('Generando imagen del mapa…');
  try {
    await mapkit.exportMapPNG('map', `mapa_${(state.query || 'especie').replace(/\s+/g, '_')}.png`);
  } catch (err) {
    showMessage('mapLegend', 'warning',
      'No se pudo exportar automáticamente (las teselas pueden bloquear la captura). ' +
      'Alternativa: herramienta de recorte de Windows.');
  } finally { hideSpinner(); }
});

window.renderMap = renderMap;
