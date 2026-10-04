// Service worker: האפליקציה נטענת גם בלי אינטרנט.
// בכל עדכון של index.html — להעלות את המספר כאן כדי שהטלפון יקבל את הגרסה החדשה.
const VERSION = "v1";
const CACHE = "calories-" + VERSION;
const SHELL = ["./", "index.html", "config.js", "shim.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;                       // קריאות ל-AI לא נשמרות בקאש
  const url = new URL(req.url);
  const isShell = url.origin === location.origin;
  // קבצי האפליקציה: רשת קודם (כדי לקבל עדכונים), קאש כגיבוי. גופנים/ספריות: קאש קודם.
  e.respondWith(isShell
    ? fetch(req).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return r; }).catch(() => caches.match(req).then(r => r || caches.match("index.html")))
    : caches.match(req).then(hit => hit || fetch(req).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return r; }))
  );
});
