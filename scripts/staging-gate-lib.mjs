// Private staging access gate for the Hostinger Node build.
//
// Puts HTTP Basic login + signed, expiring sessions in front of the Nitro
// server. Fails closed: it refuses to start without its secrets.
//
//   STAGING_GATE_USER            login name
//   STAGING_GATE_PASS            login password (>= 16 chars)
//   STAGING_GATE_SESSION_SECRET  HMAC key for session cookies (>= 32 chars,
//                                independent of the password)
//   STAGING_GATE_SESSION_TTL     session lifetime in seconds (default 43200)
//   PORT / HOST                  public listener (Hostinger sets PORT)
//
// The Nitro server is started as a child process bound to 127.0.0.1 on an
// ephemeral port and preloaded with staging-gate-inner.mjs, which rejects any
// request that does not carry a per-boot secret only the gate knows. Hitting
// the inner port directly therefore returns 403.
//
// Nothing secret is ever logged: no passwords, Authorization headers,
// cookies, session tokens or query strings.
import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { existsSync } from "node:fs";

export const COOKIE = "iep_gate";
export const INNER_HEADER = "x-iep-gate-inner";

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

const b64u = (buf) => Buffer.from(buf).toString("base64url");

export function signSession(secret, { now = Date.now(), ttlSec }) {
  const payload = b64u(JSON.stringify({ v: 1, exp: Math.floor(now / 1000) + ttlSec, n: b64u(randomBytes(12)) }));
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifySession(secret, token, { now = Date.now() } = {}) {
  if (typeof token !== "string" || token.length > 512) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  if (!safeEqual(sig, expected)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return data.v === 1 && Number.isInteger(data.exp) && data.exp > Math.floor(now / 1000);
  } catch {
    return false;
  }
}

function readCookie(header, name) {
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

function stripCookie(header, name) {
  const kept = String(header || "")
    .split(";")
    .map((p) => p.trim())
    .filter((p) => p && p.split("=")[0].trim() !== name);
  return kept.length ? kept.join("; ") : undefined;
}

/** Fixed-window failed-login limiter, per client and global. */
export class LoginLimiter {
  constructor({ perClient = 5, global = 50, windowMs = 15 * 60 * 1000, now = () => Date.now() } = {}) {
    Object.assign(this, { perClient, global, windowMs, now });
    this.clients = new Map();
    this.globalHits = [];
  }
  #prune(list) {
    const cutoff = this.now() - this.windowMs;
    while (list.length && list[0] <= cutoff) list.shift();
    return list;
  }
  blocked(client) {
    const mine = this.#prune(this.clients.get(client) || []);
    return mine.length >= this.perClient || this.#prune(this.globalHits).length >= this.global;
  }
  fail(client) {
    const t = this.now();
    const mine = this.clients.get(client) || [];
    mine.push(t);
    this.clients.set(client, mine);
    this.globalHits.push(t);
    if (this.clients.size > 10_000) this.clients.clear(); // memory guard
  }
  succeed(client) {
    this.clients.delete(client);
  }
}

export function createGateServer({
  user,
  pass,
  sessionSecret,
  ttlSec = 43200,
  upstream, // { host, port }
  innerSecret,
  limiter = new LoginLimiter(),
  upstreamTimeoutMs = 120_000,
  readyTimeoutMs = 45_000,
  now = () => Date.now(),
  log = (msg) => console.log(`[staging-gate] ${msg}`),
  secureCookie = true,
}) {
  const expectedBasic = `${user}:${pass}`;

  function basicCredentials(req) {
    const h = req.headers.authorization || "";
    if (!h.startsWith("Basic ")) return null;
    return Buffer.from(h.slice(6), "base64").toString();
  }

  function deny(res, status, body, extra = {}) {
    res.writeHead(status, {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
      ...extra,
    });
    res.end(body);
  }

  return http.createServer((req, res) => {
    const client = req.socket.remoteAddress || "unknown";
    const sessionOk = verifySession(sessionSecret, readCookie(req.headers.cookie, COOKIE), { now: now() });
    const creds = sessionOk ? null : basicCredentials(req);
    let issueSession = false;

    if (!sessionOk) {
      if (limiter.blocked(client)) {
        log(`429 login throttled ${req.method}`);
        return deny(res, 429, "Too many attempts. Try again later.", { "retry-after": "900" });
      }
      if (creds === null) {
        return deny(res, 401, "Authentication required", { "www-authenticate": 'Basic realm="iep-staging", charset="UTF-8"' });
      }
      if (!safeEqual(creds, expectedBasic)) {
        limiter.fail(client);
        log(`401 failed login ${req.method}`);
        return deny(res, 401, "Authentication required", { "www-authenticate": 'Basic realm="iep-staging", charset="UTF-8"' });
      }
      limiter.succeed(client);
      issueSession = true;
      log("login ok, session issued");
    }

    const headers = { ...req.headers };
    delete headers[INNER_HEADER];
    if (creds !== null) delete headers.authorization; // never forward gate credentials
    const cookie = stripCookie(headers.cookie, COOKIE);
    if (cookie) headers.cookie = cookie;
    else delete headers.cookie;
    headers[INNER_HEADER] = innerSecret;

    let done = false;
    const fail = (status, body) => {
      if (done) return;
      done = true;
      if (res.headersSent) return res.destroy();
      deny(res, status, body);
    };

    // Hosts may cold-start the process on the first request: hold the request
    // (body stays buffered) until Nitro accepts connections, instead of 502.
    const proceed = () => {
    if (!upstream.port) return fail(503, "Starting, try again shortly");
    const p = http.request(
      { host: upstream.host, port: upstream.port, path: req.url, method: req.method, headers, timeout: upstreamTimeoutMs },
      (r) => {
        const out = { ...r.headers, "x-robots-tag": "noindex, nofollow" };
        if (issueSession) {
          const flags = `Path=/; HttpOnly; SameSite=Lax; Max-Age=${ttlSec}${secureCookie ? "; Secure" : ""}`;
          const c = `${COOKIE}=${signSession(sessionSecret, { now: now(), ttlSec })}; ${flags}`;
          out["set-cookie"] = [].concat(r.headers["set-cookie"] || [], c);
        }
        done = true;
        res.writeHead(r.statusCode || 502, out);
        r.pipe(res);
        r.on("error", () => res.destroy());
      },
    );
    p.on("timeout", () => {
      p.destroy();
      log(`504 upstream timeout ${req.method}`);
      fail(504, "Upstream timeout");
    });
    p.on("error", () => {
      log(`502 upstream unavailable ${req.method}`);
      fail(502, "Upstream unavailable");
    });
    req.on("aborted", () => p.destroy());
    req.pipe(p);
    };
    if (!upstream.ready) return proceed();
    let timer;
    Promise.race([
      upstream.ready,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("ready timeout")), readyTimeoutMs); }),
    ]).then(
      () => { clearTimeout(timer); proceed(); },
      () => { clearTimeout(timer); log(`503 app not ready ${req.method}`); fail(503, "Starting, try again shortly"); },
    );
  });
}

/** Resolve once something accepts TCP connections on host:port. */
export function waitForPort(host, port, { intervalMs = 150, timeoutMs = 60_000, isDead = () => false } = {}) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      if (isDead()) return reject(new Error("app exited"));
      const sock = net.connect({ host, port });
      sock.once("connect", () => { sock.destroy(); resolve(); });
      sock.once("error", () => {
        sock.destroy();
        if (Date.now() - started > timeoutMs) return reject(new Error("app did not start"));
        setTimeout(attempt, intervalMs);
      });
    };
    attempt();
  });
}

/**
 * Nitro entry next to the gate. Two layouts are supported:
 *   repo checkout:     scripts/staging-gate.mjs  -> ../.output/server/index.mjs
 *   Hostinger bundle:  staging-gate.mjs          -> app/server/index.mjs
 */
export function resolveAppEntry(here) {
  for (const candidate of [path.join(here, "app/server/index.mjs"), path.join(here, "../.output/server/index.mjs")]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });
}

/**
 * Start the gate. Called unconditionally by staging-gate.mjs (the entry file):
 * Hostinger loads the entry through its own wrapper, so an
 * "is this the main module?" guard would never fire.
 *
 * The public listener is bound FIRST (hosts may require listen() within a few
 * seconds and may hand over PORT as a socket path); Nitro starts afterwards.
 */
export async function main() {
  const user = process.env.STAGING_GATE_USER;
  const pass = process.env.STAGING_GATE_PASS;
  const sessionSecret = process.env.STAGING_GATE_SESSION_SECRET;
  const ttlSec = Number(process.env.STAGING_GATE_SESSION_TTL || 43200);
  const problems = [];
  if (!user) problems.push("STAGING_GATE_USER missing");
  if (!pass || pass.length < 16) problems.push("STAGING_GATE_PASS missing or < 16 chars");
  if (!sessionSecret || sessionSecret.length < 32) problems.push("STAGING_GATE_SESSION_SECRET missing or < 32 chars");
  if (sessionSecret && pass && sessionSecret === pass) problems.push("session secret must differ from password");
  if (!Number.isInteger(ttlSec) || ttlSec < 60 || ttlSec > 7 * 86400) problems.push("STAGING_GATE_SESSION_TTL out of range");
  if (problems.length) {
    console.error(`[staging-gate] refusing to start: ${problems.join("; ")}`);
    process.exit(1);
  }

  const here = path.dirname(fileURLToPath(import.meta.url));
  const appEntry = resolveAppEntry(here);
  if (!appEntry) {
    console.error("[staging-gate] refusing to start: Nitro entry not found (app/server/index.mjs or ../.output/server/index.mjs)");
    process.exit(1);
  }
  const innerSecret = randomBytes(32).toString("hex");
  // Requests that arrive before Nitro is up wait on `ready` (see createGateServer).
  let markReady, markFailed;
  const upstream = { host: "127.0.0.1", port: 0, ready: new Promise((res, rej) => { markReady = res; markFailed = rej; }) };
  upstream.ready.catch(() => {});

  // 1. Public listener first.
  const server = createGateServer({ user, pass, sessionSecret, ttlSec, upstream, innerSecret });
  const rawPort = process.env.PORT || "3000";
  const numeric = /^\d+$/.test(rawPort);
  const onListen = () =>
    console.log(`[staging-gate] listening (${numeric ? `port ${rawPort}` : "host-provided socket"})`);
  if (numeric) server.listen(Number(rawPort), process.env.HOST || "0.0.0.0", onListen);
  else server.listen(rawPort, onListen);

  // 2. Then Nitro on a private loopback port.
  const innerPort = await freePort();
  upstream.port = innerPort;
  const childEnv = { ...process.env, PORT: String(innerPort), HOST: "127.0.0.1", NITRO_PORT: String(innerPort), NITRO_HOST: "127.0.0.1" };
  delete childEnv.STAGING_GATE_PASS;
  delete childEnv.STAGING_GATE_SESSION_SECRET;
  // Host loaders injected via NODE_OPTIONS can hijack listen() in the child too.
  if (childEnv.NODE_OPTIONS) console.log("[staging-gate] NODE_OPTIONS present; not passed to the app process");
  delete childEnv.NODE_OPTIONS;
  childEnv.STAGING_GATE_INNER_SECRET = innerSecret;

  const app = spawn(process.execPath, ["--import", path.join(here, "staging-gate-inner.mjs"), appEntry], {
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  // Re-emit app output through the gate process so the host's log view shows it.
  for (const [stream, write] of [[app.stdout, (l) => console.log(l)], [app.stderr, (l) => console.error(l)]]) {
    let buf = "";
    stream.on("data", (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) { write(`[app] ${buf.slice(0, i)}`); buf = buf.slice(i + 1); }
    });
  }
  let dead = false;
  const startedAt = Date.now();
  waitForPort("127.0.0.1", innerPort, { isDead: () => dead }).then(
    () => { console.log(`[staging-gate] app ready in ${Date.now() - startedAt}ms`); markReady(); },
    (e) => { console.error(`[staging-gate] app not ready: ${e.message}`); markFailed(e); },
  );
  app.on("exit", (code, signal) => {
    dead = true;
    console.error(`[staging-gate] app exited (${code ?? signal}); stopping gate`);
    process.exit(code || 1);
  });
  for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => app.kill(sig));
  return server;
}
