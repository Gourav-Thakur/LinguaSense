"use client";

import { useEffect, useState } from "react";

interface Health {
  ok: boolean;
  stt_ready: boolean;
  stt_loading: boolean;
  stt_error: string | null;
  stt_provider: string;
  stt_model: string;
}

const DEFAULT: Health = {
  ok: false,
  stt_ready: false,
  stt_loading: false,
  stt_error: null,
  stt_provider: "sarvam",
  stt_model: "saarika:v2.5",
};

const HEALTH_URL =
  process.env.NEXT_PUBLIC_HEALTH_URL || "http://localhost:8000/healthz";

export function useBackendHealth(): Health {
  const [health, setHealth] = useState<Health>(DEFAULT);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      try {
        const res = await fetch(HEALTH_URL, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as Partial<Health>;
        if (cancelled) return;
        setHealth({
          ok: !!data.ok,
          stt_ready: !!data.stt_ready,
          stt_loading: !!data.stt_loading,
          stt_error: data.stt_error ?? null,
          stt_provider: data.stt_provider || "sarvam",
          stt_model: data.stt_model || "saarika:v2.5",
        });
        // Once STT is ready, slow the polling way down — we don't need to
        // hammer the endpoint forever.
        if (data.stt_ready && interval) {
          clearInterval(interval);
          interval = setInterval(poll, 30_000);
        }
      } catch {
        if (!cancelled) setHealth((h) => ({ ...h, ok: false }));
      }
    };

    poll();
    interval = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, []);

  return health;
}
