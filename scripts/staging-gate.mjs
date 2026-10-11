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
  });
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

async function main() {
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
  const root = path.resolve(here, "..");
  const innerPort = await freePort();
  const innerSecret = randomBytes(32).toString("hex");

  const childEnv = { ...process.env, PORT: String(innerPort), HOST: "127.0.0.1", NITRO_PORT: String(innerPort), NITRO_HOST: "127.0.0.1" };
  delete childEnv.STAGING_GATE_PASS;
  delete childEnv.STAGING_GATE_SESSION_SECRET;
  childEnv.STAGING_GATE_INNER_SECRET = innerSecret;

  const app = spawn(process.execPath, ["--import", path.join(here, "staging-gate-inner.mjs"), path.join(root, ".output/server/index.mjs")], {
    env: childEnv,
    stdio: "inherit",
  });
  app.on("exit", (code, signal) => {
    console.error(`[staging-gate] app exited (${code ?? signal}); stopping gate`);
    process.exit(code || 1);
  });
  for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => app.kill(sig));

  const server = createGateServer({ user, pass, sessionSecret, ttlSec, upstream: { host: "127.0.0.1", port: innerPort }, innerSecret });
  const port = Number(process.env.PORT || 3000);
  server.listen(port, process.env.HOST || "0.0.0.0", () => console.log(`[staging-gate] listening on ${port}`));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
