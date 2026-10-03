import "server-only";

export const jevConfidenceThreshold = 0.85;

export interface BooleanDecision {
  required: boolean;
  confidence: number;
}

export interface JevContext {
  message: string;
  recentTurns: Array<{ role: "user" | "assistant"; content: string }>;
  hasImage: boolean;
  memoryAvailable: boolean;
  capabilities: { search: boolean; integrations: boolean };
  toolkitCandidates: string[];
  inputSource?: "text" | "transcript";
}

export interface VivianDecision {
  intent: { type: "conversation" | "information" | "memory" | "vision" | "task" | "support" | "explanation"; confidence: number };
  freshInformation: BooleanDecision;
  memory: BooleanDecision;
  vision: BooleanDecision;
  tool: {
    time: BooleanDecision;
    weather: BooleanDecision;
    calculator: BooleanDecision;
    integrations: BooleanDecision;
  };
  model: { route: "text" | "search" | "vision"; confidence: number };
  responseMode: { mode: "conversation" | "supportive" | "explanation"; confidence: number };
}

type JevOutcome =
  | { status: "ok"; decision: VivianDecision }
  | { status: "disabled" | "timeout" | "api_error" | "malformed"; decision: null };

export type JevResult = JevOutcome & { elapsedMs: number };

// Keep the established System One noul wire format: batch independent questions.
const instructions = {
  needs_current_information: "Does answering this user request accurately require fresh information from the web, such as recent news, live prices, current schedules, or facts that may have changed? Ordinary conversation and timeless questions do not.",
  needs_memory: "Would retrieving durable user memories help answer this request, personalize a conversation, or recall a previous preference or project? Prefer yes for personal companion conversation. No only for clearly self-contained tasks that need no user history.",
  recalls_memory: "Is the user's intent to recall something they previously told Vivian, such as a preference, name or ongoing project? Ordinary companion conversation may benefit from memory but is not itself a recall request.",
  needs_vision: "Does the user ask about an image, their appearance, surroundings, or something that must be seen? Image presence alone is not proof of intent. Do not claim to see image contents: only metadata is provided.",
  needs_time: "Would the current time or date in Asia/Bangkok help answer the user's request?",
  needs_weather: "Does the request need the weather or forecast from the weather tool? Ordinary emotional descriptions such as feeling cold are not weather requests.",
  needs_calculator: "Does this request need arithmetic calculation using a calculator?",
  needs_integrations: "Does the user request an action or lookup in a connected external application? This only selects preparation; never authorize or execute an action.",
  supportive_response: "Is the user seeking emotional support or reassurance? Classify broad response needs only; do not diagnose or generate dialogue.",
  explanatory_response: "Does the user need an explanation or reasoning rather than a short conversational reply? Do not solve the request or generate a reply.",
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function booleanDecision(probability: number): BooleanDecision {
  return { required: probability >= 0.5, confidence: Math.max(probability, 1 - probability) };
}

export function parseJevDecision(data: unknown): VivianDecision | null {
  if (!isRecord(data) || !isRecord(data.answers)) return null;
  const probabilities = {} as Record<keyof typeof instructions, number>;
  for (const key of Object.keys(instructions) as Array<keyof typeof instructions>) {
    const answer = data.answers[key];
    if (!isRecord(answer) || answer.type !== "noul" || typeof answer.noul !== "number" || !Number.isFinite(answer.noul) || answer.noul < 0 || answer.noul > 1) return null;
    probabilities[key] = answer.noul;
  }
  const p = probabilities;
  const intents: Array<{ type: VivianDecision["intent"]["type"]; confidence: number }> = [
    { type: "information", confidence: p.needs_current_information },
    { type: "memory", confidence: p.recalls_memory },
    { type: "vision", confidence: p.needs_vision },
    { type: "task", confidence: Math.max(p.needs_time, p.needs_weather, p.needs_calculator, p.needs_integrations) },
    { type: "support", confidence: p.supportive_response },
    { type: "explanation", confidence: p.explanatory_response },
  ];
  intents.push({ type: "conversation", confidence: 1 - Math.max(...intents.map((item) => item.confidence)) });
  intents.sort((a, b) => b.confidence - a.confidence);
  const responseMode: VivianDecision["responseMode"] = p.supportive_response >= 0.5 && p.supportive_response >= p.explanatory_response
    ? { mode: "supportive", confidence: p.supportive_response }
    : p.explanatory_response >= 0.5
      ? { mode: "explanation", confidence: p.explanatory_response }
      : { mode: "conversation", confidence: 1 - Math.max(p.supportive_response, p.explanatory_response) };
  return {
    intent: intents[0],
    freshInformation: booleanDecision(p.needs_current_information),
    memory: booleanDecision(p.needs_memory),
    vision: booleanDecision(p.needs_vision),
    tool: {
      time: booleanDecision(p.needs_time),
      weather: booleanDecision(p.needs_weather),
      calculator: booleanDecision(p.needs_calculator),
      integrations: booleanDecision(p.needs_integrations),
    },
    model: p.needs_vision >= 0.5
      ? { route: "vision", confidence: p.needs_vision }
      : p.needs_current_information >= 0.5
        ? { route: "search", confidence: p.needs_current_information }
        : { route: "text", confidence: 1 - Math.max(p.needs_vision, p.needs_current_information) },
    responseMode,
  };
}

export function jevEnabled(): boolean {
  return process.env.JEV_ENABLED !== "false" && Boolean(process.env.TYPESAFE_API_KEY?.trim() || process.env.JEV_API_KEY?.trim());
}

export async function decideVivian(context: JevContext): Promise<JevResult> {
  const startedAt = performance.now();
  const result = (outcome: JevOutcome): JevResult => {
    const elapsedMs = Math.round(performance.now() - startedAt);
    if (process.env.NODE_ENV === "development" || process.env.JEV_DEBUG === "true") console.debug("JEV decision", { status: outcome.status, elapsedMs });
    return { ...outcome, elapsedMs };
  };
  if (!jevEnabled() || !context.message.trim()) return result({ status: "disabled", decision: null });
  const apiKey = process.env.TYPESAFE_API_KEY?.trim() || process.env.JEV_API_KEY?.trim();
  const signal = AbortSignal.timeout(2000);
  try {
    const response = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        model: "jev-latest",
        state: JSON.stringify({
          message: context.message.slice(0, 1200),
          recentTurns: context.recentTurns.slice(-2).map((turn) => ({ role: turn.role, content: turn.content.slice(0, 240) })),
          hasImage: context.hasImage,
          memoryAvailable: context.memoryAvailable,
          capabilities: context.capabilities,
          toolkitCandidates: context.toolkitCandidates.slice(0, 3),
          inputSource: context.inputSource ?? "text",
        }),
        questions: Object.fromEntries(Object.entries(instructions).map(([key, instructions]) => [key, { type: "noul", instructions }])),
      }),
    });
    if (!response.ok) return result({ status: "api_error", decision: null });
    let data: unknown;
    try { data = await response.json(); }
    catch (error) {
      if (signal.aborted) throw error;
      return result({ status: "malformed", decision: null });
    }
    const decision = parseJevDecision(data);
    return decision ? result({ status: "ok", decision }) : result({ status: "malformed", decision: null });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    return result({ status: signal.aborted || name === "TimeoutError" || name === "AbortError" ? "timeout" : "api_error", decision: null });
  }
}
