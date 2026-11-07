export * from "./shared/himam-review-contract.v1";

export const SMART_IEP_HIMAM_INTEGRATION_GOVERNANCE = {
  automaticPushEnabled: false,
  profileSnapshotAccessMode: "readonly",
  directProfileWriteAllowed: false,
  learningCandidatesAreFacts: false,
  humanApprovalRequiredBeforeProfileImpact: true,
  diagnosisTransferRequired: false,
} as const;
