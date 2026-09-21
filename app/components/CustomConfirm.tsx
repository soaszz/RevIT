"use client";

import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';

type CustomConfirmProps = {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function CustomConfirm({ isOpen, title, message, confirmLabel = "Confirm", onConfirm, onCancel }: CustomConfirmProps) {
  const [mounted, setMounted] = useState(false);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    // Prevent background scroll
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = "hidden";

    // Auto-focus confirm button
    const timer = setTimeout(() => confirmBtnRef.current?.focus(), 10);

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalStyle;
      window.removeEventListener("keydown", handleKeyDown);
      clearTimeout(timer);
    };
  }, [isOpen, onCancel]);

  if (!isOpen || !mounted) return null;

  const modal = (
    <div
      className="confirm-bg-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="confirm-modal">
        <h2 style={{ margin: "0 0 16px", fontSize: "21px", letterSpacing: "-.03em" }}>{title}</h2>
        <p style={{ margin: "0 0 28px", color: "var(--muted)", fontSize: "14px", lineHeight: "1.6" }}>{message}</p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
          <button className="text-button quiet" type="button" onClick={onCancel} style={{ fontSize: "13px" }}>Cancel</button>
          <button ref={confirmBtnRef} className="primary-button" type="button" onClick={onConfirm} style={{ padding: "10px 18px", fontSize: "13px", background: "var(--danger)", color: "#fff", boxShadow: "none" }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
