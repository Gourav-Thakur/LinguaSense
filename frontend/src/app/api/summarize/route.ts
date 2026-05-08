import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

const SUMMARY_PROMPT = `The dispatcher is about to hand this call off to a human
officer. Generate a clear-language situation report (NOT in cover). Use this
exact format, filling each line:

INCIDENT SUMMARY
  Stealth mode engaged: <yes/no>
  Cover persona used:   <persona or "n/a">
  Location:             <best guess address / area / "unknown">
  Threat level:         <low/medium/high/unknown>
  Weapons present:      <yes/no/unknown>
  Persons present:      <description or "unknown">
  Key observations:
    - <bullet>
    - <bullet>
  Recommended action:   <one short sentence>

Return ONLY the report text, no JSON, no preamble.

The handoff report MUST be written in ENGLISH regardless of the language
the caller used.`;

interface ChatTurn {
  role: "caller" | "you";
  text: string;
  language?: string | null;
}

function renderHistory(history: ChatTurn[]): string {
  if (!history.length) return "No conversation recorded.";
  const lines = ["This is the completed emergency-line conversation:\n"];
  for (const t of history) {
    if (t.role === "caller") {
      const tag = t.language || "auto";
      lines.push(`Caller [${tag}]: ${t.text}`);
    } else {
      lines.push(`You (dispatcher): ${t.text}`);
    }
  }
  lines.push("\nNow produce the handoff report.");
  return lines.join("\n");
}

async function generate(input: string): Promise<string> {
  const provider = process.env.LLM_PROVIDER;

  if (provider === "gemini" || (!provider && process.env.GEMINI_API_KEY)) {
    const apiKey = process.env.GEMINI_API_KEY!;
    const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName, systemInstruction: SUMMARY_PROMPT });
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: input }] }],
      generationConfig: { temperature: 0.3 },
    });
    return result.response.text();
  }

  const endpoints = (process.env.CUSTOM_LLM_ENDPOINTS || "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  if (!endpoints.length) throw new Error("No LLM provider configured");

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, systemPrompt: SUMMARY_PROMPT }),
      });
      if (res.ok) return await res.text();
    } catch {
      // try next
    }
  }
  throw new Error("All LLM endpoints exhausted");
}

export async function POST(req: NextRequest) {
  const { history = [] } = (await req.json()) as { history: ChatTurn[] };

  try {
    const rendered = renderHistory(history);
    const summary = (await generate(rendered)).trim();
    return NextResponse.json({ summary });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ summary: `(Could not generate summary: ${msg})` });
  }
}
