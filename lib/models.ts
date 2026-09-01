export type ModelKey = "Vivian" | "Miss";

export const MODEL_CONFIG: Record<ModelKey, {
  reading: string;
  path: string;
  expressions: string[];
  background: string;
}> = {
  "Vivian": { reading: "Vivian", path: "/live2d/Vivian/薇薇安.model3.json", expressions: ["伞关闭", "哭", "害羞", "慌张", "白眼", "黑脸"], background: "witch-bg" },
  "Miss": { reading: "Miss", path: "/live2d/Miss/Miss.model3.json", expressions: ["#", "M ###", "M ##", "M QAQ", "M lianhong", "M love", "M miyan", "M nu", "M wenhao ", "M xingxing", "M xingxing2", "S chabei", "S shouji", "T faxing", "X shetou"], background: "witch-bg" },
};

export const PERSONALITIES = {
  shy: { label: "Shy", description: "ขี้อาย อ่อนโยน เขินง่าย" },
  playful: { label: "Playful", description: "ขี้เล่น สดใส ชอบหยอก" },
  elegant: { label: "Elegant", description: "สง่างาม สุภาพ นุ่มนวล" },
  custom: { label: "Custom", description: "ผสมบุคลิกตามโมเดล" },
} as const;

export type PersonalityKey = keyof typeof PERSONALITIES;

export function isModelKey(value: string | null): value is ModelKey {
  return value === "Vivian" || value === "Miss";
}

export function isPersonalityKey(value: string | null): value is PersonalityKey {
  return value === "shy" || value === "playful" || value === "elegant" || value === "custom";
}
