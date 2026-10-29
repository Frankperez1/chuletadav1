/* Chuletada - acceso del administrador y del cajero con Firebase Authentication.
 * Cada uno tiene su propio correo y contraseña en Firebase. Con la contraseña se obtiene un token que sync.js
 * envía a Firebase; las reglas de Firebase deciden qué puede escribir cada uno:
 *   administrador: todo (vendedores, precio, importar, borrar, cerrar/reabrir tarjetas, cambiar nombres)
 *   cajero: solo marcar pagado / anular (también en tarjetas cerradas), sin tocar nombres ni candados
 * Si API_KEY y los dos correos no están configurados, no hay protección. */
(function () {
  const C = window.CHU_CONFIG || {};
  const KEY = String(C.API_KEY || "");
  const MAIL = { a: String(C.ADMIN_EMAIL || ""), c: String(C.CAJERO_EMAIL || "") };
  const NOMBRE = { a: "administrador", c: "cajero" };
  const ls = { get: k => { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } },
               set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
  const Chu = (window.Chu = window.Chu || {});

  const okMail = m => m.indexOf("@") > 0 && !/ADMIN@gmail|CAJERO@gmail|TU_CORREO/.test(m);
  if (!/^AIza/.test(KEY) || !okMail(MAIL.a) || !okMail(MAIL.c) || MAIL.a.toLowerCase() === MAIL.c.toLowerCase()) {
    Chu.esAdmin = () => ls.get("chu_role") === "a";
    Chu.esCajero = () => ls.get("chu_role") === "c";
    Chu.tokenAdmin = async () => ""; return;
  }

  let sesion = null;
  async function post(url, body, form) {
    const r = await fetch(url, { method: "POST",
      headers: { "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json" },
      body: form ? body : JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) throw new Error((d.error && d.error.message) || "error");
    return d;
  }
  function guardar(d, quien) {
    sesion = { token: d.idToken || d.id_token, rt: d.refreshToken || d.refresh_token,
               exp: Date.now() + (+(d.expiresIn || d.expires_in) || 3600) * 1000 - 60000 };
    ls.set("chu_rt", sesion.rt);
    if (quien) ls.set("chu_who", quien);
  }
  // Token de la sesión actual (administrador o cajero), renovado cuando vence.
  Chu.tokenAdmin = async function () {
    if (sesion && Date.now() < sesion.exp) return sesion.token;
    const rt = sesion ? sesion.rt : ls.get("chu_rt");
    if (!rt) return "";
    try {
      guardar(await post("https://securetoken.googleapis.com/v1/token?key=" + KEY,
        "grant_type=refresh_token&refresh_token=" + encodeURIComponent(rt), true));
      return sesion.token;
    } catch (e) { return ""; }
  };
  const sesionDe = q => !!ls.get("chu_rt") && ls.get("chu_who") === q;
  Chu.esAdmin = () => ls.get("chu_role") === "a" && sesionDe("a");
  Chu.esCajero = () => ls.get("chu_role") === "c" && sesionDe("c");
  // Si quedó guardado un rol de antes pero este dispositivo no tiene su sesión, se saca de ahí.
  const rolGuardado = ls.get("chu_role");
  if ((rolGuardado === "a" || rolGuardado === "c") && !sesionDe(rolGuardado)) ls.set("chu_role", "");

  let pendiente = "c";
  function mostrarCaja(q) {
    pendiente = q;
    let b = document.getElementById("clavebox");
    if (!b) {
      b = document.createElement("div"); b.id = "clavebox"; b.className = "box";
      b.innerHTML = '<b id="clavetit"></b><input id="clavein" type="password" autocomplete="current-password">' +
        '<button class="btn p full" id="clavego" type="button">Entrar</button><p class="muted" id="clavemsg"></p>';
      document.getElementById("login").appendChild(b);
      document.getElementById("clavego").onclick = entrar;
      document.getElementById("clavein").onkeydown = e => { if (e.key === "Enter") entrar(); };
    }
    document.getElementById("clavetit").textContent = "Contraseña del " + NOMBRE[q];
    document.getElementById("clavein").placeholder = "Contraseña del " + NOMBRE[q];
    document.getElementById("clavemsg").textContent = "";
    document.getElementById("clavein").focus();
  }
  async function entrar() {
    const q = pendiente, inp = document.getElementById("clavein"), msg = document.getElementById("clavemsg");
    msg.textContent = "Verificando…";
    try {
      guardar(await post("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + KEY,
        { email: MAIL[q], password: inp.value, returnSecureToken: true }), q);
      inp.value = ""; msg.textContent = "";
      document.getElementById(q === "a" ? "ladmin" : "lcash").click(); // ahora sí deja pasar
    } catch (e) { msg.textContent = "Contraseña incorrecta o sin internet."; inp.select(); }
  }

  document.addEventListener("click", ev => {
    const t = ev.target && ev.target.closest ? ev.target.closest("#lcash,#ladmin,#swap") : null;
    if (!t) return;
    if (t.id === "swap") { ls.set("chu_rt", ""); ls.set("chu_who", ""); sesion = null; return; } // al cambiar de usuario hay que volver a entrar
    const q = t.id === "ladmin" ? "a" : "c";
    if (sesionDe(q)) return;
    ev.stopPropagation(); ev.preventDefault();
    mostrarCaja(q);
  }, true);
})();
