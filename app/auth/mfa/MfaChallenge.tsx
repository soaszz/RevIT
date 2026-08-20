"use client";

import type { Factor } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { createClient } from "../../lib/supabase/client";

export default function MfaChallenge({ next }: { next: string }) {
  const router = useRouter();
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("Loading your authenticator…");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void createClient().auth.mfa.listFactors().then((result: { data: { totp: Factor[] } | null; error: Error | null }) => {
      if (cancelled) return;
      const factor = result.data?.totp.find((candidate) => candidate.status === "verified");
      if (result.error || !factor) setStatus(result.error?.message ?? "No verified authenticator was found. Sign in again or contact support.");
      else { setFactorId(factor.id); setStatus("Enter the current six-digit code from your authenticator app."); }
    });
    return () => { cancelled = true; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setStatus("");
    const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId, code });
    if (error) { setStatus(error.message); setPending(false); return; }
    router.replace(next.startsWith("/") && !next.startsWith("//") ? next : "/overview");
  }

  return (
    <form className="auth-card" onSubmit={submit}>
      <span className="brand-mark auth-brand">R</span><p className="eyebrow">Two-factor authentication</p><h1>Confirm it’s you.</h1><p>{status}</p>
      <label><span>Authentication code</span><input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} required /></label>
      <button className="primary-button wide" type="submit" disabled={pending || !factorId || code.length !== 6}>{pending ? "Verifying…" : "Verify and continue"}</button>
      <a className="auth-link" href="/auth">Return to sign in</a>
    </form>
  );
}
