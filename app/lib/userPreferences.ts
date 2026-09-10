import type { UserPreferences } from "./domain";

export const LOCAL_PREFERENCES_STORAGE_KEY = "revit-user-preferences-v1:local";

export function defaultUserPreferences(timezone = "Asia/Manila"): UserPreferences {
  return {
    timezone,
    theme: "system",
    leaderboard_opt_in: false,
    mtap_features_enabled: false,
    mtap_onboarding_completed: false,
  };
}

export function normalizeUserPreferences(
  value: Partial<UserPreferences> | null | undefined,
  timezone = "Asia/Manila",
): UserPreferences {
  const defaults = defaultUserPreferences(timezone);
  return {
    ...defaults,
    ...value,
    timezone: typeof value?.timezone === "string" && value.timezone ? value.timezone : defaults.timezone,
    theme: value?.theme === "light" || value?.theme === "dark" || value?.theme === "system" ? value.theme : defaults.theme,
    leaderboard_opt_in: value?.leaderboard_opt_in === true,
    mtap_features_enabled: value?.mtap_features_enabled === true,
    mtap_onboarding_completed: value?.mtap_onboarding_completed === true,
  };
}

export function withMtapFeaturePreference(preferences: UserPreferences, enabled: boolean): UserPreferences {
  return {
    ...preferences,
    mtap_features_enabled: enabled,
    mtap_onboarding_completed: true,
  };
}
