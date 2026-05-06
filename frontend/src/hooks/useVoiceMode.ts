"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */
// SpeechSynthesis is in the standard DOM types; SpeechRecognition isn't (we
// don't use it any more — STT is now server-side via Whisper).

export interface VoiceOption {
  uri: string;
  name: string;
  lang: string;
}

export type SttLanguage = "auto" | "en" | "hi" | "kn";

interface UseVoiceMode {
  supported: boolean;
  active: boolean;
  listening: boolean;
  speaking: boolean;
  processing: boolean;
  level: number; // 0..1, mic input level for the meter
  voices: VoiceOption[];
  voiceURI: string | null;
  setVoiceURI: (uri: string) => void;
  language: SttLanguage;
  setLanguage: (l: SttLanguage) => void;
  start: () => Promise<void>;
  stop: () => void;
  speak: (text: string) => void;
  cancelSpeech: () => void;
  errorMessage: string | null;
}

interface Options {
  onFinalTranscript: (text: string, language: string | null) => void;
  transcribeUrl?: string;
}

// Detect the script of a string. Used to pick a matching TTS voice for the
// agent's reply when the LLM responds in Hindi or Kannada.
function detectScript(text: string): "devanagari" | "kannada" | "latin" {
  if (/[ऀ-ॿ]/.test(text)) return "devanagari";
  if (/[ಀ-೿]/.test(text)) return "kannada";
  return "latin";
}

const PREFERRED_VOICE_NAMES = [
  "Ava (Premium)",
  "Ava (Enhanced)",
  "Ava",
  "Allison (Premium)",
  "Allison (Enhanced)",
  "Allison",
  "Samantha (Premium)",
  "Samantha (Enhanced)",
  "Samantha",
  "Karen (Premium)",
  "Karen (Enhanced)",
  "Karen",
  "Tessa",
  "Moira",
  "Microsoft Aria",
  "Microsoft Jenny",
  "Microsoft Zira",
  "Microsoft Hazel",
  "Google UK English Female",
  "Google US English",
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

// For Hindi / Kannada replies, prefer an installed female voice for that
// language. macOS ships "Lekha" (hi-IN). Windows has "Microsoft Heera",
// "Microsoft Kalpana", "Microsoft Hemant" (hi-IN). Kannada (kn-IN) is
// only on a few systems — fall back to setting just `lang` and letting
// the OS pick if no exact-locale voice exists.
function pickLocaleVoice(
  all: SpeechSynthesisVoice[],
  langPrefix: string,
  preferredNames: string[],
): SpeechSynthesisVoice | null {
  const localized = all.filter((v) =>
    v.lang?.toLowerCase().startsWith(langPrefix),
  );
  for (const name of preferredNames) {
    const hit = localized.find((v) => v.name.includes(name));
    if (hit) return hit;
  }
  return localized[0] ?? null;
}

const HINDI_PREFERRED = ["Lekha", "Microsoft Heera", "Microsoft Kalpana"];
const KANNADA_PREFERRED = ["Soumya", "Microsoft"];

// Energy-based VAD tuning
const SAMPLE_INTERVAL_MS = 60;
const SPEECH_RMS_THRESHOLD = 0.03;
const SILENCE_RMS_THRESHOLD = 0.018;
const MIN_SPEECH_MS = 350;
const SILENCE_HANGOVER_MS = 750;
const MAX_UTTERANCE_MS = 15000;

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

export function useVoiceMode({
  onFinalTranscript,
  transcribeUrl = "http://localhost:8000/api/transcribe",
}: Options): UseVoiceMode {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);
  const [listening, setListening] = useState(false);
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
  const vadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const utteranceStartRef = useRef<number | null>(null);
  const lastSpeechAtRef = useRef<number>(0);
  const activeRef = useRef(false);
  const speakingRef = useRef(false);
  const sendingRef = useRef(false);
  const languageRef = useRef<SttLanguage>("auto");
  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  const synthVoicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const onFinalRef = useRef(onFinalTranscript);
  useEffect(() => {
    onFinalRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

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

  // ---- Recorder lifecycle ------------------------------------------------

  const startRecorder = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    if (recorderRef.current && recorderRef.current.state !== "inactive") return;
    chunksRef.current = [];
    const mime = recorderMimeRef.current;
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, {
        type: mime || "audio/webm",
      });
      chunksRef.current = [];
      utteranceStartRef.current = null;
      void sendForTranscription(blob);
    };
    rec.start();
    recorderRef.current = rec;
    setListening(true);
  }, []);

  const stopRecorder = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }
    recorderRef.current = null;
    setListening(false);
  }, []);

  const sendForTranscription = useCallback(
    async (blob: Blob) => {
      if (!blob.size) return;
      sendingRef.current = true;
      setProcessing(true);
      try {
        const fd = new FormData();
        const ext = (recorderMimeRef.current || "audio/webm").includes("mp4")
          ? "mp4"
          : "webm";
        fd.append("audio", blob, `utterance.${ext}`);
        fd.append("language", languageRef.current);
        const res = await fetch(transcribeUrl, { method: "POST", body: fd });
        if (!res.ok) {
          const detail = (await res.json().catch(() => null))?.detail;
          throw new Error(detail || `transcribe failed: ${res.status}`);
        }
        const data = (await res.json()) as { text: string; language?: string };
        const text = (data.text || "").trim();
        if (text) {
          // Whisper returns ISO codes; constrain to en/hi/kn or null.
          const detected = data.language?.toLowerCase();
          const lang =
            detected === "en" || detected === "hi" || detected === "kn"
              ? detected
              : null;
          onFinalRef.current(text, lang);
        }
      } catch (exc: any) {
        console.warn("transcribe error:", exc?.message || exc);
        setErrorMessage(exc?.message || "Transcription failed");
        setTimeout(() => setErrorMessage(null), 3500);
      } finally {
        sendingRef.current = false;
        setProcessing(false);
        // Resume listening if the conversation is still active and the agent
        // isn't speaking right now.
        if (activeRef.current && !speakingRef.current && streamRef.current) {
          startRecorder();
        }
      }
    },
    [startRecorder, transcribeUrl],
  );

  // ---- Energy VAD --------------------------------------------------------

  const startVad = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const buffer = new Uint8Array(analyser.fftSize);

    if (vadTimerRef.current) clearInterval(vadTimerRef.current);
    vadTimerRef.current = setInterval(() => {
      analyser.getByteTimeDomainData(buffer);
      let sumSquares = 0;
      for (let i = 0; i < buffer.length; i++) {
        const norm = (buffer[i] - 128) / 128;
        sumSquares += norm * norm;
      }
      const rms = Math.sqrt(sumSquares / buffer.length);
      setLevel(rms);

      if (!activeRef.current || speakingRef.current || sendingRef.current) {
        return;
      }
      const rec = recorderRef.current;
      if (!rec || rec.state !== "recording") return;

      const now = performance.now();
      if (rms > SPEECH_RMS_THRESHOLD) {
        if (utteranceStartRef.current == null) utteranceStartRef.current = now;
        lastSpeechAtRef.current = now;
      }
      const startedAt = utteranceStartRef.current;
      if (startedAt != null) {
        const speechMs = now - startedAt;
        const silenceMs = now - lastSpeechAtRef.current;
        const longEnough = speechMs >= MIN_SPEECH_MS;
        const shouldStop =
          (longEnough && rms < SILENCE_RMS_THRESHOLD && silenceMs >= SILENCE_HANGOVER_MS) ||
          speechMs >= MAX_UTTERANCE_MS;
        if (shouldStop) {
          stopRecorder();
        }
      }
    }, SAMPLE_INTERVAL_MS);
  }, [stopRecorder]);

  const stopVad = useCallback(() => {
    if (vadTimerRef.current) {
      clearInterval(vadTimerRef.current);
      vadTimerRef.current = null;
    }
    setLevel(0);
  }, []);

  // ---- Public actions ----------------------------------------------------

  const start = useCallback(async () => {
    if (activeRef.current) return;
    setErrorMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      const ctx = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      analyserRef.current = analyser;
      recorderMimeRef.current = pickRecorderMime();

      activeRef.current = true;
      setActive(true);
      startRecorder();
      startVad();
    } catch (exc: any) {
      console.warn("getUserMedia failed:", exc?.message || exc);
      setErrorMessage(
        "Could not access the microphone. Check the browser permission and try again.",
      );
    }
  }, [startRecorder, startVad]);

  const stop = useCallback(() => {
    activeRef.current = false;
    setActive(false);
    setListening(false);
    setLevel(0);
    stopVad();
    stopRecorder();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch {
        /* ignore */
      }
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
  }, [stopRecorder, stopVad]);

  const cancelSpeech = useCallback(() => {
    if (typeof window === "undefined") return;
    const synth: SpeechSynthesis | undefined = (window as any).speechSynthesis;
    synth?.cancel();
    speakingRef.current = false;
    setSpeaking(false);
    if (activeRef.current && streamRef.current && !sendingRef.current) {
      startRecorder();
    }
  }, [startRecorder]);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !text) return;
      const synth: SpeechSynthesis | undefined = (window as any).speechSynthesis;
      if (!synth) return;

      stopRecorder();

      synth.cancel();
      const utter = new (window as any).SpeechSynthesisUtterance(text);

      // Pick a voice that matches the script of THIS reply. The user's
      // chosen English voice is only used when the reply is in Latin script;
      // for Hindi/Kannada we look up a locale-matched voice (Lekha,
      // Microsoft Heera, etc.) so Devanagari text doesn't get butchered.
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
        if (activeRef.current && streamRef.current && !sendingRef.current) {
          startRecorder();
        }
      };
      utter.onend = finish;
      utter.onerror = finish;
      synth.speak(utter);
    },
    [voiceURI, startRecorder, stopRecorder],
  );

  // Cleanup if the component unmounts mid-call.
  useEffect(() => {
    return () => {
      stopVad();
      stopRecorder();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close().catch(() => {});
    };
  }, [stopRecorder, stopVad]);

  return {
    supported,
    active,
    listening,
    speaking,
    processing,
    level,
    voices,
    voiceURI,
    setVoiceURI,
    language,
    setLanguage,
    start,
    stop,
    speak,
    cancelSpeech,
    errorMessage,
  };
}
