# MazzNote

Cuadernos de notas para el navegador: se escribe con el **teclado** o **a lápiz** (tableta digitalizadora, tableta con lápiz o pantalla táctil), sobre hojas con renglones que sirven de guía. Cada cuaderno tiene varias hojas y se ven de dos en dos, como un libro abierto.

## Cómo abrirlo

Haz doble clic en `index.html` (no necesita instalar nada ni servidor). Funciona mejor en Chrome, Edge o Safari actuales.

> Las notas se guardan en el navegador **y en el origen desde el que abres la página**. Si abres el archivo directamente (`file://`) y luego desde un servidor (`http://localhost`), cada uno tendrá sus propias notas. Usa siempre la misma forma.
>
> Si vienes de una versión anterior, tus hojas se conservan (las que no tenían cuaderno se agrupan en **Mi cuaderno**). Si el navegador avisa de que hay que cerrar otras pestañas, ciérralas para terminar de actualizar los datos.

## Menú de herramientas (clic derecho)

**Clic derecho** en cualquier punto del área de trabajo abre un menú **justo donde está el puntero**, con lo más usado sin ir a la barra superior:

- **Joystick**, siempre la primera opción: un mando para desplazar la hoja (también se logra manteniendo `Ctrl`, ver más abajo).
- Modo: **Teclado / Lápiz / Borrador / Lazo**.
- **Pincel**: Lápiz (el grosor sigue la presión) o Marcador (ancho y translúcido). *(El Bolígrafo se retiró: en la práctica daba el mismo resultado que el Lápiz; los trazos que ya hiciste con él se siguen viendo igual.)*
- **Color** (negro, rojo, azul y selector libre) y **grosor**, en la misma línea. La barra superior tiene los 5 colores.
- **Goma**: por trazo o por área, y su tamaño.
- **Deshacer, rehacer y limpiar** la hoja activa.
- **Zoom**: alejar, acercar, página completa o ancho.
- **Pegar** el texto del portapapeles, y los accesos **Láser**, **Enfoque**, **Copiar** y **Compartir**.

Se cierra con `Esc` o tocando fuera. También se abre con `Alt+M` (en el centro del área de trabajo) y con la pulsación larga en pantallas táctiles que la permiten. **Mayús + clic derecho** muestra el menú normal del navegador (copiar/pegar…). Si tu tableta (XP-Pen, Wacom…) tiene un botón del lápiz o una tecla exprés asignada a «clic derecho», el menú se abre justo en la punta.

## Zoom

Arriba a la derecha, junto al nombre del cuaderno:

- **− / +** alejan y acercan; el porcentaje (clic) vuelve a **ver la página completa**.
- **Ajustar a la página** (por defecto): se ven las hojas enteras sin desplazarse.
- **Ajustar al ancho**: las hojas ocupan todo el ancho (hay que desplazarse hacia abajo).
- Teclado: `Ctrl/Cmd +`, `Ctrl/Cmd −`, `Ctrl/Cmd 0` (página completa). También `Ctrl/Cmd` + rueda del ratón o pellizco en el trackpad.
- El botón con la flecha hacia abajo **alarga las hojas** visibles (antes «Añadir espacio»).

Al acercar más de lo que cabe, la zona de trabajo se desplaza en vertical y horizontal.

## Cuadernos y hojas

- La **barra lateral** lista los cuadernos. El botón **›** de cada uno despliega sus hojas; un clic en una hoja la abre.
- Al pasar el ratón por un cuaderno aparecen **🎨** (color), **+** (añadir hoja), **✎** (renombrar) y **×** (eliminar el cuaderno con todas sus hojas).
- **Color del cuaderno**: elige uno de la paleta, uno propio o «Sin color». Se tiñen muy suavemente la fila del cuaderno y las hojas que contiene al desplegarlo, y aparece un punto de ese color junto al nombre sobre las hojas.
- **Reorganizar hojas**: en la barra lateral, **▲ / ▼** suben o bajan una posición la hoja (al pasar el ratón por la fila). También hay **‹ ›** en la cabecera de cada hoja. Los números y el carrusel se actualizan.
- Cada hoja puede tener un **título opcional** y muestra, discreta en su esquina superior derecha, su **fecha de creación** (pasa el ratón para ver el día y la hora completos): sirve como línea de tiempo.
- **+ Cuaderno** crea uno nuevo. El nombre también se cambia haciendo clic en el título sobre las hojas.

## Buscar

El buscador de la barra lateral encuentra:

- **Sin importar tildes ni mayúsculas**: «anatomia» encuentra «Anatomía».
- **Varias palabras en cualquier orden**: «lapiz retrato» encuentra «retrato a lápiz».
- Palabras del **nombre del cuaderno**, del **título** de la hoja y de su **texto**, en todos los cuadernos.
- Lo que acabas de escribir, aunque todavía no se haya guardado.

Cada resultado muestra el fragmento donde coincide, con la palabra resaltada. Un clic abre esa hoja.

> **Límite**: solo se busca en texto. Lo escrito **a mano** con el lápiz es imagen y no se puede buscar; para encontrarlo, ponle un **título** a la hoja.

## Libro abierto y carrusel

- Se ven **dos hojas a la vez** (1-2, 3-4…). **Una hoja** de la barra pasa a ver solo una y **Libro** vuelve a dos. Si la ventana es demasiado estrecha para leer dos hojas, se muestra una sola automáticamente.
- Bajo las hojas, **al centro**, el **carrusel** muestra miniaturas de todas las hojas del cuaderno. Clic en una miniatura abre esa hoja; **‹ ›** pasan al par anterior o siguiente; **Nueva** añade una hoja al final. Teclado: `Alt+←` / `Alt+→` o `RePág` / `AvPág` (cuando no estás escribiendo).
- **Hoja activa**: la última que tocaste (su número aparece en azul). Deshacer, Limpiar y Exportar actúan sobre ella.
- Si un cuaderno tiene un número impar de hojas, el hueco de la derecha ofrece **Añadir hoja**.
- Las dos hojas visibles miden siempre lo mismo y crecen juntas.

## Modos de escritura

| Modo | Atajo | Qué hace |
|---|---|---|
| **Teclado** | `Alt+T` | Texto alineado a los renglones. |
| **Lápiz** | `Alt+P` | Trazos a mano con el pincel elegido. |
| **Borrador** | `Alt+E` | *Trazo*: borra el trazo completo que toques. *Área*: borra solo la parte bajo la goma. |
| **Lazo** | `Alt+L` | Rodea trazos para seleccionarlos y moverlos, cambiarles el tamaño, copiarlos o borrarlos. |
| **Láser** | `Alt+R` | Puntero láser temporal; `Esc` vuelve al modo anterior. |

Con **Cambio automático** activado (por defecto):

- Si el lápiz toca una hoja estando en modo Teclado, pasa a Lápiz y empieza a dibujar en ese mismo toque (en cualquiera de las dos hojas).
- Si escribes una letra estando en Lápiz o Borrador, pasa a Teclado y el texto se escribe donde estaba el cursor.
- El **extremo borrador** del lápiz (Wacom y similares) borra mientras lo uses, sin cambiar de modo.

**Solo lápiz** hace que los dedos no dibujen, solo desplacen la hoja: útil para apoyar la palma sin dejar marcas.

## Ayudas del lápiz

Están en la barra de opciones (bajo la de herramientas): **Estabilizador** (desplegable) y las casillas **Enderezar** y **Tachar**, junto a la orientación. También se cambian desde la Guía.

- **Estabilizador** (`Alt+S`, o la casilla *Estabilizador* de la barra): suaviza el temblor de la mano. Niveles **Suave, Medio y Fuerte**: cuanto más fuerte, más se redondea el trazo y más se retrasa la línea respecto al lápiz (al soltar, el trazo termina exactamente donde terminó el lápiz). Viene apagado.
- **Mantener para enderezar**: dibuja una **línea, círculo, elipse, caja o triángulo** y deja el lápiz **quieto, apoyado, medio segundo**: el trazo se convierte en la forma perfecta (las rectas se imantan a horizontal, vertical y 45°). En una recta puedes seguir moviendo el lápiz para ajustar dónde termina; si sigues **quieto un poco más, la recta pasa a flecha**. La forma es un trazo normal: se puede deshacer, borrar o mover con el lazo.
- **Tachar para borrar**: un **zigzag rápido** sobre lo que escribiste lo borra (el zigzag desaparece con ello y se deshace con `Ctrl/Cmd+Z`). Solo actúa si el zigzag cubre trazos y no con el marcador (resaltar no borra). Si sueles sombrear con zigzag sobre lo escrito, apaga **Tachar** en el menú.

## Lazo: seleccionar, mover y copiar trazos

Con el modo **Lazo** (`Alt+L`), **rodea con el lápiz** lo que quieras. También sirve un toque sobre un trazo.

- **Arrastra** dentro del marco para moverlo, o tira de una **esquina** para cambiar su tamaño (el grosor del trazo escala con él).
- La **barra flotante** sobre la selección cambia el **color** (5 colores), **duplica** y **elimina**.
- `Supr` / `Retroceso` borra · `Ctrl/Cmd+C`, `X`, `V` copian, cortan y pegan (también **en otra hoja**, incluso de otro cuaderno) · `Ctrl/Cmd+D` duplica · `Esc` suelta la selección.
- Cada paso se puede deshacer. La selección es de una sola hoja: al tocar la otra se suelta.

## Modo enfoque

`Alt+F` (o **Enfoque** en el menú del clic derecho) oculta todo menos la hoja: barras, cuaderno lateral y carrusel. La hoja crece para aprovechar la pantalla. Acerca el puntero a un **borde** (marcas discretas arriba, a la izquierda y abajo; en pantallas táctiles, tócalas) para ver las barras un momento. `Alt+F`, `Esc` o el botón **Salir del enfoque** (abajo a la derecha) vuelven a la vista normal.

## Índice del cuaderno

El botón **Índice** (junto al nombre del cuaderno, o `Alt+I`) muestra **todas las hojas** en una cuadrícula con **miniatura, número, título (o primera línea) y fecha**; la hoja abierta aparece marcada. Escribe en **Filtrar** para buscar por título, texto, número o fecha; las flechas mueven entre hojas y un clic (o `Intro`) abre la elegida. Las miniaturas se dibujan al aparecer en pantalla y se liberan al cerrarlo, así que un cuaderno de cientos de hojas no pesa en memoria.

## Puntero láser

`Alt+R` (o **Láser** en el menú del clic derecho): un punto rojo con halo sigue al puntero, **sin cola**, sin dejar marca ni guardar nada; se apaga solo si no te mueves unos segundos. Útil para señalar algo en una videollamada. `Esc` (o `Alt+R` otra vez) vuelve a lo que hacías.

## Joystick de desplazamiento

Con zoom, llegar a los bordes de la hoja con el lápiz es incómodo. La primera opción del menú del clic derecho, el **joystick**, muestra un mando **justo donde hiciste el clic derecho**: apoya el lápiz en la bola y arrástrala; **cuanto más lejos del centro, más rápido** se desplaza la hoja (cerca del centro es muy fino) y al soltar vuelve al centro. **Se cierra solo en cuanto sigues escribiendo o dibujando** (también con `Esc` o su ×), así no corta el flujo; la próxima vez aparece donde vuelvas a hacer clic derecho. Su asa (⠿) permite moverlo mientras lo usas. La velocidad (Lento / Normal / Rápido) y «Abrir ahora» están en la Guía.

## Desplazarse con Ctrl

Mantén **`Ctrl`** y **mueve el puntero**: la hoja lo sigue, como la lupa de Windows o macOS, y **no se dibuja nada** mientras lo tengas pulsado. Es relativo (no salta al pulsar la tecla) y se acelera con el zoom: cruzar la pantalla recorre buena parte de la hoja. Sirve con ratón, lápiz en vuelo o cualquier puntero. El cursor se vuelve una mano mientras tanto. Se puede apagar en la Guía (Vista). En Mac, `Ctrl` + clic abre el menú (como siempre); basta con mover.

## Pegar texto

`Ctrl/Cmd+V` pega el **texto del portapapeles** en un cuadro de texto **justo donde está el puntero** (en cualquier modo, y sobre la hoja que haya debajo); si el puntero no está sobre una hoja, bajo el cuerpo del texto. Si ya estás escribiendo en un cuadro o en el cuerpo, simplemente pega ahí. El botón **Pegar** del menú del clic derecho lo pega en el punto donde abriste el menú: útil con la tableta, sin teclado. Los saltos de línea se conservan y el cuadro crece con el texto (la hoja se alarga si hace falta).

## Texto en cualquier parte

Con el modo **Teclado**, **haz clic en cualquier hueco de la hoja** (o toca con el lápiz: un toque corto no dibuja, pone el cursor) y escribe: aparece un **cuadro de texto** sobre ese renglón, con el ancho hasta el margen derecho. Así se escribe a la mitad de la hoja, al pie de página o en el lateral sin saltos de línea ni espacios. Arrastra el cuadro por el **asa ⠿** de su izquierda y ensánchalo con su **borde derecho**; si lo dejas vacío, desaparece. El texto de los cuadros se busca, sale en las imágenes exportadas y se conserva al girar la hoja. El cuerpo del texto de siempre sigue en la primera línea (ahora mide lo que su contenido, y el resto de la hoja queda libre para los cuadros).

## Regla

El botón de la **regla** (junto al zoom) muestra una **tira horizontal y otra vertical en centímetros**, alineadas con la hoja activa y que siguen el desplazamiento y el zoom. La hoja es proporción A4 (21 × 29,7 cm; horizontal, 29,7 × 21). Junto al botón se lee la **posición del puntero** («x 8,4 cm · y 7,4 cm») y un marcador azul la señala en las dos tiras. Se enciende y se apaga cuando quieras y se recuerda; en el modo enfoque no se muestra.

## Guía

El botón **Guía** de la barra (o `Alt+G`) abre una ventana compacta **con pestañas** (Escribir, Lápiz, Lazo, Hojas, Vista, Archivos, Rendimiento; también con las flechas del teclado) con todos los comandos, su atajo y qué hacen. Varios se pueden **configurar ahí mismo**: estabilizador, enderezar, tachar, cambio automático, solo lápiz, la velocidad del joystick, la regla y el **Modo ahorro**.

## Limpiar una hoja

El botón de la **escoba**, junto a los de cada hoja (esquina superior derecha), pregunta qué quitar de esa hoja —solo trazos, solo texto o todo— y **la hoja se conserva**. Se puede deshacer.

## Modo oscuro (por cuaderno)

La casilla **Modo oscuro**, junto a Fondo, Renglón y Papel, activa una versión oscura **solo del cuaderno abierto** (los demás no cambian):

- El **papel** se oscurece (el blanco pasa a gris azulado y el crema a un tono cálido oscuro) y el **texto** se vuelve claro.
- Los **colores del panel y los trazos** pasan a su equivalente claro para que se lean: negro → **blanco**, rojo → **verde lima**, azul → **fucsia**, verde → cian, naranja → amarillo. Un color propio oscuro se aclara conservando su tono.
- Lo guardado **no se modifica**: los trazos conservan su color original y al desactivar el modo todo vuelve exactamente a como estaba. Lo que dibujes con «negro» en modo oscuro se verá blanco, y negro al apagarlo.
- Las opciones de **papel (blanco / crema)** y de **fondo (rayado, cuadriculado, puntos, blanco)** siguen funcionando igual; en oscuro conservan su geometría con las líneas atenuadas.
- Las miniaturas del carrusel y las **imágenes exportadas** se ven en el mismo modo.
- La hoja lleva un **borde claro con un ligero brillo** para ver siempre dónde termina sobre el fondo oscuro.

## Orientación (por hoja)

La orientación es de **cada hoja**: girar una no cambia ninguna otra ni lo ya guardado.

- Se cambia con el botón **⟳** de la cabecera de cada hoja, o con **Vertical / Horizontal** en la barra, que actúa sobre la **hoja activa** (la del número en azul) y muestra la orientación de esa hoja.
- Una hoja **horizontal** (1160 × 820) se muestra **sola**, con el lienzo completo. Al girarla se ajusta su altura sin cortar lo escrito en ella.
- Las hojas **verticales** siguen emparejándose como libro (de dos en dos) y el emparejamiento se reinicia después de cada hoja horizontal. Ejemplo con 7 hojas y la 2 horizontal: `1` · `2 ▭` · `3-4` · `5-6` · `7`.
- Una hoja **nueva** sigue con la orientación de la última del cuaderno.
- En el carrusel, cada miniatura tiene la forma de su hoja.
- Si venías de la versión en la que la orientación era del cuaderno completo, un cuaderno que estaba en horizontal conserva sus hojas horizontales (así las veías); puedes girarlas de una en una.
- Al volver una hoja a vertical, lo que quedó más allá del ancho vertical se oculta (no se pierde: reaparece al volver a horizontal).

## Recursos y rendimiento

El **Modo ahorro** (en la Guía) baja la resolución de los lienzos (tope 1,25 píxeles por píxel de hoja) y su presupuesto de memoria a la mitad: pensado para equipos modestos u hojas muy cargadas, a cambio de un trazo algo menos nítido en pantallas retina.

El botón **Recursos** (abajo a la izquierda) muestra en vivo cuánta memoria y procesador usa la app, con semáforo y consejos. Resumen del análisis completo en [RENDIMIENTO.md](RENDIMIENTO.md): memoria de lienzos con tope de 144 MB, miniaturas con tope de 60, arranque que no depende del tamaño de tus hojas, trazos simplificados al soltar el lápiz y 0 % de procesador en reposo. Las hojas antiguas muy pesadas se optimizan solas una vez al abrirlas (sin cambio visible).

## Fondo de la hoja

- **Fondo**: rayado (con margen rojo), cuadriculado, puntos o blanco. **Renglón**: pequeño, medio o grande. **Papel**: blanco o crema.
- El cambio se aplica a las hojas visibles y queda como valor por defecto de las **hojas nuevas de ese cuaderno**.
- La hoja crece sola al acercarte al final (máx. ~8000 px por hoja).

## Guardar y exportar

- Se guarda **automáticamente** (≈ 1 s después del último cambio) en el navegador. `Ctrl/Cmd+S` fuerza el guardado.
- **Exportar → Imagen (PNG)**: si hay **dos hojas a la vista**, pregunta qué exportar: solo la hoja activa, **ambas en una sola imagen** (como el libro abierto) o **ambas en dos imágenes**. Con una sola hoja a la vista exporta directamente.
- **Copiar como imagen** (`Alt+C`): deja la hoja activa en el portapapeles para pegarla en un mensaje, un correo o un documento. **Compartir imagen…** abre el menú de compartir del sistema (en macOS: AirDrop, Mensajes, Mail, Contactos…), donde el navegador lo permita. Con dos hojas a la vista aparecen también **Copiar ambas hojas** y **Compartir ambas hojas**. Los dos botones también están en el menú del clic derecho.
  - Safari exige que compartir ocurra dentro del clic: la imagen se prepara al pasar el puntero por el botón. Si aun así avisa «pulsa Compartir otra vez», ya está lista. Si el navegador no sabe compartir, se guarda en Descargas.
- **Archivo de hoja (JSON)**: la hoja activa con todo su contenido. **Importar hoja (JSON)** la añade al final del cuaderno abierto (útil para pasar hojas a otro equipo o como copia de seguridad).

## Otros atajos

`Ctrl/Cmd+Z` deshacer · `Ctrl/Cmd+Shift+Z` rehacer (texto o trazos, según el modo; cada hoja tiene su propio historial) · `Esc` cierra menús, suelta la selección, sale del láser o del modo enfoque.

| Atajo | Acción |
|---|---|
| `Alt+T` · `Alt+P` · `Alt+E` · `Alt+L` | Teclado · Lápiz · Borrador · Lazo |
| `Alt+S` | Estabilizador (apagar o encender) |
| `Alt+R` | Puntero láser |
| `Alt+F` | Modo enfoque |
| `Alt+I` | Índice del cuaderno |
| `Alt+C` | Copiar la hoja como imagen |
| `Alt+G` | Guía de comandos y ajustes |
| `Alt+M` | Menú de herramientas |
| `Alt+←` · `Alt+→` | Hoja anterior · siguiente |

> Los atajos `Alt+S`, `R`, `F`, `I`, `C` y `G` no actúan mientras escribes texto (en el Mac `Alt`+letra da símbolos); `Alt+T`, `P`, `E` y `L` sí, para cambiar de modo sin soltar el teclado.

## Estructura

```
index.html        estructura de la página, plantilla de hoja, menú contextual y panel de recursos
css/styles.css    diseño
js/theme.js       colores del modo oscuro
js/text.js        medidas de renglón, tamaños de hoja y ajuste de líneas (compartido con el PNG)
js/paper.js       dibujo del fondo
js/shapes.js      geometría de los gestos: enderezar formas, detectar tachados, esquinas, lazo
js/ink.js         capa de lápiz de una hoja: pinceles, presión, estabilizador, borrador, lazo, deshacer
js/sheet.js       una hoja en pantalla (fondo + texto + lápiz), escalada con el zoom
js/carousel.js    carrusel de miniaturas
js/boxes.js       cuadros de texto sueltos (texto en cualquier parte de la hoja)
js/ruler.js       regla en centímetros
js/outline.js     índice del cuaderno (cuadrícula de hojas con miniatura)
js/laser.js       puntero láser
js/joystick.js    joystick de desplazamiento
js/storage.js     IndexedDB: cuadernos, hojas (trazos compactos) y resúmenes (localStorage de respaldo)
js/export.js      exportar, copiar y compartir PNG (una o dos hojas) / JSON, importar JSON
js/app.js         cuadernos, navegación, zoom, menú contextual, modos, enfoque, búsqueda, autoguardado, recursos
tools/bench.js    banco de mediciones de rendimiento (se pega en la consola)
RENDIMIENTO.md    análisis de rendimiento
```

Los trazos se guardan como vectores, no como píxeles, así que borrar, deshacer y exportar no pierden calidad.
