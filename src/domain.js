import { CATALOG } from './catalog.js';
export const GRACE = 30*60*1000;
export class DomainError extends Error { constructor(message,status=400){super(message);this.status=status;} }
export function initialState(){return {schemaVersion:2,catalogVersion:2,revision:0,bosses:CATALOG.map(b=>({...b,time:null,misses:0,lastAction:null,version:0})),history:[],outbox:[]};}
export function iso(value){
 const m=typeof value==='string'&&value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/);
 if(!m||!Number.isFinite(Date.parse(value)))throw new DomainError('시간대가 포함된 ISO 시간이 필요합니다');
 const [year,month,day,hour,minute,second]=m.slice(1).map(Number),leap=year%4===0&&(year%100!==0||year%400===0),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
 if(month<1||month>12||day<1||day>days[month-1]||hour>23||minute>59||second>59)throw new DomainError('존재하지 않는 날짜·시간');
 return new Date(value).toISOString();
}
export function nextFixed(minutes,after){const day=86400000,kst=after+9*3600000,base=Math.floor(kst/day)*day-9*3600000;return Math.min(...minutes.map(m=>{let t=base+m*60000; if(t<=after)t+=day;return t;}));}
export function nextSpawn(b,after){if(b.fixedKstMinutes.length)return nextFixed(b.fixedKstMinutes,after);if(b.intervalMinutes)return after+b.intervalMinutes*60000;throw new DomainError('리젠 시간 또는 고정 시간을 먼저 설정하세요');}
export function findBoss(s,id){const b=s.bosses.find(b=>b.id===id||b.name===id);if(!b)throw new DomainError('보스를 찾을 수 없습니다',404);return b;}
function event(s,b,action,actor,now,details={}){s.revision++;b.version++;const e={id:s.revision,bossId:b.id,name:b.name,action,actor,at:new Date(now).toISOString(),...details};s.history.push(e);s.history=s.history.slice(-1000);s.outbox.push({...e,attempts:0});s.outbox=s.outbox.slice(-1000);return e;}
export function advance(s,now=Date.now()){
 for(const b of s.bosses){if(!b.time||(!b.intervalMinutes&&!b.fixedKstMinutes.length))continue;
 const due=Date.parse(b.time);if(now<due+GRACE)continue;
 let count=0,next=due;
 if(!b.fixedKstMinutes.length){count=Math.floor((now-due-GRACE)/(b.intervalMinutes*60000))+1;next=due+count*b.intervalMinutes*60000;}
 else { // bounded by number of daily fixed slots; skip whole days first
  const days=Math.max(0,Math.floor((now-GRACE-next)/86400000)-1);next+=days*86400000;count+=days*b.fixedKstMinutes.length;
  while(now>=next+GRACE){next=nextFixed(b.fixedKstMinutes,next);count++;}
 }
 b.time=new Date(next).toISOString();b.misses+=count;b.lastAction='auto-miss';event(s,b,'auto-miss','system',now,{count,previousTime:new Date(due).toISOString(),time:b.time});
 }return s;
}
export function act(s,{id,action,time,expectedVersion,actor='web'},now=Date.now()){
 const b=findBoss(s,id);if(expectedVersion!==undefined&&expectedVersion!==b.version)throw new DomainError('다른 사용자가 수정했습니다. 새로고침 후 다시 시도하세요',409);
 const at=time?Date.parse(iso(time)):now;if(at>now+60000&&(action==='cut'||action==='miss'))throw new DomainError('컷·멍은 미래 시간으로 기록할 수 없습니다');
 const previous={time:b.time,misses:b.misses,lastAction:b.lastAction};
 if(action==='schedule'){b.time=iso(time);b.misses=0;}
 else if(action==='cut'){b.time=new Date(nextSpawn(b,at)).toISOString();b.misses=0;}
 else if(action==='miss'){if(!b.time)throw new DomainError('출현 예정 시간을 먼저 등록하세요');b.time=new Date(nextSpawn(b,Date.parse(b.time))).toISOString();b.misses++;}
 else if(action==='clear'){b.time=null;b.misses=0;}
 else throw new DomainError('지원하지 않는 동작');
 b.lastAction=action;event(s,b,action,actor,now,{previous,time:b.time});return b;
}
export function configure(s,id,input,actor,now=Date.now()){
 const b=findBoss(s,id);const map=String(input.mapNumber??b.mapNumber).trim();if(map.length>80)throw new DomainError('맵 번호가 너무 깁니다');
 const rawInterval=Object.hasOwn(input,'intervalMinutes')?input.intervalMinutes:b.intervalMinutes;
 const interval=rawInterval===null?null:Number(rawInterval);
 const fixed=input.fixedKstMinutes??b.fixedKstMinutes;
 if(interval!==null&&(!Number.isInteger(interval)||interval<1||interval>10080))throw new DomainError('리젠은 1~10080분');
 if(!Array.isArray(fixed)||fixed.length>24||fixed.some(x=>!Number.isInteger(x)||x<0||x>=1440)||new Set(fixed).size!==fixed.length)throw new DomainError('고정 시간은 중복 없는 0~1439분 목록');
 if(interval&&fixed.length)throw new DomainError('주기 리젠과 고정 시간 중 하나만 설정하세요');
 b.mapNumber=map;b.intervalMinutes=interval;b.fixedKstMinutes=[...fixed].sort((a,b)=>a-b);b.verified=input.verified===true;b.note=b.verified?'혈맹 관리자 확인':'관리자 확인 필요';event(s,b,'configure',actor,now);return b;
}
export function reset(s,actor,now=Date.now()){for(const b of s.bosses){b.time=null;b.misses=0;b.lastAction='reset';event(s,b,'reset',actor,now);}return s;}
// IDs are stable. A spelling correction retains schedules; replacing a different boss
// archives its old entry and starts an unconfigured schedule rather than relabeling it.
function normalizeCatalog(s){
 const changes=[];
 for(const b of s.bosses){
  if(b.id==='boss-27'&&b.name==='가스트'){
   const previous=structuredClone(b);b.name='카스트';changes.push({boss:b,previous,replaced:false});
  }else if(b.id==='boss-21'&&b.name==='베리스'){
   const previous=structuredClone(b),base=CATALOG.find(x=>x.id===b.id);
   Object.assign(b,structuredClone(base),{time:null,misses:0,lastAction:'catalog-replaced'});
   changes.push({boss:b,previous,replaced:true});
  }
 }
 s.catalogVersion=2;return changes;
}
export function upgradeCatalog(s,now=Date.now()){
 if(!s||s.schemaVersion!==2||!Array.isArray(s.bosses)||s.bosses.length!==31)throw new DomainError('저장 데이터 형식 오류');
 const changes=normalizeCatalog(s);
 for(const {boss,previous,replaced} of changes){
  if(replaced){s.outbox=s.outbox.filter(e=>e.bossId!==boss.id);s.alarmKeys=(s.alarmKeys||[]).filter(k=>!k.startsWith(`alarm-${boss.id}-`));}
  else for(const e of s.outbox)if(e.bossId===boss.id&&e.name===previous.name)e.name=boss.name;
  event(s,boss,'catalog-correction','system',now,{previousCatalog:previous,replaced});
 }
 return changes.length;
}
export function validateSnapshot(raw){
 if(!raw||raw.schemaVersion!==2||!Array.isArray(raw.bosses)||raw.bosses.length!==31)throw new DomainError('31종 보스가 있는 v2 백업이 필요합니다');
 const normalized=structuredClone(raw);normalizeCatalog(normalized);
 const result=initialState();const ids=new Set();
 result.bosses=normalized.bosses.map(x=>{const base=CATALOG.find(b=>b.id===x.id);if(!base||ids.has(x.id)||x.name!==base.name)throw new DomainError('보스 ID·이름 오류');ids.add(x.id);const temp=initialState();configure(temp,x.id,x,'validate');const configured=findBoss(temp,x.id);if(!Number.isSafeInteger(x.misses)||x.misses<0)throw new DomainError('멍 횟수 오류');return {...base,...configured,time:x.time===null?null:iso(x.time),misses:x.misses,lastAction:'restore',version:0};});return result;
}
export function restore(s,raw,actor,now=Date.now()){const clean=validateSnapshot(raw);for(const b of clean.bosses){const old=findBoss(s,b.id);Object.assign(old,{...b,version:old.version});event(s,old,'restore',actor,now);}return s;}
export function migrateLegacy(rows){const s=initialState();if(!Array.isArray(rows))throw new DomainError('기존 보스 배열 필요');for(const row of rows){const b=s.bosses.find(b=>b.name===(row.name==='가스트'?'카스트':row.name));if(!b)throw new DomainError(`기준표에 없는 기존 보스: ${String(row.name).slice(0,60)} (원본을 보존하고 관리자 매핑 필요)`);b.time=iso(row.time);}return s;}
export function undo(s,eventId,actor,now=Date.now()){const e=s.history.find(e=>e.id===eventId);if(!e?.previous)throw new DomainError('복구 가능한 컷·멍·등록 기록을 선택하세요');const b=findBoss(s,e.bossId);if(e.name!==b.name&&!(e.name==='가스트'&&b.name==='카스트'))throw new DomainError('보스표가 변경된 기록은 바로 복구할 수 없습니다. 원본 백업을 확인하세요',409);const later=s.history.some(x=>x.bossId===b.id&&x.id>e.id);if(later)throw new DomainError('후속 기록이 있어 바로 복구할 수 없습니다. 백업을 확인하세요',409);Object.assign(b,e.previous);event(s,b,'undo',actor,now,{restoredEvent:e.id});return b;}
