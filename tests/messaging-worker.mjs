import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {startMessageWorker} from '../server/messaging.js';
import {encryptConfig} from '../server/integrations.js';
process.env.MESSAGE_WORKER_ENABLED='true';process.env.INTEGRATION_ENCRYPTION_KEY=randomBytes(32).toString('base64');
const originalFetch=global.fetch;let calls=0;
const base={organizations:{status:'active',billing_email:'owner@example.test',phone:'+919999999999',name:'Venue'},saas_subscriptions:{paid_through:new Date(Date.now()+86400000).toISOString()},message_preferences:{channels:{whatsapp:true},owner_alerts:true,customer_alerts:true},booking:{status:'Confirmed',name:'Wedding',date:'2027-01-01',time:'10:00',hall:'Hall',clientId:'client',total:123456,operationsNotes:'PRIVATE'},client:{status:'Active',phone:'+919999999999'},message_consents:{allowed:true,destination:'+919999999999'},platform_integrations:{enabled:true,encrypted:encryptConfig('whatsapp',{phoneId:'1234',token:'test-token',template:'booking',language:'en'})}};
async function run(patch={},reserve=true,recipient='customer'){
 const rows={...structuredClone(base),...patch};let claimed=false;const events=[];
 const admin={from(table){const filters={};const q={select(){return q;},eq(k,v){filters[k]=v;return q;},single(){return q;},maybeSingle(){return q;},then(resolve){let data=rows[table];if(table==='saas_records')data={body:rows[filters.kind==='bookings'?'booking':'client']};return Promise.resolve(data).then(resolve);}};return q;}};
 const rpc=async(name,args)=>{events.push([name,args]);if(name==='message_claim'){if(claimed)return null;claimed=true;return {id:'job',tenant_id:'tenant',booking_id:'booking',recipient,channel:'whatsapp'};}if(name==='message_reserve')return reserve;};
 const stop=startMessageWorker({admin,result:q=>q,rpc});try{await stop.runOnce();}finally{stop();}return events;
}
try{
 global.fetch=async(_url,opts)=>{calls++;const body=JSON.parse(opts.body);assert(!JSON.stringify(body).includes('PRIVATE'));assert(!JSON.stringify(body).includes('123456'));return new Response(JSON.stringify({messages:[{id:'provider-message'}]}),{status:200});};
 const final=events=>events.find(e=>e[0]==='message_finish')[1];
 assert.equal(final(await run({message_consents:{allowed:false,destination:'+919999999999'}})).outcome,'held');
 assert.equal(final(await run({message_consents:{allowed:true,destination:'+918888888888'}})).outcome,'held');
 assert.equal(final(await run({message_preferences:{channels:{whatsapp:false},customer_alerts:true}})).outcome,'held');
 assert.equal(final(await run({organizations:{...base.organizations,status:'suspended'}})).outcome,'held');
 assert.equal(final(await run({booking:{...base.booking,status:'Cancelled'}})).outcome,'held');
 assert.equal(final(await run({},false)).outcome,'held');assert.equal(calls,0,'all gates run before provider');
 assert.equal(final(await run()).outcome,'sent');assert.equal(calls,1);
 assert.equal(final(await run({message_consents:{allowed:false}},true,'owner')).outcome,'sent','owner uses separate explicit preferences');
 global.fetch=async()=>{throw Error('network timeout');};assert.equal(final(await run()).outcome,'unknown');
 console.log('PASS message worker: withdrawn/contact-bound consent, disabled channel, suspended tenant, cancelled booking, empty balance, owner preferences, event-only privacy and uncertain sends.');
}finally{global.fetch=originalFetch;}
