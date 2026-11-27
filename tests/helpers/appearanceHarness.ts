import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as registry from "../../app/lib/colorThemes";
export function environment(saved: Record<string,string> = {}, dark = false, unavailable = false, writesBlocked = false, nodeEnv = "production") {
  const values = new Map(Object.entries(saved)), listeners = new Map<string, Set<(event?: unknown) => void>>();
  const root = { dataset: {} as Record<string,string>, style: {} as Record<string,string> };
  const media = { matches: dark, addEventListener: (_: string, fn: () => void) => { listeners.set("media", new Set([fn])); }, removeEventListener: () => listeners.delete("media") };
  const storage = { getItem(key: string) { if(unavailable)throw Error("blocked");return values.get(key)??null; }, setItem(key: string,value: string) {if(unavailable || writesBlocked)throw Error("blocked");values.set(key,value);} };
  const window = { location: { hostname: "127.0.0.1" }, addEventListener: (key: string, fn: (event?: unknown) => void) => { if(!listeners.has(key))listeners.set(key,new Set());listeners.get(key)!.add(fn); }, removeEventListener: (key: string, fn: (event?: unknown) => void) => listeners.get(key)?.delete(fn), dispatchEvent: (event: {type: string}) => {listeners.get(event.type)?.forEach(fn=>fn(event));} };
  const module = { exports: {} as Record<string, (...args: never[]) => unknown> };
  const context = { process: { env: { NODE_ENV: nodeEnv } }, module, exports: module.exports, require: (name: string) => { assert.equal(name,"./colorThemes"); return registry; }, document: { documentElement: root }, localStorage: storage, matchMedia: () => media, window, Event: class { constructor(public type: string){} } };
  runInNewContext(ts.transpileModule(readFileSync("app/lib/appearance.ts","utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
  const api = module.exports as unknown as typeof import("../../app/lib/appearance");
  runInNewContext(api.APPEARANCE_SCRIPT,context);
  return {root,values,storage,window,listeners,api,system(dark: boolean){media.matches=dark;listeners.get("media")?.forEach(fn=>fn());}};
}
