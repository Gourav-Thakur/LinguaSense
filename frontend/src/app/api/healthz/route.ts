import { NextResponse } from "next/server";

export async function GET() {
  const sarvamReady = !!process.env.SARVAM_API_KEY;
  return NextResponse.json({
    ok: true,
    stt_ready: sarvamReady,
    stt_loading: false,
    stt_error: sarvamReady ? null : "SARVAM_API_KEY not set",
    stt_provider: "sarvam",
    stt_model: process.env.SARVAM_STT_MODEL || "saarika:v2.5",
  });
}
