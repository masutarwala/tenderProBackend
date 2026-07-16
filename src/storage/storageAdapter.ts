// Storage abstraction so the SharePoint/Microsoft Graph implementation can be
// swapped in later without touching any module code. See localDiskStorage.ts
// for the implementation currently active in dev.

export interface StoredFile {
  storageKey: string;
  fileName: string;
  mimeType?: string;
  sizeBytes: number;
}

export interface StorageAdapter {
  upload(folder: string, fileName: string, buffer: Buffer, mimeType?: string): Promise<StoredFile>;
  download(storageKey: string): Promise<Buffer>;
  list(folder: string): Promise<string[]>;
  delete(storageKey: string): Promise<void>;
}
