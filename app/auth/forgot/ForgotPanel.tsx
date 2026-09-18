"use client";

import { type FormEvent, useRef, useState } from "react";
import TurnstileChallenge, { type TurnstileChallengeHandle } from "../../components/auth/TurnstileChallenge";
import { createClient } from "../../lib/supabase/client";
import PublicThemeToggle from "../../components/PublicThemeToggle";

export default function ForgotPanel({ turnstileSiteKey }: { turnstileSiteKey: string }) {
  const disableCaptcha = process.env.NEXT_PUBLIC_DISABLE_CAPTCHA === "true";
  const turnstileRef = useRef<TurnstileChallengeHandle>(null);
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [status, setStatus] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!disableCaptcha && !captchaToken) return setStatus("Please complete the security check.");
    setPending(true); setStatus("");
    const options: any = {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset`
    };
    if (!disableCaptcha && captchaToken) options.captchaToken = captchaToken;
    const { error } = await createClient().auth.resetPasswordForEmail(email.trim(), options);
    if (error) {
      setStatus(`Request failed: ${error.message}`);
      turnstileRef.current?.reset();
      setCaptchaToken(null);
    } else {
      setSent(true);
    }
    setPending(false);
  }
  return (
    <form className="auth-card" onSubmit={submit}>
      <PublicThemeToggle className="auth-theme-toggle" />
      <div className="auth-heading">
        <p className="eyebrow">Password recovery</p>
        <h1>Reset your password.</h1>
        <p>Enter your email. For privacy, the confirmation is the same whether or not an account exists.</p>
      </div>
      <div className="auth-fields">
        <label className="auth-field"><span>Email</span><input type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      </div>
      {!disableCaptcha && <TurnstileChallenge ref={turnstileRef} siteKey={turnstileSiteKey} action="recovery" onTokenChange={setCaptchaToken} onUnavailable={() => setStatus("The security check could not load. Please try again.")} />}
      {status && <p className="form-status" role="alert">{status}</p>}
      {sent && <p className="form-status success" role="status">If an account exists, a recovery link has been sent.</p>}
      <button className="primary-button wide" type="submit" disabled={pending || (!disableCaptcha && !turnstileSiteKey)}>{pending ? "Sending…" : "Send recovery link"}</button>
      <a className="auth-link" href="/auth">Back to sign in</a>
    </form>
  );
}
