import assert from 'node:assert/strict';
import test from 'node:test';
import { issueMobileToken, verifyMobileToken } from '../src/lib/mobile-token.ts';

test('mobile admin session accepts a signed token and rejects tampering', () => {
  const previous = process.env.MOBILE_ADMIN_AUTH_SECRET;
  process.env.MOBILE_ADMIN_AUTH_SECRET = 'test-secret-with-at-least-thirty-two-characters';
  try {
    const user = { username: 'developer-test', role: 'developer' as const };
    const token = issueMobileToken(user);
    assert.deepEqual(verifyMobileToken(`Bearer ${token}`), user);
    assert.equal(verifyMobileToken(`Bearer ${token.slice(0, -1)}x`), null);
    assert.equal(verifyMobileToken(null), null);
  } finally {
    if (previous === undefined) delete process.env.MOBILE_ADMIN_AUTH_SECRET;
    else process.env.MOBILE_ADMIN_AUTH_SECRET = previous;
  }
});
