import type { Note } from "./types";

/** First-window scan for titles / snippets — never split() a multi-megabyte note. */
export const NOTE_HEAD_SCAN = 16_384;
/** Notes at or above this size skip full-string copies and localStorage bodies. */
export const LARGE_NOTE_CHARS = 400_000;
/** Preview / markdown parse window. */
export const PREVIEW_WINDOW_CHARS = 48_000;
/** Textarea window so a 9 MB file does not freeze the WebView. */
export const EDITOR_WINDOW_CHARS = 240_000;
/** Case-insensitive search cap on large notes. */
export const SEARCH_SCAN = 262_144;

export function isLargeNote(content: string): boolean {
  return content.length >= LARGE_NOTE_CHARS;
}

export function isBlankContent(content: string): boolean {
  if (content.length === 0) return true;
  if (content.length > 4096) return false;
  return !content.trim();
}

function firstNonEmptyLine(content: string, maxScan = NOTE_HEAD_SCAN): string {
  const limit = Math.min(content.length, maxScan);
  let start = 0;
  for (let index = 0; index <= limit; index += 1) {
    if (index === limit || content.charCodeAt(index) === 10) {
      const line = content.slice(start, index).replace(/\r$/, "").trim();
      if (line) return line;
      start = index + 1;
    }
  }
  return "";
}

function stripTitleDecor(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, "")
    .replace(/^\s*[-*+]\s+(\[[ xX]\]\s+)?/, "")
    .replace(/^>\s+/, "")
    .replace(/[*_`~]/g, "")
    .trim();
}

function frontMatterBlock(content: string): { yaml: string; body: string } | null {
  if (!content.startsWith("---")) return null;
  const head = content.length > 4096 ? content.slice(0, 4096) : content;
  const match = head.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return null;
  return { yaml: match[1], body: content.slice(match[0].length) };
}

function yamlScalar(raw: string): string {
  const value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function bodyAfterFrontMatter(content: string): string {
  const block = frontMatterBlock(content);
  return block ? block.body.replace(/^\s+/, "") : content;
}

export function firstLineTitle(content: string): string {
  const block = frontMatterBlock(content);
  if (block) {
    const line = block.yaml.split("\n").find((item) => /^title\s*:/i.test(item.trim()));
    if (line) {
      const title = yamlScalar(line.replace(/^title\s*:\s*/i, ""));
      if (title) return title;
    }
    const heading = stripTitleDecor(firstNonEmptyLine(block.body));
    return heading || "未命名笔记";
  }
  const stripped = stripTitleDecor(firstNonEmptyLine(content));
  return stripped || "未命名笔记";
}

/** Obsidian-style YAML `aliases` / `alias`, list or inline array. */
export function noteAliases(content: string): string[] {
  const block = frontMatterBlock(content);
  if (!block) return [];
  const lines = block.yaml.split("\n");
  const aliases: string[] = [];
  const push = (raw: string) => {
    const value = yamlScalar(raw).trim();
    if (value && value !== "未命名笔记") aliases.push(value);
  };
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(?:aliases|alias)\s*:\s*(.*)$/i.exec(lines[index].trim());
    if (!match) continue;
    const rest = match[1].trim();
    if (!rest) {
      for (let next = index + 1; next < lines.length; next += 1) {
        const item = /^\s*-\s+(.*)$/.exec(lines[next]);
        if (!item) break;
        push(item[1]);
        index = next;
      }
      continue;
    }
    if (rest.startsWith("[")) {
      const inner = rest.replace(/^\[/, "").replace(/\]$/, "");
      for (const part of inner.split(",")) push(part);
      continue;
    }
    push(rest);
  }
  return aliases;
}

export function titleFromContent(content: string): string {
  const stripped = firstLineTitle(content);
  if (stripped === "未命名笔记") return stripped;
  return stripped.length > 32 ? `${stripped.slice(0, 32)}…` : stripped;
}

export function snippetFromContent(content: string): string {
  const source = bodyAfterFrontMatter(content);
  const limit = Math.min(source.length, NOTE_HEAD_SCAN);
  const lines: string[] = [];
  let start = 0;
  for (let index = 0; index <= limit; index += 1) {
    if (index === limit || source.charCodeAt(index) === 10) {
      const line = source.slice(start, index).replace(/\r$/, "").trim();
      if (line) {
        lines.push(line);
        if (lines.length >= 8) break;
      }
      start = index + 1;
    }
  }
  const rest = lines.slice(1).join(" ").replace(/[#>*_`~\-\[\]()]/g, "");
  const compact = rest.replace(/\s+/g, " ").trim();
  if (!compact) return "空白页";
  return compact.length > 48 ? `${compact.slice(0, 48)}…` : compact;
}

export function countChars(content: string): number {
  if (content.length > LARGE_NOTE_CHARS) return content.length;
  return content.replace(/\s/g, "").length;
}

/** Visible slice when a note is too large for one textarea. */
export const EDITOR_SLICE_CHARS = 48_000;

export function editorSlice(
  content: string,
  anchor: number,
  size = EDITOR_SLICE_CHARS,
): { start: number; end: number } {
  const from = Math.max(0, Math.min(anchor, content.length));
  let end = Math.min(content.length, from + size);
  if (end < content.length) {
    const nl = content.indexOf("\n", end);
    if (nl !== -1 && nl - from < size + 800) end = nl;
  }
  return { start: from, end };
}

export type NoteSort = "updated" | "created" | "title" | "opened";

export const NOTE_SORTS: { id: NoteSort; label: string }[] = [
  { id: "updated", label: "修改时间" },
  { id: "created", label: "创建时间" },
  { id: "title", label: "标题" },
  { id: "opened", label: "最近打开" },
];

const SORTS: NoteSort[] = ["updated", "created", "title", "opened"];
const SORT_KEY = "jingjian.sort.v1";
const STAR_KEY = "jingjian.stars.v1";
const OPENED_KEY = "jingjian.opened.v1";

export function readNoteSort(): NoteSort {
  try {
    const raw = localStorage.getItem(SORT_KEY);
    if (SORTS.includes(raw as NoteSort)) return raw as NoteSort;
  } catch {
    // private mode
  }
  return "updated";
}

export function writeNoteSort(sort: NoteSort) {
  try {
    localStorage.setItem(SORT_KEY, sort);
  } catch {
    // private mode
  }
}

export function compareNotes(
  a: Note,
  b: Note,
  sort: NoteSort = "updated",
  opened?: Record<string, number>,
): number {
  if (sort === "created") return b.createdAt - a.createdAt;
  if (sort === "title") {
    return firstLineTitle(a.content).localeCompare(firstLineTitle(b.content), "zh-CN");
  }
  if (sort === "opened") {
    const left = opened?.[a.id] ?? 0;
    const right = opened?.[b.id] ?? 0;
    if (left !== right) return right - left;
    return b.updatedAt - a.updatedAt;
  }
  return b.updatedAt - a.updatedAt;
}

export function readStars(): Set<string> {
  try {
    const raw = localStorage.getItem(STAR_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

export function toggleStar(id: string): boolean {
  const stars = readStars();
  const on = !stars.has(id);
  if (on) stars.add(id);
  else stars.delete(id);
  try {
    localStorage.setItem(STAR_KEY, JSON.stringify([...stars]));
  } catch {
    // private mode
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event("jingjian-stars"));
  return on;
}

export function readOpened(): Record<string, number> {
  try {
    const raw = localStorage.getItem(OPENED_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    if (!parsed || typeof parsed !== "object") return out;
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export function markOpened(id: string) {
  if (!id) return;
  try {
    const map = readOpened();
    map[id] = Date.now();
    const entries = Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 400);
    localStorage.setItem(OPENED_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // private mode
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event("jingjian-opened"));
}

export function formatCharCount(content: string): string {
  if (isLargeNote(content)) {
    return `约 ${content.length.toLocaleString("zh-CN")} 字`;
  }
  return `${countChars(content)} 字`;
}

export function previewWindow(
  content: string,
  max = PREVIEW_WINDOW_CHARS,
): { text: string; truncated: boolean } {
  if (content.length <= max) return { text: content, truncated: false };
  return { text: content.slice(0, max), truncated: true };
}

export function includesIgnoreCase(
  haystack: string,
  needle: string,
  maxScan = Infinity,
): boolean {
  const q = needle.toLowerCase();
  if (!q) return true;
  const limit = Math.min(haystack.length, maxScan);
  if (limit <= 32_768) {
    return haystack.slice(0, limit).toLowerCase().includes(q);
  }
  const chunk = 24_576;
  const overlap = Math.min(q.length, 256);
  for (let index = 0; index < limit; index += chunk) {
    const end = Math.min(limit, index + chunk + overlap);
    if (haystack.slice(index, end).toLowerCase().includes(q)) return true;
  }
  return false;
}

export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const diff = Math.max(0, now - timestamp);
  if (diff < 45_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;

  const date = new Date(timestamp);
  const today = new Date(now);
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime();
  const startOfYesterday = startOfToday - 86_400_000;

  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");

  if (timestamp >= startOfYesterday && timestamp < startOfToday) {
    return `昨天 ${hh}:${mm}`;
  }
  if (date.getFullYear() === today.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日 ${hh}:${mm}`;
  }
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

export type NoteGroup = {
  label: string;
  notes: Note[];
  book?: boolean;
  bookId?: string;
};

export function parseOpenIds(raw: unknown): Set<string> {
  if (!Array.isArray(raw)) return new Set();
  return new Set(raw.filter((item): item is string => typeof item === "string" && item.length > 0));
}

export function toggleOpenId(open: Iterable<string>, id: string): Set<string> {
  const next = new Set(open);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function groupNotes(notes: Note[]): NoteGroup[] {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const startOfYesterday = startOfToday - 86_400_000;
  const startOfWeek = startOfToday - 6 * 86_400_000;

  const books = new Map<string, { title: string; notes: Note[] }>();
  const rest: Note[] = [];
  for (const note of notes) {
    if (note.bookId) {
      const current = books.get(note.bookId) ?? {
        title: note.bookTitle || "电子书",
        notes: [],
      };
      current.notes.push(note);
      books.set(note.bookId, current);
    } else {
      rest.push(note);
    }
  }

  const groups: NoteGroup[] = [];
  for (const [bookId, book] of books) {
    groups.push({
      label: book.title,
      book: true,
      bookId,
      notes: [...book.notes].sort(
        (a, b) => (a.chapterIndex ?? 0) - (b.chapterIndex ?? 0),
      ),
    });
  }

  const buckets: Record<string, Note[]> = {
    今天: [],
    昨天: [],
    近七日: [],
    更早: [],
  };

  for (const note of rest) {
    if (note.updatedAt >= startOfToday) buckets.今天.push(note);
    else if (note.updatedAt >= startOfYesterday) buckets.昨天.push(note);
    else if (note.updatedAt >= startOfWeek) buckets.近七日.push(note);
    else buckets.更早.push(note);
  }

  for (const [label, items] of Object.entries(buckets)) {
    if (items.length > 0) groups.push({ label, notes: items });
  }
  return groups;
}

export function matchesQuery(note: Note, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (titleFromContent(note.content).toLowerCase().includes(q)) return true;
  if (note.folder?.toLowerCase().includes(q)) return true;
  const max = isLargeNote(note.content) ? SEARCH_SCAN : Infinity;
  return includesIgnoreCase(note.content, q, max);
}
