/* Entry point. Each module wires its own controls; this file only does the final set-up. */

(function () {
  console.log('%cBioModelling Pro · v1.0.2', 'color:#1f7a4d;font-weight:bold');

  // Warn early if the browser is offline: GBIF, the base maps and the Python engine need a connection
  if (!navigator.onLine) {
    showMessage('homeMessages', 'warning', L2(
      'Parece que no hay conexión a internet. La búsqueda en GBIF, los mapas base y el motor de Python la necesitan (los ejemplos incluidos y el laboratorio de la portada sí funcionan).',
      'There seems to be no internet connection. The GBIF search, the base maps and the Python engine need one (the bundled examples and the lab on this page still work).'));
  }

  // The stepper starts on the home page; steps unlock as the analysis advances.
  window.addEventListener('online', () => clearMessages('homeMessages'));
})();
