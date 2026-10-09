/* Joystick de desplazamiento: un mando flotante para mover la hoja con el lápiz cuando hay zoom.
 *
 * Apoyas el lápiz en la bola y la arrastras: cuanto más lejos del centro, más rápido se desplaza
 * el área de trabajo (con una zona muerta en el centro y una respuesta suave cerca de él, para
 * poder mover poco a poco). Al soltar, la bola vuelve al centro. Se cambia de sitio arrastrando su
 * asa. El bucle de animación solo corre mientras la bola está desplazada: en reposo no gasta nada. */
(function (C) {
  'use strict';

  const SPEEDS = [0, 600, 1100, 1900];     // px/s con la bola al tope, según la velocidad elegida (1–3)
  const DEAD = 0.1;                        // fracción del radio sin efecto (el pulso no mueve la hoja)
  const MARGIN = 8;

  /* o: { root, pad, knob, grip, close, scroller, getSpeed() → 1..3, onClose() } */
  function create(o) {
    const { root, pad, knob, grip, scroller } = o;
    let raf = 0, last = 0, vx = 0, vy = 0;
    let center = [0, 0], radius = 1, padId = null;

    /* ── Desplazar ── */

    function loop(t) {
      raf = 0;
      if (!vx && !vy) return;
      const dt = Math.min(0.05, (t - last) / 1000) || 0.016;
      last = t;
      scroller.scrollLeft += vx * dt;
      scroller.scrollTop += vy * dt;
      raf = requestAnimationFrame(loop);
    }

    function setVector(dx, dy) {
      const len = Math.hypot(dx, dy);
      if (len > radius) { dx *= radius / len; dy *= radius / len; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const n = Math.min(1, Math.hypot(dx, dy) / radius);
      const mag = n < DEAD ? 0 : Math.pow((n - DEAD) / (1 - DEAD), 2) * SPEEDS[o.getSpeed()];   // cuadrática: fino cerca del centro
      const ang = Math.atan2(dy, dx);
      vx = Math.cos(ang) * mag;
      vy = Math.sin(ang) * mag;
      if ((vx || vy) && !raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
    }

    function release() {
      padId = null;
      vx = vy = 0;
      knob.classList.add('spring');            // la bola vuelve al centro con un pequeño rebote
      knob.style.transform = 'translate(0, 0)';
    }

    pad.addEventListener('pointerdown', (e) => {
      if (padId !== null) return;
      e.preventDefault();
      padId = e.pointerId;
      try { pad.setPointerCapture(e.pointerId); } catch (_) { /* puntero ya inactivo */ }
      const r = pad.getBoundingClientRect();
      center = [r.left + r.width / 2, r.top + r.height / 2];
      radius = Math.max(1, r.width / 2 - knob.offsetWidth / 2);
      knob.classList.remove('spring');
      setVector(e.clientX - center[0], e.clientY - center[1]);
    });
    pad.addEventListener('pointermove', (e) => { if (e.pointerId === padId) setVector(e.clientX - center[0], e.clientY - center[1]); });
    for (const type of ['pointerup', 'pointercancel']) pad.addEventListener(type, (e) => { if (e.pointerId === padId) release(); });
    pad.addEventListener('contextmenu', (e) => e.preventDefault());       // el botón del lápiz no abre el menú sobre el mando

    /* ── Colocar y mover el mando ── */

    function clamp(left, top) {
      return [
        Math.max(MARGIN, Math.min(left, window.innerWidth - root.offsetWidth - MARGIN)),
        Math.max(MARGIN, Math.min(top, window.innerHeight - root.offsetHeight - MARGIN)),
      ];
    }

    /* pos: { cx, cy } = centrar el mando en ese punto · { left, top } = esa esquina · nada = abajo a la derecha */
    function place(pos) {
      const w = root.offsetWidth, h = root.offsetHeight;
      let at;
      if (pos && pos.cx !== undefined) at = clamp(pos.cx - w / 2, pos.cy - h / 2);
      else if (pos) at = clamp(pos.left, pos.top);
      else at = clamp(window.innerWidth - w - 28, window.innerHeight - h - 130);
      const [left, top] = at;
      root.style.left = left + 'px';
      root.style.top = top + 'px';
    }

    let drag = null;
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const r = root.getBoundingClientRect();
      drag = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top };
      try { grip.setPointerCapture(e.pointerId); } catch (_) { /* puntero ya inactivo */ }
    });
    grip.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const [left, top] = clamp(e.clientX - drag.dx, e.clientY - drag.dy);
      root.style.left = left + 'px';
      root.style.top = top + 'px';
    });
    for (const type of ['pointerup', 'pointercancel']) {
      grip.addEventListener(type, (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        drag = null;
      });
    }

    o.close.addEventListener('click', () => o.onClose());
    window.addEventListener('resize', () => { if (!root.hidden) place({ left: parseFloat(root.style.left) || 0, top: parseFloat(root.style.top) || 0 }); });

    return {
      show(pos) { root.hidden = false; place(pos); },
      hide() { root.hidden = true; release(); },
    };
  }

  C.joystick = { create };
})(window.Cuaderno = window.Cuaderno || {});
