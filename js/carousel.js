/* Carrusel de miniaturas con las hojas del cuaderno, bajo las páginas.
 *
 * Las miniaturas se dibujan al aparecer en pantalla (de una en una) y se guardan en
 * una caché con tope (las más antiguas se descartan): una libreta enorme no hace crecer
 * la memoria sin límite. Cada entrada recuerda la fecha de la hoja y el tema con que se
 * dibujó, así que si la hoja cambia, o se activa el modo oscuro, se redibuja. */
(function (C) {
  'use strict';

  const THUMB_SCALE = 0.2;           // 820 px lógicos → ~164 px, nítido en pantallas densas
  const MAX_CACHE = 60;              // ≈ 9 MB de miniaturas como máximo
  const REFRESH_DELAY = 2500;        // ms: mientras se escribe, la miniatura no se rehace en cada guardado

  /* o: { track, prev, next, loadNote(id), getEnv() → { dark },
   *      onSelect(index), onAdd(), onPrev(), onNext() } */
  function create(o) {
    const { track, prev, next } = o;
    const cache = new Map();                 // id → { rev, key, canvas }; el orden de inserción es el de uso
    const queue = [];
    const pending = new Map();               // hojas guardadas cuya miniatura está por rehacerse
    let refreshTimer = 0;
    let busy = false;

    const isLand = (orient) => orient === 'landscape';
    const keyOf = (env, orient) => (env.dark ? 'd' : 'l') + (isLand(orient) ? 'H' : 'V');

    function store(id, entry) {
      cache.delete(id);
      cache.set(id, entry);                  // lo más reciente va al final
      for (const [oldId, old] of cache) {    // se descartan las más antiguas que no estén a la vista
        if (cache.size <= MAX_CACHE) break;
        if (old.canvas.isConnected) continue;
        old.canvas.width = old.canvas.height = 0;
        cache.delete(oldId);
      }
    }

    const fresh = (hit, rev, env, orient) => hit && hit.rev === rev && hit.key === keyOf(env, orient);

    const observer = new IntersectionObserver((items) => {
      const env = o.getEnv();
      for (const it of items) {
        if (!it.isIntersecting) continue;
        const b = it.target;
        if (fresh(cache.get(b.dataset.id), Number(b.dataset.rev), env, b.dataset.orient)) continue;     // ya está al día
        if (!queue.some((j) => j.id === b.dataset.id)) queue.push({ id: b.dataset.id, rev: Number(b.dataset.rev) });
      }
      pump();
    }, { root: track, rootMargin: '0px 240px' });

    const boxOf = (id) => track.querySelector(`.thumb[data-id="${CSS.escape(id)}"] .box`);

    function draw(note, rev) {
      const env = o.getEnv();
      const canvas = C.exporter.renderCanvas(note, C.pageWidth(note.orient), THUMB_SCALE, { dark: env.dark });
      store(note.id, { rev, key: keyOf(env, note.orient), canvas });
      const box = boxOf(note.id);
      if (box) box.replaceChildren(canvas);
    }

    async function pump() {
      if (busy) return;
      busy = true;
      while (queue.length) {
        const job = queue.shift();
        try {
          const note = await o.loadNote(job.id);
          if (note) draw(note, job.rev);
        } catch (err) { console.warn('Miniatura no generada', err); }
        await new Promise((r) => setTimeout(r, 15));     // no bloquea la interfaz
      }
      busy = false;
    }

    function svg(path) {
      return `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
    }

    /* pages: hojas del cuaderno en orden · openIds: las que se ven ahora · activeId: la activa */
    function render(pages, openIds, activeId) {
      const env = o.getEnv();
      observer.disconnect();
      queue.length = 0;
      track.textContent = '';

      pages.forEach((p, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'thumb' + (isLand(p.orient) ? ' landscape' : '') + (openIds.has(p.id) ? ' open' : '') + (p.id === activeId ? ' active' : '');
        b.dataset.id = p.id;
        b.dataset.orient = isLand(p.orient) ? 'landscape' : 'portrait';
        b.dataset.rev = p.updatedAt;
        b.title = 'Hoja ' + (i + 1) + (p.title ? ' · ' + p.title : '');
        b.setAttribute('role', 'listitem');
        b.setAttribute('aria-label', b.title);

        const box = document.createElement('span');
        box.className = 'box';
        const hit = cache.get(p.id);
        if (fresh(hit, p.updatedAt, env, p.orient)) { box.appendChild(hit.canvas); store(p.id, hit); }
        const label = document.createElement('span');
        label.className = 'num';
        label.textContent = i + 1;

        b.append(box, label);
        b.addEventListener('click', () => o.onSelect(i));
        track.appendChild(b);
        observer.observe(b);
      });

      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'thumb add';
      add.title = 'Añadir una hoja al final';
      add.setAttribute('aria-label', 'Añadir hoja');
      add.innerHTML = `<span class="box">${svg('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>')}</span><span class="num">Nueva</span>`;
      add.addEventListener('click', () => o.onAdd());
      track.appendChild(add);

      centerOpen();
    }

    /* Desplaza la tira para que las hojas abiertas queden en el centro. */
    function centerOpen() {
      const open = track.querySelectorAll('.thumb.open');
      if (!open.length) return;
      const first = open[0], last = open[open.length - 1];
      const mid = (first.offsetLeft + last.offsetLeft + last.offsetWidth) / 2;
      track.scrollTo({ left: mid - track.clientWidth / 2, behavior: 'smooth' });
    }

    function flushRefresh() {
      refreshTimer = 0;
      const batch = [...pending.values()];
      pending.clear();
      for (const note of batch) {
        try {
          draw(note, note.updatedAt);
          const b = track.querySelector(`.thumb[data-id="${CSS.escape(note.id)}"]`);
          if (b) b.dataset.rev = note.updatedAt;
        } catch (err) { console.warn('Miniatura no actualizada', err); }
      }
    }

    /* La hoja se acaba de guardar: su miniatura se rehace, pero espaciada. Mientras se
     * escribe de corrido se guarda muchas veces y rehacerla en cada una sería trabajo en vano. */
    function refresh(note) {
      pending.set(note.id, note);
      if (!refreshTimer) refreshTimer = setTimeout(() => (window.requestIdleCallback ? requestIdleCallback(flushRefresh, { timeout: 1500 }) : flushRefresh()), REFRESH_DELAY);
    }

    function forget(id) {
      const hit = cache.get(id);
      if (hit) hit.canvas.width = hit.canvas.height = 0;
      cache.delete(id);
      pending.delete(id);
    }

    /* Vacía la caché (panel de recursos). */
    function clearCache() {
      for (const hit of cache.values()) hit.canvas.width = hit.canvas.height = 0;
      cache.clear();
    }

    /* Marca la hoja activa sin reconstruir la tira (evita saltos de desplazamiento). */
    function setActive(id) {
      track.querySelectorAll('.thumb[data-id]').forEach((t) => t.classList.toggle('active', t.dataset.id === id));
    }

    function setNav(canPrev, canNext) {
      prev.disabled = !canPrev;
      next.disabled = !canNext;
    }

    function stats() {
      let px = 0;
      for (const hit of cache.values()) px += hit.canvas.width * hit.canvas.height;
      return { count: cache.size, max: MAX_CACHE, mb: px * 4 / 1048576 };
    }

    prev.addEventListener('click', () => o.onPrev());
    next.addEventListener('click', () => o.onNext());

    return { render, refresh, forget, clearCache, setActive, setNav, centerOpen, stats };
  }

  C.carousel = { create };
})(window.Cuaderno = window.Cuaderno || {});
