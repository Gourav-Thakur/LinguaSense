"use client";

import { useEffect, useRef } from "react";

import { CallerSimulator } from "@/components/CallerSimulator";
import { EndCallPanel } from "@/components/EndCallPanel";
import { ExtractionCard } from "@/components/ExtractionCard";
import { StealthBanner } from "@/components/StealthBanner";
import { TranscriptWindow } from "@/components/TranscriptWindow";
import { VoicePanel } from "@/components/VoicePanel";
import { useBackendHealth } from "@/hooks/useBackendHealth";
import { useDispatcher } from "@/hooks/useDispatcher";
import { useVoiceMode } from "@/hooks/useVoiceMode";

export default function DashboardPage() {
  const {
    loading,
    state,
    transcript,
    summary,
    error,
    callEnded,
    sendUserMessage,
    endCall,
  } = useDispatcher();

  const health = useBackendHealth();

  const voice = useVoiceMode({
    onFinalTranscript: (text, language) => sendUserMessage(text, language),
  });

  const lastSpokenIdx = useRef(-1);
  useEffect(() => {
    for (let i = lastSpokenIdx.current + 1; i < transcript.length; i++) {
      const line = transcript[i];
      if (voice.enabled && !callEnded && line.role === "assistant") {
        voice.speak(line.text);
      }
    }
    lastSpokenIdx.current = transcript.length - 1;
  }, [transcript, voice, callEnded]);

  useEffect(() => {
    if (callEnded) {
      voice.setEnabled(false);
      voice.cancelSpeech();
    }
  }, [callEnded, voice]);

  const inputDisabled = loading || callEnded;

  return (
    <main className="h-screen flex flex-col overflow-hidden">
      <StealthBanner
        stealthMode={state.stealth_mode}
        persona={state.persona}
        connected={!loading}
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
          enabled={voice.enabled}
          pushing={voice.pushing}
          speaking={voice.speaking}
          processing={voice.processing}
          level={voice.level}
          disabled={inputDisabled}
          sttReady={health.stt_ready}
          sttProvider={health.stt_provider}
          sttModel={health.stt_model}
          errorMessage={voice.errorMessage}
          voices={voice.voices}
          voiceURI={voice.voiceURI}
          language={voice.language}
          onLanguageChange={voice.setLanguage}
          onVoiceURIChange={voice.setVoiceURI}
          onEnabledChange={voice.setEnabled}
          onPushStart={voice.pushStart}
          onPushEnd={voice.pushEnd}
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
