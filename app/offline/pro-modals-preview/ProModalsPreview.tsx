"use client";

import { useState } from "react";
import ProActivationModal from "../../components/ProActivationModal";
import ProExpiredNotice from "../../components/ProExpiredNotice";
import type { SubscriptionEntitlement } from "../../lib/entitlements";
import type { PublicReviewerBooks } from "../../lib/publicReviewerBooks";
import { verifiedProExpiration } from "../../lib/proExpiryNotice";

type PreviewView = "activation" | "expired";

// Synthetic, verified-expired fixture. Same shape the entitlement verifier reads; nothing is fetched
// and no account exists behind it.
const EXPIRED_FIXTURE: SubscriptionEntitlement = {
  storedPlan: "pro",
  effectivePlan: "free",
  proStartedAt: "2026-08-01T00:00:00.000Z",
  proExpiresAt: "2026-11-01T00:00:00.000Z",
  serverNow: "2026-11-02T00:00:00.000Z",
};

const linkStyle = {
  border: 0,
  background: "transparent",
  color: "var(--green-dark)",
  font: "inherit",
  fontWeight: 650,
  padding: "10px 4px",
  minHeight: 40,
  cursor: "pointer",
  textDecoration: "underline",
} as const;

export default function ProModalsPreview({ view: initialView, reviewers }: { view: PreviewView; reviewers: PublicReviewerBooks }) {
  const [view, setView] = useState<PreviewView>(initialView);
  const [open, setOpen] = useState(true);
  const expiredAt = verifiedProExpiration(EXPIRED_FIXTURE, true);
  const close = () => setOpen(false);

  return (
    <main style={{ minHeight: "100svh", background: "var(--canvas)", color: "var(--ink)", padding: "40px 20px", display: "grid", alignContent: "start", gap: 12 }}>
      <h1 style={{ margin: 0, fontSize: 20, lineHeight: 1.3 }}>Local Pro modal preview</h1>
      <p style={{ margin: 0, maxWidth: 560, fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-soft, var(--ink))" }}>
        Synthetic fixture for {reviewers.books.length} published reviewer editions. No Supabase request, no entitlement lookup, and no account or subscription change.
      </p>
      <nav aria-label="Preview modal" style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
        <a href="?view=activation" style={linkStyle} aria-current={view === "activation" ? "page" : undefined} onClick={() => { setView("activation"); setOpen(true); }}>
          Pro activation modal
        </a>
        <a href="?view=expired" style={linkStyle} aria-current={view === "expired" ? "page" : undefined} onClick={() => { setView("expired"); setOpen(true); }}>
          Expired-Pro notice
        </a>
      </nav>
      {!open && (
        <button type="button" style={linkStyle} onClick={() => setOpen(true)}>
          Reopen preview
        </button>
      )}

      {view === "activation" && (
        <ProActivationModal
          isOpen={open}
          isPreview
          username="preview"
          source="purchased"
          durationDays={90}
          reviewers={reviewers}
          onClose={close}
        />
      )}
      {view === "expired" && expiredAt && (
        <ProExpiredNotice isOpen={open} expiresAt={expiredAt} reviewers={reviewers} onDismiss={close} />
      )}
    </main>
  );
}
