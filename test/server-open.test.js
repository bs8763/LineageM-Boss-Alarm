import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,serverOpen,DomainError} from '../src/domain.js';
const opening='2026-11-02T05:00:00.000Z';
test('server open recalculates interval bosses and preserves fixed boss schedules and history',()=>{
 const s=initialState();const fixed=s.bosses.find(b=>b.fixedKstMinutes.length);fixed.time='2026-11-02T11:00:00.000Z';fixed.misses=2;
 const interval=s.bosses.find(b=>b.intervalMinutes);interval.time='2026-11-02T01:00:00.000Z';interval.misses=3;
 const before=structuredClone(fixed);s.history.push({id:999,action:'cut'});
 const result=serverOpen(s,opening,'test',Date.parse(opening)+1000);
 assert.equal(interval.time,new Date(Date.parse(opening)+interval.intervalMinutes*60000).toISOString());
 assert.equal(interval.misses,3);assert.deepEqual(fixed,before);
 assert.equal(result.updated.some(b=>b.id===fixed.id),false);
 assert.equal(s.history.some(e=>e.id===999),true);
 assert.equal(s.history.at(-1).action,'server-open');
});
test('reject future server opening time without mutation',()=>{
 const s=initialState(),before=structuredClone(s);
 assert.throws(()=>serverOpen(s,'2026-11-03T00:00:00.000Z','test',Date.parse(opening)),DomainError);
 assert.deepEqual(s,before);
});
test('exclude bosses with no known interval',()=>{
 const s=initialState(),unknown=s.bosses.find(b=>!b.intervalMinutes&&!b.fixedKstMinutes.length);
 const before=structuredClone(unknown);
 serverOpen(s,opening,'test',Date.parse(opening));assert.deepEqual(unknown,before);
});
