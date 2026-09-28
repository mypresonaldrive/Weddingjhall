import assert from 'node:assert/strict';
import { normalizeMenus } from '../shared/food-menus.js';
import { renderConfirmation } from '../shared/confirmation.js';
const base=process.env.TEST_URL||'http://localhost:3000/api',cleanup=[];
async function req(path,method='GET',body,cookie){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});const text=await r.text();return {status:r.status,data:r.headers.get('content-type')?.includes('application/json')?JSON.parse(text):text,headers:r.headers,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
async function login(email){return (await req('/auth/login','POST',{email,password:'Welcome123!'})).cookie;}
const owner=await login('owner@gatherhall.demo'),staff=await login('staff@gatherhall.demo'),client=await login('client@gatherhall.demo'),other=await login('willow@gatherhall.demo');
async function add(kind,body){const r=await req('/'+kind,'POST',body,owner);assert.equal(r.status,201,JSON.stringify(r.data));cleanup.push([kind,r.data.id]);return r.data;}
const menus=[{plateType:'Vegetarian',sections:[{name:'  Main   course ',items:[' Paneer tikka ','paneer TIKKA','','Dal makhani','<img src=x onerror=alert(1)>']}]}];
const normalized=normalizeMenus(menus);assert.equal(normalized[0].sections[0].name,'Main course');assert.equal(normalized[0].sections[0].items.length,3);
for(const value of [null,{},[...menus,...menus],[{plateType:'Invalid',sections:[]}],[{plateType:'Vegetarian',sections:[]}],[{...menus[0],sections:[{name:'Food',items:[]}]}]])assert.throws(()=>normalizeMenus(value));
try{
 const data=(await req('/data','GET',null,owner)).data;
 const model=await add('pricing-models',{name:'Menu test model',mode:'plate',minimumPlates:10,vegRate:250,status:'Active',menus,terms:'SAVED PAYMENT TERMS',advancePercent:30,taxRate:0});
 assert.deepEqual(model.menus,normalized);
 assert.equal((await req('/pricing-models/'+model.id,'GET',null,other)).status,404);
 assert.equal((await req('/pricing-models/'+model.id,'DELETE',null,staff)).status,403);
 assert.equal((await req('/pricing-models','POST',model,client)).status,403);
 assert.equal((await req('/pricing-models','GET',null,client)).data.some(m=>m.id===model.id),true);
 for(const changes of [{menus:null},{mode:'venue'},{terms:3},{terms:'x'.repeat(3001)}])assert.equal((await req('/pricing-models/'+model.id,'PUT',{...model,...changes},owner)).status,400);
 const omitted={...model};delete omitted.menus;delete omitted.terms;
 assert.deepEqual((await req('/pricing-models/'+model.id,'PUT',omitted,owner)).data.menus,normalized);
 const hall=await add('halls',{name:'Menu test hall',type:'Indoor',capacity:100,price:2000,status:'Available'});
 const draft={name:'Menu print test',clientId:data.clients[0].id,hallId:hall.id,date:'2026-12-28',time:'18:00',guests:20,type:'Wedding',status:'Confirmed',planId:model.id,plateType:'Vegetarian',guaranteedPlates:20,extraPlates:0,addOns:[],notes:'PRIVATE GENERAL NOTES',operationsNotes:'SECRET OPERATIONS'};
 assert.equal((await req('/bookings','POST',{...draft,plateType:'Non-vegetarian'},owner)).status,400);
 let booking=await add('bookings',{...draft,quote:{menu:{plateType:'Forged'}},menu:{plateType:'Forged'}});
 assert.equal(booking.total,5000);assert.deepEqual(booking.quote.menu,normalized[0]);
 await req('/pricing-models/'+model.id,'PUT',{...model,menus:[{plateType:'Vegetarian',sections:[{name:'New',items:['NEW CATALOG DISH']}]}],vegRate:900,terms:'NEW TERMS'},owner);
 booking=(await req('/bookings/'+booking.id,'PUT',{...booking,name:'Menu updated event'},owner)).data;
 assert.equal(booking.total,5000);assert.deepEqual(booking.quote.menu,normalized[0]);
 await add('payments',{bookingId:booking.id,amount:500,date:'2026-09-28',method:'UPI',reference:'PAYMENT-SECRET'});
 const path='/bookings/'+booking.id+'/confirmation';
 assert.equal((await req(path)).status,401);assert.equal((await req(path,'GET',null,other)).status,404);
 assert.equal((await req(path+'?format=unknown','GET',null,owner)).status,400);
 const full=await req(path,'GET',null,client);assert.equal(full.status,200);assert.equal(full.headers.get('cache-control'),'no-store');assert.ok(full.headers.get('content-security-policy').includes("default-src 'none'"));
 assert.ok(full.data.includes('class="charges-table"'));assert.ok(full.data.includes('id="compact-print"'));assert.ok(full.data.indexOf('<h2>Booking charges')<full.data.indexOf('<h2>Agreed food menu'));
 for(const text of ['Paneer tikka','SAVED PAYMENT TERMS','PAYMENT-SECRET','₹5,000.00','₹4,500.00','&lt;img src=x onerror=alert(1)&gt;'])assert.ok(full.data.includes(text),text);
 for(const text of ['SECRET OPERATIONS','NEW CATALOG DISH','NEW TERMS','<img src=x'])assert.ok(!full.data.includes(text),text);
 const event=await req(path+'?format=event','GET',null,staff);assert.equal(event.status,200);
 for(const text of ['₹','SAVED PAYMENT TERMS','PAYMENT-SECRET','PRIVATE GENERAL NOTES','SECRET OPERATIONS','Booking charges'])assert.ok(!event.data.includes(text),text);
 assert.ok(event.data.includes('Paneer tikka'));
 const unowned=await add('clients',{name:'Other menu client',email:'menu-print-test@example.test',phone:'9876543210',status:'Active'});
 const privateBooking=await add('bookings',{...draft,date:'2026-12-29',clientId:unowned.id});
 assert.equal((await req('/bookings/'+privateBooking.id+'/confirmation','GET',null,client)).status,404);
 for(const [status,title] of [['Pending','not a confirmed reservation'],['Cancelled','does not confirm availability'],['Completed','Completed booking record']])assert.ok(renderConfirmation({booking:{...booking,status},organization:'Test'}).includes(title));
 const fixed=await add('pricing-models',{...model,name:'Fixed menu',mode:'fixed',fixedPrice:10000,maxGuests:100});
 const fb=await add('bookings',{...draft,date:'2026-12-30',planId:fixed.id});assert.equal(fb.total,10000);assert.deepEqual(fb.quote.menu,normalized[0]);
 const cleared=await req('/pricing-models/'+fixed.id,'PUT',{...fixed,menus:[]},owner);assert.deepEqual(cleared.data.menus,[]);
 const removed=await req('/pricing-models/'+fixed.id,'DELETE',null,owner);assert.equal(removed.status,200);
 assert.ok((await req('/bookings/'+fb.id+'/confirmation','GET',null,owner)).data.includes('Paneer tikka'));
 console.log('PASS menus/printing: model CRUD, menu validation, meal restrictions, authoritative snapshots, full/event copies, current payments, escaping, status labels, ownership and tenant isolation.');
}finally{for(const [kind,id] of cleanup.reverse())await req('/'+kind+'/'+id,'DELETE',null,owner);}
