/* Índice del cuaderno: todas las hojas en una cuadrícula, con miniatura, título y fecha.
 *
 * Las miniaturas se dibujan solo cuando entran en pantalla (de una en una) y se descartan al
 * cerrar el índice: un cuaderno de cientos de hojas no se carga entero en memoria. */
(function (C) {
  'use strict';

  const THUMB_SCALE = 0.26;           // 820 px lógicos → ~213 px: nítido en pantallas densas
  const MAX_CACHE = 40;               // ≈ 10 MB como máximo, y se liberan al cerrar
  const fmtDate = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' });

  /* o: { dialog, grid, filter, title, count, dot, close, loadNote(id), labelOf(hoja), norm(texto) } */
  function create(o) {
    const { dialog, grid, filter } = o;
    let cache = new Map();            // id → { rev, dark, canvas }
    let queue = [];
    let busy = false;
    let observer = null;
    let state = null;                 // { pages, dark, activeIndex }

    const isLand = (p) => p.orient === 'landscape';

    function remember(id, entry) {
      cache.delete(id);
      cache.set(id, entry);
      for (const [oldId, old] of cache) {
        if (cache.size <= MAX_CACHE) break;
        if (old.canvas.isConnected) continue;
        old.canvas.width = old.canvas.height = 0;
        cache.delete(oldId);
      }
    }

    async function pump() {
      if (busy) return;
      busy = true;
      while (queue.length && state) {
        const job = queue.shift();
        try {
          const note = await o.loadNote(job.id);
          if (note && state) {
            const canvas = C.exporter.renderCanvas(note, C.pageWidth(note.orient), THUMB_SCALE, { dark: state.dark });
            remember(job.id, { rev: job.rev, dark: state.dark, canvas });
            const box = grid.querySelector(`.idx-card[data-id="${CSS.escape(job.id)}"] .idx-thumb`);
            if (box) box.replaceChildren(canvas);
          }
        } catch (err) { console.warn('Miniatura del índice no generada', err); }
        await new Promise((r) => setTimeout(r, 15));       // no bloquea la interfaz
      }
      busy = false;
    }

    function render() {
      if (!state) return;
      if (observer) observer.disconnect();
      queue = [];
      grid.textContent = '';
      const terms = o.norm(filter.value).split(/\s+/).filter(Boolean);
      let shown = 0;

      state.pages.forEach((p, i) => {
        const label = o.labelOf(p);
        const date = fmtDate.format(new Date(p.createdAt));
        if (terms.length) {
          const hay = o.norm(`${i + 1} ${label} ${date} ${p.text || ''}`);
          if (!terms.every((t) => hay.includes(t))) return;
        }
        shown++;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'idx-card' + (isLand(p) ? ' landscape' : '') + (i === state.activeIndex ? ' current' : '');
        b.dataset.id = p.id;
        b.dataset.rev = p.updatedAt;
        b.dataset.index = i;
        b.title = 'Abrir la hoja ' + (i + 1);

        const thumb = document.createElement('span');
        thumb.className = 'idx-thumb';
        const hit = cache.get(p.id);
        if (hit && hit.rev === p.updatedAt && hit.dark === state.dark) thumb.appendChild(hit.canvas);

        const n = document.createElement('span');
        n.className = 'idx-n';
        n.textContent = 'Hoja ' + (i + 1);
        const t = document.createElement('span');
        t.className = 'idx-t';
        t.textContent = label;
        const d = document.createElement('span');
        d.className = 'idx-d';
        d.textContent = date;

        b.append(thumb, n, t, d);
        const pick = state.onPick;
        b.addEventListener('click', () => { dialog.close(); pick(i); });
        grid.appendChild(b);
        observer.observe(b);
      });

      o.count.textContent = terms.length ? `${shown} de ${state.pages.length}` : state.pages.length + (state.pages.length === 1 ? ' hoja' : ' hojas');
      if (!shown) {
        const empty = document.createElement('p');
        empty.className = 'idx-empty';
        empty.textContent = 'Ninguna hoja coincide.';
        grid.appendChild(empty);
      }
    }

    observer = new IntersectionObserver((items) => {
      for (const it of items) {
        if (!it.isIntersecting) continue;
        const b = it.target, id = b.dataset.id, rev = Number(b.dataset.rev);
        const hit = cache.get(id);
        if (hit && hit.rev === rev && hit.dark === state.dark) continue;
        if (!queue.some((j) => j.id === id)) queue.push({ id, rev });
      }
      pump();
    }, { root: grid, rootMargin: '240px 0px' });

    /* Flechas: se mueve entre las tarjetas; Intro abre la hoja. */
    grid.addEventListener('keydown', (e) => {
      const cards = [...grid.querySelectorAll('.idx-card')];
      const i = cards.indexOf(document.activeElement);
      if (i < 0 || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      const cols = Math.max(1, cards.filter((c) => c.offsetTop === cards[0].offsetTop).length);
      const next = { ArrowLeft: i - 1, ArrowRight: i + 1, ArrowUp: i - cols, ArrowDown: i + cols }[e.key];
      if (cards[next]) { e.preventDefault(); cards[next].focus(); }
    });

    filter.addEventListener('input', render);
    o.close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => {            // libera todo al cerrar
      state = null;
      queue = [];
      if (observer) observer.disconnect();
      for (const hit of cache.values()) hit.canvas.width = hit.canvas.height = 0;
      cache.clear();
      grid.textContent = '';
    });

    /* nb: el cuaderno · pages: sus hojas en orden · activeIndex: la hoja abierta · dark: modo oscuro del
     * cuaderno · onPick(índice): qué hacer al elegir una hoja */
    function open(nb, pages, activeIndex, dark, onPick) {
      state = { pages, dark: !!dark, activeIndex, onPick };
      o.title.textContent = nb.name;
      if (nb.color) o.dot.style.setProperty('--nbc', nb.color); else o.dot.style.removeProperty('--nbc');
      filter.value = '';
      render();
      dialog.showModal();
      const cur = grid.querySelector('.idx-card.current');
      if (cur) { cur.scrollIntoView({ block: 'center' }); cur.focus({ preventScroll: true }); }
    }

    return { open };
  }

  C.outline = { create };
})(window.Cuaderno = window.Cuaderno || {});
