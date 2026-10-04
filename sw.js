// Service worker: האפליקציה נטענת גם בלי אינטרנט.
// בכל עדכון של index.html — להעלות את המספר כאן כדי שהטלפון יקבל את הגרסה החדשה.
const VERSION = "v3";
const CACHE = "calories-" + VERSION;
const SHELL = ["./", "index.html", "config.js", "shim.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

// cache:"reload" — GitHub Pages שולח max-age=600, ובלי זה גם ה-install היה שואב קבצים ישנים מה-HTTP cache.
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u =>
    fetch(new Request(u, {cache: "reload"})).then(r => { if (!r.ok) throw new Error(u + " " + r.status); return c.put(u, r); })
  ))).then(() => self.skipWaiting()));
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
  // cache:"no-cache" עוקף את max-age של GitHub Pages (בדיקה מול השרת בכל פעם). בבקשות ניווט Chromium מתעלם
  // מה-override כשמעבירים את אובייקט הבקשה, לכן שם מעבירים את ה-URL.
  e.respondWith(isShell
    ? fetch(req.mode === "navigate" ? req.url : req, {cache: "no-cache"}).then(r => {
        // לא שומרים תשובות שגיאה: 404/500 היו דורסות קובץ תקין ושוברות את האפליקציה אופליין
        if (r.ok) { const copy = r.clone(); e.waitUntil(caches.open(CACHE).then(c => c.put(req, copy))); }
        return r;
      }).catch(() => caches.match(req).then(r => r || caches.match("index.html")))
    : caches.match(req).then(hit => hit || fetch(req).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return r; }))
  );
});
