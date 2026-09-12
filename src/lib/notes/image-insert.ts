import { formatImageSrc, readImageConfig, type ImageConfig } from "./image-config";
import {
  compressImage,
  extensionFor,
  imageSrcFor,
  putImage,
} from "./image-store";
import { uploadImage } from "./image-upload";
import { wrapAsMarkup } from "./insert-markup";

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
