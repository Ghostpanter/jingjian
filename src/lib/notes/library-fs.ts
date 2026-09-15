import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { utf8, uint8ToBase64 } from "./bytes.ts";
import { desktopApi, isDesktopApp } from "./desktop.ts";
import { isCancelled, pickExportDestination, writeExportDestination } from "./export-save.ts";
import { filenameForNote } from "./markdown-file.ts";
import { normalizeFolder } from "./folder-tree.ts";
import { isNativeApp, nativeFolder } from "./native-folder.ts";
import { contentHash, shouldAutosave, type SaveRecord } from "./save-hash.ts";
import type { Note } from "./types.ts";

export { contentHash, shouldAutosave, type SaveRecord };

const SAVE_KEY = "jingjian.save.v1";
const LIBRARY = "jingjian";

function readSaveMap(): Record<string, SaveRecord> {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, SaveRecord>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeSaveMap(map: Record<string, SaveRecord>) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(map));
  } catch {
    // private mode
  }
}

export function saveRecordFor(id: string): SaveRecord | null {
  return readSaveMap()[id] ?? null;
}

function putSaveRecord(id: string, record: SaveRecord) {
  const map = readSaveMap();
  map[id] = record;
  writeSaveMap(map);
}

function safeParts(relative: string): string[] {
  return normalizeFolder(relative)
    .split("/")
    .filter((part) => part && part !== "." && part !== "..");
}

function libraryRelative(note: Note): string {
  const folder = normalizeFolder(note.folder ?? "");
  const name = filenameForNote(note);
  return folder ? `${folder}/${name}` : name;
}

async function opfsJingjian(): Promise<FileSystemDirectoryHandle | null> {
  const storage = (
    navigator as Navigator & {
      storage?: { getDirectory?: () => Promise<FileSystemDirectoryHandle> };
    }
  ).storage;
  if (!storage?.getDirectory) return null;
  const root = await storage.getDirectory();
  return root.getDirectoryHandle(LIBRARY, { create: true });
}

async function opfsWalk(
  relative: string,
  file: boolean,
): Promise<{ dir: FileSystemDirectoryHandle; name: string } | null> {
  const root = await opfsJingjian();
  if (!root) return null;
  const parts = safeParts(relative);
  const name = file ? (parts.pop() ?? "") : "";
  let dir = root;
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create: true });
  }
  return { dir, name };
}

async function ensureNativePermission() {
  try {
    await Filesystem.requestPermissions();
  } catch {
    // older devices may not expose the call
  }
}

export async function ensureLibraryRoot(): Promise<string> {
  if (isDesktopApp()) {
    const api = desktopApi();
    if (!api?.libraryEnsure) return LIBRARY;
    const result = await api.libraryEnsure();
    return result.path || LIBRARY;
  }
  if (isNativeApp()) {
    try {
      const result = await nativeFolder.ensureLibrary();
      return result.path || `文档/${LIBRARY}`;
    } catch {
      await ensureNativePermission();
      await Filesystem.mkdir({
        path: LIBRARY,
        directory: Directory.Documents,
        recursive: true,
      });
      return `文档/${LIBRARY}`;
    }
  }
  await opfsJingjian();
  return LIBRARY;
}

export async function ensureFolderOnDisk(folder: string): Promise<void> {
  const relative = normalizeFolder(folder);
  if (!relative) {
    await ensureLibraryRoot();
    return;
  }
  if (isDesktopApp()) {
    await desktopApi()?.libraryMkdir?.({ relative });
    return;
  }
  if (isNativeApp()) {
    try {
      await nativeFolder.mkdirLibrary({ relative });
      return;
    } catch {
      await ensureNativePermission();
      await Filesystem.mkdir({
        path: `${LIBRARY}/${relative}`,
        directory: Directory.Documents,
        recursive: true,
      });
      return;
    }
  }
  await opfsWalk(relative, false);
}

export async function removeFolderOnDisk(folder: string): Promise<void> {
  const relative = normalizeFolder(folder);
  if (!relative) return;
  if (isDesktopApp()) {
    await desktopApi()?.libraryRmdir?.({ relative });
    return;
  }
  if (isNativeApp()) {
    try {
      await nativeFolder.rmdirLibrary({ relative });
      return;
    } catch {
      await Filesystem.rmdir({
        path: `${LIBRARY}/${relative}`,
        directory: Directory.Documents,
        recursive: true,
      });
      return;
    }
  }
  const walked = await opfsWalk(relative, false);
  if (!walked) return;
  const parentParts = safeParts(relative);
  const name = parentParts.pop();
  if (!name) return;
  const parent = await opfsWalk(parentParts.join("/"), false);
  await parent?.dir.removeEntry(name, { recursive: true }).catch(() => undefined);
}

async function removeLibraryRelative(relative: string): Promise<void> {
  const parts = safeParts(relative).join("/");
  if (!parts) return;
  if (isDesktopApp()) {
    await desktopApi()?.libraryRemove?.({ relative: parts });
    return;
  }
  if (isNativeApp()) {
    try {
      await nativeFolder.removeLibrary({ relative: parts });
      return;
    } catch {
      await Filesystem.deleteFile({
        path: `${LIBRARY}/${parts}`,
        directory: Directory.Documents,
      }).catch(() => undefined);
      return;
    }
  }
  const walked = await opfsWalk(parts, true);
  if (!walked?.name) return;
  await walked.dir.removeEntry(walked.name).catch(() => undefined);
}

async function writeLibraryRelative(relative: string, content: string): Promise<string> {
  const parts = safeParts(relative).join("/");
  if (isDesktopApp()) {
    const result = await desktopApi()?.libraryWrite?.({ relative: parts, content });
    return result?.path || `文档/${LIBRARY}/${parts}`;
  }
  if (isNativeApp()) {
    try {
      const result = await nativeFolder.writeLibrary({ relative: parts, content });
      return result.path || `文档/${LIBRARY}/${parts}`;
    } catch {
      await ensureNativePermission();
      const folder = parts.includes("/") ? parts.slice(0, parts.lastIndexOf("/")) : "";
      if (folder) {
        await Filesystem.mkdir({
          path: `${LIBRARY}/${folder}`,
          directory: Directory.Documents,
          recursive: true,
        });
      }
      await Filesystem.writeFile({
        path: `${LIBRARY}/${parts}`,
        directory: Directory.Documents,
        data: content,
        encoding: Encoding.UTF8,
      });
      return `文档/${LIBRARY}/${parts}`;
    }
  }
  const walked = await opfsWalk(parts, true);
  if (!walked?.name) throw new Error("无法保存到文档");
  const handle = await walked.dir.getFileHandle(walked.name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
  return `${LIBRARY}/${parts}`;
}

export async function saveNoteToLibrary(note: Note): Promise<string> {
  await ensureLibraryRoot();
  const relative = libraryRelative(note);
  const folder = normalizeFolder(note.folder ?? "");
  if (folder) await ensureFolderOnDisk(folder);
  const previous = saveRecordFor(note.id);
  if (previous && previous.relative === false) {
    await writeExistingPath(previous.path, note.content);
    putSaveRecord(note.id, {
      path: previous.path,
      hash: contentHash(note.content),
      relative: false,
    });
    return previous.path;
  }
  if (previous?.relative && previous.path && previous.path !== relative) {
    await removeLibraryRelative(previous.path).catch(() => undefined);
  }
  const saved = await writeLibraryRelative(relative, note.content);
  putSaveRecord(note.id, {
    path: relative,
    hash: contentHash(note.content),
    relative: true,
  });
  return saved;
}

async function writeExistingPath(path: string, content: string): Promise<string> {
  if (isDesktopApp() && desktopApi()?.writeFile) {
    await desktopApi()!.writeFile!({
      filePath: path,
      base64: uint8ToBase64(utf8(content)),
      mime: "text/markdown",
    });
    return path;
  }
  if (isNativeApp() && /^content:|^file:/i.test(path)) {
    await nativeFolder.writeSaveFile({
      uri: path,
      name: path.split("/").pop() || "note.md",
      mime: "text/markdown",
      data: uint8ToBase64(utf8(content)),
    });
    return path;
  }
  return writeLibraryRelative(path, content);
}

export async function saveNoteAs(note: Note): Promise<string> {
  const filename = filenameForNote(note);
  const dest = await pickExportDestination(filename, "text/markdown;charset=utf-8");
  const path = await writeExportDestination(dest, utf8(note.content));
  putSaveRecord(note.id, {
    path,
    hash: contentHash(note.content),
    relative: false,
  });
  return path;
}

export async function autosaveNoteIfChanged(note: Note | null): Promise<string | null> {
  if (!note) return null;
  if (!shouldAutosave(note.content, saveRecordFor(note.id))) return null;
  return saveNoteToLibrary(note);
}

export async function persistMovedNote(note: Note): Promise<void> {
  const folder = normalizeFolder(note.folder ?? "");
  if (folder) await ensureFolderOnDisk(folder);
  if (!saveRecordFor(note.id)) return;
  await saveNoteToLibrary(note);
}

export { isCancelled as isLibraryCancelled };

