"use client";

import { type FormEvent, useState } from "react";
import type { Profile } from "../lib/domain";
import { saveProfile, uploadAvatar } from "../lib/cloudService";
import { AVATAR_ACCEPT, validateAvatarFile } from "../lib/avatarValidation";
import { createClient } from "../lib/supabase/client";

export default function Onboarding({ profile, onComplete }: { profile: Profile; onComplete: (profile: Profile) => void }) {
  const [firstName, setFirstName] = useState(profile.first_name);
  const [username, setUsername] = useState(profile.username);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [preview, setPreview] = useState(profile.avatar_url ?? "");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);

  async function chooseAvatar(file?: File) {
    if (!file) return;
    try {
      await validateAvatarFile(file);
      setAvatarFile(file); setPreview(URL.createObjectURL(file)); setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Choose a valid image smaller than 2 MB.");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanFirstName = firstName.trim();
    const cleanUsername = username.trim().toLowerCase();
    if (!cleanFirstName) return setStatus("First name is required.");
    if (!/^[a-z0-9_]{3,24}$/.test(cleanUsername)) return setStatus("Username must be 3–24 characters using letters, numbers, or underscores.");
    setPending(true); setStatus("");
    try {
      const client = createClient();
      if (cleanUsername !== profile.username) {
        const { data, error } = await client.rpc("is_username_available", { candidate: cleanUsername });
        if (error) throw error;
        if (!data) return setStatus("That username is already taken.");
      }
      const avatarUrl = avatarFile ? await uploadAvatar(client, profile.id, avatarFile) : profile.avatar_url;
      const saved = await saveProfile(client, { ...profile, first_name: cleanFirstName, username: cleanUsername, avatar_url: avatarUrl, onboarding_complete: true });
      onComplete(saved);
    } catch {
      setStatus("Your profile could not be saved. Please try again.");
    } finally { setPending(false); }
  }

  const initials = (firstName.trim()[0] ?? username.trim()[0] ?? "R").toUpperCase();
  return (
    <div className="onboarding-backdrop">
      <section className="onboarding-card" aria-labelledby="onboarding-title">
        <div><p className="eyebrow">One-time setup</p><h1 id="onboarding-title">Make RevIT yours.</h1><p>Your profile, grades, schedule, and meaningful study activity will sync across devices.</p></div>
        <form onSubmit={submit}>
          <div className="profile-photo-row">
            <span className={`avatar profile-preview ${preview ? "has-photo" : ""}`} style={preview ? { backgroundImage: `url(${JSON.stringify(preview)})` } : undefined}>{preview ? "" : initials}</span>
            <div><label className="photo-upload">Choose optional photo<input type="file" accept={AVATAR_ACCEPT} onChange={(event) => void chooseAvatar(event.target.files?.[0])} /></label><small>PNG, JPG, or WebP up to 2 MB</small></div>
          </div>
          <label className="profile-name-field"><span>First name</span><input autoComplete="given-name" maxLength={40} value={firstName} onChange={(event) => setFirstName(event.target.value)} required /></label>
          <label className="profile-name-field"><span>Username</span><input autoComplete="username" minLength={3} maxLength={24} value={username} onChange={(event) => setUsername(event.target.value)} required /></label>
          {status && <p className="profile-error" role="alert">{status}</p>}
          <button className="primary-button wide" type="submit" disabled={pending}>{pending ? "Saving…" : "Continue to RevIT"}</button>
        </form>
      </section>
    </div>
  );
}
