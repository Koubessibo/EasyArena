// Node.js 18 does not expose `crypto` as a global without --experimental-global-webcrypto.
// This polyfill makes it available before @nestjs/typeorm loads.
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    writable: false,
    configurable: true,
    enumerable: false,
  });
}
