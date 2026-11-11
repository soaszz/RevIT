import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import type { SavedRecentSession } from "../app/components/ResumeSessionModal";
import { canResumeRecentReview, parseRecentReviewSession, restoreRecentMasterySession } from "../app/lib/recentReviewSession";
import { getSubjectDisplayName } from "../app/lib/reviewerLibrary";
import { FREE_ENTITLEMENT } from "../app/lib/entitlements";
import type { ReviewerQuestion } from "../app/content/reviewerContent";

const source = readFileSync("app/RevITApp.tsx", "utf8");
const ast = ts.createSourceFile("app.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function actual(name: string, context: Record<string, unknown>, effect = false): (...args: unknown[]) => unknown {
  let expression: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (!effect && ts.isFunctionDeclaration(node) && node.name?.text === name) expression = node;
    if (!effect && ts.isVariableDeclaration(node) && node.name.getText(ast) === name) expression = node.initializer;
    if (effect && ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect"
      && node.arguments[0].getText(ast).includes(name)) expression = node.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(expression, name);
  const code = ts.transpileModule(`const extracted = (${expression.getText(ast)});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return new Function(...Object.keys(context), `${code};return extracted;`)(...Object.values(context));
}
const saved: SavedRecentSession = {
  id: "same-review", poolIds: ["premium-q"], targetCount: 1, questionIds: ["premium-q"],
  choiceOrders: { "premium-q": [1, 0], "0:premium-q": [1, 0] }, strictWrongOnly: false,
  sessionMode: "adaptive", index: 0, attempts: [], activeTimer: { enabled: false, duration: 60 },
  selectedTopicIds: ["premium-topic"], wrongAnswersOnly: false, book: "Ciulla",
  pausedAt: "2026-01-01T00:00:00Z", primaryTopicName: "Source topic", subjectName: "Source subject",
  skippedIds: [], selectedChoice: 1, matchingSelections: [], answerRevealed: false, timedOut: false,
};
const question = { id: "premium-q", subjectId: "premium-subject", topicId: "premium-topic", book: "Ciulla", choices: ["a", "b"] } as ReviewerQuestion;
const questions = new Map([[question.id, question]]);
const pro = { ...FREE_ENTITLEMENT, effectivePlan: "pro" as const };

test("short/extended inactivity and reload retain saved sessions before premium content loads", () => {
  for (const pausedAt of [new Date(Date.now() - 60_000).toISOString(), new Date(Date.now() - 86400_000 * 30).toISOString()]) {
    const snapshot = { ...saved, pausedAt };
    const parsed = parseRecentReviewSession(JSON.stringify(snapshot));
    assert.deepEqual(parsed, snapshot);
    assert.equal(canResumeRecentReview(parsed, new Map(), pro), false, "loading is not invalidation");
    assert.equal(canResumeRecentReview(parsed, questions, pro), true, "same saved data becomes resumable after loading");
  }
  const legacy = { ...saved }; delete legacy.selectedChoice; delete legacy.matchingSelections; delete legacy.answerRevealed; delete legacy.timedOut;
  assert.deepEqual(parseRecentReviewSession(JSON.stringify(legacy)), legacy);
});

test("malformed/completed snapshots and denied or missing content cannot resume; valid data remains recoverable", () => {
  for (const change of [{ index: -1 }, { index: 1 }, { poolIds: [] }, { questionIds: ["missing"] }, { attempts: null },
    { choiceOrders: [] }, { selectedChoice: -1 }, { sessionMode: "invented" }, { activeTimer: null }, { pausedAt: "invalid" }]) {
    assert.equal(parseRecentReviewSession(JSON.stringify({ ...saved, ...change })), null, JSON.stringify(change));
  }
  assert.equal(parseRecentReviewSession("{bad"), null);
  assert.equal(canResumeRecentReview(saved, questions, FREE_ENTITLEMENT), false);
  assert.equal(canResumeRecentReview(saved, new Map(), pro), false);
  assert.deepEqual(parseRecentReviewSession(JSON.stringify(saved)), saved);
  assert.equal(canResumeRecentReview(saved, questions, pro), true, "renewed verified entitlement permits same snapshot");
});

test("actual saver preserves answers, queue, grading reveal, stats, selections and same session ID", () => {
  let serialized = ""; let recent: unknown;
  const save = actual("saveRecentSession", {
    useCallback: (callback: unknown) => callback, getSubjectDisplayName, currentQuestion: question, sessionId: saved.id,
    sessionOwnerRef: { current: "owner" }, initialUser: { id: "owner" },
    topicById: new Map([[question.topicId, { name: saved.primaryTopicName }]]), subjectById: new Map([[question.subjectId, { name: saved.subjectName }]]),
    sessionPoolIds: saved.poolIds, sessionTargetCount: saved.targetCount, sessionQuestionIds: saved.questionIds,
    sessionChoiceOrders: saved.choiceOrders, sessionStrictWrongOnly: saved.strictWrongOnly, sessionMode: saved.sessionMode,
    sessionIndex: saved.index, sessionAttempts: saved.attempts, activeTimer: saved.activeTimer,
    selectedTopicIds: saved.selectedTopicIds, wrongAnswersOnly: false, selectedBook: "Ciulla", sessionSkippedIds: [],
    selectedChoice: 1, matchingSelections: [1, 0], answerRevealed: true, timedOut: false,
    recentSessionStorageKey: (owner: string) => `review:${owner}`,
    localStorage: { setItem(key: string, value: string) { assert.equal(key, "review:owner"); serialized = value; } },
    setRecentSession(value: unknown) { recent = value; },
  });
  assert.equal(save(), true);
  const parsed = parseRecentReviewSession(serialized)!;
  assert.equal(parsed.id, saved.id); assert.equal(parsed.selectedChoice, 1); assert.equal(parsed.answerRevealed, true);
  assert.equal(parsed.masteryVersion, 1);
  assert.deepEqual(parsed.choiceOrders, saved.choiceOrders); assert.deepEqual(parsed.matchingSelections, [1, 0]);
  assert.deepEqual(parsed.questionIds, saved.questionIds); assert.deepEqual(parsed.attempts, saved.attempts);
  assert.deepEqual(parsed, recent);
});

test("actual autosave runs before suspension, on hidden/pagehide, and keeps owner and completion boundaries", () => {
  let saves = 0; const listeners = new Map<string, () => void>(); const removed: string[] = [];
  const events = { addEventListener: (name: string, cb: () => void) => listeners.set(name, cb), removeEventListener: (name: string) => listeners.delete(name) };
  const context = { sessionQuestionIds: ["premium-q"], sessionOwnerRef: { current: "owner" }, initialUser: { id: "owner" },
    sessionComplete: false, saveRecentSession: () => { saves++; }, window: events, document: { ...events, visibilityState: "hidden" },
    localStorage: { removeItem: (key: string) => removed.push(key) }, recentSessionStorageKey: (owner: string) => owner,
    setRecentSession: (value: unknown) => assert.equal(value, null) };
  const cleanup = actual('document.addEventListener("visibilitychange"', context, true)() as () => void;
  assert.equal(saves, 1, "state is durable even if no lifecycle event is delivered");
  listeners.get("visibilitychange")!(); listeners.get("pagehide")!(); assert.equal(saves, 3);
  cleanup(); assert.equal(listeners.size, 0);
  actual('document.addEventListener("visibilitychange"', { ...context, sessionOwnerRef: { current: "another-owner" } }, true)();
  assert.equal(saves, 3); assert.deepEqual(removed, []);
  actual('document.addEventListener("visibilitychange"', { ...context, sessionComplete: true }, true)();
  assert.deepEqual(removed, ["owner"]);
});

test("actual resume restores paused state without creating a second session; auth refresh preserves scope", () => {
  const state: Record<string, unknown> = {}; const context: Record<string, unknown> = {
    recentSession: { ...saved, masteryVersion: 1, answerRevealed: true }, recentSessionAvailable: true, restoreRecentMasterySession,
    sessionOwnerRef: { current: "owner" }, initialUser: { id: "owner" }, answerLockedRef: { current: false }, TIMER_DISABLED: { enabled: false, duration: 60 },
    window: { history: { pushState() {} }, scrollTo() {} },
  };
  for (const name of ["LibraryMode", "SelectedTopicIds", "WrongAnswersOnly", "SelectedBook", "SessionId", "SessionPoolIds", "SessionTargetCount",
    "SessionQuestionIds", "SessionChoiceOrders", "SessionSkippedIds", "SessionStrictWrongOnly", "SessionMode", "SessionIndex", "SessionAttempts",
    "SelectedChoice", "MatchingSelections", "AnswerRevealed", "TimedOut", "ActiveTimer", "ResumeModalOpen", "ActiveView"])
    context[`set${name}`] = (value: unknown) => { state[name] = value; };
  actual("continueRecentSession", context)();
  assert.equal(state.SessionId, saved.id); assert.equal(state.SelectedChoice, 1); assert.equal(state.AnswerRevealed, true);
  assert.deepEqual(state.SessionQuestionIds, saved.questionIds); assert.deepEqual(state.SessionChoiceOrders, saved.choiceOrders);
  assert.deepEqual(state.SelectedTopicIds, saved.selectedTopicIds); assert.deepEqual(state.SessionAttempts, saved.attempts);
  assert.equal((context.answerLockedRef as { current: boolean }).current, true, "revealed answer cannot be submitted twice");
  assert.equal(state.LibraryMode, "mcqs"); assert.equal(state.SelectedBook, "Ciulla");
  for (const key of Object.keys(state)) delete state[key];
  actual("continueRecentSession", { ...context, recentSessionAvailable: false })(); assert.deepEqual(state, {});
  assert.match(source, /setStorageReady\(true\);\s*\}, \[initialUser\?\.id\]\)/, "same-account token refresh does not reload/reset review state");
  assert.match(source, /!isReviewSessionActive && recentSessionAvailable && recentSession/);
  assert.match(source, /isOpen=\{resumeModalOpen && recentSessionAvailable\}/);
  assert.doesNotMatch(source, /if \(hasUnauthorizedQuestions\)[\s\S]{0,100}clearRecentSession/, "temporary access loss must not delete resumable data");
});

test("corrupt choice permutations and out-of-range saved selections cannot resume", () => {
  assert.equal(canResumeRecentReview({ ...saved, selectedChoice: 2 }, questions, pro), false);
  assert.equal(canResumeRecentReview({ ...saved, choiceOrders: { "premium-q": [0, 0] } }, questions, pro), false);
  assert.equal(canResumeRecentReview({ ...saved, choiceOrders: { "premium-q": [0, 9] } }, questions, pro), false);
});

test("matching resume validates encoded response bounds and exact positional selections", () => {
  const matchingQuestion={...question,choices:["a","b","c","d"],matching:{items:["one","two","three","four"],answerKey:[2,3,0,1]}};
  const available=new Map([[matchingQuestion.id,matchingQuestion]]);
  const snapshot={...saved,choiceOrders:{[matchingQuestion.id]:[0,1,2,3]},selectedChoice:177,matchingSelections:[2,3,0,1],answerRevealed:true};
  assert.equal(canResumeRecentReview(snapshot,available,pro),true);
  assert.equal(canResumeRecentReview({...snapshot,selectedChoice:256},available,pro),false);
  assert.equal(canResumeRecentReview({...snapshot,matchingSelections:[2,3,0,0]},available,pro),false);
  assert.equal(canResumeRecentReview({...snapshot,matchingSelections:[2,3,0,4]},available,pro),false);
  assert.equal(canResumeRecentReview(snapshot,available,{...pro,effectivePlan:"free"}),false);
});

test("autosave and restoration add only browser-local writes without a network or render write loop", () => {
  const sections: string[] = [];
  let autosaveDependencies = "";
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "saveRecentSession") sections.push(node.initializer!.getText(ast));
    if (ts.isFunctionDeclaration(node) && ["timeoutSession", "continueRecentSession"].includes(node.name?.text ?? "")) sections.push(node.getText(ast));
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect"
      && node.arguments[0].getText(ast).includes('document.addEventListener("visibilitychange"')) {
      sections.push(node.arguments[0].getText(ast)); autosaveDependencies = node.arguments[1].getText(ast);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.equal(sections.length, 4);
  for (const section of sections) assert.doesNotMatch(section, /\b(?:fetch|createClient|supabase|rpc|queueQuestionAttempt|scheduleBatchedCloudSync|recordStudyEvent|console)\b/);
  assert.match(sections.join("\n"), /localStorage\.setItem\(recentSessionStorageKey\(initialUser\?\.id\)/);
  assert.doesNotMatch(autosaveDependencies, /\brecentSession\b/, "updating saved UI state cannot retrigger autosave");
  const saveDeclaration = sections.find(section => section.startsWith("useCallback"))!;
  assert.doesNotMatch(saveDeclaration.slice(saveDeclaration.lastIndexOf("}, [")), /\brecentSession\b/);
  assert.doesNotMatch(readFileSync("app/lib/recentReviewSession.ts", "utf8"), /(?:supabase|fetch\(|console\.)/);
});
