const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("jingjianDesktop", {
  pickSavePath: (options) => ipcRenderer.invoke("export-pick", options),
  writeFile: (options) => ipcRenderer.invoke("export-write", options),
  saveFile: (options) => ipcRenderer.invoke("export-save", options),
  pickFolder: () => ipcRenderer.invoke("folder-pick"),
  folderStatus: () => ipcRenderer.invoke("folder-status"),
  folderList: () => ipcRenderer.invoke("folder-list"),
  folderWrite: (options) => ipcRenderer.invoke("folder-write", options),
  folderRemove: (options) => ipcRenderer.invoke("folder-remove", options),
  consumeLaunchFile: () => ipcRenderer.invoke("launch-consume"),
  readOpenFile: (options) => ipcRenderer.invoke("launch-read", options),
  netFetch: (options) => ipcRenderer.invoke("net-fetch", options),
  onOpenFile: (callback) => {
    const listener = (_event, data) => {
      callback(data);
    };
    ipcRenderer.on("open-file", listener);
    return () => {
      ipcRenderer.removeListener("open-file", listener);
    };
  },
});
