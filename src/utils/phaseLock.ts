import { TenderStage } from "./tenderStateMachine";

// Once a tender has moved past a given checklist phase, that phase's
// approvals/queries/documents become a closed record — no more adding,
// editing, or approving. Shared by stageApprovals/tenderQueries/documents
// routes (previously each reimplemented this identically).
export function isPhaseLocked(stage: TenderStage, phase: "EVALUATION" | "PREPARATION"): boolean {
  if (phase === "EVALUATION") return stage !== "EVALUATION";
  return stage === "SUBMISSION";
}
