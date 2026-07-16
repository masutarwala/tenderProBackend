import fs from "fs/promises";
import path from "path";
import { env } from "../config/env";
import { StorageAdapter, StoredFile } from "./storageAdapter";

// Active storage implementation for local dev. Mirrors the SharePoint folder
// layout from spec §8 (/TenderPro/Tenders/{id}/, /EMD/Payment/{id}/, etc.) so
// that swapping to a Microsoft Graph-backed adapter later is a drop-in change:
// storageKey stays a relative "folder/fileName" path in both cases.
class LocalDiskStorage implements StorageAdapter {
  private root = path.resolve(env.uploadDir);

  private async ensureDir(dir: string) {
    await fs.mkdir(dir, { recursive: true });
  }

  async upload(folder: string, fileName: string, buffer: Buffer, mimeType?: string): Promise<StoredFile> {
    const dir = path.join(this.root, folder);
    await this.ensureDir(dir);
    const safeName = `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
    const filePath = path.join(dir, safeName);
    await fs.writeFile(filePath, buffer);
    return {
      storageKey: path.posix.join(folder, safeName),
      fileName,
      mimeType,
      sizeBytes: buffer.length,
    };
  }

  async download(storageKey: string): Promise<Buffer> {
    return fs.readFile(path.join(this.root, storageKey));
  }

  async list(folder: string): Promise<string[]> {
    const dir = path.join(this.root, folder);
    try {
      return await fs.readdir(dir);
    } catch {
      return [];
    }
  }

  async delete(storageKey: string): Promise<void> {
    await fs.rm(path.join(this.root, storageKey), { force: true });
  }
}

export const storageAdapter: StorageAdapter = new LocalDiskStorage();
