export const HIMAM_REVIEW_INTEGRATION_PROTOCOL = "himam-review-integration-v1" as const;

export type SharedTransitionEntityRef = {
  schemeId: string;
  schemeVersion: string;
  entityType:
    | "TRANSITION_CONCEPT"
    | "COMPETENCY"
    | "ENABLING_SKILL"
    | "PERFORMANCE_DIMENSION"
    | "FUNCTIONAL_SCENARIO";
  entityId: string;
  validationStatus: "legacy_active" | "pre_cvi" | "validated" | "retired";
};

export type ReviewInteractionMode =
  | "PLAN_QUALITY_GATE"
  | "PROFILE_PLAN_CONSISTENCY"
  | "INLINE_QUALITY_SUPPORT"
  | "LONGITUDINAL_LEARNING"
  | "SHARED_KNOWLEDGE_ALIGNMENT";

export type ReviewProfileSnapshot = {
  protocolVersion: typeof HIMAM_REVIEW_INTEGRATION_PROTOCOL;
  learnerRef: string;
  profileVersion: string;
  generatedAt: string;
  purpose: "PLAN_REVIEW";
  readonly: true;
  acceptedEvidenceSummaries: Array<{
    evidenceRef: string;
    summary: string;
    context?: string;
    observedAt?: string;
    supportSummary?: string;
    competencyRefs?: SharedTransitionEntityRef[];
  }>;
  acceptedPlanningPriorities: Array<{
    priorityRef: string;
    summary: string;
    sourceRefs: string[];
  }>;
  goalHistory: Array<{
    goalRef: string;
    goalText: string;
    status: "active" | "completed" | "superseded" | "unknown";
    relationRefs?: string[];
    evidenceRefs?: string[];
  }>;
  acceptedSupportSummaries: Array<{
    supportRef: string;
    summary: string;
    context?: string;
  }>;
  learnerVoiceSummary?: string;
  familyVisionSummary?: string;
  transitionEntityRefs?: SharedTransitionEntityRef[];
};

export type ReviewPlanFinding = {
  findingId: string;
  category:
    | "GOAL_QUALITY"
    | "MEASUREMENT"
    | "BASELINE"
    | "PLAN_COHERENCE"
    | "NEED_GOAL_ALIGNMENT"
    | "TRANSITION_COVERAGE"
    | "DUPLICATION"
    | "AGE_APPROPRIATENESS"
    | "OTHER";
  severity: "CRITICAL" | "IMPORTANT" | "QUALITY_IMPROVEMENT";
  summary: string;
  evidenceText?: string;
  planRefs: string[];
  recommendedAction?: string;
  destination: "PLAN_ONLY";
};

export type ReviewProfileComparisonFinding = {
  findingId: string;
  comparisonType:
    | "PLAN_OMITS_ACCEPTED_PROFILE_EVIDENCE"
    | "PLAN_CONFLICTS_WITH_ACCEPTED_HISTORY"
    | "GOAL_REPEATS_COMPLETED_TARGET"
    | "SUPPORT_MISMATCH"
    | "PRIORITY_NOT_ADDRESSED"
    | "NEW_PLAN_INFORMATION_NOT_IN_PROFILE"
    | "OTHER";
  summary: string;
  profileRefs: string[];
  planRefs: string[];
  confidence: "LOW" | "MEDIUM" | "HIGH";
  requiresHumanReview: true;
};

export type ReviewLearningCandidateType =
  | "GOAL_HISTORY"
  | "PLANNING_IMPLICATION"
  | "HISTORICAL_EVIDENCE"
  | "GOAL_RELATION"
  | "SUPPORT_HISTORY"
  | "COLLECT_MORE_EVIDENCE";

export type ReviewLearningCandidate = {
  candidateId: string;
  candidateType: ReviewLearningCandidateType;
  summary: string;
  sourceReviewCaseId: string;
  sourcePlanRefs: string[];
  supportingEvidenceRefs: string[];
  proposedTransitionRefs?: SharedTransitionEntityRef[];
  proposedPayload: Record<string, unknown>;
  status: "candidate";
  requiresHumanApproval: true;
};

export type ReviewIntegrationPackage = {
  protocolVersion: typeof HIMAM_REVIEW_INTEGRATION_PROTOCOL;
  reviewEngine: "smart-iep-engine";
  reviewEngineVersion: string;
  reviewCaseId: string;
  learnerRef?: string;
  sourcePlanRef: string;
  generatedAt: string;
  profileSnapshotVersionUsed?: string;
  interactionModes: ReviewInteractionMode[];
  planFindings: ReviewPlanFinding[];
  profileComparisonFindings: ReviewProfileComparisonFinding[];
  learningCandidates: ReviewLearningCandidate[];
  reviewDecision?: string;
  provenanceRefs: string[];
};

export const SMART_IEP_HIMAM_INTEGRATION_GOVERNANCE = {
  automaticPushEnabled: false,
  profileSnapshotAccessMode: "readonly",
  directProfileWriteAllowed: false,
  learningCandidatesAreFacts: false,
  humanApprovalRequiredBeforeProfileImpact: true,
  diagnosisTransferRequired: false,
} as const;
