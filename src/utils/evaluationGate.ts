import { prisma } from "../lib/prisma";

// Evaluation stage advances to Preparation once (a) the static "Go/No-Go
// Decision" checklist row has been submitted as GO, and (b) every *required*
// EVALUATION-phase approval has been given — the other 7 checklist items are
// informational and don't block the transition. Called after both the
// decision is submitted and after each approval is granted, since either can
// be the last condition satisfied.
export async function isEvaluationGatePassed(tenderId: string): Promise<boolean> {
  const decisionItem = await prisma.tenderUpdateChecklist.findFirst({
    where: { tenderId, phase: "EVALUATION", label: "Go/No-Go Decision" },
  });
  if (!decisionItem || !decisionItem.checked || decisionItem.decision !== "GO") return false;

  const requiredApprovals = await prisma.stageApproval.findMany({
    where: { tenderId, phase: "EVALUATION", required: true, removed: false },
  });
  return requiredApprovals.every((a) => a.approved);
}

export async function tryAdvanceFromEvaluation(tenderId: string): Promise<void> {
  const tender = await prisma.tender.findUnique({ where: { id: tenderId } });
  if (!tender || tender.stage !== "EVALUATION") return;
  if (await isEvaluationGatePassed(tenderId)) {
    await prisma.tender.update({ where: { id: tenderId }, data: { stage: "PREPARATION", status: "PENDING" } });
  }
}

// Mirrors the Evaluation gate: Preparation advances to Submission once the
// static "Preparation Done" row is submitted and every required
// PREPARATION-phase approval has been given.
export async function isPreparationGatePassed(tenderId: string): Promise<boolean> {
  const submitItem = await prisma.tenderUpdateChecklist.findFirst({
    where: { tenderId, phase: "PREPARATION", label: "Preparation Done" },
  });
  if (!submitItem || !submitItem.checked) return false;

  const requiredApprovals = await prisma.stageApproval.findMany({
    where: { tenderId, phase: "PREPARATION", required: true, removed: false },
  });
  return requiredApprovals.every((a) => a.approved);
}

export async function tryAdvanceFromPreparation(tenderId: string): Promise<void> {
  const tender = await prisma.tender.findUnique({ where: { id: tenderId } });
  if (!tender || tender.stage !== "PREPARATION") return;
  if (await isPreparationGatePassed(tenderId)) {
    await prisma.tender.update({ where: { id: tenderId }, data: { stage: "SUBMISSION", status: "PENDING" } });
  }
}

// Marks the terminal Submission stage as done — reached once the bid is
// actually submitted or an outcome is recorded. Stage stays SUBMISSION;
// this is what "closed/awarded" means under the new model (no separate
// CLOSED stage value).
export async function tryCompleteSubmission(tenderId: string): Promise<void> {
  const tender = await prisma.tender.findUnique({ where: { id: tenderId } });
  if (!tender || tender.stage !== "SUBMISSION") return;
  // Idempotent: preserves the original submission moment if the outcome is
  // ever re-recorded/edited later, rather than re-stamping the current time.
  await prisma.tender.update({
    where: { id: tenderId },
    data: { status: "COMPLETED", submittedAt: tender.submittedAt ?? new Date() },
  });
}
