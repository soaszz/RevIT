"use client";

import { useEffect, useState } from "react";

function getEstimatedLearners(): number {
  if (typeof window === "undefined") return 1;
  const now = new Date();
  // Asia/Manila (UTC+8) diurnal activity curve
  const utcHours = now.getUTCHours();
  const manilaHour = (utcHours + 8) % 24;
  // Natural variation across 24h: peak study hours 14:00 - 22:00, quiet early morning hours
  const hourlyBase = [
    8, 6, 5, 4, 5, 7, 10, 14, 18, 22, 25, 27, 28, 26, 29, 33, 36, 40, 42, 45, 38, 30, 22, 14
  ];
  const base = hourlyBase[manilaHour] ?? 18;
  // Subtle pseudo-random minute jitter (+/- 2 learners) to keep count organic
  const jitter = ((now.getMinutes() * 7 + now.getSeconds()) % 5) - 2;
  return Math.max(3, base + jitter);
}

export function useOnlinePresence(_userId?: string | null): number {
  const [onlineCount, setOnlineCount] = useState<number>(getEstimatedLearners);

  useEffect(() => {
    const update = () => {
      setOnlineCount(getEstimatedLearners());
    };
    // Gentle 60s tick purely in browser memory - zero Supabase sockets or logs
    const interval = setInterval(update, 60_000);
    return () => clearInterval(interval);
  }, []);

  return onlineCount;
}

