/* eslint-disable @next/next/no-img-element */
"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Factor } from "@supabase/supabase-js";
import type { Profile } from "../lib/domain";
import { saveProfile, uploadAvatar } from "../lib/cloudService";
import { createClient } from "../lib/supabase/client";

export default function AccountSettings({ profile, email, onClose, onProfile }: {
  profile: Profile;
  email: string;
  onClose: () => void;
  onProfile: (profile: Profile) => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"profile" | "security">("profile");
  const [firstName, setFirstName] = useState(profile.first_name);
  const [username, setUsername] = useState(profile.username);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [preview, setPreview] = useState(profile.avatar_url ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [factors, setFactors] = useState<Factor[]>([]);
  const [enrollment, setEnrollment] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);

  async function refreshFactors() {
    const { data } = await createClient().auth.mfa.listFactors();
    setFactors(data?.totp.filter((factor: Factor) => factor.status === "verified") ?? []);
  }
  useEffect(() => {
    let cancelled = false;
    void createClient().auth.mfa.listFactors().then((result: { data: { totp: Factor[] } | null }) => {
      if (!cancelled) setFactors(result.data?.totp.filter((factor: Factor) => factor.status === "verified") ?? []);
    });
    return () => { cancelled = true; };
  }, []);

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

  async function beginMfa() {
    setPending(true); setStatus("");
    const { data, error } = await createClient().auth.mfa.enroll({ factorType: "totp", friendlyName: "RevIT authenticator" });
    if (error) setStatus(error.message);
    else setEnrollment({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    setPending(false);
  }

  async function verifyMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!enrollment) return;
    setPending(true); setStatus("");
    const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId: enrollment.id, code: totpCode });
    if (error) setStatus(error.message);
    else { setEnrollment(null); setTotpCode(""); setStatus("Two-factor authentication is enabled."); await refreshFactors(); }
    setPending(false);
  }

  async function disableMfa(id: string) {
    setPending(true); setStatus("");
    const { error } = await createClient().auth.mfa.unenroll({ factorId: id });
    if (error) setStatus(error.message); else { setStatus("Two-factor authentication is disabled."); await refreshFactors(); }
    setPending(false);
  }

  async function signOut() {
    localStorage.removeItem("revit-remember-until"); sessionStorage.removeItem("revit-session-only");
    await createClient().auth.signOut({ scope: "local" }); router.replace("/auth");
  }

  const qrSource = enrollment?.qr.startsWith("data:") ? enrollment.qr : enrollment ? `data:image/svg+xml;utf8,${encodeURIComponent(enrollment.qr)}` : "";
  return (
    <div className="profile-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="profile-modal account-modal" role="dialog" aria-modal="true" aria-labelledby="account-title">
        <div className="profile-modal-heading"><div><p className="eyebrow">Cloud account</p><h2 id="account-title">Profile & security</h2></div><button type="button" onClick={onClose} aria-label="Close settings">×</button></div>
        <div className="auth-tabs"><button className={tab === "profile" ? "active" : ""} type="button" onClick={() => { setTab("profile"); setStatus(""); }}>Profile</button><button className={tab === "security" ? "active" : ""} type="button" onClick={() => { setTab("security"); setStatus(""); }}>Security</button></div>
        {tab === "profile" ? <form onSubmit={submitProfile}>
          <div className="profile-photo-row"><span className={`avatar profile-preview ${preview ? "has-photo" : ""}`} style={preview ? { backgroundImage: `url(${JSON.stringify(preview)})` } : undefined}>{preview ? "" : firstName.slice(0, 1).toUpperCase()}</span><div><label className="photo-upload">Choose photo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => chooseAvatar(event.target.files?.[0])} /></label>{preview && <button className="text-button quiet" type="button" onClick={() => { setPreview(""); setAvatarFile(null); }}>Remove</button>}<small>PNG, JPG, or WebP up to 2 MB</small></div></div>
          <label className="profile-name-field"><span>First name</span><input value={firstName} onChange={(event) => setFirstName(event.target.value)} required /></label>
          <label className="profile-name-field"><span>Username</span><input value={username} onChange={(event) => setUsername(event.target.value)} required /></label>
          {status && <p className="form-status" role="status">{status}</p>}
          <div className="profile-modal-actions"><button className="text-button quiet" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={pending}>Save profile</button></div>
        </form> : <div className="security-stack">
          <form onSubmit={changePassword}><p className="eyebrow">Password</p><p className="security-copy">Signed in as {email}. Confirm your current password before changing it.</p><label className="profile-name-field"><span>Current password</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label><label className="profile-name-field"><span>New password</span><input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label><label className="check-label"><input type="checkbox" checked={signOutOthers} onChange={(event) => setSignOutOthers(event.target.checked)} /><span>Sign out other devices after changing</span></label><button className="primary-button" type="submit" disabled={pending}>Change password</button></form>
          <section className="mfa-section"><p className="eyebrow">Two-factor authentication</p>{factors.length ? <><p className="security-copy">Authenticator app is enabled.</p>{factors.map((factor) => <button className="secondary-button" type="button" key={factor.id} onClick={() => void disableMfa(factor.id)} disabled={pending}>Disable authenticator</button>)}</> : enrollment ? <form onSubmit={verifyMfa}><img className="mfa-qr" src={qrSource} alt="Authenticator setup QR code" /><p className="mfa-secret">Manual key: <code>{enrollment.secret}</code></p><label className="profile-name-field"><span>Six-digit code</span><input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, ""))} required /></label><button className="primary-button" type="submit" disabled={pending || totpCode.length !== 6}>Enable authenticator</button></form> : <><p className="security-copy">Add an authenticator app as a separate second factor.</p><button className="secondary-button" type="button" onClick={() => void beginMfa()} disabled={pending}>Set up authenticator</button></>}</section>
          {status && <p className="form-status" role="status">{status}</p>}
          <button className="danger-button" type="button" onClick={() => void signOut()}>Sign out on this device</button>
        </div>}
      </section>
    </div>
  );
}
