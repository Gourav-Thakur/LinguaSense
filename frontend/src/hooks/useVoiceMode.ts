"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Web Speech API isn't in standard DOM types; webkit-prefixed in Safari.
type SR = any;

interface UseVoiceMode {
  supported: boolean;
  enabled: boolean;
  listening: boolean;
  speaking: boolean;
  interim: string;
  setEnabled: (v: boolean) => void;
  startListening: () => void;
  stopListening: () => void;
  speak: (text: string) => void;
  cancelSpeech: () => void;
}

interface Options {
  onFinalTranscript: (text: string) => void;
  lang?: string;
}

export function useVoiceMode({
  onFinalTranscript,
  lang = "en-IN",
}: Options): UseVoiceMode {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState("");

  const recRef = useRef<SR | null>(null);
  const wantListeningRef = useRef(false);
  const speakingRef = useRef(false);

  // Keep onFinalTranscript stable across re-renders without re-creating the
  // recognition instance.
  const onFinalRef = useRef(onFinalTranscript);
  useEffect(() => {
    onFinalRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as any;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    const synth = w.speechSynthesis;
    if (!Ctor || !synth) {
      setSupported(false);
      return;
    }
    setSupported(true);

    const rec: SR = new Ctor();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;

    rec.onresult = (event: any) => {
      let interimText = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interimText += res[0].transcript;
      }
      if (interimText) setInterim(interimText.trim());
      if (finalText.trim()) {
        setInterim("");
        onFinalRef.current(finalText.trim());
      }
    };

    rec.onerror = (e: any) => {
      // "no-speech" / "aborted" are common and harmless during PTT use.
      if (e.error !== "no-speech" && e.error !== "aborted") {
        console.warn("speech recognition error:", e.error);
      }
    };

    rec.onend = () => {
      setListening(false);
      // If we're still supposed to be listening (e.g. continuous PTT held)
      // and the agent isn't speaking, restart.
      if (wantListeningRef.current && !speakingRef.current) {
        try {
          rec.start();
          setListening(true);
        } catch {
          /* already started */
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

  const startListening = useCallback(() => {
    const rec = recRef.current;
    if (!rec || speakingRef.current) return;
    wantListeningRef.current = true;
    try {
      rec.start();
      setListening(true);
    } catch {
      /* already running */
    }
  }, []);

  const stopListening = useCallback(() => {
    const rec = recRef.current;
    wantListeningRef.current = false;
    if (!rec) return;
    try {
      rec.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
    setInterim("");
  }, []);

  const cancelSpeech = useCallback(() => {
    if (typeof window === "undefined") return;
    const synth = (window as any).speechSynthesis;
    synth?.cancel();
    speakingRef.current = false;
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined") return;
      const synth = (window as any).speechSynthesis;
      if (!synth || !text) return;

      // Pause the mic while we speak so the agent doesn't hear itself.
      const wasListening = wantListeningRef.current;
      if (wasListening) {
        try {
          recRef.current?.stop();
        } catch {
          /* ignore */
        }
      }

      synth.cancel();
      const utter = new (window as any).SpeechSynthesisUtterance(text);
      utter.lang = lang;
      utter.rate = 1.0;
      utter.pitch = 1.0;
      utter.onstart = () => {
        speakingRef.current = true;
        setSpeaking(true);
      };
      utter.onend = () => {
        speakingRef.current = false;
        setSpeaking(false);
        // Resume listening if PTT was active before we spoke.
        if (wasListening && wantListeningRef.current) {
          try {
            recRef.current?.start();
            setListening(true);
          } catch {
            /* already started */
          }
        }
      };
      utter.onerror = () => {
        speakingRef.current = false;
        setSpeaking(false);
      };
      synth.speak(utter);
    },
    [lang],
  );

  return {
    supported,
    enabled,
    listening,
    speaking,
    interim,
    setEnabled,
    startListening,
    stopListening,
    speak,
    cancelSpeech,
  };
}
