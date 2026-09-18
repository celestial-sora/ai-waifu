const crypto = require("node:crypto");
const path = require("node:path");
const { app, BrowserWindow, dialog, ipcMain, session } = require("electron");
const { startPackagedNextServer } = require("./server.cjs");

const HOST = "127.0.0.1";
const DEV_PORT = Number.parseInt(process.env.VIVIAN_DESKTOP_PORT || "3210", 10);
const SMOKE_TEST = process.argv.includes("--smoke-test");

app.setName("Vivian");
app.commandLine.appendSwitch("ozone-platform-hint", "auto");

let mainWindow = null;
let desktopServer = null;
let desktopOrigin = null;
let desktopToken = null;
let quitting = false;

function isLocalVivianUrl(value) {
  if (!desktopOrigin) return false;

  try {
    const url = new URL(value);
    return url.origin === desktopOrigin;
  } catch {
    return false;
  }
}

function isLocalVivianApiUrl(value) {
  if (!desktopOrigin) return false;

  try {
    const url = new URL(value);
    return url.origin === desktopOrigin && (url.pathname === "/api" || url.pathname.startsWith("/api/"));
  } catch {
    return false;
  }
}

function configureSessionSecurity() {
  const ses = session.defaultSession;

  ses.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    if (requestingOrigin !== desktopOrigin) return false;
    return permission === "media" || permission === "camera" || permission === "microphone";
  });

  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestingUrl = details.requestingUrl || webContents.getURL();
    const allowed =
      isLocalVivianUrl(requestingUrl) &&
      (permission === "media" || permission === "camera" || permission === "microphone");
    callback(allowed);
  });

  ses.webRequest.onBeforeSendHeaders(
    { urls: ["http://127.0.0.1/*"] },
    (details, callback) => {
      const requestHeaders = { ...details.requestHeaders };

      const trustedRendererRequest =
        desktopToken &&
        mainWindow &&
        details.webContentsId === mainWindow.webContents.id &&
        details.initiatorOrigin === desktopOrigin &&
        isLocalVivianApiUrl(details.url);

      if (trustedRendererRequest) {
        requestHeaders["X-Vivian-Desktop-Token"] = desktopToken;
      }

      callback({ requestHeaders });
    },
  );
}

function createWindow() {
  if (!desktopOrigin) throw new Error("Vivian desktop origin is not ready");

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

  mainWindow.once("ready-to-show", () => {
    if (!SMOKE_TEST) mainWindow?.show();
  });

  mainWindow.webContents.once("did-finish-load", async () => {
    if (!SMOKE_TEST || !mainWindow) return;

    try {
      const healthy = await mainWindow.webContents.executeJavaScript(
        `Boolean(document.querySelector(".desktop-pet-shell") && document.querySelector("canvas.live2d-canvas"))`,
      );

      if (!healthy) throw new Error("Desktop Pet shell did not render");

      console.log("[vivian-smoke] Packaged Electron renderer loaded successfully");
      app.quit();
    } catch (error) {
      console.error("[vivian-smoke] Packaged Electron renderer validation failed", error);
      app.exit(1);
    }
  });

  mainWindow.webContents.once("did-fail-load", (_event, errorCode, errorDescription) => {
    if (!SMOKE_TEST) return;
    console.error(`[vivian-smoke] Renderer failed to load: ${errorCode} ${errorDescription}`);
    app.exit(1);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  void mainWindow.loadURL(`${desktopOrigin}/desktop`).catch((error) => {
    if (!SMOKE_TEST) {
      dialog.showErrorBox("Vivian Desktop Pet", `Failed to load Vivian desktop UI.\n\n${error.message}`);
    }
    console.error("[vivian-desktop] Failed to load desktop UI", error);
    app.exit(1);
  });
}

async function prepareRuntime() {
  if (!app.isPackaged) {
    desktopOrigin = `http://${HOST}:${DEV_PORT}`;
    return;
  }

  desktopToken = crypto.randomBytes(32).toString("hex");
  desktopServer = await startPackagedNextServer({
    resourcesPath: process.resourcesPath,
    userDataPath: app.getPath("userData"),
    desktopToken,
    host: HOST,
    preferredPort: 3210,
  });
  desktopOrigin = desktopServer.origin;

  desktopServer.child.once("exit", (code, signal) => {
    if (quitting) return;
    const reason = signal ? `signal ${signal}` : `code ${code ?? "unknown"}`;
    dialog.showErrorBox("Vivian Desktop Pet", `Vivian local server stopped unexpectedly (${reason}).`);
    app.quit();
  });
}

app.whenReady().then(async () => {
  try {
    await prepareRuntime();
    configureSessionSecurity();
    createWindow();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!SMOKE_TEST) {
      dialog.showErrorBox("Vivian Desktop Pet", `Failed to start Vivian.\n\n${message}`);
    }
    console.error("[vivian-desktop] Failed to start Vivian", error);
    app.exit(1);
    return;
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  quitting = true;
  desktopServer?.stop();
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
