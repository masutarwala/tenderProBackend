// Single source of truth for tender pipeline progress: one Stage
// (Evaluation -> Preparation -> Submission) and one Status (Pending/Completed)
// per tender, replacing the old Prospect/Opportunity transition tables.

export type TenderStage = "EVALUATION" | "PREPARATION" | "SUBMISSION";
export type TenderStatus = "PENDING" | "COMPLETED";

const STAGE_ORDER: TenderStage[] = ["EVALUATION", "PREPARATION", "SUBMISSION"];

export function nextStage(stage: TenderStage): TenderStage {
  const i = STAGE_ORDER.indexOf(stage);
  return STAGE_ORDER[Math.min(i + 1, STAGE_ORDER.length - 1)];
}
