export type AuthState = "logged-out" | "unverified" | "onboarding" | "ready";

export function resolveAuthState(input: {
  hasUser: boolean;
  emailConfirmed: boolean;
  onboardingComplete: boolean;
}): AuthState {
  if (!input.hasUser) return "logged-out";
  if (!input.emailConfirmed) return "unverified";
  if (!input.onboardingComplete) return "onboarding";
  return "ready";
}
