import { describe, expect, it } from "vitest";
import { handleHimamSyntheticReviewRequest } from "./himam-http-service.server";
import {
  HIMAM_REVIEW_INTEGRATION_PROTOCOL,
  type ReviewProfileSnapshot,
} from "./himam-integration-contract";
import type { HimamSyntheticIntegrationEnv } from "./himam-integration-auth.server";

const TOKEN = "synthetic-test-token";
const ENABLED_ENV: HimamSyntheticIntegrationEnv = {
  HIMAM_SYNTHETIC_INTEGRATION_ENABLED: "true",
  HIMAM_INTEGRATION_ENV: "synthetic",
  HIMAM_SYNTHETIC_INTEGRATION_TOKEN: TOKEN,
};

const SNAPSHOT: ReviewProfileSnapshot = {
  protocolVersion: HIMAM_REVIEW_INTEGRATION_PROTOCOL,
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

function request(body: unknown, options: { token?: string; omitAuth?: boolean } = {}): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (!options.omitAuth) {
    headers.set("authorization", `Bearer ${options.token ?? TOKEN}`);
  }
  return new Request("http://localhost/api/himam/review", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    protocolVersion: HIMAM_REVIEW_INTEGRATION_PROTOCOL,
    transportId: "transport-http-synthetic-001",
    createdAt: "2026-11-07T00:00:00.000Z",
    synthetic: true,
    payload: SNAPSHOT,
    ...overrides,
  };
}

describe("Himam local synthetic HTTP guards", () => {
  it("rejects when the feature flag is closed", async () => {
    const response = await handleHimamSyntheticReviewRequest(request(envelope()), {
      ...ENABLED_ENV,
      HIMAM_SYNTHETIC_INTEGRATION_ENABLED: "false",
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "HIMAM_INTEGRATION_DISABLED" });
  });

  it("rejects when the environment is not synthetic", async () => {
    const response = await handleHimamSyntheticReviewRequest(request(envelope()), {
      ...ENABLED_ENV,
      HIMAM_INTEGRATION_ENV: "production",
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "HIMAM_SYNTHETIC_ENV_REQUIRED" });
  });

  it("rejects a missing integration key", async () => {
    const response = await handleHimamSyntheticReviewRequest(
      request(envelope(), { omitAuth: true }),
      ENABLED_ENV,
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "HIMAM_INTEGRATION_UNAUTHORIZED" });
  });

  it("rejects an incorrect integration key", async () => {
    const response = await handleHimamSyntheticReviewRequest(
      request(envelope(), { token: "wrong-token" }),
      ENABLED_ENV,
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "HIMAM_INTEGRATION_UNAUTHORIZED" });
  });

  it("rejects an incompatible protocol version", async () => {
    const response = await handleHimamSyntheticReviewRequest(
      request(envelope({ protocolVersion: "himam-review-integration-v2" })),
      ENABLED_ENV,
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "PROTOCOL_VERSION_MISMATCH" });
  });

  it("rejects a non-synthetic envelope", async () => {
    const response = await handleHimamSyntheticReviewRequest(
      request(envelope({ synthetic: false })),
      ENABLED_ENV,
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "REAL_DATA_TRANSPORT_BLOCKED" });
  });

  it("rejects an invalid synthetic payload", async () => {
    const response = await handleHimamSyntheticReviewRequest(
      request(
        envelope({
          payload: {
            protocolVersion: HIMAM_REVIEW_INTEGRATION_PROTOCOL,
            learnerRef: "learner-http-synthetic-001",
          },
        }),
      ),
      ENABLED_ENV,
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: "INVALID_SYNTHETIC_PAYLOAD" });
  });

  it("returns a deterministic package apart from generatedAt and traceId", async () => {
    const first = await handleHimamSyntheticReviewRequest(request(envelope()), ENABLED_ENV);
    const second = await handleHimamSyntheticReviewRequest(request(envelope()), ENABLED_ENV);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const firstBody = await first.json();
    const secondBody = await second.json();

    expect(firstBody.traceId).not.toBe(secondBody.traceId);
    expect(firstBody.package.generatedAt).toBeTypeOf("string");
    expect(secondBody.package.generatedAt).toBeTypeOf("string");

    delete firstBody.traceId;
    delete secondBody.traceId;
    delete firstBody.package.generatedAt;
    delete secondBody.package.generatedAt;

    expect(firstBody).toEqual(secondBody);
  });
});
