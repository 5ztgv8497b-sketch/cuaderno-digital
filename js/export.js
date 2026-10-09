/* Exportar hojas a PNG o JSON, e importar hojas desde JSON. */
(function (C) {
  'use strict';

  const FORMAT = 'cuaderno-digital';
  const STYLES = ['ruled', 'grid', 'dots', 'blank'];
  const SPACINGS = [24, 32, 40];
  const PAPER_COLORS = ['white', 'cream'];

  function safeName(title) {
    const clean = String(title || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').trim();
    return clean || 'nota';
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  /* Compone fondo + texto + trazos de una hoja en un canvas aparte. `scale` es la
   * relación entre píxeles del canvas y píxeles lógicos (2 = nítido, 0.2 = miniatura).
   * opts.dark: con el modo oscuro del cuaderno. A escalas pequeñas los trazos se dibujan
   * en versión ligera (sin curvas ni puntos de más): una miniatura de una hoja con cientos
   * de miles de puntos cuesta una fracción. */
  function renderCanvas(note, width, scale, opts) {
    const dark = !!(opts && opts.dark);
    const S = note.paper.spacing;
    const m = C.text.metrics(S);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(width * scale));
    c.height = Math.max(1, Math.round(note.height * scale));
    const ctx = c.getContext('2d');
    ctx.scale(scale, scale);

    const hair = Math.max(1, 0.8 / scale);       // a escala pequeña, las líneas se engrosan para seguir viéndose
    C.paper.draw(ctx, width, note.height, Object.assign({}, note.paper, { ruleY0: m.ruleY0, marginX: m.marginX, hair, dark }));

    ctx.font = m.fontSize + 'px ' + C.text.FONT;
    ctx.fillStyle = C.theme.textColor(dark);
    ctx.textBaseline = 'alphabetic';
    const lines = C.text.wrap(note.text || '', S, width - m.padLeft - m.padRight);
    lines.forEach((line, i) => ctx.fillText(line, m.padLeft, m.padTop + i * S + m.baseline));
    for (const b of note.boxes || []) {            // cuadros de texto sueltos: mismo ajuste de líneas que en pantalla
      const bx = Math.min(b.x, width - 40), bw = Math.min(b.w, width - bx - 4);
      C.text.wrap(b.text || '', S, bw - 2 * C.text.BOX_PAD).forEach((line, i) => ctx.fillText(line, bx + C.text.BOX_PAD, b.y + i * S + m.baseline));
    }

    const lod = scale < 0.5 ? { step: 1.4 / scale, minWidth: 0.9 / scale } : null;
    C.ink.drawStrokes(ctx, note.strokes || [], { dark, lod });
    return c;
  }

  const toPngBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));

  async function pngBlob(note, width, opts) {
    const blob = await toPngBlob(renderCanvas(note, width, 2, opts));
    if (!blob) throw new Error('No se pudo generar la imagen');
    return blob;
  }

  /* `filename` es opcional: por defecto se usa el título de la hoja. */
  async function exportPNG(note, width, filename, opts) {
    download(await pngBlob(note, width, opts), filename || safeName(note.title) + '.png');
  }

  /* Varias hojas lado a lado en una sola imagen (como el libro abierto). */
  async function spreadBlob(notes, width, opts) {
    const scale = 2;
    const parts = notes.map((n) => renderCanvas(n, width, scale, opts));
    const out = document.createElement('canvas');
    out.width = parts.reduce((sum, c) => sum + c.width, 0);
    out.height = Math.max(...parts.map((c) => c.height));
    const ctx = out.getContext('2d');
    ctx.fillStyle = opts && opts.dark ? C.theme.paperColor('white') : '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);
    let x = 0;
    for (const c of parts) { ctx.drawImage(c, x, 0); x += c.width; c.width = c.height = 0; }   // libera cada parte al usarla
    const blob = await toPngBlob(out);
    out.width = out.height = 0;
    if (!blob) throw new Error('No se pudo generar la imagen');
    return blob;
  }

  async function exportSpreadPNG(notes, width, filename, opts) {
    download(await spreadBlob(notes, width, opts), filename);
  }

  /* Copia una imagen al portapapeles. `makeBlob` devuelve una promesa del PNG: se pasa sin
   * esperarla para que la copia empiece dentro del gesto del usuario (Safari lo exige). */
  async function copyImage(makeBlob) {
    if (!(navigator.clipboard && window.ClipboardItem)) throw Object.assign(new Error('Este navegador no permite copiar imágenes'), { code: 'unsupported' });
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': makeBlob() })]);
  }

  /* Abre el menú de compartir del sistema (en macOS: AirDrop, Mensajes, Mail, Contactos…). */
  async function shareImage(blob, filename, title) {
    const file = new File([blob], filename, { type: 'image/png' });
    if (!(navigator.share && navigator.canShare && navigator.canShare({ files: [file] }))) {
      throw Object.assign(new Error('Este navegador no puede compartir imágenes'), { code: 'unsupported' });
    }
    await navigator.share({ files: [file], title });
  }

  function exportJSON(note) {
    const data = { format: FORMAT, version: 1, exportedAt: new Date().toISOString(), note };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    download(blob, safeName(note.title) + '.json');
  }

  /* ───────── Importar ───────── */

  /* Valida y limpia un JSON importado. Devuelve una hoja nueva (id nuevo, sin cuaderno asignado). */
  function parseImport(text) {
    let data;
    try { data = JSON.parse(text); } catch (_) { throw new Error('El archivo no es un JSON válido'); }
    const n = data && data.note ? data.note : data;
    if (!n || typeof n !== 'object' || (!Array.isArray(n.strokes) && typeof n.text !== 'string')) {
      throw new Error('El archivo no parece una hoja del cuaderno');
    }

    const paper = n.paper || {};
    const strokes = (Array.isArray(n.strokes) ? n.strokes : [])
      .filter((s) => s && Array.isArray(s.points))
      .map((s) => ({
        id: C.ink.uid(),
        tool: ['marker', 'ball'].includes(s.tool) ? s.tool : 'pen',
        color: /^#[0-9a-f]{3,8}$/i.test(s.color) ? s.color : '#1f2937',
        size: Math.min(40, Math.max(0.5, Number(s.size) || 3)),
        points: s.points
          .filter((p) => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]))
          .map((p) => [+p[0], +p[1], isFinite(p[2]) ? +p[2] : 0.5]),
      }))
      .filter((s) => s.points.length);

    const boxes = (Array.isArray(n.boxes) ? n.boxes : [])
      .filter((b) => b && typeof b.text === 'string' && b.text.trim() && isFinite(b.x) && isFinite(b.y) && isFinite(b.w))
      .slice(0, 300)
      .map((b) => ({ id: C.ink.uid(), x: Math.max(0, +b.x), y: Math.max(0, +b.y), w: Math.min(1160, Math.max(120, +b.w)), h: Math.max(0, Number(b.h) || 0), text: b.text.slice(0, 20000) }));

    const now = Date.now();
    return {
      id: C.ink.uid(),
      title: typeof n.title === 'string' ? n.title.slice(0, 120) : '',
      createdAt: now,
      updatedAt: now,
      paper: {
        style: STYLES.includes(paper.style) ? paper.style : 'ruled',
        spacing: SPACINGS.includes(Number(paper.spacing)) ? Number(paper.spacing) : 32,
        color: PAPER_COLORS.includes(paper.color) ? paper.color : 'white',
      },
      text: typeof n.text === 'string' ? n.text : '',
      boxes,
      orient: n.orient === 'landscape' ? 'landscape' : 'portrait',
      strokes,
      height: Math.min(8000, Math.max(400, Number(n.height) || 1160)),
    };
  }

  C.exporter = { exportPNG, exportSpreadPNG, exportJSON, parseImport, renderCanvas, safeName, pngBlob, spreadBlob, copyImage, shareImage, download };
})(window.Cuaderno = window.Cuaderno || {});
