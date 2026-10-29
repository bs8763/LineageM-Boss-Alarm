import {handleBossMessage} from './discord-text.js';
import {Client,GatewayIntentBits,Events,SlashCommandBuilder,REST,Routes,PermissionFlagsBits} from 'discord.js';
const choices=['컷','멍','예약','초기화'];
export function commandDefinitions(testMode=false){return [
 new SlashCommandBuilder().setName('보스목록').setDescription('출현 예정·맵·멍 현황'),
 new SlashCommandBuilder().setName('보스등록').setDescription('보스 출현 시간 예약').addStringOption(o=>o.setName('이름').setDescription('보스 이름').setRequired(true)).addStringOption(o=>o.setName('시간').setDescription('한국시간 YYYY-MM-DD HH:mm').setRequired(true)),
 new SlashCommandBuilder().setName('보스').setDescription('혈맹 보스 컷·멍').addStringOption(o=>o.setName('동작').setDescription('컷 또는 멍').setRequired(true).addChoices(...choices.slice(0,2).map(name=>({name,value:name})))).addStringOption(o=>o.setName('이름').setDescription('보스 이름').setRequired(true)),
 new SlashCommandBuilder().setName('보스초기화').setDescription('관리자: 모든 예정 시간과 멍 초기화').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addBooleanOption(o=>o.setName('확인').setDescription('true로 실행 확인').setRequired(true))
 ].map(c=>{if(testMode)c.setName('검증'+c.name);return c.toJSON();});}
export function parseKst(raw){if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(raw))throw Error('시간 형식: 2026-10-28 19:30 (한국시간)');const d=new Date(raw.replace(' ','T')+':00+09:00');if(!Number.isFinite(+d)||new Date(+d+9*3600000).toISOString().slice(0,16)!==raw.replace(' ','T'))throw Error('존재하지 않는 날짜·시간');return d.toISOString();}
export function commandRoute(i,env){
 const testMode=env.DISCORD_TEST_MODE==='true', prefix=testMode?'검증':'';
 const names=commandDefinitions(testMode).map(c=>c.name);
 if(!names.includes(i.commandName))return null;
 if(testMode&&(!env.DISCORD_GUILD_ID||!env.DISCORD_CHANNEL_ID||i.guildId!==env.DISCORD_GUILD_ID||i.channelId!==env.DISCORD_CHANNEL_ID))return null;
 return i.commandName.slice(prefix.length);
}
export function formatBossEvent(e,currentBoss){
 const b=e.bossSnapshot||currentBoss;
 const actionNames={cut:'⚔️ 보스 컷 완료',miss:'🌙 보스 멍 처리',schedule:'📅 보스 시간 등록'};
 const timestamp=t=>t?'<t:'+Math.floor(Date.parse(t)/1000)+':F>':'미등록';
 if(e.action==='auto-miss')return '⏰ 보스 자동 멍 처리 · #'+e.id+'\n보스: '+e.name+'\n맵: '+(b?.mapNumber||'미확정')+'\n이전 출현 예정: '+timestamp(e.previousTime)+'\n미입력 경과: 30분 이상\n자동 멍 처리: '+(e.count||1)+'회\n누적 멍 횟수: '+(b?.misses??'미확인')+'회\n다음 예상 출현: '+timestamp(e.time)+'\n등록 경로: 시스템 자동 처리';
 if(!actionNames[e.action])return '⚔️ #'+e.id+' '+e.name+' · '+e.action+'\n맵 '+(b?.mapNumber||'미확정')+' · '+timestamp(e.time);
 const source=String(e.actor||'').startsWith('web:')?'안드로이드 앱 / 웹':'디스코드';
 return actionNames[e.action]+' · #'+e.id+'\n보스: '+e.name+'\n맵: '+(b?.mapNumber||'미확정')+'\n처리 시간: '+timestamp(e.at)+'\n다음 출현: '+timestamp(e.time)+'\n멍 횟수: '+(b?.misses??'미확인')+'회\n등록 경로: '+source;
}
function format(b){return `• ${b.name} [맵 ${b.mapNumber||'미확정'}] ${b.time?`<t:${Math.floor(Date.parse(b.time)/1000)}:F>`:'미등록'} · 멍 ${b.misses}`;}
export async function startDiscord(service,env=process.env){
 if(!env.DISCORD_BOT_TOKEN)return {ready:()=>false,stop:async()=>{}};
 const testMode=env.DISCORD_TEST_MODE==='true';
 if(testMode&&(!env.DISCORD_GUILD_ID||!env.DISCORD_CHANNEL_ID))throw Error('검증 봇은 서버·채널 ID가 모두 필요합니다');
 const textEnabled=env.DISCORD_TEXT_COMMANDS==='true';
 if(textEnabled&&(!env.DISCORD_GUILD_ID||!env.DISCORD_TEXT_CHANNEL_ID))throw Error('일반 채팅 명령은 서버·전용 채널 ID가 필요합니다');
 const client=new Client({intents:[GatewayIntentBits.Guilds,...(textEnabled?[GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent]:[])]});const admins=new Set((env.DISCORD_ADMIN_IDS||'').split(',').filter(Boolean));
 if(textEnabled)client.on(Events.MessageCreate,message=>handleBossMessage(message,service,env).catch(()=>console.error('Discord text handler failed')));
 let publishing=false;
 const allowed=i=>i.inGuild()&&Boolean(env.DISCORD_GUILD_ID)&&i.guildId===env.DISCORD_GUILD_ID;
 client.on(Events.InteractionCreate,async i=>{
  if(!i.isChatInputCommand())return;
  // Log only routing metadata. Never log tokens, option values, user IDs or database records.
  console.log('Discord interaction received:',JSON.stringify({name:i.commandName,guildMatch:i.guildId===env.DISCORD_GUILD_ID,channelMatch:i.channelId===env.DISCORD_CHANNEL_ID,testMode}));
  const commandName=commandRoute(i,env);
  if(!commandName){console.warn('Discord interaction ignored:',JSON.stringify({name:i.commandName,knownCommand:commandDefinitions(testMode).some(c=>c.name===i.commandName),guildMatch:i.guildId===env.DISCORD_GUILD_ID,channelMatch:i.channelId===env.DISCORD_CHANNEL_ID}));return;}
  if(!allowed(i)){console.warn('Discord interaction rejected: wrong guild');return i.reply({content:'설정된 혈맹 서버에서만 사용 가능합니다',ephemeral:true});}
  try{console.log('Discord interaction handling:',commandName);await i.deferReply({ephemeral:testMode||commandName==='보스초기화'});
   if(commandName==='보스목록'){const s=await service.read();const list=[...s.bosses].sort((a,b)=>(a.time||'z').localeCompare(b.time||'z'));const lines=list.map(format);let chunk='⚔️ 혈맹 보스탐 (한국시간)\n';const chunks=[];for(const line of lines){if(chunk.length+line.length>1800){chunks.push(chunk);chunk='';}chunk+=line+'\n';}chunks.push(chunk);await i.editReply(chunks.shift());for(const content of chunks)await i.followUp(content);}
   else if(commandName==='보스초기화'){
    if(!admins.has(i.user.id)&&!i.memberPermissions?.has(PermissionFlagsBits.Administrator))throw Error('관리자만 초기화할 수 있습니다');
    if(!i.options.getBoolean('확인'))throw Error('확인=true가 필요합니다');await service.reset(`discord:${i.user.id}`);await i.editReply('초기화 완료. 변경 전 자동 백업에서 복원할 수 있습니다.');
   }else if(['보스','보스등록'].includes(commandName)){
    const s=await service.read(),name=i.options.getString('이름'),b=s.bosses.find(b=>b.name===name||b.id===name);if(!b)throw Error('보스목록에 있는 정확한 이름을 입력하세요');
    const action=commandName==='보스등록'?'schedule':i.options.getString('동작')==='컷'?'cut':'miss';
    const result=await service.action({id:b.id,action,time:action==='schedule'?parseKst(i.options.getString('시간')):undefined,expectedVersion:b.version,actor:`discord:${i.user.id}`});await i.editReply(`${testMode?'🧪 검증 DB · ':''}✅ ${format(result)}`);if(testMode)console.log('Discord verification action committed:',action);
   }
  }catch(e){console.error('Discord interaction handler failed:',JSON.stringify({command:commandName,stage:i.deferred?'after-defer':'before-defer',code:String(e?.code||e?.status||'unknown'),errorType:String(e?.name||'Error')}));const content=e.status?e.message:(/시간|날짜|관리자|확인|이름|보스목록/.test(e.message)?e.message:'처리 실패. 잠시 후 다시 시도하세요');try{if(i.deferred||i.replied)await i.editReply(content);else await i.reply({content,ephemeral:true});}catch{console.error('Discord response failed');}}
 });
 client.once(Events.ClientReady,async()=>{
  console.log('Discord ready');
  console.log('Discord command diagnostics:',JSON.stringify({
   testMode,registrationEnabled:env.REGISTER_DISCORD_COMMANDS==='true',
   guildConfigured:Boolean(env.DISCORD_GUILD_ID),channelConfigured:Boolean(env.DISCORD_CHANNEL_ID),
   textCommandsEnabled:textEnabled,expectedNames:commandDefinitions(testMode).map(c=>c.name)
  }));
  if(env.REGISTER_DISCORD_COMMANDS!=='true')return;
  try{const rest=new REST({version:'10'}).setToken(env.DISCORD_BOT_TOKEN);if(!env.DISCORD_GUILD_ID)throw Error('DISCORD_GUILD_ID required');
   // Only this application's guild commands are affected; never log tokens or credentials.
   const route=Routes.applicationGuildCommands(client.user.id,env.DISCORD_GUILD_ID);
   for(const body of commandDefinitions(testMode)){
    const registered=await rest.post(route,{body});
    console.log('Discord command registered:',registered.name,'id:',registered.id);
   }
   const actual=await rest.get(route);
   console.log('Discord guild commands after registration:',actual.map(c=>c.name).join(', '));
  }catch(e){console.error('Discord command registration failed:',e?.status||e?.code||'unknown',String(e?.message||'unknown').slice(0,300));}
 });
 const timer=setInterval(async()=>{if(testMode||publishing||!client.isReady()||!env.DISCORD_CHANNEL_ID||!env.DISCORD_GUILD_ID)return;publishing=true;
  try{
   const channel=await client.channels.fetch(env.DISCORD_CHANNEL_ID);if(!channel?.isTextBased()||channel.guildId!==env.DISCORD_GUILD_ID)return;
   // The row lock serializes delivery across overlapping deployments. At-least-once: a crash
   // after send and before commit can repeat an event; its ID is displayed for recognition.
   await service.store.transaction(async s=>{
    const now=Date.now(),pending=s.outbox.filter(e=>!e.sentAt).slice(0,5);
    for(const e of pending){if(now-Date.parse(e.at)>(String(e.id).startsWith('alarm-')?90000:6*3600000)){e.sentAt='expired';continue;}
     try{const b=s.bosses.find(b=>b.id===e.bossId);await channel.send({content:formatBossEvent(e,b),allowedMentions:{parse:[]}});e.sentAt=new Date().toISOString();}catch{e.attempts++;break;}}
    s.outbox=s.outbox.filter(e=>!e.sentAt).slice(-1000);return null;
   });
  }catch{console.error('Discord delivery failed; will retry');}finally{publishing=false;}
 },10000);timer.unref();
 client.login(env.DISCORD_BOT_TOKEN).catch(()=>console.error('Discord login failed; check token'));
 return {ready:()=>client.isReady(),stop:async()=>{clearInterval(timer);client.destroy();}};
}
