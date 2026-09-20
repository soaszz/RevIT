import React from 'react';

type CustomConfirmProps = {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function CustomConfirm({ isOpen, title, message, confirmLabel = "Confirm", onConfirm, onCancel }: CustomConfirmProps) {
  if (!isOpen) return null;

  return (
    <div className="confirm-bg-overlay">
      <div className="confirm-modal">
        <h2 style={{ margin: "0 0 16px", fontSize: "21px", letterSpacing: "-.03em" }}>{title}</h2>
        <p style={{ margin: "0 0 28px", color: "var(--muted)", fontSize: "14px", lineHeight: "1.6" }}>{message}</p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
          <button className="text-button quiet" type="button" onClick={onCancel} style={{ fontSize: "13px" }}>Cancel</button>
          <button className="primary-button" type="button" onClick={onConfirm} style={{ padding: "10px 18px", fontSize: "13px", background: "var(--danger)", color: "#fff", boxShadow: "none" }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
