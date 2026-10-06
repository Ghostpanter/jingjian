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

function sameTag(raw: string, key: string): boolean {
  return normalizeTag(raw)?.key === key;
}

function stripYamlTags(yaml: string, key: string): string {
  const lines = yaml.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.replace(/\r$/, "");
    const inline = /^(tags|tag)\s*:\s*(.*)$/.exec(line);
    if (!inline) {
      out.push(raw);
      i += 1;
      continue;
    }
    const value = inline[2].trim();
    if (!value) {
      const kept: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const item = /^\s*-\s*(.+?)\s*$/.exec(lines[j].replace(/\r$/, ""));
        if (!item) break;
        if (!sameTag(item[1], key)) kept.push(lines[j]);
        j += 1;
      }
      if (kept.length > 0) {
        out.push(raw);
        out.push(...kept);
      }
      i = j;
      continue;
    }
    const bracket = value.startsWith("[") && value.endsWith("]");
    const inner = bracket ? value.slice(1, -1) : value;
    const parts = inner
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const kept = parts.filter((part) => !sameTag(part, key));
    if (kept.length === parts.length) {
      out.push(raw);
      i += 1;
      continue;
    }
    if (kept.length > 0) {
      const body = bracket ? `[${kept.join(", ")}]` : kept.join(", ");
      out.push(`${inline[1]}: ${body}${raw.endsWith("\r") ? "\r" : ""}`);
    }
    i += 1;
  }
  return out.join("\n");
}

function stripInlineTags(source: string, key: string): string {
  let fence: string | null = null;
  let changed = false;
  const out = source.split("\n").map((raw) => {
    const line = raw.replace(/\r$/, "");
    const cr = raw.endsWith("\r");
    const trimmed = line.trim();
    const open = FENCE_LINE.exec(trimmed);
    if (fence) {
      if (trimmed.startsWith(fence)) fence = null;
      return raw;
    }
    if (open && trimmed.startsWith(open[1])) {
      fence = open[1];
      return raw;
    }
    const masked = line.replace(/`[^`]*`/g, (span) => " ".repeat(span.length));
    TAG_RE.lastIndex = 0;
    const cuts: { start: number; end: number }[] = [];
    let match: RegExpExecArray | null;
    while ((match = TAG_RE.exec(masked))) {
      if (!sameTag(match[2], key)) continue;
      const hash = match.index + match[1].length;
      const end = hash + 1 + match[2].length;
      if (end < line.length && line[end] === " ") cuts.push({ start: hash, end: end + 1 });
      else if (hash > 0 && line[hash - 1] === " ") cuts.push({ start: hash - 1, end });
      else cuts.push({ start: hash, end });
    }
    if (cuts.length === 0) return raw;
    changed = true;
    let next = line;
    for (let index = cuts.length - 1; index >= 0; index -= 1) {
      const cut = cuts[index];
      next = next.slice(0, cut.start) + next.slice(cut.end);
    }
    return cr ? `${next}\r` : next;
  });
  return changed ? out.join("\n") : source;
}

/** Remove one tag from front matter and prose. Child tags and code stay. */
export function stripTag(content: string, rawKey: string): string {
  const key = normalizeTag(rawKey)?.key;
  if (!key || !content) return content;
  if (content.startsWith("---")) {
    const close = content.indexOf("\n---", 3);
    if (close >= 0) {
      const yamlStart = content.indexOf("\n") + 1;
      const originalYaml = content.slice(yamlStart, close);
      const nextYaml = stripYamlTags(originalYaml, key);
      const rest = content.slice(close + 4);
      if (nextYaml !== originalYaml) {
        const inlineRest = stripInlineTags(rest.replace(/^\r?\n/, ""), key).replace(/^\n/, "");
        if (!nextYaml.trim()) return inlineRest.replace(/^\n+/, "");
        const yamlBody = nextYaml.endsWith("\n") ? nextYaml : `${nextYaml}\n`;
        return `---\n${yamlBody}---\n${inlineRest}`;
      }
      const strippedRest = stripInlineTags(rest, key);
      return strippedRest === rest ? content : content.slice(0, close + 4) + strippedRest;
    }
  }
  return stripInlineTags(content, key);
}
