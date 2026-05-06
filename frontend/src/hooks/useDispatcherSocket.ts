"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  ClientMessage,
  EMPTY_STATE,
  ServerMessage,
  SessionState,
  TranscriptLine,
} from "@/lib/types";

const DEFAULT_URL = "ws://localhost:8000/ws/dispatch";

interface UseDispatcherSocket {
  connected: boolean;
  state: SessionState;
  transcript: TranscriptLine[];
  summary: string | null;
  alert: string | null;
  error: string | null;
  callEnded: boolean;
  sendUserMessage: (text: string) => void;
  endCall: () => void;
}

export function useDispatcherSocket(): UseDispatcherSocket {
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<SessionState>(EMPTY_STATE);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [alert, setAlert] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [callEnded, setCallEnded] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnect = useRef(true);
  const callEndedRef = useRef(false);

  useEffect(() => {
    shouldReconnect.current = true;

    const url = process.env.NEXT_PUBLIC_WS_URL || DEFAULT_URL;

    const connect = () => {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setError(null);
      };

      ws.onmessage = (ev) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        switch (msg.type) {
          case "state": {
            const { type: _t, ...rest } = msg;
            void _t;
            setState(rest);
            break;
          }
          case "transcript":
            setTranscript((prev) => [...prev, { role: msg.role, text: msg.text }]);
            break;
          case "alert":
            setAlert(msg.message);
            break;
          case "summary":
            setSummary(msg.text);
            // If end-call requested, close the socket once the summary lands.
            if (callEndedRef.current) {
              shouldReconnect.current = false;
              wsRef.current?.close();
            }
            break;
          case "error":
            setError(msg.message);
            break;
        }
      };

      ws.onerror = () => {
        setError("WebSocket error — is the backend running on :8000?");
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        if (shouldReconnect.current) {
          reconnectTimer.current = setTimeout(connect, 1000);
        }
      };
    };

    connect();

    return () => {
      shouldReconnect.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, []);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const sendUserMessage = useCallback(
    (text: string) => {
      if (callEndedRef.current) return;
      const trimmed = text.trim();
      if (!trimmed) return;
      send({ type: "user_message", text: trimmed });
    },
    [send],
  );

  const endCall = useCallback(() => {
    if (callEndedRef.current) return;
    callEndedRef.current = true;
    setCallEnded(true);
    setSummary(null);
    send({ type: "request_summary" });
  }, [send]);

  return {
    connected,
    state,
    transcript,
    summary,
    alert,
    error,
    callEnded,
    sendUserMessage,
    endCall,
  };
}
