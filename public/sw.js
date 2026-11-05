/* Bino Pocket service worker — app-shell cache so the PWA opens instantly
   (and still opens with no network). Data always comes from the network. */
const VERSION = "bp-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icons/icon.svg", "/icons/icon-192.png", "/icons/icon-512.png", "/brand/logo.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

/* Web Share Target (Android): Photos app → "Share" → Bino Pocket posts the files here.
   Stash them in a cache and redirect to /scan?share=1, where the page picks them up. */
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method === "POST" && url.origin === location.origin && url.pathname === "/scan") {
    e.respondWith(
      (async () => {
        try {
          const form = await e.request.formData();
          const files = form.getAll("screenshots").filter((f) => f && typeof f === "object" && "type" in f);
          const cache = await caches.open("bino-share");
          const keys = await cache.keys();
          await Promise.all(keys.map((k) => cache.delete(k)));
          await Promise.all(
            files.map((f, i) => cache.put(`/shared/${i}`, new Response(f, { headers: { "Content-Type": f.type || "image/jpeg", "X-Name": f.name || `shared-${i}.jpg` } }))),
          );
        } catch (err) {
          /* fall through to the page without files */
        }
        return Response.redirect("/scan?share=1", 303);
      })(),
    );
  }
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // Never cache API or Supabase auth traffic.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  // Static assets: cache-first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/brand/")) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => cachePut(req, res))));
    return;
  }
  // Pages: network-first, fall back to cached shell.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => cachePut(req, res))
        .catch(() => caches.match(req).then((hit) => hit || caches.match("/"))),
    );
  }
});

function cachePut(req, res) {
  if (res && res.ok && res.type === "basic") {
    const copy = res.clone();
    caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
  }
  return res;
}
