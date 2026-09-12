import { lexer, type Token } from "marked";
import { escapeHtml } from "./escape-html.ts";
import { utf8 } from "./bytes.ts";
import { renderMarkdown } from "./markdown.ts";

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "\u0026amp;")
    .replaceAll("<", "\u0026lt;")
    .replaceAll(">", "\u0026gt;")
    .replaceAll('"', "\u0026quot;");
}

function inlineText(tokens: Token[] | undefined): string {
  if (!tokens) return "";
  return tokens
    .map((token) => {
      if (token.type === "text" || token.type === "escape" || token.type === "html") {
        return "text" in token ? token.text : "";
      }
      if (token.type === "strong") return inlineText(token.tokens);
      if (token.type === "em") return inlineText(token.tokens);
      if (token.type === "del") return inlineText(token.tokens);
      if (token.type === "codespan") return token.text;
      if (token.type === "link" || token.type === "image") return inlineText(token.tokens) || token.text;
      if (token.type === "br") return "\n";
      return "text" in token ? String(token.text ?? "") : "";
    })
    .join("");
}

function rtfEscape(value: string): string {
  let out = "";
  for (const char of value) {
    if (char === "\\") out += "\\\\";
    else if (char === "{") out += "\\{";
    else if (char === "}") out += "\\}";
    else if (char === "\n") out += "\\par ";
    else {
      const code = char.codePointAt(0) ?? 0;
      if (code < 128) out += char;
      else out += `\\u${code > 32767 ? code - 65536 : code}?`;
    }
  }
  return out;
}

function walkPlain(tokens: Token[]): string[] {
  const lines: string[] = [];
  for (const token of tokens) {
    if (token.type === "heading") {
      lines.push(inlineText(token.tokens));
      lines.push("");
    } else if (token.type === "paragraph") {
      lines.push(inlineText(token.tokens));
      lines.push("");
    } else if (token.type === "blockquote") {
      lines.push(
        ...walkPlain(token.tokens ?? []).map((line) => (line ? `> ${line}` : line)),
      );
    } else if (token.type === "list") {
      for (const item of token.items) {
        lines.push(`- ${inlineText(item.tokens)}`);
      }
      lines.push("");
    } else if (token.type === "code") {
      lines.push(token.text);
      lines.push("");
    } else if (token.type === "hr") {
      lines.push("---");
      lines.push("");
    } else if (token.type === "space") {
      continue;
    }
  }
  return lines;
}

export function markdownToRtf(content: string): Uint8Array {
  const tokens = lexer(content);
  const body = walkPlain(tokens)
    .map((line) => (line ? `\\pard ${rtfEscape(line)}\\par` : "\\par"))
    .join("\n");
  return utf8(`{\\rtf1\\ansi\\deff0\\uc1\n{\\fonttbl{\\f0\\fnil\\fcharset134 Noto Serif SC;}}\n\\f0\\fs24\n${body}\n}`);
}

export function markdownToHtmlDocument(
  content: string,
  options: { title: string; cssVars?: string; styled: boolean },
): Uint8Array {
  const body = renderMarkdown(content);
  if (!options.styled) {
    return utf8(
      `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(options.title)}</title></head><body>${body}</body></html>`,
    );
  }
  const css = `
:root { ${options.cssVars ?? ""} }
html, body { margin: 0; background: var(--color-bg, #f2ede4); color: var(--color-fg, #1a1814); font-family: "Noto Serif SC", "Songti SC", Georgia, serif; }
.md-body { max-width: 42rem; margin: 0 auto; padding: 2.5rem 1.5rem 4rem; line-height: 1.75; font-size: 1.125rem; overflow-wrap: anywhere; }
.md-body h1, .md-body h2, .md-body h3 { line-height: 1.25; letter-spacing: -0.02em; }
.md-body h1 { font-size: 1.85rem; margin: 0 0 1rem; }
.md-body h2 { font-size: 1.4rem; margin: 1.75rem 0 0.75rem; }
.md-body h3 { font-size: 1.2rem; margin: 1.5rem 0 0.5rem; }
.md-body p, .md-body blockquote, .md-body table { margin: 0 0 1rem; }
.md-body ul, .md-body ol { margin: 0 0 1rem; padding-left: 1.6em; }
.md-body li { margin: 0 0 0.5rem; }
.md-body a { color: var(--color-accent, #2c4a42); }
.md-body blockquote { border-left: 3px solid var(--color-accent, #2c4a42); padding-left: 1rem; color: var(--color-muted, #6a6358); }
.md-body code { font-family: ui-monospace, monospace; background: var(--color-overlay, #ddd4c4); border-radius: 6px; padding: 0.1em 0.35em; overflow-wrap: anywhere; }
.md-body pre { background: var(--color-surface, #e8e0d2); border-radius: 12px; padding: 1rem; overflow: hidden; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }
.md-body pre code { white-space: inherit; }
.md-body img { max-width: 100%; }
.md-body table { border-collapse: collapse; width: 100%; }
.md-body th, .md-body td { border-bottom: 1px solid var(--color-border, #d5cbb8); padding: 0.5rem 0.6rem; text-align: left; }
`.trim();
  return utf8(
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(options.title)}</title><style>${css}</style></head><body><article class="md-body">${body}</article></body></html>`,
  );
}

function docxParagraphs(content: string): string {
  const tokens = lexer(content);
  const parts: string[] = [];
  const run = (text: string, extra = "") =>
    `<w:r>${extra}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;
  const para = (inner: string, style?: string) =>
    `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}${inner}</w:p>`;
  for (const token of tokens) {
    if (token.type === "heading") {
      parts.push(para(run(inlineText(token.tokens)), `Heading${Math.min(token.depth, 3)}`));
    } else if (token.type === "paragraph") {
      parts.push(para(run(inlineText(token.tokens))));
    } else if (token.type === "list") {
      for (const item of token.items) {
        parts.push(para(run(`• ${inlineText(item.tokens)}`)));
      }
    } else if (token.type === "code") {
      parts.push(para(run(token.text)));
    } else if (token.type === "blockquote") {
      parts.push(para(run(inlineText(token.tokens))));
    } else if (token.type === "hr") {
      parts.push(para(run("—")));
    }
  }
  return parts.join("");
}

export async function markdownToDocx(content: string): Promise<Uint8Array> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
  );
  zip.file(
    "word/styles.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
</w:styles>`,
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${docxParagraphs(content)}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>`,
  );
  return zip.generateAsync({ type: "uint8array" });
}

function odtParagraphs(content: string): string {
  const tokens = lexer(content);
  const parts: string[] = [];
  for (const token of tokens) {
    if (token.type === "heading") {
      parts.push(
        `<text:h text:style-name="Heading_20_${token.depth}" text:outline-level="${token.depth}">${xmlEscape(inlineText(token.tokens))}</text:h>`,
      );
    } else if (token.type === "paragraph") {
      parts.push(`<text:p text:style-name="Text_20_body">${xmlEscape(inlineText(token.tokens))}</text:p>`);
    } else if (token.type === "list") {
      parts.push(
        `<text:list>${token.items
          .map(
            (item: { tokens?: Token[] }) =>
              `<text:list-item><text:p>${xmlEscape(inlineText(item.tokens))}</text:p></text:list-item>`,
          )
          .join("")}</text:list>`,
      );
    } else if (token.type === "code") {
      parts.push(`<text:p text:style-name="Preformatted_20_Text">${xmlEscape(token.text)}</text:p>`);
    } else if (token.type === "blockquote") {
      parts.push(`<text:p>${xmlEscape(inlineText(token.tokens))}</text:p>`);
    }
  }
  return parts.join("");
}

export async function markdownToOdt(content: string): Promise<Uint8Array> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  zip.file("mimetype", "application/vnd.oasis.opendocument.text", { compression: "STORE" });
  zip.file(
    "META-INF/manifest.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">
  <manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>
  <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
  <manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`,
  );
  zip.file(
    "styles.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" office:version="1.2">
  <office:styles/>
</office:document-styles>`,
  );
  zip.file(
    "content.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.2">
  <office:body><office:text>${odtParagraphs(content)}</office:text></office:body>
</office:document-content>`,
  );
  return zip.generateAsync({ type: "uint8array", mimeType: "application/vnd.oasis.opendocument.text" });
}

export function xhtmlFromMarkdown(content: string): string {
  return renderMarkdown(content)
    .replace(/<div class="code-block"[^>]*>/g, "")
    .replace(/<\/div>/g, "");
}
