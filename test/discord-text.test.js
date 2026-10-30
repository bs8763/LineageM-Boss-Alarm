import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../src/store.js';
import {Service} from '../src/service.js';
import {handleBossMessage,parseBossMessage,nextKstReservation} from '../src/discord-text.js';
const env={DISCORD_TEXT_COMMANDS:'true',DISCORD_TEST_MODE:'true',DISCORD_GUILD_ID:'guild',DISCORD_TEXT_CHANNEL_ID:'test'};
function message(content,id='1564906069317255209',patch={}){const replies=[];return {content,id,guildId:'guild',channelId:'test',channel:{},createdTimestamp:Date.now(),author:{id:'member',bot:false},member:{permissionsIn:()=>({has:()=>true}),roles:{cache:new Map()}},replies,reply:async r=>replies.push(r),...patch};}
async function fixture(fn){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'boss-chat-'));const file=path.join(dir,'state.json');const store=new Store({url:'',file});await store.init();try{await fn(new Service(store),store,file);}finally{await store.close();await fs.rm(dir,{recursive:true,force:true});}}
test('text parser requires boss name then space then cut or miss',()=>{
 for(const name of ['서드','데스','감시자 데몬']){assert.deepEqual(parseBossMessage(`${name} 컷`),{name,action:'cut'});assert.deepEqual(parseBossMessage(`${name} 멍`),{name,action:'miss'});}
 for(const text of ['컷 서드','서드컷','서드 컷 추가','서드\n컷','서드 초기화','안녕하세요'])assert.equal(parseBossMessage(text),null);
});
test('chat cut and miss persist; duplicate concurrent deliveries and restart cannot double miss',()=>fixture(async(service,store,file)=>{
 const cut=message('서드 컷');await handleBossMessage(cut,service,env);const at=(await service.read()).bosses[0].time;assert.equal(Date.parse(at)-cut.createdTimestamp,120*60000);
 const miss=message('서드 멍','1564906069317255210');await Promise.all([handleBossMessage(miss,service,env),handleBossMessage(miss,service,env)]);let state=await service.read();assert.equal(state.bosses[0].misses,1);assert.equal(Date.parse(state.bosses[0].time)-Date.parse(at),120*60000);assert.equal(state.history.filter(e=>e.action==='miss').length,1);assert.deepEqual(cut.replies[0].allowedMentions,{parse:[],repliedUser:false});
 await store.close();const next=new Store({url:'',file});await next.init();try{await handleBossMessage(miss,new Service(next),env);assert.equal((await new Service(next).read()).bosses[0].misses,1);}finally{await next.close();}
}));
test('wrong boss, unauthorized roles and users, stale messages and unregistered miss do not mutate data',()=>fixture(async(service)=>{
 const before=await service.read();
 for(const m of [message('오타보스 컷'),message('서드 멍'),message('서드 컷',undefined,{member:null}),message('서드 컷',undefined,{createdTimestamp:Date.now()-100000})])await handleBossMessage(m,service,env);
 await handleBossMessage(message('서드 컷',undefined,{member:{permissionsIn:()=>({has:()=>false})}}),service,env);
 await handleBossMessage(message('서드 컷',undefined,{member:{permissionsIn:()=>({has:p=>Array.isArray(p)}),roles:{cache:new Map()}}}),service,{...env,DISCORD_COMMAND_ROLE_ID:'required'});
 assert.deepEqual(await service.read(),before);
}));
test('ordinary chat, bots, webhooks, DMs and other channels never call the store',async()=>{
 const service={messageAction:()=>{throw Error('must not touch database');}};
 for(const m of [message('안녕하세요'),message('서드 컷',undefined,{author:{bot:true}}),message('서드 컷',undefined,{webhookId:'webhook'}),message('서드 컷',undefined,{guildId:null}),message('서드 컷',undefined,{channelId:'production'})]){await handleBossMessage(m,service,env);assert.equal(m.replies.length,0);}
 await handleBossMessage(message('서드 컷'),service,{...env,DISCORD_TEXT_COMMANDS:'false'});
});
test('reply failures after a commit cannot duplicate a stored action',()=>fixture(async(service)=>{
 const m=message('데스 컷',undefined,{reply:async()=>{throw Error('network');}});await handleBossMessage(m,service,env);await handleBossMessage(m,service,env);const s=await service.read();assert.equal(s.history.filter(e=>e.name==='데스'&&e.action==='cut').length,1);
}));

test('private thread commands use SendMessagesInThreads permission',()=>fixture(async(service)=>{
 const {PermissionFlagsBits:P}=await import('discord.js');
 const m=message('서드 컷',undefined,{channel:{isThread:()=>true},member:{permissionsIn:()=>({has:flags=>Array.isArray(flags)&&flags.includes(P.ViewChannel)&&flags.includes(P.SendMessagesInThreads)})}});
 await handleBossMessage(m,service,env);assert.equal((await service.read()).bosses[0].lastAction,'cut');
}));

test('reservation parser and Korean midnight rollover',()=>{
 assert.deepEqual(parseBossMessage('예약 빨샤 0000'),{name:'빨샤',action:'schedule',hhmm:'0000'});
 assert.equal(nextKstReservation('0000',Date.parse('2026-10-30T04:00:00Z')),'2026-10-30T15:00:00.000Z');
 assert.equal(nextKstReservation('1330',Date.parse('2026-10-30T04:00:00Z')),'2026-10-30T04:30:00.000Z');
 assert.equal(nextKstReservation('1330',Date.parse('2026-10-30T05:00:00Z')),'2026-10-31T04:30:00.000Z');
 assert.throws(()=>nextKstReservation('2460'));
});
test('reservation updates a real boss and duplicate message is idempotent',()=>fixture(async(service)=>{
 const m=message('예약 서드 0000');
 await handleBossMessage(m,service,env);
 await handleBossMessage(m,service,env);
 const s=await service.read();
 const boss=s.bosses.find(b=>b.name==='서드');
 assert.ok(boss.time);
 assert.equal(new Date(Date.parse(boss.time)+9*3600000).getUTCHours(),0);
 assert.equal(s.history.filter(e=>e.name==='서드'&&e.action==='schedule').length,1);
 assert.match(m.replies[0].content,/예약 완료/);
}));
