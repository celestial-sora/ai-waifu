const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("vivianDesktop", {
  close: () => ipcRenderer.send("vivian-desktop:close"),
  minimize: () => ipcRenderer.send("vivian-desktop:minimize"),
  toggleAlwaysOnTop: () => ipcRenderer.invoke("vivian-desktop:toggle-always-on-top"),
  getApiKeyStatus: () => ipcRenderer.invoke("vivian-desktop:get-api-key-status"),
  saveApiKeys: (updates) => ipcRenderer.invoke("vivian-desktop:save-api-keys", updates),
});
