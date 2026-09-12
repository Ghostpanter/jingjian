const DB_NAME = "jingjian.images.v1";
const STORE = "files";

export type StoredImage = {
  id: string;
  name: string;
  mime: string;
  blob: Blob;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function extensionFor(mime: string, name = ""): string {
  const fromName = name.split(".").pop()?.toLowerCase();
  if (fromName && /^(png|jpe?g|gif|webp|bmp)$/.test(fromName)) {
    return fromName === "jpeg" ? "jpg" : fromName;
  }
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "jpg";
}

export function imageSrcFor(id: string, ext: string): string {
  return `images/${id}.${ext}`;
}

export function idFromSrc(src: string): string | null {
  const trimmed = src.trim().replace(/^\.\//, "");
  const match = trimmed.match(/^(?:images\/|jingjian-img:\/\/)([a-z0-9-]+)/i);
  return match?.[1] ?? null;
}

export async function putImage(image: StoredImage): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(image);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getImage(src: string): Promise<StoredImage | null> {
  const id = idFromSrc(src);
  if (!id) return null;
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(id);
      request.onsuccess = () => resolve((request.result as StoredImage) ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

const blobUrls = new Map<string, string>();

export async function resolveImageSrc(src: string): Promise<string | null> {
  if (src.startsWith("data:image/")) return src;
  const stored = await getImage(src);
  if (!stored) return null;
  const existing = blobUrls.get(stored.id);
  if (existing) return existing;
  const url = URL.createObjectURL(stored.blob);
  blobUrls.set(stored.id, url);
  return url;
}

export async function compressImage(
  file: Blob,
  name = "image.png",
): Promise<{ blob: Blob; mime: string; name: string }> {
  if (typeof createImageBitmap !== "function") {
    return { blob: file, mime: file.type || "image/jpeg", name };
  }
  const bitmap = await createImageBitmap(file);
  const max = 1600;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return { blob: file, mime: file.type || "image/jpeg", name };
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const mime = file.type === "image/png" && file.size < 400_000 ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error("无法压缩图片"))),
      mime,
      0.82,
    );
  });
  const base = name.replace(/\.[^.]+$/, "") || "image";
  const ext = mime === "image/png" ? "png" : "jpg";
  return { blob, mime, name: `${base}.${ext}` };
}
