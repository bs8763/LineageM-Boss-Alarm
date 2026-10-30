import express from 'express';
import {timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Store} from './src/store.js';
import {Service} from './src/service.js';
import {startDiscord} from './src/discord.js';
function match(a,b){if(typeof a!=='string'||!b)return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
export function createApp(service,env=process.env){
 const app=express();app.disable('x-powered-by');if(env.RENDER==='true')app.set('trust proxy',1);
 const limits=new Map();const limiter=(req,res,next)=>{const now=Date.now(),key=req.ip,slot=limits.get(key)||{at:now,count:0};if(now-slot.at>=60000){slot.at=now;slot.count=0;}limits.set(key,slot);if(++slot.count>120)return res.status(429).json({error:'요청이 많습니다. 잠시 후 재시도하세요'});if(limits.size>10000)for(const [k,v]of limits)if(now-v.at>60000)limits.delete(k);next();};
 app.use((req,res,next)=>{res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});next();});
 app.use('/api',limiter,express.json({limit:'2mb'}),(req,res,next)=>{res.set('Cache-Control','no-store');next();});
 app.get('/healthz',(_,res)=>res.json({ok:true}));
 app.get('/readyz',async(_,res)=>{try{await service.store.ping();res.json({ok:true,persistent:Boolean(service.store.pool)});}catch{res.status(503).json({ok:false});}});
 const auth=(admin=false)=>(req,res,next)=>{const raw=req.headers.authorization?.replace(/^Bearer /,'');const isAdmin=match(raw,env.ADMIN_TOKEN);if(!isAdmin&&(admin||!match(raw,env.CLAN_TOKEN)))return res.status(401).json({error:admin?'관리자 키가 필요합니다':'혈맹 접속 키가 필요합니다'});req.actor=isAdmin?'web:admin':'web:clan';next();};
 const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 app.get('/api/session',auth(),(req,res)=>res.json({admin:req.actor==='web:admin',persistent:Boolean(service.store.pool)}));
 app.get('/api/bosses',auth(),wrap(async(_,res)=>res.json((await service.read()).bosses.sort((a,b)=>(a.time||'z').localeCompare(b.time||'z')))));
 app.get('/api/history',auth(),wrap(async(_,res)=>res.json((await service.read()).history.slice(-200).reverse())));
 app.post('/api/bosses',auth(),wrap(async(req,res)=>res.json(await service.action({id:req.body.id||req.body.name,action:'schedule',time:req.body.time,expectedVersion:req.body.expectedVersion,actor:req.actor}))));
 app.post('/api/bosses/:id/action',auth(),wrap(async(req,res)=>{if(!['cut','miss','schedule'].includes(req.body.action))return res.status(400).json({error:'컷·멍·예약만 허용됩니다'});res.json(await service.action({...req.body,id:req.params.id,actor:req.actor}));}));
 app.delete('/api/bosses/:name',auth(true),wrap(async(req,res)=>res.json(await service.action({id:req.params.name,action:'clear',actor:req.actor}))));
 app.patch('/api/bosses/:id',auth(true),wrap(async(req,res)=>res.json(await service.configure(req.params.id,req.body,req.actor))));
 app.post('/api/admin/reset',auth(true),wrap(async(req,res)=>{if(req.body.confirm!=='RESET')return res.status(400).json({error:'confirm=RESET 확인 필요'});await service.reset(req.actor);res.json({ok:true});}));
 app.post('/api/admin/undo',auth(true),wrap(async(req,res)=>res.json(await service.undo(Number(req.body.eventId),req.actor))));
 app.get('/api/admin/backup',auth(true),wrap(async(_,res)=>{const s=await service.read();res.attachment(`boss-backup-${new Date().toISOString().slice(0,10)}.json`).json(s);}));
 app.get('/api/admin/backups',auth(true),wrap(async(_,res)=>res.json(await service.store.backups())));
 app.post('/api/admin/restore',auth(true),wrap(async(req,res)=>{if(req.body.confirm!=='RESTORE')return res.status(400).json({error:'confirm=RESTORE 확인 필요'});const raw=req.body.backupId?await service.store.backupById(String(req.body.backupId)):req.body.snapshot;if(!raw)return res.status(404).json({error:'백업 없음'});await service.restore(raw,req.actor);res.json({ok:true});}));
 app.post('/api/admin/import-legacy',auth(true),wrap(async(req,res)=>{await service.importLegacy(req.body.bosses,req.actor);res.json({ok:true});}));
 app.use(express.static(fileURLToPath(new URL('./public',import.meta.url))));
 app.use((error,req,res,next)=>{if(res.headersSent)return next(error);const status=error.status||500;if(status>=500)console.error('Request failed:',error.code||error.name);res.status(status).json({error:status>=500?'저장소 연결 실패. 저장되지 않았습니다. 다시 시도하세요':error.message});});
 return app;
}
export async function main(){
 for(const key of ['CLAN_TOKEN','ADMIN_TOKEN'])if(!process.env[key]||process.env[key].length<24)throw Error(`${key}: 서로 다른 24자 이상 키를 설정하세요`);
 if(process.env.CLAN_TOKEN===process.env.ADMIN_TOKEN)throw Error('관리자 키와 혈맹 키는 달라야 합니다');
 const store=new Store();await store.init();const service=new Service(store);const bot=await startDiscord(service);
 let busy=false;const timer=setInterval(async()=>{if(busy)return;busy=true;try{await service.tick();}catch{console.error('Scheduler failed; catch-up on next successful request');}finally{busy=false;}},30000);timer.unref();
 const server=createApp(service).listen(process.env.PORT||process.env.SERVER_PORT||3000,()=>console.log('Boss app running'));
 async function stop(){clearInterval(timer);server.close();await bot.stop();await store.close();process.exit(0);}process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
if(process.argv[1]===fileURLToPath(import.meta.url))main().catch(()=>{console.error('Startup failed: check keys, DATABASE_URL, migration data and database connectivity');process.exitCode=1;});
