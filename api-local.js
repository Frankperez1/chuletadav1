/* Chuletada - datos locales (reemplaza a app.py).
 * Intercepta las llamadas /api/... de app.js y guarda todo en localStorage.
 * Marca lo que cambió ("dirty") para que sync.js lo suba a Firebase cuando haya internet.
 * Tarjeta cerrada (l=1): solo el administrador puede cambiarla o reabrirla. */
(function () {
  const KEY = "chuletada_db_v1";
  const PRECIO_INICIAL = 15;
  const VENDEDORES = [["Paul",1,20],["Cintia",21,40],["William",41,60],["Kevin",61,80],["Vivian",81,100],
    ["Wilder",101,120],["Mayela",121,140],["Marlén",141,160],["Noemí",161,180],["Arcángel",181,200],
    ["Sally",201,220],["Frank",221,240],["Jefa",241,250],["Isabel",251,260],["Pepe",261,280],
    ["Emilio",281,300],["Lucas",301,320],["Rocío",321,340],["Jean C.",341,360],["Adicionales",361,400]];

  const Chu = (window.Chu = window.Chu || {});
  const esAdmin = () => !!(Chu.esAdmin && Chu.esAdmin());
  const esCajero = () => !!(Chu.esCajero && Chu.esCajero());

  function nuevo() {
    return { price: PRECIO_INICIAL, cards: {}, cfg_u: 0, reset_at: 0, cfgDirty: false, resetPend: false, dirty: {},
             sellers: VENDEDORES.map((v, i) => ({ id: i + 1, name: v[0], from_n: v[1], to_n: v[2] })) };
  }
  function cargar() {
    try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.cards && d.sellers) return Object.assign(nuevo(), d); } catch (e) {}
    return nuevo();
  }
  function guardar(db) { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }
  Chu.cargar = cargar; Chu.guardar = guardar;
  const avisar = () => { try { Chu.onWrite && Chu.onWrite(); } catch (e) {} };

  const norm = s => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const vendedorDe = (n, vs) => (vs.find(v => v.from_n <= n && n <= v.to_n) || {}).name || "";
  function numeros(vs, solo) {
    const out = new Set();
    vs.forEach(v => { if (!v.from_n || !v.to_n) return; if (!solo || v.name === solo) for (let n = v.from_n; n <= v.to_n; n++) out.add(n); });
    return [...out].sort((a, b) => a - b);
  }
  function ficha(n, db) {
    const r = db.cards[n] || { n, name: "", paid: 0, amount: 0, u: 0, l: 0 };
    const estado = r.paid ? "pagado" : (String(r.name).trim() ? "no_pagado" : "sin_entregar");
    return { n, name: r.name, paid: !!r.paid, amount: r.amount, u: r.u, locked: !!r.l, seller: vendedorDe(n, db.sellers), estado };
  }
  function buscar(db, q, filtro, vendedor, limite) {
    q = norm(q || "").trim();
    const out = [];
    for (const n of numeros(db.sellers, vendedor)) {
      const f = ficha(n, db);
      if (q) {
        const ok = /^\d+$/.test(q) ? String(n).startsWith(q) : norm(f.name + " " + f.seller).includes(q);
        if (!ok) continue;
      }
      const e = f.estado;
      if (filtro === "pagadas" && e !== "pagado") continue;
      if (filtro === "no_pagadas" && e === "pagado") continue;
      if (filtro === "entregadas_sin_pagar" && e !== "no_pagado") continue;
      if (filtro === "sin_entregar" && e !== "sin_entregar") continue;
      out.push(f);
    }
    return { total: out.length, cards: out.slice(0, limite) };
  }
  function estadisticas(db, vendedor) {
    const fs = numeros(db.sellers, vendedor).map(n => ficha(n, db));
    const pag = fs.filter(f => f.estado === "pagado"), dev = fs.filter(f => f.estado === "no_pagado");
    return { tarjetas: fs.length, pagadas: pag.length, entregadas_sin_pagar: dev.length,
             sin_entregar: fs.length - pag.length - dev.length,
             cobrado: pag.reduce((s, f) => s + f.amount, 0), por_cobrar: dev.length * db.price, precio: db.price };
  }
  function resumen(db) {
    return db.sellers.map(v => {
      const fs = []; if (v.from_n && v.to_n) for (let n = v.from_n; n <= v.to_n; n++) fs.push(ficha(n, db));
      return { ...v, pagadas: fs.filter(f => f.estado === "pagado").length,
               sin_pagar: fs.filter(f => f.estado === "no_pagado").length, reporte: fs.some(f => f.u > 0) };
    });
  }
  function guardarTarjeta(db, n, name, paid, lock) {
    if (!vendedorDe(n, db.sellers)) throw new Error(`La tarjeta ${n} no pertenece a ningún vendedor.`);
    const admin = esAdmin();
    const prev = db.cards[n];
    // Tarjeta cerrada: el administrador cambia todo; el cajero solo puede marcar/anular el pago.
    if (prev && prev.l && !admin) {
      const soloPago = esCajero() && (name === undefined || name === null) && (lock === undefined || lock === null);
      if (!soloPago) throw new Error("Esta tarjeta ya fue guardada y cerrada. Solo el administrador puede cambiarla.");
    }
    const cur = prev ? { ...prev } : { n, name: "", paid: 0, amount: 0, u: 0, l: 0 };
    if (name !== undefined && name !== null) cur.name = String(name).slice(0, 120);
    if (paid !== undefined && paid !== null) { cur.paid = paid ? 1 : 0; cur.amount = paid ? db.price : 0; }
    if (lock !== undefined && lock !== null) {
      if (!admin) throw new Error("Solo el administrador puede cerrar o reabrir una tarjeta.");
      cur.l = lock ? 1 : 0;
    }
    cur.u = Math.max(Date.now(), (prev ? prev.u : 0) + 1);
    db.cards[n] = cur; db.dirty[n] = 1;
    return ficha(n, db);
  }
  // El vendedor guarda y cierra todas las tarjetas de su rango (también las vacías).
  function cerrarVendedor(db, seller) {
    if (!db.sellers.some(v => v.name === seller)) throw new Error("Vendedor no encontrado.");
    let k = 0;
    for (const n of numeros(db.sellers, seller)) {
      const prev = db.cards[n];
      if (prev && prev.l) continue;
      const cur = prev ? { ...prev } : { n, name: "", paid: 0, amount: 0, u: 0 };
      cur.l = 1; cur.u = Math.max(Date.now(), (prev ? prev.u : 0) + 1);
      db.cards[n] = cur; db.dirty[n] = 1; k++;
    }
    return { ok: true, cerradas: k };
  }
  function exportar(db, vendedor) {
    const ns = new Set(numeros(db.sellers, vendedor));
    const cards = Object.values(db.cards).filter(r => ns.has(+r.n) && r.u > 0).sort((a, b) => a.n - b.n)
      .map(r => ({ n: r.n, name: r.name, paid: r.paid, amount: r.amount, u: r.u, l: r.l ? 1 : 0 }));
    return { v: 1, by: vendedor || "CAJA", cards };
  }
  function importar(db, texto) {
    // Lee uno o varios JSON pegados juntos (con o sin "CHULETADA|"); gana la versión más reciente (u).
    texto = texto.replace(/CHULETADA\|/g, "\n");
    const detalle = []; let malos = 0, i = 0;
    while (i < texto.length) {
      const ini = texto.indexOf("{", i);
      if (ini < 0) { if (texto.slice(i).trim()) malos++; break; }
      let prof = 0, fin = -1, enStr = false, esc = false;
      for (let j = ini; j < texto.length; j++) {
        const ch = texto[j];
        if (enStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') enStr = false; continue; }
        if (ch === '"') enStr = true; else if (ch === "{") prof++; else if (ch === "}" && --prof === 0) { fin = j; break; }
      }
      if (fin < 0) { malos++; break; }
      let d = null;
      try { d = JSON.parse(texto.slice(ini, fin + 1)); if (!Array.isArray(d.cards)) throw 0; } catch (e) { malos++; i = ini + 1; continue; }
      i = fin + 1;
      let k = 0;
      for (const r of d.cards) {
        const n = parseInt(r.n, 10), u = parseInt(r.u || 0, 10);
        if (isNaN(n) || isNaN(u)) continue;
        if (u > ((db.cards[n] || {}).u ?? -1) && u > db.reset_at) {
          db.cards[n] = { n, name: String(r.name || "").slice(0, 120), paid: r.paid ? 1 : 0, amount: parseFloat(r.amount || 0), u, l: r.l ? 1 : 0 };
          db.dirty[n] = 1; k++;
        }
      }
      detalle.push({ de: d.by || "?", actualizadas: k });
    }
    return { respaldos: detalle.length, no_validos: malos, detalle };
  }
  function csvExcel(db) {
    const esc = v => { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const filas = [["N°", "Vendedor", "Entregada a", "Estado", "Cobrado"]];
    numeros(db.sellers).forEach(n => { const f = ficha(n, db);
      filas.push([n, f.seller, f.name, f.estado.replace("_", " ").toUpperCase(), f.amount]); });
    return "\ufeff" + filas.map(r => r.map(esc).join(",")).join("\r\n") + "\r\n";
  }

  function responder(body, status, tipo) {
    if (typeof body !== "string") body = JSON.stringify(body);
    return new Response(body, { status: status || 200, headers: { "Content-Type": tipo || "application/json; charset=utf-8" } });
  }
  function descargar(nombre, texto, tipo) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([texto], { type: tipo }));
    a.download = nombre; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function manejar(metodo, ruta, q, d) {
    const db = cargar();
    try {
      if (metodo === "GET") {
        if (ruta === "/api/sellers") return responder({ sellers: db.sellers, price: db.price });
        if (ruta === "/api/cards") return responder(buscar(db, q.q, q.filtro || "todas", q.seller || null, parseInt(q.limit || 50, 10)));
        if (ruta === "/api/stats") return responder(estadisticas(db, q.seller || null));
        if (ruta === "/api/resumen") return responder({ filas: resumen(db) });
        if (ruta === "/api/export") {
          const dd = exportar(db, q.seller || null);
          if (q.texto) return responder("CHULETADA|" + JSON.stringify(dd), 200, "text/plain; charset=utf-8");
          return responder(JSON.stringify(dd), 200, "application/json");
        }
        if (ruta === "/api/export.csv") return responder(csvExcel(db), 200, "text/csv; charset=utf-8");
      } else {
        const soloAdmin = ["/api/price", "/api/sellers", "/api/import", "/api/reset"];
        if (soloAdmin.includes(ruta) && !esAdmin()) throw new Error("Solo el administrador puede hacer esto.");
        let r;
        if (ruta === "/api/card") r = guardarTarjeta(db, parseInt(d.n, 10), d.name, d.paid, d.lock);
        else if (ruta === "/api/lock") r = cerrarVendedor(db, String(d.seller || ""));
        else if (ruta === "/api/price") { db.price = Math.max(0, parseFloat(d.price) || 0); db.cfg_u = Date.now(); db.cfgDirty = true; r = { ok: true }; }
        else if (ruta === "/api/sellers") {
          db.sellers = d.sellers.map((s, i) => ({ id: i + 1, name: String(s.name).slice(0, 40), from_n: parseInt(s.from_n, 10) || 0, to_n: parseInt(s.to_n, 10) || 0 }));
          db.cfg_u = Date.now(); db.cfgDirty = true; r = { ok: true };
        }
        else if (ruta === "/api/import") r = importar(db, d.text || "");
        else if (ruta === "/api/reset") {
          db.cards = {}; db.dirty = {}; db.reset_at = Date.now(); db.cfg_u = db.reset_at; db.cfgDirty = true; db.resetPend = true; r = { ok: true };
        }
        if (r !== undefined) { guardar(db); avisar(); return responder(r); }
      }
      return responder({ error: "No encontrado" }, 404);
    } catch (e) {
      return responder({ error: e.message }, 400);
    }
  }

  const fetchReal = window.fetch.bind(window);
  window.fetch = function (url, opts) {
    const href = typeof url === "string" ? url : (url && url.url) || "";
    const i = href.indexOf("/api/");
    if (i < 0) return fetchReal(url, opts);
    const u = new URL(href.slice(i), "http://x");
    const q = Object.fromEntries(u.searchParams);
    const metodo = ((opts && opts.method) || "GET").toUpperCase();
    let d = {}; try { d = JSON.parse((opts && opts.body) || "{}"); } catch (e) {}
    return Promise.resolve(manejar(metodo, u.pathname, q, d));
  };

  // Enlaces de descarga (<a href="/api/export...">): se generan en el navegador
  if (typeof document !== "undefined") document.addEventListener("click", ev => {
    const a = ev.target.closest && ev.target.closest("a[href*='/api/export']");
    if (!a) return;
    ev.preventDefault();
    const href = a.getAttribute("href");
    const u = new URL(href.slice(href.indexOf("/api/")), "http://x");
    const q = Object.fromEntries(u.searchParams);
    const db = cargar();
    if (u.pathname === "/api/export.csv") descargar("chuletada.csv", csvExcel(db), "text/csv;charset=utf-8");
    else descargar(`chuletada-${q.seller || "caja"}.json`, JSON.stringify(exportar(db, q.seller || null)), "application/json");
  }, true);
})();
