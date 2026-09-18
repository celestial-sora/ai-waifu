const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};

  const result = {};
  const source = fs.readFileSync(filePath, "utf8");

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const separator = normalized.indexOf("=");
    if (separator <= 0) continue;

    const key = normalized.slice(0, separator).trim();
    let value = normalized.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    value = value.replace(/\\n/g, "\n");
    result[key] = value;
  }

  return result;
}

function canBind(host, port) {
  return new Promise((resolve) => {
    const probe = net.createServer();

    probe.unref();
    probe.once("error", () => resolve(false));
    probe.listen({ host, port, exclusive: true }, () => {
      probe.close(() => resolve(true));
    });
  });
}

async function findAvailablePort(host, preferredPort, attempts = 20) {
  for (let offset = 0; offset < attempts; offset += 1) {
    const port = preferredPort + offset;
    if (await canBind(host, port)) return port;
  }

  throw new Error(`No free Vivian desktop port found in ${preferredPort}-${preferredPort + attempts - 1}`);
}

function waitForDesktopRoute(origin, child, timeoutMs = 45_000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const attempt = () => {
      if (child.exitCode !== null) {
        reject(new Error(`Vivian standalone server exited before startup (code ${child.exitCode})`));
        return;
      }

      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error("Timed out waiting for packaged Vivian /desktop route"));
        return;
      }

      const request = http.get(`${origin}/desktop`, { timeout: 2_000 }, (response) => {
        response.resume();
        if (response.statusCode && response.statusCode >= 200 && response.statusCode < 400) {
          resolve();
          return;
        }
        setTimeout(attempt, 300);
      });

      request.on("timeout", () => request.destroy());
      request.on("error", () => setTimeout(attempt, 300));
    };

    attempt();
  });
}

async function startPackagedNextServer({
  resourcesPath,
  userDataPath,
  desktopToken,
  host = "127.0.0.1",
  preferredPort = 3210,
}) {
  if (host !== "127.0.0.1") {
    throw new Error("Vivian desktop server must bind to 127.0.0.1");
  }

  const standaloneRoot = path.join(resourcesPath, "standalone");
  const serverPath = path.join(standaloneRoot, "server.js");

  if (!fs.existsSync(serverPath)) {
    throw new Error(`Packaged Next standalone server is missing: ${serverPath}`);
  }

  const port = await findAvailablePort(host, preferredPort);
  const origin = `http://${host}:${port}`;
  const userEnv = parseEnvFile(path.join(userDataPath, ".env"));

  const child = spawn(process.execPath, [serverPath], {
    cwd: standaloneRoot,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ...userEnv,
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      HOSTNAME: host,
      PORT: String(port),
      VIVIAN_DESKTOP_TOKEN: desktopToken,
      ELECTRON_RUN_AS_NODE: "1",
    },
  });

  const smokeLogPath = process.env.VIVIAN_SMOKE_LOG || "";

  function logChildOutput(kind, chunk) {
    const text = `[vivian-next:${kind}] ${chunk}`;
    if (kind === "stderr") process.stderr.write(text);
    else process.stdout.write(text);

    if (smokeLogPath) {
      try {
        fs.appendFileSync(smokeLogPath, text, "utf8");
      } catch {}
    }
  }

  child.stdout?.on("data", (chunk) => logChildOutput("stdout", chunk));
  child.stderr?.on("data", (chunk) => logChildOutput("stderr", chunk));

  await waitForDesktopRoute(origin, child);

  return {
    child,
    host,
    port,
    origin,
    stop() {
      if (child.exitCode === null) child.kill("SIGTERM");
    },
  };
}

module.exports = {
  startPackagedNextServer,
};
