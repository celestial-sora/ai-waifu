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
    return NextResponse.json({ memories: data ?? [], messages: messages ?? [] });
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
