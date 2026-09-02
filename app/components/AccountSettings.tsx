"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { Profile, UserPreferences } from "../lib/domain";
import { savePreferences, saveProfile, uploadAvatar } from "../lib/cloudService";
import { createClient } from "../lib/supabase/client";

export default function AccountSettings({ profile, preferences, email, onClose, onProfile, onPreferences }: {
  profile: Profile;
  preferences: UserPreferences;
  email: string;
  onClose: () => void;
  onProfile: (profile: Profile) => void;
  onPreferences: (preferences: UserPreferences) => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"profile" | "privacy" | "security">("profile");
  const [firstName, setFirstName] = useState(profile.first_name);
  const [username, setUsername] = useState(profile.username);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [preview, setPreview] = useState(profile.avatar_url ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [leaderboardOptIn, setLeaderboardOptIn] = useState(preferences.leaderboard_opt_in);
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);

  function chooseAvatar(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) return setStatus("Choose an image smaller than 2 MB.");
    setAvatarFile(file); setPreview(URL.createObjectURL(file));
  }

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setStatus("");
    try {
      const client = createClient();
      const cleanUsername = username.trim().toLowerCase();
      if (!firstName.trim()) throw new Error("First name is required.");
      if (!/^[a-z0-9_]{3,24}$/.test(cleanUsername)) throw new Error("Username must be 3–24 characters using letters, numbers, or underscores.");
      if (cleanUsername !== profile.username) {
        const { data, error } = await client.rpc("is_username_available", { candidate: cleanUsername });
        if (error) throw error; if (!data) throw new Error("That username is already taken.");
      }
      const avatarUrl = avatarFile ? await uploadAvatar(client, profile.id, avatarFile) : (preview || null);
      const saved = await saveProfile(client, { ...profile, first_name: firstName.trim(), username: cleanUsername, avatar_url: avatarUrl });
      onProfile(saved); setStatus("Profile saved to the cloud.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Profile could not be saved."); }
    finally { setPending(false); }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setStatus("");
    try {
      if (newPassword.length < 8) throw new Error("Use a password with at least 8 characters.");
      const client = createClient();
      const { error } = await client.auth.updateUser({ password: newPassword, current_password: currentPassword });
      if (error) throw error;
      if (signOutOthers) {
        const { error: signOutError } = await client.auth.signOut({ scope: "others" });
        if (signOutError) throw signOutError;
      }
      setCurrentPassword(""); setNewPassword(""); setStatus(signOutOthers ? "Password changed; other sessions were signed out." : "Password changed.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Password could not be changed."); }
    finally { setPending(false); }
  }

  async function submitPrivacy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setStatus("");
    try {
      const saved = await savePreferences(createClient(), profile.id, {
        ...preferences,
        leaderboard_opt_in: leaderboardOptIn,
      });
      onPreferences(saved);
      setStatus(leaderboardOptIn
        ? "Leaderboard participation is on. Your display name, avatar, rank, and selected metric may appear."
        : "Leaderboard participation is off. Your private learning data remains available only to you.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Privacy preference could not be saved."); }
    finally { setPending(false); }
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
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "You could not be signed out. Please try again.");
      setPending(false);
    }
  }

  return (
    <div className="profile-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="profile-modal account-modal" role="dialog" aria-modal="true" aria-labelledby="account-title">
        <div className="profile-modal-heading"><div><p className="eyebrow">Cloud account</p><h2 id="account-title">Account settings</h2></div><button type="button" onClick={onClose} aria-label="Close settings">×</button></div>
        <div className="auth-tabs"><button className={tab === "profile" ? "active" : ""} type="button" onClick={() => { setTab("profile"); setStatus(""); }}>Profile</button><button className={tab === "privacy" ? "active" : ""} type="button" onClick={() => { setTab("privacy"); setStatus(""); }}>Privacy</button><button className={tab === "security" ? "active" : ""} type="button" onClick={() => { setTab("security"); setStatus(""); }}>Security</button></div>
        {tab === "profile" ? <form onSubmit={submitProfile}>
          <div className="profile-photo-row"><span className={`avatar profile-preview ${preview ? "has-photo" : ""}`} style={preview ? { backgroundImage: `url(${JSON.stringify(preview)})` } : undefined}>{preview ? "" : firstName.slice(0, 1).toUpperCase()}</span><div><label className="photo-upload">Choose photo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => chooseAvatar(event.target.files?.[0])} /></label>{preview && <button className="text-button quiet" type="button" onClick={() => { setPreview(""); setAvatarFile(null); }}>Remove</button>}<small>PNG, JPG, or WebP up to 2 MB</small></div></div>
          <label className="profile-name-field"><span>First name</span><input value={firstName} onChange={(event) => setFirstName(event.target.value)} required /></label>
          <label className="profile-name-field"><span>Username</span><input value={username} onChange={(event) => setUsername(event.target.value)} required /></label>
          {status && <p className="form-status" role="status">{status}</p>}
          <div className="profile-modal-actions"><button className="text-button quiet" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={pending}>Save profile</button></div>
        </form> : tab === "privacy" ? <form onSubmit={submitPrivacy}>
          <p className="eyebrow">Leaderboard privacy</p>
          <p className="security-copy">Participation is optional and off by default. Turning it on shares only your profile display name, avatar, rank, and the metric shown in a leaderboard—not your email, account ID, or raw study history.</p>
          <label className="check-label"><input type="checkbox" checked={leaderboardOptIn} onChange={(event) => setLeaderboardOptIn(event.target.checked)} /><span>Appear on Leaderboards</span></label>
          {status && <p className="form-status" role="status">{status}</p>}
          <div className="profile-modal-actions"><button className="text-button quiet" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={pending}>{pending ? "Saving…" : "Save privacy"}</button></div>
        </form> : <div className="security-stack">
          <form onSubmit={changePassword}><p className="eyebrow">Password</p><p className="security-copy">Signed in as {email}. Confirm your current password before changing it.</p><label className="profile-name-field"><span>Current password</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label><label className="profile-name-field"><span>New password</span><input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label><label className="check-label"><input type="checkbox" checked={signOutOthers} onChange={(event) => setSignOutOthers(event.target.checked)} /><span>Sign out other devices after changing</span></label><button className="primary-button" type="submit" disabled={pending}>Change password</button></form>
          {status && <p className="form-status" role="status">{status}</p>}
        </div>}
        <footer className="account-modal-footer">
          <button className="danger-button account-signout" type="button" onClick={() => void signOut()} disabled={pending}>Sign out</button>
        </footer>
      </section>
    </div>
  );
}
