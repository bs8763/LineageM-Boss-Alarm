import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {initialState,upgradeCatalog,validateSnapshot,migrateLegacy,undo} from '../src/domain.js';
import {Store} from '../src/store.js';
const T=Date.parse('2026-10-28T00:00:00Z');
function oldState(){const s=initialState();delete s.catalogVersion;
 const replaced=s.bosses.find(b=>b.id==='boss-21');Object.assign(replaced,{name:'베리스',mapNumber:'old-map',intervalMinutes:360,fixedKstMinutes:[],verified:true,time:'2026-10-28T10:00:00.000Z',misses:3,version:7});
 const renamed=s.bosses.find(b=>b.id==='boss-27');Object.assign(renamed,{name:'가스트',time:'2026-10-28T12:00:00.000Z',misses:2,version:4});
 s.outbox=[{id:1,bossId:replaced.id,name:'베리스',at:new Date(T).toISOString()},{id:2,bossId:renamed.id,name:'가스트',at:new Date(T).toISOString()}];
 s.alarmKeys=['alarm-boss-21-old','alarm-boss-27-existing'];s.revision=2;return s;
}
test('catalog upgrade preserves spelling-only schedules and archives a replaced boss without relabeling its schedule',()=>{
 const s=oldState(),old=structuredClone(s);assert.equal(upgradeCatalog(s,T),2);const b=s.bosses[20],c=s.bosses[26];
 assert.equal(b.name,'네크로맨서');assert.equal(b.mapNumber,'18');assert.equal(b.intervalMinutes,null);assert.deepEqual(b.fixedKstMinutes,[]);assert.equal(b.time,null);assert.equal(b.misses,0);assert.equal(b.verified,false);
 assert.equal(c.name,'카스트');assert.equal(c.time,old.bosses[26].time);assert.equal(c.misses,2);assert.equal(c.intervalMinutes,450);assert.equal(c.mapNumber,'46');
 assert.deepEqual(s.history.find(e=>e.bossId===b.id).previousCatalog,old.bosses[20]);assert.ok(!s.outbox.some(e=>e.name==='베리스'||e.name==='가스트'));assert.ok(!s.alarmKeys.some(k=>k.startsWith('alarm-boss-21-')));assert.ok(s.alarmKeys.includes('alarm-boss-27-existing'));
 const upgraded=structuredClone(s);assert.equal(upgradeCatalog(s,T+1000),0);assert.deepEqual(s,upgraded);
});
test('old v2 snapshots are normalized without changing the original file and cannot inject a replaced boss schedule',()=>{
 const old=oldState(),copy=structuredClone(old),clean=validateSnapshot(old);assert.equal(clean.bosses[20].name,'네크로맨서');assert.equal(clean.bosses[20].time,null);assert.equal(clean.bosses[26].name,'카스트');assert.equal(clean.bosses[26].time,old.bosses[26].time);assert.deepEqual(old,copy);
 const wrong=initialState();wrong.bosses[20].name='다른 보스';assert.throws(()=>validateSnapshot(wrong));
});
test('old names in legacy imports and history cannot silently restore a different boss',()=>{
 assert.equal(migrateLegacy([{name:'가스트',time:'2026-10-28T12:00:00Z'}]).bosses[26].time,'2026-10-28T12:00:00.000Z');
 assert.throws(()=>migrateLegacy([{name:'베리스',time:'2026-10-28T12:00:00Z'}]));
 const s=initialState();s.history.push({id:1,bossId:'boss-21',name:'베리스',previous:{time:'2026-10-28T12:00:00Z',misses:1,lastAction:'cut'}});assert.throws(()=>undo(s,1,'admin',T),e=>e.status===409);
});
test('file startup saves the exact pre-correction state before migration and does not repeat the migration on restart',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'boss-catalog-')),file=path.join(dir,'state.json'),before=oldState();await fs.writeFile(file,JSON.stringify(before));let store=new Store({url:'',file});
 try{await store.init();const state=await store.transaction(s=>s);assert.equal(state.bosses[20].name,'네크로맨서');assert.equal(state.bosses[20].time,null);assert.equal(state.bosses[26].time,before.bosses[26].time);const backups=await store.backups();assert.equal(backups.length,1);assert.deepEqual(await store.backupById(backups[0].id),before);await store.close();store=new Store({url:'',file});await store.init();assert.equal((await store.backups()).length,1);assert.deepEqual(await store.transaction(s=>s),state);}finally{await store.close();await fs.rm(dir,{recursive:true,force:true});}
});
