"use client";

import { useEffect } from "react";

export default function PwaRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;

    void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then(async () => {
      const registration = await navigator.serviceWorker.ready;
      const urls = performance.getEntriesByType("resource").map((entry) => entry.name)
        .filter((url) => url.startsWith(location.origin));
      registration.active?.postMessage({ type: "CACHE_URLS", urls });
    }).catch(() => undefined);

    const resumeOnline = () => {
      if (location.pathname === "/offline") location.replace("/overview");
    };
    window.addEventListener("online", resumeOnline);
    return () => window.removeEventListener("online", resumeOnline);
  }, []);

  return null;
}
