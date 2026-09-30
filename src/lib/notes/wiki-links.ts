import { firstLineTitle } from "./format.ts";

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

const SCAN_CAP = 120_000;
const FENCE_LINE = /^(```|~~~)/;
const WIKI = /\[\[([^\]|#]+?)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;

function snippet(line: string): string {
  const text = line
    .replace(/\[\[([^\]|#]+?)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_all, target: string, alias?: string) =>
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

export function noteLinks(
  notes: { id: string; content: string }[],
  activeId: string | null,
): NoteLinks {
  const active = notes.find((note) => note.id === activeId);
  if (!active) return { incoming: [], outgoing: [] };

  const titleOf = new Map<string, string>();
  const idByTitle = new Map<string, string>();
  for (const note of notes) {
    const title = firstLineTitle(note.content).trim();
    titleOf.set(note.id, title);
    const key = title.toLowerCase();
    if (key && key !== "未命名笔记" && !idByTitle.has(key)) idByTitle.set(key, note.id);
  }

  const activeTitle = (titleOf.get(active.id) ?? "").toLowerCase();
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
  if (activeTitle && activeTitle !== "未命名笔记") {
    for (const note of notes) {
      if (note.id === active.id) continue;
      for (const hit of wikiHits(note.content)) {
        if (hit.target.toLowerCase() !== activeTitle) continue;
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
