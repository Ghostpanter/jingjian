import { uint8ToBase64 } from "./bytes";
import { isNativeApp, nativeFolder } from "./native-folder";

type DesktopApi = {
  saveFile(options: {
    filename: string;
    base64: string;
    mime: string;
  }): Promise<string>;
};

function desktopApi(): DesktopApi | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { jingjianDesktop?: DesktopApi }).jingjianDesktop;
}

function isCancelled(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof DOMException && error.name === "AbortError") return true;
  const message = error instanceof Error ? error.message : String(error);
  return /cancel|abort|取消/i.test(message);
}

export { isCancelled };

async function saveWithPicker(
  filename: string,
  bytes: Uint8Array,
  mime: string,
): Promise<string | null> {
  const picker = (
    window as Window & {
      showSaveFilePicker?: (options: {
        suggestedName?: string;
        types?: Array<{ description: string; accept: Record<string, string[]> }>;
      }) => Promise<{
        name: string;
        createWritable: () => Promise<{
          write: (data: Blob | BufferSource) => Promise<void>;
          close: () => Promise<void>;
        }>;
      }>;
    }
  ).showSaveFilePicker;
  if (typeof picker !== "function") return null;
  const ext = filename.includes(".") ? `.${filename.split(".").pop()}` : "";
  const type = mime.split(";")[0] || "application/octet-stream";
  const handle = await picker({
    suggestedName: filename,
    types: ext
      ? [{ description: filename, accept: { [type]: [ext] } }]
      : undefined,
  });
  const writable = await handle.createWritable();
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  await writable.write(copy);
  await writable.close();
  return handle.name || filename;
}

function downloadBlob(filename: string, bytes: Uint8Array, mime: string): string {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
  return filename;
}

export async function saveExportedFile(
  filename: string,
  bytes: Uint8Array,
  mime: string,
): Promise<string> {
  const desktop = desktopApi();
  if (desktop) {
    return desktop.saveFile({
      filename,
      base64: uint8ToBase64(bytes),
      mime,
    });
  }

  if (isNativeApp()) {
    const result = await nativeFolder.saveFile({
      name: filename,
      mime,
      data: uint8ToBase64(bytes),
    });
    return result.uri || result.name || filename;
  }

  try {
    const picked = await saveWithPicker(filename, bytes, mime);
    if (picked) return picked;
  } catch (error) {
    if (isCancelled(error)) throw error;
  }

  return downloadBlob(filename, bytes, mime);
}
