import express from "express";
import cors from "cors";
import { errorHandler } from "./middleware/errorHandler";

import authRoutes from "./modules/auth/auth.routes";
import usersRoutes from "./modules/users/users.routes";
import rolesRoutes from "./modules/roles/roles.routes";
import customersRoutes from "./modules/customers/customers.routes";
import pqiRoutes from "./modules/pqi/pqi.routes";
import interestCriteriaRoutes from "./modules/interestCriteria/interestCriteria.routes";
import decisionMatrixRoutes from "./modules/decisionMatrix/decisionMatrix.routes";
import documentsRoutes from "./modules/documents/documents.routes";
import tendersRoutes from "./modules/tenders/tenders.routes";
import preliminaryInfoRoutes from "./modules/preliminaryInfo/preliminaryInfo.routes";
import evaluationRoutes from "./modules/evaluation/evaluation.routes";
import opportunitiesRoutes from "./modules/opportunities/opportunities.routes";
import approvalsRoutes from "./modules/approvals/approvals.routes";
import submissionsRoutes from "./modules/submissions/submissions.routes";
import outcomesRoutes from "./modules/outcomes/outcomes.routes";
import emdRoutes from "./modules/emd/emd.routes";
import reportsRoutes from "./modules/reports/reports.routes";
import checklistRoutes from "./modules/checklist/checklist.routes";

export const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/roles", rolesRoutes);
app.use("/api/customers", customersRoutes);
app.use("/api/pqi", pqiRoutes);
app.use("/api/interest-criteria", interestCriteriaRoutes);
app.use("/api/decision-matrices", decisionMatrixRoutes);
app.use("/api/documents", documentsRoutes);
app.use("/api/tenders", tendersRoutes);
app.use("/api/preliminary-info", preliminaryInfoRoutes);
app.use("/api/evaluations", evaluationRoutes);
app.use("/api/opportunities", opportunitiesRoutes);
app.use("/api/approvals", approvalsRoutes);
app.use("/api/submissions", submissionsRoutes);
app.use("/api/outcomes", outcomesRoutes);
app.use("/api/emd", emdRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/checklist", checklistRoutes);

app.use(errorHandler);
