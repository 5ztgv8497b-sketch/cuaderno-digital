/* Capa de lápiz: trazos vectoriales con presión, borrador y deshacer.
 *
 * Los trazos se guardan como vectores ({tool, color, size, points:[[x,y,presión]]})
 * y no como píxeles, así borrar, deshacer y exportar no pierden calidad.
 * El arreglo `strokes` nunca se modifica en su sitio: cada cambio crea uno
 * nuevo, de modo que el historial de deshacer es solo una pila de referencias.
 *
 * `create()` devuelve una capa independiente: cada hoja tiene la suya, con su
 * propio historial. Las opciones de herramienta (color, grosor…) se comparten.
 *
 * Protecciones de rendimiento (ver RENDIMIENTO.md):
 *  - Al soltar el lápiz el trazo se simplifica (se quitan puntos que no aportan).
 *  - Borrar o dibujar con marcador repinta solo la zona afectada, no toda la hoja.
 *  - Los trazos de presión constante o de bolígrafo se pintan de un solo trazado,
 *    y los de presión variable se agrupan por grosor: muchísimas menos llamadas al canvas.
 *
 * Ayudas del lápiz: estabilizador (suaviza el temblor), mantener quieto para enderezar la forma,
 * tachar para borrar, y el lazo para seleccionar, mover, escalar, copiar y recolorear trazos. */
(function (C) {
  'use strict';

  const MAX_UNDO = 100;
  const MARKER_ALPHA = 0.35;
  const SIMPLIFY_TOL = 0.2;          // px lógicos: por debajo de esto un punto no se nota
  const PRESSURE_WEIGHT = 4;         // 0,05 de presión pesa como 0,2 px al simplificar
  const WIDTH_STEP = 0.2;            // los segmentos con grosor casi igual se pintan juntos

  const STAB_TAU = [0, 18, 40, 75];  // estabilizador: constante de tiempo del filtro (ms) por nivel
  const HOLD_MS = 550;               // quieto este tiempo con el lápiz apoyado: la forma se endereza
  const HOLD_ARROW_MS = 650;         // si sigue quieto tras enderezar una recta, pasa a flecha
  const HOLD_RADIUS = 3.5;           // px de pantalla que cuentan como «quieto»
  const ACCENT = '#2f6df6';
  const HANDLE = 5;                  // mitad del lado de los tiradores de la selección (px de pantalla)
  const SEL_PAD = 4;                 // separación entre los trazos y el marco de la selección (px de pantalla)

  let uidN = 0;
  const uid = () => Date.now().toString(36) + (uidN++).toString(36) + Math.random().toString(36).slice(2, 6);
  const r1 = (v) => Math.round(v * 10) / 10;
  const r2 = (v) => Math.round(v * 100) / 100;

  /* ───────── Dibujo ───────── */

  /* Pinceles: 'pen' (lápiz, el grosor sigue la presión), 'ball' (bolígrafo, grosor fijo)
   * y 'marker' (marcador ancho y translúcido). */
  const widthAt = (s, p) => {
    if (s.tool === 'marker') return s.size * 3;
    if (s.tool === 'ball') return s.size;
    return Math.max(0.5, s.size * (0.3 + 0.9 * p));
  };
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

  function setPenStyle(c, s, dark) {
    const col = C.theme.inkColor(s.color, dark);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.strokeStyle = col;
    c.fillStyle = col;
  }

  function drawDot(c, s) {
    const p = s.points[0];
    c.beginPath();
    c.arc(p[0], p[1], widthAt(s, p[2]) / 2, 0, Math.PI * 2);
    c.fill();
  }

  /* Extremos y punto de control del segmento j de un trazo. Los vértices son los
   * puntos medios entre muestras y cada muestra actúa de punto de control de una
   * curva cuadrática, lo que suaviza el trazo. */
  function segmentGeometry(pts, j) {
    const n = pts.length;
    if (j === 0) return [pts[0], mid(pts[0], pts[1]), null];
    if (j === n - 1) return [mid(pts[n - 2], pts[n - 1]), pts[n - 1], null];
    return [mid(pts[j - 1], pts[j]), mid(pts[j], pts[j + 1]), pts[j]];
  }

  function addSegment(c, pts, j, first) {
    const [a, b, ctrl] = segmentGeometry(pts, j);
    if (first) c.moveTo(a[0], a[1]);
    if (ctrl) c.quadraticCurveTo(ctrl[0], ctrl[1], b[0], b[1]);
    else c.lineTo(b[0], b[1]);
  }

  /* Un segmento suelto (se usa al dibujar en vivo: cada muestra nueva pinta el suyo). */
  function drawSegment(c, s, j) {
    c.lineWidth = widthAt(s, s.points[j][2]);
    c.beginPath();
    addSegment(c, s.points, j, true);
    c.stroke();
  }

  /* Todo el trazo en un solo trazado suavizado. */
  function pathStroke(c, pts) {
    const n = pts.length;
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < n - 1; i++) {
      const m = mid(pts[i], pts[i + 1]);
      c.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
    }
    c.lineTo(pts[n - 1][0], pts[n - 1][1]);
    c.stroke();
  }

  function isUniform(pts) {
    const p0 = pts[0][2];
    for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i][2] - p0) > 0.02) return false;
    return true;
  }

  /* Presión variable: los segmentos consecutivos con el mismo grosor (a 0,2 px) se
   * pintan en un único trazado; los cambios de grosor son imperceptibles. */
  function drawVariable(c, s) {
    const pts = s.points, n = pts.length;
    const q = (j) => Math.round(widthAt(s, pts[j][2]) / WIDTH_STEP);
    let j = 0;
    while (j < n) {
      const key = q(j);
      let k = j;
      while (k + 1 < n && q(k + 1) === key) k++;
      c.lineWidth = widthAt(s, pts[j][2]);
      c.beginPath();
      for (let t = j; t <= k; t++) addSegment(c, pts, t, t === j);
      c.stroke();
      j = k + 1;
    }
  }

  function drawStroke(c, s, dark) {
    const pts = s.points, n = pts.length;
    if (!n) return;
    setPenStyle(c, s, dark);
    if (s.tool === 'marker') {
      // Un solo trazado: así el translúcido no se oscurece donde se solapa consigo mismo.
      c.globalAlpha = MARKER_ALPHA;
      c.lineWidth = widthAt(s, 0.5);
      if (n === 1) drawDot(c, s); else pathStroke(c, pts);
      c.globalAlpha = 1;
    } else if (n === 1) {
      drawDot(c, s);
    } else if (s.tool === 'ball' || isUniform(pts)) {
      c.lineWidth = widthAt(s, pts[0][2]);
      pathStroke(c, pts);
    } else {
      drawVariable(c, s);
    }
  }

  /* Versión reducida para miniaturas y vistas muy alejadas: una línea por trazo, sin
   * curvas y saltándose los puntos más cercanos que `step` (en px lógicos). */
  function drawStrokeLOD(c, s, dark, step, minWidth) {
    const pts = s.points, n = pts.length;
    if (!n) return;
    setPenStyle(c, s, dark);
    c.lineWidth = Math.max(widthAt(s, 0.5), minWidth);
    if (s.tool === 'marker') c.globalAlpha = MARKER_ALPHA;
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    let lx = pts[0][0], ly = pts[0][1];
    const step2 = step * step;
    for (let i = 1; i < n; i++) {
      const dx = pts[i][0] - lx, dy = pts[i][1] - ly;
      if (dx * dx + dy * dy >= step2 || i === n - 1) { c.lineTo(pts[i][0], pts[i][1]); lx = pts[i][0]; ly = pts[i][1]; }
    }
    if (n === 1) c.lineTo(pts[0][0] + 0.01, pts[0][1]);
    c.stroke();
    c.globalAlpha = 1;
  }

  /* Pinta una lista de trazos en cualquier contexto (exportación, miniaturas).
   * opts: { dark, lod: { step, minWidth } } */
  function drawStrokes(c, list, opts) {
    const dark = !!(opts && opts.dark);
    const lod = opts && opts.lod;
    c.save();
    for (const s of list) {
      if (lod) drawStrokeLOD(c, s, dark, lod.step, lod.minWidth); else drawStroke(c, s, dark);
    }
    c.restore();
  }

  /* ───────── Simplificación ───────── */

  /* Ramer–Douglas–Peucker en x, y y presión: quita los puntos que quedan a menos de
   * `tol` px de la línea que une a sus vecinos. La escritura a mano suele perder
   * entre la mitad y dos tercios de sus puntos sin ningún cambio visible (las esquinas se
   * conservan: ver anchorCorners en shapes.js). */
  function simplify(pts, tol) {
    const n = pts.length;
    if (n < 3) return pts;
    if (n === 3) return C.shapes.anchorCorners(pts);
    const keep = new Uint8Array(n);
    keep[0] = keep[n - 1] = 1;
    const stack = [0, n - 1];
    const tol2 = tol * tol;
    while (stack.length) {
      const b = stack.pop(), a = stack.pop();
      if (b <= a + 1) continue;
      const pa = pts[a], pb = pts[b];
      const dx = pb[0] - pa[0], dy = pb[1] - pa[1];
      const len2 = dx * dx + dy * dy;
      let maxD = 0, idx = -1;
      for (let i = a + 1; i < b; i++) {
        const p = pts[i];
        let t = len2 ? ((p[0] - pa[0]) * dx + (p[1] - pa[1]) * dy) / len2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = pa[0] + t * dx - p[0], ey = pa[1] + t * dy - p[1];
        const dp = (p[2] - (pa[2] + (pb[2] - pa[2]) * t)) * PRESSURE_WEIGHT;
        const d2 = ex * ex + ey * ey + dp * dp;
        if (d2 > maxD) { maxD = d2; idx = i; }
      }
      if (maxD > tol2) { keep[idx] = 1; stack.push(a, idx, idx, b); }
    }
    const out = [];
    for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i]);
    // Entre dos puntos lejanos la curva redondearía las esquinas: se vuelven a clavar
    return C.shapes.anchorCorners(out);
  }

  /* ───────── Geometría para el borrador ───────── */

  const bboxCache = new WeakMap();

  function computeBox(s) {
    const b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const p of s.points) {
      if (p[0] < b[0]) b[0] = p[0];
      if (p[1] < b[1]) b[1] = p[1];
      if (p[0] > b[2]) b[2] = p[0];
      if (p[1] > b[3]) b[3] = p[1];
    }
    return b;
  }

  /* Caja de un trazo ya terminado (se guarda en caché: los trazos no se modifican). */
  function bbox(s) {
    let b = bboxCache.get(s);
    if (!b) { b = computeBox(s); bboxCache.set(s, b); }
    return b;
  }

  const halfWidth = (s) => s.tool === 'marker' ? s.size * 1.5 : s.tool === 'ball' ? s.size * 0.5 : s.size * 0.6;
  const dist2 = (p, x, y) => (p[0] - x) * (p[0] - x) + (p[1] - y) * (p[1] - y);

  function segDist2(x, y, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((x - a[0]) * dx + (y - a[1]) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px = a[0] + t * dx - x, py = a[1] + t * dy - y;
    return px * px + py * py;
  }

  /* ¿Toca el círculo del borrador (x, y, r) la parte visible del trazo? */
  function strokeHit(s, x, y, r) {
    const rr = r + halfWidth(s);
    const b = bbox(s);
    if (x < b[0] - rr || x > b[2] + rr || y < b[1] - rr || y > b[3] + rr) return false;
    const pts = s.points;
    if (pts.length === 1) return dist2(pts[0], x, y) <= rr * rr;
    for (let i = 1; i < pts.length; i++) {
      if (segDist2(x, y, pts[i - 1], pts[i]) <= rr * rr) return true;
    }
    return false;
  }

  /* Goma de área: quita los puntos bajo el círculo y devuelve los tramos que
   * sobreviven como trazos nuevos. null si el trazo queda igual. */
  function cutStroke(s, x, y, r) {
    const rr = r + halfWidth(s);
    const src = s.points;
    if (src.length === 1) return [];

    // Inserta puntos intermedios solo en los segmentos que cruzan el círculo,
    // para que un segmento largo se corte con precisión.
    const gap = Math.max(1, Math.min(4, rr * 0.25));
    const dense = [src[0]];
    for (let i = 1; i < src.length; i++) {
      const a = src[i - 1], b = src[i];
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (d > gap && segDist2(x, y, a, b) <= rr * rr) {
        const steps = Math.ceil(d / gap);
        for (let k = 1; k < steps; k++) {
          const t = k / steps;
          dense.push([r1(a[0] + (b[0] - a[0]) * t), r1(a[1] + (b[1] - a[1]) * t), r2(a[2] + (b[2] - a[2]) * t)]);
        }
      }
      dense.push(b);
    }

    const runs = [];
    let cur = [];
    for (const p of dense) {
      if (dist2(p, x, y) > rr * rr) cur.push(p);
      else { if (cur.length) runs.push(cur); cur = []; }
    }
    if (cur.length) runs.push(cur);

    if (runs.length === 1 && runs[0].length === dense.length) return null;
    // Los tramos que sobreviven se simplifican: así borrar no infla la cantidad de puntos
    return runs.filter((run) => run.length >= 2).map((run) => ({ ...s, id: uid(), points: simplify(run, SIMPLIFY_TOL) }));
  }

  /* ───────── Punteros ───────── */

  const isPenEraser = (e) => e.pointerType === 'pen' && (e.button === 5 || (e.buttons & 32) !== 0);

  function pressureOf(e) {
    const p = e.pointerType === 'pen' ? e.pressure : 0.5;
    return p > 0 ? p : 0.5;
  }

  /* ───────── Capa de lápiz de una hoja ───────── */

  /* o: { canvas, cursor, options, callbacks }
   *  - options: objeto compartido { tool, color, size, eraserMode, eraserSize, penOnly, stabilize, holdShape, scratch }
   *  - callbacks: change, history, extent(maxY), scrollBy(dy), selection(info | null), notice(texto) */
  function create(o) {
    const canvas = o.canvas;
    const ctx = canvas.getContext('2d');
    const cursorEl = o.cursor;
    const opt = o.options;
    const cb = Object.assign({ change() {}, history() {}, extent() {}, scrollBy() {}, selection() {}, notice() {} }, o.callbacks);

    let width = 0, height = 0, ratio = 1;      // tamaño lógico de la hoja y densidad de píxeles
    let mode = 'text';                         // 'text' | 'pen' | 'eraser' | 'lasso' | 'laser'
    let dark = false;
    let strokes = [];
    let undoStack = [], redoStack = [];
    let gesture = null;                        // gesto en curso (un solo puntero a la vez)
    let rafId = 0;
    let dirty = null;                          // zona pendiente de repintar [x0,y0,x1,y1] (px lógicos)
    let fullDirty = false;
    let lastRedrawMs = 0;
    let viewScale = 1;                         // px de pantalla por px lógico (lo fija la hoja con el zoom)
    let sel = null;                            // selección del lazo: { set: Set de trazos, box: [x0,y0,x1,y1] }
    let xf = null;                             // mover/escalar en curso: { set, ox, oy, dx, dy, k }
    let chromeRect = null;                     // zona donde está pintado el marco de la selección

    /* La caja del trazo que se está dibujando crece: no puede usar la caché. */
    const boxOf = (s) => (gesture && gesture.stroke === s ? computeBox(s) : bbox(s));
    const hidden = (s) => xf && xf.set.has(s);   // trazos que se están moviendo: se pintan aparte
    const unionBox = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
    const kLogical = () => 1 / (viewScale || 1);

    function redrawAll() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      for (const s of strokes) if (!hidden(s)) drawStroke(ctx, s, dark);
      drawOverlays();
    }

    /* Repinta solo un rectángulo: lo borra y vuelve a dibujar los trazos que lo tocan,
     * recortados a él, de modo que la mezcla de transparencias queda exacta. */
    function redrawRect(r) {
      const dx0 = Math.max(0, Math.floor(r[0] * ratio) - 1), dy0 = Math.max(0, Math.floor(r[1] * ratio) - 1);
      const dx1 = Math.min(canvas.width, Math.ceil(r[2] * ratio) + 1), dy1 = Math.min(canvas.height, Math.ceil(r[3] * ratio) + 1);
      if (dx1 <= dx0 || dy1 <= dy0) return;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.beginPath();
      ctx.rect(dx0, dy0, dx1 - dx0, dy1 - dy0);
      ctx.clip();
      ctx.clearRect(dx0, dy0, dx1 - dx0, dy1 - dy0);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const lx0 = dx0 / ratio, ly0 = dy0 / ratio, lx1 = dx1 / ratio, ly1 = dy1 / ratio;
      for (const s of strokes) {
        if (hidden(s)) continue;
        const b = boxOf(s), pad = halfWidth(s) + 1;
        if (b[2] + pad < lx0 || b[0] - pad > lx1 || b[3] + pad < ly0 || b[1] - pad > ly1) continue;
        drawStroke(ctx, s, dark);
      }
      drawOverlays();
      ctx.restore();
    }

    function flush() {
      rafId = 0;
      const t0 = performance.now();
      if (fullDirty || !dirty) redrawAll(); else redrawRect(dirty);
      dirty = null;
      fullDirty = false;
      lastRedrawMs = performance.now() - t0;
    }

    /* Sin argumentos repinta toda la hoja; con una zona [x0,y0,x1,y1] solo esa. */
    function scheduleRedraw(rect) {
      if (!rect) fullDirty = true;
      else if (!fullDirty) {
        if (!dirty) dirty = rect.slice();
        else {
          dirty[0] = Math.min(dirty[0], rect[0]); dirty[1] = Math.min(dirty[1], rect[1]);
          dirty[2] = Math.max(dirty[2], rect[2]); dirty[3] = Math.max(dirty[3], rect[3]);
        }
      }
      if (!rafId) rafId = requestAnimationFrame(flush);
    }

    /* ── Selección: marco, tiradores y vista previa del movimiento ── */

    function currentBox() {
      if (!sel) return null;
      const b = sel.box;
      if (!xf) return b;
      const f = (x, y) => [xf.ox + (x - xf.ox) * xf.k + xf.dx, xf.oy + (y - xf.oy) * xf.k + xf.dy];
      const p = f(b[0], b[1]), q = f(b[2], b[3]);
      return [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])];
    }

    const chromeBounds = (b) => { const m = (SEL_PAD + HANDLE + 3) * kLogical(); return [b[0] - m, b[1] - m, b[2] + m, b[3] + m]; };

    /* Lo que va encima de los trazos: los que se están moviendo (con la transformación aplicada
     * al contexto, así el grosor escala igual) y el marco de la selección. */
    function drawOverlays() {
      if (xf) {
        ctx.save();
        ctx.translate(xf.ox + xf.dx, xf.oy + xf.dy);
        ctx.scale(xf.k, xf.k);
        ctx.translate(-xf.ox, -xf.oy);
        for (const s of xf.set) drawStroke(ctx, s, dark);
        ctx.restore();
      }
      const b = currentBox();
      if (!b) return;
      const k = kLogical(), pad = SEL_PAD * k, hs = HANDLE * k;
      const x0 = b[0] - pad, y0 = b[1] - pad, x1 = b[2] + pad, y1 = b[3] + pad;
      ctx.save();
      ctx.fillStyle = 'rgba(47, 109, 246, 0.06)';
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 1.5 * k;
      ctx.setLineDash([6 * k, 4 * k]);
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      ctx.setLineDash([]);
      ctx.fillStyle = '#fff';
      for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) {
        ctx.beginPath();
        ctx.rect(x - hs, y - hs, hs * 2, hs * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    /* Repinta el marco donde estaba y donde está ahora (y `extra`, si se indica). */
    function repaintChrome(extra) {
      const b = currentBox();
      const nb = b ? chromeBounds(b) : null;
      let r = nb;
      if (chromeRect) r = r ? unionBox(r, chromeRect) : chromeRect;
      if (extra) r = r ? unionBox(r, extra) : extra;
      chromeRect = nb;
      if (r) scheduleRedraw(r);
    }

    function selBoxOf(list) {
      let r = null;
      for (const s of list) {
        const b = bbox(s), pad = halfWidth(s);
        const t = [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad];
        r = r ? unionBox(r, t) : t;
      }
      return r;
    }

    const selInfo = () => (sel ? { box: sel.box.slice(), count: sel.set.size } : null);

    function setSelection(list) {
      sel = list.length ? { set: new Set(list), box: selBoxOf(list) } : null;
      xf = null;
      repaintChrome();
      cb.selection(selInfo());
    }

    function clearSelection() {
      if (!sel) return;
      sel = null;
      xf = null;
      repaintChrome();
      cb.selection(null);
    }

    /* ¿Qué hay bajo el punto (x, y) de la selección? 'nw' | 'ne' | 'se' | 'sw' (tiradores), 'move' o null. */
    function selectionHit(x, y) {
      if (!sel) return null;
      const b = sel.box, k = kLogical(), pad = SEL_PAD * k, r = 12 * k;
      const corners = { nw: [b[0] - pad, b[1] - pad], ne: [b[2] + pad, b[1] - pad], se: [b[2] + pad, b[3] + pad], sw: [b[0] - pad, b[3] + pad] };
      for (const key in corners) if (Math.abs(x - corners[key][0]) <= r && Math.abs(y - corners[key][1]) <= r) return key;
      return x >= b[0] - pad && x <= b[2] + pad && y >= b[1] - pad && y <= b[3] + pad ? 'move' : null;
    }

    /* Reemplaza trazos seleccionados por otros (movidos, escalados, recoloreados): un paso de deshacer. */
    function replaceSelected(map) {
      const before = strokes;
      strokes = strokes.map((s) => map.get(s) || s);
      sel = { set: new Set(map.values()), box: selBoxOf([...map.values()]) };
      xf = null;
      commit(before);
      repaintChrome();
      cb.selection(selInfo());
    }

    function transformStroke(s, x) {
      return {
        ...s,
        id: uid(),
        size: Math.min(40, Math.max(0.5, r2(s.size * x.k))),
        points: s.points.map((p) => [r1(x.ox + (p[0] - x.ox) * x.k + x.dx), r1(x.oy + (p[1] - x.oy) * x.k + x.dy), p[2]]),
      };
    }

    function maxYOf(list) {
      let m = 0;
      for (const s of list) for (const p of s.points) if (p[1] > m) m = p[1];
      return m;
    }

    function finishTransform() {
      const x = xf;
      if (!x || (Math.abs(x.dx) < 0.2 && Math.abs(x.dy) < 0.2 && Math.abs(x.k - 1) < 0.005)) {
        xf = null;
        repaintChrome();
        cb.selection(selInfo());
        return;
      }
      const map = new Map();
      for (const s of x.set) map.set(s, transformStroke(s, x));
      replaceSelected(map);
      cb.extent(maxYOf(map.values()));
    }

    function finishLasso(g) {
      const k = kLogical();
      const bb = C.shapes.boxOf(g.pts), m = 4 * k;
      if (g.len < 8 * k || g.pts.length < 3) {                 // un toque: elige el trazo que haya debajo
        const p = g.pts[0];
        let hit = null;
        for (let i = strokes.length - 1; i >= 0 && !hit; i--) if (strokeHit(strokes[i], p[0], p[1], 6 * k)) hit = strokes[i];
        setSelection(hit ? [hit] : []);
      } else {
        const poly = C.shapes.rdp(g.pts, 1.2 * k);
        const inside = (x, y) => C.shapes.pointInPolygon(x, y, poly);
        const list = [];
        for (const s of strokes) {
          const b = bbox(s);
          if (b[2] < bb[0] || b[0] > bb[2] || b[3] < bb[1] || b[1] > bb[3]) continue;
          if (C.shapes.insideFraction(s.points, inside) >= 0.5) list.push(s);
        }
        setSelection(list);
      }
      scheduleRedraw([bb[0] - m, bb[1] - m, bb[2] + m, bb[3] + m]);     // borra el trazo del lazo
    }

    function lassoDown(e, pt) {
      const hit = selectionHit(pt[0], pt[1]);
      if (!hit) {
        clearSelection();
        gesture = { type: 'lasso', id: e.pointerId, pts: [pt], len: 0 };
        return;
      }
      const b = sel.box;
      const anchor = { nw: [b[2], b[3]], ne: [b[0], b[3]], se: [b[0], b[1]], sw: [b[2], b[1]] }[hit] || [0, 0];
      xf = { set: sel.set, ox: anchor[0], oy: anchor[1], dx: 0, dy: 0, k: 1 };
      gesture = { type: hit === 'move' ? 'move' : 'scale', id: e.pointerId, start: pt };
      cb.selection(null);                  // la barra de la selección se oculta mientras se arrastra
      repaintChrome();
    }

    function hoverLasso(x, y) {
      const h = selectionHit(x, y);
      canvas.style.cursor = h === 'move' ? 'move' : h === 'nw' || h === 'se' ? 'nwse-resize' : h ? 'nesw-resize' : '';
    }

    /* Copia de los trazos seleccionados (para pegarlos en esta u otra hoja). */
    function copySelection() {
      if (!sel) return null;
      return [...sel.set].map((s) => ({ tool: s.tool, color: s.color, size: s.size, points: s.points.map((p) => p.slice()) }));
    }

    /* Añade trazos copiados, desplazados (dx, dy) y dentro de la hoja; quedan seleccionados. */
    function paste(list, dx = 0, dy = 0) {
      if (!list || !list.length) return;
      let made = list.map((s) => ({ id: uid(), tool: s.tool, color: s.color, size: s.size, points: s.points.map((p) => [r1(p[0] + dx), r1(p[1] + dy), p[2]]) }));
      const b = selBoxOf(made);
      let sx = 0, sy = 0;
      if (width) {
        if (b[2] > width - 6) sx = width - 6 - b[2];
        if (b[0] + sx < 6) sx = 6 - b[0];
      }
      if (b[1] + sy < 6) sy = 6 - b[1];
      if (sx || sy) made = made.map((s) => ({ ...s, points: s.points.map((p) => [r1(p[0] + sx), r1(p[1] + sy), p[2]]) }));
      const before = strokes;
      strokes = strokes.concat(made);
      sel = { set: new Set(made), box: selBoxOf(made) };
      commit(before);
      repaintChrome();
      cb.selection(selInfo());
      cb.extent(maxYOf(made));
    }

    const duplicateSelection = () => { const list = copySelection(); if (list) paste(list, 24, 24); };

    function recolorSelection(hex) {
      if (!sel) return;
      const map = new Map();
      for (const s of sel.set) if (s.color !== hex) map.set(s, { ...s, id: uid(), color: hex });
      if (map.size) {
        const keep = [...sel.set].filter((s) => !map.has(s));
        const before = strokes;
        strokes = strokes.map((s) => map.get(s) || s);
        sel = { set: new Set([...keep, ...map.values()]), box: sel.box };
        commit(before);
        repaintChrome(chromeRect);
        cb.selection(selInfo());
      }
    }

    function deleteSelection() {
      if (!sel) return false;
      const before = strokes, gone = sel.set;
      strokes = strokes.filter((s) => !gone.has(s));
      sel = null;
      commit(before);
      repaintChrome();
      cb.selection(null);
      return true;
    }

    /* ── Borrador ── */

    function eraseAt(x, y) {
      const r = opt.eraserSize / 2;
      const next = [];
      let changed = false;
      let rect = null;
      const touch = (s) => {          // zona que ocupaba el trazo antes de cambiar
        const b = bbox(s), pad = halfWidth(s) + 1;
        const t = [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad];
        rect = rect ? unionBox(rect, t) : t;
      };
      for (const s of strokes) {
        if (!strokeHit(s, x, y, r)) { next.push(s); continue; }
        if (opt.eraserMode === 'stroke') { changed = true; touch(s); continue; }
        const parts = cutStroke(s, x, y, r);
        if (parts === null) { next.push(s); continue; }
        changed = true;
        touch(s);
        for (const p of parts) next.push(p);
      }
      if (changed) { strokes = next; scheduleRedraw(rect); }
    }

    /* Recorre el tramo entre dos posiciones para no saltarse trazos si el puntero va rápido. */
    function eraseAlong(from, to) {
      const step = Math.max(2, opt.eraserSize * 0.25);
      const d = Math.hypot(to[0] - from[0], to[1] - from[1]);
      const n = Math.max(1, Math.ceil(d / step));
      for (let i = 1; i <= n; i++) {
        eraseAt(from[0] + (to[0] - from[0]) * i / n, from[1] + (to[1] - from[1]) * i / n);
      }
    }

    /* ── Historial ── */

    function commit(before) {
      undoStack.push(before);
      if (undoStack.length > MAX_UNDO) undoStack.shift();
      redoStack = [];
      cb.change();
      cb.history();
    }

    function undo() {
      if (gesture || !undoStack.length) return false;
      clearSelection();
      redoStack.push(strokes);
      strokes = undoStack.pop();
      scheduleRedraw();
      cb.change();
      cb.history();
      return true;
    }

    function redo() {
      if (gesture || !redoStack.length) return false;
      clearSelection();
      undoStack.push(strokes);
      strokes = redoStack.pop();
      scheduleRedraw();
      cb.change();
      cb.history();
      return true;
    }

    /* ── Punteros ── */

    /* La hoja puede estar escalada con CSS: se convierte de píxeles de pantalla a
     * coordenadas lógicas de la hoja dividiendo por la escala actual. */
    const kOf = (rect) => (rect.width && width ? width / rect.width : 1);
    const toPoint = (e, rect, k) => [r1((e.clientX - rect.left) * k), r1((e.clientY - rect.top) * k), r2(pressureOf(e))];

    function capture(e) {
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* el puntero ya no está activo */ }
    }

    function showCursor(x, y) {
      const d = opt.eraserSize;
      cursorEl.style.display = 'block';
      cursorEl.style.width = cursorEl.style.height = d + 'px';
      cursorEl.style.transform = `translate(${x - d / 2}px, ${y - d / 2}px)`;
    }
    function hideCursor() { cursorEl.style.display = 'none'; }

    /* Zona que ocupan los puntos desde `from` (más un par anteriores, que cambian de curva). */
    function tailRect(s, from) {
      const pts = s.points;
      const pad = halfWidth(s) + 2;
      const r = [Infinity, Infinity, -Infinity, -Infinity];
      for (let i = Math.max(0, from - 3); i < pts.length; i++) {
        const p = pts[i];
        if (p[0] < r[0]) r[0] = p[0]; if (p[1] < r[1]) r[1] = p[1];
        if (p[0] > r[2]) r[2] = p[0]; if (p[1] > r[3]) r[3] = p[1];
      }
      return [r[0] - pad, r[1] - pad, r[2] + pad, r[3] + pad];
    }

    /* ── Dibujar: estabilizador, enderezar y tachar ── */

    function startDraw(e, pt) {
      const s = { id: uid(), tool: opt.tool, color: opt.color, size: opt.size, points: [pt] };
      const tau = STAB_TAU[Math.max(0, Math.min(3, opt.stabilize | 0))];
      gesture = {
        type: 'draw', id: e.pointerId, before: strokes, stroke: s, drawn: 0,
        tau, fx: pt[0], fy: pt[1], fp: pt[2], ft: e.timeStamp,      // estado del estabilizador
        raw: pt, rawPts: tau ? [pt] : null,                          // posiciones reales del lápiz (sin suavizar)
        ax: pt[0], ay: pt[1], holdTimer: 0, snapped: null, pressure: 0.5,
      };
      strokes = strokes.concat(s);
      if (s.tool === 'marker') scheduleRedraw(tailRect(s, 0));
      armHold(gesture);
    }

    /* Filtro exponencial con constante de tiempo: la línea sigue al lápiz con un pequeño retraso
     * y el temblor (oscilaciones rápidas) casi desaparece. Depende del tiempo, no de cuántas
     * muestras llegan, así que se comporta igual con una tableta o con el ratón. */
    function smooth(g, ev, raw) {
      let dt = ev.timeStamp - g.ft;
      if (!(dt >= 1)) dt = 5;
      g.ft = ev.timeStamp;
      const a = 1 - Math.exp(-Math.min(60, dt) / g.tau);
      g.fx += (raw[0] - g.fx) * a;
      g.fy += (raw[1] - g.fy) * a;
      g.fp += (raw[2] - g.fp) * a;
      return [r1(g.fx), r1(g.fy), r2(g.fp)];
    }

    /* Al soltar, el estabilizador va un paso por detrás: se cierra el trazo donde está el lápiz. */
    function catchUp(g) {
      const s = g.stroke, last = s.points[s.points.length - 1], raw = g.raw;
      if (!raw || dist2(last, raw[0], raw[1]) < 0.09) return;
      for (const t of [0.5, 1]) s.points.push([r1(last[0] + (raw[0] - last[0]) * t), r1(last[1] + (raw[1] - last[1]) * t), r2(last[2] + (raw[2] - last[2]) * t)]);
    }

    /* Con el lápiz apoyado y quieto un instante, el trazo se convierte en la forma que dibujaste. */
    function armHold(g) {
      clearTimeout(g.holdTimer);
      g.holdTimer = opt.holdShape ? setTimeout(() => holdFired(g), g.snapped ? HOLD_ARROW_MS : HOLD_MS) : 0;
    }

    function holdFired(g) {
      g.holdTimer = 0;
      if (gesture !== g || g.type !== 'draw') return;
      if (g.snapped) {                                   // sigue quieto tras enderezar: la recta pasa a flecha
        if (g.snapped.kind === 'line') { g.snapped.kind = 'arrow'; applySnapped(g); }
        return;
      }
      const base = g.rawPts || g.stroke.points;
      const shape = C.shapes.recognize(base);
      if (!shape) return;
      const ps = base.map((p) => p[2]).sort((a, b) => a - b);
      g.pressure = ps[ps.length >> 1];                   // la forma se pinta con la presión típica del trazo
      g.snapped = shape;
      applySnapped(g);
      if (shape.kind === 'line') armHold(g);
    }

    function applySnapped(g) {
      const s = g.stroke;
      const was = computeBox(s), pad = halfWidth(s) + 2;
      s.points = C.shapes.build(g.snapped, g.pressure, s.size);
      const now = computeBox(s);
      scheduleRedraw([Math.min(was[0], now[0]) - pad, Math.min(was[1], now[1]) - pad, Math.max(was[2], now[2]) + pad, Math.max(was[3], now[3]) + pad]);
      g.drawn = s.points.length;
    }

    /* Un zigzag rápido sobre trazos anteriores los borra (con el marcador no: ahí es resaltar). */
    function tryScratch(g) {
      const s = g.stroke;
      const box = C.shapes.scribbleBox(g.rawPts || s.points);
      if (!box) return false;
      const pad = 8, x0 = box[0] - pad, y0 = box[1] - pad, x1 = box[2] + pad, y1 = box[3] + pad;
      const inside = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
      const victims = new Set();
      let rect = [x0 - 6, y0 - 6, x1 + 6, y1 + 6];
      for (const t of g.before) {
        const b = bbox(t);
        if (b[2] < x0 || b[0] > x1 || b[3] < y0 || b[1] > y1) continue;
        if (C.shapes.insideFraction(t.points, inside) >= 0.65) {
          victims.add(t);
          const p = halfWidth(t) + 1;
          rect = unionBox(rect, [b[0] - p, b[1] - p, b[2] + p, b[3] + p]);
        }
      }
      if (!victims.size) return false;
      strokes = g.before.filter((t) => !victims.has(t));       // el tachado desaparece con lo que cubría
      commit(g.before);
      scheduleRedraw(rect);
      cb.notice(`Tachado: se ${victims.size === 1 ? 'borró 1 trazo' : 'borraron ' + victims.size + ' trazos'}. Deshacer con Ctrl/Cmd+Z`);
      return true;
    }

    /* Inicia un gesto. Es público porque la app lo llama cuando el lápiz toca la
     * hoja en modo teclado: ese mismo toque ya empieza el trazo. */
    function handleDown(e) {
      if (gesture) return;
      if (e.ctrlKey || (e.pointerType === 'mouse' && e.button !== 0)) return;   // Ctrl: desplazar la hoja; clic derecho: menú

      if (e.pointerType === 'touch' && opt.penOnly) {      // el dedo solo desplaza la página
        gesture = { type: 'pan', id: e.pointerId, y: e.clientY };
        capture(e);
        return;
      }

      e.preventDefault();
      capture(e);
      const rect = canvas.getBoundingClientRect();
      const pt = toPoint(e, rect, kOf(rect));

      if (mode === 'eraser' || isPenEraser(e)) {
        clearSelection();
        gesture = { type: 'erase', id: e.pointerId, before: strokes, last: pt };
        eraseAt(pt[0], pt[1]);
        showCursor(pt[0], pt[1]);
      } else if (mode === 'lasso') {
        lassoDown(e, pt);
      } else {
        startDraw(e, pt);
      }
    }

    function onMove(e) {
      const rect = canvas.getBoundingClientRect();
      const k = kOf(rect);
      if (!gesture || e.pointerId !== gesture.id) {
        if (mode === 'eraser' && e.pointerType !== 'touch') showCursor((e.clientX - rect.left) * k, (e.clientY - rect.top) * k);
        else if (mode === 'lasso' && !gesture && sel) hoverLasso((e.clientX - rect.left) * k, (e.clientY - rect.top) * k);
        return;
      }
      const g = gesture;

      if (g.type === 'pan') {
        cb.scrollBy(g.y - e.clientY);
        g.y = e.clientY;
        return;
      }

      const events = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
      const list = events.length ? events : [e];

      if (g.type === 'erase') {
        for (const ev of list) {
          const pt = toPoint(ev, rect, k);
          eraseAlong(g.last, pt);
          g.last = pt;
        }
        showCursor(g.last[0], g.last[1]);
        return;
      }

      if (g.type === 'lasso') {                           // el trazo del lazo se pinta tramo a tramo; al soltar se borra
        for (const ev of list) {
          const pt = toPoint(ev, rect, k);
          const last = g.pts[g.pts.length - 1];
          const d2 = dist2(last, pt[0], pt[1]);
          if (d2 < (1.5 * k) * (1.5 * k)) continue;
          ctx.save();
          ctx.strokeStyle = ACCENT;
          ctx.lineWidth = 1.5 * k;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(last[0], last[1]);
          ctx.lineTo(pt[0], pt[1]);
          ctx.stroke();
          ctx.restore();
          g.len += Math.sqrt(d2);
          g.pts.push(pt);
        }
        return;
      }

      if (g.type === 'move' || g.type === 'scale') {
        const pt = toPoint(list[list.length - 1], rect, k);
        if (g.type === 'move') { xf.dx = pt[0] - g.start[0]; xf.dy = pt[1] - g.start[1]; }
        else {
          const d0 = Math.hypot(g.start[0] - xf.ox, g.start[1] - xf.oy) || 1;
          xf.k = Math.max(0.05, Math.min(20, Math.hypot(pt[0] - xf.ox, pt[1] - xf.oy) / d0));
        }
        repaintChrome();
        return;
      }

      // Dibujar
      const s = g.stroke;
      const before = s.points.length;
      let moved = false;
      for (const ev of list) {
        const raw = toPoint(ev, rect, k);
        g.raw = raw;
        if (Math.hypot(raw[0] - g.ax, raw[1] - g.ay) > HOLD_RADIUS * k) { g.ax = raw[0]; g.ay = raw[1]; moved = true; }   // dejó de estar quieto
        if (g.snapped) continue;
        if (g.rawPts) g.rawPts.push(raw);
        const pt = g.tau ? smooth(g, ev, raw) : raw;
        const last = s.points[s.points.length - 1];
        if (dist2(last, pt[0], pt[1]) < 0.09) continue;   // ignora el temblor de < 0.3 px
        s.points.push(pt);
      }

      if (g.snapped) {                                    // la forma ya está fijada: una recta sigue al lápiz
        if (moved && (g.snapped.kind === 'line' || g.snapped.kind === 'arrow')) {
          g.snapped.b = C.shapes.snapEnd(g.snapped.a, g.raw);
          applySnapped(g);
        }
        if (moved) armHold(g);
        return;
      }
      if (moved) armHold(g);

      if (s.tool === 'marker') {                          // se repinta solo la cola del trazo
        if (s.points.length > before) scheduleRedraw(tailRect(s, before));
        return;
      }

      // Lápiz: pinta solo los segmentos nuevos (el último espera a la siguiente muestra).
      setPenStyle(ctx, s, dark);
      const n = s.points.length;
      while (g.drawn <= n - 2) drawSegment(ctx, s, g.drawn++);
    }

    function onUp(e) {
      if (!gesture || e.pointerId !== gesture.id) return;
      const g = gesture;
      gesture = null;
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* ya liberado */ }

      if (g.type === 'draw') {
        clearTimeout(g.holdTimer);
        const s = g.stroke;
        if (!g.snapped) {
          if (g.tau) catchUp(g);
          if (s.tool !== 'marker') {
            setPenStyle(ctx, s, dark);
            if (s.points.length === 1) drawDot(ctx, s);
            else while (g.drawn <= s.points.length - 1) drawSegment(ctx, s, g.drawn++);
          }
          if (opt.scratch && s.tool !== 'marker' && tryScratch(g)) return;
        }
        // Se guarda el trazo simplificado; lo ya pintado en pantalla es indistinguible
        s.points = simplify(s.points, SIMPLIFY_TOL);
        if (s.tool === 'marker') scheduleRedraw(tailRect(s, 0));
        commit(g.before);
        let maxY = 0;
        for (const p of s.points) if (p[1] > maxY) maxY = p[1];
        cb.extent(maxY);
      } else if (g.type === 'erase') {
        if (strokes !== g.before) commit(g.before);
        if (e.pointerType === 'touch') hideCursor();
      } else if (g.type === 'lasso') {
        finishLasso(g);
      } else if (g.type === 'move' || g.type === 'scale') {
        finishTransform();
      }
    }

    canvas.addEventListener('pointerdown', handleDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', () => { if (!gesture) hideCursor(); });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());   // botón del lápiz / pulsación larga

    /* ── API de la capa ── */

    return {
      handleDown,
      busy: () => !!gesture,           // ¿hay un trazo o un gesto en curso?
      undo,
      redo,
      canUndo: () => undoStack.length > 0,
      canRedo: () => redoStack.length > 0,
      getStrokes: () => strokes,
      pointCount() { let n = 0; for (const s of strokes) n += s.points.length; return n; },
      /* Aplica ya el repintado pendiente (normalmente espera al siguiente cuadro). Útil en pruebas. */
      flush() { if (rafId) { cancelAnimationFrame(rafId); flush(); } },
      lastRedrawMs: () => lastRedrawMs,

      setMode(m) {
        mode = m;
        canvas.style.pointerEvents = m === 'text' || m === 'laser' ? 'none' : 'auto';
        canvas.style.cursor = '';
        if (m !== 'lasso') clearSelection();
        hideCursor();
      },

      /* Modo oscuro: solo cambia cómo se ven los trazos, no lo guardado. */
      setDark(on) {
        on = !!on;
        if (on === dark) return;
        dark = on;
        scheduleRedraw();
      },

      /* Escala de la hoja en pantalla: el marco de la selección mide lo mismo con cualquier zoom. */
      setScale(s) {
        if (s === viewScale) return;
        viewScale = s;
        if (sel) repaintChrome();
      },

      // selección (lazo)
      selection: selInfo,
      clearSelection,
      deleteSelection,
      copySelection,
      paste,
      duplicateSelection,
      recolorSelection,

      load(list) {
        strokes = Array.isArray(list) ? list : [];
        undoStack = [];
        redoStack = [];
        gesture = null;
        if (sel) { sel = null; xf = null; cb.selection(null); }
        chromeRect = null;
        scheduleRedraw();
        cb.history();
      },

      clear() {
        if (!strokes.length) return;
        clearSelection();
        const before = strokes;
        strokes = [];
        commit(before);
        scheduleRedraw();
      },

      /* w × h: tamaño lógico de la hoja; r: píxeles de canvas por píxel lógico. */
      resize(w, h, r) {
        if (w === width && h === height && r === ratio) return;
        width = w; height = h; ratio = r;
        canvas.width = Math.round(w * r);      // asignar el tamaño vacía el canvas
        canvas.height = Math.round(h * r);
        dirty = null; fullDirty = false;
        const t0 = performance.now();
        redrawAll();
        lastRedrawMs = performance.now() - t0;
      },

      /* Libera la memoria del lienzo (hoja oculta o vacía). Se reasigna al volver a mostrarla. */
      release() {
        canvas.width = canvas.height = 0;
        width = height = ratio = 0;
        dirty = null; fullDirty = false;
      },
    };
  }

  C.ink = { create, drawStrokes, simplify, uid };
})(window.Cuaderno = window.Cuaderno || {});
