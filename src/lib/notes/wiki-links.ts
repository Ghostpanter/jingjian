import { firstLineTitle, noteAliases } from "./format.ts";

export type WikiHit = {
  target: string;
  line: string;
};

export type LinkedNote = {
  id: string;
  title: string;
  line: string;
  count: number;
};

export type OutgoingLink = {
  target: string;
  id: string | null;
  line: string;
};

export type NoteLinks = {
  incoming: LinkedNote[];
  outgoing: OutgoingLink[];
};

export type UnlinkedMention = {
  id: string;
  title: string;
  line: string;
  count: number;
};

const SCAN_CAP = 120_000;
const FENCE_LINE = /^(```|~~~)/;
const WIKI = /!?\[\[([^\]|#]+?)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;

function snippet(line: string): string {
  const text = line
    .replace(/!?\[\[([^\]|#]+?)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_all, target: string, alias?: string) =>
      (alias ?? target).trim(),
    )
    .replace(/`[^`]*`/g, " ")
    .replace(/^#{1,6}\s+/, "")
    .replace(/[*_~>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  return text.length > 56 ? `${text.slice(0, 56)}…` : text;
}

export function wikiHits(content: string): WikiHit[] {
  const source = content.length > SCAN_CAP ? content.slice(0, SCAN_CAP) : content;
  const hits: WikiHit[] = [];
  let fence: string | null = null;
  for (const raw of source.split("\n")) {
    const line = raw.replace(/\r$/, "");
    const open = FENCE_LINE.exec(line);
    if (fence) {
      if (line.startsWith(fence)) fence = null;
      continue;
    }
    if (open) {
      fence = open[1];
      continue;
    }
    const prose = line.replace(/`[^`]*`/g, "");
    WIKI.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = WIKI.exec(prose))) {
      const target = match[1].trim();
      if (!target) continue;
      hits.push({ target, line: snippet(line) });
    }
  }
  return hits;
}

/** Titles first, then aliases. A real title is never overwritten by someone else's alias. */
export function titleIndex(notes: { id: string; content: string }[]): Map<string, string> {
  const idByTitle = new Map<string, string>();
  const put = (title: string, id: string) => {
    const key = title.trim().toLowerCase();
    if (!key || key === "未命名笔记" || idByTitle.has(key)) return;
    idByTitle.set(key, id);
  };
  for (const note of notes) put(firstLineTitle(note.content), note.id);
  for (const note of notes) {
    for (const alias of noteAliases(note.content)) put(alias, note.id);
  }
  return idByTitle;
}

function proseForMentions(content: string): string {
  const source = content.length > SCAN_CAP ? content.slice(0, SCAN_CAP) : content;
  let fence: string | null = null;
  const lines: string[] = [];
  for (const raw of source.split("\n")) {
    const line = raw.replace(/\r$/, "");
    const open = FENCE_LINE.exec(line);
    if (fence) {
      lines.push("");
      if (line.startsWith(fence)) fence = null;
      continue;
    }
    if (open) {
      fence = open[1];
      lines.push("");
      continue;
    }
    lines.push(
      line
        .replace(/`[^`]*`/g, " ")
        .replace(/!\[[^\]|#]+(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g, " ")
        .replace(/\[\[[^\]|#]+(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g, " "),
    );
  }
  return lines.join("\n");
}

function mentionWorthy(title: string): boolean {
  const text = title.trim();
  if (text.length < 2 || text.toLowerCase() === "未命名笔记") return false;
  if (/[\u3400-\u9fff]/.test(text)) return true;
  return text.length >= 4;
}

function mentionCount(haystack: string, title: string): number {
  const needle = title.trim();
  if (!needle) return 0;
  if (/[\u3400-\u9fff]/.test(needle)) {
    const lower = haystack.toLowerCase();
    const key = needle.toLowerCase();
    let count = 0;
    let from = 0;
    while (from < lower.length) {
      const at = lower.indexOf(key, from);
      if (at < 0) break;
      count += 1;
      from = at + key.length;
      if (count >= 20) break;
    }
    return count;
  }
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const found = haystack.match(new RegExp(`(?:^|[^A-Za-z0-9])${escaped}(?:$|[^A-Za-z0-9])`, "gi"));
  return found?.length ?? 0;
}

export function unlinkedMentions(
  notes: { id: string; content: string }[],
  activeId: string | null,
): UnlinkedMention[] {
  const active = notes.find((note) => note.id === activeId);
  if (!active) return [];
  const prose = proseForMentions(active.content);
  if (!prose.trim()) return [];
  const index = titleIndex(notes);
  const linked = new Set<string>();
  for (const hit of wikiHits(active.content)) {
    const id = index.get(hit.target.toLowerCase());
    if (id) linked.add(id);
  }
  const mentions: UnlinkedMention[] = [];
  for (const note of notes) {
    if (note.id === active.id || linked.has(note.id)) continue;
    const names = [firstLineTitle(note.content), ...noteAliases(note.content)].filter(mentionWorthy);
    let count = 0;
    let line = "";
    const seen = new Set<string>();
    for (const name of names) {
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const hits = mentionCount(prose, name);
      if (!hits) continue;
      count += hits;
      if (!line) {
        const found = prose.split("\n").find((row) => row.toLowerCase().includes(name.toLowerCase()));
        line = found ? snippet(found) : "";
      }
    }
    if (!count) continue;
    mentions.push({
      id: note.id,
      title: firstLineTitle(note.content) || "未命名笔记",
      line,
      count,
    });
  }
  return mentions;
}

export function noteLinks(
  notes: { id: string; content: string }[],
  activeId: string | null,
): NoteLinks {
  const active = notes.find((note) => note.id === activeId);
  if (!active) return { incoming: [], outgoing: [] };

  const titleOf = new Map<string, string>();
  const idByTitle = titleIndex(notes);
  for (const note of notes) titleOf.set(note.id, firstLineTitle(note.content).trim());

  const activeKeys = new Set<string>();
  const activeTitle = (titleOf.get(active.id) ?? "").toLowerCase();
  if (activeTitle && activeTitle !== "未命名笔记") activeKeys.add(activeTitle);
  for (const alias of noteAliases(active.content)) {
    const key = alias.trim().toLowerCase();
    if (key && key !== "未命名笔记") activeKeys.add(key);
  }
  const outgoing: OutgoingLink[] = [];
  const seenOut = new Set<string>();
  for (const hit of wikiHits(active.content)) {
    const key = hit.target.toLowerCase();
    if (seenOut.has(key)) continue;
    seenOut.add(key);
    outgoing.push({
      target: hit.target,
      id: idByTitle.get(key) ?? null,
      line: hit.line,
    });
  }

  const incoming = new Map<string, LinkedNote>();
  if (activeKeys.size > 0) {
    for (const note of notes) {
      if (note.id === active.id) continue;
      for (const hit of wikiHits(note.content)) {
        if (!activeKeys.has(hit.target.toLowerCase())) continue;
        const prev = incoming.get(note.id);
        if (prev) {
          prev.count += 1;
          continue;
        }
        incoming.set(note.id, {
          id: note.id,
          title: titleOf.get(note.id) || "未命名笔记",
          line: hit.line,
          count: 1,
        });
      }
    }
  }

  return { incoming: [...incoming.values()], outgoing };
}
