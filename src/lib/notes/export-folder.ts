import { notesInFolder, folderName, normalizeFolder } from "./folder-tree.ts";
import { filenameForNote, serializeNote } from "./markdown-file.ts";
import { pickExportDestination, writeExportDestination } from "./export-save.ts";
import { safeFilename } from "./bytes.ts";
import type { Note } from "./types.ts";

export async function exportFolderArchive(
  notes: Note[],
  folder: string,
  onPicked?: () => void,
): Promise<string> {
  const root = normalizeFolder(folder);
  if (!root) throw new Error("文件夹无效");
  const items = notesInFolder(notes, root);
  if (items.length === 0) throw new Error("文件夹是空的");
  const destName = `${safeFilename(folderName(root) || "文件夹")}.zip`;
  const dest = await pickExportDestination(destName, "application/zip");
  onPicked?.();
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  for (const note of items) {
    const relative = normalizeFolder(note.folder ?? "");
    const nested =
      relative === root
        ? filenameForNote(note)
        : `${relative.slice(root.length + 1)}/${filenameForNote(note)}`;
    zip.file(nested, serializeNote(note));
  }
  const bytes = await zip.generateAsync({ type: "uint8array" });
  return writeExportDestination(dest, bytes);
}
