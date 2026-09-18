const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow, dialog, ipcMain, session } = require("electron");
const { startPackagedNextServer } = require("./server.cjs");

const HOST = "127.0.0.1";
const DEV_PORT = Number.parseInt(process.env.VIVIAN_DESKTOP_PORT || "3210", 10);
const SMOKE_TEST = process.argv.includes("--smoke-test");
const SMOKE_LOG_PATH = process.env.VIVIAN_SMOKE_LOG || "";

function smokeLog(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);

  if (SMOKE_TEST && SMOKE_LOG_PATH) {
    try {
      fs.appendFileSync(SMOKE_LOG_PATH, `${line}\n`, "utf8");
    } catch {}
  }
}

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
  smokeLog(`Creating BrowserWindow for ${desktopOrigin}/desktop`);

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
    smokeLog("Renderer did-finish-load");
    if (!SMOKE_TEST || !mainWindow) return;

    try {
      const healthy = await mainWindow.webContents.executeJavaScript(
        `Boolean(document.querySelector(".desktop-pet-shell") && document.querySelector("canvas.live2d-canvas"))`,
      );

      if (!healthy) throw new Error("Desktop Pet shell did not render");

      smokeLog("Packaged Electron renderer DOM validation passed");
      app.quit();
    } catch (error) {
      smokeLog(`Packaged Electron renderer validation failed: ${error instanceof Error ? error.stack || error.message : String(error)}`);
      app.exit(1);
    }
  });

  mainWindow.webContents.once("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    smokeLog(`Renderer did-fail-load: code=${errorCode} mainFrame=${isMainFrame} url=${validatedURL} ${errorDescription}`);
    if (!SMOKE_TEST || !isMainFrame || errorCode === -3) return;
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
  smokeLog(`Preparing runtime packaged=${app.isPackaged} resources=${process.resourcesPath}`);
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
  smokeLog(`Packaged Next server ready at ${desktopOrigin}`);

  desktopServer.child.once("exit", (code, signal) => {
    if (quitting) return;
    const reason = signal ? `signal ${signal}` : `code ${code ?? "unknown"}`;
    dialog.showErrorBox("Vivian Desktop Pet", `Vivian local server stopped unexpectedly (${reason}).`);
    app.quit();
  });
}

app.whenReady().then(async () => {
  smokeLog("Electron app ready");
  try {
    await prepareRuntime();
    configureSessionSecurity();
    createWindow();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!SMOKE_TEST) {
      dialog.showErrorBox("Vivian Desktop Pet", `Failed to start Vivian.\n\n${message}`);
    }
    smokeLog(`Failed to start Vivian: ${error instanceof Error ? error.stack || error.message : String(error)}`);
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
