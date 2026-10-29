// Export via authenticated API; stdout is redirected to a private file by the workflow.
const url=process.env.BOSS_APP_URL||'https://lineagem-boss-alarm.onrender.com';
if(!url.startsWith('https://')||!process.env.ADMIN_TOKEN)throw Error('HTTPS URL and ADMIN_TOKEN required');
const response=await fetch(new URL('/api/admin/backup',url),{headers:{Authorization:`Bearer ${process.env.ADMIN_TOKEN}`},signal:AbortSignal.timeout(120000)});
if(!response.ok)throw Error(`Backup failed (${response.status})`);
const data=await response.json();if(data.schemaVersion!==2||data.bosses?.length!==31)throw Error('Invalid backup');process.stdout.write(JSON.stringify(data,null,2));
