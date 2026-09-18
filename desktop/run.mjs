import { spawn } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const host = "127.0.0.1";
const port = "3210";
const nextBin = resolve(root, "node_modules", "next", "dist", "bin", "next");

const next = spawn(process.execPath, [nextBin, "dev", "-H", host, "-p", port], {
  cwd: root,
  env: { ...process.env, VIVIAN_DESKTOP_HOST: host, VIVIAN_DESKTOP_PORT: port },
  stdio: "inherit",
});

let electron;
let stopping = false;

async function waitForDesktopRoute() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (next.exitCode !== null) throw new Error("Next.js exited before /desktop became ready");
    try {
      const response = await fetch(`http://${host}:${port}/desktop`, { redirect: "manual" });
      if (response.ok || response.status === 307 || response.status === 308) return;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error("Timed out waiting for Vivian desktop route");
}

function stop() {
  if (stopping) return;
  stopping = true;
  if (electron && electron.exitCode === null) electron.kill("SIGTERM");
  if (next.exitCode === null) next.kill("SIGTERM");
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

try {
  await waitForDesktopRoute();

  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  electron = spawn(npx, ["--yes", "electron@latest", "desktop/electron.cjs"], {
    cwd: root,
    env: { ...process.env, VIVIAN_DESKTOP_HOST: host, VIVIAN_DESKTOP_PORT: port },
    stdio: "inherit",
  });

  electron.on("exit", (code) => {
    if (next.exitCode === null) next.kill("SIGTERM");
    process.exit(code ?? 0);
  });

  next.on("exit", (code) => {
    if (!stopping && electron?.exitCode === null) electron.kill("SIGTERM");
    if (!stopping) process.exit(code ?? 1);
  });
} catch (error) {
  console.error(error);
  stop();
  process.exit(1);
}
