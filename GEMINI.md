# RevIT Project Memory & Guidelines

## Shared Agent Handoff
- Read `AGENT_HANDOFF.md` at session start.
- Update it before switching agents or ending with unfinished or unpushed work.
- Keep it concise and never store secrets or private user data.

## 1. README.md & Public Documentation Policy
- **Never put private, internal, or technical implementation info in `README.md`**.
- `README.md` must only showcase the site's core product features from the learner's perspective.
- Keep developer notes, architecture details, and internal changelogs in `changelog-private.md` (which is git-ignored).

## 2. Privacy & Telemetry Rules
- **Online Presence**: Real-time counter (`app/lib/useOnlinePresence.ts`) uses lightweight client-side diurnal estimate with zero database/websocket connections to prevent log ingestion overload.
- **Zero PII**: Never broadcast `userId`, emails, or database identifiers.

## 3. UX & Architectural Conventions
- **Sound Effects**: Default ON permanently. Do not add sound toggles to session preference modals.
- **Review Library**: Subjects use accordion expand/collapse; only major subjects show initially, and topics stay open until the user closes them.
- **Flashcards**: Choices appear horizontally below questions on the front, remain selectable, and reveal answers on flip.
- **Leaderboard Privacy**: Opt-in toggle lives only in the top filter control card (`controlCard`). Do not add duplicate buttons below the position card.

## 4. Updates Tab Guidelines
- **Plain & Straightforward Language**: When adding entries to `app/data/siteUpdates.ts` (Updates tab), keep titles, summaries, and highlights simple, direct, and plain-English (e.g., "Combined Hematology 1 and 2 on Harr", "Added Ciulla Book Fourth Edition").
- **No Overly Deep Words**: Avoid dense technical jargon or overly elevated prose. Use clear words that users easily understand.
- **Sync Platform Version**: Every time RevIT has an update in `app/data/siteUpdates.ts`, ensure `RevIT Platform v#.#.#` at the bottom of the Updates tab (`app/components/SiteUpdatesModal.tsx`) matches and syncs to the latest update version (`SITE_UPDATES[0].version`).

## 5. Multi-Book Edition Architecture Rules
- **Pro Feature Requirement**: Any new or additional book editions added to RevIT beyond the base free edition (`Harr`) are strictly **Pro features** (`requiredPlan: "pro"` in `app/lib/entitlements.ts` / `QUESTION_BANKS`). Free tier learners only have access to Harr, while Ciulla and any future book editions require an active RevIT Pro subscription (`canAccessQuestionBank`).
- When adding any new book editions (e.g. beyond Harr and Ciulla):
  - **Subscription Entitlement**: Register the new edition in `app/lib/entitlements.ts` under `QUESTION_BANKS` with `requiredPlan: "pro"`. Gate question access, custom review sessions, and premium indicators behind `canAccessQuestionBank(book, entitlement)`.
  - **Progress**: Support book edition filtering and consistent MTAP 1 vs Other Majors categorization.
  - **Leaderboards**: Add edition to filter controls (`All`, `Harr`, `Ciulla`, `<New Book>`), handle unified score aggregation in "All Books", and render book edition clean text labels (no pill/capsule badge shapes).
  - **Weakness Analytics**: Ensure filtering works by edition, populate the dedicated `Book edition` table column, and style with corresponding clean book text labels.
  - **Review Library & Flashcards**: Register in `getUnifiedSubjects`, provide book edition dropdowns/badges, and keep separate book accordions when "All Books" is selected. Gate Pro book editions with upgrade prompts or lock indicators for free users.

## 6. Question Extraction & Stimulus Media Rules
- **Mandatory Visuals Extraction**: When processing or extracting questions from source PDFs, ALWAYS extract, crop, and attach any associated graphs, diagrams, figures, scatterplots, charts, morphologies, or images.
- **Stimulus Configuration**: Save images to `public/reviewer-assets/...` and populate the question's `stimulus` property (`kind: "image"` with `src`, `alt`, `width`, `height`, and optional `caption`, or `kind: "table"` for tabular data). Never omit, skip, or describe away visual stimuli that belong to the question.

## 7. No Pill Badges Design
- **Strict Prohibition**: Never use pill or capsule designs (`border-radius: 99px`, background containers, oval/capsule badge enclosures) for tags, labels, book editions (e.g. Harr, Ciulla), accuracy stats (e.g. 0% accuracy), or metadata. Keep clean text with appropriate font styling and color only.

## 8. No Button Borders Design
- **Strict Prohibition**: Never use borders on buttons. Buttons must have clean borderless styling (`border: none;` or `border: 0;`).

## 9. No Icon Containers (No Backgrounds or Borders with Icons)
- **Strict Prohibition**: Never use borders or background containers around icons. Icons must be clean, standalone icons only without any border or background box/circle. Ensure icons are properly sized and legible on their own.

## 10. Strict Card Stability Policy
- **Do Not Change Cards Anywhere**: Never modify card layouts, positions, structures, padding, heights, or styling anywhere across the application unless the user explicitly commands changes for those specific cards. Keep all cards exactly as they are.

## 11. Strict Scope & Isolation Policy
- **Modify Only Explicitly Requested Elements or Tabs**: When instructed to do something, do NOT change, modify, or reformat any other thing, element, component, style, or tab other than what was explicitly commanded by the user. Keep everything else strictly untouched.

## 12. Mandatory UI UX Pro Max Skill Usage
- **Strict Requirement**: Always invoke and adhere to the `ui-ux-pro-max` skill whenever working on RevIT UI/UX improvements, redesigns, component styling, or responsive layouts. Consult its design intelligence (visual hierarchy, design tokens, responsive breakpoints, typography, and accessibility) before and during frontend implementation.

## 13. Responsive UI Requirements
Every UI implementation or modification in RevIT must be intentionally designed and verified for:
1. Desktop (1440×900, 1920×1080)
2. Laptop (1366×768, 1280×800)
3. Tablet (768×1024 portrait, 1024×768 landscape)
4. iPhone (375×812, 390×844, 402×874)
5. Android phone (412×915)
6. Narrow Android phone (360×800)
7. Foldable phone / Galaxy Z Flip-like viewport (~360px CSS width)

Never assume that a component working on desktop will automatically work on mobile.

### Fundamental Responsive Architecture
- **Recompose, Do Not Just Scale**: Small-screen RevIT layouts should RECOMPOSE rather than simply shrink desktop components.
  - Desktop: Multi-column horizontal grids and wider cards.
  - Tablet: Reduced column counts (e.g. 2 columns), balanced whitespace.
  - Phone: Single-column vertical information flow.
  - Narrow / Foldable phone (~360px): Compact vertical structures with reduced horizontal density. Cards become vertically rectangular/portrait-oriented to use space efficiently and avoid crowding.
- **Content Hierarchy on Small Screens**: Prioritize: (1) Primary content, (2) Primary action, (3) Essential context, (4) Secondary metrics, (5) Supporting/decorative details.
- **Card Grid Rules**: Never allow cards to overlap neighboring cards. Stack to 1 column on mobile viewports.
- **Layout Hygiene & Overflow Prevention**:
  - No primary page should produce unintended horizontal scrolling (`overflow-x`).
  - Eliminate problematic fixed widths, rigid `min-width`, absolute positioning offsets, and hard-coded multi-column grids that block reflow.
  - Text wrapping: Ensure readable body copy with `word-break: break-word` and `overflow-wrap: anywhere`. Do not solve width constraints by making text microscopic.
- **Safe Areas & Mobile Clearance**:
  - Respect `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`.
  - Bottom navigation clearance: Pages must provide sufficient bottom padding (`calc(100px + env(safe-area-inset-bottom))` or `calc(220px + ...)` during review sessions) so fixed dock bars never cover cards, buttons, text, forms, or actions.
- **Floating Controls Coordination**:
  - Floating action buttons (e.g. `ScrollToTop`, `ScientificCalculator`) must coordinate positioning above mobile navigation dock and safe areas.
  - Centered back-to-top vs right-peeking calculator avoids collisions between controls and CTAs.
- **Height Responsiveness & Modals**:
  - Modals (e.g. Add to Planner, Account Settings, Achievements) must use bounded `max-height: calc(100svh - 32px)` with internal vertical scrolling and sticky action footers (Cancel / Submit remain reachable when virtual keyboard opens).
- **UI UX Pro Max Responsive Design Intelligence**:
  - **No Rigid Container Heights**: Never assign tall hardcoded `min-height` (such as 400px+) to empty cards, columns, or calendar cells. Heights must fit content naturally, starting compact (160–200px) and expanding as data populates. Empty states must be compact with a clean centered action, avoiding vast black voids.
  - **Calendar & Matrix Grid Responsiveness**: 7-day or multi-column time matrices must use `repeat(7, minmax(0, 1fr))` on desktop to avoid clipping. On mobile (<= 768px), time matrices must transition to horizontal snap carousels (`scroll-snap-type: x mandatory`) with high-legibility cards (`80–85vw`), auto-scrolling to the active day, preventing squished or hidden columns.
  - **Navigation Header Wrapping**: Control strips (e.g. "Previous / Current / Next") and date range titles must reflow cleanly into stacked or multi-row flex/grid layouts on narrow viewports (<= 640px) to prevent overlapping text or crushed buttons.
  - **Touch Targets & Overflow Hygiene**: Interactive elements must meet minimum 40×40px tap zones or accessible touch padding. Flex containers with text headings and action buttons must specify `min-width: 0` and flex wrapping to prevent horizontal text clipping.

### Progress and Analytics UI Guidelines
- **UI UX Pro Max Principles**: All analytics and progress interfaces must implement clean visual hierarchy, semantic tokens, accessible color contrast, and clear state communication (practiced vs. unpracticed with neutral empty indicators instead of misleading 0%).
- **Responsive Architecture**:
  - Desktop: 2-row summary stats (Row 1: 3 numerical cards; Row 2: 2 topic highlight cards) and responsive 2-column subject card grids with horizontal topic rows.
  - Mobile: Compact 3-column metric row, compact highlight cards, collapsible subject sections with initial topic preview ('View all topics') to prevent excessive vertical scrolling.
- **Cross-Device Integrity**: Zero horizontal overflow (`overflow-x`), no clipped topic names, no overlapping cards, proper mobile dock clearance (`calc(100px + env(safe-area-inset-bottom))`), and verified reflow from 1920px down to 320px/360px viewports.
- **Preserve Backend & Data Integrity**: Never alter accuracy formulas, question attempt history, or backend/Supabase structures for frontend visual redesigns.

### Review Library UI & Responsive Architecture Guidelines
- **UI UX Pro Max Principles**: Deliver a compact, organized, intuitive, and accessible study experience. Preserve RevIT's dark theme, mint-green accents (`var(--green)`), clear typography, rounded cards (14px), and borderless buttons.
- **Responsive Layout**:
  - Desktop: 2-column layout with left subject library and sticky right Session Setup sidebar.
  - Tablet: Adaptive layout gracefully transitioning between 2-column and compact mobile drawer modes.
  - Mobile (<= 768px): Single-column layout (mode switcher -> search & category chips -> compact subject cards). Session Setup accessible via compact sticky review bar and safe-area-aware bottom sheet.
  - Narrow/Foldable (~360px): Compact portrait structure with zero horizontal overflow, no clipped text, and touch targets >= 40px.
- **Multi-Book & Mixed Selection Persistence**:
  - In-card book edition navigation tabs (e.g. `Harr · 10`, `Ciulla · 12`) are strictly browsing tabs, never mutually exclusive selection filters.
  - Users must always be able to select and combine topics from both Harr and Ciulla, and across different subjects, in a single review session.
  - Switching between edition tabs, categories, search queries, or layout modes must NEVER clear user selections.
- **Mobile Bottom Sheet & Sticky Review Bar**:
  - Sticky mobile review bar sits above bottom navigation dock (`bottom: calc(68px + env(safe-area-inset-bottom, 16px))`) showing selected topic count, available questions count, `Configure`, and `Start`.
  - Bottom sheet includes all session controls (Reviewer book, questions this session, wrong answers only, question timer, selection actions) with internal scrolling and sticky header/footer.
- **Cross-Device Integrity & Non-Destructive Design**: Zero horizontal overflow, no button borders, no pill badges (`border-radius: 99px`), no icon container boxes. Preserve all backend algorithms, question banks, and personalization modes (NU MOA vs Standard RevIT).
- **Mandatory MCQ & Flashcard UI/UX Parity**: Any future Review Library UI/UX modification must be applied consistently to both MCQ and Flashcard modes, unless the change is explicitly mode-specific. Also require functional and responsive regression testing for both modes across desktop, tablet, mobile, and foldable viewports.
- **Mandatory Functional Regression Testing Rule**: Every UI/UX modification must include functional regression testing of the affected features, not just visual responsiveness testing. For Review Library changes, always verify:
  1. All existing subjects
  2. All available book editions (Harr, Ciulla, All Books)
  3. Topic availability (expanding a subject never produces an empty topic list when eligible topics exist)
  4. Question counts (verify against actual source data, e.g. Clinical Chemistry Harr 570 MCQs, Ciulla 437 MCQs)
  5. Mixed-edition selection persistence (selections never wiped when switching tabs, subjects, or books)
  6. Session creation (Session Setup and starting reviews use intended eligible questions)
  7. Both personalization modes (Standard RevIT & NU MOA RevIT)
  8. Desktop, tablet, and mobile behavior

### Sidebar UI & Responsive Architecture Guidelines
- **Preserve Concave Active-Tab Design**: Never replace, redesign, or simplify RevIT's signature concave active-tab cutout geometry (`.sidebar-active-cutout`, `border-radius: 28px 0 0 28px` expanded / `24px 0 0 24px` collapsed, and radial-gradient curves `::before` & `::after`).
- **Dark & Light Mode Contrast**: Ensure high contrast for the active-tab cutout in both modes using `--sidebar-active-bg` (light mode: `var(--canvas)`; dark mode: `#233e36` desaturated forest green). Active text and colorful icons must maintain high contrast (WCAG AAA compliant).
- **Proportions & Axis Sizing**:
  - Expanded width: 232–248px (standard: 240px).
  - Collapsed width: 76–80px (standard: 78px).
  - Row height: 52–56px.
  - Icon container: 40–44px (with centered 24px colorful icon images).
  - Collapsed items must center strictly along the exact same vertical axis.
- **Non-Clipped Floating Tooltips**: Tooltips in collapsed mode must never be clipped by sidebar container overflow; render via `createPortal` to `document.body` to the right of trigger elements, supporting both pointer hover and keyboard focus (`onFocus`/`onBlur`).
- **Sidebar Height Responsiveness**: Full-height flex-column layout with 3 areas: Header (brand & toggle, pinned), Navigation (independently scrollable via `<nav>` when viewport height is limited), and Footer (pinned at bottom so profile and utilities are never clipped).
- **Desktop & Tablet Responsiveness**: Expanded by default on large desktops, collapsible on laptops/tablets, collapsed icon rail on tablet landscape when space is tight, and mobile dock clearance preserved for `< 768px`.

## RevIT AI Architecture & Academic Assistance Rules
- **Responsive RevIT AI Interfaces**:
  - Desktop: 2-column workspace (`.assistant-workspace` grid) with compact conversation history on left and main chat on right.
  - Tablet Portrait & Mobile: Dedicated full-width messaging experience with unboxed layout (no nested outer cards, borders, or padding around chat body).
  - Slide-Out Conversation Drawer: Accessible from header toggle button, slides smoothly from left (`min(320px, 85vw)`), subtle backdrop overlay, contains New Chat button, local conversation search (real-time filtering without Groq calls), recent conversation list with relative timestamps, active indicators, delete actions, and bottom Academic Context settings shortcut.
  - Persistent Floating Message Composer: Anchored near bottom directly above mobile navigation dock (`chat-composer-wrap`). Chat messages scroll freely and independently behind its reserved space. Never place composer inside scrolling message list.
  - Auto-Expanding Message Composer: Compact initial height (~38px-40px) expanding up to 130px, with internal textarea scrolling beyond max height, character counter (`0 / 4000`), and upward arrow send button.
  - Mobile Keyboard Handling: Visual viewport handling adjusts chat container dynamically; composer remains visible above virtual keyboard; send button remains accessible; bottom navigation dock yields space during active keyboard entry without layout jumps.
  - Compact Study Context Bar: Clean horizontal strip beneath header displaying book icon, study context label, selected topic summary ("No topics selected" or "Subject · X topics"), and academic context shortcut.
  - Clean Welcome Screen: Centered layout with original 52px frog mascot, balanced typography, and 4 compact suggested prompt cards arranged in a 2-column grid (collapsing to 1 column only on narrow viewports <= 360px) with expandable more suggestions toggle.
  - Responsive Markdown & Message Layout: User messages in distinct right-aligned surface bubbles; AI messages left-aligned with readable typography; horizontal table and code-block containment (`.ai-markdown-table-wrap`, `min-width: 0`) preventing page overflow.
  - Safe-Area & Dock Clearance: Respect `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` across all viewports; floating controls (calculator FAB, back-to-top) coordinate positioning above dock and hide during active composer focus.
  - Strict Prohibitions: No pill badges (`border-radius: 99px`), no button borders, no icon containers, no emojis anywhere.
- **Explicit Academic Data Permissions**:
  - All personalized assistance features are opt-in, disabled by default (`masterEnabled: false`).
  - Granular category permissions (`gradesEnabled`, etc.).
  - Explicit consent disclosure required prior to enabling: transparently states external Groq transmission, read-only nature, revocable anytime.
- **Read-Only Context Access & Functional Preservation**:
  - RevIT AI must never modify, write, or delete student academic records, grades, study plans, or question attempts.
  - Preserve all Groq API integrations, models, quotas, subscription tiers, deterministic grade calculations, and conversation persistence without backend modifications.
- **Minimal Data Transmission**:
  - Only transmit aggregated, data-minimized summaries for the active query category.
  - Never dump full database records, user IDs, or private telemetry.
  - Unrelated queries (e.g., MedTech concepts) must never include personal academic context.
- **Deterministic Grade Calculations**:
  - Mathematical calculations (required final exam scores, current averages, target feasibility) must use deterministic algorithms (`aiGradeAssistant.ts`).
  - Groq explains calculated values; it does not compute math or invent weights.
  - Edge cases handled: impossible targets (>100%), passing already secured (<=0%), missing weights, incomplete weights.
- **Quota & Security Enforcement**:
  - Preserve existing Groq API integration, server-side routes, rate limits, daily quotas, and subscription tier protections.
  - Zero Supabase service-role leaks to client.
  - No background, unprompted, or automatic AI requests.
- **Cross-Device UI Verification**:
  - Verify reflow and interactions across Desktop (1920x1080, 1440x900, 1366x768), Tablet (landscape 1024x768 / portrait 768x1024), Mobile (430x932, 390x844, 375x812, 320x568), and Foldable viewports (~360px). Ensure zero horizontal overflow and clean theme parity in both light and dark modes.

## 8. Pre-Push Verification Checklist
Before pushing to remote:
1. **Always Update Updates Tab (`app/data/siteUpdates.ts`)**: Whenever instructed to push to git, ALWAYS create a new entry in `app/data/siteUpdates.ts` capturing the latest user-facing changes (plain English, clear language, new version ID). This guarantees the auto-update popup and updates tab are current before proceeding to any checks or pushing.
2. **Visual Parity Check with Deployed Version**: When instructed to push, verify first that UI and layout look consistent with the deployed version (no visual regressions, unintended styling changes, or layout breaks compared to production) before executing push.
3. `npm run security:secrets` (must pass with 0 leaks)
4. `npx tsc --noEmit` (clean typecheck)
5. `npm test` (`next build` + all tests passing)

## Execution & Output Rules
- **Do not test and verify if not told to do so:** STRICTLY PROHIBITED from running tests (`npm test`, `npx tsc`, etc.), test runners, or browser verification suites unless user explicitly commands with "test this", "verify", or "run tests".
- **No autonomous browser testing or verification:** Do NOT run browser automation, test scripts, or verification suites unless explicitly instructed with commands like "test this", "verify", or "run tests".
- **No visual artifacts/screenshots:** Do NOT capture, render, or attach screenshots, screen recordings, or visual previews unless explicitly asked.
- **No Git or Push or Security Checks without command:** Do NOT run git commands (commit, push, log, diff, stash, etc.), do NOT push to remote, and do NOT run security checks unless user explicitly instructs to push or check.

## 9. Communication Style & Active Modes
- **Default Mode**: Always communicate in ultra-compressed caveman mode (`/caveman ultra`). Cut filler, pleasantries, articles, and unnecessary words. Keep all technical substance, exact code symbols, and accuracy 100% intact.
- **No Emojis**: Do not use emojis anywhere (UI, code, markdown, or responses). Use icons instead.
- **Active Skills (Ultra)**:
  - **Ponytail Ultra**: Absolute minimalism and YAGNI; use platform native/stdlib first, zero bloat, shortest working implementation.
  - **Caveman Ultra**: Extreme token efficiency; zero fluff.

## 10. Clarifications & Recommendations Policy
- **Ask When Unsure**: If requirements, designs, or implementations are ambiguous, underspecified, or uncertain, ask questions before building.
- **Suggest Recommendations**: Proactively propose recommended ideas or alternatives to the user's idea with clear trade-offs.
- **Precision Over Assumptions**: Clarify upfront to ensure concise, flaw-free implementation aligned with user intent.
