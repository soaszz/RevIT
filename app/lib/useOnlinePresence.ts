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

    channel
      .on("presence", { event: "sync" }, updateCount)
      .on("presence", { event: "join" }, updateCount)
      .on("presence", { event: "leave" }, updateCount)
      .subscribe(async (status: string) => {
        if (status === "SUBSCRIBED") {
          try {
            await channel.track({
              online_at: new Date().toISOString(),
            });
          } catch {
            // Ignore tracking failure
          }
        }
      });

    const handleBeforeUnload = () => {
      void channel.untrack();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      isMounted = false;
      window.removeEventListener("beforeunload", handleBeforeUnload);
      void channel.untrack();
      void client.removeChannel(channel);
    };
  }, []);

  return onlineCount;
}
