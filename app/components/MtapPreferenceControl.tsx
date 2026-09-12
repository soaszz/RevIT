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
        ? "NU Revit is enabled. Grades are available, and additional subjects are grouped under Other Majors."
        : "Standard RevIT is enabled. Grades are hidden, every subject remains available, and your existing data is preserved.");
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
        <p>Show or hide the Grades tab for National University MTAP preparation. Both modes keep the full searchable subject library.</p>
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
