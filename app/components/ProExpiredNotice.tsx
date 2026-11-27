"use client";

import { useEffect, useRef } from "react";
import { AI_LIMITS } from "../lib/entitlements";
import { PRO_CONTACT_URL } from "../lib/proPlans";
import { PUBLIC_REVIEWERS as PUBLISHED_REVIEWERS, type PublicReviewerBooks } from "../lib/publicReviewerBooks";
import styles from "./PlanAnnouncementModal.module.css";
import notice from "./ProExpiredNotice.module.css";

export interface ProExpiredNoticeProps {
  isOpen: boolean;
  expiresAt: string;
  onDismiss: () => void;
  /** Catalog override for the development-only synthetic preview; never used by the app. */
  reviewers?: PublicReviewerBooks;
}

// Shown once per verified expiration event. The list is derived from the same published catalog and
// entitlement limits that gate access; no Pro content, pricing mutation or account write happens here.
export default function ProExpiredNotice({ isOpen, expiresAt, onDismiss, reviewers }: ProExpiredNoticeProps) {
  const PUBLIC_REVIEWERS = reviewers ?? PUBLISHED_REVIEWERS;
  const cardRef = useRef<HTMLDivElement>(null);
  const dismissRef = useRef(onDismiss);
  useEffect(() => { dismissRef.current = onDismiss; }, [onDismiss]);

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cardRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismissRef.current();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previous?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const expiresOn = new Date(expiresAt);
  const formattedExpiry = Number.isFinite(expiresOn.getTime())
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(expiresOn)
    : "";

  return (
    <div
      className={styles.backdrop}
      onClick={(event) => { if (event.target === event.currentTarget) onDismiss(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pro-expired-title"
      aria-describedby="pro-expired-summary"
    >
      <div className={styles.card} ref={cardRef} tabIndex={-1} style={{ maxHeight: "min(calc(100svh - 32px), 840px)" }}>
        <header className={styles.header}>
          <div className={styles.headerMain}>
            <h2 data-tone="negative" id="pro-expired-title" className={styles.title}>Your RevIT Pro has expired</h2>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onDismiss} aria-label="Close Pro expiration notice">
            &times;
          </button>
        </header>

        <div className={styles.body}>
          <p id="pro-expired-summary" className={styles.generalLead}>
            {formattedExpiry ? `Pro access ended on ${formattedExpiry}. ` : "Your Pro access has ended. "}
            Your account is now on RevIT Free. Your progress, sessions, saved settings and Free features stay exactly as they were.
          </p>

          <div className={notice.benefits}>
            <p className={notice.benefitsLead}>What Pro included</p>
            <ul className={styles.miniFeatureList}>
              <li>
                <span className={styles.miniCheck}>✓</span>
                <span><strong>{PUBLIC_REVIEWERS.proBooks.length} Pro-only reviewer editions:</strong> {PUBLIC_REVIEWERS.proNames}</span>
              </li>
              <li>
                <span className={styles.miniCheck}>✓</span>
                <span>Flashcards across all {PUBLIC_REVIEWERS.books.length} published editions</span>
              </li>
              <li>
                <span className={styles.miniCheck}>✓</span>
                <span>Advanced Progress Analytics</span>
              </li>
              <li>
                <span className={styles.miniCheck}>✓</span>
                <span>Weakness Analytics</span>
              </li>
              <li>
                <span className={styles.miniCheck}>✓</span>
                <span>{AI_LIMITS.pro.dailyRequests} RevIT AI tutoring requests every day</span>
              </li>
            </ul>
          </div>
        </div>

        <footer className={styles.footer}>
          <button type="button" className={notice.quietBtn} onClick={onDismiss}>Continue Free</button>
          <a
            className={`${styles.primaryBtn} ${notice.primaryLink}`}
            href={PRO_CONTACT_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Subscribe Again<span className="sr-only"> on Instagram (opens in a new tab)</span>
          </a>
        </footer>
      </div>
    </div>
  );
}
