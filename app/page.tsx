"use client";

import { useEffect, useRef, useState } from "react";
import { decayCompanionState, type CompanionState, defaultCompanionState, isMood, moodLabel, type Mood } from "@/lib/companion";
import { isModelKey, MODEL_CONFIG, type ModelKey } from "@/lib/models";

type IconName = "focus" | "config" | "info" | "wardrobe" | "chevron" | "mic" | "micOff" | "video" | "clip" | "message" | "send" | "close" | "memory" | "sound" | "language";

function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    focus: <><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"/><circle cx="12" cy="12" r="3.4"/></>,
    config: <><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="11" cy="18" r="2"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></>,
    wardrobe: <><path d="M12 3a3 3 0 0 1 3 3c0 1.4-1.1 2.3-2.4 2.8L4 14.2A2 2 0 0 0 5.1 18h13.8a2 2 0 0 0 1.1-3.8l-8.6-5.4"/><path d="M9 18v2M15 18v2"/></>,
    chevron: <path d="m5 9 7 7 7-7"/>,
    mic: <><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></>,
    micOff: <><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6M4 4l16 16"/></>,
    video: <><rect x="3" y="6" width="12" height="12" rx="3"/><path d="m15 10 5-3v10l-5-3"/></>,
    clip: <path d="m8.5 12.5 5.9-5.9a3.5 3.5 0 0 1 5 5l-7.8 7.8a5 5 0 0 1-7.1-7.1l7.3-7.3"/>,
    message: <path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8.5 8.5 0 0 1-3.6-.8L4 20l1.3-4A7.2 7.2 0 0 1 4 11.5 7.5 7.5 0 0 1 12 4a7.5 7.5 0 0 1 8 7.5Z"/>,
    send: <><path d="m4 4 16 8-16 8 3.2-8L4 4Z"/><path d="M7.2 12H20"/></>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
    memory: <><path d="M20 12c0 4.4-3.6 8-8 8s-8-3.6-8-8 3.6-8 8-8 8 3.6 8 8Z"/><path d="M12 8v4l2.8 1.8"/></>,
    sound: <><path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="M16 9a4 4 0 0 1 0 6"/></>,
    language: <><path d="M4 5h9M8.5 3v2M6 5c.5 3 2 5.3 4.5 6.8M5 14h7M8.5 12v2"/><path d="M15 19l2.5-7 2.5 7M16 17h3"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

type Message = { from: "me" | "vivian"; text: string; timestamp?: string };
type Memory = { id: number; memory: string; category: string; importance: number };
type SpeechLanguage = "th" | "en" | "ja" | "ko" | "zh";
const LANGUAGE_OPTIONS: Array<{ code: SpeechLanguage; label: string; nativeName: string }> = [
  { code: "th", label: "Thai", nativeName: "ไทย" },
  { code: "en", label: "English", nativeName: "EN" },
  { code: "ja", label: "Japanese", nativeName: "JP" },
  { code: "ko", label: "Korean", nativeName: "KR" },
  { code: "zh", label: "Chinese", nativeName: "CN" },
];
const greetings = [
  "คิดถึงจังเลย~\nขอกอดหน่อยได้ไหม~",
];
const greeting = (): Message => ({ from: "vivian", text: greetings[Math.floor(Math.random() * greetings.length)] });
const BACKGROUNDS = { day: "/backgrounds/christmas-day-4x3.jpg", night: "/backgrounds/christmas-night-4x3.jpg" } as const;
const APP_CODENAME = "Sandrome";
const SILENT_WAV = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
const CHAT_TIMEOUT_MS = 35000;
// The server aborts Fish at 14 seconds. Give the response a small transport
// margin, then always release the sending state instead of leaving "Thinking".
const TTS_TIMEOUT_MS = 17000;
const STT_TIMEOUT_MS = 20000;
const AUDIO_UNLOCK_MS = 1200;
const PLAYBACK_START_MS = 2500;
const AUDIO_SYNC_SETTLE_MS = 140;
const MIN_RECORDING_MS = 550;
const MIN_SPEECH_MS = 320;
const IDLE_AFTER_MS = 75_000;
const IDLE_COOLDOWN_MS = 8 * 60 * 1000;
const LAST_IDLE_KEY = "vivian-last-idle";
const VISION_MIN_INTERVAL_MS = 5000;
const VISION_MAX_INTERVAL_MS = 10000;
const VISION_COOLDOWN_MS = 6000;

function abortAfter(ms: number) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms);
  const controller = new AbortController();
  window.setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T) {
  let timer: number | undefined;
  return Promise.race([
    promise,
    new Promise<T>((resolve) => { timer = window.setTimeout(() => resolve(fallback), ms); }),
  ]).finally(() => { if (timer) window.clearTimeout(timer); });
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pixiAppRef = useRef<any>(null);
  const modelRef = useRef<any>(null);
  const modelLoadIdRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingStartedAtRef = useRef(0);
  const voiceAnalyserRef = useRef<AnalyserNode | null>(null);
  const voiceSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const voiceMonitorRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioUnlockPromiseRef = useRef<Promise<void> | null>(null);
  const audioPrimedRef = useRef(false);
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const lipSyncFrameRef = useRef<number | null>(null);
  const speakIdRef = useRef(0);
  const greetingSpokenRef = useRef(false);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const sendingRef = useRef(false);
  const speakingRef = useRef(false);
  const recordingRef = useRef(false);
  const micEnabledRef = useRef(false);
  const interactedRef = useRef(false);
  const lastActivityRef = useRef(Date.now());
  const idleBusyRef = useRef(false);
  const speechSpeedRef = useRef(.98);
  const speechLanguageRef = useRef<SpeechLanguage>("th");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraActiveRef = useRef(false);
  const lastVisionTriggerRef = useRef(0);
  const visionTimerRef = useRef<number | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<"user" | "environment">("user");
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  cameraActiveRef.current = cameraActive;
  // Keep the first server/client render identical; rotate greetings after the
  // session is hydrated instead of letting Math.random() cause a mismatch.
  const initialGreeting = useRef<Message>({ from: "vivian", text: greetings[0] });
  const messagesRef = useRef<Message[]>([initialGreeting.current]);
  const companionRef = useRef<CompanionState>(defaultCompanionState());
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([initialGreeting.current]);
  const [historyMessages, setHistoryMessages] = useState<Message[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [recording, setRecording] = useState(false);
  const [muted, setMuted] = useState(false);
  const [sending, setSending] = useState(false);
  const [sttPreview, setSttPreview] = useState<string | null>(null);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(true);
  const [selectedModel, setSelectedModel] = useState<ModelKey>("Miss");
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [companion, setCompanion] = useState<CompanionState>(defaultCompanionState());
  const [customInstructions, setCustomInstructions] = useState("");
  const [editingMemoryId, setEditingMemoryId] = useState<number | null>(null);
  const [memoryDraft, setMemoryDraft] = useState("");
  const [backgroundMode, setBackgroundMode] = useState<keyof typeof BACKGROUNDS>("day");
  const [speechSpeed, setSpeechSpeed] = useState(.98);
  const [speechLanguage, setSpeechLanguage] = useState<SpeechLanguage>("th");
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const lastVivianMessage = messages.filter((item) => item.from === "vivian").at(-1)?.text ?? initialGreeting.current.text;
  messagesRef.current = messages;
  sendingRef.current = sending;
  speechSpeedRef.current = speechSpeed;
  speechLanguageRef.current = speechLanguage;
  companionRef.current = companion;

  useEffect(() => {
    const hour = new Date().getHours();
    setBackgroundMode(hour >= 6 && hour < 18 ? "day" : "night");
  }, []);

  useEffect(() => {
    if (!chatOpen) return;
    const refresh = window.setInterval(() => { void loadMemory(); }, 3000);
    return () => window.clearInterval(refresh);
  }, [chatOpen]);

  useEffect(() => {
    // Bump the preference key so users who previously had Miss selected
    // receive the new Vivian model instead of being silently stuck on the
    // old cached selection.
    const storedModel = window.localStorage.getItem("vivian-model-v2");
    if (isModelKey(storedModel)) setSelectedModel(storedModel);
    const storedLanguage = window.localStorage.getItem("vivian-speech-language");
    if (LANGUAGE_OPTIONS.some((option) => option.code === storedLanguage)) setSpeechLanguage(storedLanguage as SpeechLanguage);
    setCustomInstructions(window.localStorage.getItem("vivian-custom-instructions") ?? "");
    const today = new Date().toISOString().slice(0, 10);
    const lastCheckIn = window.localStorage.getItem("vivian-checkin-date");
    const previousStreak = Number(window.localStorage.getItem("vivian-streak") ?? 0);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const nextStreak = lastCheckIn === today ? previousStreak : lastCheckIn === yesterday ? previousStreak + 1 : 1;
    if (lastCheckIn !== today) window.localStorage.setItem("vivian-checkin-date", today);
    window.localStorage.setItem("vivian-streak", String(nextStreak));
    setStreak(nextStreak);
    setPreferencesReady(true);
  }, []);

  useEffect(() => {
    // Warm every scene into the browser cache before the first reaction can
    // request a swap. This prevents a network fetch from delaying the fade.
  }, []);

  useEffect(() => {
    const unlock = () => {
      void unlockAudio();
      if (!greetingSpokenRef.current && !muted) {
        greetingSpokenRef.current = true;
        void speak(initialGreeting.current.text);
      }
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    void loadMemory();
    const idleTimer = window.setInterval(() => { void maybeIdleGreeting(); }, 12000);
    const onVisible = () => { lastActivityRef.current = Date.now(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.clearInterval(idleTimer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    if (!preferencesReady) return;
    let app: any;
    let resizeModel = () => {};
    let queueResize = () => {};
    let handleOrientationChange = () => {};
    let resizeFrame: number | undefined;
    let resizeTimeout: number | undefined;
    let disposed = false;
    const loadId = ++modelLoadIdRef.current;
    void (async () => {
      try {
        const PIXI = await import("pixi.js");
        const { Live2DModel } = await import("pixi-live2d-display/cubism4");
        if (!canvasRef.current || disposed) return;
        const isAppleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
        // Keep the 4096 textures intact, but render the canvas above CSS
        // resolution on iPad/iPhone so the model is not visibly soft. The
        // 1.5 cap is a deliberate memory/performance guard for Safari.
        const appleResolution = Math.min(Math.max(window.devicePixelRatio || 1, 1), 1.5);
        (window as any).PIXI = PIXI;
        (Live2DModel as any).registerTicker(PIXI.Ticker);
        app = pixiAppRef.current;
        if (!app) {
          app = new PIXI.Application({
            view: canvasRef.current,
            backgroundAlpha: 0,
            antialias: !isAppleMobile,
            autoDensity: true,
            resolution: isAppleMobile ? appleResolution : Math.min(window.devicePixelRatio || 1, 2),
            powerPreference: isAppleMobile ? "low-power" : "high-performance",
          });
          app.ticker.maxFPS = isAppleMobile ? 30 : 60;
          pixiAppRef.current = app;
        }
        const previousModel = modelRef.current;
        if (previousModel) {
          app.stage.removeChild(previousModel);
          previousModel.destroy({ children: true, texture: true, baseTexture: true });
          modelRef.current = null;
        }
        const modelConfig = MODEL_CONFIG[selectedModel];
        const model = await Live2DModel.from(modelConfig.path);
        if (disposed || loadId !== modelLoadIdRef.current) {
          model.destroy({ children: true, texture: true, baseTexture: true });
          return;
        }
        modelRef.current = model;
        const bounds = model.getLocalBounds();
        resizeModel = () => {
          const stage = canvasRef.current?.parentElement?.getBoundingClientRect();
          if (!stage) return;
          const width = Math.max(1, Math.round(stage.width));
          const height = Math.max(1, Math.round(stage.height));
          app.renderer.resolution = isAppleMobile ? appleResolution : Math.min(window.devicePixelRatio || 1, 2);
          app.renderer.resize(width, height);
          const scale = Math.min((width * (width > height ? .43 : .88)) / bounds.width, ((height - Math.min(124, height * .15)) * .88) / bounds.height);
          model.scale.set(scale);
          // Models from different artists use different local origins. Pivot
          // from their measured bounds so none of them can land off-canvas.
          model.anchor.set(0, 0);
          model.pivot.set(bounds.x + bounds.width / 2, bounds.y + bounds.height);
          model.x = width / 2;
          model.y = height * .99;
        };
        app.stage.addChild(model);
        queueResize = () => {
          if (resizeFrame) cancelAnimationFrame(resizeFrame);
          if (resizeTimeout) window.clearTimeout(resizeTimeout);
          resizeFrame = requestAnimationFrame(() => requestAnimationFrame(resizeModel));
          resizeTimeout = window.setTimeout(resizeModel, 240);
        };
        handleOrientationChange = () => {
          setToolsOpen(true);
          queueResize();
        };
        queueResize();
        window.addEventListener("resize", queueResize);
        window.addEventListener("orientationchange", handleOrientationChange);
        window.visualViewport?.addEventListener("resize", queueResize);
      } catch (error) {
        console.error("Live2D failed to load", error);
      }
    })();
    return () => {
      disposed = true;
      modelLoadIdRef.current += 1;
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      if (resizeTimeout) window.clearTimeout(resizeTimeout);
      window.removeEventListener("resize", queueResize);
      window.removeEventListener("orientationchange", handleOrientationChange);
      window.visualViewport?.removeEventListener("resize", queueResize);
      const currentModel = modelRef.current;
      if (currentModel && app) {
        app.stage.removeChild(currentModel);
        currentModel.destroy({ children: true, texture: true, baseTexture: true });
      }
      modelRef.current = null;
    };
  }, [preferencesReady, selectedModel]);

  useEffect(() => () => {
    pixiAppRef.current?.destroy(true, { children: true });
    pixiAppRef.current = null;
  }, []);

  useEffect(() => () => {
    micEnabledRef.current = false;
    stopRecording();
  }, []);

  async function loadMemory() {
    try {
      const response = await fetch("/api/memory", { cache: "no-store" });
      const data = await response.json();
      if (Array.isArray(data.memories)) setMemories(data.memories);
      if (data.messages?.length) setHistoryMessages(data.messages.map((item: { role: string; content: string; created_at?: string }) => ({ from: item.role === "user" ? "me" : "vivian", text: item.content, timestamp: item.created_at })));
      const next = normalizeCompanion(data.companion);
      if (next) setCompanion(next);
    } catch { /* Vivian stays usable while Supabase is unavailable. */ }
  }
  function normalizeCompanion(raw: unknown): CompanionState | null {
    if (!raw || typeof raw !== "object") return null;
    const item = raw as Record<string, unknown>;
    const mood = String(item.mood ?? "calm");
    return decayCompanionState({
      affinity: Number(item.affinity ?? 22),
      trust: Number(item.trust ?? 18),
      familiarity: Number(item.familiarity ?? 8),
      mood: isMood(mood) ? mood : "calm",
      moodIntensity: Number(item.moodIntensity ?? item.mood_intensity ?? 35),
      conversationSummary: String(item.conversationSummary ?? item.conversation_summary ?? ""),
      lastIdleAt: typeof item.lastIdleAt === "string" ? item.lastIdleAt : typeof item.last_idle_at === "string" ? item.last_idle_at : null,
      lastInteractionAt: typeof item.lastInteractionAt === "string" ? item.lastInteractionAt : typeof item.last_interaction_at === "string" ? item.last_interaction_at : null,
    });
  }
  function markActivity() {
    lastActivityRef.current = Date.now();
  }
  function lastIdleAt() {
    const fromState = companionRef.current.lastIdleAt ? Date.parse(companionRef.current.lastIdleAt) : 0;
    const fromStore = Number(window.localStorage.getItem(LAST_IDLE_KEY) ?? 0);
    return Math.max(fromState || 0, fromStore || 0);
  }
  async function maybeIdleGreeting() {
    if (idleBusyRef.current || sendingRef.current || speakingRef.current || recordingRef.current) return;
    if (!interactedRef.current || document.hidden) return;
    if (Date.now() - lastActivityRef.current < IDLE_AFTER_MS) return;
    if (Date.now() - lastIdleAt() < IDLE_COOLDOWN_MS) return;
    idleBusyRef.current = true;
    try {
      await sendMessage("", { idle: true });
      window.localStorage.setItem(LAST_IDLE_KEY, String(Date.now()));
    } finally {
      idleBusyRef.current = false;
      markActivity();
    }
  }
  function stopSpeech() {
    speakIdRef.current += 1;
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    speakingRef.current = false;
    stopLipSync();
    resetReaction();
  }
  function unlockAudio(): Promise<void> {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return Promise.resolve();
    audioContextRef.current ??= new AudioContextClass();
    if (audioPrimedRef.current && audioContextRef.current.state !== "suspended") return Promise.resolve();
    if (audioUnlockPromiseRef.current) return withTimeout(audioUnlockPromiseRef.current, AUDIO_UNLOCK_MS, undefined);
    const context = audioContextRef.current;
    const audio = audioRef.current ?? new Audio();
    audio.setAttribute("playsinline", "true");
    audio.preload = "auto";
    if (!audio.src) audio.src = SILENT_WAV;
    audio.muted = true;
    audioRef.current = audio;
    const unlock = (async () => {
      if (context.state === "suspended") await withTimeout(context.resume().then(() => undefined), 800, undefined);
      try {
        await withTimeout(audio.play().then(() => undefined), AUDIO_UNLOCK_MS, undefined);
        audio.pause();
        audio.currentTime = 0;
      } catch { /* Safari may reject empty or delayed unlock; chat must still continue. */ }
      audio.muted = false;
      audioPrimedRef.current = true;
    })();
    audioUnlockPromiseRef.current = unlock.finally(() => { audioUnlockPromiseRef.current = null; });
    return audioUnlockPromiseRef.current;
  }
  function setMouthOpen(value: number) {
    const coreModel = modelRef.current?.internalModel?.coreModel;
    if (!coreModel) return;
    const mouth = Math.max(0, Math.min(1, value));
    try {
      coreModel.setParameterValueById("ParamMouthOpenY", mouth);
      // Some Cubism models expose mouth shape separately. It is optional, so
      // keep this best-effort and preserve compatibility with older models.
      try { coreModel.setParameterValueById("ParamMouthForm", (mouth - .5) * .18); } catch { /* optional parameter */ }
    } catch (error) { console.warn("Live2D mouth parameter unavailable", error); }
  }
  function resetReaction() {
    const expressionManager = modelRef.current?.internalModel?.motionManager?.expressionManager;
    try { expressionManager?.resetExpression(); } catch (error) { console.warn("Live2D default expression unavailable", error); }
  }
  function stopLipSync() {
    if (lipSyncFrameRef.current !== null) cancelAnimationFrame(lipSyncFrameRef.current);
    lipSyncFrameRef.current = null;
    setMouthOpen(0);
  }
  function usesNativeAppleAudio() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }
  function startNativeLipSync(audio: HTMLAudioElement) {
    // Do not route an iOS media element through AudioContext. Safari can show
    // playback in Dynamic Island while that routed output is silent. Native
    // playback is reliable; this keeps a lightweight visual mouth movement.
    stopLipSync();
    let smoothed = 0;
    let previousTime = audio.currentTime;
    const update = () => {
      if (audio.paused || audio.ended) { setMouthOpen(0); lipSyncFrameRef.current = null; return; }
      // iOS Safari must stay on native playback, so there is no safe analyser
      // stream here. Use playback-time pulses with attack/release smoothing;
      // this avoids the old harsh, constant jaw oscillation while keeping the
      // mouth moving in sync with the spoken audio.
      const delta = Math.max(0, audio.currentTime - previousTime);
      previousTime = audio.currentTime;
      const pulse = .08 + (Math.sin(audio.currentTime * 17) * .5 + .5) * .34 + (Math.sin(audio.currentTime * 31) * .5 + .5) * .12;
      const target = delta > .12 ? 0 : Math.min(.62, pulse);
      smoothed += (target - smoothed) * (target > smoothed ? .42 : .2);
      setMouthOpen(smoothed);
      lipSyncFrameRef.current = requestAnimationFrame(update);
    };
    lipSyncFrameRef.current = requestAnimationFrame(update);
  }
  function startLipSync(audio: HTMLAudioElement) {
    if (usesNativeAppleAudio()) { startNativeLipSync(audio); return; }
    const context = audioContextRef.current;
    if (!context) return;
    stopLipSync();
    const analyser = analyserRef.current ?? context.createAnalyser();
    if (!analyserRef.current) {
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = .72;
      analyserRef.current = analyser;
    }
    if (!mediaSourceRef.current) {
      const source = context.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(context.destination);
      mediaSourceRef.current = source;
    }
    const samples = new Uint8Array(analyser.fftSize);
    const spectrum = new Uint8Array(analyser.frequencyBinCount);
    let smoothed = 0;
    const update = () => {
      if (audio.paused || audio.ended) { setMouthOpen(0); lipSyncFrameRef.current = null; return; }
      analyser.getByteTimeDomainData(samples);
      analyser.getByteFrequencyData(spectrum);
      let rms = 0;
      for (const sample of samples) { const delta = (sample - 128) / 128; rms += delta * delta; }
      rms = Math.sqrt(rms / samples.length);
      let energy = 0;
      for (let index = 1; index < spectrum.length; index += 1) energy += spectrum[index];
      const spectralLevel = spectrum.length > 1 ? energy / ((spectrum.length - 1) * 255) : 0;
      const level = Math.min(1, rms * 4.8 + spectralLevel * 1.8);
      const target = Math.max(0, Math.min(.9, Math.pow(level, .72)));
      smoothed += (target - smoothed) * (target > smoothed ? .5 : .18);
      setMouthOpen(smoothed);
      lipSyncFrameRef.current = requestAnimationFrame(update);
    };
    lipSyncFrameRef.current = requestAnimationFrame(update);
  }
  async function speak(text: string): Promise<boolean> {
    if (muted) return false;
    const speakId = ++speakIdRef.current;
    const abort = new AbortController();
    ttsAbortRef.current = abort;
    speakingRef.current = true;
    const timeout = window.setTimeout(() => abort.abort(), TTS_TIMEOUT_MS);
    let objectUrl: string | null = null;
    try {
      await withTimeout(unlockAudio(), AUDIO_UNLOCK_MS, undefined);
      if (speakId !== speakIdRef.current) return false;
      const response = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, signal: abort.signal, body: JSON.stringify({ text, speed: speechSpeedRef.current, language: speechLanguageRef.current }) });
      if (speakId !== speakIdRef.current) return false;
      if (!response.ok) {
        const error = await response.json().catch(() => null) as { error?: string; code?: string } | null;
        throw new Error(error?.code ?? error?.error ?? "TTS failed");
      }
      const blob = await withTimeout(response.blob(), TTS_TIMEOUT_MS, null);
      if (speakId !== speakIdRef.current) return false;
      if (!blob || blob.size === 0) throw new Error("TTS failed");
      const audio = audioRef.current ?? new Audio();
      audioRef.current?.pause();
      if (audioRef.current?.src) audioRef.current.removeAttribute("src");
      objectUrl = URL.createObjectURL(blob);
      audio.src = objectUrl;
      audio.setAttribute("playsinline", "true");
      audio.muted = false;
      audio.defaultMuted = false;
      audio.volume = 1;
      audio.onended = () => {
        if (speakId === speakIdRef.current) speakingRef.current = false;
        stopLipSync();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
      audio.onerror = () => {
        if (speakId === speakIdRef.current) speakingRef.current = false;
        stopLipSync();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
      audioRef.current = audio;
      const started = await withTimeout(audio.play().then(() => true), PLAYBACK_START_MS, false);
      if (speakId !== speakIdRef.current) return false;
      if (!started) {
        stopLipSync();
        throw new Error("TTS playback did not start");
      }
      // Start the animation only after playback begins. Starting it before
      // audio.play() lets the first frame see `paused` and permanently stop.
      startLipSync(audio);
      await new Promise<void>((resolve) => window.setTimeout(resolve, AUDIO_SYNC_SETTLE_MS));
      return speakId === speakIdRef.current;
    } catch (error) {
      if (speakId === speakIdRef.current) {
        speakingRef.current = false;
        if ((error as { name?: string }).name !== "AbortError") {
          resetReaction();
          console.error("TTS unavailable", error);
        }
      }
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      return false;
    } finally {
      window.clearTimeout(timeout);
      if (ttsAbortRef.current === abort) ttsAbortRef.current = null;
    }
  }
  async function sendMessage(overrideText?: string, options: { idle?: boolean; visionIdle?: boolean; image?: string } = {}) {
    const idle = Boolean(options.idle);
    const visionIdle = Boolean(options.visionIdle);
    const text = (overrideText ?? message).trim();
    let imageToSend = options.image ?? attachedImage;
    if (cameraActiveRef.current && !idle && !visionIdle) {
      const liveFrame = captureCurrentFrame();
      if (liveFrame) {
        imageToSend = liveFrame;
      }
    }
    if (sendingRef.current) return;
    if (!idle && !visionIdle && !text && !imageToSend) return;
    if (!idle && !visionIdle && text && await handleExpressionCommand(text)) {
      setMessage("");
      setAttachedImage(null);
      markActivity();
      return;
    }
    if (speakingRef.current) stopSpeech();
    markActivity();
    if (!idle && !visionIdle) interactedRef.current = true;
    const displayText = text || (imageToSend ? "📷 [ส่งรูปภาพ]" : "");
    const nextMessages = (idle || visionIdle) ? messagesRef.current : [...messagesRef.current, { from: "me" as const, text: displayText }];
    if (!idle && !visionIdle) {
      setMessages(nextMessages);
      setMessage("");
      setAttachedImage(null);
    }
    setSending(true);
    sendingRef.current = true;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortAfter(CHAT_TIMEOUT_MS),
        body: JSON.stringify({
          mode: visionIdle ? "vision_idle" : idle ? "idle" : "chat",
          messages: nextMessages.map((item) => ({ role: item.from === "me" ? "user" : "assistant", content: item.text })),
          image: imageToSend ?? undefined,
          character: selectedModel,
          customInstructions,
          language: speechLanguageRef.current,
        }),
      });
      const data = await withTimeout(response.json() as Promise<{ text?: string; error?: string; code?: string; memories?: Memory[]; companion?: CompanionState }>, 5000, null);
      if (!response.ok || !data?.text) throw new Error(data?.code ?? data?.error ?? "Chat request failed");
      const reply = data.text;
      setErrorNotice(null);
      // Do not reveal the reply bubble before Fish Audio has started. This
      // keeps the visible text and spoken response arriving together.
      if (!muted) await speak(reply);
      setMessages((current) => [...current, { from: "vivian", text: reply, timestamp: new Date().toISOString() }]);
      const nextCompanion = normalizeCompanion(data.companion);
      if (nextCompanion) setCompanion(nextCompanion);
      if (data.memories?.length) setMemories(data.memories.filter((item: Memory) => typeof item.id === "number"));
      setSending(false);
      sendingRef.current = false;
      void playReaction(reply, text, idle || visionIdle);
      void loadMemory();
    } catch (error) {
      console.error("Vivian response unavailable", error);
      resetReaction();
      if (!idle && !visionIdle) {
        const message = error instanceof Error && error.message.includes("RATE_LIMITED") ? "ส่งถี่เกินไปค่ะ รอสักครู่นะคะ" : "ตอนนี้เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้งนะคะ";
        setErrorNotice(message);
        setMessages((current) => [...current, { from: "vivian", text: message }]);
      }
    } finally {
      setSending(false);
      sendingRef.current = false;
    }
  }
  function moodExpression(mood: Mood, intensity: number) {
    const map: Record<Mood, string> = { calm: "#", warm: intensity >= 70 ? "M lianhong" : "M miyan", playful: intensity >= 70 ? "M xingxing" : "M xingxing2", shy: "M love", tired: "S chabei", melancholy: "M QAQ" };
    return map[mood];
  }
  function situationExpression(text: string, mood: Mood, intensity: number, idle: boolean) {
    // Miss has 15 authored expressions. Match them to the conversation
    // context deterministically so every expression has a meaningful use.
    const rules: Array<[string, RegExp]> = [
      ["X shetou", /จุ๊บ|จูบ|แกล้ง|หยอก|ล้อเล่น|ทะเล้น|kiss|tease|tongue/i],
      ["S shouji", /โทรศัพท์|โทรหา|สายโทร|ข้อความ|แจ้งเตือน|notification|phone|call|message|text/i],
      ["S chabei", /ชา|กาแฟ|ดื่ม|จิบ|พัก|เหนื่อย|ง่วง|tea|coffee|drink|rest|tired|sleepy/i],
      ["T faxing", /ผม|ทรงผม|แต่งตัว|แต่งหน้า|สวย|ดูดี|แฟชั่น|hair|hairstyle|makeup|beautiful|pretty|style/i],
      ["M QAQ", /เศร้า|เสียใจ|ร้องไห้|เหงา|ขอโทษ|sad|sorry|cry|lonely/i],
      ["M nu", /โกรธ|โมโห|หงุดหงิด|รำคาญ|ไม่พอใจ|angry|mad|annoyed|upset/i],
      ["M wenhao ", /ตกใจ|ว้าว|จริงเหรอ|หา|ไม่น่าเชื่อ|surprise|wow|really|shocked/i],
      ["M ##", /อะไรนะ|ห๊ะ|เอ๊ะ|งง|ไม่เข้าใจ|ทำไม|what|huh|confused|don't understand|why/i],
      ["M love", /เขิน|อาย|น่ารัก|ชม|หน้าแดง|cute|shy|blush|compliment/i],
      ["M lianhong", /รัก|ชอบ|คิดถึง|กอด|ห่วง|love|like|miss you|hug|care/i],
      ["M xingxing2", /ขำ|ตลก|หัวเราะ|มุก|ฮา|haha|lol|funny|joke|laugh/i],
      ["M xingxing", /ดีใจ|ตื่นเต้น|เยี่ยม|สุดยอด|ฉลอง|ดาว|happy|excited|great|awesome|celebrate|star/i],
      ["M ###", /ตา|มอง|กระพริบ|หลับตา|ดูนี่|eyes|look|blink|watch/i],
      ["M miyan", /ยิ้ม|สวัสดี|ทักทาย|ขอบคุณ|สุขสันต์|happy|smile|hello|greeting|thank/i],
    ];
    const matched = rules.find(([, pattern]) => pattern.test(text))?.[0];
    if (matched) return matched;
    if (idle && mood === "tired") return "S chabei";
    return moodExpression(mood, intensity);
  }
  async function handleExpressionCommand(text: string) {
    const match = text.match(/^\/(?:expression|exp)(?:\s+(.+))?$/i);
    if (!match) return false;
    const argument = match[1]?.trim() ?? "";
    const expressions = MODEL_CONFIG[selectedModel].expressions;
    if (argument.toLowerCase() === "list") {
      setMessages((current) => [...current, { from: "me", text }, { from: "vivian", text: `Expression ที่ใช้ได้: ${expressions.join(", ")}` }]);
      return true;
    }
    if (!argument || argument.toLowerCase() === "default" || argument.toLowerCase() === "reset") {
      resetReaction();
      setMessages((current) => [...current, { from: "me", text }, { from: "vivian", text: "กลับไปใช้ expression default แล้วค่ะ" }]);
      return true;
    }
    const expression = expressions.find((item) => item.trim().toLowerCase() === argument.toLowerCase());
    if (!expression) {
      setMessages((current) => [...current, { from: "me", text }, { from: "vivian", text: "ไม่พบ expression นี้ค่ะ ลองใช้ /expression list เพื่อดูรายการ" }]);
      return true;
    }
    try {
      if (!modelRef.current) throw new Error("Live2D model is not ready");
      await modelRef.current.expression(expression);
      setMessages((current) => [...current, { from: "me", text }, { from: "vivian", text: `เปลี่ยนเป็น expression ${expression.trim()} แล้วค่ะ` }]);
    } catch (error) {
      console.warn("Manual Live2D expression unavailable", error);
      resetReaction();
      setMessages((current) => [...current, { from: "me", text }, { from: "vivian", text: "ยังเปลี่ยน expression ไม่ได้ค่ะ โมเดลกำลังโหลดอยู่" }]);
    }
    return true;
  }
  async function playReaction(reply: string, userText: string, idle = false) {
    const model = modelRef.current;
    if (!model) return;
    const combined = `${reply} ${userText}`;
    const { mood, moodIntensity: intensity } = companionRef.current;
    const expression = situationExpression(combined, mood, intensity, idle);
    try {
      const supportedExpressions = MODEL_CONFIG[selectedModel].expressions;
      if (expression && supportedExpressions.includes(expression)) await model.expression(expression);
      else resetReaction();
      const definitions = model.internalModel?.motionManager?.definitions ?? {};
      // Miss currently ships without named motion groups. When a model adds
      // them, use the contextual pair; otherwise keep its stable Idle motion.
      const motionByExpression: Record<string, string[]> = {
        "M love": ["Shy", "Idle"], "M QAQ": ["Sad", "Idle"], "M nu": ["Angry", "Idle"],
        "M wenhao ": ["Surprise", "Idle"], "M ##": ["Thinking", "Idle"], "M xingxing": ["Excited", "Idle"],
        "M xingxing2": ["Laugh", "Idle"], "S chabei": ["Tea", "Idle"], "S shouji": ["Phone", "Idle"],
        "T faxing": ["Hair", "Idle"], "X shetou": ["Tease", "Idle"], "M ###": ["Look", "Idle"],
        "M miyan": ["Happy", "Idle"], "M lianhong": ["Warm", "Idle"], "#": ["Idle"],
      };
      const motionName = motionByExpression[expression]?.find((name) => definitions[name]?.length);
      if (motionName) await model.motion(motionName, 0, intensity >= 70 ? 3 : 2);
    } catch (error) {
      resetReaction();
      console.warn("Live2D reaction unavailable; keeping neutral state", error);
    }
  }
  async function startRecording() {
    if (recording || recorderRef.current) return;
    if (speakingRef.current) stopSpeech();
    markActivity();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const chunks: BlobPart[] = [];
      const preferredMimeTypes = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
      const mimeType = preferredMimeTypes.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 128000 });
      recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
      recorder.onstop = async () => {
        const durationMs = Date.now() - recordingStartedAtRef.current;
        const actualMimeType = recorder.mimeType || mimeType || "audio/webm";
        const extension = actualMimeType.includes("mp4") ? "m4a" : "webm";
        if (durationMs < MIN_RECORDING_MS || !chunks.length) {
          setSttPreview("ยังไม่มีเสียงที่ชัดพอค่ะ");
          window.setTimeout(() => setSttPreview(null), 2500);
          recorderRef.current = null;
          streamRef.current = null;
          return;
        }
        const form = new FormData();
        form.append("file", new Blob(chunks, { type: actualMimeType }), `vivian-recording.${extension}`);
        try {
          form.append("language", speechLanguageRef.current);
          const response = await fetch("/api/stt", { method: "POST", body: form, signal: abortAfter(STT_TIMEOUT_MS) });
          const data = await response.json() as { text?: string; error?: string };
          if (!response.ok) throw new Error(data.error ?? "STT failed");
          if (data.text?.trim()) {
            setSttPreview(data.text);
            void sendMessage(data.text);
            window.setTimeout(() => setSttPreview(null), 5000);
          } else throw new Error("STT returned no speech");
        } catch (error) {
          console.warn("STT unavailable", error);
          setSttPreview("ฟังไม่ชัด ลองพูดใหม่อีกครั้งนะคะ");
          window.setTimeout(() => setSttPreview(null), 3000);
        } finally {
          recorderRef.current = null;
          streamRef.current = null;
          // Do not restart the mic while Vivian is speaking. startRecording
          // intentionally stops active speech for a manual barge-in, so an
          // automatic STT restart must wait until the current TTS is ended.
          const resumeListening = () => {
            if (!micEnabledRef.current || recordingRef.current) return;
            if (speakingRef.current || sendingRef.current) {
              window.setTimeout(resumeListening, 250);
              return;
            }
            void startRecording();
          };
          window.setTimeout(resumeListening, 250);
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      streamRef.current = stream;
      recordingStartedAtRef.current = Date.now();
      recordingRef.current = true;
      setRecording(true);
      // Keep the recorder open and split speech into utterances using local
      // voice activity detection. Only the resulting clip is sent to STT.
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        const voiceContext = new AudioContextClass();
        const analyser = voiceContext.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = .75;
        voiceSourceRef.current = voiceContext.createMediaStreamSource(stream);
        voiceSourceRef.current.connect(analyser);
        voiceAnalyserRef.current = analyser;
        const samples = new Uint8Array(analyser.fftSize);
        let heardSpeech = false;
        let speechStartedAt = 0;
        let quietSince = 0;
        let noiseFloor = 0;
        const noiseCalibrationEndsAt = Date.now() + 700;
        const monitor = () => {
          if (!recordingRef.current || recorderRef.current !== recorder) return;
          analyser.getByteTimeDomainData(samples);
          let sum = 0;
          for (const sample of samples) { const delta = sample - 128; sum += delta * delta; }
          const rms = Math.sqrt(sum / samples.length) / 128;
          if (Date.now() < noiseCalibrationEndsAt) {
            noiseFloor = noiseFloor ? noiseFloor * .88 + rms * .12 : rms;
            voiceMonitorRef.current = requestAnimationFrame(monitor);
            return;
          }
          // Adapt to fans, music and room noise. The floor is allowed to rise
          // slowly, but a real voice must still clear a meaningful margin.
          noiseFloor = noiseFloor * .995 + rms * .005;
          const speechThreshold = Math.max(.065, Math.min(.18, noiseFloor * 2.8 + .018));
          if (rms > speechThreshold) {
            speechStartedAt ||= Date.now();
            if (Date.now() - speechStartedAt >= 380) heardSpeech = true;
            quietSince = 0;
          }
          else if (heardSpeech) {
            quietSince ||= Date.now();
            if (Date.now() - quietSince > 900) { stopRecording(); return; }
          } else if (Date.now() - speechStartedAt > 500) speechStartedAt = 0;
          voiceMonitorRef.current = requestAnimationFrame(monitor);
        };
        voiceMonitorRef.current = requestAnimationFrame(monitor);
      }
    } catch {
      resetReaction();
      setMessages((current) => [...current, { from: "vivian", text: "ยังไม่ได้รับสิทธิ์ใช้ไมโครโฟนค่ะ" }]);
    }
  }
  function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (voiceMonitorRef.current !== null) cancelAnimationFrame(voiceMonitorRef.current);
    voiceMonitorRef.current = null;
    voiceSourceRef.current?.disconnect();
    voiceSourceRef.current = null;
    voiceAnalyserRef.current = null;
    recordingRef.current = false;
    setRecording(false);
  }
  function toggleRecording() {
    if (micEnabledRef.current) {
      micEnabledRef.current = false;
      stopRecording();
    } else {
      micEnabledRef.current = true;
      void startRecording();
    }
  }

  function captureCurrentFrame(): string | null {
    const video = videoRef.current;
    if (!video) return null;
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    if (!vw || !vh) return null;

    try {
      const canvas = document.createElement("canvas");
      const maxDim = 800;
      let width = vw;
      let height = vh;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, width, height);
      return canvas.toDataURL("image/jpeg", 0.75);
    } catch (err) {
      console.warn("captureCurrentFrame error", err);
      return null;
    }
  }

  useEffect(() => {
    const video = videoRef.current;
    if (cameraActive && video && videoStreamRef.current) {
      if (video.srcObject !== videoStreamRef.current) {
        video.srcObject = videoStreamRef.current;
      }
      video.muted = true;
      video.play().catch((err) => console.warn("Camera play failed", err));
    }
  }, [cameraActive]);

  async function startCamera(facing: "user" | "environment" = cameraFacing) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: facing },
        audio: false,
      });
      videoStreamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.muted = true;
        await video.play().catch((err) => console.warn("Initial camera play failed", err));
      }
      setCameraFacing(facing);
      setCameraActive(true);
      cameraActiveRef.current = true;
      lastVisionTriggerRef.current = Date.now();
    } catch (err) {
      console.error("Camera access failed", err);
      setErrorNotice("ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตการเข้าถึงกล้องนะคะ");
    }
  }

  function stopCamera() {
    videoStreamRef.current?.getTracks().forEach((track) => track.stop());
    videoStreamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    cameraActiveRef.current = false;
    if (visionTimerRef.current) window.clearTimeout(visionTimerRef.current);
    visionTimerRef.current = null;
  }

  async function toggleCamera() {
    if (cameraActive) {
      stopCamera();
    } else {
      await startCamera();
    }
  }

  async function switchCamera() {
    const nextFacing = cameraFacing === "user" ? "environment" : "user";
    // Stop current tracks before switching
    videoStreamRef.current?.getTracks().forEach((track) => track.stop());
    videoStreamRef.current = null;
    await startCamera(nextFacing);
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErrorNotice("กรุณาเลือกไฟล์รูปภาพนะคะ");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const rawData = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxDim = 800;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL("image/jpeg", 0.75);
          setAttachedImage(compressed);
        } else {
          setAttachedImage(rawData);
        }
      };
      img.onerror = () => {
        setAttachedImage(rawData);
      };
      img.src = rawData;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  useEffect(() => {
    if (!cameraActive) {
      if (visionTimerRef.current) window.clearTimeout(visionTimerRef.current);
      visionTimerRef.current = null;
      return;
    }
    let isMounted = true;
    function scheduleNextCapture() {
      const delay = Math.floor(Math.random() * (VISION_MAX_INTERVAL_MS - VISION_MIN_INTERVAL_MS + 1)) + VISION_MIN_INTERVAL_MS;
      visionTimerRef.current = window.setTimeout(async () => {
        if (!isMounted || !cameraActiveRef.current) return;
        const now = Date.now();
        const timeSinceLast = now - lastVisionTriggerRef.current;
        if (
          timeSinceLast >= VISION_COOLDOWN_MS &&
          !sendingRef.current &&
          !speakingRef.current &&
          !recordingRef.current &&
          !message.trim()
        ) {
          const frame = captureCurrentFrame();
          if (frame) {
            lastVisionTriggerRef.current = Date.now();
            await sendMessage("", { visionIdle: true, image: frame });
          }
        }
        if (isMounted && cameraActiveRef.current) {
          scheduleNextCapture();
        }
      }, delay);
    }
    scheduleNextCapture();
    return () => {
      isMounted = false;
      if (visionTimerRef.current) window.clearTimeout(visionTimerRef.current);
      visionTimerRef.current = null;
    };
  }, [cameraActive, message]);

  async function saveMemory(memory: Memory) {
    const response = await fetch("/api/memory", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: memory.id, memory: memoryDraft, category: memory.category, importance: memory.importance }) });
    if (!response.ok) return setErrorNotice("บันทึกความจำไม่สำเร็จค่ะ");
    const data = await response.json() as { memory?: Memory };
    if (data.memory) setMemories((current) => current.map((item) => item.id === memory.id ? data.memory! : item));
    setEditingMemoryId(null);
  }

  return <main className="companion-shell">
    <section className={`companion-stage ${MODEL_CONFIG[selectedModel].background} ${!sending && !recording ? "is-idle" : ""}`} aria-label="Vivian companion">
      <div className="scene-background" style={{ backgroundImage: `url("${BACKGROUNDS[backgroundMode]}")` }} aria-hidden="true" />
      <canvas className="live2d-canvas" ref={canvasRef} />
      <header className="companion-brand"><span className="brand-mark" aria-hidden="true"/><span>Vivian</span></header>
      <div className="camera-pip" style={{ display: cameraActive ? "flex" : "none" }} aria-label="Live Camera Vision">
        <div className="camera-pip-header">
          <div className="live-badge">
            <span className="live-dot" aria-hidden="true" />
            <span>{cameraFacing === "environment" ? "REAR CAM" : "LIVE VISION"}</span>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button type="button" onClick={switchCamera} aria-label="สลับกล้อง" title="สลับกล้องหน้า/หลัง">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 7H4m0 0l4-4M4 7l4 4M4 17h16m0 0-4 4m4-4-4-4"/>
              </svg>
            </button>
            <button type="button" onClick={stopCamera} aria-label="ปิดกล้อง">×</button>
          </div>
        </div>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="camera-video-feed"
          style={{ transform: cameraFacing === "environment" ? "none" : "scaleX(-1)" }}
          onLoadedMetadata={(e) => {
            e.currentTarget.play().catch((err) => console.warn("Video play on metadata blocked", err));
          }}
        />
      </div>
      {sttPreview && <div className="speech-preview"><small>You said</small>{sttPreview}</div>}
      <output className="vivian-speech" aria-live="polite">{sending ? "กำลังคิดอยู่ค่ะ..." : lastVivianMessage}</output>
      {errorNotice && <button className="error-notice" type="button" onClick={() => setErrorNotice(null)}>{errorNotice} ×</button>}
      <aside className={`side-tools ${toolsOpen ? "is-open" : ""}`} aria-label="เครื่องมือ Vivian">
        <button type="button" onClick={() => setMemoryOpen(true)} aria-label="เปิด Config" title="Config"><Icon name="config"/></button>
        <button type="button" className="language-lock" onClick={() => setLanguageOpen(true)} aria-label={`ล็อกภาษา ${speechLanguage.toUpperCase()}`} title={`Language lock: ${speechLanguage.toUpperCase()}`}><Icon name="language"/><span>{speechLanguage === "ja" ? "JP" : speechLanguage === "ko" ? "KR" : speechLanguage === "zh" ? "CN" : speechLanguage.toUpperCase()}</span></button>
        <button type="button" onClick={() => setInfoOpen(true)} aria-label="ข้อมูลเวอร์ชัน" title="Info"><Icon name="info"/></button>
        <button className="tool-expand" type="button" onClick={() => setToolsOpen((current) => !current)} aria-label={toolsOpen ? "ซ่อนเครื่องมือ" : "แสดงเครื่องมือ"}><Icon name="chevron"/></button>
      </aside>
      {attachedImage && (
        <div className="attachment-preview" aria-label="รูปภาพที่แนบ">
          <img src={attachedImage} alt="Attachment preview" />
          <span>แนบรูปภาพแล้ว</span>
          <button type="button" onClick={() => setAttachedImage(null)} aria-label="ลบรูปภาพ">×</button>
        </div>
      )}
      <form className="companion-input" onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}>
        <button className={`circle-control ${recording ? "is-recording" : "is-muted"}`} type="button" onClick={toggleRecording} aria-pressed={recording} aria-label={recording ? "Mute microphone" : "Microphone muted, click to unmute"}><Icon name={recording ? "mic" : "micOff"}/></button>
        <button className={`circle-control ${cameraActive ? "is-active is-camera-active" : ""}`} type="button" onClick={toggleCamera} aria-pressed={cameraActive} aria-label={cameraActive ? "ปิดกล้อง Live" : "เปิดกล้อง Live"}><Icon name="video"/></button>
        <button className={`circle-control ${attachedImage ? "is-active" : ""}`} type="button" onClick={() => fileInputRef.current?.click()} aria-label="แนบรูปภาพ"><Icon name="clip"/></button>
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleImageUpload} tabIndex={-1} />
        <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder={recording ? "กำลังฟัง... กดไมค์เพื่อ Mute" : cameraActive ? "กล้อง Live กำลังทำงาน... พิมพ์คุยได้" : "Ask Vivian"} aria-label="ข้อความถึง Vivian" />
        <button className="send-text" type="submit" disabled={sending || (!message.trim() && !attachedImage)} aria-label="ส่งข้อความ"><Icon name="send" size={22}/></button>
        <button className="text-send" type="button" onClick={() => setChatOpen(true)}><Icon name="message" size={23}/><span>Chat</span></button>
      </form>
    </section>
    {chatOpen && <div className="chat-backdrop" role="presentation" onClick={() => setChatOpen(false)}>
      <section className="chat-sheet" role="dialog" aria-modal="true" aria-label="ประวัติแชตกับ Vivian" onClick={(event) => event.stopPropagation()}>
        <div className="chat-sheet-head"><div><small>VIVIAN CHAT</small><h1>ประวัติแชต</h1><p>บทสนทนาทั้งหมดของคุณกับ Vivian</p></div><button type="button" onClick={() => setChatOpen(false)} aria-label="ปิด"><Icon name="close"/></button></div>
        <div className="chat-history">{[...historyMessages, ...messages].sort((a, b) => (b.timestamp ? Date.parse(b.timestamp) : 0) - (a.timestamp ? Date.parse(a.timestamp) : 0)).map((item, index) => <div className={`chat-message ${item.from}`} key={`${item.timestamp ?? "current"}-${item.from}-${index}`}><small>{item.from === "me" ? "คุณ" : "Vivian"}</small><time dateTime={item.timestamp}>{item.timestamp ? new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit" }).format(new Date(item.timestamp)) : "ตอนนี้"}</time><p>{item.text}</p></div>)}</div>
      </section>
    </div>}
    {memoryOpen && <section className="memory-sheet" role="dialog" aria-modal="true" aria-label="ความทรงจำของ Vivian">
      <div className="memory-sheet-head"><div><small>VIVIAN MEMORY</small><h1>ความทรงจำ</h1><p>สิ่งที่ Vivian ใช้จำเพื่อคุยกับคุณให้ต่อเนื่อง</p></div><button type="button" onClick={() => setMemoryOpen(false)} aria-label="ปิด"><Icon name="close"/></button></div>
      <div className="bond-panel" aria-label="ความสัมพันธ์กับ Vivian">
        <p><strong>Daily check-in</strong> ติดต่อกัน {streak} วัน</p>
        <p><strong>อารมณ์พื้นฐาน</strong>{moodLabel(companion.mood)}</p>
        {[["ความสนิท", companion.affinity], ["ความไว้ใจ", companion.trust], ["ความคุ้นเคย", companion.familiarity]].map(([label, value]) => (
          <div key={String(label)}><span>{label}</span><i><b style={{ width: `${value}%` }} /></i><em>{value}</em></div>
        ))}
      </div>
      <div className="memory-list">{memories.length ? memories.map((memory) => <article key={memory.id}><Icon name="memory" size={18}/>{editingMemoryId === memory.id ? <div className="memory-edit"><textarea value={memoryDraft} maxLength={500} onChange={(event) => setMemoryDraft(event.target.value)} /><div><button type="button" onClick={() => void saveMemory(memory)}>บันทึก</button><button type="button" onClick={() => setEditingMemoryId(null)}>ยกเลิก</button></div></div> : <><p><strong>{memory.category}</strong>{memory.memory}</p><button type="button" className="memory-edit-button" onClick={() => { setEditingMemoryId(memory.id); setMemoryDraft(memory.memory); }} aria-label="แก้ไขความจำ">แก้ไข</button></>}</article>) : <p className="empty-memory">ยังไม่มีความทรงจำถาวรค่ะ Vivian จะจำเฉพาะเรื่องสำคัญที่คุณเล่า</p>}</div>
      <div className="custom-instructions"><strong>Custom instructions</strong><p>บอก Vivian ว่าคุณอยากให้ตอบอย่างไร เช่น ภาษา โทนเสียง หรือสิ่งที่ควรหลีกเลี่ยง</p><textarea value={customInstructions} maxLength={2000} onChange={(event) => { const value = event.target.value; setCustomInstructions(value); window.localStorage.setItem("vivian-custom-instructions", value); }} placeholder="เช่น เรียกฉันว่า... ตอบสั้น ๆ และใช้ภาษาไทยเป็นหลัก" /></div>
      <div className="memory-sheet-foot"><button type="button" onClick={() => setMuted((value) => !value)}><Icon name="sound" size={18}/>{muted ? "เปิดเสียงตอบ" : "ปิดเสียงตอบ"}</button><span className="codename">CODENAME: {APP_CODENAME}</span><button type="button" className="close-sheet" onClick={() => setMemoryOpen(false)}>เสร็จ</button></div>
    </section>}
    {languageOpen && <div className="chat-backdrop" role="presentation" onClick={() => setLanguageOpen(false)}><section className="info-sheet language-sheet" role="dialog" aria-modal="true" aria-label="ล็อกภาษาการพูด" onClick={(event) => event.stopPropagation()}><div className="memory-sheet-head"><div><small>LANGUAGE LOCK</small><h1>ภาษาการพูด</h1><p>ใช้ภาษาเดียวกันทั้งฟังเสียงและตอบด้วยเสียง</p></div><button type="button" onClick={() => setLanguageOpen(false)} aria-label="ปิด"><Icon name="close"/></button></div><div className="language-options">{LANGUAGE_OPTIONS.map((option) => <button key={option.code} type="button" className={speechLanguage === option.code ? "is-selected" : ""} onClick={() => { setSpeechLanguage(option.code); window.localStorage.setItem("vivian-speech-language", option.code); setLanguageOpen(false); }}><strong>{option.nativeName}</strong><span>{option.label} · {option.code.toUpperCase()}</span></button>)}</div></section></div>}
    {infoOpen && <div className="chat-backdrop" role="presentation" onClick={() => setInfoOpen(false)}><section className="info-sheet" role="dialog" aria-modal="true" aria-label="ข้อมูลเวอร์ชัน" onClick={(event) => event.stopPropagation()}><div className="memory-sheet-head"><div><small>VIVIAN INFO</small><h1>ข้อมูลเวอร์ชัน</h1><p>ข้อมูลของ companion เวอร์ชันที่กำลังใช้งาน</p></div><button type="button" onClick={() => setInfoOpen(false)} aria-label="ปิด"><Icon name="close"/></button></div><div className="info-list"><p><strong>App</strong>Vivian AI Companion</p><p><strong>Codename</strong>{APP_CODENAME}</p><p><strong>Version</strong>v1.0.0-stable</p><p><strong>Character</strong>Miss</p></div></section></div>}
  </main>;
}
