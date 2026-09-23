# Manual de usuario de BioModelling Pro

El manual se escribe por partes, en HTML, con la misma dinámica que los manuales de PCAPro, PopGeneticsPro,
ClusteringPro, AgriDesign, BreedingPro y SciMetricsPro. Primero va la versión en español y después, si se decide,
la versión en inglés. Cuando las partes estén completas se unen en un solo documento y se imprime a PDF.

La **versión en español está completa**: portada, preliminares, introducción, los diez capítulos y los apéndices
A–F, unidos en `es/manual-completo.html` e impresos en `BioModelling Pro User's Manual.pdf` (92 hojas, septiembre
de 2026).

```
manual/
  BioModelling Pro User's Manual.pdf   el manual en español, impreso de una sola vez
  manual.css           hoja común: tamaño carta y marco de la portada
  interior.css         estilo de las páginas interiores: hojas blancas, vivos en verde de bosque, un color por capítulo
  paginar.js           reparte el contenido en hojas tamaño carta (encabezados, números de página, índice)
  img/                 capturas de pantalla de la app y piezas de la portada
    mx-path.txt        contorno de México en coordenadas de la portada (generado, ver abajo)
    mx-puntos.txt      registros del ejemplo dentro de México, ya proyectados (generado)
    portada-vista.png  vista de la portada para revisarla sin abrir el navegador
    rev-*.png          capturas de hojas hechas para revisar el reparto; se borran antes de publicar
  herramientas/
    captura.ps1        toma la captura de una receta esperando a que terminen los cálculos y la guarda en img/
    evaluar.ps1        pagina una parte, informa avisos e imágenes rotas y guarda cada hoja
    huecos.js          revisa que ninguna hoja quede con un hueco grande al final
    unir-manual.ps1    une portada y partes en es/manual-completo.html (el que se usa en esta máquina)
    unir-manual.pl     lo mismo en Perl, para máquinas que lo tengan instalado
    recetas/           una receta por captura: los pasos que deja la app lista para fotografiarla
  es/
    00a-portada.html   portada blanca: título en español e inglés; al centro el mapa de México con la escala de
                       idoneidad de la app y los registros del ejemplo; alrededor, maíz, maguey, chayote, maracuyá,
                       abeja, mariposa monarca y una rama de piñonero con su cono, cada una con su nombre
                       científico; abajo, cuatro viñetas (capas ambientales, curva de respuesta, curva ROC y
                       rarefacción) y la franja con los colores de los once capítulos
    00b-introduccion.html  créditos, cómo citar, índice general, cómo leer el manual e introducción (sin número):
                       qué es BioModelling Pro, qué preguntas responde, cómo se abre, recorrido por la interfaz,
                       los datos de ejemplo y el flujo de los diez pasos
    01-bloque1.html … 10-bloque10.html   un capítulo por bloque de la app (capítulo N = Bloque N)
    11-apendices.html  apéndices A–F: formatos de archivo, fórmulas, glosario, mensajes, referencias y terceros
    manual-completo.html  generado por unir-manual.ps1; no se edita a mano
  en/                  versión en inglés (pendiente)
```

## Ver una parte

Abre el HTML con doble clic. `paginar.js` arma las hojas en cuanto cargan las tipografías y las imágenes. Sin
conexión a internet, el navegador usa tipografías del sistema y la paginación se ajusta sola.

## Capítulo = bloque

El capítulo N explica el Bloque N de la aplicación. La introducción no lleva número: sus apartados son I.1, I.2, etc.

| Parte | Bloque de la app | Color | Variable |
|---|---|---|---|
| Preliminares e introducción | portada y laboratorio | verde bosque `#14453a` | `--b0` |
| 1 | Registros de presencia (GBIF o propios) | azul `#1d5bb0` | `--b1` |
| 2 | Filtros, estados y regiones | verde azulado `#0f766e` | `--b2` |
| 3 | Depuración de coordenadas | verde campo `#2f7d4f` | `--b3` |
| 4 | Mapa de registros y estudio de mapas | ocre `#b7791f` | `--b4` |
| 5 | Variables ambientales | terracota `#c2410c` | `--b5` |
| 6 | Correlación y selección de variables | carmín `#b4234a` | `--b6` |
| 7 | Estadística descriptiva y figuras | violeta `#7e3fb0` | `--b7` |
| 8 | Multivariado, ecología y diversidad | azul cielo `#2b8fb3` | `--b8` |
| 9 | Modelado de la distribución y futuro | índigo `#4f46a5` | `--b9` |
| 10 | Adaptación agroclimática de cultivos | verde oliva `#4d7c0f` | `--b10` |
| Apéndices | — | negro `#111111` | `--bx` |

## Cómo escribir la siguiente parte

- **Un capítulo es una sección.** Cada capítulo va en
  `<section class="capitulo" id="cap-N" data-pestana="N" data-orden="N" style="--acento: var(--bN)">`.
  `data-orden` fija la altura de la pestaña de color en el borde de la hoja: 1 para el capítulo 1 y así hasta 12
  para los apéndices.
- **Recuadros disponibles:** `caja nota`, `caja importante`, `caja teoria`, `caja ejemplo`, `caja regla` (con tabla)
  y `caja dato`. Para los pasos se usa `ol.pasos`, y para el texto de la app `span.ui` y `span.ruta`.
- **Evitar `columns:`.** Las listas en dos columnas se hacen con rejilla (`display: grid`).
- **Capturas a menor ancho.** `<figure class="media">` va al 84 %. Un capítulo puede definir `figure.chica` (70 %) y
  `figure.mini` (50 %) en su propio `<style>`.
- **Validar los números.** Todo valor que se cite como resultado de la app se comprueba antes de escribirlo, casi
  siempre con el ejemplo de *Pinus cembroides* que viene incluido.
- **La app es bilingüe**: el manual en español cita los rótulos en español, que es el idioma de partida.
- **Referencias.** Los métodos se citan por su artículo original, igual que las fichas de ayuda de la aplicación.
- **Espacio fijo antes de %.** Se escribe `95&nbsp;%`.

## Capturas de pantalla de la app

Se toman desde el propio navegador, sin herramientas aparte: se abre la app con el servidor local, se deja la
pantalla en el estado que se quiere fotografiar y se captura la tarjeta con `html2canvas` (ya viene en `vendor/`),
guardándola con `POST /__save` en `manual/img/`. Nombre: `bN-asunto.png`, donde N es el bloque.

```js
if (!window.html2canvas) await new Promise((ok, err) => { const s = document.createElement('script');
  s.src = '/vendor/html2canvas.min.js'; s.onload = ok; s.onerror = err; document.head.appendChild(s); });
const shot = async (sel, nombre) => { const n = document.querySelector(sel); n.scrollIntoView({ block: 'center' });
  const c = await html2canvas(n, { scale: 2, backgroundColor: '#ffffff', logging: false });
  const b = await new Promise(r => c.toBlob(r, 'image/png'));
  await fetch('/__save?path=' + encodeURIComponent('manual/img/' + nombre + '.png'), { method: 'POST', body: b }); };
```

**Cuidado con `<details>` cerrados:** `html2canvas` dibuja su contenido aunque el navegador lo oculte, y sale
encimado sobre lo que está debajo. Antes de capturar hay que ponerle `display: none` a los hijos que no son el
`<summary>` y devolverlo después.

## Piezas generadas de la portada

El contorno de México y los puntos de la portada salen de los mismos datos de la aplicación, no de un dibujo a mano:

- `img/mx-path.txt`: las aristas que aparecen una sola vez en los 32 estados de `js/mexico-states.js` (Natural Earth
  1:10m, dominio público) forman el contorno del país; se encadenan, se proyectan con la misma fórmula de Mercator
  que usa la app para México y se simplifican con Douglas–Peucker (tolerancia 0.45 px, 44 anillos, 12 KB).
- `img/mx-puntos.txt`: los registros de `js/example-records.js` que caen dentro del país (prueba de punto en
  polígono), adelgazados a una rejilla de 0.25° para que no se amontonen.

Si hace falta rehacerlas, se abre la app con un servidor local que acepte `POST /__save` y se repite ese cálculo en
la consola del navegador; después se sustituyen en `00a-portada.html` las constantes `PATH_MX` y `PUNTOS_MX`.

**Cuidado con Douglas–Peucker en anillos cerrados:** si el primero y el último punto coinciden, la recta base mide
cero y el algoritmo no conserva ningún punto. Cada anillo se parte primero en el punto más lejano del inicial.

## Cómo obtener el PDF

El PDF solo se arma **al final**, cuando todas las partes están escritas y revisadas. Desde la carpeta `manual/`:

```
powershell -ExecutionPolicy Bypass -File herramientas\unir-manual.ps1 es
```

(o `perl herramientas/unir-manual.pl es` donde haya Perl; en esta máquina no está instalado). El script deja en
`es/manual-completo.html` la portada como primera hoja y las demás partes en orden, con un solo `paginar.js`, para
que la numeración sea continua y el índice general encuentre las páginas de todos los capítulos. Los `<style>` de
cada parte se funden: si dos capítulos definen el mismo selector con valores distintos, gana el más frecuente y los
demás se acotan a las hojas de su capítulo con `.hoja[data-pestana="N"]`.

**`unir-manual.ps1` debe guardarse con marca de orden de bytes (BOM) UTF‑8.** Windows PowerShell 5.1 lee los `.ps1`
sin BOM con la codificación antigua del sistema y los acentos salen rotos: la primera versión escribió el título
como «BioModelling Pro Â· Manual de usuario».

Después se imprime `es/manual-completo.html` a PDF desde el navegador (destino **Guardar como PDF**, márgenes
**Ninguno**, **Gráficos de fondo** activado). El manual se imprime de una sola vez: unir PDF sueltos pierde los
enlaces del índice y reinicia la numeración. El resultado se guarda como
`manual/BioModelling Pro User's Manual.pdf`, igual que en las demás apps.

Antes de publicar se borran de `img/` los archivos de trabajo: las capturas `rev-*.png` del reparto de hojas y los
volcados `_apendice-datos.json` y `_refs.txt` que se usaron para armar los apéndices.

## Tipografías

- **Cormorant** para los títulos.
- **Crimson Pro** para el texto de las páginas interiores.
- **Jost** para los rótulos, las tablas y los números.

Las tres tienen licencia SIL Open Font License 1.1 y se cargan desde el servicio público de tipografías web. Todo lo
demás es original: las ilustraciones, los diagramas, el paginador y las herramientas.
