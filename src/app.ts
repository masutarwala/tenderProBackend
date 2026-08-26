import express from "express";
import cors from "cors";
import { errorHandler } from "./middleware/errorHandler";

import authRoutes from "./modules/auth/auth.routes";
import usersRoutes from "./modules/users/users.routes";
import documentsRoutes from "./modules/documents/documents.routes";
import filesRoutes from "./modules/files/files.routes";
import tendersRoutes from "./modules/tenders/tenders.routes";
import tasksRoutes from "./modules/tasks/tasks.routes";
import taskTemplatesRoutes from "./modules/taskTemplates/taskTemplates.routes";
import commentsRoutes from "./modules/comments/comments.routes";
import outcomesRoutes from "./modules/outcomes/outcomes.routes";
import reportsRoutes from "./modules/reports/reports.routes";
import { customersRouter } from "./modules/customers/customers.routes";
import loginActivityRoutes from "./modules/loginActivity/loginActivity.routes";

const app = express();

app.use(cors({
  origin: "*", // allow all origins (or specify your frontend URL here)
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/documents", documentsRoutes);
app.use("/api/files", filesRoutes);
app.use("/api/tenders", tendersRoutes);
app.use("/api/tasks", tasksRoutes);
app.use("/api/task-templates", taskTemplatesRoutes);
app.use("/api/comments", commentsRoutes);
app.use("/api/outcomes", outcomesRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/customers", customersRouter);
app.use("/api/login-activity", loginActivityRoutes);

app.use(errorHandler);

export default app;
