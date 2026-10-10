// Production never falls back to the disposable demo database.
const mode=process.env.APP_MODE||(process.env.NODE_ENV==='production'?'saas':'demo');
if(!['saas','demo'].includes(mode))throw Error('APP_MODE must be saas or demo.');
if(mode==='demo'){
 if(process.env.NODE_ENV==='production'&&process.env.ALLOW_DEMO!=='true')throw Error('Demo deployments require ALLOW_DEMO=true. Never use demo mode for customer data.');
 await import('./server.demo.js');
}else await import('./server/production.js');
