"use client";

import { useEffect, useRef } from "react";

import { CallerSimulator } from "@/components/CallerSimulator";
import { EndCallPanel } from "@/components/EndCallPanel";
import { ExtractionCard } from "@/components/ExtractionCard";
import { StealthBanner } from "@/components/StealthBanner";
import { TranscriptWindow } from "@/components/TranscriptWindow";
import { VoicePanel } from "@/components/VoicePanel";
import { useBackendHealth } from "@/hooks/useBackendHealth";
import { useDispatcherSocket } from "@/hooks/useDispatcherSocket";
import { useVoiceMode } from "@/hooks/useVoiceMode";

export default function DashboardPage() {
  const {
    connected,
    state,
    transcript,
    summary,
    error,
    callEnded,
    sendUserMessage,
    endCall,
  } = useDispatcherSocket();

  const health = useBackendHealth();

  const voice = useVoiceMode({
    onFinalTranscript: (text, language) => sendUserMessage(text, language),
  });

  // Auto-speak each NEW assistant line. Cursor advances regardless of voice
  // state so toggling voice on later doesn't replay history.
  const lastSpokenIdx = useRef(-1);
  useEffect(() => {
    for (let i = lastSpokenIdx.current + 1; i < transcript.length; i++) {
      const line = transcript[i];
      if (voice.active && !callEnded && line.role === "assistant") {
        voice.speak(line.text);
      }
    }
    lastSpokenIdx.current = transcript.length - 1;
  }, [transcript, voice, callEnded]);

  // When the operator ends the call, kill voice loop too.
  useEffect(() => {
    if (callEnded) {
      voice.stop();
      voice.cancelSpeech();
    }
  }, [callEnded, voice]);

  const inputDisabled = !connected || callEnded;

  return (
    <main className="h-screen flex flex-col overflow-hidden">
      <StealthBanner
        stealthMode={state.stealth_mode}
        persona={state.persona}
        connected={connected}
      />

      {error && (
        <div className="bg-red-900/40 border-b border-red-800 text-red-200 text-sm px-6 py-2">
          {error}
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 p-4 overflow-hidden min-h-0">
        <div className="h-full min-h-0">
          <TranscriptWindow lines={transcript} stealthMode={state.stealth_mode} />
        </div>
        <div className="space-y-4 overflow-y-auto min-h-0 pr-1">
          <ExtractionCard
            extracted={state.extracted}
            stealthMode={state.stealth_mode}
          />
          <EndCallPanel
            callEnded={callEnded}
            summary={summary}
            extracted={state.extracted}
            sessionId={state.session_id}
            onEndCall={endCall}
          />
          <div className="text-xs text-zinc-500 px-2">
            Session: {state.session_id || "—"}
          </div>
        </div>
      </div>

      <div className="p-4 pt-0 space-y-3">
        <VoicePanel
          supported={voice.supported}
          active={voice.active}
          listening={voice.listening}
          speaking={voice.speaking}
          processing={voice.processing}
          level={voice.level}
          disabled={inputDisabled}
          sttReady={health.stt_ready}
          sttLoading={health.stt_loading}
          sttModel={health.stt_model}
          errorMessage={voice.errorMessage}
          voices={voice.voices}
          voiceURI={voice.voiceURI}
          language={voice.language}
          onLanguageChange={voice.setLanguage}
          onVoiceURIChange={voice.setVoiceURI}
          onStart={voice.start}
          onStop={voice.stop}
          onCancelSpeech={voice.cancelSpeech}
        />
        <CallerSimulator
          onSend={sendUserMessage}
          disabled={inputDisabled}
          callEnded={callEnded}
        />
      </div>
    </main>
  );
}
