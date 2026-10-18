"use client";

import React, { useEffect } from "react";
import styles from "./ProgressionToast.module.css";

export type ProgressionToastItem = {
  id: string;
  type: "mission" | "level_up";
  title: string;
  subtitle: string;
};

export default function ProgressionToast({
  toasts,
  onDismiss,
}: {
  toasts: ProgressionToastItem[];
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    if (!toasts.length) return;
    const oldest = toasts[0];
    const timer = setTimeout(() => {
      onDismiss(oldest.id);
    }, 4500);
    return () => clearTimeout(timer);
  }, [toasts, onDismiss]);

  if (!toasts.length) return null;

  return (
    <div className={styles.toastContainer} aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`${styles.toast} ${toast.type === "level_up" ? styles.toastLevelUp : ""}`}
        >
          <div className={styles.iconBox}>
            {toast.type === "level_up" ? "▲" : "✓"}
          </div>
          <div className={styles.toastContent}>
            <span className={styles.toastTitle}>{toast.title}</span>
            <span className={styles.toastSubtitle}>{toast.subtitle}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
