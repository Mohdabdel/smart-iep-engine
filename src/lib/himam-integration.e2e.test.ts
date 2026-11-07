import { describe, expect, it } from "vitest";
import { emptyModelOutput, type IepAuditReport } from "./iep-schema";
import { buildReviewIntegrationPackage } from "./himam-review-adapter";
import { buildReadonlyProfileReviewContext } from "./himam-profile-context";
import {
  HIMAM_REVIEW_INTEGRATION_PROTOCOL,
  type ReviewProfileSnapshot,
} from "./himam-integration-contract";

describe("smart-iep-engine Himam synthetic bridge", () => {
  it("consumes a readonly profile snapshot and emits a review package", () => {
    const snapshot: ReviewProfileSnapshot = {
      protocolVersion: HIMAM_REVIEW_INTEGRATION_PROTOCOL,
      learnerRef: "learner-synthetic-001",
      profileVersion: "profile-v1",
      generatedAt: "2026-11-07T00:00:00.000Z",
      purpose: "PLAN_REVIEW",
      readonly: true,
      acceptedEvidenceSummaries: [
        {
          evidenceRef: "ev-1",
          summary: "أداء وظيفي متحقق في سياق المدرسة مع دعم لفظي خفيف.",
          context: "school",
          supportSummary: "minimal verbal support",
        },
      ],
      acceptedPlanningPriorities: [
        {
          priorityRef: "prio-1",
          summary: "توسيع الأداء إلى سياق مجتمعي.",
          sourceRefs: ["ev-1"],
        },
      ],
      goalHistory: [
        {
          goalRef: "goal-prev-1",
          goalText: "استخدام وسيلة تنقل مألوفة بدعم.",
          status: "completed",
          evidenceRefs: ["ev-1"],
        },
      ],
      acceptedSupportSummaries: [],
    };

    const context = buildReadonlyProfileReviewContext(snapshot);
    expect(context.governance.mayCompareAgainstPlan).toBe(true);
    expect(context.governance.mayMutateProfile).toBe(false);

    const base = emptyModelOutput();
    base.goal_journey.items = [
      {
        ref: "G1",
        previous_goal: "استخدام وسيلة تنقل مألوفة بدعم.",
        progress_in_plaafp: "تحقق في المدرسة.",
        assessment_evidence: "دليل أداء سابق.",
        current_refs: ["G2"],
        category: "maintain_or_generalize",
        isolated_mastery: false,
        recommendation: "الانتقال إلى تعميم الأداء في سياق مجتمعي.",
      },
    ] as any;

    const report = {
      ...base,
      schema_version: 4,
      review_config: { review_type: "supervisory" },
      criteria_results: [],
      revisions: [],
      manual_notes: [],
    } as unknown as IepAuditReport;

    const pkg = buildReviewIntegrationPackage({
      reviewCaseId: "RC-SYNTH-001",
      sourcePlanRef: "synthetic-plan.pdf",
      learnerRef: snapshot.learnerRef,
      profileSnapshotVersionUsed: snapshot.profileVersion,
      report,
      generatedAt: "2026-11-07T00:10:00.000Z",
      profileComparisonFindings: [
        {
          findingId: "pc-1",
          comparisonType: "GOAL_REPEATS_COMPLETED_TARGET",
          summary: "الخطة تعيد هدفًا مكتملًا دون تقدم جديد واضح.",
          profileRefs: ["goal-prev-1"],
          planRefs: ["G2"],
          confidence: "HIGH",
          requiresHumanReview: true,
        },
      ],
    });

    expect(pkg.protocolVersion).toBe(HIMAM_REVIEW_INTEGRATION_PROTOCOL);
    expect(pkg.profileSnapshotVersionUsed).toBe("profile-v1");
    expect(pkg.interactionModes).toContain("PROFILE_PLAN_CONSISTENCY");
    expect(pkg.profileComparisonFindings).toHaveLength(1);
    expect(pkg.learningCandidates.length).toBeGreaterThan(0);
    expect(pkg.learningCandidates[0].requiresHumanApproval).toBe(true);
  });
});
