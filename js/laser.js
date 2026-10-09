/* Puntero láser: un punto rojo con halo que sigue al puntero, sin cola ni marca.
 * Sirve para señalar algo en una videollamada o al explicar. No dibuja nada en las hojas ni
 * guarda nada: vive en un lienzo propio sobre el área de trabajo, que solo existe mientras el
 * láser está activo, y la animación se detiene sola cuando el puntero deja de moverse. */
(function (C) {
  'use strict';

  const IDLE_MS = 2500;        // el punto sigue a la vista este tiempo sin moverse y luego se apaga
  const FADE_MS = 600;

  /* o: { host: elemento sobre el que se mueve el láser, canvas: lienzo superpuesto (pointer-events: none) } */
  function create(o) {
    const { host, canvas } = o;
    const ctx = canvas.getContext('2d');
    let on = false, raf = 0, fadeTimer = 0, dpr = 1;
    let last = null;             // posición del puntero (null = fuera del área)
    let lastMove = 0;
    let observer = null;

    function fit() {
      const r = host.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      canvas.style.left = r.left + 'px';
      canvas.style.top = r.top + 'px';
      canvas.style.width = r.width + 'px';
      canvas.style.height = r.height + 'px';
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
    }

    function schedule() { if (!raf) raf = requestAnimationFrame(frame); }

    function onMove(e) {
      const r = canvas.getBoundingClientRect();
      last = { x: e.clientX - r.left, y: e.clientY - r.top };
      lastMove = performance.now();
      clearTimeout(fadeTimer);
      schedule();
    }

    function onLeave() { last = null; schedule(); }

    function frame() {
      raf = 0;
      const idle = performance.now() - lastMove;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!last || idle >= IDLE_MS) return;                // nada que mostrar: la animación se detiene
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const fade = Math.min(1, (IDLE_MS - idle) / FADE_MS);
      ctx.fillStyle = '#ff2d2d';
      ctx.globalAlpha = fade * 0.3;
      ctx.beginPath(); ctx.arc(last.x, last.y, 15, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = fade;
      ctx.beginPath(); ctx.arc(last.x, last.y, 7.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = fade * 0.9;
      ctx.beginPath(); ctx.arc(last.x, last.y, 2.8, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      if (idle > IDLE_MS - FADE_MS) schedule();            // solo hace falta animar el desvanecimiento final
      else fadeTimer = setTimeout(schedule, IDLE_MS - FADE_MS - idle);
    }

    function start() {
      if (on) return;
      on = true;
      canvas.hidden = false;
      fit();
      host.addEventListener('pointermove', onMove, true);
      host.addEventListener('pointerleave', onLeave);
      observer = new ResizeObserver(fit);
      observer.observe(host);
    }

    function stop() {
      if (!on) return;
      on = false;
      host.removeEventListener('pointermove', onMove, true);
      host.removeEventListener('pointerleave', onLeave);
      if (observer) observer.disconnect();
      observer = null;
      cancelAnimationFrame(raf);
      clearTimeout(fadeTimer);
      raf = 0;
      last = null;
      canvas.width = canvas.height = 0;                  // libera la memoria del lienzo
      canvas.hidden = true;
    }

    return { start, stop, isOn: () => on };
  }

  C.laser = { create };
})(window.Cuaderno = window.Cuaderno || {});
