"use client";

import { useState, useEffect } from "react";
import type { Profile } from "../lib/domain";
import { saveProfile, uploadAvatar } from "../lib/cloudService";
import { AVATAR_ACCEPT, validateAvatarFile } from "../lib/avatarValidation";
import { createClient } from "../lib/supabase/client";
import Image from "next/image";
import { AI_LIMITS } from "../lib/entitlements";

export default function Onboarding({
  profile,
  onComplete,
  onMtapChoose
}: {
  profile: Profile;
  onComplete: (profile: Profile) => void;
  onMtapChoose?: (enabled: boolean) => Promise<void>;
}) {
  const [step, setStep] = useState(1);
  const [firstName, setFirstName] = useState(profile.first_name || "");
  const [username, setUsername] = useState(profile.username || "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [preview, setPreview] = useState(profile.avatar_url ?? "");
  const [mtapChoice, setMtapChoice] = useState<boolean | null>(null);

  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  const [greeting, setGreeting] = useState("Good day");

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting("Good morning");
    else if (hour < 18) setGreeting("Good afternoon");
    else setGreeting("Good evening");
  }, []);

  async function chooseAvatar(file?: File) {
    if (!file) return;
    try {
      await validateAvatarFile(file);
      setAvatarFile(file); setPreview(URL.createObjectURL(file)); setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Choose a valid image smaller than 2 MB.");
    }
  }

  async function handleStep1Next(event: React.MouseEvent) {
    event.preventDefault();
    const cleanFirstName = firstName.trim();
    const cleanUsername = username.trim().toLowerCase();

    if (!cleanFirstName) return setStatus("First name is required.");
    if (!/^[a-z0-9_]{3,24}$/.test(cleanUsername)) return setStatus("Username must be 3–24 characters (letters, numbers, underscores).");

    setPending(true); setStatus("");
    try {
      const client = createClient();
      if (cleanUsername !== profile.username) {
        const { data, error } = await client.rpc("is_username_available", { candidate: cleanUsername });
        if (error) throw error;
        if (!data) return setStatus("That username is already taken.");
      }
      setStep(2);
    } catch {
      setStatus("Error checking username. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function submitWithMtap() {
    if (mtapChoice === null) return;
    const cleanFirstName = firstName.trim();
    const cleanUsername = username.trim().toLowerCase();

    setPending(true); setStatus("");
    try {
      if (onMtapChoose) {
        await onMtapChoose(mtapChoice);
      }

      const client = createClient();
      const avatarUrl = avatarFile ? await uploadAvatar(client, profile.id, avatarFile) : profile.avatar_url;
      const saved = await saveProfile(client, { ...profile, first_name: cleanFirstName, username: cleanUsername, avatar_url: avatarUrl, onboarding_complete: true });
      onComplete(saved);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Your profile could not be saved. Please try again.");
    } finally { setPending(false); }
  }

  const initials = (firstName.trim()[0] ?? username.trim()[0] ?? "R").toUpperCase();

  return (
    <div className="onboarding-backdrop">
      <section className="onboarding-card" aria-labelledby="onboarding-title" style={{ maxWidth: "600px", width: "100%" }}>
        {step === 1 && (
          <>
            <div>
              <p className="eyebrow">Step 1 of 4</p>
              <h1 id="onboarding-title">Who&apos;s reviewing today?</h1>
              <p>Let&apos;s set up your identity before building your study plan.</p>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); }}>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 'clamp(16px, 4vw, 32px)', alignItems: 'start', marginBottom: '16px' }}>
                <div style={{ display: 'grid', gap: '16px' }}>
                  <label className="profile-name-field">
                    <span>First name</span>
                    <input autoComplete="given-name" maxLength={40} value={firstName} onChange={(event) => setFirstName(event.target.value)} required placeholder="Anne Claire" autoFocus />
                  </label>
                  <label className="profile-name-field">
                    <span>Username</span>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <span style={{ position: 'absolute', left: '12px', color: 'var(--muted)', fontSize: '13px', pointerEvents: 'none', textTransform: 'none', letterSpacing: '0', fontWeight: '500' }}>@</span>
                      <input style={{ paddingLeft: '28px' }} autoComplete="username" minLength={3} maxLength={24} value={username} onChange={(event) => setUsername(event.target.value.replace(/[^a-zA-Z0-9_]/g, ''))} required placeholder="username" />
                    </div>
                  </label>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                  <span className={`avatar profile-preview ${preview ? "has-photo" : ""}`} style={{ width: '88px', height: '88px', fontSize: '32px', margin: 0, ...(preview ? { backgroundImage: `url(${JSON.stringify(preview)})` } : {}) }}>
                    {preview ? "" : initials}
                  </span>
                  <div style={{ textAlign: 'center' }}>
                    <label className="photo-upload" style={{ margin: 0, padding: 0, display: 'block' }}>
                      <span style={{ textDecoration: 'underline', cursor: 'pointer', fontSize: '13px' }}>Add photo</span>
                      <input type="file" accept={AVATAR_ACCEPT} onChange={(event) => void chooseAvatar(event.target.files?.[0])} />
                    </label>
                    <span style={{ fontSize: '10px', color: 'var(--muted)', display: 'block', marginTop: '2px' }}>Max 2MB</span>
                  </div>
                </div>
              </div>

              {status && <p className="profile-error" role="alert">{status}</p>}
              <button className="primary-button wide" onClick={handleStep1Next} disabled={pending || !firstName.trim() || !username.trim()}>
                {pending ? "Checking..." : "Continue"}
              </button>
            </form>
          </>
        )}

        {step === 2 && (
          <div className="mtap-onboarding-card">
            <div>
              <p className="eyebrow">Step 2 of 4</p>
              <h1 id="onboarding-title">Personalize your experience</h1>
              <p>Are you currently an NU 4th year Medical Technology student taking MTAP?</p>
            </div>

            <div className="mtap-onboarding-note" style={{ padding: "16px" }}>
              <strong style={{ fontSize: "13px" }}>What changes when you enable MTAP features?</strong>
              <ul style={{ margin: "10px 0 0", padding: "0 0 0 20px", listStyleType: "disc", fontSize: "12px", color: "var(--muted)", lineHeight: 1.6 }}>
                 <li>Unlocks the dedicated <strong>Grades tab</strong> for score tracking.</li>
                 <li>Groups subjects organically under <strong>MTAP 1</strong> and <strong>Other Majors</strong>.</li>
              </ul>
              <span style={{ display: "block", marginTop: "12px", fontSize: "11px", color: "var(--muted)" }}>All other study tools remain exactly the same. Don&apos;t worry, <strong>you can always completely toggle this later in Account Settings</strong>.</span>
            </div>

            <div style={{ display: "grid", gap: "10px", marginTop: "8px" }}>
              <button
                type="button"
                style={{ width: "100%", padding: "14px", borderRadius: "10px", fontSize: "13px", fontWeight: "600", transition: "all 0.15s", cursor: "pointer", ...(mtapChoice === true ? { background: "var(--green)", color: "#fff", border: "1px solid var(--green)" } : { background: "transparent", color: "var(--ink)", border: "1px solid var(--line)" }) }}
                onClick={() => setMtapChoice(true)}>
                Yes, enable MTAP features
              </button>
              <button
                type="button"
                style={{ width: "100%", padding: "14px", borderRadius: "10px", fontSize: "13px", fontWeight: "600", transition: "all 0.15s", cursor: "pointer", ...(mtapChoice === false ? { background: "var(--green)", color: "#fff", border: "1px solid var(--green)" } : { background: "transparent", color: "var(--ink)", border: "1px solid var(--line)" }) }}
                onClick={() => setMtapChoice(false)}>
                No, continue with standard RevIT
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "10px", marginTop: "16px" }}>
              <button type="button" className="primary-button wide" style={{ background: "transparent", border: "1px solid var(--line)", color: "var(--ink)" }} onClick={() => setStep(1)}>Back</button>
              <button type="button" className="primary-button wide" onClick={() => setStep(3)} disabled={mtapChoice === null}>Continue</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ display: "grid", gap: "18px" }}>
            <div>
              <p className="eyebrow">Step 3 of 4</p>
              <h1 id="onboarding-title">RevIT Free &amp; Pro</h1>
              <p>Every learner starts with essential study tools. Upgrade to Pro whenever you want deeper reviewer coverage.</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px", width: "100%" }}>
              <div style={{ display: "flex", flexDirection: "column", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "14px", padding: "16px", gap: "10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="source-pill" style={{ fontSize: "9px" }}>FREE</span>
                  <span style={{ fontSize: "10px", color: "var(--green-dark)", fontWeight: "700" }}>Active by default</span>
                </div>
                <div>
                  <h3 style={{ margin: "2px 0 0", fontSize: "16px", fontWeight: "750", color: "var(--ink)" }}>RevIT Free</h3>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "4px", marginTop: "4px" }}>
                    <span style={{ fontSize: "20px", fontWeight: "800", color: "var(--ink)" }}>₱0</span>
                    <span style={{ fontSize: "10px", color: "var(--muted)" }}>/ Free forever</span>
                  </div>
                </div>
                <ul style={{ margin: "4px 0 0", padding: "0", listStyle: "none", display: "grid", gap: "8px", fontSize: "11px", color: "var(--ink)" }}>
                  <li style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <span style={{ color: "var(--green)", fontWeight: "bold" }}>✓</span>
                    <span>Harr question bank &amp; flashcards</span>
                  </li>
                  <li style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <span style={{ color: "var(--green)", fontWeight: "bold" }}>✓</span>
                    <span>MCQ practice timer &amp; study planner</span>
                  </li>
                  <li style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <span style={{ color: "var(--green)", fontWeight: "bold" }}>✓</span>
                    <span>Basic progress tracking &amp; streaks</span>
                  </li>
                  <li style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <span style={{ color: "var(--green)", fontWeight: "bold" }}>✓</span>
                    <span>RevIT AI: {AI_LIMITS.free.dailyRequests} messages per day</span>
                  </li>
                </ul>
              </div>

              <div style={{ display: "flex", flexDirection: "column", background: "linear-gradient(180deg, var(--green-soft) 0%, var(--surface) 35%)", border: "1px solid color-mix(in srgb, var(--green) 50%, var(--line))", borderRadius: "14px", padding: "16px", gap: "10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="source-pill" style={{ fontSize: "9px", background: "var(--green)", color: "#fff" }}>PRO ACCESS</span>
                  <span style={{ fontSize: "10px", color: "var(--green-dark)", fontWeight: "700" }}>Recommended</span>
                </div>
                <div>
                  <h3 style={{ margin: "2px 0 0", fontSize: "16px", fontWeight: "750", color: "var(--ink)" }}>RevIT Pro</h3>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "4px", marginTop: "4px" }}>
                    <span style={{ fontSize: "20px", fontWeight: "800", color: "var(--ink)" }}>₱49</span>
                    <span style={{ fontSize: "10px", color: "var(--muted)" }}>/ Early Access</span>
                  </div>
                </div>
                <ul style={{ margin: "4px 0 0", padding: "0", listStyle: "none", display: "grid", gap: "8px", fontSize: "11px", color: "var(--ink)" }}>
                  <li style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <span style={{ color: "var(--green)", fontWeight: "bold" }}>✓</span>
                    <strong>Everything in Free</strong>
                  </li>
                  <li style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <span style={{ color: "var(--green)", fontWeight: "bold" }}>✓</span>
                    <span>Full Harr &amp; Ciulla (4th Ed.) libraries</span>
                  </li>
                  <li style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <span style={{ color: "var(--green)", fontWeight: "bold" }}>✓</span>
                    <span>Weakness Analytics &amp; gap targeting</span>
                  </li>
                  <li style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <span style={{ color: "var(--green)", fontWeight: "bold" }}>✓</span>
                    <span>RevIT AI: {AI_LIMITS.pro.dailyRequests} messages per day</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="mtap-onboarding-note" style={{ padding: "12px 14px" }}>
              <span style={{ fontSize: "11px", color: "var(--muted)", lineHeight: 1.5 }}>
                You start automatically on <strong>RevIT Free</strong>. Subscriptions are activated manually via Facebook Messenger whenever you wish to upgrade.
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "10px", marginTop: "4px" }}>
              <button type="button" className="primary-button wide" style={{ background: "transparent", border: "1px solid var(--line)", color: "var(--ink)" }} onClick={() => setStep(2)}>Back</button>
              <button type="button" className="primary-button wide" onClick={() => setStep(4)}>Continue</button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div style={{ display: "grid", gap: "22px" }}>
            <div style={{ textAlign: "center", display: "grid", justifyItems: "center", gap: "12px" }}>
              <div style={{ position: "relative", width: "92px", height: "72px", margin: "0 auto", marginTop: "4px", filter: "drop-shadow(0 8px 18px rgba(24, 117, 98, .22))" }}>
                <Image src="/icons/neu/revit-frog-mascot.png" alt="RevIT Mascot" fill style={{ objectFit: "contain" }} priority unoptimized />
              </div>
              <div>
                <p className="eyebrow">Step 4 of 4</p>
                <h1 id="onboarding-title" style={{ fontSize: "28px", margin: "4px 0" }}>{greeting}, {firstName.split(" ")[0]}!</h1>
              </div>
              <p style={{ margin: "0", color: "var(--muted)", fontSize: "14px" }}>You&apos;re all set. Here&apos;s a quick look at what you can do inside RevIT:</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", width: "100%", marginBottom: "4px" }}>
              <div style={{ display: "flex", gap: "12px", alignItems: "start", background: "var(--surface)", border: "1px solid var(--line)", padding: "14px", borderRadius: "14px", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
                <div style={{ width: "24px", flexShrink: 0, marginTop: "2px" }}><Image src="/icons/neu/review-library.png" alt="" width={24} height={24} /></div>
                <div><strong style={{ display: "block", fontSize: "13px", marginBottom: "4px", color: "var(--ink)" }}>Structured Practice</strong><span style={{ display: "block", fontSize: "11px", color: "var(--muted)", lineHeight: 1.5 }}>Practice thousands of organized MCQs by subject.</span></div>
              </div>
              <div style={{ display: "flex", gap: "12px", alignItems: "start", background: "var(--surface)", border: "1px solid var(--line)", padding: "14px", borderRadius: "14px", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
                <div style={{ width: "24px", flexShrink: 0, marginTop: "2px" }}><Image src="/icons/neu/weakness.png" alt="" width={24} height={24} /></div>
                <div><strong style={{ display: "block", fontSize: "13px", marginBottom: "4px", color: "var(--ink)" }}>Analytics</strong><span style={{ display: "block", fontSize: "11px", color: "var(--muted)", lineHeight: 1.5 }}>Pinpoint your weakest subjects to focus your review.</span></div>
              </div>
              <div style={{ display: "flex", gap: "12px", alignItems: "start", background: "var(--surface)", border: "1px solid var(--line)", padding: "14px", borderRadius: "14px", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
                <div style={{ width: "24px", flexShrink: 0, marginTop: "2px" }}><Image src="/icons/neu/revit-ai.png" alt="" width={24} height={24} /></div>
                <div><strong style={{ display: "block", fontSize: "13px", marginBottom: "4px", color: "var(--ink)" }}>MedTech AI</strong><span style={{ display: "block", fontSize: "11px", color: "var(--muted)", lineHeight: 1.5 }}>Get instant, educational AI explanations for any question.</span></div>
              </div>
              <div style={{ display: "flex", gap: "12px", alignItems: "start", background: "var(--surface)", border: "1px solid var(--line)", padding: "14px", borderRadius: "14px", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
                <div style={{ width: "24px", flexShrink: 0, marginTop: "2px" }}><Image src="/icons/neu/progress.png" alt="" width={24} height={24} /></div>
                <div><strong style={{ display: "block", fontSize: "13px", marginBottom: "4px", color: "var(--ink)" }}>Achievements</strong><span style={{ display: "block", fontSize: "11px", color: "var(--muted)", lineHeight: 1.5 }}>Earn XP, track study streaks, and level up as you learn.</span></div>
              </div>
            </div>

            {status && <p className="profile-error" style={{ textAlign: "center" }} role="alert">{status}</p>}

            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "10px" }}>
               <button type="button" className="primary-button wide" style={{ background: "transparent", border: "1px solid var(--line)", color: "var(--ink)" }} onClick={() => setStep(3)} disabled={pending}>Back</button>
               <button className="primary-button wide" type="button" onClick={() => void submitWithMtap()} disabled={pending}>{pending ? "Initializing dashboard…" : "Start Reviewing"}</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}