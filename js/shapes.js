/* Geometría de los gestos del lápiz: enderezar formas, detectar tachados y seleccionar con el lazo.
 *
 * Todo son funciones puras sobre listas de puntos [x, y, presión] en píxeles lógicos de la hoja;
 * no tocan el canvas ni el DOM (así se pueden probar aparte). Las formas se devuelven como
 * trazos normales (listas de puntos): deshacer, borrador, modo oscuro y exportación las tratan
 * igual que a cualquier trazo hecho a mano. */
(function (C) {
  'use strict';

  const r1 = (v) => Math.round(v * 10) / 10;
  const r2 = (v) => Math.round(v * 100) / 100;
  const DEG = Math.PI / 180;

  const COS_CORNER = -0.8;       // un giro de más de ~37° es una esquina
  const CORNER_ANCHOR = 1.2;     // px: los puntos que «clavan» una esquina
  const FIT_LIMIT = 0.09;        // error máximo (relativo al tamaño) para aceptar una forma

  /* ───────── Esquinas ───────── */

  /* Al pintar, la curva pasa por los puntos medios y usa cada muestra como punto de control:
   * si entre dos muestras lejanas hay una esquina, se redondea muchísimo (una «L» de 60 px
   * quedaba a 14 px de su vértice). Se añaden dos puntos pegados a cada esquina, uno por lado,
   * y la esquina vuelve a ser viva. En trazos con muestras densas no cambia nada. */
  function anchorCorners(pts) {
    const n = pts.length;
    if (n < 3) return pts;
    const out = [pts[0]];
    for (let i = 1; i < n - 1; i++) {
      const a = pts[i - 1], c = pts[i], b = pts[i + 1];
      const ux = a[0] - c[0], uy = a[1] - c[1], vx = b[0] - c[0], vy = b[1] - c[1];
      const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
      if (lu > 0 && lv > 0 && (lu > 2.5 || lv > 2.5) && (ux * vx + uy * vy) / (lu * lv) > COS_CORNER) {
        const du = Math.min(CORNER_ANCHOR, lu * 0.4), dv = Math.min(CORNER_ANCHOR, lv * 0.4);
        out.push([r1(c[0] + ux / lu * du), r1(c[1] + uy / lu * du), r2(c[2] + (a[2] - c[2]) * du / lu)]);
        out.push(c);
        out.push([r1(c[0] + vx / lv * dv), r1(c[1] + vy / lv * dv), r2(c[2] + (b[2] - c[2]) * dv / lv)]);
      } else out.push(c);
    }
    out.push(pts[n - 1]);
    return out;
  }

  /* ───────── Utilidades ───────── */

  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  function pathLength(pts) {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
    return L;
  }

  function boxOf(pts) {
    const b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const p of pts) {
      if (p[0] < b[0]) b[0] = p[0];
      if (p[1] < b[1]) b[1] = p[1];
      if (p[0] > b[2]) b[2] = p[0];
      if (p[1] > b[3]) b[3] = p[1];
    }
    return b;
  }

  /* Ramer–Douglas–Peucker solo geométrico (sin presión). */
  function rdp(pts, tol) {
    const n = pts.length;
    if (n < 3) return pts.slice();
    const keep = new Uint8Array(n);
    keep[0] = keep[n - 1] = 1;
    const stack = [0, n - 1];
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
        const d2 = ex * ex + ey * ey;
        if (d2 > maxD) { maxD = d2; idx = i; }
      }
      if (maxD > tol * tol) { keep[idx] = 1; stack.push(a, idx, idx, b); }
    }
    const out = [];
    for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i]);
    return out;
  }

  /* n puntos a igual distancia a lo largo del recorrido. */
  function resample(pts, n) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
    const total = cum[cum.length - 1];
    if (!total) return null;
    const out = [];
    let j = 1;
    for (let k = 0; k < n; k++) {
      const d = total * k / (n - 1);
      while (j < cum.length - 1 && cum[j] < d) j++;
      const seg = cum[j] - cum[j - 1] || 1;
      const t = (d - cum[j - 1]) / seg;
      out.push([pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * t, pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * t]);
    }
    return out;
  }

  function pointInPolygon(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }

  /* Qué parte (0–1) de la longitud de un trazo cae donde `inside(x, y)` dice que sí.
   * Se muestrea cada ~5 px: un trazo de dos puntos (una recta larga) también cuenta bien. */
  function insideFraction(pts, inside) {
    if (pts.length === 1) return inside(pts[0][0], pts[0][1]) ? 1 : 0;
    let tot = 0, hit = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const steps = Math.max(1, Math.ceil(len / 5));
      const w = len / steps;
      for (let k = 0; k < steps; k++) {
        const t = (k + 0.5) / steps;
        tot += w;
        if (inside(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) hit += w;
      }
    }
    return tot ? hit / tot : (inside(pts[0][0], pts[0][1]) ? 1 : 0);
  }

  const segDist = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy;
    let t = len2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]);
  };
  const toFrame = (p, mx, my, th) => {
    const c = Math.cos(th), s = Math.sin(th), x = p[0] - mx, y = p[1] - my;
    return [x * c + y * s, -x * s + y * c];
  };
  const fromFrame = (u, v, mx, my, th) => {
    const c = Math.cos(th), s = Math.sin(th);
    return [mx + u * c - v * s, my + u * s + v * c];
  };

  /* Ángulo (rad) normalizado a (−45°, 45°]; casi horizontal pasa a 0 exacto. */
  function tidyAngle(th) {
    th = ((th % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
    if (th > Math.PI / 4) th -= Math.PI / 2;
    return Math.abs(th) < 7 * DEG ? 0 : th;
  }

  /* ───────── Reconocer una forma ───────── */

  /* Una recta y su ángulo «imantado»: horizontal y vertical a ±4°, diagonales a ±2,5°. */
  function snapEnd(a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
    if (!len) return [b[0], b[1]];
    const ang = Math.atan2(dy, dx) / DEG;
    const near = Math.round(ang / 45) * 45;
    const tol = near % 90 === 0 ? 4 : 2.5;
    if (Math.abs(ang - near) > tol) return [b[0], b[1]];
    return [a[0] + Math.cos(near * DEG) * len, a[1] + Math.sin(near * DEG) * len];
  }

  function fitLine(pts, len) {
    const a = pts[0], b = pts[pts.length - 1];
    const chord = dist(a, b);
    if (chord < 20 || chord < 0.88 * len) return null;
    const ux = (b[0] - a[0]) / chord, uy = (b[1] - a[1]) / chord;
    let dev = 0;
    for (const p of pts) dev = Math.max(dev, Math.abs((p[0] - a[0]) * uy - (p[1] - a[1]) * ux));
    if (dev > Math.max(3, 0.06 * chord)) return null;
    return { kind: 'line', a: [a[0], a[1]], b: snapEnd(a, b) };
  }

  function centroid(rs) {
    let mx = 0, my = 0;
    for (const p of rs) { mx += p[0]; my += p[1]; }
    return [mx / rs.length, my / rs.length];
  }

  function principalAngle(rs, mx, my) {
    let sxx = 0, syy = 0, sxy = 0;
    for (const p of rs) { const x = p[0] - mx, y = p[1] - my; sxx += x * x; syy += y * y; sxy += x * y; }
    return 0.5 * Math.atan2(2 * sxy, sxx - syy);
  }

  function extents(q) {
    const e = [Infinity, -Infinity, Infinity, -Infinity];
    for (const [u, v] of q) {
      if (u < e[0]) e[0] = u;
      if (u > e[1]) e[1] = u;
      if (v < e[2]) e[2] = v;
      if (v > e[3]) e[3] = v;
    }
    return e;
  }

  function fitEllipse(rs, mx, my, theta0) {
    let th = theta0;
    const deg = Math.abs(th / DEG);
    if (deg < 8) th = 0; else if (Math.abs(deg - 90) < 8) th = Math.PI / 2;
    const q = rs.map((p) => toFrame(p, mx, my, th));
    const [u0, u1, v0, v1] = extents(q);
    const a = (u1 - u0) / 2, b = (v1 - v0) / 2;
    if (a < 4 || b < 4) return null;
    const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
    let err = 0;
    for (const [u, v] of q) err += Math.abs(Math.hypot((u - cu) / a, (v - cv) / b) - 1);
    err /= q.length;
    const c = fromFrame(cu, cv, mx, my, th);
    return { kind: 'ellipse', cx: c[0], cy: c[1], a, b, theta: th, err };
  }

  function fitRect(rs, mx, my, thetas) {
    let best = null;
    for (const t of thetas) {
      const q = rs.map((p) => toFrame(p, mx, my, t));
      const [u0, u1, v0, v1] = extents(q);
      const hw = (u1 - u0) / 2, hh = (v1 - v0) / 2;
      if (hw < 4 || hh < 4) continue;
      let d = 0;
      for (const [u, v] of q) d += Math.min(u - u0, u1 - u, v - v0, v1 - v);
      const err = d / q.length / ((hw + hh) / 2);
      if (!best || err < best.err) {
        const c = fromFrame((u0 + u1) / 2, (v0 + v1) / 2, mx, my, t);
        best = { kind: 'rect', cx: c[0], cy: c[1], hw, hh, theta: t, err };
      }
    }
    return best;
  }

  /* Triángulo: el recorrido simplificado debe tener tres esquinas. */
  function fitTriangle(pts, rs, diag, size) {
    const poly = rdp(pts, 0.07 * diag);
    if (poly.length < 4) return null;
    const first = poly[0], last = poly[poly.length - 1];
    const corners = poly.slice(1, -1);
    if (corners.length < 2 || corners.length > 3) return null;
    // ¿el punto de partida es una esquina, o está en mitad de un lado?
    const s = [(first[0] + last[0]) / 2, (first[1] + last[1]) / 2];
    const a = corners[corners.length - 1], b = corners[0];
    const turn = Math.abs(Math.atan2((s[0] - a[0]) * (b[1] - s[1]) - (s[1] - a[1]) * (b[0] - s[0]),
      (s[0] - a[0]) * (b[0] - s[0]) + (s[1] - a[1]) * (b[1] - s[1])) / DEG);
    const tri = turn > 30 ? [s, ...corners] : corners;
    if (tri.length !== 3) return null;
    let d = 0;
    for (const p of rs) d += Math.min(segDist(p, tri[0], tri[1]), segDist(p, tri[1], tri[2]), segDist(p, tri[2], tri[0]));
    const bx = boxOf(tri);
    const err = d / rs.length / (((bx[2] - bx[0]) + (bx[3] - bx[1])) / 4);
    return { kind: 'triangle', corners: tri.map((p) => [p[0], p[1]]), err };
  }

  function fitClosed(pts, len) {
    const box = boxOf(pts), w = box[2] - box[0], h = box[3] - box[1];
    if (len < 60 || Math.min(w, h) < 12 || dist(pts[0], pts[pts.length - 1]) > 0.22 * len) return null;
    const rs = resample(pts, 72);
    if (!rs) return null;
    const [mx, my] = centroid(rs);
    const pca = principalAngle(rs, mx, my);
    const diag = Math.hypot(w, h);

    // Orientación probable de un rectángulo: la del lado más largo del recorrido simplificado
    const poly = rdp(pts, 0.05 * diag);
    let longest = 0, edgeAng = 0;
    for (let i = 1; i < poly.length; i++) {
      const l = dist(poly[i - 1], poly[i]);
      if (l > longest) { longest = l; edgeAng = Math.atan2(poly[i][1] - poly[i - 1][1], poly[i][0] - poly[i - 1][0]); }
    }
    const cands = [fitEllipse(rs, mx, my, pca), fitRect(rs, mx, my, [0, tidyAngle(pca), tidyAngle(edgeAng)]), fitTriangle(pts, rs, diag)]
      .filter((f) => f && f.err <= FIT_LIMIT);
    if (!cands.length) return null;
    cands.sort((x, y) => x.err - y.err);
    const best = cands[0];
    if (best.kind === 'ellipse' && Math.abs(best.a - best.b) < 0.1 * Math.max(best.a, best.b)) best.a = best.b = (best.a + best.b) / 2;   // círculo
    return best;
  }

  /* Devuelve { kind: 'line' | 'ellipse' | 'rect' | 'triangle', … } o null si el trazo no se parece a nada. */
  function recognize(pts) {
    if (!pts || pts.length < 5) return null;
    const len = pathLength(pts);
    if (len < 24) return null;
    return fitLine(pts, len) || fitClosed(pts, len);
  }

  /* ───────── Construir la forma como lista de puntos ───────── */

  function arrowPoints(a, b, size) {
    const len = dist(a, b);
    const head = Math.min(len * 0.45, Math.min(36, Math.max(12, len * 0.2, size * 4)));
    const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
    const wing = (sign) => {
      const c = Math.cos(26 * DEG), s = Math.sin(26 * DEG) * sign;
      return [b[0] - head * (ux * c - uy * s), b[1] - head * (uy * c + ux * s)];
    };
    return [a, b, wing(1), b, wing(-1)];
  }

  function ellipsePoints(s) {
    const n = Math.max(40, Math.min(160, Math.round(Math.PI * (s.a + s.b) / 8)));
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * Math.PI * 2;
      out.push(fromFrame(Math.cos(t) * s.a, Math.sin(t) * s.b, s.cx, s.cy, s.theta));
    }
    return out;
  }

  /* Los polígonos arrancan a mitad de un lado: así las esquinas quedan todas dentro del trazo. */
  function rectPoints(s) {
    const f = (u, v) => fromFrame(u, v, s.cx, s.cy, s.theta);
    return [f(0, -s.hh), f(s.hw, -s.hh), f(s.hw, s.hh), f(-s.hw, s.hh), f(-s.hw, -s.hh), f(0, -s.hh)];
  }

  function trianglePoints(s) {
    const [p, q, r] = s.corners;
    const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    return [m, q, r, p, m];
  }

  /* Puntos de la forma con la presión indicada, ya con las esquinas bien clavadas. */
  function build(shape, pressure, size) {
    let pts;
    if (shape.kind === 'line') pts = [shape.a, shape.b];
    else if (shape.kind === 'arrow') pts = arrowPoints(shape.a, shape.b, size);
    else if (shape.kind === 'ellipse') pts = ellipsePoints(shape);
    else if (shape.kind === 'rect') pts = rectPoints(shape);
    else pts = trianglePoints(shape);
    return anchorCorners(pts.map((p) => [r1(p[0]), r1(p[1]), pressure]));
  }

  /* ───────── Tachar para borrar ───────── */

  /* Un tachado es un zigzag rápido: muchos cambios de sentido casi en reversa. Devuelve su
   * caja si el trazo lo parece, o null. */
  function scribbleBox(pts) {
    if (!pts || pts.length < 8) return null;
    const box = boxOf(pts);
    if (Math.max(box[2] - box[0], box[3] - box[1]) < 14) return null;
    const s = rdp(pts, 2.5);
    let reversals = 0;
    for (let i = 1; i < s.length - 1; i++) {
      const ux = s[i][0] - s[i - 1][0], uy = s[i][1] - s[i - 1][1], vx = s[i + 1][0] - s[i][0], vy = s[i + 1][1] - s[i][1];
      const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
      if (lu < 6 || lv < 6) continue;
      if ((ux * vx + uy * vy) / (lu * lv) < -0.5) reversals++;
    }
    return reversals >= 4 ? box : null;
  }

  C.shapes = { anchorCorners, rdp, recognize, build, snapEnd, scribbleBox, pointInPolygon, insideFraction, boxOf, pathLength };
})(window.Cuaderno = window.Cuaderno || {});
