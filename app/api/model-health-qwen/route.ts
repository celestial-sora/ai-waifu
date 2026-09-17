import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const apiKey = process.env.CEREBRAS_API_KEY?.trim();
  const model = process.env.CEREBRAS_MODEL?.trim() || "qwen-3.8-27b";

  if (!apiKey) {
    return NextResponse.json({ ok: false, model, error: "CEREBRAS_API_KEY is not configured" }, { status: 500 });
  }

  try {
    const response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Reply exactly with MODEL_TEST_OK" }],
        temperature: 0,
        max_tokens: 16,
      }),
    });

    const data = await response.json().catch(() => ({}));
    return NextResponse.json({
      ok: response.ok,
      status: response.status,
      configuredModel: model,
      responseModel: data?.model ?? null,
      text: data?.choices?.[0]?.message?.content ?? null,
      error: response.ok ? null : (data?.message ?? data?.error?.message ?? "Cerebras request failed"),
    }, { status: response.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      configuredModel: model,
      error: error instanceof Error ? error.message : "Cerebras request failed",
    }, { status: 502 });
  }
}
