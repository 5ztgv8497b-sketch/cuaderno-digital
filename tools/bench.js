/* Banco de mediciones de rendimiento de MazzNote.
 *
 * Cómo usarlo: abre la app, abre la consola del navegador (F12 → Console), pega TODO este
 * archivo y ejecuta:   await __bench.todo()
 * Crea hojas sintéticas de escritura a mano (ligera → extrema) en lienzos de prueba, mide
 * cuánto tarda cada operación y NO toca tus cuadernos ni tus hojas. */
(() => {
  const rng = (seed) => { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; };
  const median = (a) => { const b = [...a].sort((x, y) => x - y); return Math.round(b[Math.floor(b.length / 2)] * 10) / 10; };

  const bench = {
    /* n trazos de `pts` puntos: paseos suaves con presión variable; 1 de cada 9 es marcador. */
    makeStrokes(n, pts, seed = 1) {
      const r = rng(seed), out = [];
      for (let i = 0; i < n; i++) {
        let x = 100 + r() * 680, y = 60 + r() * 1040, a = r() * 6.28; const points = [];
        for (let k = 0; k < pts; k++) {
          a += (r() - 0.5) * 0.5; x += Math.cos(a) * 1.6; y += Math.sin(a) * 1.6;
          x = Math.max(5, Math.min(815, x)); y = Math.max(5, Math.min(1155, y));
          points.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round((0.2 + 0.8 * Math.abs(Math.sin(k / 20))) * 100) / 100]);
        }
        out.push({ id: 's' + i, tool: i % 9 === 0 ? 'marker' : 'pen', color: ['#1f2937', '#2563eb', '#dc2626'][i % 3], size: 3, points });
      }
      return out;
    },

    /* Lo que ocurre al soltar el lápiz: se simplifica el trazo (si la app lo ofrece). */
    simplified(strokes) {
      const simp = Cuaderno.ink.simplify;
      return simp ? strokes.map((s) => ({ ...s, points: simp(s.points, 0.2) })) : strokes;
    },

    async run(name, n, pts, { simplify = true } = {}) {
      let strokes = this.makeStrokes(n, pts);
      const crudos = n * pts;
      if (simplify) strokes = this.simplified(strokes);
      const puntos = strokes.reduce((a, s) => a + s.points.length, 0);
      const res = { escenario: name, trazos: n, puntosCrudos: crudos, puntos, reduccion: Math.round((1 - puntos / crudos) * 100) + '%' };

      const note = { id: 'bench-' + name, notebookId: 'bench', order: 1, title: '', createdAt: Date.now(), updatedAt: Date.now(), paper: { style: 'ruled', spacing: 32, color: 'white' }, text: '', strokes, height: 1160 };
      const put = [], get = [];
      for (let i = 0; i < 3; i++) {
        let a = performance.now(); await Cuaderno.storage.put(note); put.push(performance.now() - a);
        a = performance.now(); await Cuaderno.storage.get(note.id); get.push(performance.now() - a);
      }
      res.guardarMs = median(put); res.leerMs = median(get);
      await Cuaderno.storage.remove(note.id);

      const canvas = document.createElement('canvas'), cursor = document.createElement('div');
      const opts = { tool: 'pen', color: '#1f2937', size: 3, eraserMode: 'area', eraserSize: 30, penOnly: false };
      const ink = Cuaderno.ink.create({ canvas, cursor, options: opts });
      ink.resize(820, 1160, 1); ink.load(strokes);
      let k = 0; const redraw = (r) => { const a = performance.now(); ink.resize(820, 1160 + (++k), r); return performance.now() - a; };
      res.redibujarMs = median([redraw(1), redraw(1), redraw(1)]);

      const th = []; for (let i = 0; i < 3; i++) { const a = performance.now(); Cuaderno.exporter.renderCanvas(note, 820, 0.2); th.push(performance.now() - a); }
      res.miniaturaMs = median(th);
      const a2 = performance.now(); const big = Cuaderno.exporter.renderCanvas(note, 820, 2); res.exportar2xMs = Math.round(performance.now() - a2); big.width = big.height = 0;

      // Arrastre con la goma de área: coste por cuadro (el repintado ocurre en el siguiente cuadro)
      ink.setMode('eraser');
      const ev = (type, x, y, buttons) => new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 3, pointerType: 'mouse', isPrimary: true, clientX: x, clientY: y, button: 0, buttons });
      const frames = [];
      canvas.dispatchEvent(ev('pointerdown', 100, 100, 1));
      for (let i = 1; i <= 12; i++) {
        const a = performance.now();
        canvas.dispatchEvent(ev('pointermove', 100 + i * 50, 100 + i * 66, 1));
        ink.flush();                             // aquí se repinta la zona tocada
        frames.push(performance.now() - a);
      }
      canvas.dispatchEvent(ev('pointerup', 700, 900, 0));
      res.borrarCuadroMs = median(frames); res.borrarCuadroMaxMs = Math.round(Math.max(...frames) * 10) / 10;
      canvas.width = canvas.height = 0;
      return res;
    },

    /* ¿Repintar solo la zona borrada da el mismo resultado que repintar toda la hoja?
     * opts: { markers: true|false, mode: 'area'|'stroke', n, pts } */
    erasePixelCheck(opts = {}) {
      const { markers = true, mode = 'area', n = 300, pts = 100 } = opts;
      let strokes = this.makeStrokes(n, pts);
      if (!markers) strokes = strokes.map((s) => ({ ...s, tool: 'pen' }));
      const canvas = document.createElement('canvas'), cursor = document.createElement('div');
      const ink = Cuaderno.ink.create({ canvas, cursor, options: { tool: 'pen', color: '#1f2937', size: 3, eraserMode: mode, eraserSize: 40, penOnly: false } });
      ink.resize(820, 1160, 1); ink.load(strokes); ink.resize(820, 1161, 1); ink.resize(820, 1160, 1);
      ink.setMode('eraser');
      const ev = (type, x, y, buttons) => new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 3, pointerType: 'mouse', isPrimary: true, clientX: x, clientY: y, button: 0, buttons });
      canvas.dispatchEvent(ev('pointerdown', 150, 150, 1));
      for (let i = 1; i <= 30; i++) { canvas.dispatchEvent(ev('pointermove', 150 + i * 18, 150 + i * 25, 1)); if (i % 5 === 0) ink.flush(); }
      canvas.dispatchEvent(ev('pointerup', 700, 900, 0));
      ink.flush();
      const g = canvas.getContext('2d');
      const parcial = g.getImageData(0, 0, canvas.width, canvas.height).data.slice();
      ink.resize(820, 1161, 1); ink.resize(820, 1160, 1);        // repintado completo
      const completo = g.getImageData(0, 0, canvas.width, canvas.height).data;
      let diff = 0, maxd = 0;
      for (let i = 0; i < parcial.length; i += 4) { const d = Math.abs(parcial[i + 3] - completo[i + 3]) + Math.abs(parcial[i] - completo[i]); if (d > 8) { diff++; if (d > maxd) maxd = d; } }
      canvas.width = canvas.height = 0;
      return { opciones: { markers, mode }, trazosTrasBorrar: ink.getStrokes().length, pixelesDistintos: diff, mayorDiferencia: maxd, identico: diff === 0 };
    },

    async todo() {
      const out = [];
      out.push(await this.run('S1 ligera', 50, 100));
      out.push(await this.run('S2 escritura densa', 600, 120));
      out.push(await this.run('S3 dibujo pesado', 3000, 150));
      out.push(await this.run('S4 extremo', 8000, 250));
      out.push(this.erasePixelCheck());
      console.table(out);
      return out;
    },
  };
  window.__bench = bench;
  return 'listo: ejecuta  await __bench.todo()';
})();
