# RevIT UI Design Rules

Canonical design-system guidance for all new and redesigned RevIT interfaces. Read this document before UI changes; preserve existing scope and card-stability instructions.

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

## Permanent RevIT Design System

"All RevIT interfaces must follow the established RevIT design system. New features and redesigned components must remain visually consistent with existing components. Do not introduce purely decorative vertical or horizontal accent bars on cards, banners, or selection tiles. Establish visual hierarchy through typography, spacing, surfaces, alignment, and restrained borders. Functional progress indicators, validation states, and accessibility focus outlines remain permitted."

### Identity and theme tokens

Preserve the mint/turquoise and forest-green identity, light/dark palettes, DM Sans typography, rounded surfaces, existing button roles, standalone icons and official mascot. Use theme variables from app/globals.css and existing component modules rather than copying one theme's hexadecimal colors. Later theme overrides may change computed values; browser verification is authoritative.

| Role | Existing tokens |
| --- | --- |
| Main and secondary text | --ink, --muted |
| Page/card/secondary surfaces | --canvas, --paper, --surface-soft, --surface-tint |
| Neutral separators and card boundaries | --line |
| Brand text, actions and selected surfaces | --green, --green-dark, --green-soft |
| Existing button foreground | Preserve the button-role contrast rules above and applicable component styling |
| Functional warnings/errors | --amber, --amber-soft, --danger, --danger-soft |
| Elevation and fonts | --shadow, --font-sans, --font-mono |

Do not globally alter colors/tokens while fixing one feature. Keep the official mascot asset, proportions, colors and illustration style; never substitute a generic character. Icons remain standalone, without decorative background containers. Preserve the established icon sizes; collection icons use 26-30px, with no icon box.

### Typography and spacing

Use semantic heading order and the existing DM Sans hierarchy: primary component headings around 21-28px, subsection headings 18-24px, body/controls 12-16px, compact metadata 10-12px. Keep principal input text at 16px for readability and mobile behavior. Supporting text must remain readable; never shrink essential labels to make a layout fit. Numeric values use tabular numerals. Geist Mono remains for code/data where already used, not a replacement UI font.

Reuse component spacing before adding values. Existing group rhythms use 8/12/16/24px. Purpose-specific approved variants remain: compact collection banners 12-18px padding, assessment/simulator cards 22px on desktop, 18px on phones and 16px on narrow phones. No new global spacing/radius token layer is required for a small fix. Preserve existing layouts unless the owner explicitly includes those cards in scope.

### Cards, banners and dividers

Use a subtle 1px neutral --line border, an existing theme surface, restrained neutral elevation and consistent corners. Full assessment/simulator cards use 16px; compact collection banners and summary tiles use 14px; controls/selection buttons use 8px; nested result surfaces may use 12px. These are role-specific existing variants, not a demand to make all layouts identical.

No decorative left/right bars, bottom strips, top strips, thick colored perimeter borders, glowing edges or pseudo-element/inset-shadow imitations. Do not move a rejected accent to another edge. Neutral separators between actual content sections remain allowed; they are not decorative colored card accents. Actual progress, slider, loading, validation and status indicators remain permitted when they communicate real information.

Collection banners share CollectionHeader and its module in MCQ/Flashcard modes: MTAP 1, MTAP 2, Other Majors and Standard All Majors. Keep a clear title, connected description, restrained collection label and consistent standalone icon. Visual work never changes membership, topic order, question counts, source assets or historical IDs.

### Inputs, selectors and metadata

Reuse GradesAssessment.module.css control/assessment patterns for score fields and simulator selectors. Controls use at least 44px height in this scope, 16px input text, comfortable 10-11px padding, an 8px corner, a clear neutral boundary and right-aligned tabular numeric values. Selectors/text remain left-aligned. Keep visible labels, accessible names, existing numeric limits and validation. Empty/disabled controls must be understandable and keyboard focus visible. Do not invent new grading formulas or modify saved data to accommodate styling.

Points/weights and book/grade metadata are compact plain text, not pill/capsule enclosures. Buttons remain borderless. Existing button contrast rules above still apply. New style consistency does not authorize restyling unrelated controls elsewhere.

### Functional score sliders

Keep a visible unit-bearing label and compact numeric input in one balanced header row. Place the range directly below in a shared spacing wrapper, with aligned minimum/maximum labels beneath. Do not repeat a separate percent suffix when the label already states (%).

Use a transparent native range interaction area at least 44px tall in this scope; paint only a slim 6px rounded track and clean 22px circular thumb. Use --line for the inactive track, --green for functional active fill/thumb and --paper for the thumb's contrasting boundary. A hard-stop two-color fill gradient is allowed solely to communicate the slider value; no decorative gradient, rectangular background, glow or edge strip. Circular thumbs are functional controls, not metadata pills or icon containers. Keep a visible keyboard-focus outline.

Preserve the existing native range, min/max/step, validation and live number synchronization. Verify pointer drag, touch operation, keyboard arrows, empty/invalid/bounded numeric values and both themes. Slider scenarios must never save actual grades. Scope vendor track/thumb rules to the owning slider; do not reset all application ranges.

### Selected, hover and focus states

Use subtle --green-soft background plus a restrained full outline, clear text and programmatic state (aria-pressed/aria-selected as appropriate). No colored bottom/edge strips, including on selected scenario tiles. Scenario buttons have border: 0; their meaningful 1px selection outline is distinct from the 2px keyboard focus outline outside the button. Preserve focus visibility when an item is both selected and focused. Selection must not rely on color alone. Use existing restrained hover surfaces, without glow or layout shifts. Do not add motion where it serves no purpose; respect reduced-motion preferences when existing motion is involved.

### Responsive and accessible behavior

Reflow instead of shrinking. Use minmax(0, 1fr), min-width: 0, wrapping headers/labels and one-column phone flows. Avoid rigid heights, clipped names and horizontal page overflow. Keep controls reachable above mobile navigation and safe areas; bounded modals retain internal scrolling and reachable actions. Long names must stay readable. Preserve Review Library mixed-edition selections across browsing changes.

Verify the requested desktop/laptop/tablet/phone/foldable sizes from AGENTS.md, including 1440, 768, 390 and 360px widths, in both themes. Use at least 4.5:1 for normal text and 3:1 for large text/UI boundaries where applicable. Controls in this scope retain at least 44px touch height (existing app minimum 40px must not regress). Use semantic labels/native controls, keyboard access, visible focus, adequate contrast and explicit selection state. Prefer the existing 2px high-contrast focus treatment; the enhanced WCAG AAA focus-area rule must not be misrepresented as an AA requirement.

### Reuse, verification and preservation

Audit shared components/tokens first. Keep changes local to the requested components; no application-wide CSS reset or speculative component framework. Reuse CollectionHeader, assessment surface/controls and the scoped simulator module. Legacy deviations elsewhere do not authorize a cleanup outside the approved scope. Keep one canonical design document here rather than competing design-system files.

Use actual browser rendering for responsive/layout/contrast claims. Verify keyboard and selected/focused states, touch targets, controls and functional regressions, not just static CSS. Capture screenshots only when explicitly authorized. Reuse valid unchanged-input evidence. Run the requested focused tests, TypeScript, production build, security and preservation checks; never weaken a test or a historical hash to pass. A release still requires the full authorized release process and accurate Manila deployment date.

Styling must preserve all six editions, questions/topics/IDs/answers/rationales/assets, collection mappings and Other Majors filtering, actual grades, category weights/maxima, storage/cloud records, subscription/entitlement behavior, progress, retry mastery, maintenance and service worker. Hypothetical scenarios must remain separate from actual grades. Functional progress indicators/focus/validation must not be removed under the decorative-bar prohibition.

**Last updated**: 2026-11-18
