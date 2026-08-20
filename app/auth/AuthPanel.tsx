"use client";

import type { Factor } from "@supabase/supabase-js";
import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabase/client";

type Mode = "login" | "register";

export default function AuthPanel({ next = "/overview" }: { next?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState("");
  const [mfaCode, setMfaCode] = useState("");

  async function completeLogin() {
    const supabase = createClient();
    const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError) throw assuranceError;
    if (assurance.nextLevel === "aal2" && assurance.currentLevel !== "aal2") {
      const { data: factors, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      const factor = factors.totp.find((candidate: Factor) => candidate.status === "verified");
      if (!factor) throw new Error("Your second factor could not be loaded.");
      setMfaFactorId(factor.id);
      setStatus("Enter the six-digit code from your authenticator app.");
      return;
    }

    if (remember) {
      localStorage.setItem("revit-remember-until", String(Date.now() + 30 * 86_400_000));
      localStorage.setItem("revit-session-policy", "remember");
      sessionStorage.removeItem("revit-session-only");
    } else {
      localStorage.removeItem("revit-remember-until");
      localStorage.setItem("revit-session-policy", "session-only");
      sessionStorage.setItem("revit-session-only", "active");
    }
    router.replace(next.startsWith("/") && !next.startsWith("//") ? next : "/overview");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setStatus("");
    const supabase = createClient();
    try {
      if (mode === "register") {
        const cleanUsername = username.trim().toLowerCase();
        if (!/^[a-z0-9_]{3,24}$/.test(cleanUsername)) {
          throw new Error("Username must be 3–24 characters using letters, numbers, or underscores.");
        }
        if (password.length < 8) throw new Error("Use a password with at least 8 characters.");
        const { data: availability, error: availabilityError } = await supabase.rpc("is_username_available", { candidate: cleanUsername });
        if (availabilityError) throw availabilityError;
        if (!availability) throw new Error("That username is already taken.");
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { username: cleanUsername },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=/overview`,
          },
        });
        if (error) throw error;
        router.replace(`/auth/verify?email=${encodeURIComponent(email.trim())}`);
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      await completeLogin();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Authentication could not be completed.");
    } finally {
      setPending(false);
    }
  }

  async function verifyMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setStatus("");
    try {
      const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId: mfaFactorId, code: mfaCode.trim() });
      if (error) throw error;
      await completeLogin();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "That code could not be verified.");
    } finally {
      setPending(false);
    }
  }

  if (mfaFactorId) {
    return (
      <form className="auth-card" onSubmit={verifyMfa}>
        <span className="brand-mark auth-brand">R</span>
        <p className="eyebrow">Two-factor authentication</p>
        <h1>One more secure step.</h1>
        <p>Enter the current code from your authenticator app.</p>
        <label><span>Authentication code</span><input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, ""))} required /></label>
        {status && <p className="form-status" role="alert">{status}</p>}
        <button className="primary-button wide" type="submit" disabled={pending || mfaCode.length !== 6}>{pending ? "Verifying…" : "Verify and continue"}</button>
      </form>
    );
  }

  return (
    <form className="auth-card" onSubmit={submit}>
      <span className="brand-mark auth-brand">R</span>
      <p className="eyebrow">RevIT learner account</p>
      <h1>{mode === "login" ? "Welcome back." : "Start your review journey."}</h1>
      <p>{mode === "login" ? "Sign in to sync your study activity, grades, and exam schedule." : "Create an account. You’ll verify your email before onboarding."}</p>
      <div className="auth-tabs" role="tablist">
        <button type="button" className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setStatus(""); }}>Sign in</button>
        <button type="button" className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setStatus(""); }}>Register</button>
      </div>
      <label><span>Email</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      {mode === "register" && <label><span>Username</span><input autoComplete="username" minLength={3} maxLength={24} value={username} onChange={(event) => setUsername(event.target.value)} required /></label>}
      <label><span>Password</span><input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
      {mode === "login" && <label className="check-label"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /><span>Remember me for up to 30 days</span></label>}
      {status && <p className="form-status" role="alert">{status}</p>}
      <button className="primary-button wide" type="submit" disabled={pending}>{pending ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
      {mode === "login" && <a className="auth-link" href="/auth/forgot">Forgot your password?</a>}
    </form>
  );
}
