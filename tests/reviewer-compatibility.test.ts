import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";
const boc = JSON.parse(readFileSync(".private-reviewers/runtime/books/boc.json", "utf8"));
const elsevier = JSON.parse(readFileSync(".private-reviewers/runtime/books/elsevier.json", "utf8"));
import type { ReviewerQuestion } from "../app/content/reviewerContent";
import { prepareReviewerResponse, reviewerSelectedAnswer, reviewerResponseFromLocal, reviewerHistoryAnswer, compatibleReviewerBook } from "../app/lib/reviewerAttemptCompatibility";
import { toFlashcard, buildFlashcardDeck } from "../app/lib/flashcards";
import { QUESTION_BANKS, canAccessQuestionBank, FREE_ENTITLEMENT } from "../app/lib/entitlements";
import { computeAttemptStats } from "../app/lib/leaderboardService";
import { calculateTopicMastery } from "../app/lib/weaknessAnalytics";
import type { QuestionAttempt } from "../app/lib/domain";
import { getUnifiedSubjects } from "../app/lib/reviewerLibrary";
import { getPublicReviewerBooks, getUpcomingReviewerNames } from "../app/lib/publicReviewerBooks";
import type { Subject, Topic, ReviewerBook } from "../app/content/reviewerContent";

const banks = [boc,elsevier];
const questions = [...boc.questions,...elsevier.questions] as ReviewerQuestion[];
const matching = questions.filter(q => q.matching);
const fifth = questions.filter(q => !q.matching && q.choices.length === 5);
const read = (p: string) => readFileSync(p,"utf8");

test("upcoming notice follows each publication flag without publishing either edition", () => {
  assert.equal(QUESTION_BANKS.boc.published, false);
  assert.equal(QUESTION_BANKS.elsevier.published, false);
  const current = getPublicReviewerBooks();
  assert.equal(getUpcomingReviewerNames(), "BOC Study Guide 7th Edition and Elsevier's MLS Examination Review");
  assert.deepEqual(current.books.map(b => b.id), ["harr", "ciulla", "rodak", "strasinger"]);
  for (const bocPublished of [false, true]) for (const elsevierPublished of [false, true]) {
    const registry = { ...QUESTION_BANKS,
      boc: { ...QUESTION_BANKS.boc, published: bocPublished },
      elsevier: { ...QUESTION_BANKS.elsevier, published: elsevierPublished },
    };
    const state = getPublicReviewerBooks(registry);
    assert.equal(getUpcomingReviewerNames(registry), [!bocPublished && "BOC Study Guide 7th Edition", !elsevierPublished && "Elsevier's MLS Examination Review"].filter(Boolean).join(" and "));
    assert.equal(state.books.some(b => b.id === "boc"), bocPublished);
    assert.equal(state.books.some(b => b.id === "elsevier"), elsevierPublished);
    assert.equal(state.freeNames, "Harr");
    assert.equal(state.proBooks.every(b => b.requiredPlan === "pro"), true);
  }
  for (const path of ["app/pricing/PricingContent.tsx", "app/pro/page.tsx"]) {
    assert.match(read(path), /upcomingReviewerNames && <aside/);
    assert.match(read(path), /adding \{upcomingReviewerNames\} to RevIT Pro/);
  }
});

test("live four-book library names, ordering, descriptions, categories and memberships remain exact",()=>{
  const pinned=JSON.parse(read("docs/reviewer-compatibility/four-book-library-projection.json"));
  const subjects:Subject[]=[],topics:Topic[]=[];
  for(const [book,name]of [["Harr","reviewer"],["Ciulla","ciulla"],["Rodak","rodak"],["Strasinger","strasinger"]] as const){
    const bank=JSON.parse(read(`app/content/${name}Content.json`));subjects.push(...bank.subjects.map((s:Subject)=>({...s,book})));topics.push(...bank.topics.map((t:Topic)=>({...t,book})));
  }
  for(const book of ["Harr","Ciulla","Rodak","Strasinger","all"] as (ReviewerBook|"all")[])assert.deepEqual(getUnifiedSubjects(book,subjects,topics),pinned.projections[book]);
});

test("source IDs, official responses and all 3299 ordinary/matching scores remain exact", () => {
  assert.equal(questions.length,3299); assert.equal(new Set(questions.map(q=>q.id)).size,3299);
  for (const q of questions) {
    const response = q.matching ? {kind:"matching" as const,selections:q.matching.answerKey}
      : {kind:"single_choice" as const,choiceIndex:q.correctAnswer};
    const graded = prepareReviewerResponse(q,q.book!,response);
    assert.equal(graded.isCorrect,true,q.id);
    assert.deepEqual(graded.response,response);
    assert.equal(reviewerSelectedAnswer(response,q.choices.length),graded.localSelectedAnswer);
    assert.deepEqual(reviewerResponseFromLocal(q.id,graded.localSelectedAnswer),response);
    assert.equal(reviewerHistoryAnswer(q.id,graded.selectedAnswer,response),graded.localSelectedAnswer);
    assert.equal(prepareReviewerResponse(q,q.book!,{kind:"timeout"}).isCorrect,false);
  }
});
test("fifth choice is retained; negative/fraction/sixth/NaN indices rejected", () => {
  assert.equal(fifth.length,9);
  for(const q of fifth) {
    assert.equal(prepareReviewerResponse(q,"Elsevier",{kind:"single_choice",choiceIndex:4}).selectedAnswer,4);
    for(const choiceIndex of [-1,1.5,5,NaN])assert.throws(()=>prepareReviewerResponse(q,"Elsevier",{kind:"single_choice",choiceIndex}));
  }
  assert.throws(()=>prepareReviewerResponse(questions[0],"BOC",{kind:"single_choice",choiceIndex:4}));
});
test("all five matching definitions retain item count, key order and exact response", () => {
  assert.deepEqual(matching.map(q=>[q.id,q.matching!.answerKey]),[
    ["elsevier-ch02-044",[2,3,0,1]],["elsevier-ch02-048",[2,3,0,1]],
    ["elsevier-ch10-007",[2]],["elsevier-ch10-008",[1]],["elsevier-ch10-009",[0]]]);
  for(const q of matching) {
    const selections=q.matching!.answerKey.map((v,i)=>i===0?(v+1)%q.choices.length:v);
    assert.equal(prepareReviewerResponse(q,"Elsevier",{kind:"matching",selections}).isCorrect,false);
    assert.throws(()=>prepareReviewerResponse(q,"Elsevier",{kind:"single_choice",choiceIndex:0}));
    assert.throws(()=>prepareReviewerResponse(q,"Elsevier",{kind:"matching",selections:[]}));
    assert.equal(prepareReviewerResponse(q,"Elsevier",{kind:"matching",selections:q.matching!.answerKey}).selectedAnswer,null);
  }
});
test("book claim cannot disagree with canonical source identity", () => {
  assert.throws(()=>prepareReviewerResponse(questions[0],"Elsevier",{kind:"timeout"}));
  for(const book of ["Harr","Ciulla","Rodak","Strasinger","BOC ","boc"])assert.throws(()=>prepareReviewerResponse(questions[0],book,{kind:"timeout"}));
});
test("all-topic session pools and Flashcards preserve count, rationale, choices and structured visuals", () => {
  for(const bank of banks) for(const topic of bank.topics) {
    const pool=(bank.questions as ReviewerQuestion[]).filter(q=>q.topicId===topic.id);
    assert.ok(pool.length,topic.id);
    const cards=buildFlashcardDeck(bank.questions as ReviewerQuestion[],[topic.id]);
    assert.deepEqual(cards.map(c=>c.id),pool.map(q=>q.id));
    for(const q of pool) {
      const card=toFlashcard(q);assert.equal(card.explanation,q.explanation);assert.deepEqual(card.choices,q.choices);
      assert.deepEqual(card.questionSections,q.questionSections);assert.deepEqual(card.rationaleSections,q.rationaleSections);
      assert.deepEqual(card.stimulus,q.stimulus);assert.deepEqual(card.choiceTables,q.choiceTables);
    }
  }
});
test("publication stays OFF and Free cannot obtain BOC/Elsevier content", () => {
  assert.equal(QUESTION_BANKS.boc.published,false);assert.equal(QUESTION_BANKS.elsevier.published,false);
  assert.equal(canAccessQuestionBank("BOC",FREE_ENTITLEMENT),false);
  assert.equal(canAccessQuestionBank("Elsevier",FREE_ENTITLEMENT),false);
});
test("BOC intentional source gap remains absent; current source bytes remain pinned", () => {
  assert.equal(boc.questions.length,2469);
  assert.equal(boc.questions.some((q: ReviewerQuestion)=>q.id.startsWith("boc-7e-ch03-")&&Number(q.id.slice(-3))>=154&&Number(q.id.slice(-3))<=246),false);
  for(const [book,pin] of [["boc","6d49801f735ae553a18e19ef34ebd59b4a2d4e05f3f6a363a3a368cd26d0b90e"],["elsevier","667b1f9cb78acc471e936f57bbdfc74e25fa1988de9c9ddd0afe7a23af9ec7c0"]])
    assert.equal(createHash("sha256").update(readFileSync(`.private-reviewers/runtime/books/${book}.json`)).digest("hex"),pin);
});
test("restored matching answers feed unchanged progress scoring and edition-specific local statistics",()=>{
  const q=matching[0],response={kind:"matching" as const,selections:q.matching!.answerKey};
  const restored=reviewerHistoryAnswer(q.id,null,response);
  const attempt:QuestionAttempt={id:"synthetic",questionId:q.id,subjectId:q.subjectId,subjectName:"source subject",topicId:q.topicId,
    topicName:"source topic",subtopic:"source subtopic",difficulty:"Unspecified",selectedAnswer:restored,correct:true,attemptNumber:1,
    reviewMode:"reviewer",sessionId:null,isAdaptiveRepeat:false,timestamp:"2026-11-10T00:00:00Z"};
  const options={period:"all_time" as const,metric:"questions" as const};
  assert.equal(computeAttemptStats([attempt],{...options,book:"Elsevier"}).answeredCount,1);
  assert.equal(computeAttemptStats([attempt],{...options,book:"BOC"}).answeredCount,0);
  assert.equal(computeAttemptStats([attempt],{...options,book:"Harr"}).answeredCount,0);
  const mastery=calculateTopicMastery([attempt],{topicId:q.topicId,topicName:"source topic",subjectId:q.subjectId,subjectName:"source subject",book:"Elsevier"});
  assert.equal(mastery.book,"Elsevier");assert.equal(mastery.uniqueQuestions,1);
});

function serverRuntime({published=true,authenticated=true,pro=true}={}) {
  const calls: Record<string,unknown>[]=[];
  const source=read("app/lib/server/reviewerAttemptCompatibility.ts");
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const client={auth:{getUser:async()=>({data:{user:authenticated?{id:"10000000-0000-0000-0000-000000000001"}:null},error:null})},rpc:async()=>({data:[{effective_plan:pro?"pro":"free"}],error:null})};
  const exports:Record<string,unknown>={};
  const dependencies:Record<string,unknown>={"server-only":{},"../supabase/server":{createClient:async()=>client},
    "../admin/adminAuth":{createAdminServiceClient:()=>({rpc:async(_name:string,args:Record<string,unknown>)=>{calls.push(args);return{data:{id:args.p_id},error:null}}})},
    "../entitlements":{FREE_ENTITLEMENT,isQuestionBankPublished:()=>published,canAccessQuestionBank:(_b:string,e:{effectivePlan:string})=>published&&e.effectivePlan==="pro"},
    "./answerVerification":{parseGradingRequest:(v:unknown)=>v,getCanonicalQuestion:async(id:string)=>{const q=questions.find(q=>q.id===id);if(!q)throw Error("UNKNOWN_QUESTION");return{question:q,book:q.book}}},
    "../reviewerAttemptCompatibility":{prepareReviewerResponse},
    "./bocServerContent":{getBocServerPayload:()=>boc},"./elsevierServerContent":{getElsevierServerPayload:()=>elsevier}};
  new Function("require","exports",code)((name:string)=>{assert.ok(Object.hasOwn(dependencies,name),name);return dependencies[name]},exports);
  return {calls,save:exports.saveCompatibleReviewerAttempt as (v:unknown,owner?:string)=>Promise<unknown>};
}
const input=()=>({id:"10000000-0000-0000-0000-000000000010",book:"BOC",questionId:boc.questions[0].id,
  response:{kind:"single_choice",choiceIndex:boc.questions[0].correctAnswer},reviewMode:"reviewer",sessionId:null,isAdaptiveRepeat:false,answeredAt:"2026-11-10T00:00:00Z"});
test("actual prepared server adapter rejects unpublished, anonymous, Free and forged correctness before writes", async()=>{
  for(const options of [{published:false},{authenticated:false},{pro:false}]){const r=serverRuntime(options);await assert.rejects(r.save(input()));assert.equal(r.calls.length,0)}
  const r=serverRuntime();await assert.rejects(r.save({...input(),isCorrect:true}));assert.equal(r.calls.length,0);
});
test("actual prepared server adapter binds owner/book/scoring and metadata to canonical source",async()=>{
  const r=serverRuntime();await r.save(input());assert.equal(r.calls.length,1);assert.equal(r.calls[0].p_is_correct,true);
  assert.equal(r.calls[0].p_book,"BOC");assert.equal(r.calls[0].p_owner,"10000000-0000-0000-0000-000000000001");
  const spoof=serverRuntime();await assert.rejects(spoof.save({...input(),book:"Elsevier"}));assert.equal(spoof.calls.length,0);
  const account=serverRuntime();await assert.rejects(account.save(input(),"another-owner"));assert.equal(account.calls.length,0);
});
test("actual prepared HTTP boundary enforces disabled gate, origin, content type, account and bounded body",async()=>{
  let writes=0;
  function route(enabled=true) {
    const exports:Record<string,unknown>={};
    const code=ts.transpileModule(read("app/api/reviewer/attempt/route.ts"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    new Function("require","exports","process",code)((name:string)=>name==="server-only"?{}:{saveCompatibleReviewerAttempt:async()=>{writes++;return{id:"synthetic"}}},exports,{env:{REVIT_REVIEWER_COMPATIBILITY_ENABLED:enabled?"true":"false"}});
    return exports.POST as (r:Request)=>Promise<Response>;
  }
  const req=(body="{}",headers:Record<string,string>={})=>new Request("https://example.test/api/reviewer/attempt",{method:"POST",headers:{origin:"https://example.test","content-type":"application/json","x-revit-account":"owner",...headers},body});
  assert.equal((await route(false)(req())).status,503);
  assert.equal((await route()(req("{}",{origin:"https://evil.test"}))).status,403);
  assert.equal((await route()(req("{}",{"content-type":"text/plain"}))).status,400);
  assert.equal((await route()(req("{}",{"x-revit-account":""}))).status,400);
  assert.equal((await route()(req(" ".repeat(8193)))).status,413);
  assert.equal((await route()(req("{"))).status,400);assert.equal(writes,0);
  const result=await route()(req());assert.equal(result.status,200);assert.equal(writes,1);assert.match(result.headers.get("cache-control")!,/no-store/);
});
test("actual cloud sender uses new owner-bound HTTP path and restores matching history without legacy RPC",async()=>{
  const q=matching[0],response={kind:"matching" as const,selections:q.matching!.answerKey};
  const attempt:QuestionAttempt={id:"10000000-0000-0000-0000-000000000010",questionId:q.id,subjectId:q.subjectId,subjectName:"source subject",topicId:q.topicId,topicName:"source topic",subtopic:"source",difficulty:"Unspecified",selectedAnswer:reviewerSelectedAnswer(response,q.choices.length),correct:false,attemptNumber:1,reviewMode:"reviewer",sessionId:null,isAdaptiveRepeat:false,timestamp:"2026-11-10T00:00:00Z"};
  let requests=0,rpcs=0;let payload:Record<string,unknown>={};
  const exports:Record<string,unknown>={};
  const dependencies:Record<string,unknown>={"./legal":{},"./avatarValidation":{},"./entitlements":{FREE_ENTITLEMENT},
    "./cloudSyncGate":{isCloudSyncAllowedForQuestion:()=>true,REVIEWER_COMPATIBILITY_ENABLED:true},
    "./matchingAttemptPersistence":{normalizeCloudSelectedAnswer:(_id:string,v:number|null)=>v},
    "./reviewerAttemptCompatibility":{compatibleReviewerBook,reviewerResponseFromLocal,reviewerHistoryAnswer}};
  const code=ts.transpileModule(read("app/lib/cloudService.ts"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const fakeFetch=async(url:string,init:{body:string;headers:Record<string,string>})=>{
    assert.equal(url,"/api/reviewer/attempt");assert.equal(init.headers["x-revit-account"],"owner");requests++;payload=JSON.parse(init.body);
    return {ok:true,json:async()=>({id:attempt.id,user_id:"owner",question_id:q.id,subject_id:q.subjectId,topic_id:q.topicId,selected_answer:null,answer_response:response,is_correct:true,attempt_number:1,review_mode:"reviewer",session_id:null,answered_at:attempt.timestamp})};
  };
  new Function("require","exports","fetch",code)((name:string)=>{assert.ok(Object.hasOwn(dependencies,name),name);return dependencies[name]},exports,fakeFetch);
  const save=exports.saveQuestionAttempt as (c:unknown,a:QuestionAttempt,o?:string)=>Promise<QuestionAttempt>;
  const row=await save({rpc:async()=>{rpcs++;throw Error("Legacy RPC called")}},attempt,"owner");
  assert.equal(requests,1);assert.equal(rpcs,0);assert.equal(row.selectedAnswer,attempt.selectedAnswer);
  assert.deepEqual(payload.response,response);assert.equal(Object.hasOwn(payload,"correct"),false);assert.equal(Object.hasOwn(payload,"subjectId"),false);
  await assert.rejects(save({},attempt));assert.equal(requests,1);
});
