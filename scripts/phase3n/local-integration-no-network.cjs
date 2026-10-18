const deny = () => { throw new Error('External network disabled for Phase 3N-J local verification.'); };
const net = require('node:net');
const original = net.Socket.prototype.connect;
net.Socket.prototype.connect = function(...args) {
  const options = typeof args[0] === 'object' ? args[0] : null;
  const host = options?.host ?? (typeof args[1] === 'string' ? args[1] : undefined);
  if (host && !['localhost', '127.0.0.1', '::1'].includes(host)) return deny();
  return original.apply(this, args);
};
for (const name of ['node:http', 'node:https']) { const api = require(name); api.request = deny; api.get = deny; }
globalThis.fetch = deny;
