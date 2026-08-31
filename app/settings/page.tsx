"use client";

import { useEffect, useState } from "react";
import { isModelKey, MODEL_CONFIG, PERSONALITIES, type ModelKey, type PersonalityKey } from "@/lib/models";

const characters = [
  { id: "Vivian", description: "ตัวตนหลักของ Vivian" },
  { id: "Majo", description: "โทนแม่มดลึกลับ" },
  { id: "Miss", description: "โทนสดใสขี้เล่น" },
];

export default function SettingsPage() {
  const [model, setModel] = useState<ModelKey>("薇薇安");
  const [personality, setPersonality] = useState<PersonalityKey>("custom");
  const [characterName, setCharacterName] = useState("Vivian");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const savedModel = localStorage.getItem("vivian-model");
    const savedPersonality = localStorage.getItem("vivian-personality") as PersonalityKey | null;
    const savedName = localStorage.getItem("vivian-character-name");
    if (isModelKey(savedModel)) setModel(savedModel);
    if (savedPersonality && savedPersonality in PERSONALITIES) setPersonality(savedPersonality);
    if (savedName) setCharacterName(savedName);
  }, []);

  function save() {
    localStorage.setItem("vivian-model", model);
    localStorage.setItem("vivian-personality", personality);
    localStorage.setItem("vivian-character-name", characterName.trim() || "Vivian");
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  }

  return <main className="settings-shell">
    <div className="settings-card">
      <button className="settings-back" type="button" onClick={() => { window.location.href = "/"; }}>Back to companion</button>
      <p className="settings-kicker">VIVIAN CONFIGURATION</p>
      <h1>เลือกตัวตนของ Vivian</h1>
      <p className="settings-lead">ตั้งค่าโมเดล นิสัย และชื่อที่ใช้ใน session นี้</p>

      <section className="settings-section">
        <h2>Model</h2>
        <div className="selection-grid model-grid">
          {(Object.keys(MODEL_CONFIG) as ModelKey[]).map((key) => <button key={key} className={`selection-card ${model === key ? "is-selected" : ""}`} type="button" onClick={() => setModel(key)}>
            <strong>{key}</strong><span>{MODEL_CONFIG[key].reading}</span><small>{key === "魔女" ? "8192 original / mobile safe" : "4096 original / mobile safe"}</small>
          </button>)}
        </div>
      </section>

      <section className="settings-section">
        <h2>Personality</h2>
        <div className="selection-grid">
          {(Object.entries(PERSONALITIES) as [PersonalityKey, { label: string; description: string }][]).map(([key, item]) => <button key={key} className={`selection-card ${personality === key ? "is-selected" : ""}`} type="button" onClick={() => setPersonality(key)}>
            <strong>{item.label}</strong><span>{item.description}</span>
          </button>)}
        </div>
      </section>

      <section className="settings-section">
        <h2>Character</h2>
        <div className="selection-grid character-grid">
          {characters.map((item) => <button key={item.id} className={`selection-card ${characterName === item.id ? "is-selected" : ""}`} type="button" onClick={() => setCharacterName(item.id)}>
            <strong>{item.id}</strong><span>{item.description}</span>
          </button>)}
        </div>
        <label className="character-input">Custom display name<input value={characterName} maxLength={40} onChange={(event) => setCharacterName(event.target.value)} /></label>
      </section>

      <button className="settings-save" type="button" onClick={save}>{saved ? "Saved" : "Save configuration"}</button>
    </div>
  </main>;
}
