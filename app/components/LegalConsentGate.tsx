"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Profile } from "../lib/domain";
import { acceptLegalConsent } from "../lib/cloudService";
import { createClient } from "../lib/supabase/client";

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
    <main className="consent-gate">
      <section className="consent-card" role="dialog" aria-modal="true" aria-labelledby="consent-title" aria-describedby="consent-description">
        <div className="consent-heading">
          <p className="eyebrow">RevIT terms &amp; privacy</p>
          <h1 id="consent-title">{profile ? "Before continuing" : "Agreement check unavailable"}</h1>
          <p id="consent-description">
            {profile
              ? "Please review and accept RevIT's current Terms of Service and Privacy Policy to continue using your account."
              : "RevIT could not confirm your current agreement status, so your private study workspace has not been opened."}
          </p>
        </div>

        {profile ? (
          <>
            <div className="consent-document-links" aria-label="Review legal documents">
              <Link href="/terms" target="_blank" rel="noopener noreferrer">Read Terms of Service <span aria-hidden="true">↗</span></Link>
              <Link href="/privacy" target="_blank" rel="noopener noreferrer">Read Privacy Policy <span aria-hidden="true">↗</span></Link>
            </div>
            <label className="consent-check" htmlFor="account-legal-consent">
              <input ref={checkboxRef} id="account-legal-consent" type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
              <span>I have read and agree to the Terms of Service and Privacy Policy.</span>
            </label>
            {error && <p className="form-status" role="alert">{error}</p>}
            <button className="primary-button wide consent-accept" type="button" onClick={() => void accept()} disabled={!agreed || pending}>{pending ? "Saving agreement…" : "Accept and continue"}</button>
          </>
        ) : (
          <>
            <p className="form-status" role="alert">{loadError || "Your profile or agreement record could not be loaded."}</p>
            {error && <p className="form-status" role="alert">{error}</p>}
            <button ref={retryRef} className="primary-button wide" type="button" onClick={() => window.location.reload()} disabled={pending}>Try again</button>
          </>
        )}

        <button className="consent-signout" type="button" onClick={() => void signOut()} disabled={pending}>Sign out</button>
        <p className="consent-note">Your account and existing study data will not be deleted if you sign out.</p>
      </section>
    </main>
  );
}
