"use client";

import { useEffect, useRef, useState } from "react";

import { ExtractedFacts, ThreatLevel, TriState } from "@/lib/types";

interface Props {
  extracted: ExtractedFacts;
  stealthMode: boolean;
}

export function ExtractionCard({ extracted, stealthMode }: Props) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <div className="px-4 py-2 border-b border-zinc-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
          Coded → Clear
        </h2>
        <span
          className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded ${
            stealthMode
              ? "bg-red-700 text-red-50"
              : "bg-zinc-700 text-zinc-300"
          }`}
        >
          {stealthMode ? "Extracting" : "Idle"}
        </span>
      </div>
      <div className="p-4 space-y-3">
        <Field label="Location" value={extracted.location ?? "unknown"} />
        <ThreatField level={extracted.threat_level} />
        <WeaponField value={extracted.weapons_present} />
        <Field
          label="Persons present"
          value={extracted.persons_present ?? "unknown"}
        />
        <NotesField notes={extracted.notes} />
      </div>
    </div>
  );
}

function useHighlight(value: string): boolean {
  const [hl, setHl] = useState(false);
  const last = useRef(value);
  useEffect(() => {
    if (last.current !== value) {
      last.current = value;
      setHl(true);
      const t = setTimeout(() => setHl(false), 1400);
      return () => clearTimeout(t);
    }
  }, [value]);
  return hl;
}

function Field({ label, value }: { label: string; value: string }) {
  const known = value && value !== "unknown";
  const hl = useHighlight(value);
  return (
    <div className={`flex flex-col rounded px-2 py-1 ${hl ? "animate-highlight" : ""}`}>
      <span className="text-[10px] uppercase tracking-widest text-zinc-500">
        {label}
      </span>
      <span
        className={`text-sm ${known ? "text-zinc-100 font-medium" : "text-zinc-500 italic"}`}
      >
        {value}
      </span>
    </div>
  );
}

function ThreatField({ level }: { level: ThreatLevel }) {
  const color =
    level === "high"
      ? "text-red-400"
      : level === "medium"
        ? "text-amber-400"
        : level === "low"
          ? "text-emerald-400"
          : "text-zinc-500 italic";
  const hl = useHighlight(level);
  return (
    <div className={`flex flex-col rounded px-2 py-1 ${hl ? "animate-highlight" : ""}`}>
      <span className="text-[10px] uppercase tracking-widest text-zinc-500">
        Threat level
      </span>
      <span className={`text-sm font-semibold uppercase ${color}`}>{level}</span>
    </div>
  );
}

function WeaponField({ value }: { value: TriState }) {
  const color =
    value === "yes"
      ? "text-red-400"
      : value === "no"
        ? "text-emerald-400"
        : "text-zinc-500 italic";
  const hl = useHighlight(value);
  return (
    <div className={`flex flex-col rounded px-2 py-1 ${hl ? "animate-highlight" : ""}`}>
      <span className="text-[10px] uppercase tracking-widest text-zinc-500">
        Weapons present
      </span>
      <span className={`text-sm font-semibold uppercase ${color}`}>{value}</span>
    </div>
  );
}

function NotesField({ notes }: { notes: string[] }) {
  return (
    <div className="flex flex-col rounded px-2 py-1">
      <span className="text-[10px] uppercase tracking-widest text-zinc-500">
        Observations
      </span>
      {notes.length === 0 ? (
        <span className="text-sm text-zinc-500 italic">none yet</span>
      ) : (
        <ul className="text-sm text-zinc-200 list-disc pl-5 space-y-0.5">
          {notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
