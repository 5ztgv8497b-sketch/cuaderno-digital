/* Arranque y control de la interfaz: cuadernos, libro abierto, zoom, carrusel, menú
 * contextual, modos (teclado, lápiz, borrador, lazo, láser), modo enfoque, índice, copiar y
 * compartir imagen, barra de herramientas y autoguardado. */
(function (C) {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const MAX_HEIGHT = 8000;
  const SAVE_DELAY = 800;
  const SAVE_DELAY_MAX = 8000;      // el autoguardado se espacia si guardar cuesta mucho
  const HEAVY_POINTS = 400000;      // una hoja con tantos puntos puede ir lenta: se avisa
  const OPTIMIZE_POINTS = 80000;    // las hojas más pesadas se simplifican una vez al abrirlas
  const CANVAS_LIMIT_MB = 144;      // presupuesto de memoria de los lienzos (ver sheet.js)
  const PREFS_KEY = 'cuaderno:prefs';

  // Zoom: 'fit' = página completa sin desplazarse · 'width' = ajustada al ancho · número = escala fija
  const MIN_SCALE = 0.25;
  const MAX_SCALE = 3;
  const FIT_MAX = 1.5;              // los ajustes automáticos no agrandan más que esto
  const FIT_FLOOR = 0.45;           // «página completa» no baja de aquí (luego se desplaza)
  const MIN_BOOK_SCALE = 0.5;       // por debajo, dos hojas serían ilegibles: se muestra una sola
  const HEAD_H = 36;                // altura de la cabecera de cada hoja (título, fecha…)
  const ZOOM_STEPS = [0.25, 0.35, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2, 2.5, 3];

  const COLORS = [
    ['#1f2937', 'Negro'], ['#2563eb', 'Azul'], ['#dc2626', 'Rojo'],
    ['#16a34a', 'Verde'], ['#ea580c', 'Naranja'],
  ];
  // Colores sugeridos para los cuadernos (se ven bien muy tenues sobre fondo claro y oscuro)
  const NB_COLORS = ['#6366f1', '#0ea5e9', '#14b8a6', '#22c55e', '#eab308', '#f97316', '#ef4444', '#ec4899', '#a855f7', '#78716c'];

  /* ───────── Preferencias (localStorage; cada acceso va protegido) ───────── */

  const DEFAULT_PREFS = {
    paper: { style: 'ruled', spacing: 32, color: 'white' },
    pen: { color: '#1f2937', size: 3, brush: 'pen' },     // brush: 'pen' | 'marker' (el bolígrafo se retiró: daba lo mismo que el lápiz)
    eraser: { mode: 'stroke', size: 30 },
    autoSwitch: true,
    penOnly: false,
    stabilizer: 0,         // suavizado del trazo: 0 apagado · 1 suave · 2 medio · 3 fuerte
    stabLast: 2,           // la fuerza que se recupera al volver a encenderlo
    holdShape: true,       // quieto con el lápiz apoyado: endereza la forma
    scratch: true,         // zigzag sobre lo escrito: lo borra
    joySpeed: 2,           // 1 lento · 2 normal · 3 rápido
    ruler: false,          // regla (tiras en centímetros)
    ctrlPan: true,         // con Ctrl pulsado, mover el puntero desplaza la hoja
    eco: false,            // modo ahorro: lienzos con menos resolución y memoria
    sidebar: null,
    view: 'book',          // 'book' (dos hojas) | 'single'
    zoom: 'fit',
    expanded: {},          // cuadernos desplegados en la barra lateral
    pos: {},               // última posición de lectura de cada cuaderno
    lastNb: null,
  };

  function loadPrefs() {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
      const pen = { ...DEFAULT_PREFS.pen, ...saved.pen };
      if (pen.marker) pen.brush = 'marker';             // versión anterior: casilla «Marcador»
      delete pen.marker;
      if (!['pen', 'marker'].includes(pen.brush)) pen.brush = 'pen';       // 'ball' (versiones anteriores) pasa a lápiz
      const zoomOk = saved.zoom === 'fit' || saved.zoom === 'width' || (typeof saved.zoom === 'number' && isFinite(saved.zoom));
      return {
        ...DEFAULT_PREFS, ...saved,
        stabilizer: [0, 1, 2, 3].includes(saved.stabilizer) ? saved.stabilizer : 0,
        stabLast: [1, 2, 3].includes(saved.stabLast) ? saved.stabLast : 2,
        holdShape: saved.holdShape !== false,
        scratch: saved.scratch !== false,
        joySpeed: [1, 2, 3].includes(saved.joySpeed) ? saved.joySpeed : 2,
        ruler: saved.ruler === true,
        ctrlPan: saved.ctrlPan !== false,
        eco: saved.eco === true,
        zoom: zoomOk ? saved.zoom : 'fit',
        paper: { ...DEFAULT_PREFS.paper, ...saved.paper },
        pen,
        eraser: { ...DEFAULT_PREFS.eraser, ...saved.eraser },
        expanded: { ...saved.expanded },
        pos: { ...saved.pos },
      };
    } catch (_) { return JSON.parse(JSON.stringify(DEFAULT_PREFS)); }
  }
  const prefs = loadPrefs();
  C.perf.eco = prefs.eco;
  function savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (_) { /* opcional */ } }

  /* ───────── Elementos y estado ───────── */

  const el = {
    app: $('#app'), tree: $('#tree'), search: $('#search'), btnNewNotebook: $('#btnNewNotebook'), btnSidebar: $('#btnSidebar'),
    nbName: $('#nbName'), spreadInfo: $('#spreadInfo'), status: $('#saveStatus'),
    stage: $('#stage'), spread: $('#spread'), btnAddSpace: $('#btnAddSpace'),
    zoomOut: $('#zoomOut'), zoomIn: $('#zoomIn'), zoomLabel: $('#zoomLabel'), zoomFit: $('#zoomFit'), zoomWidth: $('#zoomWidth'),
    penOpts: $('#penOpts'), eraserOpts: $('#eraserOpts'), swatches: $('#swatches'),
    penColor: $('#penColor'), penSize: $('#penSize'), brush: $('#brush'), eraserSize: $('#eraserSize'),
    selStyle: $('#selStyle'), selSpacing: $('#selSpacing'), selColor: $('#selColor'),
    autoSwitch: $('#autoSwitch'), penOnly: $('#penOnly'),
    btnUndo: $('#btnUndo'), btnRedo: $('#btnRedo'), btnClear: $('#btnClear'),
    exportMenu: $('#exportMenu'), fileImport: $('#fileImport'),
    // menú contextual y selector de color
    ctx: $('#ctxMenu'), cmSwatches: $('#cmSwatches'), cmColor: $('#cmColor'), cmSize: $('#cmSize'), cmSizeVal: $('#cmSizeVal'),
    cmEraserSize: $('#cmEraserSize'), cmEraserVal: $('#cmEraserVal'), cmPen: $('#cmPen'), cmEraser: $('#cmEraser'),
    cmUndo: $('#cmUndo'), cmRedo: $('#cmRedo'), cmClear: $('#cmClear'),
    cmZoomOut: $('#cmZoomOut'), cmZoomIn: $('#cmZoomIn'), cmZoomLabel: $('#cmZoomLabel'), cmZoomFit: $('#cmZoomFit'), cmZoomWidth: $('#cmZoomWidth'),
    colorPop: $('#colorPop'),
    chromeTop: $('#chromeTop'), sidebar: $('#sidebar'), carouselNav: $('.carousel'), focusExit: $('#focusExit'), laserCanvas: $('#laserCanvas'),
    stabSel: $('#stabSel'), gestHold: $('#gestHold'), gestScratch: $('#gestScratch'), btnIndex: $('#btnIndex'),
    btnRuler: $('#btnRuler'), rulerRead: $('#rulerRead'), gRuler: $('#gRuler'), gJoyOpen: $('#gJoyOpen'),
    cmLasso: $('#cmLasso'),
    btnGuide: $('#btnGuide'), guideDialog: $('#guideDialog'), cmJoystick: $('#cmJoystick'),
    gStab: $('#gStab'), gHold: $('#gHold'), gScratch: $('#gScratch'), gAuto: $('#gAuto'), gPenOnly: $('#gPenOnly'),
    gJoySpeed: $('#gJoySpeed'), gEco: $('#gEco'), gCtrlPan: $('#gCtrlPan'), cmPaste: $('#cmPaste'),
    cmLaser: $('#cmLaser'), cmFocus: $('#cmFocus'), cmCopyImg: $('#cmCopyImg'), cmShareImg: $('#cmShareImg'),
    darkMode: $('#darkMode'), btnPerf: $('#btnPerf'), perfDialog: $('#perfDialog'), perfList: $('#perfList'), perfTip: $('#perfTip'), perfClear: $('#perfClear'),
    // diálogos
    clearDialog: $('#clearDialog'), confirmDialog: $('#confirmDialog'), nameDialog: $('#nameDialog'), nameInput: $('#nameInput'),
    exportDialog: $('#exportDialog'), toast: $('#toast'),
  };

  let notebooks = [];       // cuadernos: { id, name, color, createdAt, paper }
  let pages = [];           // resumen de todas las hojas (para la barra lateral y el carrusel)
  // Cuaderno abierto y su vista actual: `pages` = posiciones de las hojas en pantalla, `spreads` = todas las vistas
  // del cuaderno, `si` = cuál es la actual y `slot` = si el hueco derecho ofrece «Añadir hoja».
  let cur = { nb: null, first: 0, pages: [], spreads: [], si: 0, slot: false };
  let mode = 'text';        // 'text' | 'pen' | 'eraser'
  let viewMode = 'book';    // vista efectiva: 'book' | 'single'
  let spreadH = C.defaultHeight('portrait');   // altura común de las hojas visibles
  let curScale = 1;         // escala aplicada ahora
  let query = '';
  let navToken = 0;         // descarta navegaciones que quedaron obsoletas
  let sheets = [];
  let active = null;        // hoja activa: sobre la que actúan deshacer, limpiar y exportar
  let carousel = null;
  let lastSaveMs = 0;       // lo que tardó el último guardado (el autoguardado se adapta a esto)
  const warnedHeavy = new Set();
  let prevMode = 'text';    // modo al que se vuelve al salir del láser
  let focusMode = false;    // modo enfoque: solo la hoja
  let strokeClip = null;    // trazos copiados con el lazo: { strokes, from }
  let laser = null;
  let joystick = null;
  let joyOpen = false;      // el joystick está a la vista (se abre bajo el puntero y se cierra al seguir escribiendo)
  let ctxPoint = { x: 0, y: 0 };   // dónde se abrió el menú del clic derecho
  let ruler = null;
  let guideTab = 'g-write';
  let outline = null;
  let imageCache = null;    // última imagen de hoja preparada para copiar o compartir

  /* Opciones de herramienta, compartidas por las capas de lápiz de las dos hojas. */
  const inkOptions = { tool: 'pen', color: '#1f2937', size: 3, eraserMode: 'stroke', eraserSize: 30, penOnly: false, stabilize: 0, holdShape: true, scratch: true };

  const byOrder = (a, b) => a.order - b.order || a.createdAt - b.createdAt;
  const getNb = (id) => notebooks.find((n) => n.id === id);
  const nbPages = (id) => pages.filter((p) => p.notebookId === id).sort(byOrder);
  const visibleSheets = () => (cur.pages.length === 2 || cur.slot ? sheets : [sheets[0]]);
  const firstLine = (text) => (text.split('\n').find((l) => l.trim()) || '').trim().slice(0, 60);
  const isNarrow = () => window.matchMedia('(max-width: 900px)').matches;

  /* La orientación es propiedad de cada hoja; el modo oscuro, del cuaderno. */
  const curNb = () => getNb(cur.nb);
  const orientOf = (p) => (p && p.orient === 'landscape' ? 'landscape' : 'portrait');
  const isDark = (nb) => !!(nb && nb.dark);
  const envFor = (note, nb = curNb()) => ({ dark: isDark(nb), pageW: C.pageWidth(orientOf(note)) });   // para cargar una hoja
  const envOf = (nb = curNb()) => ({ dark: isDark(nb) });                                              // para las miniaturas

  /* Reparto de hojas en pantallas: las verticales se emparejan de dos en dos (libro abierto);
   * una horizontal siempre va sola y el emparejamiento vuelve a empezar después de ella. */
  function buildSpreads(list, book) {
    const out = [];
    for (let i = 0; i < list.length;) {
      const next = list[i + 1];
      if (book && orientOf(list[i]) !== 'landscape' && next && orientOf(next) !== 'landscape') { out.push([i, i + 1]); i += 2; }
      else { out.push([i]); i += 1; }
    }
    return out;
  }

  /* ───────── Avisos y diálogos ───────── */

  let toastTimer = 0;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), Math.min(7000, 3600 + Math.max(0, msg.length - 50) * 45));
  }

  function ask(dialog, setup) {
    return new Promise((resolve) => {
      if (setup) setup();
      dialog.addEventListener('close', () => resolve(dialog.returnValue), { once: true });
      dialog.returnValue = 'cancel';
      dialog.showModal();
    });
  }

  async function confirmDelete(title, message) {
    const r = await ask(el.confirmDialog, () => {
      $('#confirmTitle').textContent = title;
      $('#confirmMsg').textContent = message;
      $('#confirmOk').textContent = 'Eliminar';
    });
    return r === 'ok';
  }

  /* Pide un nombre. Devuelve el texto (puede ser '') o null si se cancela. */
  async function askName(title, value, okLabel) {
    const r = await ask(el.nameDialog, () => {
      $('#nameTitle').textContent = title;
      $('#nameOk').textContent = okLabel;
      el.nameInput.value = value;
    });
    return r === 'ok' ? el.nameInput.value.trim() : null;
  }

  /* ───────── Disposición: escala, zoom y vista de libro ───────── */

  function stageBox() {
    const cs = getComputedStyle(el.stage);
    return {
      w: el.stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
      h: el.stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom),
    };
  }

  /* ¿Se emparejan las hojas verticales? Depende de la preferencia y de que la ventana dé para dos. */
  const wantBook = () => prefs.view === 'book' && stageBox().w / (2 * C.PAGE_W) >= MIN_BOOK_SCALE;

  function computeScale() {
    const box = stageBox();
    const totalW = visibleSheets().reduce((a, sh) => a + sh.pageW, 0) || C.PAGE_W;   // lo que ocupan juntas las hojas a la vista
    const wFit = box.w / totalW;
    let s;
    if (typeof prefs.zoom === 'number') s = prefs.zoom;
    else if (prefs.zoom === 'width') s = Math.min(wFit, FIT_MAX);
    else s = Math.min(wFit, Math.max((box.h - HEAD_H) / spreadH, FIT_FLOOR), FIT_MAX);   // página completa
    return Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
  }

  let laying = false;
  let pendingGrow = 0;

  /* keepScale: al crecer una hoja no se recalcula el ajuste, para que el zoom no salte mientras se escribe. */
  function layout(opts = {}) {
    if (laying) return;
    laying = true;
    try {
      const vis = visibleSheets();
      curScale = opts.keepScale && curScale ? curScale : computeScale();
      el.spread.dataset.layout = vis.length === 2 ? 'book' : 'single';
      sheets.forEach((s) => {
        s.root.hidden = !vis.includes(s);
        if (s.root.hidden) s.release();          // una hoja oculta no debe seguir ocupando memoria
      });
      vis.forEach((s) => s.layout(curScale, spreadH, !!opts.immediate, vis.length));
    } finally { laying = false; }
    updateZoomUI();
    if (ruler) ruler.update();
    // Una hoja pidió más altura mientras se pintaba: se aplica ahora, ya con todo en orden.
    const want = pendingGrow;
    pendingGrow = 0;
    if (want > spreadH) growSpread(want);
  }

  /* Alarga las dos hojas visibles a la vez (en un libro las dos páginas miden lo mismo). */
  function growSpread(h) {
    h = Math.min(MAX_HEIGHT, Math.round(h));
    if (h <= spreadH) return;
    if (laying) { pendingGrow = Math.max(pendingGrow, h); return; }
    spreadH = h;
    for (const s of visibleSheets()) {
      if (!s.note) continue;
      s.note.height = h;
      markDirty(s);
    }
    layout({ keepScale: true });
  }

  /* Cambia el zoom conservando el punto que estaba en el centro de la vista. */
  function setZoom(z) {
    const st = el.stage;
    const fy = (st.scrollTop + st.clientHeight / 2) / Math.max(1, st.scrollHeight);
    const fx = (st.scrollLeft + st.clientWidth / 2) / Math.max(1, st.scrollWidth);
    prefs.zoom = z;
    savePrefs();
    layout();
    st.scrollTop = fy * st.scrollHeight - st.clientHeight / 2;
    st.scrollLeft = fx * st.scrollWidth - st.clientWidth / 2;
  }

  function zoomBy(dir) {
    const next = dir > 0
      ? ZOOM_STEPS.find((s) => s > curScale + 0.01) || MAX_SCALE
      : [...ZOOM_STEPS].reverse().find((s) => s < curScale - 0.01) || MIN_SCALE;
    setZoom(next);
  }

  function updateZoomUI() {
    const label = Math.round(curScale * 100) + '%';
    el.zoomLabel.textContent = el.cmZoomLabel.textContent = label;
    for (const [btn, key] of [[el.zoomFit, 'fit'], [el.zoomWidth, 'width'], [el.cmZoomFit, 'fit'], [el.cmZoomWidth, 'width']]) {
      btn.setAttribute('aria-pressed', String(prefs.zoom === key));
    }
    el.zoomOut.disabled = el.cmZoomOut.disabled = curScale <= MIN_SCALE + 0.01;
    el.zoomIn.disabled = el.cmZoomIn.disabled = curScale >= MAX_SCALE - 0.01;
  }

  /* ───────── Hoja activa ───────── */

  function setActive(sheet) {
    if (!sheet || !sheet.note) return;
    active = sheet;
    sheets.forEach((s) => {
      s.root.classList.toggle('active', s === sheet);
      if (s !== sheet) s.ink.clearSelection();
    });
    syncPaperUI();
    updateHistoryButtons();
    if (carousel) carousel.setActive(sheet.note.id);
    if (ruler) ruler.update();
    renderTree();
  }

  function syncPaperUI() {
    const nb = getNb(cur.nb);
    const p = (active && active.note && active.note.paper) || (nb && nb.paper) || prefs.paper;
    el.selStyle.value = p.style;
    el.selSpacing.value = String(p.spacing);
    el.selColor.value = p.color;
    syncNotebookUI();
  }

  /* ───────── Modos y herramientas ───────── */

  function setMode(m, opts = {}) {
    mode = m;
    if (m !== 'laser') prevMode = m;
    sheets.forEach((s) => s.setMode(m));
    $$('.seg-btn[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
    $$('[data-cm-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cmMode === m)));
    const writing = m === 'text' || m === 'pen';
    el.penOpts.hidden = el.cmPen.hidden = !writing;
    el.eraserOpts.hidden = el.cmEraser.hidden = m !== 'eraser';
    el.cmLasso.hidden = m !== 'lasso';
    el.cmLaser.setAttribute('aria-pressed', String(m === 'laser'));
    const laserOn = el.app.classList.contains('laser-on');
    if (m === 'laser' && !laserOn) { laser.start(); el.app.classList.add('laser-on'); }
    else if (m !== 'laser' && laserOn) { laser.stop(); el.app.classList.remove('laser-on'); }
    if (m === 'text' && opts.focus && active) active.focusText();
    updateHistoryButtons();
  }

  /* El láser es un modo pasajero: al salir se vuelve a lo que se estaba haciendo. */
  const toggleLaser = () => setMode(mode === 'laser' ? prevMode : 'laser');

  function syncInk() {
    Object.assign(inkOptions, {
      tool: prefs.pen.brush,
      color: prefs.pen.color,
      size: prefs.pen.size,
      eraserMode: prefs.eraser.mode,
      eraserSize: prefs.eraser.size,
      penOnly: prefs.penOnly,
      stabilize: prefs.stabilizer,
      holdShape: prefs.holdShape,
      scratch: prefs.scratch,
    });
  }

  /* El menú contextual solo lleva los tres colores principales (y el selector libre). */
  const CTX_COLORS = COLORS.filter(([hex]) => ['#1f2937', '#dc2626', '#2563eb'].includes(hex));

  /* Los colores del lápiz se muestran en la barra y también en el menú contextual. */
  function renderSwatches(container, list = COLORS) {
    const custom = container.querySelector('.custom');
    list.forEach(([hex, name]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.dataset.color = hex;
      b.title = name;
      b.setAttribute('aria-label', name);
      b.style.setProperty('--c', hex);
      container.insertBefore(b, custom);
    });
    container.addEventListener('click', (e) => {
      const b = e.target.closest('.swatch[data-color]');
      if (b) pickColor(b.dataset.color);
    });
  }

  function refreshToolUI() {
    // Con el modo oscuro del cuaderno, el panel muestra los colores tal como se verán (negro → blanco…)
    const dark = isDark(curNb());
    for (const [box, list] of [[el.swatches, COLORS], [el.cmSwatches, CTX_COLORS]]) {
      const known = list.some(([hex]) => hex === prefs.pen.color);
      $$('.swatch[data-color]', box).forEach((b) => {
        b.classList.toggle('active', b.dataset.color === prefs.pen.color);
        b.style.setProperty('--c', C.theme.inkColor(b.dataset.color, dark));
      });
      const custom = box.querySelector('.custom');
      custom.classList.toggle('active', !known);
      custom.style.setProperty('--c', C.theme.inkColor(prefs.pen.color, dark));
    }
    el.penColor.value = el.cmColor.value = prefs.pen.color;
    el.penSize.value = el.cmSize.value = prefs.pen.size;
    el.cmSizeVal.textContent = prefs.pen.size;
    el.brush.value = prefs.pen.brush;
    $$('[data-cm-brush]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cmBrush === prefs.pen.brush)));
    el.eraserSize.value = el.cmEraserSize.value = prefs.eraser.size;
    el.cmEraserVal.textContent = prefs.eraser.size;
    $$('[data-eraser]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.eraser === prefs.eraser.mode)));
    $$('[data-cm-eraser]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cmEraser === prefs.eraser.mode)));
    el.autoSwitch.checked = prefs.autoSwitch;
    el.penOnly.checked = prefs.penOnly;
    el.stabSel.value = String(prefs.stabilizer);
    el.gestHold.checked = prefs.holdShape;
    el.gestScratch.checked = prefs.scratch;
    el.cmJoystick.setAttribute('aria-pressed', String(joyOpen));
    syncGuide();
    syncViewButtons();
  }

  function toolChanged() { savePrefs(); syncInk(); refreshToolUI(); }

  function pickColor(hex) {
    prefs.pen.color = hex;
    toolChanged();
    if (mode === 'text') setMode('pen');
  }
  function setBrush(b) {
    prefs.pen.brush = b;
    toolChanged();
    if (mode === 'text') setMode('pen');
  }
  function setPenSize(v) { prefs.pen.size = Number(v); toolChanged(); }
  function setEraserMode(m) { prefs.eraser.mode = m; toolChanged(); }
  function setEraserSize(v) { prefs.eraser.size = Number(v); toolChanged(); }

  const STAB_NAMES = ['apagado', 'suave', 'medio', 'fuerte'];
  function setStabilizer(level) {
    prefs.stabilizer = level;
    if (level > 0) prefs.stabLast = level;
    toolChanged();
  }

  function updateHistoryButtons() {
    const inkMode = mode !== 'text';
    const noUndo = !active || (inkMode && !active.ink.canUndo());
    const noRedo = !active || (inkMode && !active.ink.canRedo());
    el.btnUndo.disabled = el.cmUndo.disabled = noUndo;
    el.btnRedo.disabled = el.cmRedo.disabled = noRedo;
  }

  /* El texto que se está editando: el cuerpo o un cuadro (cada uno tiene su propio deshacer). */
  function textTarget() {
    const a = document.activeElement;
    return a && a.tagName === 'TEXTAREA' && active && active.root.contains(a) ? a : active.el.text;
  }
  function undo() {
    if (!active) return;
    if (mode === 'text') { textTarget().focus({ preventScroll: true }); document.execCommand('undo'); } else active.ink.undo();
  }
  function redo() {
    if (!active) return;
    if (mode === 'text') { textTarget().focus({ preventScroll: true }); document.execCommand('redo'); } else active.ink.redo();
  }

  /* Limpia una hoja (por defecto la activa): trazos, texto o todo; la hoja se conserva. */
  async function clearSheet(sheet = active) {
    if (!sheet || !sheet.note) return;
    if (sheet !== active) setActive(sheet);
    const target = sheet;
    const r = await ask(el.clearDialog, () => {
      $('#clearMsg').textContent = `¿Qué quieres borrar de la Hoja ${target.index + 1}? La hoja se conserva.`;
    });
    if (r === 'strokes' || r === 'all') target.ink.clear();
    if ((r === 'text' || r === 'all') && target.el.text.value) {
      const ta = target.el.text;
      ta.focus({ preventScroll: true });
      ta.select();
      if (!document.execCommand('delete')) ta.value = '';   // execCommand conserva el deshacer
      markDirty(target);
    }
    if ((r === 'text' || r === 'all') && target.boxes.count()) {
      target.boxes.clear();
      markDirty(target);
      target.fitText();
    }
  }

  /* Cambiar fondo, renglón o papel afecta a las hojas visibles y a las hojas nuevas del cuaderno. */
  function paperChange() {
    const paper = { style: el.selStyle.value, spacing: Number(el.selSpacing.value), color: el.selColor.value };
    const nb = getNb(cur.nb);
    if (nb) { nb.paper = { ...paper }; C.storage.putNotebook(nb).catch(console.error); }
    prefs.paper = { ...paper };
    savePrefs();
    for (const s of visibleSheets()) {
      if (!s.note) continue;
      s.note.paper = { ...paper };
      s.applyPaper();
      markDirty(s);
    }
  }

  /* ───────── Menú de herramientas (clic derecho) ───────── */

  function openCtx(x, y) {
    ctxPoint = { x, y };
    closeColorPop();
    refreshToolUI();
    updateHistoryButtons();
    updateZoomUI();
    el.ctx.hidden = false;
    // El menú nace justo bajo el puntero y se desplaza lo mínimo para no salirse de la ventana
    const r = el.ctx.getBoundingClientRect();
    el.ctx.style.left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8)) + 'px';
    el.ctx.style.top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) + 'px';
  }
  const closeCtx = () => { el.ctx.hidden = true; };

  function bindContextMenu() {
    renderSwatches(el.cmSwatches, CTX_COLORS);

    // Clic derecho sobre el área de trabajo. Con Mayús se conserva el menú del navegador.
    el.stage.addEventListener('contextmenu', (e) => {
      if (e.shiftKey) return;
      e.preventDefault();
      const pageEl = e.target.closest && e.target.closest('.page');
      const s = sheets.find((x) => x.root === pageEl);
      if (s && s.note) setActive(s);
      openCtx(e.clientX, e.clientY);
    });

    // Los botones del menú no le quitan el foco al texto que se está escribiendo
    el.ctx.addEventListener('mousedown', (e) => { if (!['INPUT', 'SELECT'].includes(e.target.tagName)) e.preventDefault(); });

    $$('[data-cm-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.cmMode, { focus: true })));
    $$('[data-cm-brush]').forEach((b) => b.addEventListener('click', () => setBrush(b.dataset.cmBrush)));
    $$('[data-cm-eraser]').forEach((b) => b.addEventListener('click', () => setEraserMode(b.dataset.cmEraser)));
    el.cmColor.addEventListener('input', () => pickColor(el.cmColor.value));
    el.cmSize.addEventListener('input', () => setPenSize(el.cmSize.value));
    el.cmEraserSize.addEventListener('input', () => setEraserSize(el.cmEraserSize.value));
    el.cmUndo.addEventListener('click', undo);
    el.cmRedo.addEventListener('click', redo);
    el.cmClear.addEventListener('click', () => { closeCtx(); clearSheet(); });
    el.cmZoomOut.addEventListener('click', () => zoomBy(-1));
    el.cmZoomIn.addEventListener('click', () => zoomBy(1));
    el.cmZoomLabel.addEventListener('click', () => setZoom('fit'));
    el.cmZoomFit.addEventListener('click', () => setZoom('fit'));
    el.cmZoomWidth.addEventListener('click', () => setZoom('width'));

    // Pegar el texto del portapapeles, en el punto donde se abrió el menú
    el.cmPaste.addEventListener('click', () => {
      closeCtx();
      if (!navigator.clipboard || !navigator.clipboard.readText) { toast('Este navegador no permite leer el portapapeles desde aquí: usa Ctrl/Cmd+V.'); return; }
      navigator.clipboard.readText().then((t) => {
        if (t && t.trim()) pasteText(t, ctxPoint); else toast('El portapapeles no tiene texto.');
      }).catch(() => toast('El navegador no dejó leer el portapapeles. Usa Ctrl/Cmd+V.'));
    });

    // Joystick: aparece justo donde se hizo el clic derecho
    el.cmJoystick.addEventListener('click', () => { closeCtx(); setJoystick(!joyOpen, ctxPoint); });

    // Accesos: láser, enfoque, copiar y compartir (copiar/compartir preparan la imagen al pasar el puntero)
    el.cmLaser.addEventListener('click', () => { closeCtx(); toggleLaser(); });
    el.cmFocus.addEventListener('click', () => { closeCtx(); setFocus(!focusMode); });
    el.cmCopyImg.addEventListener('click', () => { closeCtx(); copyImage('active'); });
    el.cmShareImg.addEventListener('click', () => { closeCtx(); shareImage('active'); });
    for (const b of [el.cmCopyImg, el.cmShareImg]) b.addEventListener('pointerenter', () => warmImage('active'));
  }

  /* ───────── Guardado ───────── */

  const fmtTime = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' });

  function setStatus(kind) {
    el.status.textContent = {
      pending: 'Sin guardar…',
      saving: 'Guardando…',
      saved: 'Guardado ✓ ' + fmtTime.format(new Date()),
      error: 'No se pudo guardar',
      '': '',
    }[kind];
    el.status.dataset.state = kind;
  }

  const summary = (n) => C.storage.summarize(n);
  function upsertIndex(n) {
    const s = summary(n);
    const i = pages.findIndex((x) => x.id === n.id);
    if (i >= 0) pages[i] = s; else pages.push(s);
  }

  function markDirty(sheet) {
    if (!sheet.note) return;
    sheet.dirty = true;
    sheet.rev = (sheet.rev || 0) + 1;
    setStatus('pending');
    clearTimeout(sheet.saveTimer);
    // Si guardar cuesta mucho (hoja pesada), se espera más entre guardados para no acaparar el procesador
    sheet.saveTimer = setTimeout(() => saveSheet(sheet), Math.min(SAVE_DELAY_MAX, Math.max(SAVE_DELAY, lastSaveMs * 8)));
  }

  async function saveSheet(sheet) {
    clearTimeout(sheet.saveTimer);
    sheet.saveTimer = 0;
    if (!sheet.note || !sheet.dirty) return;
    const n = sheet.note;
    n.title = sheet.el.title.value.trim();
    n.text = sheet.el.text.value;
    n.boxes = sheet.boxes.toJSON();
    n.strokes = sheet.ink.getStrokes();
    n.height = sheet.height;
    n.updatedAt = Date.now();
    sheet.dirty = false;
    setStatus('saving');
    try {
      const t0 = performance.now();
      await C.storage.put(n);
      lastSaveMs = performance.now() - t0;
      upsertIndex(n);
      renderTree();
      if (carousel) carousel.refresh(n);
      if (!sheets.some((s) => s.dirty)) setStatus('saved');
    } catch (err) {
      console.error('Error al guardar', err);
      sheet.dirty = true;
      setStatus('error');
    }
  }

  const saveAll = () => Promise.all(sheets.map(saveSheet));

  /* ───────── Cuadernos y hojas: datos ───────── */

  function newNotebook(name) {
    return { id: C.ink.uid(), name, color: NB_COLORS[notebooks.length % NB_COLORS.length], createdAt: Date.now(), paper: { ...prefs.paper }, dark: false };
  }

  function blankPage(nb, order, orient = 'portrait') {
    const now = Date.now();
    return {
      id: C.ink.uid(), notebookId: nb.id, order, title: '', createdAt: now, updatedAt: now, orient,
      paper: { ...nb.paper }, text: '', strokes: [], height: C.defaultHeight(orient),
    };
  }

  const nextOrder = (nbId) => {
    const list = nbPages(nbId);
    return list.length ? list[list.length - 1].order + 1 : 1;
  };

  /* Las notas de versiones anteriores (sin cuaderno) se agrupan en «Mi cuaderno»;
   * los cuadernos sin color reciben uno de la paleta. */
  async function migrate(meta) {
    if (!notebooks.length) {
      const nb = newNotebook('Mi cuaderno');
      notebooks.push(nb);
      await C.storage.putNotebook(nb);
    }
    notebooks.sort((a, b) => a.createdAt - b.createdAt);
    for (const [i, nb] of notebooks.entries()) {
      if (nb.color === undefined) {
        nb.color = NB_COLORS[i % NB_COLORS.length];
        await C.storage.putNotebook(nb);
      }
    }
    // Versión anterior: la orientación era del cuaderno. Ahora es de cada hoja: se conserva lo que ya veías.
    for (const nb of notebooks) {
      if (nb.orient === undefined) continue;
      if (nb.orient === 'landscape') {
        for (const m of meta.filter((x) => x.notebookId === nb.id && x.orient !== 'landscape')) {
          const n = await C.storage.get(m.id);
          if (!n) continue;
          n.orient = 'landscape';
          await C.storage.put(n);
          m.orient = 'landscape';
        }
      }
      delete nb.orient;
      await C.storage.putNotebook(nb);
    }
    const known = new Set(notebooks.map((n) => n.id));
    const orphans = meta.filter((n) => !known.has(n.notebookId)).sort((a, b) => a.createdAt - b.createdAt);
    let order = Math.max(0, ...meta.filter((n) => known.has(n.notebookId)).map((n) => n.order || 0));
    for (const m of orphans) {            // solo las hojas sin cuaderno se leen completas
      const n = await C.storage.get(m.id);
      if (!n) continue;
      n.notebookId = notebooks[0].id;
      n.order = ++order;
      await C.storage.put(n);
      m.notebookId = n.notebookId;
      m.order = n.order;
    }
  }

  async function createNotebook() {
    const name = await askName('Nuevo cuaderno', '', 'Crear');
    if (name === null) return;
    const nb = newNotebook(name || 'Cuaderno ' + (notebooks.length + 1));
    notebooks.push(nb);
    await C.storage.putNotebook(nb);
    prefs.expanded[nb.id] = true;
    await navigate(nb.id, 0);
  }

  async function renameNotebook(id) {
    const nb = getNb(id);
    if (!nb) return;
    const name = await askName('Renombrar cuaderno', nb.name, 'Guardar');
    if (!name) return;
    nb.name = name;
    refreshUI();
    await C.storage.putNotebook(nb);
  }

  async function setNbColor(id, color) {
    const nb = getNb(id);
    if (!nb) return;
    nb.color = color;
    renderTree();
    renderBookbar();
    await C.storage.putNotebook(nb);
  }

  async function deleteNotebook(id) {
    const nb = getNb(id);
    if (!nb) return;
    const ids = pages.filter((p) => p.notebookId === id).map((p) => p.id);
    const ok = await confirmDelete('Eliminar cuaderno',
      `«${nb.name}»` + (ids.length ? ` y sus ${ids.length} hoja${ids.length === 1 ? '' : 's'}` : '') + ' se borrarán para siempre. Esta acción no se puede deshacer.');
    if (!ok) return;

    // Que ninguna hoja abierta de este cuaderno vuelva a guardarse al navegar
    sheets.forEach((s) => {
      if (s.note && ids.includes(s.note.id)) { clearTimeout(s.saveTimer); s.dirty = false; s.note = null; }
    });
    await C.storage.removeMany(ids);
    await C.storage.removeNotebook(id);
    ids.forEach((pid) => carousel.forget(pid));
    pages = pages.filter((p) => p.notebookId !== id);
    notebooks = notebooks.filter((n) => n.id !== id);
    delete prefs.expanded[id];
    delete prefs.pos[id];

    if (cur.nb !== id) { renderTree(); return; }
    if (!notebooks.length) {
      const fresh = newNotebook('Mi cuaderno');
      notebooks.push(fresh);
      await C.storage.putNotebook(fresh);
    }
    await navigate(notebooks[0].id, prefs.pos[notebooks[0].id] || 0);
  }

  async function addPage(nbId) {
    const nb = getNb(nbId);
    if (!nb) return;
    const list = nbPages(nbId);
    const last = list[list.length - 1];
    const p = blankPage(nb, nextOrder(nbId), orientOf(last));      // sigue con la orientación de la hoja anterior
    await C.storage.put(p);
    upsertIndex(p);
    await navigate(nbId, list.length);
  }

  async function deletePage(id) {
    const p = pages.find((x) => x.id === id);
    if (!p) return;
    const list = nbPages(p.notebookId);
    const idx = list.indexOf(p);
    const label = 'Hoja ' + (idx + 1) + (p.title ? ' · ' + p.title : '');
    if (!(await confirmDelete('Eliminar hoja', `«${label}» se borrará para siempre. Esta acción no se puede deshacer.`))) return;

    sheets.forEach((s) => {
      if (s.note && s.note.id === id) { clearTimeout(s.saveTimer); s.dirty = false; s.note = null; }
    });
    await C.storage.remove(id);
    pages = pages.filter((x) => x.id !== id);
    carousel.forget(id);

    if (p.notebookId !== cur.nb) { renderTree(); return; }
    const wasVisible = cur.pages.includes(idx);
    await navigate(cur.nb, wasVisible ? idx : cur.first - (idx < cur.first ? 1 : 0));
  }

  /* Guarda el nuevo `order` de una hoja, esté abierta o no. */
  async function persistOrder(id, order) {
    const open = sheets.find((s) => s.note && s.note.id === id);
    if (open) { open.note.order = order; await C.storage.put(open.note); return; }
    const n = await C.storage.get(id);
    if (n) { n.order = order; await C.storage.put(n); }
  }

  /* Sube (delta -1) o baja (delta +1) una hoja dentro de su cuaderno. */
  async function movePage(id, delta) {
    const p = pages.find((x) => x.id === id);
    if (!p) return;
    await saveAll();                                  // que lo escrito no se pierda al reordenar
    const list = nbPages(p.notebookId);
    const from = list.indexOf(p), to = from + delta;
    if (to < 0 || to >= list.length) return;
    list.splice(from, 1);
    list.splice(to, 0, p);
    // Se renumera 1..n y solo se guardan las hojas cuya posición cambió
    const changes = [];
    list.forEach((e, k) => { if (e.order !== k + 1) { e.order = k + 1; changes.push(persistOrder(e.id, k + 1)); } });
    await Promise.all(changes);

    if (p.notebookId !== cur.nb) { renderTree(); return; }
    const followed = sheets.some((s) => s.note && s.note.id === id);   // si se veía, la vista la sigue
    await navigate(cur.nb, followed ? to : cur.first);
  }

  /* ───────── Navegación ───────── */

  /* Abre el cuaderno `nbId` mostrando la hoja número `idx` (empezando en 0), junto con la que
   * le toca en el libro: las verticales van de dos en dos y una horizontal siempre va sola. */
  async function navigate(nbId, idx) {
    const token = ++navToken;
    await saveAll();
    if (token !== navToken) return;

    // Un cuaderno nunca está vacío: si no tiene hojas, se crea la primera
    if (!nbPages(nbId).length) {
      const p = blankPage(getNb(nbId), 1);
      await C.storage.put(p);
      upsertIndex(p);
    }
    const list = nbPages(nbId);

    viewMode = wantBook() ? 'book' : 'single';
    idx = Math.max(0, Math.min(idx, list.length - 1));
    const spreads = buildSpreads(list, viewMode === 'book');
    const si = Math.max(0, spreads.findIndex((sp) => sp.includes(idx)));
    const sp = spreads[si];
    // El hueco «Añadir hoja» solo aparece si la última hoja del cuaderno es vertical y queda sola
    const slot = viewMode === 'book' && sp.length === 1 && sp[0] === list.length - 1 && orientOf(list[sp[0]]) !== 'landscape';
    const notes = await Promise.all(sp.map((i) => C.storage.get(list[i].id)));
    if (token !== navToken) return;
    const optimized = optimizeHeavy(notes);

    cur = { nb: nbId, first: sp[0], pages: sp, spreads, si, slot };
    active = null;
    sheets[0].load(notes[0], sp[0], list.length, envFor(notes[0]));
    sheets[1].load(notes[1] || null, sp[0] + 1, list.length, envFor(null));
    spreadH = Math.max(400, ...notes.filter(Boolean).map((n) => n.height || C.defaultHeight(orientOf(n))));
    layout({ immediate: true });
    optimized.forEach(({ note }) => { const sh = sheets.find((x) => x.note === note); if (sh) markDirty(sh); });   // se guarda ya optimizada
    if (optimized.length) toast(`Hoja optimizada: ${optimized[0].from.toLocaleString('es')} → ${optimized[0].to.toLocaleString('es')} puntos, sin cambio visible.`);
    else warnIfHeavy(notes);
    setActive(sp.length === 2 && idx === sp[1] && notes[1] ? sheets[1] : sheets[0]);
    el.stage.scrollTop = 0;

    prefs.lastNb = nbId;
    prefs.pos[nbId] = cur.first;
    prefs.expanded[nbId] = true;
    savePrefs();
    refreshUI();
    if (isNarrow()) setSidebar(false, false);
  }

  const goPrev = () => { if (cur.si > 0) navigate(cur.nb, cur.spreads[cur.si - 1][0]); };
  const goNext = () => { if (cur.si < cur.spreads.length - 1) navigate(cur.nb, cur.spreads[cur.si + 1][0]); };

  /* ───────── Búsqueda ───────── */

  /* Sin tildes ni mayúsculas: «anatomia» encuentra «Anatomía». */
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const searchTerms = (q) => norm(q).split(/\s+/).filter(Boolean);

  /* Título y texto normalizados de una hoja, calculados una vez (no en cada tecla). */
  function normOf(p) {
    if (p._n === undefined) { p._t = norm(p.title); p._x = norm(p.text); p._n = 1; }
    return { t: p._t, x: p._x };
  }

  /* Escribe `text` en `parent` resaltando las apariciones de los términos. */
  function highlightInto(parent, text, terms) {
    const n = norm(text);
    if (n.length !== text.length) { parent.append(text); return; }    // la normalización cambió el largo: sin resaltado
    const ranges = [];
    for (const w of terms) {
      for (let i = n.indexOf(w); i !== -1; i = n.indexOf(w, i + w.length)) ranges.push([i, i + w.length]);
    }
    ranges.sort((a, b) => a[0] - b[0]);
    let pos = 0;
    for (const [a, b] of ranges) {
      if (b <= pos) continue;
      const from = Math.max(a, pos);
      if (from > pos) parent.append(text.slice(pos, from));
      const m = document.createElement('mark');
      m.textContent = text.slice(from, b);
      parent.append(m);
      pos = b;
    }
    if (pos < text.length) parent.append(text.slice(pos));
  }

  /* Fragmento del texto alrededor de la primera coincidencia. null si el texto no coincide. */
  function snippetOf(text, terms) {
    const flat = text.replace(/\s+/g, ' ').trim();
    const n = norm(flat);
    if (n.length !== flat.length) return flat.slice(0, 90);
    const hits = terms.map((w) => n.indexOf(w)).filter((i) => i >= 0);
    if (!hits.length) return null;
    const at = Math.min(...hits);
    const start = Math.max(0, at - 32), end = Math.min(flat.length, at + 70);
    return (start > 0 ? '…' : '') + flat.slice(start, end) + (end < flat.length ? '…' : '');
  }

  /* Lo que se está escribiendo aún no está guardado: se incluye en la búsqueda. */
  function syncLiveIndex() {
    for (const s of sheets) {
      if (!s.note || !s.dirty) continue;
      const e = pages.find((p) => p.id === s.note.id);
      if (e) { e.title = s.el.title.value.trim(); e.text = s.allText(); e._n = undefined; }
    }
  }

  function renderSearch(terms) {
    syncLiveIndex();
    el.tree.textContent = '';
    let total = 0;
    const groups = [];

    for (const nb of notebooks) {
      const nbN = norm(nb.name);
      const nameHit = terms.every((w) => nbN.includes(w));
      const hits = [];
      nbPages(nb.id).forEach((p, i) => {
        const { t, x } = normOf(p);
        const inPage = terms.some((w) => t.includes(w) || x.includes(w));
        // Cada palabra debe estar en el título, el texto o el nombre del cuaderno (en cualquier orden)
        if (inPage && terms.every((w) => t.includes(w) || x.includes(w) || nbN.includes(w))) hits.push({ p, i });
      });
      if (!nameHit && !hits.length) continue;
      total += hits.length || 1;
      groups.push({ nb, nameHit, hits });
    }

    if (!groups.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.append('Sin resultados para «' + query.trim() + '»');
      const small = document.createElement('small');
      small.textContent = 'Se busca en nombres de cuadernos, títulos y texto escrito con teclado. Lo escrito a mano no se puede buscar.';
      li.append(small);
      el.tree.appendChild(li);
      return;
    }

    const count = document.createElement('li');
    count.className = 'result-count';
    count.textContent = total === 1 ? '1 resultado' : total + ' resultados';
    el.tree.appendChild(count);

    for (const { nb, hits } of groups) {
      const li = document.createElement('li');
      li.className = 'res-group';
      if (nb.color) li.style.setProperty('--nbc', nb.color);

      const head = document.createElement('button');
      head.type = 'button';
      head.className = 'res-head';
      head.title = 'Abrir el cuaderno';
      const dot = document.createElement('span');
      dot.className = 'nb-dot';
      const name = document.createElement('span');
      name.className = 'nb-name';
      highlightInto(name, nb.name, terms);
      head.append(dot, name);
      head.addEventListener('click', () => navigate(nb.id, prefs.pos[nb.id] || 0));
      li.appendChild(head);

      for (const { p, i } of hits) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'pg result';
        const t = document.createElement('span');
        t.className = 'pg-t';
        t.append('Hoja ' + (i + 1));
        if (p.title) { t.append(' · '); highlightInto(t, p.title, terms); }
        const sub = document.createElement('span');
        sub.className = 'pg-sub';
        const snip = snippetOf(p.text, terms);
        if (snip) highlightInto(sub, snip, terms); else sub.textContent = firstLine(p.text) || 'Coincide en el título';
        b.append(t, sub);
        b.addEventListener('click', () => navigate(nb.id, i));
        li.appendChild(b);
      }
      el.tree.appendChild(li);
    }
  }

  /* ───────── Interfaz derivada del estado ───────── */

  function refreshUI() {
    refreshToolUI();           // los colores del panel dependen del modo oscuro del cuaderno abierto
    syncNotebookUI();
    renderBookbar();
    renderTree();
    renderCarousel();
  }

  function renderBookbar() {
    const nb = getNb(cur.nb);
    el.nbName.textContent = nb ? nb.name : '';
    if (nb && nb.color) el.nbName.style.setProperty('--nbc', nb.color); else el.nbName.style.removeProperty('--nbc');
    const n = nbPages(cur.nb).length;
    const [a, b] = cur.pages;
    el.spreadInfo.textContent = cur.pages.length === 2 ? `Hojas ${a + 1}–${b + 1} de ${n}` : `Hoja ${a + 1} de ${n}`;
    syncViewButtons();
  }

  function renderCarousel() {
    const list = nbPages(cur.nb);
    const open = new Set(visibleSheets().filter((s) => s.note).map((s) => s.note.id));
    carousel.render(list, open, active && active.note ? active.note.id : null);
    carousel.setNav(cur.si > 0, cur.si < cur.spreads.length - 1);
  }

  function iconButton(cls, title, svgInner, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${svgInner}</svg>`;
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(b); });
    return b;
  }

  const ICON = {
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
    close: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    palette: '<circle cx="12" cy="12" r="9"/><circle cx="8.5" cy="10" r="1" fill="currentColor"/><circle cx="12" cy="7.5" r="1" fill="currentColor"/><circle cx="15.5" cy="10" r="1" fill="currentColor"/><path d="M12 21a2.5 2.5 0 0 1 0-5h1.5a2 2 0 0 0 2-2"/>',
    up: '<polyline points="18 15 12 9 6 15"/>',
    down: '<polyline points="6 9 12 15 18 9"/>',
  };

  const pageLabel = (p) => p.title || firstLine(p.text) || (p.hasInk ? 'Escrito a mano' : 'En blanco');

  function toggleExpanded(id) {
    prefs.expanded[id] = prefs.expanded[id] !== true;
    savePrefs();
    renderTree();
  }

  function renderTree() {
    const terms = searchTerms(query);
    if (terms.length) { renderSearch(terms); return; }

    el.tree.textContent = '';
    const visibleIds = new Set(visibleSheets().filter((s) => s.note).map((s) => s.note.id));
    const activeId = active && active.note ? active.note.id : null;

    for (const nb of notebooks) {
      const list = nbPages(nb.id);
      const isCur = nb.id === cur.nb;
      const open = prefs.expanded[nb.id] === true;

      const li = document.createElement('li');
      li.className = 'nb' + (isCur ? ' current' : '') + (open ? ' open' : '');
      if (nb.color) li.style.setProperty('--nbc', nb.color);   // sin color: el gris neutro por defecto

      const row = document.createElement('div');
      row.className = 'nb-row';

      const toggle = iconButton('nb-toggle', open ? 'Contraer' : 'Expandir',
        '<polyline points="9 18 15 12 9 6"/>', () => toggleExpanded(nb.id));
      toggle.setAttribute('aria-expanded', String(open));

      const name = document.createElement('button');
      name.type = 'button';
      name.className = 'nb-open';
      name.title = 'Abrir el cuaderno';
      name.innerHTML = '<span class="nb-dot"></span><span class="nb-name"></span><span class="nb-count"></span>';
      name.querySelector('.nb-name').textContent = nb.name;
      name.querySelector('.nb-count').textContent = list.length;
      // Un clic abre el cuaderno; si ya es el abierto, solo despliega o contrae sus hojas
      name.addEventListener('click', () => (isCur ? toggleExpanded(nb.id) : navigate(nb.id, prefs.pos[nb.id] || 0)));

      const actions = document.createElement('span');
      actions.className = 'nb-actions';
      actions.append(
        iconButton('mini', 'Cambiar el color del cuaderno', ICON.palette, (btn) => openColorPop(nb.id, btn)),
        iconButton('mini', 'Añadir una hoja', ICON.plus, () => addPage(nb.id)),
        iconButton('mini', 'Renombrar', ICON.edit, () => renameNotebook(nb.id)),
        iconButton('mini danger', 'Eliminar el cuaderno', ICON.close, () => deleteNotebook(nb.id)),
      );

      row.append(toggle, name, actions);
      li.appendChild(row);

      if (open) {
        const ul = document.createElement('ul');
        ul.className = 'nb-pages';
        list.forEach((p, i) => {
          const pli = document.createElement('li');
          pli.className = 'pg-row';
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'pg' + (visibleIds.has(p.id) ? ' open' : '') + (p.id === activeId ? ' active' : '');
          b.innerHTML = '<span class="pg-n"></span><span class="pg-t"></span>';
          b.querySelector('.pg-n').textContent = i + 1;
          b.querySelector('.pg-t').textContent = pageLabel(p);
          b.addEventListener('click', () => navigate(nb.id, i));

          const acts = document.createElement('span');
          acts.className = 'pg-actions';
          const up = iconButton('mini', 'Subir una posición', ICON.up, () => movePage(p.id, -1));
          const down = iconButton('mini', 'Bajar una posición', ICON.down, () => movePage(p.id, 1));
          up.disabled = i === 0;
          down.disabled = i === list.length - 1;
          acts.append(up, down, iconButton('mini danger', 'Eliminar la hoja', ICON.close, () => deletePage(p.id)));

          pli.append(b, acts);
          ul.appendChild(pli);
        });
        li.appendChild(ul);
      }
      el.tree.appendChild(li);
    }
  }

  /* Selector de color de un cuaderno, junto al botón que lo abrió. */
  function closeColorPop() { el.colorPop.hidden = true; }

  function openColorPop(nbId, anchor) {
    const nb = getNb(nbId);
    if (!nb) return;
    closeCtx();
    const pop = el.colorPop;
    pop.textContent = '';
    const title = document.createElement('p');
    title.className = 'pop-title';
    title.textContent = 'Color de «' + nb.name + '»';
    pop.append(title);

    for (const hex of NB_COLORS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch' + (nb.color === hex ? ' active' : '');
      b.title = hex;
      b.setAttribute('aria-label', 'Color ' + hex);
      b.style.setProperty('--c', hex);
      b.addEventListener('click', () => { setNbColor(nbId, hex); closeColorPop(); });
      pop.append(b);
    }
    const custom = document.createElement('label');
    custom.className = 'swatch custom';
    custom.title = 'Otro color';
    const input = document.createElement('input');
    input.type = 'color';
    input.value = nb.color || NB_COLORS[0];
    input.setAttribute('aria-label', 'Elegir otro color');
    input.addEventListener('input', () => setNbColor(nbId, input.value));
    custom.append(input);
    pop.append(custom);

    const none = document.createElement('button');
    none.type = 'button';
    none.className = 'pop-none';
    none.textContent = 'Sin color';
    none.addEventListener('click', () => { setNbColor(nbId, null); closeColorPop(); });
    pop.append(none);

    pop.hidden = false;
    const a = anchor.getBoundingClientRect();
    const r = pop.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(a.left, window.innerWidth - r.width - 8)) + 'px';
    pop.style.top = (a.bottom + 6 + r.height > window.innerHeight ? Math.max(8, a.top - r.height - 6) : a.bottom + 6) + 'px';
  }

  /* `remember` guarda la elección; el cierre automático en pantallas estrechas no la pisa. */
  function setSidebar(open, remember = true) {
    el.app.classList.toggle('sidebar-hidden', !open);
    if (remember && !isNarrow()) { prefs.sidebar = open; savePrefs(); }
  }

  /* ───────── Exportar / importar ───────── */

  async function importFile(file) {
    try {
      const n = C.exporter.parseImport(await file.text());
      n.notebookId = cur.nb;
      n.order = nextOrder(cur.nb);
      await C.storage.put(n);
      upsertIndex(n);
      await navigate(cur.nb, nbPages(cur.nb).length - 1);
      toast('Hoja importada al cuaderno «' + getNb(cur.nb).name + '»');
    } catch (err) {
      toast(err.message || 'No se pudo importar el archivo');
    }
  }

  /* Imagen PNG. Con dos hojas a la vista se pregunta qué exportar. */
  async function exportImage() {
    const nb = getNb(cur.nb);
    const shown = visibleSheets().filter((s) => s.note);
    const named = (s) => { const n = s.snapshot(); n.title = n.title || `${nb.name} - Hoja ${s.index + 1}`; return n; };
    let choice = 'active';

    if (shown.length === 2) {
      choice = await ask(el.exportDialog, () => {
        $('#exportActiveBtn').textContent = `Solo la hoja activa (Hoja ${active.index + 1})`;
      });
      if (choice === 'cancel') return;
    }

    if (choice === 'active') {
      await C.exporter.exportPNG(named(active), active.pageW, undefined, { dark: isDark(curNb()) });
      toast('Imagen exportada');
    } else if (choice === 'both-one') {
      const a = shown[0], b = shown[1];
      const file = C.exporter.safeName(`${nb.name} - Hojas ${a.index + 1}-${b.index + 1}`) + '.png';
      await C.exporter.exportSpreadPNG([named(a), named(b)], Math.max(a.pageW, b.pageW), file, { dark: isDark(curNb()) });
      toast('Imagen exportada con las dos hojas');
    } else {
      for (const s of shown) {
        await C.exporter.exportPNG(named(s), s.pageW, undefined, { dark: isDark(curNb()) });
        await new Promise((r) => setTimeout(r, 400));     // que el navegador no fusione las descargas
      }
      toast('Se exportaron 2 imágenes');
    }
  }

  async function exportAction(action) {
    if (action === 'import') { el.fileImport.click(); return; }
    if (!active || !active.note) return;
    if (action === 'copy' || action === 'copy-both') { copyImage(action === 'copy' ? 'active' : 'both'); return; }
    if (action === 'share' || action === 'share-both') { shareImage(action === 'share' ? 'active' : 'both'); return; }
    if (action === 'png') { await exportImage(); return; }
    if (action === 'json') {
      const nb = getNb(cur.nb);
      const snap = active.snapshot();
      snap.title = snap.title || `${nb.name} - Hoja ${active.index + 1}`;   // solo para el nombre del archivo
      C.exporter.exportJSON(snap);
      toast('Hoja exportada');
    }
  }

  /* ───────── Orientación (por hoja) y modo oscuro (por cuaderno) ───────── */

  function syncViewButtons() {
    $$('.seg-btn[data-view]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.view === prefs.view));
      b.title = b.dataset.view === 'book'
        ? 'Dos hojas a la vez, como un libro abierto (las hojas horizontales van solas)'
        : 'Una sola hoja';
    });
  }

  /* Los controles de orientación muestran y cambian la de la hoja activa, no la de las demás. */
  function syncNotebookUI() {
    const nb = curNb();
    const note = active && active.note;
    el.darkMode.checked = isDark(nb);
    $$('.seg-btn[data-orient]').forEach((b) => {
      b.setAttribute('aria-pressed', String(!!note && b.dataset.orient === orientOf(note)));
      b.disabled = !note;
    });
    $('#orientSeg').title = note ? `Orientación de la hoja activa (Hoja ${active.index + 1}); las demás no cambian` : 'Orientación de la hoja activa';
    syncViewButtons();
  }

  /* El modo oscuro cambia cómo se ven papel, texto y trazos de este cuaderno, y los
   * colores del panel; lo guardado en las hojas no se toca. */
  async function setNbDark(on) {
    const nb = curNb();
    if (!nb) return;
    nb.dark = !!on;
    visibleSheets().forEach((s) => s.setDark(nb.dark));
    refreshToolUI();
    renderCarousel();                       // las miniaturas se redibujan con el tema nuevo
    await C.storage.putNotebook(nb);
  }

  /* Altura que le corresponde a una hoja en una orientación, sin cortar lo escrito. */
  function fitHeight(n, orient) {
    const W = C.pageWidth(orient), base = C.defaultHeight(orient);
    let extent = 0;
    for (const st of n.strokes || []) for (const p of st.points) if (p[1] > extent) extent = p[1];
    if (extent) extent += 60;
    if (n.text) {
      const S = n.paper.spacing, mt = C.text.metrics(S);
      const lines = C.text.wrap(n.text, S, W - mt.padLeft - mt.padRight).length;
      extent = Math.max(extent, mt.padTop + lines * S + S * 3);
    }
    for (const b of n.boxes || []) {              // cuadros de texto (su ancho se ajusta al de la hoja sin tocar lo guardado)
      const S = n.paper.spacing, x = Math.min(b.x, W - 40), w = Math.min(b.w, W - x - 4);
      extent = Math.max(extent, b.y + C.text.wrap(b.text, S, w - 2 * C.text.BOX_PAD).length * S + S * 3);
    }
    return Math.max(400, Math.min(MAX_HEIGHT, Math.max(base, Math.ceil(extent))));
  }

  /* Cambia la orientación de UNA hoja. Las demás no se tocan; solo cambia con quién se empareja
   * en el libro (una horizontal va sola). */
  async function setPageOrient(id, orient) {
    const m = pages.find((x) => x.id === id);
    if (!m || orientOf(m) === orient) return;
    await saveAll();
    const n = await C.storage.get(id);
    if (!n) return;
    n.orient = orient;
    n.height = fitHeight(n, orient);
    await C.storage.put(n);
    upsertIndex(n);
    const idx = nbPages(m.notebookId).findIndex((p) => p.id === id);
    await navigate(m.notebookId, idx);
    toast(orient === 'landscape'
      ? `Hoja ${idx + 1} en horizontal: se muestra sola, con el lienzo completo.`
      : `Hoja ${idx + 1} en vertical.`);
  }

  /* ───────── Joystick de desplazamiento, modo ahorro y guía ───────── */

  /* El joystick aparece centrado donde se hizo el clic derecho y se cierra solo al seguir escribiendo
   * o dibujando (o con Esc o su ×): no queda estorbando ni hay que acordarse de cerrarlo. */
  function setJoystick(on, at) {
    joyOpen = !!on;
    if (joyOpen) {
      const r = el.stage.getBoundingClientRect();
      const p = at || { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      joystick.show({ cx: p.x, cy: p.y });
    } else joystick.hide();
    el.cmJoystick.setAttribute('aria-pressed', String(joyOpen));
  }

  function setRuler(on) {
    prefs.ruler = !!on;
    savePrefs();
    ruler.setOn(prefs.ruler);
    el.btnRuler.setAttribute('aria-pressed', String(prefs.ruler));
    el.gRuler.checked = prefs.ruler;
    if (prefs.ruler) ruler.update();
  }

  /* Modo ahorro: menos resolución en los lienzos (tope 1,25 px por px lógico) y la mitad del presupuesto de memoria. */
  function setEco(on) {
    prefs.eco = !!on;
    C.perf.eco = prefs.eco;
    savePrefs();
    el.gEco.checked = prefs.eco;
    if (cur.nb) layout({ immediate: true });
    toast(prefs.eco ? 'Modo ahorro activado: los lienzos usan menos memoria.' : 'Modo ahorro apagado: lienzos a plena resolución.');
  }

  /* La guía muestra y cambia los mismos ajustes que la barra y el menú del clic derecho. */
  function syncGuide() {
    el.gStab.value = String(prefs.stabilizer);
    el.gHold.checked = prefs.holdShape;
    el.gScratch.checked = prefs.scratch;
    el.gAuto.checked = prefs.autoSwitch;
    el.gPenOnly.checked = prefs.penOnly;
    el.gRuler.checked = prefs.ruler;
    el.gCtrlPan.checked = prefs.ctrlPan;
    el.gJoySpeed.value = String(prefs.joySpeed);
    el.gEco.checked = prefs.eco;
  }

  /* La guía va por pestañas: solo se ve una sección a la vez y la ventana no crece. */
  function showGuideTab(id) {
    guideTab = id;
    $$('#guideTabs [role="tab"]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.g === id)));
    $$('#guideBody .g-sec').forEach((sec) => { sec.hidden = sec.id !== id; });
    $('#guideBody').scrollTop = 0;
  }

  function openGuide() {
    if (el.guideDialog.open) return;
    closeCtx();
    syncGuide();
    showGuideTab(guideTab);
    el.guideDialog.showModal();
  }

  function bindGuide() {
    el.btnGuide.addEventListener('click', openGuide);
    $('#guideClose').addEventListener('click', () => el.guideDialog.close());
    el.guideDialog.addEventListener('click', (e) => { if (e.target === el.guideDialog) el.guideDialog.close(); });
    const tabs = $$('#guideTabs [role="tab"]');
    tabs.forEach((b) => b.addEventListener('click', () => showGuideTab(b.dataset.g)));
    $('#guideTabs').addEventListener('keydown', (e) => {            // flechas: pasar de pestaña
      const i = tabs.findIndex((b) => b.dataset.g === guideTab);
      const next = { ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (next === undefined || !tabs[next]) return;
      e.preventDefault();
      showGuideTab(tabs[next].dataset.g);
      tabs[next].focus();
    });
    el.gStab.addEventListener('change', () => setStabilizer(Number(el.gStab.value)));
    el.gHold.addEventListener('change', () => { prefs.holdShape = el.gHold.checked; toolChanged(); });
    el.gScratch.addEventListener('change', () => { prefs.scratch = el.gScratch.checked; toolChanged(); });
    el.gAuto.addEventListener('change', () => { prefs.autoSwitch = el.gAuto.checked; toolChanged(); });
    el.gPenOnly.addEventListener('change', () => { prefs.penOnly = el.gPenOnly.checked; toolChanged(); });
    el.gJoySpeed.addEventListener('change', () => { prefs.joySpeed = Number(el.gJoySpeed.value); savePrefs(); });
    el.gJoyOpen.addEventListener('click', () => { el.guideDialog.close(); setJoystick(true); });
    el.gRuler.addEventListener('change', () => setRuler(el.gRuler.checked));
    el.gCtrlPan.addEventListener('change', () => { prefs.ctrlPan = el.gCtrlPan.checked; savePrefs(); if (!prefs.ctrlPan) el.app.classList.remove('panning'); });
    el.gEco.addEventListener('change', () => setEco(el.gEco.checked));
  }

  /* ───────── Modo enfoque ───────── */

  /* Oculta todo menos la hoja. Las barras vuelven al acercar el puntero al borde (o al tocar la marca
   * del borde, en pantallas táctiles); el área de trabajo crece y la hoja se reajusta sola. */
  function setFocus(on) {
    focusMode = !!on;
    el.app.classList.toggle('focus', focusMode);
    el.app.classList.remove('show-top', 'show-left', 'show-bottom');
    el.cmFocus.setAttribute('aria-pressed', String(focusMode));
    closeCtx();
    closeColorPop();
    if (focusMode) toast('Modo enfoque: acerca el puntero a un borde para ver las barras. Alt+F para salir.');
  }

  function bindFocusMode() {
    const timers = {};
    const zones = { top: el.chromeTop, left: el.sidebar, bottom: el.carouselNav };
    for (const edge of Object.keys(zones)) {
      const zone = zones[edge];
      const mark = $(`.edge[data-edge="${edge}"]`);
      const show = () => { clearTimeout(timers[edge]); el.app.classList.add('show-' + edge); };
      const hideLater = () => {
        clearTimeout(timers[edge]);
        timers[edge] = setTimeout(() => {
          if (zone.contains(document.activeElement) && isEditing(document.activeElement)) return;   // eligiendo en un desplegable
          el.app.classList.remove('show-' + edge);
        }, 450);
      };
      mark.addEventListener('pointerenter', show);
      mark.addEventListener('pointerleave', hideLater);
      mark.addEventListener('click', () => (el.app.classList.contains('show-' + edge) ? el.app.classList.remove('show-' + edge) : show()));
      zone.addEventListener('pointerenter', () => { if (focusMode) show(); });
      zone.addEventListener('pointerleave', () => { if (focusMode) hideLater(); });
      zone.addEventListener('focusout', () => { if (focusMode) hideLater(); });
    }
    // Al empezar a escribir o dibujar, las barras se esconden
    el.stage.addEventListener('pointerdown', () => el.app.classList.remove('show-top', 'show-left', 'show-bottom'), true);
    el.focusExit.addEventListener('click', () => setFocus(false));
  }

  /* ───────── Índice del cuaderno ───────── */

  async function openIndex(nbId = cur.nb) {
    const nb = getNb(nbId);
    if (!nb) return;
    await saveAll();                                  // las miniaturas se leen de lo guardado
    const idx = nbId === cur.nb && active && active.note ? active.index : (prefs.pos[nbId] || 0);
    outline.open(nb, nbPages(nbId), idx, isDark(nb), (i) => navigate(nbId, i));
  }

  /* ───────── Copiar y compartir la hoja como imagen ───────── */

  /* Qué se copia o comparte: la hoja activa, o las dos a la vista en una sola imagen (scope 'both'). */
  function imageJob(scope) {
    const nb = curNb();
    const shown = visibleSheets().filter((s) => s.note);
    const used = scope === 'both' && shown.length === 2 ? shown : [active];
    const dark = isDark(nb);
    const named = (s) => { const n = s.snapshot(); n.title = n.title || `${nb.name} - Hoja ${s.index + 1}`; return n; };
    const title = used.length === 2 ? `${nb.name} - Hojas ${used[0].index + 1}-${used[1].index + 1}` : named(used[0]).title;
    // La clave cambia con cualquier edición de la hoja: así la imagen preparada nunca queda vieja
    const key = used.map((s) => `${s.note.id}:${s.rev || 0}:${s.note.updatedAt}:${s.height}:${s.orient}`).join('|') + (dark ? ':d' : '');
    return { key, dark, used, named, title, filename: C.exporter.safeName(title) + '.png' };
  }

  /* Promesa del PNG. Se guarda la última: si no cambió nada, copiar o compartir es instantáneo. */
  function imageBlob(job) {
    if (imageCache && imageCache.key === job.key) return imageCache.promise;
    const notes = job.used.map(job.named);
    const promise = notes.length === 2
      ? C.exporter.spreadBlob(notes, Math.max(...job.used.map((s) => s.pageW)), { dark: job.dark })
      : C.exporter.pngBlob(notes[0], job.used[0].pageW, { dark: job.dark });
    const entry = { key: job.key, promise, ready: false };
    imageCache = entry;
    promise.then(() => { entry.ready = true; }, () => { if (imageCache === entry) imageCache = null; });
    return promise;
  }

  /* Al pasar el puntero por Copiar o Compartir ya se va preparando la imagen: Safari exige que
   * compartir ocurra dentro del gesto del clic, y así no hay que esperar a dibujarla. */
  let warmTimer = 0;
  function warmImage(scope) {
    if (!active || !active.note) return;
    clearTimeout(warmTimer);
    warmTimer = setTimeout(() => { if (active && active.note) imageBlob(imageJob(scope)).catch(() => {}); }, 40);
  }

  async function copyImage(scope) {
    if (!active || !active.note) return;
    const job = imageJob(scope);
    try {
      await C.exporter.copyImage(() => imageBlob(job));       // empieza ya, dentro del gesto
      toast(job.used.length === 2 ? 'Las dos hojas se copiaron como una imagen: pégalas donde quieras' : 'Hoja copiada como imagen: pégala donde quieras');
    } catch (err) {
      console.warn('No se pudo copiar la imagen', err);
      toast(err && err.code === 'unsupported'
        ? 'Este navegador no permite copiar imágenes. Usa Exportar → Imagen (PNG).'
        : 'No se pudo copiar la imagen (el navegador no lo permitió). Prueba de nuevo o usa Exportar.');
    }
  }

  async function shareImage(scope) {
    if (!active || !active.note) return;
    const job = imageJob(scope);
    const ready = !!(imageCache && imageCache.key === job.key && imageCache.ready);
    try {
      await C.exporter.shareImage(await imageBlob(job), job.filename, job.title);
    } catch (err) {
      if (err && err.name === 'AbortError') return;             // cerró el menú de compartir
      if (err && err.name === 'NotAllowedError' && !ready) {    // Safari: la imagen tardó y el gesto caducó; ya está lista
        toast('Imagen preparada: pulsa «Compartir» otra vez.');
        return;
      }
      if (err && err.code === 'unsupported') {
        try { C.exporter.download(await imageBlob(job), job.filename); } catch (_) { /* se avisa abajo */ }
        toast('Este navegador no abre el menú de compartir: la imagen se guardó en Descargas.');
        return;
      }
      console.warn('No se pudo compartir la imagen', err);
      toast('No se pudo compartir la imagen.');
    }
  }

  /* ───────── Pegar texto y desplazarse con Ctrl ───────── */

  let lastPtr = null;       // última posición del puntero sobre el área de trabajo

  /* Pega texto en un cuadro de texto: donde está el puntero (o `at`), sobre la hoja que haya debajo; si el
   * puntero no está sobre ninguna, justo debajo del cuerpo del texto de la hoja activa. */
  function pasteText(text, at) {
    text = String(text).replace(/\r\n?/g, '\n').slice(0, 20000);
    if (!text.trim()) return;
    const p = at || lastPtr;
    const hit = p && visibleSheets().find((s) => {
      if (!s.note) return false;
      const r = s.el.sheet.getBoundingClientRect();
      return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
    });
    const sheet = hit || (active && active.note ? active : null);
    if (!sheet) return;
    if (sheet !== active) setActive(sheet);
    if (mode !== 'text') setMode('text');
    let lx, ly;
    if (hit) [lx, ly] = sheet.toLogical(p.x, p.y);
    else {
      const m = C.text.metrics(sheet.note.paper.spacing);
      lx = m.padLeft + C.text.BOX_PAD;
      ly = sheet.el.text.offsetHeight + m.spacing;
    }
    sheet.boxes.create(lx, ly, text);
    toast('Texto pegado en un cuadro. Arrástralo por su asa ⠿ para moverlo.');
  }

  /* Ctrl+V fuera de un campo de texto (con el lápiz, o sin nada enfocado) pega el texto del portapapeles. */
  function onPaste(e) {
    if (isEditing(e.target) || document.querySelector('dialog[open]')) return;     // en un campo de texto pega el navegador
    const text = e.clipboardData && e.clipboardData.getData('text/plain');
    if (!text || !text.trim()) return;
    e.preventDefault();
    pasteText(text);
  }

  /* Con Ctrl pulsado, mover el puntero desplaza la hoja siguiéndolo, como la lupa del sistema, y no se
   * dibuja nada. Es relativo (no salta al pulsar Ctrl) y se acelera con el zoom: cruzar la pantalla
   * recorre buena parte de la hoja. */
  function bindCtrlPan() {
    let last = null;
    const stop = () => { last = null; el.app.classList.remove('panning'); };
    el.stage.addEventListener('pointermove', (e) => {
      lastPtr = { x: e.clientX, y: e.clientY };
      if (!prefs.ctrlPan || !e.ctrlKey || e.metaKey || sheets.some((s) => s.ink.busy())) { last = null; return; }
      if (last) {
        const st = el.stage;
        const gx = Math.max(1, (st.scrollWidth - st.clientWidth) / (0.6 * st.clientWidth));
        const gy = Math.max(1, (st.scrollHeight - st.clientHeight) / (0.6 * st.clientHeight));
        st.scrollLeft += (e.clientX - last.x) * gx;
        st.scrollTop += (e.clientY - last.y) * gy;
      }
      last = { x: e.clientX, y: e.clientY };
    }, { capture: true, passive: true });
    document.addEventListener('keydown', (e) => { if (e.key === 'Control' && prefs.ctrlPan) el.app.classList.add('panning'); });
    document.addEventListener('keyup', (e) => { if (e.key === 'Control') stop(); });
    window.addEventListener('blur', stop);
  }

  /* ───────── Lazo: copiar, cortar y pegar trazos ───────── */

  function copySelection(cut) {
    const list = active && active.note ? active.ink.copySelection() : null;
    if (!list) return;
    strokeClip = { strokes: list, from: cut ? null : active.note.id, n: 0 };
    if (cut) active.ink.deleteSelection();
    toast((cut ? 'Cortado' : 'Copiado') + ': pega con Ctrl/Cmd+V, también en otra hoja');
  }

  function pasteSelection() {
    if (!strokeClip || !active || !active.note) return;
    // En la misma hoja cada pegado se corre un poco para no taparse con el anterior
    const off = strokeClip.from === active.note.id ? 24 * ++strokeClip.n : 0;
    active.ink.paste(strokeClip.strokes, off, off);
  }

  /* ───────── Recursos en uso ───────── */

  /* Las hojas guardadas por versiones anteriores no pasaron por la simplificación. Si alguna es
   * muy pesada se simplifica una vez, al abrirla (cambio < 0,2 px, invisible) y se guarda así. */
  function optimizeHeavy(notes) {
    const done = [];
    for (const n of notes) {
      if (!n || !n.strokes) continue;
      let from = 0;
      for (const st of n.strokes) from += st.points.length;
      if (from < OPTIMIZE_POINTS) continue;
      n.strokes = n.strokes.map((st) => ({ ...st, points: C.ink.simplify(st.points, 0.2) }));
      let to = 0;
      for (const st of n.strokes) to += st.points.length;
      if (to < from) done.push({ note: n, from, to });
    }
    return done;
  }

  function warnIfHeavy(notes) {
    for (const n of notes) {
      if (!n || warnedHeavy.has(n.id)) continue;
      let pts = 0;
      for (const s of n.strokes || []) pts += s.points.length;
      if (pts >= HEAVY_POINTS) {
        warnedHeavy.add(n.id);
        toast(`Esta hoja tiene mucho detalle (${Math.round(pts / 1000)} mil puntos) y puede ir más lenta. Considera seguir en una hoja nueva.`);
        break;
      }
    }
  }

  async function collectMetrics() {
    const per = visibleSheets().map((s) => s.metrics());
    const th = carousel.stats();
    const pm = performance.memory;
    const usage = await C.storage.usage();
    return {
      canvasMB: per.reduce((a, m) => a + m.canvasMB, 0),
      points: per.reduce((a, m) => a + m.points, 0),
      strokes: per.reduce((a, m) => a + m.strokes, 0),
      redrawMs: Math.max(0, ...per.map((m) => m.redrawMs)),
      saveMs: lastSaveMs,
      heapMB: pm ? pm.usedJSHeapSize / 1048576 : null,
      thumbs: th,
      usage,
      pages: pages.length,
      notebooks: notebooks.length,
      textKB: pages.reduce((a, p) => a + p.text.length, 0) / 1024,
    };
  }

  const level = (v, warn, danger) => (v >= danger ? 'danger' : v >= warn ? 'warn' : 'ok');
  const fmtMB = (v) => (v >= 100 ? v.toFixed(0) : v.toFixed(1)) + ' MB';

  async function renderPerf() {
    const m = await collectMetrics();
    const rows = [
      { label: 'Memoria de los lienzos', value: fmtMB(m.canvasMB), frac: m.canvasMB / CANVAS_LIMIT_MB, lv: level(m.canvasMB, 90, CANVAS_LIMIT_MB), hint: `límite de seguridad ${CANVAS_LIMIT_MB} MB` },
      { label: 'Puntos en las hojas abiertas', value: m.points.toLocaleString('es') + ` (${m.strokes.toLocaleString('es')} trazos)`, frac: m.points / HEAVY_POINTS, lv: level(m.points, 150000, HEAVY_POINTS), hint: 'más de 400 mil se nota' },
      { label: 'Último redibujado', value: m.redrawMs.toFixed(0) + ' ms', frac: m.redrawMs / 100, lv: level(m.redrawMs, 40, 100), hint: 'ideal: menos de 16 ms por cuadro' },
      { label: 'Último guardado', value: m.saveMs.toFixed(0) + ' ms', frac: m.saveMs / 150, lv: level(m.saveMs, 50, 150), hint: 'el autoguardado se espacia si tarda' },
      m.heapMB === null
        ? { label: 'Memoria de JavaScript', value: 'no disponible en este navegador', frac: 0, lv: 'ok' }
        : { label: 'Memoria de JavaScript', value: fmtMB(m.heapMB), frac: m.heapMB / 600, lv: level(m.heapMB, 300, 600), hint: 'datos y trazos de las hojas abiertas' },
      { label: 'Miniaturas en memoria', value: `${m.thumbs.count} de ${m.thumbs.max} (${fmtMB(m.thumbs.mb)})`, frac: m.thumbs.count / m.thumbs.max, lv: 'ok', hint: 'tope fijo: no crecen más' },
      m.usage
        ? { label: 'Almacenamiento del sitio', value: `${fmtMB(m.usage.used / 1048576)} de ${(m.usage.quota / 1073741824).toFixed(0)} GB`, frac: m.usage.used / Math.max(1, m.usage.quota), lv: level(m.usage.used / Math.max(1, m.usage.quota), 0.5, 0.8) }
        : { label: 'Almacenamiento del sitio', value: 'no disponible', frac: 0, lv: 'ok' },
      { label: 'Contenido', value: `${m.notebooks} cuaderno${m.notebooks === 1 ? '' : 's'}, ${m.pages} hoja${m.pages === 1 ? '' : 's'}`, frac: 0, lv: 'ok', hint: 'al abrir solo se leen resúmenes' },
    ];

    el.perfList.textContent = '';
    for (const r of rows) {
      const row = document.createElement('div');
      row.className = 'perf-row';
      const head = document.createElement('div');
      head.className = 'perf-head';
      const dot = document.createElement('span');
      dot.className = 'perf-dot ' + r.lv;
      const label = document.createElement('span');
      label.className = 'perf-label';
      label.textContent = r.label;
      const val = document.createElement('span');
      val.className = 'perf-val';
      val.textContent = r.value;
      head.append(dot, label, val);
      row.append(head);
      if (r.frac > 0) {
        const bar = document.createElement('div');
        bar.className = 'perf-bar ' + r.lv;
        const fill = document.createElement('i');
        fill.style.width = Math.min(100, Math.max(2, r.frac * 100)) + '%';
        bar.append(fill);
        row.append(bar);
      }
      if (r.hint) { const h = document.createElement('div'); h.className = 'perf-hint'; h.textContent = r.hint; row.append(h); }
      el.perfList.append(row);
    }

    const worst = rows.find((r) => r.lv === 'danger') || rows.find((r) => r.lv === 'warn');
    const tips = {
      'Memoria de los lienzos': 'Los lienzos usan mucha memoria: aleja el zoom, pasa a «Una hoja» o activa el Modo ahorro en la Guía.',
      'Puntos en las hojas abiertas': 'Hay hojas con muchísimo detalle: seguir en una hoja nueva las mantiene fluidas.',
      'Último redibujado': 'El redibujado tarda: aleja el zoom o divide la hoja en dos.',
      'Último guardado': 'Guardar tarda: el autoguardado ya se espacia solo; considera dividir la hoja.',
      'Memoria de JavaScript': 'Mucha memoria en uso: recarga la página para liberarla.',
      'Almacenamiento del sitio': 'El almacenamiento se está llenando: exporta y elimina hojas que ya no uses.',
    };
    el.perfTip.textContent = worst ? tips[worst.label] || '' : 'Todo en orden: el consumo está lejos de los límites.';
    el.perfTip.dataset.level = worst ? worst.lv : 'ok';
  }

  let perfTimer = 0;
  function openPerf() {
    renderPerf();
    clearInterval(perfTimer);
    perfTimer = setInterval(renderPerf, 1000);        // solo mientras la ventana está abierta
    el.perfDialog.addEventListener('close', () => clearInterval(perfTimer), { once: true });
    el.perfDialog.showModal();
  }

  /* ───────── Eventos ───────── */

  function bindEvents() {
    // Modo
    $$('.seg-btn[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode, { focus: true })));

    // Vista: libro o una hoja
    $$('.seg-btn[data-view]').forEach((b) => b.addEventListener('click', () => {
      prefs.view = b.dataset.view;
      savePrefs();
      refreshToolUI();
      if (prefs.view === 'book' && !wantBook()) toast('La ventana es muy estrecha para ver dos hojas a la vez.');
      navigate(cur.nb, active && active.note ? active.index : cur.first);
    }));

    // Zoom
    el.zoomOut.addEventListener('click', () => zoomBy(-1));
    el.zoomIn.addEventListener('click', () => zoomBy(1));
    el.zoomLabel.addEventListener('click', () => setZoom('fit'));
    el.zoomFit.addEventListener('click', () => setZoom('fit'));
    el.zoomWidth.addEventListener('click', () => setZoom('width'));
    el.btnAddSpace.addEventListener('click', () => growSpread(spreadH + 400));

    // Ctrl/Cmd + rueda (o pellizco en el trackpad) acerca y aleja
    let wheelAcc = 0;
    el.stage.addEventListener('wheel', (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      wheelAcc += e.deltaY;
      if (Math.abs(wheelAcc) >= 40) { zoomBy(wheelAcc < 0 ? 1 : -1); wheelAcc = 0; }
    }, { passive: false });

    // Color, pincel, grosor
    renderSwatches(el.swatches);
    el.penColor.addEventListener('input', () => pickColor(el.penColor.value));
    el.penSize.addEventListener('input', () => setPenSize(el.penSize.value));
    el.brush.addEventListener('change', () => setBrush(el.brush.value));

    // Borrador
    $$('[data-eraser]').forEach((b) => b.addEventListener('click', () => setEraserMode(b.dataset.eraser)));
    el.eraserSize.addEventListener('input', () => setEraserSize(el.eraserSize.value));

    // Fondo
    [el.selStyle, el.selSpacing, el.selColor].forEach((s) => s.addEventListener('change', paperChange));
    el.autoSwitch.addEventListener('change', () => { prefs.autoSwitch = el.autoSwitch.checked; savePrefs(); });
    el.penOnly.addEventListener('change', () => { prefs.penOnly = el.penOnly.checked; savePrefs(); syncInk(); });
    el.stabSel.addEventListener('change', () => setStabilizer(Number(el.stabSel.value)));
    el.gestHold.addEventListener('change', () => { prefs.holdShape = el.gestHold.checked; toolChanged(); });
    el.gestScratch.addEventListener('change', () => { prefs.scratch = el.gestScratch.checked; toolChanged(); });
    el.btnRuler.addEventListener('click', () => setRuler(!prefs.ruler));
    // Al seguir escribiendo o dibujando, el joystick se retira solo
    el.stage.addEventListener('pointerdown', () => { if (joyOpen) setJoystick(false); }, true);
    el.btnIndex.addEventListener('click', () => openIndex());
    bindFocusMode();
    bindGuide();
    bindCtrlPan();
    document.addEventListener('paste', onPaste);

    // Modo oscuro (por cuaderno) y orientación (de la hoja activa)
    el.darkMode.addEventListener('change', () => setNbDark(el.darkMode.checked));
    $$('.seg-btn[data-orient]').forEach((b) => b.addEventListener('click', () => { if (active && active.note) setPageOrient(active.note.id, b.dataset.orient); }));

    // Recursos en uso
    el.btnPerf.addEventListener('click', openPerf);
    el.perfClear.addEventListener('click', () => { carousel.clearCache(); renderCarousel(); renderPerf(); });

    // Acciones sobre la hoja activa
    el.btnUndo.addEventListener('click', undo);
    el.btnRedo.addEventListener('click', redo);
    // Que los botones no le quiten el foco al texto (necesario para el deshacer nativo)
    [el.btnUndo, el.btnRedo].forEach((b) => b.addEventListener('mousedown', (e) => e.preventDefault()));
    el.btnClear.addEventListener('click', () => clearSheet());

    bindContextMenu();

    // Cuadernos
    el.btnNewNotebook.addEventListener('click', createNotebook);
    el.nbName.addEventListener('click', () => renameNotebook(cur.nb));
    el.btnSidebar.addEventListener('click', () => setSidebar(el.app.classList.contains('sidebar-hidden')));
    let searchTimer = 0;       // espera a que se deje de teclear un instante antes de buscar
    el.search.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { query = el.search.value; renderTree(); }, 120);
    });

    // Menú Exportar
    el.exportMenu.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-action]');
      if (!b) return;
      el.exportMenu.open = false;
      try { await exportAction(b.dataset.action); } catch (err) { toast(err.message || 'No se pudo exportar'); }
    });
    el.exportMenu.addEventListener('toggle', () => {
      if (!el.exportMenu.open) return;
      const two = visibleSheets().filter((s) => s.note).length === 2;
      $$('[data-two]', el.exportMenu).forEach((b) => { b.hidden = !two; });     // «ambas hojas» solo si hay dos a la vista
      warmImage('active');
    });
    $$('[data-action="copy"], [data-action="share"]', el.exportMenu).forEach((b) => b.addEventListener('pointerenter', () => warmImage('active')));
    $$('[data-action="copy-both"], [data-action="share-both"]', el.exportMenu).forEach((b) => b.addEventListener('pointerenter', () => warmImage('both')));
    el.fileImport.addEventListener('change', () => {
      const f = el.fileImport.files[0];
      el.fileImport.value = '';
      if (f) importFile(f);
    });

    // Un toque fuera cierra los menús flotantes (en fase de captura: no interfiere con lo que se toque)
    document.addEventListener('pointerdown', (e) => {
      if (el.exportMenu.open && !el.exportMenu.contains(e.target)) el.exportMenu.open = false;
      if (!el.ctx.hidden && !el.ctx.contains(e.target)) closeCtx();
      if (!el.colorPop.hidden && !el.colorPop.contains(e.target)) closeColorPop();
    }, true);

    // La ventana cambia de tamaño (o se abre/cierra la barra lateral): se reajusta la escala
    new ResizeObserver(() => {
      if (!cur.nb || !sheets[0].note) return;
      if ((wantBook() ? 'book' : 'single') !== viewMode) navigate(cur.nb, active && active.note ? active.index : cur.first);
      else layout();
    }).observe(el.stage);

    // Al estrechar la ventana la lista de cuadernos pasa a ser un panel flotante: se cierra sola
    window.matchMedia('(max-width: 900px)').addEventListener('change', () => {
      setSidebar(!isNarrow() && prefs.sidebar !== false, false);
    });

    document.addEventListener('keydown', onKeyDown);

    // Guardar al salir o al ocultar la pestaña
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveAll(); });
    window.addEventListener('pagehide', saveAll);
  }

  function isEditing(node) {
    if (!node) return false;
    if (node.tagName === 'TEXTAREA' || node.tagName === 'SELECT' || node.isContentEditable) return true;
    return node.tagName === 'INPUT' && !['range', 'checkbox', 'color', 'file', 'button'].includes(node.type);
  }

  function onKeyDown(e) {
    if (document.querySelector('dialog[open]')) return;
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    const ae = document.activeElement;

    if (e.key === 'Escape') {
      if (!el.ctx.hidden || !el.colorPop.hidden) { closeCtx(); closeColorPop(); return; }
      if (ae && ae.tagName === 'TEXTAREA' && active && active.root.contains(ae)) { ae.blur(); return; }
      if (joyOpen) { setJoystick(false); return; }
      if (mode === 'laser') { setMode(prevMode); return; }
      if (active && active.ink.selection()) { active.ink.clearSelection(); return; }
      if (focusMode) setFocus(false);
      return;
    }

    if (mod && key === 's') { e.preventDefault(); saveAll(); toast('Guardado'); return; }

    // Lazo: copiar, cortar, pegar, duplicar y borrar lo seleccionado
    if (mode === 'lasso' && active && !isEditing(ae)) {
      const has = !!active.ink.selection();
      if (mod && key === 'c' && has) { e.preventDefault(); copySelection(false); return; }
      if (mod && key === 'x' && has) { e.preventDefault(); copySelection(true); return; }
      if (mod && key === 'v' && strokeClip) { e.preventDefault(); pasteSelection(); return; }
      if (mod && key === 'd' && has) { e.preventDefault(); active.ink.duplicateSelection(); return; }
      if (!mod && has && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); active.ink.deleteSelection(); return; }
    }

    // Zoom con el teclado (Ctrl/Cmd + , − y 0)
    if (mod && !e.altKey) {
      if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomBy(1); return; }
      if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomBy(-1); return; }
      if (e.key === '0') { e.preventDefault(); setZoom('fit'); return; }
    }

    if (mod && (key === 'z' || key === 'y') && !isEditing(ae)) {
      e.preventDefault();
      if (active) ((key === 'y' || e.shiftKey) ? active.ink.redo() : active.ink.undo());
      return;
    }

    if (e.altKey && !mod) {
      const target = { KeyT: 'text', KeyP: 'pen', KeyE: 'eraser', KeyL: 'lasso' }[e.code];
      if (target) { e.preventDefault(); setMode(target, { focus: true }); return; }
      if (e.code === 'KeyM') {                       // Alt+M: abre el menú de herramientas en el centro del área de trabajo
        e.preventDefault();
        const r = el.stage.getBoundingClientRect();
        openCtx(r.left + r.width / 2 - 165, r.top + r.height / 3);
        return;
      }
      if (!isEditing(ae)) {                           // estos no actúan mientras se escribe texto (Alt+letra da símbolos)
        if (e.code === 'KeyR') { e.preventDefault(); toggleLaser(); return; }
        if (e.code === 'KeyF') { e.preventDefault(); setFocus(!focusMode); return; }
        if (e.code === 'KeyI') { e.preventDefault(); openIndex(); return; }
        if (e.code === 'KeyC') { e.preventDefault(); copyImage('active'); return; }
        if (e.code === 'KeyG') { e.preventDefault(); openGuide(); return; }
        if (e.code === 'KeyS') {
          e.preventDefault();
          setStabilizer(prefs.stabilizer ? 0 : prefs.stabLast);
          toast('Estabilizador ' + (prefs.stabilizer ? 'activado (' + STAB_NAMES[prefs.stabilizer] + ')' : 'apagado'));
          return;
        }
      }
      if (e.key === 'ArrowLeft' && !isEditing(ae)) { e.preventDefault(); goPrev(); return; }
      if (e.key === 'ArrowRight' && !isEditing(ae)) { e.preventDefault(); goNext(); return; }
      return;
    }

    if (!mod && !isEditing(ae) && (e.key === 'PageUp' || e.key === 'PageDown')) {
      e.preventDefault();
      e.key === 'PageUp' ? goPrev() : goNext();
      return;
    }

    // Escribir una letra estando en lápiz/borrador pasa a modo teclado
    if (prefs.autoSwitch && mode !== 'text' && !mod && !e.altKey && !isEditing(ae) &&
        e.key.length === 1 && !(e.key === ' ' && ae && ae.tagName === 'BUTTON')) {
      setMode('text', { focus: true });
    }
  }

  /* ───────── Arranque ───────── */

  function buildSheets() {
    const hooks = {
      inkOptions,
      onDirty: markDirty,
      onHistory: (s) => { if (s === active) updateHistoryButtons(); },
      onGrow: (s, h) => growSpread(h),
      onExtent: (s, y) => { if (y > spreadH - 120) growSpread(y + 500); },
      onActivate: (s) => { if (s.note && s !== active) setActive(s); },
      onAddPage: () => addPage(cur.nb),
      onDelete: (s) => { if (s.note) deletePage(s.note.id); },
      onClear: (s) => clearSheet(s),
      onMove: (s, delta) => { if (s.note) movePage(s.note.id, delta); },
      onRotate: (s) => { if (s.note) setPageOrient(s.note.id, orientOf(s.note) === 'landscape' ? 'portrait' : 'landscape'); },
      scrollBy: (dy) => { el.stage.scrollTop += dy; },
      shouldAutoPen: () => mode === 'text' && prefs.autoSwitch,
      setMode: (m) => setMode(m),
      onNotice: (msg) => toast(msg),
      palette: () => COLORS,
    };
    const tpl = $('#pageTpl');
    sheets = [new C.Sheet(tpl, hooks), new C.Sheet(tpl, hooks)];
    sheets[0].root.classList.add('left');
    sheets[1].root.classList.add('right');
    el.spread.append(sheets[0].root, sheets[1].root);
  }

  async function start() {
    refreshToolUI();
    syncInk();
    buildSheets();

    carousel = C.carousel.create({
      track: $('#carTrack'), prev: $('#btnPrev'), next: $('#btnNext'),
      loadNote: (id) => C.storage.get(id),
      getEnv: () => envOf(),
      onSelect: (i) => navigate(cur.nb, i),
      onAdd: () => addPage(cur.nb),
      onPrev: goPrev,
      onNext: goNext,
    });

    outline = C.outline.create({
      dialog: $('#indexDialog'), grid: $('#idxGrid'), filter: $('#idxFilter'), title: $('#idxTitle'), count: $('#idxCount'),
      dot: $('#idxDot'), close: $('#idxClose'),
      loadNote: (id) => C.storage.get(id),
      labelOf: pageLabel,
      norm,
    });
    laser = C.laser.create({ host: el.stage, canvas: el.laserCanvas });
    joystick = C.joystick.create({
      root: $('#joystick'), pad: $('#joyPad'), knob: $('#joyKnob'), grip: $('#joyGrip'), close: $('#joyClose'),
      scroller: el.stage,
      getSpeed: () => prefs.joySpeed,
      onClose: () => setJoystick(false),
    });
    ruler = C.ruler.create({
      h: $('#rulerH'), v: $('#rulerV'), corner: $('#rulerCorner'), read: el.rulerRead, stage: el.stage,
      target: () => (active && active.note ? { frame: active.el.frame, scale: active.scale, width: active.pageW, height: active.height } : null),
    });
    if (prefs.ruler) setRuler(true);

    setSidebar(!isNarrow() && prefs.sidebar !== false, false);
    bindEvents();
    refreshToolUI();           // ya con los colores de la barra y del menú dibujados
    setMode('text');

    try {
      const where = await C.storage.init(() => toast('Cierra las otras pestañas del cuaderno para terminar de actualizar tus datos.'));
      if (where === 'localStorage') toast('Se guardará en localStorage (espacio limitado).');
      notebooks = await C.storage.listNotebooks();
      const meta = await C.storage.listMeta();       // solo resúmenes: arrancar no depende del peso de las hojas
      await migrate(meta);
      pages = meta;
      const nb = getNb(prefs.lastNb) || notebooks[0];
      await navigate(nb.id, prefs.pos[nb.id] || 0);
    } catch (err) {
      console.error(err);
      toast('No se pudo abrir el almacenamiento: no se podrá guardar nada.');
    }
  }

  start();
})(window.Cuaderno = window.Cuaderno || {});
