import { readTombstones, writeTombstones } from "./sync-config";
import { createFolderAdapter } from "./sync-folder";
import { mergeNotes, notesFingerprint } from "./sync-merge";
import { createOssAdapter } from "./sync-oss";
import { createServerAdapter } from "./sync-server";
import { imageIdsIn, persistSyncedImages } from "./sync-images";
import { getImage } from "./image-store";
import { takeSyncedImages } from "./markdown-file";
import type { SyncAdapter, SyncConfig, SyncStatus } from "./sync-types";
import { createWebdavAdapter } from "./sync-webdav";
import type { Note } from "./types";

export function createAdapter(config: SyncConfig): SyncAdapter {
  if (config.provider === "webdav") return createWebdavAdapter(config);
  if (config.provider === "folder") return createFolderAdapter(config);
  if (config.provider === "oss") return createOssAdapter(config);
  return createServerAdapter(config);
}

export async function testSync(config: SyncConfig): Promise<string> {
  if (config.provider === "off") return "当前仅保存在本机";
  return createAdapter(config).test();
}

export async function runSync(
  config: SyncConfig,
  local: Note[],
  options?: { activeId?: string | null; protectActive?: boolean },
): Promise<{ notes: Note[]; status: SyncStatus; conflicts: Array<{ local: Note; remote: Note }> }> {
  if (config.provider === "off") {
    return {
      notes: local,
      conflicts: [],
      status: { state: "idle", message: "仅本机", at: null },
    };
  }

  const adapter = createAdapter(config);
  const remote = await adapter.list();
  const syncedImages = takeSyncedImages();
  await persistSyncedImages(syncedImages);
  const merged = mergeNotes({
    local,
    remote,
    tombstones: readTombstones(),
    activeId: options?.activeId ?? null,
    protectActive: options?.protectActive ?? false,
  });
  const uploading = new Set(merged.toUpload.map((note) => note.id));
  for (const note of merged.notes) {
    if (uploading.has(note.id)) continue;
    const ids = imageIdsIn(note.content);
    if (ids.length === 0) continue;
    const remoteIds = new Set((syncedImages.get(note.id) ?? []).map((image) => image.id));
    let missing = false;
    for (const id of ids) {
      if (remoteIds.has(id)) continue;
      const stored = await getImage(`images/${id}`);
      if (stored) {
        missing = true;
        break;
      }
    }
    if (!missing) continue;
    merged.toUpload.push(note);
    uploading.add(note.id);
  }

  for (const note of merged.toUpload) {
    await adapter.upsert(note);
  }
  for (const id of merged.toDeleteRemote) {
    await adapter.remove(id);
  }

  writeTombstones(merged.tombstones);

  const unchanged = notesFingerprint(local) === notesFingerprint(merged.notes);
  const conflicted = merged.conflicts.length;
  return {
    notes: merged.notes,
    conflicts: merged.conflicts,
    status: {
      state: "ok",
      message: conflicted
        ? `${conflicted} 篇有冲突，请选择`
        : unchanged
          ? "已是最新"
          : "同步完成",
      at: Date.now(),
    },
  };
}
