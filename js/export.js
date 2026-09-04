/* Exportación de datos (Bloque A: CSV crudo, CSV depurado, GeoJSON depurado). */

const EXPORT_COLUMNS = [
  { key: 'key', label: 'gbif_key' },
  { key: 'scientificName', label: 'scientificName' },
  { key: 'acceptedScientificName', label: 'acceptedScientificName' },
  { key: 'taxon', label: 'taxon' },
  { key: 'taxonRank', label: 'taxonRank' },
  { key: 'infraspecificEpithet', label: 'infraspecificEpithet' },
  { key: 'family', label: 'family' },
  { key: 'genus', label: 'genus' },
  { key: 'decimalLatitude', label: 'decimalLatitude' },
  { key: 'decimalLongitude', label: 'decimalLongitude' },
  { key: 'coordinateUncertaintyInMeters', label: 'coordinateUncertaintyInMeters' },
  { key: 'elevation', label: 'elevation_gbif' },
  { key: 'country', label: 'country' },
  { key: 'countryCode', label: 'countryCode' },
  { key: 'stateProvince', label: 'stateProvince' },
  { key: 'locality', label: 'locality' },
  { key: 'year', label: 'year' },
  { key: 'month', label: 'month' },
  { key: 'basisOfRecord', label: 'basisOfRecord' },
  { key: 'institutionCode', label: 'institutionCode' },
  { key: 'datasetName', label: 'datasetName' },
  { key: 'issues', label: 'gbif_issues' },
  { key: '_drop', label: 'motivo_descarte', get: r => r._drop || '' },
];

function safeName(suffix) {
  return (state.query || 'especie').trim().replace(/\s+/g, '_') + '_' + suffix;
}

el('dlRawCsv').addEventListener('click', () => {
  const rows = state.cleanReport ? state.cleanReport.all : state.filtered;
  downloadBlob(toCSV(EXPORT_COLUMNS, rows), safeName('registros_crudos.csv'), 'text/csv;charset=utf-8');
});

el('dlCleanCsv').addEventListener('click', () => {
  downloadBlob(toCSV(EXPORT_COLUMNS.filter(c => c.key !== '_drop'), state.clean),
    safeName('registros_depurados.csv'), 'text/csv;charset=utf-8');
});

el('dlCleanGeojson').addEventListener('click', () => {
  const fc = {
    type: 'FeatureCollection',
    metadata: {
      generator: 'BioSDM', query: state.query,
      acceptedName: state.match && state.match.scientificName,
      taxonKey: state.match && state.match.usageKey,
      records: state.clean.length, generated: new Date().toISOString(),
    },
    features: state.clean.map(r => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.decimalLongitude, r.decimalLatitude] },
      properties: EXPORT_COLUMNS.filter(c => c.key !== '_drop')
        .reduce((o, c) => (o[c.label] = c.get ? c.get(r) : r[c.key], o), {}),
    })),
  };
  downloadBlob(JSON.stringify(fc, null, 1), safeName('registros_depurados.geojson'), 'application/geo+json');
});

window.EXPORT_COLUMNS = EXPORT_COLUMNS;
