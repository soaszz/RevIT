# Phase 3I-A exhaustive technical grading validation

**PASS: 4,441 of 4,441 original question records. Zero failures.**

Executed `node scripts/validate-mcq-grading.mjs`, followed by `node --check scripts/validate-mcq-grading.mjs`. This follow-up adds only an audit script and evidence/documentation. No application, dataset, asset, SQL, permission, or production change occurred.

Machine-readable results: `docs/phase3i-a/exhaustive-grading-results.json`. Each original record has its stable ID, book, source record index, runtime representation, choice count, assertion/call counts, status, failure codes, and metadata flags. No answer keys, selected responses, question text, rationales, or credentials are recorded.

| Bank | Questions tested | Passes | Failures |
|---|---:|---:|---:|
| Harr | 1,593 | 1,593 | 0 |
| Ciulla | 1,890 | 1,890 | 0 |
| Rodak | 491 | 491 | 0 |
| Strasinger | 467 | 467 | 0 |
| Total | 4,441 | 4,441 | 0 |

The audit executed **451,084 grading calls** and **468,848 passing assertions**. It used the real server-only registry, real server content loaders, and real deterministic grading implementation. Installed TypeScript transpiles those modules for isolated Node execution; only the `server-only` framework poison marker is replaced. The grader and datasets are not mocked. The handler/authentication boundary is not invoked; there are no Supabase calls.

## Coverage

- Every original ID resolves with the expected authoritative book, runtime type, choice count, and preserved original fields. Original unique IDs and registry membership both equal 4,441. Duplicate, missing, and unexpected IDs: none.
- Every original ordinary correct index grades true; all **13,255 incorrect ordinary options** grade false.
- All **16 matching exercises** grade their complete original official mappings true. **280 incorrect mappings** grade false: every wrong answer-bank option at every item while holding other items correct, plus all-items-wrong and differing reversed mappings. Missing/extra/out-of-range item and wrong response-type submissions are rejected for every matching question.
- Matching coverage does **not** enumerate the full Cartesian space of multi-item responses. It covers all single-item substitutions, additional multi-item errors, and item-order errors. No claim of testing every possible matching vector is made.
- All **106,030 ordinary choice permutations** and every displayed position are exercised, totaling **424,178 canonical-index shuffle checks**. These are hypothetical audit orders; protected questions and matching exercises retain their application shuffle restrictions.
- Every question's explicit timeout grades false. Ordinary questions reject matching responses; matching questions reject ordinary-index responses.
- Choice counts 2–7 all occur and pass. Counts: 2 choices = 12 records; 3 = 8; 4 = 4,416; 5 = 2; 6 = 2; 7 = 1. These include matching answer-bank sizes.
- All 4,425 nonmatching records use canonical choice indexes, including numerical-choice and True/False records. The two choice-table classification records use canonical row indexes. Matching classification uses ordered matching selections. The datasets have no authoritative educational subtype field; the audit does not guess subtypes from prompt text or introduce numerical/tolerance/classification rules.

## Metadata findings

Malformed or ambiguous **grading** definitions: none. Duplicate choice text, duplicate stable IDs, and rejected canonical definitions are checked and would be flagged with exact IDs rather than repaired. The script exits nonzero for grading failures, integrity/registry failures, or flagged grading ambiguity.

Separate non-grading metadata flags affect **34 existing Rodak records**: `rodak-ch04-01` through `rodak-ch04-12`, `rodak-ch05-01` through `rodak-ch05-10`, and `rodak-ch06-01` through `rodak-ch06-12`. They lack subject ID, topic ID, and source metadata. Their grading definitions are complete and all response checks pass. Exact IDs and field flags appear in the JSON report. Nothing was silently filled, corrected, or inferred.

## Preservation and limits

All four complete dataset SHA-256 hashes match the Phase 3I-A baseline. Exact protected-ID lists preserve the 47 prior positional fixes and 42 Strasinger protections. All 38 reviewer assets match their hashes, with no added/missing asset paths. Entry and exit checks also preserve all 253 pre-existing application/SQL/test files from that baseline and the three new foundation/test files. No content was changed to make the audit pass.

This is a technical grading audit against existing authoritative records, not scientific rationale or textbook-key verification. Prior Phase 3I-A regression/build/bundle evidence remains valid for the unchanged grading code; the comprehensive suite was not rerun for this standalone audit. No browser/PostgreSQL/production testing, Supabase changes, deployment, commit, or push occurred. The grader remains dormant. Phase 3I-B is not started.
