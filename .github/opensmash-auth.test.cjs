/* Offline test of js/opensmash-auth.js: fake fetch, fake storage, fake Web Crypto randomness. No network.
   Run: node .github/opensmash-auth.test.cjs */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const nodeCrypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const SRC = fs.readFileSync(path.join(ROOT, "js", "opensmash-auth.js"), "utf8");
const CLIENT = "4579e1c5-2c06-4247-bbde-ed266f13088b";
const KEY = "sb_publishable_v5DkzLiVBpTnDMy6BdpI7A_rqZSSQWz";
const TOKEN_URL = "https://gnufjvqwynxmudpgrded.supabase.co/auth/v1/oauth/token";
const REDIRECT = "https://denkishi.github.io/opensmash-site/auth/callback/";
const SUB = "11111111-2222-4333-8444-555555555555";

function b64u(s) { return Buffer.from(s).toString("base64url"); }
function jwt(claims) { return b64u(JSON.stringify({ alg: "ES256" })) + "." + b64u(JSON.stringify(claims)) + ".sig"; }
function tokenReply(n) { return { access_token: jwt({ sub: SUB, email: "a@b.c", n: n }), token_type: "bearer", expires_in: 3600, refresh_token: "refresh-" + n, scope: "email" }; }

function makeStorage(blocked) {
  const m = new Map();
  return {
    m,
    getItem(k) { if (blocked) throw new Error("blocked"); return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { if (blocked) throw new Error("blocked"); m.set(k, String(v)); },
    removeItem(k) { if (blocked) throw new Error("blocked"); m.delete(k); }
  };
}
function makeFetch(handler) {
  const calls = [];
  const f = async function (url, opts) {
    opts = opts || {};
    const call = { url: String(url), method: opts.method || "GET", headers: opts.headers || {}, body: opts.body };
    calls.push(call);
    const r = await handler(call);
    if (r instanceof Error) throw r;
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
  };
  f.calls = calls;
  return f;
}
/* A browser-like environment; `shared` lets two "tabs" use the same localStorage. */
function makeEnv(o) {
  o = o || {};
  const events = [];
  const rndQueue = (o.random || []).slice();
  const win = {
    location: { hostname: o.hostname || "denkishi.github.io", origin: o.origin || "https://denkishi.github.io", href: "", pathname: "/opensmash-site/auth/callback/" },
    localStorage: o.localStorage || makeStorage(o.blockLocal),
    sessionStorage: o.sessionStorage || makeStorage(o.blockSession),
    navigator: o.locks === false ? {} : { locks: o.locks || undefined },
    crypto: {
      subtle: nodeCrypto.webcrypto.subtle,
      getRandomValues(a) { const q = rndQueue.shift(); if (q) { a.set(q); return a; } return nodeCrypto.webcrypto.getRandomValues(a); }
    },
    fetch: o.fetch || makeFetch(() => ({ status: 500, body: {} })),
    dispatchEvent(e) { events.push(e.type); return true; }
  };
  if (!win.navigator.locks) delete win.navigator.locks;
  new Function("window", SRC)(win);
  return { win, A: win.OpenSmashAuth, events, ls: win.localStorage, ss: win.sessionStorage };
}
/* Web Locks stand-in: one holder at a time per name, shared by every tab that gets this object. */
function makeLocks() {
  let tail = Promise.resolve();
  return { request(name, cb) { const run = tail.then(() => cb({ name })); tail = run.catch(() => {}); return run; } };
}
function withNow(t, fn) {
  const real = Date.now; Date.now = () => t;
  return Promise.resolve().then(fn).finally(() => { Date.now = real; });
}
function pendingOf(env) { const r = env.ss.getItem("osu_account_pending"); return r ? JSON.parse(r) : null; }
async function signInStart(env, next) { await env.A.startSignIn(next); return new URL(env.win.location.href); }
function seedSession(env, extra) {
  env.ls.setItem("osu_account", JSON.stringify(Object.assign({ access: jwt({ sub: SUB }), exp: Date.now() + 3600000, refresh: "refresh-old", sub: SUB, profile: null }, extra)));
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test("configured() is true for the registered client id", () => { assert.equal(makeEnv().A.configured(), true); });

test("PKCE S256 matches the RFC 7636 test vector", async () => {
  const verifierBytes = Buffer.from("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk", "base64url");
  const env = makeEnv({ random: [new Uint8Array(verifierBytes)] }); // the verifier is the first random value
  const u = await signInStart(env, "");
  assert.equal(u.searchParams.get("code_challenge"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  assert.equal(u.searchParams.get("code_challenge_method"), "S256");
  assert.equal(pendingOf(env).verifier, "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk");
});

test("authorize URL has exactly the specified parameters; verifier and state are 43 chars and differ per sign-in", async () => {
  const env = makeEnv();
  const u = await signInStart(env, "account/");
  assert.equal(u.origin + u.pathname, "https://gnufjvqwynxmudpgrded.supabase.co/auth/v1/oauth/authorize");
  const p = u.searchParams;
  assert.deepEqual([...p.keys()].sort(), ["client_id", "code_challenge", "code_challenge_method", "redirect_uri", "response_type", "scope", "state"]);
  assert.equal(p.get("response_type"), "code");
  assert.equal(p.get("client_id"), CLIENT);
  assert.equal(p.get("redirect_uri"), REDIRECT);
  assert.equal(p.get("scope"), "email");
  const pend = pendingOf(env);
  assert.match(pend.verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.match(pend.state, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(p.get("state"), pend.state);
  assert.notEqual(pend.verifier, pend.state);
  assert.equal(pend.next, "account/");
  assert.ok(Math.abs(pend.at - Date.now()) < 5000);
  assert.ok(!u.href.includes(pend.verifier), "the verifier never appears in the URL");
  const env2 = makeEnv(); await signInStart(env2, "");
  assert.notEqual(pendingOf(env2).state, pend.state);
  assert.equal(env.ls.m.size, 0, "nothing in localStorage before the callback");
});

test("next must be a plain path inside the site", async () => {
  for (const [given, want] of [["account/", "account/"], ["", ""], ["https://evil.example/", ""], ["//evil.example", ""], ["../x", ""], ["a/../b", ""], ["/abs", ""], ["javascript:alert(1)", ""], [undefined, ""], ["a b", ""]]) {
    const env = makeEnv(); await signInStart(env, given);
    assert.equal(pendingOf(env).next, want, JSON.stringify(given));
  }
});

test("startSignIn rejects with a readable error when storage is blocked or Web Crypto is missing", async () => {
  const env = makeEnv({ blockSession: true });
  await assert.rejects(env.A.startSignIn(""), /storage/i);
  assert.equal(env.win.location.href, "");
  const env2 = makeEnv(); env2.win.crypto = {};
  await assert.rejects(env2.A.startSignIn(""), /Web Crypto/);
});

async function readyForCallback(next, fetchHandler, extra) {
  const f = makeFetch(fetchHandler || (() => ({ status: 200, body: tokenReply(1) })));
  const env = makeEnv(Object.assign({ fetch: f }, extra));
  await signInStart(env, next);
  return { env, f, pend: pendingOf(env) };
}

test("good callback: state checked, token request body and headers exact, session stored, pending deleted", async () => {
  const { env, f, pend } = await readyForCallback("account/");
  const r = await env.A.finishSignIn("?code=the-code&state=" + pend.state);
  assert.deepEqual(r, { ok: true, next: "account/" });
  assert.equal(f.calls.length, 1);
  const c = f.calls[0];
  assert.equal(c.url, TOKEN_URL);
  assert.equal(c.method, "POST");
  assert.equal(c.headers["Content-Type"], "application/x-www-form-urlencoded");
  assert.equal(c.headers.apikey, KEY);
  assert.equal(c.body, new URLSearchParams({ grant_type: "authorization_code", code: "the-code", client_id: CLIENT, redirect_uri: REDIRECT, code_verifier: pend.verifier }).toString());
  assert.equal(env.ss.getItem("osu_account_pending"), null, "pending deleted");
  const s = JSON.parse(env.ls.getItem("osu_account"));
  assert.equal(s.sub, SUB);
  assert.equal(s.refresh, "refresh-1");
  assert.ok(s.exp > Date.now() + 3500000);
  assert.deepEqual([...env.ls.m.keys()], ["osu_account"], "only osu_account in localStorage");
  assert.deepEqual(Object.keys(s).sort(), ["access", "exp", "profile", "refresh", "sub"]);
  assert.ok(env.events.includes("osu-account"));
  assert.equal(env.A.signedIn(), true);
  assert.equal(await env.A.token(), s.access);
  assert.equal(f.calls.length, 1, "a valid token needs no network");
});

test("a pending sign-in works once: a second finish is refused with no request", async () => {
  const { env, f, pend } = await readyForCallback("");
  await env.A.finishSignIn("?code=c&state=" + pend.state);
  const again = await env.A.finishSignIn("?code=c&state=" + pend.state);
  assert.deepEqual(again, { ok: false, reason: "not-yours" });
  assert.equal(f.calls.length, 1);
});

test("no pending sign-in (callback opened directly): not-yours, no request", async () => {
  for (const q of ["", "?code=x&state=y"]) {
    const f = makeFetch(() => ({ status: 200, body: tokenReply(1) }));
    const env = makeEnv({ fetch: f });
    assert.deepEqual(await env.A.finishSignIn(q), { ok: false, reason: "not-yours" });
    assert.equal(f.calls.length, 0);
    assert.equal(env.A.signedIn(), false);
  }
});

test("wrong state: not-yours, no request, pending is still burned", async () => {
  const { env, f } = await readyForCallback("");
  assert.deepEqual(await env.A.finishSignIn("?code=c&state=wrong"), { ok: false, reason: "not-yours" });
  assert.equal(f.calls.length, 0);
  assert.equal(env.ss.getItem("osu_account_pending"), null);
  const { env: e2, f: f2 } = await readyForCallback("");
  assert.deepEqual(await e2.A.finishSignIn("?code=c"), { ok: false, reason: "not-yours" }); // no state at all
  assert.equal(f2.calls.length, 0);
});

test("a sign-in older than 10 minutes is refused; 10 minutes less a second still works", async () => {
  const t0 = Date.now();
  let a = await readyForCallback("");
  const r1 = await withNow(t0 + 10 * 60 * 1000 + 1000, () => a.env.A.finishSignIn("?code=c&state=" + a.pend.state));
  assert.deepEqual(r1, { ok: false, reason: "not-yours" });
  assert.equal(a.f.calls.length, 0);
  let b = await readyForCallback("");
  const r2 = await withNow(t0 + 10 * 60 * 1000 - 1000, () => b.env.A.finishSignIn("?code=c&state=" + b.pend.state));
  assert.equal(r2.ok, true);
});

test("cancel and errors: access_denied is cancelled, other errors and a missing code are failed, never a request", async () => {
  const cases = [["?error=access_denied&error_description=nope&state=", "cancelled"], ["?error=server_error&state=", "failed"], ["?error=invalid_request&state=", "failed"], ["?state=", "failed"]];
  for (const [q, reason] of cases) {
    const { env, f, pend } = await readyForCallback("");
    assert.deepEqual(await env.A.finishSignIn(q + pend.state), { ok: false, reason }, q);
    assert.equal(f.calls.length, 0);
    assert.equal(env.ss.getItem("osu_account_pending"), null);
    assert.equal(env.A.signedIn(), false);
  }
});

test("service refuses the code, network error, junk answer: failed, not signed in, pending gone", async () => {
  for (const handler of [() => ({ status: 400, body: { error: "invalid_grant" } }), () => new TypeError("Failed to fetch"), () => ({ status: 200, body: { access_token: "not-a-jwt", refresh_token: "r" } }), () => ({ status: 200, body: { access_token: jwt({ sub: SUB }) } })]) {
    const { env, pend } = await readyForCallback("", handler);
    assert.deepEqual(await env.A.finishSignIn("?code=c&state=" + pend.state), { ok: false, reason: "failed" });
    assert.equal(env.A.signedIn(), false);
    assert.equal(env.ss.getItem("osu_account_pending"), null);
  }
});

test("storage blocked when saving the session: failed", async () => {
  const { env, pend } = await readyForCallback("", null, { blockLocal: true });
  assert.deepEqual(await env.A.finishSignIn("?code=c&state=" + pend.state), { ok: false, reason: "failed" });
});

test("no token, code or verifier in any URL we build, and no secrets in the source", async () => {
  const { env, pend } = await readyForCallback("account/");
  assert.ok(!env.win.location.href.includes(pend.verifier));
  for (const bad of ["service_role", "sb_secret", "client_secret"]) assert.ok(!SRC.includes(bad), bad);
  assert.ok(!/console\./.test(SRC), "nothing is logged");
  assert.ok(!/['"]plain['"]/.test(SRC));
});

test("refresh: expired token is refreshed with the exact body, the rotated refresh token is stored", async () => {
  const f = makeFetch(() => ({ status: 200, body: tokenReply(2) }));
  const env = makeEnv({ fetch: f });
  seedSession(env, { exp: Date.now() + 30000, access: "old" }); // less than a minute left
  const t = await env.A.token();
  assert.equal(t, tokenReply(2).access_token);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, TOKEN_URL);
  assert.equal(f.calls[0].headers.apikey, KEY);
  assert.equal(f.calls[0].body, new URLSearchParams({ grant_type: "refresh_token", refresh_token: "refresh-old", client_id: CLIENT }).toString());
  assert.ok(!f.calls[0].url.includes("/auth/v1/token?"), "not the ordinary supabase-js refresh");
  const s = JSON.parse(env.ls.getItem("osu_account"));
  assert.equal(s.refresh, "refresh-2");
  assert.equal(s.sub, SUB);
});

test("refresh keeps the cached profile", async () => {
  const f = makeFetch(() => ({ status: 200, body: tokenReply(2) }));
  const env = makeEnv({ fetch: f });
  seedSession(env, { exp: 0, profile: { username: "P", tag: 7 } });
  await env.A.token();
  assert.equal(env.A.profile().username, "P");
});

test("refused refresh (400/401) ends the session; network error and 5xx keep it", async () => {
  for (const status of [400, 401]) {
    const env = makeEnv({ fetch: makeFetch(() => ({ status, body: { error: "invalid_grant" } })) });
    seedSession(env, { exp: 0 });
    assert.equal(await env.A.token(), null);
    assert.equal(env.A.signedIn(), false);
    assert.ok(env.events.includes("osu-account"));
  }
  for (const h of [() => ({ status: 503, body: {} }), () => new TypeError("offline")]) {
    const env = makeEnv({ fetch: makeFetch(h) });
    seedSession(env, { exp: 0 });
    await assert.rejects(env.A.token());
    assert.equal(env.A.signedIn(), true);
    assert.equal(JSON.parse(env.ls.getItem("osu_account")).refresh, "refresh-old");
  }
});

test("signed out: token() is null, no request", async () => {
  const f = makeFetch(() => ({ status: 200, body: {} }));
  const env = makeEnv({ fetch: f });
  assert.equal(await env.A.token(), null);
  assert.equal(await env.A.fetchProfile(), null);
  assert.equal(f.calls.length, 0);
});

test("only one refresh at a time inside a tab (no Web Locks): concurrent token() calls make one POST", async () => {
  const f = makeFetch(async () => { await new Promise(r => setTimeout(r, 20)); return { status: 200, body: tokenReply(3) }; });
  const env = makeEnv({ fetch: f, locks: false });
  seedSession(env, { exp: 0 });
  const r = await Promise.all([env.A.token(), env.A.token(), env.A.token()]);
  assert.equal(f.calls.length, 1);
  assert.equal(new Set(r).size, 1);
});

test("two tabs with Web Locks: the second tab sees the rotated token inside the lock and does not refresh again", async () => {
  const f = makeFetch(async () => { await new Promise(r => setTimeout(r, 20)); return { status: 200, body: tokenReply(4) }; });
  const locks = makeLocks();
  const ls = makeStorage();
  const tabA = makeEnv({ fetch: f, locks, localStorage: ls });
  const tabB = makeEnv({ fetch: f, locks, localStorage: ls });
  seedSession(tabA, { exp: 0 });
  const [a, b] = await Promise.all([tabA.A.token(), tabB.A.token()]);
  assert.equal(f.calls.length, 1, "a refresh token works once: exactly one POST across tabs");
  assert.equal(a, b);
  assert.equal(JSON.parse(ls.getItem("osu_account")).refresh, "refresh-4");
});

test("fetchProfile: exact request, cached in the session, displayName pads the tag", async () => {
  const f = makeFetch(c => c.url.includes("/rest/v1/profiles") ? { status: 200, body: [{ id: SUB, username: "Kyetistic", tag: 42, elo: 1000, created_at: "2026-01-01", email: "x@y.z" }] } : { status: 500, body: {} });
  const env = makeEnv({ fetch: f });
  seedSession(env);
  const p = await env.A.fetchProfile();
  assert.deepEqual(p, { id: SUB, username: "Kyetistic", tag: 42, elo: 1000, created_at: "2026-01-01" });
  const c = f.calls[0];
  assert.equal(c.method, "GET");
  assert.equal(c.url, "https://gnufjvqwynxmudpgrded.supabase.co/rest/v1/profiles?select=id,username,tag,elo,created_at&id=eq." + SUB);
  assert.equal(c.headers.apikey, KEY);
  assert.equal(c.headers.Authorization, "Bearer " + JSON.parse(env.ls.getItem("osu_account")).access);
  assert.deepEqual(env.A.profile(), p);
  assert.equal(env.A.displayName(p), "Kyetistic#0042");
  assert.equal(env.A.displayName({ username: "A", tag: 1972 }), "A#1972");
  assert.equal(env.A.displayName(null), "");
});

test("fetchProfile after a 401: one refresh, one retry; if still refused the session ends", async () => {
  let n = 0;
  const f = makeFetch(c => {
    if (c.url === TOKEN_URL) return { status: 200, body: tokenReply(5) };
    n++; return n === 1 ? { status: 401, body: {} } : { status: 200, body: [{ id: SUB, username: "U", tag: 5, elo: 1, created_at: "x" }] };
  });
  const env = makeEnv({ fetch: f });
  seedSession(env);
  assert.equal((await env.A.fetchProfile()).username, "U");
  assert.deepEqual(f.calls.map(c => c.url === TOKEN_URL ? "token" : "profile"), ["profile", "token", "profile"]);
  const f2 = makeFetch(c => c.url === TOKEN_URL ? { status: 200, body: tokenReply(6) } : { status: 401, body: {} });
  const e2 = makeEnv({ fetch: f2 }); seedSession(e2);
  assert.equal(await e2.A.fetchProfile(), null);
  assert.equal(e2.A.signedIn(), false);
});

test("fetchProfile: server error rejects but keeps the session", async () => {
  const env = makeEnv({ fetch: makeFetch(() => ({ status: 500, body: {} })) });
  seedSession(env);
  await assert.rejects(env.A.fetchProfile());
  assert.equal(env.A.signedIn(), true);
});

test("myMastery: exact RPC request, rows checked and sorted by total", async () => {
  const f = makeFetch(c => c.url.endsWith("/rest/v1/rpc/my_opensmash_mastery") ? { status: 200, body: [
    { fighter: "mario", points: 120, veteran: 1000, total: 1120, games: 3, wins: 1, updated_at: "x", points_opensmash: 100, points_arena: "20" },
    { fighter: "pzenigame", points: "2400", veteran: 0, total: 2400, games: 30 },
    { fighter: "<b>", points: 5 }, null, { fighter: "fox", points: -4, veteran: null, games: 1 }] } : { status: 500, body: {} });
  const env = makeEnv({ fetch: f });
  seedSession(env);
  const rows = await env.A.myMastery();
  assert.deepEqual(rows, [
    { fighter: "pzenigame", points: 2400, veteran: 0, total: 2400, games: 30, wins: 0, updated_at: null, points_opensmash: null, points_arena: null },
    { fighter: "mario", points: 120, veteran: 1000, total: 1120, games: 3, wins: 1, updated_at: "x", points_opensmash: 100, points_arena: 20 },
    { fighter: "fox", points: 0, veteran: 0, total: 0, games: 1, wins: 0, updated_at: null, points_opensmash: null, points_arena: null }]);
  const c = f.calls[0];
  assert.equal(f.calls.length, 1);
  assert.equal(c.method, "POST");
  assert.equal(c.url, "https://gnufjvqwynxmudpgrded.supabase.co/rest/v1/rpc/my_opensmash_mastery");
  assert.equal(c.body, "{}");
  assert.equal(c.headers.apikey, KEY);
  assert.equal(c.headers["Content-Type"], "application/json");
  assert.equal(c.headers.Authorization, "Bearer " + JSON.parse(env.ls.getItem("osu_account")).access);
});

test("myMastery: signed out -> null without a request; 404 (not deployed) -> .missing; 401 twice ends the session", async () => {
  const f0 = makeFetch(() => ({ status: 200, body: [] }));
  const e0 = makeEnv({ fetch: f0 });
  assert.equal(await e0.A.myMastery(), null);
  assert.equal(f0.calls.length, 0);
  const e1 = makeEnv({ fetch: makeFetch(() => ({ status: 404, body: { code: "PGRST202" } })) });
  seedSession(e1);
  await assert.rejects(e1.A.myMastery(), e => e.missing === true);
  assert.equal(e1.A.signedIn(), true);
  const f2 = makeFetch(c => c.url === TOKEN_URL ? { status: 200, body: tokenReply(7) } : { status: 401, body: {} });
  const e2 = makeEnv({ fetch: f2 }); seedSession(e2);
  assert.equal(await e2.A.myMastery(), null);
  assert.deepEqual(f2.calls.map(c => c.url === TOKEN_URL ? "token" : "rpc"), ["rpc", "token", "rpc"]);
  assert.equal(e2.A.signedIn(), false);
});

test("masteryBoard: anonymous RPC (publishable key only), exact body, rows checked, total_count read", async () => {
  const f = makeFetch(c => c.url.endsWith("/rest/v1/rpc/opensmash_mastery_board") ? { status: 200, body: [
    { pos: 51, id: "0123456789abcdef", name: "Nelly", tag: 7, avatar: null, main_fighter: "pzenigame", total: "3300", games: 12, total_count: 140 },
    { pos: 52, id: "fedcba9876543210", name: null, tag: 9, avatar: null, main_fighter: "<b>", total: 3000, games: 9, total_count: 140 },
    { pos: 53, id: "not-an-id", name: "x", total: 1 }, null, { pos: 0, id: "aaaaaaaaaaaaaaaa", total: 5 }] } : { status: 500, body: {} });
  const env = makeEnv({ fetch: f });
  seedSession(env); // signed in or not, the board is read without the player's token
  const res = await env.A.masteryBoard("mario", 50, 50);
  assert.deepEqual(res, { count: 140, rows: [
    { pos: 51, id: "0123456789abcdef", name: "Nelly", tag: 7, main_fighter: "pzenigame", total: 3300, games: 12 },
    { pos: 52, id: "fedcba9876543210", name: null, tag: 9, main_fighter: null, total: 3000, games: 9 }] });
  const c = f.calls[0];
  assert.equal(f.calls.length, 1);
  assert.equal(c.method, "POST");
  assert.equal(c.url, "https://gnufjvqwynxmudpgrded.supabase.co/rest/v1/rpc/opensmash_mastery_board");
  assert.deepEqual(JSON.parse(c.body), { p_fighter: "mario", p_limit: 50, p_offset: 50 });
  assert.equal(c.headers.apikey, KEY);
  assert.equal(c.headers.Authorization, undefined);
  await env.A.masteryBoard("<script>", 5000, -3);
  assert.deepEqual(JSON.parse(f.calls[1].body), { p_fighter: null, p_limit: 100, p_offset: 0 });
  const e404 = makeEnv({ fetch: makeFetch(() => ({ status: 404, body: {} })) });
  await assert.rejects(e404.A.masteryBoard(null, 50, 0), e => e.missing === true);
  const empty = await makeEnv({ fetch: makeFetch(() => ({ status: 200, body: [] })) }).A.masteryBoard(null, 50, 200);
  assert.deepEqual(empty, { rows: [], count: null });
});

test("myMasteryRank: authed RPC, one row (array or object), null without points or signed out", async () => {
  const f = makeFetch(c => c.url.endsWith("/rest/v1/rpc/my_opensmash_mastery_rank") ? { status: 200, body: [
    { pos: "23", id: "0123456789abcdef", total: 8930, total_count: 111, main_fighter: "mario" }] } : { status: 500, body: {} });
  const env = makeEnv({ fetch: f });
  seedSession(env);
  assert.deepEqual(await env.A.myMasteryRank(), { pos: 23, id: "0123456789abcdef", total: 8930, total_count: 111, main_fighter: "mario" });
  assert.equal(f.calls[0].method, "POST");
  assert.equal(f.calls[0].headers.Authorization, "Bearer " + JSON.parse(env.ls.getItem("osu_account")).access);
  const e1 = makeEnv({ fetch: makeFetch(() => ({ status: 200, body: [] })) }); seedSession(e1);
  assert.equal(await e1.A.myMasteryRank(), null);
  const e2 = makeEnv({ fetch: makeFetch(() => ({ status: 200, body: { pos: 2, id: "0123456789abcdef", total: 5, total_count: null, main_fighter: null } })) }); seedSession(e2);
  assert.deepEqual(await e2.A.myMasteryRank(), { pos: 2, id: "0123456789abcdef", total: 5, total_count: null, main_fighter: null });
  const f0 = makeFetch(() => ({ status: 200, body: [] }));
  assert.equal(await makeEnv({ fetch: f0 }).A.myMasteryRank(), null);
  assert.equal(f0.calls.length, 0);
});

test("signOut is local only: no request, session and pending gone, event fired", async () => {
  const f = makeFetch(() => ({ status: 200, body: {} }));
  const env = makeEnv({ fetch: f });
  seedSession(env);
  env.ss.setItem("osu_account_pending", "{}");
  env.A.signOut();
  assert.equal(f.calls.length, 0);
  assert.equal(env.A.signedIn(), false);
  assert.equal(env.ls.m.size, 0);
  assert.equal(env.ss.m.size, 0);
  assert.ok(env.events.includes("osu-account"));
});

test("links to the central site and KEY", () => {
  const A = makeEnv().A;
  assert.equal(A.KEY, "osu_account");
  assert.equal(A.manageUrl, "https://account.opensmashultimate.com/account");
  assert.equal(A.signInLink(""), "https://account.opensmashultimate.com/login?return_to=" + encodeURIComponent("https://denkishi.github.io/opensmash-site/"));
  assert.equal(A.signUpLink("account/", true), "https://account.opensmashultimate.com/signup?return_to=" + encodeURIComponent("https://denkishi.github.io/opensmash-site/account/?signin=1"));
  assert.equal(A.signUpLink("account/", false), "https://account.opensmashultimate.com/signup?return_to=" + encodeURIComponent("https://denkishi.github.io/opensmash-site/account/"));
  assert.equal(A.signInLink("https://evil.example/"), A.signInLink(""));
});

test("localhost uses its own redirect URI", async () => {
  const env = makeEnv({ hostname: "localhost", origin: "http://localhost:8000" });
  const u = await signInStart(env, "");
  assert.equal(u.searchParams.get("redirect_uri"), "http://localhost:8000/auth/callback/");
});

test("repository has no service_role / sb_secret / client_secret and no third-party script", () => {
  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === ".git" || e.name === "node_modules") continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else if (/\.(html|js|cjs|css|md|json|yml|py|sh|txt)$/.test(e.name) && e.name !== "opensmash-auth.test.cjs") files.push(p);
    }
  })(ROOT);
  for (const p of files) {
    const s = fs.readFileSync(p, "utf8");
    for (const bad of ["service_role", "sb_secret", "client_secret"]) assert.ok(!s.includes(bad), p + " contains " + bad);
  }
  for (const p of ["auth/callback/index.html"].map(x => path.join(ROOT, x))) {
    const s = fs.readFileSync(p, "utf8");
    assert.ok(/<meta name="referrer" content="no-referrer">/.test(s) && /<meta name="robots" content="noindex">/.test(s));
    for (const m of s.matchAll(/<script[^>]+src="([^"]+)"/g)) assert.ok(m[1].startsWith("../../js/"), "callback loads only own scripts: " + m[1]);
  }
});

(async () => {
  let fail = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log("ok   " + name); }
    catch (e) { fail++; console.log("FAIL " + name + "\n     " + (e && e.stack || e)); }
  }
  console.log(fail ? fail + " of " + tests.length + " failed" : "all " + tests.length + " passed");
  process.exit(fail ? 1 : 0);
})();
