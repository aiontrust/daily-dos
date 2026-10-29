// Daily Do's push sender. Stores phone push subscriptions in KV and sends an
// empty Web Push once a day at each subscriber's chosen local hour. The phone's
// service worker builds the notification text from the tasks stored on the phone.

const enc = new TextEncoder();
const b64u = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

// The VAPID signing key is created on first use and kept in KV.
export async function getVapid(env) {
  let jwk = await env.SUBS.get("vapid-private-jwk", "json");
  if (!jwk) {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    await env.SUBS.put("vapid-private-jwk", JSON.stringify(jwk));
  }
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const pub = new Uint8Array(65);
  pub[0] = 4;
  pub.set(unb64u(jwk.x), 1);
  pub.set(unb64u(jwk.y), 33);
  return { key, publicKey: b64u(pub) };
}

export async function sendPush(env, vapid, subscription) {
  const aud = new URL(subscription.endpoint).origin;
  const header = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(
    enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT }))
  );
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, vapid.key, enc.encode(header + "." + body));
  const res = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${header}.${body}.${b64u(sig)}, k=${vapid.publicKey}`,
      TTL: "43200",
      Urgency: "normal",
    },
  });
  return res.status;
}

export function localParts(tz, now = new Date()) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

export async function runSchedule(env, now = new Date(), { force = false } = {}) {
  const vapid = await getVapid(env);
  const results = [];
  let cursor;
  do {
    const page = await env.SUBS.list({ prefix: "sub:", cursor });
    for (const k of page.keys) {
      const rec = await env.SUBS.get(k.name, "json");
      if (!rec) continue;
      const { date, hour } = localParts(rec.tz, now);
      // Send in a 3-hour window after the chosen hour so one missed run still gets caught up.
      const due = force || (hour >= rec.hour && hour < rec.hour + 3 && rec.lastSent !== date);
      if (!due) continue;
      const status = await sendPush(env, vapid, rec.subscription);
      if (status === 404 || status === 410) await env.SUBS.delete(k.name);
      else if (status >= 200 && status < 300 && !force) {
        rec.lastSent = date;
        await env.SUBS.put(k.name, JSON.stringify(rec));
      }
      results.push(status);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return results;
}

async function idFor(endpoint) {
  const h = await crypto.subtle.digest("SHA-256", enc.encode(endpoint));
  return "sub:" + [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function cors(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Headers": "content-type,x-setup-key",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    Vary: "Origin",
  };
}

async function handle(request, env) {
  const url = new URL(request.url);
  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", ...cors(env) } });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(env) });

  if (request.method === "GET" && url.pathname === "/vapid-key") {
    return json({ publicKey: (await getVapid(env)).publicKey });
  }
  if (request.method !== "POST") return json({ error: "Not found" }, 404);

  if (!env.SETUP_KEY) return json({ error: "SETUP_KEY is not set on the Worker." }, 503);
  if (request.headers.get("x-setup-key") !== env.SETUP_KEY) return json({ error: "Wrong setup key." }, 401);

  if (url.pathname === "/test") {
    return json({ sent: await runSchedule(env, new Date(), { force: true }) });
  }
  let data;
  try { data = await request.json(); } catch { return json({ error: "Bad request." }, 400); }
  const sub = data && data.subscription;
  if (!sub || typeof sub.endpoint !== "string" || !sub.endpoint.startsWith("https://")) {
    return json({ error: "Missing subscription." }, 400);
  }
  const id = await idFor(sub.endpoint);

  if (url.pathname === "/unsubscribe") {
    await env.SUBS.delete(id);
    return json({ ok: true });
  }
  if (url.pathname === "/subscribe") {
    const tz = String(data.tz || "");
    const hour = Number(data.hour);
    try { localParts(tz); } catch { return json({ error: "Unknown time zone." }, 400); }
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) return json({ error: "Hour must be 0-23." }, 400);
    const existing = await env.SUBS.list({ prefix: "sub:", limit: 11 });
    if (existing.keys.length >= 10 && !existing.keys.some((k) => k.name === id)) {
      return json({ error: "Too many devices registered." }, 400);
    }
    await env.SUBS.put(id, JSON.stringify({ subscription: sub, tz, hour, lastSent: null }));
    return json({ ok: true });
  }
  return json({ error: "Not found" }, 404);
}

export default {
  fetch: (request, env) => handle(request, env),
  scheduled: (event, env, ctx) => ctx.waitUntil(runSchedule(env)),
};
