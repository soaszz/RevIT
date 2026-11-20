import ts from "typescript";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import { getQuestionBankSummary } from "../app/lib/questionBankSummary";
import { FREE_ENTITLEMENT, isQuestionBankPublished, canAccessQuestionBank, isProActive } from "../app/lib/entitlements";
import{subjects,topics,questions}from'../app/content/reviewerContent';import{getUnifiedSubjects}from'../app/lib/reviewerLibrary';import*as c from'../app/content/ciullaMetadata';import*as r from'../app/content/rodakMetadata';import*as s from'../app/content/strasingerMetadata';import*as e from'../app/content/elsevierMetadata';import*as b from'../app/content/bocMetadata';

const sources=[{book:'Harr',subjects,topics,counts:questions.reduce((a,q)=>(a[q.topicId]=(a[q.topicId]??0)+1,a),{}as Record<string,number>)},{book:'Ciulla',subjects:c.ciullaPreviewSubjects,topics:c.ciullaPreviewTopics,counts:c.ciullaTopicQuestionCounts},{book:'Rodak',subjects:r.rodakPreviewSubjects,topics:r.rodakPreviewTopics,counts:r.rodakTopicQuestionCounts},{book:'Strasinger',subjects:s.strasingerPreviewSubjects,topics:s.strasingerPreviewTopics,counts:s.strasingerTopicQuestionCounts},{book:'Elsevier',subjects:e.elsevierPreviewSubjects,topics:e.elsevierPreviewTopics,counts:e.elsevierTopicQuestionCounts},{book:'BOC',subjects:b.bocPreviewSubjects,topics:b.bocPreviewTopics,counts:b.bocTopicQuestionCounts}];const allTopics=sources.flatMap(x=>x.topics),allSubjects=sources.flatMap(x=>x.subjects);const rows=getUnifiedSubjects('all',allSubjects,allTopics);
const allCounts:Record<string,number>=Object.assign({},...sources.map(source=>source.counts));

const pro={...FREE_ENTITLEMENT,storedPlan:"pro" as const,effectivePlan:"pro" as const};
const summary=()=>getQuestionBankSummary(rows,allTopics,allCounts);
const expected=()=>4516+(isQuestionBankPublished("BOC")?2469:0)+(isQuestionBankPublished("Elsevier")?830:0);
test("Guest/Offline, Free, Pro and expired Pro see the same published catalog without granting access",()=>{const baseline=summary();for(const [mode,entitlement]of[["Guest",FREE_ENTITLEMENT],["Offline",FREE_ENTITLEMENT],["Free",FREE_ENTITLEMENT],["Pro",pro],["expired",{...pro,effectivePlan:"free"}]]as const){assert.deepEqual(summary(),baseline,mode);assert.equal(baseline.total,expected());assert.equal(canAccessQuestionBank("Ciulla",entitlement),mode==="Pro");}assert.equal(baseline.rows.find(row=>row.subject.id==="clinical-chemistry")!.questionCount>570,true);});
test("all-six published metadata totals7815 with identical complete rows for every account mode",()=>{const old=process.env.NODE_ENV;try{Reflect.set(process.env,"NODE_ENV","development");const baseline=summary();assert.equal(baseline.total,7815);for(const mode of["Guest","Offline","Free","Pro","expired"]){const result=summary();assert.deepEqual(result,baseline,mode);for(const id of["boc-microbiology","elsevier-mycology-virology-parasitology","elsevier-mock-examination"])assert.ok(result.rows.find(row=>row.subject.id===id)!.questionCount>0);assert.deepEqual(new Set(result.rows.flatMap(row=>row.books)),new Set(["Harr","Ciulla","Rodak","Strasinger","Elsevier","BOC"]));}for(const book of["BOC","Elsevier"]as const){assert.equal(canAccessQuestionBank(book,FREE_ENTITLEMENT),false);assert.equal(canAccessQuestionBank(book,pro),true);}}finally{if(old===undefined)Reflect.deleteProperty(process.env,"NODE_ENV");else Reflect.set(process.env,"NODE_ENV",old);}});
test("activation, expiration and unresolved account status cannot alter public catalog results",()=>{const baseline=summary();for(const state of["loading","error","free","pro","expired"]){assert.deepEqual(summary(),baseline,state);}assert.equal(canAccessQuestionBank("BOC",{...pro,effectivePlan:"free"}),false);});
test("header deduplicates topics independently of overlapping subject rows",()=>{const baseline=summary();const result=getQuestionBankSummary([...rows,{...rows[0],id:"overlap-for-test"}],[...allTopics,...allTopics],allCounts);assert.equal(result.total,baseline.total);assert.ok(result.rows.reduce((sum,row)=>sum+row.questionCount,0)>result.total);});
test("zero topics contribute no fabricated rows or source labels",()=>{const zero=Object.fromEntries(Object.keys(allCounts).map(id=>[id,0]));assert.deepEqual(getQuestionBankSummary(rows,allTopics,zero),{total:0,rows:[]});});
test("all canonical group identities, ordering, topic IDs and metadata remain unchanged",()=>{const before=JSON.stringify({rows,allTopics,allCounts});const result=summary();assert.equal(JSON.stringify({rows,allTopics,allCounts}),before);assert.deepEqual(result.rows.map(row=>row.subject.id),rows.filter(row=>result.rows.some(r=>r.subject.id===row.id)).map(row=>row.id));});
test("unpublished books are excluded even from supplied metadata",()=>{const published=new Set(allTopics.filter(topic=>isQuestionBankPublished(topic.book??"Harr")).map(topic=>topic.id));const result=summary();for(const row of result.rows)for(const book of row.books)assert.equal(isQuestionBankPublished(book),true);assert.equal(result.total,[...published].reduce((sum,id)=>sum+(allCounts[id]??0),0));});

test("Overview catalog memo is independent of account readiness and loaded private banks; verified badge is separate",()=>{const app=readFileSync("app/RevITApp.tsx","utf8");const block=app.slice(app.indexOf("  const questionBankSummary = useMemo"),app.indexOf("  const progressAttempts = useMemo"));assert.doesNotMatch(block,/\b(entitlement|accessReady|proActive|allAvailableSubjects|allAvailableTopics|questions)\b/);for(const name of["freeSubjects","ciullaPreviewSubjects","rodakPreviewSubjects","strasingerPreviewSubjects","elsevierPreviewSubjects","bocPreviewSubjects"])assert.ok(block.includes(name),name);assert.match(app,/accessReady && <span className=\{summaryHeaderStyles.free\}/);assert.match(app,/\{proActive \? "PRO" : "FREE"\}/);assert.match(app,/questionBankSummary.rows.map/);});

// Render the real header and its existing identity/readiness expressions, rather than duplicating badge logic.
function renderedHeader(status: string, owner: string, entitlement = FREE_ENTITLEMENT, accessOwner = "account-a") {
  const source = readFileSync("app/RevITApp.tsx", "utf8");
  const ast = ts.createSourceFile("app.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const expressions: Record<string, string> = {};
  let header = "";
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ["accessReady", "proActive"].includes(node.name.getText(ast))) expressions[node.name.getText(ast)] = node.initializer!.getText(ast);
    if (ts.isJsxElement(node) && node.openingElement.getText(ast).includes("source-summary-header")) header = node.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(header && expressions.accessReady && expressions.proActive);
  const runtime = createRequire(process.cwd() + "/package.json");
  const compiled = ts.transpileModule("module.exports = (startupAccess, accessOwner, entitlement, questionBankSummary, summaryHeaderStyles, isProActive) => { const accessReady = " + expressions.accessReady + "; const proActive = " + expressions.proActive + "; return (" + header + "); };", { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
  const fixture = { exports: undefined as unknown };
  new Function("require", "module", "exports", compiled)(runtime, fixture, {});
  const render = fixture.exports as (...args: unknown[]) => unknown;
  return runtime("react-dom/server").renderToStaticMarkup(render({ status, owner }, accessOwner, entitlement, { total: 7815 }, { header: "qbHeader", free: "qbBadge" }, isProActive)) as string;
}
for (const [name, entitlement] of [["Active Pro", pro], ["Free", FREE_ENTITLEMENT], ["expired Pro", { ...pro, effectivePlan: "free" as const }], ["Guest/Offline", FREE_ENTITLEMENT]] as const) {
  test(name + " renders the existing effective plan without changing catalog total", () => {
    const html = renderedHeader("ready", "account-a", entitlement);
    assert.match(html, name === "Active Pro" ? />PRO<\/span>/ : />FREE<\/span>/);
    assert.match(html, /7,815 QUESTIONS/);
    assert.match(html, /Question Bank/);
  });
}
test("unresolved and stale owners never render an unverified badge", () => {
  for (const status of ["loading", "error"]) for (const entitlement of [FREE_ENTITLEMENT, pro]) assert.doesNotMatch(renderedHeader(status, "account-a", entitlement), /class="qbBadge"/);
  assert.doesNotMatch(renderedHeader("ready", "account-b", pro), /class="qbBadge"/);
  assert.doesNotMatch(renderedHeader("loading", "account-a", pro), />FREE<|>PRO</);
  assert.match(renderedHeader("ready", "account-a", pro), />PRO</);
});
