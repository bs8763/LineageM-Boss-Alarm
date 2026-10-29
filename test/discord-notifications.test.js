import test from 'node:test';
import assert from 'node:assert/strict';
import {formatBossEvent} from '../src/discord.js';
test('app cut message includes boss information',()=>{const msg=formatBossEvent({id:1,name:'카스트',action:'cut',actor:'web:clan',at:'2026-10-30T01:00:00Z',time:'2026-10-30T08:30:00Z'},{mapNumber:'46',misses:0});for(const part of ['보스 컷 완료','카스트','맵: 46','다음 출현:','멍 횟수: 0회','안드로이드 앱'])assert.ok(msg.includes(part));});
test('app miss message shows miss count',()=>{const msg=formatBossEvent({id:2,name:'카스트',action:'miss',actor:'web:admin',at:'2026-10-30T01:00:00Z',time:'2026-10-30T08:30:00Z'},{mapNumber:'46',misses:2});assert.match(msg,/보스 멍 처리/);assert.match(msg,/멍 횟수: 2회/);});
