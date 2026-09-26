"use client";

import type { Factor } from "@supabase/supabase-js";
import { type FormEvent, useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import PublicThemeToggle from "../components/PublicThemeToggle";
import TurnstileChallenge, { type TurnstileChallengeHandle } from "../components/auth/TurnstileChallenge";
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from "../lib/legal";
import { createClient } from "../lib/supabase/client";
import PasswordField from "../components/auth/PasswordField";

type Mode = "login" | "register";
type StatusType = "error" | "success" | "info";

const safeNextPath = (next: string) => next.startsWith("/") && !next.startsWith("//") ? next : "/overview";

class AuthInputError extends Error {}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof AuthInputError && error.message) return error.message;
  return fallback;
}

function AuthFooter() {
  return (
    <footer className="auth-footer">
      <div><a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a><a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a></div>
      <p>© {new Date().getFullYear()} RevIT · Review It Thoroughly.</p>
    </footer>
  );
}

export default function AuthPanel({ next = "/overview", turnstileSiteKey }: { next?: string; turnstileSiteKey: string }) {
  const disableCaptcha = false;
  const router = useRouter();
  const turnstileRef = useRef<TurnstileChallengeHandle>(null);
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [legalConsent, setLegalConsent] = useState(false);
  const [remember, setRemember] = useState(true);
  const [status, setStatus] = useState("");
  const [statusType, setStatusType] = useState<StatusType>("error");
  const [pending, setPending] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.search.includes("clear_session=true")) {
      createClient().auth.signOut({ scope: "local" }).catch(() => {});
      localStorage.removeItem("revit-remember-until");
      localStorage.removeItem("revit-session-policy");
      sessionStorage.removeItem("revit-session-only");
      window.history.replaceState({}, document.title, window.location.pathname);
      showStatus("Your session has expired. Please sign in again.", "info");
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("revit-login-attempts");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.until && Date.now() < parsed.until) {
          setLockoutUntil(parsed.until);
          setFailedAttempts(parsed.attempts);
        } else if (parsed.attempts && !parsed.until) {
          setFailedAttempts(parsed.attempts);
        } else {
          localStorage.removeItem("revit-login-attempts");
        }
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (!lockoutUntil) return;
    const update = () => {
      const remaining = Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 60000));
      if (remaining > 0) {
        setLockoutRemaining(remaining);
      } else {
        setLockoutUntil(null);
        setFailedAttempts(0);
        setLockoutRemaining(0);
        localStorage.removeItem("revit-login-attempts");
        showStatus("");
      }
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [lockoutUntil]);

  function showStatus(message = "", type: StatusType = "error") {
    setStatus(message);
    setStatusType(type);
  }

  function switchMode(nextMode: Mode) {
    if (pending || nextMode === mode) return;
    setMode(nextMode);
    if (nextMode === "login") {
      setConfirmPassword("");
      setLegalConsent(false);
    }
    turnstileRef.current?.reset();
    showStatus("");
  }

  function requireCaptcha() {
    if (disableCaptcha) return "disabled_bypass";
    if (captchaToken) return captchaToken;
    showStatus("Please complete the security check.");
    return null;
  }

  function resetCaptcha() {
    turnstileRef.current?.reset();
    setCaptchaToken(null);
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

  async function register(token: string) {
    const supabase = createClient();
    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim().toLowerCase();
    if (!cleanEmail || !username.trim() || !password) throw new AuthInputError("Email, username, and password are required.");
    if (!legalConsent) throw new AuthInputError("Please read and agree to the Terms of Service and Privacy Policy.");
    if (!/^[a-z0-9_]{3,24}$/.test(cleanUsername)) {
      throw new AuthInputError("Username must be 3–24 characters using letters, numbers, or underscores.");
    }
    if (password.length < 8) throw new AuthInputError("Use a password with at least 8 characters.");
    if (password !== confirmPassword) throw new AuthInputError("Passwords do not match.");

    const { data: availability, error: availabilityError } = await supabase.rpc("is_username_available", { candidate: cleanUsername });
    if (availabilityError) throw availabilityError;
    if (!availability) throw new AuthInputError("That username is already taken.");

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          username: cleanUsername,
          terms_version: CURRENT_TERMS_VERSION,
          privacy_version: CURRENT_PRIVACY_VERSION,
        },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/overview`,
        captchaToken: token && token !== "disabled_bypass" ? token : undefined,
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
    setConfirmPassword("");
    setLegalConsent(false);
    setMode("login");
    resetCaptcha();
    showStatus(
      data.session
        ? "Account created. Sign in with your email and password."
        : "Account created. Confirm your email from the link Supabase sent, then sign in.",
      "success",
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "login" && lockoutUntil && Date.now() < lockoutUntil) return;
    const token = requireCaptcha();
    if (!token) return;
    setPending(true);
    showStatus("");
    try {
      if (mode === "register") {
        await register(token);
        return;
      }
      const { error } = await createClient().auth.signInWithPassword({
        email: email.trim(),
        password,
        options: {
          captchaToken: token && token !== "disabled_bypass" ? token : undefined,
        },
      });
      if (error) { console.error("Login failed:", error); throw error; }

      setFailedAttempts(0);
      setLockoutUntil(null);
      localStorage.removeItem("revit-login-attempts");

      await completeLogin();
    } catch (error) {
      if (mode === "login") {
        const attempts = failedAttempts + 1;
        setFailedAttempts(attempts);
        if (attempts >= 3) {
          const until = Date.now() + 300000;
          setLockoutUntil(until);
          localStorage.setItem("revit-login-attempts", JSON.stringify({ attempts, until }));
          setStatusType("error");
        } else {
          localStorage.setItem("revit-login-attempts", JSON.stringify({ attempts }));
          showStatus(getErrorMessage(error, "Email or password is incorrect, or sign-in could not be completed."));
        }
      } else {
        showStatus(getErrorMessage(error, "Account creation could not be completed. Please try again."));
      }
      resetCaptcha();
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
      showStatus(getErrorMessage(error, "That code could not be verified."));
    } finally {
      setPending(false);
    }
  }

  if (mfaFactorId) {
    return (
      <form className="auth-card" onSubmit={verifyMfa}>
        <PublicThemeToggle className="auth-theme-toggle" />
        <div className="auth-heading">
          <p className="eyebrow">Two-factor authentication</p>
          <h1>One more secure step.</h1>
          <p>Enter the current code from your authenticator app.</p>
        </div>
        <label className="auth-field"><span>Authentication code</span><input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, ""))} required /></label>
        {status && <p className={`form-status ${statusType}`} role="alert">{status}</p>}
        <button className="primary-button wide" type="submit" disabled={pending || mfaCode.length !== 6}>{pending ? "Verifying…" : "Verify and continue"}</button>
        <AuthFooter />
      </form>
    );
  }

  return (
    <form className="auth-card" onSubmit={submit}>
      <PublicThemeToggle className="auth-theme-toggle" />
      <div className="auth-heading">
        <p className="eyebrow">RevIT</p>
        <h1>{mode === "login" ? "Welcome back" : "Create your RevIT account"}</h1>
        <p>{mode === "login" ? "Continue your review and pick up where you left off." : "Build your review history, track your progress, and keep your study activity connected to your account."}</p>
      </div>

      <div className="auth-tabs" role="tablist" aria-label="Account access">
        <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "active" : ""} onClick={() => switchMode("login")} disabled={pending}>Sign in</button>
        <button type="button" role="tab" aria-selected={mode === "register"} className={mode === "register" ? "active" : ""} onClick={() => switchMode("register")} disabled={pending}>Sign up</button>
      </div>

      <div className="auth-fields">
        <label className="auth-field"><span>Email</span><input type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        {mode === "register" && <label className="auth-field"><span>Username</span><input autoComplete="username" placeholder="your_username" minLength={3} maxLength={24} pattern="[A-Za-z0-9_]{3,24}" aria-describedby="username-help" value={username} onChange={(event) => setUsername(event.target.value)} required /><small id="username-help">3–24 letters, numbers, or underscores</small></label>}
        <PasswordField id="password" label="Password" value={password} onChange={setPassword} autoComplete={mode === "login" ? "current-password" : "new-password"} />
        {mode === "register" && <PasswordField id="confirm-password" label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />}
      </div>

      {mode === "login" && <label className="check-label"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /><span>Remember me for up to 30 days</span></label>}
      {mode === "register" && (
        <div className="signup-consent">
          <input id="signup-legal-consent" type="checkbox" checked={legalConsent} onChange={(event) => setLegalConsent(event.target.checked)} aria-describedby="signup-consent-copy" />
          <div id="signup-consent-copy"><label htmlFor="signup-legal-consent">I have read and agree to the</label> <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a> and <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.</div>
        </div>
      )}
      {!disableCaptcha && (
        <TurnstileChallenge
          key={mode}
          ref={turnstileRef}
          siteKey={turnstileSiteKey}
          action={mode}
          onTokenChange={setCaptchaToken}
          onUnavailable={() => showStatus("The security check could not load. Please try again.")}
        />
      )}
      {(status || (mode === "login" && lockoutUntil)) && <p className={`form-status ${statusType}`} role={statusType === "error" ? "alert" : "status"}>{mode === "login" && lockoutUntil ? `Too many failed attempts. Try again in ${lockoutRemaining} minute${lockoutRemaining > 1 ? "s" : ""}.` : status}</p>}
      <button className="primary-button wide auth-submit" type="submit" disabled={pending || (!disableCaptcha && !turnstileSiteKey) || (mode === "register" && !legalConsent) || (mode === "login" && lockoutUntil !== null)}>{pending ? (mode === "login" ? "Signing in…" : "Creating account…") : (mode === "login" ? "Sign in" : "Create account")}</button>
      {mode === "login" && <a className="auth-link" href="/auth/forgot">Forgot your password?</a>}
      <AuthFooter />
    </form>
  );
}
