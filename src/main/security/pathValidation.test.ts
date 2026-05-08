import assert from 'node:assert/strict';
import path from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { isWithinRoot, resolveWithinRoot, validatePaths } from './pathValidation.ts';

const sandboxRoot = path.join(tmpdir(), 'router-studio-path-validation-sandbox');

test('resolveWithinRoot accepts nested paths', () => {
  const r = resolveWithinRoot(sandboxRoot, path.join('src', 'foo.ts'));
  assert.notEqual(r, null);
  assert.equal(r!.relativePath, path.join('src', 'foo.ts').replace(/\\/g, '/'));
});

test('resolveWithinRoot rejects traversal', () => {
  assert.equal(resolveWithinRoot(sandboxRoot, `..${path.sep}outside`), null);
});

test('resolveWithinRoot rejects null bytes', () => {
  assert.equal(resolveWithinRoot(sandboxRoot, 'good\0bad'), null);
});

test('resolveWithinRoot allows selecting project root explicitly', () => {
  assert.deepStrictEqual(resolveWithinRoot(sandboxRoot, ''), {
    absPath: path.resolve(sandboxRoot),
    relativePath: '.',
  });
});

test('isWithinRoot matches resolveWithinRoot', () => {
  assert.equal(isWithinRoot(sandboxRoot, 'ok.txt'), true);
  assert.equal(isWithinRoot(sandboxRoot, `..${path.sep}evil`), false);
});

test('validatePaths returns null when all paths stay within root', () => {
  assert.equal(validatePaths(sandboxRoot, ['a', 'b', path.join('sub', 'c.ts')]), null);
});

test('validatePaths returns first invalid index', () => {
  const bad = validatePaths(sandboxRoot, ['a', `..${path.sep}..${path.sep}outside`, 'c']);
  assert.notEqual(bad, null);
  assert.equal(bad!.index, 1);
});
