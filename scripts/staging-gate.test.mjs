// Automated tests for the staging gate. Run: node --test scripts/
// Uses only synthetic credentials generated per run.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createGateServer, captureInProcessServer, LoginLimiter, signSession, verifySession, COOKIE } from "./staging-gate-lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const USER = "synthetic-tester";
const PASS = randomBytes(18).toString("hex");
const SECRET = randomBytes(32).toString("hex");

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

// Fake in-process app that records what it received.
const seen = [];
const echoApp = {
  ready: Promise.resolve(),
  dispatch: (req, res) => {
    seen.push({ headers: { ...req.headers }, raw: [...req.rawHeaders] });
    res.writeHead(200, { "content-type": "application/json", "set-cookie": "app_cookie=1; Path=/" });
    res.end(JSON.stringify({ ok: true, url: req.url }));
  },
};

let clock = Date.now();
const logs = [];
function makeGate(overrides = {}) {
  const srv = createGateServer({
    user: USER,
    pass: PASS,
    sessionSecret: SECRET,
    ttlSec: 600,
    app: echoApp,
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

test("correct login -> 200, session cookie flags, app cookie preserved, credentials not forwarded", async () => {
  const r = await request(gatePort, { headers: basic(USER, PASS) });
  assert.equal(r.status, 200);
  const sc = [].concat(r.headers["set-cookie"]).find((c) => c.startsWith(`${COOKIE}=`));
  assert.match(sc, /HttpOnly/);
  assert.match(sc, /SameSite=Lax/);
  assert.match(sc, /Max-Age=600/);
  assert.ok([].concat(r.headers["set-cookie"]).some((c) => c.startsWith("app_cookie=")), "app Set-Cookie kept");
  assert.equal(r.headers["x-robots-tag"], "noindex, nofollow");
  const got = seen.at(-1);
  assert.equal(got.headers.authorization, undefined, "Basic credentials must not reach the app");
  assert.ok(!got.raw.map((x) => x.toLowerCase()).includes("authorization"), "not in rawHeaders either");
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

test("app throws -> 502 (gate stays up)", async () => {
  const port = await makeGate({ app: { ready: Promise.resolve(), dispatch: () => { throw new Error("boom"); } } });
  const r = await request(port, { headers: basic(USER, PASS) });
  assert.equal(r.status, 502);
  assert.equal((await request(gatePort)).status, 401, "gate keeps serving");
});

test("app hangs -> 504 timeout", async () => {
  const port = await makeGate({ app: { ready: Promise.resolve(), dispatch: () => {} }, appTimeoutMs: 300 });
  const r = await request(port, { headers: basic(USER, PASS) });
  assert.equal(r.status, 504);
});

test("cold start: request waits for app readiness, then 200", async () => {
  let markReady;
  const ready = new Promise((r) => (markReady = r));
  const port = await makeGate({ app: { ready, dispatch: echoApp.dispatch } });
  const pending = request(port, { headers: basic(USER, PASS) });
  setTimeout(markReady, 400);
  assert.equal((await pending).status, 200);
});

test("app never ready -> 503 after readiness timeout", async () => {
  const port = await makeGate({ app: { ready: new Promise(() => {}), dispatch: echoApp.dispatch }, readyTimeoutMs: 300 });
  assert.equal((await request(port, { headers: basic(USER, PASS) })).status, 503);
});

test("logs never contain password, session secret, tokens or Authorization values", () => {
  const all = logs.join("\n");
  for (const s of [PASS, SECRET, "app-token", Buffer.from(`${USER}:${PASS}`).toString("base64")]) {
    assert.ok(!all.includes(s), "secret leaked into logs");
  }
});

test("in-process capture: app server never opens a socket; gate is the only listener", async () => {
  const gate = http.createServer();
  await listen(gate);
  closers.push(() => new Promise((r) => gate.close(r)));
  const appServer = await captureInProcessServer(async () => {
    const s = http.createServer((req, res) => res.end("app"));
    await new Promise((r) => s.listen(4321, "127.0.0.1", r)); // would bind if not intercepted
  }, { except: gate });
  assert.equal(appServer.listening, false, "captured app server must not be listening");
  const probe = await new Promise((resolve) => {
    const rq = http.request({ host: "127.0.0.1", port: 4321, path: "/" }, () => resolve("open"));
    rq.on("error", () => resolve("closed"));
    rq.end();
  });
  assert.equal(probe, "closed", "no inner port to bypass the gate");
  // listen() is restored for everything else afterwards
  const other = http.createServer();
  await listen(other);
  assert.equal(other.listening, true);
  other.close();
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
