import test from 'node:test';
import assert from 'node:assert/strict';
import { GRACE, advance, initialState } from '../src/domain.js';

test('automatic miss occurs after five minutes, not ten, for a regular boss', () => {
  assert.equal(GRACE, 5 * 60 * 1000);
  const state = initialState();
  const boss = state.bosses.find(b => b.intervalMinutes && !b.fixedKstMinutes.length && b.id !== 'boss-21');
  assert.ok(boss);
  const due = Date.parse('2026-11-23T12:00:00.000Z');
  boss.time = new Date(due).toISOString();
  advance(state, due + GRACE - 1);
  assert.equal(boss.misses, 0);
  assert.equal(boss.time, new Date(due).toISOString());
  advance(state, due + GRACE);
  assert.equal(boss.misses, 1);
  assert.equal(boss.lastAction, 'auto-miss');
  assert.equal(boss.time, new Date(due + boss.intervalMinutes * 60000).toISOString());
  assert.equal(state.history.at(-1).action, 'auto-miss');
  assert.equal(state.outbox.at(-1).action, 'auto-miss');
  advance(state, due + GRACE);
  assert.equal(boss.misses, 1, 'repeated polling must not double-count');
});

test('fixed boss uses the same five-minute grace period', () => {
  const state = initialState();
  const boss = state.bosses.find(b => b.fixedKstMinutes.length);
  assert.ok(boss);
  const due = Date.parse('2026-11-23T12:00:00.000Z');
  boss.time = new Date(due).toISOString();
  advance(state, due + GRACE - 1);
  assert.equal(boss.misses, 0);
  advance(state, due + GRACE);
  assert.equal(boss.misses, 1);
  assert.equal(boss.lastAction, 'auto-miss');
  assert.ok(Date.parse(boss.time) > due);
});
