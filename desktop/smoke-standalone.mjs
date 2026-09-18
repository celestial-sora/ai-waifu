import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const host = "127.0.0.1";
const port = "3217";
const token = "desktop-ci-smoke-token";
const tempParent = mkdtempSync(join(tmpdir(), "vivian-standalone-smoke-"));
const isolatedRoot = join(tempParent, "app");

cpSync(resolve(root, ".next", "standalone"), isolatedRoot, { recursive: true });
mkdirSync(join(isolatedRoot, ".next"), { recursive: true });
cpSync(resolve(root, ".next", "static"), join(isolatedRoot, ".next", "static"), { recursive: true });
cpSync(resolve(root, "public"), join(isolatedRoot, "public"), { recursive: true });

const serverPath = join(isolatedRoot, "server.js");
let child = null;
let stopping = false;

function stop() {
  if (stopping) return;
  stopping = true;
  if (child && child.exitCode === null) child.kill("SIGTERM");
}

async function waitFor(url, init, expected, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = null;

  while (Date.now() < deadline) {
    if (child?.exitCode !== null) {
      throw new Error(`Standalone server exited early with code ${child?.exitCode}`);
    }

    try {
      const response = await fetch(url, { ...init, redirect: "manual" });
      lastStatus = response.status;
      if (expected.includes(response.status)) return response;
    } catch {}

    await new Promise((resolveWait) => setTimeout(resolveWait, 400));
  }

  throw new Error(`Timed out waiting for ${url}; last status: ${lastStatus ?? "unreachable"}`);
}

try {
  child = spawn(process.execPath, [serverPath], {
    cwd: isolatedRoot,
    env: {
      ...process.env,
      NODE_ENV: "production",
      HOSTNAME: host,
      PORT: port,
      NEXT_TELEMETRY_DISABLED: "1",
      VIVIAN_DESKTOP_TOKEN: token,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => process.stdout.write(`[standalone] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[standalone] ${chunk}`));

  const origin = `http://${host}:${port}`;

  const desktop = await waitFor(`${origin}/desktop`, {}, [200]);
  const html = await desktop.text();
  if (!html.includes("desktop-pet-shell")) {
    throw new Error("/desktop did not render the Desktop Pet shell");
  }

  await waitFor(`${origin}/api/desktop-smoke-probe`, {}, [401]);

  const authorized = await waitFor(
    `${origin}/api/desktop-smoke-probe`,
    { headers: { "x-vivian-desktop-token": token } },
    [404],
  );

  if (authorized.status !== 404) {
    throw new Error("Desktop API token guard did not pass authorized requests through");
  }

  console.log(`Vivian isolated standalone smoke test passed from ${isolatedRoot}.`);
} finally {
  stop();
  rmSync(tempParent, { recursive: true, force: true });
}
