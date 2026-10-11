// Preloaded into the Nitro process by staging-gate.mjs (node --import).
// Every HTTP request must carry the per-boot secret that only the gate knows;
// anything else (e.g. a direct hit on the inner 127.0.0.1 port) gets 403.
import http from "node:http";
import { timingSafeEqual } from "node:crypto";

const HEADER = "x-iep-gate-inner";
const secret = process.env.STAGING_GATE_INNER_SECRET;
delete process.env.STAGING_GATE_INNER_SECRET; // keep it out of the app's env

if (!secret || secret.length < 32) {
  console.error("[staging-gate-inner] missing inner secret; refusing to start");
  process.exit(1);
}
const expected = Buffer.from(secret);

const originalEmit = http.Server.prototype.emit;
http.Server.prototype.emit = function (event, req, res, ...rest) {
  if (event === "request") {
    const got = Buffer.from(String(req.headers[HEADER] || ""));
    if (got.length !== expected.length || !timingSafeEqual(got, expected)) {
      res.writeHead(403, { "content-type": "text/plain", "cache-control": "no-store" });
      res.end("Forbidden");
      return true;
    }
    delete req.headers[HEADER];
    // Frameworks may rebuild headers from rawHeaders; drop the secret there too.
    const raw = req.rawHeaders;
    for (let i = raw.length - 2; i >= 0; i -= 2) {
      if (raw[i].toLowerCase() === HEADER) raw.splice(i, 2);
    }
  }
  return originalEmit.call(this, event, req, res, ...rest);
};
