"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../lib/supabase/client";

export default function VerifyPanel({ email }: { email: string }) {
  const [seconds, setSeconds] = useState(60);
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (seconds <= 0) return;
    const timer = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [seconds]);

  async function resend() {
    setStatus("");
    const { error } = await createClient().auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/overview` },
    });
    setStatus(error ? error.message : "If the address can receive a verification email, a new message has been sent.");
    if (!error) setSeconds(60);
  }

  return (
    <section className="auth-card">
      <span className="brand-mark auth-brand">R</span><p className="eyebrow">Check your email</p><h1>Verify before continuing.</h1>
      <p>We sent a verification link to <strong>{email || "your email address"}</strong>. Open it in this browser to finish signing in.</p>
      <button className="primary-button wide" type="button" onClick={resend} disabled={!email || seconds > 0}>{seconds > 0 ? `Resend in ${seconds}s` : "Resend verification email"}</button>
      {status && <p className="form-status" role="status">{status}</p>}
      <a className="auth-link" href="/auth">Back to sign in</a>
    </section>
  );
}
