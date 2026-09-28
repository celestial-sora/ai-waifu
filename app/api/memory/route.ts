import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { clearLocalConversation, deleteLocalMemory, loadLocalMemory, saveLocalMemory, updateLocalMemory, useDesktopLocalMemory } from "@/lib/desktop-local-memory";

const userKey = "default";

export async function GET() {
  try {
    if (useDesktopLocalMemory()) return NextResponse.json({ ...loadLocalMemory(), companion: null, storage: "local" });
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("memories").select("id,memory,category,importance,updated_at,last_used_at,use_count").eq("user_key", userKey).order("importance", { ascending: false }).order("updated_at", { ascending: false }).limit(30);
    if (error) throw error;
    const { data: conversation } = await supabase.from("conversations").select("id").eq("user_key", userKey).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    const { data: messages } = conversation ? await supabase.from("messages").select("role,content,created_at").eq("conversation_id", conversation.id).order("created_at", { ascending: false }).limit(100) : { data: [] };
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
    const memory = typeof body.memory === "string" ? body.memory.trim() : "";
    if (!memory || memory.length > 500) return NextResponse.json({ error: "Invalid memory" }, { status: 400 });
    const category = typeof body.category === "string" && body.category.length <= 40 ? body.category : "general";
    const importance = typeof body.importance === "number" && Number.isFinite(body.importance) ? Math.min(5, Math.max(1, body.importance)) : 3;
    if (useDesktopLocalMemory()) return NextResponse.json({ memory: saveLocalMemory(memory, category, importance) });
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("memories").upsert({ user_key: userKey, memory, category, importance, updated_at: new Date().toISOString() }, { onConflict: "user_key,memory" }).select().single();
    if (error) throw error;
    return NextResponse.json({ memory: data });
  } catch (error) {
    console.error("Memory save failed", error);
    return NextResponse.json({ error: "Memory database is not ready" }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as { id?: number; memory?: string; category?: string; importance?: number };
    const memory = typeof body.memory === "string" ? body.memory.trim() : "";
    if (!Number.isInteger(body.id) || !memory || memory.length > 500) return NextResponse.json({ error: "Invalid memory" }, { status: 400 });
    const category = typeof body.category === "string" && body.category.length <= 40 ? body.category : "general";
    const importance = typeof body.importance === "number" && Number.isFinite(body.importance) ? Math.min(5, Math.max(1, body.importance)) : 3;
    if (useDesktopLocalMemory()) {
      const updated = updateLocalMemory(body.id!, memory, category, importance);
      return updated ? NextResponse.json({ memory: updated }) : NextResponse.json({ error: "Memory not found" }, { status: 404 });
    }
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("memories").update({ memory, category, importance, updated_at: new Date().toISOString() }).eq("user_key", userKey).eq("id", body.id).select().single();
    if (error) throw error;
    return NextResponse.json({ memory: data });
  } catch (error) {
    console.error("Memory update failed", error);
    return NextResponse.json({ error: "Memory database is not ready" }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as { scope?: "conversation" | "memory"; id?: number };
    if (useDesktopLocalMemory()) {
      if (body.scope === "memory" && Number.isInteger(body.id)) { deleteLocalMemory(body.id!); return NextResponse.json({ ok: true }); }
      if (body.scope === "conversation") { clearLocalConversation(); return NextResponse.json({ ok: true }); }
      return NextResponse.json({ error: "Invalid delete request" }, { status: 400 });
    }
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
