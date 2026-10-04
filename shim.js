/*
 * shim.js — מחליף את יכולות Claude (window.claude.use) כשהאפליקציה רצה מחוץ ל-Claude.
 *   sample    → הערכה חכמה דרך Cloudflare Worker שקורא ל-Anthropic API
 *   downloads → הורדת קובץ רגילה מהדפדפן
 *   db / user → null  (הנתונים נשמרים ב-localStorage של המכשיר)
 * קוד האפליקציה עצמו לא משתנה: הוא כבר יודע לעבוד עם כל אחת מהיכולות או בלעדיה.
 */
(function () {
  "use strict";
  const cfg = window.APP_CONFIG || {};
  const MAX_SIDE = 1280;          // מקטינים תמונות לפני שליחה — חוסך עלות וזמן
  const MAX_BYTES = 8 * 1024 * 1024;
  const MAX_B64 = 6900000;        // ה-Worker דוחה base64 מעל 7,000,000 תווים (image_too_large) — נשארים מתחת עם מרווח

  function err(code, message) { const e = new Error(message || code); e.code = code; return e; }

  async function fileToJpegBase64(file, maxSide) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(err("image_rejected")); i.src = url; });
      let scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight)), q = 0.85;
      for (let i = 0; i < 12; i++) {
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.naturalWidth * scale)); c.height = Math.max(1, Math.round(img.naturalHeight * scale));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        const b64 = c.toDataURL("image/jpeg", q).split(",")[1];
        if (b64.length <= MAX_B64) return b64;
        if (q > 0.5) q = Math.max(0.5, q - 0.1); else scale *= 0.8;   // קודם מורידים איכות, אחר כך רזולוציה
      }
      throw err("image_rejected");
    } finally { URL.revokeObjectURL(url); }
  }

  function extractJson(text) {
    const t = String(text || "").replace(/```json|```/g, "").trim();
    try { return JSON.parse(t); } catch (e) {}
    const a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {} }
    throw err("bad_response", "התשובה לא הייתה JSON תקין");
  }

  const sample = cfg.AI_ENDPOINT ? {
    async limits() {
      return { images: { maxInputBytes: MAX_BYTES, mediaTypes: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"] } };
    },
    async json(prompt, opts) {
      opts = opts || {};
      const body = { prompt: String(prompt), tier: opts.modelTier === "quick" ? "quick" : "default" };
      if (opts.images) {
        const f = Array.isArray(opts.images) ? opts.images[0] : opts.images;
        if (f.size > MAX_BYTES) throw err("image_rejected");
        // opts.maxSide: רזולוציה מקסימלית (ברירת מחדל 1280; תפריט = 2048). שדות לא מוכרים ב-opts פשוט מתעלמים מהם.
        const side = Number.isFinite(+opts.maxSide) && +opts.maxSide > 0 ? Math.min(4096, Math.max(256, +opts.maxSide)) : MAX_SIDE;
        body.image = { media_type: "image/jpeg", data: await fileToJpegBase64(f, side) };
      }
      let r;
      try {
        r = await fetch(cfg.AI_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-App-Token": cfg.APP_TOKEN || "" },
          body: JSON.stringify(body),
          signal: opts.signal
        });
      } catch (e) {
        if (e && e.name === "AbortError") throw err("cancelled");
        throw err(navigator.onLine === false ? "offline" : "network");
      }
      if (r.status === 429) throw err("rate_limited");
      if (r.status === 401 || r.status === 403) throw err("not_granted");
      if (!r.ok) throw err("upstream_" + r.status);
      const data = await r.json();
      return extractJson(data.text);
    }
  } : null;

  const downloads = {
    async save({ filename, data }) {
      const blob = data instanceof Blob ? data : new Blob([data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = filename || "download";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      return { ok: true };
    }
  };

  const caps = { sample, downloads, db: null, user: null };
  window.claude = window.claude || { use: async name => (name in caps ? caps[name] : null) };
})();
