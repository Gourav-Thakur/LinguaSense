"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Web Speech API isn't in standard DOM types; webkit-prefixed in Safari.
type SR = any;

export interface VoiceOption {
  uri: string;
  name: string;
  lang: string;
}

interface UseVoiceMode {
  supported: boolean;
  active: boolean;
  listening: boolean;
  speaking: boolean;
  interim: string;
  voices: VoiceOption[];
  voiceURI: string | null;
  setVoiceURI: (uri: string) => void;
  start: () => void;
  stop: () => void;
  speak: (text: string) => void;
  cancelSpeech: () => void;
}

interface Options {
  onFinalTranscript: (text: string) => void;
  lang?: string;
}

// Highest-priority installed female voices we know about, by name fragment.
// Premium / Enhanced variants come first because they sound markedly more
// natural than the legacy compact voices.
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

export function useVoiceMode({
  onFinalTranscript,
  lang = "en-IN",
}: Options): UseVoiceMode {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState("");
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [voiceURI, setVoiceURI] = useState<string | null>(null);

  const recRef = useRef<SR | null>(null);
  const activeRef = useRef(false);
  const speakingRef = useRef(false);
  const synthVoicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const onFinalRef = useRef(onFinalTranscript);
  useEffect(() => {
    onFinalRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

  // ---- Recognition setup -------------------------------------------------
  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as any;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    const synth: SpeechSynthesis | undefined = w.speechSynthesis;
    if (!Ctor || !synth) {
      setSupported(false);
      return;
    }
    setSupported(true);

    const rec: SR = new Ctor();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = true;

    rec.onresult = (event: any) => {
      let interimText = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interimText += res[0].transcript;
      }
      if (interimText) setInterim(interimText.trim());
      const trimmedFinal = finalText.trim();
      if (trimmedFinal) {
        setInterim("");
        onFinalRef.current(trimmedFinal);
      }
    };

    rec.onerror = (e: any) => {
      // "no-speech" is fine in continuous mode — silence happens.
      // "aborted" fires when we deliberately stop. Both are routine.
      if (e.error !== "no-speech" && e.error !== "aborted") {
        console.warn("speech recognition error:", e.error);
      }
    };

    rec.onend = () => {
      setListening(false);
      // Browsers stop continuous recognition after long silences. If the
      // conversation is still active and the agent isn't currently speaking,
      // restart automatically.
      if (activeRef.current && !speakingRef.current) {
        try {
          rec.start();
          setListening(true);
        } catch {
          // Already started; another tick will retry on next onend.
        }
      }
    };

    recRef.current = rec;

    return () => {
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
      synth.cancel();
    };
  }, [lang]);

  // ---- Voice list (async — voices may load after a tick) -----------------
  useEffect(() => {
    if (typeof window === "undefined") return;
    const synth: SpeechSynthesis | undefined = (window as any).speechSynthesis;
    if (!synth) return;

    const refresh = () => {
      const list = synth.getVoices();
      synthVoicesRef.current = list;
      setVoices(
        list.map((v) => ({ uri: v.voiceURI, name: v.name, lang: v.lang })),
      );
      setVoiceURI((current) => {
        if (current && list.some((v) => v.voiceURI === current)) return current;
        const picked = pickPreferredVoice(list);
        return picked?.voiceURI ?? null;
      });
    };

    refresh();
    synth.addEventListener?.("voiceschanged", refresh);
    return () => {
      synth.removeEventListener?.("voiceschanged", refresh);
    };
  }, []);

  // ---- Public actions ----------------------------------------------------

  const start = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    activeRef.current = true;
    setActive(true);
    if (speakingRef.current) return; // will resume after speech ends
    try {
      rec.start();
      setListening(true);
    } catch {
      // Already running.
    }
  }, []);

  const stop = useCallback(() => {
    const rec = recRef.current;
    activeRef.current = false;
    setActive(false);
    setInterim("");
    if (!rec) return;
    try {
      rec.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
  }, []);

  const cancelSpeech = useCallback(() => {
    if (typeof window === "undefined") return;
    const synth: SpeechSynthesis | undefined = (window as any).speechSynthesis;
    synth?.cancel();
    speakingRef.current = false;
    setSpeaking(false);
    if (activeRef.current) {
      try {
        recRef.current?.start();
        setListening(true);
      } catch {
        /* already running */
      }
    }
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !text) return;
      const synth: SpeechSynthesis | undefined = (window as any).speechSynthesis;
      if (!synth) return;

      // Mute the mic so the agent doesn't transcribe itself.
      try {
        recRef.current?.stop();
      } catch {
        /* ignore */
      }
      setListening(false);

      synth.cancel();
      const utter = new (window as any).SpeechSynthesisUtterance(text);
      const chosen = synthVoicesRef.current.find((v) => v.voiceURI === voiceURI);
      if (chosen) {
        utter.voice = chosen;
        utter.lang = chosen.lang;
      } else {
        utter.lang = lang;
      }
      utter.rate = 1.0;
      utter.pitch = 1.05; // tiny lift away from the default robotic baseline

      utter.onstart = () => {
        speakingRef.current = true;
        setSpeaking(true);
      };
      utter.onend = () => {
        speakingRef.current = false;
        setSpeaking(false);
        if (activeRef.current) {
          try {
            recRef.current?.start();
            setListening(true);
          } catch {
            /* already running */
          }
        }
      };
      utter.onerror = () => {
        speakingRef.current = false;
        setSpeaking(false);
        if (activeRef.current) {
          try {
            recRef.current?.start();
            setListening(true);
          } catch {
            /* already running */
          }
        }
      };

      synth.speak(utter);
    },
    [lang, voiceURI],
  );

  return {
    supported,
    active,
    listening,
    speaking,
    interim,
    voices,
    voiceURI,
    setVoiceURI,
    start,
    stop,
    speak,
    cancelSpeech,
  };
}
