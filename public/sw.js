const CACHE = "revit-offline-v2";
const CORE = [
  "/manifest.webmanifest", "/revit-180.png", "/revit-192.png", "/revit-512.png",
];

async function cacheOfflineShell() {
  const cache = await caches.open(CACHE);
  await Promise.allSettled(CORE.map((url) => cache.add(url)));
  const response = await fetch("/offline");
  if (!response.ok) throw new Error("Offline shell unavailable");
  await cache.put("/offline", response.clone());
}

async function warmOfflineShell() {
  const cache = await caches.open(CACHE);
  const response = await cache.match("/offline");
  if (!response) return;
  const html = await response.text();
  const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1])
    .filter((url) => url.startsWith("/") && !url.startsWith("//"));
  await Promise.allSettled(urls.map((url) => cache.add(url)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheOfflineShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "WARM_OFFLINE_SHELL") event.waitUntil(warmOfflineShell());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => (await caches.match("/offline")) || Response.error()));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || /\.(?:css|js|woff2?|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) void caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
      return response;
    })));
  }
});
