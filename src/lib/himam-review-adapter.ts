import type { IepAuditReport } from "./iep-schema";
import {
  HIMAM_REVIEW_INTEGRATION_PROTOCOL,
  type ReviewIntegrationPackage,
  type ReviewLearningCandidate,
  type ReviewPlanFinding,
  type ReviewProfileComparisonFinding,
} from "./himam-integration-contract";

function severityOf(value: string): ReviewPlanFinding["severity"] {
  if (value === "حرج") return "CRITICAL";
  if (value === "مهم") return "IMPORTANT";
  return "QUALITY_IMPROVEMENT";
}

function categoryOf(criterionId: string, recommendedAction: string): ReviewPlanFinding["category"] {
  const text = `${criterionId} ${recommendedAction}`.toLowerCase();
  if (text.includes("baseline")) return "BASELINE";
  if (text.includes("measure") || text.includes("قياس")) return "MEASUREMENT";
  if (text.includes("transition") || text.includes("انتقال")) return "TRANSITION_COVERAGE";
  if (text.includes("need") || text.includes("احتياج")) return "NEED_GOAL_ALIGNMENT";
  if (text.includes("duplicate") || text.includes("تكرار")) return "DUPLICATION";
  if (text.includes("age") || text.includes("عمر")) return "AGE_APPROPRIATENESS";
  if (text.includes("goal") || text.includes("هدف")) return "GOAL_QUALITY";
  return "OTHER";
}

function acceptedReviewerStatus(status: string) {
  return status === "accepted" || status === "edited";
}

function planFindingsFromReport(report: IepAuditReport): ReviewPlanFinding[] {
  const criteria = report.criteria_results
    .filter((finding) => finding.status !== "مستوفى" && acceptedReviewerStatus(finding.reviewer_status))
    .map((finding, index): ReviewPlanFinding => ({
      findingId: `criterion-${index + 1}-${finding.criterion_id}`,
      category: categoryOf(finding.criterion_id, finding.recommended_action),
      severity: severityOf(finding.severity),
      summary: finding.reasoning_summary || finding.recommended_action || finding.criterion_id,
      ...(finding.evidence_text ? { evidenceText: finding.evidence_text } : {}),
      planRefs: [finding.criterion_id],
      ...(finding.recommended_action ? { recommendedAction: finding.recommended_action } : {}),
      destination: "PLAN_ONLY",
    }));

  const revisions = report.revisions
    .filter((revision) => acceptedReviewerStatus(revision.reviewer_status))
    .map((revision, index): ReviewPlanFinding => ({
      findingId: `revision-${index + 1}-${revision.goal_number}`,
      category: "GOAL_QUALITY",
      severity: severityOf(revision.priority),
      summary: revision.rationale || revision.defect_type,
      ...(revision.original_goal ? { evidenceText: revision.original_goal } : {}),
      planRefs: [revision.goal_number].filter(Boolean),
      ...(revision.revised_goal ? { recommendedAction: revision.revised_goal } : {}),
      destination: "PLAN_ONLY",
    }));

  return [...criteria, ...revisions];
}

function learningCandidatesFromReport(
  report: IepAuditReport,
  reviewCaseId: string,
): ReviewLearningCandidate[] {
  const candidates: ReviewLearningCandidate[] = [];

  report.goal_journey.items.forEach((item, index) => {
    candidates.push({
      candidateId: `goal-journey-${index + 1}`,
      candidateType: "GOAL_HISTORY",
      summary: item.recommendation || item.previous_goal,
      sourceReviewCaseId: reviewCaseId,
      sourcePlanRefs: [item.ref, ...item.current_refs].filter(Boolean),
      supportingEvidenceRefs: item.assessment_evidence ? [item.ref] : [],
      proposedPayload: {
        previousGoal: item.previous_goal,
        progressInPlaafp: item.progress_in_plaafp,
        assessmentEvidence: item.assessment_evidence,
        currentGoalRefs: item.current_refs,
        category: item.category,
        isolatedMastery: item.isolated_mastery,
        recommendation: item.recommendation,
      },
      status: "candidate",
      requiresHumanApproval: true,
    });
  });

  report.assessment_alignment
    .filter((item) => item.status !== "معالج")
    .forEach((item, index) => {
      candidates.push({
        candidateId: `alignment-${index + 1}-${item.ref}`,
        candidateType: "PLANNING_IMPLICATION",
        summary: item.suggested_chain || item.note || item.plaafp_reflection,
        sourceReviewCaseId: reviewCaseId,
        sourcePlanRefs: [item.ref, ...item.goal_refs].filter(Boolean),
        supportingEvidenceRefs: [],
        proposedPayload: {
          alignmentStatus: item.status,
          plaafpReflection: item.plaafp_reflection,
          goalRefs: item.goal_refs,
          note: item.note,
          suggestedChain: item.suggested_chain,
        },
        status: "candidate",
        requiresHumanApproval: true,
      });
    });

  report.needs_coverage
    .filter((item) => item.coverage_status !== "مغطى")
    .forEach((item, index) => {
      candidates.push({
        candidateId: `need-coverage-${index + 1}`,
        candidateType: "COLLECT_MORE_EVIDENCE",
        summary: item.note || item.need,
        sourceReviewCaseId: reviewCaseId,
        sourcePlanRefs: [item.matched_goal].filter(Boolean),
        supportingEvidenceRefs: [],
        proposedPayload: {
          domain: item.domain,
          need: item.need,
          matchedGoal: item.matched_goal,
          coverageStatus: item.coverage_status,
          suggestedGoal: item.suggested_goal,
        },
        status: "candidate",
        requiresHumanApproval: true,
      });
    });

  return candidates;
}

export function buildReviewIntegrationPackage(input: {
  reviewCaseId: string;
  sourcePlanRef: string;
  report: IepAuditReport;
  learnerRef?: string;
  profileSnapshotVersionUsed?: string;
  profileComparisonFindings?: ReviewProfileComparisonFinding[];
  generatedAt?: string;
}): ReviewIntegrationPackage {
  return {
    protocolVersion: HIMAM_REVIEW_INTEGRATION_PROTOCOL,
    reviewEngine: "smart-iep-engine",
    reviewEngineVersion: "supervisory-v5",
    reviewCaseId: input.reviewCaseId,
    ...(input.learnerRef ? { learnerRef: input.learnerRef } : {}),
    sourcePlanRef: input.sourcePlanRef,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    ...(input.profileSnapshotVersionUsed
      ? { profileSnapshotVersionUsed: input.profileSnapshotVersionUsed }
      : {}),
    interactionModes: [
      "PLAN_QUALITY_GATE",
      ...(input.profileSnapshotVersionUsed ? ["PROFILE_PLAN_CONSISTENCY" as const] : []),
      "LONGITUDINAL_LEARNING",
      "SHARED_KNOWLEDGE_ALIGNMENT",
    ],
    planFindings: planFindingsFromReport(input.report),
    profileComparisonFindings: input.profileComparisonFindings ?? [],
    learningCandidates: learningCandidatesFromReport(input.report, input.reviewCaseId),
    reviewDecision: input.report.review_decision,
    provenanceRefs: [
      `review-case:${input.reviewCaseId}`,
      `report-schema:${input.report.schema_version}`,
      `review-type:${input.report.review_config.review_type}`,
    ],
  };
}
