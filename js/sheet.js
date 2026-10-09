/* Una hoja del cuaderno: su página en pantalla (fondo + texto + cuadros de texto + lápiz) y la nota que muestra.
 *
 * La hoja tiene un tamaño lógico fijo (vertical 820 × 1160, horizontal 1160 × 820) y se
 * escala con CSS para caber en pantalla. Así lo escrito se ve igual en cualquier ventana
 * y se pueden poner dos hojas lado a lado. Hay dos instancias a la vez (izquierda y derecha). */
(function (C) {
  'use strict';

  /* Presupuesto de memoria de los lienzos: todos los canvas visibles juntos no pasan de
   * este número de píxeles (36 M ≈ 144 MB). Si hace falta, se baja la resolución. */
  const CANVAS_BUDGET_PX = 36e6;
  C.perf = C.perf || { eco: false };   // «Modo ahorro» (lo activa la app): menos resolución y la mitad de presupuesto
  const RENDER_DELAY = 160;          // ms: el zoom y el cambio de ventana repintan al terminar
  const DEFAULT_HEIGHT = 1160;
  const fmtDay = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' });
  const fmtFull = new Intl.DateTimeFormat('es', { dateStyle: 'full', timeStyle: 'short' });

  class Sheet {
    /* hooks: { inkOptions, onDirty, onHistory, onGrow, onExtent, onActivate, onAddPage,
     *          onDelete, onClear, onMove(sheet, delta), onRotate, onNotice(texto), palette() → [[hex, nombre]…],
     *          scrollBy } — casi todos reciben la hoja primero. */
    constructor(template, hooks) {
      this.hooks = hooks;
      this.root = template.content.firstElementChild.cloneNode(true);
      const q = (s) => this.root.querySelector(s);
      this.el = {
        num: q('.page-num'), title: q('.page-title'), date: q('.page-date'),
        rot: q('.page-rot'), prev: q('.page-prev'), next: q('.page-next'), del: q('.page-del'), clear: q('.page-clear'),
        frame: q('.frame'), sheet: q('.sheet'), paper: q('.paper'), text: q('textarea'),
        ink: q('.ink'), cursor: q('.eraser-cursor'), empty: q('.empty-slot'), add: q('.add-page'),
        selbar: q('.sel-bar'), selcolors: q('.sel-colors'),
      };

      this.note = null;           // hoja que se muestra (null = hueco vacío del libro)
      this.index = -1;            // posición dentro del cuaderno
      this.dirty = false;
      this.saveTimer = 0;
      this.renderTimer = 0;
      this.rendered = false;      // ¿ya están pintados los lienzos con el tamaño actual?
      this.scale = 1;
      this.height = DEFAULT_HEIGHT;
      this.pageW = C.PAGE_W;
      this.orient = 'portrait';   // orientación de esta hoja (cada hoja tiene la suya)
      this.dark = false;
      this.canvasShare = 1;       // cuántas hojas se reparten el presupuesto de memoria
      this.mode = 'text';
      this.sel = null;            // selección del lazo: { box, count } o null
      this.penTap = null;         // toque del lápiz en modo teclado (puede ser «escribir aquí»)

      this.boxes = new C.Boxes({
        layer: q('.tboxes'),
        getSpacing: () => (this.note ? this.note.paper.spacing : 32),
        getDark: () => this.dark,
        pageWidth: () => this.pageW,
        onChange: () => hooks.onDirty(this),
        onFit: () => this.fitText(),
      });

      this.ink = C.ink.create({
        canvas: this.el.ink,
        cursor: this.el.cursor,
        options: hooks.inkOptions,
        callbacks: {
          change: () => { hooks.onDirty(this); hooks.onHistory(this); },
          history: () => hooks.onHistory(this),
          extent: (y) => hooks.onExtent(this, y),
          scrollBy: hooks.scrollBy,
          selection: (info) => this.onSelection(info),
          notice: (msg) => hooks.onNotice && hooks.onNotice(msg),
        },
      });

      this.buildSelBar();
      this.bind();
    }

    /* Barra flotante de la selección del lazo: cambiar color, duplicar y eliminar. */
    buildSelBar() {
      const { selbar, selcolors } = this.el;
      for (const [hex, name] of (this.hooks.palette ? this.hooks.palette() : [])) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'sel-sw';
        b.dataset.color = hex;
        b.title = 'Pasar a ' + name.toLowerCase();
        b.setAttribute('aria-label', 'Pasar a ' + name.toLowerCase());
        b.addEventListener('click', () => this.ink.recolorSelection(hex));
        selcolors.appendChild(b);
      }
      selbar.querySelector('[data-sel="dup"]').addEventListener('click', () => this.ink.duplicateSelection());
      selbar.querySelector('[data-sel="del"]').addEventListener('click', () => this.ink.deleteSelection());
      selbar.addEventListener('pointerdown', (e) => e.stopPropagation());     // tocar la barra no suelta la selección
      this.paintBar();
    }

    /* Los colores de la barra se ven como quedarán en el cuaderno (modo oscuro incluido). */
    paintBar() {
      for (const b of this.el.selcolors.children) b.style.setProperty('--c', C.theme.inkColor(b.dataset.color, this.dark));
    }

    onSelection(info) {
      this.sel = info;
      this.positionBar();
    }

    /* Sobre la selección (o debajo, si arriba no cabe), con el tamaño de pantalla de siempre. */
    positionBar() {
      const bar = this.el.selbar;
      if (!this.sel || !this.note) { bar.hidden = true; return; }
      const [x0, y0, x1, y1] = this.sel.box, s = this.scale;
      bar.hidden = false;
      const w = bar.offsetWidth, h = bar.offsetHeight;
      const left = Math.max(0, Math.min((x0 + x1) / 2 * s - w / 2, this.pageW * s - w));
      let top = y0 * s - h - 10;
      if (top < 0) top = y1 * s + 10;
      bar.style.left = left + 'px';
      bar.style.top = top + 'px';
    }

    bind() {
      const { el, hooks } = this;
      el.title.addEventListener('input', () => hooks.onDirty(this));
      el.text.addEventListener('input', () => { this.fitText(); hooks.onDirty(this); });
      el.add.addEventListener('click', () => hooks.onAddPage(this));
      el.del.addEventListener('click', () => hooks.onDelete(this));
      el.clear.addEventListener('click', () => hooks.onClear(this));
      el.rot.addEventListener('click', () => hooks.onRotate(this));
      el.prev.addEventListener('click', () => hooks.onMove(this, -1));
      el.next.addEventListener('click', () => hooks.onMove(this, 1));

      // Cualquier toque o foco en esta hoja la convierte en la hoja activa
      this.root.addEventListener('pointerdown', () => hooks.onActivate(this), true);
      this.root.addEventListener('focusin', () => hooks.onActivate(this));

      // El lápiz toca la hoja estando en modo teclado: cambia a lápiz y empieza el trazo
      this.root.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'pen' || !hooks.shouldAutoPen(this)) return;
        this.penTap = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
        hooks.setMode('pen');
        this.ink.handleDown(e);
        e.stopPropagation();
      }, true);
      this.root.addEventListener('pointerup', (e) => this.onPenUp(e));
      this.root.addEventListener('pointercancel', () => { this.penTap = null; });

      // Clic en un hueco de la hoja con el modo teclado: ahí aparece un cuadro de texto
      el.sheet.addEventListener('click', (e) => {
        if (e.target !== el.sheet || this.mode !== 'text' || !this.note || e.ctrlKey) return;
        const [lx, ly] = this.toLogical(e.clientX, e.clientY);
        this.boxes.create(lx, ly);
      });
    }

    /* Coordenadas de pantalla → píxeles lógicos de la hoja. */
    toLogical(cx, cy) {
      const r = this.el.sheet.getBoundingClientRect();
      const k = this.pageW / (r.width || 1);
      return [(cx - r.left) * k, (cy - r.top) * k];
    }

    /* Un toque corto del lápiz con el modo teclado no es un trazo: es «quiero escribir aquí». Se deshace
     * el punto que se acaba de dibujar y se pone el cursor en el texto tocado, o en un cuadro nuevo. */
    onPenUp(e) {
      const t = this.penTap;
      this.penTap = null;
      if (!t || t.id !== e.pointerId || !this.note) return;
      if (performance.now() - t.t > 350 || Math.hypot(e.clientX - t.x, e.clientY - t.y) > 6) return;
      this.ink.undo();
      const under = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.tagName === 'TEXTAREA' && this.root.contains(n));
      this.hooks.setMode('text');
      if (under) { under.focus({ preventScroll: true }); return; }
      const [lx, ly] = this.toLogical(e.clientX, e.clientY);
      this.boxes.create(lx, ly);
    }

    /* Carga una hoja (o un hueco vacío si note es null). `count` es el total de hojas del
     * cuaderno; `env` = { dark, pageW } describe el cuaderno (modo oscuro y orientación). */
    load(note, index, count, env = {}) {
      clearTimeout(this.saveTimer);
      clearTimeout(this.renderTimer);
      this.saveTimer = 0;
      this.dirty = false;
      this.rendered = false;
      this.note = note;
      this.index = index;
      this.pageW = env.pageW || C.PAGE_W;
      this.orient = note && note.orient === 'landscape' ? 'landscape' : 'portrait';
      this.dark = !!env.dark;
      this.el.sheet.dataset.dark = this.dark ? '1' : '0';
      this.root.classList.toggle('is-dark', this.dark);
      this.ink.setDark(this.dark);
      this.paintBar();
      this.root.classList.toggle('is-empty', !note);
      this.root.classList.toggle('is-landscape', this.orient === 'landscape');
      this.el.rot.title = this.orient === 'landscape' ? 'Girar solo esta hoja a vertical' : 'Girar solo esta hoja a horizontal';
      this.setNumber(index, count);

      if (!note) {
        this.el.title.value = '';
        this.el.text.value = '';
        this.boxes.clear();
        this.el.date.textContent = '';
        this.ink.load([]);
        this.release();
        return;
      }
      // Fecha de creación, discreta en la esquina de la hoja (línea de tiempo)
      const created = new Date(note.createdAt || Date.now());
      this.el.date.textContent = fmtDay.format(created);
      this.el.date.dateTime = created.toISOString();
      this.el.date.title = 'Creada el ' + fmtFull.format(created);

      this.el.title.value = note.title || '';
      this.el.text.value = note.text || '';
      this.boxes.load(note.boxes);
      this.ink.load(note.strokes);
      this.height = note.height || DEFAULT_HEIGHT;
      this.applyPaper(false);       // la altura definitiva la fija luego layout()
    }

    /* Número de hoja y botones de mover (desactivados en los extremos del cuaderno). */
    setNumber(index, count) {
      this.index = index;
      this.el.num.textContent = 'Hoja ' + (index + 1);
      this.el.prev.disabled = index <= 0;
      this.el.next.disabled = count !== undefined && index >= count - 1;
    }

    setMode(m) {
      this.mode = m;
      this.el.sheet.dataset.mode = m;
      this.ink.setMode(m);
      const ae = document.activeElement;
      if (m !== 'text' && ae && ae.tagName === 'TEXTAREA' && this.root.contains(ae)) ae.blur();
    }

    /* Modo oscuro de la hoja: papel, texto y trazos cambian de aspecto; lo guardado no. */
    setDark(on) {
      on = !!on;
      if (on === this.dark) return;
      this.dark = on;
      this.el.sheet.dataset.dark = on ? '1' : '0';
      this.root.classList.toggle('is-dark', on);
      this.ink.setDark(on);
      this.paintBar();
      this.applyPaper(false);
    }

    /* Aplica tipografía y fondo según note.paper (y el modo oscuro). */
    applyPaper(fit = true) {
      if (!this.note) return;
      const p = this.note.paper;
      C.text.apply(this.el.text, p.spacing, this.dark);
      this.boxes.restyle();
      this.el.sheet.style.background = this.dark ? C.theme.paperColor(p.color) : (C.paper.COLORS[p.color] || '#fff');
      if (this.rendered) this.drawPaper();
      if (fit) this.fitText();
    }

    /* Fija la escala (pantalla / lógico) y la altura lógica. El tamaño en pantalla cambia al
     * instante (solo CSS); los lienzos se repintan a la resolución nueva al terminar el
     * zoom o el cambio de ventana (`immediate` fuerza el repintado ya). */
    layout(scale, height, immediate = false, share = 1) {
      this.scale = scale;
      this.height = height;
      this.canvasShare = share;
      const W = this.pageW;
      const { frame, sheet, empty } = this.el;
      frame.style.width = W * scale + 'px';
      frame.style.height = height * scale + 'px';
      sheet.style.width = W + 'px';
      sheet.style.height = height + 'px';
      sheet.style.transform = `scale(${scale})`;
      sheet.style.setProperty('--inv', String(1 / scale));      // los asideros de los cuadros miden lo mismo con cualquier zoom
      empty.style.height = height * scale + 'px';
      this.ink.setScale(scale);
      this.positionBar();
      if (!this.note) { this.release(); return; }
      this.boxes.fitAll();
      this.fitText();
      clearTimeout(this.renderTimer);
      if (immediate || !this.rendered) this.renderLayers();
      else this.renderTimer = setTimeout(() => this.renderLayers(), RENDER_DELAY);
    }

    renderLayers() {
      if (!this.note) return;
      this.rendered = true;
      this.drawPaper();
      this.ink.resize(this.pageW, this.height, this.ratio());
    }

    /* Píxeles de canvas por píxel lógico: los de la pantalla, sin pasarse del presupuesto de memoria. */
    ratio() {
      const eco = C.perf.eco;
      const want = Math.min(eco ? 1.25 : 3, Math.max(0.5, (window.devicePixelRatio || 1) * this.scale));
      const perCanvas = CANVAS_BUDGET_PX * (eco ? 0.5 : 1) / (2 * Math.max(1, this.canvasShare));
      const cap = Math.sqrt(perCanvas / (this.pageW * this.height));
      return Math.min(want, cap);
    }

    drawPaper() {
      if (!this.note) return;
      const W = this.pageW, h = this.height, r = this.ratio();
      const cv = this.el.paper;
      const bw = Math.round(W * r), bh = Math.round(h * r);
      if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
      const m = C.text.metrics(this.note.paper.spacing);
      const ctx = cv.getContext('2d');
      ctx.setTransform(r, 0, 0, r, 0, 0);
      C.paper.draw(ctx, W, h, { ...this.note.paper, ruleY0: m.ruleY0, marginX: m.marginX, dark: this.dark });
    }

    /* Suelta la memoria de los lienzos (hoja oculta o hueco vacío). Se recrean al volver a mostrarla. */
    release() {
      clearTimeout(this.renderTimer);
      this.rendered = false;
      this.el.paper.width = this.el.paper.height = 0;
      this.ink.release();
    }

    /* El cuerpo del texto mide lo que su contenido (así el resto de la hoja queda libre para los cuadros
     * de texto) y, si el texto o un cuadro se acercan al final de la hoja, se pide más altura. */
    fitText() {
      if (!this.note) return;
      const S = this.note.paper.spacing, ta = this.el.text;
      ta.style.height = '0px';
      const h = Math.max(ta.scrollHeight, C.text.metrics(S).padTop + S);
      ta.style.height = h + 'px';
      const bottom = Math.max(h, this.boxes.bottom());
      if (bottom + S * 4 > this.height + 1) this.hooks.onGrow(this, bottom + S * 12);
    }

    /* Todo el texto de la hoja (cuerpo y cuadros), para buscar. */
    allText() {
      const extra = this.boxes.text();
      return this.el.text.value + (extra ? '\n' + extra : '');
    }

    focusText() { this.el.text.focus({ preventScroll: true }); }

    /* Datos de consumo de esta hoja (para el panel de recursos). */
    metrics() {
      const px = this.el.paper.width * this.el.paper.height + this.el.ink.width * this.el.ink.height;
      return {
        canvasPx: px,
        canvasMB: px * 4 / 1048576,
        ratio: this.rendered ? this.ratio() : 0,
        points: this.note ? this.ink.pointCount() : 0,
        strokes: this.note ? this.ink.getStrokes().length : 0,
        redrawMs: this.ink.lastRedrawMs(),
      };
    }

    /* Estado actual de la hoja como objeto de nota (para guardar o exportar). */
    snapshot() {
      return {
        ...this.note,
        title: this.el.title.value.trim(),
        text: this.el.text.value,
        boxes: this.boxes.toJSON(),
        strokes: this.ink.getStrokes(),
        height: this.height,
      };
    }
  }

  C.Sheet = Sheet;
})(window.Cuaderno = window.Cuaderno || {});
