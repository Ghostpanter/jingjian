import { isOssVendor } from "./sync-oss.ts";
import { DEFAULT_SYNC_CONFIG, type SyncConfig, type SyncProvider } from "./sync-types.ts";

const CONFIG_KEY = "jingjian.sync.v1";
const TOMBSTONE_KEY = "jingjian.sync.tombstones.v1";

function isProvider(value: unknown): value is SyncProvider {
  return (
    value === "off" ||
    value === "server" ||
    value === "webdav" ||
    value === "folder" ||
    value === "oss"
  );
}

export function readSyncConfig(): SyncConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return { ...DEFAULT_SYNC_CONFIG };
    const parsed = JSON.parse(raw) as Partial<SyncConfig>;
    return {
      ...DEFAULT_SYNC_CONFIG,
      ...parsed,
      provider: isProvider(parsed.provider) ? parsed.provider : "off",
      autoSync: parsed.autoSync !== false,
      ossVendor: isOssVendor(parsed.ossVendor) ? parsed.ossVendor : "aliyun",
      ossPathStyle: Boolean(parsed.ossPathStyle),
    };
  } catch {
    return { ...DEFAULT_SYNC_CONFIG };
  }
}

export function writeSyncConfig(config: SyncConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export function readTombstones(): Record<string, number> {
  try {
    const raw = localStorage.getItem(TOMBSTONE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeTombstones(tombstones: Record<string, number>): void {
  localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(tombstones));
}

export function recordTombstone(id: string): void {
  const tombstones = readTombstones();
  tombstones[id] = Date.now();
  writeTombstones(tombstones);
}

export function clearTombstone(id: string): void {
  const tombstones = readTombstones();
  if (!(id in tombstones)) return;
  delete tombstones[id];
  writeTombstones(tombstones);
}
