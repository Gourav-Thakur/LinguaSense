"use client";

import { useState } from "react";

import { ExtractedFacts } from "@/lib/types";

interface Props {
  callEnded: boolean;
  summary: string | null;
  extracted: ExtractedFacts;
  sessionId: string;
  onEndCall: () => void;
}

export function EndCallPanel({
  callEnded,
  summary,
  extracted,
  sessionId,
  onEndCall,
}: Props) {
  if (!callEnded) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <div className="px-4 py-2 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
            Call Control
          </h2>
        </div>
        <div className="p-4 space-y-2">
          <button
            onClick={onEndCall}
            className="w-full px-4 py-3 rounded bg-red-600 hover:bg-red-500 text-white font-semibold uppercase tracking-wider text-sm transition-colors"
          >
            End Call
          </button>
          <p className="text-[11px] text-zinc-500">
            Ending the call will compile a dispatch report and forward it to the
            responding officer.
          </p>
        </div>
      </div>
    );
  }

  return <DispatchedPanel summary={summary} extracted={extracted} sessionId={sessionId} />;
}

function DispatchedPanel({
  summary,
  extracted,
  sessionId,
}: {
  summary: string | null;
  extracted: ExtractedFacts;
  sessionId: string;
}) {
  const [transmittedAt] = useState(() => new Date());

  return (
    <div className="bg-zinc-900 border border-emerald-700/40 rounded-lg overflow-hidden">
      <div className="px-4 py-2 border-b border-emerald-700/30 bg-emerald-950/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-emerald-400">📡</span>
          <h2 className="text-sm font-semibold text-emerald-200 uppercase tracking-wider">
            Dispatch Transmitted
          </h2>
        </div>
        <span className="text-[10px] uppercase tracking-widest bg-amber-700/30 text-amber-200 px-2 py-0.5 rounded border border-amber-700/40">
          Awaiting officer ack
        </span>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-400">
          <div>
            <span className="text-zinc-500 uppercase tracking-widest">To</span>
            <div className="text-zinc-200">Responding Officer</div>
          </div>
          <div>
            <span className="text-zinc-500 uppercase tracking-widest">From</span>
            <div className="text-zinc-200">1092 AI Dispatcher</div>
          </div>
          <div>
            <span className="text-zinc-500 uppercase tracking-widest">
              Transmitted
            </span>
            <div className="text-zinc-200">{transmittedAt.toLocaleString()}</div>
          </div>
          <div>
            <span className="text-zinc-500 uppercase tracking-widest">
              Session
            </span>
            <div className="text-zinc-200 font-mono">{sessionId || "—"}</div>
          </div>
        </div>

        <FactsTable extracted={extracted} />

        <div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">
            Briefing
          </div>
          {summary ? (
            <pre className="text-xs whitespace-pre-wrap font-mono text-zinc-100 bg-zinc-950 border border-zinc-800 rounded p-3 max-h-72 overflow-y-auto">
              {summary}
            </pre>
          ) : (
            <div className="text-xs text-zinc-500 italic bg-zinc-950 border border-zinc-800 rounded p-3">
              Compiling briefing…
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 pt-2 border-t border-zinc-800">
          <span className="text-[10px] text-zinc-600 italic">
            UI prototype — no real dispatch was sent.
          </span>
          <button
            onClick={() => window.location.reload()}
            className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold uppercase tracking-wider transition-colors"
          >
            Start new call
          </button>
        </div>
      </div>
    </div>
  );
}

function FactsTable({ extracted }: { extracted: ExtractedFacts }) {
  const rows: { label: string; value: string; tone: "muted" | "ok" | "warn" | "alert" }[] = [
    {
      label: "Location",
      value: extracted.location ?? "unknown",
      tone: extracted.location ? "ok" : "muted",
    },
    {
      label: "Threat level",
      value: extracted.threat_level,
      tone:
        extracted.threat_level === "high"
          ? "alert"
          : extracted.threat_level === "medium"
            ? "warn"
            : extracted.threat_level === "low"
              ? "ok"
              : "muted",
    },
    {
      label: "Weapons present",
      value: extracted.weapons_present,
      tone:
        extracted.weapons_present === "yes"
          ? "alert"
          : extracted.weapons_present === "no"
            ? "ok"
            : "muted",
    },
    {
      label: "Persons present",
      value: extracted.persons_present ?? "unknown",
      tone: extracted.persons_present ? "ok" : "muted",
    },
  ];

  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">
        Extracted Facts
      </div>
      <table className="w-full text-xs border border-zinc-800 rounded overflow-hidden">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-zinc-800 last:border-b-0">
              <td className="px-2 py-1.5 text-zinc-400 uppercase tracking-wider w-2/5">
                {r.label}
              </td>
              <td className={`px-2 py-1.5 font-medium ${toneClass(r.tone)}`}>
                {r.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {extracted.notes.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">
            Observations
          </div>
          <ul className="text-xs text-zinc-200 list-disc pl-5 space-y-0.5">
            {extracted.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function toneClass(tone: "muted" | "ok" | "warn" | "alert"): string {
  switch (tone) {
    case "alert":
      return "text-red-400";
    case "warn":
      return "text-amber-400";
    case "ok":
      return "text-zinc-100";
    default:
      return "text-zinc-500 italic";
  }
}
