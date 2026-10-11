// Smoke-test the Hostinger upload bundle exactly as it would be extracted on the host.
//   node scripts/test-hostinger-bundle.mjs [dist-hostinger/iep-staging-bundle.zip]
// Uses throwaway, randomly generated gate credentials; never real secrets.
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const zip = path.resolve(process.argv[2] || "dist-hostinger/iep-staging-bundle.zip");
const dir = mkdtempSync(path.join(os.tmpdir(), "iep-bundle-"));
let failures = 0;
const results = [];
const check = (name, ok, extra = "") => {
  results.push(`${ok ? "PASS" : "FAIL"}: ${name}${extra ? ` (${extra})` : ""}`);
  if (!ok) failures++;
};

function request(port, { method = "GET", path: p = "/", headers = {} } = {}) {
  return new Promise((resolve) => {
    const req = http.request({ host: "127.0.0.1", port, method, path: p, headers, timeout: 15000 }, (res) => {
      let body = "";
      res.on("data", (d) => (body += d));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on("error", (e) => resolve({ status: 0, error: e.code }));
    req.on("timeout", () => req.destroy());
    req.end();
  });
}
const basic = (u, p) => ({ authorization: "Basic " + Buffer.from(`${u}:${p}`).toString("base64") });

// Hostinger loads the entry through its own wrapper (process.argv[1] is not the
// entry), so start it the same way: imported from another module.
function start(env) {
  const child = spawn(process.execPath, ["--input-type=module", "-e", "await import('./staging-gate.mjs')"], { cwd: dir, env: { PATH: process.env.PATH, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  return { child, log: () => log, exited: new Promise((r) => child.on("exit", (c) => r(c))) };
}

try {
  execFileSync("unzip", ["-q", zip, "-d", dir]);
  check("bundle has gate entry, lib, inner preload and Nitro app", ["staging-gate.mjs", "staging-gate-lib.mjs", "staging-gate-inner.mjs", "app/server/index.mjs", "package-lock.json"].every((f) => existsSync(path.join(dir, f))));
  check("bundle has no .env", !existsSync(path.join(dir, ".env")));

  // What Hostinger's install step will do with npm: locked, integrity-checked.
  execFileSync("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: dir, stdio: "ignore" });
  check("npm ci on bundle succeeds from lockfile", true);

  // 1. Refuses to start without gate secrets.
  for (const [label, env] of [
    ["no gate env", { PORT: "39100" }],
    ["weak password", { PORT: "39100", STAGING_GATE_USER: "u", STAGING_GATE_PASS: "short", STAGING_GATE_SESSION_SECRET: randomBytes(24).toString("hex") }],
    ["no session secret", { PORT: "39100", STAGING_GATE_USER: "u", STAGING_GATE_PASS: randomBytes(12).toString("hex") }],
  ]) {
    const s = start(env);
    const code = await Promise.race([s.exited, new Promise((r) => setTimeout(() => r("timeout"), 8000))]);
    if (code === "timeout") s.child.kill();
    check(`refuses to start: ${label}`, code === 1 && /refusing to start/.test(s.log()));
  }

  // 2. Starts with synthetic secrets and protects every route.
  const USER = "synthetic-staging";
  const PASS = randomBytes(16).toString("hex");
  const SECRET = randomBytes(32).toString("hex");
  const PORT = 39000 + Math.floor(Math.random() * 900);
  const s = start({
    PORT: String(PORT),
    NODE_ENV: "production",
    STAGING_GATE_USER: USER,
    STAGING_GATE_PASS: PASS,
    STAGING_GATE_SESSION_SECRET: SECRET,
    // Synthetic server values so routes initialise; nothing real.
    SUPABASE_URL: "https://luhpjheolgjfovnankxo.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic_test_only",
  });
  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    await new Promise((r) => setTimeout(r, 500));
    up = (await request(PORT)).status === 401;
  }
  check("gate listens on PORT", up);
  const inner = (s.log().match(/127\.0\.0\.1:(\d+)/) || [])[1];

  const anon = await request(PORT);
  check("no credentials -> 401 + Basic challenge", anon.status === 401 && /^Basic/.test(anon.headers["www-authenticate"] || ""));
  check("wrong password -> 401", (await request(PORT, { headers: basic(USER, "x" + PASS) })).status === 401);
  check("anonymous POST /api/audit blocked by gate -> 401", (await request(PORT, { method: "POST", path: "/api/audit" })).status === 401);
  const ok = await request(PORT, { headers: basic(USER, PASS) });
  check("correct login -> 200 HTML", ok.status === 200 && /<html/i.test(ok.body), `status ${ok.status}`);
  const cookie = [].concat(ok.headers["set-cookie"] || []).find((c) => c.startsWith("iep_gate="));
  check("session cookie is HttpOnly + Secure", !!cookie && /HttpOnly/.test(cookie) && /Secure/.test(cookie));
  const sess = cookie ? cookie.split(";")[0] : "";
  check("session reaches app; app still requires admin bearer on /api/reviews -> 401",
    (await request(PORT, { method: "POST", path: "/api/reviews", headers: { cookie: sess, "content-type": "application/json" } })).status === 401);
  check("forged session -> 401", (await request(PORT, { headers: { cookie: "iep_gate=eyJ2IjoxLCJleHAiOjk5OTk5OTk5OTl9.forged" } })).status === 401);
  check("noindex header on gated responses", /noindex/.test(ok.headers["x-robots-tag"] || ""));

  if (inner) {
    const direct = await request(Number(inner));
    check("direct request to inner Nitro port -> 403", direct.status === 403, `port ${inner}`);
    const spoof = await request(Number(inner), { headers: { "x-iep-gate-inner": "0".repeat(64) } });
    check("spoofed inner header -> 403", spoof.status === 403);
  } else {
    check("inner Nitro port discovered from log", false);
  }

  // Cold start: the host spawns the process on the first request. The first
  // authenticated request answered by the gate must reach the app (no 502).
  {
    const CPORT = PORT + 1;
    const s3 = start({ PORT: String(CPORT), STAGING_GATE_USER: USER, STAGING_GATE_PASS: PASS, STAGING_GATE_SESSION_SECRET: SECRET,
      SUPABASE_URL: "https://luhpjheolgjfovnankxo.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic_test_only" });
    let first = { status: 0 };
    for (let i = 0; i < 100 && first.status === 0; i++) {
      first = await request(CPORT, { headers: basic(USER, PASS) });
      if (first.status === 0) await new Promise((r) => setTimeout(r, 20));
    }
    check("cold start: first authenticated request waits for the app (200, not 502)", first.status === 200, `status ${first.status}`);
    check("app output is relayed to the host log", /\[app\]/.test(s3.log()) || /app ready in/.test(s3.log()));
    s3.child.kill("SIGTERM");
    await s3.exited;
  }

  // Host-provided PORT as a socket path (Passenger/LiteSpeed style).
  {
    const sock = path.join(dir, "gate.sock");
    const s2 = start({ PORT: sock, STAGING_GATE_USER: USER, STAGING_GATE_PASS: PASS, STAGING_GATE_SESSION_SECRET: SECRET,
      SUPABASE_URL: "https://luhpjheolgjfovnankxo.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic_test_only" });
    let st = 0;
    for (let i = 0; i < 20 && st !== 401; i++) {
      await new Promise((r) => setTimeout(r, 300));
      st = await new Promise((resolve) => {
        const rq = http.request({ socketPath: sock, path: "/" }, (res) => { res.resume(); resolve(res.statusCode); });
        rq.on("error", () => resolve(0));
        rq.end();
      });
    }
    check("listens on a host-provided socket path PORT (401 without credentials)", st === 401);
    s2.child.kill("SIGTERM");
    await s2.exited;
  }

  const logs = s.log();
  check("logs contain no password / session secret / session token", ![PASS, SECRET, sess.split("=")[1] || "@@"].some((v) => v && logs.includes(v)));
  s.child.kill("SIGTERM");
  await s.exited;
} catch (e) {
  check(`unexpected error: ${e.message}`, false);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(results.join("\n"));
console.log(failures ? `\n${failures} check(s) FAILED` : `\nALL ${results.length} BUNDLE CHECKS PASSED`);
process.exit(failures ? 1 : 0);
