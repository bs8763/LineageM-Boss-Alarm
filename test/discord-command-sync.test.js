import test from 'node:test';
import assert from 'node:assert/strict';
import {commandDefinitions,registerGuildCommands} from '../src/discord.js';

test('guild command registration replaces stale commands in one PUT',async()=>{
 const calls=[];
 const rest={put:async(route,payload)=>{calls.push({route,payload});return payload.body.map((c,i)=>({name:c.name,id:String(i+1)}));},post:async()=>{throw Error('POST must not be used');}};
 const result=await registerGuildCommands(rest,'/applications/test/guilds/test/commands');
 assert.equal(calls.length,1);
 assert.equal(calls[0].payload.body.length,commandDefinitions().length);
 assert.deepEqual(result.actualNames,commandDefinitions().map(c=>c.name));
});

test('verification mode only registers prefixed commands',async()=>{
 const rest={put:async(_route,{body})=>body.map((c,i)=>({...c,id:String(i)}))};
 const result=await registerGuildCommands(rest,'/test',true);
 assert.ok(result.actualNames.every(name=>name.startsWith('검증')));
});
