"use client";

import { useEffect, useState } from "react";
import RevITApp from "../RevITApp";

type OfflineUser = { id: string; email: string; username?: string };

export default function OfflineApp() {
  const [user, setUser] = useState<OfflineUser | null | undefined>(undefined);

  useEffect(() => {
    try {
      setUser(JSON.parse(localStorage.getItem("revit-offline-user") ?? "null") as OfflineUser | null);
    } catch {
      setUser(null);
    }
  }, []);

  if (user === undefined) return null;
  return <RevITApp initialUser={user} cloudEnabled={Boolean(user)} offlineMode />;
}
