import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.js';
import {Service} from '../src/service.js';
import {initialState,act,advance} from '../src/domain.js';
import {createApp} from '../server.js';

function cachedStore(){
 let now=Date.parse('2030-01-01T00:00:00Z'),data=initialState(),queries=0,offline=false;
 const store=new Store({url:'',now:()=>now});
 store.pool={query:async()=>{queries++;if(offline)throw Error('test database down');return {rows:[{data:structuredClone(data)}]};},connect:async()=>{throw Error('test write unavailable');}};
 return {store,now:()=>now,setNow:v=>now=v,get queries(){return queries;},set offline(v){offline=v;},set data(v){data=v;}};
}
test('health checks, cached UI reads and empty scheduler share a bounded cache',async()=>{
 const x=cachedStore(),service=new Service(x.store,{now:x.now});
 await x.store.snapshot();
 for(let i=0;i<120;i++){await service.tick();await x.store.ping();await service.read({cached:true});await x.store.snapshot();}
 assert.equal(x.queries,1);
 const snapshot=await x.store.snapshot();snapshot.bosses=[];assert.equal((await x.store.snapshot()).bosses.length,31);
 x.setNow(x.now()+600000);await Promise.all(Array.from({length:100},()=>x.store.snapshot()));assert.equal(x.queries,2);
 x.offline=true;await assert.rejects(service.action({id:'서드',action:'cut'}));assert.equal((await x.store.snapshot()).history.length,0);
 x.setNow(x.now()+600000);await assert.rejects(x.store.ping());
});
test('a fresh read observes a second writer and cannot replace committed cache with stale refresh',async()=>{
 const x=cachedStore();await x.store.snapshot();const changed=initialState();act(changed,{id:'서드',action:'cut'},x.now());x.data=changed;
 assert.equal((await x.store.snapshot()).revision,0);
 assert.equal((await x.store.snapshot({fresh:true})).revision,1);
 assert.equal((await x.store.snapshot()).revision,1);
});
test('every 31-boss alarm boundary and grace transition is processed once from cached schedules',async()=>{
 let now=Date.parse('2030-01-01T00:00:00Z');let state=initialState();let commits=0;
 for(const [i,b]of state.bosses.entries())b.time=new Date(now+(20+i)*60000).toISOString();
 const store={snapshot:async()=>structuredClone(state),transaction:async fn=>{commits++;const next=structuredClone(state);const result=await fn(next);state=next;return structuredClone(result);}};
 const service=new Service(store,{now:()=>now});
 const start=now;
 for(let seconds=0;seconds<=50*60;seconds+=10){now=start+seconds*1000;await service.tick();await service.tick();}
 const firstTimes=new Map(initialState().bosses.map((b,i)=>[b.id,new Date(start+(20+i)*60000).toISOString()]));
 const initialAlarms=state.alarmKeys.filter(k=>[...firstTimes].some(([id,time])=>k.startsWith(`alarm-${id}-${time}-`)));
 assert.equal(initialAlarms.length,93);assert.equal(new Set(initialAlarms).size,93);
 assert.ok(commits<100);assert.ok(state.history.some(e=>e.action==='auto-miss'));
 const expected=initialState();for(const [i,b]of expected.bosses.entries())b.time=new Date(start+(20+i)*60000).toISOString();advance(expected,now);
 assert.deepEqual(state.bosses,expected.bosses);
});
test('bot readiness reports disconnect without a database query and includes no secrets',async()=>{
 const x=cachedStore();let ready=false;const app=createApp(new Service(x.store),{}, {status:()=>({enabled:true,ready,state:ready?'ready':'retrying',lastError:'ETIMEDOUT'})});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{const url=`http://127.0.0.1:${server.address().port}`;assert.equal((await fetch(url+'/botz')).status,503);ready=true;assert.equal((await fetch(url+'/botz')).status,200);assert.equal((await fetch(url+'/healthz')).status,200);assert.equal(x.queries,0);}finally{await new Promise(r=>server.close(r));}
});
