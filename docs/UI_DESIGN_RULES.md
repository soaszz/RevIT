# RevIT UI Design Rules

Established design principles and interaction patterns for RevIT's interface.

## Button Contrast Hierarchy

### Primary Mint Button in Dark Mode
- **Background**: `var(--green)` (mint/bright green)
- **Foreground**: `#07261f` (dark green-black text and icons, stable across themes)
- **Usage**: Main call-to-action buttons on mint backgrounds in dark mode. Preserve light mode's contrasting white text on dark green.
- **Note**: Do NOT use `var(--accent-ink)` — it resolves to white in light mode

### Secondary Dark-Green Button
- **Background**: `var(--green-soft)` (dark green)
- **Foreground**: `var(--green-dark)` (mint/light text and icons)
- **Usage**: Secondary actions, less prominent CTAs

### Consistency Rule
Components using the same button role (primary or secondary) must use consistent foreground treatment throughout the application.

## Stacked Action Hierarchy

When a compact card contains vertically stacked primary and secondary actions where the primary action label is substantially longer:

- **Shorter secondary action** appears above (first visually)
- **Longer primary action** appears at the bottom (second visually)
- Preserve clear visual distinction between primary and secondary actions

### Rationale
This arrangement creates better visual balance and reduces the appearance of cramping in compact layouts.

### Example: Recommended Next Card
```
[View topic →]              ← secondary, shorter, top
[Start 15-question review →] ← primary, longer, bottom
```

### Scope
Do not apply this ordering blindly to unrelated components where a different interaction hierarchy is intentional. This rule applies specifically to compact cards with:
- Vertical button stacking
- Significant length difference between actions
- Space constraints requiring visual balance

## Pro Reviewer Book Messaging

When a new reviewer book is added as a Pro entitlement, user-facing Pro plan descriptions must remain accurate across:
- landing/pricing;
- subscription/Pro tab;
- upgrade/compare-plan surfaces.

Pro messaging must communicate that active Pro users receive access to newly added Pro reviewer books.

Avoid copy that makes Pro appear limited only to older named books after additional books have been released.

### Current Pattern
Pro feature lists communicate BOTH:
1. Access to the currently included Pro reviewer books; and
2. Access to newly added Pro reviewer books while the subscription is active.

### Note
This documentation requirement does NOT automatically publish an unfinished book. A book should only appear as currently available when it is actually published/enabled.

## Subscription Surface Synchronization

Whenever a reviewer book is published, unpublished, or changes entitlement, verify ALL user-facing subscription surfaces:
- landing/pricing (`app/pricing/PricingContent.tsx`);
- public landing Free/Pro section (`app/auth/page.tsx`);
- introductory Free/Pro popup (`app/components/PlanAnnouncementModal.tsx` — general variant);
- Subscribe/Upgrade to Pro popup (`app/components/ProActivationModal.tsx`);
- Pro/subscription page (`app/pro/page.tsx`);
- onboarding plan overview (`app/components/Onboarding.tsx`);
- Free-vs-Pro comparison table (`app/pricing/PricingContent.tsx`);
- upgrade prompts.

Currently available book lists and counts must include only published/enabled books.

Unpublished books must not be advertised.

Active Pro messaging should communicate access to newly added Pro reviewer books.

Avoid manually maintained historical totals where canonical reviewer data can reasonably provide them.

---

**Last updated**: 2026-10-21
