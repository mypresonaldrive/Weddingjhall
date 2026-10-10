// Isolated route tests with explicit fake authentication and storage; no provider calls.
import assert from 'node:assert/strict';
import express from 'express';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {installIntegrationSettings,encryptConfig,decryptConfig} from '../server/integrations.js';
import {installMessaging} from '../server/messaging.js';
process.env.INTEGRATION_ENCRYPTION_KEY=randomBytes(32).toString('base64');
const t='00000000-0000-4000-8000-000000000001';
const settings={kind:'email',enabled:true,revision:1,encrypted:encryptConfig('email',{host:'smtp.example.test',port:'587',user:'user',password:'SERVER-SECRET-DO-NOT-RETURN',from:'sender@example.test'})};const calls=[];
const admin={from(table){let action='read',body,filters=[];const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},order(){return q;},limit(){return q;},maybeSingle(){q.singleRow=true;return q;},single(){q.singleRow=true;return q;},insert(p){action='insert';body=p;return q;},update(p){action='update';body=p;return q;},upsert(p){action='upsert';body=p;return q;},then(resolve){calls.push({table,action,body,filters});if(table==='platform_integrations'){return Promise.resolve(q.singleRow?settings:[settings]).then(resolve);}return Promise.resolve(q.singleRow?null:[]).then(resolve);}};return q;}};
const app=express();app.use(express.json());app.use((req,_res,next)=>{req.actor={id:t};req.organization={id:t};next();});
const deny=(res)=>res.status(403).json({error:'Denied'});
const platform=(req,res,next)=>req.get('test-role')==='platform'&&req.get('test-aal')==='aal2'?next():deny(res);
const owner=(req,res,next)=>req.get('test-role')==='owner'?next():deny(res);
const deps={admin,result:q=>q,rpc:async(name,args)=>{calls.push({rpc:name,args});return {};},route:fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next),platform,owner,member:(_q,_r,n)=>n(),rateLimit:()=> (_q,_r,n)=>n(),razor:()=>{throw Error('Unexpected provider call');}};
installIntegrationSettings(app,deps);installMessaging(app,deps);app.use((e,_q,r,_n)=>r.status(e.status||400).json({error:e.message}));
const server=app.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
try{
 const get=(path,role='platform',aal='aal2')=>fetch(base+path,{headers:{'test-role':role,'test-aal':aal}});
 const post=(path,p,role='platform',aal='aal2')=>fetch(base+path,{method:'POST',headers:{'test-role':role,'test-aal':aal,'Content-Type':'application/json'},body:JSON.stringify(p)});
 for(const role of ['owner','staff','client'])assert.equal((await get('/api/platform/settings',role)).status,403);
 assert.equal((await get('/api/platform/settings','platform','aal1')).status,403);
 const response=await get('/api/platform/settings'),text=await response.text();assert(!text.includes('SERVER-SECRET'));const visible=JSON.parse(text);assert.equal(visible.settings.email.secrets.password,true);assert.equal(visible.settings.email.fields.password,undefined);
 const goodKey=process.env.INTEGRATION_ENCRYPTION_KEY;process.env.INTEGRATION_ENCRYPTION_KEY='invalid-key';const unready=await (await get('/api/platform/settings')).json();assert.equal(unready.encryptionReady,false);assert(!JSON.stringify(unready).includes('SERVER-SECRET'));process.env.INTEGRATION_ENCRYPTION_KEY=goodKey;
 assert.equal((await post('/api/platform/settings/email',{enabled:false,revision:1,fields:{host:'https://wrong.example',port:'587',user:'user',from:'sender@example.test'}})).status,400);
 let save=await post('/api/platform/settings/email',{enabled:true,revision:1,fields:{host:'smtp2.example.test',port:'465',user:'user',from:'sender@example.test',password:''}});assert.equal(save.status,200);const atomicSave=calls.find(c=>c.rpc==='platform_save_integration');assert(atomicSave,'settings save commits through the atomic RPC');assert.equal(decryptConfig('email',atomicSave.args.p_encrypted).password,'SERVER-SECRET-DO-NOT-RETURN');assert.equal(atomicSave.args.p_expected,1);
 assert.equal((await post('/api/platform/settings/email',{enabled:true,revision:0,fields:{}})).status,409);
 assert.equal((await post('/api/platform/messages/grant',{},'owner')).status,403);
 assert.equal((await get('/api/messages','staff')).status,403);
 calls.length=0;assert.equal((await get('/api/messages?tenant=00000000-0000-4000-8000-000000000099','owner')).status,200);
 assert(calls.filter(c=>['message_jobs','message_credit_events','message_grants','message_orders','message_consents','message_preferences','saas_records'].includes(c.table)).every(c=>c.filters.some(([k,v])=>k==='tenant_id'&&v===t)));
 assert.equal(calls.find(c=>c.rpc==='message_summary').args.t,t);
 console.log('PASS integration HTTP: platform MFA gates, denied owner/staff changes, secret redaction/retention, revision conflicts and owner-scoped reports ignoring supplied tenant IDs.');
}finally{server.close();await once(server,'close');}
