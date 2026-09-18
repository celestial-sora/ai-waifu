const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("vivianDesktop", {
  close: () => ipcRenderer.send("vivian-desktop:close"),
  minimize: () => ipcRenderer.send("vivian-desktop:minimize"),
  toggleAlwaysOnTop: () => ipcRenderer.invoke("vivian-desktop:toggle-always-on-top"),
});
