# AGENTS.md

Instrucciones del proyecto para asistentes de código (Claude Code, ZCode y cualquier otro agente). **Este archivo es la fuente única**: `CLAUDE.md` solo lo importa (ver «Compatibilidad entre herramientas»).

## Proyecto

MazzNote: app web de cuadernos de notas (teclado + lápiz de tableta) en HTML/CSS/JS puro. Documentación de usuario en `README.md`; análisis de rendimiento y topes de recursos en `RENDIMIENTO.md`. El idioma del proyecto (UI, comentarios, docs) es **español**.

## Comandos

No hay build, gestor de paquetes, linter ni tests. Se abre `index.html` directamente (`file://`) o con cualquier servidor estático. Los datos del navegador están ligados al origen: `file://` y `http://localhost` tienen notas distintas.

Banco de rendimiento: abrir la app, F12 → Console, pegar `tools/bench.js` y ejecutar `await __bench.todo()` (usa lienzos sintéticos, no toca los cuadernos reales).

## Arquitectura

Sin módulos ES ni bundler: cada archivo de `js/` es una IIFE `(function (C) {...})(window.Cuaderno = window.Cuaderno || {})` que cuelga su API de un espacio global único `Cuaderno` (p. ej. `C.text`, `C.storage`). **El orden de los `<script>` al final de `index.html` es el orden de dependencias**; un archivo nuevo debe añadirse ahí, tras lo que usa y antes de `app.js` (que arranca todo).

Capas, de abajo arriba:
- **Medidas y dibujo base**: `text.js` (renglón, tamaños de hoja, ajuste de líneas) es compartido por el `<textarea>` en pantalla y por la exportación PNG; así el texto cae sobre los renglones en ambos. `paper.js` dibuja el fondo, `theme.js` mapea colores del modo oscuro.
- **Tinta**: `shapes.js` (geometría pura de gestos: enderezar, tachado, esquinas, lazo) e `ink.js` (capa de lápiz por hoja: pinceles, presión, estabilizador, goma, lazo, deshacer propio por hoja).
- **Hoja**: `sheet.js` compone fondo + texto + tinta de una hoja y la escala con el zoom; `boxes.js` son los cuadros de texto sueltos.
- **Persistencia**: `storage.js` usa IndexedDB (`DB_VERSION` 3) con localStorage de respaldo; guarda una tabla de **resúmenes** aparte para que el arranque no lea hojas completas, y trazos en formato compacto. Cambios de esquema requieren subir `DB_VERSION` y migrar en `onupgradeneeded`, conservando hojas antiguas (las sin cuaderno van a «Mi cuaderno»).
- **Interfaz**: `app.js` (~2000 líneas) es el controlador central: cuadernos, libro abierto de dos hojas, zoom, menú contextual, modos, búsqueda, autoguardado, panel Recursos. `carousel.js`, `outline.js`, `laser.js`, `joystick.js`, `ruler.js`, `export.js` son piezas que `app.js` coordina.

## Invariantes importantes

- Los trazos se guardan como **vectores** (no píxeles), con color original; el modo oscuro solo cambia cómo se pintan, nunca lo guardado.
- La orientación es **por hoja**; las hojas horizontales se muestran solas y reinician el emparejamiento del libro.
- Los lienzos tienen topes de memoria (144 MB globales, 72 MB en Modo ahorro; miniaturas 60/40) y se liberan al ocultarse. Cualquier lienzo nuevo debe respetar esos topes y liberarse cuando no se use; en reposo la app debe estar a 0 % de CPU (sin temporizadores ni animaciones).
- Los trazos se simplifican al soltar el lápiz, con puntos de ancla en giros bruscos; las formas enderezadas dependen de eso.
- Zoom y resize se ajustan con CSS al instante y se repintan una sola vez al terminar; el repintado de goma/lazo es por zona, no de toda la hoja.
- Safari exige que `share` ocurra dentro del gesto de clic: la imagen se prepara al pasar el puntero por el botón.

## Compatibilidad entre herramientas

- **Para editar las instrucciones del proyecto, edita este archivo (`AGENTS.md`), nunca `CLAUDE.md`**: así Claude Code y ZCode siempre leen la misma línea.
- `CLAUDE.md` contiene únicamente la línea `@AGENTS.md` (sintaxis de importación de Claude Code), de modo que ambos asistentes cargan este mismo contenido en cada conversación.
- Lo específico de cada herramienta vive en su propio directorio y no duplica nada de aquí: `.claude/` (agentes, comandos y skills de Claude Code, hoy vacíos) y `~/.zcode/` (config global de ZCode del usuario, que ya trae preferencias personales). ZCode además puede importar con un clic las skills de `.claude/` desde su interfaz si algún día se añaden.
