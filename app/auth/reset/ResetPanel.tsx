"use client";

import { type FormEvent, useState } from "react";
import { createClient } from "../../lib/supabase/client";
import PublicThemeToggle from "../../components/PublicThemeToggle";

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
    if (error) return setStatus("The password could not be updated. Request a new recovery link and try again.");
    await createClient().auth.signOut({ scope: "local" });
    setComplete(true); setStatus("Password updated. Sign in with your new password.");
  }
  return (
    <form className="auth-card" onSubmit={submit}>
      <PublicThemeToggle className="auth-theme-toggle" />
      <div className="auth-heading">
        <p className="eyebrow">Secure password</p>
        <h1>Choose a new password.</h1>
      </div>
      {!complete && (
        <div className="auth-fields">
          <label className="auth-field"><span>New password</span><input type="password" autoComplete="new-password" placeholder="At least 8 characters" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          <label className="auth-field"><span>Confirm password</span><input type="password" autoComplete="new-password" placeholder="Match new password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required /></label>
        </div>
      )}
      {status && <p className={`form-status ${complete ? "success" : ""}`} role="status">{status}</p>}
      {complete ? <a className="primary-button auth-button-link" href="/auth">Return to sign in</a> : <button className="primary-button wide" type="submit">Update password</button>}
    </form>
  );
}
