/* Regla: dos tiras (horizontal y vertical) en centímetros, alineadas con la hoja activa.
 *
 * La hoja tiene proporción A4: 820 px lógicos = 21 cm (1 cm ≈ 39 px lógicos). Las tiras siguen el
 * desplazamiento y el zoom, muestran la posición del puntero y se dibujan en un lienzo propio de
 * una sola línea de alto, solo mientras la regla está activa (al apagarla se libera). */
(function (C) {
  'use strict';

  const SIZE = 24;                 // grosor de las tiras (px de pantalla)
  const CM = 820 / 21;             // píxeles lógicos por centímetro

  const fmt = (v) => v.toFixed(1).replace('.', ',');

  /* o: { h, v, corner, read, stage, target() → { frame, scale, width, height } | null } */
  function create(o) {
    let on = false, raf = 0, ptr = null, observer = null;

    function schedule() { if (on && !raf) raf = requestAnimationFrame(draw); }

    function fit(cv, w, h) {
      const d = window.devicePixelRatio || 1;
      const bw = Math.round(w * d), bh = Math.round(h * d);
      if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
      const c = cv.getContext('2d');
      c.setTransform(d, 0, 0, d, 0, 0);
      return c;
    }

    /* Marcas de una tira. `origin`: posición en pantalla del 0 cm; `lenCm`: largo de la hoja; `span`: largo visible. */
    function ticks(c, origin, pxCm, lenCm, span, horizontal, col) {
      const mm = pxCm / 10;
      const step = pxCm >= 80 ? 1 : pxCm >= 26 ? 5 : 10;               // cada mm, cada 5 mm o cada cm
      const labelEvery = pxCm >= 26 ? 1 : pxCm >= 14 ? 2 : 5;          // cada cuántos cm se escribe el número
      const first = Math.max(0, Math.floor(-origin / mm / step) * step);
      const last = Math.min(Math.floor(lenCm * 10), Math.ceil((span - origin) / mm));
      c.strokeStyle = col.mute;
      c.fillStyle = col.text;
      c.lineWidth = 1;
      c.font = '9px system-ui, -apple-system, "Segoe UI", sans-serif';
      c.textBaseline = 'alphabetic';
      c.beginPath();
      for (let i = first; i <= last; i += step) {
        const p = Math.round(origin + i * mm) + 0.5;
        const len = i % 10 === 0 ? 12 : i % 5 === 0 ? 8 : 5;
        if (horizontal) { c.moveTo(p, SIZE); c.lineTo(p, SIZE - len); } else { c.moveTo(SIZE, p); c.lineTo(SIZE - len, p); }
      }
      c.stroke();
      for (let i = first; i <= last; i += step) {
        if (i % 10 !== 0 || (i / 10) % labelEvery !== 0 || i === 0) continue;
        const p = origin + i * mm, text = String(i / 10);
        if (horizontal) c.fillText(text, p + 2.5, 10);
        else c.fillText(text, 2, p + 10);
      }
    }

    function draw() {
      raf = 0;
      if (!on) return;
      const cs = getComputedStyle(document.documentElement);
      const col = {
        bg: cs.getPropertyValue('--panel').trim() || '#f7f8fa',
        sheet: cs.getPropertyValue('--panel-2').trim() || '#fff',
        mute: cs.getPropertyValue('--muted').trim() || '#667085',
        text: cs.getPropertyValue('--text').trim() || '#1c2330',
        accent: cs.getPropertyValue('--accent').trim() || '#2f6df6',
      };
      const hw = o.h.clientWidth, vh = o.v.clientHeight;
      const ch = fit(o.h, hw, SIZE), cv = fit(o.v, SIZE, vh);
      ch.fillStyle = cv.fillStyle = col.bg;
      ch.fillRect(0, 0, hw, SIZE);
      cv.fillRect(0, 0, SIZE, vh);

      const t = o.target();
      const st = o.stage.getBoundingClientRect();
      if (t) {
        const fr = t.frame.getBoundingClientRect();
        const pxCm = CM * t.scale;
        const x0 = fr.left - st.left, y0 = fr.top - st.top;
        ch.fillStyle = cv.fillStyle = col.sheet;                       // la zona que ocupa la hoja
        ch.fillRect(x0, 0, t.width * t.scale, SIZE);
        cv.fillRect(0, y0, SIZE, t.height * t.scale);
        ticks(ch, x0, pxCm, t.width / CM, hw, true, col);
        ticks(cv, y0, pxCm, t.height / CM, vh, false, col);
      }
      if (ptr) {                                                        // dónde está el puntero
        ch.strokeStyle = cv.strokeStyle = col.accent;
        ch.lineWidth = cv.lineWidth = 1.5;
        ch.beginPath(); ch.moveTo(ptr.x - st.left, 0); ch.lineTo(ptr.x - st.left, SIZE); ch.stroke();
        cv.beginPath(); cv.moveTo(0, ptr.y - st.top); cv.lineTo(SIZE, ptr.y - st.top); cv.stroke();
      }
    }

    function readout() {
      const t = o.target();
      if (!ptr || !t) { o.read.hidden = true; return; }
      const fr = t.frame.getBoundingClientRect();
      const px = CM * t.scale;
      const x = (ptr.x - fr.left) / px, y = (ptr.y - fr.top) / px;
      if (x < 0 || y < 0 || x > t.width / CM || y > t.height / CM) { o.read.hidden = true; return; }
      o.read.hidden = false;
      o.read.textContent = `x ${fmt(x)} cm · y ${fmt(y)} cm`;
    }

    const onMove = (e) => { ptr = { x: e.clientX, y: e.clientY }; readout(); schedule(); };
    const onLeave = () => { ptr = null; readout(); schedule(); };
    const onScroll = () => schedule();

    function setOn(v) {
      v = !!v;
      if (v === on) return;
      on = v;
      o.h.hidden = o.v.hidden = o.corner.hidden = !on;
      if (on) {
        o.stage.addEventListener('pointermove', onMove, { passive: true });
        o.stage.addEventListener('pointerleave', onLeave);
        o.stage.addEventListener('scroll', onScroll, { passive: true });
        observer = new ResizeObserver(schedule);
        observer.observe(o.stage);
        schedule();
      } else {
        o.stage.removeEventListener('pointermove', onMove);
        o.stage.removeEventListener('pointerleave', onLeave);
        o.stage.removeEventListener('scroll', onScroll);
        if (observer) observer.disconnect();
        observer = null;
        cancelAnimationFrame(raf);
        raf = 0;
        ptr = null;
        o.read.hidden = true;
        o.h.width = o.h.height = o.v.width = o.v.height = 0;          // libera la memoria
      }
    }

    return { setOn, isOn: () => on, update: schedule, draw };
  }

  C.ruler = { create, CM };
})(window.Cuaderno = window.Cuaderno || {});
