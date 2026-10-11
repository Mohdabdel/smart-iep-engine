// Private staging access gate for the Hostinger Node build.
//
// Puts HTTP Basic login + signed, expiring sessions in front of the Nitro
// app. Fails closed: it refuses to start without its secrets.
//
//   STAGING_GATE_USER            login name
//   STAGING_GATE_PASS            login password (>= 16 chars)
//   STAGING_GATE_SESSION_SECRET  HMAC key for session cookies (>= 32 chars,
//                                independent of the password)
//   STAGING_GATE_SESSION_TTL     session lifetime in seconds (default 43200)
//   PORT / HOST                  public listener (host-provided port or socket)
//
// Nitro runs IN THE SAME PROCESS. Its server's listen() is intercepted so it
// never opens a socket; the gate hands authenticated requests straight to
// Nitro's request handler. There is no inner port at all, so nothing can
// bypass the gate (and it works on hosts that isolate loopback TCP between
// processes, which is what broke the earlier child-process design).
//
// Nothing secret is ever logged: no passwords, Authorization headers,
// cookies, session tokens or query strings.
import http from "node:http";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { existsSync } from "node:fs";

export const COOKIE = "iep_gate";

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

/** Replace/remove a header in both req.headers and req.rawHeaders. */
function setRequestHeader(req, name, value) {
  const lower = name.toLowerCase();
  if (value === undefined) delete req.headers[lower];
  else req.headers[lower] = value;
  const raw = req.rawHeaders;
  for (let i = raw.length - 2; i >= 0; i -= 2) if (raw[i].toLowerCase() === lower) raw.splice(i, 2);
  if (value !== undefined) raw.push(name, value);
}

/** Make every response carry noindex and (optionally) the new session cookie. */
function decorateResponse(res, extraCookie) {
  res.setHeader("x-robots-tag", "noindex, nofollow");
  if (!extraCookie) return;
  const origWriteHead = res.writeHead;
  const addCookie = () => {
    const cur = res.getHeader("set-cookie");
    res.setHeader("set-cookie", [].concat(cur || [], extraCookie));
  };
  res.writeHead = function (status, ...rest) {
    // Fold headers passed to writeHead into setHeader so our cookie merges.
    let headers = rest[rest.length - 1];
    if (headers && typeof headers === "object") {
      rest.pop();
      if (Array.isArray(headers)) {
        const pairs = Array.isArray(headers[0]) ? headers : headers.reduce((a, v, i) => (i % 2 ? a : [...a, [v, headers[i + 1]]]), []);
        for (const [k, v] of pairs) {
          if (String(k).toLowerCase() === "set-cookie") res.appendHeader ? res.appendHeader(k, v) : res.setHeader(k, [].concat(res.getHeader(k) || [], v));
          else res.setHeader(k, v);
        }
      } else {
        for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
      }
    }
    addCookie();
    res.setHeader("x-robots-tag", "noindex, nofollow");
    return origWriteHead.call(this, status, ...rest);
  };
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

/**
 * @param app {{ ready: Promise<void>, dispatch: (req, res) => void }}
 *   ready resolves when the in-process app is loaded; dispatch hands a
 *   request to it. Requests wait for `ready` (cold start), up to readyTimeoutMs.
 */
export function createGateServer({
  user,
  pass,
  sessionSecret,
  ttlSec = 43200,
  app,
  limiter = new LoginLimiter(),
  appTimeoutMs = 180_000,
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
    if (res.headersSent) return res.destroy();
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

    // Never pass gate credentials or the gate cookie to the app.
    if (creds !== null) setRequestHeader(req, "Authorization", undefined);
    setRequestHeader(req, "Cookie", stripCookie(req.headers.cookie, COOKIE));

    const cookie = issueSession
      ? `${COOKIE}=${signSession(sessionSecret, { now: now(), ttlSec })}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ttlSec}${secureCookie ? "; Secure" : ""}`
      : null;

    let timer;
    const go = () => {
      clearTimeout(timer);
      decorateResponse(res, cookie);
      const t = setTimeout(() => {
        log(`504 app timeout ${req.method}`);
        deny(res, 504, "App timeout");
      }, appTimeoutMs);
      res.on("finish", () => clearTimeout(t));
      res.on("close", () => clearTimeout(t));
      try {
        app.dispatch(req, res);
      } catch {
        clearTimeout(t);
        log(`502 app error ${req.method}`);
        deny(res, 502, "App error");
      }
    };
    Promise.race([
      app.ready,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("ready timeout")), readyTimeoutMs);
      }),
    ]).then(go, () => {
      clearTimeout(timer);
      log(`503 app not ready ${req.method}`);
      deny(res, 503, "Starting, try again shortly");
    });
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

/**
 * Load a Node server entry in-process without letting it open a socket.
 * The first http.Server that calls listen() (other than `except`) is captured.
 */
export function captureInProcessServer(importEntry, { except } = {}) {
  const origListen = http.Server.prototype.listen;
  let resolveServer, rejectServer;
  const captured = new Promise((res, rej) => { resolveServer = res; rejectServer = rej; });
  let done = false;
  http.Server.prototype.listen = function (...args) {
    if (done || this === except) return origListen.apply(this, args);
    done = true;
    http.Server.prototype.listen = origListen;
    // Report a plausible address to frameworks that print it after listen().
    this.address = () => ({ address: "in-process", family: "IPv4", port: 0 });
    const cb = args.find((a) => typeof a === "function");
    setImmediate(() => {
      this.emit("listening");
      if (cb) cb();
    });
    resolveServer(this);
    return this;
  };
  Promise.resolve()
    .then(importEntry)
    .catch((e) => {
      http.Server.prototype.listen = origListen;
      rejectServer(e);
    });
  return captured;
}

/**
 * Start the gate. Called unconditionally by staging-gate.mjs (the entry file):
 * hosts load the entry through their own wrapper, so an "is this the main
 * module?" guard would never fire. The public listener is bound FIRST.
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
  // The app shares this process: keep gate secrets out of its environment.
  delete process.env.STAGING_GATE_PASS;
  delete process.env.STAGING_GATE_SESSION_SECRET;

  const here = path.dirname(fileURLToPath(import.meta.url));
  const appEntry = resolveAppEntry(here);
  if (!appEntry) {
    console.error("[staging-gate] refusing to start: Nitro entry not found (app/server/index.mjs or ../.output/server/index.mjs)");
    process.exit(1);
  }

  let markReady, markFailed;
  const ready = new Promise((res, rej) => { markReady = res; markFailed = rej; });
  ready.catch(() => {});
  let appServer = null;
  const app = { ready, dispatch: (req, res) => appServer.emit("request", req, res) };

  // 1. Public listener first.
  const server = createGateServer({ user, pass, sessionSecret, ttlSec, app });
  const rawPort = process.env.PORT || "3000";
  const numeric = /^\d+$/.test(rawPort);
  const onListen = () => console.log(`[staging-gate] listening (${numeric ? `port ${rawPort}` : "host-provided socket"})`);
  if (numeric) server.listen(Number(rawPort), process.env.HOST || "0.0.0.0", onListen);
  else server.listen(rawPort, onListen);

  // Always exit on host stop/restart signals. The in-process app may try a
  // graceful close of a server that never listened; don't let that hang.
  for (const sig of ["SIGTERM", "SIGINT"]) {
    process.once(sig, () => {
      server.close();
      setTimeout(() => process.exit(0), 2000).unref();
    });
  }

  // 2. Load Nitro in-process; it never binds a socket.
  const startedAt = Date.now();
  const savedPort = process.env.PORT;
  process.env.PORT = "0"; // Nitro reads PORT at import; its listen() is intercepted anyway
  captureInProcessServer(() => import(pathToFileURL(appEntry).href), { except: server }).then(
    (s) => {
      if (savedPort === undefined) delete process.env.PORT;
      else process.env.PORT = savedPort;
      appServer = s;
      console.log(`[staging-gate] app loaded in-process in ${Date.now() - startedAt}ms`);
      markReady();
    },
    (e) => {
      console.error(`[staging-gate] app failed to load: ${e && e.message}`);
      markFailed(e);
    },
  );
  return server;
}
