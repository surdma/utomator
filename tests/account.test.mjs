import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRun, profileFromIdentity } from '../src/core/validate.ts';
import { contextForHandle, surdmaContext } from '../src/profile/surdma.ts';

test('LinkedIn/X handles resolve to official HTTPS profiles without URL input', () => {
  assert.equal(validateRun({ platform: 'linkedin', action: 'audit', handle: 'surdma' }).href, 'https://www.linkedin.com/in/surdma/');
  assert.equal(validateRun({ platform: 'x', action: 'audit', handle: '@surdma' }).href, 'https://x.com/surdma');
  assert.equal(profileFromIdentity('x', undefined, 'https://x.com/surdma').href, 'https://x.com/surdma');
});

test('rejects injected handles, cross-account mixes, and invalid X lengths', () => {
  for (const bad of ['surdma/status/2', 'https://evil.test', 'sur dma', 'a'.repeat(16), 'a?yes']) {
    assert.throws(() => validateRun({ platform: 'x', action: 'audit', handle: bad }));
  }
  assert.throws(() => validateRun({ platform: 'linkedin', action: 'audit', handle: 'surdma', profileUrl: 'https://www.linkedin.com/in/other' }));
});

test('credentials are optional but must be supplied together', () => {
  assert.doesNotThrow(() => validateRun({ platform: 'x', action: 'audit', handle: 'surdma' }));
  assert.doesNotThrow(() => validateRun({ platform: 'x', action: 'audit', handle: 'surdma', credentials: { loginId: 'user@example.test', password: 'example-only' } }));
  assert.throws(() => validateRun({ platform: 'x', action: 'audit', handle: 'surdma', credentials: { loginId: 'user@example.test', password: '' } }));
});

test('portfolio knowledge resolves only for surdma and retains caveats', () => {
  assert.equal(contextForHandle('@Surdma'), surdmaContext);
  assert.equal(contextForHandle('different-account'), null);
  assert.equal(surdmaContext.name, 'Sodiq Opeyemi Oladejo');
  assert.equal(surdmaContext.experience.length, 6);
  assert.equal(surdmaContext.projects.length, 14);
  assert.ok(surdmaContext.requiresOwnerConfirmation.some(item => item.includes('MilliHub')));
});
