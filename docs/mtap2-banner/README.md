# Review Library banners and MTAP 2

Local candidate based on production v1.13.1, d1fd171d55f35c2cebba4727e8c9d0d448519514. No publication, database or production configuration changes.

## Shared banner inventory

CollectionHeader is used by ReviewLibrary (MCQs) and Flashcards. All matching banners now share this component: NU MTAP 1, NU Other Majors, additive NU MTAP 2, and Standard RevIT All Majors. Ordinary Review Library subject/question/session cards remain untouched. Grades assessment cards share a scoped CSS module; overview, navigation and simulator cards remain unchanged.

The compact title and inline collection label sit beside a standalone icon. Description sits below its title instead of at the far edge. Existing theme tokens, 14px corners and responsive type/spacing preserve RevIT identity. No icon boxes, pill tags, button borders or animation were added. Banners use semantic h2 headings and decorative aria-hidden SVGs.

## Owner-approved reference mapping

| MTAP 2 entry | Existing canonical collection |
| --- | --- |
| Hematology | hematology |
| Clinical Chemistry | clinical-chemistry |
| Mycology and Virology | mycology-and-virology |
| Immunology and Serology | immunology |
| Hemostasis | ciulla-hemostasis (existing Ciulla/BOC collection) |
| Mycology, Virology, and Parasitology | mycology-and-virology followed by parasitology |

These are views over existing topic IDs, never new questions. Shared topic IDs are deduplicated. Hemostasis does not absorb Harr Hema 2. MTAP 1 membership remains intact. Named collections follow ACADEMIC_COLLECTIONS declaration order (MTAP 1, MTAP 2); Other Majors is derived last from subjects not referenced by any named collection, using stable source/canonical identifiers. Add future named collection membership to this same registry, not a separate exclusion list. Intentional overlap between named collections remains allowed.

Other Majors is the final Review Library collection and contains only subjects not assigned to MTAP 1, MTAP 2, or any future named academic collection. Collection membership must not alter underlying questions, topics, IDs, or historical student records.

Descriptions: MTAP 1: "Core Medical Technology subjects included in NU MTAP 1." MTAP 2: "Core Medical Technology subjects included in NU MTAP 2." Other Majors: "Explore additional Medical Technology subjects not covered by the existing NU RevIT collections." Standard RevIT retains All Majors. Search/category switches preserve selections. Existing book access, question pools, retry scheduling, history and session rules remain unchanged.

## Grades and persistence

MTAP 2 Grades has four active subjects only: Hematology, Clinical Chemistry, Mycology and Virology, Immunology and Serology. Review Library still has all six entries. All five categories retain their original maximum scores and weights (10/15/25/25/25). Each category contribution uses the existing preset formula, sum(active scores)/(field maximum * 4) * category weight * 100; blank entries retain the original preset semantics. Pre-Tests therefore use 200 maximum points at 10%, Post-Tests 280 at 15%, and remaining categories 400 each at 25%. No weights redistributed.

Hemostasis and the combined Mycology/Virology/Parasitology books remain preserved in storage, including old names and every category/assessment ID and score. Save all only builds/upserts the four active subjects; merges retain excluded books and unrelated custom courses unchanged. Historical scores do not enter active matrices/totals; excluded subjects have no active individual projection option. These history books are not exposed as editable Custom Subjects. The combined Review display name changes only; its stable mapping ID and reserved storage code remain unchanged.

MTAP 2 reuses the same five fields, limits, weights, calculation and validation. Shared CSS module GradesAssessment styles all five preset card types and existing custom category cards: removes left bar; adds clear 44px inputs, keyboard focus, theme contrast, tabular scores, restrained border, plain points metadata and responsive rows. Input behavior and grade engine remain unchanged. MTAP 1's four SUBJECTS and original grades rows/save path remain unchanged.

MTAP 2 uses the already-existing Custom Subjects cloud tables (gradebooks, grade_categories, grade_assessments), not the restricted MTAP 1 grades subject field. Six recognized reserved codes (four active, two historical) REVIT:MTAP2:v1:<subject> and owner-scoped deterministic UUIDv8 IDs separate the presets, users and custom courses. Reserved books do not appear as ordinary Custom Subjects tabs. Source mapping labels are identical in Review and Grades.

Manual Save all first retains scores under the existing per-user revit-universal-gradebooks-v1 cache. Signed-in saves make three batched upserts into existing tables with existing RLS. No polling, background sync or added cloud read requests. Successful saves update parent state so navigation does not restore an old snapshot. Local pending scores survive cloud refresh; failed writes are reported and can be retried idempotently. Three table writes are not one database transaction.

Cross-device capability is supported by these existing tables and the existing loadCustomGradebooks loader. Verified with a mocked cloud round-trip through that real loader; no production account mutation was performed. Actual signed-in cloud/RLS save remains a pre-release owner acceptance check. Offline/local use is device-only; sign in and manually save for cloud synchronization. This does not silently migrate anonymous grades to an account. Existing custom courses and legacy revit-grades-v1 data remain intact.

## Grade row display labels

All five subject-based preset assessment cards use only the subject name, with no category prefix, sequence number or duplicate secondary subject text. MTAP 1 displays Hematology, Clinical Chemistry, Bacteriology and AUBF in their original order. MTAP 2 displays Hematology 2, Clinical Chemistry 2, Mycology and Virology, Immunology and Serology. A presentation-only map changes MTAP 2 text and accessible labels/simulator option text; matrix keys, option values, UUIDs, reserved codes and cloud fields remain canonical. Review Library subject names are untouched. Category headers remain Pre-Tests, Post-Tests, Oral Revalida, Written Revalida and Comprehensive Exam.

Custom-course assessment rows are arbitrary user-named assessments, not structured subject rows; their saved names and rendering remain unchanged. No guesses strip prefixes from historical user-entered names.

## Grade Simulator

Shared MTAP 1, MTAP 2 and custom-course simulator uses the assessment card surface and newly exported control styling. Scoped GradeSimulator.module.css changes only simulator layout. Subject controls move below the title at smaller widths; two desktop panels become stacked sections on smaller screens. Buttons are borderless keyboard-accessible controls, with pressed state on the active comparison score. All eight original ladder scores remain available. Numeric hypothetical input and native range share the same 0-100 whole-percent state; no grade save function is called.

The original gradeCalculator.ts is unchanged. At 85% in a category weighted 10%, the existing What-If calculation returns 8.5 weighted points. With no other scores this is a subtotal, not a complete final-grade forecast. The UI now separately shows recorded weighted points, selected-category contribution, and scenario subtotal. gradeSimulationPreview only attaches presentation metadata to the original result. Overall projection is shown only when weights total 100% and every other positively weighted category has all assessment scores entered. Partially entered custom categories block a complete forecast. No missing What-If scores are invented or treated as an overall zero grade.

Target Calculator retains the existing 75% assumption for other unentered categories, now explicit. It always shows the raw required threshold, including requirements above 100% (not achievable under those assumptions) and negative thresholds (0% is sufficient). Recorded categories keep their recorded scores; the selected category is replaced by the scenario. The legacy alreadySecured flag describes currently recorded points including the old target score, so the replacement scenario displays the actual required threshold instead of that flag. No engine formula or return value was modified. Desired final grade input accepts 1-100 and shows validation errors without changing saved-grade validation.

No hypothetical interaction saves locally or to cloud. Actual seeded-grade browser tests confirm unchanged storage across target edits, slider/number/ladder use, subject/preset switching and reload. Cross-device storage implementation and owner acceptance limitations above remain unchanged.

## Canonical visual rules

Follow [RevIT UI Design Rules](../UI_DESIGN_RULES.md), the single canonical design-system document referenced by AGENTS.md. Current banners, assessment/simulator cards and summary tiles use neutral boundaries. Selected ladder scenarios use a subtle background and full functional outline, never a bottom strip; their focused state remains distinct. Summary metadata is clean text. Functional sliders/progress, neutral section dividers, validation and keyboard focus remain permitted. No other module or layout is redesigned by this guidance.

## Local verification and release boundary

Evidence is outside release source at ../mtap2-banner-evidence relative to this worktree. Includes screenshots, rendered checks, focused tests, source/private-pack integrity, preservation, TypeScript, build and secret scan logs. Failed early external harness attempts remain saved; subsequent targeted runs resolve their selector/readiness issues.

No new Updates entry was created because no push/release was requested. A future authorized release requires its own version, Pending date until the actual Manila deployment day, final release checks and explicit approval. AGENT_HANDOFF.md is operational handoff, not an approved production file.
