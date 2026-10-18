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
        ? "NU Revit is enabled. NU MOA MTAP 1 preset and categorization are active."
        : "Standard RevIT is enabled. Custom gradebooks and all subjects remain available.");
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
          <span style={{ fontSize: "11px", color: "var(--green)", fontWeight: 700, letterSpacing: "0.03em" }}>
            NU MOA MTAP
          </span>
        </div>
        <p>Enable NU MOA MTAP 1 course grouping and grading preset. When disabled, custom gradebooks and the full searchable subject library remain available for all learners.</p>
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
