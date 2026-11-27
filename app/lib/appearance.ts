import { COLOR_THEMES, isColorTheme, type Appearance, type ColorThemeId } from "./colorThemes";
export const APPEARANCE_EVENT = "revit-appearance-change";
const appearanceKey = "revit-theme";
export function colorThemeStorageKey(owner: string | null) { return `revit-color-theme:v1:${owner === null ? "guest" : `user:${encodeURIComponent(owner)}`}`; }
export function readLocal(key: string) { try { return localStorage.getItem(key); } catch { return null; } }
function writeLocal(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* Safe in-memory preference only. */ } }
// Presentation preferences only. Authorization is never persisted or inferred from this map.
const paletteMemory = new Map<string | null, ColorThemeId>();
let binding: { owner: string | null; pro: boolean; lease: symbol } | null = null;
// Cosmetic development adapter only; production compiles registration and access to no-ops.
export type DevelopmentAppearancePreview = { allowed: () => boolean; appearance: () => Appearance; palette: () => ColorThemeId; proThemes: () => boolean; setAppearance: (value: Appearance) => void; setPalette: (value: ColorThemeId) => void };
let developmentPreview: DevelopmentAppearancePreview | null = null;
function developmentPreviewAllowed(adapter: DevelopmentAppearancePreview) {
  return typeof window !== "undefined" && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(window.location.hostname) && !binding?.owner && adapter.allowed();
}
function getDevelopmentPreview() {
  if (process.env.NODE_ENV !== "development") return null;
  return developmentPreview && developmentPreviewAllowed(developmentPreview) ? developmentPreview : null;
}
export function connectDevelopmentAppearance(adapter: DevelopmentAppearancePreview) {
  const noop = { refresh() {}, disconnect() {} };
  if (process.env.NODE_ENV !== "development") return noop;
  if (!developmentPreviewAllowed(adapter)) return noop;
  const originalMode = currentAppearance(), chosen = document.documentElement.dataset.appearanceChosen;
  developmentPreview = adapter;
  const refresh = () => { if (developmentPreview === adapter) { applyAppearance(currentAppearance()); notify(); } };
  refresh();
  return { refresh, disconnect() {
    if (developmentPreview !== adapter) return;
    developmentPreview = null;
    if (chosen === undefined) delete document.documentElement.dataset.appearanceChosen;
    else document.documentElement.dataset.appearanceChosen = chosen;
    const saved = readLocal(appearanceKey);
    applyAppearance(saved === "light" || saved === "dark" || saved === "system" ? saved : originalMode); notify();
  } };
}
export function canChooseProColorThemes() { return getDevelopmentPreview()?.proThemes() ?? canUseProColorThemes(); }
function currentOwner() { return binding?.owner ?? null; }
export function canUseProColorThemes() { return Boolean(binding?.owner && binding.pro); }
export function canSelectColorTheme(value: ColorThemeId) {
  const theme = COLOR_THEMES.find(theme => theme.id === value);
  return Boolean(theme && (theme.requiredPlan === "free" || canChooseProColorThemes()));
}
function preferredTheme() {
  const owner = currentOwner();
  if (!paletteMemory.has(owner)) {
    const stored = readLocal(colorThemeStorageKey(owner));
    paletteMemory.set(owner, isColorTheme(stored) ? stored : "original");
  }
  return paletteMemory.get(owner) ?? "original";
}
function effectiveTheme() { const preview = getDevelopmentPreview(); const wanted = preview ? preview.palette() : preferredTheme(); return canSelectColorTheme(wanted) ? wanted : "original"; }
export function currentAppearance(): Appearance { const preview = getDevelopmentPreview(); if (preview) return preview.appearance(); const value = document.documentElement.dataset.appearance; return value === "light" || value === "dark" ? value : "system"; }
export function currentColorTheme(): ColorThemeId { return effectiveTheme(); }
function resolveAppearance(value: Appearance) { return value === "system" ? matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light" : value; }
function applyAppearance(appearance: Appearance) {
  const root = document.documentElement;
  root.dataset.appearance = appearance;
  root.dataset.colorTheme = effectiveTheme();
  root.dataset.theme = resolveAppearance(appearance);
  root.style.colorScheme = root.dataset.theme;
}
function notify() { window.dispatchEvent(new Event(APPEARANCE_EVENT)); }
// Called only by RevITApp's existing owner-bound accessReady/proActive result. No Auth/entitlement request.
export function bindThemeAccess(owner: string | null, verifiedPro: boolean) {
  const lease = Symbol();
  binding = { owner, pro: Boolean(owner && verifiedPro), lease };
  applyAppearance(currentAppearance()); notify();
  return () => {
    if (binding?.lease !== lease) return; // A late previous-account cleanup cannot revoke the new binding.
    binding = null; applyAppearance(currentAppearance()); notify();
  };
}
export function setAppearance(value: Appearance) {
  const preview = getDevelopmentPreview();
  if (preview) { preview.setAppearance(value); applyAppearance(value); notify(); return; }
  document.documentElement.dataset.appearanceChosen = "true";
  applyAppearance(value); writeLocal(appearanceKey, value); notify();
}
export function setColorTheme(value: ColorThemeId) {
  if (!isColorTheme(value) || !canSelectColorTheme(value)) return false;
  const preview = getDevelopmentPreview();
  if (preview) { preview.setPalette(value); applyAppearance(currentAppearance()); notify(); return true; }
  paletteMemory.set(currentOwner(), value); writeLocal(colorThemeStorageKey(currentOwner()), value);
  applyAppearance(currentAppearance()); notify(); return true;
}
export function toggleAppearance() { setAppearance(document.documentElement.dataset.theme === "dark" ? "light" : "dark"); }
export function adoptLegacyAppearance(value: unknown) {
  if (readLocal(appearanceKey) === null && !document.documentElement.dataset.appearanceChosen && (value === "light" || value === "dark")) setAppearance(value);
}
// Always Original before verification. A saved palette is a preference, never proof of Pro.
function bootstrapAppearance() {
  let appearance = "system";
  try { const value = localStorage.getItem("revit-theme"); if (value === "light" || value === "dark" || value === "system") appearance = value; } catch { /* OS fallback */ }
  const root = document.documentElement;
  root.dataset.appearance = appearance;
  root.dataset.colorTheme = "original";
  root.dataset.theme = appearance === "system" ? matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light" : appearance;
  root.style.colorScheme = root.dataset.theme;
}
export const APPEARANCE_SCRIPT = `(${bootstrapAppearance.toString()})()`;
export function startAppearanceSync() {
  const media = matchMedia("(prefers-color-scheme: dark)");
  const systemChanged = () => { if (currentAppearance() === "system") applyAppearance("system"); };
  const stored = (event: StorageEvent) => {
    if (getDevelopmentPreview()) return;
    try { if (event.storageArea !== localStorage) return; } catch { return; }
    const ownKey = colorThemeStorageKey(currentOwner());
    // Invalidate inactive-account preferences without applying them to this account.
    for (const owner of paletteMemory.keys()) if (event.key === null || event.key === colorThemeStorageKey(owner)) paletteMemory.delete(owner);
    if (event.key !== null && event.key !== appearanceKey && event.key !== ownKey) return;
    if (event.key === null || event.key === ownKey) paletteMemory.delete(currentOwner());
    const appearance = readLocal(appearanceKey);
    applyAppearance(appearance === "light" || appearance === "dark" ? appearance : "system"); notify();
  };
  systemChanged(); media.addEventListener("change", systemChanged); window.addEventListener("storage", stored);
  return () => { media.removeEventListener("change", systemChanged); window.removeEventListener("storage", stored); };
}
