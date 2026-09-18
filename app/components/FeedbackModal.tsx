"use client";

import { useState, useRef } from "react";
import { createClient } from "../lib/supabase/client";
import type { Profile } from "../lib/domain";
import TurnstileChallenge, { type TurnstileChallengeHandle } from "./auth/TurnstileChallenge";

type FeedbackModalProps = {
  profile: Profile;
  email: string | undefined;
  turnstileSiteKey?: string;
  onClose: () => void;
};

export default function FeedbackModal({ profile, email, turnstileSiteKey, onClose }: FeedbackModalProps) {
  const disableCaptcha = process.env.NEXT_PUBLIC_DISABLE_CAPTCHA === "true";
  const turnstileRef = useRef<TurnstileChallengeHandle>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const MAX_CHARS = 1000;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = message.trim();
    if (!text) return;
    if (text.length > MAX_CHARS) {
      setError(`Message too long (max ${MAX_CHARS} characters)`);
      return;
    }

    if (!disableCaptcha && turnstileSiteKey && !captchaToken) {
      setError("Please complete the security check.");
      return;
    }

    // Anti-spam: max 1 request per 10 minutes
    const lastSub = localStorage.getItem("revit-feedback-time");
    if (lastSub && Date.now() - parseInt(lastSub) < 600000) {
      setError("Please wait a few minutes before sending another feedback.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const client = createClient();
      const { error: submitError } = await client
        .from("feedback")
        .insert({
          user_id: profile.id,
          name: profile.first_name || profile.username,
          email: email || "unknown@revit.local",
          message: text
        });

      if (submitError) throw submitError;

      localStorage.setItem("revit-feedback-time", Date.now().toString());
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err) {
      console.error("Feedback error:", err);
      setError("Failed to submit feedback. Please try again.");
      setSubmitting(false);
      turnstileRef.current?.reset();
      setCaptchaToken(null);
    }
  }

  return (
    <div className="onboarding-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="onboarding-card" style={{ maxWidth: "480px", padding: "32px", position: "relative" }}>
        <button
          className="text-button"
          type="button"
          onClick={onClose}
          style={{ position: "absolute", top: "16px", right: "20px", fontSize: "24px", color: "var(--muted)", padding: "4px" }}
          aria-label="Close"
        >
          &times;
        </button>

        {success ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{
              width: "56px", height: "56px", margin: "0 auto 16px",
              background: "var(--green-soft)", borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center", color: "var(--green)"
            }}>
              <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 style={{ fontSize: "20px", color: "var(--ink)", margin: "0 0 8px" }}>Thank you!</h2>
            <p style={{ color: "var(--muted)", fontSize: "14px", margin: 0 }}>Your feedback helps improve RevIT for everyone.</p>
          </div>
        ) : (
          <>
            <h2 style={{ fontSize: "20px", color: "var(--ink)", margin: "0 0 6px" }}>Send Feedback</h2>
            <p style={{ color: "var(--muted)", fontSize: "13px", margin: "0 0 24px", lineHeight: "1.5" }}>
              Have a suggestion, found a bug, or want to request a feature? Let us know what you think. Alternatively, you can email <a href="mailto:revithoroughly@gmail.com" style={{ color: "var(--brand)", textDecoration: "none" }}>revithoroughly@gmail.com</a>.
            </p>

            <form onSubmit={handleSubmit} style={{ display: "grid", gap: "16px" }}>
              <label style={{ display: "grid", gap: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "13px", fontWeight: "600", color: "var(--ink)" }}>Your message</span>
                  <span style={{ fontSize: "12px", color: message.length > MAX_CHARS ? "var(--red)" : "var(--muted)" }}>
                    {message.length} / {MAX_CHARS}
                  </span>
                </div>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="What's on your mind?"
                  disabled={submitting}
                  required
                  maxLength={MAX_CHARS * 1.5}
                  style={{
                    width: "100%", minHeight: "120px", padding: "12px", borderRadius: "10px",
                    border: "1px solid var(--line)", background: "var(--input)", color: "var(--ink)",
                    fontSize: "14px", resize: "vertical"
                  }}
                />
              </label>

              {(!disableCaptcha && turnstileSiteKey) && (
                <TurnstileChallenge
                  ref={turnstileRef}
                  siteKey={turnstileSiteKey}
                  action="feedback"
                  onTokenChange={setCaptchaToken}
                  onUnavailable={() => setError("The security check could not load.")}
                />
              )}

              {error && <p style={{ color: "var(--red, #e74c3c)", fontSize: "13px", margin: 0 }}>{error}</p>}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "8px" }}>
                <button type="button" className="text-button" onClick={onClose} disabled={submitting}>Cancel</button>
                <button type="submit" className="primary-button" disabled={submitting || !message.trim() || message.length > MAX_CHARS || (!disableCaptcha && !!turnstileSiteKey && !captchaToken)} style={{ padding: "10px 20px" }}>
                  {submitting ? "Sending..." : "Submit Feedback"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
