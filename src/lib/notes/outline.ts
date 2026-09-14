export type OutlineHeading = {
  level: number;
  text: string;
  id: string;
  offset: number;
};

const FENCE = /^(`{3,}|~{3,})/;
const ATX = /^(#{1,6})[ \t]+(.+?)\s*#*\s*$/;

export function slugifyHeading(text: string): string {
  const compact = text
    .replace(/<[^>]+>/g, "")
    .replace(/[*_`~[\]]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w\u4e00-\u9fff-]/g, "");
  return compact || "section";
}

export function headingIdFor(text: string, seen: Map<string, number>): string {
  const base = slugifyHeading(text);
  const count = (seen.get(base) ?? 0) + 1;
  seen.set(base, count);
  return count === 1 ? base : `${base}-${count}`;
}

export function extractHeadings(content: string, maxScan = 400_000): OutlineHeading[] {
  const limit = Math.min(content.length, maxScan);
  const headings: OutlineHeading[] = [];
  const seen = new Map<string, number>();
  let offset = 0;
  let fence: string | null = null;

  while (offset < limit) {
    const next = content.indexOf("\n", offset);
    const end = next === -1 || next > limit ? limit : next;
    const line = content.slice(offset, end).replace(/\r$/, "");
    const trimmed = line.trimStart();
    const fenceMark = trimmed.match(FENCE);

    if (fenceMark) {
      const mark = fenceMark[1][0].repeat(fenceMark[1].length);
      if (!fence) fence = mark;
      else if (trimmed.startsWith(fence[0]) && trimmed.length >= fence.length) fence = null;
      offset = end + 1;
      continue;
    }

    if (!fence) {
      const match = line.match(ATX);
      if (match) {
        const text = match[2].trim();
        if (text) {
          headings.push({
            level: match[1].length,
            text,
            id: headingIdFor(text, seen),
            offset,
          });
        }
      }
    }

    if (next === -1 || next >= limit) break;
    offset = end + 1;
  }

  return headings;
}
