"use client";

import { FormEvent, useState } from "react";

interface Props {
  onSend: (text: string) => void;
  disabled: boolean;
  callEnded?: boolean;
}

const SAMPLES = [
  "Hi, I'd like to order a large pepperoni pizza for delivery.",
  "I'm reporting a fire at 12 MG Road, please send help.",
  "Hello, can you send a plumber? My kitchen sink is leaking.",
];

export function CallerSimulator({ onSend, disabled, callEnded = false }: Props) {
  const [text, setText] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text);
    setText("");
  };

  return (
    <div className="bg-zinc-900 border border-amber-700/40 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full px-4 py-2 border-b border-zinc-800 flex items-center justify-between hover:bg-zinc-800/40 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Chevron open={!collapsed} />
          <h2 className="text-sm font-semibold text-amber-300 uppercase tracking-wider">
            DEV · Simulate Caller Speech
          </h2>
        </span>
        <span className="text-[10px] text-zinc-500 italic text-right max-w-[55%] truncate">
          {callEnded
            ? "Call ended — input disabled"
            : collapsed
              ? "Click to expand"
              : "stand-in for STT until Sarvam / Bhashini keys are wired"}
        </span>
      </button>
      {!collapsed && (
        <form onSubmit={submit} className="p-4 space-y-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder="Type what the caller would say…"
            disabled={disabled}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                submit(e as unknown as FormEvent);
              }
            }}
            className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-500"
          />
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {SAMPLES.map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => setText(s)}
                  className="text-[11px] px-2 py-1 rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                >
                  {s.slice(0, 40)}…
                </button>
              ))}
            </div>
            <button
              type="submit"
              disabled={disabled || !text.trim()}
              className="px-4 py-2 rounded bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white font-semibold uppercase tracking-wider text-sm transition-colors"
            >
              Send
            </button>
          </div>
        </form>
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
