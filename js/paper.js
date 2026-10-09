/* Fondo de la hoja: rayado, cuadriculado, puntos o blanco.
 *
 * `draw` pinta sobre cualquier contexto 2D (la pantalla o el PNG exportado),
 * así hay una sola fuente de verdad para el aspecto del papel. */
(function (C) {
  'use strict';

  const COLORS = { white: '#ffffff', cream: '#fbf4e2' };

  /* o: { style, spacing, color, ruleY0, marginX } — coordenadas en px CSS. */
  function draw(ctx, w, h, o) {
    const S = o.spacing;
    const mx = o.marginX;
    const crisp = (v) => Math.round(v) + 0.5;
    // Primer múltiplo de S (hacia arriba) que cae sobre la rejilla de renglones.
    const firstY = o.ruleY0 - Math.floor(o.ruleY0 / S) * S;

    // `hair` engrosa las líneas finas cuando la hoja se dibuja muy reducida (miniaturas)
    const hair = o.hair || 1;

    // Modo oscuro: mismas líneas y cuadrícula, con el papel y el trazo en versión oscura
    const dark = !!o.dark;
    const L = dark ? C.theme.lines : null;

    ctx.save();
    ctx.fillStyle = dark ? C.theme.paperColor(o.color) : (COLORS[o.color] || COLORS.white);
    ctx.fillRect(0, 0, w, h);
    ctx.lineWidth = hair;

    if (o.style === 'ruled') {
      ctx.strokeStyle = dark ? L.ruled : '#a9c7e8';
      ctx.beginPath();
      for (let y = o.ruleY0; y < h; y += S) { ctx.moveTo(0, crisp(y)); ctx.lineTo(w, crisp(y)); }
      ctx.stroke();

      ctx.strokeStyle = dark ? L.margin : '#f0a3a3';   // línea roja del margen
      ctx.beginPath();
      ctx.moveTo(crisp(mx), 0);
      ctx.lineTo(crisp(mx), h);
      ctx.stroke();
    } else if (o.style === 'grid') {
      ctx.strokeStyle = dark ? L.grid : '#cdd8e5';
      ctx.beginPath();
      for (let y = firstY; y < h; y += S) { ctx.moveTo(0, crisp(y)); ctx.lineTo(w, crisp(y)); }
      for (let x = mx % S; x < w; x += S) { ctx.moveTo(crisp(x), 0); ctx.lineTo(crisp(x), h); }
      ctx.stroke();
    } else if (o.style === 'dots') {
      ctx.fillStyle = dark ? L.dots : '#9aa7b6';
      ctx.beginPath();
      for (let y = firstY; y < h; y += S) {
        for (let x = mx % S; x < w; x += S) {
          ctx.moveTo(x + 1.2 * hair, y);
          ctx.arc(x, y, 1.2 * hair, 0, Math.PI * 2);
        }
      }
      ctx.fill();
    }
    ctx.restore();
  }

  C.paper = { COLORS, draw };
})(window.Cuaderno = window.Cuaderno || {});
