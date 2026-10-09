/* Capa de texto: medidas del renglón y ajuste de líneas.
 *
 * El <textarea> y la exportación a PNG usan estas mismas medidas, así el texto
 * cae sobre los renglones del fondo tanto en pantalla como en la imagen. */
(function (C) {
  'use strict';

  const FONT = '"Avenir Next", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';
  const COLOR = '#1d2433';

  const PAD_TOP = 40;     // espacio en blanco antes del primer renglón
  const MARGIN_X = 72;    // x de la línea roja del margen
  const PAD_LEFT = 88;    // inicio del texto (a la derecha del margen)
  const PAD_RIGHT = 32;

  let mctx = null;
  function measureCtx(fontSize) {
    if (!mctx) mctx = document.createElement('canvas').getContext('2d');
    mctx.font = fontSize + 'px ' + FONT;
    return mctx;
  }

  const cache = new Map();

  /* Medidas para un espaciado de renglón dado (px). */
  function metrics(spacing) {
    if (cache.has(spacing)) return cache.get(spacing);
    const fontSize = Math.round(spacing * 0.56);
    const m = measureCtx(fontSize).measureText('Hxgj');
    const asc = m.fontBoundingBoxAscent !== undefined ? m.fontBoundingBoxAscent : fontSize * 0.93;
    const desc = m.fontBoundingBoxDescent !== undefined ? m.fontBoundingBoxDescent : fontSize * 0.25;
    // Línea base dentro de una caja de línea de altura `spacing`.
    const baseline = (spacing - (asc + desc)) / 2 + asc;
    const res = {
      spacing, fontSize, baseline,
      padTop: PAD_TOP, padLeft: PAD_LEFT, padRight: PAD_RIGHT, marginX: MARGIN_X,
      // y del primer renglón dibujado: justo debajo de la línea base del texto
      ruleY0: PAD_TOP + baseline + 2,
    };
    cache.set(spacing, res);
    return res;
  }

  /* Aplica tipografía y márgenes al <textarea>. */
  function apply(el, spacing, dark) {
    const m = metrics(spacing);
    el.style.fontFamily = FONT;
    el.style.fontSize = m.fontSize + 'px';
    el.style.lineHeight = spacing + 'px';
    el.style.color = C.theme.textColor(dark);
    el.style.caretColor = C.theme.caretColor(dark);
    // La altura del cuerpo se ajusta al contenido (ver Sheet.fitText): el resto de la hoja queda libre
    // para los cuadros de texto. La hoja crece antes de llegar al final, con 4 renglones de margen.
    el.style.padding = `${m.padTop}px ${m.padRight}px 0 ${m.padLeft}px`;
  }

  const BOX_PAD = 4;      // margen lateral de un cuadro de texto

  /* Tipografía de un cuadro de texto suelto: la misma que la del cuerpo, sin márgenes grandes.
   * Su primera línea cae sobre un renglón si el cuadro se coloca en y = padTop + k·espaciado. */
  function applyBox(el, spacing, dark) {
    const m = metrics(spacing);
    el.style.fontFamily = FONT;
    el.style.fontSize = m.fontSize + 'px';
    el.style.lineHeight = spacing + 'px';
    el.style.color = C.theme.textColor(dark);
    el.style.caretColor = C.theme.caretColor(dark);
    el.style.padding = `0 ${BOX_PAD}px`;
  }

  /* Parte `text` en líneas visuales como lo haría el textarea (pre-wrap,
   * corte en espacios, los espacios del final "cuelgan" fuera del ancho). */
  function wrap(text, spacing, width) {
    const ctx = measureCtx(metrics(spacing).fontSize);
    const w = (s) => ctx.measureText(s).width;
    const out = [];

    for (const para of String(text).split('\n')) {
      if (para === '') { out.push(''); continue; }
      let line = '';
      for (const tok of para.match(/\s+|\S+/g)) {
        if (/^\s/.test(tok)) { line += tok; continue; }
        if (w(line + tok) <= width) { line += tok; continue; }
        if (line.trim() !== '') {         // la palabra no cabe: salta a otra línea
          out.push(line);
          line = '';
          if (w(tok) <= width) { line = tok; continue; }
        }
        // La palabra sola es más ancha que la línea: córtala por caracteres.
        let piece = line;
        for (const ch of tok) {
          if (piece !== '' && w(piece + ch) > width) { out.push(piece); piece = ''; }
          piece += ch;
        }
        line = piece;
      }
      out.push(line);
    }
    return out;
  }

  // Tamaño lógico de una hoja: vertical 820 × 1160 · horizontal 1160 × 820 (proporción A4)
  C.PAGE_W = 820;
  C.LAND_W = 1160;
  C.pageWidth = (orient) => (orient === 'landscape' ? C.LAND_W : C.PAGE_W);
  C.defaultHeight = (orient) => (orient === 'landscape' ? 820 : 1160);
  C.text = { FONT, COLOR, BOX_PAD, metrics, apply, applyBox, wrap };
})(window.Cuaderno = window.Cuaderno || {});
