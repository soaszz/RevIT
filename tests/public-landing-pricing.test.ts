import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {createRequire} from "node:module";
import test from "node:test";
import ts from "typescript";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {getPublicReviewerBooks, PUBLIC_REVIEWERS} from "../app/lib/publicReviewerBooks";
import {QUESTION_BANKS, AI_LIMITS} from "../app/lib/entitlements";
import * as plans from "../app/lib/proPlans";
import { currentReviewerCopy, renderPublicPricing, renderPublicPro } from "./helpers/publicPricing";
function transpiled(file:string, overrides:Record<string,unknown>={}, mode="test") {
 const exports:Record<string,unknown>={};const native=createRequire(resolve(file));
 const code=ts.transpileModule(readFileSync(file,"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function("require","exports","process",code)((name:string)=>Object.hasOwn(overrides,name)?overrides[name]:name==="server-only"?{}:name.endsWith(".css")?{}:native(name),exports,{env:{NODE_ENV:mode}});return exports;
}
const getCounts=transpiled("app/lib/server/publicReviewerCounts.ts").getPublicQuestionCounts as (registry?:Parameters<typeof getPublicReviewerBooks>[0])=>{free:number;proOnly:number;total:number};
test("public edition lists use canonical publication flags, excluding development previews",()=>{
 assert.deepEqual(PUBLIC_REVIEWERS.books.map(b=>b.label),["Harr","Ciulla","Rodak","Strasinger"]);
 assert.deepEqual(PUBLIC_REVIEWERS.freeBooks.map(b=>b.label),["Harr"]);assert.equal(PUBLIC_REVIEWERS.proBooks.length,3);
 const text=JSON.stringify(PUBLIC_REVIEWERS);assert.doesNotMatch(text,/BOC|Elsevier/);
 for(const mode of ["development","production","test"]){const getBooks=transpiled("app/lib/publicReviewerBooks.ts",{"./entitlements":{QUESTION_BANKS}},mode).getPublicReviewerBooks as typeof getPublicReviewerBooks;assert.equal(getBooks().books.length,4);}


});
test("static MCQ totals match source lengths and future publication changes update without hardcoded book totals",()=>{
 assert.deepEqual(getCounts(),{free:1593,proOnly:2848,total:4441});
 const original=structuredClone(QUESTION_BANKS);
 for(const [key,file] of [["harr","reviewer"],["ciulla","ciulla"],["rodak","rodak"],["strasinger","strasinger"]] as const){const registry=Object.fromEntries(Object.entries(QUESTION_BANKS).map(([id,book])=>[id,{...book,published:id===key}]));assert.equal(getCounts(registry).total,JSON.parse(readFileSync(`app/content/${file}Content.json`,"utf8")).questions.length);}
 assert.deepEqual(QUESTION_BANKS,original);
 assert.doesNotMatch(readFileSync("app/lib/publicReviewerBooks.ts","utf8"),/\.json|fetch\(|supabase/);
 assert.match(readFileSync("app/lib/server/publicReviewerCounts.ts","utf8"),/^import "server-only"/);
});
test("landing and pricing render the same three cards with upfront prices, correct savings and public-only counts",()=>{
 const Card=transpiled("app/components/ProPlanCards.tsx",{"../lib/proPlans":plans,"../lib/publicReviewerBooks":{PUBLIC_REVIEWERS},"../lib/entitlements":{AI_LIMITS}}).default as React.ComponentType;
 const html=renderToStaticMarkup(React.createElement(Card));assert.equal((html.match(/<article/g)||[]).length,3);
 for(const value of ["₱79","₱219","₱399","₱79.00 per month equivalent","₱73.00 per month equivalent","₱66.50 per month equivalent","Save ₱18","Save ₱75","Best Value"])assert.ok(html.includes(value),value);
 assert.equal((html.match(/One upfront payment/g)||[]).length,3);assert.doesNotMatch(html,/BOC|Elsevier/);
 for(const path of ["app/auth/page.tsx","app/pricing/PricingContent.tsx"]){const text=readFileSync(path,"utf8");assert.match(text,/<ProPlanCards/);assert.match(text,/PUBLIC_REVIEWERS/);assert.doesNotMatch(text,/1,593|2,848|4,441/);}
 for(const path of ["app/pro/page.tsx","app/components/PlanAnnouncementModal.tsx","app/components/Onboarding.tsx"])assert.match(readFileSync(path,"utf8"),/PUBLIC_REVIEWERS\.proNames/);
});
test("Welcome to Pro lists only the unchanged four-book release registry",()=>{
 const Modal=transpiled("app/components/ProActivationModal.tsx",{"../lib/publicReviewerBooks":{PUBLIC_REVIEWERS},"next/image":{__esModule:true,default:()=>null}}).default as React.ComponentType<{isOpen:boolean;onClose:()=>void}>;
 const html=renderToStaticMarkup(React.createElement(Modal,{isOpen:true,onClose:()=>{}}));
 for(const name of ["Harr","Ciulla","Rodak","Strasinger"])assert.ok(html.includes(name));
 assert.doesNotMatch(html,/BOC|Elsevier/);
});

test("Pricing and Pro distinguish upcoming editions without adding them to current access or totals",()=>{
 for(const markup of [renderPublicPricing(),renderPublicPro()]) {
  const current=currentReviewerCopy(markup);
  assert.doesNotMatch(current,/BOC|Elsevier/);
  for(const name of ["Harr","Ciulla","Rodak","Strasinger"]) assert.ok(current.includes(name));
 }
 assert.deepEqual(getCounts(),{free:1593,proOnly:2848,total:4441});
 assert.deepEqual(PUBLIC_REVIEWERS.books.map(book=>book.label),["Harr","Ciulla","Rodak","Strasinger"]);
 assert.doesNotMatch(JSON.stringify(PUBLIC_REVIEWERS),/BOC|Elsevier/);
 const config=readFileSync("next.config.ts","utf8");
 assert.match(config,/source: "\/pro",\s+destination: "\/pricing"/);
});
