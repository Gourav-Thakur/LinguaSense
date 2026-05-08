"use client";

import { useState } from "react";

import { SttLanguage, VoiceOption } from "@/hooks/useVoiceMode";

interface Props {
  supported: boolean;
  enabled: boolean;
  pushing: boolean;
  speaking: boolean;
  processing: boolean;
  level: number;
  disabled: boolean;
  sttReady: boolean;
  sttProvider: string;
  sttModel: string;
  errorMessage: string | null;
  voices: VoiceOption[];
  voiceURI: string | null;
  language: SttLanguage;
  onLanguageChange: (l: SttLanguage) => void;
  onVoiceURIChange: (uri: string) => void;
  onEnabledChange: (v: boolean) => void;
  onPushStart: () => void | Promise<void>;
  onPushEnd: () => void;
  onCancelSpeech: () => void;
}

const LANGUAGES: { value: SttLanguage; label: string }[] = [
  { value: "auto", label: "Auto-detect" },
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi (हिन्दी)" },
  { value: "kn", label: "Kannada (ಕನ್ನಡ)" },
];

export function VoicePanel({
  supported,
  enabled,
  pushing,
  speaking,
  processing,
  level,
  disabled,
  sttReady,
  sttProvider,
  sttModel,
  errorMessage,
  voices,
  voiceURI,
  language,
  onLanguageChange,
  onVoiceURIChange,
  onEnabledChange,
  onPushStart,
  onPushEnd,
  onCancelSpeech,
}: Props) {
  const [showVoices, setShowVoices] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  if (!supported) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-xs text-zinc-400">
        Voice mode unavailable — your browser doesn&apos;t support
        MediaRecorder + SpeechSynthesis. Try Chrome, Edge, or Safari.
      </div>
    );
  }

  const chosenVoice = voices.find((v) => v.uri === voiceURI);
  const startBlocked = disabled || !sttReady;

  return (
    <div
      className={`bg-zinc-900 rounded-lg overflow-hidden border ${
        enabled ? "border-emerald-700/60" : "border-zinc-800"
      }`}
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full px-4 py-2 border-b border-zinc-800 flex items-center justify-between hover:bg-zinc-800/40 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Chevron open={!collapsed} />
          <h2 className="text-sm font-semibold text-emerald-300 uppercase tracking-wider">
            Push-to-Talk · Sarvam STT
          </h2>
          {collapsed && enabled && (
            <span className="ml-2 text-[10px] uppercase tracking-widest text-emerald-400">
              · spacebar still active
            </span>
          )}
        </span>
        <span className="text-[10px] text-zinc-500 italic truncate max-w-[45%] text-right">
          STT: {sttProvider} · {sttModel}
          {chosenVoice ? ` · TTS: ${chosenVoice.name}` : ""}
        </span>
      </button>

      {collapsed && (
        <div className="px-4 py-2 flex items-center gap-3 text-[11px] text-zinc-400">
          <Status label="MIC" active={pushing} color="red" />
          <Status label="SARVAM" active={processing} color="amber" />
          <Status label="AGENT" active={speaking} color="emerald" />
          <div className="ml-auto flex-1 max-w-[40%] h-1.5 bg-zinc-800 rounded overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${Math.min(100, level * 600)}%` }}
            />
          </div>
        </div>
      )}

      {!collapsed && (
      <div className="p-4 space-y-3">
        {!sttReady && (
          <div className="text-[11px] rounded bg-amber-900/30 border border-amber-700/40 text-amber-200 px-3 py-2">
            STT not ready — set <code className="font-mono">SARVAM_API_KEY</code>{" "}
            in <code className="font-mono">.env.local</code> and restart.
          </div>
        )}
        {errorMessage && (
          <div className="text-[11px] rounded bg-red-900/30 border border-red-700/40 text-red-200 px-3 py-2">
            {errorMessage}
          </div>
        )}

        <div className="flex items-center gap-3">
          <label className="text-[11px] text-zinc-400 uppercase tracking-widest">
            Lang
          </label>
          <select
            value={language}
            disabled={pushing}
            onChange={(e) => onLanguageChange(e.target.value as SttLanguage)}
            className="bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500"
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
          <label className="ml-auto flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              disabled={startBlocked}
              onChange={(e) => onEnabledChange(e.target.checked)}
              className="accent-emerald-500"
            />
            Voice mode {enabled ? "ON" : "OFF"}
          </label>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={!enabled || disabled}
            onMouseDown={() => onPushStart()}
            onMouseUp={onPushEnd}
            onMouseLeave={onPushEnd}
            onTouchStart={(e) => { e.preventDefault(); void onPushStart(); }}
            onTouchEnd={(e) => { e.preventDefault(); onPushEnd(); }}
            className={`flex-1 px-4 py-3 rounded font-semibold uppercase tracking-wider text-sm transition-colors select-none ${
              pushing
                ? "bg-red-600 hover:bg-red-500 text-white animate-pulse"
                : "bg-emerald-700 hover:bg-emerald-600 text-white"
            } disabled:bg-zinc-700 disabled:cursor-not-allowed`}
          >
            {pushing
              ? "🔴 Recording — release to send"
              : enabled
                ? "Hold SPACE or click to talk"
                : "Turn on voice mode to begin"}
          </button>
          {speaking && (
            <button
              type="button"
              onClick={onCancelSpeech}
              className="px-3 py-3 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold uppercase tracking-wider"
            >
              Stop voice
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 text-[11px] text-zinc-400">
          <Status label="MIC" active={pushing} color="red" />
          <Status label="SARVAM" active={processing} color="amber" />
          <Status label="AGENT" active={speaking} color="emerald" />
          <span className="ml-auto italic">
            {processing
              ? "Sending to Sarvam…"
              : speaking
                ? "Agent speaking…"
                : pushing
                  ? "Listening…"
                  : enabled
                    ? "Press & hold SPACE (or the button) to talk"
                    : "Idle"}
          </span>
        </div>

        {/* mic level meter */}
        <div className="h-1.5 w-full bg-zinc-800 rounded overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: `${Math.min(100, level * 600)}%` }}
          />
        </div>

        <div className="text-[11px] text-zinc-500">
          <button
            type="button"
            onClick={() => setShowVoices((s) => !s)}
            className="underline-offset-2 hover:underline"
          >
            {showVoices ? "Hide voice options" : "Change agent voice"}
          </button>
          {showVoices && (
            <div className="mt-2">
              <select
                value={voiceURI ?? ""}
                onChange={(e) => onVoiceURIChange(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500"
              >
                {voices.length === 0 && <option>No voices available yet…</option>}
                {voices.map((v) => (
                  <option key={v.uri} value={v.uri}>
                    {v.name} · {v.lang}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-zinc-600">
                Premium / Enhanced voices on macOS appear here once installed
                via System Settings → Accessibility → Spoken Content.
              </p>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <span
      className={`inline-block text-zinc-500 text-xs transition-transform ${
        open ? "rotate-90" : ""
      }`}
      aria-hidden
    >
      ▶
    </span>
  );
}

function Status({
  label,
  active,
  color,
}: {
  label: string;
  active: boolean;
  color: "red" | "emerald" | "amber";
}) {
  const dotActive = {
    red: "bg-red-500 animate-pulse",
    emerald: "bg-emerald-400 animate-pulse",
    amber: "bg-amber-400 animate-pulse",
  }[color];
  const dot = active ? dotActive : "bg-zinc-700";
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
      <span className="uppercase tracking-widest">{label}</span>
    </span>
  );
}
