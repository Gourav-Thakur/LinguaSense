"use client";

import { useState } from "react";

import { SttLanguage, VoiceOption } from "@/hooks/useVoiceMode";

interface Props {
  supported: boolean;
  active: boolean;
  listening: boolean;
  speaking: boolean;
  processing: boolean;
  level: number;
  disabled: boolean;
  sttReady: boolean;
  sttLoading: boolean;
  sttModel: string;
  errorMessage: string | null;
  voices: VoiceOption[];
  voiceURI: string | null;
  language: SttLanguage;
  onLanguageChange: (l: SttLanguage) => void;
  onVoiceURIChange: (uri: string) => void;
  onStart: () => void | Promise<void>;
  onStop: () => void;
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
  active,
  listening,
  speaking,
  processing,
  level,
  disabled,
  sttReady,
  sttLoading,
  sttModel,
  errorMessage,
  voices,
  voiceURI,
  language,
  onLanguageChange,
  onVoiceURIChange,
  onStart,
  onStop,
  onCancelSpeech,
}: Props) {
  const [showVoices, setShowVoices] = useState(false);

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
        active ? "border-emerald-700/60" : "border-zinc-800"
      }`}
    >
      <div className="px-4 py-2 border-b border-zinc-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-emerald-300 uppercase tracking-wider">
          Live Voice Conversation
        </h2>
        <span className="text-[10px] text-zinc-500 italic truncate max-w-[55%]">
          STT: Whisper {sttModel}
          {chosenVoice ? ` · TTS: ${chosenVoice.name}` : ""}
        </span>
      </div>

      <div className="p-4 space-y-3">
        {!sttReady && (
          <div className="text-[11px] rounded bg-amber-900/30 border border-amber-700/40 text-amber-200 px-3 py-2">
            {sttLoading
              ? `Loading Whisper "${sttModel}" on the backend… first-run download lives in ~/.cache/huggingface and is cached afterwards.`
              : "STT model is not loaded yet — start the backend first."}
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
            disabled={active}
            onChange={(e) => onLanguageChange(e.target.value as SttLanguage)}
            className="bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500"
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
          <span className="ml-auto text-[10px] text-zinc-500 italic">
            {language === "auto"
              ? "Whisper will detect en / hi / kn"
              : "Locked to one language for higher accuracy"}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {!active ? (
            <button
              type="button"
              onClick={() => onStart()}
              disabled={startBlocked}
              className="flex-1 px-4 py-3 rounded bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white font-semibold uppercase tracking-wider text-sm transition-colors"
            >
              ▶ Start Conversation
            </button>
          ) : (
            <button
              type="button"
              onClick={onStop}
              className="flex-1 px-4 py-3 rounded bg-red-600 hover:bg-red-500 text-white font-semibold uppercase tracking-wider text-sm transition-colors"
            >
              ■ End Conversation
            </button>
          )}
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
          <Status label="MIC" active={listening} color="red" />
          <Status label="WHISPER" active={processing} color="amber" />
          <Status label="AGENT" active={speaking} color="emerald" />
          <span className="ml-auto italic">
            {processing
              ? "Transcribing…"
              : speaking
                ? "Agent speaking…"
                : listening
                  ? "Listening…"
                  : active
                    ? "Connecting mic…"
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
                via System Settings → Accessibility → Spoken Content → System
                Voice → Manage Voices.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
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
