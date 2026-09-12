const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("jingjianDesktop", {
  saveFile: (options) => ipcRenderer.invoke("export-save", options),
});
