import { compareNotes, type NoteSort } from "./format.ts";
import type { Note } from "./types.ts";

export type FolderNode = {
  kind: "folder";
  path: string;
  name: string;
  children: TreeNode[];
};

export type NoteNode = {
  kind: "note";
  note: Note;
};

export type TreeNode = FolderNode | NoteNode;

export function normalizeFolder(path: string): string {
  return path
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
}

export function folderName(path: string): string {
  const normalized = normalizeFolder(path);
  if (!normalized) return "";
  return normalized.split("/").pop() || normalized;
}

export function parentFolder(path: string): string {
  const normalized = normalizeFolder(path);
  const parts = normalized.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

export function ancestorFolders(path: string): string[] {
  const normalized = normalizeFolder(path);
  if (!normalized) return [];
  const parts = normalized.split("/");
  const out: string[] = [];
  for (let index = 1; index <= parts.length; index += 1) {
    out.push(parts.slice(0, index).join("/"));
  }
  return out;
}

export function collectFolders(notes: Note[], extra: string[] = []): string[] {
  const set = new Set<string>();
  for (const path of extra) {
    for (const item of ancestorFolders(path)) set.add(item);
  }
  for (const note of notes) {
    if (!note.folder) continue;
    for (const item of ancestorFolders(note.folder)) set.add(item);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export function relativeDir(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = normalized.split("/").filter(Boolean);
  parts.pop();
  return normalizeFolder(parts.join("/"));
}

export function isImportableNoteName(name: string): boolean {
  const file = name.split(/[/\\]/).pop()?.toLowerCase() ?? "";
  if (!file || file.startsWith(".")) return false;
  return /\.(md|markdown|txt)$/i.test(file);
}

export function isUnderFolder(root: string, path: string): boolean {
  const folder = normalizeFolder(root);
  const target = normalizeFolder(path);
  if (!folder || !target) return false;
  return target === folder || target.startsWith(`${folder}/`);
}

export function notesInFolder(notes: Note[], folder: string): Note[] {
  return notes.filter((note) => isUnderFolder(folder, note.folder ?? ""));
}

export function remainingAfterDeleteFolder(
  notes: Note[],
  folders: string[],
  folder: string,
): { notes: Note[]; folders: string[]; removedIds: string[] } {
  const root = normalizeFolder(folder);
  if (!root) return { notes, folders: collectFolders(notes, folders), removedIds: [] };
  const removedIds: string[] = [];
  const nextNotes = notes.filter((note) => {
    if (isUnderFolder(root, note.folder ?? "")) {
      removedIds.push(note.id);
      return false;
    }
    return true;
  });
  const kept = folders.filter((item) => !isUnderFolder(root, item));
  return {
    notes: nextNotes,
    folders: collectFolders(nextNotes, kept),
    removedIds,
  };
}

export function foldersFromImportPaths(relativePaths: string[]): string[] {
  const extra: string[] = [];
  for (const relative of relativePaths) {
    const folder = relativeDir(relative);
    if (folder) extra.push(folder);
  }
  return collectFolders([], extra);
}

export function buildFileTree(
  notes: Note[],
  extraFolders: string[] = [],
  sort: NoteSort = "updated",
): TreeNode[] {
  const folders = collectFolders(notes, extraFolders);
  const folderNodes = new Map<string, FolderNode>();
  for (const path of folders) {
    folderNodes.set(path, {
      kind: "folder",
      path,
      name: folderName(path),
      children: [],
    });
  }

  const roots: TreeNode[] = [];

  function parentList(path: string): TreeNode[] {
    const parent = parentFolder(path);
    if (!parent) return roots;
    return folderNodes.get(parent)?.children ?? roots;
  }

  for (const path of folders) {
    parentList(path).push(folderNodes.get(path)!);
  }

  const loose = notes
    .filter((note) => !note.bookId)
    .sort((a, b) => compareNotes(a, b, sort));

  for (const note of loose) {
    const folder = normalizeFolder(note.folder ?? "");
    if (folder && folderNodes.has(folder)) {
      folderNodes.get(folder)!.children.push({ kind: "note", note });
    } else {
      roots.push({ kind: "note", note });
    }
  }

  return sortTree(roots);
}

function sortTree(nodes: TreeNode[]): TreeNode[] {
  const folders = nodes.filter((node): node is FolderNode => node.kind === "folder");
  const files = nodes.filter((node): node is NoteNode => node.kind === "note");
  folders.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  for (const folder of folders) folder.children = sortTree(folder.children);
  return [...folders, ...files];
}
