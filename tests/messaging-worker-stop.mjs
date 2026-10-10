// Graceful notification-worker shutdown: stop() must resolve only after an in-flight
// provider send settles, claims must halt, and the disabled worker keeps the same awaitable contract.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {startMessageWorker} from '../server/messaging.js';
import {encryptConfig} from '../server/integrations.js';
process.env.MESSAGE_WORKER_ENABLED='true';process.env.INTEGRATION_ENCRYPTION_KEY=randomBytes(32).toString('base64');
const originalFetch=global.fetch;
const rows={organizations:{status:'active',billing_email:'owner@example.test',phone:'+919999999999',name:'Venue'},saas_subscriptions:{paid_through:new Date(Date.now()+86400000).toISOString()},message_preferences:{channels:{whatsapp:true},owner_alerts:true,customer_alerts:true},booking:{status:'Confirmed',name:'Wedding',date:'2027-01-01',time:'10:00',hall:'Hall',clientId:'client',total:1},client:{status:'Active',phone:'+919999999999'},message_consents:{allowed:true,destination:'+919999999999'},platform_integrations:{enabled:true,encrypted:encryptConfig('whatsapp',{phoneId:'1234',token:'test-token',template:'booking',language:'en'})}};
const admin={from(table){const filters={};const q={select(){return q;},eq(k,v){filters[k]=v;return q;},single(){return q;},maybeSingle(){return q;},then(resolve){let data=rows[table];if(table==='saas_records')data={body:rows[filters.kind==='bookings'?'booking':'client']};return Promise.resolve(data).then(resolve);}};return q;}};
let claims=0;const finishes=[];
const rpc=async(name,args)=>{if(name==='message_claim'){claims++;if(claims>1)return null;return {id:'job',tenant_id:'tenant',booking_id:'booking',recipient:'customer',channel:'whatsapp'};}if(name==='message_reserve')return true;if(name==='message_finish'){finishes.push(args);return null;}return null;};
// Provider call that lingers long enough to catch a premature shutdown.
global.fetch=async()=>{await new Promise(r=>setTimeout(r,300));return new Response(JSON.stringify({messages:[{id:'provider-message'}]}),{status:200});};
try{
 const stop=startMessageWorker({admin,result:q=>q,rpc});
 const started=Date.now();
 const tick=stop.runOnce();
 await new Promise(r=>setTimeout(r,100)); // the provider request is in flight now
 const stopped=stop();
 await Promise.all([tick,stopped]);
 assert(Date.now()-started>=280,'stop() resolved before the in-flight provider send finished');
 assert.equal(finishes.length,1);assert.equal(finishes[0].outcome,'sent');
 assert.equal(claims,1,'no job was claimed after stop');
 // Disabled worker exposes the same awaitable shape so shutdown handlers can always await it.
 process.env.MESSAGE_WORKER_ENABLED='false';const off=startMessageWorker({admin,result:q=>q,rpc});
 await off.runOnce();await off();
 console.log('PASS worker shutdown: stop waits for in-flight sends, halts claims, and disabled workers keep the awaitable contract.');
}finally{global.fetch=originalFetch;}
