import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits } from 'discord.js';
import { commandDefinitions, handleServerOpenCommand, parseServerOpenKst } from '../src/discord.js';

test('server opening HHMM uses the current Korean calendar date including UTC day boundary', () => {
  const now = Date.parse('2026-11-23T16:30:00.000Z'); // 2026-11-24 01:30 KST
  assert.equal(parseServerOpenKst('1501', now), '2026-11-24T06:01:00.000Z');
  assert.equal(parseServerOpenKst('1600', now), '2026-11-24T07:00:00.000Z');
  assert.equal(parseServerOpenKst('0000', now), '2026-11-23T15:00:00.000Z');
  for (const invalid of ['2400', '2360', 'abcd', '25:00']) {
    assert.throws(() => parseServerOpenKst(invalid, now));
  }
});

test('server opening slash command requires only a time string, not true/false', () => {
  const command = commandDefinitions().find(c => c.name === '서버오픈');
  assert.ok(command);
  assert.equal(command.options.length, 1);
  assert.equal(command.options[0].name, '시간');
  assert.equal(command.options[0].required, true);
});

test('server opening rejects non-admin without calling the service', async () => {
  let calls = 0;
  const service = { serverOpen: async () => { calls++; return { duplicate: false, updated: [], eventId: 1 }; } };
  const interaction = {
    user: { id: 'member' },
    memberPermissions: { has: () => false },
    options: { getString: () => '1600' }
  };
  await assert.rejects(handleServerOpenCommand(interaction, service, new Set()), /관리자/);
  assert.equal(calls, 0);
});

test('server opening authorized admin sends one parsed timestamp to service', async () => {
  let calls = 0;
  const service = { serverOpen: async (time, actor) => {
    calls++;
    assert.match(time, /^\d{4}-\d{2}-\d{2}T07:00:00\.000Z$/);
    assert.equal(actor, 'discord:admin');
    return { duplicate: false, updated: [{ id: 'boss-1' }], eventId: 123 };
  } };
  const interaction = {
    user: { id: 'admin' },
    memberPermissions: { has: flag => flag === PermissionFlagsBits.Administrator },
    options: { getString: () => '1600' }
  };
  const message = await handleServerOpenCommand(interaction, service, new Set());
  assert.match(message, /일반 보스 1종/);
  assert.equal(calls, 1);
});
