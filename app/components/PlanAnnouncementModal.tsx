"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import styles from "./PlanAnnouncementModal.module.css";

export type PlanModalVariant = "general" | "gift";

export interface GiftedUserConfig {
  id: string;
  name: string;
  greeting: string;
  expiresAt: string;
  durationDesc: string;
}

export const GIFTED_PRO_USERS: Record<string, GiftedUserConfig> = {
  "bb717bd1-3473-487c-9658-1c6d239ed4d4": {
    id: "bb717bd1-3473-487c-9658-1c6d239ed4d4",
    name: "Fia",
    greeting: "Hi Fia!",
    expiresAt: "2028-12-31T23:59:59Z",
    durationDesc: "for over 2 years (through end of 2028)",
  },
  "e85207e0-ce9b-4f96-93d2-879ff55d12ee": {
    id: "e85207e0-ce9b-4f96-93d2-879ff55d12ee",
    name: "Mich",
    greeting: "Hi Mich!",
    expiresAt: "2028-12-31T23:59:59Z",
    durationDesc: "for over 2 years (through end of 2028)",
  },
  "b5e8693f-4f7a-401f-8bdf-844169e75450": {
    id: "b5e8693f-4f7a-401f-8bdf-844169e75450",
    name: "Claire (Baby)",
    greeting: "Hi Baby!",
    expiresAt: "2099-06-10T23:59:59Z",
    durationDesc: "lifetime access (through June 10, 2099)",
  },
};

export const GIFTED_PRO_USER_IDS: string[] = Object.keys(GIFTED_PRO_USERS);

export interface PlanAnnouncementModalProps {
  isOpen: boolean;
  variant: PlanModalVariant;
  onClose: () => void;
  onExplorePricing: () => void;
  /**
   * Allows interactive toggling between General and Gift views
   * so you can inspect and approve both modal designs.
   */
  allowPreviewToggle?: boolean;
  onToggleVariant?: (next: PlanModalVariant) => void;
  proExpiresAt?: string | null;
  recipientGreeting?: string;
  previewRecipientKey?: string | null;
}

export default function PlanAnnouncementModal({
  isOpen,
  variant,
  onClose,
  onExplorePricing,
  allowPreviewToggle = true,
  onToggleVariant,
  proExpiresAt,
  recipientGreeting,
  previewRecipientKey,
}: PlanAnnouncementModalProps) {
  const [activeVariant, setActiveVariant] = useState<PlanModalVariant>(variant);
  const [selectedPreviewUser, setSelectedPreviewUser] = useState<string | null>(
    previewRecipientKey ?? (variant === "gift" ? Object.keys(GIFTED_PRO_USERS)[0] : null)
  );

  useEffect(() => {
    setActiveVariant(variant);
    if (previewRecipientKey !== undefined) {
      setSelectedPreviewUser(previewRecipientKey);
    }
  }, [variant, previewRecipientKey]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleVariantSwitch = (target: PlanModalVariant) => {
    setActiveVariant(target);
    onToggleVariant?.(target);
  };

  const selectedUserConfig = selectedPreviewUser ? GIFTED_PRO_USERS[selectedPreviewUser] : undefined;
  const effectiveExpiryDate = selectedUserConfig?.expiresAt || proExpiresAt || "2028-12-31T23:59:59Z";

  const formattedExpiry = new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(
    new Date(effectiveExpiryDate)
  );

  const durationDesc = selectedUserConfig?.durationDesc || "for over 2 years (through end of 2028)";

  const currentGreeting = selectedUserConfig
    ? selectedUserConfig.greeting
    : (recipientGreeting ?? "");

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="plan-modal-title"
    >
      <div className={styles.card}>
        {/* Developer / Approval Preview Switcher Bar */}
        {allowPreviewToggle && (
          <div className={styles.previewBar}>
            <span className={styles.previewLabel}>
              <span>👀</span> Preview Mode:
            </span>
            <div className={styles.previewToggleGroup}>
              <button
                type="button"
                className={`${styles.previewToggleBtn} ${activeVariant === "general" ? styles.active : ""}`}
                onClick={() => {
                  handleVariantSwitch("general");
                  setSelectedPreviewUser(null);
                }}
              >
                Existing Users (Free vs Pro)
              </button>
              {Object.entries(GIFTED_PRO_USERS).map(([id, config]) => {
                const isSelected = activeVariant === "gift" && selectedPreviewUser === id;
                return (
                  <button
                    key={id}
                    type="button"
                    className={`${styles.previewToggleBtn} ${isSelected ? styles.active : ""}`}
                    onClick={() => {
                      handleVariantSwitch("gift");
                      setSelectedPreviewUser(id);
                    }}
                  >
                    Preview: {config.name} ({config.greeting})
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* VARIANT A: GIFTED EARLY ACCESS FRIENDS (Pro until 2028)          */}
        {/* ================================================================= */}
        {activeVariant === "gift" ? (
          <>
            <header className={styles.header}>
              <div className={styles.headerMain}>
                <div className={styles.badgeRow}>
                  <span className={`${styles.badge} ${styles.badgeGift}`}>
                    ✨ Early Access Gift · RevIT Pro
                  </span>
                </div>
                <div className={styles.titleRow}>
                  <span className={`${styles.iconWrap} ${styles.giftIcon}`} aria-hidden="true">
                    <Image
                      src="/revit-frog.png"
                      alt="RevIT"
                      width={30}
                      height={30}
                      className={styles.frogIcon}
                      unoptimized
                    />
                  </span>
                  <h2 id="plan-modal-title" className={styles.title}>
                    {currentGreeting ? `${currentGreeting} ` : ""}Thank you for using and supporting RevIT during its early access! 💚
                  </h2>
                </div>
              </div>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={onClose}
                aria-label="Close gift announcement"
              >
                &times;
              </button>
            </header>

            <div className={styles.body}>
              <p className={styles.giftMessage}>
                As a small thank you, I’m giving you RevIT Pro for free. I really appreciate you being one of the early users and supporting RevIT while it continues to grow and improve.
              </p>

              {/* Pro Highlight Card with Duration */}
              <div className={styles.giftHighlightBox}>
                <div className={styles.giftBoxHeader}>
                  <strong>
                    <span>👑</span> RevIT Pro Unlocked
                  </strong>
                  <span className={styles.giftDurationPill}>
                    Active until {formattedExpiry}
                  </span>
                </div>
                <p className={styles.giftBoxDesc}>
                  You have full complimentary Pro privileges active on your account {durationDesc}:
                </p>
                <ul className={styles.giftFeaturesList}>
                  <li>
                    <span>✓</span> Full Harr &amp; Ciulla (4th Edition) question libraries
                  </li>
                  <li>
                    <span>✓</span> All complete flashcard decks &amp; upcoming book editions
                  </li>
                  <li>
                    <span>✓</span> Deep Weakness Analytics &amp; personal mistake bank
                  </li>
                  <li>
                    <span>✓</span> 15 RevIT AI tutoring requests every day
                  </li>
                </ul>
              </div>

              <p className={styles.giftSignOff}>Enjoy RevIT Pro!</p>
            </div>

            <footer className={styles.footer}>
              <button type="button" className={styles.primaryBtn} onClick={onClose}>
                Start reviewing with Pro →
              </button>
            </footer>
          </>
        ) : (
          /* ================================================================= */
          /* VARIANT B: GENERAL EXISTING USERS (Free vs Pro comparison)       */
          /* ================================================================= */
          <>
            <header className={styles.header}>
              <div className={styles.headerMain}>
                <div className={styles.badgeRow}>
                  <span className={`${styles.badge} ${styles.badgeGeneral}`}>
                    New in RevIT
                  </span>
                </div>
                <div className={styles.titleRow}>
                  <span className={styles.iconWrap} aria-hidden="true">
                    <Image
                      src="/revit-frog.png"
                      alt="RevIT"
                      width={30}
                      height={30}
                      className={styles.frogIcon}
                      unoptimized
                    />
                  </span>
                  <h2 id="plan-modal-title" className={styles.title}>
                    Choose the review access that fits you
                  </h2>
                </div>
              </div>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={onClose}
                aria-label="Close plans announcement"
              >
                &times;
              </button>
            </header>

            <div className={styles.body}>
              <p className={styles.generalLead}>
                RevIT now offers two options for your Medical Technology board exam preparation:
              </p>

              <div className={styles.plansMiniGrid}>
                {/* Free Column */}
                <div className={styles.planMiniCard}>
                  <div className={styles.miniCardHeader}>
                    <span className={styles.planTag}>FREE</span>
                    <span className={styles.planMiniPrice}>₱0 <small>/ forever</small></span>
                  </div>
                  <ul className={styles.miniFeatureList}>
                    <li>
                      <span className={styles.miniCheck}>✓</span>
                      <span>Harr question bank &amp; flashcards</span>
                    </li>
                    <li>
                      <span className={styles.miniCheck}>✓</span>
                      <span>Timed MCQ practice &amp; study history</span>
                    </li>
                    <li>
                      <span className={styles.miniCheck}>✓</span>
                      <span>Academic Planner, Grades &amp; Calendar</span>
                    </li>
                    <li>
                      <span className={styles.miniCheck}>✓</span>
                      <span>3 daily RevIT AI tutoring requests</span>
                    </li>
                  </ul>
                </div>

                {/* Pro Column */}
                <div className={`${styles.planMiniCard} ${styles.proFeatured}`}>
                  <div className={styles.miniCardHeader}>
                    <span className={`${styles.planTag} ${styles.planTagPro}`}>PRO ACCESS</span>
                    <span className={styles.planMiniPrice}>₱49 <small>/ early access</small></span>
                  </div>
                  <ul className={styles.miniFeatureList}>
                    <li>
                      <span className={styles.miniCheck}>✓</span>
                      <span><strong>All Free features included</strong></span>
                    </li>
                    <li>
                      <span className={styles.miniCheck}>✓</span>
                      <span><strong>Full Harr &amp; Ciulla (4th Ed)</strong> banks</span>
                    </li>
                    <li>
                      <span className={styles.miniCheck}>✓</span>
                      <span>Deep <strong>Weakness Analytics</strong></span>
                    </li>
                    <li>
                      <span className={styles.miniCheck}>✓</span>
                      <span><strong>15 daily</strong> RevIT AI tutoring requests</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <footer className={styles.footer}>
              <button type="button" className={styles.secondaryBtn} onClick={onClose}>
                Continue with Free
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => {
                  onClose();
                  onExplorePricing();
                }}
              >
                Compare full details &amp; pricing →
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
