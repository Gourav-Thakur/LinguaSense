"use client";

import { useEffect, useRef } from "react";

import { TranscriptLine } from "@/lib/types";

interface Props {
  lines: TranscriptLine[];
  stealthMode: boolean;
}

export function TranscriptWindow({ lines, stealthMode }: Props) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lines]);

  return (
    <div className="flex flex-col h-full bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <div className="px-4 py-2 border-b border-zinc-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
          Live Transcript
        </h2>
        <span className="text-xs text-zinc-500">{lines.length} lines</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {lines.length === 0 && (
          <div className="text-zinc-500 text-sm">
            Waiting for the caller to speak…
          </div>
        )}
        {lines.map((line, idx) => (
          <Line key={idx} line={line} stealthMode={stealthMode} />
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}

function Line({
  line,
  stealthMode,
}: {
  line: TranscriptLine;
  stealthMode: boolean;
}) {
  const isUser = line.role === "user";
  const isSystem = line.role === "system";

  if (isSystem) {
    return (
      <div className="text-center text-xs uppercase tracking-widest text-zinc-500">
        {line.text}
      </div>
    );
  }

  const bubble = isUser
    ? "bg-zinc-800 text-zinc-100"
    : stealthMode
      ? "bg-red-950 text-red-50 border border-red-800"
      : "bg-emerald-950 text-emerald-50 border border-emerald-800";

  const align = isUser ? "self-start" : "self-end";
  const label = isUser ? "Caller" : stealthMode ? `Agent · cover` : "Dispatcher";

  return (
    <div className={`flex flex-col ${isUser ? "items-start" : "items-end"}`}>
      <span className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">
        {label}
      </span>
      <div className={`${align} max-w-[85%] rounded-lg px-3 py-2 text-sm ${bubble}`}>
        {line.text}
      </div>
    </div>
  );
}
