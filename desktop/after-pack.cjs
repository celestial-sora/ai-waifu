const fs = require("node:fs");
const path = require("node:path");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") return;

  const projectRoot = path.resolve(__dirname, "..");
  const resourcesDir = path.join(context.appOutDir, "resources");
  const destination = path.join(resourcesDir, "standalone");

  const standaloneSource = path.join(projectRoot, ".next", "standalone");
  const staticSource = path.join(projectRoot, ".next", "static");
  const publicSource = path.join(projectRoot, "public");

  if (!fs.existsSync(path.join(standaloneSource, "server.js"))) {
    throw new Error(`Desktop standalone source is missing: ${standaloneSource}`);
  }

  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(destination, { recursive: true });

  fs.cpSync(standaloneSource, destination, {
    recursive: true,
    dereference: true,
    force: true,
  });

  fs.mkdirSync(path.join(destination, ".next"), { recursive: true });
  fs.cpSync(staticSource, path.join(destination, ".next", "static"), {
    recursive: true,
    dereference: true,
    force: true,
  });
  fs.cpSync(publicSource, path.join(destination, "public"), {
    recursive: true,
    dereference: true,
    force: true,
  });

  const nextPackage = path.join(destination, "node_modules", "next", "package.json");
  if (!fs.existsSync(nextPackage)) {
    throw new Error("Packaged standalone runtime is missing node_modules/next after afterPack copy");
  }

  console.log(`[vivian-after-pack] Copied self-contained standalone runtime to ${destination}`);
};
