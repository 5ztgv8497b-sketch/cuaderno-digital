/* Cuadros de texto: texto escrito con el teclado en cualquier lugar de la hoja.
 *
 * Cada cuadro es un <textarea> que se ajusta a su contenido, con la misma tipografía que el
 * cuerpo. Se coloca sobre la cuadrícula de renglones (su primera línea cae sobre un renglón), se
 * mueve con el asa de su izquierda y se ensancha con su borde derecho. Un cuadro que se queda
 * vacío desaparece solo. Se guardan en la nota como { id, x, y, w, h, text } (px lógicos). */
(function (C) {
  'use strict';

  const MIN_W = 120;
  const EDGE = 28;                 // margen derecho por defecto de un cuadro nuevo
  const r1 = (v) => Math.round(v * 10) / 10;

  class Boxes {
    /* o: { layer, getSpacing(), getDark(), pageWidth(), onChange(), onFit() } */
    constructor(o) {
      this.o = o;
      this.layer = o.layer;
      this.items = [];
      this.S = 0;                  // espaciado con el que se colocaron los cuadros
    }

    metrics() { return C.text.metrics(this.o.getSpacing()); }
    snapY(y) {
      const S = this.o.getSpacing(), m = this.metrics();
      return m.padTop + Math.max(0, Math.round((y - m.padTop) / S)) * S;
    }

    load(list) {
      this.clear();
      for (const b of Array.isArray(list) ? list : []) this.add(b);
      this.S = this.o.getSpacing();
    }

    clear() {
      for (const it of this.items) it.wrap.remove();
      this.items = [];
    }

    add(b) {
      const wrap = document.createElement('div');
      wrap.className = 'tbox';
      const ta = document.createElement('textarea');
      ta.rows = 1;
      ta.spellcheck = false;
      ta.value = b.text || '';
      ta.setAttribute('aria-label', 'Cuadro de texto');
      const grip = document.createElement('span');
      grip.className = 'tbox-grip';
      grip.title = 'Arrastra para mover este texto';
      grip.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.600"/><circle cx="15" cy="6" r="1.600"/><circle cx="9" cy="12" r="1.600"/><circle cx="15" cy="12" r="1.600"/><circle cx="9" cy="18" r="1.600"/><circle cx="15" cy="18" r="1.600"/></svg>';
      const side = document.createElement('span');
      side.className = 'tbox-size';
      side.title = 'Arrastra para cambiar el ancho';
      wrap.append(ta, grip, side);
      this.layer.appendChild(wrap);

      const it = { id: b.id || C.ink.uid(), x: b.x, y: b.y, w: b.w, h: 0, wrap, ta, hadText: !!(b.text && b.text.trim()) };
      this.items.push(it);
      C.text.applyBox(ta, this.o.getSpacing(), this.o.getDark());
      this.place(it);
      this.fit(it);

      ta.addEventListener('input', () => {
        it.hadText = it.hadText || !!ta.value.trim();
        this.fit(it);
        this.o.onChange();
        this.o.onFit();
      });
      ta.addEventListener('blur', () => { if (!ta.value.trim()) this.remove(it); });   // un cuadro vacío no se queda
      grip.addEventListener('pointerdown', (e) => this.drag(e, it, 'move'));
      side.addEventListener('pointerdown', (e) => this.drag(e, it, 'size'));
      return it;
    }

    remove(it) {
      const i = this.items.indexOf(it);
      if (i < 0) return;
      this.items.splice(i, 1);
      it.wrap.remove();
      if (it.hadText) { this.o.onChange(); this.o.onFit(); }
    }

    /* Posición y ancho a la vista: se ajustan al ancho de la hoja SIN tocar lo guardado. Si la hoja pasa a
     * vertical, un cuadro que quedaba fuera se recoge; al volver a horizontal reaparece donde estaba. */
    vis(it) {
      const W = this.o.pageWidth();
      const x = Math.min(it.x, W - 40);
      return { x, w: Math.min(it.w, W - x - 4) };
    }

    place(it) {
      const v = this.vis(it);
      it.wrap.style.left = v.x + 'px';
      it.wrap.style.top = it.y + 'px';
      it.wrap.style.width = v.w + 'px';
    }

    /* Altura del cuadro = la de su texto. */
    fit(it) {
      const ta = it.ta, S = this.o.getSpacing();
      ta.style.height = '0px';
      it.h = Math.max(S, ta.scrollHeight);
      ta.style.height = it.h + 'px';
    }

    fitAll() { for (const it of this.items) this.fit(it); }

    /* Un cuadro nuevo en el punto (lx, ly) de la hoja, sobre el renglón que se tocó, y con el foco. */
    create(lx, ly, text = '') {
      const W = this.o.pageWidth(), S = this.o.getSpacing(), m = this.metrics();
      const x = Math.max(12, Math.min(lx - C.text.BOX_PAD, W - EDGE - MIN_W));
      const y = m.padTop + Math.max(0, Math.floor((ly - m.padTop) / S)) * S;
      const it = this.add({ x, y, w: Math.max(MIN_W, W - x - EDGE), text });
      it.ta.focus({ preventScroll: true });
      if (text) { this.fit(it); this.o.onChange(); this.o.onFit(); }
      return it;
    }

    /* Mover (asa) o ensanchar (borde derecho) arrastrando. */
    drag(e, it, kind) {
      e.preventDefault();
      e.stopPropagation();
      const handle = e.currentTarget;
      try { handle.setPointerCapture(e.pointerId); } catch (_) { /* puntero ya inactivo */ }
      const rect = this.layer.getBoundingClientRect();
      const k = this.o.pageWidth() / (rect.width || 1);
      const W = this.o.pageWidth();
      const v = this.vis(it);
      it.x = v.x;                  // desde aquí lo que se ve pasa a ser lo guardado
      it.w = v.w;
      const s = { cx: e.clientX, cy: e.clientY, x: it.x, y: it.y, w: it.w };

      const move = (ev) => {
        const dx = (ev.clientX - s.cx) * k, dy = (ev.clientY - s.cy) * k;
        if (kind === 'move') {
          it.x = r1(Math.max(0, Math.min(s.x + dx, W - 40)));
          it.y = this.snapY(s.y + dy);
          it.w = Math.min(it.w, W - it.x - 4);
        } else {
          it.w = r1(Math.max(MIN_W, Math.min(s.w + dx, W - it.x - 4)));
        }
        this.place(it);
        this.fit(it);
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
        this.o.onChange();
        this.o.onFit();
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    }

    /* Tras cambiar el renglón o el modo oscuro: tipografía nueva y, si cambió el espaciado, cada
     * cuadro conserva su renglón (no su altura en píxeles). */
    restyle() {
      const S = this.o.getSpacing(), m = this.metrics();
      for (const it of this.items) {
        if (this.S && this.S !== S) it.y = m.padTop + Math.round((it.y - m.padTop) / this.S) * S;
        C.text.applyBox(it.ta, S, this.o.getDark());
        this.place(it);
      }
      this.S = S;
      this.fitAll();
    }

    /* Y más baja que ocupa algún cuadro con texto (para que la hoja crezca si hace falta). */
    bottom() {
      let b = 0;
      for (const it of this.items) if (it.ta.value.trim()) b = Math.max(b, it.y + it.h);
      return b;
    }

    blurAll() {
      for (const it of this.items) if (document.activeElement === it.ta) it.ta.blur();
    }

    count() { return this.items.filter((it) => it.ta.value.trim()).length; }
    text() { return this.items.filter((it) => it.ta.value.trim()).map((it) => it.ta.value).join('\n'); }

    toJSON() {
      return this.items.filter((it) => it.ta.value.trim())
        .map((it) => ({ id: it.id, x: r1(it.x), y: r1(it.y), w: r1(it.w), h: Math.round(it.h), text: it.ta.value }));
    }
  }

  C.Boxes = Boxes;
})(window.Cuaderno = window.Cuaderno || {});
