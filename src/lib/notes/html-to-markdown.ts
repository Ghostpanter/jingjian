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
  return decodeEntities(value.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
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
  return stripTags(replaced);
}

export function htmlToMarkdown(html: string): string {
  let source = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

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
      `\n\n${inline(text)
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n")}\n\n`,
  );
  source = source.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, text) => `- ${inline(text)}\n`);
  source = source.replace(/<\/(ul|ol)>/gi, "\n");
  source = source.replace(/<(ul|ol)[^>]*>/gi, "\n");
  source = source.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, text) => `\n\n${inline(text)}\n\n`);
  source = source.replace(/<div[^>]*>([\s\S]*?)<\/div>/gi, (_, text) => `\n\n${inline(text)}\n\n`);
  source = source.replace(/<br\s*\/?>/gi, "  \n");
  source = source.replace(/<hr\s*\/?>/gi, "\n\n---\n\n");
  source = source.replace(/<[^>]+>/g, "");
  return decodeEntities(source).replace(/\n{3,}/g, "\n\n").trim();
}
