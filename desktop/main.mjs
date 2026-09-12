import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
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
  const page = path.join(__dirname, "www", "index.html");
  void win.loadFile(page);
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  ipcMain.handle("export-save", async (_event, payload) => {
    const filename = String(payload?.filename || "export.bin");
    const mime = String(payload?.mime || "application/octet-stream");
    const base64 = String(payload?.base64 || "");
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "导出",
      defaultPath: filename,
      filters: [{ name: filename, extensions: [filename.split(".").pop() || "bin"] }],
    });
    if (canceled || !filePath) {
      throw new Error("cancelled");
    }
    await writeFile(filePath, Buffer.from(base64, "base64"));
    void mime;
    return filePath;
  });
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
