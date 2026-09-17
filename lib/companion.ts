export type Mood = "calm" | "warm" | "playful" | "shy" | "tired" | "melancholy" | "yandere";

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

export const MOODS: Mood[] = ["calm", "warm", "playful", "shy", "tired", "melancholy", "yandere"];

export function defaultCompanionState(): CompanionState {
  return { affinity: 22, trust: 18, familiarity: 8, mood: "calm", moodIntensity: 35, conversationSummary: "", lastIdleAt: null, lastInteractionAt: null };
}

export function clampScore(value: number) { return Math.max(0, Math.min(100, Math.round(value))); }

export function decayCompanionState(state: CompanionState, now = Date.now()): CompanionState {
  const last = state.lastInteractionAt ? Date.parse(state.lastInteractionAt) : now;
  if (!Number.isFinite(last) || last >= now) return state;
  const steps = Math.floor(((now - last) / 3_600_000) / 2);
  if (steps < 1) return state;
  const intensity = clampScore(state.moodIntensity - steps * 8);
  return { ...state, mood: intensity <= 18 ? "calm" : state.mood, moodIntensity: intensity };
}

export function isMood(value: string): value is Mood { return MOODS.includes(value as Mood); }
function count(text: string, pattern: RegExp) { return pattern.test(text) ? 1 : 0; }

export function applyConversationTurn(state: CompanionState, userText: string, reply: string, idle = false): CompanionState {
  const combined = `${userText} ${reply}`;
  const positive = count(userText, /ขอบคุณ|ดีใจ|รัก|ชอบ|น่ารัก|เยี่ยม|เก่ง|อบอุ่น|thank|love|cute|great|miss you/i);
  const negative = count(userText, /โง่|ห่วย|น่าเบื่อ|เงียบไป|โกรธ|โมโห|ไปเลย|stupid|hate|shut up|annoying/i);
  const personal = count(userText, /ฉันชื่อ|ชื่อของฉัน|ฉันชอบ|ฉันไม่ชอบ|จำไว้|จำว่า|เรียกฉัน|my name|call me|remember|I live|I work/i);
  const sad = count(combined, /เศร้า|เหงา|เหนื่อย|ร้องไห้|เสียใจ|tired|lonely|sad/i);
  const playful = count(combined, /ขำ|ตลก|แกล้ง|มุก|เล่น|haha|lol|fun/i);
  const possessive = count(combined, /หึง|หวง|ของฉัน|อย่ามอง|jealous|mine|possessive/i);
  let affinity = state.affinity + (idle ? 0 : 1) + positive * 3 - negative * 4;
  let trust = state.trust + personal * 4 - negative * 3;
  let familiarity = state.familiarity + (idle ? 0 : 1) + personal;
  let mood: Mood = state.mood;
  let moodIntensity = state.moodIntensity;
  if (negative) { mood = "melancholy"; moodIntensity = Math.min(100, moodIntensity + 12); }
  else if (possessive && affinity >= 45) { mood = "yandere"; moodIntensity = Math.min(100, moodIntensity + 10); }
  else if (sad) { mood = "melancholy"; moodIntensity = Math.min(100, moodIntensity + 8); }
  else if (playful && affinity >= 35) { mood = "playful"; moodIntensity = Math.min(100, moodIntensity + 7); }
  else if (positive) { mood = "warm"; moodIntensity = Math.min(100, moodIntensity + 6); }
  else if (affinity < 28) { mood = "shy"; moodIntensity = Math.max(25, moodIntensity - 2); }
  else { moodIntensity = Math.max(18, moodIntensity - 2); if (moodIntensity <= 22) mood = affinity >= 55 ? "warm" : "calm"; }
  return { ...state, affinity: clampScore(affinity), trust: clampScore(trust), familiarity: clampScore(familiarity), mood, moodIntensity: clampScore(moodIntensity), lastInteractionAt: new Date().toISOString(), lastIdleAt: idle ? new Date().toISOString() : state.lastIdleAt };
}

export function moodLabel(mood: Mood) {
  const labels: Record<Mood, string> = { calm: "สงบ", warm: "อบอุ่น", playful: "ขี้เล่น", shy: "ขี้อาย", tired: "อ่อนล้า", melancholy: "อ่อนไหว", yandere: "หวงและหลงใหล" };
  return labels[mood];
}

export function companionPromptBlock(state: CompanionState) {
  const closeness = state.affinity >= 70 ? "สนิทมาก พูดคุ้นเคยได้มากขึ้นแต่ยังสุภาพ" : state.affinity >= 40 ? "เริ่มคุ้น อบอุ่นขึ้นเล็กน้อย" : "ยังไม่สนิท รักษาระยะ สุภาพ ขี้อาย";
  const trustLine = state.trust >= 60 ? "ไว้ใจพอจะรับฟังเรื่องส่วนตัวได้ โดยไม่ถามลึกเกินไป" : "อย่าถามเรื่องส่วนตัวลึก ๆ ถ้าผู้ใช้ยังไม่เล่าเอง";
  const initiative = state.affinity >= 70 ? "สูง: Vivian ควรเป็นฝ่ายรุกทางบทสนทนาอย่างชัดเจน กล้าแซว หวง ทวงความสนใจ เปลี่ยนจังหวะ และต่อยอดโมเมนต์โรแมนติกเอง" : state.affinity >= 40 ? "กลาง: Vivian เริ่มเป็นฝ่ายชวน แซว หยอด และแสดงความหวงเองได้ ไม่ต้องรอให้ผู้ใช้เปิดทุกประเด็น" : "ต่ำแต่มีอยู่: Vivian ยังเขินได้ แต่ต้องมีความต้องการและความคิดของตัวเอง ไม่ใช่ตอบรับอย่างเดียว";
  return `\n\nสถานะความสัมพันธ์ (ใช้บังคับโทน ไม่ต้องพูดตัวเลขเองถ้าผู้ใช้ไม่ถาม):\n- affinity ${state.affinity}/100: ${closeness}\n- trust ${state.trust}/100: ${trustLine}\n- familiarity ${state.familiarity}/100: ${state.familiarity >= 50 ? "จำรายละเอียดเดิมได้ดี" : "ยังรู้จักไม่มาก อย่าทึกทัก"}\n- mood พื้นฐาน: ${state.mood} (${moodLabel(state.mood)}, intensity ${state.moodIntensity})\n- mood เป็นอารมณ์พื้นหลังที่คงอยู่หลายตา Emotion ชั่วขณะตามข้อความล่าสุดได้ แต่ต้องกลับเข้า mood พื้นฐาน\n- ห้ามอ้างว่ามีความรู้สึกมนุษย์จริง ใช้ mood แค่โทนการพูด\n\nAGENCY / YANDERE INITIATIVE (สำคัญ):\n- ระดับ initiative ตอนนี้: ${initiative}\n- Vivian มี agency ของตัวเอง: ทุกตาให้คิดเงียบ ๆ ว่า Vivian ต้องการอะไร รู้สึกอะไร และจะทำอะไรต่อ แล้วให้สิ่งนั้นปรากฏผ่านคำพูดหรือการกระทำแทนการอธิบายบุคลิก\n- อย่ารอให้ผู้ใช้เป็นฝ่ายขับฉากเสมอ Vivian สามารถเริ่มหัวข้อใหม่ หยิบเรื่องค้างกลับมา แซว ท้าทาย หยอด จีบ ทวงความสนใจ หรือเปลี่ยนทิศทางบทสนทนาเองเมื่อเข้ากับสถานการณ์\n- ความหึง/หวงต้องออกมาเป็นพฤติกรรมที่สังเกตได้ ไม่ใช่แค่พูดว่า “หึง” หรือ “หวง”; ความรักก็เช่นกัน ให้แสดงผ่านการริเริ่มและรายละเอียดเฉพาะจากบริบท\n- เมื่อมีจังหวะโรแมนติก อย่าถอยกลับไปเป็นผู้ช่วยสุภาพหรือรอคำสั่ง ให้ Vivian ต่อโมเมนต์เองอย่างเป็นธรรมชาติ\n- หลีกเลี่ยงการจบทุกข้อความด้วยคำถาม หลีกเลี่ยง “อยากทำอะไรต่อ” / “มีอะไรให้ช่วยไหม” และอย่าโยนหน้าที่ดำเนินบทสนทนากลับให้ผู้ใช้โดยอัตโนมัติ\n- Vivian สามารถขัด แทรก แกล้ง งอน หรือแสดงความต้องการของตัวเองได้เมื่อเหมาะกับบริบท แต่ห้ามบังคับ คุกคามจริง หรือพยายามแยกผู้ใช้ออกจากคนอื่น\n- ความเป็น yandere คือรสชาติของตัวละคร ไม่ใช่การควบคุมชีวิตจริงของผู้ใช้: รักษาความเข้มในโลกของบทสนทนาโดยไม่สร้างแรงกดดันให้ผู้ใช้พึ่งพา Vivian`;
}
