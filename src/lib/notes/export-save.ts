import { uint8ToBase64 } from "./bytes";
import { isNativeApp, nativeFolder } from "./native-folder";

type FilePickerHandle = {
  name: string;
  createWritable: () => Promise<{
    write: (data: Blob | BufferSource) => Promise<void>;
    close: () => Promise<void>;
  }>;
};

type DesktopApi = {
  saveFile?(options: {
    filename: string;
    base64: string;
    mime: string;
  }): Promise<string>;
  pickSavePath?(options: { filename: string; mime: string }): Promise<string>;
  writeFile?(options: {
    filePath: string;
    base64: string;
    mime: string;
  }): Promise<string>;
};

export type ExportDestination =
  | { kind: "electron"; filename: string; mime: string; path: string }
  | { kind: "native"; filename: string; mime: string; uri: string }
  | { kind: "picker"; filename: string; mime: string; handle: FilePickerHandle }
  | { kind: "legacy"; filename: string; mime: string }
  | { kind: "download"; filename: string; mime: string };

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

async function pickWithFilePicker(
  filename: string,
  mime: string,
): Promise<FilePickerHandle | null> {
  const picker = (
    window as Window & {
      showSaveFilePicker?: (options: {
        suggestedName?: string;
        types?: Array<{ description: string; accept: Record<string, string[]> }>;
      }) => Promise<FilePickerHandle>;
    }
  ).showSaveFilePicker;
  if (typeof picker !== "function") return null;
  const ext = filename.includes(".") ? `.${filename.split(".").pop()}` : "";
  const type = mime.split(";")[0] || "application/octet-stream";
  return picker({
    suggestedName: filename,
    types: ext
      ? [{ description: filename, accept: { [type]: [ext] } }]
      : undefined,
  });
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

export async function pickExportDestination(
  filename: string,
  mime: string,
): Promise<ExportDestination> {
  const desktop = desktopApi();
  if (desktop?.pickSavePath) {
    const path = await desktop.pickSavePath({ filename, mime });
    return { kind: "electron", filename, mime, path };
  }
  if (desktop?.saveFile) {
    return { kind: "legacy", filename, mime };
  }

  if (isNativeApp()) {
    const result = await nativeFolder.pickSaveFile({ name: filename, mime });
    return { kind: "native", filename, mime, uri: result.uri };
  }

  try {
    const handle = await pickWithFilePicker(filename, mime);
    if (handle) {
      return {
        kind: "picker",
        filename: handle.name || filename,
        mime,
        handle,
      };
    }
  } catch (error) {
    if (isCancelled(error)) throw error;
  }

  return { kind: "download", filename, mime };
}

export async function writeExportDestination(
  dest: ExportDestination,
  bytes: Uint8Array,
): Promise<string> {
  if (dest.kind === "electron") {
    const desktop = desktopApi();
    if (!desktop?.writeFile) throw new Error("桌面保存不可用");
    await desktop.writeFile({
      filePath: dest.path,
      base64: uint8ToBase64(bytes),
      mime: dest.mime,
    });
    return dest.path;
  }

  if (dest.kind === "native") {
    const result = await nativeFolder.writeSaveFile({
      uri: dest.uri,
      name: dest.filename,
      mime: dest.mime,
      data: uint8ToBase64(bytes),
    });
    return result.uri || result.name || dest.filename;
  }

  if (dest.kind === "picker") {
    const writable = await dest.handle.createWritable();
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    await writable.write(copy);
    await writable.close();
    return dest.handle.name || dest.filename;
  }

  if (dest.kind === "legacy") {
    const desktop = desktopApi();
    if (!desktop?.saveFile) throw new Error("桌面保存不可用");
    return desktop.saveFile({
      filename: dest.filename,
      base64: uint8ToBase64(bytes),
      mime: dest.mime,
    });
  }

  return downloadBlob(dest.filename, bytes, dest.mime);
}

export async function saveExportedFile(
  filename: string,
  bytes: Uint8Array,
  mime: string,
): Promise<string> {
  const dest = await pickExportDestination(filename, mime);
  return writeExportDestination(dest, bytes);
}
