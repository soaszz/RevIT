"use client";

import type { UserIdentity } from "@supabase/supabase-js";
import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Profile, UserPreferences } from "../lib/domain";
import { savePreferences, saveProfile, uploadAvatar } from "../lib/cloudService";
import { AVATAR_ACCEPT, validateAvatarFile } from "../lib/avatarValidation";
import { createClient } from "../lib/supabase/client";
import MtapPreferenceControl from "./MtapPreferenceControl";
import { isProActive, type SubscriptionEntitlement } from "../lib/entitlements";

type AccountTab = "profile" | "personalization" | "privacy" | "security";

export default function AccountSettings({ profile, preferences, entitlement, email, initialTab = "profile", initialStatus = "", onClose, onProfile, onPreferences, onMtapFeaturesChange }: {
  profile: Profile;
  preferences: UserPreferences;
  entitlement: SubscriptionEntitlement;
  email: string;
  initialTab?: AccountTab;
  initialStatus?: string;
  onClose: () => void;
  onProfile: (profile: Profile) => void;
  onPreferences: (preferences: UserPreferences) => void;
  onMtapFeaturesChange: (enabled: boolean) => Promise<void>;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<AccountTab>(initialTab);
  const [firstName, setFirstName] = useState(profile.first_name);
  const [username, setUsername] = useState(profile.username);
  const [usernameStatus, setUsernameStatus] = useState<"" | "checking" | "available" | "taken" | "invalid">("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [preview, setPreview] = useState(profile.avatar_url ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [leaderboardOptIn, setLeaderboardOptIn] = useState(preferences.leaderboard_opt_in);
  const [status, setStatus] = useState(initialStatus);
  const [googleError, setGoogleError] = useState<string | null>(
    initialStatus && initialStatus.toLowerCase().includes("google") && !initialStatus.toLowerCase().includes("connected to this")
      ? initialStatus
      : null
  );
  const [googleErrorModalOpen, setGoogleErrorModalOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [identities, setIdentities] = useState<UserIdentity[] | null>(null);

  useEffect(() => {
    const clean = username.trim().toLowerCase();
    if (clean === profile.username.toLowerCase()) {
      setUsernameStatus("");
      return;
    }
    if (!clean || !/^[a-z0-9_]{3,24}$/.test(clean)) {
      setUsernameStatus(clean ? "invalid" : "");
      return;
    }
    setUsernameStatus("checking");
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const client = createClient();
        const { data, error } = await client.rpc("is_username_available", { candidate: clean });
        if (!active) return;
        if (error) {
          setUsernameStatus("");
          return;
        }
        setUsernameStatus(data ? "available" : "taken");
      } catch {
        if (active) setUsernameStatus("");
      }
    }, 350);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [username, profile.username]);

  useEffect(() => {
    if (tab !== "security") return;
    let active = true;
    void createClient().auth.getUser().then((result: { data: { user: { identities?: UserIdentity[] } | null }; error: unknown }) => {
      if (!active) return;
      if (result.error || !result.data.user) {
        setStatus("Sign-in methods could not be loaded. Please try again.");
        setIdentities([]);
        return;
      }
      setIdentities(result.data.user.identities ?? []);
    });
    return () => { active = false; };
  }, [tab]);

  async function chooseAvatar(file?: File) {
    if (!file) return;
    try {
      await validateAvatarFile(file);
      setAvatarFile(file); setPreview(URL.createObjectURL(file)); setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Choose a valid image smaller than 2 MB.");
    }
  }

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanUsername = username.trim().toLowerCase();
    if (!firstName.trim()) return setStatus("First name is required.");
    if (!/^[a-z0-9_]{3,24}$/.test(cleanUsername)) return setStatus("Username must be 3–24 characters using letters, numbers, or underscores.");
    setPending(true); setStatus("");
    try {
      const client = createClient();
      if (cleanUsername !== profile.username) {
        const { data, error } = await client.rpc("is_username_available", { candidate: cleanUsername });
        if (error) throw error;
        if (!data) {
          setUsernameStatus("taken");
          return setStatus("That username is already taken.");
        }
      }
      const avatarUrl = avatarFile ? await uploadAvatar(client, profile.id, avatarFile) : (preview || null);
      const saved = await saveProfile(client, { ...profile, first_name: firstName.trim(), username: cleanUsername, avatar_url: avatarUrl });
      onProfile(saved);
      setStatus("✓ Changes saved");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Profile could not be saved. Please try again.");
    } finally { setPending(false); }
  }

  async function changeTheme(nextTheme: "light" | "dark" | "system") {
    const root = document.documentElement;
    const resolved = nextTheme === "system"
      ? (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : nextTheme;
    root.dataset.theme = resolved;
    root.style.colorScheme = resolved;
    localStorage.setItem("revit-theme", nextTheme);
    const nextPrefs: UserPreferences = { ...preferences, theme: nextTheme };
    onPreferences(nextPrefs);
    try {
      await savePreferences(createClient(), profile.id, nextPrefs);
    } catch {
      // Local preference applied
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword.length < 8) return setStatus("Use a password with at least 8 characters.");
    setPending(true); setStatus("");
    try {
      const client = createClient();
      const { error } = await client.auth.updateUser({ password: newPassword, current_password: currentPassword });
      if (error) throw error;
      if (signOutOthers) {
        const { error: signOutError } = await client.auth.signOut({ scope: "others" });
        if (signOutError) throw signOutError;
      }
      setCurrentPassword(""); setNewPassword(""); setStatus(signOutOthers ? "Password changed; other sessions were signed out." : "Password changed.");
    } catch { setStatus("Password could not be changed. Check your current password and try again."); }
    finally { setPending(false); }
  }

  async function toggleLeaderboard(nextValue: boolean) {
    setLeaderboardOptIn(nextValue);
    setPending(true); setStatus("");
    try {
      const saved = await savePreferences(createClient(), profile.id, {
        ...preferences,
        leaderboard_opt_in: nextValue,
      });
      onPreferences(saved);
      setStatus(nextValue
        ? "Leaderboard participation is on. Your display name, avatar, and rank appear on leaderboards."
        : "Leaderboard participation is off. Your private learning data remains available only to you.");
    } catch {
      setLeaderboardOptIn(!nextValue);
      setStatus("Privacy preference could not be saved. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function connectGoogle() {
    setPending(true);
    setStatus("");
    setGoogleError(null);
    try {
      const callback = new URL("/auth/callback", window.location.origin);
      callback.searchParams.set("flow", "link-google");
      const { data, error } = await createClient().auth.linkIdentity({
        provider: "google",
        options: {
          redirectTo: callback.toString(),
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) throw error;
      if (data?.url) {
        window.location.assign(data.url);
      }
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : "";
      const isManualDisabled =
        errorMsg.toLowerCase().includes("manual linking is disabled") ||
        (typeof err === "object" && err !== null && "code" in err && (err as { code: unknown }).code === "manual_linking_disabled");

      const message = isManualDisabled
        ? "Connecting Google directly from settings is disabled by Supabase Auth policy. To connect your account, sign out and click 'Continue with Google' with the same email — your account will be linked automatically."
        : errorMsg.toLowerCase().includes("already") || errorMsg.toLowerCase().includes("identity_already_exists")
        ? "This Google account is already connected to another RevIT user. Sign out and click 'Continue with Google' to access it."
        : errorMsg || "Google could not be connected. Please sign out and log in with Google to connect your account.";

      setGoogleError(message);
      setGoogleErrorModalOpen(true);
      setStatus(message);
      setPending(false);
    }
  }

  async function signOut() {
    setPending(true); setStatus("");
    try {
      const { error } = await createClient().auth.signOut({ scope: "local" });
      if (error) throw error;
      localStorage.removeItem("revit-remember-until");
      localStorage.removeItem("revit-session-policy");
      sessionStorage.removeItem("revit-session-only");
      router.replace("/auth");
      router.refresh();
    } catch {
      setStatus("You could not be signed out. Please try again.");
      setPending(false);
    }
  }

  const cleanUsername = username.trim().toLowerCase();
  const isProfileDirty =
    firstName.trim() !== profile.first_name ||
    cleanUsername !== profile.username ||
    avatarFile !== null ||
    (preview === "" && Boolean(profile.avatar_url));

  const canSaveProfile =
    isProfileDirty &&
    !pending &&
    firstName.trim().length > 0 &&
    /^[a-z0-9_]{3,24}$/.test(cleanUsername) &&
    usernameStatus !== "taken" &&
    usernameStatus !== "checking";

  return (
    <div className="profile-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="profile-modal account-modal" role="dialog" aria-modal="true" aria-labelledby="account-title">
        <div className="profile-modal-heading">
          <div>
            <p className="eyebrow">Cloud account</p>
            <h2 id="account-title">Account settings</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close settings">×</button>
        </div>

        <div className="auth-tabs account-tabs" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", minHeight: "44px" }}>
          <button className={tab === "profile" ? "active" : ""} type="button" style={{ minHeight: "36px" }} onClick={() => { setTab("profile"); setStatus(""); }}>Profile</button>
          <button className={tab === "personalization" ? "active" : ""} type="button" style={{ minHeight: "36px" }} onClick={() => { setTab("personalization"); setStatus(""); }}>Personalization</button>
          <button className={tab === "privacy" ? "active" : ""} type="button" style={{ minHeight: "36px" }} onClick={() => { setTab("privacy"); setStatus(""); }}>Privacy</button>
          <button className={tab === "security" ? "active" : ""} type="button" style={{ minHeight: "36px" }} onClick={() => { setTab("security"); setStatus(""); }}>Security</button>
        </div>

        {tab === "profile" ? (
          <form onSubmit={submitProfile} className="account-form">
            <section className="account-plan-card" aria-labelledby="current-plan-title">
              <div className="account-plan-header">
                <div className="account-plan-badge-group">
                  <span className="account-plan-kicker">Current Plan</span>
                  <div className="account-plan-title-row">
                    <span className="account-plan-icon" aria-hidden="true">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2l2.4 7.4h7.6l-6.2 4.5 2.4 7.4-6.2-4.5-6.2 4.5 2.4-7.4-6.2-4.5h7.6z"/>
                      </svg>
                    </span>
                    <h3 id="current-plan-title">RevIT {isProActive(entitlement) ? "Pro" : "Free"}</h3>
                  </div>
                </div>
                <span
                  className={`account-plan-status-pill ${isProActive(entitlement) ? "active" : "standard"}`}
                  aria-label={isProActive(entitlement) ? "Subscription status: Active" : "Plan status: Free"}
                >
                  <span className="account-plan-status-dot" aria-hidden="true" />
                  {isProActive(entitlement) ? "Active" : "Free"}
                </span>
              </div>

              <div className="account-plan-body">
                {isProActive(entitlement) && entitlement.proExpiresAt ? (
                  <div className="account-plan-expiry">
                    <span className="account-plan-expiry-label">Your Pro access is active until</span>
                    <span className="account-plan-expiry-date">
                      {new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(new Date(entitlement.proExpiresAt))}
                    </span>
                  </div>
                ) : entitlement.storedPlan === "pro" ? (
                  <p className="account-plan-notice">
                    Your RevIT Pro access has ended. Your study history remains safe. Your account is using RevIT Free.
                  </p>
                ) : (
                  <p className="account-plan-notice">
                    Core RevIT study tools are included.
                  </p>
                )}
              </div>

              <div className="account-plan-footer">
                <a
                  className="account-plan-cta"
                  href={isProActive(entitlement) ? "https://www.facebook.com/revithoroughly" : "/pricing"}
                  {...(isProActive(entitlement) ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                >
                  <span>{isProActive(entitlement) ? "Contact us to renew" : "Learn about RevIT Pro"}</span>
                  {isProActive(entitlement) && <span className="sr-only"> on Facebook (opens in a new tab)</span>}
                  <span className="account-plan-cta-arrow" aria-hidden="true">↗</span>
                </a>
              </div>
            </section>

            <div className="profile-photo-row">
              <span className={`avatar profile-preview ${preview ? "has-photo" : ""}`} style={preview ? { backgroundImage: `url(${JSON.stringify(preview)})` } : undefined}>
                {preview ? "" : firstName.slice(0, 1).toUpperCase()}
              </span>
              <div>
                <label className="photo-upload">Choose photo<input type="file" accept={AVATAR_ACCEPT} onChange={(event) => void chooseAvatar(event.target.files?.[0])} /></label>
                {preview && <button className="text-button quiet" type="button" onClick={() => { setPreview(""); setAvatarFile(null); }}>Remove</button>}
                <small>PNG, JPG, or WebP up to 2 MB</small>
              </div>
            </div>

            {/* Redesigned First Name and Username Section */}
            <div className="profile-fields-card">
              <div className="profile-field-group">
                <label className="profile-field-label" htmlFor="account-first-name">
                  <span>First name</span>
                  <span className="profile-field-count">{firstName.length}/40</span>
                </label>
                <div className="profile-field-input-wrap">
                  <input
                    id="account-first-name"
                    className="account-input"
                    maxLength={40}
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    placeholder="e.g. Cedric"
                    required
                  />
                </div>
              </div>

              <div className="profile-field-group">
                <label className="profile-field-label" htmlFor="account-username">
                  <span>Username</span>
                </label>
                <div className="profile-field-input-wrap has-prefix">
                  <span className="input-prefix" aria-hidden="true">@</span>
                  <input
                    id="account-username"
                    className="account-input"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck="false"
                    required
                  />
                </div>
                <div className="profile-field-hint-row">
                  <span className="profile-field-hint">
                    {cleanUsername ? `revit.app/@${cleanUsername}` : "Lowercase letters, numbers, underscores (3–24 chars)"}
                  </span>
                  {usernameStatus === "checking" && (
                    <span className="profile-status-pill checking">Checking…</span>
                  )}
                  {usernameStatus === "available" && (
                    <span className="profile-status-pill available">✓ Available</span>
                  )}
                  {usernameStatus === "taken" && (
                    <span className="profile-status-pill taken">Already taken</span>
                  )}
                  {usernameStatus === "invalid" && (
                    <span className="profile-status-pill taken">3–24 chars (a-z, 0-9, _)</span>
                  )}
                </div>
              </div>
            </div>

            {status && <p className="form-status" role="status">{status}</p>}

            <div className="profile-modal-actions">
              <button
                className="text-button quiet"
                type="button"
                onClick={() => {
                  setFirstName(profile.first_name);
                  setUsername(profile.username);
                  setPreview(profile.avatar_url ?? "");
                  setAvatarFile(null);
                  setStatus("");
                  onClose();
                }}
              >
                Cancel
              </button>
              <button
                className="primary-button"
                type="submit"
                disabled={!canSaveProfile}
                aria-busy={pending}
              >
                {pending ? "Saving…" : "Save profile"}
              </button>
            </div>
          </form>
        ) : tab === "personalization" ? (
          <div className="settings-section">
            <div className="settings-section-header">
              <p className="eyebrow">Personalization</p>
              <h3>Preferences</h3>
              <p className="settings-section-desc">Customize theme and study tools for your review routine.</p>
            </div>

            <div className="settings-surface">
              <div className="settings-row">
                <div className="settings-row-info">
                  <span className="settings-row-title">Color Theme</span>
                  <span className="settings-row-desc">Select a dark, light, or system-matched appearance.</span>
                </div>
                <div className="settings-row-control">
                  <div className="theme-segmented-control" role="radiogroup" aria-label="Theme selection">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={preferences.theme === "dark"}
                      className={`theme-segment-btn ${preferences.theme === "dark" ? "active" : ""}`}
                      onClick={() => void changeTheme("dark")}
                    >
                      Dark
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={preferences.theme === "light"}
                      className={`theme-segment-btn ${preferences.theme === "light" ? "active" : ""}`}
                      onClick={() => void changeTheme("light")}
                    >
                      Light
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={preferences.theme === "system"}
                      className={`theme-segment-btn ${preferences.theme === "system" ? "active" : ""}`}
                      onClick={() => void changeTheme("system")}
                    >
                      System
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: "14px" }}>
              <MtapPreferenceControl enabled={preferences.mtap_features_enabled} onChange={onMtapFeaturesChange} />
            </div>
          </div>
        ) : tab === "privacy" ? (
          <div className="settings-section">
            <div className="settings-section-header">
              <p className="eyebrow">Privacy</p>
              <h3>Privacy preferences</h3>
              <p className="settings-section-desc">Control how your information is used and displayed.</p>
            </div>

            <div className="settings-surface">
              <div className="settings-row">
                <div className="settings-row-info">
                  <span className="settings-row-title">Show my activity on leaderboards</span>
                  <span className="settings-row-desc">
                    When enabled, your display name, avatar, and study rank appear on public leaderboards. Your email, account ID, and private quiz history remain strictly private.
                  </span>
                </div>
                <div className="settings-row-control">
                  <label className="revit-switch">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={leaderboardOptIn}
                      disabled={pending}
                      onChange={(event) => void toggleLeaderboard(event.target.checked)}
                    />
                    <span className="revit-switch-track" aria-hidden="true" />
                    <span className="revit-switch-state">{pending ? "…" : leaderboardOptIn ? "On" : "Off"}</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="settings-notice-banner" style={{ marginTop: "14px" }}>
              <svg className="settings-notice-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <span>Your study records and account details are stored privately in your personal RevIT cloud space and never shared or sold to third parties.</span>
            </div>

            {status && <p className="form-status" role="status" style={{ marginTop: "14px" }}>{status}</p>}
          </div>
        ) : (
          <div className="security-stack">
            <div className="settings-section">
              <div className="settings-section-header">
                <p className="eyebrow">Sign-in methods</p>
                <h3 id="sign-in-methods-title">Connected accounts</h3>
                <p className="settings-section-desc">Authentication methods linked to your RevIT account.</p>
              </div>
              <div className="settings-surface" aria-labelledby="sign-in-methods-title">
                <div className="settings-row">
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
                    <span className="sign-in-method-icon" aria-hidden="true">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                      </svg>
                    </span>
                    <div className="settings-row-info">
                      <span className="settings-row-title">Email &amp; Password</span>
                      <span className="settings-row-desc">{identities?.some((identity) => identity.provider === "email") ? email : "Not configured"}</span>
                    </div>
                  </div>
                  <div className="settings-row-control">
                    <span className={`settings-badge ${identities?.some((identity) => identity.provider === "email") ? "connected" : "disconnected"}`}>
                      <span className="settings-badge-dot" aria-hidden="true" />
                      {identities === null ? "Checking…" : identities.some((identity) => identity.provider === "email") ? "Connected" : "Not connected"}
                    </span>
                  </div>
                </div>

                <hr className="settings-surface-divider" />

                <div className="settings-row">
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
                    <span className="sign-in-method-icon" aria-hidden="true">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"/>
                      </svg>
                    </span>
                    <div className="settings-row-info">
                      <span className="settings-row-title">Google Account</span>
                      <span className="settings-row-desc">{identities?.find((identity) => identity.provider === "google")?.identity_data?.email ?? "Not connected"}</span>
                    </div>
                  </div>
                  <div className="settings-row-control">
                    {identities?.some((identity) => identity.provider === "google") ? (
                      <span className="settings-badge connected">
                        <span className="settings-badge-dot" aria-hidden="true" />
                        Connected
                      </span>
                    ) : (
                      <button
                        className="secondary-button"
                        type="button"
                        style={{ minHeight: "32px", padding: "6px 12px", fontSize: "11px" }}
                        onClick={() => void connectGoogle()}
                        disabled={pending || identities === null}
                      >
                        {pending ? "Connecting…" : "Connect Google"}
                      </button>
                    )}
                  </div>
                </div>
                {googleError && (
                  <div
                    style={{
                      margin: "8px 0 2px",
                      padding: "10px 14px",
                      background: "rgba(239, 68, 68, 0.12)",
                      border: "1px solid rgba(239, 68, 68, 0.35)",
                      borderRadius: "10px",
                      color: "var(--ink)",
                      fontSize: "12px",
                      lineHeight: 1.5,
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "10px",
                    }}
                  >
                    <span style={{ fontSize: "16px", flexShrink: 0, marginTop: "1px" }} aria-hidden="true">⚠️</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong style={{ display: "block", color: "#f87171", marginBottom: "2px" }}>
                        Google connection issue
                      </strong>
                      <span style={{ color: "var(--muted)" }}>{googleError}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setGoogleError(null)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--muted)",
                        cursor: "pointer",
                        padding: "0 4px",
                        fontSize: "16px",
                      }}
                      aria-label="Dismiss error"
                    >
                      &times;
                    </button>
                  </div>
                )}
              </div>
            </div>

            {(identities === null ? Boolean(email) : identities.some((identity) => identity.provider === "email")) && (
              <form onSubmit={changePassword} className="settings-section">
                <div className="settings-section-header">
                  <p className="eyebrow">Password</p>
                  <h3>Change password</h3>
                  <p className="settings-section-desc">Signed in as {email}. Confirm your current password before changing it.</p>
                </div>
                <div className="settings-surface">
                  <div className="revit-field-group">
                    <label className="revit-field-label" htmlFor="current-pwd">Current password</label>
                    <input
                      id="current-pwd"
                      className="account-input"
                      type="password"
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                      required
                    />
                  </div>
                  <div className="revit-field-group">
                    <label className="revit-field-label" htmlFor="new-pwd">New password</label>
                    <input
                      id="new-pwd"
                      className="account-input"
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      required
                    />
                    <div className="revit-input-hint-row">
                      <span className="revit-input-hint">Must be at least 8 characters</span>
                    </div>
                  </div>
                  <label className="check-label" style={{ marginTop: "2px" }}>
                    <input
                      type="checkbox"
                      checked={signOutOthers}
                      onChange={(event) => setSignOutOthers(event.target.checked)}
                    />
                    <span>Sign out other devices after changing</span>
                  </label>
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "4px" }}>
                    <button
                      className="primary-button"
                      type="submit"
                      disabled={pending || newPassword.length < 8 || !currentPassword}
                    >
                      {pending ? "Updating…" : "Change password"}
                    </button>
                  </div>
                </div>
              </form>
            )}

            <section className="settings-danger-zone" aria-labelledby="danger-zone-title">
              <div className="settings-section-header">
                <p className="eyebrow" id="danger-zone-title" style={{ color: "var(--danger)" }}>Danger zone</p>
              </div>
              <div className="settings-danger-surface">
                <div className="settings-danger-info">
                  <span className="settings-danger-title">Sign out of this session</span>
                  <span className="settings-danger-desc">Sign out of your RevIT account on this device.</span>
                </div>
                <button
                  className="danger-button account-signout"
                  type="button"
                  onClick={() => void signOut()}
                  disabled={pending}
                >
                  {pending ? "Signing out…" : "Sign out"}
                </button>
              </div>
            </section>

            {status && <p className="form-status" role="status">{status}</p>}
          </div>
        )}
      </section>

      {googleErrorModalOpen && googleError && (
        <div
          className="profile-modal-backdrop"
          onClick={() => setGoogleErrorModalOpen(false)}
          role="dialog"
          aria-modal="true"
          style={{ zIndex: 100 }}
        >
          <div
            className="profile-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "420px", padding: "24px 26px" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
              <span style={{ fontSize: "22px" }} aria-hidden="true">⚠️</span>
              <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 750, color: "var(--ink)" }}>
                Unable to Connect Google
              </h3>
            </div>
            <p style={{ margin: "0 0 20px", fontSize: "12.5px", lineHeight: 1.55, color: "var(--muted)" }}>
              {googleError}
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setGoogleErrorModalOpen(false)}
                style={{ minHeight: "34px", padding: "6px 18px", fontSize: "12px" }}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
