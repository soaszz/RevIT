"use client";

import { type FormEvent, useRef, useState } from "react";
import TurnstileChallenge, { type TurnstileChallengeHandle } from "../../components/auth/TurnstileChallenge";
import { createClient } from "../../lib/supabase/client";

export default function ForgotPanel({ turnstileSiteKey }: { turnstileSiteKey: string }) {
  const turnstileRef = useRef<TurnstileChallengeHandle>(null);
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [status, setStatus] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!captchaToken) return setStatus("Please complete the security check.");
    setPending(true); setStatus("");
    const { error } = await createClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset`,
      captchaToken,
    });
    if (error) {
      setStatus("The recovery request could not be completed. Please try again.");
      turnstileRef.current?.reset();
      setCaptchaToken(null);
    } else {
      setSent(true);
    }
    setPending(false);
  }
  return (
    <form className="auth-card" onSubmit={submit}>
      <span className="brand-mark auth-brand">R</span><p className="eyebrow">Password recovery</p><h1>Reset your password.</h1>
      <p>Enter your email. For privacy, the confirmation is the same whether or not an account exists.</p>
      <label><span>Email</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      <TurnstileChallenge ref={turnstileRef} siteKey={turnstileSiteKey} action="recovery" onTokenChange={setCaptchaToken} onUnavailable={() => setStatus("The security check could not load. Please try again.")} />
      {status && <p className="form-status" role="alert">{status}</p>}
      {sent && <p className="form-status success" role="status">If an account exists, a recovery link has been sent.</p>}
      <button className="primary-button wide" type="submit" disabled={pending || !turnstileSiteKey}>{pending ? "Sending…" : "Send recovery link"}</button>
      <a className="auth-link" href="/auth">Back to sign in</a>
    </form>
  );
}
