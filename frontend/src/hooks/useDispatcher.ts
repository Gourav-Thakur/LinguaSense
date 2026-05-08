"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { EMPTY_STATE, ExtractedFacts, SessionState, TranscriptLine } from "@/lib/types";

const GREETING =
  "1092 helpline, dispatcher speaking. What is your emergency, and where are you?";

interface ChatTurn {
  role: "caller" | "you";
  text: string;
  language?: string | null;
}

interface UseDispatcher {
  ready: boolean;
  loading: boolean;
  state: SessionState;
  transcript: TranscriptLine[];
  summary: string | null;
  alert: string | null;
  error: string | null;
  callEnded: boolean;
  sendUserMessage: (text: string, language?: string | null) => void;
  endCall: () => void;
}

export function useDispatcher(): UseDispatcher {
  // Empty on server render, populated after hydration to avoid mismatch.
  const [sessionId, setSessionId] = useState("");
  useEffect(() => {
    setSessionId(crypto.randomUUID().replace(/-/g, "").slice(0, 12));
  }, []);

  const [history, setHistory] = useState<ChatTurn[]>([{ role: "you", text: GREETING }]);
  const [stealthMode, setStealthMode] = useState(false);
  const [persona, setPersona] = useState("dispatcher");
  const [extracted, setExtracted] = useState<ExtractedFacts>(EMPTY_STATE.extracted);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([
    { role: "assistant", text: GREETING },
  ]);
  const [summary, setSummary] = useState<string | null>(null);
  const [alert, setAlert] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const callEndedRef = useRef(false);

  const sendUserMessage = useCallback(
    async (text: string, language?: string | null) => {
      if (callEndedRef.current || loading) return;
      const trimmed = text.trim();
      if (!trimmed) return;

      setTranscript((prev) => [...prev, { role: "user", text: trimmed }]);
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            history,
            message: trimmed,
            language: language ?? null,
            stealth_mode: stealthMode,
            persona,
            extracted,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `API error: ${res.status}`);
        }

        const data = await res.json();

        setHistory((prev) => [
          ...prev,
          { role: "caller", text: trimmed, language: language ?? null },
          { role: "you", text: data.reply },
        ]);
        setTranscript((prev) => [...prev, { role: "assistant", text: data.reply }]);
        setStealthMode(data.stealth_mode);
        setPersona(data.persona);
        setExtracted(data.extracted);

        if (data.just_engaged) {
          setAlert(`STEALTH PROTOCOL ENGAGED — Cover persona: ${data.persona}`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Request failed";
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [history, stealthMode, persona, extracted, loading]
  );

  const endCall = useCallback(async () => {
    if (callEndedRef.current) return;
    callEndedRef.current = true;
    setCallEnded(true);
    setSummary(null);

    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history }),
      });
      const data = await res.json();
      setSummary(data.summary);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Summary failed";
      setError(msg);
    }
  }, [history]);

  return {
    ready: true,
    loading,
    state: {
      session_id: sessionId,
      stealth_mode: stealthMode,
      persona,
      extracted,
    },
    transcript,
    summary,
    alert,
    error,
    callEnded,
    sendUserMessage,
    endCall,
  };
}
