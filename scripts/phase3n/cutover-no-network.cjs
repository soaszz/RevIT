const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const fonts = process.env.REVIT_BUILD_FONT_FETCH === "true";
const allowed = value => {
  try {
    const url = new URL(typeof value === "string" || value instanceof URL ? value : value?.url);
    return fonts && url.protocol === "https:" && !url.username && !url.password && !url.port
      && ["fonts.googleapis.com", "fonts.gstatic.com"].includes(url.hostname);
  } catch { return false; }
};
const deny = () => { throw new Error("Unmocked network blocked during Phase 3N-K verification."); };
const originalFetch = globalThis.fetch;
globalThis.fetch = (...args) => allowed(args[0]) ? originalFetch(...args) : deny();
for (const api of [http, https]) for (const name of ["request", "get"]) {
  const original = api[name];
  api[name] = (...args) => {
    const input = args[0];
    const url = typeof input === "string" || input instanceof URL ? input : `${input?.protocol ?? "https:"}//${input?.hostname ?? input?.host}${input?.path ?? "/"}`;
    return allowed(url) ? original(...args) : deny();
  };
}
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function(...args) {
  const options = typeof args[0] === "object" ? args[0] : null;
  const host = options?.host ?? (typeof args[1] === "string" ? args[1] : undefined);
  if (host && !["localhost", "127.0.0.1", "::1"].includes(host)
    && !(fonts && ["fonts.googleapis.com", "fonts.gstatic.com"].includes(host))) return deny();
  return originalConnect.apply(this, args);
};
