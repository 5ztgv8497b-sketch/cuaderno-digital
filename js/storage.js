/* Almacenamiento en IndexedDB (con localStorage como respaldo).
 *
 * Tres tablas:
 *  - `notebooks`: los cuadernos.
 *  - `notes`: las hojas completas (texto + trazos). Los trazos se guardan compactos
 *    (un Float32Array por trazo) y se reconstruyen al leerlos: guardar cuesta ~3 veces menos.
 *  - `meta`: un resumen ligero de cada hoja (título, texto, orden, nº de puntos…).
 *    Es lo único que se lee al abrir la app, de modo que arrancar no depende de lo
 *    pesadas que sean las hojas. Se mantiene sola en cada guardado.
 * Todo devuelve promesas. */
(function (C) {
  'use strict';

  const DB_NAME = 'cuaderno-digital';
  const DB_VERSION = 3;                  // v1: notas · v2: + cuadernos · v3: + resúmenes y trazos compactos
  const NOTES = 'notes';
  const NOTEBOOKS = 'notebooks';
  const META = 'meta';
  const LS_KEYS = { [NOTES]: 'cuaderno:notes', [NOTEBOOKS]: 'cuaderno:notebooks' };

  let db = null;
  let useLocalStorage = false;

  const r1 = (v) => Math.round(v * 10) / 10;
  const r2 = (v) => Math.round(v * 100) / 100;

  /* ───────── Trazos compactos ───────── */

  const pointsOf = (s) => (s.pts ? s.pts.length / 3 : s.points.length);

  function encodeNote(n) {
    const strokes = (n.strokes || []).map((s) => {
      if (s.pts) return s;
      const f = new Float32Array(s.points.length * 3);
      for (let i = 0; i < s.points.length; i++) {
        const p = s.points[i];
        f[i * 3] = p[0]; f[i * 3 + 1] = p[1]; f[i * 3 + 2] = p[2];
      }
      return { id: s.id, tool: s.tool, color: s.color, size: s.size, pts: f };
    });
    return { ...n, strokes };
  }

  /* Acepta hojas guardadas por versiones anteriores (con `points`) y las compactas (`pts`). */
  function decodeNote(n) {
    if (!n || !n.strokes) return n;
    const strokes = n.strokes.map((s) => {
      if (!s.pts) return s;
      const pts = new Array(s.pts.length / 3);
      for (let i = 0; i < pts.length; i++) pts[i] = [r1(s.pts[i * 3]), r1(s.pts[i * 3 + 1]), r2(s.pts[i * 3 + 2])];
      return { id: s.id, tool: s.tool, color: s.color, size: s.size, points: pts };
    });
    return { ...n, strokes };
  }

  /* Resumen ligero de una hoja (sirve con trazos compactos o normales). */
  function summarize(n) {
    let points = 0;
    for (const s of n.strokes || []) points += pointsOf(s);
    return {
      id: n.id, notebookId: n.notebookId, order: n.order, createdAt: n.createdAt, updatedAt: n.updatedAt,
      // el texto del resumen incluye el de los cuadros sueltos: así la búsqueda y el índice los encuentran
      title: n.title || '', text: (n.text || '') + (n.boxes && n.boxes.length ? '\n' + n.boxes.map((b) => b.text).join('\n') : ''), hasInk: points > 0, points, height: n.height || 0,
      orient: n.orient === 'landscape' ? 'landscape' : 'portrait',
    };
  }

  /* ───────── IndexedDB ───────── */

  function openDB(onBlocked) {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('IndexedDB no disponible'));
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;     // al subir de versión se conservan las notas ya guardadas
        for (const name of [NOTES, NOTEBOOKS, META]) {
          if (!d.objectStoreNames.contains(name)) d.createObjectStore(name, { keyPath: 'id' });
        }
      };
      // Otra pestaña con la versión anterior abierta impide actualizar: se avisa y se espera
      req.onblocked = () => { if (onBlocked) onBlocked(); };
      req.onsuccess = () => {
        // Si en el futuro otra pestaña sube la versión, esta se aparta en vez de bloquearla
        req.result.onversionchange = () => req.result.close();
        resolve(req.result);
      };
      req.onerror = () => reject(req.error);
    });
  }

  /* Ejecuta fn(...stores) en una transacción y resuelve con su resultado al terminar. */
  function tx(names, mode, fn) {
    return new Promise((resolve, reject) => {
      const list = Array.isArray(names) ? names : [names];
      const t = db.transaction(list, mode);
      const req = fn(...list.map((n) => t.objectStore(n)));
      t.oncomplete = () => resolve(req && req.result);
      t.onerror = t.onabort = () => reject(t.error);
    });
  }

  function lsRead(store) {
    try { return JSON.parse(localStorage.getItem(LS_KEYS[store]) || '{}'); } catch (_) { return {}; }
  }
  function lsWrite(store, map) { localStorage.setItem(LS_KEYS[store], JSON.stringify(map)); }

  /* La tabla `meta` se crea vacía al actualizar desde una versión anterior: se rellena una vez. */
  async function rebuildMetaIfNeeded() {
    const [nNotes, nMeta] = await Promise.all([
      tx(NOTES, 'readonly', (st) => st.count()),
      tx(META, 'readonly', (st) => st.count()),
    ]);
    if (nNotes === nMeta) return;
    const all = await tx(NOTES, 'readonly', (st) => st.getAll());
    await tx(META, 'readwrite', (st) => { all.forEach((n) => st.put(summarize(n))); });
  }

  /* Abre la base. Devuelve 'indexedDB' o 'localStorage' según lo que se use. */
  async function init(onBlocked) {
    try {
      db = await openDB(onBlocked);
      await rebuildMetaIfNeeded();
    } catch (err) {
      console.warn('IndexedDB no disponible, se usa localStorage:', err);
      useLocalStorage = true;
    }
    // Pide al navegador que no borre las notas si falta espacio.
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (_) { /* opcional */ }
    return useLocalStorage ? 'localStorage' : 'indexedDB';
  }

  /* ───────── Hojas ───────── */

  const notes = {
    /* Resúmenes de todas las hojas: ligero, es lo que se lee al arrancar. */
    async listMeta() {
      if (useLocalStorage) return Object.values(lsRead(NOTES)).map(summarize);
      return tx(META, 'readonly', (st) => st.getAll());
    },
    /* Hojas completas (pesado: no se usa al arrancar). */
    async list() {
      if (useLocalStorage) return Object.values(lsRead(NOTES));
      return (await tx(NOTES, 'readonly', (st) => st.getAll())).map(decodeNote);
    },
    async get(id) {
      if (useLocalStorage) return lsRead(NOTES)[id] || null;
      return decodeNote((await tx(NOTES, 'readonly', (st) => st.get(id))) || null);
    },
    async put(note) {
      if (useLocalStorage) { const m = lsRead(NOTES); m[note.id] = note; lsWrite(NOTES, m); return; }
      const enc = encodeNote(note);
      const meta = summarize(note);
      await tx([NOTES, META], 'readwrite', (st, mt) => { st.put(enc); mt.put(meta); });
    },
    async remove(id) {
      if (useLocalStorage) { const m = lsRead(NOTES); delete m[id]; lsWrite(NOTES, m); return; }
      await tx([NOTES, META], 'readwrite', (st, mt) => { st.delete(id); mt.delete(id); });
    },
    async removeMany(ids) {
      if (!ids.length) return;
      if (useLocalStorage) { const m = lsRead(NOTES); ids.forEach((id) => delete m[id]); lsWrite(NOTES, m); return; }
      await tx([NOTES, META], 'readwrite', (st, mt) => { ids.forEach((id) => { st.delete(id); mt.delete(id); }); });
    },
  };

  /* ───────── Cuadernos ───────── */

  const books = {
    async list() {
      if (useLocalStorage) return Object.values(lsRead(NOTEBOOKS));
      return tx(NOTEBOOKS, 'readonly', (st) => st.getAll());
    },
    async put(item) {
      if (useLocalStorage) { const m = lsRead(NOTEBOOKS); m[item.id] = item; lsWrite(NOTEBOOKS, m); return; }
      await tx(NOTEBOOKS, 'readwrite', (st) => st.put(item));
    },
    async remove(id) {
      if (useLocalStorage) { const m = lsRead(NOTEBOOKS); delete m[id]; lsWrite(NOTEBOOKS, m); return; }
      await tx(NOTEBOOKS, 'readwrite', (st) => st.delete(id));
    },
  };

  /* Uso de disco del sitio, si el navegador lo informa. */
  async function usage() {
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const e = await navigator.storage.estimate();
        return { used: e.usage || 0, quota: e.quota || 0 };
      }
    } catch (_) { /* opcional */ }
    return null;
  }

  C.storage = {
    init, usage, summarize,
    // hojas
    listMeta: notes.listMeta, list: notes.list, get: notes.get, put: notes.put, remove: notes.remove, removeMany: notes.removeMany,
    // cuadernos
    listNotebooks: books.list, putNotebook: books.put, removeNotebook: books.remove,
  };
})(window.Cuaderno = window.Cuaderno || {});
