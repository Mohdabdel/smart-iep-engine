import { randomUUID } from "node:crypto";
import { HIMAM_SYNTHETIC_AUDIT_REPORT } from "./fixtures/himam-synthetic-audit-report";
import {
  authenticateHimamIntegrationRequest,
  type HimamSyntheticIntegrationEnv,
} from "./himam-integration-auth.server";
import {
  HIMAM_REVIEW_INTEGRATION_PROTOCOL,
  type ReviewProfileSnapshot,
} from "./himam-integration-contract";
import { validateReviewProfileSnapshot } from "./himam-profile-context";
import { buildReviewIntegrationPackage } from "./himam-review-adapter";

type SyntheticEnvelope = {
  protocolVersion: string;
  transportId: string;
  createdAt: string;
  synthetic: boolean;
  payload: ReviewProfileSnapshot;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSyntheticEnvelope(value: unknown): SyntheticEnvelope | null {
  if (!isRecord(value)) return null;
  if (typeof value.protocolVersion !== "string") return null;
  if (typeof value.transportId !== "string" || !value.transportId) return null;
  if (typeof value.createdAt !== "string" || !value.createdAt) return null;
  if (typeof value.synthetic !== "boolean") return null;
  if (!isRecord(value.payload)) return null;

  const payload = value.payload;
  if (typeof payload.protocolVersion !== "string") return null;
  if (typeof payload.learnerRef !== "string") return null;
  if (typeof payload.profileVersion !== "string") return null;
  if (typeof payload.generatedAt !== "string") return null;
  if (payload.purpose !== "PLAN_REVIEW") return null;
  if (payload.readonly !== true) return null;
  if (!Array.isArray(payload.acceptedEvidenceSummaries)) return null;
  if (!Array.isArray(payload.acceptedPlanningPriorities)) return null;
  if (!Array.isArray(payload.goalHistory)) return null;
  if (!Array.isArray(payload.acceptedSupportSummaries)) return null;

  return value as unknown as SyntheticEnvelope;
}

function jsonError(traceId: string, status: number, code: string) {
  return Response.json({ traceId, error: code }, { status });
}

export async function handleHimamSyntheticReviewRequest(
  request: Request,
  env: HimamSyntheticIntegrationEnv = process.env,
): Promise<Response> {
  const traceId = randomUUID();

  const auth = authenticateHimamIntegrationRequest(request, env);
  if (!auth.ok) return jsonError(traceId, auth.status, auth.code);

  const raw = await request.json().catch(() => null);
  if (!isRecord(raw)) return jsonError(traceId, 400, "INVALID_JSON_BODY");

  if (raw.protocolVersion !== HIMAM_REVIEW_INTEGRATION_PROTOCOL) {
    return jsonError(traceId, 409, "PROTOCOL_VERSION_MISMATCH");
  }

  if (raw.synthetic !== true) {
    return jsonError(traceId, 403, "REAL_DATA_TRANSPORT_BLOCKED");
  }

  const envelope = parseSyntheticEnvelope(raw);
  if (!envelope) return jsonError(traceId, 422, "INVALID_SYNTHETIC_PAYLOAD");

  const profileValidation = validateReviewProfileSnapshot(envelope.payload);
  if (!profileValidation.ok) {
    return Response.json(
      {
        traceId,
        error: "INVALID_PROFILE_SNAPSHOT",
        issues: profileValidation.issues,
      },
      { status: 422 },
    );
  }

  if (envelope.payload.protocolVersion !== HIMAM_REVIEW_INTEGRATION_PROTOCOL) {
    return jsonError(traceId, 409, "PROTOCOL_VERSION_MISMATCH");
  }

  const generatedAt = new Date().toISOString();
  const reviewPackage = buildReviewIntegrationPackage({
    reviewCaseId: "RC-HTTP-SYNTH-001",
    sourcePlanRef: "synthetic-http-fixture-plan.pdf",
    learnerRef: envelope.payload.learnerRef,
    profileSnapshotVersionUsed: envelope.payload.profileVersion,
    report: HIMAM_SYNTHETIC_AUDIT_REPORT,
    generatedAt,
  });

  return Response.json({
    traceId,
    transportId: envelope.transportId,
    synthetic: true,
    protocolVersion: HIMAM_REVIEW_INTEGRATION_PROTOCOL,
    package: reviewPackage,
  });
}
