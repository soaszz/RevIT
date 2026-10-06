/**
 * IndexedDB storage helper for local-only planner attachments (PDFs, Images).
 * Completely client-side; zero network/database bandwidth.
 */

const DB_NAME = "revit_planner_attachments_db";
const DB_VERSION = 1;
const STORE_NAME = "attachments";

export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB limit per file
export const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type StoredAttachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  blob: Blob;
  createdAt: string;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      return reject(new Error("IndexedDB is not supported in this browser"));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open IndexedDB"));
  });
}

export async function storeAttachment(id: string, file: File | Blob, name: string): Promise<void> {
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    throw new Error(`File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Max size is 10MB.`);
  }

  const type = file.type || "application/octet-stream";
  if (!ALLOWED_ATTACHMENT_MIME_TYPES.has(type) && !name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Only PDF, JPG, PNG, and WebP attachments are supported.");
  }

  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      const record: StoredAttachment = {
        id,
        name,
        type,
        size: file.size,
        blob: file,
        createdAt: new Date().toISOString(),
      };

      const putRequest = store.put(record);
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error || new Error("Storage quota exceeded or failed to save file."));
      tx.onabort = () => reject(tx.error || new Error("Transaction aborted"));
    } catch (err) {
      reject(err);
    }
  });
}

export async function getAttachment(id: string): Promise<StoredAttachment | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("Failed to retrieve attachment"));
    });
  } catch {
    return null;
  }
}

export async function deleteAttachment(id: string): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error("Failed to delete attachment"));
    });
  } catch {
    // Ignore deletion failures gracefully
  }
}

/**
 * Creates an object URL for preview or download.
 * Remember to call URL.revokeObjectURL() when done.
 */
export async function getAttachmentUrl(id: string): Promise<string | null> {
  const attachment = await getAttachment(id);
  if (!attachment || !attachment.blob) return null;
  return URL.createObjectURL(attachment.blob);
}
