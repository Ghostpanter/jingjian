import { formatImageSrc, readImageConfig, type ImageConfig } from "./image-config.ts";
import {
  compressImage,
  extensionFor,
  imageSrcFor,
  putImage,
} from "./image-store.ts";
import { uploadImage } from "./image-upload.ts";
import { wrapAsMarkup } from "./insert-markup.ts";

const DATA_IMAGE_SRC =
  /(?:src)\s*=\s*(?:["']|&quot;)(data:image\/(?:png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=\s]+)(?:["']|&quot;)/gi;

/** Files already on the clipboard (FileList or DataTransferItem list). */
export function clipboardImageFiles(data: DataTransfer): File[] {
  const fromFiles = [...data.files].filter((file) => file.type.startsWith("image/"));
  if (fromFiles.length > 0) return fromFiles;
  const fromItems: File[] = [];
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (file) fromItems.push(file);
  }
  return fromItems;
}

/** Parse data:image/... URLs out of a text/html clipboard payload. */
export function imageDataUrlsFromHtml(html: string): string[] {
  if (!html || !html.toLowerCase().includes("data:image/")) return [];
  const urls: string[] = [];
  const seen = new Set<string>();
  DATA_IMAGE_SRC.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DATA_IMAGE_SRC.exec(html))) {
    const url = (match[1] ?? "").replace(/\s+/g, "");
    if (!url || seen.has(url)) continue;
    // Browsers accept DATA:IMAGE/…; keep a canonical lowercase form for dedupe/fetch.
    const canonical = url.replace(/^data:image\/([a-z0-9+.-]+)/i, (_all, type: string) => `data:image/${type.toLowerCase()}`);
    if (seen.has(canonical)) continue;
    seen.add(url);
    seen.add(canonical);
    urls.push(canonical);
    if (urls.length >= 8) break;
  }
  return urls;
}

/** data:image/... URLs embedded in text/html (common when Android pastes a screenshot). */
export function clipboardImageDataUrls(data: DataTransfer): string[] {
  return imageDataUrlsFromHtml(data.getData("text/html"));
}

/**
 * Prefer inserting clipboard images over plain text when the paste is clearly a
 * screenshot / image (file items, or HTML data-URL with little plain text).
 */
export function shouldInsertClipboardImages(
  data: DataTransfer,
  files: File[],
  dataUrls: string[],
): boolean {
  if (files.length > 0) return true;
  if (dataUrls.length === 0) return false;
  const plain = data.getData("text/plain").trim();
  if (!plain) return true;
  // Filename-ish or short caption next to a pasted image.
  if (plain.length < 48 && !plain.includes("\n")) return true;
  return false;
}

export async function filesFromDataUrls(urls: string[]): Promise<File[]> {
  const out: File[] = [];
  for (const [index, url] of urls.entries()) {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const mime = blob.type || "image/png";
      if (!mime.startsWith("image/")) continue;
      const ext = extensionFor(mime, "paste.png");
      out.push(new File([blob], `paste-${index + 1}.${ext}`, { type: mime }));
    } catch {
      // Bad data URL — skip.
    }
  }
  return out;
}

function looksLikeImageUrl(value: string): boolean {
  return /^https?:\/\/\S+\.(png|jpe?g|gif|webp|bmp)(\?\S*)?$/i.test(value.trim());
}

export function insertMarkup(
  source: string,
  start: number,
  end: number,
  alt: string,
  href: string,
): { value: string; cursor: number } {
  return wrapAsMarkup(source, start, end, alt, href, true);
}

export async function storeLocalImage(file: Blob, name: string): Promise<string> {
  const compressed = await compressImage(file, name);
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const ext = extensionFor(compressed.mime, compressed.name);
  await putImage({
    id,
    name: compressed.name,
    mime: compressed.mime,
    blob: compressed.blob,
  });
  return imageSrcFor(id, ext);
}

async function fetchRemoteImage(url: string): Promise<{ blob: Blob; name: string } | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) return null;
    const name = url.split("/").pop()?.split("?")[0] || "image.jpg";
    return { blob, name };
  } catch {
    return null;
  }
}

export async function resolveInsertedImage(
  input: { file?: Blob; name?: string; url?: string },
  config: ImageConfig = readImageConfig(),
): Promise<string> {
  const originalUrl = input.url?.trim() ?? "";
  const isRemote = Boolean(originalUrl) && /^https?:\/\//i.test(originalUrl);
  const apply = isRemote ? config.applyToRemote : config.applyToLocal;
  const shouldUpload =
    config.insertAction === "upload" && config.uploader !== "none" && apply;
  const shouldCopy = config.insertAction === "copy" && apply;

  let blob = input.file;
  let name = input.name || "image.jpg";
  if (!blob && originalUrl) {
    if (!shouldUpload && !shouldCopy) return originalUrl;
    const remote = await fetchRemoteImage(originalUrl);
    if (!remote) return originalUrl;
    blob = remote.blob;
    name = remote.name;
  }
  if (!blob) throw new Error("没有可插入的图片");

  if (shouldUpload) {
    const compressed = await compressImage(blob, name);
    return uploadImage(config, compressed.blob, compressed.name);
  }

  const stored = await storeLocalImage(blob, name);
  return formatImageSrc(stored, config);
}

export async function insertImageAtCursor(
  source: string,
  start: number,
  end: number,
  file: Blob,
  name: string,
  alt = "",
): Promise<{ value: string; cursor: number; src: string }> {
  const src = await resolveInsertedImage({ file, name });
  const next = insertMarkup(source, start, end, alt || name.replace(/\.[^.]+$/, ""), src);
  return { ...next, src };
}

export { looksLikeImageUrl };
