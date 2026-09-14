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

export function buildFileTree(notes: Note[], extraFolders: string[] = []): TreeNode[] {
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
    .sort((a, b) => b.updatedAt - a.updatedAt);

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
