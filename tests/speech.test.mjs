import assert from "node:assert/strict";
import test from "node:test";
import { fishSpeechText, speechSpeed, speechStyle, speechText } from "../lib/speech.ts";

test("spoken replies omit stage directions and sources but retain dialogue and explanations", () => {
  assert.equal(speechText("(หลบตา) ไม่ได้รอหรอก... **Vivian** อ่าน [เรื่องนี้](https://example.com) (เวอร์ชัน 2)\nแหล่งข้อมูล:\n- https://example.com"), "ไม่ได้รอหรอก… Vivian อ่าน เรื่องนี้ (เวอร์ชัน 2)");
  assert.equal(speechText("（เม้มปากกลบยิ้ม） ทำได้ดีนี่!"), "ทำได้ดีนี่!");
  assert.equal(speechText("(blushes) I'm not waiting! (version 2)"), "I'm not waiting! (version 2)");
  assert.equal(speechText("(หลบตา)"), "");
});

test("tsundere denials sound flustered and comfort wins over teasing", () => {
  assert.equal(speechStyle("ไม่ได้เป็นห่วงสักหน่อย").delivery, "flustered");
  assert.equal(speechStyle("ไม่เป็นไร ฉันฟังอยู่ ไม่ได้เป็นห่วงสักหน่อย").delivery, "gentle");
  assert.equal(speechStyle("เล่ามาสิ ฉันฟังอยู่~").delivery, "gentle");
  assert.equal(speechStyle("ทำได้ดีนี่!").delivery, "teasing");
});

test("romaji stammers keep every attempted syllable without spelling the letter B", () => {
  const text = speechText("B- B- Baka!");
  assert.equal(text, "Ba… Ba… Baka!");
  assert.match(speechStyle(text).cue, /stammering naturally/);
  assert.equal(speechStyle(text).repetitionPenalty, 1);
  assert.equal(speechStyle("เล่ามาสิ").repetitionPenalty, 1.2);
  assert.match(fishSpeechText(text, speechStyle(text), "s2.1-pro-free", "th"), /standard Central Thai accent/);
  assert.equal(speechText("B-B-Baka"), "Ba… Ba… Baka");
  assert.equal(speechText("B- Baka"), "Ba… Baka");
  assert.equal(speechText("N- N- No!"), "N- N- No!");
  assert.match(speechStyle("N- N- No!").cue, /stammering naturally/);
  assert.equal(speechText("Use UTF-8 and a B-tree."), "Use UTF-8 and a B-tree.");
  assert.equal(speechStyle("ไม่เป็นไร B- B- Baka").delivery, "gentle");
});

test("Thai speech receives standard Central Thai delivery without changing spoken words", () => {
  const text = "อย่าเข้าใจผิด ฉันไม่ได้รอหรอก";
  const styled = fishSpeechText(text, speechStyle(text), "s2.1-pro-free", "th");
  assert.match(styled, /standard Central Thai accent/);
  assert.match(styled, /no regional or Isan accent/);
  assert.equal(styled.replace(/^\[[^\]]+\] /, ""), text);
  assert.match(fishSpeechText(text, speechStyle(text), "s2-pro"), /standard Central Thai accent/);
});

test("other languages and older models do not get Thai voice instructions", () => {
  const text = "Don't misunderstand!";
  assert.doesNotMatch(fishSpeechText(text, speechStyle(text), "s2-pro", "en"), /Thai|Isan/);
  assert.doesNotMatch(fishSpeechText(text, speechStyle(text), "s2-pro"), /Thai|Isan/);
  assert.equal(fishSpeechText(text, speechStyle(text), "speech-1.6", "th"), text);
});

test("delivery adjustments respect the voice speed slider limits", () => {
  assert.equal(speechSpeed(.8, speechStyle("ไม่เป็นไร")), .8);
  assert.equal(speechSpeed(1.2, speechStyle("ไม่ได้รอ")), 1.2);
  assert.equal(speechSpeed(1.1, speechStyle("เล่ามาสิ")), 1.1);
  assert.equal(speechSpeed("fast", speechStyle("เล่ามาสิ")), .98);
});
