import express from 'express';
import {Client,GatewayIntentBits,Events,SlashCommandBuilder,REST,Routes} from 'discord.js';
import fs from 'node:fs';
const app=express();app.use(express.json());app.use(express.static('public'));
const file='bosses.json';let bosses=[];try{bosses=JSON.parse(fs.readFileSync(file,'utf8'))}catch{}
const save=()=>fs.writeFileSync(file,JSON.stringify(bosses,null,2));
const token=process.env.DISCORD_BOT_TOKEN;const channelId=process.env.DISCORD_CHANNEL_ID;const client=new Client({intents:[GatewayIntentBits.Guilds]});
const publish=async message=>{if(!client.isReady()||!channelId)return;try{const c=await client.channels.fetch(channelId);if(c?.isTextBased())await c.send(message)}catch(e){console.error('Discord:',e.message)}};
const upsert=(name,time)=>{const t=new Date(time);if(!name||!Number.isFinite(t.getTime()))throw Error('보스 이름과 올바른 날짜/시간이 필요합니다');const item={name:name.trim().slice(0,60),time:t.toISOString()};bosses=bosses.filter(b=>b.name!==item.name);bosses.push(item);save();return item};
app.get('/api/bosses',(_,res)=>res.json(bosses.sort((a,b)=>a.time.localeCompare(b.time))));
app.post('/api/bosses',async(req,res)=>{try{const b=upsert(req.body.name,req.body.time);await publish(`📢 보스탐 변경: **${b.name}** — <t:${Math.floor(new Date(b.time).getTime()/1000)}:F>`);res.json(b)}catch(e){res.status(400).json({error:e.message})}});
app.delete('/api/bosses/:name',async(req,res)=>{const name=req.params.name;bosses=bosses.filter(b=>b.name!==name);save();await publish(`🗑️ 보스탐 삭제: **${name}**`);res.json({ok:true})});
const commands=[new SlashCommandBuilder().setName('보스등록').setDescription('보스 출현 시간을 등록합니다').addStringOption(o=>o.setName('이름').setDescription('보스 이름').setRequired(true)).addStringOption(o=>o.setName('시간').setDescription('한국시간 YYYY-MM-DD HH:mm').setRequired(true)),new SlashCommandBuilder().setName('보스목록').setDescription('보스 출현 시간 목록')].map(c=>c.toJSON());
client.on(Events.InteractionCreate,async i=>{if(!i.isChatInputCommand())return;try{if(i.commandName==='보스목록'){await i.reply(bosses.length?bosses.map(b=>`• ${b.name}: <t:${Math.floor(new Date(b.time).getTime()/1000)}:F>`).join('\n').slice(0,1900):'등록된 보스가 없습니다.')}else if(i.commandName==='보스등록'){const name=i.options.getString('이름'),raw=i.options.getString('시간');if(!/^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(raw))return i.reply({content:'시간 형식: 2026-10-28 19:30',ephemeral:true});const time=new Date(raw.replace(' ','T')+':00+09:00');const b=upsert(name,time);await i.reply(`✅ ${b.name}: <t:${Math.floor(time.getTime()/1000)}:F> 등록 완료`);}}catch(e){if(!i.replied)await i.reply({content:e.message,ephemeral:true})}});
if(token){client.once(Events.ClientReady,async()=>{console.log('Discord ready');try{const rest=new REST({version:'10'}).setToken(token);await rest.put(Routes.applicationCommands(client.user.id),{body:commands})}catch(e){console.error('Commands:',e.message)}});client.login(token).catch(e=>console.error('Login:',e.message))}else console.log('DISCORD_BOT_TOKEN not set: web-only mode');
app.listen(process.env.PORT||3000,()=>console.log('App running'));
