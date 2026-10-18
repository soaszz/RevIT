"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import styles from "./ProActivationModal.module.css";

export type ActivationSource = "purchased" | "gift" | "prize";

export interface ProActivationModalProps {
  isOpen: boolean;
  username?: string | null;
  source?: ActivationSource;
  durationDays?: number | null;
  expiresAt?: string | null;
  customMessage?: string | null;
  isExtension?: boolean;
  onClose: () => void;
  onAcknowledge?: () => void;
  isPreview?: boolean;
}

export default function ProActivationModal({
  isOpen,
  username,
  source = "purchased",
  durationDays,
  expiresAt,
  customMessage,
  isExtension = false,
  onClose,
  onAcknowledge,
  isPreview = false,
}: ProActivationModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  const handleDismiss = () => {
    if (onAcknowledge && !isPreview) {
      onAcknowledge();
    }
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        handleDismiss();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  const cleanUsername = username?.replace(/^@+/, "").trim();
  const userGreetingSuffix = cleanUsername ? `, @${cleanUsername}!` : "!";

  const contentConfig = isExtension
    ? {
        kicker: "Access Extended",
        title: `RevIT Pro Extended${userGreetingSuffix}`,
        description: "Your RevIT Pro subscription has been extended. Your upgraded study experience continues uninterrupted!",
        accentClass: styles.accentPurchased,
      }
    : {
        purchased: {
          kicker: "Subscription Active",
          title: `Welcome to RevIT Pro${userGreetingSuffix}`,
          description: "Your RevIT Pro subscription is now active. Enjoy your upgraded review experience!",
          accentClass: styles.accentPurchased,
        },
        gift: {
          kicker: "Complimentary Access",
          title: `You've received RevIT Pro${userGreetingSuffix}`,
          description: "You've been gifted access to RevIT Pro. Enjoy your upgraded review experience!",
          accentClass: styles.accentGift,
        },
        prize: {
          kicker: "Giveaway Winner",
          title: `You've won RevIT Pro${userGreetingSuffix}`,
          description: "Congratulations! You've received RevIT Pro as a prize. Your Pro features are now unlocked!",
          accentClass: styles.accentPrize,
        },
      }[source] || {
        kicker: "Subscription Active",
        title: `Welcome to RevIT Pro${userGreetingSuffix}`,
        description: "Your RevIT Pro subscription is now active. Enjoy your upgraded review experience!",
        accentClass: styles.accentPurchased,
      };

  const formattedExpiry = expiresAt
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(new Date(expiresAt))
    : null;

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleDismiss();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pro-activation-title"
    >
      <div className={styles.card} ref={modalRef}>
        {isPreview && (
          <div className={styles.previewIndicator} role="note">
            <span className={styles.previewDot} aria-hidden="true" />
            <span>Admin Live Preview (No database changes)</span>
          </div>
        )}

        <header className={styles.header}>
          <div className={styles.headerMascot}>
            <Image
              src="/revit-frog.png"
              alt="RevIT Mascot"
              width={56}
              height={56}
              className={styles.mascotImg}
              priority
              unoptimized
            />
          </div>

          <div className={styles.headerText}>
            <span className={`${styles.kicker} ${contentConfig.accentClass}`}>
              {contentConfig.kicker}
            </span>
            <h2 id="pro-activation-title" className={styles.title}>
              {contentConfig.title}
            </h2>
          </div>

          <button
            type="button"
            className={styles.closeBtn}
            onClick={handleDismiss}
            aria-label="Close activation dialog"
          >
            &times;
          </button>
        </header>

        <div className={styles.body}>
          <p className={styles.description}>{contentConfig.description}</p>

          {customMessage && customMessage.trim().length > 0 && (
            <div className={styles.messageBox}>
              <span className={styles.messageLabel}>Personal Message</span>
              <p className={styles.messageText}>{customMessage.trim()}</p>
            </div>
          )}

          <div className={styles.perksCard}>
            <div className={styles.perksHeader}>
              <span className={styles.proWordmark}>RevIT Pro Privileges</span>
              {formattedExpiry ? (
                <span className={styles.expiryNote}>Active until {formattedExpiry}</span>
              ) : durationDays ? (
                <span className={styles.expiryNote}>Active for {durationDays} days</span>
              ) : null}
            </div>

            <ul className={styles.perksList}>
              <li className={styles.perkItem}>
                <span className={styles.perkCheck} aria-hidden="true">✓</span>
                <span>Full Harr &amp; Ciulla (4th Edition) question libraries</span>
              </li>
              <li className={styles.perkItem}>
                <span className={styles.perkCheck} aria-hidden="true">✓</span>
                <span>Complete flashcard decks and advanced study options</span>
              </li>
              <li className={styles.perkItem}>
                <span className={styles.perkCheck} aria-hidden="true">✓</span>
                <span>Deep Weakness Analytics &amp; repetitive mistake tracking</span>
              </li>
              <li className={styles.perkItem}>
                <span className={styles.perkCheck} aria-hidden="true">✓</span>
                <span>15 RevIT AI tutoring requests every day</span>
              </li>
            </ul>
          </div>
        </div>

        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={handleDismiss}
          >
            Start Reviewing
          </button>
        </footer>
      </div>
    </div>
  );
}
