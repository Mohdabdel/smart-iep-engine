import { describe, expect, it } from "vitest";
import { emptyModelOutput, type IepAuditReport } from "./iep-schema";
import { buildReviewIntegrationPackage } from "./himam-review-adapter";
import { HIMAM_REVIEW_INTEGRATION_PROTOCOL, SMART_IEP_HIMAM_INTEGRATION_GOVERNANCE } from "./himam-integration-contract";

describe("Himam review integration", () => {
  it("exports a versioned package without enabling direct profile write-back", () => {
    const report = {
      ...emptyModelOutput(),
      schema_version: 4,
      review_config: { review_type: "supervisory" },
      criteria_results: [],
      revisions: [],
      manual_notes: [],
    } as unknown as IepAuditReport;

    const pkg = buildReviewIntegrationPackage({
      reviewCaseId: "RC-TEST",
      sourcePlanRef: "synthetic-plan.pdf",
      learnerRef: "learner-test",
      report,
      generatedAt: "2026-11-07T00:00:00.000Z",
    });

    expect(pkg.protocolVersion).toBe(HIMAM_REVIEW_INTEGRATION_PROTOCOL);
    expect(pkg.reviewEngine).toBe("smart-iep-engine");
    expect(pkg.reviewCaseId).toBe("RC-TEST");
    expect(pkg.planFindings).toEqual([]);
    expect(pkg.learningCandidates).toEqual([]);
    expect(SMART_IEP_HIMAM_INTEGRATION_GOVERNANCE.automaticPushEnabled).toBe(false);
    expect(SMART_IEP_HIMAM_INTEGRATION_GOVERNANCE.directProfileWriteAllowed).toBe(false);
    expect(SMART_IEP_HIMAM_INTEGRATION_GOVERNANCE.humanApprovalRequiredBeforeProfileImpact).toBe(true);
  });
});
