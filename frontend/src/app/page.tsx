"use client";

import { CallerSimulator } from "@/components/CallerSimulator";
import { EndCallPanel } from "@/components/EndCallPanel";
import { ExtractionCard } from "@/components/ExtractionCard";
import { StealthBanner } from "@/components/StealthBanner";
import { TranscriptWindow } from "@/components/TranscriptWindow";
import { useDispatcherSocket } from "@/hooks/useDispatcherSocket";

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

      <div className="p-4 pt-0">
        <CallerSimulator
          onSend={sendUserMessage}
          disabled={!connected || callEnded}
          callEnded={callEnded}
        />
      </div>
    </main>
  );
}
