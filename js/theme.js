/* Tema de la hoja: colores del modo oscuro (por cuaderno).
 *
 * El modo oscuro NO cambia lo que está guardado: los trazos conservan su color
 * original (p. ej. negro) y solo se muestran con su equivalente claro. Así, al
 * desactivarlo todo vuelve a verse como se escribió. Con el modo oscuro apagado
 * esta capa no interviene en nada. */
(function (C) {
  'use strict';

  /* Equivalentes de los colores del panel sobre fondo oscuro. */
  const INK_DARK = {
    '#1f2937': '#f8fafc',   // negro  → blanco
    '#2563eb': '#e879f9',   // azul   → fucsia
    '#dc2626': '#a3e635',   // rojo   → verde lima
    '#16a34a': '#22d3ee',   // verde  → cian
    '#ea580c': '#fde047',   // naranja → amarillo
  };

  /* Papel oscuro: las dos opciones (blanco y crema) siguen existiendo, en versión oscura. */
  const PAPER_DARK = { white: '#1b1f27', cream: '#26221b' };

  /* Líneas y cuadrícula: misma geometría, tono atenuado para no deslumbrar. */
  const LINES_DARK = { ruled: '#3a4c69', margin: '#7a4242', grid: '#323d50', dots: '#667286' };

  const TEXT = { light: '#1d2433', dark: '#e8ecf4' };

  function parseHex(h) {
    h = String(h).trim().toLowerCase();
    if (/^#[0-9a-f]{3}$/.test(h)) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
    const m = /^#([0-9a-f]{6})/.exec(h);
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h / 6, s, l];
  }

  function hslToRgb(h, s, l) {
    if (s === 0) { const v = l * 255; return [v, v, v]; }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
  }

  const toHex = (rgb) => '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

  const cache = new Map();

  /* Color con el que se muestra un trazo. Los del panel tienen equivalente fijo; un
   * color personalizado oscuro se aclara conservando su tono, y uno claro se deja igual. */
  function inkColor(hex, dark) {
    if (!dark) return hex;
    const key = String(hex).toLowerCase();
    let out = cache.get(key);
    if (out) return out;
    out = INK_DARK[key];
    if (!out) {
      const rgb = parseHex(key);
      if (!rgb) out = hex;
      else {
        const [h, s, l] = rgbToHsl(...rgb);
        out = l >= 0.5 ? hex : toHex(hslToRgb(h, s, Math.min(0.97, Math.max(0.62, 1 - l))));
      }
    }
    if (cache.size < 500) cache.set(key, out);        // acotada: los colores propios pueden ser muchos
    return out;
  }

  C.theme = {
    inkColor,
    paperColor: (color) => PAPER_DARK[color] || PAPER_DARK.white,
    lines: LINES_DARK,
    textColor: (dark) => (dark ? TEXT.dark : TEXT.light),
    caretColor: (dark) => (dark ? '#8ab4ff' : '#2f6df6'),
  };
})(window.Cuaderno = window.Cuaderno || {});
