import {advance,act,configure,reset,restore,migrateLegacy,undo,DomainError} from './domain.js';
export class Service {
 constructor(store,{now=Date.now}={}){this.store=store;this.now=now;}
 async tick(){await this.read({cached:true});}
 async read({cached=false}={}){
  const state=await this.store.snapshot({fresh:!cached}),now=this.now();
  if(!needsAdvance(state,now))return state;
  return this.store.transaction(s=>{advance(s,now);queueAlarms(s,now);return s;},{reason:'auto-advance'});
 }
 async action(data){return this.store.transaction(s=>{advance(s,this.now());return act(s,data,this.now());},{reason:data.action});}
 async messageAction({messageId,...data}){
  if(!/^\d{16,22}$/.test(messageId||''))throw new DomainError('메시지 ID 오류');
  return this.store.transaction(s=>{
   s.discordMessageReceipts??=[];
   const receipt=s.discordMessageReceipts.find(x=>x.id===messageId);
   if(receipt)return {boss:receipt.boss,duplicate:true};
   advance(s);const boss=act(s,data);
   s.discordMessageReceipts.push({id:messageId,boss:structuredClone(boss)});
   s.discordMessageReceipts=s.discordMessageReceipts.slice(-1000);
   return {boss,duplicate:false};
  },{reason:'discord-text'});
 }
 async configure(id,data,actor){return this.store.transaction(s=>configure(s,id,data,actor),{backup:true,reason:'configure'});}
 async reset(actor){return this.store.transaction(s=>reset(s,actor),{backup:true,reason:'reset'});}
 async restore(raw,actor){return this.store.transaction(s=>restore(s,raw,actor),{backup:true,reason:'restore'});}
 async importLegacy(rows,actor){return this.store.transaction(s=>{if(s.history.length||s.bosses.some(b=>b.time))throw new DomainError('이미 데이터가 있습니다. 먼저 백업 후 복구 기능을 사용하세요',409);return restore(s,migrateLegacy(rows),actor);},{backup:true,reason:'legacy-import'});}
 async undo(id,actor){return this.store.transaction(s=>{advance(s);return undo(s,id,actor);},{backup:true,reason:'undo'});}
}

export function needsAdvance(s,now=Date.now()){
 const keys=new Set(s.alarmKeys||[]);
 return s.bosses.some(b=>{
  if(!b.time)return false;const t=Date.parse(b.time);
  if((b.intervalMinutes||b.fixedKstMinutes.length)&&now>=t+30*60000)return true;
  return [10,5,0].some(m=>now>=t-m*60000&&now-(t-m*60000)<=90000&&!keys.has(`alarm-${b.id}-${b.time}-${m}`));
 });
}

export function queueAlarms(s,now=Date.now()){
 s.alarmKeys??=[];
 for(const b of s.bosses){if(!b.time)continue;const due=Date.parse(b.time);
  for(const minutes of [10,5,0]){const target=due-minutes*60000;
   // Skip old alerts after a cold start; catch-up must not flood Discord.
   if(now<target||now-target>90000)continue;
   const id=`alarm-${b.id}-${b.time}-${minutes}`;if(s.alarmKeys.includes(id))continue;
   s.alarmKeys.push(id);s.outbox.push({id,bossId:b.id,name:b.name,action:minutes?`${minutes}분 전`:'출현 예정',at:new Date(now).toISOString(),time:b.time,attempts:0});
  }
 }
 s.alarmKeys=s.alarmKeys.slice(-1000);s.outbox=s.outbox.slice(-1000);
}
