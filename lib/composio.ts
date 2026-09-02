/**
 * Composio integration for Vivian — connects to Composio v3.1 REST API.
 * Includes in-memory caching and smart relevance ranking for tools.
 */

export interface ComposioTool {
  slug: string;
  name: string;
  description: string;
  toolkitSlug?: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
}

export interface ComposioConnectedAccount {
  id: string;
  appUniqueId: string;
  status: string;
  toolkit: { slug: string; name: string };
}

export interface ComposioToolCall {
  slug: string;
  arguments: Record<string, unknown>;
}

export interface ComposioToolResult {
  tool: string;
  ok: boolean;
  content: string;
}

const COMPOSIO_BASE = "https://backend.composio.dev/api/v3";
const COMPOSIO_V31_BASE = "https://backend.composio.dev/api/v3.1";

function getApiKey(): string | undefined {
  return process.env.COMPOSIO_API_KEY?.trim();
}

/** In-memory cache for toolkit tools (1 hour TTL) */
const toolkitCache = new Map<string, { timestamp: number; tools: ComposioTool[] }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Fetch connected accounts for this API key.
 */
export async function getComposioConnectedAccounts(): Promise<ComposioConnectedAccount[]> {
  const apiKey = getApiKey();
  if (!apiKey) return [];

  try {
    const res = await fetch(`${COMPOSIO_BASE}/connected_accounts`, {
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    const data = await res.json() as { items?: ComposioConnectedAccount[] };
    return data.items ?? [];
  } catch (err) {
    console.warn("Composio connected_accounts check error", err);
    return [];
  }
}

/**
 * Detect toolkit slugs from user message.
 */
export function detectToolkits(userText: string): string[] {
  const lower = userText.toLowerCase();
  const matched = new Set<string>();

  if (lower.includes("youtube") || lower.includes("ยูทูป") || lower.includes("คลิป") || lower.includes("วิดีโอ") || lower.includes("video")) {
    matched.add("youtube");
  }
  if (lower.includes("discord") || lower.includes("ดิสคอร์ด") || lower.includes("ดิส")) {
    matched.add("discord");
    matched.add("discordbot");
  }
  if (lower.includes("spotify") || lower.includes("สปอติฟาย") || lower.includes("เพลง") || lower.includes("song") || lower.includes("music")) {
    matched.add("spotify");
  }
  if (lower.includes("github") || lower.includes("กิตฮับ") || lower.includes("issue") || lower.includes("repo") || lower.includes("commit") || lower.includes("pull request") || lower.includes("pr")) {
    matched.add("github");
  }
  if (lower.includes("calendar") || lower.includes("ปฏิทิน") || lower.includes("นัด") || lower.includes("meeting") || lower.includes("event")) {
    matched.add("googlecalendar");
  }
  if (lower.includes("mail") || lower.includes("email") || lower.includes("อีเมล") || lower.includes("เมล") || lower.includes("gmail")) {
    matched.add("gmail");
  }
  if (lower.includes("notion") || lower.includes("โน้ต") || lower.includes("บันทึก")) {
    matched.add("notion");
  }
  if (lower.includes("slack") || lower.includes("สแล็ค")) {
    matched.add("slack");
  }
  if (lower.includes("tweet") || lower.includes("twitter") || lower.includes("ทวิต")) {
    matched.add("twitter");
  }

  return Array.from(matched);
}

/**
 * Score and rank tools by relevance to user's action query.
 */
function rankTools(tools: ComposioTool[], query: string): ComposioTool[] {
  const lower = query.toLowerCase();
  const tokens = lower.split(/[\s,./?~!@#$%^&*()_+=\-[\]{};':"\\|<>]+/).filter((t) => t.length >= 2);

  // Intent keyword boosting
  const isSearch = /search|ค้นหา|หา|ดู|list|get/i.test(lower);
  const isMessage = /send|message|ส่ง|ข้อความ|ทัก|chat|post|create/i.test(lower);
  const isUser = /user|ผู้ใช้|ยูส|id|member|profile|who|me/i.test(lower);
  const isPlay = /play|เปิด|เพลง|track|music/i.test(lower);
  const isCreate = /create|สร้าง|เพิ่ม|add|new/i.test(lower);

  return [...tools].sort((a, b) => {
    let scoreA = 0;
    let scoreB = 0;

    const slugA = a.slug.toLowerCase();
    const slugB = b.slug.toLowerCase();
    const descA = a.description.toLowerCase();
    const descB = b.description.toLowerCase();

    // Intent specific scoring
    if (isUser) {
      if (slugA.includes("get_user") || slugA.includes("get_my_user") || slugA.includes("user")) scoreA += 10;
      if (slugB.includes("get_user") || slugB.includes("get_my_user") || slugB.includes("user")) scoreB += 10;
    }
    if (isMessage) {
      if (slugA.includes("create_message") || slugA.includes("send_message") || slugA.includes("message")) scoreA += 10;
      if (slugB.includes("create_message") || slugB.includes("send_message") || slugB.includes("message")) scoreB += 10;
    }
    if (isSearch) {
      if (slugA.includes("search") || slugA.includes("list")) scoreA += 8;
      if (slugB.includes("search") || slugB.includes("list")) scoreB += 8;
    }
    if (isPlay) {
      if (slugA.includes("play") || slugA.includes("playback") || slugA.includes("start")) scoreA += 10;
      if (slugB.includes("play") || slugB.includes("playback") || slugB.includes("start")) scoreB += 10;
    }
    if (isCreate) {
      if (slugA.includes("create") || slugA.includes("add")) scoreA += 6;
      if (slugB.includes("create") || slugB.includes("add")) scoreB += 6;
    }

    // Token matching
    for (const tok of tokens) {
      if (slugA.includes(tok)) scoreA += 4;
      if (slugB.includes(tok)) scoreB += 4;
      if (descA.includes(tok)) scoreA += 2;
      if (descB.includes(tok)) scoreB += 2;
    }

    return scoreB - scoreA;
  });
}

/**
 * Fetch tools from Composio v3 by toolkit slugs and rank them by user query relevance.
 */
export async function getComposioTools(toolkitsOrSearch?: string | string[], userQuery = "", limit = 10): Promise<ComposioTool[]> {
  const apiKey = getApiKey();
  if (!apiKey) return [];

  const toolkits = Array.isArray(toolkitsOrSearch)
    ? toolkitsOrSearch
    : typeof toolkitsOrSearch === "string"
      ? [toolkitsOrSearch]
      : [];

  const allTools: ComposioTool[] = [];
  const now = Date.now();

  try {
    if (toolkits.length > 0) {
      for (const tk of toolkits.slice(0, 3)) {
        const cached = toolkitCache.get(tk);
        if (cached && (now - cached.timestamp < CACHE_TTL_MS)) {
          allTools.push(...cached.tools);
          continue;
        }

        const res = await fetch(`${COMPOSIO_BASE}/tools?toolkit_slug=${encodeURIComponent(tk)}&limit=60`, {
          headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
          signal: AbortSignal.timeout(5000),
        });

        if (res.ok) {
          const data = await res.json() as { items?: Array<{ slug: string; name: string; description: string; toolkit?: { slug: string; name: string }; input_parameters?: { properties?: Record<string, unknown>; required?: string[] } }> };
          const parsed = (data.items ?? []).map((item) => ({
            slug: item.slug,
            name: item.name,
            description: item.description ?? item.name,
            toolkitSlug: item.toolkit?.slug,
            parameters: {
              type: "object" as const,
              properties: (item.input_parameters?.properties ?? {}) as ComposioTool["parameters"]["properties"],
              required: item.input_parameters?.required ?? [],
            },
          }));
          toolkitCache.set(tk, { timestamp: now, tools: parsed });
          allTools.push(...parsed);
        }
      }
    } else {
      const res = await fetch(`${COMPOSIO_BASE}/tools?limit=30`, {
        headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json() as { items?: Array<{ slug: string; name: string; description: string; toolkit?: { slug: string; name: string }; input_parameters?: { properties?: Record<string, unknown>; required?: string[] } }> };
        for (const item of data.items ?? []) {
          allTools.push({
            slug: item.slug,
            name: item.name,
            description: item.description ?? item.name,
            toolkitSlug: item.toolkit?.slug,
            parameters: {
              type: "object" as const,
              properties: (item.input_parameters?.properties ?? {}) as ComposioTool["parameters"]["properties"],
              required: item.input_parameters?.required ?? [],
            },
          });
        }
      }
    }

    if (userQuery && allTools.length > 0) {
      return rankTools(allTools, userQuery).slice(0, limit);
    }
    return allTools.slice(0, limit);
  } catch (err) {
    console.warn("Composio getTools error", err);
    return allTools.slice(0, limit);
  }
}

/**
 * Execute a Composio tool by slug via v3.1 REST API.
 */
export async function executeComposioTool(toolCall: ComposioToolCall, userId = "default"): Promise<ComposioToolResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { tool: toolCall.slug, ok: false, content: "COMPOSIO_API_KEY not configured" };
  }

  try {
    const res = await fetch(`${COMPOSIO_V31_BASE}/tools/execute/${encodeURIComponent(toolCall.slug)}`, {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        arguments: toolCall.arguments,
        version: "latest",
        user_id: userId,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(`Composio execute failed (${res.status}):`, errText);
      try {
        const errJson = JSON.parse(errText);
        const errMsg = errJson?.error?.message ?? errJson?.message ?? `Error ${res.status}`;
        return { tool: toolCall.slug, ok: false, content: errMsg };
      } catch {
        return { tool: toolCall.slug, ok: false, content: `Composio action failed (${res.status})` };
      }
    }

    const data = await res.json() as {
      response?: { data?: unknown };
      data?: unknown;
      error?: { message?: string };
    };

    if (data.error?.message) {
      return { tool: toolCall.slug, ok: false, content: `Tool error: ${data.error.message}` };
    }

    const result = data.response?.data ?? data.data ?? data;
    const resultText = typeof result === "string" ? result : JSON.stringify(result, null, 2);
    return { tool: toolCall.slug, ok: true, content: resultText.slice(0, 2000) };
  } catch (err) {
    console.warn("Composio executeAction error", err);
    return { tool: toolCall.slug, ok: false, content: "Tool execution timed out or network error" };
  }
}

/**
 * Convert Composio tools to OpenAI-compatible function definitions for LLM tool calling.
 */
export function composioToolsToFunctions(tools: ComposioTool[]) {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.slug,
      description: `[Composio Tool] ${tool.name}: ${tool.description}`.slice(0, 300),
      parameters: tool.parameters,
    },
  }));
}

/**
 * Format Composio tool results as a context block for the system prompt.
 */
export function composioResultsBlock(results: ComposioToolResult[]): string {
  if (!results.length) return "";
  return `\n\nผลจาก Composio Tools:\n${results
    .map((r) => `- ${r.tool}: ${r.ok ? r.content : `[ล้มเหลว] ${r.content}`}`)
    .join("\n")}`;
}
