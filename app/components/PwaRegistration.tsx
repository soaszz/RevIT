"use client";

import { useEffect } from "react";

export default function PwaRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;

    void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then(async () => {
      const registration = await navigator.serviceWorker.ready;
      registration.active?.postMessage({ type: "WARM_OFFLINE_SHELL" });
    }).catch(() => undefined);

    const resumeOnline = () => {
      if (location.pathname === "/offline") location.replace("/overview");
    };
    window.addEventListener("online", resumeOnline);
    return () => window.removeEventListener("online", resumeOnline);
  }, []);

  return null;
}
