import { readTombstones, writeTombstones } from "./sync-config";
import { createFolderAdapter } from "./sync-folder";
import { mergeNotes, notesFingerprint } from "./sync-merge";
import { createOssAdapter } from "./sync-oss";
import { createServerAdapter } from "./sync-server";
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
): Promise<{ notes: Note[]; status: SyncStatus }> {
  if (config.provider === "off") {
    return {
      notes: local,
      status: { state: "idle", message: "仅本机", at: null },
    };
  }

  const adapter = createAdapter(config);
  const remote = await adapter.list();
  const merged = mergeNotes({
    local,
    remote,
    tombstones: readTombstones(),
    activeId: options?.activeId ?? null,
    protectActive: options?.protectActive ?? false,
  });

  for (const note of merged.toUpload) {
    await adapter.upsert(note);
  }
  for (const id of merged.toDeleteRemote) {
    await adapter.remove(id);
  }

  writeTombstones(merged.tombstones);

  const unchanged = notesFingerprint(local) === notesFingerprint(merged.notes);
  return {
    notes: merged.notes,
    status: {
      state: "ok",
      message: unchanged ? "已是最新" : "同步完成",
      at: Date.now(),
    },
  };
}
