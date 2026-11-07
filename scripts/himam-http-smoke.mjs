import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

const HOST = "127.0.0.1";
const TOKEN = process.env.HIMAM_SYNTHETIC_INTEGRATION_TOKEN;
if (!TOKEN) {
  throw new Error("HIMAM_SYNTHETIC_INTEGRATION_TOKEN must be set in the local environment.");
}
const PROTOCOL = "himam-review-integration-v1";

const snapshot = {
  protocolVersion: PROTOCOL,
  learnerRef: "learner-http-synthetic-001",
  profileVersion: "profile-http-v1",
  generatedAt: "2026-11-07T00:00:00.000Z",
  purpose: "PLAN_REVIEW",
  readonly: true,
  acceptedEvidenceSummaries: [],
  acceptedPlanningPriorities: [],
  goalHistory: [],
  acceptedSupportSummaries: [],
};

function envelope(overrides = {}) {
  return {
    protocolVersion: PROTOCOL,
    transportId: "transport-http-synthetic-001",
    createdAt: "2026-11-07T00:00:00.000Z",
    synthetic: true,
    payload: snapshot,
    ...overrides,
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function post(baseUrl, body, options = {}) {
  const headers = { "content-type": "application/json" };
  if (!options.omitAuth) {
    headers.authorization = `Bearer ${options.token ?? TOKEN}`;
  }
  const response = await fetch(`${baseUrl}/api/himam/review`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  return { response, json };
}

async function waitForServer(baseUrl) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      await fetch(baseUrl, { redirect: "manual" });
      return;
    } catch {
      await delay(250);
    }
  }
  throw new Error(`Local server did not become ready at ${baseUrl}`);
}

async function assertPortAvailable(port) {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", (error) => {
      reject(new Error(`Port ${port} is already in use: ${error.message}`));
    });
    probe.listen(port, HOST, () => {
      probe.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });
}

function stopProcessTree(child) {
  if (!child.pid) return;

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
    });
    return;
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

async function withLocalServer(port, env, run) {
  await assertPortAvailable(port);

  const baseUrl = `http://${HOST}:${port}`;
  const child = spawn(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["vite", "dev", "--host", HOST, "--port", String(port)],
    {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    },
  );

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await waitForServer(baseUrl);
    await run(baseUrl);
  } finally {
    stopProcessTree(child);
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      delay(2_000),
    ]);
  }

  if (child.exitCode && child.exitCode !== 0) {
    throw new Error(`Local server exited with code ${child.exitCode}: ${stderr}`);
  }
}

function normalizeSuccess(body) {
  const clone = structuredClone(body);
  delete clone.traceId;
  if (clone.package) delete clone.package.generatedAt;
  return clone;
}

await withLocalServer(
  4311,
  {
    HIMAM_SYNTHETIC_INTEGRATION_ENABLED: "false",
    HIMAM_INTEGRATION_ENV: "synthetic",
    HIMAM_SYNTHETIC_INTEGRATION_TOKEN: TOKEN,
  },
  async (baseUrl) => {
    const { response, json } = await post(baseUrl, envelope());
    assert(response.status === 404, "feature flag closed: expected 404");
    assert(json?.error === "HIMAM_INTEGRATION_DISABLED", "feature flag closed: wrong error");
  },
);

await withLocalServer(
  4312,
  {
    HIMAM_SYNTHETIC_INTEGRATION_ENABLED: "true",
    HIMAM_INTEGRATION_ENV: "production",
    HIMAM_SYNTHETIC_INTEGRATION_TOKEN: TOKEN,
  },
  async (baseUrl) => {
    const { response, json } = await post(baseUrl, envelope());
    assert(response.status === 403, "non-synthetic env: expected 403");
    assert(json?.error === "HIMAM_SYNTHETIC_ENV_REQUIRED", "non-synthetic env: wrong error");
  },
);

await withLocalServer(
  4313,
  {
    HIMAM_SYNTHETIC_INTEGRATION_ENABLED: "true",
    HIMAM_INTEGRATION_ENV: "synthetic",
    HIMAM_SYNTHETIC_INTEGRATION_TOKEN: TOKEN,
  },
  async (baseUrl) => {
    {
      const { response, json } = await post(baseUrl, envelope(), { omitAuth: true });
      assert(response.status === 401, "missing key: expected 401");
      assert(json?.error === "HIMAM_INTEGRATION_UNAUTHORIZED", "missing key: wrong error");
    }

    {
      const { response, json } = await post(baseUrl, envelope(), { token: "wrong-token" });
      assert(response.status === 401, "wrong key: expected 401");
      assert(json?.error === "HIMAM_INTEGRATION_UNAUTHORIZED", "wrong key: wrong error");
    }

    {
      const { response, json } = await post(
        baseUrl,
        envelope({ protocolVersion: "himam-review-integration-v2" }),
      );
      assert(response.status === 409, "wrong protocol: expected 409");
      assert(json?.error === "PROTOCOL_VERSION_MISMATCH", "wrong protocol: wrong error");
    }

    {
      const { response, json } = await post(baseUrl, envelope({ synthetic: false }));
      assert(response.status === 403, "non-synthetic payload: expected 403");
      assert(json?.error === "REAL_DATA_TRANSPORT_BLOCKED", "non-synthetic payload: wrong error");
    }

    {
      const { response, json } = await post(
        baseUrl,
        envelope({
          payload: {
            protocolVersion: PROTOCOL,
            learnerRef: "learner-http-synthetic-001",
          },
        }),
      );
      assert(response.status === 422, "invalid payload: expected 422");
      assert(json?.error === "INVALID_SYNTHETIC_PAYLOAD", "invalid payload: wrong error");
    }

    const first = await post(baseUrl, envelope());
    const second = await post(baseUrl, envelope());

    assert(first.response.status === 200, "valid request: expected 200");
    assert(second.response.status === 200, "repeat request: expected 200");
    assert(first.json?.traceId, "valid request: missing traceId");
    assert(second.json?.traceId, "repeat request: missing traceId");
    assert(first.json.traceId !== second.json.traceId, "traceId must differ between requests");
    assert(first.json.package?.generatedAt, "valid request: missing package.generatedAt");
    assert(second.json.package?.generatedAt, "repeat request: missing package.generatedAt");
    assert(
      JSON.stringify(normalizeSuccess(first.json)) === JSON.stringify(normalizeSuccess(second.json)),
      "package content changed across identical requests",
    );
  },
);

console.log("Himam local HTTP smoke PASS");
