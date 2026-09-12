const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("jingjianDesktop", {
  pickSavePath: (options) => ipcRenderer.invoke("export-pick", options),
  writeFile: (options) => ipcRenderer.invoke("export-write", options),
  saveFile: (options) => ipcRenderer.invoke("export-save", options),
});
