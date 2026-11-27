"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { connectDevelopmentAppearance, currentAppearance } from "../../lib/appearance";
import { createOfflineAppearancePreview, offlineThemeTestAllowed } from "../../lib/dev/offlineAppearancePreview";
import SidebarTooltip from "../SidebarTooltip";
import { useAppearanceDialogFocus } from "../AppearanceSettings";
import styles from "../AppearanceSettings.module.css";

// REVIT_OFFLINE_THEME_PREVIEW_ONLY: this module must be absent from production chunks.
function FlaskIcon() {
  return <svg className="lucide lucide-flask-conical" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2" /><path d="M6.453 15h11.094" /><path d="M8.5 2h7" />
  </svg>;
}
function TestAccountDialog({ tier, onTier, onClose }: {tier:"free"|"pro";onTier:(value:"free"|"pro")=>void;onClose:()=>void}) {
  const root = useAppearanceDialogFocus();
  return <div className="profile-modal-backdrop" role="presentation" onMouseDown={event => { if(event.target === event.currentTarget) onClose(); }}>
    <section className="profile-modal account-modal" role="dialog" aria-modal="true" aria-labelledby="offline-test-account-title">
      <div ref={root} className={styles.settings}>
        <div className="profile-modal-heading"><div><p className="eyebrow">Offline testing only</p><h2 id="offline-test-account-title">Test Account</h2></div><button type="button" aria-label="Close Test Account" onClick={onClose}>×</button></div>
        <p className={styles.explanation}>Color themes only. No real account, subscription or feature access changes.</p>
        <fieldset className={styles.group}><legend>Synthetic preview</legend><div className={styles.appearances}>
          {(["free","pro"] as const).map(value => <label className={styles.option} key={value}><input type="radio" name="offline-theme-test-account" value={value} checked={tier === value} onChange={() => onTier(value)} /><span>{value === "free" ? "Free" : "Pro"}</span></label>)}
        </div></fieldset>
        <p className={styles.explanation} role="status">Synthetic {tier === "free" ? "Free" : "Pro"} preview</p>
      </div>
    </section>
  </div>;
}
export default function OfflineThemeTestControl({ offline, noUser, collapsed }: {offline:boolean;noUser:boolean;collapsed:boolean}) {
  const [open,setOpen] = useState(false), [tier,setTier] = useState<"free"|"pro">("free"), [mobile,setMobile] = useState<HTMLElement|null>(null);
  const controller = useRef<ReturnType<typeof createOfflineAppearancePreview>>(null);
  const connection = useRef<ReturnType<typeof connectDevelopmentAppearance>|null>(null);
  const allowed = () => offlineThemeTestAllowed({offline,noUser,hostname:window.location.hostname});
  const eligible = typeof window !== "undefined" && allowed();
  useLayoutEffect(() => {
    if (!eligible) { setOpen(false); setTier("free"); return; }
    setTier("free");
    return () => { connection.current?.disconnect(); connection.current = null; controller.current = null; };
    // Losing eligibility disposes the adapter; every action also rechecks the guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[eligible]);
  useEffect(() => { setMobile(eligible ? document.getElementById("offline-theme-test-mobile") : null); },[eligible]);
  if (!eligible) return null;
  const choose = (value:"free"|"pro") => {
    if (!allowed()) return;
    if (!controller.current) controller.current = createOfflineAppearancePreview(allowed,currentAppearance());
    if (!controller.current) return;
    controller.current.setTier(value);
    if (!connection.current) connection.current = connectDevelopmentAppearance(controller.current.adapter);
    setTier(value); connection.current.refresh();
  };
  return <>
    <div className="sidebar-tooltip-wrapper"><SidebarTooltip label="Test Account" disabled={!collapsed}>
      <button className="sidebar-utility-item" type="button" onClick={()=>setOpen(true)} aria-label="Test Account">
        <span className="sidebar-utility-icon" aria-hidden="true"><FlaskIcon/></span><span className="sidebar-utility-text"><strong>Test Account</strong><small>Offline testing only</small></span>
      </button>
    </SidebarTooltip></div>
    {mobile && createPortal(<button className="theme-toggle mobile-theme-toggle" type="button" onClick={()=>setOpen(true)} aria-label="Test Account"><FlaskIcon/></button>,mobile)}
    {open && createPortal(<TestAccountDialog tier={tier} onTier={choose} onClose={()=>setOpen(false)}/>,document.body)}
  </>;
}
