"use client";

import type { Factor } from "@supabase/supabase-js";
import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabase/client";

type Mode = "login" | "register";
type RegistrationStep = "details" | "otp" | "verified";
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
  const [registrationStep, setRegistrationStep] = useState<RegistrationStep>("details");
  const [otp, setOtp] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [mfaFactorId, setMfaFactorId] = useState("");
  const [mfaCode, setMfaCode] = useState("");

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((seconds) => Math.max(0, seconds - 1)), 1_000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  function showStatus(message = "", type: StatusType = "error") {
    setStatus(message);
    setStatusType(type);
  }

  function switchMode(nextMode: Mode) {
    if (pending || nextMode === mode) return;
    if (registrationStep === "verified") void createClient().auth.signOut({ scope: "local" });
    setMode(nextMode);
    setRegistrationStep("details");
    setOtp("");
    setResendIn(0);
    showStatus("");
  }

  function editRegistrationDetails() {
    setRegistrationStep("details");
    setOtp("");
    setResendIn(0);
    showStatus("Update your details, then request a new verification code.", "info");
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

  async function sendVerificationCode() {
    setPending(true);
    showStatus("");
    const supabase = createClient();
    try {
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
        await supabase.auth.signOut({ scope: "local" });
        throw new Error("Email confirmation is disabled in Supabase. Turn on Confirm email before accepting registrations.");
      }

      setEmail(cleanEmail);
      setUsername(cleanUsername);
      setRegistrationStep("otp");
      setResendIn(60);
      showStatus(`We sent a verification code to ${cleanEmail}.`, "success");
    } catch (error) {
      showStatus(error instanceof Error ? error.message : "The verification email could not be sent.");
    } finally {
      setPending(false);
    }
  }

  async function verifyEmailCode() {
    if (!/^\d{6}$/.test(otp)) {
      showStatus("Enter the six-digit code from your email.");
      return;
    }
    setPending(true);
    showStatus("");
    try {
      const { data, error } = await createClient().auth.verifyOtp({
        email: email.trim(),
        token: otp,
        type: "email",
      });
      if (error) throw error;
      if (!data.user?.email_confirmed_at) throw new Error("Supabase did not confirm this email. Request a new code and try again.");
      setRegistrationStep("verified");
      showStatus("Email verified. You can now create your RevIT account.", "success");
    } catch (error) {
      showStatus(error instanceof Error ? error.message : "That verification code is invalid or expired.");
    } finally {
      setPending(false);
    }
  }

  async function resendVerificationCode() {
    if (pending || resendIn > 0) return;
    setPending(true);
    showStatus("");
    try {
      const { error } = await createClient().auth.resend({
        type: "signup",
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/overview` },
      });
      if (error) throw error;
      setResendIn(60);
      showStatus(`A new code was sent to ${email.trim()}.`, "success");
    } catch (error) {
      showStatus(error instanceof Error ? error.message : "A new code could not be sent.");
    } finally {
      setPending(false);
    }
  }

  async function completeRegistration() {
    setPending(true);
    showStatus("");
    try {
      const { data, error } = await createClient().auth.getUser();
      if (error) throw error;
      if (!data.user?.email_confirmed_at) throw new Error("Verify your email before creating your account.");
      localStorage.removeItem("revit-remember-until");
      localStorage.setItem("revit-session-policy", "session-only");
      sessionStorage.setItem("revit-session-only", "active");
      router.replace("/overview");
      router.refresh();
    } catch (error) {
      setRegistrationStep("otp");
      showStatus(error instanceof Error ? error.message : "Your account could not be completed.");
    } finally {
      setPending(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "register") {
      if (registrationStep === "details") await sendVerificationCode();
      else if (registrationStep === "otp") await verifyEmailCode();
      else await completeRegistration();
      return;
    }

    setPending(true);
    showStatus("");
    try {
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

  const detailsLocked = mode === "register" && registrationStep !== "details";

  return (
    <form className="auth-card" onSubmit={submit}>
      <div className="auth-heading">
        <p className="eyebrow">RevIT learner account</p>
        <h1>{mode === "login" ? "Welcome to RevIT." : "Create your account."}</h1>
        <p>{mode === "login" ? "Sign in to continue your focused MedTech review and keep your progress in sync." : "Enter your details, verify the code sent to your email, then create your account."}</p>
      </div>

      <div className="auth-tabs" role="tablist" aria-label="Account access">
        <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "active" : ""} onClick={() => switchMode("login")} disabled={pending}>Sign in</button>
        <button type="button" role="tab" aria-selected={mode === "register"} className={mode === "register" ? "active" : ""} onClick={() => switchMode("register")} disabled={pending}>Sign up</button>
      </div>

      <div className="auth-fields">
        <label className="auth-field"><span>Email</span><input type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={detailsLocked} /></label>
        {mode === "register" && <label className="auth-field"><span>Username</span><input autoComplete="username" placeholder="your_username" minLength={3} maxLength={24} pattern="[A-Za-z0-9_]{3,24}" aria-describedby="username-help" value={username} onChange={(event) => setUsername(event.target.value)} required disabled={detailsLocked} /><small id="username-help">3–24 letters, numbers, or underscores</small></label>}
        <label className="auth-field"><span>Password</span><input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="At least 8 characters" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required disabled={detailsLocked} /></label>
      </div>

      {mode === "login" && <label className="check-label"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /><span>Remember me for up to 30 days</span></label>}

      {mode === "register" && registrationStep !== "details" && (
        <section className={`otp-panel ${registrationStep === "verified" ? "verified" : ""}`} aria-live="polite">
          <div className="otp-panel-heading">
            <span className="otp-icon" aria-hidden="true">{registrationStep === "verified" ? "✓" : "✉"}</span>
            <div><strong>{registrationStep === "verified" ? "Email verified" : "Check your inbox"}</strong><small>{email}</small></div>
          </div>
          {registrationStep === "otp" && <label className="auth-field otp-field"><span>Six-digit verification code</span><input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} required /></label>}
          {registrationStep === "otp" && <div className="otp-actions"><button type="button" className="text-button" onClick={resendVerificationCode} disabled={pending || resendIn > 0}>{resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}</button><button type="button" className="text-button" onClick={editRegistrationDetails} disabled={pending}>Change details</button></div>}
        </section>
      )}

      {status && <p className={`form-status ${statusType}`} role={statusType === "error" ? "alert" : "status"}>{status}</p>}

      {mode === "login" ? (
        <button className="primary-button wide auth-submit" type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      ) : (
        <div className="registration-actions">
          {registrationStep === "details" && <button className="secondary-button wide" type="submit" disabled={pending}>{pending ? "Sending code…" : "Send verification code"}</button>}
          {registrationStep === "otp" && <button className="secondary-button wide" type="submit" disabled={pending || otp.length !== 6}>{pending ? "Verifying…" : "Verify email"}</button>}
          <button className="primary-button wide auth-submit" type={registrationStep === "verified" ? "submit" : "button"} disabled={pending || registrationStep !== "verified"}>{pending && registrationStep === "verified" ? "Creating account…" : "Create account"}</button>
          {registrationStep !== "verified" && <small className="create-account-help">Verify your email to enable account creation.</small>}
        </div>
      )}

      {mode === "login" && <a className="auth-link" href="/auth/forgot">Forgot your password?</a>}
    </form>
  );
}
