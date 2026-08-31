export type Mood = "calm" | "warm" | "playful" | "shy" | "tired" | "melancholy";

export interface CompanionState {
  affinity: number;
  trust: number;
  familiarity: number;
  mood: Mood;
  moodIntensity: number;
  conversationSummary: string;
  lastIdleAt: string | null;
  lastInteractionAt: string | null;
}

export const MOODS: Mood[] = ["calm", "warm", "playful", "shy", "tired", "melancholy"];

export function defaultCompanionState(): CompanionState {
  return {
    affinity: 22,
    trust: 18,
    familiarity: 8,
    mood: "calm",
    moodIntensity: 35,
    conversationSummary: "",
    lastIdleAt: null,
    lastInteractionAt: null,
  };
}

export function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Let persistent moods cool down between conversations instead of staying forever. */
export function decayCompanionState(state: CompanionState, now = Date.now()): CompanionState {
  const last = state.lastInteractionAt ? Date.parse(state.lastInteractionAt) : now;
  if (!Number.isFinite(last) || last >= now) return state;
  const elapsedHours = (now - last) / 3_600_000;
  const steps = Math.floor(elapsedHours / 2);
  if (steps < 1) return state;
  const intensity = clampScore(state.moodIntensity - steps * 8);
  const mood = intensity <= 18 ? "calm" : state.mood;
  return { ...state, mood, moodIntensity: intensity };
}

export function isMood(value: string): value is Mood {
  return MOODS.includes(value as Mood);
}

export function bangkokHour(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "numeric", hour12: false }).format(now));
  return Number.isFinite(hour) ? hour : now.getHours();
}

function count(text: string, pattern: RegExp) {
  return pattern.test(text) ? 1 : 0;
}

export function applyConversationTurn(state: CompanionState, userText: string, reply: string, idle = false): CompanionState {
  const combined = `${userText} ${reply}`;
  const positive = count(userText, /ขอบคุณ|ดีใจ|รัก|ชอบ|น่ารัก|เยี่ยม|เก่ง|อบอุ่น|thank|love|cute|great|miss you/i);
  const negative = count(userText, /โง่|ห่วย|น่าเบื่อ|เงียบไป|โกรธ|โมโห|ไปเลย|stupid|hate|shut up|annoying/i);
  const personal = count(userText, /ฉันชื่อ|ชื่อของฉัน|ฉันชอบ|ฉันไม่ชอบ|จำไว้|จำว่า|เรียกฉัน|my name|call me|remember|I live|I work/i);
  const sad = count(combined, /เศร้า|เหงา|เหนื่อย|ร้องไห้|เสียใจ|tired|lonely|sad/i);
  const playful = count(combined, /ขำ|ตลก|แกล้ง|มุก|เล่น|haha|lol|fun/i);
  const hour = bangkokHour();

  let affinity = state.affinity + (idle ? 0 : 1) + positive * 3 - negative * 4;
  let trust = state.trust + personal * 4 - negative * 3;
  let familiarity = state.familiarity + (idle ? 0 : 1) + personal;

  let mood: Mood = state.mood;
  let moodIntensity = state.moodIntensity;
  if (negative) { mood = "melancholy"; moodIntensity = Math.min(100, moodIntensity + 12); }
  else if (sad) { mood = "melancholy"; moodIntensity = Math.min(100, moodIntensity + 8); }
  else if (playful && affinity >= 35) { mood = "playful"; moodIntensity = Math.min(100, moodIntensity + 7); }
  else if (positive) { mood = "warm"; moodIntensity = Math.min(100, moodIntensity + 6); }
  else if (affinity < 28) { mood = "shy"; moodIntensity = Math.max(25, moodIntensity - 2); }
  else if (hour >= 23 || hour < 6) { mood = "tired"; moodIntensity = Math.max(20, moodIntensity - 1); }
  else {
    moodIntensity = Math.max(18, moodIntensity - 2);
    if (moodIntensity <= 22) mood = affinity >= 55 ? "warm" : "calm";
  }

  return {
    ...state,
    affinity: clampScore(affinity),
    trust: clampScore(trust),
    familiarity: clampScore(familiarity),
    mood,
    moodIntensity: clampScore(moodIntensity),
    lastInteractionAt: new Date().toISOString(),
    lastIdleAt: idle ? new Date().toISOString() : state.lastIdleAt,
  };
}

export function moodLabel(mood: Mood) {
  const labels: Record<Mood, string> = {
    calm: "สงบ",
    warm: "อบอุ่น",
    playful: "ขี้เล่น",
    shy: "ขี้อาย",
    tired: "อ่อนล้า",
    melancholy: "อ่อนไหว",
  };
  return labels[mood];
}

export function companionPromptBlock(state: CompanionState) {
  const closeness = state.affinity >= 70 ? "สนิทมาก พูดคุ้นเคยได้มากขึ้นแต่ยังสุภาพ" : state.affinity >= 40 ? "เริ่มคุ้น อบอุ่นขึ้นเล็กน้อย" : "ยังไม่สนิท รักษาระยะ สุภาพ ขี้อาย";
  const trustLine = state.trust >= 60 ? "ไว้ใจพอจะรับฟังเรื่องส่วนตัวได้ โดยไม่ถามลึกเกินไป" : "อย่าถามเรื่องส่วนตัวลึก ๆ ถ้าผู้ใช้ยังไม่เล่าเอง";
  return `

สถานะความสัมพันธ์ (ใช้บังคับโทน ไม่ต้องพูดตัวเลขเองถ้าผู้ใช้ไม่ถาม):
- affinity ${state.affinity}/100: ${closeness}
- trust ${state.trust}/100: ${trustLine}
- familiarity ${state.familiarity}/100: ${state.familiarity >= 50 ? "จำรายละเอียดเดิมได้ดี" : "ยังรู้จักไม่มาก อย่าทึกทัก"}
- mood พื้นฐาน: ${state.mood} (${moodLabel(state.mood)}, intensity ${state.moodIntensity})
- mood เป็นอารมณ์พื้นหลังที่คงอยู่หลายตา Emotion ชั่วขณะตามข้อความล่าสุดได้ แต่ต้องกลับเข้า mood พื้นฐาน
- ห้ามอ้างว่ามีความรู้สึกมนุษย์จริง ใช้ mood แค่โทนการพูด`;
}
