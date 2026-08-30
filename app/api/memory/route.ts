import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const userKey = "default";

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("memories").select("id,memory,category,importance,updated_at").eq("user_key", userKey).order("importance", { ascending: false }).order("updated_at", { ascending: false }).limit(30);
    if (error) throw error;
    const { data: conversation } = await supabase.from("conversations").select("id").eq("user_key", userKey).limit(1).maybeSingle();
    const { data: messages } = conversation ? await supabase.from("messages").select("role,content").eq("conversation_id", conversation.id).order("created_at", { ascending: true }).limit(100) : { data: [] };
    let companion = null;
    try {
      const loaded = await supabase.from("companion_state").select("affinity,trust,familiarity,mood,mood_intensity,last_idle_at,last_interaction_at").eq("user_key", userKey).maybeSingle();
      if (!loaded.error) companion = loaded.data;
    } catch { /* Companion table may not exist yet. */ }
    return NextResponse.json({ memories: data ?? [], messages: messages ?? [], companion });
  } catch (error) {
    console.error("Memory load failed", error);
    return NextResponse.json({ memories: [], error: "Memory database is not ready" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { memory?: string; category?: string; importance?: number };
    const memory = body.memory?.trim();
    if (!memory || memory.length > 500) return NextResponse.json({ error: "Invalid memory" }, { status: 400 });
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("memories").upsert({ user_key: userKey, memory, category: body.category ?? "general", importance: Math.min(5, Math.max(1, body.importance ?? 3)), updated_at: new Date().toISOString() }, { onConflict: "user_key,memory" }).select().single();
    if (error) throw error;
    return NextResponse.json({ memory: data });
  } catch (error) {
    console.error("Memory save failed", error);
    return NextResponse.json({ error: "Memory database is not ready" }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as { scope?: "conversation" | "memory"; id?: number };
    const supabase = getSupabaseAdmin();
    if (body.scope === "memory" && Number.isInteger(body.id)) {
      const { error } = await supabase.from("memories").delete().eq("user_key", userKey).eq("id", body.id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (body.scope === "conversation") {
      const { data: conversations, error } = await supabase.from("conversations").select("id").eq("user_key", userKey);
      if (error) throw error;
      const ids = (conversations ?? []).map((conversation) => conversation.id);
      if (ids.length) {
        const { error: messageError } = await supabase.from("messages").delete().in("conversation_id", ids);
        if (messageError) throw messageError;
      }
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Invalid delete request" }, { status: 400 });
  } catch (error) {
    console.error("Memory delete failed", error);
    return NextResponse.json({ error: "Memory database is not ready" }, { status: 503 });
  }
}
