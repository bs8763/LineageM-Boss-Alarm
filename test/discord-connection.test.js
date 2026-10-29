import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {Events} from 'discord.js';
import {connectDiscord} from '../src/discord-connection.js';

function setup(login){
 let now=0;const timers=new Map();let id=0;
 const client=new EventEmitter();client.connected=false;client.calls=0;client.destroyed=0;
 client.isReady=()=>client.connected;
 client.destroy=()=>{client.connected=false;client.destroyed++;};
 client.login=async()=>{client.calls++;return login(client);};
 const logs=[];
 const connection=connectDiscord(client,'test-only-not-a-real-token',{now:()=>now,random:()=>0.5,setTimer:(fn,delay)=>{timers.set(++id,{fn,at:now+delay});return id;},clearTimer:i=>timers.delete(i),log:s=>logs.push(s)});
 async function flush(){for(let i=0;i<10;i++)await Promise.resolve();}
 async function advance(ms){const end=now+ms;await flush();while(true){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].fn();await flush();}now=end;await flush();}
 return {client,connection,timers,logs,advance,flush};
}
test('transient initial login retries then reaches ready; status never exposes credentials',async()=>{
 const x=setup(c=>{if(c.calls<3)throw Object.assign(Error('secret payload'),{code:'ECONNRESET'});c.connected=true;c.emit(Events.ClientReady);});await x.flush();
 assert.equal(x.connection.status().state,'retrying');await x.advance(999);assert.equal(x.client.calls,1);await x.advance(1);assert.equal(x.client.calls,2);await x.advance(2000);
 assert.equal(x.client.calls,3);assert.equal(x.connection.status().ready,true);assert.equal(x.timers.size,0);assert.ok(!JSON.stringify([x.logs,x.connection.status()]).includes('secret payload'));x.connection.stop();
});
test('invalid token and disallowed intents block noisy retry loops',async()=>{
 for(const code of ['TokenInvalid',4004,4014]){const x=setup(()=>{throw Object.assign(Error('private-token'),{code});});await x.flush();await x.advance(600000);assert.equal(x.client.calls,1);assert.equal(x.connection.status().state,'blocked');assert.equal(x.timers.size,0);x.connection.stop();}
});
test('gateway resume uses library reconnect without duplicate login; stale disconnect retries',async()=>{
 const x=setup(c=>{c.connected=true;c.emit(Events.ClientReady);});await x.flush();x.client.connected=false;x.client.emit(Events.ShardReconnecting);await x.advance(30000);
 x.client.connected=true;x.client.emit(Events.ShardResume);assert.equal(x.client.calls,1);assert.equal(x.connection.status().state,'ready');assert.equal(x.timers.size,0);
 x.client.connected=false;x.client.emit(Events.ShardDisconnect,{code:1006});await x.advance(181000);assert.equal(x.client.calls,2);assert.equal(x.connection.status().ready,true);x.connection.stop();
});
test('login timeout recovers and shutdown cancels outstanding retries',async()=>{
 const x=setup(c=>c.calls===1?new Promise(()=>{}):(c.connected=true,c.emit(Events.ClientReady)));await x.advance(61000);assert.equal(x.client.calls,2);assert.equal(x.connection.status().ready,true);x.connection.stop();assert.equal(x.timers.size,0);
 const y=setup(()=>{throw Error('network');});await y.flush();y.connection.stop();await y.advance(3600000);assert.equal(y.client.calls,1);assert.equal(y.connection.status().state,'stopped');assert.equal(y.timers.size,0);
});
