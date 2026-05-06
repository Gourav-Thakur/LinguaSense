"use client";

interface Props {
  stealthMode: boolean;
  persona: string;
  connected: boolean;
}

export function StealthBanner({ stealthMode, persona, connected }: Props) {
  if (!stealthMode) {
    return (
      <div className="w-full bg-zinc-800 border-b border-zinc-700 text-zinc-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              className={`inline-block h-3 w-3 rounded-full ${
                connected ? "bg-emerald-500" : "bg-zinc-500"
              }`}
              aria-label={connected ? "connected" : "disconnected"}
            />
            <span className="font-semibold tracking-wide">
              1092 DISPATCHER · STANDARD PROTOCOL
            </span>
          </div>
          <span className="text-xs text-zinc-400">
            {connected ? "Live · monitoring" : "Reconnecting…"}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full animate-flash text-white px-6 py-5 border-b-4 border-red-300 shadow-lg">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden>
            ⚠
          </span>
          <div>
            <div className="text-lg font-extrabold tracking-wider uppercase">
              Stealth Protocol Engaged — Coded Language Detected
            </div>
            <div className="text-sm text-red-100">
              Cover persona:{" "}
              <span className="font-semibold uppercase">{persona}</span> · Do
              not interrupt the call — the agent is in cover.
            </div>
          </div>
        </div>
        <span className="text-xs uppercase tracking-widest bg-white/15 px-3 py-1 rounded">
          Live
        </span>
      </div>
    </div>
  );
}
