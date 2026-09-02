/**
 * Composio integration for Vivian — connects to Composio v3.1 REST API.
 * Requires COMPOSIO_API_KEY in environment variables.
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
 * Fetch tools from Composio v3 by toolkit slugs or limit.
 * Returns an empty array if COMPOSIO_API_KEY is not set or request fails.
 */
export async function getComposioTools(toolkitsOrSearch?: string | string[], limit = 8): Promise<ComposioTool[]> {
  const apiKey = getApiKey();
  if (!apiKey) return [];

  const toolkits = Array.isArray(toolkitsOrSearch)
    ? toolkitsOrSearch
    : typeof toolkitsOrSearch === "string"
      ? [toolkitsOrSearch]
      : [];

  const allTools: ComposioTool[] = [];

  try {
    if (toolkits.length > 0) {
      for (const tk of toolkits.slice(0, 3)) {
        const res = await fetch(`${COMPOSIO_BASE}/tools?toolkit_slug=${encodeURIComponent(tk)}&limit=${limit}`, {
          headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
          signal: AbortSignal.timeout(4000),
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
    } else {
      const res = await fetch(`${COMPOSIO_BASE}/tools?limit=${limit}`, {
        headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(4000),
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
    return allTools;
  } catch (err) {
    console.warn("Composio getTools error", err);
    return allTools;
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
      return { tool: toolCall.slug, ok: false, content: `Composio action failed (${res.status})` };
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
