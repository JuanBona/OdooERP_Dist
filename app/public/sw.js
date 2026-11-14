// Service worker: deja la app abierta y usable sin señal.
// Estrategia: la app (HTML/JS/CSS/imágenes) se sirve desde caché y se actualiza en segundo plano.
const CACHE = "rds-v2";

self.addEventListener("install", e => {
  // Guarda el HTML y todos los archivos que referencia (JS, CSS), así abre aunque no haya señal.
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    const html = await (await fetch("./index.html", { cache: "no-store" })).text();
    const assets = [...html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)].map(m => m[1]);
    await c.addAll(["./", "./index.html", ...assets]);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return; // la API de Supabase no se cachea
  e.respondWith(
    caches.match(req, { ignoreVary: true, ignoreSearch: true }).then(hit => {
      const red = fetch(req).then(res => {
        if (res.ok) { const copia = res.clone(); caches.open(CACHE).then(c => c.put(req, copia)); }
        return res;
      }).catch(() => hit || caches.match("./index.html"));
      return hit || red;
    })
  );
});
