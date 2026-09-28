"use client";

import { useEffect, useState } from "react";

interface DesktopBridge {
  getApiKeyStatus(): Promise<Record<string, "local" | "environment" | null>>;
  saveApiKeys(updates: Record<string, string>): Promise<{ status: Record<string, "local" | "environment" | null>; restarting: boolean }>;
}

interface ConfigField {
  key: string;
  label: string;
  group: string;
  secret: boolean;
}

const CONFIG_FIELDS: ConfigField[] = [
  { key: "GROQ_API_KEY", label: "Groq · LLM + Whisper STT", group: "AI", secret: true },
  { key: "GEMINI_API_KEY", label: "Gemini · Vision และค้นหา", group: "AI", secret: true },
  { key: "TYPESAFE_API_KEY", label: "Jev · ตัดสินใจค้นข้อมูลล่าสุด", group: "AI", secret: true },
  { key: "CEREBRAS_API_KEY", label: "Cerebras · Memory Management", group: "Memory", secret: true },
  { key: "FISH_AUDIO_API_KEY", label: "Fish Audio · พูดตอบ", group: "Voice", secret: true },
  { key: "FISH_AUDIO_VOICE_ID", label: "Fish Audio Voice ID", group: "Voice", secret: false },
  { key: "TAVILY_API_KEY", label: "Tavily · ค้นเว็บ", group: "Extras", secret: true },
];

function desktopBridge(): DesktopBridge | undefined {
  return (window as Window & { vivianDesktop?: DesktopBridge }).vivianDesktop;
}

export function DesktopApiKeySettings() {
  const [status, setStatus] = useState<Record<string, "local" | "environment" | null>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [removed, setRemoved] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    const bridge = desktopBridge();
    if (!bridge?.getApiKeyStatus) {
      setAvailable(false);
      return;
    }
    let active = true;
    bridge.getApiKeyStatus().then((result) => { if (active) setStatus(result); }).catch(() => { if (active) setNotice("อ่านสถานะ API keys ไม่สำเร็จ"); });
    return () => { active = false; };
  }, []);

  async function saveKeys(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const bridge = desktopBridge();
    if (!bridge?.saveApiKeys) return;
    const updates: Record<string, string> = {};
    for (const field of CONFIG_FIELDS) {
      if (removed.includes(field.key)) updates[field.key] = "";
      else if (drafts[field.key]?.trim()) updates[field.key] = drafts[field.key].trim();
    }
    if (!Object.keys(updates).length) {
      setNotice("ยังไม่มีการเปลี่ยนแปลง");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const result = await bridge.saveApiKeys(updates);
      setStatus(result.status);
      setDrafts({});
      setRemoved([]);
      setNotice(result.restarting ? "บันทึกแล้ว กำลังเริ่ม Vivian ใหม่เพื่อใช้ key ใหม่..." : "บันทึกแล้ว กรุณาเริ่ม desktop:dev ใหม่เพื่อใช้ key ใหม่");
    } catch {
      setNotice("บันทึก API keys ไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  return <section className="desktop-api-settings" aria-label="Desktop API keys">
    <h2>Desktop API keys</h2>
    <p>ตั้งค่าเฉพาะเครื่องนี้ ค่าเดิมจะไม่ถูกแสดงอีก ปล่อยช่องว่างไว้เพื่อเก็บค่าเดิม</p>
    {!available ? <p className="desktop-api-notice">เปิดหน้านี้ในแอป Vivian Desktop เพื่อตั้งค่า API keys</p> : <form onSubmit={(event) => void saveKeys(event)}>
      {CONFIG_FIELDS.map((field, index) => <div className="desktop-api-field" key={field.key}>
        {(index === 0 || CONFIG_FIELDS[index - 1].group !== field.group) && <h3>{field.group}</h3>}
        <label htmlFor={`desktop-${field.key}`}>{field.label}<span>{removed.includes(field.key) ? "จะลบ" : status[field.key] === "local" ? "ตั้งค่าแล้ว" : status[field.key] === "environment" ? "จาก environment" : "ยังไม่ได้ตั้งค่า"}</span></label>
        <div className="desktop-api-entry">
          <input id={`desktop-${field.key}`} type={field.secret ? "password" : "text"} autoComplete="off" spellCheck={false} maxLength={4096} value={drafts[field.key] ?? ""} disabled={removed.includes(field.key) || busy} placeholder={status[field.key] ? "เว้นว่างเพื่อใช้ค่าเดิม" : "ใส่ค่าใหม่"} onChange={(event) => setDrafts((current) => ({ ...current, [field.key]: event.target.value }))} />
          {status[field.key] === "local" && <button type="button" disabled={busy} onClick={() => { setRemoved((current) => current.includes(field.key) ? current.filter((key) => key !== field.key) : [...current, field.key]); setDrafts((current) => ({ ...current, [field.key]: "" })); }}>{removed.includes(field.key) ? "ยกเลิก" : "ลบ"}</button>}
        </div>
      </div>)}
      {notice && <p className="desktop-api-notice" role="status">{notice}</p>}
      <button className="desktop-api-save" type="submit" disabled={busy}>{busy ? "กำลังบันทึก..." : "บันทึกและเริ่มใหม่"}</button>
    </form>}
  </section>;
}
