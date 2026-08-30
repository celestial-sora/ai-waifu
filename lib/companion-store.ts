import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { type CompanionState, defaultCompanionState, isMood, clampScore } from "@/lib/companion";

type Row = {
  affinity: number;
  trust: number;
  familiarity: number;
  mood: string;
  mood_intensity: number;
  conversation_summary: string | null;
  last_idle_at: string | null;
  last_interaction_at: string | null;
};

function fromRow(row: Row): CompanionState {
  return {
    affinity: clampScore(row.affinity),
    trust: clampScore(row.trust),
    familiarity: clampScore(row.familiarity),
    mood: isMood(row.mood) ? row.mood : "calm",
    moodIntensity: clampScore(row.mood_intensity),
    conversationSummary: row.conversation_summary?.trim() ?? "",
    lastIdleAt: row.last_idle_at,
    lastInteractionAt: row.last_interaction_at,
  };
}

export async function loadCompanionState(userKey: string): Promise<CompanionState> {
  const fallback = defaultCompanionState();
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("companion_state").select("affinity,trust,familiarity,mood,mood_intensity,conversation_summary,last_idle_at,last_interaction_at").eq("user_key", userKey).maybeSingle();
    if (error || !data) return fallback;
    return fromRow(data as Row);
  } catch (error) {
    console.warn("Companion state unavailable", error);
    return fallback;
  }
}

export async function saveCompanionState(userKey: string, state: CompanionState) {
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from("companion_state").upsert({
      user_key: userKey,
      affinity: state.affinity,
      trust: state.trust,
      familiarity: state.familiarity,
      mood: state.mood,
      mood_intensity: state.moodIntensity,
      conversation_summary: state.conversationSummary.slice(0, 1800),
      last_idle_at: state.lastIdleAt,
      last_interaction_at: state.lastInteractionAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_key" });
  } catch (error) {
    console.warn("Companion state save unavailable", error);
  }
}
