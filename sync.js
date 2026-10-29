/* Chuletada - sincronización con Firebase Realtime Database (API REST, sin librerías).
 * Primero se guarda en el dispositivo (api-local.js); aquí se sube lo pendiente y se baja lo de los demás.
 * Sin internet no pasa nada: queda en cola y se envía solo al volver la conexión.
 * Por tarjeta gana la versión más reciente (campo u). Las tarjetas cerradas (l=1) solo las cambia el administrador:
 * Firebase rechaza (401/403) los cambios de otros y aquí se descartan para volver a bajar la versión oficial. */
(function () {
  const Chu = (window.Chu = window.Chu || {});
  const C = window.CHU_CONFIG || {};
  const BASE = String(C.FIREBASE_URL || "").trim().replace(/\/+$/, "");
  const RAIZ = C.RAIZ || "chuletada";
  const url = p => `${BASE}/${RAIZ}${p}.json`;
  const lista = x => (!x ? [] : Array.isArray(x) ? x.filter(Boolean) : Object.values(x));
  const rechazo = e => /HTTP 40[13]/.test(String(e && e.message));
  let ocupado = false, estado = BASE ? { tipo: "espera" } : { tipo: "local" };

  function pendientes() { const db = Chu.cargar(); return Object.keys(db.dirty).length + (db.cfgDirty ? 1 : 0); }
  function pintar() {
    const el = document.getElementById("sync"); if (!el) return;
    const p = pendientes();
    let t;
    if (estado.tipo === "local") t = "💾 Solo en este dispositivo (falta configurar Firebase)";
    else if (estado.tipo === "off") t = `📴 Sin conexión · ${p} sin enviar (se enviarán solos)`;
    else if (estado.tipo === "ok") t = p ? `🔄 Enviando ${p}…` : `☁️ Sincronizado ${estado.hora}`;
    else t = "🔄 Conectando…";
    el.textContent = t;
  }

  async function http(metodo, ruta, cuerpo) {
    const tk = Chu.tokenAdmin ? await Chu.tokenAdmin() : "";
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), 8000);
    try {
      const r = await fetch(url(ruta) + (tk ? "?auth=" + encodeURIComponent(tk) : ""), { method: metodo, signal: ac.signal,
        headers: cuerpo !== undefined ? { "Content-Type": "application/json" } : undefined,
        body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }

  async function sincronizar() {
    if (!BASE) { pintar(); return; }
    if (ocupado) return;
    ocupado = true;
    try {
      const remoto = (await http("GET", "")) || {};
      let rc = remoto.cards || {};
      const cfg = remoto.config || null;

      // 1) Bajar y mezclar (todo en un bloque síncrono para no pisar lo que el usuario escribe)
      let db = Chu.cargar();
      if (cfg && (+cfg.u || 0) > db.cfg_u) {
        db.price = Number(cfg.price) || 0;
        const vs = lista(cfg.sellers);
        if (vs.length) db.sellers = vs.map((s, i) => ({ id: i + 1, name: String(s.name), from_n: +s.from_n, to_n: +s.to_n }));
        db.cfg_u = +cfg.u; db.cfgDirty = false; db.resetPend = false;
        if ((+cfg.reset_at || 0) > db.reset_at) {
          db.reset_at = +cfg.reset_at;
          for (const n of Object.keys(db.cards)) if (db.cards[n].u <= db.reset_at) { delete db.cards[n]; delete db.dirty[n]; }
        }
      }
      for (const k of Object.keys(rc)) {
        const r = rc[k]; if (!r || typeof r !== "object") continue;
        const n = +r.n, u = +r.u || 0;
        if (!n || u <= db.reset_at) continue;
        const l = db.cards[n];
        if (!l || u > l.u) { db.cards[n] = { n, name: String(r.name || ""), paid: r.paid ? 1 : 0, amount: +r.amount || 0, u, l: r.l ? 1 : 0 }; delete db.dirty[n]; }
      }
      Chu.guardar(db);

      // 2) Subir configuración / reinicio pendiente (solo el administrador puede; a otros Firebase les dice 401)
      if (db.cfgDirty) {
        try {
          const enviado = db.cfg_u;
          if (db.resetPend) { await http("DELETE", "/cards"); rc = {}; }
          await http("PUT", "/config", { price: db.price, reset_at: db.reset_at, u: db.cfg_u,
            sellers: db.sellers.map(s => ({ name: s.name, from_n: s.from_n, to_n: s.to_n })) });
          db = Chu.cargar();
          if (db.cfg_u === enviado) { db.cfgDirty = false; db.resetPend = false; Chu.guardar(db); }
        } catch (e) { if (!rechazo(e)) throw e; }
      }

      // 3) Subir tarjetas pendientes (solo si son más nuevas que la nube)
      db = Chu.cargar();
      const subir = [];
      for (const n of Object.keys(db.dirty)) {
        const c = db.cards[n], r = rc["c" + n];
        if (!c) { delete db.dirty[n]; continue; }
        if (r && (+r.u || 0) >= c.u) { delete db.dirty[n]; continue; }
        subir.push({ n: c.n, name: c.name, paid: c.paid, amount: c.amount, u: c.u, l: c.l ? 1 : 0 });
      }
      Chu.guardar(db);
      for (const c of subir) {
        try {
          await http("PUT", "/cards/c" + c.n, c);
          const d2 = Chu.cargar();
          if (d2.cards[c.n] && d2.cards[c.n].u === c.u) { delete d2.dirty[c.n]; Chu.guardar(d2); }
        } catch (e) {
          if (rechazo(e)) { // tarjeta cerrada: se descarta el cambio local y se vuelve a bajar la versión oficial
            const d2 = Chu.cargar(); delete d2.dirty[c.n]; delete d2.cards[c.n]; Chu.guardar(d2);
          } else throw e;
        }
      }
      estado = { tipo: "ok", hora: new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }) };
    } catch (e) {
      estado = { tipo: "off" };
    } finally { ocupado = false; pintar(); }
  }

  let tm = null;
  Chu.onWrite = function () { pintar(); clearTimeout(tm); tm = setTimeout(sincronizar, 800); };
  Chu.sincronizar = sincronizar;

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", () => { pintar(); sincronizar(); });
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") sincronizar(); });
    window.addEventListener("online", sincronizar);
    setInterval(() => { if (document.visibilityState === "visible") sincronizar(); }, Math.max(3, +C.CADA_SEG || 10) * 1000);
  }
})();
