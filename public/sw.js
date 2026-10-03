const CACHE = "revit-offline-v1";
const CORE = [
  "/manifest.webmanifest", "/revit-192.png", "/revit-512.png", "/revit-rounded.png", "/revit-frog.png", "/icons/neu/revit-wordmark.png",
  "/reviewer-assets/laboratory-operations/westgard-r4s.png", "/reviewer-assets/laboratory-operations/tonks-youden.png",
  "/reviewer-assets/laboratory-operations/roc-curve.png", "/reviewer-assets/laboratory-operations/regression.png",
  "/reviewer-assets/laboratory-operations/normal-distribution.png", "/reviewer-assets/laboratory-operations/levey-jennings.png",
  "/reviewer-assets/laboratory-operations/cusum.png", "/reviewer-assets/laboratory-operations/bias-plot.png",
  "/reviewer-assets/hematology-1/section1_8_q8.png", "/reviewer-assets/hematology-1/section1_8_q7.png",
  "/reviewer-assets/hematology-1/section1_8_q4.png", "/reviewer-assets/hematology-1/section1_8_q17.png",
  "/reviewer-assets/hematology-1/section1_8_q15.png", "/reviewer-assets/hematology-1/section1_8_q13.png",
  "/reviewer-assets/hematology-1/section1_8_q12.png", "/reviewer-assets/hematology-1/section1_8_q11.png",
  "/reviewer-assets/hematology-1/section1_8_q10.png", "/reviewer-assets/ciulla/rh-typing-table.png",
  "/reviewer-assets/ciulla/red-cell-panel-3.png", "/reviewer-assets/ciulla/red-cell-panel-3-patient.png",
  "/reviewer-assets/ciulla/red-cell-panel-2.png", "/reviewer-assets/ciulla/red-cell-panel-1.png",
  "/reviewer-assets/ciulla/prenatal-typing-table.png", "/reviewer-assets/ciulla/michaelis-menten.png",
  "/reviewer-assets/ciulla/kell-family-study-table.png", "/reviewer-assets/ciulla/hemostasis-mixing-study.png",
  "/reviewer-assets/ciulla/alt-rate-reaction-data.png", "/reviewer-assets/ciulla/abo-typing-matrix.png",
];

async function cacheOfflineShell() {
  const cache = await caches.open(CACHE);
  await Promise.allSettled(CORE.map((url) => cache.add(url)));
  const response = await fetch("/offline");
  if (!response.ok) throw new Error("Offline shell unavailable");
  await cache.put("/offline", response.clone());
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
  if (event.data?.type !== "CACHE_URLS" || !Array.isArray(event.data.urls)) return;
  const urls = event.data.urls.filter((url) => {
    try { return new URL(url).origin === self.location.origin; } catch { return false; }
  });
  event.waitUntil(caches.open(CACHE).then((cache) => Promise.allSettled(urls.map((url) => cache.add(url)))));
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
