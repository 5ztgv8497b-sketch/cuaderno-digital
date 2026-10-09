# Análisis de rendimiento de MazzNote

**Conclusión:** con un uso normal la app consume muy poco (decenas de MB y 0 % de procesador en reposo). Se encontraron **seis puntos que podían crecer sin control** con el uso o con hojas muy cargadas; todos tienen ahora un tope o una protección, y hay un panel (**Recursos**, abajo a la izquierda) para ver el consumo real en tu equipo.

## Cómo se midió

- Banco de pruebas: [`tools/bench.js`](tools/bench.js). Genera hojas sintéticas de escritura a mano en lienzos de prueba y **no toca tus cuadernos**. Para repetirlo en tu equipo: abre la app, F12 → Console, pega el archivo y ejecuta `await __bench.todo()`.
- Equipo de las mediciones: Chromium (navegador integrado de la app), 8 núcleos, pantalla de densidad 1×. Cada cifra es la **mediana de 3 ejecuciones**.
- Escenarios (trazos de ~100–250 puntos, con presión variable; 1 de cada 9 es marcador):

| Escenario | Trazos | Puntos | Equivale a |
|---|---|---|---|
| S1 ligera | 50 | 5 mil | unas líneas de notas |
| S2 escritura densa | 600 | 72 mil | una hoja llena de apuntes a mano |
| S3 dibujo pesado | 3 000 | 450 mil | un dibujo muy detallado |
| S4 extremo | 8 000 | 2 millones | límite de lo razonable |

## Resultados: antes → después

Tiempos en milisegundos (menos es mejor). «Después» incluye la simplificación de trazos, que quita ~⅔ de los puntos sin cambio visible.

| | Puntos | Redibujar la hoja | Guardar | Leer | Miniatura | Exportar PNG |
|---|---|---|---|---|---|---|
| **S1** antes → después | 5 mil → 1,8 mil | 1,8 → 1,8 | 2,7 → 1,2 | 1,3 → 0,3 | 2,5 → 0,4 | 2 → 2 |
| **S2** antes → después | 72 mil → 25 mil | 23 → **6** | 22 → **2** | 8 → 1 | 28 → **0,7** | 40 → 6 |
| **S3** antes → después | 450 mil → 153 mil | 195 → **37** | 138 → **12** | 51 → 7 | 205 → **4** | 173 → 62 |
| **S4** antes → después | 2 M → 655 mil | 998 → **251** | 762 → **40** | 290 → 18 | 943 → **12** | 911 → 213 |

Qué aporta cada protección (caso S3, 450 mil puntos): solo el nuevo modo de pintar baja el redibujado de 195 a 118 ms; con la simplificación, a 37 ms. Guardar pasa de 138 a 35 ms solo por el formato compacto, y a 12 ms con la simplificación.

**Borrar con la goma** (lo que más se nota al usar): antes cada movimiento repintaba toda la hoja (195 ms en S3 → ~5 cuadros por segundo). Ahora solo se repinta la zona tocada: **14 ms por cuadro en S3** (máx. 67) y 151 ms en S4.

## Lo que podía desbocarse, y cómo quedó

| # | Riesgo encontrado | Cómo crecía | Protección |
|---|---|---|---|
| 1 | **Al abrir la app se leían todas las hojas completas** solo para armar la lista | Con el uso, el arranque se hacía cada vez más lento y gastaba más memoria. Estimado con las lecturas medidas: 100 hojas tipo S2 ≈ 0,8 s y ~400 MB transitorios | Ahora se lee una **tabla de resúmenes** (3 ms con 130 hojas, frente a 20 ms). El arranque ya no depende de lo pesadas que sean las hojas |
| 2 | **Memoria de los lienzos** (los dos lienzos de cada hoja) | Con zoom alto y hojas largas, dos hojas de 8000 px podían pedir ~650 MB | **Tope global de 144 MB** (36 millones de píxeles): si hace falta, baja la resolución de dibujo. Medido en el peor caso: 137 MB |
| 3 | **La hoja oculta** (al pasar a «Una hoja» u orientación horizontal) conservaba sus lienzos | Memoria desperdiciada | Se **liberan** al ocultarse (3,6 → 1,8 MB) y se recrean al mostrarla |
| 4 | **Caché de miniaturas sin límite** | 150 KB por hoja: 500 hojas ≈ 73 MB | **Tope de 60** (≈ 9 MB). Las que salen se redibujan al volver a verlas |
| 5 | **Hojas con cientos de miles de puntos** | Redibujar, guardar y exportar tardaban más de 100–200 ms (bloqueando la pantalla) | Simplificación de trazos al soltar el lápiz; pintura por zonas; formato compacto; miniaturas ligeras; las hojas antiguas muy pesadas se **optimizan una vez al abrirlas** (450 mil → 153 mil puntos, guardado ya reducido) |
| 6 | **Autoguardado** en hojas pesadas | Un guardado de ~140 ms cada vez que se pausa al escribir | El tiempo entre guardados **se adapta** (8× lo que tarda el último, hasta 8 s). Además guardar es 3–10× más rápido |

**Esquinas.** La simplificación de trazos redondeaba las esquinas vivas: en una «L» de 60 px la curva pasaba a 14 px de su vértice (antes de simplificar, a 0,5 px). Ahora se añaden dos puntos de anclaje de ~1 px pegados a cada giro brusco (más de ~37°). Coste medido: +5 ms por cada 450 mil puntos simplificados (24 → 30 ms); escritura suave: +0 % de puntos; con giros muy bruscos: +9 %. Las formas enderezadas (cajas, triángulos, flechas) dependen de esto.

Otras mejoras: el zoom y el cambio de tamaño de ventana ya no repintan los lienzos en cada paso (se ajusta al instante con CSS y se repinta una vez al terminar); la búsqueda guarda el texto normalizado y espera a que dejes de teclear; las miniaturas de una hoja que se está escribiendo se rehacen como mucho cada 2,5 s.

## Consumo típico

Estimaciones (los lienzos se calculan a partir de sus dimensiones; el resto se midió):

| Situación | Lienzos | Datos de la hoja (JS) | Total aprox. |
|---|---|---|---|
| Libro, página completa, pantalla retina | ~15 MB | 1–5 MB | **< 25 MB** |
| Libro, zoom 100 %, retina | ~61 MB | 1–5 MB | **~70 MB** |
| Libro, zoom 250 %, retina, hojas de 8000 px (peor caso) | ≤ 144 MB | hasta ~20 MB | **~170 MB** |
| Reposo (sin tocar nada) | — | — | **0 % de procesador**: 0 temporizadores y 0 animaciones en 8 s |

Costes medidos: ~55 bytes de memoria por punto (2 millones de puntos ≈ 110 MB); en disco, ~10–12 bytes por punto (450 mil puntos ≈ 4,6 MB, el navegador los comprime).

## Funciones de la versión con lazo, gestos y láser

Ninguna añade consumo en reposo ni crece con el uso:

| Función | Memoria | Procesador |
|---|---|---|
| Estabilizador | ninguna (un filtro por muestra) | despreciable; solo mientras se dibuja |
| Enderezar / tachar | ninguna | un temporizador por trazo, que se cancela al soltar. Reconocer una forma tarda ≤ 0,25 ms (con 3 000 puntos); comprobar si un trazo es un tachado, al soltarlo, ≤ 1,2 ms |
| Lazo | **sin lienzos extra**: el marco y la vista previa se pintan en el lienzo de tinta, y mover repinta solo la zona de la selección | cada cuadro cuesta, como mucho, lo que redibujar la hoja entera (6 ms en escritura densa, 37 ms en un dibujo muy pesado) |
| Láser | un lienzo del tamaño del área de trabajo, **solo mientras está activo** (se libera al salir) | se repinta un punto solo al mover el puntero; se detiene sola |
| Joystick | ninguna (un panel pequeño que se cierra solo al escribir) | el bucle de animación corre **solo mientras la bola está desplazada** |
| Cuadros de texto | un `<textarea>` ligero por cuadro (sin lienzos); su altura se mide solo al editar o cambiar el zoom | despreciable |
| Regla | dos lienzos de 24 px de grosor, **solo mientras está activa** (se liberan al apagarla) | se repinta con el desplazamiento o el movimiento del puntero, en una sola pasada por cuadro |
| Modo ahorro | **menos**: tope de resolución 1,25 en vez de 3 y mitad de presupuesto (72 MB en vez de 144 MB) | menos píxeles que repintar |
| Índice | miniaturas con tope de 40 (≈ 10 MB), **liberadas al cerrarlo**; se dibujan solo las visibles | una miniatura cada 15 ms |
| Copiar / compartir | un PNG (~100 KB–1 MB), reutilizado hasta que la hoja cambie | se prepara al pasar el puntero por el botón |

## Qué hacer si algo va lento

El panel **Recursos** marca en amarillo/rojo lo que se acerca al límite y sugiere qué hacer:

- *Memoria de los lienzos alta* → aleja el zoom o pasa a «Una hoja».
- *Muchos puntos en la hoja* (más de 400 mil) → sigue en una hoja nueva.
- *Redibujado o guardado lentos* → divide la hoja o aleja el zoom.
- «Vaciar miniaturas» libera su memoria al instante.

## Límites de esta medición

- Un solo equipo y navegador (Chromium) con pantalla 1×: en pantallas retina los lienzos ocupan hasta 4× más, por eso el tope de memoria. Safari y Firefox no se midieron.
- Memoria de pantalla gráfica (GPU) no se puede leer desde la página: se estima por las dimensiones de los lienzos.
- Los datos son sintéticos. Una tableta real genera trazos más densos o más ralos según su frecuencia de muestreo; la simplificación absorbe esa diferencia, pero los porcentajes (~⅔ menos puntos) pueden variar.
- Repintar solo una zona da el mismo dibujo que repintar toda la hoja (fuera de la zona no cambia ningún píxel), pero el navegador puede variar un píxel de borde por el antialiasing (≈ 0,3 % de los píxeles de la zona, imperceptible).
