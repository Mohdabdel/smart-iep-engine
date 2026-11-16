import {
  HIMAM_REVIEW_INTEGRATION_PROTOCOL,
  type ReviewProfileSnapshot,
} from "./himam-integration-contract";

export function validateReviewProfileSnapshot(
  snapshot: ReviewProfileSnapshot,
): { ok: true } | { ok: false; issues: string[] } {
  const issues: string[] = [];

  if (snapshot.protocolVersion !== HIMAM_REVIEW_INTEGRATION_PROTOCOL) {
    issues.push("INCOMPATIBLE_PROTOCOL_VERSION");
  }
  if (snapshot.purpose !== "PLAN_REVIEW") {
    issues.push("INVALID_PURPOSE");
  }
  if (snapshot.readonly !== true) {
    issues.push("SNAPSHOT_MUST_BE_READONLY");
  }
  if (!snapshot.learnerRef) issues.push("MISSING_LEARNER_REF");
  if (!snapshot.profileVersion) issues.push("MISSING_PROFILE_VERSION");
  if (!snapshot.generatedAt) issues.push("MISSING_GENERATED_AT");

  return issues.length > 0 ? { ok: false, issues } : { ok: true };
}

/**
 * Creates a purpose-limited review context from an accepted Himam profile
 * snapshot. It does not persist, mutate, or enrich the learner profile.
 */
export function buildReadonlyProfileReviewContext(snapshot: ReviewProfileSnapshot) {
  const validation = validateReviewProfileSnapshot(snapshot);
  if (!validation.ok) {
    throw new Error(`Invalid Himam profile snapshot: ${validation.issues.join(", ")}`);
  }

  return {
    protocolVersion: snapshot.protocolVersion,
    learnerRef: snapshot.learnerRef,
    profileVersion: snapshot.profileVersion,
    generatedAt: snapshot.generatedAt,
    acceptedEvidenceSummaries: snapshot.acceptedEvidenceSummaries,
    acceptedPlanningPriorities: snapshot.acceptedPlanningPriorities,
    goalHistory: snapshot.goalHistory,
    acceptedSupportSummaries: snapshot.acceptedSupportSummaries,
    learnerVoiceSummary: snapshot.learnerVoiceSummary,
    familyVisionSummary: snapshot.familyVisionSummary,
    transitionEntityRefs: snapshot.transitionEntityRefs ?? [],
    governance: {
      readonly: true,
      mayCompareAgainstPlan: true,
      mayGenerateProfileComparisonFindings: true,
      mayMutateProfile: false,
      mayTreatMissingProfileDataAsLearnerDeficit: false,
    },
  } as const;
}
