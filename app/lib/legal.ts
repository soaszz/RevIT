import type { Profile } from "./domain";

export const CURRENT_TERMS_VERSION = "2026-09-03";
export const CURRENT_PRIVACY_VERSION = "2026-09-03";

export const LEGAL_EFFECTIVE_DATE = "September 3, 2026";

export type LegalConsent = Pick<
  Profile,
  "terms_accepted_at" | "terms_version" | "privacy_accepted_at" | "privacy_version"
>;

export function hasCurrentLegalConsent(consent: LegalConsent | null | undefined) {
  return Boolean(
    consent?.terms_accepted_at
      && consent.terms_version === CURRENT_TERMS_VERSION
      && consent.privacy_accepted_at
      && consent.privacy_version === CURRENT_PRIVACY_VERSION,
  );
}
