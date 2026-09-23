/* Data export (step 1–3 tables): raw CSV, cleaned CSV and cleaned GeoJSON. Column names follow Darwin Core. */

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
  { key: 'source', label: 'source', get: r => r.source || 'GBIF' },
  { key: '_drop', label: 'discard_reason', get: r => r._drop || '' },
];

function safeName(suffix) {
  return slugName(state.query) + '_' + suffix;
}

el('dlRawCsv').addEventListener('click', () => {
  const rows = state.cleanReport ? state.cleanReport.all : state.filtered;
  downloadBlob(toCSV(EXPORT_COLUMNS, rows), safeName('raw_records.csv'), 'text/csv;charset=utf-8');
});

el('dlCleanCsv').addEventListener('click', () => {
  downloadBlob(toCSV(EXPORT_COLUMNS.filter(c => c.key !== '_drop'), state.clean),
    safeName('cleaned_records.csv'), 'text/csv;charset=utf-8');
});

el('dlCleanGeojson').addEventListener('click', () => {
  const fc = {
    type: 'FeatureCollection',
    metadata: {
      generator: 'BioModelling Pro', query: state.query,
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
  downloadBlob(JSON.stringify(fc, null, 1), safeName('cleaned_records.geojson'), 'application/geo+json');
});

window.EXPORT_COLUMNS = EXPORT_COLUMNS;
