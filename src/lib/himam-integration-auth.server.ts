import { timingSafeEqual } from "node:crypto";

export type HimamSyntheticIntegrationEnv = {
  HIMAM_SYNTHETIC_INTEGRATION_ENABLED?: string;
  HIMAM_INTEGRATION_ENV?: string;
  HIMAM_SYNTHETIC_INTEGRATION_TOKEN?: string;
};

export type HimamIntegrationGuardFailure = {
  ok: false;
  status: number;
  code: string;
};

export type HimamIntegrationGuardResult =
  | { ok: true }
  | HimamIntegrationGuardFailure;

export function checkHimamIntegrationEnvironment(
  env: HimamSyntheticIntegrationEnv,
): HimamIntegrationGuardResult {
  if (env.HIMAM_SYNTHETIC_INTEGRATION_ENABLED !== "true") {
    return { ok: false, status: 404, code: "HIMAM_INTEGRATION_DISABLED" };
  }
  if (env.HIMAM_INTEGRATION_ENV !== "synthetic") {
    return { ok: false, status: 403, code: "HIMAM_SYNTHETIC_ENV_REQUIRED" };
  }
  if (!env.HIMAM_SYNTHETIC_INTEGRATION_TOKEN) {
    return { ok: false, status: 503, code: "HIMAM_INTEGRATION_TOKEN_NOT_CONFIGURED" };
  }
  return { ok: true };
}

export function authenticateHimamIntegrationRequest(
  request: Request,
  env: HimamSyntheticIntegrationEnv,
): HimamIntegrationGuardResult {
  const environment = checkHimamIntegrationEnvironment(env);
  if (!environment.ok) return environment;

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return { ok: false, status: 401, code: "HIMAM_INTEGRATION_UNAUTHORIZED" };
  }

  const suppliedToken = authorization.slice("Bearer ".length);
  const expectedToken = env.HIMAM_SYNTHETIC_INTEGRATION_TOKEN;
  const supplied = Buffer.from(suppliedToken);
  const expected = Buffer.from(expectedToken);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return { ok: false, status: 401, code: "HIMAM_INTEGRATION_UNAUTHORIZED" };
  }

  return { ok: true };
}
