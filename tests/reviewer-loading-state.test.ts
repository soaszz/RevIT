import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const source = readFileSync("app/components/ReviewerLoadingState.tsx", "utf8");
const require = createRequire(process.cwd() + "/package.json");
const compiled = { exports: {} as any };
const code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
new Function("require", "module", "exports", code)((id: string) => id.endsWith(".css")
  ? { default: new Proxy({}, { get: (_target, key) => String(key) }) } : require(id), compiled, compiled.exports);
const Loading = compiled.exports.default;
const render = (props = {}) => renderToStaticMarkup(createElement(Loading, { onRetry() {}, ...props }));

test("loading has compact approved copy, one status and no edition list or fake counts", () => {
  const html = render();
  assert.match(html, /role="status" aria-busy="true"/);
  assert.match(html, /<h2>Preparing your Review Library<\/h2>/);
  assert.match(html, /<p>Getting your subjects and topics ready\.<\/p>/);
  assert.doesNotMatch(html, /Harr|Ciulla|Rodak|Strasinger|BOC|Elsevier|MCQs|questions selected/);
  assert.match(html, /aria-hidden="true" data-layout="standard"/);
  assert.doesNotMatch(html, /<input|<select|<button|tabindex|aria-expanded/);
});

test("NU placeholders preserve collection order without rendering subject cards", () => {
  const html = render({ mtapEnabled: true });
  assert.deepEqual([...html.matchAll(/data-collection="([^"]+)"/g)].map(match => match[1]), ["mtap-1", "mtap-2", "other-majors"]);
  assert.doesNotMatch(html, /data-placeholder="subject"/);
  assert.equal((html.match(/class="shape filter"/g) ?? []).length, 4);
});

test("Standard uses subject-card placeholders instead of NU collections", () => {
  const html = render();
  assert.equal((html.match(/data-placeholder="subject"/g) ?? []).length, 3);
  assert.equal((html.match(/class="shape filter"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /data-collection=/);
  assert.match(html, /data-placeholder="session-setup"/);
});

test("error text and original retry callback survive without loading shapes", () => {
  const onRetry = () => { retries++; }; let retries = 0;
  const html = render({ error: "Original server failure.", onRetry });
  assert.match(html, /role="alert" aria-busy="false"/);
  assert.match(html, /Reviewer library unavailable/);
  assert.match(html, /Original server failure\./);
  assert.match(html, /Retry reviewer library/);
  assert.doesNotMatch(html, /data-layout=|data-collection=|data-placeholder=/);
  const tree = Loading({ error: "Original server failure.", onRetry });
  const button = tree.props.children.find((child: any) => child?.type === "button");
  assert.equal(button.props.onClick, onRetry); button.props.onClick(); assert.equal(retries, 1);
});

test("placeholders are presentation-only, use existing layout and support reduced motion", () => {
  assert.doesNotMatch(source, /fetch\(|createClient|\.rpc\(|useEffect|useState|localStorage|setTimeout|setInterval/);
  assert.match(source, /library\.libraryLayout/); assert.match(source, /library\.sessionSidebar/);
  assert.match(source, /collection\.collectionHeader/);
  const css = readFileSync("app/components/ReviewerLoadingState.module.css", "utf8");
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.preview \{ animation: none;/);
  assert.match(css, /\.state p \{[^}]*color: var\(--muted\)/);
  assert.doesNotMatch(css, /linear-gradient|box-shadow|99px/);
  const app = readFileSync("app/RevITApp.tsx", "utf8");
  assert.match(app, /reviewerPending \? <ReviewerLoadingState mtapEnabled=\{preferences\.mtap_features_enabled\} error=\{premiumContentError\} onRetry=\{\(\) => setReviewerRetry\(\(value\) => value \+ 1\)\}/);
});
