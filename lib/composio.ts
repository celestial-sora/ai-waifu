/**
 * Composio integration for Vivian
 * Fetches tools connected in the Composio dashboard and executes them on demand.
 * Requires COMPOSIO_API_KEY in environment variables (set on Vercel, never in code).
 */

export interface ComposioTool {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
}

export interface ComposioToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ComposioToolResult {
  tool: string;
  ok: boolean;
  content: string;
}

const COMPOSIO_BASE = "https://backend.composio.dev/api/v1";

function getApiKey(): string | undefined {
  return process.env.COMPOSIO_API_KEY?.trim();
}

/**
 * Fetch the list of enabled tools from Composio.
 * Returns an empty array if COMPOSIO_API_KEY is not set or request fails.
 */
export async function getComposioTools(limit = 20): Promise<ComposioTool[]> {
  const apiKey = getApiKey();
  if (!apiKey) return [];

  try {
    const res = await fetch(`${COMPOSIO_BASE}/actions/list/all?limit=${limit}`, {
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.warn(`Composio tool list failed: ${res.status}`);
      return [];
    }
    const data = await res.json() as {
      items?: Array<{
        name: string;
        description: string;
        parameters?: { properties?: Record<string, unknown>; required?: string[] };
      }>;
    };

    return (data.items ?? []).map((action) => ({
      name: action.name,
      description: action.description ?? action.name,
      parameters: {
        type: "object" as const,
        properties: (action.parameters?.properties ?? {}) as ComposioTool["parameters"]["properties"],
        required: action.parameters?.required ?? [],
      },
    }));
  } catch (err) {
    console.warn("Composio getTools error", err);
    return [];
  }
}

/**
 * Execute a Composio tool call.
 * Returns ComposioToolResult with ok=false if execution fails.
 */
export async function executeComposioTool(toolCall: ComposioToolCall): Promise<ComposioToolResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { tool: toolCall.name, ok: false, content: "COMPOSIO_API_KEY not configured" };
  }

  try {
    const res = await fetch(`${COMPOSIO_BASE}/actions/execute`, {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        action: toolCall.name,
        input: toolCall.arguments,
        entityId: "default",
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(`Composio execute failed: ${res.status}`, errText);
      return { tool: toolCall.name, ok: false, content: `Tool execution failed: ${res.status}` };
    }

    const data = await res.json() as { response?: { data?: unknown }; error?: string };
    if (data.error) {
      return { tool: toolCall.name, ok: false, content: `Tool error: ${data.error}` };
    }

    const resultText = typeof data.response?.data === "string"
      ? data.response.data
      : JSON.stringify(data.response?.data ?? data);

    return { tool: toolCall.name, ok: true, content: resultText.slice(0, 2000) };
  } catch (err) {
    console.warn("Composio executeAction error", err);
    return { tool: toolCall.name, ok: false, content: "Tool execution timed out or failed" };
  }
}

/**
 * Convert Composio tools to OpenAI-compatible function definitions for LLM tool calling.
 */
export function composioToolsToFunctions(tools: ComposioTool[]) {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

/**
 * Format Composio tool results as a readable context block for the system prompt.
 */
export function composioResultsBlock(results: ComposioToolResult[]): string {
  if (!results.length) return "";
  return `\n\nผลการใช้ Composio Tools:\n${results.map((r) => `- ${r.tool}: ${r.ok ? r.content : `[ล้มเหลว] ${r.content}`}`).join("\n")}`;
}
