import "dotenv/config";
import os from "os";
import path from "path";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "12h",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  tempUploadDir: process.env.TEMP_UPLOAD_DIR ?? path.join(os.tmpdir(), "uploads"),
  cloudinaryUrl: required("CLOUDINARY_URL"),
  cloudinaryApiKey: required("CLOUDINARY_API_KEY"),
  cloudinaryApiSecret: required("CLOUDINARY_API_SECRET"),
};
