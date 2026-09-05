"use client";

import { type FormEvent, useState } from "react";
import { createClient } from "../../lib/supabase/client";

export default function ForgotPanel() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true);
    await createClient().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset` });
    setSent(true); setPending(false);
  }
  return (
    <form className="auth-card" onSubmit={submit}>
      <span className="brand-mark auth-brand">R</span><p className="eyebrow">Password recovery</p><h1>Reset your password.</h1>
      <p>Enter your email. For privacy, the confirmation is the same whether or not an account exists.</p>
      <label><span>Email</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      {sent && <p className="form-status success" role="status">If an account exists, a recovery link has been sent.</p>}
      <button className="primary-button wide" type="submit" disabled={pending}>{pending ? "Sending…" : "Send recovery link"}</button>
      <a className="auth-link" href="/auth">Back to sign in</a>
    </form>
  );
}
