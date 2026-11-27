import { isSupabaseConfigured } from "../supabase/config";
import type { DevelopmentAppearancePreview } from "../appearance";
import type { Appearance, ColorThemeId } from "../colorThemes";
export type OfflineThemeTestContext = { offline: boolean; noUser: boolean; hostname: string };
export function offlineThemeTestAllowed(context: OfflineThemeTestContext) {
  return process.env.NODE_ENV === "development" && context.offline && context.noUser
    && !isSupabaseConfigured() && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(context.hostname);
}
export function createOfflineAppearancePreview(allowed: () => boolean, initialMode: Appearance) {
  if (process.env.NODE_ENV !== "development" || !allowed()) return null;
  let tier: "free" | "pro" = "free", mode = initialMode, palette: ColorThemeId = "original";
  const adapter: DevelopmentAppearancePreview = {
    allowed, appearance: () => mode, palette: () => palette, proThemes: () => tier === "pro",
    setAppearance(value) { mode = value; }, setPalette(value) { palette = value; },
  };
  return { adapter, tier: () => tier, setTier(value: "free" | "pro") { if (allowed() && (value === "free" || value === "pro")) tier = value; } };
}
