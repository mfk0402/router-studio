import assert from 'node:assert/strict';
import test from 'node:test';
import { buildToolSessionGuide } from './toolPromptGuide.ts';

test('buildToolSessionGuide lists grouped tools and unknown remainder', () => {
  const g = buildToolSessionGuide(['list_dir', 'edit_file', 'unknown_future_tool']);
  assert.match(g, /Tools wired this turn \(3\)/);
  assert.match(g, /\`list_dir\`/);
  assert.match(g, /\`edit_file\`/);
  assert.match(g, /Other.*\`unknown_future_tool\`/);
});

test('buildToolSessionGuide returns empty string for no tools', () => {
  assert.equal(buildToolSessionGuide([]), '');
});
