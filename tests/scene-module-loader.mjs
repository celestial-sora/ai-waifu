import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const require = createRequire(import.meta.url);
export function loadSceneModule(path, imports = {}, globals = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  runInNewContext(source, { exports, Buffer, File, Blob, Response, Request, URL, Uint8Array, AbortSignal, Date, Error, TypeError, SyntaxError, setTimeout, clearTimeout, process: { env: {} }, console,
    require(name) { if (name in imports) return imports[name]; if (name === "server-only") return {}; if (name.startsWith("node:") || ["sharp", "ipaddr.js"].includes(name)) return require(name); throw new Error(`Unexpected import: ${name}`); }, ...globals });
  return exports;
}
