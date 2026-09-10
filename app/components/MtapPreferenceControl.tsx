"use client";

import { useState } from "react";

export default function MtapPreferenceControl({ enabled, onChange }: {
  enabled: boolean;
  onChange: (enabled: boolean) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(false);

  async function update(enabledNext: boolean) {
    setPending(true);
    setStatus("");
    setError(false);
    try {
      await onChange(enabledNext);
      setStatus(enabledNext
        ? "MTAP features are enabled."
        : "MTAP features are disabled. Your existing data is preserved.");
    } catch {
      setError(true);
      setStatus("MTAP preference could not be saved. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mtap-preference-card" aria-labelledby="mtap-features-label">
      <div>
        <p className="eyebrow">Personalization</p>
        <h3 id="mtap-features-label">MTAP Features</h3>
        <p>Enable features designed for National University MTAP preparation.</p>
      </div>
      <label className="mtap-switch">
        <input
          type="checkbox"
          role="switch"
          checked={enabled}
          disabled={pending}
          onChange={(event) => void update(event.target.checked)}
        />
        <span aria-hidden="true" />
        <strong>{pending ? "Saving…" : enabled ? "On" : "Off"}</strong>
      </label>
      {status && <p className={`form-status ${error ? "error" : "success"}`} role={error ? "alert" : "status"}>{status}</p>}
    </section>
  );
}
