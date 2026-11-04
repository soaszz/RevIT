import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import assert from "node:assert/strict";

function load(file: string, overrides: Record<string, unknown> = {}) {
  const exports: Record<string, unknown> = {};
  const native = createRequire(resolve(file));
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  new Function("require", "exports", code)((name: string) => Object.hasOwn(overrides, name) ? overrides[name]
    : name === "server-only" || name.endsWith(".css") ? {} : native(name), exports);
  return exports;
}

export function renderPublicPricing() {
  const getCounts = load("app/lib/server/publicReviewerCounts.ts").getPublicQuestionCounts as () => { free: number; proOnly: number; total: number };
  const Cards = load("app/components/ProPlanCards.tsx").default as ComponentType;
  const Pricing = load("app/pricing/PricingContent.tsx", {
    "../components/ProPlanCards": { __esModule: true, default: Cards },
    "../lib/supabase/client": { createClient: () => { throw new Error("Pricing render must not query Supabase"); } },
  }).default as ComponentType<{ initialUser: null; initialEntitlement: null; questionCounts: ReturnType<typeof getCounts> }>;
  return renderToStaticMarkup(createElement(Pricing, { initialUser: null, initialEntitlement: null, questionCounts: getCounts() }));
}

export function renderPublicPro() {
  const Pro = load("app/pro/page.tsx", {
    "next/image": { __esModule: true, default: () => null },
    "../components/PublicThemeToggle": { __esModule: true, default: () => null },
  }).default as ComponentType;
  return renderToStaticMarkup(createElement(Pro));
}

// Validate the exact authorized notice before excluding it from current-availability checks.
// Unexpected edition names anywhere else still fail the original negative assertions.
export function currentReviewerCopy(markup: string) {
  const notices = [...markup.matchAll(/<aside\b[^>]*data-upcoming-reviewers="true"[^>]*>[\s\S]*?<\/aside>/g)];
  assert.equal(notices.length, 1);
  const notice = notices[0][0];
  assert.match(notice, /aria-label="Upcoming reviewer editions"/);
  assert.doesNotMatch(notice, /<(?:a|img|button|input)\b/);
  const text = notice.replace(/<[^>]*>/g, " ").replace(/&apos;|&#x27;|&#39;/g, "'").replace(/\s+/g, " ").trim();
  assert.equal(text, "More Reviewer Books Coming Soon We're working on adding BOC Study Guide 7th Edition and Elsevier's MLS Examination Review to RevIT Pro. These reviewer editions are not yet available. Their release is subject to final approval, and no availability date has been announced.");
  return markup.replace(notice, "");
}
