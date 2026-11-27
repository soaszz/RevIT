"use client";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { COLOR_THEMES } from "../lib/colorThemes";
import { APPEARANCE_EVENT, canChooseProColorThemes, currentAppearance, currentColorTheme, setAppearance, setColorTheme } from "../lib/appearance";
import { PRO_CONTACT_URL } from "../lib/proPlans";
import styles from "./AppearanceSettings.module.css";
function subscribe(listener: () => void) { window.addEventListener(APPEARANCE_EVENT, listener); return () => window.removeEventListener(APPEARANCE_EVENT, listener); }
function snapshot() { return `${currentAppearance()}:${currentColorTheme()}:${canChooseProColorThemes()}`; }
export function useAppearanceDialogFocus() {
  const root = useRef<HTMLDivElement>(null);
  // Reuse the existing dialog; keyboard behavior belongs only to the visible theme controls.
  useEffect(() => {
    const dialog = root.current?.closest<HTMLElement>('[role="dialog"]');
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    const controls = () => {
      const items = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href],[tabindex="0"]')].filter(el => el.getClientRects().length);
      return items.filter(el => {
        if (!(el instanceof HTMLInputElement) || el.type !== "radio" || el === document.activeElement) return true;
        const group = items.filter((item): item is HTMLInputElement => item instanceof HTMLInputElement && item.type === "radio" && item.name === el.name);
        return el.checked || (!group.some(item => item.checked) && group[0] === el);
      });
    };
    controls()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); dialog.querySelector<HTMLButtonElement>('button[aria-label^="Close"]')?.click(); }
      if (event.key !== "Tab") return;
      const items = controls(), first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    dialog.addEventListener("keydown", keydown);
    return () => { dialog.removeEventListener("keydown", keydown); if (!dialog.isConnected && previous?.isConnected) previous.focus(); };
  }, []);
  return root;
}
export default function AppearanceSettings({ showHeading = true }: { showHeading?: boolean }) {
  const [appearance, palette, pro] = useSyncExternalStore(subscribe, snapshot, () => "system:original:false").split(":");
  const [explain, setExplain] = useState(false), hintId = useId(), root = useAppearanceDialogFocus();
  return <div ref={root} className={styles.settings}>
    {showHeading && <div className={styles.heading}><h3>Choose Themes</h3><p>Personalize your RevIT experience.</p></div>}
    <fieldset className={styles.group}><legend>Appearance</legend><p>Choose Light, Dark, or follow your device.</p>
      <div className={styles.appearances}>{(["light", "dark", "system"] as const).map(value => <label key={value} className={styles.option}>
        <input type="radio" name="revit-appearance" value={value} checked={appearance === value} onChange={() => setAppearance(value)} />
        <span>{value[0].toUpperCase() + value.slice(1)}</span>
      </label>)}</div>
    </fieldset>
    <fieldset className={styles.group}><legend>Color theme</legend><p>Colors stay in this browser. Study data stays unchanged.</p>
      <span id={hintId} className="sr-only">This theme requires RevIT Pro.</span>
      <div className={styles.themes}>{COLOR_THEMES.map(theme => {
        const locked = theme.requiredPlan === "pro" && pro !== "true";
        return <label key={theme.id} className={styles.option}>
          <input type="radio" name="revit-color-theme" value={theme.id} checked={palette === theme.id} aria-disabled={locked || undefined} aria-describedby={locked ? hintId : undefined}
            onClick={event => { if (locked) { event.preventDefault(); setExplain(true); } }}
            onChange={() => { const selected = setColorTheme(theme.id); setExplain(!selected); }} />
          <span className={styles.name}>{theme.label}</span>
          {locked && <svg className={styles.lock} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>}
          <span className={styles.swatches} aria-hidden="true">{theme.swatches.map((_, index) => <i className={styles[`swatch${index}`]} key={index} />)}</span>
        </label>;
      })}</div>
    </fieldset>
    {explain && pro !== "true" && <p className={styles.explanation} role="status">This theme requires RevIT Pro. <a href={PRO_CONTACT_URL} target="_blank" rel="noopener noreferrer">Explore RevIT Pro</a></p>}
  </div>;
}
