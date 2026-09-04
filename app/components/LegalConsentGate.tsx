"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Profile } from "../lib/domain";
import { acceptLegalConsent } from "../lib/cloudService";
import { LEGAL_EFFECTIVE_DATE } from "../lib/legal";
import { createClient } from "../lib/supabase/client";
import PublicThemeToggle from "./PublicThemeToggle";
import styles from "./LegalConsentGate.module.css";

export default function LegalConsentGate({
  profile,
  loadError,
  onAccepted,
}: {
  profile: Profile | null;
  loadError?: string;
  onAccepted: (profile: Profile) => void;
}) {
  const router = useRouter();
  const checkboxRef = useRef<HTMLInputElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const [agreed, setAgreed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (profile ? checkboxRef.current : retryRef.current)?.focus();
  }, [profile]);

  async function accept() {
    if (!profile || !agreed || pending) return;
    setPending(true);
    setError("");
    try {
      const acceptedProfile = await acceptLegalConsent(createClient());
      onAccepted(acceptedProfile);
    } catch {
      setError("We couldn't save your agreement. Please try again.");
      setPending(false);
    }
  }

  async function signOut() {
    setPending(true);
    setError("");
    try {
      const { error: signOutError } = await createClient().auth.signOut({ scope: "local" });
      if (signOutError) throw signOutError;
      localStorage.removeItem("revit-remember-until");
      localStorage.removeItem("revit-session-policy");
      sessionStorage.removeItem("revit-session-only");
      router.replace("/auth");
      router.refresh();
    } catch {
      setError("We couldn't sign you out. Please try again.");
      setPending(false);
    }
  }

  return (
    <main className={styles.gate}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="consent-title" aria-describedby="consent-description">
        <aside className={styles.brandPanel} aria-label="RevIT account agreement">
          <div className={styles.brandLockup} aria-label="RevIT">
            <span className={styles.wordmark} aria-hidden="true">
              <Image src="/revit-logo.png" alt="" width={1376} height={768} priority />
            </span>
            <span className={styles.frog} aria-hidden="true">
              <Image src="/revit-frog.png" alt="" width={2000} height={2000} priority />
            </span>
          </div>

          <div className={styles.brandCopy}>
            <p>Account agreement</p>
            <h2>Review It<br />Thoroughly.</h2>
            <span>Your study workspace stays protected while RevIT confirms the agreement connected to your account.</span>
          </div>

          <div className={styles.assurance}>
            <span className={styles.assuranceIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M12 3 19 6v5c0 4.7-2.8 8.2-7 10-4.2-1.8-7-5.3-7-10V6l7-3Z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </span>
            <p><strong>Your choice remains clear.</strong><span>Accept to continue, or sign out without deleting your account or study data.</span></p>
          </div>
        </aside>

        <div className={styles.contentPanel}>
          <header className={styles.utilityBar}>
            <span>Current documents · {LEGAL_EFFECTIVE_DATE}</span>
            <PublicThemeToggle className={styles.themeToggle} />
          </header>

          <div className={styles.heading}>
            <p>RevIT terms &amp; privacy</p>
            <h1 id="consent-title">{profile ? "Before continuing" : "Agreement check unavailable"}</h1>
            <span id="consent-description">
              {profile
                ? "Please review RevIT's current Terms of Service and Privacy Policy before continuing to your study workspace."
                : "RevIT could not confirm your current agreement status, so your private study workspace has not been opened."}
            </span>
          </div>

          {profile ? (
            <>
              <div className={styles.documentLinks} aria-label="Review legal documents">
                <Link href="/terms" target="_blank" rel="noopener noreferrer" aria-label="Read Terms of Service in a new tab">
                  <span><small>Document 01</small><strong>Terms of Service</strong></span>
                  <span aria-hidden="true">↗</span>
                </Link>
                <Link href="/privacy" target="_blank" rel="noopener noreferrer" aria-label="Read Privacy Policy in a new tab">
                  <span><small>Document 02</small><strong>Privacy Policy</strong></span>
                  <span aria-hidden="true">↗</span>
                </Link>
              </div>

              <label className={styles.consentCheck} htmlFor="account-legal-consent">
                <input ref={checkboxRef} id="account-legal-consent" type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
                <span><strong>I have reviewed both documents.</strong>I agree to the Terms of Service and Privacy Policy.</span>
              </label>

              {error && <p className={styles.error} role="alert">{error}</p>}
              <button className={styles.primaryAction} type="button" onClick={() => void accept()} disabled={!agreed || pending}>{pending ? "Saving agreement…" : "Accept and continue"}</button>
            </>
          ) : (
            <>
              <p className={styles.error} role="alert">{loadError || "Your profile or agreement record could not be loaded."}</p>
              {error && <p className={styles.error} role="alert">{error}</p>}
              <button ref={retryRef} className={styles.primaryAction} type="button" onClick={() => window.location.reload()} disabled={pending}>Try again</button>
            </>
          )}

          <div className={styles.exitRow}>
            <button type="button" onClick={() => void signOut()} disabled={pending}>Sign out</button>
            <p>Your account and existing study data will not be deleted.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
