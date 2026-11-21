import test from 'node:test';
import assert from 'node:assert/strict';
import {queueAlarms} from '../src/service.js';

test('queued Discord alarm for an obsolete spawn is superseded',()=>{
 const old='2026-11-22T10:00:00.000Z';
 const current='2026-11-22T11:00:00.000Z';
 const s={
  bosses:[{id:'boss-1',name:'가스트',time:current,intervalMinutes:60,fixedKstMinutes:[]}],
  outbox:[
   {id:'alarm-boss-1-'+old+'-5',bossId:'boss-1',name:'가스트',action:'5분 전',time:old,at:old,attempts:0},
   {id:'alarm-boss-1-'+current+'-5',bossId:'boss-1',name:'가스트',action:'5분 전',time:current,at:current,attempts:0}
  ],
  alarmKeys:[]
 };
 queueAlarms(s,Date.parse('2026-11-22T09:00:00.000Z'));
 assert.equal(s.outbox[0].sentAt,'superseded');
 assert.equal(s.outbox[1].sentAt,undefined);
});

test('previously delivered alarm remains an audit record after rescheduling',()=>{
 const old='2026-11-22T10:00:00.000Z';
 const s={
  bosses:[{id:'boss-1',name:'가스트',time:'2026-11-22T11:00:00.000Z',intervalMinutes:60,fixedKstMinutes:[]}],
  outbox:[{id:'alarm-boss-1-'+old+'-5',bossId:'boss-1',time:old,at:old,sentAt:'2026-11-22T09:55:00.000Z'}],
  alarmKeys:[]
 };
 queueAlarms(s,Date.parse('2026-11-22T09:00:00.000Z'));
 assert.equal(s.outbox[0].sentAt,'2026-11-22T09:55:00.000Z');
});
