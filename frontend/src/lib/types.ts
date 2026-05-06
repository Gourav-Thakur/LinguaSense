export type ThreatLevel = "low" | "medium" | "high" | "unknown";
export type TriState = "yes" | "no" | "unknown";

export interface ExtractedFacts {
  location: string | null;
  threat_level: ThreatLevel;
  weapons_present: TriState;
  persons_present: string | null;
  notes: string[];
}

export interface SessionState {
  session_id: string;
  stealth_mode: boolean;
  persona: string;
  extracted: ExtractedFacts;
}

export type Role = "user" | "assistant" | "system";

export interface TranscriptLine {
  role: Role;
  text: string;
}

export type ServerMessage =
  | ({ type: "state" } & SessionState)
  | { type: "transcript"; role: Role; text: string }
  | { type: "alert"; message: string }
  | { type: "summary"; text: string }
  | { type: "error"; message: string };

export type ClientMessage =
  | { type: "user_message"; text: string; language?: string | null }
  | { type: "request_summary" };

export const EMPTY_STATE: SessionState = {
  session_id: "",
  stealth_mode: false,
  persona: "dispatcher",
  extracted: {
    location: null,
    threat_level: "unknown",
    weapons_present: "unknown",
    persons_present: null,
    notes: [],
  },
};
