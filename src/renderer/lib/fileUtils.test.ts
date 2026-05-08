import assert from 'node:assert/strict';
import test from 'node:test';
import { extToLanguage } from './fileUtils.ts';

test('extToLanguage maps tsx/jsx to Monaco react language ids', () => {
  assert.equal(extToLanguage('App.tsx'), 'typescriptreact');
  assert.equal(extToLanguage('path/to/Page.jsx'), 'javascriptreact');
  assert.equal(extToLanguage('plain.ts'), 'typescript');
});

test('extToLanguage maps prisma and proto to bundled grammars', () => {
  assert.equal(extToLanguage('schema.prisma'), 'sql');
  assert.equal(extToLanguage('service.proto'), 'cpp');
});
