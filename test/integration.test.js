import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../src/store.js';
import {Service} from '../src/service.js';
import {createApp} from '../server.js';
import {parseKst,commandDefinitions} from '../src/discord.js';
const env={CLAN_TOKEN:'clan-test-'.repeat(4),ADMIN_TOKEN:'admin-test-'.repeat(4)};
test('local persistence, rollback, concurrent updates and pre-change backups',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'boss-test-'));const file=path.join(dir,'state.json');const store=new Store({url:'',file});await store.init();const service=new Service(store);
 try{const future=new Date(Date.now()+3600000).toISOString();await service.action({id:'서드',action:'schedule',time:future});await Promise.all([service.action({id:'서드',action:'miss'}),service.action({id:'서드',action:'miss'})]);assert.equal((await service.read()).bosses[0].misses,2);
 const before=await service.read();await assert.rejects(store.transaction(s=>{s.bosses=[];throw Error('fail');}));assert.deepEqual(await service.read(),before);assert.ok((await store.backups()).length>=3);
 await service.action({id:'서드',action:'schedule',time:new Date(Date.now()-3*3600000).toISOString()});await service.tick();assert.equal((await service.read()).bosses[0].misses,2);
 await store.close();const second=new Store({url:'',file});await second.init();assert.equal((await new Service(second).read()).bosses[0].misses,2);await second.close();
 }finally{await store.close();await fs.rm(dir,{recursive:true,force:true});}
});
test('HTTP auth, old API shape, admin enforcement and invalid restore safety',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'boss-api-'));const store=new Store({url:'',file:path.join(dir,'state.json')});await store.init();const service=new Service(store);const server=createApp(service,env).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 const request=(p,method='GET',body,token=env.CLAN_TOKEN)=>fetch(origin+p,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 try{
 assert.equal((await fetch(origin+'/api/bosses')).status,401);
 assert.equal((await fetch(origin+'/readyz')).status,200);
 const r=await request('/api/bosses');assert.equal(r.status,200);assert.equal((await r.json()).length,31);
 assert.equal((await request('/api/bosses','POST',{name:'서드',time:new Date(Date.now()+3600000).toISOString()})).status,200);
 assert.equal((await request('/api/admin/reset','POST',{confirm:'RESET'})).status,401);
 assert.equal((await request('/api/bosses/boss-01/action','POST',{action:'clear'})).status,400);
 assert.equal((await request('/api/bosses/boss-01/action','POST',{action:'miss',expectedVersion:0})).status,409);
 const backup=await (await request('/api/admin/backup','GET',undefined,env.ADMIN_TOKEN)).json();
 assert.equal((await request('/api/admin/restore','POST',{confirm:'RESTORE',snapshot:{}},env.ADMIN_TOKEN)).status,400);
 assert.equal((await request('/api/admin/reset','POST',{confirm:'RESET'},env.ADMIN_TOKEN)).status,200);
 assert.equal((await request('/api/admin/restore','POST',{confirm:'RESTORE',snapshot:backup},env.ADMIN_TOKEN)).status,200);
 assert.equal((await service.read()).bosses[0].time,backup.bosses[0].time);
 const staticPage=await fetch(origin+'/');assert.ok(staticPage.headers.get('content-security-policy').includes("script-src 'self'"));assert.equal(staticPage.status,200);
 }finally{await new Promise(resolve=>server.close(resolve));await store.close();await fs.rm(dir,{recursive:true,force:true});}
});
test('Render refuses ephemeral storage',()=>assert.throws(()=>new Store({url:'',requireDatabase:true})));
test('Discord KST rejects nonexistent dates; commands serialize',()=>{assert.equal(parseKst('2026-10-28 19:30'),'2026-10-28T10:30:00.000Z');assert.throws(()=>parseKst('2026-02-30 19:30'));assert.throws(()=>parseKst('2026-10-28 25:00'));assert.equal(commandDefinitions().length,4);});
test('PostgreSQL persists across clients, rolls back and serializes competing instances',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const a=new Store({url:process.env.TEST_DATABASE_URL}),b=new Store({url:process.env.TEST_DATABASE_URL});await a.init();await b.init();const sa=new Service(a),sb=new Service(b);
 try{await sa.reset('ci');await sa.action({id:'서드',action:'schedule',time:new Date(Date.now()+3600000).toISOString()});await Promise.all(Array.from({length:10},(_,i)=>(i%2?sa:sb).action({id:'서드',action:'miss'})));assert.equal((await sa.read()).bosses[0].misses,10);const before=await sa.read();await assert.rejects(b.transaction(s=>{s.bosses=[];throw Error('rollback');}));assert.deepEqual(await sa.read(),before);assert.ok((await a.backups()).length>0);}finally{await a.close();await b.close();}
});
