// Run with: node worker/test.mjs
import worker, { getVapid, runSchedule, localParts } from "./src/index.js";
import assert from "node:assert/strict";

const store = new Map();
const SUBS = {
  async get(k, t) { const v = store.get(k); return v == null ? null : t === "json" ? JSON.parse(v) : v; },
  async put(k, v) { store.set(k, v); },
  async delete(k) { store.delete(k); },
  async list({ prefix, limit }) {
    let keys = [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name }));
    if (limit) keys = keys.slice(0, limit);
    return { keys, list_complete: true };
  },
};
const env = { SUBS, SETUP_KEY: "k", ALLOWED_ORIGIN: "https://x.github.io", VAPID_SUBJECT: "https://x.github.io/app/" };

const pushes = [];
let pushStatus = 201;
globalThis.fetch = async (url, init) => { pushes.push({ url, init }); return new Response(null, { status: pushStatus }); };

const call = (path, body, key = "k", method = "POST") =>
  worker.fetch(new Request("https://w.example" + path, {
    method, headers: { "content-type": "application/json", "x-setup-key": key },
    body: method === "GET" ? undefined : JSON.stringify(body || {}),
  }), env);

// public key route
const vk = await (await worker.fetch(new Request("https://w.example/vapid-key"), env)).json();
assert.equal(vk.publicKey.length, 87); // 65 bytes, base64url

// auth and validation
assert.equal((await call("/subscribe", {}, "bad")).status, 401);
assert.equal((await call("/subscribe", { subscription: { endpoint: "http://x" }, tz: "America/Chicago", hour: 8 })).status, 400);
assert.equal((await call("/subscribe", { subscription: { endpoint: "https://push.example/abc" }, tz: "Nope/Zone", hour: 8 })).status, 400);
assert.equal((await call("/subscribe", { subscription: { endpoint: "https://push.example/abc" }, tz: "America/Chicago", hour: 8 })).status, 200);
assert.equal(store.size, 2); // vapid key + one subscription

// time-zone logic: 13:00 UTC on Oct 29 is 8:00 in Chicago (CDT)
assert.deepEqual(localParts("America/Chicago", new Date("2026-10-29T13:00:00Z")), { date: "2026-10-29", hour: 8 });
assert.deepEqual(localParts("America/Chicago", new Date("2026-11-02T14:00:00Z")), { date: "2026-11-02", hour: 8 }); // CST after DST ends

// not due at 7am local, due at 8am, only once per day
pushes.length = 0;
await runSchedule(env, new Date("2026-10-29T12:00:00Z"));
assert.equal(pushes.length, 0);
await runSchedule(env, new Date("2026-10-29T13:00:00Z"));
assert.equal(pushes.length, 1);
await runSchedule(env, new Date("2026-10-29T14:00:00Z"));
assert.equal(pushes.length, 1);
await runSchedule(env, new Date("2026-10-30T13:00:00Z"));
assert.equal(pushes.length, 2);

// the VAPID signature verifies against the advertised public key
const auth = pushes[0].init.headers.Authorization;
const [, t, k] = auth.match(/^vapid t=([^,]+), k=(.+)$/);
assert.equal(k, vk.publicKey);
const [h, p, s] = t.split(".");
const unb = (x) => Uint8Array.from(Buffer.from(x.replace(/-/g, "+").replace(/_/g, "/"), "base64"));
const pub = await crypto.subtle.importKey("raw", unb(k), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
assert.ok(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, unb(s), new TextEncoder().encode(h + "." + p)));
const claims = JSON.parse(Buffer.from(unb(p)).toString());
assert.equal(claims.aud, "https://push.example");
assert.equal(claims.sub, env.VAPID_SUBJECT);

// expired subscriptions are removed
pushStatus = 410;
await call("/test", {});
assert.equal([...store.keys()].filter((x) => x.startsWith("sub:")).length, 0);

console.log("worker tests passed");
