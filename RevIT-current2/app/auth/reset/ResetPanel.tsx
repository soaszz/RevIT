"use client";

import { type FormEvent, useState } from "react";
import { createClient } from "../../lib/supabase/client";

export default function ResetPanel() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState("");
  const [complete, setComplete] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) return setStatus("Use a password with at least 8 characters.");
    if (password !== confirm) return setStatus("The passwords do not match.");
    const { error } = await createClient().auth.updateUser({ password });
    if (error) return setStatus(error.message);
    await createClient().auth.signOut({ scope: "local" });
    setComplete(true); setStatus("Password updated. Sign in with your new password.");
  }
  return (
    <form className="auth-card" onSubmit={submit}>
      <span className="brand-mark auth-brand">R</span><p className="eyebrow">Secure password</p><h1>Choose a new password.</h1>
      {!complete && <><label><span>New password</span><input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></label><label><span>Confirm password</span><input type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required /></label></>}
      {status && <p className={`form-status ${complete ? "success" : ""}`} role="status">{status}</p>}
      {complete ? <a className="primary-button auth-button-link" href="/auth">Return to sign in</a> : <button className="primary-button wide" type="submit">Update password</button>}
    </form>
  );
}
