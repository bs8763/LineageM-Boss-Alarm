import {PermissionFlagsBits} from 'discord.js';
export function parseBossMessage(content){
 if(typeof content!=='string'||content.length>100||/[\r\n]/.test(content))return null;
 const reservation=content.trim().match(/^예약\s+(.+?)\s+([0-9]{4})$/u);
 if(reservation)return {name:reservation[1].trim().replace(/\s+/gu,' '),action:'schedule',hhmm:reservation[2]};
 const match=content.trim().match(/^([^\r\n]+?)\s+(컷|멍)$/u);
 return match?{name:match[1].trim().replace(/\s+/gu,' '),action:match[2]==='컷'?'cut':'miss'}:null;
}
export function nextKstReservation(hhmm,now=Date.now()){
 if(!/^[0-9]{4}$/.test(hhmm))throw Error('예약 시간은 0000~2359 형식으로 입력하세요.');
 const h=Number(hhmm.slice(0,2)),m=Number(hhmm.slice(2));
 if(h>23||m>59)throw Error('예약 시간은 0000~2359 형식으로 입력하세요.');
 const offset=9*3600000;
 const localDay=Math.floor((now+offset)/86400000)*86400000;
 let at=localDay+h*3600000+m*60000-offset;
 if(at<=now)at+=86400000;
 return new Date(at).toISOString();
}
export async function handleBossMessage(message,service,env){
 if(env.DISCORD_TEXT_COMMANDS!=='true'||message.author?.bot||message.webhookId||message.system)return;
 if(!env.DISCORD_GUILD_ID||!env.DISCORD_TEXT_CHANNEL_ID||message.guildId!==env.DISCORD_GUILD_ID||message.channelId!==env.DISCORD_TEXT_CHANNEL_ID)return;
 const parsed=parseBossMessage(message.content);if(!parsed)return;
 const reply=content=>message.reply({content,allowedMentions:{parse:[],repliedUser:false}});
 const permissions=message.member?.permissionsIn(message.channel);
 const role=env.DISCORD_COMMAND_ROLE_ID;
 const sendPermission=message.channel.isThread?.()?PermissionFlagsBits.SendMessagesInThreads:PermissionFlagsBits.SendMessages;
 if(!permissions?.has([PermissionFlagsBits.ViewChannel,sendPermission])||(role&&!permissions.has(PermissionFlagsBits.Administrator)&&!message.member.roles?.cache.has(role))){await reply('보스 명령 권한이 없습니다. 저장하지 않았습니다.');return;}
 if(!Number.isFinite(message.createdTimestamp)||Date.now()-message.createdTimestamp>90000||message.createdTimestamp>Date.now()+60000){await reply('오래된 메시지는 처리하지 않습니다. 새 메시지로 입력해 주세요.');return;}
 let result;
 try{result=await service.messageAction({messageId:message.id,id:parsed.name,action:parsed.action,time:parsed.action==='cut'?new Date(message.createdTimestamp).toISOString():parsed.action==='schedule'?nextKstReservation(parsed.hhmm,message.createdTimestamp):undefined,actor:`discord:${message.author.id}`});}
 catch(e){await reply(e.status?e.message:'저장 실패. 잠시 후 다시 시도하세요.');return;}
 // A response failure must never roll back or repeat the committed boss action.
 const b=result.boss;
 try{await reply(`${env.DISCORD_TEST_MODE==='true'?'🧪 검증 DB · ':''}✅ ${parsed.action==='schedule'?'예약 완료 · ':''}${b.name} [맵 ${b.mapNumber||'미확정'}] <t:${Math.floor(Date.parse(b.time)/1000)}:F> · 멍 ${b.misses}${result.duplicate?' · 이미 처리한 메시지':''}`);}catch{console.error('Discord text response failed after commit');}
 console.log('Discord text command committed:',parsed.action,result.duplicate?'duplicate':'new');
}
