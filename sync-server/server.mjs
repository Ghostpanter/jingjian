#!/usr/bin/env node
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  dedupeNotes,
  filenameFor,
  isInsideDir,
  parseNote,
  serialize,
  stableIdFor,
} from "./note-file.mjs";
import { handleCollabUpgrade } from "./collab.mjs";

const PORT = Number(process.env.PORT || 8787);
const TOKEN = process.env.JINGJIAN_TOKEN || process.env.TOKEN || "";
const NOTES_DIR = path.resolve(process.env.NOTES_DIR || "/data/notes");

function isInsideNotes(target) {
  return isInsideDir(NOTES_DIR, target);
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "Authorization, Content-Type",
    "access-control-allow-methods": "GET,PUT,DELETE,OPTIONS",
    "cache-control": "no-store",
  });
  res.end(body);
}

function authorized(req, queryToken = "") {
  if (!TOKEN) return false;
  const header = req.headers.authorization || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const alt = String(req.headers["x-jingjian-token"] || "").trim();
  const provided = bearer || alt || String(queryToken || "").trim();
  if (!provided) return false;
  const left = createHash("sha256").update(provided).digest();
  const right = createHash("sha256").update(TOKEN).digest();
  return timingSafeEqual(left, right);
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  const max = 20 * 1024 * 1024;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) throw new Error("请求体过大");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

// Parsed-file cache keyed by name, reused while mtime+size are unchanged, so a
// first sync of thousands of notes does not re-read every file on every PUT.
const fileCache = new Map();
let lastDirMtime = -1; // dir mtime when fileCache was last known complete

async function dirMtime() {
  try {
    return (await stat(NOTES_DIR)).mtimeMs;
  } catch {
    return -2;
  }
}

async function loadNotes() {
  await mkdir(NOTES_DIR, { recursive: true });
  const entries = await readdir(NOTES_DIR, { withFileTypes: true });
  const notes = [];
  const seen = new Set();
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) continue;
    if (entry.name.startsWith(".")) continue;
    const abs = path.join(NOTES_DIR, entry.name);
    let st;
    try {
      st = await stat(abs);
    } catch {
      continue; // removed meanwhile
    }
    seen.add(entry.name);
    const hit = fileCache.get(entry.name);
    if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) {
      notes.push({ ...hit.note });
      continue;
    }
    const raw = await readFile(abs, "utf8");
    const note = parseNote(raw, stableIdFor(entry.name), {
      createdAt: Math.round(st.birthtimeMs || st.mtimeMs),
      updatedAt: Math.round(st.mtimeMs),
    });
    note.file = entry.name;
    note.raw = raw.replace(/^\uFEFF/, "");
    fileCache.set(entry.name, { mtimeMs: st.mtimeMs, size: st.size, note });
    notes.push({ ...note });
  }
  for (const name of fileCache.keys()) if (!seen.has(name)) fileCache.delete(name);
  lastDirMtime = await dirMtime();
  return dedupeNotes(notes);
}

/** Write via temp file + rename so a crash never leaves a half-written note. */
async function writeAtomic(abs, text) {
  const tmp = path.join(path.dirname(abs), `.tmp-${randomUUID()}`);
  await writeFile(tmp, text, "utf8");
  try {
    await rename(tmp, abs);
  } catch (error) {
    await rm(tmp, { force: true });
    throw error;
  }
}

async function writeNote(note, raw) {
  await mkdir(NOTES_DIR, { recursive: true });
  const target = filenameFor(note);
  const abs = path.resolve(NOTES_DIR, target);
  if (!isInsideNotes(abs)) throw new Error("invalid path");
  // Only the previous file for this id is needed. Skip the full rescan when
  // the folder listing is unchanged since our last scan/write.
  let previous;
  if (lastDirMtime >= 0 && (await dirMtime()) === lastDirMtime) {
    let best;
    for (const entry of fileCache.values()) {
      if (entry.note.id === note.id && (!best || entry.note.updatedAt >= best.updatedAt)) best = entry.note;
    }
    previous = best;
  } else {
    previous = (await loadNotes()).find((item) => item.id === note.id);
  }
  const text = typeof raw === "string" && raw.replace(/^\uFEFF/, "").startsWith("---")
    ? raw.replace(/^\uFEFF/, "")
    : serialize(note);
  await writeAtomic(abs, text);
  if (previous?.file && previous.file !== target) {
    const stale = path.resolve(NOTES_DIR, path.basename(previous.file));
    if (isInsideNotes(stale) && stale !== abs) await rm(stale, { force: true });
    fileCache.delete(path.basename(previous.file));
  }
  try {
    const st = await stat(abs);
    const parsed = parseNote(text, note.id, { createdAt: note.createdAt, updatedAt: note.updatedAt });
    parsed.file = target;
    parsed.raw = text;
    fileCache.set(target, { mtimeMs: st.mtimeMs, size: st.size, note: parsed });
    if (lastDirMtime >= 0) lastDirMtime = await dirMtime();
  } catch {
    lastDirMtime = -1;
  }
  return target;
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "Authorization, Content-Type",
        "access-control-allow-methods": "GET,PUT,DELETE,OPTIONS",
      });
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end("静笺同步服务已运行\n");
      return;
    }

    if (req.method === "GET" && url.pathname === "/health") {
      if (TOKEN && !authorized(req)) {
        json(res, 401, { error: "需要有效 Token" });
        return;
      }
      const notes = await loadNotes();
      json(res, 200, {
        ok: true,
        collab: 2,
        notesDir: NOTES_DIR,
        noteCount: notes.length,
      });
      return;
    }

    if (!TOKEN) {
      json(res, 500, { error: "未配置 JINGJIAN_TOKEN" });
      return;
    }
    if (!authorized(req)) {
      json(res, 401, { error: "需要有效 Token" });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/notes") {
      const notes = await loadNotes();
      json(res, 200, {
        notes: notes.map(({ file, ...note }) => note),
      });
      return;
    }

    const match = url.pathname.match(/^\/api\/notes\/([^/]+)$/);
    if (match) {
      const id = decodeURIComponent(match[1]);
      if (!isUuid(id)) {
        json(res, 400, { error: "无效的笔记 id" });
        return;
      }

      if (req.method === "GET") {
        const notes = await loadNotes();
        const note = notes.find((item) => item.id === id);
        if (!note) {
          json(res, 404, { error: "未找到" });
          return;
        }
        const { file, ...payload } = note;
        json(res, 200, payload);
        return;
      }

      if (req.method === "PUT") {
        let body;
        try {
          body = JSON.parse((await readBody(req)) || "{}");
        } catch (error) {
          const big = error instanceof Error && error.message === "请求体过大";
          json(res, big ? 413 : 400, { error: big ? "请求体过大" : "请求体不是有效 JSON" });
          return;
        }
        if (!body || typeof body !== "object") {
          json(res, 400, { error: "请求体不是有效 JSON" });
          return;
        }
        const note = {
          id,
          content: typeof body.content === "string" ? body.content : "",
          createdAt: Number(body.createdAt) || Date.now(),
          updatedAt: Number(body.updatedAt) || Date.now(),
        };
        const raw = typeof body.raw === "string" && body.raw.replace(/^\uFEFF/, "").startsWith("---")
          ? body.raw.replace(/^\uFEFF/, "")
          : "";
        const file = await writeNote(note, raw);
        json(res, 200, { ok: true, file });
        return;
      }

      if (req.method === "DELETE") {
        const notes = await loadNotes();
        const note = notes.find((item) => item.id === id);
        if (note?.file) {
          const target = path.resolve(NOTES_DIR, path.basename(note.file));
          if (isInsideNotes(target)) await rm(target, { force: true });
        }
        json(res, 200, { ok: true });
        return;
      }
    }

    json(res, 404, { error: "not found" });
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : "server error" });
  }
});

server.on("upgrade", (req, socket) => {
  socket.on("error", () => {});
  if (!handleCollabUpgrade(req, socket, { authorized })) socket.destroy();
});

await mkdir(NOTES_DIR, { recursive: true });
server.listen(PORT, "0.0.0.0", () => {
  console.log(`jingjian-sync listening on :${PORT}`);
  console.log(`NOTES_DIR ${NOTES_DIR}`);
});
