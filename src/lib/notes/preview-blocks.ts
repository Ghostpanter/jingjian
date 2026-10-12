import { renderMarkdownState } from "./markdown.ts";
import { scanFences } from "./markdown-extra.ts";

/**
 * Incremental preview, Obsidian style: the note is cut into top-level blocks,
 * each block is rendered on its own and cached by its text plus the little
 * state it depends on (task numbering, heading ids, embedded notes). A one-key
 * edit then re-renders one block instead of the whole note.
 */

export type PreviewSection = { text: string; start: number };

export type SectionEntry = {
  text: string;
  html: string;
  /** Task checkboxes drawn by this block (0 = numbering does not matter). */
  tasks: number;
  taskStart: number;
  /** Heading-id counts this block read, per base slug, before it rendered. */
  seedUsed: [string, number][];
  /** Base slugs of the headings it produced. */
  headings: string[];
  /** Has `![[...]]`, so it depends on the other notes. */
  embeds: boolean;
  libraryVersion: number;
};

export type SectionCache = {
  entries: Map<string, SectionEntry[]>;
  size: number;
};

export function createSectionCache(): SectionCache {
  return { entries: new Map(), size: 0 };
}

const CACHE_CAP = 4000;
const DEFINITION = /^ {0,3}\[(?:\^[^\]]+|[^\]^][^\]]*)\]:\s?/m;
const LIST_OR_INDENT = /^(?:[ \t]|>|\||(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$))/;
const ATX = /^ {0,3}#{1,6}(?:[ \t]|$)/;

/**
 * Split at safe block boundaries only: before an ATX heading, or after a blank
 * line when the next line cannot continue a list, quote, table or indented
 * code. Never inside fenced code, front matter or an open `$$` block. Notes
 * with footnote / reference-link definitions stay whole because those resolve
 * across the note.
 */
export function splitSections(source: string): PreviewSection[] {
  if (!source) return [{ text: "", start: 0 }];
  if (DEFINITION.test(source)) return [{ text: source, start: 0 }];
  const { lines, code } = scanFences(source);
  let frontEnd = -1;
  if (lines[0] === "---") {
    for (let i = 1; i < lines.length; i += 1) {
      if (lines[i] === "---" || lines[i] === "...") {
        frontEnd = i;
        break;
      }
    }
    if (frontEnd === -1) return [{ text: source, start: 0 }];
  }
  const sections: PreviewSection[] = [];
  let sectionLine = 0;
  let sectionStart = 0;
  let offset = 0;
  let mathOpen = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (i > 0 && i > frontEnd && sectionLine < i && !mathOpen && !(code[i] && code[i - 1])) {
      const prev = lines[i - 1] ?? "";
      const afterBlank = prev.trim() === "" && !code[i - 1] && line.trim() !== "" && !LIST_OR_INDENT.test(line);
      const heading = !code[i] && ATX.test(line) && !code[i - 1];
      if (afterBlank || heading) {
        sections.push({ text: source.slice(sectionStart, offset), start: sectionStart });
        sectionStart = offset;
        sectionLine = i;
      }
    }
    if (!code[i]) {
      const pairs = line.split("$$").length - 1;
      if (pairs % 2 === 1) mathOpen = !mathOpen;
    }
    offset += line.length + 1;
  }
  sections.push({ text: source.slice(sectionStart), start: sectionStart });
  return sections;
}

function reusable(
  entry: SectionEntry,
  taskStart: number,
  seed: Map<string, number>,
  libraryVersion: number,
): boolean {
  if (entry.tasks > 0 && entry.taskStart !== taskStart) return false;
  if (entry.embeds && entry.libraryVersion !== libraryVersion) return false;
  for (const [slug, count] of entry.seedUsed) {
    if ((seed.get(slug) ?? 0) !== count) return false;
  }
  return true;
}

function remember(cache: SectionCache, entry: SectionEntry): void {
  const list = cache.entries.get(entry.text);
  if (list) list.push(entry);
  else cache.entries.set(entry.text, [entry]);
  cache.size += 1;
  if (cache.size > CACHE_CAP) {
    const oldest = cache.entries.keys().next().value;
    if (oldest !== undefined) {
      cache.size -= cache.entries.get(oldest)?.length ?? 0;
      cache.entries.delete(oldest);
    }
  }
}

export type SectionRender = {
  sections: { entry: SectionEntry; start: number; reused: boolean }[];
  rendered: number;
  reused: number;
};

export function renderSections(
  source: string,
  options: {
    cache: SectionCache;
    library?: { id: string; content: string }[];
    libraryVersion?: number;
    headingSeed?: Map<string, number>;
    taskStart?: number;
  },
): SectionRender {
  const { cache } = options;
  const libraryVersion = options.libraryVersion ?? 0;
  const seed = new Map(options.headingSeed ?? []);
  let taskStart = options.taskStart ?? 0;
  const out: SectionRender = { sections: [], rendered: 0, reused: 0 };
  for (const section of splitSections(source)) {
    const candidates = cache.entries.get(section.text);
    let entry = candidates?.find((item) => reusable(item, taskStart, seed, libraryVersion));
    const reused = Boolean(entry);
    if (entry) {
      // Move it to the back so a busy note keeps its blocks in the cache.
      cache.entries.delete(section.text);
      cache.entries.set(section.text, candidates ?? [entry]);
      out.reused += 1;
    } else {
      const embeds = section.text.includes("![[");
      const before = new Map(seed);
      const state = renderMarkdownState(section.text, {
        library: embeds ? options.library : undefined,
        headingSeed: before,
        taskStart,
      });
      const used = [...new Set(state.headings)];
      entry = {
        text: section.text,
        html: state.html,
        tasks: state.tasks,
        taskStart,
        seedUsed: used.map((slug) => [slug, before.get(slug) ?? 0]),
        headings: state.headings,
        embeds,
        libraryVersion,
      };
      remember(cache, entry);
      out.rendered += 1;
    }
    for (const slug of entry.headings) seed.set(slug, (seed.get(slug) ?? 0) + 1);
    taskStart += entry.tasks;
    out.sections.push({ entry, start: section.start, reused });
  }
  return out;
}
