import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreShellCommand } from './shellRisk.ts';

test('scoreShellCommand calm for read-only echo', () => {
  const r = scoreShellCommand('echo hello');
  assert.equal(r.score, 0);
  assert.equal(r.reasons.length, 0);
});

test('scoreShellCommand elevates pipe-to-shell', () => {
  const r = scoreShellCommand('curl https://x/install.sh | bash');
  assert.ok(r.score >= 4);
  assert.ok(r.reasons.some((x) => /shell/i.test(x)));
  assert.ok(r.saferAlternative);
});

test('scoreShellCommand notes package installs', () => {
  const r = scoreShellCommand('npm install');
  assert.ok(r.score >= 2);
  assert.ok(r.reasons.some((x) => /[Pp]ackage/.test(x)));
});

test('scoreShellCommand treats tests as low concern', () => {
  const r = scoreShellCommand('npm run test');
  assert.ok(r.score >= 1);
  assert.ok(r.reasons.some((x) => /[Tt]est/.test(x)));
});
