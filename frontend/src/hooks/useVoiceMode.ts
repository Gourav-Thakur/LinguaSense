"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface VoiceOption {
  uri: string;
  name: string;
  lang: string;
}

export type SttLanguage = "auto" | "en" | "hi" | "kn";

interface UseVoiceMode {
  supported: boolean;
  enabled: boolean;
  pushing: boolean;
  speaking: boolean;
  processing: boolean;
  level: number;
  voices: VoiceOption[];
  voiceURI: string | null;
  setVoiceURI: (uri: string) => void;
  language: SttLanguage;
  setLanguage: (l: SttLanguage) => void;
  setEnabled: (v: boolean) => void;
  pushStart: () => Promise<void>;
  pushEnd: () => void;
  speak: (text: string) => void;
  cancelSpeech: () => void;
  errorMessage: string | null;
}

interface Options {
  onFinalTranscript: (text: string, language: string | null) => void;
  transcribeUrl?: string;
}

const PREFERRED_VOICE_NAMES = [
  "Ava (Premium)", "Ava (Enhanced)", "Ava",
  "Allison (Premium)", "Allison (Enhanced)", "Allison",
  "Samantha (Premium)", "Samantha (Enhanced)", "Samantha",
  "Karen (Premium)", "Karen (Enhanced)", "Karen",
  "Tessa", "Moira",
  "Microsoft Aria", "Microsoft Jenny", "Microsoft Zira", "Microsoft Hazel",
  "Google UK English Female", "Google US English",
];

function pickPreferredVoice(all: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!all.length) return null;
  const english = all.filter((v) => v.lang && v.lang.toLowerCase().startsWith("en"));
  const pool = english.length ? english : all;
  for (const fragment of PREFERRED_VOICE_NAMES) {
    const hit = pool.find((v) => v.name.includes(fragment));
    if (hit) return hit;
  }
  return pool[0] ?? null;
}

function pickLocaleVoice(
  all: SpeechSynthesisVoice[],
  langPrefix: string,
  preferredNames: string[],
): SpeechSynthesisVoice | null {
  const localized = all.filter((v) => v.lang?.toLowerCase().startsWith(langPrefix));
  for (const name of preferredNames) {
    const hit = localized.find((v) => v.name.includes(name));
    if (hit) return hit;
  }
  return localized[0] ?? null;
}

const HINDI_PREFERRED = ["Lekha", "Microsoft Heera", "Microsoft Kalpana"];
const KANNADA_PREFERRED = ["Soumya", "Microsoft"];

function detectScript(text: string): "devanagari" | "kannada" | "latin" {
  if (/[ऀ-ॿ]/.test(text)) return "devanagari";
  if (/[ಀ-೿]/.test(text)) return "kannada";
  return "latin";
}

function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m));
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useVoiceMode({
  onFinalTranscript,
  transcribeUrl = "/api/transcribe",
}: Options): UseVoiceMode {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabledState] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [level, setLevel] = useState(0);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [voiceURI, setVoiceURI] = useState<string | null>(null);
  const [language, setLanguage] = useState<SttLanguage>("auto");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderMimeRef = useRef<string | undefined>(undefined);
  const chunksRef = useRef<Blob[]>([]);
  const meterTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const enabledRef = useRef(false);
  const pushingRef = useRef(false);
  const speakingRef = useRef(false);
  const sendingRef = useRef(false);
  const languageRef = useRef<SttLanguage>("auto");
  useEffect(() => { languageRef.current = language; }, [language]);

  const synthVoicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const onFinalRef = useRef(onFinalTranscript);
  useEffect(() => { onFinalRef.current = onFinalTranscript; }, [onFinalTranscript]);

  // ---- Capability detection ---------------------------------------------
  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as any;
    const ok =
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== "undefined" &&
      !!w.speechSynthesis;
    setSupported(ok);
  }, []);

  // ---- TTS voice list ---------------------------------------------------
  useEffect(() => {
    if (typeof window === "undefined") return;
    const synth: SpeechSynthesis | undefined = (window as any).speechSynthesis;
    if (!synth) return;

    const refresh = () => {
      const list = synth.getVoices();
      synthVoicesRef.current = list;
      setVoices(list.map((v) => ({ uri: v.voiceURI, name: v.name, lang: v.lang })));
      setVoiceURI((current) => {
        if (current && list.some((v) => v.voiceURI === current)) return current;
        const picked = pickPreferredVoice(list);
        return picked?.voiceURI ?? null;
      });
    };

    refresh();
    synth.addEventListener?.("voiceschanged", refresh);
    return () => synth.removeEventListener?.("voiceschanged", refresh);
  }, []);

  // ---- Mic stream lifecycle (opened lazily on first push) ----------------

  const ensureStream = useCallback(async () => {
    if (streamRef.current) return streamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    streamRef.current = stream;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioCtxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    analyserRef.current = analyser;
    recorderMimeRef.current = pickRecorderMime();

    // Mic-level meter while pushing.
    if (meterTimerRef.current) clearInterval(meterTimerRef.current);
    const buf = new Uint8Array(analyser.fftSize);
    meterTimerRef.current = setInterval(() => {
      if (!pushingRef.current) { setLevel(0); return; }
      analyser.getByteTimeDomainData(buf);
      let s = 0;
      for (let i = 0; i < buf.length; i++) {
        const n = (buf[i] - 128) / 128;
        s += n * n;
      }
      setLevel(Math.sqrt(s / buf.length));
    }, 60);

    return stream;
  }, []);

  const teardownStream = useCallback(() => {
    if (meterTimerRef.current) {
      clearInterval(meterTimerRef.current);
      meterTimerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch { /* ignore */ }
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    setLevel(0);
  }, []);

  // ---- Sending recorded audio --------------------------------------------

  const sendForTranscription = useCallback(
    async (blob: Blob) => {
      if (!blob.size) return;
      sendingRef.current = true;
      setProcessing(true);
      try {
        const fd = new FormData();
        const ext = (recorderMimeRef.current || "audio/webm").includes("mp4") ? "mp4" : "webm";
        fd.append("audio", blob, `utterance.${ext}`);
        fd.append("language", languageRef.current);
        const res = await fetch(transcribeUrl, { method: "POST", body: fd });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          const detail = body?.error || body?.detail;
          throw new Error(detail || `transcribe failed: ${res.status}`);
        }
        const data = (await res.json()) as { text: string; language?: string };
        const text = (data.text || "").trim();
        if (text) {
          const detected = data.language?.toLowerCase();
          const lang =
            detected === "en" || detected === "hi" || detected === "kn" ? detected : null;
          onFinalRef.current(text, lang);
        }
      } catch (exc: any) {
        console.warn("transcribe error:", exc?.message || exc);
        setErrorMessage(exc?.message || "Transcription failed");
        setTimeout(() => setErrorMessage(null), 3500);
      } finally {
        sendingRef.current = false;
        setProcessing(false);
      }
    },
    [transcribeUrl],
  );

  // ---- Push-to-talk actions ----------------------------------------------

  const pushStart = useCallback(async () => {
    if (!enabledRef.current) return;
    if (pushingRef.current) return;
    if (speakingRef.current) {
      // Holding talk while the agent is speaking interrupts the agent
      // (caller wants to break in). Cancel TTS, then start recording.
      try { (window as any).speechSynthesis?.cancel(); } catch { /* ignore */ }
      speakingRef.current = false;
      setSpeaking(false);
    }
    setErrorMessage(null);
    try {
      await ensureStream();
    } catch (exc: any) {
      setErrorMessage("Could not access the microphone. Check the browser permission.");
      console.warn("getUserMedia failed:", exc?.message || exc);
      return;
    }
    const stream = streamRef.current;
    if (!stream) return;

    chunksRef.current = [];
    const mime = recorderMimeRef.current;
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mime || "audio/webm" });
      chunksRef.current = [];
      void sendForTranscription(blob);
    };
    rec.start();
    recorderRef.current = rec;
    pushingRef.current = true;
    setPushing(true);
  }, [ensureStream, sendForTranscription]);

  const pushEnd = useCallback(() => {
    if (!pushingRef.current) return;
    pushingRef.current = false;
    setPushing(false);
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      try { rec.stop(); } catch { /* ignore */ }
    }
    recorderRef.current = null;
  }, []);

  // ---- Spacebar global shortcut (only while voice mode is enabled) ------

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      if (e.repeat) return; // ignore key auto-repeat
      if (isTypingTarget(e.target)) return;
      e.preventDefault(); // stop the page from scrolling
      void pushStart();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      pushEnd();
    };
    // Release if the window loses focus mid-press (otherwise mic stays hot)
    const onBlur = () => pushEnd();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [enabled, pushStart, pushEnd]);

  const setEnabled = useCallback((v: boolean) => {
    enabledRef.current = v;
    setEnabledState(v);
    if (!v) {
      pushEnd();
      teardownStream();
    }
  }, [pushEnd, teardownStream]);

  // ---- TTS ---------------------------------------------------------------

  const cancelSpeech = useCallback(() => {
    if (typeof window === "undefined") return;
    const synth: SpeechSynthesis | undefined = (window as any).speechSynthesis;
    synth?.cancel();
    speakingRef.current = false;
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !text) return;
      const synth: SpeechSynthesis | undefined = (window as any).speechSynthesis;
      if (!synth) return;

      synth.cancel();
      const utter = new (window as any).SpeechSynthesisUtterance(text);

      const script = detectScript(text);
      let voice: SpeechSynthesisVoice | null = null;
      let fallbackLang = "en-IN";
      if (script === "devanagari") {
        voice = pickLocaleVoice(synthVoicesRef.current, "hi", HINDI_PREFERRED);
        fallbackLang = "hi-IN";
      } else if (script === "kannada") {
        voice = pickLocaleVoice(synthVoicesRef.current, "kn", KANNADA_PREFERRED);
        fallbackLang = "kn-IN";
      } else {
        voice = synthVoicesRef.current.find((v) => v.voiceURI === voiceURI) ?? null;
      }
      if (voice) {
        utter.voice = voice;
        utter.lang = voice.lang;
      } else {
        utter.lang = fallbackLang;
      }
      utter.rate = 1.0;
      utter.pitch = 1.05;

      utter.onstart = () => {
        speakingRef.current = true;
        setSpeaking(true);
      };
      const finish = () => {
        speakingRef.current = false;
        setSpeaking(false);
      };
      utter.onend = finish;
      utter.onerror = finish;
      synth.speak(utter);
    },
    [voiceURI],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      pushEnd();
      teardownStream();
    };
  }, [pushEnd, teardownStream]);

  return {
    supported,
    enabled,
    pushing,
    speaking,
    processing,
    level,
    voices,
    voiceURI,
    setVoiceURI,
    language,
    setLanguage,
    setEnabled,
    pushStart,
    pushEnd,
    speak,
    cancelSpeech,
    errorMessage,
  };
}
