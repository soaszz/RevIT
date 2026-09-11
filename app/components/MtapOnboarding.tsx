"use client";

import { useState } from "react";

export default function MtapOnboarding({ onChoose }: {
  onChoose: (enabled: boolean) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");

  async function choose(enabled: boolean) {
    setPending(true);
    setStatus("");
    try {
      await onChoose(enabled);
    } catch {
      setStatus("Your choice could not be saved. Please try again.");
      setPending(false);
    }
  }

  return (
    <div className="onboarding-backdrop mtap-onboarding-backdrop">
      <section className="onboarding-card mtap-onboarding-card" role="dialog" aria-modal="true" aria-labelledby="mtap-onboarding-title" aria-describedby="mtap-onboarding-description">
        <div>
          <p className="eyebrow">Personalize your experience</p>
          <h1 id="mtap-onboarding-title">Welcome to RevIT</h1>
          <p id="mtap-onboarding-description">Are you currently a National University student or studying at NU MOA, a 4th year Medical Technology student, and taking MTAP?</p>
        </div>
        <div className="mtap-onboarding-note">
          <strong>Your choice only changes access to Grades.</strong>
          <span>Choose Yes to show the Grades tab. Standard RevIT hides only Grades; the Review Library, Progress, Leaderboards, Weakness Analytics, Study Planner, RevIT AI, XP, and Achievements remain available.</span>
        </div>
        {status && <p className="form-status error" role="alert">{status}</p>}
        <div className="mtap-onboarding-actions">
          <button className="primary-button" type="button" onClick={() => void choose(true)} disabled={pending}>{pending ? "Saving…" : "Yes, enable MTAP features"}</button>
          <button className="text-button" type="button" onClick={() => void choose(false)} disabled={pending}>No, continue with standard RevIT</button>
        </div>
      </section>
    </div>
  );
}
