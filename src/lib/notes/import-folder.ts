import { isDesktopApp, desktopApi } from "./desktop.ts";
import { isImportableNoteName, normalizeFolder } from "./folder-tree.ts";
import { isNativeApp, nativeFolder } from "./native-folder.ts";

export type ImportFolderFile = {
  name: string;
  relativePath: string;
  content: string;
};

export type ImportFolderResult =
  | { kind: "files"; files: ImportFolderFile[]; folder: string }
  | { kind: "empty"; folder: string }
  | { kind: "input" };

const MAX_IMPORT_FILES = 400;

function asCancelled(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof DOMException && error.name === "AbortError") return true;
  const message = error instanceof Error ? error.message : String(error);
  return /cancel|abort|取消/i.test(message);
}

export { asCancelled as isImportCancelled };

async function walkDirectoryHandle(
  handle: FileSystemDirectoryHandle,
  prefix: string,
  out: ImportFolderFile[],
): Promise<void> {
  if (out.length >= MAX_IMPORT_FILES) return;
  const iterable = handle as FileSystemDirectoryHandle & {
    values: () => AsyncIterable<FileSystemHandle>;
  };
  for await (const entry of iterable.values()) {
    if (!entry.name || entry.name.startsWith(".")) continue;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === "directory") {
      await walkDirectoryHandle(entry as FileSystemDirectoryHandle, relative, out);
      continue;
    }
    if (entry.kind !== "file" || !isImportableNoteName(entry.name)) continue;
    const file = await (entry as FileSystemFileHandle).getFile();
    out.push({
      name: entry.name,
      relativePath: relative,
      content: await file.text(),
    });
    if (out.length >= MAX_IMPORT_FILES) return;
  }
}

async function pickWithDirectoryPicker(): Promise<ImportFolderResult | null> {
  const picker = (
    window as Window & {
      showDirectoryPicker?: (options?: { mode?: "read" }) => Promise<FileSystemDirectoryHandle>;
    }
  ).showDirectoryPicker;
  if (typeof picker !== "function") return null;
  const handle = await picker({ mode: "read" });
  const root = normalizeFolder(handle.name) || "导入";
  const files: ImportFolderFile[] = [];
  await walkDirectoryHandle(handle, root, files);
  if (files.length === 0) return { kind: "empty", folder: root };
  return { kind: "files", files, folder: root };
}

export async function pickImportFolder(): Promise<ImportFolderResult> {
  if (isNativeApp()) {
    const result = await nativeFolder.pickImportFolder();
    const folder = normalizeFolder(result.name) || "导入";
    const files = (result.files ?? []).filter((file) =>
      isImportableNoteName(file.relativePath || file.name),
    );
    if (files.length === 0) return { kind: "empty", folder };
    return { kind: "files", files, folder };
  }

  const desktop = desktopApi();
  if (isDesktopApp() && desktop?.pickImportFolder) {
    const result = await desktop.pickImportFolder();
    const folder = normalizeFolder(result.name) || "导入";
    const files = (result.files ?? []).filter((file) =>
      isImportableNoteName(file.relativePath || file.name),
    );
    if (files.length === 0) return { kind: "empty", folder };
    return { kind: "files", files, folder };
  }

  try {
    const picked = await pickWithDirectoryPicker();
    if (picked) return picked;
  } catch (error) {
    if (asCancelled(error)) throw error;
  }

  return { kind: "input" };
}

