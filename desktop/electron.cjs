const path = require("node:path");
const { app, BrowserWindow, ipcMain, session } = require("electron");

const HOST = process.env.VIVIAN_DESKTOP_HOST || "127.0.0.1";
const PORT = process.env.VIVIAN_DESKTOP_PORT || "3210";
const DESKTOP_URL = `http://${HOST}:${PORT}/desktop`;
const ALLOWED_ORIGIN = `http://${HOST}:${PORT}`;

app.commandLine.appendSwitch("ozone-platform-hint", "auto");

let mainWindow = null;

function isLocalVivianUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === ALLOWED_ORIGIN;
  } catch {
    return false;
  }
}

function configurePermissions() {
  const ses = session.defaultSession;

  ses.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    if (requestingOrigin !== ALLOWED_ORIGIN) return false;
    return permission === "media" || permission === "camera" || permission === "microphone";
  });

  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestingUrl = details.requestingUrl || webContents.getURL();
    const allowed =
      isLocalVivianUrl(requestingUrl) &&
      (permission === "media" || permission === "camera" || permission === "microphone");
    callback(allowed);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 460,
    height: 720,
    minWidth: 360,
    minHeight: 540,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    show: false,
    title: "Vivian Desktop Pet",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  mainWindow.setAlwaysOnTop(true, "floating");
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isLocalVivianUrl(url)) event.preventDefault();
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.loadURL(DESKTOP_URL);
}

app.whenReady().then(() => {
  configurePermissions();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  app.quit();
});

ipcMain.on("vivian-desktop:close", () => {
  mainWindow?.close();
});

ipcMain.on("vivian-desktop:minimize", () => {
  mainWindow?.minimize();
});

ipcMain.handle("vivian-desktop:toggle-always-on-top", () => {
  if (!mainWindow) return false;
  const next = !mainWindow.isAlwaysOnTop();
  mainWindow.setAlwaysOnTop(next, "floating");
  return next;
});
