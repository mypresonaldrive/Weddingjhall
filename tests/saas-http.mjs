import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {once} from 'node:events';
const probe=net.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;probe.close();await once(probe,'close');
const env={...process.env,NODE_ENV:'production',APP_MODE:'saas',PORT:String(port),APP_URL:'https://gatherhall.example.test',SUPABASE_URL:'https://placeholder.supabase.co',SUPABASE_ANON_KEY:'test-anon-not-a-real-key',SUPABASE_SERVICE_ROLE_KEY:'test-service-not-a-real-key',RAZORPAY_KEY_ID:'rzp_test_placeholder',RAZORPAY_KEY_SECRET:'test-secret',RAZORPAY_WEBHOOK_SECRET:'test-webhook',ALLOW_TEST_BILLING:'true'};
const child=spawn(process.execPath,['server.js'],{env,stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
try{
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server startup timed out: '+logs)),15000);child.stdout.on('data',()=>{if(logs.includes('Gatherhall SaaS listening')){clearTimeout(timer);resolve();}});child.once('exit',code=>{clearTimeout(timer);reject(Error('Server exited '+code+': '+logs));});});
 const base='http://127.0.0.1:'+port,config=await fetch(base+'/api/config');assert.equal(config.status,200);assert.equal((await config.json()).mode,'saas');assert.match(config.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.match(config.headers.get('set-cookie'),/Secure/);
 const cookie=config.headers.get('set-cookie').split(';')[0],csrf=cookie.split('=')[1];
 assert.equal((await fetch(base+'/api/auth/me')).status,401);
 assert.equal((await fetch(base+'/api/platform/overview')).status,401);
 for(const path of ['/api/platform/cms','/api/platform/enquiries'])assert.equal((await fetch(base+path)).status,401);
 const post=(path,headers={},body={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 assert.equal((await post('/api/auth/login')).status,403);
 assert.equal((await post('/api/auth/login',{Cookie:cookie,'X-CSRF-Token':csrf,Origin:'https://evil.example'})).status,403);
 assert.equal((await post('/api/auth/login',{Cookie:cookie,'X-CSRF-Token':'é'.repeat(48)})).status,403);
 assert.equal((await post('/api/platform/cms/save',{Cookie:cookie,'X-CSRF-Token':csrf,Origin:env.APP_URL})).status,401);
 assert.equal((await post('/api/public/enquiries')).status,403);
 assert.equal((await post('/api/platform/plans',{Cookie:cookie,'X-CSRF-Token':csrf,Origin:env.APP_URL})).status,401);
 assert.equal((await post('/api/webhooks/razorpay',{'X-Razorpay-Signature':'0'.repeat(64)},{event:'subscription.activated'})).status,401);
 assert.equal((await fetch(base+'/platform')).status,200);
 console.log('PASS SaaS HTTP: production startup/static route, secure cookies/CSP, unauthenticated denials, origin/CSRF rejection including malformed Unicode, and invalid webhook rejection. No live provider requests were made.');
}finally{child.kill('SIGTERM');await once(child,'exit');}
const missing=spawn(process.execPath,['server.js'],{env:{...env,SUPABASE_SERVICE_ROLE_KEY:''},stdio:'ignore'});const [code]=await once(missing,'exit');assert.notEqual(code,0);
console.log('PASS SaaS startup fails closed without required secrets.');
