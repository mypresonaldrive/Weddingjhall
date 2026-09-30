import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import net from 'node:net';
import {once} from 'node:events';
const probe=net.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;probe.close();await once(probe,'close');
const env={...process.env,NODE_ENV:'production',APP_MODE:'saas',PORT:String(port),APP_URL:'https://gatherhall.example.test',SUPABASE_URL:'https://placeholder.supabase.co',SUPABASE_ANON_KEY:'test-anon-not-a-real-key',SUPABASE_SERVICE_ROLE_KEY:'test-service-not-a-real-key',RAZORPAY_KEY_ID:'rzp_test_placeholder',RAZORPAY_KEY_SECRET:'test-secret',RAZORPAY_WEBHOOK_SECRET:'test-webhook',ALLOW_TEST_BILLING:'true',INTEGRATION_ENCRYPTION_KEY:'',MESSAGE_WORKER_ENABLED:'false'};
const child=spawn(process.execPath,['server.js'],{env,stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
try{
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server startup timed out: '+logs)),15000);child.stdout.on('data',()=>{if(logs.includes('Gatherhall SaaS listening')){clearTimeout(timer);resolve();}});child.once('exit',code=>{clearTimeout(timer);reject(Error('Server exited '+code+': '+logs));});});
 const base='http://127.0.0.1:'+port,config=await fetch(base+'/api/config');assert.equal(config.status,200);assert.equal((await config.json()).mode,'saas');assert.match(config.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.match(config.headers.get('set-cookie'),/Secure/);
 const cookie=config.headers.get('set-cookie').split(';')[0],csrf=cookie.split('=')[1];
 assert.equal((await fetch(base+'/api/auth/me')).status,401);
 assert.equal((await fetch(base+'/api/platform/overview')).status,401);
 for(const path of ['/api/platform/cms','/api/platform/enquiries','/api/platform/settings','/api/platform/messages','/api/messages'])assert.equal((await fetch(base+path)).status,401);
 const post=(path,headers={},body={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 assert.equal((await post('/api/auth/login')).status,403);
 assert.equal((await post('/api/auth/login',{Cookie:cookie,'X-CSRF-Token':csrf,Origin:'https://evil.example'})).status,403);
 assert.equal((await post('/api/auth/login',{Cookie:cookie,'X-CSRF-Token':'é'.repeat(48)})).status,403);
 assert.equal((await post('/api/platform/cms/save',{Cookie:cookie,'X-CSRF-Token':csrf,Origin:env.APP_URL})).status,401);
 assert.equal((await post('/api/public/enquiries')).status,403);
 assert.equal((await post('/api/platform/plans',{Cookie:cookie,'X-CSRF-Token':csrf,Origin:env.APP_URL})).status,401);
 assert.equal((await post('/api/webhooks/razorpay',{'X-Razorpay-Signature':'0'.repeat(64)},{event:'subscription.activated'})).status,401);
 assert.equal((await post('/api/webhooks/credits',{'X-Razorpay-Signature':'0'.repeat(64)},{event:'payment.captured'})).status,401);
 for(const path of ['/api/platform/settings/email','/api/platform/messages/grant','/api/messages/recharge','/api/messages/consent']){assert.equal((await post(path)).status,403);assert.equal((await post(path,{Cookie:cookie,'X-CSRF-Token':csrf,Origin:env.APP_URL})).status,401);}
 assert.equal((await fetch(base+'/platform')).status,200);
 console.log('PASS SaaS HTTP: production startup/static route, secure cookies/CSP, unauthenticated denials, origin/CSRF rejection including malformed Unicode, and invalid webhook rejection. No live provider requests were made.');
}finally{child.kill('SIGTERM');await once(child,'exit');}
// These cases must exit before any Supabase/provider request. Never inherit
// integration settings or a worker opt-in from the developer's environment.
const guards=[
 ['missing service key',{SUPABASE_SERVICE_ROLE_KEY:''},/SUPABASE_SERVICE_ROLE_KEY is required/],
 ['missing app URL',{APP_URL:''},/APP_URL is required/],
 ['HTTP production app URL',{APP_URL:'http://gatherhall.example.test'},/APP_URL must use HTTPS/],
 ['HTTP database URL',{SUPABASE_URL:'http://placeholder.supabase.co'},/SUPABASE_URL must use HTTPS/],
 ['invalid application mode',{APP_MODE:'invalid'},/APP_MODE must be saas or demo/],
 ['production demo without explicit opt-in',{APP_MODE:'demo',ALLOW_DEMO:''},/Demo deployments require ALLOW_DEMO=true/],
 ['partial billing credentials',{RAZORPAY_WEBHOOK_SECRET:''},/Configure all three Razorpay credentials together/],
 ['test billing without explicit opt-in',{ALLOW_TEST_BILLING:''},/Test billing requires ALLOW_TEST_BILLING=true/],
];
for(const [name,overrides,expected] of guards){
 const result=spawnSync(process.execPath,['server.js'],{env:{...env,...overrides},encoding:'utf8',timeout:10000});
 assert.ifError(result.error);assert.equal(result.signal,null,`${name}: process must exit, not be killed`);
 assert.notEqual(result.status,0,`${name}: startup must fail`);assert.match(result.stderr,expected,name);
}
console.log('PASS SaaS startup guards: missing configuration, HTTPS requirements, invalid mode, production demo opt-in, partial billing and test-billing opt-in.');
