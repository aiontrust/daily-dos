const CACHE = "daily-dos-v3";
const FILES = ["./", "index.html", "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).then((r) => { if (new URL(e.request.url).origin === location.origin) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return r; }).catch(() => caches.match(e.request)));
});

// ---- Morning reminder ----
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
function isDue(when, d) {
  for (const raw of String(when || "daily").split(",")) {
    const p = raw.trim().toLowerCase(), g = d.getDay();
    if (p === "daily") return true;
    if (p === "weekdays" && g >= 1 && g <= 5) return true;
    if (p === "weekends" && (g === 0 || g === 6)) return true;
    if (p === DAYS[g] || p === iso(d)) return true;
    if (p.indexOf("day:") === 0 && Number(p.slice(4)) === d.getDate()) return true;
  }
  return false;
}
function readState() {
  return new Promise((resolve) => {
    try {
      const r = indexedDB.open("dailydos", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onerror = () => resolve(null);
      r.onsuccess = () => {
        try {
          const g = r.result.transaction("kv").objectStore("kv").get("state");
          g.onsuccess = () => resolve(g.result || null);
          g.onerror = () => resolve(null);
        } catch (e) { resolve(null); }
      };
    } catch (e) { resolve(null); }
  });
}
async function showToday() {
  const st = await readState();
  let title = "Daily Do's", body = "Open the app to see today's list.";
  if (st && Array.isArray(st.tasks)) {
    const now = new Date(), done = new Set((st.done && st.done[iso(now)]) || []);
    const left = st.tasks.filter((t) => isDue(t.when, now) && !done.has(t.id)).map((t) => t.title);
    if (!left.length) { title = "All clear"; body = "Nothing left to do today."; }
    else {
      title = "To do today (" + left.length + ")";
      body = left.slice(0, 6).map((t) => "• " + t).join("\n") + (left.length > 6 ? "\n+" + (left.length - 6) + " more" : "");
    }
  }
  return self.registration.showNotification(title, { body, icon: "icon-192.png", tag: "daily-dos" });
}
self.addEventListener("push", (e) => e.waitUntil(showToday()));
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => (cs.length ? cs[0].focus() : self.clients.openWindow("./"))));
});
