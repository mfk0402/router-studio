import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLastMarker } from './agentLoop.ts';

test('parseLastMarker picks final marker among multiple mentions', () => {
  const text =
    'You can cite [[TASK_COMPLETE]] in prose, then actually finish:\nDone.\n\n[[CONTINUE]]';
  const out = parseLastMarker(text);
  assert.equal(out.kind, 'continue');
});

test('parseLastMarker parses BLOCKED with reason', () => {
  const out = parseLastMarker('Stopping now [[BLOCKED: need API credentials]] ');
  assert.equal(out.kind, 'blocked');
  assert.equal(out.reason, 'need API credentials');
});

test('parseLastMarker unknown when missing', () => {
  assert.equal(parseLastMarker('no marker').kind, 'unknown');
});
