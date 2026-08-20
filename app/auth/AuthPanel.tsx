"use client";

import type { Factor } from "@supabase/supabase-js";
import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabase/client";

type Mode = "login" | "register";
type StatusType = "error" | "success" | "info";

const safeNextPath = (next: string) => next.startsWith("/") && !next.startsWith("//") ? next : "/overview";

export default function AuthPanel({ next = "/overview" }: { next?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [status, setStatus] = useState("");
  const [statusType, setStatusType] = useState<StatusType>("error");
  const [pending, setPending] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState("");
  const [mfaCode, setMfaCode] = useState("");

  function showStatus(message = "", type: StatusType = "error") {
    setStatus(message);
    setStatusType(type);
  }

  function switchMode(nextMode: Mode) {
    if (pending || nextMode === mode) return;
    setMode(nextMode);
    showStatus("");
  }

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
      showStatus("Enter the six-digit code from your authenticator app.", "info");
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
    router.replace(safeNextPath(next));
    router.refresh();
  }

  async function register() {
    const supabase = createClient();
    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim().toLowerCase();
    if (!cleanEmail || !username.trim() || !password) throw new Error("Email, username, and password are required.");
    if (!/^[a-z0-9_]{3,24}$/.test(cleanUsername)) {
      throw new Error("Username must be 3–24 characters using letters, numbers, or underscores.");
    }
    if (password.length < 8) throw new Error("Use a password with at least 8 characters.");

    const { data: availability, error: availabilityError } = await supabase.rpc("is_username_available", { candidate: cleanUsername });
    if (availabilityError) throw availabilityError;
    if (!availability) throw new Error("That username is already taken.");

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: { username: cleanUsername },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/overview`,
      },
    });
    if (error) throw error;

    if (data.session) {
      const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
      if (signOutError) throw signOutError;
      localStorage.removeItem("revit-remember-until");
      localStorage.removeItem("revit-session-policy");
      sessionStorage.removeItem("revit-session-only");
    }

    setEmail(cleanEmail);
    setPassword("");
    setMode("login");
    showStatus(
      data.session
        ? "Account created. Sign in with your email and password."
        : "Account created. Confirm your email from the link Supabase sent, then sign in.",
      "success",
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    showStatus("");
    try {
      if (mode === "register") {
        await register();
        return;
      }
      const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      await completeLogin();
    } catch (error) {
      showStatus(error instanceof Error ? error.message : "Authentication could not be completed.");
    } finally {
      setPending(false);
    }
  }

  async function verifyMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    showStatus("");
    try {
      const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId: mfaFactorId, code: mfaCode.trim() });
      if (error) throw error;
      await completeLogin();
    } catch (error) {
      showStatus(error instanceof Error ? error.message : "That code could not be verified.");
    } finally {
      setPending(false);
    }
  }

  if (mfaFactorId) {
    return (
      <form className="auth-card" onSubmit={verifyMfa}>
        <div className="auth-heading">
          <p className="eyebrow">Two-factor authentication</p>
          <h1>One more secure step.</h1>
          <p>Enter the current code from your authenticator app.</p>
        </div>
        <label className="auth-field"><span>Authentication code</span><input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, ""))} required /></label>
        {status && <p className={`form-status ${statusType}`} role="alert">{status}</p>}
        <button className="primary-button wide" type="submit" disabled={pending || mfaCode.length !== 6}>{pending ? "Verifying…" : "Verify and continue"}</button>
      </form>
    );
  }

  return (
    <form className="auth-card" onSubmit={submit}>
      <div className="auth-heading">
        <h1>{mode === "login" ? "Welcome to RevIT." : "Create your account."}</h1>
        <p>{mode === "login" ? "Sign in to continue your focused MedTech review and keep your progress in sync." : "Create an account with your email, username, and password. You’ll return here to sign in."}</p>
      </div>

      <div className="auth-tabs" role="tablist" aria-label="Account access">
        <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "active" : ""} onClick={() => switchMode("login")} disabled={pending}>Sign in</button>
        <button type="button" role="tab" aria-selected={mode === "register"} className={mode === "register" ? "active" : ""} onClick={() => switchMode("register")} disabled={pending}>Sign up</button>
      </div>

      <div className="auth-fields">
        <label className="auth-field"><span>Email</span><input type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        {mode === "register" && <label className="auth-field"><span>Username</span><input autoComplete="username" placeholder="your_username" minLength={3} maxLength={24} pattern="[A-Za-z0-9_]{3,24}" aria-describedby="username-help" value={username} onChange={(event) => setUsername(event.target.value)} required /><small id="username-help">3–24 letters, numbers, or underscores</small></label>}
        <label className="auth-field"><span>Password</span><input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="At least 8 characters" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
      </div>

      {mode === "login" && <label className="check-label"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /><span>Remember me for up to 30 days</span></label>}
      {status && <p className={`form-status ${statusType}`} role={statusType === "error" ? "alert" : "status"}>{status}</p>}
      <button className="primary-button wide auth-submit" type="submit" disabled={pending}>{pending ? (mode === "login" ? "Signing in…" : "Creating account…") : (mode === "login" ? "Sign in" : "Create account")}</button>
      {mode === "login" && <a className="auth-link" href="/auth/forgot">Forgot your password?</a>}
    </form>
  );
}
