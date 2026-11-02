import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {initialState,serverOpen,serverOpenPlan,undo,act,DomainError} from '../src/domain.js';
import {queueAlarms} from '../src/service.js';
import {Store} from '../src/store.js';
import {Service} from '../src/service.js';
import {createApp} from '../server.js';
import {commandDefinitions,commandRoute,parseKst,parseServerOpenKst,handleServerOpenCommand,handleServerOpenUndoCommand,registerGuildCommands} from '../src/discord.js';

const env={CLAN_TOKEN:'clan-server-open-'.repeat(3),ADMIN_TOKEN:'admin-server-open-'.repeat(3)};

test('HH:mm KST server opening resolves midnight rollover and rejects invalid clock time',()=>{
 const at=Date.parse('2026-11-01T15:05:00Z'); // 00:05 KST on Nov 2
 assert.equal(parseServerOpenKst('23:55',at),'2026-11-01T14:55:00.000Z');
 assert.equal(parseServerOpenKst('00:03',at),'2026-11-01T15:03:00.000Z');
 assert.equal(parseServerOpenKst('2026-11-02 00:03',at),'2026-11-01T15:03:00.000Z');
 assert.throws(()=>parseServerOpenKst('25:99',at),/시간/);
 assert.throws(()=>parseServerOpenKst('2026-02-30 11:00',at),/날짜/);
});
test('preview, idempotency, undo and fixed boss exclusion',()=>{
 const now=Date.parse('2026-11-02T05:00:00Z');
 const opened=parseKst('2026-11-02 13:55');
 const s=initialState();
 const fixed=s.bosses.find(b=>b.fixedKstMinutes.length);
 fixed.time='2026-11-02T11:00:00.000Z';fixed.misses=5;
 const fixedBefore=structuredClone(fixed),before=structuredClone(s);
 const preview=serverOpenPlan(s,opened,now);
 assert.deepEqual(s,before);
 assert.equal(preview.updated.some(b=>b.id===fixed.id),false);
 const first=serverOpen(s,opened,'ci',now);
 assert.equal(first.duplicate,false);
 assert.equal(s.bosses.find(b=>b.id===first.updated[0].id).time,first.updated[0].time);
 assert.deepEqual(fixed,fixedBefore);
 const state=structuredClone(s);
 const duplicate=serverOpen(s,opened,'ci',now);
 assert.equal(duplicate.duplicate,true);
 assert.equal(duplicate.eventId,first.eventId);
 assert.deepEqual(s,state);
 const undone=undo(s,first.eventId,'ci',now+1000);
 assert.equal(undone.restoredBosses,first.updated.length);
 assert.equal(s.bosses[0].time,before.bosses[0].time);
 assert.deepEqual(fixed,fixedBefore);
 assert.ok(s.history.some(e=>e.action==='server-open-undo'));
 assert.throws(()=>undo(s,first.eventId,'ci',now+2000),/이미 되돌린/);
 const reapply=serverOpen(s,opened,'ci',now+3000);
 assert.equal(reapply.duplicate,false);
 assert.notEqual(reapply.eventId,first.eventId);
});

test('server-open preserves pending cut events, supersedes old alarms and restores safe pending alarms',()=>{
 const now=Date.parse('2026-11-02T05:00:00Z'),s=initialState();
 const b=s.bosses.find(b=>b.intervalMinutes);
 const oldTime='2026-11-02T09:00:00.000Z';
 b.time=oldTime;
 const oldAlarm='alarm-'+b.id+'-'+oldTime+'-10';
 s.outbox.push({id:oldAlarm,bossId:b.id,at:new Date(now-1000).toISOString(),time:oldTime,action:'10분 전',attempts:0});
 s.outbox.push({id:17,bossId:b.id,at:new Date(now-1000).toISOString(),action:'cut',attempts:0});
 s.alarmKeys=[oldAlarm];
 const opening=new Date(now-(b.intervalMinutes-10)*60000).toISOString();
 const result=serverOpen(s,opening,'ci',now);
 assert.equal(s.outbox.find(e=>e.id===oldAlarm).sentAt,'superseded');
 assert.equal(s.outbox.find(e=>e.id===17).sentAt,undefined);
 assert.equal(s.alarmKeys.includes(oldAlarm),false);
 queueAlarms(s,now);
 const newAlarm=s.outbox.find(e=>e.id==='alarm-'+b.id+'-'+b.time+'-10');
 assert.ok(newAlarm);
 const restored=undo(s,result.eventId,'ci',now+1000);
 assert.equal(restored.restoredBosses,result.updated.length);
 assert.equal(s.outbox.find(e=>e.id===oldAlarm).sentAt,undefined);
 assert.equal(newAlarm.sentAt,'superseded');
 assert.equal(s.alarmKeys.includes(oldAlarm),true);
 assert.equal(b.time,oldTime);
});

test('undo refuses to overwrite subsequent boss changes and rejects future opening',()=>{
 const now=Date.parse('2026-11-02T05:00:00Z'),s=initialState();
 const opening='2026-11-02T04:55:00.000Z';
 const result=serverOpen(s,opening,'ci',now);
 const b=s.bosses.find(b=>b.intervalMinutes);
 act(s,{id:b.id,action:'schedule',time:'2026-11-03T05:00:00.000Z'},now+1000);
 const snapshot=structuredClone(s);
 assert.throws(()=>undo(s,result.eventId,'ci',now+2000),/후속 보스 변경/);
 assert.deepEqual(s,snapshot);
 assert.throws(()=>serverOpen(s,'2026-11-03T05:00:00.000Z','ci',now),DomainError);
});

test('Discord staging routes and admin-only command definitions include preview and undo',()=>{
 const defs=commandDefinitions();
 const server=defs.find(c=>c.name==='서버오픈'),rollback=defs.find(c=>c.name==='서버오픈취소');
 assert.ok(server);assert.ok(rollback);
 assert.equal(server.default_member_permissions,'8');
 assert.equal(rollback.default_member_permissions,'8');
 assert.equal(server.options.find(o=>o.name==='확인').required,false);
 const env={DISCORD_TEST_MODE:'true',DISCORD_GUILD_ID:'guild',DISCORD_CHANNEL_ID:'channel'};
 assert.equal(commandRoute({commandName:'검증서버오픈',guildId:'guild',channelId:'channel'},env),'서버오픈');
 assert.equal(commandRoute({commandName:'검증서버오픈취소',guildId:'guild',channelId:'channel'},env),'서버오픈취소');
 assert.equal(commandRoute({commandName:'검증서버오픈',guildId:'guild',channelId:'other'},env),null);
});

test('Discord guild command registration uses only the staging names and leaves existing commands intact',async()=>{
 const existing=[{name:'운영전용'}],posted=[];
 const rest={
  post:async(route,{body})=>{assert.equal(route,'/staging');posted.push(body);return {name:body.name,id:'mock-'+posted.length};},
  get:async route=>{assert.equal(route,'/staging');return [...existing,...posted.map(x=>({name:x.name}))];}
 };
 const result=await registerGuildCommands(rest,'/staging',true);
 assert.equal(posted.length,6);
 assert.equal(result.registered.length,6);
 assert.equal(result.actualNames.includes('운영전용'),true);
 assert.ok(posted.every(c=>c.name.startsWith('검증')));
 assert.ok(posted.some(c=>c.name==='검증서버오픈'));
 assert.ok(posted.some(c=>c.name==='검증서버오픈취소'));
});
test('Discord command handlers enforce admin, preview without writes, commit once, and undo',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'boss-discord-server-open-'));
 const store=new Store({url:'',file:path.join(dir,'state.json')});
 try{
  await store.init();const service=new Service(store);
  const now=Date.now(),time=new Date(now-300000+9*3600000).toISOString().slice(11,16);
  let confirmed=false;
  const i={user:{id:'admin'},memberPermissions:{has:()=>false},
   options:{getString:()=>time,getBoolean:()=>confirmed,getInteger:()=>record}};
  await assert.rejects(handleServerOpenCommand(i,service,new Set()),/관리자/);
  const before=await service.read();
  const preview=await handleServerOpenCommand(i,service,new Set(['admin']));
  assert.match(preview,/미리보기/);
  assert.deepEqual(await service.read(),before);
  confirmed=true;
  const committed=await handleServerOpenCommand(i,service,new Set(['admin']));
  assert.match(committed,/적용/);
  const server=createApp(service,env).listen(0,'127.0.0.1');
  try{
   await new Promise(resolve=>server.once('listening',resolve));
   const origin='http://127.0.0.1:'+server.address().port;
   const response=await fetch(origin+'/api/bosses',{headers:{Authorization:'Bearer '+env.CLAN_TOKEN}});
   assert.equal(response.status,200);
   const appBosses=await response.json();
   const shared=await service.read();
   assert.equal(appBosses.find(b=>b.id===shared.bosses[0].id).time,shared.bosses[0].time);
  }finally{await new Promise(resolve=>server.close(resolve));}
  const record=(await service.read()).history.find(e=>e.action==='server-open').id;
  const duplicate=await handleServerOpenCommand(i,service,new Set(['admin']));
  assert.match(duplicate,/이미 적용/);
  await assert.rejects(handleServerOpenUndoCommand(i,service,new Set()),/관리자/);
  const undone=await handleServerOpenUndoCommand(i,service,new Set(['admin']));
  assert.match(undone,/복구 완료/);
 }finally{await store.close();await fs.rm(dir,{recursive:true,force:true});}
});
test('local persistence and shared HTTP app state reflect server-open and safe undo',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'boss-server-open-'));
 const store=new Store({url:'',file:path.join(dir,'state.json')});
 let server;
 try{
  await store.init();
  const service=new Service(store);
  const opened=new Date(Date.now()-300000).toISOString();
  const before=await service.read();
  const preview=await service.previewServerOpen(opened);
  assert.deepEqual(await service.read(),before);
  const applied=await service.serverOpen(opened,'ci');
  assert.equal(applied.updated.length,preview.updated.length);
  const after=await service.read();
  assert.equal(after.bosses.find(b=>b.id===applied.updated[0].id).time,applied.updated[0].time);
  server=createApp(service,env).listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const res=await fetch(origin+'/api/bosses',{headers:{Authorization:'Bearer '+env.CLAN_TOKEN}});
  assert.equal(res.status,200);
  const appBosses=await res.json();
  assert.equal(appBosses.find(b=>b.id===applied.updated[0].id).time,applied.updated[0].time);
  assert.equal((await service.serverOpen(opened,'ci')).duplicate,true);
  const undoResponse=await fetch(origin+'/api/admin/undo',{
   method:'POST',headers:{Authorization:'Bearer '+env.ADMIN_TOKEN,'Content-Type':'application/json'},
   body:JSON.stringify({eventId:applied.eventId})
  });
  assert.equal(undoResponse.status,200);
  assert.equal((await undoResponse.json()).restoredEvent,applied.eventId);
  assert.equal((await service.read()).bosses.find(b=>b.id===applied.updated[0].id).time,before.bosses.find(b=>b.id===applied.updated[0].id).time);
  assert.ok((await store.backups()).length>=2);
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  await store.close();await fs.rm(dir,{recursive:true,force:true});
 }
});
