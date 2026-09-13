import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  net,
  protocol,
  shell,
} from "electron";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WWW_ROOT = path.join(__dirname, "www");
const SCHEME = "jingjian";

protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

app.setName("静笺");

if (process.platform === "win32") {
  app.setAppUserModelId("com.ghostpanter.jingjian");
  // Some Windows GPU drivers composite an empty window over the page.
  app.commandLine.appendSwitch("disable-gpu-compositing");
}

if (process.platform === "linux") {
  // Portable zip cannot chmod chrome-sandbox to 4755; Chromium aborts without this.
  app.commandLine.appendSwitch("no-sandbox");
  app.commandLine.appendSwitch("disable-setuid-sandbox");
  app.commandLine.appendSwitch("disable-gpu-sandbox");
  // NVIDIA / Wayland often show the same paper-colored empty window as Windows.
  app.commandLine.appendSwitch("disable-gpu-compositing");
  app.commandLine.appendSwitch("ozone-platform-hint", "x11");
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {string[]} */
const pendingFiles = [];

function isOpenableFile(filePath) {
  return /\.(md|markdown|txt|epub|png|jpe?g|gif|webp|bmp)$/i.test(filePath);
}

function filesFromArgv(argv) {
  const skip = new Set([".", "--", "--allow-file-access-from-files"]);
  const out = [];
  for (const arg of argv.slice(1)) {
    if (!arg || arg.startsWith("-") || skip.has(arg)) continue;
    const resolved = path.resolve(arg);
    if (existsSync(resolved) && isOpenableFile(resolved)) out.push(resolved);
  }
  return out;
}

function mimeFromName(name) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (ext === "md" || ext === "markdown") return "text/markdown";
  if (ext === "txt") return "text/plain";
  if (ext === "epub") return "application/epub+zip";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  if (ext === "bmp") return "image/bmp";
  return "application/octet-stream";
}

function mimeForAsset(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
    case ".mjs":
    case ".cjs":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
    case ".map":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".ico":
      return "image/x-icon";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    case ".ttf":
      return "font/ttf";
    case ".wasm":
      return "application/wasm";
    default:
      return "application/octet-stream";
  }
}

function isTextName(name, mime) {
  const lower = name.toLowerCase();
  const type = (mime || "").toLowerCase();
  return (
    lower.endsWith(".md") ||
    lower.endsWith(".markdown") ||
    lower.endsWith(".txt") ||
    type.startsWith("text/") ||
    type.includes("markdown")
  );
}

function describeFile(filePath) {
  const name = path.basename(filePath);
  return {
    kind: "uri",
    uri: filePath,
    name,
    mime: mimeFromName(name),
  };
}

function queueFiles(filePaths) {
  if (mainWindow) {
    for (const filePath of filePaths) {
      mainWindow.webContents.send("open-file", describeFile(filePath));
    }
    return;
  }
  for (const filePath of filePaths) {
    if (!pendingFiles.includes(filePath)) pendingFiles.push(filePath);
  }
}

function userDataFile(name) {
  return path.join(app.getPath("userData"), name);
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value), "utf8");
}

async function loadFolderPath() {
  const data = await readJson(userDataFile("sync-folder.json"), { path: "" });
  const folder = typeof data.path === "string" ? data.path : "";
  return folder && existsSync(folder) ? folder : "";
}

async function saveFolderPath(folder) {
  await writeJson(userDataFile("sync-folder.json"), { path: folder });
}

function isInside(root, target) {
  const rel = path.relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function resolveWww(requestUrl) {
  const parsed = new URL(requestUrl);
  let pathname = decodeURIComponent(parsed.pathname || "/");
  if (pathname.endsWith("/")) pathname += "index.html";
  if (pathname === "") pathname = "/index.html";
  const target = path.normalize(path.join(WWW_ROOT, pathname.replace(/^\/+/, "")));
  if (!isInside(WWW_ROOT, target)) return null;
  return target;
}

async function handleAppProtocol(request) {
  try {
    const target = resolveWww(request.url);
    if (!target) return new Response("Forbidden", { status: 403 });
    if (!existsSync(target)) return new Response("Not found", { status: 404 });
    const data = await readFile(target);
    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        "content-type": mimeForAsset(target),
        "cache-control": "no-cache",
      },
    });
  } catch (error) {
    console.error("protocol error", error);
    return new Response("Internal error", { status: 500 });
  }
}

async function loadWindowBounds() {
  const data = await readJson(userDataFile("window.json"), {});
  const width = Number(data.width) || 1280;
  const height = Number(data.height) || 840;
  return {
    width: Math.min(1920, Math.max(720, width)),
    height: Math.min(1200, Math.max(520, height)),
  };
}

function setupMenu() {
  if (process.platform !== "darwin") {
    Menu.setApplicationMenu(null);
    return;
  }
  const template = [
    {
      label: "静笺",
      submenu: [
        { role: "about", label: "关于静笺" },
        { type: "separator" },
        { role: "hide", label: "隐藏静笺" },
        { role: "hideOthers", label: "隐藏其他" },
        { role: "unhide", label: "显示全部" },
        { type: "separator" },
        { role: "quit", label: "退出静笺" },
      ],
    },
    {
      label: "编辑",
      submenu: [
        { role: "undo", label: "撤销" },
        { role: "redo", label: "重做" },
        { type: "separator" },
        { role: "cut", label: "剪切" },
        { role: "copy", label: "复制" },
        { role: "paste", label: "粘贴" },
        { role: "selectAll", label: "全选" },
      ],
    },
    {
      label: "窗口",
      submenu: [
        { role: "minimize", label: "最小化" },
        { role: "zoom", label: "缩放" },
        { type: "separator" },
        { role: "front", label: "前置全部窗口" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  app.setAboutPanelOptions({
    applicationName: "静笺",
    applicationVersion: app.getVersion(),
    copyright: "Ghostpanter",
  });
}

function loadAppPage(win) {
  void win.loadURL(`${SCHEME}://app/index.html`).catch((error) => {
    console.error("loadURL failed", error);
    const fallback = path.join(WWW_ROOT, "index.html");
    if (existsSync(fallback)) void win.loadFile(fallback);
  });
}

function createWindow(bounds) {
  const win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: 720,
    minHeight: 520,
    backgroundColor: "#F2EDE4",
    title: "静笺",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setTitle("静笺");
  win.on("close", () => {
    const { width, height } = win.getBounds();
    void writeJson(userDataFile("window.json"), { width, height });
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith(`${SCHEME}://`) || url.startsWith("file:")) return;
    event.preventDefault();
    void shell.openExternal(url);
  });
  win.webContents.on("did-fail-load", (_event, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    console.error("load failed", code, desc, url);
    const fallback = path.join(WWW_ROOT, "index.html");
    if (existsSync(fallback) && !String(url).startsWith("file:")) {
      void win.loadFile(fallback);
    }
  });
  loadAppPage(win);
  return win;
}

function registerIpc() {
  ipcMain.handle("export-pick", async (_event, payload) => {
    const filename = String(payload?.filename || "export.bin");
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "导出",
      defaultPath: filename,
      filters: [{ name: filename, extensions: [filename.split(".").pop() || "bin"] }],
    });
    if (canceled || !filePath) throw new Error("cancelled");
    return filePath;
  });

  ipcMain.handle("export-write", async (_event, payload) => {
    const filePath = String(payload?.filePath || "");
    if (!filePath) throw new Error("缺少保存路径");
    await writeFile(filePath, Buffer.from(String(payload?.base64 || ""), "base64"));
    return filePath;
  });

  ipcMain.handle("export-save", async (_event, payload) => {
    const filename = String(payload?.filename || "export.bin");
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "导出",
      defaultPath: filename,
      filters: [{ name: filename, extensions: [filename.split(".").pop() || "bin"] }],
    });
    if (canceled || !filePath) throw new Error("cancelled");
    await writeFile(filePath, Buffer.from(String(payload?.base64 || ""), "base64"));
    return filePath;
  });

  ipcMain.handle("folder-pick", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "选择笔记文件夹",
      properties: ["openDirectory", "createDirectory"],
    });
    if (canceled || !filePaths[0]) throw new Error("cancelled");
    await saveFolderPath(filePaths[0]);
    return { name: filePaths[0], path: filePaths[0] };
  });

  ipcMain.handle("folder-status", async () => {
    const folder = await loadFolderPath();
    if (!folder) return { ok: false, name: "", path: "" };
    return { ok: true, name: folder, path: folder };
  });

  ipcMain.handle("folder-list", async () => {
    const folder = await loadFolderPath();
    if (!folder) return { files: [] };
    const names = await readdir(folder);
    const files = [];
    for (const name of names) {
      if (!/\.(md|markdown|txt)$/i.test(name)) continue;
      const content = await readFile(path.join(folder, name), "utf8");
      files.push({ name, content });
    }
    return { files };
  });

  ipcMain.handle("folder-write", async (_event, payload) => {
    const folder = await loadFolderPath();
    if (!folder) throw new Error("请先选择保存文件夹");
    const name = String(payload?.name || "未命名.md");
    const content = String(payload?.content || "");
    const shortId = String(payload?.shortId || "");
    const names = await readdir(folder);
    for (const entry of names) {
      if (!shortId || !entry.replaceAll("-", "").includes(shortId)) continue;
      const previous = path.join(folder, entry);
      const next = path.join(folder, name);
      if (previous !== next) await unlink(previous).catch(() => {});
      break;
    }
    await writeFile(path.join(folder, name), content, "utf8");
  });

  ipcMain.handle("folder-remove", async (_event, payload) => {
    const folder = await loadFolderPath();
    if (!folder) return;
    const shortId = String(payload?.shortId || "");
    if (!shortId) return;
    const names = await readdir(folder);
    for (const entry of names) {
      if (!entry.replaceAll("-", "").includes(shortId)) continue;
      await unlink(path.join(folder, entry)).catch(() => {});
    }
  });

  ipcMain.handle("launch-consume", async () => {
    const next = pendingFiles.shift();
    return next ? describeFile(next) : {};
  });

  ipcMain.handle("launch-read", async (_event, payload) => {
    const filePath = String(payload?.path || payload?.uri || "");
    if (!filePath || !existsSync(filePath) || !isOpenableFile(filePath)) {
      throw new Error("找不到文件");
    }
    const bytes = await readFile(filePath);
    const name = String(payload?.name || path.basename(filePath));
    const mime = mimeFromName(name);
    const result = {
      uri: filePath,
      name,
      mime,
      data: bytes.toString("base64"),
    };
    if (isTextName(name, mime)) result.text = bytes.toString("utf8");
    return result;
  });

  ipcMain.handle("net-fetch", async (_event, payload) => {
    const url = String(payload?.url || "");
    if (!/^https?:\/\//i.test(url)) throw new Error("不支持的地址");
    const method = String(payload?.method || "GET").toUpperCase();
    const headers = payload?.headers && typeof payload.headers === "object" ? payload.headers : {};
    const timeoutMs = Number(payload?.timeoutMs) || 20_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      /** @type {RequestInit} */
      const init = { method, headers, signal: controller.signal };
      if (payload?.body != null && method !== "GET" && method !== "HEAD") {
        init.body = String(payload.body);
      }
      const response = await net.fetch(url, init);
      const buffer = Buffer.from(await response.arrayBuffer());
      /** @type {Record<string, string>} */
      const responseHeaders = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });
      return {
        ok: response.ok,
        status: response.status,
        headers: responseHeaders,
        bodyText: buffer.toString("utf8"),
        bodyBase64: buffer.toString("base64"),
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("连接超时");
      }
      throw new Error("无法连接同步服务，请检查地址与网络");
    } finally {
      clearTimeout(timer);
    }
  });
}

app.on("open-file", (event, filePath) => {
  event.preventDefault();
  queueFiles([filePath]);
});

if (gotLock) {
  queueFiles(filesFromArgv(process.argv));
  app.on("second-instance", (_event, argv) => {
    queueFiles(filesFromArgv(argv));
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    protocol.handle(SCHEME, handleAppProtocol);
    registerIpc();
    setupMenu();
    const bounds = await loadWindowBounds();
    mainWindow = createWindow(bounds);
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void loadWindowBounds().then((next) => {
          mainWindow = createWindow(next);
        });
      }
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
