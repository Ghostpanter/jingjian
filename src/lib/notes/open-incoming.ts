import { parseNoteFile } from "./markdown-file.ts";
import type { Note } from "./types.ts";

export type IncomingKind =
  | "markdown"
  | "txt"
  | "epub"
  | "image"
  | "text"
  | "unknown";

export function classifyIncoming(name: string, mime = ""): IncomingKind {
  const file = name.trim().toLowerCase();
  const type = mime.trim().toLowerCase();
  if (file.endsWith(".epub") || type.includes("epub")) return "epub";
  if (
    file.endsWith(".md") ||
    file.endsWith(".markdown") ||
    type.includes("markdown")
  ) {
    return "markdown";
  }
  if (file.endsWith(".txt")) return "txt";
  if (type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file)) {
    return "image";
  }
  if (type === "text/plain" || type.startsWith("text/")) return "text";
  return "unknown";
}

export function stableIncomingId(source: string): string {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, "0");
  return `open-${hex}${source.length.toString(16).padStart(4, "0")}-a1b2-4c3d-8e9f-0123456789ab`;
}

export function noteFromIncoming(
  raw: string,
  kind: IncomingKind,
  fallbackId: string,
): Note {
  const content = raw.replace(/^\uFEFF/, "");
  if (kind === "txt" || kind === "text") {
    const now = Date.now();
    return {
      id: fallbackId,
      content,
      createdAt: now,
      updatedAt: now,
      format: "txt",
    };
  }
  return parseNoteFile(content, fallbackId);
}
