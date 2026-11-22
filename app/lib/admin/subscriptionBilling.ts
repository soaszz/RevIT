import { PRO_PLANS } from "../proPlans";

// Administrators confirm that payment was already received when they choose Purchased.
// These helpers only validate and resolve the amount; they never collect, verify or charge it.
export const MAX_RECORDED_AMOUNT_PHP = 1_000_000;

export function presetAmountForMonths(months: number | null | undefined): number | null {
  if (months == null) return null;
  return PRO_PLANS.find(plan => plan.months === months)?.price ?? null;
}

export type RecordedAmountResult =
  | { ok: true; value: number | null }
  | { ok: false; error: string };

// Blank stays "not recorded"; an explicit 0 stays a recorded zero.
export function parseAmountInput(raw: string): RecordedAmountResult {
  const text = raw.trim();
  if (!text) return { ok: true, value: null };
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(text)) {
    return { ok: false, error: "Enter a valid amount with up to 2 decimal places." };
  }
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0) {
    return { ok: false, error: "Enter a valid amount with up to 2 decimal places." };
  }
  if (value > MAX_RECORDED_AMOUNT_PHP) {
    return { ok: false, error: "Recorded amount is too large." };
  }
  return { ok: true, value: Math.round(value * 100) / 100 };
}

export function validateRecordedAmount(value: unknown): RecordedAmountResult {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false, error: "Enter a valid amount." };
  }
  if (value < 0 || value > MAX_RECORDED_AMOUNT_PHP || !/^\d{1,10}(\.\d{1,2})?$/.test(String(value))) {
    return { ok: false, error: "Enter a valid amount with up to 2 decimal places." };
  }
  return { ok: true, value: Math.round(value * 100) / 100 };
}

// Purchased presets always use the authoritative configuration. A custom duration uses the
// optional manual amount. Complimentary sources and non-grant actions never carry a sale.
export function resolveAdminRecordedAmount(input: {
  action: string;
  source: string;
  planMonths: number | null;
  amountPhp?: unknown;
}): RecordedAmountResult {
  const grant = input.action === "activate" || input.action === "extend";
  if (!grant || input.source !== "purchased") return { ok: true, value: null };
  if (input.planMonths != null) {
    const preset = presetAmountForMonths(input.planMonths);
    if (preset == null) return { ok: false, error: "Invalid plan duration." };
    return { ok: true, value: preset };
  }
  return validateRecordedAmount(input.amountPhp);
}
