# Grant-duration recording gap — plan_months

Status: **APPLIED (application-side only).** The admin UI now forwards the selected Pro preset
duration to the existing 11-argument writer. No writer change, no production SQL, no subscriber
mutation, no historical backfill.

## Verified live writer (production, unchanged)

`md5(prosrc)` before and after this correction: `bcf56ed8de8564405649685f592fc70f`.

```
public.admin_apply_subscription_change(
  p_user_id uuid, p_action text, p_source text DEFAULT 'purchased',
  p_duration_days integer DEFAULT 30, p_custom_expires_at timestamptz DEFAULT NULL,
  p_admin_id uuid DEFAULT NULL, p_custom_message text DEFAULT NULL,
  p_expected_expires_at timestamptz DEFAULT NULL, p_allow_shorten boolean DEFAULT false,
  p_plan_months integer DEFAULT NULL, p_payment_verified boolean DEFAULT false)
```

Contract confirmed from the installed body:

- `p_plan_months` must be null or one of `1, 3, 6`, otherwise `22023`.
- A non-null `p_plan_months` requires `p_action in ('activate','extend','renew')` and an explicit
  `p_source in ('purchased','gift','prize')`, otherwise `22023`.
- `p_payment_verified = true` requires a purchased preset grant, otherwise `22023`.
- `plan_months` is referenced only three times: declared, assigned for grant actions, inserted
  into `subscription_history`. **It never participates in expiration math.**

### Billing side effects when `p_plan_months` is supplied

| source | `p_payment_verified` | `billing_status` | `amount_php` |
| --- | --- | --- | --- |
| `gift` / `prize` | false (always here) | `complimentary` | `0` |
| `purchased` | false (always here) | `unknown` | `NULL` |
| `purchased` | true (not reachable from this UI) | `paid` | preset 79 / 219 / 399 |

Because this task keeps `p_payment_verified = false`, forwarding a duration can never create a
paid claim or a fabricated amount. The `gift`/`prize` row is an explicit complimentary record,
not revenue.

## Applied correction

1. `app/admin/AdminPanel.tsx` — the existing submit body now includes:
   ```ts
   planMonths:
     (actionType === "activate" || actionType === "extend") && durationPreset !== "custom"
       ? Number(durationPreset.replace("m", ""))
       : null,
   ```
   Custom dates, `modify_expiration` and `revoke` send `null`, so the writer keeps its default.
   Expiration inputs (`durationDays`, `customExpiresAt`), shortening acknowledgement, optimistic
   locking, confirmation and idempotency are untouched. This is the only changed function body;
   its evidence is recorded in `authorized-transition-functions.json`.
2. `app/api/admin/subscription/route.ts` — reads `planMonths` and rejects anything that is not a
   real integer `1 | 3 | 6`, including strings, fractions, negatives, booleans, objects and
   arrays, plus any plan on `modify_expiration` / `revoke`. Valid values are forwarded as
   `planMonths`; everything else becomes `null`.
3. `app/lib/admin/adminService.ts` — `ApplySubscriptionParams` gained `planMonths?: number | null`
   and the RPC call passes `p_plan_months: params.planMonths ?? null` plus
   `p_payment_verified: false`. All existing named arguments are unchanged.
4. `app/admin/salesPreviewTransport.ts` — the offline synthetic transport mirrors the same
   validation and records `planMonths` for grant/extend, with billing left unverified.

## Behavior by action

| action | preset 1/3/6 | custom date | result |
| --- | --- | --- | --- |
| activate | forwarded | `null` | months recorded only for presets |
| extend | forwarded | `null` | months recorded only for presets |
| modify_expiration | rejected (400) | `null` | no invented duration |
| revoke | rejected (400) | `null` | no invented duration |

## Preserved

- Historical `plan_months = NULL` rows, historical ₱49 amounts and all existing history rows are
  untouched. No backfill and no reconstruction from expiration dates.
- Payment verification stays `false`; `amount_php` is never inferred from plan or source.
- Expiration calculation, access entitlement, conflicts, idempotency, notes, and RLS unchanged.
