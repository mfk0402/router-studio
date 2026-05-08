import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { assertSensitivePathAllowed } from './sensitiveFileGuard.ts';

test('assertSensitivePathAllowed skips check when no project root', async () => {
  const r = await assertSensitivePathAllowed(null, '.env');
  assert.equal(r.ok, true);
});

test('assertSensitivePathAllowed allows normal paths without policy', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'rs-sens-'));
  const r = await assertSensitivePathAllowed(root, 'src/app.ts');
  assert.equal(r.ok, true);
});

test('assertSensitivePathAllowed blocks .env until policy allows', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'rs-sens-'));
  const blocked = await assertSensitivePathAllowed(root, '.env');
  assert.equal(blocked.ok, false);
  assert.ok(blocked.error?.includes('Sensitive path blocked'));

  await mkdir(path.join(root, '.routerstudio'), { recursive: true });
  await writeFile(
    path.join(root, '.routerstudio', 'policy.json'),
    JSON.stringify({ allowSensitiveReads: true }),
    'utf8',
  );
  const allowed = await assertSensitivePathAllowed(root, '.env');
  assert.equal(allowed.ok, true);
});
