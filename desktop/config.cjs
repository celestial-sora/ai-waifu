const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const CONFIG_FIELDS = Object.freeze([
  "GROQ_API_KEY",
  "CEREBRAS_API_KEY",
  "GEMINI_API_KEY",
  "OPENROUTER_API_KEY",
  "ELEVENLABS_API_KEY",
  "FISH_AUDIO_API_KEY",
  "FISH_AUDIO_VOICE_ID",
  "TAVILY_API_KEY",
  "COMPOSIO_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
]);
const ALLOWED_FIELDS = new Set(CONFIG_FIELDS);

function configPath(userDataPath) {
  return path.join(userDataPath, ".env");
}

function defaultUserDataPath() {
  if (process.platform === "win32") return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Vivian");
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "Vivian");
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "Vivian");
}

function readConfigSource(userDataPath) {
  const filePath = configPath(userDataPath);
  if (!fs.existsSync(filePath)) return "";
  if (fs.lstatSync(filePath).isSymbolicLink()) throw new Error("Desktop config cannot be a symbolic link");
  return fs.readFileSync(filePath, "utf8");
}

function parseEnvFile(userDataPath) {
  const result = {};
  for (const rawLine of readConfigSource(userDataPath).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const separator = normalized.indexOf("=");
    if (separator <= 0) continue;
    const key = normalized.slice(0, separator).trim();
    let value = normalized.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    result[key] = value.replace(/\\n/g, "\n");
  }
  return result;
}

function getConfigStatus(userDataPath) {
  const saved = parseEnvFile(userDataPath);
  return Object.fromEntries(CONFIG_FIELDS.map((field) => [field, saved[field] ? "local" : process.env[field] ? "environment" : null]));
}

function saveConfigUpdates(userDataPath, updates) {
  if (!updates || typeof updates !== "object" || Array.isArray(updates)) throw new Error("Invalid desktop configuration");
  const entries = Object.entries(updates);
  if (!entries.length) throw new Error("No settings to save");
  for (const [key, value] of entries) {
    if (!ALLOWED_FIELDS.has(key) || typeof value !== "string" || value.length > 4096 || /[\r\n\0]/.test(value) || value.includes("\\n") || value.trim() !== value || /^["']|["']$/.test(value)) {
      throw new Error(`Invalid value for ${key}`);
    }
  }

  fs.mkdirSync(userDataPath, { recursive: true, mode: 0o700 });
  const existing = readConfigSource(userDataPath);
  const changed = new Set(entries.map(([key]) => key));
  const lines = existing.split(/\r?\n/).filter((line) => {
    const match = line.trim().match(/^(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/);
    return !match || !changed.has(match[1]);
  });
  while (lines.at(-1) === "") lines.pop();
  for (const [key, value] of entries) if (value) lines.push(`${key}=${value}`);

  const target = configPath(userDataPath);
  const temporary = path.join(userDataPath, `.env.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(temporary, `${lines.join("\n")}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    fs.renameSync(temporary, target);
    if (process.platform !== "win32") fs.chmodSync(target, 0o600);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  return getConfigStatus(userDataPath);
}

module.exports = { CONFIG_FIELDS, defaultUserDataPath, parseEnvFile, getConfigStatus, saveConfigUpdates };
