import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialState,advance,act,configure,reset,restore,validateSnapshot,migrateLegacy,undo,GRACE} from '../src/domain.js';
const T=Date.parse('2026-10-28T00:00:00Z');
function scheduled(){const s=initialState();act(s,{id:'boss-01',action:'schedule',time:new Date(T).toISOString()},T);return s;}
test('31 unique bosses; ambiguous data does not receive an invented interval',()=>{const s=initialState();assert.equal(s.bosses.length,31);assert.equal(new Set(s.bosses.map(b=>b.id)).size,31);assert.equal(s.bosses.find(b=>b.name==='네크로맨서').intervalMinutes,null);assert.throws(()=>act(s,{id:'네크로맨서',action:'cut'},T));});
test('cut uses actual kill time and clears misses; miss uses scheduled spawn',()=>{const s=scheduled();act(s,{id:'서드',action:'miss'},T);assert.equal(s.bosses[0].time,new Date(T+120*60000).toISOString());assert.equal(s.bosses[0].misses,1);act(s,{id:'서드',action:'cut',time:new Date(T+10*60000).toISOString()},T+10*60000);assert.equal(s.bosses[0].time,new Date(T+130*60000).toISOString());assert.equal(s.bosses[0].misses,0);});
test('5-minute boundary, multiple sleep periods, idempotent catch-up',()=>{const s=scheduled();advance(s,T+GRACE-1);assert.equal(s.bosses[0].misses,0);advance(s,T+GRACE);assert.equal(s.bosses[0].misses,1);advance(s,T+GRACE+6*3600000);assert.equal(s.bosses[0].misses,4);const copy=structuredClone(s);advance(s,T+GRACE+6*3600000);assert.deepEqual(s,copy);});
test('fixed KST schedule crosses midnight and catches up a year without drift',()=>{const s=initialState();const t=Date.parse('2026-10-28T20:00:00+09:00');act(s,{id:'바포메트',action:'schedule',time:new Date(t).toISOString()},t);advance(s,t+365*86400000+GRACE);const b=s.bosses.find(b=>b.name==='바포메트');assert.equal(b.misses,731);assert.equal(new Date(Date.parse(b.time)+9*3600000).toISOString().slice(11,16),'14:00');});
test('stale write rejected; future cuts rejected',()=>{const s=scheduled();assert.throws(()=>act(s,{id:'서드',action:'miss',expectedVersion:0},T),e=>e.status===409);assert.throws(()=>act(s,{id:'서드',action:'cut',time:new Date(T+3600000).toISOString()},T));});
test('administrator config validates schedules and duplicates',()=>{const s=initialState();assert.throws(()=>configure(s,'서드',{intervalMinutes:0},'admin'));assert.throws(()=>configure(s,'서드',{intervalMinutes:null,fixedKstMinutes:[10,10]},'admin'));configure(s,'서드',{intervalMinutes:null,fixedKstMinutes:[840,1200],mapNumber:'54',verified:true},'admin');assert.equal(s.bosses[0].verified,true);});
test('backup restore validates all data before mutation; reset and undo preserve history',()=>{const s=scheduled(),backup=structuredClone(s);act(s,{id:'서드',action:'miss'},T);undo(s,2,'admin',T);assert.equal(s.bosses[0].time,backup.bosses[0].time);assert.throws(()=>undo(s,1,'admin',T),e=>e.status===409);reset(s,'admin',T);assert.equal(s.bosses[0].time,null);restore(s,backup,'admin',T);assert.equal(s.bosses[0].time,backup.bosses[0].time);const invalid=structuredClone(backup);invalid.bosses[30].time='invalid';const before=structuredClone(s);assert.throws(()=>restore(s,invalid,'admin',T));assert.deepEqual(s,before);assert.throws(()=>validateSnapshot({...backup,bosses:backup.bosses.slice(1)}));});
test('legacy data migrates known names and refuses to silently discard unknown names',()=>{assert.equal(migrateLegacy([{name:'서드',time:new Date(T).toISOString()}]).bosses[0].time,new Date(T).toISOString());assert.throws(()=>migrateLegacy([{name:'unknown',time:new Date(T).toISOString()}]));});
test('10/5-minute alarms are durable, deduplicated and skip missed cold-start windows',async()=>{const {queueAlarms}=await import('../src/service.js');const s=scheduled();s.outbox=[];queueAlarms(s,T-10*60000);assert.equal(s.outbox.length,1);queueAlarms(s,T-10*60000+1000);assert.equal(s.outbox.length,1);queueAlarms(s,T-5*60000);assert.equal(s.outbox.length,2);queueAlarms(s,T+120000);assert.equal(s.outbox.length,2);queueAlarms(s,T);assert.equal(s.outbox.length,3);});
test('API rejects rollover dates and config patches preserve an unknown interval',()=>{const s=initialState();assert.throws(()=>act(s,{id:'서드',action:'schedule',time:'2026-02-30T00:00:00Z'}));configure(s,'네크로맨서',{mapNumber:'미확정'},'admin');assert.equal(s.bosses.find(b=>b.name==='네크로맨서').intervalMinutes,null);});

test('clan boss reference includes 가스트 and 네크로맨서, not 카스트 or 베리스',()=>{const bosses=initialState().bosses;assert.equal(bosses.length,31);assert.equal(bosses.find(b=>b.name==='가스트')?.mapNumber,'46');assert.equal(bosses.find(b=>b.name==='네크로맨서')?.mapNumber,'18');assert.equal(bosses.find(b=>b.name==='네크로맨서')?.intervalMinutes,null);assert.ok(!bosses.some(b=>['카스트','베리스'].includes(b.name)));});


test('Necromancer is odd-hour notice only and never records cut, miss or scheduled time',()=>{
 const s=initialState();const b=s.bosses.find(x=>x.name==='네크로맨서');
 assert.equal(b.oddHourNoticeOnly,true);
 for(const action of ['cut','miss','schedule'])assert.throws(()=>act(s,{id:b.id,action,time:new Date(T).toISOString()},T),/홀수 시간 안내 전용/);
 b.time=new Date(T).toISOString();advance(s,T+GRACE+60000);
 assert.equal(b.misses,0);assert.equal(b.time,new Date(T).toISOString());
});

test('Necromancer notice-only invariant blocks configured automatic misses and server-open',()=>{const s=initialState();const b=s.bosses.find(x=>x.id==='boss-21');assert.throws(()=>configure(s,b.id,{intervalMinutes:120},'admin'));assert.throws(()=>configure(s,b.id,{fixedKstMinutes:[60]},'admin'));b.intervalMinutes=120;b.time=new Date(T).toISOString();advance(s,T+GRACE+1);assert.equal(b.misses,0);assert.equal(b.lastAction,null);});


test('Necromancer never queues Discord pre-spawn alerts even with legacy scheduled data',async()=>{
 const {queueAlarms}=await import('../src/service.js');
 const s=initialState(),b=s.bosses.find(x=>x.id==='boss-21');
 b.time=new Date(T).toISOString();b.intervalMinutes=120;
 queueAlarms(s,T-10*60000);
 assert.equal(s.outbox.length,0);
 assert.equal(s.alarmKeys.length,0);
});


test('production storage refuses silent local fallback without DATABASE_URL',async()=>{
 const {Store}=await import('../src/store.js');
 assert.throws(()=>new Store({url:'',requireDatabase:true}),/DATABASE_URL/);
 const local=new Store({url:'',requireDatabase:false,file:'data/test-storage-only.json'});
 assert.equal(local.pool,null);
 await local.close();
});

test('scheduler tick triggers at five-minute auto-miss boundary and skips notice-only boss',async()=>{
 const {Service}=await import('../src/service.js');
 const now=Date.now(),due=new Date(now-GRACE).toISOString();
 let reads=0;
 const store={schedule:async()=>[{id:'boss-01',time:due,intervalMinutes:120,fixedKstMinutes:[]},{id:'boss-21',time:due,intervalMinutes:120,fixedKstMinutes:[]} ]};
 const service=new Service(store);
 service.read=async()=>{reads++;};
 await service.tick();
 assert.equal(reads,1);
 store.schedule=async()=>[{id:'boss-21',time:due,intervalMinutes:120,fixedKstMinutes:[]}];
 await service.tick();
 assert.equal(reads,1);
});


test('Discord alarm queue ignores malformed legacy scheduled timestamps',async()=>{
 const {queueAlarms}=await import('../src/service.js');
 const s=initialState(),boss=s.bosses.find(b=>b.id==='boss-01');
 boss.time='invalid-legacy-time';
 queueAlarms(s,T);
 assert.equal(s.outbox.length,0);
 assert.equal(s.alarmKeys.length,0);
});
