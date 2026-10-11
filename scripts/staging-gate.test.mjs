// Automated tests for the staging gate. Run: node --test scripts/
// Uses only synthetic credentials generated per run.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createGateServer, LoginLimiter, signSession, verifySession, COOKIE, INNER_HEADER } from "./staging-gate.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const USER = "synthetic-tester";
const PASS = randomBytes(18).toString("hex");
const SECRET = randomBytes(32).toString("hex");
const INNER = randomBytes(32).toString("hex");

const listen = (srv) => new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv.address().port)));
const closers = [];
after(() => Promise.all(closers.map((c) => c())));

function request(port, { method = "GET", path: p = "/", headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path: p, headers }, (res) => {
      let body = "";
      res.on("data", (d) => (body += d));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.end();
  });
}
const basic = (u, p) => ({ authorization: "Basic " + Buffer.from(`${u}:${p}`).toString("base64") });

// Fake upstream that echoes what it received.
const seen = [];
const upstream = http.createServer((req, res) => {
  seen.push({ headers: req.headers, raw: req.rawHeaders });
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: true, url: req.url }));
});
const upstreamPort = await listen(upstream);
closers.push(() => new Promise((r) => upstream.close(r)));

let clock = Date.now();
const logs = [];
function makeGate(overrides = {}) {
  const srv = createGateServer({
    user: USER,
    pass: PASS,
    sessionSecret: SECRET,
    ttlSec: 600,
    upstream: { host: "127.0.0.1", port: upstreamPort },
    innerSecret: INNER,
    now: () => clock,
    log: (m) => logs.push(m),
    secureCookie: false,
    ...overrides,
  });
  closers.push(() => new Promise((r) => srv.close(r)));
  return listen(srv);
}
const gatePort = await makeGate();

function sessionFrom(res) {
  const sc = [].concat(res.headers["set-cookie"] || []).find((c) => c.startsWith(`${COOKIE}=`));
  return sc ? sc.split(";")[0] : null;
}

test("no credentials -> 401 with Basic challenge, upstream not reached", async () => {
  const before = seen.length;
  const r = await request(gatePort);
  assert.equal(r.status, 401);
  assert.match(r.headers["www-authenticate"], /^Basic /);
  assert.equal(r.headers["x-robots-tag"], "noindex, nofollow");
  assert.equal(seen.length, before);
});

test("wrong password -> 401", async () => {
  const r = await request(gatePort, { headers: basic(USER, "wrong-" + PASS) });
  assert.equal(r.status, 401);
  assert.equal(sessionFrom(r), null);
});

test("correct login -> 200, session cookie flags, credentials and inner secret handled", async () => {
  const r = await request(gatePort, { headers: { ...basic(USER, PASS), [INNER_HEADER]: "client-forged" } });
  assert.equal(r.status, 200);
  const sc = [].concat(r.headers["set-cookie"]).find((c) => c.startsWith(`${COOKIE}=`));
  assert.match(sc, /HttpOnly/);
  assert.match(sc, /SameSite=Lax/);
  assert.match(sc, /Max-Age=600/);
  const got = seen.at(-1).headers;
  assert.equal(got.authorization, undefined, "Basic credentials must not reach the app");
  assert.equal(got[INNER_HEADER], INNER, "client-supplied inner header must be replaced");
});

test("valid session -> 200 and app Bearer header passes through; gate cookie stripped", async () => {
  const login = await request(gatePort, { headers: basic(USER, PASS) });
  const cookie = sessionFrom(login);
  const r = await request(gatePort, {
    method: "POST",
    path: "/api/audit",
    headers: { cookie: `${cookie}; other=1`, authorization: "Bearer app-token" },
  });
  assert.equal(r.status, 200);
  const got = seen.at(-1).headers;
  assert.equal(got.authorization, "Bearer app-token");
  assert.equal(got.cookie, "other=1");
});

test("expired session -> 401", async () => {
  const login = await request(gatePort, { headers: basic(USER, PASS) });
  const cookie = sessionFrom(login);
  const saved = clock;
  clock += 601 * 1000;
  try {
    const r = await request(gatePort, { headers: { cookie } });
    assert.equal(r.status, 401);
  } finally {
    clock = saved;
  }
});

test("forged / tampered sessions -> 401", async () => {
  const good = signSession(SECRET, { now: clock, ttlSec: 600 });
  const [payload, sig] = good.split(".");
  const longLived = Buffer.from(JSON.stringify({ v: 1, exp: 9999999999, n: "x" })).toString("base64url");
  const forged = [
    `${longLived}.${sig}`, // payload swapped, old signature
    `${payload}.${sig.slice(0, -2)}AA`, // signature altered
    signSession("wrong-secret-" + SECRET, { now: clock, ttlSec: 600 }), // other key
    `${payload}`, // no signature
    "0".repeat(64), // old-style token
  ];
  for (const f of forged) {
    const r = await request(gatePort, { headers: { cookie: `${COOKIE}=${f}` } });
    assert.equal(r.status, 401, `forged token accepted: ${f.slice(0, 12)}`);
  }
  assert.equal(verifySession(SECRET, good, { now: clock }), true);
});

test("login throttling -> 429 after repeated failures, even with correct password", async () => {
  const port = await makeGate({ limiter: new LoginLimiter({ perClient: 3, global: 100, now: () => clock }) });
  for (let i = 0; i < 3; i++) assert.equal((await request(port, { headers: basic(USER, "nope") })).status, 401);
  const r = await request(port, { headers: basic(USER, PASS) });
  assert.equal(r.status, 429);
  assert.ok(r.headers["retry-after"]);
});

test("upstream down -> 502 (gate stays up)", async () => {
  const dead = http.createServer();
  const deadPort = await listen(dead);
  await new Promise((r) => dead.close(r));
  const port = await makeGate({ upstream: { host: "127.0.0.1", port: deadPort } });
  const r = await request(port, { headers: basic(USER, PASS) });
  assert.equal(r.status, 502);
  assert.equal((await request(gatePort)).status, 401, "gate keeps serving");
});

test("upstream hang -> 504 timeout", async () => {
  const hang = http.createServer(() => {});
  const hangPort = await listen(hang);
  closers.push(() => new Promise((r) => { hang.closeAllConnections(); hang.close(r); }));
  const port = await makeGate({ upstream: { host: "127.0.0.1", port: hangPort }, upstreamTimeoutMs: 300 });
  const r = await request(port, { headers: basic(USER, PASS) });
  assert.equal(r.status, 504);
});

test("logs never contain password, session secret, tokens or Authorization values", () => {
  const all = logs.join("\n");
  for (const s of [PASS, SECRET, INNER, "app-token", Buffer.from(`${USER}:${PASS}`).toString("base64")]) {
    assert.ok(!all.includes(s), "secret leaked into logs");
  }
});

test("inner preload: direct access to Nitro port without gate secret -> 403", async () => {
  const appCode = `
    import http from "node:http";
    const s = http.createServer((req, res) => res.end(JSON.stringify({ h: req.headers, raw: req.rawHeaders, env: !!process.env.STAGING_GATE_INNER_SECRET })));
    s.listen(0, "127.0.0.1", () => console.log("PORT=" + s.address().port));`;
  const child = spawn(process.execPath, ["--import", path.join(here, "staging-gate-inner.mjs"), "--input-type=module", "-e", appCode], {
    env: { ...process.env, STAGING_GATE_INNER_SECRET: INNER },
    stdio: ["ignore", "pipe", "inherit"],
  });
  closers.push(async () => child.kill());
  const port = await new Promise((resolve, reject) => {
    child.stdout.on("data", (d) => {
      const m = String(d).match(/PORT=(\d+)/);
      if (m) resolve(Number(m[1]));
    });
    child.on("exit", (c) => reject(new Error("child exited " + c)));
  });
  assert.equal((await request(port)).status, 403);
  assert.equal((await request(port, { headers: { [INNER_HEADER]: "x".repeat(64) } })).status, 403);
  const ok = await request(port, { headers: { [INNER_HEADER]: INNER } });
  assert.equal(ok.status, 200);
  const body = JSON.parse(ok.body);
  assert.equal(body.h[INNER_HEADER], undefined, "secret removed from headers");
  assert.ok(!body.raw.map((x) => x.toLowerCase()).includes(INNER_HEADER), "secret removed from rawHeaders");
  assert.equal(body.env, false, "secret removed from app env");
});

test("inner preload refuses to start without secret", async () => {
  const child = spawn(process.execPath, ["--import", path.join(here, "staging-gate-inner.mjs"), "-e", "setTimeout(()=>{},5000)"], {
    env: { ...process.env, STAGING_GATE_INNER_SECRET: "" },
    stdio: "ignore",
  });
  const code = await new Promise((r) => child.on("exit", r));
  assert.equal(code, 1);
});

test("gate refuses to start with missing/weak secrets", async () => {
  const cases = [
    {},
    { STAGING_GATE_USER: "u", STAGING_GATE_PASS: "short", STAGING_GATE_SESSION_SECRET: SECRET },
    { STAGING_GATE_USER: "u", STAGING_GATE_PASS: PASS, STAGING_GATE_SESSION_SECRET: "short" },
    { STAGING_GATE_USER: "u", STAGING_GATE_PASS: SECRET, STAGING_GATE_SESSION_SECRET: SECRET },
  ];
  for (const env of cases) {
    const child = spawn(process.execPath, [path.join(here, "staging-gate.mjs")], {
      env: { PATH: process.env.PATH, PORT: "0", ...env },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let err = "";
    child.stderr.on("data", (d) => (err += d));
    const code = await new Promise((r) => child.on("exit", r));
    assert.equal(code, 1);
    assert.match(err, /refusing to start/);
    for (const v of Object.values(env)) if (v.length >= 16) assert.ok(!err.includes(v), "secret echoed in error");
  }
});
