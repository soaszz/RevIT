"use client";

import { useEffect, useState } from "react";
import type { AiAcademicPermissionState } from "../lib/aiGradeAssistant";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  permissions: AiAcademicPermissionState;
  onSave: (next: AiAcademicPermissionState) => void;
};

export default function AiAcademicSettingsModal({
  isOpen,
  onClose,
  permissions,
  onSave,
}: Props) {
  const [draft, setDraft] = useState<AiAcademicPermissionState>(permissions);
  const [showConsentGate, setShowConsentGate] = useState(false);

  useEffect(() => {
    setDraft(permissions);
    setShowConsentGate(false);
  }, [permissions, isOpen]);

  if (!isOpen) return null;

  function handleMasterToggle() {
    if (!draft.masterEnabled) {
      // Prompt with consent explanation before enabling
      setShowConsentGate(true);
    } else {
      setDraft((prev) => ({
        ...prev,
        masterEnabled: false,
        gradesEnabled: false,
      }));
    }
  }

  function handleAcceptConsent() {
    setDraft((prev) => ({
      ...prev,
      masterEnabled: true,
      gradesEnabled: true,
      consentGivenAt: new Date().toISOString(),
    }));
    setShowConsentGate(false);
  }

  function handleSave() {
    onSave(draft);
    onClose();
  }

  return (
    <div
      className="profile-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="profile-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-settings-title"
        style={{ maxWidth: "560px", maxHeight: "calc(100svh - 32px)", overflowY: "auto" }}
      >
        <div className="profile-modal-heading" style={{ marginBottom: "16px" }}>
          <div>
            <p className="eyebrow" style={{ color: "var(--muted)", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 4px" }}>
              Academic Context
            </p>
            <h2 id="ai-settings-title" style={{ fontSize: "18px", margin: 0, fontWeight: 720 }}>
              Personalized Assistance Settings
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close academic settings"
            style={{ border: "none", background: "transparent", color: "var(--muted)", cursor: "pointer", fontSize: "18px", padding: "6px" }}
          >
            ×
          </button>
        </div>

        {showConsentGate ? (
          <div style={{ display: "grid", gap: "14px", padding: "14px", background: "var(--surface-soft)", borderRadius: "12px", border: "1px solid var(--line)" }}>
            <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "var(--ink)" }}>
              Data Privacy & Groq Disclosure
            </h3>
            <p style={{ margin: 0, fontSize: "12px", lineHeight: 1.6, color: "var(--muted)" }}>
              Enabling personalized assistance allows RevIT AI to read your course grades, component weights, and passing criteria to calculate required final exam scores, current averages, and target feasibility.
            </p>
            <div style={{ display: "grid", gap: "8px", fontSize: "12px", color: "var(--muted)", lineHeight: 1.5 }}>
              <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                <span style={{ color: "var(--green)", fontWeight: 700 }}>•</span>
                <span><strong>External AI Processing:</strong> Relevant, minimal academic summaries are transmitted securely to Groq for language generation. This feature is not entirely on-device.</span>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                <span style={{ color: "var(--green)", fontWeight: 700 }}>•</span>
                <span><strong>Strictly Read-Only:</strong> RevIT AI cannot modify, write, or delete your grades, study plans, or academic records.</span>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                <span style={{ color: "var(--green)", fontWeight: 700 }}>•</span>
                <span><strong>Deterministic Math:</strong> Calculations use verified algorithms before Groq provides the explanation, preventing fabricated results.</span>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                <span style={{ color: "var(--green)", fontWeight: 700 }}>•</span>
                <span><strong>Revocable Anytime:</strong> You can disable this master switch or specific categories at any moment.</span>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
              <button
                type="button"
                onClick={() => setShowConsentGate(false)}
                style={{ border: "none", background: "transparent", color: "var(--muted)", fontSize: "12px", fontWeight: 600, padding: "8px 12px", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAcceptConsent}
                style={{ border: "none", background: "var(--green)", color: "var(--accent-ink)", fontSize: "12px", fontWeight: 700, padding: "8px 16px", borderRadius: "8px", cursor: "pointer" }}
              >
                I Understand & Enable
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: "18px" }}>
            {/* Master Toggle Card */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 16px",
                borderRadius: "12px",
                background: draft.masterEnabled ? "var(--surface-tint)" : "var(--surface-soft)",
                border: "1px solid var(--line)",
              }}
            >
              <div>
                <strong style={{ display: "block", fontSize: "13px", color: "var(--ink)", fontWeight: 720 }}>
                  Enable Personalized Academic Assistance
                </strong>
                <span style={{ fontSize: "11px", color: "var(--muted)", lineHeight: 1.4 }}>
                  Master switch governing all academic data access. Defaults to off.
                </span>
              </div>
              <button
                type="button"
                onClick={handleMasterToggle}
                style={{
                  border: "none",
                  background: draft.masterEnabled ? "var(--green)" : "var(--line)",
                  color: draft.masterEnabled ? "var(--accent-ink)" : "var(--muted)",
                  padding: "6px 14px",
                  borderRadius: "8px",
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "background 0.2s ease",
                }}
              >
                {draft.masterEnabled ? "Enabled" : "Disabled"}
              </button>
            </div>

            {/* Individual Permissions */}
            <div style={{ display: "grid", gap: "12px" }}>
              <p style={{ margin: 0, fontSize: "11px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Permitted Data Categories
              </p>

              {/* Grades & Gradebook */}
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "14px",
                  padding: "12px 14px",
                  borderRadius: "10px",
                  background: "var(--paper)",
                  border: "1px solid var(--line)",
                  opacity: draft.masterEnabled ? 1 : 0.6,
                }}
              >
                <div>
                  <strong style={{ display: "block", fontSize: "12px", color: "var(--ink)", fontWeight: 700 }}>
                    Grades & Gradebook
                  </strong>
                  <span style={{ fontSize: "11px", color: "var(--muted)", lineHeight: 1.4 }}>
                    Allows asking: "What grade do I need in finals to pass Clinical Chemistry?", "What is my current average in Hematology?".
                  </span>
                </div>
                <button
                  type="button"
                  disabled={!draft.masterEnabled}
                  onClick={() => setDraft((p) => ({ ...p, gradesEnabled: !p.gradesEnabled }))}
                  style={{
                    border: "none",
                    background: draft.masterEnabled && draft.gradesEnabled ? "var(--green)" : "var(--line)",
                    color: draft.masterEnabled && draft.gradesEnabled ? "var(--accent-ink)" : "var(--muted)",
                    padding: "5px 12px",
                    borderRadius: "6px",
                    fontSize: "10px",
                    fontWeight: 700,
                    cursor: draft.masterEnabled ? "pointer" : "not-allowed",
                  }}
                >
                  {draft.masterEnabled && draft.gradesEnabled ? "Allowed" : "Blocked"}
                </button>
              </div>

              {/* Progress Analytics (Phase 2) */}
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "14px",
                  padding: "12px 14px",
                  borderRadius: "10px",
                  background: "var(--paper)",
                  border: "1px solid var(--line)",
                  opacity: 0.5,
                }}
              >
                <div>
                  <strong style={{ display: "block", fontSize: "12px", color: "var(--ink)", fontWeight: 700 }}>
                    Progress Analytics
                  </strong>
                  <span style={{ fontSize: "11px", color: "var(--muted)", lineHeight: 1.4 }}>
                    Subject accuracy trends and question volume metrics. (Phase 2 integration)
                  </span>
                </div>
                <span style={{ fontSize: "10px", color: "var(--muted)", fontWeight: 600, padding: "5px 8px" }}>
                  Phase 2
                </span>
              </div>

              {/* Weakness Analytics (Phase 2) */}
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "14px",
                  padding: "12px 14px",
                  borderRadius: "10px",
                  background: "var(--paper)",
                  border: "1px solid var(--line)",
                  opacity: 0.5,
                }}
              >
                <div>
                  <strong style={{ display: "block", fontSize: "12px", color: "var(--ink)", fontWeight: 700 }}>
                    Weakness Analytics
                  </strong>
                  <span style={{ fontSize: "11px", color: "var(--muted)", lineHeight: 1.4 }}>
                    Identified subtopic gaps and mastery classifications. (Phase 2 integration)
                  </span>
                </div>
                <span style={{ fontSize: "10px", color: "var(--muted)", fontWeight: 600, padding: "5px 8px" }}>
                  Phase 2
                </span>
              </div>

              {/* Planner (Phase 2) */}
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "14px",
                  padding: "12px 14px",
                  borderRadius: "10px",
                  background: "var(--paper)",
                  border: "1px solid var(--line)",
                  opacity: 0.5,
                }}
              >
                <div>
                  <strong style={{ display: "block", fontSize: "12px", color: "var(--ink)", fontWeight: 700 }}>
                    Study Planner
                  </strong>
                  <span style={{ fontSize: "11px", color: "var(--muted)", lineHeight: 1.4 }}>
                    Upcoming exam dates and scheduled study activities. Remains local. (Phase 2 integration)
                  </span>
                </div>
                <span style={{ fontSize: "10px", color: "var(--muted)", fontWeight: 600, padding: "5px 8px" }}>
                  Phase 2
                </span>
              </div>

              {/* Review Library (Phase 2) */}
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "14px",
                  padding: "12px 14px",
                  borderRadius: "10px",
                  background: "var(--paper)",
                  border: "1px solid var(--line)",
                  opacity: 0.5,
                }}
              >
                <div>
                  <strong style={{ display: "block", fontSize: "12px", color: "var(--ink)", fontWeight: 700 }}>
                    Review Library Context
                  </strong>
                  <span style={{ fontSize: "11px", color: "var(--muted)", lineHeight: 1.4 }}>
                    Harr vs. Ciulla book editions, subject structure, and available topics. (Phase 2 integration)
                  </span>
                </div>
                <span style={{ fontSize: "10px", color: "var(--muted)", fontWeight: 600, padding: "5px 8px" }}>
                  Phase 2
                </span>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "var(--muted)",
                  padding: "8px 14px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                style={{
                  border: "none",
                  background: "var(--green)",
                  color: "var(--accent-ink)",
                  padding: "8px 18px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Save Settings
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
