"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useOnlineStatus } from "../lib/useOnlineStatus";

export default function ConnectionStatusModal() {
  const online = useOnlineStatus();
  const [dismissed, setDismissed] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (online) {
      setDismissed(false);
      return;
    }
    if (dismissed) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = setTimeout(() => buttonRef.current?.focus(), 10);
    return () => {
      clearTimeout(timer);
      document.body.style.overflow = originalOverflow;
    };
  }, [dismissed, online]);

  if (online || dismissed) return null;

  return createPortal(
    <div className="confirm-bg-overlay" role="alertdialog" aria-modal="true" aria-labelledby="offline-title" aria-describedby="offline-description">
      <div className="confirm-modal" style={{ textAlign: "center", padding: "34px 32px" }}>
        <div aria-hidden="true" style={{ width: 58, height: 58, margin: "0 auto 18px", display: "grid", placeItems: "center", borderRadius: "50%", background: "var(--amber-soft)", color: "var(--amber)" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M8.5 16a6 6 0 0 1 7 0" /><path d="M12 20h.01" /><path d="m3 3 18 18" />
          </svg>
        </div>
        <h2 id="offline-title" style={{ margin: "0 0 10px", fontSize: 21, letterSpacing: "-.03em" }}>You’re offline</h2>
        <p id="offline-description" style={{ margin: "0 0 22px", color: "var(--muted)", fontSize: 14, lineHeight: 1.6 }}>
          You can keep reviewing. Progress saves on this device and syncs automatically when your connection returns. AI, rankings, and account changes stay unavailable offline.
        </p>
        <button ref={buttonRef} className="primary-button" type="button" onClick={() => setDismissed(true)}>Continue offline</button>
      </div>
    </div>,
    document.body,
  );
}
