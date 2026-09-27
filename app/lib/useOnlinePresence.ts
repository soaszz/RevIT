"use client";

import { useEffect, useState } from "react";
import { createClient } from "./supabase/client";
import { isSupabaseConfigured } from "./supabase/config";

function getPresenceKey(): string {
  if (typeof window === "undefined") return "server";
  try {
    const key = sessionStorage.getItem("revit-presence-session-id");
    if (key) return key;
    const newKey = "session_" + (window.crypto?.randomUUID ? window.crypto.randomUUID() : Math.random().toString(36).slice(2));
    sessionStorage.setItem("revit-presence-session-id", newKey);
    return newKey;
  } catch {
    return "session_fallback";
  }
}

export function useOnlinePresence(_userId?: string | null): number {
  const [onlineCount, setOnlineCount] = useState<number>(1);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      return;
    }

    let isMounted = true;
    let isTracked = false;
    const client = createClient();
    const presenceKey = getPresenceKey();

    const channel = client.channel("online-learners", {
      config: {
        presence: {
          key: presenceKey,
        },
      },
    });

    const updateCount = () => {
      if (!isMounted) return;
      const state = channel.presenceState();
      const distinctUsers = Object.keys(state).length;
      setOnlineCount(Math.max(1, distinctUsers));
    };

    const trackPresence = async () => {
      if (!isMounted || isTracked) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      try {
        await channel.track({
          online_at: new Date().toISOString(),
        });
        isTracked = true;
      } catch {
        // Ignore tracking failure
      }
    };

    const untrackPresence = async () => {
      if (!isTracked) return;
      try {
        await channel.untrack();
        isTracked = false;
      } catch {
        // Ignore untrack failure
      }
    };

    channel
      .on("presence", { event: "sync" }, updateCount)
      .on("presence", { event: "join" }, updateCount)
      .on("presence", { event: "leave" }, updateCount)
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          void trackPresence();
        }
      });

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void trackPresence();
      } else {
        void untrackPresence();
      }
    };

    const handleBeforeUnload = () => {
      void untrackPresence();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      isMounted = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      void untrackPresence();
      void client.removeChannel(channel);
    };
  }, []);

  return onlineCount;
}
