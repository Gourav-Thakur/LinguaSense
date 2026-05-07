"use client";

import { useEffect, useState } from "react";

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
  // Modal opens automatically when the call ends. Operator can dismiss to
  // glance at the transcript and re-open from the inline pill below.
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (callEnded) setModalOpen(true);
  }, [callEnded]);

  // Esc dismisses the modal (but the dispatch info is still accessible
  // via the inline "View dispatch report" button afterwards).
  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen]);

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

  return (
    <>
      {/* Inline placeholder where the End Call button used to live. */}
      <div className="bg-zinc-900 border border-emerald-700/40 rounded-lg overflow-hidden">
        <div className="px-4 py-2 border-b border-emerald-700/30 bg-emerald-950/30 flex items-center gap-2">
          <span className="text-emerald-400">📡</span>
          <span className="text-sm font-semibold text-emerald-200 uppercase tracking-wider">
            Dispatch Transmitted
          </span>
        </div>
        <div className="p-3 flex items-center justify-between gap-3">
          <span className="text-[11px] text-zinc-400">
            Report has been forwarded to the responding officer.
          </span>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold uppercase tracking-wider"
          >
            View report
          </button>
        </div>
      </div>

      {modalOpen && (
        <DispatchModal
          summary={summary}
          extracted={extracted}
          sessionId={sessionId}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}

function DispatchModal({
  summary,
  extracted,
  sessionId,
  onClose,
}: {
  summary: string | null;
  extracted: ExtractedFacts;
  sessionId: string;
  onClose: () => void;
}) {
  const [transmittedAt] = useState(() => new Date());

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Dispatch transmitted report"
    >
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-zinc-900 border border-emerald-700/40 rounded-lg shadow-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-emerald-700/30 bg-emerald-950/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 text-xl">📡</span>
            <h2 className="text-base font-semibold text-emerald-200 uppercase tracking-wider">
              Dispatch Transmitted
            </h2>
            <span className="ml-2 text-[10px] uppercase tracking-widest bg-amber-700/30 text-amber-200 px-2 py-0.5 rounded border border-amber-700/40">
              Awaiting officer ack
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-zinc-400 hover:text-zinc-100 text-xl leading-none w-8 h-8 rounded hover:bg-zinc-800 flex items-center justify-center"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3 text-xs text-zinc-400">
            <div>
              <span className="text-zinc-500 uppercase tracking-widest text-[10px]">To</span>
              <div className="text-zinc-100 text-sm font-medium">Responding Officer</div>
            </div>
            <div>
              <span className="text-zinc-500 uppercase tracking-widest text-[10px]">From</span>
              <div className="text-zinc-100 text-sm font-medium">1092 AI Dispatcher</div>
            </div>
            <div>
              <span className="text-zinc-500 uppercase tracking-widest text-[10px]">
                Transmitted
              </span>
              <div className="text-zinc-100 text-sm">{transmittedAt.toLocaleString()}</div>
            </div>
            <div>
              <span className="text-zinc-500 uppercase tracking-widest text-[10px]">
                Session
              </span>
              <div className="text-zinc-100 text-sm font-mono">{sessionId || "—"}</div>
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
        </div>

        <div className="px-5 py-3 border-t border-zinc-800 flex items-center justify-between gap-3 bg-zinc-950/40">
          <span className="text-[10px] text-zinc-600 italic">
            UI prototype — no real dispatch was sent.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold uppercase tracking-wider"
            >
              Hide
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold uppercase tracking-wider"
            >
              Start new call
            </button>
          </div>
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
      <table className="w-full text-sm border border-zinc-800 rounded overflow-hidden">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-zinc-800 last:border-b-0">
              <td className="px-3 py-2 text-zinc-400 uppercase tracking-wider w-2/5 text-xs">
                {r.label}
              </td>
              <td className={`px-3 py-2 font-medium ${toneClass(r.tone)}`}>
                {r.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {extracted.notes.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">
            Observations
          </div>
          <ul className="text-sm text-zinc-200 list-disc pl-5 space-y-0.5">
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
