function decodeEntities(value: string): string {
  return value
    .replace(/\u0026nbsp;/gi, " ")
    .replace(/\u0026amp;/gi, "&")
    .replace(/\u0026lt;/gi, "<")
    .replace(/\u0026gt;/gi, ">")
    .replace(/\u0026quot;/gi, '"')
    .replace(/\u0026#39;/gi, "'")
    .replace(/\u0026#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/\u0026#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function stripTags(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, ""))
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

function inline(html: string): string {
  const replaced = html
    .replace(/<br\s*\/?>/gi, "  \n")
    .replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**")
    .replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, "*$2*")
    .replace(/<(del|s)[^>]*>([\s\S]*?)<\/\1>/gi, "~~$2~~")
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`")
    .replace(
      /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
      "[$2]($1)",
    )
    .replace(
      /<img[^>]*src=["']([^"']+)["'][^>]*alt=["']([^"']*)["'][^>]*\/?>/gi,
      "![$2]($1)",
    )
    .replace(
      /<img[^>]*alt=["']([^"']*)["'][^>]*src=["']([^"']+)["'][^>]*\/?>/gi,
      "![$1]($2)",
    )
    .replace(/<img[^>]*src=["']([^"']+)["'][^>]*\/?>/gi, "![]($1)");
  return stripTags(replaced).replace(/\n/g, "  \n");
}

function convertTables(source: string): string {
  return source.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, inner: string) => {
    const rows = [...inner.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
      [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) =>
        inline(cell[1]).replace(/\|/g, "\\|"),
      ),
    );
    if (rows.length === 0) return "\n\n";
    const width = Math.max(...rows.map((row) => row.length), 1);
    const padded = rows.map((row) =>
      Array.from({ length: width }, (_, index) => row[index] || ""),
    );
    const header = padded[0];
    const lines = [
      `| ${header.join(" | ")} |`,
      `| ${header.map(() => "---").join(" | ")} |`,
      ...padded.slice(1).map((row) => `| ${row.join(" | ")} |`),
    ];
    return `\n\n${lines.join("\n")}\n\n`;
  });
}

function convertLists(source: string): string {
  let next = source.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, inner: string) => {
    let index = 0;
    const items = inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (__, text: string) => {
      index += 1;
      return `${index}. ${inline(text)}\n`;
    });
    return `\n\n${items}\n`;
  });
  next = next.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, inner: string) => {
    const items = inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (__, text: string) => {
      return `- ${inline(text)}\n`;
    });
    return `\n\n${items}\n`;
  });
  return next;
}

function convertFootnotes(source: string): { html: string; defs: string[] } {
  const defs: string[] = [];
  const ids = new Map<string, number>();
  function numberFor(id: string): number {
    const existing = ids.get(id);
    if (existing) return existing;
    const next = ids.size + 1;
    ids.set(id, next);
    return next;
  }
  let html = source.replace(
    /<(aside|div|li|section)([^>]*?)>([\s\S]*?)<\/\1>/gi,
    (full, _tag: string, attrs: string, body: string) => {
      const idMatch = attrs.match(/\bid=["']([^"']+)["']/i);
      const type = attrs.match(/epub:type=["']([^"']+)["']/i)?.[1] || "";
      const cls = attrs.match(/\bclass=["']([^"']+)["']/i)?.[1] || "";
      const id = idMatch?.[1] || "";
      if (
        !/footnote|endnote|rearnote/i.test(`${type} ${cls} ${id}`) ||
        !id
      ) {
        return full;
      }
      const n = numberFor(id);
      defs[n - 1] = `[^${n}]: ${inline(body)}`;
      return "";
    },
  );
  html = html.replace(
    /<a([^>]*href=["']#([^"']+)["'][^>]*)>([\s\S]*?)<\/a>/gi,
    (full, attrs: string, id: string, text: string) => {
      const type = `${attrs} ${text}`;
      if (!/noteref|footnote|fn/i.test(`${type} ${id}`) && !ids.has(id)) return full;
      const n = numberFor(id);
      return `[^${n}]`;
    },
  );
  return { html, defs: defs.filter(Boolean) };
}

export function htmlToMarkdown(html: string): string {
  let source = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  const footnotes = convertFootnotes(source);
  source = footnotes.html;
  source = convertTables(source);

  source = source.replace(
    /<pre[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi,
    (_, code) => `\n\n\`\`\`\n${decodeEntities(code).replace(/\n$/, "")}\n\`\`\`\n\n`,
  );
  source = source.replace(
    /<pre[^>]*>([\s\S]*?)<\/pre>/gi,
    (_, code) => `\n\n\`\`\`\n${stripTags(code)}\n\`\`\`\n\n`,
  );

  source = source.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level, text) => {
    return `\n\n${"#".repeat(Number(level))} ${inline(text)}\n\n`;
  });
  source = source.replace(
    /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi,
    (_, text) =>
      `\n\n${htmlToMarkdown(text)
        .split("\n")
        .map((line) => (line ? `> ${line}` : ">"))
        .join("\n")}\n\n`,
  );
  source = convertLists(source);
  source = source.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, text) => `- ${inline(text)}\n`);
  source = source.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, text) => `\n\n${inline(text)}\n\n`);
  source = source.replace(
    /<\/?(div|section|article|body|html|header|main|footer)[^>]*>/gi,
    "\n\n",
  );
  source = source.replace(/<br\s*\/?>/gi, "  \n");
  source = source.replace(/<hr\s*\/?>/gi, "\n\n---\n\n");
  source = source.replace(/<[^>]+>/g, "");
  const body = decodeEntities(source).replace(/\n{3,}/g, "\n\n").trim();
  if (footnotes.defs.length === 0) return body;
  return `${body}\n\n${footnotes.defs.join("\n")}`;
}
