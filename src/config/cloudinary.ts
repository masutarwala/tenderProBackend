import { v2 as cloudinary } from "cloudinary";
import { env } from "./env";

// CLOUDINARY_URL is cloudinary://<api_key>:<api_secret>@<cloud_name> — we only
// need the cloud_name out of it since the key/secret are supplied separately
// (per the ops team's env var split) and must never be hardcoded.
function cloudNameFromUrl(url: string): string {
  const match = url.match(/@([^/?]+)/);
  if (!match) throw new Error("CLOUDINARY_URL is not in the expected cloudinary://key:secret@cloud_name format");
  return match[1];
}

cloudinary.config({
  cloud_name: cloudNameFromUrl(env.cloudinaryUrl),
  api_key: env.cloudinaryApiKey,
  api_secret: env.cloudinaryApiSecret,
  secure: true,
});

export { cloudinary };
