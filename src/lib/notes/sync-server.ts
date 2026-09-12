import { parseNoteFile, serializeNote } from "./markdown-file";
import { joinUrl, request } from "./sync-http";
import type { SyncAdapter, SyncConfig } from "./sync-types";
import type { Note } from "./types";

function headers(config: SyncConfig): HeadersInit {
  return {
    Authorization: `Bearer ${config.serverToken.trim()}`,
    "Content-Type": "application/json",
  };
}

function base(config: SyncConfig): string {
  return config.serverUrl.trim().replace(/\/+$/, "");
}

export function createServerAdapter(config: SyncConfig): SyncAdapter {
  return {
    async test() {
      const response = await request(joinUrl(base(config), "health"), {
        headers: headers(config),
      });
      if (!response.ok) throw new Error(`服务器返回 ${response.status}`);
      const payload = (await response.json()) as { notesDir?: string; noteCount?: number };
      const dir = payload.notesDir ? `，保存路径 ${payload.notesDir}` : "";
      return `已连接${dir}`;
    },
    async list() {
      const response = await request(joinUrl(base(config), "api/notes"), {
        headers: headers(config),
      });
      if (!response.ok) throw new Error(`拉取失败（${response.status}）`);
      const payload = (await response.json()) as { notes?: Array<Note | { raw?: string; id?: string }> };
      return (payload.notes ?? []).map((entry) => {
        if ("content" in entry && typeof entry.content === "string" && entry.id) {
          return entry as Note;
        }
        const raw = (entry as { raw?: string }).raw ?? "";
        return parseNoteFile(raw, (entry as { id?: string }).id || crypto.randomUUID());
      });
    },
    async upsert(note) {
      const response = await request(joinUrl(base(config), "api/notes", note.id), {
        method: "PUT",
        headers: headers(config),
        body: JSON.stringify({
          ...note,
          raw: serializeNote(note),
        }),
      });
      if (!response.ok) throw new Error(`上传失败（${response.status}）`);
    },
    async remove(id) {
      const response = await request(joinUrl(base(config), "api/notes", id), {
        method: "DELETE",
        headers: headers(config),
      });
      if (!response.ok && response.status !== 404) {
        throw new Error(`删除失败（${response.status}）`);
      }
    },
  };
}
