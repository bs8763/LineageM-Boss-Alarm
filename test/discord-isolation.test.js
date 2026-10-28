import {test} from 'node:test';
import assert from 'node:assert/strict';
import {commandDefinitions,commandRoute,startDiscord} from '../src/discord.js';
const env={DISCORD_TEST_MODE:'true',DISCORD_GUILD_ID:'guild',DISCORD_CHANNEL_ID:'channel'};
const interaction={commandName:'검증보스',guildId:'guild',channelId:'channel'};
test('staging commands cannot shadow existing production commands',()=>{
 const production=commandDefinitions().map(c=>c.name),staging=commandDefinitions(true).map(c=>c.name);
 assert.equal(new Set([...production,...staging]).size,8);
 for(const commandName of production)assert.equal(commandRoute({...interaction,commandName},env),null);
 for(const commandName of staging)assert.equal(commandRoute({...interaction,commandName},{}),null);
 assert.equal(commandRoute(interaction,env),'보스');
 assert.equal(commandRoute({...interaction,commandName:'검증보스등록'},env),'보스등록');
});
test('staging interactions require the exact configured guild and channel',()=>{
 assert.equal(commandRoute({...interaction,guildId:'other'},env),null);
 assert.equal(commandRoute({...interaction,channelId:'other'},env),null);
 assert.equal(commandRoute({...interaction,guildId:null},env),null);
 assert.equal(commandRoute(interaction,{...env,DISCORD_CHANNEL_ID:''}),null);
});
test('staging refuses to connect before guild and channel isolation is configured',async()=>{
 await assert.rejects(startDiscord({}, {DISCORD_TEST_MODE:'true',DISCORD_BOT_TOKEN:'never-used'}),/서버·채널/);
});
