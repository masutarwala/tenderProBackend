import app from "./app";
import { env } from "./config/env";
import { fileService } from "./services/fileService";

fileService
  .cleanTempFolder()
  .catch((err) => console.error("Failed to clean temp upload folder on startup", err))
  .finally(() => {
    app.listen(env.port, () => {
      console.log(`TenderPro API listening on http://localhost:${env.port}`);
    });
  });
