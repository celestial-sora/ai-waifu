import "server-only";

interface JevNoulAnswer {
  type: "noul";
  noul: number;
}

interface JevResponse {
  answers?: { needs_current_information?: JevNoulAnswer };
}

/** Use Jev for ambiguous search intent; explicit requests are routed before this call. */
export async function needsCurrentInformation(message: string): Promise<boolean> {
  const apiKey = process.env.TYPESAFE_API_KEY?.trim() || process.env.JEV_API_KEY?.trim();
  if (!apiKey || !message.trim()) return false;

  try {
    const response = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(2000),
      body: JSON.stringify({
        model: "jev-latest",
        state: message.slice(0, 1200),
        questions: {
          needs_current_information: {
            type: "noul",
            instructions: "Does answering this user request accurately require fresh information from the web, such as recent news, live prices, current schedules, or facts that may have changed? Ordinary conversation and timeless questions do not.",
          },
        },
      }),
    });
    if (!response.ok) throw new Error(`Jev returned ${response.status}`);
    const data = await response.json() as JevResponse;
    const answer = data.answers?.needs_current_information;
    return answer?.type === "noul" && typeof answer.noul === "number" && answer.noul >= 0.85;
  } catch (error) {
    console.warn("Jev intent routing unavailable", error);
    return false;
  }
}
