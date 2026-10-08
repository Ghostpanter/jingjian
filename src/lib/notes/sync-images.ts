import { getImage, putImage } from "./image-store.ts";
import { serializeNote, type SyncedImagePayload } from "./markdown-file.ts";
import type { Note } from "./types.ts";

const MAX_IMAGE_BYTES = 1_800_000;

export function imageIdsIn(content: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const re = /(?:images\/|jingjian-img:\/\/)([a-z0-9-]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content))) {
    const id = match[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const step = 0x8000;
  for (let index = 0; index < bytes.length; index += step) {
    binary += String.fromCharCode(...bytes.subarray(index, index + step));
  }
  return btoa(binary);
}

function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return new Blob([copy], { type: mime || "application/octet-stream" });
}

export async function serializeNoteWithImages(note: Note): Promise<string> {
  const text = serializeNote(note);
  const ids = imageIdsIn(note.content);
  if (ids.length === 0) return text;
  const lines: string[] = [];
  for (const id of ids) {
    let stored: Awaited<ReturnType<typeof getImage>> = null;
    try {
      stored = await getImage(`images/${id}`);
    } catch {
      stored = null;
    }
    if (!stored?.blob || stored.blob.size > MAX_IMAGE_BYTES) continue;
    const mime = (stored.mime || "image/jpeg").replace(/\s+/g, "") || "image/jpeg";
    lines.push(`${id} ${mime} ${await blobToBase64(stored.blob)}`);
  }
  if (lines.length === 0) return text;
  return `${text}\n%%JINGJIAN-IMAGES%%\n${lines.join("\n")}\n%%END-JINGJIAN-IMAGES%%\n`;
}

export async function persistSyncedImages(images: Map<string, SyncedImagePayload[]>) {
  for (const rows of images.values()) {
    for (const row of rows) {
      try {
        const existing = await getImage(`images/${row.id}`);
        if (existing) continue;
        await putImage({
          id: row.id,
          name: row.id,
          mime: row.mime || "image/jpeg",
          blob: base64ToBlob(row.base64, row.mime || "image/jpeg"),
        });
      } catch {
        // IndexedDB unavailable, or this blob is not a valid image.
      }
    }
  }
}
