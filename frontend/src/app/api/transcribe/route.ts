import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

const SARVAM_URL = "https://api.sarvam.ai/speech-to-text";
const ALLOWED_LANGUAGES = new Set(["en", "hi", "kn"]);

const LANG_MAP: Record<string, string> = {
  auto: "unknown",
  en: "en-IN",
  hi: "hi-IN",
  kn: "kn-IN",
};

function normalizeLang(code: string | null | undefined): string {
  if (!code) return "en";
  const short = code.split("-")[0].toLowerCase();
  return ALLOWED_LANGUAGES.has(short) ? short : "en";
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "SARVAM_API_KEY not configured" }, { status: 503 });
  }

  const formData = await req.formData();
  const audioFile = formData.get("audio") as File | null;
  const language = (formData.get("language") as string) || "auto";

  if (!audioFile || audioFile.size === 0) {
    return NextResponse.json({ error: "empty audio payload" }, { status: 400 });
  }

  const audioBytes = await audioFile.arrayBuffer();
  const sarvamForm = new FormData();
  sarvamForm.append(
    "file",
    new Blob([audioBytes], { type: audioFile.type || "audio/webm" }),
    "utterance.webm"
  );
  sarvamForm.append("model", process.env.SARVAM_STT_MODEL || "saarika:v2.5");
  sarvamForm.append("language_code", LANG_MAP[language] ?? "unknown");

  const res = await fetch(SARVAM_URL, {
    method: "POST",
    headers: { "api-subscription-key": apiKey },
    body: sarvamForm,
  });

  if (!res.ok) {
    const detail = await res.text();
    return NextResponse.json(
      { error: `Sarvam STT ${res.status}: ${detail.slice(0, 200)}` },
      { status: 502 }
    );
  }

  const payload = await res.json();
  const text = ((payload.transcript || payload.text || "") as string).trim();
  const detected = normalizeLang(payload.language_code);

  return NextResponse.json({ text, language: detected });
}
