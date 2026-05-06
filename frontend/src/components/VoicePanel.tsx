"use client";

import { useState } from "react";

import { VoiceOption } from "@/hooks/useVoiceMode";

interface Props {
  supported: boolean;
  active: boolean;
  listening: boolean;
  speaking: boolean;
  interim: string;
  disabled: boolean;
  voices: VoiceOption[];
  voiceURI: string | null;
  onVoiceURIChange: (uri: string) => void;
  onStart: () => void;
  onStop: () => void;
  onCancelSpeech: () => void;
}

export function VoicePanel({
  supported,
  active,
  listening,
  speaking,
  interim,
  disabled,
  voices,
  voiceURI,
  onVoiceURIChange,
  onStart,
  onStop,
  onCancelSpeech,
}: Props) {
  const [showVoices, setShowVoices] = useState(false);

  if (!supported) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-xs text-zinc-400">
        Voice mode unavailable — your browser doesn&apos;t support the Web
        Speech API. Try Chrome, Edge, or Safari.
      </div>
    );
  }

  const chosenVoice = voices.find((v) => v.uri === voiceURI);

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
        <span className="text-[10px] text-zinc-500 italic">
          {chosenVoice
            ? `Voice: ${chosenVoice.name}`
            : "No voice selected"}
        </span>
      </div>

      <div className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          {!active ? (
            <button
              type="button"
              onClick={onStart}
              disabled={disabled}
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
          <Status label="AGENT" active={speaking} color="emerald" />
          <span className="ml-auto italic truncate max-w-[60%]">
            {speaking
              ? "Agent speaking…"
              : listening
                ? interim || "(listening…)"
                : active
                  ? "(connecting mic…)"
                  : "Idle — click Start Conversation to begin"}
          </span>
        </div>

        <div className="text-[11px] text-zinc-500">
          <button
            type="button"
            onClick={() => setShowVoices((s) => !s)}
            className="underline-offset-2 hover:underline"
          >
            {showVoices ? "Hide voice options" : "Change voice"}
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
                Higher quality voices appear on macOS once you install
                Premium / Enhanced variants in System Settings → Accessibility →
                Spoken Content → System Voice → Manage Voices.
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
  color: "red" | "emerald";
}) {
  const dot = active
    ? color === "red"
      ? "bg-red-500 animate-pulse"
      : "bg-emerald-400 animate-pulse"
    : "bg-zinc-700";
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
      <span className="uppercase tracking-widest">{label}</span>
    </span>
  );
}
