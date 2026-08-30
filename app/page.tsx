"use client";

import { useEffect, useRef, useState } from "react";

type IconName = "focus" | "wardrobe" | "trash" | "chevron" | "mic" | "video" | "clip" | "message" | "close" | "memory" | "sound";

function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    focus: <><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"/><circle cx="12" cy="12" r="3.4"/></>,
    wardrobe: <><path d="M12 3a3 3 0 0 1 3 3c0 1.4-1.1 2.3-2.4 2.8L4 14.2A2 2 0 0 0 5.1 18h13.8a2 2 0 0 0 1.1-3.8l-8.6-5.4"/><path d="M9 18v2M15 18v2"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></>,
    chevron: <path d="m5 9 7 7 7-7"/>,
    mic: <><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></>,
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
const greeting: Message = { from: "vivian", text: "สวัสดีค่ะ ฉันคือ Vivian วันนี้อยากให้ช่วยทำอะไรคะ?" };
const APP_CODENAME = "Stardust";
const WITCH_EXPRESSIONS = ["cw", "fz", "h", "hdj", "ku", "mz", "sq", "x", "xx", "yj", "zs1", "zs2"];

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modelRef = useRef<any>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const lipSyncFrameRef = useRef<number | null>(null);
  const reactionIndexRef = useRef(0);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([greeting]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [recording, setRecording] = useState(false);
  const [muted, setMuted] = useState(false);
  const [sending, setSending] = useState(false);
  const [sttPreview, setSttPreview] = useState<string | null>(null);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(true);
  const lastVivianMessage = messages.filter((item) => item.from === "vivian").at(-1)?.text ?? greeting.text;

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    void loadMemory();
    return () => window.removeEventListener("pointerdown", unlock);
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
        (window as any).PIXI = PIXI;
        (Live2DModel as any).registerTicker(PIXI.Ticker);
        app = new PIXI.Application({
          view: canvasRef.current,
          backgroundAlpha: 0,
          antialias: true,
          autoDensity: true,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
        });
        const model = await Live2DModel.from("/live2d/witch/witch.model3.json");
        if (disposed) return;
        modelRef.current = model;
        const bounds = model.getLocalBounds();
        resizeModel = () => {
          const stage = canvasRef.current?.parentElement?.getBoundingClientRect();
          if (!stage) return;
          const width = Math.max(1, Math.round(stage.width));
          const height = Math.max(1, Math.round(stage.height));
          app.renderer.resolution = Math.min(window.devicePixelRatio || 1, 2);
          app.renderer.resize(width, height);
          const scale = Math.min((width * (width > height ? .43 : .88)) / bounds.width, ((height - Math.min(124, height * .15)) * .88) / bounds.height);
          model.scale.set(scale);
          model.anchor.set(.5, 1);
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
      app?.destroy(true, { children: true });
      modelRef.current = null;
      stopLipSync();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function loadMemory() {
    try {
      const response = await fetch("/api/memory", { cache: "no-store" });
      const data = await response.json();
      if (Array.isArray(data.memories)) setMemories(data.memories);
      if (data.messages?.length) setMessages(data.messages.map((item: { role: string; content: string }) => ({ from: item.role === "user" ? "me" : "vivian", text: item.content })));
    } catch { /* Vivian stays usable while Supabase is unavailable. */ }
  }
  function unlockAudio() {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    audioContextRef.current ??= new AudioContextClass();
    if (audioContextRef.current.state === "suspended") void audioContextRef.current.resume();
    const audio = audioRef.current ?? new Audio();
    audio.setAttribute("playsinline", "true");
    audio.preload = "auto";
    audioRef.current = audio;
    audio.muted = true;
    void audio.play().then(() => {
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
    }).catch(() => { audio.muted = false; });
  }
  function setMouthOpen(value: number) {
    const coreModel = modelRef.current?.internalModel?.coreModel;
    if (!coreModel) return;
    try { coreModel.setParameterValueById("ParamMouthOpenY", Math.max(0, Math.min(1, value))); } catch (error) { console.warn("Live2D mouth parameter unavailable", error); }
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
  function startLipSync(audio: HTMLAudioElement) {
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
    let smoothed = 0;
    const update = () => {
      if (audio.paused || audio.ended) { setMouthOpen(0); lipSyncFrameRef.current = null; return; }
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) sum += Math.abs(sample - 128);
      const level = Math.min(1, (sum / samples.length / 128) * 3.4);
      smoothed += (level - smoothed) * .34;
      setMouthOpen(smoothed);
      lipSyncFrameRef.current = requestAnimationFrame(update);
    };
    lipSyncFrameRef.current = requestAnimationFrame(update);
  }
  async function speak(text: string): Promise<boolean> {
    if (muted) return false;
    let objectUrl: string | null = null;
    try {
      unlockAudio();
      const response = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      if (!response.ok) throw new Error("TTS failed");
      const audio = audioRef.current ?? new Audio();
      audioRef.current?.pause();
      if (audioRef.current?.src) audioRef.current.removeAttribute("src");
      objectUrl = URL.createObjectURL(await response.blob());
      audio.src = objectUrl;
      audio.setAttribute("playsinline", "true");
      audio.volume = 1;
      audio.onended = () => { stopLipSync(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
      audio.onerror = () => { stopLipSync(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
      audioRef.current = audio;
      startLipSync(audio);
      await audio.play();
      return true;
    } catch (error) {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resetReaction();
      console.error("TTS unavailable", error);
      return false;
    }
  }
  async function sendMessage(overrideText?: string) {
    const text = (overrideText ?? message).trim();
    if (!text || sending) return;
    const nextMessages = [...messages, { from: "me" as const, text }];
    setMessages(nextMessages);
    setMessage("");
    setSending(true);
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: nextMessages.map((item) => ({ role: item.from === "me" ? "user" : "assistant", content: item.text })) }) });
      const data = await response.json();
      if (!response.ok || !data.text) throw new Error(data.error ?? "Chat request failed");
      const reply = data.text;
      const audioStarted = await speak(reply);
      setMessages((current) => [...current, { from: "vivian", text: reply }]);
      void playReaction(reply, text);
      if (audioStarted) console.info("Vivian response synced with audio playback");
      if (data.memories) setMemories(data.memories);
    } catch {
      resetReaction();
      setMessages((current) => [...current, { from: "vivian", text: "ตอนนี้เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้งนะคะ" }]);
    } finally { setSending(false); }
  }
  async function playReaction(reply: string, userText: string) {
    const model = modelRef.current;
    if (!model) return;
    const combined = `${reply} ${userText}`;
    const expression = /เศร้า|เสียใจ|ร้องไห้|ขอโทษ|sad|sorry|cry/i.test(combined) ? "sq"
      : /โกรธ|โมโห|หงุดหงิด|angry|mad/i.test(combined) ? "ku"
      : /ตกใจ|ว้าว|จริงเหรอ|surprise|wow/i.test(combined) ? "fz"
      : /เขิน|อาย|น่ารัก|ชม|cute|shy/i.test(combined) ? "zs1"
      : /รัก|ชอบ|กอด|love|like|hug/i.test(combined) ? "x"
      : /ขำ|ตลก|เล่น|แกล้ง|มุก|haha|fun/i.test(combined) ? "cw"
      : /จุ๊บ|จูบ|kiss/i.test(combined) ? "xx"
      : /ยิ้ม|ดีใจ|เยี่ยม|happy|great/i.test(combined) ? "yj"
      : /ตา|มอง|กระพริบ|หลับตา|eyes|look|blink/i.test(combined) ? "hdj"
      : WITCH_EXPRESSIONS[reactionIndexRef.current++ % WITCH_EXPRESSIONS.length];
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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: BlobPart[] = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
      recorder.onstop = async () => {
        const form = new FormData();
        form.append("file", new Blob(chunks, { type: recorder.mimeType || "audio/webm" }), "vivian-recording.webm");
        try {
          const response = await fetch("/api/stt", { method: "POST", body: form });
          const data = await response.json();
          if (data.text) {
            setSttPreview(data.text);
            void sendMessage(data.text);
            window.setTimeout(() => setSttPreview(null), 5000);
          }
        } finally { recorderRef.current = null; streamRef.current = null; }
      };
      recorder.start();
      recorderRef.current = recorder;
      streamRef.current = stream;
      setRecording(true);
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
    setRecording(false);
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
    <section className="companion-stage" aria-label="Vivian companion">
      <canvas className="live2d-canvas" ref={canvasRef} />
      <header className="companion-brand"><span className="brand-mark" aria-hidden="true"/><span>Vivian</span></header>
      {sttPreview && <div className="speech-preview"><small>You said</small>{sttPreview}</div>}
      <output className="vivian-speech" aria-live="polite">{sending ? "กำลังคิดอยู่ค่ะ..." : lastVivianMessage}</output>
      <aside className={`side-tools ${toolsOpen ? "is-open" : ""}`} aria-label="เครื่องมือ Vivian">
        <button type="button" onClick={() => window.dispatchEvent(new Event("resize"))} aria-label="จัด Vivian ให้อยู่กึ่งกลาง"><Icon name="focus"/></button>
        <button type="button" onClick={() => setMemoryOpen(true)} aria-label="จัดการความทรงจำ"><Icon name="wardrobe"/></button>
        <button type="button" onClick={() => void clearConversation()} aria-label="ล้างบทสนทนา"><Icon name="trash"/></button>
        <button className="tool-expand" type="button" onClick={() => setToolsOpen((current) => !current)} aria-label={toolsOpen ? "ซ่อนเครื่องมือ" : "แสดงเครื่องมือ"}><Icon name="chevron"/></button>
      </aside>
      <form className="companion-input" onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}>
        <button className={`circle-control ${recording ? "is-recording" : ""}`} type="button" onPointerDown={() => void startRecording()} onPointerUp={stopRecording} onPointerCancel={stopRecording} onPointerLeave={(event) => event.buttons > 0 && stopRecording()} aria-label={recording ? "ปล่อยเพื่อส่ง" : "กดค้างเพื่อพูด"}><Icon name="mic"/></button>
        <button className="circle-control is-disabled" type="button" disabled aria-label="กล้องจะมาในภายหลัง"><Icon name="video"/></button>
        <button className="circle-control is-disabled" type="button" disabled aria-label="ไฟล์แนบจะมาในภายหลัง"><Icon name="clip"/></button>
        <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder={recording ? "กำลังฟัง..." : "Ask Vivian"} aria-label="ข้อความถึง Vivian" />
        <button className="text-send" type="submit" disabled={!message.trim() || sending}><Icon name="message" size={23}/><span>{sending ? "..." : "Text"}</span></button>
      </form>
    </section>
    {memoryOpen && <section className="memory-sheet" role="dialog" aria-modal="true" aria-label="ความทรงจำของ Vivian">
      <div className="memory-sheet-head"><div><small>VIVIAN MEMORY</small><h1>ความทรงจำ</h1><p>สิ่งที่ Vivian ใช้จำเพื่อคุยกับคุณให้ต่อเนื่อง</p></div><button type="button" onClick={() => setMemoryOpen(false)} aria-label="ปิด"><Icon name="close"/></button></div>
      <div className="memory-list">{memories.length ? memories.map((memory) => <article key={memory.id}><Icon name="memory" size={18}/><p><strong>{memory.category}</strong>{memory.memory}</p><button type="button" onClick={() => void deleteMemory(memory.id)} aria-label="ลบความทรงจำ"><Icon name="trash" size={17}/></button></article>) : <p className="empty-memory">ยังไม่มีความทรงจำถาวรค่ะ Vivian จะจำเฉพาะเรื่องสำคัญที่คุณเล่า</p>}</div>
      <div className="memory-sheet-foot"><button type="button" onClick={() => setMuted((value) => !value)}><Icon name="sound" size={18}/>{muted ? "เปิดเสียงตอบ" : "ปิดเสียงตอบ"}</button><span className="codename">CODENAME: {APP_CODENAME}</span><button type="button" className="close-sheet" onClick={() => setMemoryOpen(false)}>เสร็จ</button></div>
    </section>}
  </main>;
}
