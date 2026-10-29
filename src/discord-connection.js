import {Events} from 'discord.js';

// One login attempt/retry timer per process. Gateway resume remains discord.js's
// responsibility; only a prolonged disconnect or failed login triggers re-login.
export function connectDiscord(client,token,{now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout,random=Math.random,log=console.log}={}){
 let stopped=false,inFlight=false,retry=null,watchdog=null,loginTimeout=null,attempts=0;
 let state='starting',lastReadyAt=null,lastError=null;
 const blocked=new Set(['TokenInvalid','TokenMissing','DisallowedIntents','4004','4013','4014']);
 const safeCode=e=>{const c=String(e?.code??'');return blocked.has(c)?c:['ECONNRESET','ETIMEDOUT','ENOTFOUND','EAI_AGAIN','ECONNREFUSED'].includes(c)?c:'CONNECTION_FAILED';};
 function cancel(){if(retry!==null)clearTimer(retry);if(watchdog!==null)clearTimer(watchdog);retry=watchdog=null;}
 function armWatchdog(){
  if(watchdog!==null||stopped||state==='blocked')return;
  watchdog=setTimer(()=>{watchdog=null;if(!stopped&&!client.isReady()){client.destroy();if(!inFlight)schedule();}},180000);watchdog?.unref?.();
 }
 function schedule(){
  if(stopped||retry!==null||state==='blocked')return;
  state='retrying';const delay=Math.min(60000,Math.round(Math.min(60000,1000*2**Math.min(attempts++,6))*(0.8+random()*0.4)));
  retry=setTimer(()=>{retry=null;void login();},delay);retry?.unref?.();
 }
 async function login(){
  if(stopped||inFlight||state==='blocked'||client.isReady())return;
  inFlight=true;state='connecting';armWatchdog();
  try{await Promise.race([client.login(token),new Promise((_,reject)=>{
   loginTimeout=setTimer(()=>{client.destroy();reject(Object.assign(Error('Login timeout'),{code:'ETIMEDOUT'}));},60000);loginTimeout?.unref?.();
  })]);}
  catch(e){if(stopped)return;lastError=safeCode(e);log(`Discord login failed: ${lastError}`);
   if(blocked.has(lastError)){state='blocked';cancel();}else schedule();
  }finally{if(loginTimeout!==null)clearTimer(loginTimeout);loginTimeout=null;inFlight=false;}
 }
 const listeners=[
  [Events.ClientReady,()=>{if(stopped)return;cancel();attempts=0;state='ready';lastError=null;lastReadyAt=new Date(now()).toISOString();log('Discord connection ready');}],
  [Events.ShardResume,()=>{if(stopped)return;cancel();attempts=0;state='ready';lastError=null;lastReadyAt=new Date(now()).toISOString();log('Discord connection resumed');}],
  [Events.ShardReconnecting,()=>{if(stopped)return;state='reconnecting';log('Discord reconnecting');armWatchdog();}],
  [Events.ShardDisconnect,e=>{if(stopped)return;lastError=safeCode(e);if(blocked.has(lastError)){state='blocked';cancel();log(`Discord connection blocked: ${lastError}`);}else{state='disconnected';log('Discord disconnected');armWatchdog();}}],
  [Events.Invalidated,()=>{if(stopped)return;state='disconnected';log('Discord session invalidated');armWatchdog();}],
  [Events.Error,e=>{if(!stopped){lastError=safeCode(e);log(`Discord client error: ${lastError}`);}}],
  [Events.ShardError,e=>{if(!stopped){lastError=safeCode(e);log(`Discord gateway error: ${lastError}`);}}]
 ];
 for(const [event,fn]of listeners)client.on(event,fn);
 void login();
 return {
  status:()=>({enabled:true,ready:!stopped&&client.isReady(),state,lastReadyAt,lastError}),
  stop:()=>{stopped=true;state='stopped';cancel();if(loginTimeout!==null)clearTimer(loginTimeout);loginTimeout=null;for(const [event,fn]of listeners)client.off(event,fn);client.destroy();}
 };
}
