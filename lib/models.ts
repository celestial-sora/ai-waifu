export type ModelKey = "Miss";

export const MODEL_CONFIG: Record<ModelKey, {
  reading: string;
  path: string;
  expressions: string[];
  background: string;
}> = {
  "Miss": { reading: "Miss", path: "/live2d/Miss/Miss.model3.json", expressions: ["#", "M ###", "M ##", "M QAQ", "M lianhong", "M love", "M miyan", "M nu", "M wenhao", "M xingxing", "M xingxing2", "S chabei", "S shouji", "T faxing", "X shetou"], background: "witch-bg" },
};

export const PERSONALITIES = {
  shy: { label: "Shy", description: "ซึนเดเระขี้อาย เขินแล้วกลบเกลื่อน" },
  playful: { label: "Playful", description: "ซึนขี้อาย ชอบเล่นคำและหยอกเบา ๆ" },
  elegant: { label: "Elegant", description: "ซึนสุภาพนุ่มนวล เก็บอาการแต่เขินง่าย" },
  custom: { label: "Custom", description: "ซึนขี้อาย พูดนุ่ม ๆ ปากแข็งเบา ๆ" },
} as const;

export type PersonalityKey = keyof typeof PERSONALITIES;

export function isModelKey(value: string | null): value is ModelKey {
  return value === "Miss";
}

export function isPersonalityKey(value: string | null): value is PersonalityKey {
  return value === "shy" || value === "playful" || value === "elegant" || value === "custom";
}
