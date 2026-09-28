const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { getConfigStatus, parseEnvFile, saveConfigUpdates } = require("./config.cjs");

test("desktop settings preserve unrelated config and return statuses only", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "vivian-config-"));
  try {
    fs.writeFileSync(path.join(directory, ".env"), "# user setting\nFISH_AUDIO_MODEL=s2.1-pro-free\nGROQ_API_KEY=old\n");
    const status = saveConfigUpdates(directory, { GROQ_API_KEY: "new-key", GEMINI_API_KEY: "gemini-key", TYPESAFE_API_KEY: "jev-key" });
    assert.equal(status.GROQ_API_KEY, "local");
    assert.equal(status.TYPESAFE_API_KEY, "local");
    assert.equal(JSON.stringify(status).includes("new-key"), false);
    assert.equal(JSON.stringify(status).includes("jev-key"), false);
    assert.deepEqual(parseEnvFile(directory), { FISH_AUDIO_MODEL: "s2.1-pro-free", GROQ_API_KEY: "new-key", GEMINI_API_KEY: "gemini-key", TYPESAFE_API_KEY: "jev-key" });
    saveConfigUpdates(directory, { GROQ_API_KEY: "" });
    assert.equal(getConfigStatus(directory).GROQ_API_KEY, process.env.GROQ_API_KEY ? "environment" : null);
    assert.equal(parseEnvFile(directory).FISH_AUDIO_MODEL, "s2.1-pro-free");
    if (process.platform !== "win32") assert.equal(fs.statSync(path.join(directory, ".env")).mode & 0o777, 0o600);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("desktop settings reject unknown names and line injection", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "vivian-config-"));
  try {
    assert.throws(() => saveConfigUpdates(directory, { VIVIAN_DESKTOP_TOKEN: "unsafe" }), /Invalid value/);
    assert.throws(() => saveConfigUpdates(directory, { GROQ_API_KEY: "safe\nEVIL=1" }), /Invalid value/);
    assert.equal(fs.existsSync(path.join(directory, ".env")), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
