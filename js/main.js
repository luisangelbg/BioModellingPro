/* Punto de entrada. El cableado vive en cada módulo; aquí solo la puesta a punto. */

(function () {
  console.log('%cBioSDM · Bloque A listo', 'color:#2f7d4f;font-weight:bold');

  // Aviso si se abre como file:// sin conexión evidente
  if (!navigator.onLine) {
    showMessage('matchMessages', 'warning',
      'Parece que no hay conexión a internet. La búsqueda en GBIF y los mapas base la necesitan.');
  }

  // Enter en el buscador ya está cableado en gbif.js; foco inicial
  const inp = el('speciesInput');
  if (inp) inp.focus();
})();
