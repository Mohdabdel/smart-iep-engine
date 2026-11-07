import type {
  ReviewIntegrationPackage,
  ReviewProfileSnapshot,
} from "./himam-integration-contract";
import { buildReadonlyProfileReviewContext } from "./himam-profile-context";

export const SMART_IEP_HIMAM_TRANSPORT_FEATURE = {
  enabled: false,
  syntheticOnly: true,
  protocolVersion: "himam-review-integration-v1",
} as const;

export type ReviewTransportEnvelope<TPayload> = {
  protocolVersion: typeof SMART_IEP_HIMAM_TRANSPORT_FEATURE.protocolVersion;
  transportId: string;
  createdAt: string;
  synthetic: boolean;
  payload: TPayload;
};

export function receiveProfileSnapshotEnvelope(
  envelope: ReviewTransportEnvelope<ReviewProfileSnapshot>,
) {
  if (!envelope.synthetic) {
    throw new Error("REAL_DATA_TRANSPORT_BLOCKED");
  }
  if (envelope.protocolVersion !== SMART_IEP_HIMAM_TRANSPORT_FEATURE.protocolVersion) {
    throw new Error("INCOMPATIBLE_PROTOCOL_VERSION");
  }
  return buildReadonlyProfileReviewContext(envelope.payload);
}

export function createReviewPackageEnvelope(
  pkg: ReviewIntegrationPackage,
  transportId = `review-${pkg.reviewCaseId}`,
): ReviewTransportEnvelope<ReviewIntegrationPackage> {
  if (!SMART_IEP_HIMAM_TRANSPORT_FEATURE.syntheticOnly) {
    throw new Error("Unexpected transport configuration.");
  }
  return {
    protocolVersion: SMART_IEP_HIMAM_TRANSPORT_FEATURE.protocolVersion,
    transportId,
    createdAt: new Date().toISOString(),
    synthetic: true,
    payload: pkg,
  };
}

export const SMART_IEP_HIMAM_TRANSPORT_GOVERNANCE = {
  realDataAllowed: false,
  automaticPushAllowed: false,
  automaticPullAllowed: false,
  endpointBindingAllowedNow: false,
  syntheticEnvelopeAllowed: true,
  directProfileWriteAllowed: false,
} as const;
