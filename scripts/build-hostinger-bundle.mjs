// Assemble a prebuilt Hostinger upload bundle from an existing Nitro build.
//
//   IEP_DEPLOY_TARGET=hostinger bun run build      (with staging VITE_* set)
//   node scripts/build-hostinger-bundle.mjs
//
// Output: dist-hostinger/iep-staging-bundle/ and dist-hostinger/iep-staging-bundle.zip
//
// Bundle layout (Hostinger "upload files", framework "Other", build command
// "none", entry file "staging-gate.mjs"):
//   staging-gate.mjs, access gate (entry point)
//   app/                                        Nitro .output (server + public)
//   package.json, package-lock.json             no runtime deps except the
//                                               exact, integrity-locked ones
//                                               Nitro left external (tslib)
//   BUNDLE-MANIFEST.json                        commit, hashes, checks
//
// The script fails if the bundle contains anything that looks like a server
// secret, or references a Supabase project other than the expected staging one.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "dist-hostinger");
const bundle = path.join(out, "iep-staging-bundle");
const zipPath = path.join(out, "iep-staging-bundle.zip");

const STAGING_REF = process.env.IEP_EXPECTED_SUPABASE_REF || "luhpjheolgjfovnankxo";
const FORBIDDEN_REFS = (process.env.IEP_FORBIDDEN_SUPABASE_REFS || "wrpeaxbvvbimgksxztvc").split(",").filter(Boolean);

function fail(msg) {
  console.error(`[bundle] FAIL: ${msg}`);
  process.exit(1);
}

const nitroOut = path.join(root, ".output");
if (!existsSync(path.join(nitroOut, "server/index.mjs"))) fail("no .output/server/index.mjs — run the Hostinger build first");
const nitroMeta = JSON.parse(readFileSync(path.join(nitroOut, "nitro.json"), "utf8"));
if (nitroMeta.preset !== "node-server") fail(`Nitro preset is ${nitroMeta.preset}, expected node-server (set IEP_DEPLOY_TARGET=hostinger)`);

rmSync(out, { recursive: true, force: true });
mkdirSync(bundle, { recursive: true });
cpSync(nitroOut, path.join(bundle, "app"), { recursive: true });
cpSync(path.join(root, "scripts/staging-gate.mjs"), path.join(bundle, "staging-gate.mjs"));
cpSync(path.join(root, "scripts/staging-gate-lib.mjs"), path.join(bundle, "staging-gate-lib.mjs"));

// Externals Nitro traced into app/server/node_modules. Pin them at the bundle
// root too (exact versions + lockfile) in case the host strips nested node_modules.
const traced = JSON.parse(readFileSync(path.join(bundle, "app/server/package.json"), "utf8")).dependencies || {};
for (const [name, version] of Object.entries(traced)) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`traced dependency ${name}@${version} is not an exact version`);
}
const pkg = {
  name: "iep-staging-bundle",
  private: true,
  type: "module",
  engines: { node: "22.x" },
  scripts: { start: "node staging-gate.mjs" },
  dependencies: traced,
};
writeFileSync(path.join(bundle, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
execFileSync("npm", ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: bundle, stdio: "inherit" });
const lock = JSON.parse(readFileSync(path.join(bundle, "package-lock.json"), "utf8"));
for (const [name, version] of Object.entries(traced)) {
  const entry = lock.packages[`node_modules/${name}`];
  if (!entry || entry.version !== version || !entry.integrity) fail(`lockfile does not pin ${name}@${version} with integrity`);
}

// ---- Safety scan --------------------------------------------------------------
function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}
const textExt = /\.(m?js|cjs|json|html|css|map|txt|md)$/;
const secretPatterns = [
  [/sb_secret_[A-Za-z0-9_-]{10,}/, "Supabase secret key"],
  [/\bsk-[A-Za-z0-9_-]{20,}/, "OpenAI-style secret key"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
];
// Legacy Supabase JWT keys: decode and reject any with role=service_role.
const jwtRe = /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;
const findings = [];
let stagingRefSeen = false;
const files = [];
for (const file of walk(bundle)) {
  const rel = path.relative(bundle, file);
  files.push(rel);
  if (/(^|\/)\.env(\.|$)/.test(rel)) findings.push(`${rel}: .env file in bundle`);
  if (!textExt.test(file)) continue;
  const text = readFileSync(file, "utf8");
  if (text.includes(STAGING_REF)) stagingRefSeen = true;
  for (const ref of FORBIDDEN_REFS) if (text.includes(ref)) findings.push(`${rel}: references forbidden Supabase project`);
  // Browser assets must not even mention the service role (server code may
  // reference the env var *name* SUPABASE_SERVICE_ROLE_KEY, never a value).
  if (rel.startsWith("app/public/") && /service_role/i.test(text)) findings.push(`${rel}: service_role mentioned in browser asset`);
  if (rel.startsWith("app/")) {
    for (const [re, label] of secretPatterns) if (re.test(text)) findings.push(`${rel}: ${label}`);
    for (const m of text.match(jwtRe) || []) {
      try {
        const payload = JSON.parse(Buffer.from(m.split(".")[1], "base64url").toString());
        if (payload.role && payload.role !== "anon") findings.push(`${rel}: JWT with role=${payload.role}`);
      } catch {}
    }
  }
}
if (!stagingRefSeen) findings.push(`staging Supabase project ${STAGING_REF} not found in the build (VITE_SUPABASE_URL not set to staging?)`);
if (findings.length) fail(`safety scan:\n  - ${findings.join("\n  - ")}`);

// ---- Manifest + zip ---------------------------------------------------------------
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
let commit = process.env.GITHUB_SHA || "";
try {
  commit ||= execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
} catch {}
const manifest = {
  commit,
  builtAt: new Date().toISOString(),
  node: process.version,
  nitro: nitroMeta.versions,
  supabaseProjectRef: STAGING_REF,
  entry: "staging-gate.mjs",
  hostinger: { framework: "Other", buildCommand: "none", entryFile: "staging-gate.mjs", outputDirectory: "" },
  bunLockSha256: existsSync(path.join(root, "bun.lock")) ? sha(path.join(root, "bun.lock")) : null,
  files: files.length,
  checks: ["no .env", "no service_role / secret keys", "no forbidden Supabase project", "staging project embedded", "traced deps pinned with integrity"],
};
writeFileSync(path.join(bundle, "BUNDLE-MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n");
execFileSync("zip", ["-qrX", zipPath, "."], { cwd: bundle });
console.log(`[bundle] OK ${path.relative(root, zipPath)} sha256=${sha(zipPath)} files=${files.length + 1}`);
