import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import {initialState,migrateLegacy,validateSnapshot,upgradeCatalog} from './domain.js';
export class Store {
 constructor({url=process.env.DATABASE_URL,file=process.env.DATA_FILE||'data/state.json',requireDatabase=process.env.RENDER==='true',cacheMs=10*60*1000,now=Date.now}={}){
  if(requireDatabase&&!url)throw Error('Render에서는 DATABASE_URL 영구 저장소가 필수입니다. 로컬 파일로 실행하지 않습니다.');
  this.file=file;this.tail=Promise.resolve();this.cacheMs=cacheMs;this.now=now;this.cached=null;this.cachedAt=0;this.pool=url?new pg.Pool({connectionString:url,max:3,connectionTimeoutMillis:10000,idleTimeoutMillis:30000}):null;
  this.pool?.on('error',()=>console.error('Database idle connection failed; retry on next operation'));
 }
 async init(){
  if(this.pool){await this.pool.query(`CREATE TABLE IF NOT EXISTS boss_state (id integer PRIMARY KEY CHECK (id=1), data jsonb NOT NULL);
   CREATE TABLE IF NOT EXISTS boss_backups (id bigserial PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), reason text NOT NULL, data jsonb NOT NULL)`);
   await this.pool.query('INSERT INTO boss_state(id,data) VALUES(1,$1) ON CONFLICT DO NOTHING',[JSON.stringify(initialState())]);
  }else{
   await fs.mkdir(path.dirname(this.file),{recursive:true});
   try{this.local=JSON.parse(await fs.readFile(this.file,'utf8'));validateSnapshot(this.local);}catch(e){if(e.code!=='ENOENT')throw e;
    try{this.local=migrateLegacy(JSON.parse(await fs.readFile('bosses.json','utf8')));}catch(err){if(err.code!=='ENOENT')throw err;this.local=initialState();}
    await this.writeLocal(this.local);
   }
  }
  await this.transaction(s=>{upgradeCatalog(s);validateSnapshot(s);return true;},{backup:true,reason:'catalog-correction'});
 }
 async writeLocal(state){const temp=`${this.file}.tmp`;const handle=await fs.open(temp,'w',0o600);try{await handle.writeFile(JSON.stringify(state));await handle.sync();}finally{await handle.close();}await fs.rename(temp,this.file);}
 transaction(fn,{backup=false,reason='change'}={}){
  const run=async()=>{
   if(this.pool){const c=await this.pool.connect();try{
    await c.query('BEGIN');const {rows}=await c.query('SELECT data FROM boss_state WHERE id=1 FOR UPDATE');const before=rows[0].data;const state=structuredClone(before);const result=await fn(state);
    if(JSON.stringify(state)!==JSON.stringify(before)){
     // Every changed revision gets a pre-change backup in the same commit.
     if(backup||state.revision!==before.revision){await c.query('INSERT INTO boss_backups(reason,data) VALUES($1,$2)',[reason,JSON.stringify(before)]);await c.query('DELETE FROM boss_backups WHERE id NOT IN (SELECT id FROM boss_backups ORDER BY id DESC LIMIT 200)');}
     await c.query('UPDATE boss_state SET data=$1 WHERE id=1',[JSON.stringify(state)]);
    }
    await c.query('COMMIT');this.cached=structuredClone(state);this.cachedAt=this.now();return structuredClone(result);
   }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}}
   const before=this.local,state=structuredClone(before),result=await fn(state);
   if(JSON.stringify(before)!==JSON.stringify(state)){
    if(backup||state.revision!==before.revision){const dir=path.join(path.dirname(this.file),'backups');await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,`${Date.now()}-${before.revision}.json`),JSON.stringify(before),{mode:0o600});const files=(await fs.readdir(dir)).sort();for(const file of files.slice(0,-200))await fs.unlink(path.join(dir,file));}
    await this.writeLocal(state);this.local=state;
   }return structuredClone(result);
  };
  const p=this.tail.then(run);this.tail=p.catch(()=>{});return p;
 }
 // Only committed snapshots enter the cache. All reads and writes use the same
 // queue, so an in-flight refresh cannot overwrite a newer committed action.
 snapshot({fresh=false}={}){
  const run=async()=>{
   if(!this.pool)return structuredClone(this.local);
   if(fresh||!this.cached||this.now()-this.cachedAt>=this.cacheMs){
    const {rows}=await this.pool.query('SELECT data FROM boss_state WHERE id=1');
    if(!rows[0])throw Error('Persistent state missing');
    this.cached=structuredClone(rows[0].data);this.cachedAt=this.now();
   }
   return structuredClone(this.cached);
  };
  const p=this.tail.then(run);this.tail=p.catch(()=>{});return p;
 }
 async ping(){await this.snapshot();return true;}
 status(){return {lastVerifiedAt:this.pool&&this.cached?new Date(this.cachedAt).toISOString():null,maxStalenessMs:this.cacheMs};}
 async schedule(){return (await this.snapshot()).bosses;}
 async backups(){if(this.pool)return (await this.pool.query('SELECT id,created_at,reason FROM boss_backups ORDER BY id DESC LIMIT 200')).rows;const dir=path.join(path.dirname(this.file),'backups');return (await fs.readdir(dir).catch(e=>{if(e.code==='ENOENT')return [];throw e;})).sort().reverse().map(id=>({id}));}
 async backupById(id){if(this.pool){if(!/^\d+$/.test(id))return null;return (await this.pool.query('SELECT data FROM boss_backups WHERE id=$1',[id])).rows[0]?.data;}if(!/^\d+-\d+\.json$/.test(id))return null;try{return JSON.parse(await fs.readFile(path.join(path.dirname(this.file),'backups',id),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
 async close(){await this.tail;await this.pool?.end();}
}
