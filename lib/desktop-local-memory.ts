import fs from "node:fs";
import path from "node:path";

export interface LocalMemory {
  id: number;
  memory: string;
  category: string;
  importance: number;
  updated_at: string;
  last_used_at: string | null;
  use_count: number;
}
export interface LocalMessage { role: "user" | "assistant"; content: string; created_at: string }
interface LocalMemoryStore { nextId: number; memories: LocalMemory[]; messages: LocalMessage[] }

export function useDesktopLocalMemory(): boolean {
  return Boolean(process.env.VIVIAN_DESKTOP_DATA_DIR) && !(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
function filePath(): string {
  const directory = process.env.VIVIAN_DESKTOP_DATA_DIR;
  if (!directory) throw new Error("Desktop data directory is not configured");
  return path.join(directory, "memory.json");
}
function readStore(): LocalMemoryStore {
  const file = filePath();
  if (!fs.existsSync(file)) return { nextId: 1, memories: [], messages: [] };
  if (fs.lstatSync(file).isSymbolicLink()) throw new Error("Desktop memory cannot be a symbolic link");
  const value: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!value || typeof value !== "object") throw new Error("Invalid desktop memory data");
  const store = value as Partial<LocalMemoryStore>;
  if (typeof store.nextId !== "number" || !Number.isSafeInteger(store.nextId) || !Array.isArray(store.memories) || !Array.isArray(store.messages)) throw new Error("Invalid desktop memory data");
  return store as LocalMemoryStore;
}
function writeStore(store: LocalMemoryStore): void {
  const file = filePath();
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const temp = path.join(dir, `.memory.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(temp, JSON.stringify(store), { encoding: "utf8", mode: 0o600, flag: "wx" });
    fs.renameSync(temp, file);
    if (process.platform !== "win32") fs.chmodSync(file, 0o600);
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
export function loadLocalMemory(): Pick<LocalMemoryStore, "memories" | "messages"> {
  const store = readStore();
  return { memories: [...store.memories].sort((a, b) => b.importance - a.importance || b.updated_at.localeCompare(a.updated_at)).slice(0, 30), messages: [...store.messages].reverse().slice(0, 100) };
}
export function saveLocalMemory(memory: string, category = "general", importance = 3): LocalMemory {
  const store = readStore(); const now = new Date().toISOString();
  const existing = store.memories.find((item) => item.memory === memory);
  if (existing) { Object.assign(existing, { category, importance, updated_at: now }); writeStore(store); return existing; }
  const item: LocalMemory = { id: store.nextId++, memory, category, importance, updated_at: now, last_used_at: null, use_count: 0 };
  store.memories.push(item); writeStore(store); return item;
}
export function updateLocalMemory(id: number, memory: string, category: string, importance: number): LocalMemory | null {
  const store = readStore(); const item = store.memories.find((entry) => entry.id === id);
  if (!item) return null;
  if (store.memories.some((entry) => entry.id !== id && entry.memory === memory)) throw new Error("Memory already exists");
  Object.assign(item, { memory, category, importance, updated_at: new Date().toISOString() }); writeStore(store); return item;
}
export function deleteLocalMemory(id: number): void { const store = readStore(); store.memories = store.memories.filter((item) => item.id !== id); writeStore(store); }
export function clearLocalConversation(): void { const store = readStore(); store.messages = []; writeStore(store); }
export function appendLocalMessages(messages: Array<Pick<LocalMessage, "role" | "content">>): void {
  const store = readStore(); const created_at = new Date().toISOString();
  store.messages.push(...messages.map((message) => ({ ...message, created_at }))); store.messages = store.messages.slice(-100); writeStore(store);
}
export function markLocalMemoriesUsed(ids: number[]): void {
  if (!ids.length) return;
  const store = readStore(); const now = new Date().toISOString();
  for (const item of store.memories) if (ids.includes(item.id)) { item.last_used_at = now; item.use_count += 1; }
  writeStore(store);
}
