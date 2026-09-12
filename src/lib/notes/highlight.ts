import hljs from "highlight.js/lib/common";
import cmake from "highlight.js/lib/languages/cmake";
import dart from "highlight.js/lib/languages/dart";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import gradle from "highlight.js/lib/languages/gradle";
import groovy from "highlight.js/lib/languages/groovy";
import http from "highlight.js/lib/languages/http";
import nginx from "highlight.js/lib/languages/nginx";
import powershell from "highlight.js/lib/languages/powershell";
import properties from "highlight.js/lib/languages/properties";
import protobuf from "highlight.js/lib/languages/protobuf";
import { escapeHtml } from "./escape-html.ts";

const EXTRA: Array<[string, typeof dockerfile]> = [
  ["cmake", cmake],
  ["dart", dart],
  ["dockerfile", dockerfile],
  ["gradle", gradle],
  ["groovy", groovy],
  ["http", http],
  ["nginx", nginx],
  ["powershell", powershell],
  ["properties", properties],
  ["protobuf", protobuf],
];

for (const [name, language] of EXTRA) {
  if (!hljs.getLanguage(name)) hljs.registerLanguage(name, language);
}

const ALIASES: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  rb: "ruby",
  sh: "bash",
  zsh: "bash",
  fish: "bash",
  shell: "bash",
  yml: "yaml",
  ps1: "powershell",
  ps: "powershell",
  docker: "dockerfile",
  kt: "kotlin",
  kts: "kotlin",
  rs: "rust",
  cs: "csharp",
  "c++": "cpp",
  "c#": "csharp",
  cc: "cpp",
  hpp: "cpp",
  h: "c",
  objc: "objectivec",
  mm: "objectivec",
  md: "markdown",
  html: "xml",
  htm: "xml",
  svg: "xml",
  vue: "xml",
  proto: "protobuf",
  tf: "properties",
  env: "ini",
  conf: "nginx",
  toml: "ini",
  text: "plaintext",
  txt: "plaintext",
};

const MAX_HIGHLIGHT_CHARS = 80_000;

function resolveLang(lang?: string): string | undefined {
  if (!lang) return undefined;
  const key = lang.trim().toLowerCase();
  if (!key) return undefined;
  return ALIASES[key] ?? key;
}

export function highlightCode(code: string, lang?: string): string {
  if (code.length > MAX_HIGHLIGHT_CHARS) return escapeHtml(code);
  const resolved = resolveLang(lang);
  try {
    if (resolved && hljs.getLanguage(resolved)) {
      return hljs.highlight(code, { language: resolved, ignoreIllegals: true }).value;
    }
    return hljs.highlightAuto(code).value;
  } catch {
    return escapeHtml(code);
  }
}

export function displayLang(lang?: string): string {
  const resolved = resolveLang(lang);
  return resolved && hljs.getLanguage(resolved) ? resolved : lang?.trim() || "";
}
