import assert from "node:assert/strict";
import test from "node:test";
import { allQuestionIds, firstSessionAnswers, queueAfterAnswer, sessionMastery, upgradeMasteryQueue } from "../app/lib/sessionMastery";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as matching from "../app/lib/matchingQuestion";
import * as reinforcement from "../app/lib/adaptiveQuestions";
import { canAccessQuestionBank, FREE_ENTITLEMENT } from "../app/lib/entitlements";
import { isCloudSyncAllowedForBook } from "../app/lib/cloudSyncGate";
import { canResumeRecentReview, restoreRecentMasterySession } from "../app/lib/recentReviewSession";

const component = readFileSync("app/RevITApp.tsx", "utf8");
const ast = ts.createSourceFile("app.tsx", component, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function functionSource(name: string) {
  let source = "";
  const visit = (node: ts.Node) => { if (ts.isFunctionDeclaration(node) && node.name?.text === name) source = node.getText(ast); ts.forEachChild(node, visit); };
  visit(ast); assert.ok(source, name); return ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}

test("select all retains every unique ID in source order without adaptive redraws", () => {
  assert.deepEqual(allQuestionIds(["a", "b", "a", "c"], 4), ["a", "b", "c"]);
  assert.equal(allQuestionIds(["a", "b"], 1), null);
  assert.match(component, /!allIds && i < target/);
});

test("actual answer handler keeps retries out of history, cloud writes, XP and analytics", () => {
  const question = { id: "q", topicId: "topic", subjectId: "subject", choices: ["A", "B", "C", "D", "E"], correctAnswer: 4, book: "Harr" as const };
  let queue = [question.id], globalAnswers: {questionId:string; correct:boolean}[] = [], sessionAnswers: {questionId:string; correct:boolean}[] = [];
  let history = 0, xp = 0, activity = 0, index = 0;
  for (const answer of [0, 4, 0, 4, 4]) {
    const context = {
      ...matching, ...reinforcement, canAccessQuestionBank, queueAfterAnswer, isCloudSyncAllowedForBook,
      currentQuestion: question, answerRevealed: false, answerLockedRef: { current: false }, entitlement: FREE_ENTITLEMENT,
      sessionOwnerRef: {current:"owner"}, attempts: globalAnswers, sessionAttempts: sessionAnswers, sessionQuestionIds: queue, sessionIndex: index,
      topicById: new Map(), subjectById: new Map(), reinforcementLevels: {}, normalizedDifficulty: () => "Unspecified",
      crypto: {randomUUID:()=>`answer-${index}`}, sessionMode: "adaptive", sessionId: "session", cloudEnabled:true, initialUser:{id:"owner"}, trustedStudy:null,
      STRASINGER_CLOUD_SYNC_ENABLED:false, soundEffectsEnabled:false,
      setPlanAnnouncementOpen:()=>assert.fail("Harr must remain accessible"),
      setAttempts:(fn:(a:typeof globalAnswers)=>typeof globalAnswers)=>{globalAnswers=fn(globalAnswers);},
      setSessionAttempts:(fn:(a:typeof sessionAnswers)=>typeof sessionAnswers)=>{sessionAnswers=fn(sessionAnswers);},
      setSessionQuestionIds:(next:string[])=>{queue=next;}, setReinforcementLevels:()=>{},
      queueQuestionReinforcement:()=>{}, queueQuestionAttempt:()=>{history++;},
      setSelectedChoice:()=>{},setTimedOut:()=>{},setAnswerRevealed:()=>{},
      recordStudyEvent:(_event:unknown,reward:number)=>{activity++;xp+=reward;},XP_REWARDS:{CORRECT_QUESTION:5},
    };
    new Function(...Object.keys(context), `${functionSource("completeQuestion")}; return completeQuestion;`)(...Object.values(context))(answer);
    index++;
  }
  assert.equal(sessionAnswers.length,5); assert.equal(globalAnswers.length,1);
  assert.equal(history,1); assert.equal(activity,1); assert.equal(xp,0);
  assert.equal(globalAnswers[0].correct,false); assert.equal(sessionMastery(queue,sessionAnswers).done,true);
});

test("expired Pro and unknown unpublished books cannot answer or mutate history", () => {
  assert.equal(canAccessQuestionBank("Ciulla",FREE_ENTITLEMENT),false);
  assert.equal(canAccessQuestionBank("BOC" as never,{...FREE_ENTITLEMENT,effectivePlan:"pro"}),false);
  assert.equal(canAccessQuestionBank("Elsevier" as never,{...FREE_ENTITLEMENT,effectivePlan:"pro"}),false);
  let denied=0;
  const context={currentQuestion:{id:"q",book:"Ciulla"},answerRevealed:false,answerLockedRef:{current:false},
    initialUser:{id:"owner"},sessionOwnerRef:{current:"owner"},entitlement:FREE_ENTITLEMENT,canAccessQuestionBank,setPlanAnnouncementOpen:()=>{denied++;}};
  new Function(...Object.keys(context), `${functionSource("completeQuestion")}; return completeQuestion;`)(...Object.values(context))(0);
  assert.equal(denied,1);assert.equal(context.answerLockedRef.current,false);
});

test("matching scoring feeds the identical retry rules without flattening the source key", () => {
  const question={choices:["A","B","C","D"],matching:{items:["one","two","three","four"],answerKey:[2,3,0,1]}};
  const selected=matching.encodeMatchingAnswers(question.matching.answerKey,4);
  assert.equal(selected,177);
  assert.equal(matching.isQuestionAnswerCorrect(question as never,selected),true);
  run([false,true,true]);
});

test("double Next clicks cannot skip a queued question or award completion twice", () => {
  assert.doesNotMatch(functionSource("leaveSession"),/recordProgressOnlyEvent/);
  for(const done of [false,true]) {
    let index=0,rewards=0;
    const context={answerRevealed:true,currentQuestion:{id:"q",book:"Harr"},answerLockedRef:{current:true},
      sessionOwnerRef:{current:"local"},initialUser:null,sessionCanFinish:done,sessionQuestionIds:done?["q"]:["q","q"],sessionIndex:0,
      STRASINGER_CLOUD_SYNC_ENABLED:false,isCloudSyncAllowedForBook,sessionId:"s",trustedStudy:null,clearRecentSession:()=>{},
      recordProgressOnlyEvent:()=>{rewards++;},XP_REWARDS:{COMPLETE_STUDY_SESSION:20},
      setSessionIndex:(value:number|((current:number)=>number))=>{index=typeof value==="function"?value(index):value;},
      setSelectedChoice:()=>{},setMatchingSelections:()=>{},setAnswerRevealed:()=>{},setTimedOut:()=>{},scheduleBatchedCloudSync:()=>{},
    };
    const next=new Function(...Object.keys(context),`${functionSource("nextQuestion")};return nextQuestion;`)(...Object.values(context));
    next();next();assert.equal(index,1);assert.equal(rewards,done?1:0);
    context.answerLockedRef.current=true;context.sessionOwnerRef.current="previous-owner";next();assert.equal(index,1);
  }
});

test("actual legacy resume retains a completed final question without answering or rewarding it again", () => {
  const question={id:"legacy",book:"Harr",choices:["A","B","C","D"]};
  const snapshot={id:"old-session",poolIds:[question.id],targetCount:1,questionIds:[question.id],choiceOrders:{},strictWrongOnly:false,
    sessionMode:"reviewer",index:0,attempts:[{questionId:question.id,correct:true}],activeTimer:{enabled:false,duration:60}};
  const state:Record<string,unknown>={};let cleared=0;
  const setters=Object.fromEntries(["LibraryMode","SessionId","SessionPoolIds","SessionTargetCount","SessionQuestionIds","SessionChoiceOrders","SessionSkippedIds","SessionStrictWrongOnly","SessionMode","SessionIndex","SessionAttempts","SelectedChoice","MatchingSelections","AnswerRevealed","TimedOut","ActiveTimer","ResumeModalOpen","ActiveView"].map(key=>[`set${key}`,(value:unknown)=>{state[key]=value;}]));
  const context={...setters,recentSession:snapshot,questionById:new Map([[question.id,question]]),canAccessQuestionBank,
    recentSessionAvailable:canResumeRecentReview(snapshot as never,new Map([[question.id,question]]) as never,FREE_ENTITLEMENT),restoreRecentMasterySession,
    entitlement:FREE_ENTITLEMENT,sessionOwnerRef:{current:"local"},initialUser:null,answerLockedRef:{current:false},
    upgradeMasteryQueue,sessionMastery,TIMER_DISABLED:{enabled:false,duration:60},clearRecentSession:()=>{cleared++;},
    window:{history:{pushState:()=>{}},scrollTo:()=>{}},setProgressionError:()=>assert.fail("Known legacy question must remain available"),
    setPlanAnnouncementOpen:()=>assert.fail("Harr access must remain Free"),
  };
  new Function(...Object.keys(context),`${functionSource("continueRecentSession")};return continueRecentSession;`)(...Object.values(context))();
  assert.deepEqual(state.SessionQuestionIds,[question.id]);assert.equal(state.SessionIndex,1);
  assert.deepEqual(state.SessionAttempts,snapshot.attempts);assert.equal(cleared,1);
});

function run(pattern: boolean[]) {
  let queue = ["q"];
  const answers: { questionId: string; correct: boolean }[] = [];
  for (const [index, correct] of pattern.entries()) {
    assert.equal(queue[index], "q");
    answers.push({ questionId: "q", correct });
    queue = queueAfterAnswer(queue, index, answers);
    const restored = JSON.parse(JSON.stringify({ queue, answers }));
    assert.deepEqual(sessionMastery(restored.queue, restored.answers), sessionMastery(queue, answers));
    if (index < pattern.length - 1) assert.equal(sessionMastery(queue, answers).done, false);
  }
  assert.equal(sessionMastery(queue, answers).done, true);
  assert.equal(sessionMastery(queue, answers).unique, 1);
  assert.equal(queue.length, pattern.length);
  assert.equal(firstSessionAnswers(answers).length, 1);
  return answers;
}

for (const pattern of [[true], [false, true, true], [false, true, false, true, true], [false, false, true, true]]) {
  test(`mastery and exact serialized restoration: ${pattern.map(v => v ? "correct" : "wrong").join(", ")}`, () => { run(pattern); });
}

test("all-wrong sessions use a fair queue, retain initial order and have one pending entry per question", () => {
  let queue = ["a", "b", "c"];
  const answers: { questionId: string; correct: boolean }[] = [];
  for (let index = 0; index < 9; index++) {
    const questionId = queue[index];
    answers.push({ questionId, correct: index >= 3 });
    queue = queueAfterAnswer(queue, index, answers);
    const pending = queue.slice(index + 1);
    assert.equal(new Set(pending).size, pending.length);
  }
  assert.deepEqual(queue, ["a", "b", "c", "a", "b", "c", "a", "b", "c"]);
  assert.equal(sessionMastery(queue, answers).completed, 3);
  assert.equal(firstSessionAnswers(answers).filter(a => a.correct).length, 0);
});

test("first-correct questions never repeat; repeated wrong resets 1/2 to 0/2", () => {
  const queue = ["a", "b", "a", "a"];
  const answers = [{ questionId: "a", correct: false }, { questionId: "b", correct: true }, { questionId: "a", correct: true }];
  assert.equal(sessionMastery(queue, answers).states.get("a")?.streak, 1);
  answers.push({ questionId: "a", correct: false });
  assert.equal(sessionMastery(queue, answers).states.get("a")?.streak, 0);
  assert.deepEqual(queueAfterAnswer(queue, 3, answers), [...queue, "a"]);
  assert.equal(sessionMastery(queue, answers).states.get("b")?.complete, true);
});

test("legacy snapshots retain answers and append unfinished questions without losing initial questions", () => {
  const answers = [{ questionId: "a", correct: false }, { questionId: "b", correct: true }];
  assert.deepEqual(upgradeMasteryQueue(["a", "b", "c"], 2, answers), ["a", "b", "c", "a"]);
  assert.deepEqual(firstSessionAnswers([...answers, { questionId: "a", correct: true }]), answers);
  const complete = ["a","b","c"].map(questionId=>({questionId,correct:true}));
  const restored = upgradeMasteryQueue(["a","b","c"],2,complete);
  assert.deepEqual(restored,["a","b","c"]);
  assert.equal(sessionMastery(restored,complete).completed,3,"completed final question remains in the selected inventory");
});
