export interface SpeechStyle {
  delivery: "teasing" | "flustered" | "gentle";
  cue: string;
  speedAdjustment: number;
  temperature: number;
  topP: number;
  repetitionPenalty: number;
}

// Remove only recognizable stage directions; spoken explanations in
// parentheses (including technical terms and numbers) must survive.
const stageDirection = /^[\s]*(?:หลบตา|เม้มปาก|กลบยิ้ม|ยิ้ม|หัวเราะ|หน้าแดง|เขิน|ทำหน้า|หันหน้า|กอดอก|ถอนหายใจ|ขยับ|พยักหน้า|ส่ายหน้า|looks? away|blush(?:es|ing)?|smiles?|sighs?|chuckles?|laughs?|pouts?)/iu;
const stammer = /(?:^|\s)([\p{L}]{1,4})\s*[-–—…]\s*\1\s*[-–—…]/iu;

export function speechText(value: string): string {
  return value.split(/\n\s*(?:แหล่งข้อมูล|sources)\s*:/i)[0]
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[（(]([^()（）\n]{1,120})[）)]/gu, (match: string, content: string) => stageDirection.test(content) ? " " : match)
    .replace(/[*_`~〜～]/g, "")
    // Romaji "B- B- Baka" means interrupted "ba" sounds, not the letter B.
    // Preserve the number of attempts rather than collapsing repeated words.
    .replace(/\b((?:b\s*-\s*)+)baka\b/giu, (match: string, attempts: string) => {
      const count = attempts.match(/-/g)?.length ?? 1;
      return `${"Ba… ".repeat(count)}${match.match(/baka$/i)?.[0] ?? "Baka"}`;
    })
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/([ก-๙])([A-Za-z])/g, "$1 $2")
    .replace(/([A-Za-z])([ก-๙])/g, "$1 $2")
    .replace(/\b([A-Za-z]{2,})(\s+\1\b)/giu, "$1, $1")
    .replace(/([!?！？]){2,}/g, "$1")
    .replace(/\.{3,}|…+/g, "…")
    .replace(/\s+/g, " ")
    .trim();
}

export function speechStyle(value: string): SpeechStyle {
  // Care takes precedence over the proud facade, including comforting replies
  // that end with a tsundere denial. One cue avoids exaggerated acting.
  if (/เศร้า|เสียใจ|ร้องไห้|เหนื่อย|ไม่เป็นไร|ฉันฟังอยู่|อยู่ตรงนี้|พักก่อน|sad|sorry|it's okay|i(?:'m| am) here|take your time|大丈夫|괜찮|没关系/iu.test(value)) {
    return { delivery: "gentle", cue: "[gentle, reassuring]", speedAdjustment: -.02, temperature: .60, topP: .70, repetitionPenalty: stammer.test(value) ? 1 : 1.2 };
  }
  if (stammer.test(value)) {
    return { delivery: "flustered", cue: "[flustered, stammering naturally, pronounce broken syllables rather than letter names]", speedAdjustment: -.01, temperature: .64, topP: .72, repetitionPenalty: 1 };
  }
  if (/เขิน|อย่าเข้าใจผิด|ไม่ได้(?:รอ|ชอบ|เป็นห่วง|คิดถึง)|อย่าเพิ่งได้ใจ|อย่าคิดไปเอง|ซะหน่อย|fluster|blush|don't (?:get|misunderstand)|not (?:waiting|like i)|別に|勘違い|照れ|착각|부끄|才不是|别误会/iu.test(value)) {
    return { delivery: "flustered", cue: "[flustered, trying to sound composed]", speedAdjustment: .01, temperature: .64, topP: .72, repetitionPenalty: 1.2 };
  }
  return { delivery: "teasing", cue: "[confident, playful, with restrained warmth]", speedAdjustment: 0, temperature: .62, topP: .71, repetitionPenalty: 1.2 };
}

export function fishSpeechText(cleanText: string, style: SpeechStyle, model: string, language = "global"): string {
  // S2 supports free-form inline delivery cues. Other configured models keep
  // plain text so they cannot speak the direction as part of the reply.
  if (!/^s2(?:[.-]|$)/i.test(model)) return cleanText;
  const thai = language === "th" || (language === "global" && /[ก-๙]/u.test(cleanText));
  const cue = thai
    ? `${style.cue.slice(0, -1)}, standard Central Thai accent, clear Thai pronunciation, no regional or Isan accent]`
    : style.cue;
  return `${cue} ${cleanText}`;
}

export function speechSpeed(speed: unknown, style: SpeechStyle): number {
  const requested = typeof speed === "number" && Number.isFinite(speed) ? speed : .98;
  return Math.min(1.2, Math.max(.8, requested + style.speedAdjustment));
}
