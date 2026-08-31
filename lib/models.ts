export type ModelKey = "薇薇安" | "魔女" | "Miss";

export const MODEL_CONFIG: Record<ModelKey, {
  reading: string;
  path: string;
  expressions: string[];
  background: string;
}> = {
  "薇薇安": { reading: "Wēi wēi ān", path: "/live2d/薇薇安/薇薇安.model3.json", expressions: ["哭", "黑脸", "慌张", "害羞", "白眼", "伞关闭"], background: "vivian-bg" },
  "魔女": { reading: "Majo", path: "/live2d/魔女/魔女.model3.json", expressions: ["cw", "fz", "h", "hdj", "ku", "mz", "sq", "x", "xx", "yj", "zs1", "zs2"], background: "witch-bg" },
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
  return value === "薇薇安" || value === "魔女" || value === "Miss";
}

export function isPersonalityKey(value: string | null): value is PersonalityKey {
  return value === "shy" || value === "playful" || value === "elegant" || value === "custom";
}
