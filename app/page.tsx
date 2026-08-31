"use client";

import { useEffect, useRef, useState } from "react";
import { type CompanionState, defaultCompanionState, isMood, moodLabel, type Mood } from "@/lib/companion";

type IconName = "focus" | "wardrobe" | "trash" | "chevron" | "mic" | "micOff" | "video" | "clip" | "message" | "close" | "memory" | "sound";

function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    focus: <><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"/><circle cx="12" cy="12" r="3.4"/></>,
    wardrobe: <><path d="M12 3a3 3 0 0 1 3 3c0 1.4-1.1 2.3-2.4 2.8L4 14.2A2 2 0 0 0 5.1 18h13.8a2 2 0 0 0 1.1-3.8l-8.6-5.4"/><path d="M9 18v2M15 18v2"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></>,
    chevron: <path d="m5 9 7 7 7-7"/>,
    mic: <><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></>,
    micOff: <><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6M4 4l16 16"/></>,
    video: <><rect x="3" y="6" width="12" height="12" rx="3"/><path d="m15 10 5-3v10l-5-3"/></>,
    clip: <path d="m8.5 12.5 5.9-5.9a3.5 3.5 0 0 1 5 5l-7.8 7.8a5 5 0 0 1-7.1-7.1l7.3-7.3"/>,
    message: <path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8.5 8.5 0 0 1-3.6-.8L4 20l1.3-4A7.2 7.2 0 0 1 4 11.5 7.5 7.5 0 0 1 12 4a7.5 7.5 0 0 1 8 7.5Z"/>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
    memory: <><path d="M20 12c0 4.4-3.6 8-8 8s-8-3.6-8-8 3.6-8 8-8 8 3.6 8 8Z"/><path d="M12 8v4l2.8 1.8"/></>,
    sound: <><path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="M16 9a4 4 0 0 1 0 6"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

type Message = { from: "me" | "vivian"; text: string };
type Memory = { id: number; memory: string; category: string; importance: number };
type ModelKey = "薇薇安" | "魔女" | "Miss";
const MODEL_CONFIG: Record<ModelKey, { reading: string; path: string; mobilePath: string; expressions: string[]; background: string }> = {
  "薇薇安": { reading: "Wēi wēi ān", path: "/live2d/薇薇安/薇薇安.model3.json", mobilePath: "/live2d/薇薇安-mobile/薇薇安.model3.json", expressions: ["哭", "黑脸", "慌张", "害羞", "白眼", "伞关闭"], background: "vivian-bg" },
  "魔女": { reading: "Majo", path: "/live2d/魔女/魔女.model3.json", mobilePath: "/live2d/魔女-mobile/魔女.model3.json", expressions: ["cw", "fz", "h", "hdj", "ku", "mz", "sq", "x", "xx", "yj", "zs1", "zs2"], background: "witch-bg" },
  "Miss": { reading: "Miss", path: "/live2d/Miss/Miss.model3.json", mobilePath: "/live2d/Miss-mobile/Miss.model3.json", expressions: ["#", "M ###", "M ##", "M QAQ", "M lianhong", "M love", "M miyan", "M nu", "M wenhao ", "M xingxing", "M xingxing2", "S chabei", "S shouji", "T faxing", "X shetou"], background: "witch-bg" },
};
const greetings = [
  "สวัสดีค่ะ วันนี้อยากคุยกับ Vivian เรื่องอะไรดีคะ?",
  "อ๊ะ... กลับมาแล้วเหรอคะ ยินดีต้อนรับสู่ New Session นะคะ",
  "สวัสดีค่ะ ฉันพร้อมฟังคุณเสมอ วันนี้เป็นยังไงบ้างคะ?",
  "คุณมาแล้ว... ดีจังค่ะ Vivian กำลังรอคุยอยู่พอดีเลย",
  "Hello... เอ๊ะ ไม่สิ สวัสดีค่ะ วันนี้ให้ฉันช่วยอะไรดีคะ?",
  "เริ่มบทสนทนาใหม่กันนะคะ ถ้ามีอะไรอยากเล่า Vivian ฟังอยู่ค่ะ",
];
const greeting = (): Message => ({ from: "vivian", text: greetings[Math.floor(Math.random() * greetings.length)] });
const APP_CODENAME = "Columbina";
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
  const reactionIndexRef = useRef(0);
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
  const [chatOpen, setChatOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(true);
  const [selectedModel, setSelectedModel] = useState<ModelKey>("薇薇安");
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [companion, setCompanion] = useState<CompanionState>(defaultCompanionState());
  const lastVivianMessage = messages.filter((item) => item.from === "vivian").at(-1)?.text ?? initialGreeting.current.text;
  messagesRef.current = messages;
  sendingRef.current = sending;
  companionRef.current = companion;

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
    let app: any;
    let resizeModel = () => {};
    let queueResize = () => {};
    let handleOrientationChange = () => {};
    let resizeFrame: number | undefined;
    let resizeTimeout: number | undefined;
    let disposed = false;
    void (async () => {
      try {
        const PIXI = await import("pixi.js");
        const { Live2DModel } = await import("pixi-live2d-display/cubism4");
        if (!canvasRef.current || disposed) return;
        const isAppleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
        (window as any).PIXI = PIXI;
        (Live2DModel as any).registerTicker(PIXI.Ticker);
        app = pixiAppRef.current;
        if (!app) {
          app = new PIXI.Application({
            view: canvasRef.current,
            backgroundAlpha: 0,
            antialias: !isAppleMobile,
            autoDensity: true,
            resolution: isAppleMobile ? 1 : Math.min(window.devicePixelRatio || 1, 2),
          });
          // Keep iPad/iPhone responsive and avoid WebKit GPU pressure while
          // preserving the full-quality renderer on desktop WebGL.
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
        const model = await Live2DModel.from(isAppleMobile ? modelConfig.mobilePath : modelConfig.path);
        if (disposed) return;
        modelRef.current = model;
        const bounds = model.getLocalBounds();
        resizeModel = () => {
          const stage = canvasRef.current?.parentElement?.getBoundingClientRect();
          if (!stage) return;
          const width = Math.max(1, Math.round(stage.width));
          const height = Math.max(1, Math.round(stage.height));
          app.renderer.resolution = isAppleMobile ? 1 : Math.min(window.devicePixelRatio || 1, 2);
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
  }, [selectedModel]);

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
      if (data.messages?.length) setHistoryMessages(data.messages.map((item: { role: string; content: string }) => ({ from: item.role === "user" ? "me" : "vivian", text: item.content })));
      const next = normalizeCompanion(data.companion);
      if (next) setCompanion(next);
    } catch { /* Vivian stays usable while Supabase is unavailable. */ }
  }
  function normalizeCompanion(raw: unknown): CompanionState | null {
    if (!raw || typeof raw !== "object") return null;
    const item = raw as Record<string, unknown>;
    const mood = String(item.mood ?? "calm");
    return {
      affinity: Number(item.affinity ?? 22),
      trust: Number(item.trust ?? 18),
      familiarity: Number(item.familiarity ?? 8),
      mood: isMood(mood) ? mood : "calm",
      moodIntensity: Number(item.moodIntensity ?? item.mood_intensity ?? 35),
      conversationSummary: String(item.conversationSummary ?? item.conversation_summary ?? ""),
      lastIdleAt: typeof item.lastIdleAt === "string" ? item.lastIdleAt : typeof item.last_idle_at === "string" ? item.last_idle_at : null,
      lastInteractionAt: typeof item.lastInteractionAt === "string" ? item.lastInteractionAt : typeof item.last_interaction_at === "string" ? item.last_interaction_at : null,
    };
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
      const response = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, signal: abort.signal, body: JSON.stringify({ text }) });
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
  async function sendMessage(overrideText?: string, options: { idle?: boolean } = {}) {
    const idle = Boolean(options.idle);
    const text = (overrideText ?? message).trim();
    if (sendingRef.current) return;
    if (!idle && !text) return;
    if (speakingRef.current) stopSpeech();
    markActivity();
    if (!idle) interactedRef.current = true;
    const nextMessages = idle ? messagesRef.current : [...messagesRef.current, { from: "me" as const, text }];
    if (!idle) {
      setMessages(nextMessages);
      setMessage("");
    }
    setSending(true);
    sendingRef.current = true;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortAfter(CHAT_TIMEOUT_MS),
        body: JSON.stringify({
          mode: idle ? "idle" : "chat",
          messages: nextMessages.map((item) => ({ role: item.from === "me" ? "user" : "assistant", content: item.text })),
          character: selectedModel,
        }),
      });
      const data = await withTimeout(response.json() as Promise<{ text?: string; error?: string; memories?: Memory[]; companion?: CompanionState }>, 5000, null);
      if (!response.ok || !data?.text) throw new Error(data?.error ?? "Chat request failed");
      const reply = data.text;
      // Do not reveal the reply bubble before Fish Audio has started. This
      // keeps the visible text and spoken response arriving together.
      if (!muted) await speak(reply);
      setMessages((current) => [...current, { from: "vivian", text: reply }]);
      const nextCompanion = normalizeCompanion(data.companion);
      if (nextCompanion) setCompanion(nextCompanion);
      if (data.memories?.length) setMemories(data.memories.filter((item: Memory) => typeof item.id === "number"));
      setSending(false);
      sendingRef.current = false;
      void playReaction(reply, text, idle);
    } catch (error) {
      console.error("Vivian response unavailable", error);
      resetReaction();
      if (!idle) setMessages((current) => [...current, { from: "vivian", text: "ตอนนี้เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้งนะคะ" }]);
    } finally {
      setSending(false);
      sendingRef.current = false;
    }
  }
  function moodExpression(mood: Mood) {
    const map: Record<Mood, string> = selectedModel === "薇薇安"
      ? { calm: "伞关闭", warm: "害羞", playful: "白眼", shy: "害羞", tired: "哭", melancholy: "哭" }
      : selectedModel === "Miss"
        ? { calm: "M miyan", warm: "M love", playful: "M xingxing", shy: "M QAQ", tired: "M wenhao ", melancholy: "M nu" }
        : { calm: "h", warm: "yj", playful: "cw", shy: "zs1", tired: "hdj", melancholy: "sq" };
    return map[mood];
  }
  async function playReaction(reply: string, userText: string, idle = false) {
    const model = modelRef.current;
    if (!model) return;
    const combined = `${reply} ${userText}`;
    const fallbackExpression = idle ? moodExpression(companionRef.current.mood) : MODEL_CONFIG[selectedModel].expressions[reactionIndexRef.current++ % MODEL_CONFIG[selectedModel].expressions.length];
    const expression = selectedModel === "薇薇安"
      ? (/เศร้า|เสียใจ|ร้องไห้|ขอโทษ|sad|sorry|cry/i.test(combined) ? "哭"
        : /โกรธ|โมโห|หงุดหงิด|angry|mad/i.test(combined) ? "黑脸"
        : /ตกใจ|ว้าว|จริงเหรอ|surprise|wow/i.test(combined) ? "慌张"
        : /เขิน|อาย|น่ารัก|ชม|cute|shy/i.test(combined) ? "害羞"
        : /ยิ้ม|ดีใจ|เยี่ยม|happy|great/i.test(combined) ? "白眼"
        : fallbackExpression)
      : selectedModel === "Miss"
        ? (/เศร้า|เสียใจ|ร้องไห้|ขอโทษ|sad|sorry|cry/i.test(combined) ? "M QAQ"
          : /โกรธ|โมโห|หงุดหงิด|angry|mad/i.test(combined) ? "M nu"
          : /ตกใจ|ว้าว|จริงเหรอ|surprise|wow/i.test(combined) ? "M wenhao "
          : /เขิน|อาย|น่ารัก|ชม|cute|shy/i.test(combined) ? "M love"
          : /รัก|ชอบ|กอด|love|like|hug/i.test(combined) ? "M lianhong"
          : /ขำ|ตลก|เล่น|แกล้ง|มุก|haha|fun/i.test(combined) ? "M xingxing"
          : /จุ๊บ|จูบ|kiss/i.test(combined) ? "X shetou"
          : /ยิ้ม|ดีใจ|เยี่ยม|happy|great/i.test(combined) ? "M miyan"
          : /ตา|มอง|กระพริบ|หลับตา|eyes|look|blink/i.test(combined) ? "M ###"
          : fallbackExpression)
        : (/เศร้า|เสียใจ|ร้องไห้|ขอโทษ|sad|sorry|cry/i.test(combined) ? "sq"
        : /โกรธ|โมโห|หงุดหงิด|angry|mad/i.test(combined) ? "ku"
        : /ตกใจ|ว้าว|จริงเหรอ|surprise|wow/i.test(combined) ? "fz"
        : /เขิน|อาย|น่ารัก|ชม|cute|shy/i.test(combined) ? "zs1"
        : /รัก|ชอบ|กอด|love|like|hug/i.test(combined) ? "x"
        : /ขำ|ตลก|เล่น|แกล้ง|มุก|haha|fun/i.test(combined) ? "cw"
        : /จุ๊บ|จูบ|kiss/i.test(combined) ? "xx"
        : /ยิ้ม|ดีใจ|เยี่ยม|happy|great/i.test(combined) ? "yj"
        : /ตา|มอง|กระพริบ|หลับตา|eyes|look|blink/i.test(combined) ? "hdj"
        : fallbackExpression);
    try {
      if (expression) await model.expression(expression);
      const idleMotion = model.internalModel?.motionManager?.definitions?.Idle;
      if (idleMotion?.length) await model.motion("Idle", 0, 3);
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
          // Resume listening after this utterance has been handed to STT.
          window.setTimeout(() => { if (micEnabledRef.current && !recordingRef.current) void startRecording(); }, 250);
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
  async function clearConversation() {
    await fetch("/api/memory", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "conversation" }) }).catch(() => undefined);
    setMessages([{ from: "vivian", text: "เริ่มบทสนทนาใหม่แล้วค่ะ" }]);
  }
  async function deleteMemory(id: number) {
    const response = await fetch("/api/memory", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "memory", id }) });
    if (response.ok) setMemories((current) => current.filter((memory) => memory.id !== id));
  }

  return <main className="companion-shell">
    <section className={`companion-stage ${MODEL_CONFIG[selectedModel].background}`} aria-label="Vivian companion">
      <canvas className="live2d-canvas" ref={canvasRef} />
      <header className="companion-brand"><span className="brand-mark" aria-hidden="true"/><span>Vivian</span></header>
      {sttPreview && <div className="speech-preview"><small>You said</small>{sttPreview}</div>}
      <output className="vivian-speech" aria-live="polite">{sending ? "กำลังคิดอยู่ค่ะ..." : lastVivianMessage}</output>
      <aside className={`side-tools ${toolsOpen ? "is-open" : ""}`} aria-label="เครื่องมือ Vivian">
        <button type="button" onClick={() => window.dispatchEvent(new Event("resize"))} aria-label="จัด Vivian ให้อยู่กึ่งกลาง"><Icon name="focus"/></button>
        <button type="button" onClick={() => setModelMenuOpen((current) => !current)} aria-label="เปลี่ยนโมเดล" aria-expanded={modelMenuOpen}><Icon name="wardrobe"/></button>
        <button type="button" onClick={() => setMemoryOpen(true)} aria-label="จัดการความทรงจำ"><Icon name="memory"/></button>
        <button type="button" onClick={() => void clearConversation()} aria-label="ล้างบทสนทนา"><Icon name="trash"/></button>
        <button className="tool-expand" type="button" onClick={() => setToolsOpen((current) => !current)} aria-label={toolsOpen ? "ซ่อนเครื่องมือ" : "แสดงเครื่องมือ"}><Icon name="chevron"/></button>
      </aside>
      {modelMenuOpen && <div className="model-menu" role="dialog" aria-label="เลือกโมเดล">
        <small>MODEL</small>
        {(Object.keys(MODEL_CONFIG) as ModelKey[]).map((key) => <button key={key} type="button" className={selectedModel === key ? "is-selected" : ""} onClick={() => { setSelectedModel(key); setModelMenuOpen(false); }}><strong>{key}</strong><span>({MODEL_CONFIG[key].reading})</span></button>)}
      </div>}
      <form className="companion-input" onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}>
        <button className={`circle-control ${recording ? "is-recording" : "is-muted"}`} type="button" onClick={toggleRecording} aria-pressed={recording} aria-label={recording ? "Mute microphone" : "Microphone muted, click to unmute"}><Icon name={recording ? "mic" : "micOff"}/></button>
        <button className="circle-control is-disabled" type="button" disabled aria-label="กล้องจะมาในภายหลัง"><Icon name="video"/></button>
        <button className="circle-control is-disabled" type="button" disabled aria-label="ไฟล์แนบจะมาในภายหลัง"><Icon name="clip"/></button>
        <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder={recording ? "กำลังฟัง... กดไมค์เพื่อ Mute" : "Ask Vivian"} aria-label="ข้อความถึง Vivian" />
        <button className="text-send" type="button" onClick={() => setChatOpen(true)}><Icon name="message" size={23}/><span>Chat</span></button>
      </form>
    </section>
    {chatOpen && <div className="chat-backdrop" role="presentation" onClick={() => setChatOpen(false)}>
      <section className="chat-sheet" role="dialog" aria-modal="true" aria-label="ประวัติแชตกับ Vivian" onClick={(event) => event.stopPropagation()}>
        <div className="chat-sheet-head"><div><small>VIVIAN CHAT</small><h1>ประวัติแชต</h1><p>บทสนทนาทั้งหมดของคุณกับ Vivian</p></div><button type="button" onClick={() => setChatOpen(false)} aria-label="ปิด"><Icon name="close"/></button></div>
        <div className="chat-history">{[...historyMessages, ...messages].map((item, index) => <div className={`chat-message ${item.from}`} key={`${item.from}-${index}`}><small>{item.from === "me" ? "คุณ" : "Vivian"}</small><p>{item.text}</p></div>)}</div>
      </section>
    </div>}
    {memoryOpen && <section className="memory-sheet" role="dialog" aria-modal="true" aria-label="ความทรงจำของ Vivian">
      <div className="memory-sheet-head"><div><small>VIVIAN MEMORY</small><h1>ความทรงจำ</h1><p>สิ่งที่ Vivian ใช้จำเพื่อคุยกับคุณให้ต่อเนื่อง</p></div><button type="button" onClick={() => setMemoryOpen(false)} aria-label="ปิด"><Icon name="close"/></button></div>
      <div className="bond-panel" aria-label="ความสัมพันธ์กับ Vivian">
        <p><strong>อารมณ์พื้นฐาน</strong>{moodLabel(companion.mood)}</p>
        {[["ความสนิท", companion.affinity], ["ความไว้ใจ", companion.trust], ["ความคุ้นเคย", companion.familiarity]].map(([label, value]) => (
          <div key={String(label)}><span>{label}</span><i><b style={{ width: `${value}%` }} /></i><em>{value}</em></div>
        ))}
      </div>
      <div className="memory-list">{memories.length ? memories.map((memory) => <article key={memory.id}><Icon name="memory" size={18}/><p><strong>{memory.category}</strong>{memory.memory}</p><button type="button" onClick={() => void deleteMemory(memory.id)} aria-label="ลบความทรงจำ"><Icon name="trash" size={17}/></button></article>) : <p className="empty-memory">ยังไม่มีความทรงจำถาวรค่ะ Vivian จะจำเฉพาะเรื่องสำคัญที่คุณเล่า</p>}</div>
      <div className="memory-sheet-foot"><button type="button" onClick={() => setMuted((value) => !value)}><Icon name="sound" size={18}/>{muted ? "เปิดเสียงตอบ" : "ปิดเสียงตอบ"}</button><span className="codename">CODENAME: {APP_CODENAME}</span><button type="button" className="close-sheet" onClick={() => setMemoryOpen(false)}>เสร็จ</button></div>
    </section>}
  </main>;
}
