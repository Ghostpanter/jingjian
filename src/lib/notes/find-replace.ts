export type FindOptions = {
  query: string;
  regex: boolean;
  caseSensitive: boolean;
  wholeWord?: boolean;
};

export type TextRange = {
  start: number;
  end: number;
};

function isWordChar(ch: string | undefined): boolean {
  if (!ch) return false;
  return /[A-Za-z0-9_\u4e00-\u9fff]/.test(ch);
}

function isWholeWord(text: string, start: number, end: number): boolean {
  return !isWordChar(text[start - 1]) && !isWordChar(text[end]);
}

export function findMatches(text: string, options: FindOptions): TextRange[] | { error: string } {
  const query = options.query;
  if (!query) return [];
  if (options.regex) {
    try {
      const flags = options.caseSensitive ? "g" : "gi";
      const pattern = new RegExp(query, flags);
      const out: TextRange[] = [];
      let match = pattern.exec(text);
      while (match) {
        const start = match.index;
        const end = start + match[0].length;
        if (end === start) {
          pattern.lastIndex += 1;
        } else if (!options.wholeWord || isWholeWord(text, start, end)) {
          out.push({ start, end });
        }
        if (!pattern.global) break;
        match = pattern.exec(text);
        if (out.length > 4000) break;
      }
      return out;
    } catch {
      return { error: "正则无效" };
    }
  }

  const source = options.caseSensitive ? text : text.toLowerCase();
  const needle = options.caseSensitive ? query : query.toLowerCase();
  const out: TextRange[] = [];
  let from = 0;
  while (from <= source.length) {
    const start = source.indexOf(needle, from);
    if (start < 0) break;
    const end = start + query.length;
    if (!options.wholeWord || isWholeWord(text, start, end)) {
      out.push({ start, end });
    }
    from = start + Math.max(1, query.length);
    if (out.length > 4000) break;
  }
  return out;
}

export function isFindError(
  value: TextRange[] | { error: string },
): value is { error: string } {
  return !Array.isArray(value);
}

export function replaceRange(text: string, range: TextRange, next: string): string {
  return text.slice(0, range.start) + next + text.slice(range.end);
}

function interpolateReplacement(
  text: string,
  range: TextRange,
  template: string,
  regex: boolean,
  query: string,
  caseSensitive = true,
): string {
  if (!regex) return template;
  try {
    const flags = caseSensitive ? "" : "i";
    const pattern = new RegExp(query, flags);
    const slice = text.slice(range.start, range.end);
    const match = pattern.exec(slice) ?? pattern.exec(text.slice(range.start));
    if (!match) return template;
    return template.replace(/\$(\$|\d+)/g, (whole, token: string) => {
      if (token === "$") return "$";
      const index = Number(token);
      return index < match.length ? (match[index] ?? "") : whole;
    });
  } catch {
    return template;
  }
}

export function applyReplacement(
  text: string,
  range: TextRange,
  template: string,
  regex: boolean,
  query: string,
  caseSensitive = true,
): string {
  const next = interpolateReplacement(text, range, template, regex, query, caseSensitive);
  return replaceRange(text, range, next);
}

export function replaceAllMatches(
  text: string,
  matches: TextRange[],
  next: string,
  regex = false,
  query = "",
  caseSensitive = true,
): string {
  if (matches.length === 0) return text;
  let out = "";
  let cursor = 0;
  for (const range of matches) {
    out += text.slice(cursor, range.start) + interpolateReplacement(text, range, next, regex, query, caseSensitive);
    cursor = range.end;
  }
  return out + text.slice(cursor);
}

export function nextIndex(current: number, total: number, direction: 1 | -1): number {
  if (total <= 0) return 0;
  return (current + direction + total) % total;
}

export function indexNear(matches: TextRange[], cursor: number): number {
  if (matches.length === 0) return 0;
  const found = matches.findIndex((range) => range.start >= cursor);
  return found < 0 ? 0 : found;
}
