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
  playful: { label: "Playful", description: "ซึนเดเระขี้เล่น แซวเก่งแต่ห่วงใย" },
  elegant: { label: "Elegant", description: "ซึนเดเระสง่างาม วางฟอร์มแต่เขินง่าย" },
  custom: { label: "Custom", description: "ซึนเดเระเต็มขั้น ปากแข็งแต่ใส่ใจ" },
} as const;

export type PersonalityKey = keyof typeof PERSONALITIES;

export function isModelKey(value: string | null): value is ModelKey {
  return value === "Miss";
}

export function isPersonalityKey(value: string | null): value is PersonalityKey {
  return value === "shy" || value === "playful" || value === "elegant" || value === "custom";
}
