import type { Note } from "./types";

export function titleFromContent(content: string): string {
  const line =
    content.split("\n").find((entry) => entry.trim().length > 0)?.trim() ?? "";
  const stripped = line
    .replace(/^#{1,6}\s+/, "")
    .replace(/^\s*[-*+]\s+(\[[ xX]\]\s+)?/, "")
    .replace(/^>\s+/, "")
    .replace(/[*_`~]/g, "")
    .trim();
  if (!stripped) return "未命名笔记";
  return stripped.length > 32 ? `${stripped.slice(0, 32)}…` : stripped;
}

export function snippetFromContent(content: string): string {
  const withoutTitle = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const rest = withoutTitle.slice(1).join(" ").replace(/[#>*_`~\-\[\]()]/g, "");
  const compact = rest.replace(/\s+/g, " ").trim();
  if (!compact) return "空白页";
  return compact.length > 48 ? `${compact.slice(0, 48)}…` : compact;
}

export function countChars(content: string): number {
  return content.replace(/\s/g, "").length;
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

export function groupNotes(notes: Note[]): { label: string; notes: Note[] }[] {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const startOfYesterday = startOfToday - 86_400_000;
  const startOfWeek = startOfToday - 6 * 86_400_000;

  const buckets: Record<string, Note[]> = {
    今天: [],
    昨天: [],
    近七日: [],
    更早: [],
  };

  for (const note of notes) {
    if (note.updatedAt >= startOfToday) buckets.今天.push(note);
    else if (note.updatedAt >= startOfYesterday) buckets.昨天.push(note);
    else if (note.updatedAt >= startOfWeek) buckets.近七日.push(note);
    else buckets.更早.push(note);
  }

  return Object.entries(buckets)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, notes: items }));
}

export function matchesQuery(note: Note, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    titleFromContent(note.content).toLowerCase().includes(q) ||
    note.content.toLowerCase().includes(q)
  );
}
