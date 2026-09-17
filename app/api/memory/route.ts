import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const userKey = "default";
const cleanupToken = "vivian-cleanup-20260917-4f19c0f7d2a84f1aa21b0c79";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("cleanup") !== cleanupToken) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: conversations, error: conversationError } = await supabase
      .from("conversations")
      .select("id")
      .eq("user_key", userKey);
    if (conversationError) throw conversationError;

    const ids = (conversations ?? []).map((conversation) => conversation.id);
    if (ids.length) {
      const { error: messageError } = await supabase
        .from("messages")
        .delete()
        .in("conversation_id", ids);
      if (messageError) throw messageError;
    }

    const { error: memoryError } = await supabase
      .from("memories")
      .delete()
      .eq("user_key", userKey);
    if (memoryError) throw memoryError;

    const { error: summaryError } = await supabase
      .from("companion_state")
      .update({ conversation_summary: "" })
      .eq("user_key", userKey);
    if (summaryError) throw summaryError;

    return NextResponse.json({ ok: true, cleared: { memories: true, chatHistory: true, conversationSummary: true } });
  } catch (error) {
    console.error("One-time Vivian cleanup failed", error);
    return NextResponse.json({ ok: false, error: "Cleanup failed" }, { status: 500 });
  }
}
