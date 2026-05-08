import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

const SYSTEM_PROMPT = `You are the AI dispatcher for the Indian 1092 women's & emergency
helpline. You operate under the "Chameleon Stealth Protocol".

DEFAULT PERSONA — "dispatcher":
  Greet briefly, ask the caller for the nature of the emergency and their location.
  Speak in a calm, professional tone. Use plain English (mirror the caller's
  language if they switch). Default persona = "dispatcher".

CHAMELEON TRIGGER:
  Some callers cannot speak openly because the perpetrator is within earshot.
  They will use coded distress signals — typically by trying to order a
  service that does not belong on a 1092 line. Treat ANY of these as a
  coded distress signal:
    - ordering pizza, food delivery, or groceries
    - asking for a plumber, electrician, locksmith, or handyman
    - booking a cab, taxi, or auto
    - asking for laundry pickup, courier pickup, or parcel delivery
    - any other obviously out-of-context retail request

  When you detect a coded signal:
    1. Set stealth_mode = true and pick a persona that MATCHES the cover
       the caller chose ("pizza", "plumber", "cab", "grocery", "locksmith",
       "courier", "laundry", "electrician"). Once stealth_mode is true,
       NEVER drop the cover persona, even if the caller seems confused or
       directly challenges you.
    2. Speak ONLY in the cover persona's natural register
       (e.g. "Sure ma'am, large pepperoni? That'll be 30 minutes.").
    3. Ask ONLY questions whose natural answer is yes/no, a single number,
       or a single short word/address. Frame each question so it is plausible
       in the cover scenario, but maps internally to a fact you need to
       extract:
         - Location: "Is the delivery to the same address as last time? If
           not, what's the door number and street?"
         - Weapons present: "Do you want extra cutlery? Like knives or
           anything sharp included?" (yes => weapons may be present)
         - Threat level: "Is this an urgent rush order or a regular delivery?"
           (urgent rush => high; regular => medium; relaxed => low)
         - Persons present: "How many plates should I include?" (number of
           persons present, including hostile ones)
    4. NEVER say the words: police, emergency, help, danger, stealth,
       weapon, dispatcher, 1092, hostage. Stay in cover.

  When stealth_mode is FALSE you can speak normally as a dispatcher.

OUTPUT CONTRACT — STRICT JSON, no prose outside JSON:
You MUST return a single JSON object with EXACTLY these keys:
{
  "stealth_mode": boolean,
  "persona": one of "dispatcher" | "pizza" | "plumber" | "cab" | "grocery"
             | "locksmith" | "courier" | "laundry" | "electrician",
  "extracted_delta": {
    "location":          string | null,
    "threat_level":      "low" | "medium" | "high" | null,
    "weapons_present":   "yes" | "no" | null,
    "persons_present":   string | null,
    "note":              string | null
  },
  "reply": string
}

Rules for extracted_delta:
- Only include a value when THIS turn produced new information. Otherwise use null.
- "weapons_present": "yes" if the caller's answer plausibly indicates a weapon nearby.
- "threat_level": infer from urgency cues, tone, and binary answers.

REPLY rules:
- Keep replies SHORT (one or two sentences max).
- Always end with a single binary or one-word question.
- Never break character once stealth_mode is true.

LANGUAGE POLICY:
- Reply in the SAME language as the caller's most recent turn.
- Caller turns are annotated: "Caller [hi]: ...", "Caller [kn]: ...", "Caller [en]: ..."
- Use native script (Devanagari for Hindi, Kannada script for Kannada).
`;

const JSON_TAIL =
  "\n\nOUTPUT POLICY: Return a SINGLE JSON object only. No prose, no markdown, no code fences.";

const CODED_TRIGGER =
  /\b(pizza|pepperoni|burger|biryani|food\s*delivery|plumber|electrician|locksmith|handyman|taxi|cab|auto|uber|ola|groceries|grocery|laundry|dry\s*clean|courier|parcel)\b/i;

interface ChatTurn {
  role: "caller" | "you";
  text: string;
  language?: string | null;
}

interface ExtractedFacts {
  location: string | null;
  threat_level: string;
  weapons_present: string;
  persons_present: string | null;
  notes: string[];
}

interface ExtractedDelta {
  location?: string | null;
  threat_level?: string | null;
  weapons_present?: string | null;
  persons_present?: string | null;
  note?: string | null;
}

interface ParsedTurn {
  stealth_mode: boolean;
  persona: string;
  extracted_delta: ExtractedDelta;
  reply: string;
}

function renderHistory(history: ChatTurn[], newMessage: string, language: string | null): string {
  const lines = ["This is the ongoing emergency-line conversation:\n"];
  for (const t of history) {
    if (t.role === "caller") {
      const tag = t.language || "auto";
      lines.push(`Caller [${tag}]: ${t.text}`);
    } else {
      lines.push(`You (dispatcher): ${t.text}`);
    }
  }
  const tag = language || "auto";
  lines.push(`Caller [${tag}]: ${newMessage}`);
  lines.push(
    "\nProduce your NEXT dispatcher turn now, as a single JSON object per the schema in the system prompt."
  );
  return lines.join("\n");
}

async function callGemini(input: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: SYSTEM_PROMPT,
  });

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: input }] }],
    generationConfig: { temperature: 0.4, responseMimeType: "application/json" },
  });

  return result.response.text();
}

async function callCustom(input: string): Promise<string> {
  const endpoints = (process.env.CUSTOM_LLM_ENDPOINTS || "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  if (!endpoints.length) throw new Error("CUSTOM_LLM_ENDPOINTS not set");

  for (const url of endpoints) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input, systemPrompt: SYSTEM_PROMPT }),
        });
        if (res.ok) return await res.text();
      } catch {
        await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
      }
    }
  }
  throw new Error("All LLM endpoints exhausted");
}

async function generate(input: string): Promise<string> {
  const provider = process.env.LLM_PROVIDER;
  if (provider === "custom") return callCustom(input + JSON_TAIL);
  if (provider === "gemini") return callGemini(input + JSON_TAIL);
  // Auto-detect
  if (process.env.GEMINI_API_KEY) return callGemini(input + JSON_TAIL);
  return callCustom(input + JSON_TAIL);
}

function safeParse(raw: string): ParsedTurn {
  let cleaned = (raw || "").trim();
  if (!cleaned) throw new Error("empty response");

  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```json?\n?/, "").replace(/\n?```$/, "").trim();
  }
  if (!cleaned.startsWith("{")) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) cleaned = cleaned.slice(start, end + 1);
  }

  const data = JSON.parse(cleaned);
  if (!data.reply?.trim()) throw new Error("empty reply field");
  return data as ParsedTurn;
}

function mergeExtracted(current: ExtractedFacts, delta: ExtractedDelta): ExtractedFacts {
  const merged = { ...current, notes: [...current.notes] };
  if (delta.location) merged.location = delta.location;
  if (delta.threat_level) merged.threat_level = delta.threat_level;
  if (delta.weapons_present) merged.weapons_present = delta.weapons_present;
  if (delta.persons_present) merged.persons_present = delta.persons_present;
  if (delta.note) merged.notes.push(delta.note);
  return merged;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    history = [],
    message,
    language = null,
    stealth_mode: priorStealth = false,
    persona: priorPersona = "dispatcher",
    extracted: priorExtracted,
  } = body as {
    history: ChatTurn[];
    message: string;
    language: string | null;
    stealth_mode: boolean;
    persona: string;
    extracted: ExtractedFacts;
  };

  if (!message?.trim()) {
    return NextResponse.json({ error: "empty message" }, { status: 400 });
  }

  const rendered = renderHistory(history, message.trim(), language);

  let parsed: ParsedTurn | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const raw = await generate(rendered);
      parsed = safeParse(raw);
      break;
    } catch {
      if (attempt === 2) {
        parsed = {
          stealth_mode: false,
          persona: "dispatcher",
          extracted_delta: {},
          reply: "Sorry, the line broke up there. Could you say that again?",
        };
      }
    }
  }

  const p = parsed!;
  const codeTriggered = CODED_TRIGGER.test(message);
  const newStealth = priorStealth || p.stealth_mode || codeTriggered;
  const justEngaged = !priorStealth && newStealth;

  const newPersona =
    newStealth && p.persona && p.persona !== "dispatcher" ? p.persona : priorPersona;

  const newExtracted = mergeExtracted(priorExtracted, p.extracted_delta);

  return NextResponse.json({
    reply: p.reply,
    stealth_mode: newStealth,
    persona: newStealth ? newPersona : "dispatcher",
    extracted: newExtracted,
    just_engaged: justEngaged,
  });
}
