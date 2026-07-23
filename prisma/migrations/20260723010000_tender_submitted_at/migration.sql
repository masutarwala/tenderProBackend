-- Adds Tender.submittedAt, stamped automatically when the Win/Lose outcome is
-- recorded (see tryCompleteSubmission in evaluationGate.ts).
ALTER TABLE "Tender" ADD COLUMN "submittedAt" TIMESTAMP(3);
