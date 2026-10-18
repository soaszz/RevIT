import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const hash = path => createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex');
const walk = directory => readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? walk(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`]);
const integrity = JSON.parse(read('docs/phase3i-a/content-integrity.json'));
const started = new Date();
const banks = ['Harr', 'Ciulla', 'Rodak', 'Strasinger'].map((book, i) => ({
  book, path: integrity.datasets[i].path, expectedCount: [1593, 1890, 491, 467][i],
  questions: JSON.parse(read(integrity.datasets[i].path)).questions,
}));
const preserved = JSON.parse(read('docs/phase3i-a/preserved-files.json'));
const foundationFiles = ['app/lib/server/answerVerification.ts', 'app/lib/server/gradingHandler.ts', 'tests/answer-verification.test.ts'];
const trackedHashes = { ...preserved, ...integrity.assets, ...Object.fromEntries(foundationFiles.map(path => [path, hash(path)])) };
const mismatches = () => Object.entries(trackedHashes).filter(([path, expected]) => !existsSync(resolve(root, path)) || hash(path) !== expected).map(([path]) => path);
const entryMismatches = mismatches();

// Real server registry/scorer and loaders; only Next's server-only poison marker is replaced.
const cache = new Map();
function loadServer(path) {
  if (cache.has(path)) return cache.get(path).exports;
  const loaded = { exports: {} };
  cache.set(path, loaded);
  const localRequire = createRequire(path);
  const requireModule = name => {
    if (name === 'server-only') return {};
    if (name.startsWith('.')) {
      const target = resolve(dirname(path), name);
      if (existsSync(`${target}.ts`)) return loadServer(`${target}.ts`);
    }
    return localRequire(name);
  };
  const code = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, resolveJsonModule: true },
  }).outputText;
  new Function('require', 'module', 'exports', code)(requireModule, loaded, loaded.exports);
  return loaded.exports;
}
const api = loadServer(resolve(root, 'app/lib/server/answerVerification.ts'));
const countsById = new Map();
for (const bank of banks) for (const q of bank.questions) countsById.set(q.id, (countsById.get(q.id) ?? 0) + 1);
const duplicateIds = [...countsById].filter(([, count]) => count > 1).map(([id]) => id);
const missingIdRecords = banks.flatMap(bank => bank.questions.flatMap((q, index) =>
  typeof q.id !== 'string' || !q.id.trim() ? [{ book: bank.book, recordIndex: index }] : []));
let registryIds = [];
let registryError = null;
try { registryIds = [...api.createCanonicalRegistry(banks).keys()]; }
catch { registryError = 'CANONICAL_REGISTRY_REJECTED'; }
const originalIds = new Set([...countsById.keys()].filter(id => typeof id === 'string'));
const registrySet = new Set(registryIds);
const missingRegistryIds = [...originalIds].filter(id => !registrySet.has(id));
const unexpectedRegistryIds = registryIds.filter(id => !originalIds.has(id));

function* permutations(values) {
  if (values.length === 0) { yield []; return; }
  for (let i = 0; i < values.length; i++) {
    for (const tail of permutations([...values.slice(0, i), ...values.slice(i + 1)])) yield [values[i], ...tail];
  }
}
const permutationCache = new Map();
const totals = { assertions: 0, passedAssertions: 0, failedAssertions: 0, gradingCalls: 0,
  correctResponses: 0, incorrectOptions: 0, incorrectMatchingMappings: 0, shufflePermutations: 0, shuffledChoiceChecks: 0 };
const results = [];
for (const bank of banks) {
  for (const [recordIndex, q] of bank.questions.entries()) {
    const row = { questionId: typeof q.id === 'string' ? q.id : null, book: bank.book, recordIndex,
      representation: q.matching ? 'matching' : 'single_choice', choiceCount: q.choices?.length ?? null,
      choiceTable: Boolean(q.choiceTable), protectedFromShuffle: q.disableShuffle === true,
      passedAssertions: 0, failedAssertions: 0, gradingCalls: 0, incorrectOptionsTested: 0,
      incorrectMatchingMappingsTested: 0, shufflePermutationsTested: 0, shuffledChoiceChecks: 0,
      failures: [], gradingMetadataFlags: [], nonGradingMetadataFlags: [] };
    const check = (passed, code) => {
      totals.assertions++;
      if (passed) { totals.passedAssertions++; row.passedAssertions++; }
      else { totals.failedAssertions++; row.failedAssertions++; if (!row.failures.includes(code)) row.failures.push(code); }
    };
    const grade = async (response, expected, code) => {
      totals.gradingCalls++; row.gradingCalls++;
      try {
        const actual = await api.gradeAnswer({ questionId: q.id, response });
        check(actual.isCorrect === expected && actual.questionId === q.id && actual.book === bank.book
          && actual.questionType === row.representation && actual.timedOut === (response.kind === 'timeout'), code);
      } catch { check(false, `${code}:UNEXPECTED_REJECTION`); }
    };
    const reject = async (response, code) => {
      totals.gradingCalls++; row.gradingCalls++;
      try { await api.gradeAnswer({ questionId: q.id, response }); check(false, code); }
      catch (error) { check(error instanceof api.AnswerVerificationError && error.code === 'INVALID_RESPONSE', code); }
    };
    if (!q.subjectId) row.nonGradingMetadataFlags.push('MISSING_SUBJECT_ID');
    if (!q.topicId) row.nonGradingMetadataFlags.push('MISSING_TOPIC_ID');
    if (!q.source) row.nonGradingMetadataFlags.push('MISSING_SOURCE_METADATA');
    if (Array.isArray(q.choices) && new Set(q.choices.map(choice => typeof choice === 'string' ? choice.trim() : choice)).size !== q.choices.length) {
      row.gradingMetadataFlags.push('DUPLICATE_CHOICE_TEXT_REQUIRES_REVIEW');
    }
    if (countsById.get(q.id) !== 1) row.gradingMetadataFlags.push('DUPLICATE_STABLE_ID');
    let definitionValid = true;
    try { api.createCanonicalRegistry([{ book: bank.book, questions: [q] }]); }
    catch { definitionValid = false; row.gradingMetadataFlags.push('INVALID_CANONICAL_DEFINITION'); }
    check(definitionValid, 'CANONICAL_DEFINITION');
    check(typeof q.id === 'string' && q.id.length > 0 && countsById.get(q.id) === 1, 'UNIQUE_STABLE_ID');
    try {
      const entry = await api.getCanonicalQuestion(q.id);
      check(entry.question.id === q.id && entry.book === bank.book && entry.choiceCount === q.choices.length
        && entry.questionType === row.representation, 'REGISTRY_RECOGNITION_AND_REPRESENTATION');
      check(Object.keys(q).every(key => JSON.stringify(entry.question[key]) === JSON.stringify(q[key])), 'CANONICAL_RECORD_PRESERVED');
    } catch { check(false, 'REGISTRY_LOOKUP_REJECTED'); }
    if (definitionValid) {
      const choiceCount = q.choices.length;
      if (!q.matching) {
        totals.correctResponses++;
        await grade({ kind: 'single_choice', choiceIndex: q.correctAnswer }, true, 'OFFICIAL_CORRECT_OPTION');
        for (let index = 0; index < choiceCount; index++) if (index !== q.correctAnswer) {
          row.incorrectOptionsTested++; totals.incorrectOptions++;
          await grade({ kind: 'single_choice', choiceIndex: index }, false, 'INCORRECT_OPTION');
        }
        if (!permutationCache.has(choiceCount)) permutationCache.set(choiceCount, [...permutations(Array.from({ length: choiceCount }, (_, i) => i))]);
        // Hypothetical orders test canonical-index conversion, not permission to shuffle protected content.
        for (const displayOrder of permutationCache.get(choiceCount)) {
          row.shufflePermutationsTested++; totals.shufflePermutations++;
          for (let position = 0; position < displayOrder.length; position++) {
            const canonicalIndex = displayOrder[position];
            row.shuffledChoiceChecks++; totals.shuffledChoiceChecks++;
            await grade({ kind: 'single_choice', choiceIndex: canonicalIndex }, canonicalIndex === q.correctAnswer, 'SHUFFLE_CANONICAL_INDEX');
          }
        }
        await reject({ kind: 'matching', selections: [0] }, 'MATCHING_RESPONSE_FOR_ORDINARY');
      } else {
        const key = q.matching.answerKey;
        totals.correctResponses++;
        await grade({ kind: 'matching', selections: [...key] }, true, 'OFFICIAL_COMPLETE_MAPPING');
        // Every wrong bank option at every item, holding all other items at their official choices.
        for (let item = 0; item < key.length; item++) for (let option = 0; option < choiceCount; option++) {
          if (option === key[item]) continue;
          const selections = [...key]; selections[item] = option;
          row.incorrectMatchingMappingsTested++; totals.incorrectMatchingMappings++;
          await grade({ kind: 'matching', selections }, false, 'INCORRECT_MATCHING_ITEM_OPTION');
        }
        const allWrong = key.map(index => (index + 1) % choiceCount);
        row.incorrectMatchingMappingsTested++; totals.incorrectMatchingMappings++;
        await grade({ kind: 'matching', selections: allWrong }, false, 'MULTIPLE_WRONG_MATCHING_ITEMS');
        const reversed = [...key].reverse();
        if (reversed.some((value, i) => value !== key[i])) {
          row.incorrectMatchingMappingsTested++; totals.incorrectMatchingMappings++;
          await grade({ kind: 'matching', selections: reversed }, false, 'MATCHING_ITEM_ORDER');
        }
        await reject({ kind: 'matching', selections: key.slice(1) }, 'MISSING_MATCHING_ITEM');
        await reject({ kind: 'matching', selections: [...key, 0] }, 'EXTRA_MATCHING_ITEM');
        await reject({ kind: 'matching', selections: [choiceCount, ...key.slice(1)] }, 'OUT_OF_RANGE_MATCHING_ITEM');
        await reject({ kind: 'single_choice', choiceIndex: 0 }, 'ORDINARY_RESPONSE_FOR_MATCHING');
      }
      await grade({ kind: 'timeout' }, false, 'EXPLICIT_TIMEOUT');
    }
    row.status = row.failedAssertions ? 'FAIL' : 'PASS';
    results.push(row);
  }
}

const exitMismatches = mismatches();
const currentAssetPaths = walk('public/reviewer-assets').sort();
const expectedAssetPaths = Object.keys(integrity.assets).sort();
const assetInventoryUnchanged = JSON.stringify(currentAssetPaths) === JSON.stringify(expectedAssetPaths);
const datasets = banks.map(bank => ({ book: bank.book, path: bank.path, expectedCount: bank.expectedCount,
  questionsTested: bank.questions.length, countMatches: bank.questions.length === bank.expectedCount,
  sha256: hash(bank.path), hashUnchanged: hash(bank.path) === integrity.datasets.find(d => d.path === bank.path).sha256,
  protectedIdsUnchanged: JSON.stringify(bank.questions.filter(q => q.disableShuffle).map(q => q.id).sort())
    === JSON.stringify(integrity.datasets.find(d => d.path === bank.path).protectedIds),
  passes: results.filter(row => row.book === bank.book && row.status === 'PASS').length,
  failures: results.filter(row => row.book === bank.book && row.status === 'FAIL').length }));
const failedQuestionIds = results.filter(row => row.status === 'FAIL').map(row => row.questionId);
const gradingMetadataFlaggedIds = results.filter(row => row.gradingMetadataFlags.length).map(row => row.questionId);
const nonGradingMetadataFlaggedIds = results.filter(row => row.nonGradingMetadataFlags.length).map(row => row.questionId);
const globalFailures = [];
if (results.length !== 4441 || datasets.some(bank => !bank.countMatches)) globalFailures.push('QUESTION_COUNT_MISMATCH');
if (registryError || missingRegistryIds.length || unexpectedRegistryIds.length || duplicateIds.length || missingIdRecords.length) globalFailures.push('REGISTRY_MEMBERSHIP_FAILURE');
if (entryMismatches.length || exitMismatches.length || !assetInventoryUnchanged || datasets.some(bank => !bank.hashUnchanged || !bank.protectedIdsUnchanged)) globalFailures.push('CONTENT_OR_SOURCE_INTEGRITY_FAILURE');
const report = {
  schemaVersion: 1, startedAt: started.toISOString(), completedAt: new Date().toISOString(),
  status: failedQuestionIds.length || globalFailures.length ? 'FAIL' : gradingMetadataFlaggedIds.length ? 'PASS_WITH_METADATA_FLAGS' : 'PASS',
  scope: 'Technical audit of every original record against authoritative dataset indexes/mappings; no textbook or scientific rationale verification.',
  execution: 'Real server-only registry/grader/loaders transpiled by installed TypeScript; only server-only poison marker replaced. No grader, content, scoring or auth mocks. No Supabase calls.',
  summary: { totalQuestionsTested: results.length, passes: results.filter(row => row.status === 'PASS').length,
    failures: failedQuestionIds.length, ...totals, failedQuestionIds, gradingMetadataFlaggedIds,
    nonGradingMetadataFlaggedIds, globalFailures },
  registry: { originalUniqueIds: originalIds.size, registryIds: registryIds.length, duplicateIds, missingIdRecords, missingRegistryIds, unexpectedRegistryIds, registryError },
  coverage: { ordinaryQuestions: results.filter(row => row.representation === 'single_choice').length,
    matchingQuestions: results.filter(row => row.representation === 'matching').length,
    choiceTableQuestions: results.filter(row => row.choiceTable).length,
    byChoiceCount: Object.fromEntries([...new Set(results.map(row => row.choiceCount))].sort((a, b) => a - b).map(count => [count, results.filter(row => row.choiceCount === count).length])),
    representation: 'Every nonmatching record, including numerical-choice and True/False, grades its canonical choice index. Choice-table classification uses row index; matching classification uses ordered selections. Datasets provide no authoritative educational subtype field; no prompt-based subtype guesses were made.',
    matchingIncorrectCoverage: 'All single-item substitutions across every answer-bank option plus all-items-wrong and differing reversed mappings. Not enumeration of the full Cartesian space of multi-item responses.',
    shuffleCoverage: 'All permutations and every displayed position for every ordinary question, mapped back to its canonical index. Hypothetical testing only: no protected question or matching exercise was newly shuffled in the application.' },
  integrity: { datasets, assetsTested: expectedAssetPaths.length, assetInventoryUnchanged, entryMismatches, exitMismatches,
    preservedExistingSourceFiles: Object.keys(preserved).length, preservedFoundationFiles: foundationFiles },
  questions: results,
};
const destination = resolve(root, 'docs/phase3i-a/exhaustive-grading-results.json');
writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, totalQuestionsTested: results.length, passes: report.summary.passes,
  failures: failedQuestionIds.length, gradingCalls: totals.gradingCalls, failedAssertions: totals.failedAssertions,
  gradingMetadataFlags: gradingMetadataFlaggedIds.length, nonGradingMetadataFlags: nonGradingMetadataFlaggedIds.length,
  globalFailures, report: 'docs/phase3i-a/exhaustive-grading-results.json' }));
process.exitCode = failedQuestionIds.length || globalFailures.length || gradingMetadataFlaggedIds.length ? 1 : 0;
