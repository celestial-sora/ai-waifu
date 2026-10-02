import assert from "node:assert/strict";
import test from "node:test";
import { applyConversationTurn, defaultCompanionState, decayCompanionState, normalizeMood } from "../lib/companion.ts";

test("old stored moods migrate without resetting relationship or memory", () => {
  const saved = { ...defaultCompanionState(), affinity: 82, trust: 73, familiarity: 64, mood: "yandere", conversationSummary: "ผู้ใช้ชอบชา" };
  const restored = { ...saved, mood: normalizeMood(saved.mood) };
  assert.equal(restored.mood, "tsundere");
  assert.equal(restored.affinity, saved.affinity);
  assert.equal(restored.trust, saved.trust);
  assert.equal(restored.familiarity, saved.familiarity);
  assert.equal(restored.conversationSummary, saved.conversationSummary);
  assert.equal(normalizeMood("unknown"), "calm");
  assert.equal(normalizeMood("warm"), "warm");
});

test("a flustered reply expresses tsundere mood even in a new relationship", () => {
  const state = defaultCompanionState();
  const next = applyConversationTurn(state, "ชมได้ไหม", "อย่าเข้าใจผิด ฉันไม่ได้เขินสักหน่อย");
  assert.equal(next.mood, "tsundere");
  assert.equal(state.mood, "calm");
  assert.equal(next.affinity, state.affinity + 1);
});

test("distress takes precedence over flustered banter", () => {
  const next = applyConversationTurn(defaultCompanionState(), "วันนี้เศร้ามาก", "ฉันฟังอยู่ ไม่ได้เป็นห่วงสักหน่อย");
  assert.equal(next.mood, "melancholy");
});

test("idle banter does not increase closeness and intense moods still decay", () => {
  const state = { ...defaultCompanionState(), moodIntensity: 98 };
  const next = applyConversationTurn(state, "", "ไม่ได้รอหรอก", true);
  assert.equal(next.affinity, state.affinity);
  assert.equal(next.familiarity, state.familiarity);
  assert.equal(next.moodIntensity, 100);
  const faded = decayCompanionState(next, Date.parse(next.lastInteractionAt) + 24 * 3_600_000);
  assert.equal(faded.mood, "calm");
  assert.equal(faded.affinity, state.affinity);
});
