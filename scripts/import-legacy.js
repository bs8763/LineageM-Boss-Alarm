import fs from 'node:fs/promises';
import {Store} from '../src/store.js';
import {Service} from '../src/service.js';
if(!process.env.DATABASE_URL||!process.argv[2])throw Error('DATABASE_URL and legacy JSON path required');
const rows=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
const store=new Store();await store.init();
try{await new Service(store).importLegacy(rows,'operator:legacy-import');console.log('Legacy import committed. Original JSON remains unchanged.');}finally{await store.close();}
