// Service worker: deja la página guardada en el celular para abrirla SIN internet.
// Si cambias archivos del proyecto, sube el número de versión (V).
const V = "chuletada-v3";
const ARCHIVOS = ["./", "./index.html", "./styles.css", "./config.js", "./clave.js",
                  "./api-local.js", "./sync.js", "./app.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Red primero (para recibir actualizaciones); si no responde en 3 s o no hay internet, usa lo guardado.
self.addEventListener("fetch", e => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith((async () => {
    try {
      const r = await Promise.race([fetch(req), new Promise((_, no) => setTimeout(no, 3000))]);
      if (r && r.ok) { const c = await caches.open(V); c.put(req, r.clone()); }
      return r;
    } catch (err) {
      return (await caches.match(req, { ignoreSearch: true })) || (await caches.match("./index.html"));
    }
  })());
});
