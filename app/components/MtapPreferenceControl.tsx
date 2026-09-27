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
        ? "NU Revit is enabled. Grades are available, and subjects are grouped under MTAP 1 and Other Majors."
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
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
          <h3 id="mtap-features-label" style={{ margin: 0 }}>MTAP Features</h3>
          <span style={{ fontSize: "9.5px", padding: "3px 8px", borderRadius: "99px", background: "var(--green-soft)", color: "var(--green-dark)", border: "1px solid color-mix(in srgb, var(--green) 35%, transparent)", fontWeight: 750, letterSpacing: "0.03em" }}>
            NU MOA MTAP
          </span>
        </div>
        <p>Show or hide the Grades tab for National University MTAP preparation. Calibrated for <strong style={{ color: "var(--green)", fontWeight: 750 }}>National University MOA MTAP</strong> students. Both modes keep the full searchable subject library.</p>
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
