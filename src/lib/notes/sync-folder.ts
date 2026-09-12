import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { filenameForNote, isNoteFilename, parseNoteFile, serializeNote } from "./markdown-file";
import { isNativeApp, nativeFolder } from "./native-folder";
import type { SyncAdapter, SyncConfig } from "./sync-types";
import type { Note } from "./types";

const HANDLE_DB = "jingjian.folder";
const HANDLE_STORE = "handles";
const HANDLE_KEY = "dir";

type DirectoryPicker = {
  showDirectoryPicker: (options?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
};

type WritableDirectory = FileSystemDirectoryHandle & {
  queryPermission: (descriptor?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
  requestPermission: (descriptor?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
  entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
  removeEntry: (name: string) => Promise<void>;
};

function asDir(handle: FileSystemDirectoryHandle): WritableDirectory {
  return handle as WritableDirectory;
}

function pickerWindow(): DirectoryPicker | null {
  if (typeof window === "undefined") return null;
  const candidate = window as Window & Partial<DirectoryPicker>;
  return typeof candidate.showDirectoryPicker === "function" ? (candidate as DirectoryPicker) : null;
}

export function inEmbeddedFrame(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(HANDLE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openHandleDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, "readwrite");
    tx.objectStore(HANDLE_STORE).put(handle, HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openHandleDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, "readonly");
      const request = tx.objectStore(HANDLE_STORE).get(HANDLE_KEY);
      request.onsuccess = () => resolve((request.result as FileSystemDirectoryHandle) ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

async function ensurePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const dir = asDir(handle);
  const mode = { mode: "readwrite" as const };
  const current = await dir.queryPermission(mode);
  if (current === "granted") return true;
  const next = await dir.requestPermission(mode);
  return next === "granted";
}

function isCancel(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  const message = error instanceof Error ? error.message : String(error);
  return /cancel|abort|用户取消/i.test(message);
}

export async function pickSyncFolder(): Promise<string> {
  if (isNativeApp()) {
    try {
      const result = await nativeFolder.pick();
      return result.name || "已选择的文件夹";
    } catch (error) {
      if (isCancel(error)) {
        throw new DOMException("cancelled", "AbortError");
      }
      throw error instanceof Error ? error : new Error("无法打开系统文件夹");
    }
  }

  if (inEmbeddedFrame()) {
    throw new Error("当前窗口不能打开系统文件夹。请用 Chrome / Edge 单独打开，或在静笺 App 里选择。");
  }

  const picker = pickerWindow();
  if (!picker) {
    throw new Error("当前浏览器不能选择文件夹。请用 Chrome / Edge，或改用静笺服务器 / WebDAV。");
  }

  try {
    const handle = await picker.showDirectoryPicker({ mode: "readwrite" });
    await saveHandle(handle);
    return handle.name;
  } catch (error) {
    if (isCancel(error)) throw new DOMException("cancelled", "AbortError");
    const message = error instanceof Error ? error.message : "";
    if (/security|policy|iframe|cross-origin/i.test(message)) {
      throw new Error("当前窗口没有文件夹权限。请用 Chrome / Edge 单独打开本页。");
    }
    throw error instanceof Error ? error : new Error("无法选择文件夹");
  }
}

async function nativeList(folder: string): Promise<Note[]> {
  try {
    const listing = await Filesystem.readdir({
      path: folder,
      directory: Directory.Documents,
    });
    const notes: Note[] = [];
    for (const entry of listing.files) {
      const name = typeof entry === "string" ? entry : entry.name;
      if (!isNoteFilename(name)) continue;
      const file = await Filesystem.readFile({
        path: `${folder}/${name}`,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
      });
      notes.push(parseNoteFile(String(file.data), name.replace(/\.(md|markdown|txt)$/i, "")));
    }
    return notes;
  } catch {
    await Filesystem.mkdir({
      path: folder,
      directory: Directory.Documents,
      recursive: true,
    });
    return [];
  }
}

async function handleList(handle: FileSystemDirectoryHandle): Promise<Note[]> {
  const notes: Note[] = [];
  for await (const [name, entry] of asDir(handle).entries()) {
    if (entry.kind !== "file" || !isNoteFilename(name)) continue;
    const file = await (entry as FileSystemFileHandle).getFile();
    notes.push(parseNoteFile(await file.text(), name.replace(/\.(md|markdown|txt)$/i, "")));
  }
  return notes;
}

async function nativeTreeList(): Promise<Note[] | null> {
  try {
    const status = await nativeFolder.status();
    if (!status.ok) return null;
    const { files } = await nativeFolder.list();
    return files
      .filter((file) => isNoteFilename(file.name))
      .map((file) => parseNoteFile(file.content, file.name.replace(/\.(md|markdown|txt)$/i, "")));
  } catch {
    return null;
  }
}

export function createFolderAdapter(config: SyncConfig): SyncAdapter {
  const folder = config.folderPath.trim().replace(/^\/+|\/+$/g, "") || "Jingjian";
  const native = isNativeApp();

  return {
    async test() {
      if (native) {
        try {
          const status = await nativeFolder.status();
          if (status.ok) return `本机目录 ${status.name}`;
        } catch {
          // fall through to Documents
        }
        await Filesystem.mkdir({
          path: folder,
          directory: Directory.Documents,
          recursive: true,
        });
        return `本机目录 文档/${folder}`;
      }
      const handle = await loadHandle();
      if (!handle) throw new Error("请先选择保存文件夹");
      if (!(await ensurePermission(handle))) throw new Error("没有文件夹访问权限");
      return `本机目录 ${handle.name}`;
    },
    async list() {
      if (native) {
        const tree = await nativeTreeList();
        if (tree) return tree;
        return nativeList(folder);
      }
      const handle = await loadHandle();
      if (!handle) throw new Error("请先选择保存文件夹");
      if (!(await ensurePermission(handle))) throw new Error("没有文件夹访问权限");
      return handleList(handle);
    },
    async upsert(note) {
      const name = filenameForNote(note);
      const data = serializeNote(note);
      const shortId = note.id.replace(/-/g, "").slice(0, 8);
      if (native) {
        try {
          const status = await nativeFolder.status();
          if (status.ok) {
            await nativeFolder.write({ name, content: data, shortId });
            return;
          }
        } catch {
          // Documents fallback
        }
        await Filesystem.mkdir({
          path: folder,
          directory: Directory.Documents,
          recursive: true,
        });
        await Filesystem.writeFile({
          path: `${folder}/${name}`,
          directory: Directory.Documents,
          data,
          encoding: Encoding.UTF8,
        });
        return;
      }
      const handle = await loadHandle();
      if (!handle) throw new Error("请先选择保存文件夹");
      const file = await handle.getFileHandle(name, { create: true });
      const writable = await file.createWritable();
      await writable.write(data);
      await writable.close();
    },
    async remove(id) {
      const short = id.replace(/-/g, "").slice(0, 8);
      if (native) {
        try {
          const status = await nativeFolder.status();
          if (status.ok) {
            await nativeFolder.remove({ shortId: short });
            return;
          }
        } catch {
          // Documents fallback
        }
        const listing = await Filesystem.readdir({
          path: folder,
          directory: Directory.Documents,
        }).catch(() => ({ files: [] as Array<string | { name: string }> }));
        for (const entry of listing.files) {
          const name = typeof entry === "string" ? entry : entry.name;
          if (!name.replace(/-/g, "").includes(short)) continue;
          await Filesystem.deleteFile({
            path: `${folder}/${name}`,
            directory: Directory.Documents,
          });
        }
        return;
      }
      const handle = await loadHandle();
      if (!handle) return;
      for await (const [name] of asDir(handle).entries()) {
        if (!name.replace(/-/g, "").includes(short)) continue;
        await handle.removeEntry(name);
      }
    },
  };
}
