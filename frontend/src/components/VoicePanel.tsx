"use client";

interface Props {
  supported: boolean;
  enabled: boolean;
  listening: boolean;
  speaking: boolean;
  interim: string;
  disabled: boolean;
  onToggleEnabled: (v: boolean) => void;
  onPressStart: () => void;
  onPressEnd: () => void;
  onCancelSpeech: () => void;
}

export function VoicePanel({
  supported,
  enabled,
  listening,
  speaking,
  interim,
  disabled,
  onToggleEnabled,
  onPressStart,
  onPressEnd,
  onCancelSpeech,
}: Props) {
  if (!supported) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-xs text-zinc-400">
        Voice mode unavailable — your browser doesn&apos;t support the Web
        Speech API. Try Chrome, Edge, or Safari.
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-emerald-700/40 rounded-lg overflow-hidden">
      <div className="px-4 py-2 border-b border-zinc-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-emerald-300 uppercase tracking-wider">
          Voice Mode
        </h2>
        <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            disabled={disabled}
            onChange={(e) => onToggleEnabled(e.target.checked)}
            className="accent-emerald-500"
          />
          {enabled ? "On" : "Off"}
        </label>
      </div>
      {enabled && (
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={disabled || speaking}
              onMouseDown={onPressStart}
              onMouseUp={onPressEnd}
              onMouseLeave={onPressEnd}
              onTouchStart={onPressStart}
              onTouchEnd={onPressEnd}
              className={`flex-1 px-4 py-3 rounded font-semibold uppercase tracking-wider text-sm transition-colors select-none ${
                listening
                  ? "bg-red-600 hover:bg-red-500 text-white animate-pulse"
                  : "bg-emerald-700 hover:bg-emerald-600 text-white"
              } disabled:bg-zinc-700 disabled:cursor-not-allowed`}
            >
              {listening ? "Listening… release to send" : "Hold to talk"}
            </button>
            {speaking && (
              <button
                type="button"
                onClick={onCancelSpeech}
                className="px-3 py-3 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold uppercase tracking-wider"
              >
                Stop
              </button>
            )}
          </div>
          <div className="flex items-center gap-3 text-[11px] text-zinc-400">
            <Status label="MIC" active={listening} color="red" />
            <Status label="AGENT" active={speaking} color="emerald" />
            <span className="ml-auto italic">
              {listening
                ? interim || "(silence)"
                : speaking
                  ? "Agent speaking…"
                  : "Idle — hold the button to speak"}
            </span>
          </div>
        </div>
      )}
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
