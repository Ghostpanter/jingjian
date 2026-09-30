export type LibraryTag = {
  key: string;
  label: string;
  count: number;
};

export type TagIndex = {
  tags: LibraryTag[];
  keysByNote: Map<string, string[]>;
};

const SCAN_CAP = 120_000;
const FENCE_LINE = /^(```|~~~)/;
const TAG_RE = /(^|[^\p{L}\p{N}_/:?&=%.#])#([\p{L}\p{N}_/-]{1,64})/gu;

function cleanToken(raw: string): string {
  return raw
    .trim()
    .replace(/^#/, "")
    .replace(/^["']|["']$/g, "")
    .trim();
}

function normalizeTag(raw: string): { key: string; label: string } | null {
  const label = cleanToken(raw).replace(/\/+$/g, "");
  if (!label || label.length > 64 || label.includes("//")) return null;
  const parts = label.split("/");
  for (const part of parts) {
    if (!part || part.startsWith("-") || part.endsWith("-")) return null;
    if (!/^[\p{L}\p{N}_-]+$/u.test(part)) return null;
    if (!/\p{L}/u.test(part)) return null;
  }
  return { key: label.toLocaleLowerCase("zh-Hans"), label };
}

function remember(into: Map<string, string>, raw: string) {
  const parsed = normalizeTag(raw);
  if (!parsed || into.has(parsed.key)) return;
  into.set(parsed.key, parsed.label);
}

function yamlTags(yaml: string, into: Map<string, string>) {
  const lines = yaml.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, "");
    const inline = /^(?:tags|tag)\s*:\s*(.*)$/.exec(line);
    if (!inline) continue;
    const value = inline[1].trim();
    if (!value) {
      for (let j = i + 1; j < lines.length; j++) {
        const item = /^\s*-\s*(.+?)\s*$/.exec(lines[j].replace(/\r$/, ""));
        if (!item) break;
        remember(into, item[1]);
      }
      continue;
    }
    const body = value.startsWith("[") ? value.replace(/^\[/, "").replace(/\]$/, "") : value;
    for (const part of body.split(",")) remember(into, part);
  }
}

function inlineTags(source: string, into: Map<string, string>) {
  let fence: string | null = null;
  for (const raw of source.split("\n")) {
    const line = raw.replace(/\r$/, "");
    const open = FENCE_LINE.exec(line.trim());
    if (fence) {
      if (line.trim().startsWith(fence)) fence = null;
      continue;
    }
    if (open && line.trim().startsWith(open[1])) {
      fence = open[1];
      continue;
    }
    const prose = line.replace(/`[^`]*`/g, " ");
    TAG_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = TAG_RE.exec(prose))) remember(into, match[2]);
  }
}

export function tagsInContent(content: string): Map<string, string> {
  const source = content.length > SCAN_CAP ? content.slice(0, SCAN_CAP) : content;
  const into = new Map<string, string>();
  if (source.startsWith("---")) {
    const close = source.indexOf("\n---", 3);
    if (close >= 0) {
      yamlTags(source.slice(source.indexOf("\n") + 1, close), into);
      const rest = source.slice(close + 4).replace(/^\r?\n/, "");
      inlineTags(rest, into);
      return into;
    }
  }
  inlineTags(source, into);
  return into;
}

export function libraryTags(notes: { id: string; content: string }[]): TagIndex {
  const counts = new Map<string, { label: string; count: number }>();
  const keysByNote = new Map<string, string[]>();
  for (const note of notes) {
    const found = tagsInContent(note.content);
    const keys = [...found.keys()];
    keysByNote.set(note.id, keys);
    for (const [key, label] of found) {
      const current = counts.get(key);
      if (current) current.count += 1;
      else counts.set(key, { label, count: 1 });
    }
  }
  const tags = [...counts.entries()]
    .map(([key, value]) => ({ key, label: value.label, count: value.count }))
    .sort((a, b) => a.key.localeCompare(b.key, "zh-Hans"));
  return { tags, keysByNote };
}

export function tagMatches(keys: string[], selected: string): boolean {
  return keys.some((key) => key === selected || key.startsWith(`${selected}/`));
}
