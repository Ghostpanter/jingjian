#!/usr/bin/env node
// 一次性清理：旧版同步服务端给无 frontmatter 的 .md 每次分配随机 id，客户端回传后产生内容相同的重复文件。
// 默认只预览（dry-run）；加 --apply 才会把重复文件移动到 NOTES_DIR/.dedupe-trash/<时间>/（不直接删除）。
// 用法：NOTES_DIR=/data/notes node dedupe.mjs [--apply]
import { mkdir, readdir, readFile, rename, stat } from "node:fs/promises";
import path from "node:path";
import { FRONTMATTER, parseNote } from "./note-file.mjs";

export async function planDedupe(dir) {
  const groups = new Map();
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (!e.isFile() || !e.name.toLowerCase().endsWith(".md") || e.name.startsWith(".")) continue;
    const raw = (await readFile(path.join(dir, e.name), "utf8")).replace(/^\uFEFF/, "");
    const plain = !FRONTMATTER.test(raw);
    const st = await stat(path.join(dir, e.name));
    const note = parseNote(raw, "", { updatedAt: st.mtimeMs });
    const key = note.content.replace(/\r\n/g, "\n").trim();
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ file: e.name, plain, updatedAt: note.updatedAt });
  }
  const plan = [];
  for (const files of groups.values()) {
    if (files.length < 2) continue;
    files.sort((a, b) => (b.plain - a.plain) || (b.updatedAt - a.updatedAt));
    plan.push({ keep: files[0].file, remove: files.slice(1).map((f) => f.file) });
  }
  return plan;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = path.resolve(process.env.NOTES_DIR || "/data/notes");
  const apply = process.argv.includes("--apply");
  const plan = await planDedupe(dir);
  const n = plan.reduce((a, p) => a + p.remove.length, 0);
  for (const p of plan) console.log(`保留 ${p.keep}\n  重复 ${p.remove.join("\n  重复 ")}`);
  if (!apply) {
    console.log(`\n预览：${plan.length} 组，共 ${n} 个重复文件。确认后加 --apply 执行（移动到 .dedupe-trash，可恢复）。`);
  } else {
    const trash = path.join(dir, ".dedupe-trash", new Date().toISOString().replace(/[:.]/g, "-"));
    await mkdir(trash, { recursive: true });
    for (const p of plan) for (const f of p.remove) await rename(path.join(dir, f), path.join(trash, f));
    console.log(`\n已移动 ${n} 个重复文件到 ${trash}`);
  }
}
