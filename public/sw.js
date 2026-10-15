/* BOYOMA CONNECT — Service Worker
 * Stratégies :
 *  - Pages HTML : réseau d'abord, repli sur le cache (fiches déjà consultées), puis /hors-ligne.
 *  - Ressources statiques Next (/_next/static) : cache d'abord (fichiers versionnés).
 *  - Images Supabase publiques : cache limité (60 entrées).
 *  - JAMAIS de cache pour l'API Supabase (données à jour, données privées), l'auth ou les requêtes non-GET.
 */
const VERSION = "v4";
const STATIC_CACHE = `boyoma-static-${VERSION}`;
const PAGES_CACHE = `boyoma-pages-${VERSION}`;
const IMAGES_CACHE = `boyoma-images-${VERSION}`;
const OFFLINE_URL = "/hors-ligne";
const MAX_PAGES = 40;
const MAX_IMAGES = 60;
const PRIVATE_PREFIXES = ["/profil", "/connexion", "/inscription", "/business", "/terrain", "/admin", "/api"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((c) => c.addAll([OFFLINE_URL, "/manifest.webmanifest", "/icons/icon-192.png"])),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = [STATIC_CACHE, PAGES_CACHE, IMAGES_CACHE];
      for (const key of await caches.keys()) if (!keep.includes(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
  // Déconnexion : purge des pages potentiellement personnalisées.
  if (event.data === "CLEAR_PRIVATE") event.waitUntil(caches.delete(PAGES_CACHE));
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Images publiques Supabase (bucket place-media).
  if (
    url.pathname.startsWith("/storage/v1/object/public/") ||
    (url.origin === self.location.origin && url.pathname.startsWith("/_next/image"))
  ) {
    event.respondWith(
      caches.open(IMAGES_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok) {
            cache.put(req, res.clone());
            trim(IMAGES_CACHE, MAX_IMAGES);
          }
          return res;
        } catch {
          return hit || Response.error();
        }
      }),
    );
    return;
  }

  if (url.origin !== self.location.origin) return; // API Supabase, tuiles : jamais interceptées

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(STATIC_CACHE).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  if (req.mode === "navigate") {
    const isPrivate = PRIVATE_PREFIXES.some((p) => url.pathname.startsWith(p));
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok && !isPrivate) {
            const cache = await caches.open(PAGES_CACHE);
            cache.put(req, res.clone());
            trim(PAGES_CACHE, MAX_PAGES);
          }
          return res;
        } catch {
          if (!isPrivate) {
            const cached = await caches.match(req);
            if (cached) return cached;
          }
          return (await caches.match(OFFLINE_URL)) || new Response("Hors ligne", { status: 503 });
        }
      })(),
    );
  }
});

// Notifications push (nouvelles demandes de clients, bilan de la semaine).
self.addEventListener("push", (event) => {
  let data = { title: "Boyoma Connect", body: "", url: "/notifications" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    /* charge utile illisible : notification générique */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag,
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/notifications", self.location.origin);
  if (target.origin !== self.location.origin) return; // jamais vers un autre site
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of all) {
        if ("focus" in c) {
          await c.navigate(target.href).catch(() => undefined);
          return c.focus();
        }
      }
      return self.clients.openWindow(target.href);
    })(),
  );
});
