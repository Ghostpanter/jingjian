import path from "node:path";

/** Flat sync-folder names only — strip any path segments / traversal. */
export function safeFolderFileName(name) {
  const base = path.basename(String(name || "未命名.md").replace(/\\/g, "/"));
  if (!base || base === "." || base === "..") return "未命名.md";
  return base;
}

export function isInside(root, target) {
  const rel = path.relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export function openExternalSafe(url, open) {
  if (/^https?:\/\//i.test(String(url || ""))) {
    open(url);
    return true;
  }
  return false;
}
