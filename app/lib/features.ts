import type { UserPreferences } from "./domain";

export type RevITFeature =
  | "reviewLibrary"
  | "progress"
  | "leaderboards"
  | "weaknessAnalytics"
  | "studyPlanner"
  | "calendar"
  | "examSchedule"
  | "grades"
  | "gradeSimulator"
  | "revitAi"
  | "xp"
  | "achievements";

export type FeatureAccess = {
  requiresMtap: boolean;
};

export const FEATURES: Readonly<Record<RevITFeature, FeatureAccess>> = Object.freeze({
  reviewLibrary: { requiresMtap: false },
  progress: { requiresMtap: false },
  leaderboards: { requiresMtap: false },
  weaknessAnalytics: { requiresMtap: false },
  studyPlanner: { requiresMtap: false },
  calendar: { requiresMtap: false },
  examSchedule: { requiresMtap: false },
  grades: { requiresMtap: false },
  gradeSimulator: { requiresMtap: true },
  revitAi: { requiresMtap: false },
  xp: { requiresMtap: false },
  achievements: { requiresMtap: false },
});

export function canAccessFeature(feature: RevITFeature, preferences: UserPreferences) {
  return !FEATURES[feature].requiresMtap || preferences.mtap_features_enabled;
}
