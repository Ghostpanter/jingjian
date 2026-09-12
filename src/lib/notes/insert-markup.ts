export type MarkupEdit = {
  value: string;
  start: number;
  end: number;
};

export function looksLikeUrl(value: string): boolean {
  const trimmed = value.trim();
  return /^(https?:\/\/|mailto:|www\.)/i.test(trimmed);
}

export function normalizeHref(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  if (
    /^https?:\/\//i.test(trimmed) ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../")
  ) {
    return trimmed;
  }
  if (/^[a-z0-9.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

export function wrapAsMarkup(
  value: string,
  start: number,
  end: number,
  text: string,
  href: string,
  image: boolean,
): { value: string; cursor: number } {
  const inner = text || href;
  const snippet = image ? `![${inner}](${href})` : `[${inner}](${href})`;
  return {
    value: value.slice(0, start) + snippet + value.slice(end),
    cursor: start + snippet.length,
  };
}

export function readEditorSelection(): {
  value: string;
  start: number;
  end: number;
  selected: string;
} | null {
  const el = document.getElementById("note-editor");
  if (!(el instanceof HTMLTextAreaElement)) return null;
  return {
    value: el.value,
    start: el.selectionStart,
    end: el.selectionEnd,
    selected: el.value.slice(el.selectionStart, el.selectionEnd),
  };
}

export function writeEditorValue(
  next: string,
  cursor: number | { start: number; end: number },
  onChange: (value: string) => void,
): void {
  const start = typeof cursor === "number" ? cursor : cursor.start;
  const end = typeof cursor === "number" ? cursor : cursor.end;
  const el = document.getElementById("note-editor");
  if (el instanceof HTMLTextAreaElement) {
    el.value = next;
    onChange(next);
    const from = Math.max(0, Math.min(start, next.length));
    const to = Math.max(from, Math.min(end, next.length));
    requestAnimationFrame(() => el.setSelectionRange(from, to));
    return;
  }
  onChange(next);
}

function lineBounds(value: string, start: number, end: number) {
  const from = value.lastIndexOf("\n", Math.max(0, start) - 1) + 1;
  if (end > start && end > 0 && value[end - 1] === "\n") {
    return { from, to: end - 1 };
  }
  const nl = value.indexOf("\n", end);
  return { from, to: nl === -1 ? value.length : nl };
}

export function mapLines(
  value: string,
  start: number,
  end: number,
  transform: (line: string, index: number) => string,
): MarkupEdit {
  const { from, to } = lineBounds(value, start, end);
  const block = value.slice(from, to);
  const lines = block.split("\n");
  const nextLines = lines.map(transform);
  const nextBlock = nextLines.join("\n");
  const nextValue = value.slice(0, from) + nextBlock + value.slice(to);
  const firstDelta = (nextLines[0]?.length ?? 0) - (lines[0]?.length ?? 0);
  const totalDelta = nextBlock.length - block.length;
  let nextStart = start + firstDelta;
  let nextEnd = start === end ? nextStart : end + totalDelta;
  const blockEnd = from + nextBlock.length;
  nextStart = Math.max(from, Math.min(nextStart, blockEnd));
  nextEnd = Math.max(nextStart, Math.min(nextEnd, blockEnd));
  return { value: nextValue, start: nextStart, end: nextEnd };
}

function isPartOfLongerMarker(
  value: string,
  start: number,
  end: number,
  open: string,
  close: string,
): boolean {
  if (open !== "*" || close !== "*") return false;
  return (
    value.slice(Math.max(0, start - 2), start) === "**" ||
    value.slice(end, end + 2) === "**"
  );
}

export function wrapInline(
  value: string,
  start: number,
  end: number,
  open: string,
  close = open,
): MarkupEdit {
  const selected = value.slice(start, end);
  const surrounded =
    start >= open.length &&
    value.slice(start - open.length, start) === open &&
    value.slice(end, end + close.length) === close &&
    !isPartOfLongerMarker(value, start, end, open, close);

  if (surrounded) {
    const next =
      value.slice(0, start - open.length) + selected + value.slice(end + close.length);
    return {
      value: next,
      start: start - open.length,
      end: end - open.length,
    };
  }

  if (
    selected.startsWith(open) &&
    selected.endsWith(close) &&
    selected.length >= open.length + close.length
  ) {
    const inner = selected.slice(open.length, selected.length - close.length);
    return {
      value: value.slice(0, start) + inner + value.slice(end),
      start,
      end: start + inner.length,
    };
  }

  const snippet = open + selected + close;
  return {
    value: value.slice(0, start) + snippet + value.slice(end),
    start: start + open.length,
    end: start + open.length + selected.length,
  };
}

export function setHeading(
  value: string,
  start: number,
  end: number,
  level: 0 | 1 | 2 | 3 | 4 | 5 | 6,
): MarkupEdit {
  return mapLines(value, start, end, (line) => {
    const body = line
      .replace(/^#{1,6}[ \t]+/, "")
      .replace(/[ \t]+#+\s*$/, "");
    if (level === 0) return body;
    return `${"#".repeat(level)} ${body}`;
  });
}

const LIST_LINE =
  /^(\s*)(?:[-*+]|\d+[.)])[ \t]+(?:\[(?: |x|X)\][ \t]+)?(.*)$/;

function splitListLine(line: string): { indent: string; body: string } {
  const match = LIST_LINE.exec(line);
  if (match) return { indent: match[1], body: match[2] };
  const indent = /^(\s*)/.exec(line)?.[1] ?? "";
  return { indent, body: line.slice(indent.length) };
}

function everyMeaningful(
  lines: string[],
  test: (line: string) => boolean,
): boolean {
  const meaningful = lines.filter((line) => line.trim() !== "");
  return meaningful.length > 0 && meaningful.every(test);
}

export function toggleQuote(
  value: string,
  start: number,
  end: number,
): MarkupEdit {
  const { from, to } = lineBounds(value, start, end);
  const lines = value.slice(from, to).split("\n");
  const quoted = everyMeaningful(lines, (line) => /^>[ \t]?/.test(line));
  return mapLines(value, start, end, (line) => {
    if (line.trim() === "") return line;
    if (quoted) return line.replace(/^>[ \t]?/, "");
    if (/^>[ \t]?/.test(line)) return line;
    return `> ${line}`;
  });
}

export function toggleUnorderedList(
  value: string,
  start: number,
  end: number,
): MarkupEdit {
  const { from, to } = lineBounds(value, start, end);
  const lines = value.slice(from, to).split("\n");
  const listed = everyMeaningful(
    lines,
    (line) => /^\s*[-*+][ \t]+/.test(line) && !/^\s*[-*+][ \t]+\[[ xX]\]/.test(line),
  );
  return mapLines(value, start, end, (line) => {
    if (line.trim() === "") return line;
    const { indent, body } = splitListLine(line);
    if (listed) return `${indent}${body}`;
    return `${indent}- ${body}`;
  });
}

export function toggleOrderedList(
  value: string,
  start: number,
  end: number,
): MarkupEdit {
  const { from, to } = lineBounds(value, start, end);
  const lines = value.slice(from, to).split("\n");
  const listed = everyMeaningful(lines, (line) => /^\s*\d+[.)][ \t]+/.test(line));
  let index = 0;
  return mapLines(value, start, end, (line) => {
    if (line.trim() === "") return line;
    const { indent, body } = splitListLine(line);
    if (listed) return `${indent}${body}`;
    index += 1;
    return `${indent}${index}. ${body}`;
  });
}

export function toggleTaskList(
  value: string,
  start: number,
  end: number,
): MarkupEdit {
  const { from, to } = lineBounds(value, start, end);
  const lines = value.slice(from, to).split("\n");
  const tasked = everyMeaningful(lines, (line) =>
    /^\s*[-*+][ \t]+\[[ xX]\][ \t]+/.test(line),
  );
  return mapLines(value, start, end, (line) => {
    if (line.trim() === "") return line;
    const { indent, body } = splitListLine(line);
    if (tasked) return `${indent}${body}`;
    return `${indent}- [ ] ${body}`;
  });
}

export function indentLines(
  value: string,
  start: number,
  end: number,
  delta: 1 | -1,
  unit = "  ",
): MarkupEdit {
  return mapLines(value, start, end, (line) => {
    if (delta > 0) return unit + line;
    if (line.startsWith(unit)) return line.slice(unit.length);
    if (line.startsWith("\t")) return line.slice(1);
    if (line.startsWith(" ")) return line.replace(/^ {1,2}/, "");
    return line;
  });
}

export function wrapFence(
  value: string,
  start: number,
  end: number,
): MarkupEdit {
  const selected = value.slice(start, end);
  const atLineStart = start === 0 || value[start - 1] === "\n";
  const atLineEnd = end === value.length || value[end] === "\n";
  const prefix = atLineStart ? "" : "\n";
  const suffix = atLineEnd ? "" : "\n";
  const snippet = `${prefix}\`\`\`\n${selected}\n\`\`\`${suffix}`;
  const innerStart = start + prefix.length + 4;
  return {
    value: value.slice(0, start) + snippet + value.slice(end),
    start: innerStart,
    end: innerStart + selected.length,
  };
}

export function insertTable(
  value: string,
  start: number,
  end: number,
): MarkupEdit {
  const table = "|  |  |\n| --- | --- |\n|  |  |";
  const atLineStart = start === 0 || value[start - 1] === "\n";
  const atLineEnd = end === value.length || value[end] === "\n";
  const prefix = atLineStart ? "" : "\n";
  const suffix = atLineEnd ? "\n" : "\n";
  const snippet = `${prefix}${table}${suffix}`;
  const cursor = start + prefix.length + 2;
  return {
    value: value.slice(0, start) + snippet + value.slice(end),
    start: cursor,
    end: cursor,
  };
}
